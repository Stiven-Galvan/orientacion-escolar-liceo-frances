create or replace function orientacion_privado.mis_estudiantes_cursos(p_anio integer,p_grupo uuid,p_busqueda text,p_pagina integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare docente uuid;
begin
 if auth.uid() is null or coalesce(orientacion_privado.rol_actual(),'')<>'docente' then raise exception 'Esta consulta requiere una cuenta docente activa'; end if;
 if p_anio is not null and p_anio not between 2000 and 2100 then raise exception 'Selecciona un año válido'; end if;
 select id into docente from public.perfiles where auth_user_id=auth.uid() and rol='docente' and activo and not requiere_cambio_password;
 return (
 with cursos as(select g.id,g.anio_lectivo,g.grado,g.seccion from public.docentes_cursos d join public.grupos g on g.id=d.grupo_id where d.docente_perfil_id=docente and d.activo and (p_anio is null or g.anio_lectivo=p_anio)),
 base as(
 select e.id,e.nombre,m.anio_lectivo,g.id as grupo_id,g.grado,g.seccion,o.pendientes,o.enviados
 from public.matriculas m join cursos g on g.id=m.grupo_id join public.estudiantes e on e.id=m.estudiante_id
 cross join lateral (
 select count(*) filter(where enviado_en is null) as pendientes,count(*) filter(where enviado_en is not null and enviado_por=auth.uid()) as enviados
 from public.observaciones_docentes where estudiante_id=e.id and anio_lectivo=m.anio_lectivo and docente_perfil_id=docente
 ) o
 where not e.archivado and not e.eliminando and e.estado='activo' and o.pendientes+o.enviados>0
 and (p_grupo is null or g.id=p_grupo)
 and (coalesce(btrim(p_busqueda),'')='' or position(lower(btrim(p_busqueda)) in lower(e.nombre))>0)
 ), pagina as(select * from base order by nombre,anio_lectivo desc,id limit 25 offset (least(greatest(coalesce(p_pagina,1),1),100000)-1)*25)
 select jsonb_build_object('grupos',coalesce((select jsonb_agg(to_jsonb(g) order by g.grado,g.seccion) from cursos g),'[]'::jsonb),'estudiantes',coalesce((select jsonb_agg(to_jsonb(e) order by e.nombre,e.anio_lectivo desc,e.id) from pagina e),'[]'::jsonb),'total',(select count(*) from base))
 );
end $$;
alter policy observaciones_lectura on public.observaciones_docentes using (
 (select orientacion_privado.rol_actual()) in ('orientador','superadministrador','desarrollador')
 or ((select orientacion_privado.rol_actual())='docente'
 and docente_perfil_id=(select id from public.perfiles where auth_user_id=(select auth.uid()))
 and (enviado_en is null or enviado_por=(select auth.uid())))
);
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
   (rol<>'docente' or (o.docente_perfil_id=actor.id and (o.enviado_en is null or o.enviado_por=auth.uid())))
   and (nullif(p_datos->>'estudiante_id','') is null or o.estudiante_id=(p_datos->>'estudiante_id')::uuid)
   and (nullif(p_datos->>'anio','') is null or o.anio_lectivo=(p_datos->>'anio')::int)
   and (nullif(p_datos->>'periodo','') is null or o.periodo=(p_datos->>'periodo')::int)
   and (coalesce(p_datos->>'estado','')='' or (p_datos->>'estado'='enviados')=(o.enviado_en is not null))
   and (coalesce(p_datos->>'busqueda','')='' or o.estudiante_nombre ilike '%'||left(p_datos->>'busqueda',180)||'%' or o.docente_nombre ilike '%'||left(p_datos->>'busqueda',180)||'%');
  select coalesce(jsonb_agg(to_jsonb(t) order by t.solicitado_en desc,t.id),'[]'::jsonb) into filas from (
   select o.*, exists(select 1 from public.estudiantes alumno join public.matriculas m on m.estudiante_id=alumno.id join public.docentes_cursos dc on dc.grupo_id=m.grupo_id and dc.activo join public.perfiles d on d.id=dc.docente_perfil_id and d.activo and d.rol='docente' and d.auth_user_id is not null where alumno.id=o.estudiante_id and not alumno.eliminando and not alumno.archivado and alumno.estado='activo' and m.anio_lectivo=o.anio_lectivo and dc.docente_perfil_id=o.docente_perfil_id) as disponible
   from public.observaciones_docentes o where (rol<>'docente' or (o.docente_perfil_id=actor.id and (o.enviado_en is null or o.enviado_por=auth.uid())))
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
