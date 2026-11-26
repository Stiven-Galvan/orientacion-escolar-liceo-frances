create table public.observacion_evidencias (
 id uuid primary key, observacion_id uuid not null references public.observaciones_docentes(id) on delete cascade,
 creado_por uuid not null default auth.uid(), nombre text not null check(length(nombre) between 1 and 255),
 tipo text not null check(tipo in ('image/jpeg','image/png','image/webp','application/pdf','application/zip','application/vnd.rar','application/x-7z-compressed')),
 tamano bigint not null check(tamano between 1 and 20971520), confirmado boolean not null default false, retirando boolean not null default false,
 creado_en timestamptz not null default now(), unique(observacion_id,id)
);
create index evidencia_observacion on public.observacion_evidencias(observacion_id,creado_por);
alter table public.observacion_evidencias enable row level security;
revoke all on public.observacion_evidencias from public,anon,authenticated;
grant select on public.observacion_evidencias to authenticated;
create function orientacion_privado.acceso_evidencia(p_ruta text,p_operacion text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare e public.observacion_evidencias%rowtype; o public.observaciones_docentes%rowtype; alumno public.estudiantes%rowtype; rol text:=orientacion_privado.rol_actual(); propio boolean;
begin
 if auth.uid() is null or rol is null or p_ruta !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}$' then return false;end if;
 select * into e from public.observacion_evidencias where id=split_part(p_ruta,'/',2)::uuid and observacion_id=split_part(p_ruta,'/',1)::uuid;
 if not found then return false;end if;
 select * into o from public.observaciones_docentes where id=e.observacion_id;
 select * into alumno from public.estudiantes where id=o.estudiante_id;
 propio=e.creado_por=auth.uid() and o.docente_perfil_id=(select id from public.perfiles where auth_user_id=auth.uid());
 if p_operacion='leer' then return rol in ('orientador','superadministrador','desarrollador') or (rol='docente' and propio and (o.enviado_en is null or (e.confirmado and o.enviado_por=auth.uid())));end if;
 if p_operacion='borrar' and rol in ('superadministrador','desarrollador') and alumno.eliminando then return true;end if;
 return ((p_operacion='escribir' and not e.retirando) or (p_operacion='borrar' and e.retirando)) and o.enviado_en is null and not alumno.eliminando and not alumno.archivado and alumno.estado='activo' and
 (rol='desarrollador' or (rol='docente' and propio and exists(select 1 from public.matriculas m join public.docentes_cursos dc on dc.grupo_id=m.grupo_id and dc.activo where m.estudiante_id=o.estudiante_id and m.anio_lectivo=o.anio_lectivo and dc.docente_perfil_id=o.docente_perfil_id)));
exception when invalid_text_representation then return false;
end $$;
revoke all on function orientacion_privado.acceso_evidencia(text,text) from public,anon;
grant execute on function orientacion_privado.acceso_evidencia(text,text) to authenticated;
create policy evidencia_lectura on public.observacion_evidencias for select to authenticated using(orientacion_privado.acceso_evidencia(observacion_id::text||'/'||id::text,'leer'));
create policy evidencia_storage_lectura on storage.objects for select to authenticated using(bucket_id='observacion-evidencias' and orientacion_privado.acceso_evidencia(name,'leer'));
create policy evidencia_storage_alta on storage.objects for insert to authenticated with check(bucket_id='observacion-evidencias' and orientacion_privado.acceso_evidencia(name,'escribir'));
create policy evidencia_storage_baja on storage.objects for delete to authenticated using(bucket_id='observacion-evidencias' and orientacion_privado.acceso_evidencia(name,'borrar'));
create function orientacion_privado.evidencia_operar(p_accion text,p_observacion uuid,p_datos jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.observaciones_docentes%rowtype; alumno public.estudiantes%rowtype; e public.observacion_evidencias%rowtype; rol text:=orientacion_privado.rol_actual(); sid uuid; eid uuid; mime text; ext text;
begin
 if auth.uid() is null or coalesce(rol,'') not in ('docente','orientador','superadministrador','desarrollador') then raise exception 'No tienes acceso a evidencias';end if;
 select estudiante_id into sid from public.observaciones_docentes where id=p_observacion;
 select * into alumno from public.estudiantes where id=sid for update;
 select * into o from public.observaciones_docentes where id=p_observacion for update;
 if not found or (rol='docente' and (o.docente_perfil_id<>(select id from public.perfiles where auth_user_id=auth.uid()) or (o.enviado_en is not null and o.enviado_por is distinct from auth.uid()))) then raise exception 'No tienes acceso a este formato';end if;
 if p_accion='listar' then
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.creado_en,x.id) from (
 select ev.*, ev.observacion_id::text||'/'||ev.id::text as ruta,
 exists(select 1 from storage.objects s where s.bucket_id='observacion-evidencias' and s.name=ev.observacion_id::text||'/'||ev.id::text and (s.metadata->>'size')::bigint=ev.tamano and s.metadata->>'mimetype'=ev.tipo) as subido
 from public.observacion_evidencias ev where ev.observacion_id=p_observacion
 and (o.enviado_en is null or ev.confirmado)
 and (rol<>'docente' or ev.creado_por=auth.uid())
 ) x),'[]'::jsonb);
 end if;
 if o.enviado_en is not null or alumno.eliminando or alumno.archivado or alumno.estado<>'activo' then raise exception 'No se pueden cambiar las evidencias de este formato';end if;
 if rol not in ('docente','desarrollador') then raise exception 'Solo el docente asignado o el desarrollador pueden adjuntar evidencias';end if;
 if rol='docente' and not exists(select 1 from public.matriculas m join public.docentes_cursos dc on dc.grupo_id=m.grupo_id and dc.activo where m.estudiante_id=sid and m.anio_lectivo=o.anio_lectivo and dc.docente_perfil_id=o.docente_perfil_id) then raise exception 'Ya no tienes asignado este curso';end if;
 eid=(p_datos->>'id')::uuid;
 if p_accion='reservar' then
 mime=p_datos->>'tipo';ext=lower(substring(p_datos->>'nombre' from '\.([^.]+)$'));
 if mime is null or (case mime when 'image/jpeg' then ext in ('jpg','jpeg') when 'image/png' then ext='png' when 'image/webp' then ext='webp' when 'application/pdf' then ext='pdf' when 'application/zip' then ext='zip' when 'application/vnd.rar' then ext='rar' when 'application/x-7z-compressed' then ext='7z' else false end) is not true then raise exception 'Usa JPG, PNG, WEBP, PDF, ZIP, RAR o 7Z';end if;
 if coalesce((p_datos->>'tamano')::bigint,0) not between 1 and 20971520 then raise exception 'Cada archivo debe pesar entre 1 byte y 20 MB';end if;
 if coalesce(length(btrim(p_datos->>'nombre')),0) not between 1 and 255 or eid is null then raise exception 'Nombre o identificador inválido';end if;
 insert into public.observacion_evidencias(id,observacion_id,creado_por,nombre,tipo,tamano) values(eid,p_observacion,auth.uid(),p_datos->>'nombre',mime,(p_datos->>'tamano')::bigint) on conflict(id) do nothing;
 select * into e from public.observacion_evidencias where id=eid;
 if e.observacion_id<>p_observacion or e.creado_por<>auth.uid() or e.nombre is distinct from p_datos->>'nombre' or e.tipo is distinct from mime or e.tamano is distinct from (p_datos->>'tamano')::bigint then raise exception 'El identificador corresponde a otro archivo';end if;
 return to_jsonb(e)||jsonb_build_object('ruta',p_observacion::text||'/'||eid::text);
 elsif p_accion in ('retirar_preparar','quitar') then
 select * into e from public.observacion_evidencias where id=eid and observacion_id=p_observacion;
 if not found then return jsonb_build_object('eliminado',true);end if;
 if e.creado_por<>auth.uid() and rol<>'desarrollador' then raise exception 'No puedes retirar evidencias ajenas';end if;
 if p_accion='retirar_preparar' then update public.observacion_evidencias set retirando=true where id=eid;return to_jsonb(e)||jsonb_build_object('ruta',p_observacion::text||'/'||eid::text);end if;
 if not e.retirando then raise exception 'Primero prepara la retirada de la evidencia';end if;
 if exists(select 1 from storage.objects where bucket_id='observacion-evidencias' and name=p_observacion::text||'/'||eid::text) then raise exception 'Primero retira el archivo del almacenamiento';end if;
 delete from public.observacion_evidencias where id=eid;
 return jsonb_build_object('eliminado',true);
 end if;
 raise exception 'Acción no permitida';
end $$;
revoke all on function orientacion_privado.evidencia_operar(text,uuid,jsonb) from public,anon;
grant execute on function orientacion_privado.evidencia_operar(text,uuid,jsonb) to authenticated;
create function public.evidencia_operar(p_accion text,p_observacion uuid,p_datos jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select orientacion_privado.evidencia_operar(p_accion,p_observacion,p_datos) $$;
revoke all on function public.evidencia_operar(text,uuid,jsonb) from public,anon;
grant execute on function public.evidencia_operar(text,uuid,jsonb) to authenticated;
create or replace function orientacion_privado.observacion_inmutable() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.enviado_en is not null then raise exception 'El formato enviado no se puede editar';end if;
 if new.enviado_en is not null then
 if auth.uid() is null or new.enviado_por is distinct from auth.uid() then raise exception 'No se pudo identificar el autor del envío';end if;
 if exists(select 1 from public.observacion_evidencias where observacion_id=new.id and creado_por=auth.uid() and retirando) then raise exception 'Termina la retirada de las evidencias antes de enviar';end if;
 if not exists(select 1 from public.observacion_evidencias e join storage.objects s on s.bucket_id='observacion-evidencias' and s.name=e.observacion_id::text||'/'||e.id::text where e.observacion_id=new.id and e.creado_por=auth.uid() and e.tipo like 'image/%' and (s.metadata->>'size')::bigint=e.tamano and s.metadata->>'mimetype'=e.tipo) then raise exception 'Debes subir al menos una foto como evidencia (JPG, PNG o WEBP), de máximo 20 MB';end if;
 if exists(select 1 from public.observacion_evidencias e where e.observacion_id=new.id and e.creado_por=auth.uid() and not exists(select 1 from storage.objects s where s.bucket_id='observacion-evidencias' and s.name=e.observacion_id::text||'/'||e.id::text and (s.metadata->>'size')::bigint=e.tamano and s.metadata->>'mimetype'=e.tipo)) then raise exception 'Hay evidencias que no terminaron de subir. Reintenta o retíralas antes de enviar';end if;
 update public.observacion_evidencias set confirmado=true where observacion_id=new.id and creado_por=auth.uid();
 end if;
 return new;
end $$;
CREATE OR REPLACE FUNCTION orientacion_privado.baja_estudiante(p_id uuid, p_confirmacion text, p_finalizar boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.estudiantes%rowtype; entrevistas uuid[]; rutas jsonb; evidencias_rutas jsonb;
begin
 if auth.uid() is null or coalesce(orientacion_privado.rol_actual(),'') not in ('superadministrador','desarrollador') then raise exception 'Solo superadministradores y desarrollador pueden eliminar estudiantes'; end if;
 select * into e from public.estudiantes where id=p_id for update;
 if not found then return jsonb_build_object('eliminado',true); end if;
 if p_confirmacion is distinct from e.nombre then raise exception 'La confirmación del nombre no coincide'; end if;
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into entrevistas from public.entrevistas_admision where estudiante_id=p_id;
 perform 1 from public.entrevistas_admision where id=any(entrevistas) order by id for update;
 if not p_finalizar then
  update public.estudiantes set eliminando=true,actualizado_en=now() where id=p_id and not eliminando;
  update public.entrevistas_admision set eliminando=true,borrado_motivo='estudiante',borrado_por=auth.uid(),version=version+1,actualizado_en=now() where id=any(entrevistas) and (not eliminando or borrado_motivo is distinct from 'estudiante');
  select coalesce(jsonb_agg(name),'[]'::jsonb) into rutas from storage.objects where bucket_id='admisiones-soportes' and split_part(name,'/',1)=any(array(select id::text from unnest(entrevistas) as x(id)));
  select coalesce(jsonb_agg(s.name),'[]'::jsonb) into evidencias_rutas from storage.objects s where s.bucket_id='observacion-evidencias' and split_part(s.name,'/',1) in(select id::text from public.observaciones_docentes where estudiante_id=p_id);
  return jsonb_build_object('rutas',rutas,'evidencias_rutas',evidencias_rutas,'entrevistas',cardinality(entrevistas));
 end if;
 if not e.eliminando then raise exception 'Primero prepara la eliminación del estudiante'; end if;
 if exists(select 1 from public.entrevistas_admision where id=any(entrevistas) and not eliminando) then raise exception 'Hay una entrevista que no se preparó para borrar'; end if;
 if exists(select 1 from storage.objects where bucket_id='admisiones-soportes' and split_part(name,'/',1)=any(array(select id::text from unnest(entrevistas) as x(id)))) then raise exception 'Falta retirar los soportes del estudiante'; end if;
 if exists(select 1 from storage.objects s where s.bucket_id='observacion-evidencias' and split_part(s.name,'/',1) in(select id::text from public.observaciones_docentes where estudiante_id=p_id)) then raise exception 'Falta retirar las evidencias de observación docente'; end if;
 delete from public.admisiones_vinculos where estudiante_id=p_id or entrevista_id=any(entrevistas);
 delete from public.entrevistas_admision where id=any(entrevistas);
 delete from public.matriculas where estudiante_id=p_id;
 delete from public.estudiantes where id=p_id;
 return jsonb_build_object('eliminado',true);
end $function$
;

create trigger auditar_evidencias after insert or update or delete on public.observacion_evidencias for each row execute function orientacion_privado.auditar_cambio();
