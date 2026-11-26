import { supabase } from '../../lib/supabase';
import type { FirmaPiar } from '../piar/modelosPiar';
export type FotoActa={id:string;nombre:string;tipo:string;tamano:number;pie:string};
export type FotoLocal=FotoActa&{blob?:Blob};
export type TipoActa='escuela_padres'|'capacitacion_docente';
export type DatosActa={periodo?:string;hora_fin?:string;fecha:string;hora:string;curso:string;lugar:string;responsables:string;tema:string;objetivo:string;descripcion:string;conclusiones:string;compromisos:string;firma1:FirmaPiar;firma2:FirmaPiar|null;fotos:FotoActa[]};
export type Acta={id:string;tipo?:TipoActa;datos:DatosActa;version:number;autor_id:string;autor_nombre:string;creado_en:string;actualizado_en:string;eliminando:boolean;pdf_guardado?:boolean};
export type ArchivoActa={id:string;acta_id:string;version:number;nombre:string;ruta:string;tamano:number;completo:boolean;subido?:boolean};
export type FotoGuardada=FotoActa&{ruta:string;completo:boolean};
export type DetalleActa={acta:Acta;fotos:FotoGuardada[];archivos:ArchivoActa[];historial:{id:number;fecha:string;actor_nombre:string;accion:string;version:number}[]};
export type GrupoActividad={id:string;anio_lectivo:number;grado:string;seccion:string};
export const BUCKET_ACTIVIDADES='actividades-archivos';
export const ROLES_ACTIVIDADES=['orientador','superadministrador','desarrollador'];
export async function actividad<T>(accion:string,id:string|null=null,datos:Record<string,unknown>={}):Promise<T>{if(!supabase)throw new Error('Falta conexión con Supabase');const {data,error}=await supabase.rpc('actividad_flujo',{p_accion:accion,p_id:id,p_datos:datos});if(error)throw error;return data as T;}
export function nombreEscuela(curso:string){return 'escuela_padres_'+curso.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')+'.pdf';}
export const fechaActividad=(s:string)=>new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',dateStyle:'medium',timeStyle:'short'}).format(new Date(s));
export const camposTexto=[['lugar','Lugar',180],['responsables','Responsable(s)',400],['tema','Tema',300],['objetivo','Objetivo',6000],['descripcion','Descripción de la actividad',20000],['conclusiones','Conclusiones',10000],['compromisos','Compromisos',10000]] as const;

export function nombreActa(a:{tipo?:TipoActa;datos:Pick<DatosActa,'curso'|'fecha'>}){return a.tipo==='capacitacion_docente'?'capacitacion_docente_'+a.datos.fecha+'.pdf':nombreEscuela(a.datos.curso);}
export const etiquetaActa=(tipo?:TipoActa)=>tipo==='capacitacion_docente'?'Capacitación docente':'Escuela de padres';
