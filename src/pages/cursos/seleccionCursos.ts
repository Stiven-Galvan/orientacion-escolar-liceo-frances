import { GRADOS } from "../estudiantes/modelos";
export type Curso = { id: string; anio_lectivo: number; grado: string; seccion: string };
export function ordenarCursos(cursos: Curso[]) {
  return [...cursos].sort((a, b) => GRADOS.findIndex(g => g.valor === a.grado) - GRADOS.findIndex(g => g.valor === b.grado) || a.seccion.localeCompare(b.seccion, "es"));
}
export function seleccionarRango(cursos: Curso[], desde: string, hasta: string, seccion: string, excluirGrados: string[] = [], excluirCursos: string[] = []) {
  const inicio = GRADOS.findIndex(g => g.valor === desde);
  const fin = GRADOS.findIndex(g => g.valor === hasta);
  if (inicio < 0 || fin < 0 || inicio > fin) return { cursos: [] as Curso[], faltantes: [] as string[], error: "El grado inicial debe ser anterior o igual al grado final." };
  const grados = GRADOS.slice(inicio, fin + 1).filter(g => !excluirGrados.includes(g.valor));
  const encontrados = ordenarCursos(cursos.filter(c => grados.some(g => g.valor === c.grado) && (seccion === "*" || c.seccion === seccion)));
  const faltantes = grados.filter(g => !encontrados.some(c => c.grado === g.valor)).map(g => g.nombre);
  return { cursos: encontrados.filter(c => !excluirCursos.includes(c.id)), faltantes, error: "" };
}
