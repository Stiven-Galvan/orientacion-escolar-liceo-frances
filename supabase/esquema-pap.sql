create table public.pap_atenciones (
 id uuid primary key, estudiante_id uuid references public.estudiantes(id) on delete cascade,
 persona text not null check(length(btrim(persona)) between 2 and 180), fecha timestamptz not null,
 lugar text not null default '' check(length(lugar)<=200), motivo text not null check(length(btrim(motivo)) between 3 and 4000),
 situacion text not null default '' check(length(situacion)<=4000), acciones text not null check(length(btrim(acciones)) between 3 and 4000),
 apoyo text not null default '' check(length(apoyo)<=2000), acuerdos text not null default '' check(length(acuerdos)<=4000),
 seguimiento date, estado text not null check(estado in ('seguimiento','cerrada')),
 orientador_id uuid not null, orientador_nombre text not null, creado_en timestamptz not null default now(), actualizado_en timestamptz not null default now(), version int not null default 1
);
create index pap_fecha on public.pap_atenciones(fecha desc);
create index pap_estudiante on public.pap_atenciones(estudiante_id) where estudiante_id is not null;
create table orientacion_privado.pap_historial (
 id bigint generated always as identity primary key, registro_id uuid not null, accion text not null, actor_nombre text, fecha timestamptz not null default now(), anterior jsonb, nuevo jsonb
);
create index pap_historial_registro on orientacion_privado.pap_historial(registro_id,fecha desc);
alter table public.pap_atenciones enable row level security;
alter table orientacion_privado.pap_historial enable row level security;
revoke all on public.pap_atenciones,orientacion_privado.pap_historial from public,anon,authenticated;
grant select on public.pap_atenciones to authenticated;
create policy pap_solo_orientacion on public.pap_atenciones for select to authenticated using((select orientacion_privado.rol_actual())='orientador');
create policy pap_historial_solo_orientacion on orientacion_privado.pap_historial for select to authenticated using((select orientacion_privado.rol_actual())='orientador');
create function orientacion_privado.auditar_pap() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into orientacion_privado.pap_historial(registro_id,accion,actor_nombre,anterior,nuevo)
 values(case when TG_OP='DELETE' then OLD.id else NEW.id end,TG_OP,(select nombre from public.perfiles where auth_user_id=auth.uid()),case when TG_OP<>'INSERT' then to_jsonb(OLD) end,case when TG_OP<>'DELETE' then to_jsonb(NEW) end);
 if TG_OP='DELETE' then return OLD;end if;return NEW;
end $$;
revoke all on function orientacion_privado.auditar_pap() from public,anon,authenticated;
create trigger pap_auditoria after insert or update or delete on public.pap_atenciones for each row execute function orientacion_privado.auditar_pap();
create function orientacion_privado.pap_flujo(p_accion text,p_id uuid default null,p_datos jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.perfiles%rowtype; r public.pap_atenciones%rowtype; e public.estudiantes%rowtype; sid uuid; busqueda text; fecha_atencion timestamptz; proxima date;
begin
 if auth.uid() is null or coalesce(orientacion_privado.rol_actual(),'')<>'orientador' then raise exception using errcode='42501',message='PAP es exclusivo de orientación';end if;
 if p_datos is null or jsonb_typeof(p_datos)<>'object' or length(p_datos::text)>30000 then raise exception 'Datos inválidos';end if;
 select * into actor from public.perfiles where auth_user_id=auth.uid();
 if p_accion='buscar_estudiantes' then
  busqueda:=lower(btrim(coalesce(p_datos->>'busqueda','')));if length(busqueda)<2 then return '[]'::jsonb;end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from(select al.id,al.nombre,al.numero_documento from public.estudiantes al where not al.eliminando and not al.archivado and al.estado='activo' and strpos(lower(al.nombre||' '||coalesce(al.numero_documento,'')),busqueda)>0 order by al.nombre limit 20)x),'[]'::jsonb);
 elsif p_accion='listar' then
  busqueda:=lower(btrim(coalesce(p_datos->>'busqueda','')));
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.fecha desc,x.id) from(select p.id,p.persona,p.fecha,p.lugar,p.estado,p.seguimiento,p.orientador_id,p.orientador_nombre,p.version,p.estudiante_id from public.pap_atenciones p where (busqueda='' or strpos(lower(p.persona||' '||p.orientador_nombre),busqueda)>0) and (coalesce(p_datos->>'estado','')='' or p.estado=p_datos->>'estado') order by p.fecha desc,p.id limit 500)x),'[]'::jsonb);
 elsif p_accion='detalle' then
  select * into r from public.pap_atenciones where id=p_id;if not found then raise exception 'Atención no disponible';end if;
  return jsonb_build_object('atencion',to_jsonb(r),'historial',coalesce((select jsonb_agg(to_jsonb(x) order by x.fecha desc,x.id desc) from(select h.* from orientacion_privado.pap_historial h where h.registro_id=p_id order by h.fecha desc,h.id desc limit 100)x),'[]'::jsonb));
 elsif p_accion<>'guardar' then raise exception 'Acción no válida';end if;
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
end $$;
revoke all on function orientacion_privado.pap_flujo(text,uuid,jsonb) from public,anon;
grant execute on function orientacion_privado.pap_flujo(text,uuid,jsonb) to authenticated;
create function public.pap_flujo(p_accion text,p_id uuid default null,p_datos jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select orientacion_privado.pap_flujo(p_accion,p_id,p_datos)$$;
revoke all on function public.pap_flujo(text,uuid,jsonb) from public,anon;
grant execute on function public.pap_flujo(text,uuid,jsonb) to authenticated;
