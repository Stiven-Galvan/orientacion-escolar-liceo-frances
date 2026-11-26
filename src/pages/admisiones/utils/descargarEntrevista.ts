import { descargarDocumento, generarDocumentoTexto } from '../../../lib/documentosInstitucionales';
import type { FirmaDocumento } from '../../../lib/documentosInstitucionales';
const SECCIONES = [
  { titulo: 'Identificación e ingreso', columnas: 2, campos: [
    ['nombre','Nombre del estudiante'], ['fecha','Fecha de entrevista'], ['nacimiento','Fecha de nacimiento'],
    ['tipoDocumento','Tipo de documento'], ['documento','Número de documento'], ['grado','Grado y grupo'],
    ['ingreso','Año de ingreso'], ['orientador','Orientador que realiza la entrevista'],
  ] },
  { titulo: 'Contacto y datos de salud', columnas: 2, campos: [
    ['acudientes','Acudientes'], ['celular','Celular de contacto'], ['correo','Correo de contacto'], ['eps','EPS'], ['ips','IPS'],
  ] },
  { titulo: 'Entrevista y contexto', campos: [
    ['historiaEscolar','Historia escolar del estudiante'], ['contextoFamiliar','Contexto familiar'],
    ['apoyos','Necesidades educativas y apoyos requeridos'], ['documentos','Documentos presentados'],
    ['observacionesFormato','Observaciones del formato de entrevista'],
  ] },
  { titulo: 'Acuerdos y recomendaciones', campos: [
    ['compromisos','Compromisos'], ['recomendaciones','Recomendaciones'],
  ] },
] as const;
export function generarPdfEntrevista(datos:Record<string,string>,firmas?:unknown) {
  const registro=firmas&&typeof firmas==='object'?firmas as Record<string,unknown>:{};
  const lista:FirmaDocumento[]=[];
  for(const [clave,cargo] of [['orientador','Orientador'],['acudiente','Acudiente']]) {
    const valor=registro[clave];if(!valor||typeof valor!=='object')continue;const f=valor as Record<string,unknown>;
    if(typeof f.imagen==='string'&&/^data:image\/(png|jpeg);base64,/.test(f.imagen))lista.push({imagen:f.imagen,nombre:String(f.nombre??''),documento:String(f.documento??''),cargo});
  }
  // Explicit field allowlist: never exports confidential additional notes or clinical supports.
  return generarDocumentoTexto('Entrevista de admisión',SECCIONES.map(seccion=>({
    ...seccion, campos:seccion.campos.map(([clave,titulo])=>({titulo,valor:datos[clave]??''})),
  })),lista);
}
export async function descargarEntrevista(datos:Record<string,string>,firmas?:unknown) {
  const blob=await generarPdfEntrevista(datos,firmas);
  const nombre=(datos.nombre||'estudiante').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_');
  descargarDocumento(blob,`entrevista_${nombre}_${datos.fecha??''}.pdf`);
}
