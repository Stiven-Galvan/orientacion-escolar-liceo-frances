CREATE OR REPLACE FUNCTION orientacion_privado.baja_estudiante(p_id uuid, p_confirmacion text, p_finalizar boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.estudiantes%rowtype; entrevistas uuid[]; rutas jsonb; evidencias_rutas jsonb; remisiones_rutas jsonb;
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
  select coalesce(jsonb_agg(o.name),'[]'::jsonb) into remisiones_rutas from storage.objects o where o.bucket_id='remisiones-soportes' and split_part(o.name,'/',1) in(select r.id::text from public.remisiones r where r.estudiante_id=p_id);
  return jsonb_build_object('remisiones_rutas',remisiones_rutas,'rutas',rutas,'evidencias_rutas',evidencias_rutas,'entrevistas',cardinality(entrevistas));
 end if;
 if not e.eliminando then raise exception 'Primero prepara la eliminación del estudiante'; end if;
 if exists(select 1 from public.entrevistas_admision where id=any(entrevistas) and not eliminando) then raise exception 'Hay una entrevista que no se preparó para borrar'; end if;
 if exists(select 1 from storage.objects where bucket_id='admisiones-soportes' and split_part(name,'/',1)=any(array(select id::text from unnest(entrevistas) as x(id)))) then raise exception 'Falta retirar los soportes del estudiante'; end if;
 if exists(select 1 from storage.objects s where s.bucket_id='observacion-evidencias' and split_part(s.name,'/',1) in(select id::text from public.observaciones_docentes where estudiante_id=p_id)) then raise exception 'Falta retirar las evidencias de observación docente'; end if;
 if exists(select 1 from storage.objects o where o.bucket_id='remisiones-soportes' and split_part(o.name,'/',1) in(select r.id::text from public.remisiones r where r.estudiante_id=p_id)) then raise exception 'Falta retirar los adjuntos de remisiones del estudiante';end if;
 delete from public.admisiones_vinculos where estudiante_id=p_id or entrevista_id=any(entrevistas);
 delete from public.entrevistas_admision where id=any(entrevistas);
 delete from public.matriculas where estudiante_id=p_id;
 delete from public.estudiantes where id=p_id;
 return jsonb_build_object('eliminado',true);
end $function$

