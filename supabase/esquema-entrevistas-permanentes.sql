-- Respaldo de cambios remotos. No ejecutar de nuevo.
create table public.entrevistas_admision (
 id uuid primary key,
 creado_por uuid not null default auth.uid(),
 datos jsonb not null default '{}'::jsonb,
 firmas jsonb,
 notas_privadas text not null default '',
 condiciones text[] not null default '{}',
 fuente text not null default '',
 estado text not null default 'Borrador' check(estado in('Borrador','Pendiente','Admitido','No admitido','Sin seguimiento')),
 sin_adicionales boolean not null default false,
 archivado boolean not null default false,
 estudiante_id uuid references public.estudiantes(id) on delete restrict,
 soporte_nombre text,
 soporte_tipo text,
 soporte_tamano bigint,
 eliminando boolean not null default false,
 version integer not null default 1,
 creado_en timestamptz not null default now(),
 actualizado_en timestamptz not null default now(),
 finalizado_en timestamptz
);
create index entrevistas_creador_idx on public.entrevistas_admision(creado_por,creado_en desc);
create index entrevistas_estudiante_idx on public.entrevistas_admision(estudiante_id);
alter table public.entrevistas_admision enable row level security;
revoke all on public.entrevistas_admision from public,anon,authenticated;
grant select on public.entrevistas_admision to authenticated;
grant all on public.entrevistas_admision to service_role;
create policy entrevistas_lectura on public.entrevistas_admision for select to authenticated using(
 (select orientacion_privado.rol_actual()) in ('superadministrador','desarrollador') or ((select orientacion_privado.rol_actual())='orientador' and creado_por=(select auth.uid()))
);
-- Auditar metadatos, sin duplicar firmas ni información confidencial en el historial general.
create function orientacion_privado.auditar_entrevista()
returns trigger language plpgsql security definer set search_path='' as $$
declare antes jsonb; despues jsonb; autor uuid:=auth.uid(); nombre_autor text;
begin
 if TG_OP<>'INSERT' then antes:=jsonb_build_object('id',OLD.id,'nombre',OLD.datos->>'nombre','estado',OLD.estado,'archivado',OLD.archivado,'version',OLD.version,'eliminando',OLD.eliminando,'estudiante_id',OLD.estudiante_id); end if;
 if TG_OP<>'DELETE' then despues:=jsonb_build_object('id',NEW.id,'nombre',NEW.datos->>'nombre','estado',NEW.estado,'archivado',NEW.archivado,'version',NEW.version,'eliminando',NEW.eliminando,'estudiante_id',NEW.estudiante_id); end if;
 select nombre into nombre_autor from public.perfiles where auth_user_id=autor;
 insert into public.historial(tabla,registro_id,accion,actor_auth_id,actor_nombre,origen,anterior,nuevo) values('entrevistas_admision',case when TG_OP='DELETE' then OLD.id else NEW.id end,TG_OP,autor,nombre_autor,case when autor is null then 'administracion_base_datos' else 'usuario_autenticado' end,antes,despues);
 if TG_OP='DELETE' then return OLD; end if; return NEW;
end $$;
revoke all on function orientacion_privado.auditar_entrevista() from public,anon,authenticated;
create trigger entrevistas_auditar after insert or update or delete on public.entrevistas_admision for each row execute function orientacion_privado.auditar_entrevista();

create function orientacion_privado.acceso_soporte(p_ruta text,p_operacion text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare e public.entrevistas_admision%rowtype; rol text:=orientacion_privado.rol_actual();
begin
 if auth.uid() is null or rol is null or p_ruta !~ '^[0-9a-f-]{36}/soporte$' then return false; end if;
 select * into e from public.entrevistas_admision where id=split_part(p_ruta,'/',1)::uuid;
 if not found then return false; end if;
 if p_operacion='borrar' then return rol='superadministrador' and e.eliminando; end if;
 if p_operacion='escribir' then return rol in('orientador','superadministrador','desarrollador') and e.creado_por=auth.uid() and e.estado='Borrador' and not e.eliminando and e.soporte_nombre is not null; end if;
 return rol in('superadministrador','desarrollador') or (rol='orientador' and e.creado_por=auth.uid());
exception when invalid_text_representation then return false;
end $$;
revoke all on function orientacion_privado.acceso_soporte(text,text) from public,anon;
grant execute on function orientacion_privado.acceso_soporte(text,text) to authenticated;
create policy admisiones_soporte_lectura on storage.objects for select to authenticated using(bucket_id='admisiones-soportes' and orientacion_privado.acceso_soporte(name,'leer'));
create policy admisiones_soporte_insertar on storage.objects for insert to authenticated with check(bucket_id='admisiones-soportes' and orientacion_privado.acceso_soporte(name,'escribir'));
create policy admisiones_soporte_actualizar on storage.objects for update to authenticated using(bucket_id='admisiones-soportes' and orientacion_privado.acceso_soporte(name,'escribir')) with check(bucket_id='admisiones-soportes' and orientacion_privado.acceso_soporte(name,'escribir'));
create policy admisiones_soporte_borrar on storage.objects for delete to authenticated using(bucket_id='admisiones-soportes' and orientacion_privado.acceso_soporte(name,'borrar'));

-- La admisión solo puede operar sobre una entrevista persistida y bloqueada.
alter function public.admitir_aspirante(uuid,jsonb,boolean) set schema orientacion_privado;
revoke all on function orientacion_privado.admitir_aspirante(uuid,jsonb,boolean) from public,anon,authenticated;
revoke insert(entrevista_id,estudiante_id,anio_lectivo) on public.admisiones_vinculos from authenticated;

create function orientacion_privado.entrevista_operar(p_accion text,p_id uuid,p_datos jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.entrevistas_admision%rowtype; rol text:=orientacion_privado.rol_actual(); firma jsonb; quien text; meta jsonb; resultado jsonb; n integer; sin_extra boolean;
begin
 if auth.uid() is null or coalesce(rol,'') not in('orientador','superadministrador','desarrollador') then raise exception 'No tienes permiso para administrar entrevistas'; end if;
 if p_id is null then raise exception 'Falta identificar la entrevista'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,41));
 select * into e from public.entrevistas_admision where id=p_id for update;
 if found and rol='orientador' and e.creado_por<>auth.uid() then raise exception 'No tienes acceso a esta entrevista'; end if;
 if p_accion in('preparar_borrado','finalizar_borrado') then
  if rol<>'superadministrador' then raise exception 'Solo superadministradores pueden eliminar registros'; end if;
  if e.id is null then return jsonb_build_object('eliminado',true); end if;
  if coalesce(p_datos->>'confirmacion','')<>coalesce(e.datos->>'nombre','') then raise exception 'La confirmación del nombre no coincide'; end if;
  if p_accion='preparar_borrado' then
   update public.entrevistas_admision set eliminando=true,version=version+1,actualizado_en=now() where id=p_id and not eliminando;
   return jsonb_build_object('ruta',case when e.soporte_nombre is null then null else p_id::text||'/soporte' end);
  end if;
  if not e.eliminando then raise exception 'Primero prepara la eliminación'; end if;
  if exists(select 1 from storage.objects where bucket_id='admisiones-soportes' and name=p_id::text||'/soporte') then raise exception 'Primero retira el soporte mediante Storage'; end if;
  delete from public.admisiones_vinculos where entrevista_id=p_id;
  delete from public.entrevistas_admision where id=p_id;
  return jsonb_build_object('eliminado',true);
 end if;
 if e.eliminando then raise exception 'Esta entrevista tiene una eliminación pendiente'; end if;
 if p_accion='reservar' then
  if e.id is not null and e.estado<>'Borrador' then return to_jsonb(e); end if;
  if e.id is not null and e.creado_por<>auth.uid() then raise exception 'Solo el autor puede completar su borrador'; end if;
  if jsonb_typeof(p_datos->'datos') is distinct from 'object' or coalesce(length(btrim(p_datos->'datos'->>'nombre')),0) not between 2 and 180 then raise exception 'Revisa los datos de la entrevista'; end if;
  if length((p_datos->'datos')::text)>200000 or length(coalesce(p_datos->>'notasPrivadas',''))>50000 then raise exception 'El contenido de la entrevista es demasiado extenso'; end if;
  foreach quien in array array['orientador','acudiente'] loop
   firma:=p_datos->'firmas'->quien;
   if firma is null or coalesce((firma->>'aceptacion')::boolean,false)=false or coalesce(length(btrim(firma->>'nombre')),0)<2 or coalesce(length(btrim(firma->>'documento')),0)<3 or coalesce(firma->>'imagen','') !~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/=[:space:]]+$' or length(firma->>'imagen')>700000 or coalesce(firma->>'fecha','')='' then raise exception 'Completa nombres, documentos, aceptación y las dos firmas PNG'; end if;
  end loop;
  if jsonb_typeof(p_datos->'condiciones') is distinct from 'array' or jsonb_array_length(p_datos->'condiciones')>50 then raise exception 'Revisa las condiciones registradas'; end if;
  sin_extra:=coalesce((p_datos->>'sinAdicionales')::boolean,false);
  if sin_extra and (coalesce(p_datos->>'notasPrivadas','')<>'' or jsonb_array_length(p_datos->'condiciones')>0 or p_datos->>'soporteNombre' is not null) then raise exception 'La opción sin adicionales no puede contener notas, condiciones ni soporte'; end if;
  if not sin_extra and coalesce(length(btrim(p_datos->>'notasPrivadas')),0)=0 then raise exception 'Escribe observaciones adicionales'; end if;
  if p_datos->>'soporteNombre' is not null and (length(p_datos->>'soporteNombre') not between 1 and 255 or coalesce(p_datos->>'soporteTipo','') not in('application/pdf','image/jpeg','image/png') or coalesce((p_datos->>'soporteTamano')::bigint,0) not between 1 and 20971520) then raise exception 'El soporte debe ser PDF, JPG o PNG de hasta 20 MB'; end if;
  if jsonb_array_length(p_datos->'condiciones')>0 and coalesce(p_datos->>'fuente','')<>'Reportado por acudiente' and p_datos->>'soporteNombre' is null then raise exception 'Falta el soporte profesional'; end if;
  insert into public.entrevistas_admision(id,datos,firmas,notas_privadas,condiciones,fuente,sin_adicionales,soporte_nombre,soporte_tipo,soporte_tamano)
  values(p_id,p_datos->'datos',p_datos->'firmas',coalesce(p_datos->>'notasPrivadas',''),array(select jsonb_array_elements_text(p_datos->'condiciones')),coalesce(p_datos->>'fuente',''),sin_extra,p_datos->>'soporteNombre',p_datos->>'soporteTipo',(p_datos->>'soporteTamano')::bigint)
  on conflict(id) do update set datos=excluded.datos,firmas=excluded.firmas,notas_privadas=excluded.notas_privadas,condiciones=excluded.condiciones,fuente=excluded.fuente,sin_adicionales=excluded.sin_adicionales,soporte_nombre=excluded.soporte_nombre,soporte_tipo=excluded.soporte_tipo,soporte_tamano=excluded.soporte_tamano,version=public.entrevistas_admision.version+1,actualizado_en=now()
  returning * into e;
  return to_jsonb(e);
 end if;
 if e.id is null then raise exception 'La entrevista no existe'; end if;
 if p_accion='finalizar' then
  if e.estado<>'Borrador' then return to_jsonb(e); end if;
  if e.creado_por<>auth.uid() then raise exception 'Solo el autor puede finalizar su borrador'; end if;
  if e.soporte_nombre is not null then
   select metadata into meta from storage.objects where bucket_id='admisiones-soportes' and name=p_id::text||'/soporte';
   if not found or (meta->>'size')::bigint<>e.soporte_tamano or coalesce(meta->>'mimetype','')<>e.soporte_tipo then raise exception 'El soporte no terminó de subirse o no coincide. Vuelve a seleccionarlo y reintenta'; end if;
  elsif exists(select 1 from storage.objects where bucket_id='admisiones-soportes' and name=p_id::text||'/soporte') then raise exception 'Hay un soporte de un intento anterior. Selecciónalo de nuevo o pide al superadministrador retirar el borrador'; end if;
  update public.entrevistas_admision set estado=case when sin_adicionales then 'Sin seguimiento' else 'Pendiente' end,finalizado_en=now(),actualizado_en=now(),version=version+1 where id=p_id returning * into e;
  return to_jsonb(e);
 end if;
 if e.estado='Borrador' then raise exception 'Primero finaliza la entrevista'; end if;
 if (p_datos->>'version')::integer is distinct from e.version then raise exception 'La entrevista fue actualizada. Actualiza el listado antes de reintentar'; end if;
 if p_accion='decidir' then
  if e.estado<>'Pendiente' or e.archivado then raise exception 'La entrevista ya tiene una decisión o está archivada'; end if;
  if p_datos->>'estado'='Admitido' then
   resultado:=orientacion_privado.admitir_aspirante(e.id,e.datos,coalesce((p_datos->>'confirmar_existente')::boolean,false));
   if coalesce((resultado->>'requiere_confirmacion')::boolean,false) then return resultado; end if;
   update public.entrevistas_admision set estado='Admitido',estudiante_id=(resultado->>'estudiante_id')::uuid,version=version+1,actualizado_en=now() where id=p_id returning * into e;
  elsif p_datos->>'estado'='No admitido' then
   update public.entrevistas_admision set estado='No admitido',version=version+1,actualizado_en=now() where id=p_id returning * into e;
  else raise exception 'Decisión inválida'; end if;
 elsif p_accion='archivar' then
  if e.estado<>'Sin seguimiento' or e.notas_privadas<>'' or cardinality(e.condiciones)>0 or e.soporte_nombre is not null then raise exception 'Solo se archivan entrevistas finalizadas sin seguimiento'; end if;
  update public.entrevistas_admision set archivado=coalesce((p_datos->>'archivado')::boolean,false),version=version+1,actualizado_en=now() where id=p_id returning * into e;
 else raise exception 'Acción inválida'; end if;
 return to_jsonb(e);
end $$;
revoke all on function orientacion_privado.entrevista_operar(text,uuid,jsonb) from public,anon;
grant execute on function orientacion_privado.entrevista_operar(text,uuid,jsonb) to authenticated;
create function public.entrevista_operar(p_accion text,p_id uuid,p_datos jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select orientacion_privado.entrevista_operar(p_accion,p_id,p_datos) $$;
revoke all on function public.entrevista_operar(text,uuid,jsonb) from public,anon;
grant execute on function public.entrevista_operar(text,uuid,jsonb) to authenticated;

create function orientacion_privado.eliminar_registro_escolar(p_tipo text,p_id uuid,p_anio integer,p_grado text,p_confirmacion text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare nombre text; ids uuid[]; afectados integer:=0; alumno uuid;
begin
 if auth.uid() is null or coalesce(orientacion_privado.rol_actual(),'')<>'superadministrador' then raise exception 'Solo superadministradores pueden eliminar registros'; end if;
 if p_tipo='estudiante' then
  select e.nombre into nombre from public.estudiantes e where id=p_id for update;
  if not found then return jsonb_build_object('eliminado',true); end if;
  if p_confirmacion is distinct from nombre then raise exception 'La confirmación del nombre no coincide'; end if;
  if exists(select 1 from public.entrevistas_admision where estudiante_id=p_id) then raise exception 'Primero elimina las entrevistas vinculadas al estudiante'; end if;
  delete from public.admisiones_vinculos where estudiante_id=p_id;
  delete from public.matriculas where estudiante_id=p_id;
  delete from public.estudiantes where id=p_id;
 elsif p_tipo='matricula' then
  if p_confirmacion<>'ELIMINAR' or p_confirmacion is null then raise exception 'Escribe ELIMINAR para confirmar'; end if;
  delete from public.matriculas where id=p_id returning estudiante_id into alumno;
  if alumno is not null then update public.estudiantes set actualizado_en=now() where id=alumno; end if;
 elsif p_tipo in('curso','grado') then
  if p_confirmacion<>'ELIMINAR' or p_confirmacion is null then raise exception 'Escribe ELIMINAR para confirmar'; end if;
  if p_tipo='curso' then select array_agg(id) into ids from public.grupos where id=p_id;
  else select array_agg(id) into ids from public.grupos where anio_lectivo=p_anio and grado=p_grado; end if;
  if ids is null then return jsonb_build_object('eliminados',0); end if;
  perform 1 from public.grupos where id=any(ids) order by id for update;
  if exists(select 1 from public.matriculas where grupo_id=any(ids)) then raise exception 'Hay estudiantes matriculados. Traslada o elimina esas matrículas antes de borrar el curso o grado'; end if;
  if exists(select 1 from public.docentes_cursos where grupo_id=any(ids) and activo) then raise exception 'Retira las asignaciones docentes antes de borrar el curso o grado'; end if;
  delete from public.docentes_cursos where grupo_id=any(ids);
  delete from public.grupos where id=any(ids); get diagnostics afectados=row_count;
 else raise exception 'Tipo de registro inválido'; end if;
 return jsonb_build_object('eliminado',true,'cursos_eliminados',afectados);
end $$;
revoke all on function orientacion_privado.eliminar_registro_escolar(text,uuid,integer,text,text) from public,anon;
grant execute on function orientacion_privado.eliminar_registro_escolar(text,uuid,integer,text,text) to authenticated;
create function public.eliminar_registro_escolar(p_tipo text,p_id uuid default null,p_anio integer default null,p_grado text default null,p_confirmacion text default '')
returns jsonb language sql security invoker set search_path='' as $$ select orientacion_privado.eliminar_registro_escolar(p_tipo,p_id,p_anio,p_grado,p_confirmacion) $$;
revoke all on function public.eliminar_registro_escolar(text,uuid,integer,text,text) from public,anon;
grant execute on function public.eliminar_registro_escolar(text,uuid,integer,text,text) to authenticated;
