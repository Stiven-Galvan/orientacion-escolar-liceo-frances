-- Respaldo del cambio remoto ya aplicado; no ejecutar de nuevo.
create function public.configurar_docente_rango(p_docente uuid,p_incluir uuid[],p_excluir uuid[],p_anio integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare todos uuid[]; incluidos uuid[]; excluidos uuid[]; retirados integer:=0;
begin
 if auth.uid() is null or coalesce(orientacion_privado.rol_actual(),'') not in ('superadministrador','desarrollador') then raise exception 'Solo superadministradores y desarrollador asignan docentes'; end if;
 if p_anio is null or p_anio not between 2000 and 2100 then raise exception 'Selecciona un año válido'; end if;
 if p_incluir is null or p_excluir is null or array_position(p_incluir,null) is not null or array_position(p_excluir,null) is not null then raise exception 'La selección contiene cursos inválidos'; end if;
 if cardinality(p_incluir)+cardinality(p_excluir) not between 1 and 1000 then raise exception 'Selecciona cursos o excepciones para guardar'; end if;
 select coalesce(array_agg(distinct id order by id),'{}'::uuid[]) into incluidos from unnest(p_incluir) as c(id);
 select coalesce(array_agg(distinct id order by id),'{}'::uuid[]) into excluidos from unnest(p_excluir) as c(id);
 if incluidos && excluidos then raise exception 'Un curso no puede estar incluido y excluido a la vez'; end if;
 todos:=incluidos||excluidos;
 if cardinality(todos)>500 then raise exception 'La selección supera 500 cursos'; end if;
 if (select count(*) from public.grupos where id=any(todos) and anio_lectivo=p_anio)<>cardinality(todos) then raise exception 'Todos los cursos deben existir y pertenecer al año seleccionado'; end if;
 if not exists(select 1 from public.perfiles where id=p_docente and rol='docente' and activo and auth_user_id is not null) then raise exception 'Selecciona un docente activo con cuenta de acceso'; end if;
 -- Serializar los cambios del mismo docente/año; todo se confirma junto.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_docente::text||':'||p_anio::text,31));
 if cardinality(incluidos)>0 then perform public.asignar_docente_cursos(p_docente,incluidos,p_anio); end if;
 update public.docentes_cursos set activo=false where docente_perfil_id=p_docente and grupo_id=any(excluidos) and activo;
 get diagnostics retirados=row_count;
 return jsonb_build_object('incluidos',cardinality(incluidos),'excluidos',cardinality(excluidos),'asignaciones_retiradas',retirados);
end $$;
revoke all on function public.configurar_docente_rango(uuid,uuid[],uuid[],integer) from public,anon;
grant execute on function public.configurar_docente_rango(uuid,uuid[],uuid[],integer) to authenticated;
