-- Respaldo del cambio aplicado mediante la migración remota gestionar_personal.
-- No ejecutar de nuevo en el proyecto donde ya se aplicó.
alter table public.perfiles drop constraint perfiles_auth_user_id_fkey;
alter table public.perfiles add constraint perfiles_auth_user_id_fkey foreign key(auth_user_id) references auth.users(id) on delete set null;
-- Los UUID de autoría son referencias históricas y deben sobrevivir a Auth.
alter table public.estudiantes drop constraint estudiantes_creado_por_fkey;
alter table public.historial drop constraint historial_actor_auth_id_fkey;
alter table public.historial add column actor_nombre text;
update public.historial h set actor_nombre=p.nombre from public.perfiles p where p.auth_user_id=h.actor_auth_id;

create or replace function orientacion_privado.auditar_cambio()
returns trigger language plpgsql security definer set search_path='' as $$
declare anterior_json jsonb; nuevo_json jsonb; registro uuid; autor uuid; nombre_autor text;
begin
 if TG_OP <> 'INSERT' then anterior_json:=to_jsonb(OLD); end if;
 if TG_OP <> 'DELETE' then nuevo_json:=to_jsonb(NEW); end if;
 registro:=coalesce((nuevo_json->>'id')::uuid,(anterior_json->>'id')::uuid,(nuevo_json->>'perfil_id')::uuid,(anterior_json->>'perfil_id')::uuid);
 autor:=auth.uid();
 select nombre into nombre_autor from public.perfiles where auth_user_id=autor;
 insert into public.historial(tabla,registro_id,accion,actor_auth_id,actor_nombre,origen,anterior,nuevo)
 values(TG_TABLE_NAME,registro,TG_OP,autor,nombre_autor,case when autor is null then 'administracion_base_datos' else 'usuario_autenticado' end,anterior_json,nuevo_json);
 if TG_OP='DELETE' then return OLD; end if; return NEW;
end $$;
revoke all on function orientacion_privado.auditar_cambio() from public,anon,authenticated;

create table orientacion_privado.bajas_personal (
 perfil_id uuid primary key references public.perfiles(id) on delete cascade,
 auth_user_id uuid,
 solicitado_por uuid not null,
 creado_en timestamptz not null default now()
);
alter table orientacion_privado.bajas_personal enable row level security;
revoke all on orientacion_privado.bajas_personal from public,anon,authenticated;
create policy bajas_sin_acceso_cliente on orientacion_privado.bajas_personal for all to authenticated using(false) with check(false);

create function orientacion_privado.personal_subtipo(p_id uuid,p_rol text)
returns void language plpgsql security definer set search_path='' as $$
begin
 delete from public.docentes where perfil_id=p_id;
 delete from public.orientadores where perfil_id=p_id;
 delete from public.coordinaciones where perfil_id=p_id;
 delete from public.superadministradores where perfil_id=p_id;
 if p_rol='docente' then insert into public.docentes(perfil_id) values(p_id);
 elsif p_rol='orientador' then insert into public.orientadores(perfil_id) values(p_id);
 elsif p_rol='superadministrador' then insert into public.superadministradores(perfil_id) values(p_id);
 elsif p_rol in ('coordinacion_academica','coordinacion_convivencial') then insert into public.coordinaciones(perfil_id,rol) values(p_id,p_rol);
 elsif p_rol is not null then raise exception 'Rol de personal inválido';
 end if;
end $$;
revoke all on function orientacion_privado.personal_subtipo(uuid,text) from public,anon,authenticated;

create function orientacion_privado.personal_operar(p_actor uuid,p_accion text,p_datos jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.perfiles%rowtype; objetivo public.perfiles%rowtype; baja orientacion_privado.bajas_personal%rowtype;
 nuevo_id uuid; cuenta uuid; rol_nuevo text; correo_nuevo text; salida jsonb; claims jsonb;
begin
 -- Serializa altas, cambios y bajas para proteger invariantes entre administradores.
 perform pg_catalog.pg_advisory_xact_lock(782491063);
 select * into actor from public.perfiles where auth_user_id=p_actor;
 if not found or not actor.activo or actor.requiere_cambio_password or actor.rol not in ('superadministrador','desarrollador') then
  raise exception 'No tienes permiso para administrar personal';
 end if;
 if p_accion in ('preparar_eliminacion','finalizar_eliminacion') and actor.rol<>'superadministrador' then raise exception 'Solo superadministradores pueden eliminar personal'; end if;
 claims:=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb);
 perform set_config('request.jwt.claims',(claims || jsonb_build_object('sub',p_actor::text))::text,true);
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 if p_accion='validar' then return jsonb_build_object('autorizado',true); end if;
 if p_accion='listar' then
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'auth_user_id',p.auth_user_id,'nombre',p.nombre,'correo',p.correo,'rol',p.rol,'activo',p.activo,'requiere_cambio_password',p.requiere_cambio_password,'eliminacion_pendiente',b.perfil_id is not null) order by p.nombre),'[]'::jsonb)
  into salida from public.perfiles p left join orientacion_privado.bajas_personal b on b.perfil_id=p.id;
  return salida;
 end if;
 if p_accion='crear' then
  rol_nuevo:=p_datos->>'rol'; correo_nuevo:=lower(btrim(p_datos->>'correo')); cuenta:=(p_datos->>'auth_user_id')::uuid;
  if rol_nuevo is null or rol_nuevo not in ('docente','orientador','superadministrador','coordinacion_academica','coordinacion_convivencial') then raise exception 'Rol de personal inválido'; end if;
  if coalesce(length(btrim(p_datos->>'nombre')),0) not between 2 and 180 then raise exception 'Revisa el nombre'; end if;
  if coalesce(p_datos->>'documento','') !~ '^[0-9]{5,20}$' then raise exception 'Revisa el número de documento'; end if;
  if not exists(select 1 from auth.users where id=cuenta and lower(email)=correo_nuevo and email_confirmed_at is not null) then raise exception 'La cuenta de acceso no coincide'; end if;
  insert into public.perfiles(nombre,correo,rol,auth_user_id,requiere_cambio_password)
  values(btrim(p_datos->>'nombre'),correo_nuevo,rol_nuevo,cuenta,true) returning id into nuevo_id;
  perform orientacion_privado.personal_subtipo(nuevo_id,rol_nuevo);
  insert into orientacion_privado.documentos_personal(perfil_id,tipo_documento,numero_documento)
  values(nuevo_id,'CC',p_datos->>'documento');
  return jsonb_build_object('id',nuevo_id);
 end if;
 select * into objetivo from public.perfiles where id=(p_datos->>'id')::uuid for update;
 if not found then
  if p_accion in ('preparar_eliminacion','finalizar_eliminacion') then return jsonb_build_object('eliminado',true); end if;
  raise exception 'La persona ya no existe';
 end if;
 if objetivo.rol='desarrollador' then raise exception 'El perfil de desarrollador está protegido'; end if;
 if objetivo.id=actor.id then raise exception 'No puedes cambiar tu propio rol ni eliminar tu cuenta'; end if;
 if p_accion='cambiar_rol' then
  if exists(select 1 from orientacion_privado.bajas_personal where perfil_id=objetivo.id) then raise exception 'La cuenta tiene una eliminación pendiente'; end if;
  rol_nuevo:=p_datos->>'rol';
  if rol_nuevo is null or rol_nuevo not in ('docente','orientador','superadministrador','coordinacion_academica','coordinacion_convivencial') then raise exception 'Rol de personal inválido'; end if;
  if objetivo.rol=rol_nuevo then return jsonb_build_object('id',objetivo.id); end if;
 elsif p_accion not in ('preparar_eliminacion','finalizar_eliminacion') then raise exception 'Acción inválida';
 end if;
 if objetivo.rol='superadministrador' and objetivo.activo and objetivo.auth_user_id is not null then
  if (select count(*) from public.perfiles where rol='superadministrador' and activo and auth_user_id is not null)<=1 then raise exception 'Debe quedar al menos un superadministrador activo'; end if;
 end if;
 if p_accion='cambiar_rol' then
  perform orientacion_privado.personal_subtipo(objetivo.id,null);
  update public.perfiles set rol=rol_nuevo where id=objetivo.id;
  perform orientacion_privado.personal_subtipo(objetivo.id,rol_nuevo);
  return jsonb_build_object('id',objetivo.id);
 end if;
 if p_accion='preparar_eliminacion' then
  insert into orientacion_privado.bajas_personal(perfil_id,auth_user_id,solicitado_por)
  values(objetivo.id,objetivo.auth_user_id,p_actor) on conflict(perfil_id) do nothing;
  update public.perfiles set activo=false where id=objetivo.id and activo;
  select * into baja from orientacion_privado.bajas_personal where perfil_id=objetivo.id;
  return jsonb_build_object('auth_user_id',baja.auth_user_id,'id',objetivo.id);
 end if;
 select * into baja from orientacion_privado.bajas_personal where perfil_id=objetivo.id;
 if not found then raise exception 'Primero debes preparar la eliminación'; end if;
 if baja.auth_user_id is not null and exists(select 1 from auth.users where id=baja.auth_user_id) then raise exception 'La cuenta de acceso aún no se eliminó'; end if;
 perform orientacion_privado.personal_subtipo(objetivo.id,null);
 delete from orientacion_privado.documentos_personal where perfil_id=objetivo.id;
 delete from orientacion_privado.bajas_personal where perfil_id=objetivo.id;
 delete from public.perfiles where id=objetivo.id;
 return jsonb_build_object('eliminado',true);
end $$;
revoke all on function orientacion_privado.personal_operar(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function orientacion_privado.personal_operar(uuid,text,jsonb) to service_role;

-- Puente de servicio: sin privilegios elevados y sin ejecución para navegadores.
create function public.personal_gestion(p_actor uuid,p_accion text,p_datos jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select orientacion_privado.personal_operar(p_actor,p_accion,p_datos)
$$;
revoke all on function public.personal_gestion(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.personal_gestion(uuid,text,jsonb) to service_role;
