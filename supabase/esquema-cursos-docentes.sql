-- Cambio remoto del módulo Cursos y docentes. Respaldo; no ejecutar de nuevo.
create table public.docentes_cursos (
 id uuid primary key default gen_random_uuid(),
 docente_perfil_id uuid references public.perfiles(id) on delete set null,
 docente_nombre text not null,
 grupo_id uuid not null references public.grupos(id) on delete restrict,
 activo boolean not null default true,
 creado_por uuid not null default auth.uid(),
 creado_en timestamptz not null default now(),
 actualizado_en timestamptz not null default now(),
 unique(docente_perfil_id,grupo_id),
 check(not activo or docente_perfil_id is not null)
);
create index docentes_cursos_grupo_idx on public.docentes_cursos(grupo_id,activo);
alter table public.docentes_cursos enable row level security;
revoke all on public.docentes_cursos from public,anon,authenticated;
grant select on public.docentes_cursos to authenticated;
grant insert(docente_perfil_id,grupo_id) on public.docentes_cursos to authenticated;
grant update(activo) on public.docentes_cursos to authenticated;
grant all on public.docentes_cursos to service_role;
create policy docentes_cursos_consulta on public.docentes_cursos for select to authenticated using(
 (select orientacion_privado.rol_actual()) in ('superadministrador','desarrollador','orientador')
 or ((select orientacion_privado.rol_actual())='docente' and docente_perfil_id=(select id from public.perfiles where auth_user_id=(select auth.uid())))
);
create policy docentes_cursos_creacion on public.docentes_cursos for insert to authenticated with check((select orientacion_privado.rol_actual()) in ('superadministrador','desarrollador') and creado_por=(select auth.uid()));
create policy docentes_cursos_edicion on public.docentes_cursos for update to authenticated using((select orientacion_privado.rol_actual()) in ('superadministrador','desarrollador')) with check((select orientacion_privado.rol_actual()) in ('superadministrador','desarrollador'));

create function orientacion_privado.validar_docente_curso()
returns trigger language plpgsql security invoker set search_path='' as $$
declare nombre_docente text;
begin
 if NEW.activo then
  select nombre into nombre_docente from public.perfiles where id=NEW.docente_perfil_id and rol='docente' and activo and auth_user_id is not null;
  if not found then raise exception 'Selecciona un docente activo con cuenta de acceso'; end if;
  NEW.docente_nombre:=nombre_docente;
 end if;
 NEW.actualizado_en:=now(); return NEW;
end $$;
revoke all on function orientacion_privado.validar_docente_curso() from public,anon,authenticated;
create trigger docentes_cursos_validar before insert or update on public.docentes_cursos for each row execute function orientacion_privado.validar_docente_curso();
create trigger docentes_cursos_auditar after insert or update or delete on public.docentes_cursos for each row execute function orientacion_privado.auditar_cambio();

-- Preservar asignaciones históricas y compatibilidad con Personal al cambiar rol o borrar.
create function orientacion_privado.retirar_cursos_de_personal()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then
  update public.docentes_cursos set activo=false where docente_perfil_id=OLD.id and activo;
  return OLD;
 end if;
 if NEW.rol<>'docente' or not NEW.activo or NEW.auth_user_id is null then
  update public.docentes_cursos set activo=false where docente_perfil_id=NEW.id and activo;
 end if;
 return NEW;
end $$;
revoke all on function orientacion_privado.retirar_cursos_de_personal() from public,anon,authenticated;
create trigger personal_retirar_cursos_actualizacion after update of rol,activo,auth_user_id on public.perfiles for each row execute function orientacion_privado.retirar_cursos_de_personal();
create trigger personal_retirar_cursos_borrado before delete on public.perfiles for each row execute function orientacion_privado.retirar_cursos_de_personal();

create function public.crear_curso(p_anio integer,p_grado text,p_seccion text default '')
returns uuid language plpgsql security invoker set search_path='' as $$
declare resultado uuid;
begin
 if auth.uid() is null or coalesce(orientacion_privado.rol_actual(),'') not in ('superadministrador','desarrollador') then raise exception 'Solo superadministradores y desarrollador administran cursos'; end if;
 insert into public.grupos(anio_lectivo,grado,seccion) values(p_anio,p_grado,upper(btrim(coalesce(p_seccion,'')))) on conflict(anio_lectivo,grado,seccion) do nothing returning id into resultado;
 if resultado is null then select id into resultado from public.grupos where anio_lectivo=p_anio and grado=p_grado and seccion=upper(btrim(coalesce(p_seccion,''))); end if;
 return resultado;
end $$;
revoke all on function public.crear_curso(integer,text,text) from public,anon;
grant execute on function public.crear_curso(integer,text,text) to authenticated;

create function public.asignar_docente_curso(p_docente uuid,p_grupo uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare resultado uuid;
begin
 if auth.uid() is null or coalesce(orientacion_privado.rol_actual(),'') not in ('superadministrador','desarrollador') then raise exception 'Solo superadministradores y desarrollador asignan docentes'; end if;
 insert into public.docentes_cursos(docente_perfil_id,grupo_id) values(p_docente,p_grupo)
 on conflict(docente_perfil_id,grupo_id) do update set activo=true where not public.docentes_cursos.activo returning id into resultado;
 if resultado is null then select id into resultado from public.docentes_cursos where docente_perfil_id=p_docente and grupo_id=p_grupo; end if;
 return resultado;
end $$;
revoke all on function public.asignar_docente_curso(uuid,uuid) from public,anon;
grant execute on function public.asignar_docente_curso(uuid,uuid) to authenticated;

create function public.retirar_docente_curso(p_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or coalesce(orientacion_privado.rol_actual(),'') not in ('superadministrador','desarrollador') then raise exception 'Solo superadministradores y desarrollador retiran asignaciones'; end if;
 update public.docentes_cursos set activo=false where id=p_id and activo;
end $$;
revoke all on function public.retirar_docente_curso(uuid) from public,anon;
grant execute on function public.retirar_docente_curso(uuid) to authenticated;

create function public.panel_cursos(p_anio integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null or coalesce(orientacion_privado.rol_actual(),'') not in ('superadministrador','desarrollador') then raise exception 'No tienes permiso para administrar cursos'; end if;
 return jsonb_build_object('grupos',coalesce((select jsonb_agg(to_jsonb(g) order by g.grado,g.seccion) from(select id,anio_lectivo,grado,seccion from public.grupos where anio_lectivo=p_anio)g),'[]'::jsonb),'docentes',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'nombre',p.nombre) order by p.nombre) from public.perfiles p where rol='docente' and activo and auth_user_id is not null),'[]'::jsonb),'asignaciones',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'docente_id',d.docente_perfil_id,'docente_nombre',d.docente_nombre,'grupo_id',d.grupo_id,'grado',g.grado,'seccion',g.seccion,'activo',d.activo) order by d.docente_nombre,g.grado,g.seccion) from public.docentes_cursos d join public.grupos g on g.id=d.grupo_id where g.anio_lectivo=p_anio),'[]'::jsonb));
end $$;
revoke all on function public.panel_cursos(integer) from public,anon;
grant execute on function public.panel_cursos(integer) to authenticated;

create function public.docentes_de_estudiante(p_estudiante uuid,p_anio integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null or coalesce(orientacion_privado.rol_actual(),'') not in ('orientador','superadministrador','desarrollador') then raise exception 'No tienes permiso para consultar los docentes de esta ficha'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',d.docente_perfil_id,'nombre',d.docente_nombre) order by d.docente_nombre) from public.matriculas m join public.docentes_cursos d on d.grupo_id=m.grupo_id and d.activo where m.estudiante_id=p_estudiante and m.anio_lectivo=p_anio),'[]'::jsonb);
end $$;
revoke all on function public.docentes_de_estudiante(uuid,integer) from public,anon;
grant execute on function public.docentes_de_estudiante(uuid,integer) to authenticated;

-- Proyección específica para docentes; no otorga lectura de la ficha confidencial.
create function orientacion_privado.mis_estudiantes_cursos(p_anio integer,p_grupo uuid,p_busqueda text,p_pagina integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare docente uuid;
begin
 if auth.uid() is null or coalesce(orientacion_privado.rol_actual(),'')<>'docente' then raise exception 'Esta consulta requiere una cuenta docente activa'; end if;
 select id into docente from public.perfiles where auth_user_id=(select auth.uid()) and rol='docente' and activo and not requiere_cambio_password;
 return (
 with cursos as(select g.id,g.anio_lectivo,g.grado,g.seccion from public.docentes_cursos d join public.grupos g on g.id=d.grupo_id where d.docente_perfil_id=docente and d.activo and (p_anio is null or g.anio_lectivo=p_anio)),
 base as(select e.id,e.nombre,m.anio_lectivo,g.id as grupo_id,g.grado,g.seccion from public.matriculas m join cursos g on g.id=m.grupo_id join public.estudiantes e on e.id=m.estudiante_id where not e.archivado and e.estado='activo' and (p_grupo is null or g.id=p_grupo) and (coalesce(btrim(p_busqueda),'')='' or position(lower(btrim(p_busqueda)) in lower(e.nombre))>0)),
 pagina as(select * from base order by nombre,anio_lectivo desc,id limit 25 offset (least(greatest(coalesce(p_pagina,1),1),100000)-1)*25)
 select jsonb_build_object('grupos',coalesce((select jsonb_agg(to_jsonb(g) order by g.grado,g.seccion) from cursos g),'[]'::jsonb),'estudiantes',coalesce((select jsonb_agg(to_jsonb(e) order by e.nombre,e.anio_lectivo desc,e.id) from pagina e),'[]'::jsonb),'total',(select count(*) from base))
 );
end $$;
revoke all on function orientacion_privado.mis_estudiantes_cursos(integer,uuid,text,integer) from public,anon;
grant execute on function orientacion_privado.mis_estudiantes_cursos(integer,uuid,text,integer) to authenticated;
create function public.mis_estudiantes_cursos(p_anio integer default null,p_grupo uuid default null,p_busqueda text default '',p_pagina integer default 1)
returns jsonb language sql stable security invoker set search_path='' as $$
 select orientacion_privado.mis_estudiantes_cursos(p_anio,p_grupo,p_busqueda,p_pagina)
$$;
revoke all on function public.mis_estudiantes_cursos(integer,uuid,text,integer) from public,anon;
grant execute on function public.mis_estudiantes_cursos(integer,uuid,text,integer) to authenticated;
