-- Referencia de la actualización aplicada. No ejecutar otra vez en el proyecto conectado.
create table public.agenda_citas (
 id uuid primary key default gen_random_uuid(),
 titulo text not null check(length(btrim(titulo)) between 3 and 120),
 tipo text not null check(tipo in ('individual','familiar','docente','aula','reunion','otro')),
 modalidad text not null check(modalidad in ('presencial','virtual')),
 inicio timestamptz not null, fin timestamptz not null,
 responsable_id uuid not null, responsable_nombre text not null,
 estudiante_id uuid references public.estudiantes(id) on delete cascade,
 estudiante_nombre text,
 lugar text not null default '' check(length(lugar)<=200),
 participantes text not null default '' check(length(participantes)<=500),
 descripcion text not null default '' check(length(descripcion)<=2000),
 estado text not null default 'programada' check(estado in ('programada','atendida','cancelada','no_asistio')),
 resultado text not null default '' check(length(resultado)<=2000),
 creado_por uuid not null, creado_nombre text not null,
 creado_en timestamptz not null default now(), actualizado_en timestamptz not null default now(),
 version int not null default 1,
 check(fin>inicio and fin<=inicio+interval '24 hours')
);
create index agenda_responsable_inicio on public.agenda_citas(responsable_id,inicio);
create index agenda_inicio on public.agenda_citas(inicio);
create index agenda_estudiante on public.agenda_citas(estudiante_id) where estudiante_id is not null;
alter table public.agenda_citas enable row level security;
revoke all on public.agenda_citas from public,anon,authenticated;
grant select on public.agenda_citas to authenticated;
create policy agenda_consulta on public.agenda_citas for select to authenticated using(
 (select orientacion_privado.rol_actual()) in ('superadministrador','desarrollador') or
 ((select orientacion_privado.rol_actual())='orientador' and responsable_id=(select id from public.perfiles where auth_user_id=(select auth.uid())))
);
create trigger agenda_auditoria after insert or update or delete on public.agenda_citas for each row execute function orientacion_privado.auditar_cambio();
create index historial_agenda_registro on public.historial(registro_id,fecha desc) where tabla='agenda_citas';

create or replace function orientacion_privado.agenda_flujo(p_accion text,p_id uuid default null,p_datos jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare
 rol_actor text:=orientacion_privado.rol_actual(); actor public.perfiles%rowtype;
 cita public.agenda_citas%rowtype; anterior public.agenda_citas%rowtype;
 responsable public.perfiles%rowtype; alumno public.estudiantes%rowtype;
 desde timestamptz; hasta timestamptz; resp uuid; sid uuid; termino text; estado_filtro text;
 es_admin boolean; filas jsonb; total int; clave text; resumen text;
begin
 if auth.uid() is null or coalesce(rol_actor,'') not in ('orientador','superadministrador','desarrollador') then
  raise exception using errcode='42501',message='Tu perfil no tiene acceso a la agenda';
 end if;
 if p_datos is null or jsonb_typeof(p_datos)<>'object' or length(p_datos::text)>16000 then raise exception 'Datos de agenda inválidos';end if;
 select * into actor from public.perfiles where auth_user_id=auth.uid();
 es_admin=rol_actor in ('superadministrador','desarrollador');
 if p_accion='crear' and p_id is not null then raise exception 'Una cita nueva no debe incluir un identificador previo';end if;
 if p_accion='opciones' then
  return jsonb_build_object('responsables',coalesce((select jsonb_agg(jsonb_build_object('id',id,'nombre',nombre) order by nombre) from public.perfiles where activo and not requiere_cambio_password and rol in ('orientador','superadministrador','desarrollador') and (es_admin or id=actor.id)),'[]'::jsonb));
 elsif p_accion='buscar_estudiantes' then
  termino:=btrim(coalesce(p_datos->>'busqueda',''));
  if length(termino)<2 then return '[]'::jsonb;end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from(select id,nombre,numero_documento from public.estudiantes where estado='activo' and not archivado and not eliminando and (strpos(lower(nombre),lower(termino))>0 or strpos(coalesce(numero_documento,''),termino)>0) order by nombre,id limit 20)x),'[]'::jsonb);
 elsif p_accion='listar' then
  desde:=(p_datos->>'desde')::timestamptz;hasta:=(p_datos->>'hasta')::timestamptz;
  if desde is null or hasta is null or hasta<=desde or hasta>desde+interval '62 days' then raise exception 'El rango de consulta debe ser de hasta 62 días';end if;
  resp:=nullif(p_datos->>'responsable_id','')::uuid; termino:=lower(btrim(coalesce(p_datos->>'busqueda',''))); estado_filtro:=coalesce(p_datos->>'estado','');
  select count(*) into total from public.agenda_citas c where c.inicio<hasta and c.fin>desde and (es_admin or c.responsable_id=actor.id) and (resp is null or c.responsable_id=resp) and (estado_filtro='' or c.estado=estado_filtro) and (termino='' or strpos(lower(c.titulo||' '||coalesce(c.estudiante_nombre,'')||' '||c.responsable_nombre),termino)>0);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.inicio,x.id),'[]'::jsonb) into filas from(select c.* from public.agenda_citas c where c.inicio<hasta and c.fin>desde and (es_admin or c.responsable_id=actor.id) and (resp is null or c.responsable_id=resp) and (estado_filtro='' or c.estado=estado_filtro) and (termino='' or strpos(lower(c.titulo||' '||coalesce(c.estudiante_nombre,'')||' '||c.responsable_nombre),termino)>0) order by c.inicio,c.id limit 2000)x;
  return jsonb_build_object('citas',filas,'total',total);
 elsif p_accion='crear' then
  resp:=coalesce(nullif(p_datos->>'responsable_id','')::uuid,actor.id);
 elsif p_accion in ('editar','estado','detalle') then
  select * into anterior from public.agenda_citas where id=p_id;
  if not found or (not es_admin and anterior.responsable_id<>actor.id) then raise exception using errcode='42501',message='La cita no está disponible para tu cuenta';end if;
  if p_accion='detalle' then
   return jsonb_build_object('cita',to_jsonb(anterior),'historial',coalesce((select jsonb_agg(to_jsonb(x) order by x.fecha desc,x.id desc) from(select h.id,h.accion,h.fecha,h.actor_nombre,h.anterior,h.nuevo from public.historial h where h.tabla='agenda_citas' and h.registro_id=p_id order by h.fecha desc,h.id desc limit 50)x),'[]'::jsonb));
  end if;
  resp:=case when p_accion='editar' then coalesce(nullif(p_datos->>'responsable_id','')::uuid,anterior.responsable_id) else anterior.responsable_id end;
 else raise exception 'Acción de agenda no válida';
 end if;
 if not es_admin and resp<>actor.id then raise exception using errcode='42501',message='Solo puedes gestionar tu propia agenda';end if;
 sid:=case when p_accion='estado' then anterior.estudiante_id else nullif(p_datos->>'estudiante_id','')::uuid end;
 -- Bloqueos ordenados para que dos sesiones no reserven simultáneamente el mismo responsable o estudiante.
 for clave in select distinct k from unnest(array['agenda:responsable:'||resp,'agenda:responsable:'||anterior.responsable_id,'agenda:estudiante:'||sid,'agenda:estudiante:'||anterior.estudiante_id]) k where k is not null order by k loop
  perform pg_advisory_xact_lock(hashtextextended(clave,0));
 end loop;
 if p_accion<>'crear' then
  select * into cita from public.agenda_citas where id=p_id for update;
  if not found or (not es_admin and cita.responsable_id<>actor.id) then raise exception using errcode='42501',message='La cita ya no está disponible';end if;
  if (p_datos->>'version')::int is distinct from cita.version then raise exception 'La cita cambió en otra sesión. Actualiza antes de continuar';end if;
  if cita.estado<>'programada' then raise exception 'La cita ya está cerrada y conserva su registro. Crea una nueva cita si necesitas otra atención';end if;
 end if;
 if p_accion='estado' then
  if coalesce(p_datos->>'estado','') not in ('atendida','cancelada','no_asistio') then raise exception 'Estado no válido';end if;
  resumen:=btrim(coalesce(p_datos->>'resultado',''));
  if length(resumen)>2000 or (p_datos->>'estado' in ('atendida','cancelada') and length(resumen)<3) then raise exception 'Escribe un resumen de atención o el motivo de cancelación (máximo 2000 caracteres)';end if;
  if p_datos->>'estado' in ('atendida','no_asistio') and cita.inicio>now() then raise exception 'No puedes cerrar como atendida o no asistió una cita que todavía no ha comenzado';end if;
  update public.agenda_citas set estado=p_datos->>'estado',resultado=resumen,version=version+1,actualizado_en=now() where id=p_id returning * into cita;
 else
  select * into responsable from public.perfiles where id=resp and activo and not requiere_cambio_password and rol in ('orientador','superadministrador','desarrollador');
  if not found then raise exception 'Selecciona un responsable activo con acceso a agenda';end if;
  if sid is not null then
   select * into alumno from public.estudiantes where id=sid and estado='activo' and not archivado and not eliminando for key share;
   if not found then raise exception 'El estudiante no está disponible';end if;
  end if;
  desde:=(p_datos->>'inicio')::timestamptz;hasta:=(p_datos->>'fin')::timestamptz;
  if desde is null or hasta is null or hasta<=desde or hasta>desde+interval '24 hours' then raise exception 'La hora final debe ser posterior al inicio y la cita no puede superar 24 horas';end if;
  if not isfinite(desde) or not isfinite(hasta) or desde<'2000-01-01'::timestamptz or hasta>='2101-01-01'::timestamptz then raise exception 'La fecha debe estar entre los años 2000 y 2100';end if;
  if exists(select 1 from public.agenda_citas c where c.estado='programada' and c.id is distinct from p_id and (c.responsable_id=resp or (sid is not null and c.estudiante_id=sid)) and c.inicio<hasta and c.fin>desde) then
   raise exception 'Ese horario se cruza con otra cita del responsable o del estudiante. Elige otro horario';
  end if;
  if p_accion='crear' then
   insert into public.agenda_citas(titulo,tipo,modalidad,inicio,fin,responsable_id,responsable_nombre,estudiante_id,estudiante_nombre,lugar,participantes,descripcion,creado_por,creado_nombre)
   values(btrim(p_datos->>'titulo'),p_datos->>'tipo',p_datos->>'modalidad',desde,hasta,resp,responsable.nombre,sid,alumno.nombre,btrim(coalesce(p_datos->>'lugar','')),btrim(coalesce(p_datos->>'participantes','')),btrim(coalesce(p_datos->>'descripcion','')),auth.uid(),actor.nombre) returning * into cita;
  else
   update public.agenda_citas set titulo=btrim(p_datos->>'titulo'),tipo=p_datos->>'tipo',modalidad=p_datos->>'modalidad',inicio=desde,fin=hasta,responsable_id=resp,responsable_nombre=responsable.nombre,estudiante_id=sid,estudiante_nombre=alumno.nombre,lugar=btrim(coalesce(p_datos->>'lugar','')),participantes=btrim(coalesce(p_datos->>'participantes','')),descripcion=btrim(coalesce(p_datos->>'descripcion','')),version=version+1,actualizado_en=now() where id=p_id returning * into cita;
  end if;
 end if;
 return to_jsonb(cita);
end $fn$;
revoke all on function orientacion_privado.agenda_flujo(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function orientacion_privado.agenda_flujo(text,uuid,jsonb) to authenticated;
create function public.agenda_flujo(p_accion text,p_id uuid default null,p_datos jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $fn$select orientacion_privado.agenda_flujo(p_accion,p_id,p_datos)$fn$;
revoke all on function public.agenda_flujo(text,uuid,jsonb) from public,anon;
grant execute on function public.agenda_flujo(text,uuid,jsonb) to authenticated;
