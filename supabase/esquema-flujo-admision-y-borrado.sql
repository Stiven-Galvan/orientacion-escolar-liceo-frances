-- Respaldo de la migración remota ya aplicada. No repetir.
alter table public.entrevistas_admision add column borrado_motivo text check(borrado_motivo in('manual','rechazo','estudiante')), add column borrado_por uuid;
alter table public.estudiantes add column eliminando boolean not null default false;
create policy estudiantes_no_editar_durante_borrado on public.estudiantes as restrictive for update to authenticated using(not eliminando) with check(not eliminando);
create policy matriculas_no_insertar_durante_borrado on public.matriculas as restrictive for insert to authenticated with check(exists(select 1 from public.estudiantes e where e.id=estudiante_id and not e.eliminando));
create policy matriculas_no_editar_durante_borrado on public.matriculas as restrictive for update to authenticated using(exists(select 1 from public.estudiantes e where e.id=estudiante_id and not e.eliminando)) with check(exists(select 1 from public.estudiantes e where e.id=estudiante_id and not e.eliminando));
create or replace function orientacion_privado.entrevista_operar(p_accion text,p_id uuid,p_datos jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.entrevistas_admision%rowtype; rol text:=orientacion_privado.rol_actual(); firma jsonb; quien text; meta jsonb; resultado jsonb; n integer; sin_extra boolean;
begin
 if auth.uid() is null or coalesce(rol,'') not in('orientador','superadministrador','desarrollador') then raise exception 'No tienes permiso para administrar entrevistas'; end if;
 if p_id is null then raise exception 'Falta identificar la entrevista'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,41));
 select * into e from public.entrevistas_admision where id=p_id for update;
 if found and rol='orientador' and e.creado_por<>auth.uid() then raise exception 'No tienes acceso a esta entrevista'; end if;
 if p_accion in('rechazar_preparar','rechazar_finalizar') then
  if e.id is null then return jsonb_build_object('eliminado',true); end if;
  if e.estado not in('Pendiente','No admitido') or e.archivado or e.estudiante_id is not null or exists(select 1 from public.admisiones_vinculos where entrevista_id=p_id) then raise exception 'Solo se puede rechazar un aspirante sin admisión vinculada'; end if;
  if e.eliminando and e.borrado_motivo is distinct from 'rechazo' then raise exception 'La entrevista tiene otro borrado pendiente'; end if;
  if p_accion='rechazar_preparar' then
   if not e.eliminando then
    if (p_datos->>'version')::integer is distinct from e.version then raise exception 'Actualiza el listado antes de registrar el rechazo'; end if;
    update public.entrevistas_admision set estado='No admitido',eliminando=true,borrado_motivo='rechazo',borrado_por=auth.uid(),version=version+1,actualizado_en=now() where id=p_id;
   end if;
   return jsonb_build_object('ruta',case when exists(select 1 from storage.objects where bucket_id='admisiones-soportes' and name=p_id::text||'/soporte') then p_id::text||'/soporte' else null end);
  end if;
  if not e.eliminando or e.borrado_motivo is distinct from 'rechazo' then raise exception 'Primero registra la decisión de rechazo'; end if;
  if rol<>'superadministrador' and e.creado_por<>auth.uid() and e.borrado_por<>auth.uid() then raise exception 'No tienes permiso para completar este rechazo'; end if;
  if exists(select 1 from storage.objects where bucket_id='admisiones-soportes' and name=p_id::text||'/soporte') then raise exception 'Falta retirar el soporte del aspirante rechazado'; end if;
  delete from public.entrevistas_admision where id=p_id;
  return jsonb_build_object('eliminado',true);
 end if;
 if p_accion in('preparar_borrado','finalizar_borrado') then
  if rol<>'superadministrador' then raise exception 'Solo superadministradores pueden eliminar registros'; end if;
  if e.id is null then return jsonb_build_object('eliminado',true); end if;
  if coalesce(p_datos->>'confirmacion','')<>coalesce(e.datos->>'nombre','') then raise exception 'La confirmación del nombre no coincide'; end if;
  if p_accion='preparar_borrado' then
   update public.entrevistas_admision set eliminando=true,borrado_motivo='manual',borrado_por=auth.uid(),version=version+1,actualizado_en=now() where id=p_id and not eliminando;
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
   raise exception 'Usa el flujo de rechazo con eliminación de archivos';
  else raise exception 'Decisión inválida'; end if;
 elsif p_accion='archivar' then
  if e.estado<>'Sin seguimiento' or e.notas_privadas<>'' or cardinality(e.condiciones)>0 or e.soporte_nombre is not null then raise exception 'Solo se archivan entrevistas finalizadas sin seguimiento'; end if;
  update public.entrevistas_admision set archivado=coalesce((p_datos->>'archivado')::boolean,false),version=version+1,actualizado_en=now() where id=p_id returning * into e;
 else raise exception 'Acción inválida'; end if;
 return to_jsonb(e);
end $$;

create function orientacion_privado.baja_estudiante(p_id uuid,p_confirmacion text,p_finalizar boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.estudiantes%rowtype; entrevistas uuid[]; rutas jsonb;
begin
 if auth.uid() is null or coalesce(orientacion_privado.rol_actual(),'')<>'superadministrador' then raise exception 'Solo superadministradores pueden eliminar estudiantes'; end if;
 select * into e from public.estudiantes where id=p_id for update;
 if not found then return jsonb_build_object('eliminado',true); end if;
 if p_confirmacion is distinct from e.nombre then raise exception 'La confirmación del nombre no coincide'; end if;
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into entrevistas from public.entrevistas_admision where estudiante_id=p_id;
 perform 1 from public.entrevistas_admision where id=any(entrevistas) order by id for update;
 if not p_finalizar then
  update public.estudiantes set eliminando=true,actualizado_en=now() where id=p_id and not eliminando;
  update public.entrevistas_admision set eliminando=true,borrado_motivo='estudiante',borrado_por=auth.uid(),version=version+1,actualizado_en=now() where id=any(entrevistas) and (not eliminando or borrado_motivo is distinct from 'estudiante');
  select coalesce(jsonb_agg(name),'[]'::jsonb) into rutas from storage.objects where bucket_id='admisiones-soportes' and split_part(name,'/',1)=any(array(select id::text from unnest(entrevistas) as x(id)));
  return jsonb_build_object('rutas',rutas,'entrevistas',cardinality(entrevistas));
 end if;
 if not e.eliminando then raise exception 'Primero prepara la eliminación del estudiante'; end if;
 if exists(select 1 from public.entrevistas_admision where id=any(entrevistas) and not eliminando) then raise exception 'Hay una entrevista que no se preparó para borrar'; end if;
 if exists(select 1 from storage.objects where bucket_id='admisiones-soportes' and split_part(name,'/',1)=any(array(select id::text from unnest(entrevistas) as x(id)))) then raise exception 'Falta retirar los soportes del estudiante'; end if;
 delete from public.admisiones_vinculos where estudiante_id=p_id or entrevista_id=any(entrevistas);
 delete from public.entrevistas_admision where id=any(entrevistas);
 delete from public.matriculas where estudiante_id=p_id;
 delete from public.estudiantes where id=p_id;
 return jsonb_build_object('eliminado',true);
end $$;
revoke all on function orientacion_privado.baja_estudiante(uuid,text,boolean) from public,anon;
grant execute on function orientacion_privado.baja_estudiante(uuid,text,boolean) to authenticated;
create function public.baja_estudiante(p_id uuid,p_confirmacion text,p_finalizar boolean default false)
returns jsonb language sql security invoker set search_path='' as $$ select orientacion_privado.baja_estudiante(p_id,p_confirmacion,p_finalizar) $$;
revoke all on function public.baja_estudiante(uuid,text,boolean) from public,anon;
grant execute on function public.baja_estudiante(uuid,text,boolean) to authenticated;

create or replace function orientacion_privado.acceso_soporte(p_ruta text,p_operacion text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare e public.entrevistas_admision%rowtype; rol text:=orientacion_privado.rol_actual();
begin
 if auth.uid() is null or rol is null or p_ruta !~ '^[0-9a-f-]{36}/soporte$' then return false; end if;
 select * into e from public.entrevistas_admision where id=split_part(p_ruta,'/',1)::uuid;
 if not found then return false; end if;
 if p_operacion='borrar' then
  return e.eliminando and (rol='superadministrador' or (e.borrado_motivo='rechazo' and e.estado='No admitido' and e.estudiante_id is null and rol in('orientador','desarrollador') and (e.creado_por=auth.uid() or e.borrado_por=auth.uid())));
 end if;
 if p_operacion='escribir' then return rol in('orientador','superadministrador','desarrollador') and e.creado_por=auth.uid() and e.estado='Borrador' and not e.eliminando and e.soporte_nombre is not null; end if;
 return rol in('superadministrador','desarrollador') or (rol='orientador' and e.creado_por=auth.uid());
exception when invalid_text_representation then return false;
end $$;

create or replace function orientacion_privado.admitir_aspirante(p_entrevista_id uuid,p_datos jsonb,p_confirmar_existente boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare existente public.estudiantes%rowtype; vinculo public.admisiones_vinculos%rowtype; resultado jsonb; estudiante uuid; tipo text; documento text; grado_e text; anio integer; seccion_e text; conserva boolean:=false;
begin
 if auth.uid() is null or coalesce(orientacion_privado.rol_actual(),'') not in ('orientador','superadministrador','desarrollador') then raise exception 'No tienes permiso para admitir aspirantes'; end if;
 if p_entrevista_id is null or jsonb_typeof(p_datos) is distinct from 'object' then raise exception 'Datos de admisión incompletos'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_entrevista_id::text,17));
 select * into vinculo from public.admisiones_vinculos where entrevista_id=p_entrevista_id;
 if found then return jsonb_build_object('estudiante_id',vinculo.estudiante_id,'ya_vinculado',true,'requiere_confirmacion',false); end if;
 tipo:=case upper(btrim(p_datos->>'tipoDocumento')) when 'PASAPORTE' then 'PAS' when 'OTRO' then 'OTRO' else upper(btrim(p_datos->>'tipoDocumento')) end;
 documento:=upper(regexp_replace(coalesce(p_datos->>'documento',''),'[[:space:]]','','g'));
 grado_e:=case lower(btrim(p_datos->>'grado')) when 'pre-kinder' then 'pre-kinder' when 'pre-kínder' then 'pre-kinder' when 'kinder' then 'kinder' when 'kínder' then 'kinder' when 'transición' then 'transicion' when 'transicion' then 'transicion' else regexp_replace(p_datos->>'grado','[^0-9]','','g') end;
 anio:=(p_datos->>'ingreso')::integer;
 seccion_e:=upper(btrim(coalesce(p_datos->>'grupo','')));
 if tipo is null or tipo not in ('TI','RC','CC','CE','PPT','PAS','OTRO') or documento !~ '^[A-Z0-9-]{3,30}$' then raise exception 'Revisa el tipo y número de documento antes de admitir'; end if;
 if anio is null or anio not between 2000 and 2100 or grado_e is null or grado_e not in ('pre-kinder','kinder','transicion','1','2','3','4','5','6','7','8','9','10','11') or length(seccion_e)>30 then raise exception 'Revisa el año, grado y grupo de ingreso'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tipo||':'||documento,23));
 select * into existente from public.estudiantes where tipo_documento=tipo and numero_documento=documento;
 if found and existente.eliminando then raise exception 'El estudiante tiene una eliminación pendiente'; end if;
 if found then
  if not coalesce(p_confirmar_existente,false) then
   return jsonb_build_object('requiere_confirmacion',true,'estudiante_id',existente.id,'nombre_existente',existente.nombre);
  end if;
  estudiante:=existente.id;
  conserva:=exists(select 1 from public.matriculas where estudiante_id=estudiante and anio_lectivo=anio);
  if not conserva then
   resultado:=public.guardar_estudiante(to_jsonb(existente)||jsonb_build_object('anio_lectivo',anio,'grado',grado_e,'seccion',seccion_e),estudiante,existente.version);
  end if;
 else
  estudiante:=p_entrevista_id;
  resultado:=public.guardar_estudiante(jsonb_build_object('nombre',p_datos->>'nombre','tipo_documento',tipo,'numero_documento',documento,'fecha_nacimiento',p_datos->>'nacimiento','estado','activo','es_prueba',coalesce((p_datos->>'esPrueba')::boolean,true),'acudiente_nombre',p_datos->>'acudientes','acudiente_telefono',p_datos->>'celular','acudiente_correo',p_datos->>'correo','anio_lectivo',anio,'grado',grado_e,'seccion',seccion_e),estudiante,null);
 end if;
 insert into public.admisiones_vinculos(entrevista_id,estudiante_id,anio_lectivo) values(p_entrevista_id,estudiante,anio);
 return jsonb_build_object('requiere_confirmacion',false,'estudiante_id',estudiante,'matricula_conservada',conserva,'existente',existente.id is not null);
end $$;

create or replace function public.listar_estudiantes(p_busqueda text default '',p_anio integer default null,p_grado text default null,p_estado text default null,p_pagina integer default 1)
returns jsonb language sql stable security invoker set search_path='' as $$
 with base as (
 select e.id,e.nombre,e.tipo_documento,e.numero_documento,e.estado,e.es_prueba,e.version,e.eliminando,g.anio_lectivo,g.grado,g.seccion
 from public.estudiantes e
 left join lateral(select m.grupo_id from public.matriculas m where m.estudiante_id=e.id and (p_anio is null or m.anio_lectivo=p_anio) order by m.anio_lectivo desc limit 1) m on true
 left join public.grupos g on g.id=m.grupo_id
 where not e.archivado and (p_anio is null or g.anio_lectivo=p_anio) and (p_grado is null or g.grado=p_grado) and (p_estado is null or e.estado=p_estado)
 and (coalesce(btrim(p_busqueda),'')='' or position(lower(btrim(p_busqueda)) in lower(e.nombre))>0 or position(upper(btrim(p_busqueda)) in coalesce(e.numero_documento,''))>0)
 ), pagina as (select * from base order by nombre,id limit 25 offset (greatest(coalesce(p_pagina,1),1)-1)*25)
 select jsonb_build_object('total',(select count(*) from base),'estudiantes',coalesce((select jsonb_agg(to_jsonb(p) order by p.nombre,p.id) from pagina p),'[]'::jsonb))
$$;

create or replace function orientacion_privado.mis_estudiantes_cursos(p_anio integer,p_grupo uuid,p_busqueda text,p_pagina integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare docente uuid;
begin
 if auth.uid() is null or coalesce(orientacion_privado.rol_actual(),'')<>'docente' then raise exception 'Esta consulta requiere una cuenta docente activa'; end if;
 select id into docente from public.perfiles where auth_user_id=(select auth.uid()) and rol='docente' and activo and not requiere_cambio_password;
 return (
 with cursos as(select g.id,g.anio_lectivo,g.grado,g.seccion from public.docentes_cursos d join public.grupos g on g.id=d.grupo_id where d.docente_perfil_id=docente and d.activo and (p_anio is null or g.anio_lectivo=p_anio)),
 base as(select e.id,e.nombre,m.anio_lectivo,g.id as grupo_id,g.grado,g.seccion from public.matriculas m join cursos g on g.id=m.grupo_id join public.estudiantes e on e.id=m.estudiante_id where not e.archivado and not e.eliminando and e.estado='activo' and (p_grupo is null or g.id=p_grupo) and (coalesce(btrim(p_busqueda),'')='' or position(lower(btrim(p_busqueda)) in lower(e.nombre))>0)),
 pagina as(select * from base order by nombre,anio_lectivo desc,id limit 25 offset (least(greatest(coalesce(p_pagina,1),1),100000)-1)*25)
 select jsonb_build_object('grupos',coalesce((select jsonb_agg(to_jsonb(g) order by g.grado,g.seccion) from cursos g),'[]'::jsonb),'estudiantes',coalesce((select jsonb_agg(to_jsonb(e) order by e.nombre,e.anio_lectivo desc,e.id) from pagina e),'[]'::jsonb),'total',(select count(*) from base))
 );
end $$;

create or replace function orientacion_privado.eliminar_registro_escolar(p_tipo text,p_id uuid,p_anio integer,p_grado text,p_confirmacion text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare nombre text; ids uuid[]; afectados integer:=0; alumno uuid; baja jsonb;
begin
 if auth.uid() is null or coalesce(orientacion_privado.rol_actual(),'')<>'superadministrador' then raise exception 'Solo superadministradores pueden eliminar registros'; end if;
 if p_tipo='estudiante' then
  baja:=orientacion_privado.baja_estudiante(p_id,p_confirmacion,false);
  if coalesce((baja->>'eliminado')::boolean,false) then return baja; end if;
  if jsonb_array_length(coalesce(baja->'rutas','[]'::jsonb))>0 then raise exception 'Actualiza la aplicación para completar la eliminación junto con sus soportes'; end if;
  return orientacion_privado.baja_estudiante(p_id,p_confirmacion,true);
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
