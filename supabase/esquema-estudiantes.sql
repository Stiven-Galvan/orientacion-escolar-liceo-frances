-- Respaldo de la migración remota del módulo Estudiantes. Ya aplicado; no repetir.
alter table public.estudiantes
 add column acudiente_nombre text,
 add column acudiente_parentesco text,
 add column acudiente_telefono text,
 add column acudiente_correo text,
 add column version integer not null default 1,
 add constraint estudiantes_nombre_longitud check(length(btrim(nombre)) between 2 and 180),
 add constraint estudiantes_documento_valido check(
  (tipo_documento is null and numero_documento is null)
  or (tipo_documento is not null and tipo_documento in ('TI','RC','CC','CE','PPT','PAS') and numero_documento is not null and numero_documento ~ '^[A-Z0-9-]{3,30}$')
 ),
 add constraint estudiantes_nacimiento_valido check(fecha_nacimiento is null or (fecha_nacimiento >= date '1900-01-01' and fecha_nacimiento <= (now() at time zone 'America/Bogota')::date)),
 add constraint estudiantes_acudiente_longitud check(coalesce(length(acudiente_nombre),0)<=180 and coalesce(length(acudiente_parentesco),0)<=60 and coalesce(length(acudiente_telefono),0)<=40 and coalesce(length(acudiente_correo),0)<=254),
 add constraint estudiantes_correo_valido check(acudiente_correo is null or acudiente_correo ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');

create function orientacion_privado.versionar_estudiante()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='INSERT' then NEW.version:=1; else NEW.version:=OLD.version+1; end if;
 return NEW;
end $$;
revoke all on function orientacion_privado.versionar_estudiante() from public,anon,authenticated;
create trigger estudiantes_version before insert or update on public.estudiantes for each row execute function orientacion_privado.versionar_estudiante();

create table public.grupos (
 id uuid primary key default gen_random_uuid(),
 anio_lectivo integer not null check(anio_lectivo between 2000 and 2100),
 grado text not null check(grado in ('pre-kinder','kinder','transicion','1','2','3','4','5','6','7','8','9','10','11')),
 seccion text not null default '' check(length(seccion)<=30 and seccion=upper(btrim(seccion))),
 creado_por uuid default auth.uid(),
 creado_en timestamptz not null default now(),
 unique(anio_lectivo,grado,seccion),
 unique(id,anio_lectivo)
);
create table public.matriculas (
 id uuid primary key default gen_random_uuid(),
 estudiante_id uuid not null references public.estudiantes(id) on delete restrict,
 anio_lectivo integer not null,
 grupo_id uuid not null,
 creado_por uuid default auth.uid(),
 creado_en timestamptz not null default now(),
 actualizado_en timestamptz not null default now(),
 foreign key(grupo_id,anio_lectivo) references public.grupos(id,anio_lectivo) on delete restrict,
 unique(estudiante_id,anio_lectivo)
);
create index matriculas_grupo_idx on public.matriculas(grupo_id,anio_lectivo);
create index estudiantes_nombre_idx on public.estudiantes(lower(nombre),id);
alter table public.grupos enable row level security;
alter table public.matriculas enable row level security;
revoke all on public.grupos,public.matriculas from public,anon,authenticated;
grant select on public.grupos,public.matriculas to authenticated;
grant insert(anio_lectivo,grado,seccion) on public.grupos to authenticated;
grant insert(estudiante_id,anio_lectivo,grupo_id) on public.matriculas to authenticated;
grant update(grupo_id) on public.matriculas to authenticated;
grant all on public.grupos,public.matriculas to service_role;

create policy grupos_consulta on public.grupos for select to authenticated using((select orientacion_privado.rol_actual()) in ('orientador','superadministrador','desarrollador'));
create policy grupos_creacion on public.grupos for insert to authenticated with check((select orientacion_privado.rol_actual()) in ('orientador','superadministrador','desarrollador') and creado_por=(select auth.uid()));
create policy matriculas_consulta on public.matriculas for select to authenticated using((select orientacion_privado.rol_actual()) in ('orientador','superadministrador','desarrollador'));
create policy matriculas_creacion on public.matriculas for insert to authenticated with check((select orientacion_privado.rol_actual()) in ('orientador','superadministrador','desarrollador') and creado_por=(select auth.uid()));
create policy matriculas_edicion on public.matriculas for update to authenticated using((select orientacion_privado.rol_actual()) in ('orientador','superadministrador','desarrollador')) with check((select orientacion_privado.rol_actual()) in ('orientador','superadministrador','desarrollador'));
create policy estudiantes_edicion on public.estudiantes for update to authenticated using((select orientacion_privado.rol_actual()) in ('orientador','superadministrador','desarrollador')) with check((select orientacion_privado.rol_actual()) in ('orientador','superadministrador','desarrollador'));
create policy historial_matriculas_orientacion on public.historial for select to authenticated using(tabla='matriculas' and (select orientacion_privado.rol_actual())='orientador');
revoke insert on public.estudiantes from authenticated;
grant insert(id,nombre,tipo_documento,numero_documento,fecha_nacimiento,estado,es_prueba,acudiente_nombre,acudiente_parentesco,acudiente_telefono,acudiente_correo) on public.estudiantes to authenticated;
grant update(nombre,tipo_documento,numero_documento,fecha_nacimiento,estado,es_prueba,acudiente_nombre,acudiente_parentesco,acudiente_telefono,acudiente_correo) on public.estudiantes to authenticated;
create trigger auditar_grupos after insert or update or delete on public.grupos for each row execute function orientacion_privado.auditar_cambio();
create trigger auditar_matriculas after insert or update or delete on public.matriculas for each row execute function orientacion_privado.auditar_cambio();
create trigger matriculas_fecha before update on public.matriculas for each row execute function orientacion_privado.actualizar_fecha();

create function public.guardar_estudiante(p_datos jsonb,p_id uuid,p_version integer default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actual public.estudiantes%rowtype; curso uuid; anio integer; grado_e text; seccion_e text; tipo text; documento text;
begin
 if auth.uid() is null or coalesce(orientacion_privado.rol_actual(),'') not in ('orientador','superadministrador','desarrollador') then raise exception 'No tienes permiso para registrar o editar estudiantes'; end if;
 if p_id is null then raise exception 'Falta el identificador del registro'; end if;
 if jsonb_typeof(p_datos) is distinct from 'object' then raise exception 'Formulario inválido'; end if;
 anio:=(p_datos->>'anio_lectivo')::integer; grado_e:=p_datos->>'grado'; seccion_e:=upper(btrim(coalesce(p_datos->>'seccion','')));
 if anio is null or anio not between 2000 and 2100 or grado_e is null or grado_e not in ('pre-kinder','kinder','transicion','1','2','3','4','5','6','7','8','9','10','11') then raise exception 'Selecciona año y grado válidos'; end if;
 tipo:=nullif(p_datos->>'tipo_documento',''); documento:=nullif(upper(regexp_replace(coalesce(p_datos->>'numero_documento',''),'[[:space:]]','','g')),'');
 if tipo is null and documento is not null then raise exception 'Selecciona el tipo de documento'; end if;
 if p_version is null then
  insert into public.estudiantes(id,nombre,tipo_documento,numero_documento,fecha_nacimiento,estado,es_prueba,acudiente_nombre,acudiente_parentesco,acudiente_telefono,acudiente_correo)
  values(p_id,btrim(p_datos->>'nombre'),tipo,documento,nullif(p_datos->>'fecha_nacimiento','')::date,coalesce(p_datos->>'estado','activo'),coalesce((p_datos->>'es_prueba')::boolean,false),nullif(btrim(p_datos->>'acudiente_nombre'),''),nullif(btrim(p_datos->>'acudiente_parentesco'),''),nullif(btrim(p_datos->>'acudiente_telefono'),''),nullif(lower(btrim(p_datos->>'acudiente_correo')),'')) returning * into actual;
 else
  select * into actual from public.estudiantes where id=p_id for update;
  if not found then raise exception 'El estudiante no existe o no tienes acceso'; end if;
  if actual.version<>p_version then raise exception 'Otra persona actualizó este estudiante. Vuelve a abrir la ficha antes de guardar'; end if;
  update public.estudiantes set nombre=btrim(p_datos->>'nombre'),tipo_documento=tipo,numero_documento=documento,fecha_nacimiento=nullif(p_datos->>'fecha_nacimiento','')::date,estado=coalesce(p_datos->>'estado','activo'),es_prueba=coalesce((p_datos->>'es_prueba')::boolean,false),acudiente_nombre=nullif(btrim(p_datos->>'acudiente_nombre'),''),acudiente_parentesco=nullif(btrim(p_datos->>'acudiente_parentesco'),''),acudiente_telefono=nullif(btrim(p_datos->>'acudiente_telefono'),''),acudiente_correo=nullif(lower(btrim(p_datos->>'acudiente_correo')),'') where id=p_id returning * into actual;
 end if;
 insert into public.grupos(anio_lectivo,grado,seccion) values(anio,grado_e,seccion_e) on conflict(anio_lectivo,grado,seccion) do nothing returning id into curso;
 if curso is null then select id into curso from public.grupos where anio_lectivo=anio and grado=grado_e and seccion=seccion_e; end if;
 insert into public.matriculas(estudiante_id,anio_lectivo,grupo_id) values(p_id,anio,curso)
 on conflict(estudiante_id,anio_lectivo) do update set grupo_id=excluded.grupo_id where public.matriculas.grupo_id is distinct from excluded.grupo_id;
 return jsonb_build_object('id',actual.id,'version',actual.version);
end $$;
revoke all on function public.guardar_estudiante(jsonb,uuid,integer) from public,anon;
grant execute on function public.guardar_estudiante(jsonb,uuid,integer) to authenticated;

create function public.listar_estudiantes(p_busqueda text default '',p_anio integer default null,p_grado text default null,p_estado text default null,p_pagina integer default 1)
returns jsonb language sql stable security invoker set search_path='' as $$
 with base as (
 select e.id,e.nombre,e.tipo_documento,e.numero_documento,e.estado,e.es_prueba,e.version,g.anio_lectivo,g.grado,g.seccion
 from public.estudiantes e
 left join lateral(select m.grupo_id from public.matriculas m where m.estudiante_id=e.id and (p_anio is null or m.anio_lectivo=p_anio) order by m.anio_lectivo desc limit 1) m on true
 left join public.grupos g on g.id=m.grupo_id
 where not e.archivado and (p_anio is null or g.anio_lectivo=p_anio) and (p_grado is null or g.grado=p_grado) and (p_estado is null or e.estado=p_estado)
 and (coalesce(btrim(p_busqueda),'')='' or position(lower(btrim(p_busqueda)) in lower(e.nombre))>0 or position(upper(btrim(p_busqueda)) in coalesce(e.numero_documento,''))>0)
 ), pagina as (select * from base order by nombre,id limit 25 offset (greatest(coalesce(p_pagina,1),1)-1)*25)
 select jsonb_build_object('total',(select count(*) from base),'estudiantes',coalesce((select jsonb_agg(to_jsonb(p) order by p.nombre,p.id) from pagina p),'[]'::jsonb))
$$;
revoke all on function public.listar_estudiantes(text,integer,text,text,integer) from public,anon;
grant execute on function public.listar_estudiantes(text,integer,text,text,integer) to authenticated;

create function public.ficha_estudiante(p_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('estudiante',to_jsonb(e),'matriculas',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'anio_lectivo',m.anio_lectivo,'grado',g.grado,'seccion',g.seccion) order by m.anio_lectivo desc) from public.matriculas m join public.grupos g on g.id=m.grupo_id where m.estudiante_id=e.id),'[]'::jsonb),'historial',coalesce((select jsonb_agg(to_jsonb(h) order by h.fecha desc,h.id desc) from (select h.id,h.tabla,h.accion,h.fecha,h.actor_nombre,h.anterior,h.nuevo from public.historial h where (h.tabla='estudiantes' and h.registro_id=e.id) or (h.tabla='matriculas' and h.registro_id in(select id from public.matriculas where estudiante_id=e.id)) order by h.fecha desc,h.id desc limit 100) h),'[]'::jsonb))
 from public.estudiantes e where e.id=p_id
$$;
revoke all on function public.ficha_estudiante(uuid) from public,anon;
grant execute on function public.ficha_estudiante(uuid) to authenticated;
