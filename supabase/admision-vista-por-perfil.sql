begin;

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

notify pgrst, 'reload schema';
commit;
