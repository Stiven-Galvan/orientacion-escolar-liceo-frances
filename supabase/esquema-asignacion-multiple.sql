-- Respaldo de la migración aplicada; no ejecutar de nuevo.
create function public.asignar_docente_cursos(p_docente uuid,p_grupos uuid[],p_anio integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare grupos_unicos uuid[]; curso uuid;
begin
 if auth.uid() is null or coalesce(orientacion_privado.rol_actual(),'') not in ('superadministrador','desarrollador') then raise exception 'Solo superadministradores y desarrollador asignan docentes'; end if;
 if p_anio is null or p_anio not between 2000 and 2100 then raise exception 'Selecciona un año válido'; end if;
 if p_grupos is null or cardinality(p_grupos) not between 1 and 500 or array_position(p_grupos,null) is not null then raise exception 'Selecciona al menos un curso válido'; end if;
 select array_agg(distinct id order by id) into grupos_unicos from unnest(p_grupos) as cursos(id);
 if (select count(*) from public.grupos where id=any(grupos_unicos) and anio_lectivo=p_anio)<>cardinality(grupos_unicos) then raise exception 'Todos los cursos deben existir y pertenecer al año seleccionado'; end if;
 -- Orden fijo y una sola transacción para evitar guardados parciales.
 foreach curso in array grupos_unicos loop
  perform public.asignar_docente_curso(p_docente,curso);
 end loop;
 return jsonb_build_object('total',cardinality(grupos_unicos));
end $$;
revoke all on function public.asignar_docente_cursos(uuid,uuid[],integer) from public,anon;
grant execute on function public.asignar_docente_cursos(uuid,uuid[],integer) to authenticated;
