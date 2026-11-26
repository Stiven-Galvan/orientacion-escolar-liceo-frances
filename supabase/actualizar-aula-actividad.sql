-- Complemento de observaciones de aula. Conserva permisos y registros existentes.
do $aula$
declare definicion text;
begin
 select pg_get_functiondef('orientacion_privado.actividad_flujo(text,uuid,jsonb)'::regprocedure) into definicion;
 if strpos(definicion,'''nombre_actividad'',''objetivo_actividad'',''motivo_otro''')=0 then
  if strpos(definicion,'''docente_actividad'',''motivo_otro''')=0 then
   raise exception 'La función de actividades cambió. Revisa la versión antes de aplicar esta actualización.';
  end if;
  definicion:=replace(definicion,'''docente_actividad'',''motivo_otro''','''docente_actividad'',''nombre_actividad'',''objetivo_actividad'',''motivo_otro''');
  definicion:=replace(definicion,'case when k=''observaciones'' then 6000','case when k=''nombre_actividad'' then 180 when k=''objetivo_actividad'' then 4000 when k=''observaciones'' then 6000');
  definicion:=replace(definicion,'''docente_actividad'',ac.datos->''docente_actividad'',''estado''','''docente_actividad'',ac.datos->''docente_actividad'',''nombre_actividad'',ac.datos->''nombre_actividad'',''objetivo_actividad'',ac.datos->''objetivo_actividad'',''estado''');
  definicion:=replace(definicion,'coalesce(ac.datos->>''estudiante_nombre'','''')||'' ''||ac.autor_nombre','coalesce(ac.datos->>''estudiante_nombre'','''')||'' ''||coalesce(ac.datos->>''nombre_actividad'','''')||'' ''||coalesce(ac.datos->>''objetivo_actividad'','''')||'' ''||ac.autor_nombre');
  if strpos(definicion,'when k=''objetivo_actividad'' then 4000')=0 then raise exception 'No se pudo actualizar la validación de los nuevos campos';end if;
  execute definicion;
 end if;
end
$aula$;

