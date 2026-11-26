-- Respaldo del cambio ya aplicado; no repetir.
create or replace function public.ficha_estudiante(p_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('estudiante',to_jsonb(e),'matriculas',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'anio_lectivo',m.anio_lectivo,'grado',g.grado,'seccion',g.seccion) order by m.anio_lectivo desc) from public.matriculas m join public.grupos g on g.id=m.grupo_id where m.estudiante_id=e.id),'[]'::jsonb),'historial',coalesce((select jsonb_agg(to_jsonb(h) order by h.fecha desc,h.id desc) from (select h.id,h.tabla,h.accion,h.fecha,h.actor_nombre,h.anterior,h.nuevo from public.historial h where (h.tabla='estudiantes' and h.registro_id=e.id) or (h.tabla='matriculas' and coalesce(h.nuevo->>'estudiante_id',h.anterior->>'estudiante_id')=e.id::text) or (h.tabla='admisiones_vinculos' and coalesce(h.nuevo->>'estudiante_id',h.anterior->>'estudiante_id')=e.id::text) order by h.fecha desc,h.id desc limit 100) h),'[]'::jsonb))
 from public.estudiantes e where e.id=p_id
$$;

create index historial_vinculos_estudiante_idx on public.historial((coalesce(nuevo->>'estudiante_id',anterior->>'estudiante_id')),fecha desc) where tabla in ('matriculas','admisiones_vinculos');
