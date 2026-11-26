import { supabase } from '../../lib/supabase';
import { CAMPOS_PAP } from './camposPap';
export type CampoPap={seccion:string;clave:string;etiqueta:string;tipo:string;requerido:boolean;maximo:number;opciones?:readonly string[]};
export const camposPap:readonly CampoPap[]=CAMPOS_PAP;
export type FormatoPap=Record<string,string|string[]>;
export type SeguimientoPap={fecha:string;orientador:string;resultado:string};
export type AtencionPap={id:string;numero:number;persona:string;curso:string;fecha:string;fin:string|null;creado_en:string;actualizado_en:string;orientador_id:string;orientador_nombre:string;version:number;formato_version:number;estado:'seguimiento'|'cerrada';formato:FormatoPap;tiempos:Record<string,{fecha:string;orientador:string}>;seguimientos:SeguimientoPap[];motivo:string;situacion:string;acciones:string;apoyo:string;acuerdos:string;pdf_guardado?:boolean};
export type ArchivoPap={id:string;atencion_id:string;version:number;nombre:string;ruta:string;tamano:number;sha256:string;completo:boolean;subido?:boolean;snapshot:AtencionPap};
export type DetallePap={atencion:AtencionPap;nombre_archivo:string;archivos:ArchivoPap[];historial:{id:number;fecha:string;accion:string;actor_nombre:string|null;anterior:Partial<AtencionPap>|null;nuevo:Partial<AtencionPap>|null}[]};
export async function pap<T>(accion:string,id:string|null=null,datos:Record<string,unknown>={}):Promise<T>{if(!supabase)throw new Error('No hay conexión con Supabase');const {data,error}=await supabase.rpc('pap_flujo',{p_accion:accion,p_id:id,p_datos:datos});if(error)throw error;return data as T;}
export function formatoInicial(a?:AtencionPap|null):FormatoPap{const base:FormatoPap={};for(const c of camposPap)base[c.clave]=c.tipo==='multiple'?[]:'';base.proceso='Seguimiento activo';if(!a)return base;if(a.formato_version===2)return{...base,...a.formato};return{...base,hecho:a.motivo??'',observado:a.situacion??'',ayuda:a.acciones??'',pendientes:a.apoyo??'',acuerdos:a.acuerdos??'',justificacion:a.acuerdos??'',proceso:a.estado==='cerrada'?'Cierre PAP':'Seguimiento activo'};}
export const valorPap=(v:unknown)=>(Array.isArray(v)?v.filter(x=>typeof x==='string'&&x.trim()).join(', '):typeof v==='string'&&v.trim()?v:'')||'Sin registrar';
export const fechaPap=(s:string|null|undefined)=>s?new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',dateStyle:'medium',timeStyle:'short'}).format(new Date(s)):'Pendiente';
export const numeroPap=(n:number)=>'PAP-'+String(n).padStart(6,'0');
