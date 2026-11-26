import { supabase } from '../../lib/supabase';
import { ESQUEMAS_INTERVENCIONES } from './esquemaIntervenciones';
import type { FirmaPiar } from '../piar/modelosPiar';
export type TipoIntervencion=keyof typeof ESQUEMAS_INTERVENCIONES;
export type CampoIntervencion={clave:string;etiqueta:string;tipo:string;maximo:number;requerido:boolean;seccion:number;opciones?:readonly string[];condicion?:readonly string[]};
export type EsquemaIntervencion={titulo:string;subtitulo:string;secciones:readonly string[];campos:readonly CampoIntervencion[];nota:string};
export const ESQUEMAS:Record<TipoIntervencion,EsquemaIntervencion>=ESQUEMAS_INTERVENCIONES;
export const TIPOS_INTERVENCION=Object.keys(ESQUEMAS) as TipoIntervencion[];
export type EstudianteIntervencion={id:string;nombre:string;documento:string|null;curso:string;anio_lectivo:number|null;edad:number|null};
export type ParticipanteIntervencion={id:string;nombre:string;rol:string;firma:FirmaPiar|null};
export type AcuerdoIntervencion={id:string;accion:string;responsable:string;fecha:string};
export type AsistenciaIntervencion={id:string;nombre:string;tamano:number};
export type DatosIntervencion={campos:Record<string,string|string[]>;participantes:ParticipanteIntervencion[];acuerdos:AcuerdoIntervencion[];firma_orientador:FirmaPiar;firma_extra:FirmaPiar|null;total_participantes:number;asistencia:AsistenciaIntervencion|null};
export type Intervencion={id:string;tipo:TipoIntervencion;datos:DatosIntervencion;estudiantes:EstudianteIntervencion[];version:number;autor_id:string;autor_nombre:string;creado_en:string;actualizado_en:string;eliminando:boolean;pdf_guardado?:boolean};
export type DocumentoIntervencion={id:string;intervencion_id:string;clase:'pdf'|'asistencia';version:number|null;nombre:string;ruta:string;tamano:number;completo:boolean;subido?:boolean};
export type DetalleIntervencion={registro:Intervencion;documentos:DocumentoIntervencion[];historial:{id:number;fecha:string;actor_nombre:string;accion:string;version:number}[]};
export const BUCKET_INTERVENCIONES='intervenciones-archivos';
export async function intervencion<T>(accion:string,id:string|null=null,datos:Record<string,unknown>={}):Promise<T>{if(!supabase)throw new Error('Falta conexión con Supabase');const {data,error}=await supabase.rpc('intervencion_flujo',{p_accion:accion,p_id:id,p_datos:datos});if(error)throw error;return data as T;}
export const fechaIntervencion=(s:string)=>new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',dateStyle:'medium',timeStyle:'short'}).format(new Date(s));
export function visibleCampo(c:CampoIntervencion,campos:DatosIntervencion['campos']){if(!c.condicion)return true;const [k,v]=c.condicion;return Array.isArray(campos[k])?(campos[k] as string[]).includes(v):campos[k]===v;}
export const valorIntervencion=(v:unknown)=>(Array.isArray(v)?v.filter(x=>typeof x==='string'&&x.trim()).join(' · '):typeof v==='string'&&v.trim()?v:'')||'Sin registrar';
export async function descargarDocumentoIntervencion(ruta:string){if(!supabase)throw new Error('Falta conexión');const {data,error}=await supabase.storage.from(BUCKET_INTERVENCIONES).download(ruta);if(error||!data)throw error??new Error('Archivo no disponible');return data;}
