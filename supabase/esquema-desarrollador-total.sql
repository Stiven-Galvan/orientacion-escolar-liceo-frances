alter table public.observaciones_docentes add column enviado_nombre text;
CREATE OR REPLACE FUNCTION orientacion_privado.personal_operar(p_actor uuid, p_accion text, p_datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor public.perfiles%rowtype; objetivo public.perfiles%rowtype; baja orientacion_privado.bajas_personal%rowtype;
 nuevo_id uuid; cuenta uuid; rol_nuevo text; correo_nuevo text; salida jsonb; claims jsonb;
begin
 -- Serializa altas, cambios y bajas para proteger invariantes entre administradores.
 perform pg_catalog.pg_advisory_xact_lock(782491063);
 select * into actor from public.perfiles where auth_user_id=p_actor;
 if not found or not actor.activo or actor.requiere_cambio_password or actor.rol not in ('superadministrador','desarrollador') then
  raise exception 'No tienes permiso para administrar personal';
 end if;
 if p_accion in ('preparar_eliminacion','finalizar_eliminacion') and actor.rol not in ('superadministrador','desarrollador') then raise exception 'Solo superadministradores y desarrollador pueden eliminar personal'; end if;
 claims:=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb);
 perform set_config('request.jwt.claims',(claims || jsonb_build_object('sub',p_actor::text))::text,true);
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 if p_accion='validar' then return jsonb_build_object('autorizado',true); end if;
 if p_accion='listar' then
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'auth_user_id',p.auth_user_id,'nombre',p.nombre,'correo',p.correo,'rol',p.rol,'activo',p.activo,'requiere_cambio_password',p.requiere_cambio_password,'eliminacion_pendiente',b.perfil_id is not null) order by p.nombre),'[]'::jsonb)
  into salida from public.perfiles p left join orientacion_privado.bajas_personal b on b.perfil_id=p.id;
  return salida;
 end if;
 if p_accion='crear' then
  rol_nuevo:=p_datos->>'rol'; correo_nuevo:=lower(btrim(p_datos->>'correo')); cuenta:=(p_datos->>'auth_user_id')::uuid;
  if rol_nuevo is null or rol_nuevo not in ('docente','orientador','superadministrador','coordinacion_academica','coordinacion_convivencial') then raise exception 'Rol de personal inválido'; end if;
  if coalesce(length(btrim(p_datos->>'nombre')),0) not between 2 and 180 then raise exception 'Revisa el nombre'; end if;
  if coalesce(p_datos->>'documento','') !~ '^[0-9]{5,20}$' then raise exception 'Revisa el número de documento'; end if;
  if not exists(select 1 from auth.users where id=cuenta and lower(email)=correo_nuevo and email_confirmed_at is not null) then raise exception 'La cuenta de acceso no coincide'; end if;
  insert into public.perfiles(nombre,correo,rol,auth_user_id,requiere_cambio_password)
  values(btrim(p_datos->>'nombre'),correo_nuevo,rol_nuevo,cuenta,true) returning id into nuevo_id;
  perform orientacion_privado.personal_subtipo(nuevo_id,rol_nuevo);
  insert into orientacion_privado.documentos_personal(perfil_id,tipo_documento,numero_documento)
  values(nuevo_id,'CC',p_datos->>'documento');
  return jsonb_build_object('id',nuevo_id);
 end if;
 select * into objetivo from public.perfiles where id=(p_datos->>'id')::uuid for update;
 if not found then
  if p_accion in ('preparar_eliminacion','finalizar_eliminacion') then return jsonb_build_object('eliminado',true); end if;
  raise exception 'La persona ya no existe';
 end if;
 if objetivo.rol='desarrollador' then raise exception 'El perfil de desarrollador está protegido'; end if;
 if objetivo.id=actor.id then raise exception 'No puedes cambiar tu propio rol ni eliminar tu cuenta'; end if;
 if p_accion='cambiar_rol' then
  if exists(select 1 from orientacion_privado.bajas_personal where perfil_id=objetivo.id) then raise exception 'La cuenta tiene una eliminación pendiente'; end if;
  rol_nuevo:=p_datos->>'rol';
  if rol_nuevo is null or rol_nuevo not in ('docente','orientador','superadministrador','coordinacion_academica','coordinacion_convivencial') then raise exception 'Rol de personal inválido'; end if;
  if objetivo.rol=rol_nuevo then return jsonb_build_object('id',objetivo.id); end if;
 elsif p_accion not in ('preparar_eliminacion','finalizar_eliminacion') then raise exception 'Acción inválida';
 end if;
 if objetivo.rol='superadministrador' and objetivo.activo and objetivo.auth_user_id is not null then
  if (select count(*) from public.perfiles where rol='superadministrador' and activo and auth_user_id is not null)<=1 then raise exception 'Debe quedar al menos un superadministrador activo'; end if;
 end if;
 if p_accion='cambiar_rol' then
  perform orientacion_privado.personal_subtipo(objetivo.id,null);
  update public.perfiles set rol=rol_nuevo where id=objetivo.id;
  perform orientacion_privado.personal_subtipo(objetivo.id,rol_nuevo);
  return jsonb_build_object('id',objetivo.id);
 end if;
 if p_accion='preparar_eliminacion' then
  insert into orientacion_privado.bajas_personal(perfil_id,auth_user_id,solicitado_por)
  values(objetivo.id,objetivo.auth_user_id,p_actor) on conflict(perfil_id) do nothing;
  update public.perfiles set activo=false where id=objetivo.id and activo;
  select * into baja from orientacion_privado.bajas_personal where perfil_id=objetivo.id;
  return jsonb_build_object('auth_user_id',baja.auth_user_id,'id',objetivo.id);
 end if;
 select * into baja from orientacion_privado.bajas_personal where perfil_id=objetivo.id;
 if not found then raise exception 'Primero debes preparar la eliminación'; end if;
 if baja.auth_user_id is not null and exists(select 1 from auth.users where id=baja.auth_user_id) then raise exception 'La cuenta de acceso aún no se eliminó'; end if;
 perform orientacion_privado.personal_subtipo(objetivo.id,null);
 delete from orientacion_privado.documentos_personal where perfil_id=objetivo.id;
 delete from orientacion_privado.bajas_personal where perfil_id=objetivo.id;
 delete from public.perfiles where id=objetivo.id;
 return jsonb_build_object('eliminado',true);
end $function$
;

CREATE OR REPLACE FUNCTION orientacion_privado.baja_estudiante(p_id uuid, p_confirmacion text, p_finalizar boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.estudiantes%rowtype; entrevistas uuid[]; rutas jsonb;
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
end $function$
;

CREATE OR REPLACE FUNCTION orientacion_privado.eliminar_registro_escolar(p_tipo text, p_id uuid, p_anio integer, p_grado text, p_confirmacion text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare nombre text; ids uuid[]; afectados integer:=0; alumno uuid; baja jsonb;
begin
 if auth.uid() is null or coalesce(orientacion_privado.rol_actual(),'') not in ('superadministrador','desarrollador') then raise exception 'Solo superadministradores y desarrollador pueden eliminar registros'; end if;
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
end $function$
;

CREATE OR REPLACE FUNCTION orientacion_privado.entrevista_operar(p_accion text, p_id uuid, p_datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if rol not in ('superadministrador','desarrollador') and e.creado_por<>auth.uid() and e.borrado_por<>auth.uid() then raise exception 'No tienes permiso para completar este rechazo'; end if;
  if exists(select 1 from storage.objects where bucket_id='admisiones-soportes' and name=p_id::text||'/soporte') then raise exception 'Falta retirar el soporte del aspirante rechazado'; end if;
  delete from public.entrevistas_admision where id=p_id;
  return jsonb_build_object('eliminado',true);
 end if;
 if p_accion in('preparar_borrado','finalizar_borrado') then
  if rol not in ('superadministrador','desarrollador') then raise exception 'Solo superadministradores y desarrollador pueden eliminar registros'; end if;
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
  if e.id is not null and e.creado_por<>auth.uid() and rol<>'desarrollador' then raise exception 'Solo el autor puede completar su borrador'; end if;
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
  if e.creado_por<>auth.uid() and rol<>'desarrollador' then raise exception 'Solo el autor puede finalizar su borrador'; end if;
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
end $function$
;

CREATE OR REPLACE FUNCTION orientacion_privado.acceso_soporte(p_ruta text, p_operacion text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.entrevistas_admision%rowtype; rol text:=orientacion_privado.rol_actual();
begin
 if auth.uid() is null or rol is null or p_ruta !~ '^[0-9a-f-]{36}/soporte$' then return false; end if;
 select * into e from public.entrevistas_admision where id=split_part(p_ruta,'/',1)::uuid;
 if not found then return false; end if;
 if p_operacion='borrar' then
  return e.eliminando and (rol in('superadministrador','desarrollador') or (e.borrado_motivo='rechazo' and e.estado='No admitido' and e.estudiante_id is null and rol in('orientador','desarrollador') and (e.creado_por=auth.uid() or e.borrado_por=auth.uid())));
 end if;
 if p_operacion='escribir' then return rol in('orientador','superadministrador','desarrollador') and (e.creado_por=auth.uid() or rol='desarrollador') and e.estado='Borrador' and not e.eliminando and e.soporte_nombre is not null; end if;
 return rol in('superadministrador','desarrollador') or (rol='orientador' and e.creado_por=auth.uid());
exception when invalid_text_representation then return false;
end $function$
;

CREATE OR REPLACE FUNCTION orientacion_privado.observacion_operar(p_accion text, p_datos jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare rol text:=orientacion_privado.rol_actual(); actor public.perfiles%rowtype; e public.estudiantes%rowtype;
 r public.observaciones_docentes%rowtype; sid uuid; anio int; per int; pagina int; cantidad int; total int; filas jsonb; materias text[]; estrategias text[];
 catalogo_m text[]:=ARRAY['Matemáticas','Geoestadística','Lenguaje / Lectoescritura','Inglés','Francés','Artes/Dibujo Técnico','Ética','Ciencias Naturales / Biología / Pre-Química / Química','Ciencias Sociales','Geografía','Historia','Pre-Física / Física','Ed. Física','Estadística','Filosofía','Constitución','Competencias Ciudadanas','Economía Política','Ed Financiera','Tecnología e Informática']::text[]; catalogo_a text[]:=ARRAY['Ubicación estratégica (Sentarlo adelante, lejos de distractores o ventanas)','Segmentación de instrucciones (Dividir tareas largas en pasos cortos)','Flexibilidad de tiempo (Dar tiempo extra para exámenes o entregas)','Liderazgo positivo (Asignar roles/responsabilidades en el aula para regular conducta)','Evaluación diferenciada (Apoyos visuales, reducir preguntas o priorizar sustentación oral)']::text[];
begin
 if auth.uid() is null or coalesce(rol,'') not in ('docente','orientador','superadministrador','desarrollador') then raise exception 'Tu cuenta no tiene acceso a observación docente'; end if;
 select * into actor from public.perfiles where auth_user_id=auth.uid();
 if p_accion='habilitar' then
  if rol='docente' then raise exception 'Solo orientación y administración pueden habilitar formatos'; end if;
  sid=(p_datos->>'estudiante_id')::uuid; anio=(p_datos->>'anio')::int; per=(p_datos->>'periodo')::int;
  if anio is null or anio not between 2000 and 2100 or per is null or per not between 1 and 3 then raise exception 'Selecciona año y período 1, 2 o 3'; end if;
  select * into e from public.estudiantes where id=sid for update;
  if not found or e.eliminando or e.archivado or e.estado<>'activo' then raise exception 'El estudiante debe estar activo y disponible'; end if;
  if not exists(select 1 from public.matriculas where estudiante_id=sid and anio_lectivo=anio) then raise exception 'El estudiante no tiene matrícula para ese año'; end if;
  insert into public.observaciones_docentes(estudiante_id,estudiante_nombre,docente_perfil_id,docente_nombre,anio_lectivo,periodo,curso,solicitado_por,solicitado_nombre)
  select sid,e.nombre,d.id,d.nombre,anio,per,g.grado||case when g.seccion<>'' then ' · '||g.seccion else '' end,auth.uid(),actor.nombre
  from public.matriculas m join public.grupos g on g.id=m.grupo_id join public.docentes_cursos dc on dc.grupo_id=g.id and dc.activo
  join public.perfiles d on d.id=dc.docente_perfil_id and d.rol='docente' and d.activo and d.auth_user_id is not null
  where m.estudiante_id=sid and m.anio_lectivo=anio
  on conflict(estudiante_id,docente_perfil_id,anio_lectivo,periodo) do nothing;
  get diagnostics cantidad=row_count;
  select count(*) into total from public.observaciones_docentes where estudiante_id=sid and anio_lectivo=anio and periodo=per;
  if total=0 then raise exception 'No hay docentes activos asignados al curso. Revisa Cursos y docentes'; end if;
  return jsonb_build_object('creados',cantidad,'total',total);
 elsif p_accion='enviar' then
  if rol not in ('docente','desarrollador') then raise exception 'El formato solo lo puede enviar el docente asignado o el desarrollador'; end if;
  -- Same locking order as full student deletion: student, then request.
  select estudiante_id into sid from public.observaciones_docentes where id=(p_datos->>'id')::uuid and (docente_perfil_id=actor.id or rol='desarrollador');
  if sid is null then raise exception 'No tienes este formato asignado'; end if;
  select * into e from public.estudiantes where id=sid for update;
  if not found or e.eliminando or e.archivado or e.estado<>'activo' then raise exception 'El estudiante ya no está disponible para diligenciar'; end if;
  select * into r from public.observaciones_docentes where id=(p_datos->>'id')::uuid and (docente_perfil_id=actor.id or rol='desarrollador') for update;
  if not found then raise exception 'El formato ya no está disponible'; end if;
  if r.enviado_en is not null then return jsonb_build_object('enviado',true,'ya_enviado',true); end if;
  if rol<>'desarrollador' and not exists(select 1 from public.matriculas m join public.docentes_cursos dc on dc.grupo_id=m.grupo_id and dc.activo where m.estudiante_id=sid and m.anio_lectivo=r.anio_lectivo and dc.docente_perfil_id=actor.id) then raise exception 'Ya no estás asignado al curso del estudiante'; end if;
  if jsonb_typeof(p_datos->'asignaturas') is distinct from 'array' or jsonb_typeof(p_datos->'ajustes') is distinct from 'array' then raise exception 'Selecciona las asignaturas y los ajustes'; end if;
  select array_agg(distinct x) into materias from jsonb_array_elements_text(p_datos->'asignaturas') x;
  select coalesce(array_agg(distinct x),'{}'::text[]) into estrategias from jsonb_array_elements_text(p_datos->'ajustes') x;
  if coalesce(cardinality(materias),0)=0 or not materias <@ catalogo_m or not estrategias <@ catalogo_a then raise exception 'La selección contiene opciones no válidas'; end if;
  if cardinality(estrategias)=0 and coalesce(length(btrim(p_datos->>'adicionales')),0)=0 then raise exception 'Selecciona un ajuste o describe Otro'; end if;
  if coalesce(length(btrim(p_datos->>'convivencial')),0) not between 1 and 10000 or coalesce(length(btrim(p_datos->>'academico')),0) not between 1 and 10000 or coalesce(length(btrim(p_datos->>'resultado')),0) not between 1 and 500 or coalesce(length(p_datos->>'adicionales'),0)>5000 then raise exception 'Completa los desempeños y una observación corta (máximo 500 caracteres)'; end if;
  update public.observaciones_docentes set asignaturas=materias,ajustes=estrategias,adicionales=nullif(btrim(p_datos->>'adicionales'),''),desempeno_convivencial=btrim(p_datos->>'convivencial'),desempeno_academico=btrim(p_datos->>'academico'),resultado=btrim(p_datos->>'resultado'),enviado_por=auth.uid(),enviado_nombre=actor.nombre,enviado_en=now() where id=r.id;
  return jsonb_build_object('enviado',true);
 elsif p_accion='listar' then
  pagina=greatest(1,least(coalesce((p_datos->>'pagina')::int,1),100000));
  select count(*) into total from public.observaciones_docentes o where
   (rol<>'docente' or o.docente_perfil_id=actor.id)
   and (nullif(p_datos->>'estudiante_id','') is null or o.estudiante_id=(p_datos->>'estudiante_id')::uuid)
   and (nullif(p_datos->>'anio','') is null or o.anio_lectivo=(p_datos->>'anio')::int)
   and (nullif(p_datos->>'periodo','') is null or o.periodo=(p_datos->>'periodo')::int)
   and (coalesce(p_datos->>'estado','')='' or (p_datos->>'estado'='enviados')=(o.enviado_en is not null))
   and (coalesce(p_datos->>'busqueda','')='' or o.estudiante_nombre ilike '%'||left(p_datos->>'busqueda',180)||'%' or o.docente_nombre ilike '%'||left(p_datos->>'busqueda',180)||'%');
  select coalesce(jsonb_agg(to_jsonb(t) order by t.solicitado_en desc,t.id),'[]'::jsonb) into filas from (
   select o.*, exists(select 1 from public.estudiantes alumno join public.matriculas m on m.estudiante_id=alumno.id join public.docentes_cursos dc on dc.grupo_id=m.grupo_id and dc.activo join public.perfiles d on d.id=dc.docente_perfil_id and d.activo and d.rol='docente' and d.auth_user_id is not null where alumno.id=o.estudiante_id and not alumno.eliminando and not alumno.archivado and alumno.estado='activo' and m.anio_lectivo=o.anio_lectivo and dc.docente_perfil_id=o.docente_perfil_id) as disponible
   from public.observaciones_docentes o where (rol<>'docente' or o.docente_perfil_id=actor.id)
   and (nullif(p_datos->>'estudiante_id','') is null or o.estudiante_id=(p_datos->>'estudiante_id')::uuid)
   and (nullif(p_datos->>'anio','') is null or o.anio_lectivo=(p_datos->>'anio')::int)
   and (nullif(p_datos->>'periodo','') is null or o.periodo=(p_datos->>'periodo')::int)
   and (coalesce(p_datos->>'estado','')='' or (p_datos->>'estado'='enviados')=(o.enviado_en is not null))
   and (coalesce(p_datos->>'busqueda','')='' or o.estudiante_nombre ilike '%'||left(p_datos->>'busqueda',180)||'%' or o.docente_nombre ilike '%'||left(p_datos->>'busqueda',180)||'%')
   order by o.solicitado_en desc,o.id limit 25 offset (pagina-1)*25
  ) t;
  return jsonb_build_object('filas',filas,'total',total);
 end if;
 raise exception 'Acción no permitida';
end $function$
;
