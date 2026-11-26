CREATE OR REPLACE FUNCTION orientacion_privado.pap_flujo(p_accion text, p_id uuid DEFAULT NULL::uuid, p_datos jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor public.perfiles%rowtype; r public.pap_atenciones%rowtype; e public.estudiantes%rowtype; sid uuid; busqueda text; fecha_atencion timestamptz; proxima date;
begin
 if auth.uid() is null or coalesce(orientacion_privado.rol_actual(),'') not in ('orientador','superadministrador','desarrollador') then raise exception using errcode='42501',message='No tienes acceso a PAP';end if;
 if p_datos is null or jsonb_typeof(p_datos)<>'object' or length(p_datos::text)>30000 then raise exception 'Datos inválidos';end if;
 select * into actor from public.perfiles where auth_user_id=auth.uid();
 if p_accion='buscar_estudiantes' then
  if orientacion_privado.rol_actual()<>'orientador' then raise exception using errcode='42501',message='Solo orientación puede diligenciar PAP';end if;
  busqueda:=lower(btrim(coalesce(p_datos->>'busqueda','')));if length(busqueda)<2 then return '[]'::jsonb;end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from(select al.id,al.nombre,al.numero_documento from public.estudiantes al where not al.eliminando and not al.archivado and al.estado='activo' and strpos(lower(al.nombre||' '||coalesce(al.numero_documento,'')),busqueda)>0 order by al.nombre limit 20)x),'[]'::jsonb);
 elsif p_accion='listar' then
  busqueda:=lower(btrim(coalesce(p_datos->>'busqueda','')));
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.fecha desc,x.id) from(select p.id,p.persona,p.fecha,p.lugar,p.estado,p.seguimiento,p.orientador_id,p.orientador_nombre,p.version,p.estudiante_id from public.pap_atenciones p where (busqueda='' or strpos(lower(p.persona||' '||p.orientador_nombre),busqueda)>0) and (coalesce(p_datos->>'estado','')='' or p.estado=p_datos->>'estado') order by p.fecha desc,p.id limit 500)x),'[]'::jsonb);
 elsif p_accion='detalle' then
  select * into r from public.pap_atenciones where id=p_id;if not found then raise exception 'Atención no disponible';end if;
  return jsonb_build_object('atencion',to_jsonb(r),'historial',coalesce((select jsonb_agg(to_jsonb(x) order by x.fecha desc,x.id desc) from(select h.* from orientacion_privado.pap_historial h where h.registro_id=p_id order by h.fecha desc,h.id desc limit 100)x),'[]'::jsonb));
 elsif p_accion<>'guardar' then raise exception 'Acción no válida';end if;
 if orientacion_privado.rol_actual()<>'orientador' then raise exception using errcode='42501',message='Tu acceso a PAP es de consulta';end if;
 if p_id is null then raise exception 'Falta el identificador';end if;
 sid:=nullif(p_datos->>'estudiante_id','')::uuid;
 if sid is not null then select * into e from public.estudiantes where id=sid and not archivado and not eliminando and estado='activo' for update;if not found then raise exception 'Estudiante no disponible';end if;end if;
 select * into r from public.pap_atenciones where id=p_id for update;
 if r.id is not null then
  if r.orientador_id<>actor.id then raise exception using errcode='42501',message='Solo el orientador responsable puede modificar esta atención';end if;
  if (p_datos->>'version')::int is distinct from r.version then raise exception 'La atención cambió. Actualiza antes de editar';end if;
  if r.estado='cerrada' then raise exception 'La atención está cerrada. Registra una nueva atención para continuar';end if;
 end if;
 fecha_atencion:=(p_datos->>'fecha')::timestamptz;proxima:=nullif(p_datos->>'seguimiento','')::date;
 if fecha_atencion is null or not isfinite(fecha_atencion) or fecha_atencion<'2000-01-01' or fecha_atencion>now()+interval '5 minutes' then raise exception 'Registra una fecha de atención válida que no esté en el futuro';end if;
 if proxima is not null and (proxima<(fecha_atencion at time zone 'America/Bogota')::date or proxima>'2100-12-31') then raise exception 'La fecha de seguimiento no puede ser anterior a la atención';end if;
 if p_datos->>'estado'='cerrada' and length(btrim(coalesce(p_datos->>'acuerdos','')))<3 then raise exception 'Registra el cierre o acuerdos antes de cerrar';end if;
 if sid is not null and lower(btrim(p_datos->>'persona')) is distinct from lower(e.nombre) then raise exception 'La persona debe coincidir con el estudiante seleccionado';end if;
 if r.id is null then
  insert into public.pap_atenciones(id,estudiante_id,persona,fecha,lugar,motivo,situacion,acciones,apoyo,acuerdos,seguimiento,estado,orientador_id,orientador_nombre)
  values(p_id,sid,btrim(p_datos->>'persona'),fecha_atencion,btrim(coalesce(p_datos->>'lugar','')),btrim(p_datos->>'motivo'),btrim(coalesce(p_datos->>'situacion','')),btrim(p_datos->>'acciones'),btrim(coalesce(p_datos->>'apoyo','')),btrim(coalesce(p_datos->>'acuerdos','')),proxima,p_datos->>'estado',actor.id,actor.nombre) returning * into r;
 else
  update public.pap_atenciones set estudiante_id=sid,persona=btrim(p_datos->>'persona'),fecha=fecha_atencion,lugar=btrim(coalesce(p_datos->>'lugar','')),motivo=btrim(p_datos->>'motivo'),situacion=btrim(coalesce(p_datos->>'situacion','')),acciones=btrim(p_datos->>'acciones'),apoyo=btrim(coalesce(p_datos->>'apoyo','')),acuerdos=btrim(coalesce(p_datos->>'acuerdos','')),seguimiento=proxima,estado=p_datos->>'estado',version=version+1,actualizado_en=now() where id=p_id returning * into r;
 end if;
 return to_jsonb(r);
end $function$;
alter policy pap_solo_orientacion on public.pap_atenciones using((select orientacion_privado.rol_actual()) in ('orientador','superadministrador','desarrollador'));
alter policy pap_historial_solo_orientacion on orientacion_privado.pap_historial using((select orientacion_privado.rol_actual()) in ('orientador','superadministrador','desarrollador'));

