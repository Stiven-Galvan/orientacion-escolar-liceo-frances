import { supabase } from '../../lib/supabase';
import type { FirmaPiar } from '../piar/modelosPiar';
export const ESTADOS_REMISION={borrador:'Borrador',pendiente_coordinacion:'Pendiente de coordinación',rechazada:'Rechazada',aprobada:'Aprobada · por recibir',aceptada:'Recibida · registro pendiente',vinculada:'Vinculada al estudiante'} as const;
export const DESTINOS={coordinacion_academica:'Coordinación académica',coordinacion_convivencial:'Coordinación convivencial'} as const;
export type DatosRemision={nombre:string;tipo_documento:string;documento:string;edad:string;eps:string;reprobo:string;acudiente:string;telefono1:string;telefono2:string;motivo:string;riesgos:string;estrategias:string};
export const datosVacios=():DatosRemision=>({nombre:'',tipo_documento:'TI',documento:'',edad:'',eps:'',reprobo:'',acudiente:'',telefono1:'',telefono2:'',motivo:'',riesgos:'',estrategias:''});
export type Remision={origen?:'docente'|'coordinacion'|'desarrollador';id:string;docente_id:string;docente_nombre:string;docente_auth:string;grupo_id:string|null;anio_lectivo:number;grado:string;seccion:string;estudiante_id:string|null;datos:DatosRemision;destino:keyof typeof DESTINOS;estado:keyof typeof ESTADOS_REMISION;firma_docente:FirmaPiar;firma_coordinacion:FirmaPiar;firma_orientacion:FirmaPiar;coordinador_nombre:string|null;orientador_id:string|null;orientador_nombre:string|null;motivo_rechazo:string|null;creado_en:string;enviado_en:string|null;decidido_en:string|null;recibido_en:string|null;actualizado_en:string;version:number};
export type AdjuntoRemision={id:string;remision_id:string;nombre:string;tipo:string;tamano:number;ruta:string;completo:boolean;retirando:boolean};
export type DetalleRemision={remision:Remision;adjuntos:AdjuntoRemision[];historial:{id:number;accion:string;actor_nombre:string|null;fecha:string;antes:Remision['estado']|null;despues:Remision['estado']|null}[]};
export type ResumenRemision=Pick<Remision,'id'|'estado'|'docente_nombre'|'docente_id'|'destino'|'anio_lectivo'|'grado'|'seccion'|'actualizado_en'|'estudiante_id'|'orientador_nombre'>&{nombre:string;documento:string};
export type GrupoRemision={id:string;anio_lectivo:number;grado:string;seccion:string};
export type OpcionesRemision={grupos:GrupoRemision[];docentes:{id:string;nombre:string}[]};
export type AvisoRemision={id:string;remision_id:string;mensaje:string;creado_en:string;leida_en:string|null};
export async function remision<T>(accion:string,id:string|null=null,datos:Record<string,unknown>={}):Promise<T>{if(!supabase)throw new Error('Falta la conexión con Supabase');const {data,error}=await supabase.rpc('remision_flujo',{p_accion:accion,p_id:id,p_datos:datos});if(error)throw error;return data as T;}
export const fechaRemision=(f:string|null)=>f?new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',dateStyle:'medium',timeStyle:'short'}).format(new Date(f)):'Pendiente';
export const firmaValida=(f:FirmaPiar)=>!!f.imagen&&f.aceptacion&&f.nombre.trim().length>=2&&f.documento.trim().length>=3;
export const BUCKET_REMISION='remisiones-soportes';
