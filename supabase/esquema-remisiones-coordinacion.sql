alter table public.remisiones add column origen text not null default 'docente' check(origen in ('docente','coordinacion'));
CREATE OR REPLACE FUNCTION orientacion_privado.remision_flujo(p_accion text, p_id uuid DEFAULT NULL::uuid, p_datos jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 rol_actor text:=orientacion_privado.rol_actual(); actor public.perfiles%rowtype; doc public.perfiles%rowtype;
 r public.remisiones%rowtype; g public.grupos%rowtype; e public.estudiantes%rowtype; a public.remision_adjuntos%rowtype;
 admin boolean; datos_limpios jsonb; k text; v text; grupo uuid; docid uuid; sid uuid; nr uuid; fecha date; n int; ruta_archivo text; consulta text;
begin
 if auth.uid() is null or coalesce(rol_actor,'') not in ('docente','coordinacion_academica','coordinacion_convivencial','orientador','superadministrador','desarrollador') then raise exception using errcode='42501',message='No tienes acceso a remisiones';end if;
 if p_datos is null or jsonb_typeof(p_datos)<>'object' or length(p_datos::text)>3000000 then raise exception 'Contenido inválido';end if;
 select * into actor from public.perfiles where auth_user_id=auth.uid();admin:=rol_actor in ('superadministrador','desarrollador');
 if p_accion='opciones' then
  return jsonb_build_object('grupos',coalesce((select jsonb_agg(to_jsonb(x) order by x.anio_lectivo desc,x.grado,x.seccion) from(select gr.id,gr.anio_lectivo,gr.grado,gr.seccion from public.grupos gr where admin or rol_actor in ('coordinacion_academica','coordinacion_convivencial') or exists(select 1 from public.docentes_cursos dc where dc.grupo_id=gr.id and dc.docente_perfil_id=actor.id and dc.activo))x),'[]'::jsonb),'docentes',case when rol_actor='desarrollador' then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'nombre',p.nombre) order by p.nombre) from public.perfiles p where p.rol='docente' and p.activo and p.auth_user_id is not null),'[]'::jsonb) else '[]'::jsonb end);
 elsif p_accion='buscar_estudiantes' then
  if rol_actor not in ('docente','desarrollador','coordinacion_academica','coordinacion_convivencial') then raise exception using errcode='42501',message='Acceso restringido';end if;
  grupo:=(p_datos->>'grupo_id')::uuid;consulta:=lower(btrim(coalesce(p_datos->>'busqueda','')));
  if length(consulta)<2 then return '[]'::jsonb;end if;
  if rol_actor='docente' and not exists(select 1 from public.docentes_cursos dc where dc.grupo_id=grupo and dc.docente_perfil_id=actor.id and dc.activo) then raise exception using errcode='42501',message='Selecciona uno de tus cursos';end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from(select al.id,al.nombre,al.tipo_documento,al.numero_documento,date_part('year',age(now(),al.fecha_nacimiento))::int as edad from public.estudiantes al join public.matriculas m on m.estudiante_id=al.id where m.grupo_id=grupo and al.estado='activo' and not al.archivado and not al.eliminando and strpos(lower(al.nombre||' '||coalesce(al.numero_documento,'')),consulta)>0 order by al.nombre limit 20)x),'[]'::jsonb);
 elsif p_accion='notificaciones' then
  return jsonb_build_object('sin_leer',(select count(*) from public.remision_notificaciones no where no.destinatario=auth.uid() and no.leida_en is null and orientacion_privado.remision_visible(no.remision_id)),'items',coalesce((select jsonb_agg(to_jsonb(x) order by x.creado_en desc,x.id) from(select no.* from public.remision_notificaciones no where no.destinatario=auth.uid() and orientacion_privado.remision_visible(no.remision_id) order by no.creado_en desc,no.id limit 100)x),'[]'::jsonb));
 elsif p_accion='leer_notificacion' then
  update public.remision_notificaciones no set leida_en=coalesce(no.leida_en,now()) where no.id=p_id and no.destinatario=auth.uid() and orientacion_privado.remision_visible(no.remision_id) returning no.remision_id into nr;
  if nr is null then raise exception using errcode='42501',message='Notificación no disponible';end if;return jsonb_build_object('remision_id',nr);
 elsif p_accion='listar' or p_accion='por_estudiante' then
  consulta:=lower(btrim(coalesce(p_datos->>'busqueda','')));
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.actualizado_en desc,x.id) from(select rm.id,rm.estado,rm.docente_nombre,rm.docente_id,rm.destino,rm.datos->>'nombre' as nombre,rm.datos->>'documento' as documento,rm.anio_lectivo,rm.grado,rm.seccion,rm.actualizado_en,rm.estudiante_id,rm.orientador_nombre from public.remisiones rm where orientacion_privado.remision_visible(rm.id) and (p_accion<>'por_estudiante' or rm.estudiante_id=p_id) and (coalesce(p_datos->>'estado','')='' or rm.estado=p_datos->>'estado') and (consulta='' or strpos(lower(coalesce(rm.datos->>'nombre','')||' '||coalesce(rm.datos->>'documento','')||' '||rm.docente_nombre),consulta)>0) order by rm.actualizado_en desc,rm.id limit 500)x),'[]'::jsonb);
 end if;
 if p_id is null then raise exception 'Falta identificar la remisión';end if;
 perform 1 from public.estudiantes al where al.id=(select rm.estudiante_id from public.remisiones rm where rm.id=p_id) for update;
 select * into r from public.remisiones where id=p_id for update;
 if p_accion='guardar_docente' then
  if rol_actor not in ('docente','desarrollador','coordinacion_academica','coordinacion_convivencial') then raise exception using errcode='42501',message='Solo docentes y desarrollador pueden diligenciar la remisión';end if;
  docid:=case when rol_actor in ('docente','coordinacion_academica','coordinacion_convivencial') then actor.id else coalesce(nullif(p_datos->>'docente_id','')::uuid,r.docente_id) end;
  select * into doc from public.perfiles p where p.id=docid and p.activo and (p.rol='docente' or ((p.id=actor.id or (rol_actor='desarrollador' and r.origen='coordinacion' and p.id=r.docente_id)) and p.rol in ('coordinacion_academica','coordinacion_convivencial'))) and p.auth_user_id is not null;
  if not found then raise exception 'Selecciona un docente activo';end if;
  if r.id is not null then
   if r.estado<>'borrador' or (not admin and r.docente_auth<>auth.uid()) or r.docente_id<>docid or r.origen is distinct from (case when doc.rol='docente' then 'docente' else 'coordinacion' end) then raise exception using errcode='42501',message='Esta remisión ya no se puede editar';end if;
   if (p_datos->>'version')::int is distinct from r.version then raise exception 'La remisión cambió en otra sesión. Actualiza antes de guardar';end if;
  end if;
  select * into g from public.grupos where id=(p_datos->>'grupo_id')::uuid;
  if not found or (doc.rol='docente' and not exists(select 1 from public.docentes_cursos dc where dc.grupo_id=g.id and dc.docente_perfil_id=doc.id and dc.activo)) then raise exception 'El curso debe estar asignado al docente que remite';end if;
  if doc.rol in ('coordinacion_academica','coordinacion_convivencial') then p_datos:=p_datos||jsonb_build_object('destino',doc.rol);end if;
  if coalesce(p_datos->>'destino','') not in ('coordinacion_academica','coordinacion_convivencial') then raise exception 'Selecciona la coordinación de destino';end if;
  datos_limpios:='{}'::jsonb;
  for k in select unnest(array['nombre','tipo_documento','documento','edad','eps','reprobo','acudiente','telefono1','telefono2','motivo','riesgos','estrategias']) loop
   v:=btrim(coalesce(p_datos->'datos'->>k,''));
   if length(v)>(case when k in ('motivo','riesgos','estrategias') then 6000 when k in ('nombre','acudiente') then 180 else 100 end) then raise exception 'El campo % es demasiado extenso',k;end if;
   datos_limpios:=datos_limpios||jsonb_build_object(k,v);
  end loop;
  datos_limpios:=jsonb_set(datos_limpios,'{documento}',to_jsonb(upper(regexp_replace(datos_limpios->>'documento','[[:space:]]','','g'))));
  sid:=nullif(p_datos->>'estudiante_id','')::uuid;
  if sid is not null then
   select * into e from public.estudiantes where id=sid and not archivado and not eliminando and estado='activo' for key share;
   if not found or not exists(select 1 from public.matriculas m where m.estudiante_id=sid and m.grupo_id=g.id) or lower(e.nombre)<>lower(datos_limpios->>'nombre') or coalesce(e.numero_documento,'')<>datos_limpios->>'documento' then raise exception 'El estudiante seleccionado no coincide con los datos y el curso';end if;
  end if;
  if r.id is null then
   insert into public.remisiones(id,docente_id,docente_auth,docente_nombre,grupo_id,anio_lectivo,grado,seccion,estudiante_id,datos,destino,firma_docente,creado_por,creado_nombre,origen,firma_coordinacion)
   values(p_id,doc.id,doc.auth_user_id,doc.nombre,g.id,g.anio_lectivo,g.grado,g.seccion,sid,datos_limpios,p_datos->>'destino',case when doc.rol='docente' then coalesce(p_datos->'firma','{}') else '{}'::jsonb end,auth.uid(),actor.nombre,case when doc.rol='docente' then 'docente' else 'coordinacion' end,case when doc.rol<>'docente' then coalesce(p_datos->'firma','{}') else '{}'::jsonb end) returning * into r;
  else
   update public.remisiones set grupo_id=g.id,anio_lectivo=g.anio_lectivo,grado=g.grado,seccion=g.seccion,estudiante_id=sid,datos=datos_limpios,destino=p_datos->>'destino',firma_docente=case when doc.rol='docente' then coalesce(p_datos->'firma','{}') else '{}'::jsonb end,firma_coordinacion=case when doc.rol<>'docente' then coalesce(p_datos->'firma','{}') else '{}'::jsonb end,version=version+1,actualizado_en=now() where id=p_id returning * into r;
  end if;
  return to_jsonb(r);
 end if;
 if r.id is null or not orientacion_privado.remision_visible(p_id) then raise exception using errcode='42501',message='La remisión no está disponible para tu perfil';end if;
 if exists(select 1 from public.estudiantes al where al.id=r.estudiante_id and al.eliminando) then raise exception 'El expediente está en eliminación';end if;
 if p_accion='detalle' then
  return jsonb_build_object('remision',to_jsonb(r),'adjuntos',coalesce((select jsonb_agg(to_jsonb(ad) order by ad.creado_en) from public.remision_adjuntos ad where ad.remision_id=p_id),'[]'::jsonb),'historial',coalesce((select jsonb_agg(to_jsonb(x) order by x.fecha desc,x.id desc) from(select h.id,h.accion,h.actor_nombre,h.fecha,h.anterior->>'estado' as antes,h.nuevo->>'estado' as despues from public.historial h where h.tabla='remisiones' and h.registro_id=p_id order by h.fecha desc,h.id desc limit 100)x),'[]'::jsonb));
 elsif p_accion in ('reservar_adjunto','retirar_adjunto','quitar_adjunto','confirmar_adjunto') then
  if r.estado<>'borrador' or (r.docente_auth<>auth.uid() and rol_actor<>'desarrollador') then raise exception using errcode='42501',message='Los adjuntos solo se modifican antes de enviar';end if;
  nr:=(p_datos->>'id')::uuid;
  if p_accion='reservar_adjunto' then
   if (select count(*) from public.remision_adjuntos where remision_id=p_id)>=10 then raise exception 'Máximo 10 adjuntos por remisión';end if;
   ruta_archivo:=p_id::text||'/'||nr::text;
   insert into public.remision_adjuntos(id,remision_id,nombre,tipo,tamano,ruta) values(nr,p_id,p_datos->>'nombre',p_datos->>'tipo',(p_datos->>'tamano')::bigint,ruta_archivo) returning * into a;
  else
   select * into a from public.remision_adjuntos where id=nr and remision_id=p_id for update;
   if not found then raise exception 'Adjunto no disponible';end if;
   if p_accion='confirmar_adjunto' then
    if a.retirando or not exists(select 1 from storage.objects o where o.bucket_id='remisiones-soportes' and o.name=a.ruta and (o.metadata->>'size')::bigint=a.tamano and o.metadata->>'mimetype'=a.tipo) then raise exception 'No terminó la subida del adjunto';end if;
    update public.remision_adjuntos set completo=true where id=nr returning * into a;
   elsif p_accion='retirar_adjunto' then update public.remision_adjuntos set retirando=true where id=nr returning * into a;
   else
    if exists(select 1 from storage.objects o where o.bucket_id='remisiones-soportes' and o.name=a.ruta) then raise exception 'Primero retira el archivo del almacenamiento';end if;
    delete from public.remision_adjuntos where id=nr;
   end if;
  end if;
  return to_jsonb(a);
 elsif p_accion='preparar_estudiante' then
  if rol_actor not in ('orientador','superadministrador','desarrollador') or r.estado not in ('aceptada','vinculada') or (not admin and r.orientador_id<>actor.id) then raise exception using errcode='42501',message='Primero acepta y firma la remisión con tu cuenta';end if;
  select * into e from public.estudiantes where id=r.estudiante_id or (numero_documento=r.datos->>'documento' and r.datos->>'documento'<>'') order by (id=r.estudiante_id) desc nulls last limit 1;
  return jsonb_build_object('remision_id',r.id,'existente',case when e.id is null then null else jsonb_build_object('id',e.id,'nombre',e.nombre,'eliminando',e.eliminando,'archivado',e.archivado) end,'inicial',jsonb_build_object('nombre',r.datos->>'nombre','tipo_documento',r.datos->>'tipo_documento','numero_documento',r.datos->>'documento','acudiente_nombre',r.datos->>'acudiente','acudiente_telefono',r.datos->>'telefono1','anio_lectivo',r.anio_lectivo,'grado',r.grado,'seccion',r.seccion));
 elsif p_accion='registrar_estudiante' then
  if rol_actor not in ('orientador','superadministrador','desarrollador') or r.estado not in ('aceptada','vinculada') or (not admin and r.orientador_id<>actor.id) then raise exception using errcode='42501',message='Solo quien recibió la remisión o administración puede vincular el estudiante';end if;
  if r.estado='vinculada' then return jsonb_build_object('id',r.estudiante_id);end if;
  perform pg_advisory_xact_lock(hashtextextended('remision:documento:'||(r.datos->>'documento'),0));
  select * into e from public.estudiantes where id=r.estudiante_id or numero_documento=r.datos->>'documento' order by (id=r.estudiante_id) desc nulls last limit 1 for update;
  if e.id is not null then
   if e.eliminando or e.archivado then raise exception 'El registro existente está archivado o en eliminación. Revísalo antes de vincular';end if;sid:=e.id;
  else
   datos_limpios:=p_datos->'formulario';
   if datos_limpios->>'tipo_documento' is distinct from r.datos->>'tipo_documento' or lower(btrim(datos_limpios->>'nombre')) is distinct from lower(r.datos->>'nombre') or upper(regexp_replace(datos_limpios->>'numero_documento','[[:space:]]','','g')) is distinct from r.datos->>'documento' then raise exception 'La identificación y el nombre deben coincidir con la remisión firmada';end if;
   sid:=coalesce(nullif(p_datos->>'id','')::uuid,gen_random_uuid());
   perform public.guardar_estudiante(datos_limpios,sid,null);
  end if;
  update public.remisiones set estudiante_id=sid,estado='vinculada',version=version+1,actualizado_en=now() where id=p_id;
  return jsonb_build_object('id',sid);
 end if;
 if (p_datos->>'version')::int is distinct from r.version then raise exception 'La remisión cambió en otra sesión. Actualiza antes de continuar';end if;
 if p_accion='enviar_docente' then
  if r.estado<>'borrador' or (r.docente_auth<>auth.uid() and rol_actor<>'desarrollador') then raise exception using errcode='42501',message='No puedes enviar esta remisión';end if;
  if r.origen='docente' and not exists(select 1 from public.docentes_cursos dc where dc.docente_perfil_id=r.docente_id and dc.grupo_id=r.grupo_id and dc.activo) then raise exception 'El docente ya no tiene asignado ese curso';end if;
  for k in select unnest(array['nombre','documento','eps','reprobo','acudiente','telefono1','motivo','riesgos','estrategias']) loop
   if length(btrim(coalesce(r.datos->>k,'')))<2 then raise exception 'Completa el campo %',k;end if;
  end loop;
  if coalesce(r.datos->>'tipo_documento','') not in ('TI','RC','CC','CE','PPT','PAS','OTRO') or (r.datos->>'documento')!~'^[A-Z0-9-]{3,30}$' then raise exception 'Revisa el tipo y número de identificación';end if;
  if coalesce(r.datos->>'edad','')!~'^[0-9]{1,3}$' or (r.datos->>'edad')::int not between 1 and 120 or r.datos->>'reprobo' not in ('Sí','No','No se conoce') then raise exception 'Revisa edad y repitencia';end if;
  if not orientacion_privado.piar_firma_valida(case when r.origen='coordinacion' then r.firma_coordinacion else r.firma_docente end) then raise exception 'Falta la firma electrónica de quien remite y su aceptación';end if;
  if exists(select 1 from public.remision_adjuntos ad where ad.remision_id=p_id and (not ad.completo or ad.retirando or not exists(select 1 from storage.objects o where o.bucket_id='remisiones-soportes' and o.name=ad.ruta and (o.metadata->>'size')::bigint=ad.tamano))) then raise exception 'Hay adjuntos pendientes. Termina la subida o retíralos antes de enviar';end if;
  if r.origen='coordinacion' then
   if rol_actor not in ('coordinacion_academica','coordinacion_convivencial','desarrollador') then raise exception using errcode='42501',message='La coordinación autora debe enviar esta remisión';end if;
   update public.remisiones set estado='aprobada',enviado_en=now(),decidido_en=now(),coordinador_nombre=actor.nombre,coordinador_auth=auth.uid(),version=version+1,actualizado_en=now() where id=p_id returning * into r;
   insert into public.remision_notificaciones(remision_id,destinatario,mensaje) select r.id,p.auth_user_id,r.docente_nombre||' envió una remisión de coordinación para '||(r.datos->>'nombre')||'. Disponible para recepción de orientación.' from public.perfiles p where p.rol='orientador' and p.activo and p.auth_user_id is not null;
  else
  if not exists(select 1 from public.perfiles p where p.rol=r.destino and p.activo and p.auth_user_id is not null) then raise exception 'No hay una coordinación activa para recibir la solicitud';end if;
  update public.remisiones set estado='pendiente_coordinacion',enviado_en=now(),version=version+1,actualizado_en=now() where id=p_id returning * into r;
  insert into public.remision_notificaciones(remision_id,destinatario,mensaje) select r.id,p.auth_user_id,r.docente_nombre||' envió una solicitud de remisión para '||(r.datos->>'nombre') from public.perfiles p where p.rol=r.destino and p.activo and p.auth_user_id is not null;
  end if;
 elsif p_accion in ('aprobar','rechazar') then
  if r.estado<>'pendiente_coordinacion' or (not admin and rol_actor<>r.destino) then raise exception using errcode='42501',message='Solo la coordinación destinataria puede decidir esta solicitud pendiente';end if;
  if p_accion='rechazar' then
   v:=btrim(coalesce(p_datos->>'motivo',''));if length(v) not between 5 and 2000 then raise exception 'Escribe el motivo del rechazo (entre 5 y 2000 caracteres)';end if;
   update public.remisiones set estado='rechazada',motivo_rechazo=v,coordinador_auth=auth.uid(),coordinador_nombre=actor.nombre,decidido_en=now(),version=version+1,actualizado_en=now() where id=p_id returning * into r;
   insert into public.remision_notificaciones(remision_id,destinatario,mensaje) values(p_id,r.docente_auth,'Tu remisión para '||(r.datos->>'nombre')||' fue rechazada por '||actor.nombre||'. Motivo: '||v);
  else
   if not orientacion_privado.piar_firma_valida(p_datos->'firma') then raise exception 'Firma la aprobación de coordinación';end if;
   update public.remisiones set estado='aprobada',firma_coordinacion=p_datos->'firma',coordinador_auth=auth.uid(),coordinador_nombre=actor.nombre,decidido_en=now(),version=version+1,actualizado_en=now() where id=p_id returning * into r;
   insert into public.remision_notificaciones(remision_id,destinatario,mensaje) select r.id,p.auth_user_id,'Remisión aprobada de '||(r.datos->>'nombre')||'. Revisa el formato y acepta para iniciar el registro.' from public.perfiles p where p.rol='orientador' and p.activo and p.auth_user_id is not null;
   insert into public.remision_notificaciones(remision_id,destinatario,mensaje) values(r.id,r.docente_auth,'Coordinación aprobó tu remisión para '||(r.datos->>'nombre')||' y la envió a orientación.');
  end if;
 elsif p_accion='aceptar_orientacion' then
  if rol_actor not in ('orientador','superadministrador','desarrollador') then raise exception using errcode='42501',message='Solo orientación puede recibir esta remisión';end if;
  if r.estado<>'aprobada' then raise exception 'La remisión ya fue recibida por otro orientador o no está aprobada. Actualiza la consulta';end if;
  if not orientacion_privado.piar_firma_valida(p_datos->'firma') then raise exception 'Firma la recepción de orientación';end if;
  update public.remisiones set estado='aceptada',orientador_id=actor.id,orientador_nombre=actor.nombre,firma_orientacion=p_datos->'firma',recibido_en=now(),version=version+1,actualizado_en=now() where id=p_id returning * into r;
  insert into public.remision_notificaciones(remision_id,destinatario,mensaje) values(r.id,r.docente_auth,actor.nombre||' recibió y firmó la remisión de '||(r.datos->>'nombre')||'.');
 else raise exception 'Acción de remisión no válida';end if;
 return to_jsonb(r);
end $function$;


create or replace function orientacion_privado.remision_visible(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.remisiones r where r.id=p_id and (
 orientacion_privado.rol_actual() in ('superadministrador','desarrollador') or
 (orientacion_privado.rol_actual() in ('docente','coordinacion_academica','coordinacion_convivencial') and r.docente_auth=auth.uid()) or
 (orientacion_privado.rol_actual()=r.destino and r.estado<>'borrador') or
 (orientacion_privado.rol_actual()='orientador' and r.estado in ('aprobada','aceptada','vinculada'))));
$$;
