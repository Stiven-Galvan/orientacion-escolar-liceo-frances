begin;

-- El formato PAP permite 4.000 caracteres en «Necesidades pendientes y apoyos».
-- El campo de compatibilidad debe aceptar el mismo contenido.
alter table public.pap_atenciones
  drop constraint if exists pap_atenciones_apoyo_check;

alter table public.pap_atenciones
  add constraint pap_atenciones_apoyo_check check (length(apoyo) <= 4000);

commit;
