begin;

create table if not exists public.admision_clasificaciones (
  entrevista_id uuid primary key references public.entrevistas_admision(id) on delete cascade,
  color text not null check (color in ('verde','amarillo','azul','morado','rojo')),
  clasificado_por uuid not null,
  actualizado_en timestamptz not null default now()
);
alter table public.admision_clasificaciones enable row level security;
revoke all on public.admision_clasificaciones from public, anon, authenticated;
grant select on public.admision_clasificaciones to authenticated;
drop policy if exists clasificacion_interna on public.admision_clasificaciones;
create policy clasificacion_interna on public.admision_clasificaciones for select to authenticated
using ((select orientacion_privado.rol_actual()) = 'superadministrador'
  or ((select orientacion_privado.rol_actual()) = 'orientador'
    and exists (select 1 from public.entrevistas_admision e
      where e.id = entrevista_id and e.creado_por = (select auth.uid()))));

-- Conservar la implementación instalada, incluidas sus validaciones y permisos.
do $$
begin
  if to_regprocedure('orientacion_privado.entrevista_operar_base(text,uuid,jsonb)') is null then
    alter function orientacion_privado.entrevista_operar(text,uuid,jsonb) rename to entrevista_operar_base;
  end if;
end $$;
revoke all on function orientacion_privado.entrevista_operar_base(text,uuid,jsonb) from public, anon, authenticated;
revoke all on function orientacion_privado.admitir_aspirante(uuid,jsonb,boolean) from public, anon, authenticated;

create or replace function orientacion_privado.entrevista_operar(p_accion text, p_id uuid, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  rol text := orientacion_privado.rol_actual();
  vista text := p_datos->>'vista';
  rol_efectivo text := rol;
  color_elegido text := p_datos->>'clasificacion';
  e public.entrevistas_admision%rowtype;
begin
  if vista is not null then
    if rol is distinct from 'desarrollador' or vista not in ('orientador','superadministrador') then
      raise exception using errcode='42501', message='La vista por perfil es exclusiva de una cuenta de desarrollador';
    end if;
    rol_efectivo := vista;
  end if;

  if p_accion='clasificaciones_vista' then
    if vista is null then
      raise exception using errcode='42501', message='Selecciona una vista de Admisiones';
    end if;
    if jsonb_typeof(p_datos->'ids') is distinct from 'array' then
      raise exception 'El listado de entrevistas debe ser un arreglo';
    end if;
    if jsonb_array_length(p_datos->'ids') > 100 then
      raise exception 'Consulta un máximo de 100 entrevistas a la vez';
    end if;
    return (
      select coalesce(jsonb_agg(jsonb_build_object('entrevista_id',c.entrevista_id,'color',c.color)), '[]'::jsonb)
      from public.admision_clasificaciones c
      join public.entrevistas_admision entrevista on entrevista.id=c.entrevista_id
      where c.entrevista_id in (select value::uuid from jsonb_array_elements_text(p_datos->'ids'))
        and (rol_efectivo='superadministrador' or entrevista.creado_por=auth.uid())
    );
  end if;

  if p_accion in ('decidir','rechazar_preparar','rechazar_finalizar')
    and rol_efectivo is distinct from 'superadministrador' then
    raise exception using errcode='42501', message='La decisión de admisión corresponde a un superadministrador';
  end if;
  if p_accion not in ('finalizar','clasificar') then
    return orientacion_privado.entrevista_operar_base(p_accion,p_id,p_datos);
  end if;
  if auth.uid() is null or coalesce(rol,'') not in ('orientador','superadministrador','desarrollador') then
    raise exception using errcode='42501', message='Acceso denegado';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text,41));
  select * into e from public.entrevistas_admision where id=p_id for update;
  if p_accion='finalizar' and rol_efectivo='desarrollador' then
    return orientacion_privado.entrevista_operar_base(p_accion,p_id,p_datos);
  end if;
  if coalesce(color_elegido,'') not in ('verde','amarillo','azul','morado','rojo') then
    raise exception 'Selecciona una clasificación válida';
  end if;
  if e.id is null or e.eliminando or e.archivado or (rol_efectivo='orientador' and e.creado_por<>auth.uid()) then
    raise exception using errcode='42501', message='Entrevista no disponible';
  end if;

  if p_accion='finalizar' then
    if e.estado<>'Borrador' then
      return to_jsonb(e) || jsonb_build_object('clasificacion',
        (select c.color from public.admision_clasificaciones c where c.entrevista_id=p_id));
    end if;
    perform orientacion_privado.entrevista_operar_base(p_accion,p_id,p_datos);
  elsif rol_efectivo='desarrollador' or e.estado not in ('Pendiente','Sin seguimiento')
    or (p_datos->>'version')::integer is distinct from e.version then
    raise exception 'Actualiza el listado y verifica que la entrevista esté pendiente';
  end if;

  insert into public.admision_clasificaciones(entrevista_id,color,clasificado_por)
  values(p_id,color_elegido,auth.uid())
  on conflict(entrevista_id) do update
    set color=excluded.color, clasificado_por=excluded.clasificado_por, actualizado_en=now();
  update public.entrevistas_admision
    set estado='Pendiente', version=version+1, actualizado_en=now()
    where id=p_id returning * into e;
  return to_jsonb(e) || jsonb_build_object('clasificacion',color_elegido);
end $$;
revoke all on function orientacion_privado.entrevista_operar(text,uuid,jsonb) from public, anon, authenticated;
grant execute on function orientacion_privado.entrevista_operar(text,uuid,jsonb) to authenticated;

create or replace function public.entrevista_operar(p_accion text,p_id uuid,p_datos jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select orientacion_privado.entrevista_operar(p_accion,p_id,p_datos)
$$;

create table if not exists public.orientacion_casos (
  id uuid primary key default gen_random_uuid(),
  estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
  responsable_id uuid references public.perfiles(id) on delete set null,
  estado text not null default 'abierto' check (estado in ('abierto','cerrado')),
  proxima_accion text not null,
  vence_el date not null,
  cierre text,
  version integer not null default 1,
  actualizado_en timestamptz not null default now()
);
create index if not exists orientacion_casos_estudiante on public.orientacion_casos(estudiante_id);
create index if not exists orientacion_casos_responsable on public.orientacion_casos(responsable_id, estado, vence_el);

create table if not exists public.orientacion_caso_remisiones (
  remision_id uuid primary key references public.remisiones(id) on delete cascade,
  caso_id uuid not null references public.orientacion_casos(id) on delete cascade
);
create index if not exists orientacion_caso_remisiones_caso on public.orientacion_caso_remisiones(caso_id);

create table if not exists public.orientacion_caso_acuerdos (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references public.orientacion_casos(id) on delete cascade,
  compromiso text not null,
  responsable text not null,
  revisar_el date not null,
  resultado text,
  remision_id uuid references public.orientacion_caso_remisiones(remision_id) on delete set null,
  reporte_docente text
);
create index if not exists orientacion_caso_acuerdos_caso on public.orientacion_caso_acuerdos(caso_id);

create table if not exists public.orientacion_caso_eventos (
  id bigint generated always as identity primary key,
  caso_id uuid not null references public.orientacion_casos(id) on delete cascade,
  accion text not null,
  detalle text,
  actor text not null,
  actor_id uuid not null,
  fecha timestamptz not null default now()
);
create index if not exists orientacion_caso_eventos_caso on public.orientacion_caso_eventos(caso_id, id desc);

create table if not exists public.orientacion_devoluciones (
  remision_id uuid primary key references public.orientacion_caso_remisiones(remision_id) on delete cascade,
  indicacion text not null,
  enviada_en timestamptz not null default now()
);

alter table public.orientacion_casos enable row level security;
alter table public.orientacion_caso_remisiones enable row level security;
alter table public.orientacion_caso_acuerdos enable row level security;
alter table public.orientacion_caso_eventos enable row level security;
alter table public.orientacion_devoluciones enable row level security;
revoke all on public.orientacion_casos, public.orientacion_caso_remisiones, public.orientacion_caso_acuerdos,
  public.orientacion_caso_eventos, public.orientacion_devoluciones from public, anon, authenticated;

create or replace function public.orientacion_seguimiento(p_accion text, p_id uuid default null, p_datos jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor public.perfiles%rowtype;
  caso public.orientacion_casos%rowtype;
  rm public.remisiones%rowtype;
  admin boolean;
  coord boolean;
  lista jsonb;
  bandeja jsonb;
  responsables jsonb;
  texto text := nullif(btrim(p_datos->>'texto'),'');
  encargado text := nullif(btrim(p_datos->>'responsable'),'');
  fecha_limite date := nullif(p_datos->>'fecha','')::date;
  remision_elegida uuid := nullif(p_datos->>'remision_id','')::uuid;
  responsable_elegido uuid;
  minimo_fecha date := (now() at time zone 'America/Bogota')::date;
begin
  select * into actor from public.perfiles
    where auth_user_id=auth.uid() and activo and not requiere_cambio_password;
  if actor.id is null then raise exception using errcode='42501', message='Acceso denegado'; end if;
  admin := actor.rol in ('superadministrador','desarrollador');
  coord := actor.rol in ('coordinacion_academica','coordinacion_convivencial');

  if p_accion='devolucion_docente' then
    if actor.rol<>'docente' then raise exception using errcode='42501', message='Acceso denegado'; end if;
    return (select jsonb_build_object('estado',c.estado,'indicacion',d.indicacion,'enviada_en',d.enviada_en,
      'acuerdos',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'compromiso',a.compromiso,'revisar_el',a.revisar_el,
        'reporte_docente',a.reporte_docente) order by a.revisar_el),'[]'::jsonb)
        from public.orientacion_caso_acuerdos a where a.remision_id=r.id and a.caso_id=c.id))
      from public.remisiones r
      join public.orientacion_caso_remisiones v on v.remision_id=r.id
      join public.orientacion_casos c on c.id=v.caso_id
      left join public.orientacion_devoluciones d on d.remision_id=r.id
      where r.id=p_id and r.docente_auth=actor.auth_user_id);
  end if;

  if p_accion='reportar_acuerdo' then
    if actor.rol<>'docente' or coalesce(length(texto),0) not between 1 and 2000 then
      raise exception using errcode='42501', message='Reporte no disponible';
    end if;
    select c.* into caso from public.orientacion_casos c
      join public.orientacion_caso_acuerdos a on a.caso_id=c.id
      join public.orientacion_caso_remisiones v on v.remision_id=a.remision_id and v.caso_id=c.id
      join public.remisiones r on r.id=v.remision_id
      where a.id=(p_datos->>'acuerdo_id')::uuid and r.id=p_id and r.docente_auth=actor.auth_user_id and c.estado='abierto' for update of c;
    if caso.id is null then raise exception using errcode='42501', message='Acuerdo no disponible'; end if;
    update public.orientacion_caso_acuerdos set reporte_docente=texto
      where id=(p_datos->>'acuerdo_id')::uuid and caso_id=caso.id;
    insert into public.orientacion_caso_eventos(caso_id,accion,detalle,actor,actor_id)
      values(caso.id,p_accion,texto,actor.nombre,actor.auth_user_id);
    update public.orientacion_casos set version=version+1,actualizado_en=now() where id=caso.id;
    return jsonb_build_object('id',caso.id);
  end if;

  if not (admin or coord or actor.rol='orientador') then
    raise exception using errcode='42501', message='Acceso denegado';
  end if;
  if p_accion='listar' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.vence_el,x.id),'[]'::jsonb) into lista
    from (
      select c.id,c.estudiante_id,e.nombre,c.responsable_id,coalesce(p.nombre,'Por reasignar') as responsable,c.estado,case when not coord then c.proxima_accion end as proxima_accion,c.vence_el,
        (select count(*) from public.orientacion_caso_acuerdos a where a.caso_id=c.id
          and a.resultado is null and a.revisar_el<=minimo_fecha+7) as acuerdos_proximos,
        case when not coord then c.cierre end as cierre,c.version,c.actualizado_en,
        (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'autor',r.docente_nombre,'es_docente',exists(select 1 from public.perfiles p where p.auth_user_id=r.docente_auth and p.rol='docente' and p.activo),'indicacion',case when not coord then d.indicacion end)
             order by r.creado_en,r.id),'[]'::jsonb)
          from public.orientacion_caso_remisiones v
          join public.remisiones r on r.id=v.remision_id
          left join public.orientacion_devoluciones d on d.remision_id=r.id
          where v.caso_id=c.id and (not coord or r.destino=actor.rol)) as remisiones,
        (select coalesce(jsonb_agg(to_jsonb(a) order by a.revisar_el,a.id),'[]'::jsonb)
          from public.orientacion_caso_acuerdos a where a.caso_id=c.id and not coord) as acuerdos,
        (select coalesce(jsonb_agg(to_jsonb(h) order by h.id desc),'[]'::jsonb)
          from (select ev.id,ev.accion,ev.detalle,ev.actor,ev.fecha from public.orientacion_caso_eventos ev
            where ev.caso_id=c.id and not coord order by ev.id desc limit 100) h) as historial
      from public.orientacion_casos c
      join public.estudiantes e on e.id=c.estudiante_id and not e.eliminando
      left join public.perfiles p on p.id=c.responsable_id
      where (p_id is null or c.estudiante_id=p_id)
        and (admin or (actor.rol='orientador' and c.responsable_id=actor.id)
          or (coord and exists(select 1 from public.orientacion_caso_remisiones v
            join public.remisiones r on r.id=v.remision_id where v.caso_id=c.id and r.destino=actor.rol)))
    ) x;
    select coalesce(jsonb_agg(to_jsonb(x) order by x.enviado_en,x.id),'[]'::jsonb) into bandeja
    from (
      select r.id,r.estado,r.estudiante_id,r.datos->>'nombre' as nombre,r.orientador_nombre,r.enviado_en,r.docente_nombre
      from public.remisiones r
      where r.estado in ('aprobada','aceptada','vinculada')
        and not exists(select 1 from public.orientacion_caso_remisiones v where v.remision_id=r.id)
        and (p_id is null or r.estudiante_id=p_id)
        and (admin or (coord and r.destino=actor.rol)
          or (actor.rol='orientador' and (r.estado='aprobada' or r.orientador_id=actor.id)))
    ) x;
    select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'nombre',p.nombre) order by p.nombre),'[]'::jsonb)
      into responsables from public.perfiles p where admin and p.activo and p.rol='orientador' and p.auth_user_id is not null;
    return jsonb_build_object('casos',lista,'pendientes',bandeja,'orientadores',responsables);
  end if;

  if coord then raise exception using errcode='42501', message='Este perfil tiene acceso de consulta'; end if;
  if p_accion in ('abrir','vincular') then
    select * into rm from public.remisiones where id=remision_elegida for update;
    if rm.id is null or rm.estado not in ('aceptada','vinculada') or rm.estudiante_id is null
      or (not admin and rm.orientador_id is distinct from actor.id)
      or not exists(select 1 from public.estudiantes e where e.id=rm.estudiante_id and not e.eliminando)
      then raise exception 'La remisión debe estar recibida y vinculada a un estudiante'; end if;
    if exists(select 1 from public.orientacion_caso_remisiones v where v.remision_id=rm.id)
      then raise exception 'La remisión ya tiene un caso asignado'; end if;
  end if;

  if p_accion='abrir' then
    if coalesce(length(texto),0) not between 1 and 2000 or fecha_limite is null or fecha_limite<minimo_fecha then
      raise exception 'Indica la primera acción y su fecha límite';
    end if;
    select p.id into responsable_elegido from public.perfiles p where p.id=rm.orientador_id and p.activo;
    responsable_elegido := coalesce(responsable_elegido,actor.id);
    insert into public.orientacion_casos(estudiante_id,responsable_id,proxima_accion,vence_el)
      values(rm.estudiante_id,responsable_elegido,texto,fecha_limite) returning * into caso;
  else
    select * into caso from public.orientacion_casos where id=p_id for update;
    if caso.id is null or (not admin and caso.responsable_id is distinct from actor.id)
      or not exists(select 1 from public.estudiantes e where e.id=caso.estudiante_id and not e.eliminando) then
      raise exception using errcode='42501', message='Caso no disponible';
    end if;
    if (p_datos->>'version')::integer is distinct from caso.version then
      raise exception 'El caso cambió. Actualiza antes de guardar';
    end if;
    if caso.estado='cerrado' and p_accion not in ('reabrir','devolver') then raise exception 'Reabre el caso para continuar'; end if;
  end if;

  case p_accion
    when 'abrir','vincular' then
      if rm.estudiante_id is distinct from caso.estudiante_id then raise exception 'La remisión corresponde a otro estudiante'; end if;
      insert into public.orientacion_caso_remisiones(remision_id,caso_id) values(rm.id,caso.id);
      if p_accion='vincular' then texto := 'Remisión de '||rm.docente_nombre; end if;
    when 'planificar','reabrir' then
      if p_accion='reabrir' and caso.estado<>'cerrado' then raise exception 'El caso ya está abierto'; end if;
      if coalesce(length(texto),0) not between 1 and 2000 or fecha_limite is null or fecha_limite<minimo_fecha then
        raise exception 'Indica una próxima acción y su fecha límite';
      end if;
      update public.orientacion_casos set proxima_accion=texto,vence_el=fecha_limite,estado='abierto',cierre=null where id=caso.id;
    when 'cerrar' then
      if coalesce(length(texto),0) not between 5 and 3000 then raise exception 'Registra el motivo, las acciones y el resultado del cierre'; end if;
      update public.orientacion_casos set estado='cerrado',cierre=texto where id=caso.id;
    when 'reasignar' then
      if not admin then raise exception using errcode='42501', message='Solo administración puede reasignar casos'; end if;
      select p.id,p.nombre into responsable_elegido,texto from public.perfiles p
        where p.id=(p_datos->>'perfil_id')::uuid and p.rol='orientador' and p.activo and p.auth_user_id is not null;
      if responsable_elegido is null then raise exception 'Selecciona un orientador activo'; end if;
      update public.orientacion_casos set responsable_id=responsable_elegido where id=caso.id;
    when 'acuerdo' then
      if coalesce(length(texto),0) not between 1 and 2000 or coalesce(length(encargado),0) not between 1 and 180
        or fecha_limite is null or fecha_limite<minimo_fecha then raise exception 'Completa el compromiso, el responsable y la fecha de revisión'; end if;
      if remision_elegida is not null and not exists (
        select 1 from public.orientacion_caso_remisiones v join public.remisiones r on r.id=v.remision_id
          join public.perfiles p on p.auth_user_id=r.docente_auth and p.rol='docente' and p.activo
          where v.caso_id=caso.id and v.remision_id=remision_elegida
      ) then raise exception 'Selecciona la remisión de un docente activo'; end if;
      insert into public.orientacion_caso_acuerdos(caso_id,compromiso,responsable,revisar_el,remision_id)
        values(caso.id,texto,encargado,fecha_limite,remision_elegida);
    when 'resultado' then
      if coalesce(length(texto),0) not between 1 and 2000 then raise exception 'Escribe el resultado del acuerdo'; end if;
      update public.orientacion_caso_acuerdos set resultado=texto
        where id=(p_datos->>'acuerdo_id')::uuid and caso_id=caso.id;
      if not found then raise exception 'Acuerdo no disponible'; end if;
    when 'devolver' then
      if coalesce(length(texto),0) not between 1 and 2000 then raise exception 'Escribe la indicación para el docente'; end if;
      select * into rm from public.remisiones r where r.id=remision_elegida and exists(
        select 1 from public.orientacion_caso_remisiones v where v.remision_id=r.id and v.caso_id=caso.id);
      if rm.id is null or not exists (select 1 from public.perfiles p where p.auth_user_id=rm.docente_auth and p.activo and p.rol='docente')
        then raise exception 'La remisión no tiene un docente activo como destinatario'; end if;
      insert into public.orientacion_devoluciones(remision_id,indicacion) values(rm.id,texto)
        on conflict(remision_id) do update set indicacion=excluded.indicacion,enviada_en=now();
      insert into public.remision_notificaciones(remision_id,destinatario,mensaje)
        values(rm.id,rm.docente_auth,'Orientación publicó una indicación de aula en tu remisión.');
      texto := 'Indicación publicada para '||rm.docente_nombre;
    else raise exception 'Acción desconocida';
  end case;

  insert into public.orientacion_caso_eventos(caso_id,accion,detalle,actor,actor_id)
    values(caso.id,p_accion,texto,actor.nombre,actor.auth_user_id);
  update public.orientacion_casos set version=version+1,actualizado_en=now() where id=caso.id;
  return jsonb_build_object('id',caso.id);
end $$;
revoke all on function public.orientacion_seguimiento(text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.orientacion_seguimiento(text,uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
