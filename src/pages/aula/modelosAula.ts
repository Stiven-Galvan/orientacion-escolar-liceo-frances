import { supabase } from '../../lib/supabase';
import { actividad,BUCKET_ACTIVIDADES } from '../actividades/modelosActividades';
import type { ArchivoActa,GrupoActividad } from '../actividades/modelosActividades';
import type { FirmaPiar } from '../piar/modelosPiar';
import { generarPdfAula } from './pdfAula';
export type DatosAula={fecha:string;hora:string;curso:string;docente_actividad:string;nombre_actividad?:string;objetivo_actividad?:string;motivos:string[];motivo_otro:string;aspectos:string[];aspecto_otro:string;observaciones:string;fortalezas:string;acuerdos:string;revision_fecha:string;revision_responsable:string;resultado:string;estado:'Pendiente'|'En seguimiento'|'Cerrado';firma1:FirmaPiar;fotos:[]};
export type RegistroAula={id:string;tipo:'observacion_aula';datos:DatosAula;version:number;autor_id:string;autor_nombre:string;creado_en:string;actualizado_en:string;eliminando:boolean;pdf_guardado?:boolean};
export type DetalleAula={acta:RegistroAula;archivos:ArchivoActa[];historial:{id:number;fecha:string;actor_nombre:string;accion:string;version:number}[]};
export type { GrupoActividad };
export const MOTIVOS_AULA=['Preventiva','Seguimiento','Solicitud docente','Otro'];
export const ASPECTOS_AULA=['Atención y concentración','Seguimiento de instrucciones','Participación','Respeto y trato entre compañeros','Manejo de conflictos','Interrupciones o desorden','Integración y trabajo en equipo','Cuidado del espacio y los materiales','Ninguno identificado','Otro'];
export const ESTADOS_AULA=['Pendiente','En seguimiento','Cerrado'] as const;
export async function aula<T>(accion:string,id:string|null=null,datos:Record<string,unknown>={}):Promise<T>{return actividad<T>(accion,id,{...datos,tipo:'observacion_aula'});}
export const nombrePdfAula=(d:Pick<DatosAula,'curso'|'fecha'>)=>'observacion_aula_'+d.curso.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')+'_'+d.fecha+'.pdf';
export async function guardarAula(id:string,d:DatosAula,guardada:RegistroAula|null,onGuardar:(r:RegistroAula)=>void){
 function serializar(v:unknown):string{if(Array.isArray(v))return '['+v.map(serializar).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+serializar((v as Record<string,unknown>)[k])).join(',')+'}';return JSON.stringify(v);}
 if(!supabase)throw new Error('Falta conexión');const r=guardada&&serializar(guardada.datos)===serializar(d)?guardada:await aula<RegistroAula>('guardar',id,{datos:d,version:guardada?.version});onGuardar(r);
 const pdf=await generarPdfAula(r);if(pdf.size>20*1024*1024)throw new Error('El PDF supera el límite de 20 MB.');const hash=await crypto.subtle.digest('SHA-256',await pdf.arrayBuffer());const sha256=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
 const ar=await aula<ArchivoActa>('reservar_pdf',id,{version:r.version,tamano:pdf.size,sha256});if(!ar.completo){if(!ar.subido){const {error}=await supabase.storage.from(BUCKET_ACTIVIDADES).upload(ar.ruta,pdf,{contentType:'application/pdf',upsert:false});if(error)throw error;}await aula('confirmar_pdf',id,{archivo_id:ar.id});}return r;
}
