export const GRADOS = [
  { valor: "pre-kinder", nombre: "Pre-Kínder" },
  { valor: "kinder", nombre: "Kínder" },
  { valor: "transicion", nombre: "Transición" },
  ...Array.from({ length: 11 }, (_, index) => ({ valor: String(index + 1), nombre: `${index + 1}.º` })),
];
export const DOCUMENTOS = ["TI", "RC", "CC", "CE", "PPT", "PAS", "OTRO"];
export const nombreGrado = (grado: string | null) => GRADOS.find(item => item.valor === grado)?.nombre ?? "Sin grado";
export const fechaColombia = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const anioActual = () => Number(fechaColombia().slice(0, 4));
export type Resumen = {
  id: string; nombre: string; tipo_documento: string | null; numero_documento: string | null;
  estado: string; es_prueba: boolean; version: number; eliminando: boolean; anio_lectivo: number | null; grado: string | null; seccion: string | null;
};
export type Estudiante = {
  id: string; nombre: string; tipo_documento: string | null; numero_documento: string | null;
  fecha_nacimiento: string | null; estado: string; es_prueba: boolean; version: number; eliminando: boolean;
  acudiente_nombre: string | null; acudiente_parentesco: string | null; acudiente_telefono: string | null; acudiente_correo: string | null;
  creado_en: string; actualizado_en: string;
};
export type Matricula = { id: string; anio_lectivo: number; grado: string; seccion: string };
export type Evento = { id: number; tabla: string; accion: string; fecha: string; actor_nombre: string | null; anterior: Record<string, unknown> | null; nuevo: Record<string, unknown> | null };
export type Ficha = { estudiante: Estudiante; matriculas: Matricula[]; historial: Evento[] };
export type DatosFormulario = {
  nombre: string; tipo_documento: string; numero_documento: string; fecha_nacimiento: string;
  estado: string; es_prueba: boolean; acudiente_nombre: string; acudiente_parentesco: string;
  acudiente_telefono: string; acudiente_correo: string; anio_lectivo: number; grado: string; seccion: string;
};
export function mensajeError(error: unknown) {
  const fallo = error as { code?: string; message?: string };
  if (fallo?.code === "23505") return "Ya existe un registro con ese documento o identificador. Busca al estudiante antes de volver a crearlo.";
  if (fallo?.code === "23514" || fallo?.code === "23502") return "Revisa los campos: nombre, documento, nacimiento, correo, año y grado deben ser válidos.";
  if (fallo?.code === "42501") return "Tu cuenta no tiene permiso para realizar esta operación. Recarga o vuelve a ingresar.";
  return fallo?.message ?? "No se pudo conectar con la base de datos. Revisa la conexión.";
}
