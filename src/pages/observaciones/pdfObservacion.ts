import { generarDocumentoTexto } from '../../lib/documentosInstitucionales';
import { fecha } from './modelos';
import type { Observacion } from './modelos';
export function generarPdfObservacion(o:Observacion) {
  const campos = (pares: [string, string | null | undefined][]) =>
    pares.map(([titulo,valor])=>({titulo,valor:valor??''}));
  return generarDocumentoTexto('Formato de observación docente',[
    {titulo:'Estudiante y registro',columnas:2,campos:campos([
      ['Estudiante',o.estudiante_nombre],['Curso y año',o.curso+' · '+o.anio_lectivo],
      ['Período académico',String(o.periodo)],['Docente',o.docente_nombre],
      ['Registrado por',o.enviado_nombre||o.docente_nombre],['Fecha',fecha(o.enviado_en||o.solicitado_en)],
    ])},
    {titulo:'Estrategias y ajustes',campos:campos([
      ['Asignaturas',o.asignaturas?.join(' · ')],['Ajustes razonables',o.ajustes?.join('\n')],['Estrategias adicionales',o.adicionales],
    ])},
    {titulo:'Desempeño y resultado',campos:campos([
      ['Desempeño convivencial',o.desempeno_convivencial],['Desempeño académico',o.desempeno_academico],
      ['Observación corta o resultado',o.resultado],
    ])},
  ]);
}
