-- Políticas del almacenamiento privado de remisiones. Respaldo; no ejecutar otra vez.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('remisiones-soportes','remisiones-soportes',false,20971520,array['image/jpeg','image/png','image/webp','application/pdf','application/zip','application/vnd.rar','application/x-7z-compressed']);
create function orientacion_privado.remision_archivo(p_ruta text,p_operacion text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare ad public.remision_adjuntos%rowtype; rm public.remisiones%rowtype; ro text:=orientacion_privado.rol_actual();
begin
 if auth.uid() is null or ro is null then return false;end if;
 select * into ad from public.remision_adjuntos where ruta=p_ruta;
 if not found then return false;end if;
 select * into rm from public.remisiones where id=ad.remision_id;
 if not found then return false;end if;
 if p_operacion='leer' then return orientacion_privado.remision_visible(rm.id);end if;
 if p_operacion='borrar' and ro in ('superadministrador','desarrollador') and exists(select 1 from public.estudiantes e where e.id=rm.estudiante_id and e.eliminando) then return true;end if;
 if exists(select 1 from public.estudiantes e where e.id=rm.estudiante_id and e.eliminando) then return false;end if;
 if rm.estado<>'borrador' or not (rm.docente_auth=auth.uid() or ro='desarrollador') then return false;end if;
 if p_operacion='subir' then return not ad.completo and not ad.retirando;end if;
 if p_operacion='borrar' then return ad.retirando;end if;
 return false;
end $$;
revoke all on function orientacion_privado.remision_archivo(text,text) from public,anon;
grant execute on function orientacion_privado.remision_archivo(text,text) to authenticated;
create policy remision_storage_lectura on storage.objects for select to authenticated using(bucket_id='remisiones-soportes' and orientacion_privado.remision_archivo(name,'leer'));
create policy remision_storage_subida on storage.objects for insert to authenticated with check(bucket_id='remisiones-soportes' and orientacion_privado.remision_archivo(name,'subir'));
create policy remision_storage_borrado on storage.objects for delete to authenticated using(bucket_id='remisiones-soportes' and orientacion_privado.remision_archivo(name,'borrar'));
