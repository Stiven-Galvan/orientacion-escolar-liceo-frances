create function public.panel_observacion_estudiantes(p_datos jsonb default '{}') returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare pagina int:=greatest(1,least(coalesce((p_datos->>'pagina')::int,1),100000));resultado jsonb;
begin
 if auth.uid() is null or coalesce(orientacion_privado.rol_actual(),'') not in ('orientador','superadministrador','desarrollador') then raise exception 'Solo orientación y administración pueden consultar este panel';end if;
 with base as(
 select o.estudiante_id,e.nombre,e.tipo_documento,e.numero_documento,o.enviado_en,o.id
 from public.observaciones_docentes o join public.estudiantes e on e.id=o.estudiante_id
 left join public.matriculas m on m.estudiante_id=e.id and m.anio_lectivo=o.anio_lectivo
 left join public.grupos g on g.id=m.grupo_id
 where not e.eliminando
 and (nullif(p_datos->>'anio','') is null or o.anio_lectivo=(p_datos->>'anio')::int)
 and (nullif(p_datos->>'periodo','') is null or o.periodo=(p_datos->>'periodo')::int)
 and (nullif(p_datos->>'grado','') is null or g.grado=p_datos->>'grado')
 and (coalesce(btrim(p_datos->>'busqueda'),'')='' or position(lower(btrim(p_datos->>'busqueda')) in lower(concat_ws(' ',e.nombre,e.numero_documento,o.docente_nombre)))>0)
 ), resumen as(
 select estudiante_id as id,nombre,tipo_documento,numero_documento,count(*) filter(where enviado_en is null) as pendientes,count(*) filter(where enviado_en is not null) as diligenciados
 from base group by estudiante_id,nombre,tipo_documento,numero_documento
 ), pagina as(select * from resumen order by nombre,id limit 25 offset (pagina-1)*25)
 select jsonb_build_object('estudiantes',coalesce((select jsonb_agg(to_jsonb(p) order by p.nombre,p.id) from pagina p),'[]'::jsonb),'total',(select count(*) from resumen)) into resultado;
 return resultado;
end $$;
revoke all on function public.panel_observacion_estudiantes(jsonb) from public,anon;
grant execute on function public.panel_observacion_estudiantes(jsonb) to authenticated;

create table public.procesos_piar (
 id uuid primary key default gen_random_uuid(),estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
 anio_lectivo int not null check(anio_lectivo between 2000 and 2100),estado text not null default 'iniciado' check(estado='iniciado'),
 iniciado_por uuid not null,iniciado_nombre text not null,iniciado_en timestamptz not null default now(),
 unique(estudiante_id,anio_lectivo)
);
alter table public.procesos_piar enable row level security;
revoke all on public.procesos_piar from public,anon,authenticated;
grant select on public.procesos_piar to authenticated;
create policy piar_consulta_gestion on public.procesos_piar for select to authenticated using((select orientacion_privado.rol_actual()) in ('orientador','superadministrador','desarrollador'));
create trigger piar_auditoria after insert or update or delete on public.procesos_piar for each row execute function orientacion_privado.auditar_cambio();
create policy historial_piar_orientacion on public.historial for select to authenticated using(tabla='procesos_piar' and (select orientacion_privado.rol_actual())='orientador');
create index historial_piar_estudiante on public.historial((coalesce(nuevo->>'estudiante_id',anterior->>'estudiante_id'))) where tabla='procesos_piar';

create function orientacion_privado.piar_operar(p_accion text,p_datos jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.estudiantes%rowtype; proceso public.procesos_piar%rowtype; anio int; sid uuid; nuevo boolean; pagina int; filas jsonb; total int;
begin
 if auth.uid() is null or coalesce(orientacion_privado.rol_actual(),'') not in ('orientador','superadministrador','desarrollador') then raise exception 'Solo orientación y administración pueden pasar estudiantes a PIAR';end if;
 if p_accion='iniciar' then
 sid=(p_datos->>'estudiante_id')::uuid;anio=(p_datos->>'anio')::int;
 if anio is null or anio not between 2000 and 2100 then raise exception 'Selecciona el año lectivo del PIAR';end if;
 select * into e from public.estudiantes where id=sid for update;
 if not found or e.eliminando or e.archivado or e.estado<>'activo' then raise exception 'El estudiante debe estar activo y disponible';end if;
 if not exists(select 1 from public.matriculas where estudiante_id=sid and anio_lectivo=anio) then raise exception 'Primero registra la matrícula para ese año';end if;
 insert into public.procesos_piar(estudiante_id,anio_lectivo,iniciado_por,iniciado_nombre)
 values(sid,anio,auth.uid(),(select nombre from public.perfiles where auth_user_id=auth.uid())) on conflict(estudiante_id,anio_lectivo) do nothing returning * into proceso;
 nuevo=found;
 if not nuevo then select * into proceso from public.procesos_piar where estudiante_id=sid and anio_lectivo=anio;end if;
 return to_jsonb(proceso)||jsonb_build_object('nuevo',nuevo);
 elsif p_accion='listar' then
 pagina=greatest(1,least(coalesce((p_datos->>'pagina')::int,1),100000));
 select count(*) into total from public.procesos_piar p join public.estudiantes alumno on alumno.id=p.estudiante_id where not alumno.eliminando
 and (nullif(p_datos->>'estudiante_id','') is null or p.estudiante_id=(p_datos->>'estudiante_id')::uuid)
 and (nullif(p_datos->>'anio','') is null or p.anio_lectivo=(p_datos->>'anio')::int)
 and (coalesce(btrim(p_datos->>'busqueda'),'')='' or position(lower(btrim(p_datos->>'busqueda')) in lower(alumno.nombre))>0);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.iniciado_en desc,t.id),'[]'::jsonb) into filas from (
 select p.*,alumno.nombre as estudiante_nombre from public.procesos_piar p join public.estudiantes alumno on alumno.id=p.estudiante_id where not alumno.eliminando
 and (nullif(p_datos->>'estudiante_id','') is null or p.estudiante_id=(p_datos->>'estudiante_id')::uuid)
 and (nullif(p_datos->>'anio','') is null or p.anio_lectivo=(p_datos->>'anio')::int)
 and (coalesce(btrim(p_datos->>'busqueda'),'')='' or position(lower(btrim(p_datos->>'busqueda')) in lower(alumno.nombre))>0)
 order by p.iniciado_en desc,p.id limit 25 offset (pagina-1)*25
 ) t;
 return jsonb_build_object('procesos',filas,'total',total);
 end if;
 raise exception 'Acción no permitida';
end $$;
revoke all on function orientacion_privado.piar_operar(text,jsonb) from public,anon;
grant execute on function orientacion_privado.piar_operar(text,jsonb) to authenticated;
create function public.piar_operar(p_accion text,p_datos jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select orientacion_privado.piar_operar(p_accion,p_datos)$$;
revoke all on function public.piar_operar(text,jsonb) from public,anon;
grant execute on function public.piar_operar(text,jsonb) to authenticated;
CREATE OR REPLACE FUNCTION public.ficha_estudiante(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('estudiante',to_jsonb(e),'matriculas',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'anio_lectivo',m.anio_lectivo,'grado',g.grado,'seccion',g.seccion) order by m.anio_lectivo desc) from public.matriculas m join public.grupos g on g.id=m.grupo_id where m.estudiante_id=e.id),'[]'::jsonb),'historial',coalesce((select jsonb_agg(to_jsonb(h) order by h.fecha desc,h.id desc) from (select h.id,h.tabla,h.accion,h.fecha,h.actor_nombre,h.anterior,h.nuevo from public.historial h where (h.tabla='estudiantes' and h.registro_id=e.id) or (h.tabla='matriculas' and coalesce(h.nuevo->>'estudiante_id',h.anterior->>'estudiante_id')=e.id::text) or (h.tabla in ('admisiones_vinculos','observaciones_docentes','procesos_piar') and coalesce(h.nuevo->>'estudiante_id',h.anterior->>'estudiante_id')=e.id::text) order by h.fecha desc,h.id desc limit 100) h),'[]'::jsonb))
 from public.estudiantes e where e.id=p_id
$function$
;
