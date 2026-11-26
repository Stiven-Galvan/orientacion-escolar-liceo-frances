-- Respaldo del cambio remoto ya aplicado. No ejecutar de nuevo.
alter table public.estudiantes drop constraint estudiantes_documento_valido;
alter table public.estudiantes add constraint estudiantes_documento_valido check(
 (tipo_documento is null and numero_documento is null)
 or (tipo_documento is not null and tipo_documento in ('TI','RC','CC','CE','PPT','PAS','OTRO') and numero_documento is not null and numero_documento ~ '^[A-Z0-9-]{3,30}$')
);
create table public.admisiones_vinculos (
 id uuid primary key default gen_random_uuid(),
 entrevista_id uuid not null unique,
 estudiante_id uuid not null references public.estudiantes(id) on delete restrict,
 anio_lectivo integer not null check(anio_lectivo between 2000 and 2100),
 creado_por uuid not null default auth.uid(),
 creado_en timestamptz not null default now()
);
create index admisiones_vinculos_estudiante_idx on public.admisiones_vinculos(estudiante_id,creado_en desc);
alter table public.admisiones_vinculos enable row level security;
revoke all on public.admisiones_vinculos from public,anon,authenticated;
grant select on public.admisiones_vinculos to authenticated;
grant insert(entrevista_id,estudiante_id,anio_lectivo) on public.admisiones_vinculos to authenticated;
grant all on public.admisiones_vinculos to service_role;
create policy admisiones_vinculos_consulta on public.admisiones_vinculos for select to authenticated using((select orientacion_privado.rol_actual()) in ('orientador','superadministrador','desarrollador'));
create policy admisiones_vinculos_creacion on public.admisiones_vinculos for insert to authenticated with check((select orientacion_privado.rol_actual()) in ('orientador','superadministrador','desarrollador') and creado_por=(select auth.uid()));
create trigger auditar_admisiones_vinculos after insert or update or delete on public.admisiones_vinculos for each row execute function orientacion_privado.auditar_cambio();
create policy historial_admisiones_orientacion on public.historial for select to authenticated using(tabla='admisiones_vinculos' and (select orientacion_privado.rol_actual())='orientador');

create function public.admitir_aspirante(p_entrevista_id uuid,p_datos jsonb,p_confirmar_existente boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare existente public.estudiantes%rowtype; vinculo public.admisiones_vinculos%rowtype; resultado jsonb; estudiante uuid; tipo text; documento text; grado_e text; anio integer; seccion_e text; conserva boolean:=false;
begin
 if auth.uid() is null or coalesce(orientacion_privado.rol_actual(),'') not in ('orientador','superadministrador','desarrollador') then raise exception 'No tienes permiso para admitir aspirantes'; end if;
 if p_entrevista_id is null or jsonb_typeof(p_datos) is distinct from 'object' then raise exception 'Datos de admisión incompletos'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_entrevista_id::text,17));
 select * into vinculo from public.admisiones_vinculos where entrevista_id=p_entrevista_id;
 if found then return jsonb_build_object('estudiante_id',vinculo.estudiante_id,'ya_vinculado',true,'requiere_confirmacion',false); end if;
 tipo:=case upper(btrim(p_datos->>'tipoDocumento')) when 'PASAPORTE' then 'PAS' when 'OTRO' then 'OTRO' else upper(btrim(p_datos->>'tipoDocumento')) end;
 documento:=upper(regexp_replace(coalesce(p_datos->>'documento',''),'[[:space:]]','','g'));
 grado_e:=case lower(btrim(p_datos->>'grado')) when 'pre-kinder' then 'pre-kinder' when 'pre-kínder' then 'pre-kinder' when 'kinder' then 'kinder' when 'kínder' then 'kinder' when 'transición' then 'transicion' when 'transicion' then 'transicion' else regexp_replace(p_datos->>'grado','[^0-9]','','g') end;
 anio:=(p_datos->>'ingreso')::integer;
 seccion_e:=upper(btrim(coalesce(p_datos->>'grupo','')));
 if tipo is null or tipo not in ('TI','RC','CC','CE','PPT','PAS','OTRO') or documento !~ '^[A-Z0-9-]{3,30}$' then raise exception 'Revisa el tipo y número de documento antes de admitir'; end if;
 if anio is null or anio not between 2000 and 2100 or grado_e is null or grado_e not in ('pre-kinder','kinder','transicion','1','2','3','4','5','6','7','8','9','10','11') or length(seccion_e)>30 then raise exception 'Revisa el año, grado y grupo de ingreso'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(tipo||':'||documento,23));
 select * into existente from public.estudiantes where tipo_documento=tipo and numero_documento=documento;
 if found then
  if not coalesce(p_confirmar_existente,false) then
   return jsonb_build_object('requiere_confirmacion',true,'estudiante_id',existente.id,'nombre_existente',existente.nombre);
  end if;
  estudiante:=existente.id;
  conserva:=exists(select 1 from public.matriculas where estudiante_id=estudiante and anio_lectivo=anio);
  if not conserva then
   resultado:=public.guardar_estudiante(to_jsonb(existente)||jsonb_build_object('anio_lectivo',anio,'grado',grado_e,'seccion',seccion_e),estudiante,existente.version);
  end if;
 else
  estudiante:=p_entrevista_id;
  resultado:=public.guardar_estudiante(jsonb_build_object('nombre',p_datos->>'nombre','tipo_documento',tipo,'numero_documento',documento,'fecha_nacimiento',p_datos->>'nacimiento','estado','activo','es_prueba',coalesce((p_datos->>'esPrueba')::boolean,true),'acudiente_nombre',p_datos->>'acudientes','acudiente_telefono',p_datos->>'celular','acudiente_correo',p_datos->>'correo','anio_lectivo',anio,'grado',grado_e,'seccion',seccion_e),estudiante,null);
 end if;
 insert into public.admisiones_vinculos(entrevista_id,estudiante_id,anio_lectivo) values(p_entrevista_id,estudiante,anio);
 return jsonb_build_object('requiere_confirmacion',false,'estudiante_id',estudiante,'matricula_conservada',conserva,'existente',existente.id is not null);
end $$;
revoke all on function public.admitir_aspirante(uuid,jsonb,boolean) from public,anon;
grant execute on function public.admitir_aspirante(uuid,jsonb,boolean) to authenticated;

create or replace function public.ficha_estudiante(p_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('estudiante',to_jsonb(e),'matriculas',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'anio_lectivo',m.anio_lectivo,'grado',g.grado,'seccion',g.seccion) order by m.anio_lectivo desc) from public.matriculas m join public.grupos g on g.id=m.grupo_id where m.estudiante_id=e.id),'[]'::jsonb),'historial',coalesce((select jsonb_agg(to_jsonb(h) order by h.fecha desc,h.id desc) from (select h.id,h.tabla,h.accion,h.fecha,h.actor_nombre,h.anterior,h.nuevo from public.historial h where (h.tabla='estudiantes' and h.registro_id=e.id) or (h.tabla='matriculas' and h.registro_id in(select id from public.matriculas where estudiante_id=e.id)) or (h.tabla='admisiones_vinculos' and h.registro_id in(select id from public.admisiones_vinculos where estudiante_id=e.id)) order by h.fecha desc,h.id desc limit 100) h),'[]'::jsonb))
 from public.estudiantes e where e.id=p_id
$$;
