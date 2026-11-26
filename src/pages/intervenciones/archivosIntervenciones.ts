import { presentarDocumentoInstitucional } from '../../lib/documentosInstitucionales';
import { ESQUEMAS } from './modelosIntervenciones';
import { PDFDocument } from 'pdf-lib';
import { supabase } from '../../lib/supabase';
import { intervencion,descargarDocumentoIntervencion,BUCKET_INTERVENCIONES } from './modelosIntervenciones';
import type { DatosIntervencion,Intervencion,TipoIntervencion,DocumentoIntervencion,DetalleIntervencion } from './modelosIntervenciones';
import { pdfIntervencion } from './pdfIntervencion';
function serializar(v:unknown):string{if(Array.isArray(v))return '['+v.map(serializar).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+serializar((v as Record<string,unknown>)[k])).join(',')+'}';return JSON.stringify(v);}
async function subir(ruta:string,blob:Blob){if(!supabase)throw new Error('Falta conexión');const {error}=await supabase.storage.from(BUCKET_INTERVENCIONES).upload(ruta,blob,{contentType:'application/pdf',upsert:false});if(error)throw error;}
export async function guardarIntervencion(id:string,tipo:TipoIntervencion,datos:DatosIntervencion,ids:string[],guardada:Intervencion|null,onGuardado:(r:Intervencion)=>void,listado?:File|null){
 const mismosIds=guardada&&JSON.stringify(guardada.estudiantes.map(e=>e.id).sort())===JSON.stringify([...ids].sort());
 const r=guardada&&mismosIds&&serializar(guardada.datos)===serializar(datos)?guardada:await intervencion<Intervencion>('guardar',id,{tipo,datos,estudiantes_ids:ids,version:guardada?.version});onGuardado(r);
 let adicional:Blob|undefined;
 if(r.datos.asistencia){const a=await intervencion<DocumentoIntervencion>('reservar_asistencia',id,{version:r.version});if(!a.completo){if(!a.subido){if(!listado)throw new Error('Vuelve a seleccionar el PDF de asistencia para terminar su subida.');await subir(a.ruta,listado);}await intervencion('confirmar_documento',id,{archivo_id:a.id});}adicional=listado??await descargarDocumentoIntervencion(a.ruta);}
 const blob=await pdfIntervencion(r,adicional);if(blob.size>20*1024*1024)throw new Error('El PDF completo supera 20 MB. Reduce el listado adicional.');const hash=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());const sha256=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
 const ar=await intervencion<DocumentoIntervencion>('reservar_pdf',id,{version:r.version,tamano:blob.size,sha256});if(!ar.completo){if(!ar.subido)await subir(ar.ruta,blob);await intervencion('confirmar_documento',id,{archivo_id:ar.id});}return r;
}
export async function abrirPdfIntervencion(id:string,version?:number){const d=await intervencion<DetalleIntervencion>('detalle',id);const a=d.documentos.find(a=>a.clase==='pdf'&&a.version===(version??d.registro.version)&&a.completo);if(!a)throw new Error('El PDF está pendiente. Continúa el formulario y termina de guardarlo.');const original=await descargarDocumentoIntervencion(a.ruta);const paginas=await PDFDocument.load(await original.arrayBuffer());const anexo=!!d.registro.datos.asistencia;return{blob:await presentarDocumentoInstitucional(original,{titulo:ESQUEMAS[d.registro.tipo].titulo,version:a.version??undefined,superior:(i)=>anexo?paginas.getPage(i).getHeight():688,inferior:anexo?0:58,nota:ESQUEMAS[d.registro.tipo].nota+' Firmas electrónicas sin certificación digital.'}),nombre:a.nombre};}
export async function eliminarIntervencion(id:string){if(!supabase)throw new Error('Falta conexión');const rutas=await intervencion<string[]>('preparar_eliminacion',id);for(let i=0;i<rutas.length;i+=100){const {error}=await supabase.storage.from(BUCKET_INTERVENCIONES).remove(rutas.slice(i,i+100));if(error)throw error;}await intervencion('eliminar',id);}
