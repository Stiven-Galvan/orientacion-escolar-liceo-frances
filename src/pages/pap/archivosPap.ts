import { presentarDocumentoInstitucional } from '../../lib/documentosInstitucionales';
import { supabase } from '../../lib/supabase';
import { pap } from './modelosPap';
import type { DetallePap,ArchivoPap } from './modelosPap';
import { generarPdfPap } from './pdfPap';
export const BUCKET_PAP='pap-archivos';
export async function guardarPdfPap(id:string){
 if(!supabase)throw new Error('No hay conexión');
 const d=await pap<DetallePap>('detalle',id);if(d.archivos.some(a=>a.version===d.atencion.version&&a.completo))return;
 const blob=await generarPdfPap(d.atencion);const bytes=await blob.arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',bytes);const sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const ar=await pap<ArchivoPap>('reservar_archivo',id,{version:d.atencion.version,tamano:blob.size,sha256});
 if(ar.completo)return;
 if(!ar.subido){const {error}=await supabase.storage.from(BUCKET_PAP).upload(ar.ruta,blob,{contentType:'application/pdf',upsert:false,cacheControl:'0'});if(error)throw error;}
 await pap('confirmar_archivo',id,{archivo_id:ar.id});
}
export async function obtenerPdfPap(id:string,version?:number){
 if(!supabase)throw new Error('No hay conexión');const d=await pap<DetallePap>('detalle',id);const v=version??d.atencion.version;const ar=d.archivos.find(a=>a.version===v&&a.completo);
 if(ar){const {data,error}=await supabase.storage.from(BUCKET_PAP).download(ar.ruta);if(error||!data)throw error??new Error('No se pudo descargar el PDF');return{blob:await presentarDocumentoInstitucional(data,{titulo:'Registro de primeros auxilios psicológicos (PAP)',version:v,superior:708,inferior:57,nota:'Registro confidencial de orientación escolar.'}),nombre:ar.nombre};}
 if(v!==d.atencion.version)throw new Error('Esa versión no tiene un PDF disponible');
 return{blob:await generarPdfPap(d.atencion),nombre:d.nombre_archivo};
}
