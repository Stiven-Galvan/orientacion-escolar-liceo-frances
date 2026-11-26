CREATE OR REPLACE FUNCTION orientacion_privado.piar_flujo(p_accion text, p_id uuid DEFAULT NULL::uuid, p_datos jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare rol text:=orientacion_privado.rol_actual();actor public.perfiles%rowtype;p public.procesos_piar%rowtype;e public.estudiantes%rowtype;sid uuid;doc uuid;per int;k text;mat text;materias text[];fallas text[]:='{}';estado jsonb;r jsonb;ap public.piar_aportes%rowtype;v int;es_manager boolean;ultima bigint;
begin
 if auth.uid() is null or coalesce(rol,'') not in ('docente','orientador','superadministrador','desarrollador') then raise exception 'No tienes acceso a PIAR';end if;
 if length(p_datos::text)>3000000 then raise exception 'El contenido es demasiado extenso';end if;
 select * into actor from public.perfiles where auth_user_id=auth.uid();es_manager=rol<>'docente';
 if p_accion='novedades' then
 if not es_manager then raise exception 'Las novedades de orientación son privadas';end if;
 select coalesce(ultimo_id,0) into ultima from orientacion_privado.piar_lecturas where auth_user_id=auth.uid();ultima=coalesce(ultima,0);
 return jsonb_build_object('total',(select count(*) from public.piar_eventos where id>ultima),'eventos',coalesce((select jsonb_agg(to_jsonb(t) order by t.id desc) from(select ev.*,al.nombre as estudiante_nombre from public.piar_eventos ev join public.procesos_piar pr on pr.id=ev.proceso_id join public.estudiantes al on al.id=pr.estudiante_id where ev.id>ultima order by ev.id desc limit 10)t),'[]'::jsonb));
 elsif p_accion='leer_novedades' then
 if not es_manager then raise exception 'Acceso restringido';end if;
 insert into orientacion_privado.piar_lecturas(auth_user_id,ultimo_id) values(auth.uid(),coalesce((p_datos->>'ultimo_id')::bigint,0)) on conflict(auth_user_id) do update set ultimo_id=greatest(orientacion_privado.piar_lecturas.ultimo_id,excluded.ultimo_id);return '{}'::jsonb;
 elsif p_accion='mis_procesos' then
 return coalesce((select jsonb_agg(to_jsonb(t) order by t.estudiante_nombre,t.anio_lectivo desc) from(
 select pr.id,pr.estudiante_id,al.nombre as estudiante_nombre,pr.anio_lectivo,pr.periodo_activo,
 exists(select 1 from public.piar_convocados c where c.proceso_id=pr.id and c.periodo=pr.periodo_activo and c.docente_id=actor.id and c.activo and not exists(select 1 from public.piar_aportes a where a.proceso_id=pr.id and a.periodo=pr.periodo_activo and a.docente_perfil_id=actor.id)) as pendiente
 from public.procesos_piar pr join public.estudiantes al on al.id=pr.estudiante_id where not al.eliminando and not al.archivado and al.estado='activo' and (es_manager or exists(select 1 from public.piar_convocados c where c.proceso_id=pr.id and c.docente_id=actor.id and c.activo and exists(select 1 from public.matriculas m join public.docentes_cursos dc on dc.grupo_id=m.grupo_id and dc.activo where m.estudiante_id=pr.estudiante_id and m.anio_lectivo=pr.anio_lectivo and dc.docente_perfil_id=actor.id)))
 )t),'[]'::jsonb);
 end if;
 select estudiante_id into sid from public.procesos_piar where id=p_id;
 select * into e from public.estudiantes where id=sid for update;
 select * into p from public.procesos_piar where id=p_id for update;
 if not found or e.eliminando then raise exception 'El proceso no está disponible';end if;
 if not es_manager and not exists(select 1 from public.piar_convocados where proceso_id=p_id and docente_id=actor.id and activo) then raise exception 'No tienes este PIAR asignado';end if;
 if p_accion='version' then return jsonb_build_object('version',p.version);end if;
 if p_accion='detalle' then
 if not es_manager then
 return jsonb_build_object('id',p.id,'estudiante_id',e.id,'estudiante_nombre',e.nombre,'anio_lectivo',p.anio_lectivo,'periodo_activo',p.periodo_activo,'version',p.version,'materias',p.materias,'convocados',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('enviado',exists(select 1 from public.piar_aportes a where a.proceso_id=p_id and a.periodo=c.periodo and a.docente_perfil_id=c.docente_id))) from public.piar_convocados c where c.proceso_id=p_id and c.docente_id=actor.id),'[]'::jsonb),'aportes',coalesce((select jsonb_agg(to_jsonb(a) order by a.periodo) from public.piar_aportes a where a.proceso_id=p_id and a.enviado_por=auth.uid()),'[]'::jsonb));
 end if;
 estado=orientacion_privado.piar_estado(p_id);
 return to_jsonb(p)||estado||jsonb_build_object('estudiante_nombre',e.nombre,'estudiante',jsonb_build_object('nombre',e.nombre,'tipo_documento',e.tipo_documento,'documento',e.numero_documento,'nacimiento',e.fecha_nacimiento,'acudiente',e.acudiente_nombre),'convocados',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('enviado',exists(select 1 from public.piar_aportes a where a.proceso_id=p_id and a.periodo=c.periodo and a.docente_perfil_id=c.docente_id)) order by c.periodo,c.nombre) from public.piar_convocados c where c.proceso_id=p_id),'[]'::jsonb),'aportes',coalesce((select jsonb_agg(to_jsonb(a) order by a.periodo,a.docente_nombre) from public.piar_aportes a where a.proceso_id=p_id),'[]'::jsonb),'eventos',coalesce((select jsonb_agg(to_jsonb(ev) order by ev.id desc) from(select * from public.piar_eventos where proceso_id=p_id order by id desc limit 50)ev),'[]'::jsonb));
 elsif p_accion='enviar_docente' then
 if rol not in ('docente','desarrollador') then raise exception 'Solo el docente asignado o el desarrollador pueden enviar este aporte';end if;
 per=(p_datos->>'periodo')::int;doc=case when rol='desarrollador' then coalesce((p_datos->>'docente_id')::uuid,actor.id) else actor.id end;
 if per is distinct from p.periodo_activo then raise exception 'Este período está cerrado. Espera a que orientación abra el siguiente';end if;
 if not exists(select 1 from public.piar_convocados where proceso_id=p_id and periodo=per and docente_id=doc and activo) then raise exception 'No estás convocado en este período';end if;
 if rol='docente' and not exists(select 1 from public.matriculas m join public.docentes_cursos dc on dc.grupo_id=m.grupo_id and dc.activo where m.estudiante_id=e.id and m.anio_lectivo=p.anio_lectivo and dc.docente_perfil_id=actor.id) then raise exception 'Ya no das clase a este estudiante';end if;
 select * into ap from public.piar_aportes where proceso_id=p_id and periodo=per and docente_perfil_id=doc;
 if found then return jsonb_build_object('enviado',true,'ya_enviado',true);end if;
 if jsonb_typeof(p_datos->'asignaturas') is distinct from 'array' then raise exception 'Selecciona tus asignaturas';end if;
 select array_agg(distinct x) into materias from jsonb_array_elements_text(p_datos->'asignaturas') x;
 if coalesce(cardinality(materias),0)=0 or not materias <@ p.materias then raise exception 'Selecciona únicamente las materias habilitadas de este PIAR';end if;
 if not orientacion_privado.piar_firma_valida(p_datos->'firma') then raise exception 'Completa tu nombre, documento, aceptación y firma';end if;
 foreach mat in array materias loop foreach k in array array['objetivos','barreras','ajustes','evaluacion'] loop if coalesce(length(btrim(p_datos->'datos'->mat->>k)),0) not between 1 and 4000 then raise exception 'Completa objetivos, barreras, ajustes y evaluación para %',mat;end if;end loop;end loop;
 insert into public.piar_aportes(proceso_id,docente_perfil_id,docente_nombre,periodo,asignaturas,datos,firma,enviado_por,enviado_nombre)
 values(p_id,doc,(select nombre from public.piar_convocados where proceso_id=p_id and periodo=per and docente_id=doc),per,materias,(select jsonb_object_agg(x,p_datos->'datos'->x) from unnest(materias)x),p_datos->'firma',auth.uid(),actor.nombre);
 update public.procesos_piar set version=version+1 where id=p_id;
 insert into public.piar_eventos(proceso_id,texto,actor_nombre) values(p_id,'Aporte enviado: período '||per||' · '||array_to_string(materias,', '),actor.nombre);
 return jsonb_build_object('enviado',true);
 end if;
 if not es_manager then raise exception 'Esta acción solo corresponde a orientación y administración';end if;
 if p_accion in ('guardar_orientacion','enviar_orientacion') then
 if (p_datos->>'version')::int is distinct from p.version_orientacion then raise exception 'El PIAR cambió. Actualiza antes de guardar para no sobrescribir otros cambios';end if;
 if jsonb_typeof(p_datos->'campos') is distinct from 'object' or jsonb_typeof(p_datos->'firmas') is distinct from 'object' or jsonb_typeof(p_datos->'materias') is distinct from 'array' then raise exception 'Revisa los campos del PIAR';end if;
 select array_agg(distinct x) into materias from jsonb_array_elements_text(p_datos->'materias') x;
 if coalesce(cardinality(materias),0)=0 or not materias <@ ARRAY['Matemáticas','Geometría','Estadística','Ciencias naturales','Física','Química','Biología','Competencias comunicativas','Inglés','Francés','Historia','Geografía','Constitución','Competencias ciudadanas','Economía Política','Filosofía','Artes / Dibujo técnico','Ética y religión','Ed. Física','Ed. Financiera','Tecnología']::text[] then raise exception 'Selecciona las asignaturas que aplican al estudiante';end if;
 foreach k in array ARRAY['fecha_lugar','persona_diligencia','rol_diligencia','nombres','apellidos','lugar_nacimiento','edad','nacimiento','tipo_documento','documento','departamento','municipio','direccion','barrio','telefono','correo','centro_proteccion','grado','etnia','victima','afiliacion','eps','regimen','emergencia','atencion_salud','frecuencia_salud','diagnostico','diagnostico_detalle','terapias','terapia_1','frecuencia_terapia_1','tratamiento','tratamiento_detalle','medicamentos','apoyos','madre','padre','ocupacion_madre','ocupacion_padre','educacion_madre','educacion_padre','cuidador','parentesco','educacion_cuidador','telefono_cuidador','correo_cuidador','hermanos','lugar_hermanos','apoyo_crianza','convivientes','proteccion','subsidio','institucion_anterior','ultimo_grado','aprobo','cambio_institucion','informe_previo','origen_informe','programas','programas_detalle','institucion','sede','transporte','distancia','jornada','gustos','habilidades','compromisos_familia','mejoramiento_1_1','mejoramiento_1_2','mejoramiento_2_1','mejoramiento_2_2','mejoramiento_3_1','mejoramiento_3_2','mejoramiento_4_1','mejoramiento_4_2','mejoramiento_5_1','mejoramiento_5_2','actividad_1_0','actividad_1_1','actividad_1_2','otros_1_28_3','otros_1_28_4','otros_1_28_5','otros_1_30_3','otros_1_30_4','otros_1_30_5','otros_1_33_3','otros_1_33_4','otros_1_33_5','otros_1_34_3','otros_1_34_4','otros_1_34_5','otros_1_35_3','otros_1_35_4','otros_1_35_5','otros_2_28_3','otros_2_28_4','otros_2_28_5','otros_2_30_3','otros_2_30_4','otros_2_30_5','otros_2_33_3','otros_2_33_4','otros_2_33_5','otros_2_34_3','otros_2_34_4','otros_2_34_5','otros_2_35_3','otros_2_35_4','otros_2_35_5','otros_3_28_3','otros_3_28_4','otros_3_28_5','otros_3_30_3','otros_3_30_4','otros_3_30_5','otros_3_33_3','otros_3_33_4','otros_3_33_5','otros_3_34_3','otros_3_34_4','otros_3_34_5','otros_3_35_3','otros_3_35_4','otros_3_35_5']::text[] loop if length(coalesce(p_datos->'campos'->>k,''))>4000 then raise exception 'El campo % supera los 4000 caracteres',k;end if;
 if p_accion='enviar_orientacion' and k !~ '^otros_[23]_' and coalesce(length(btrim(p_datos->'campos'->>k)),0)=0 then fallas=array_append(fallas,k);end if;
 if p_accion='enviar_orientacion' and (k like 'otros_2_%' and p.periodo_activo>=2 or k like 'otros_3_%' and p.periodo_activo=3) and coalesce(length(btrim(p_datos->'campos'->>k)),0)=0 then fallas=array_append(fallas,k);end if;
 end loop;
 if p_accion='enviar_orientacion' then
 foreach k in array array['orientacion','estudiante','acudiente','directivo'] loop if not orientacion_privado.piar_firma_valida(p_datos->'firmas'->k) then fallas=array_append(fallas,'Firma: '||k);end if;end loop;
 if cardinality(fallas)>0 then raise exception 'Faltan campos o firmas: %',array_to_string(fallas,', ');end if;
 end if;
 update public.procesos_piar set campos=p_datos->'campos',firmas=p_datos->'firmas',materias=materias,orientacion_enviado=p_accion='enviar_orientacion',publicada=case when p_accion='enviar_orientacion' then jsonb_build_object('campos',p_datos->'campos','firmas',p_datos->'firmas','materias',materias) else publicada end,version=version+1,version_orientacion=version_orientacion+1 where id=p_id;
 insert into public.piar_eventos(proceso_id,texto,actor_nombre) values(p_id,case when p_accion='enviar_orientacion' then 'Orientación envió su información. Vista previa disponible.' else 'Orientación guardó cambios en borrador.' end,actor.nombre);
 return jsonb_build_object('guardado',true);
 elsif p_accion='abrir_periodo' then
 per=(p_datos->>'periodo')::int;
 if per is distinct from p.periodo_activo+1 or per>3 then raise exception 'Abre los períodos en orden: 1, 2 y 3';end if;
 if not exists(select 1 from public.piar_convocados where proceso_id=p_id and periodo=p.periodo_activo and activo) or exists(select 1 from public.piar_convocados c where c.proceso_id=p_id and c.periodo=p.periodo_activo and c.activo and not exists(select 1 from public.piar_aportes a where a.proceso_id=p_id and a.periodo=c.periodo and a.docente_perfil_id=c.docente_id)) then raise exception 'Hay docentes pendientes en el período actual';end if;
 foreach mat in array p.materias loop if not exists(select 1 from public.piar_aportes a where a.proceso_id=p_id and a.periodo=p.periodo_activo and mat=any(a.asignaturas)) then raise exception 'Falta diligenciar la materia % en el período actual',mat;end if;end loop;
 perform orientacion_privado.piar_convocar(p_id,per);
 if not exists(select 1 from public.piar_convocados where proceso_id=p_id and periodo=per and activo) then raise exception 'Asigna docentes al curso antes de abrir el período';end if;
 update public.procesos_piar set periodo_activo=per,version=version+1 where id=p_id;
 insert into public.piar_eventos(proceso_id,texto,actor_nombre) values(p_id,'Se abrió el período '||per,actor.nombre);return '{}'::jsonb;
 elsif p_accion='sincronizar_docentes' then
 perform orientacion_privado.piar_convocar(p_id,p.periodo_activo);update public.procesos_piar set version=version+1 where id=p_id;insert into public.piar_eventos(proceso_id,texto,actor_nombre) values(p_id,'Se actualizaron los docentes convocados.',actor.nombre);return '{}'::jsonb;
 elsif p_accion='convocado' then
 doc=(p_datos->>'docente_id')::uuid;per=p.periodo_activo;
 if exists(select 1 from public.piar_aportes where proceso_id=p_id and periodo=per and docente_perfil_id=doc) then raise exception 'Un aporte enviado se conserva';end if;
 update public.piar_convocados set activo=(p_datos->>'activo')::boolean where proceso_id=p_id and periodo=per and docente_id=doc;
 update public.procesos_piar set version=version+1 where id=p_id;
 insert into public.piar_eventos(proceso_id,texto,actor_nombre) values(p_id,'Se actualizó la convocatoria docente del período '||per,actor.nombre);return '{}'::jsonb;
 elsif p_accion in ('vista_previa','documento') then
 if p.publicada is null then raise exception 'Orientación debe enviar sus anexos para habilitar la vista previa';end if;
 estado=orientacion_privado.piar_estado(p_id);
 if p_accion='documento' and not (estado->>'completo')::boolean then raise exception 'El archivo todavía no está completamente diligenciado';end if;
 return jsonb_build_object('proceso',to_jsonb(p)-'campos'-'firmas'-'publicada','estudiante',jsonb_build_object('nombre',e.nombre,'documento',e.numero_documento),'campos',p.publicada->'campos','firmas',p.publicada->'firmas','materias',p.publicada->'materias','completo',(estado->>'completo')::boolean,'aportes',coalesce((select jsonb_agg(to_jsonb(a) order by a.periodo,a.docente_nombre) from public.piar_aportes a where a.proceso_id=p_id),'[]'::jsonb));
 end if;
 raise exception 'Acción no permitida';
end$function$
;
create policy piar_lecturas_propias on orientacion_privado.piar_lecturas for select to authenticated using(auth_user_id=(select auth.uid()) and (select orientacion_privado.rol_actual()) in ('orientador','superadministrador','desarrollador'));

