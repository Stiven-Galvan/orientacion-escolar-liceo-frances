import { supabase } from '../../lib/supabase';
export const TIPOS = { individual: 'Atención individual', familiar: 'Encuentro familiar', docente: 'Encuentro con docente', aula: 'Observación de aula', reunion: 'Reunión', otro: 'Otra actividad' } as const;
export const ESTADOS = { programada: 'Programada', atendida: 'Atendida', cancelada: 'Cancelada', no_asistio: 'No asistió' } as const;
export type EstadoAgenda = keyof typeof ESTADOS;
export type Cita = {
 id:string; titulo:string; tipo:keyof typeof TIPOS; modalidad:'presencial'|'virtual'; inicio:string; fin:string;
 responsable_id:string; responsable_nombre:string; estudiante_id:string|null; estudiante_nombre:string|null;
 lugar:string; participantes:string; descripcion:string; estado:EstadoAgenda; resultado:string;
 creado_por:string; creado_nombre:string; creado_en:string; actualizado_en:string; version:number;
};
export type Responsable = {id:string;nombre:string};
export type AlumnoAgenda = {id:string;nombre:string;numero_documento:string|null};
export type CambioAgenda = {id:number;accion:string;fecha:string;actor_nombre:string|null;anterior:Partial<Cita>|null;nuevo:Partial<Cita>|null};
export async function agenda<T>(accion:string,id:string|null=null,datos:Record<string,unknown>={}):Promise<T>{
 if(!supabase)throw new Error('No hay conexión con Supabase.');
 const {data,error}=await supabase.rpc('agenda_flujo',{p_accion:accion,p_id:id,p_datos:datos});
 if(error)throw error;return data as T;
}
export function diaColombia(fecha:Date|string=new Date()):string{
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(fecha));
}
export const horaColombia=(fecha:string)=>new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(fecha));
export const fechaLarga=(dia:string)=>new Intl.DateTimeFormat('es-CO',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(new Date(dia+'T12:00:00Z'));
export function sumarDias(dia:string,cantidad:number){const f=new Date(dia+'T12:00:00Z');f.setUTCDate(f.getUTCDate()+cantidad);return f.toISOString().slice(0,10);}
export function moverMes(mes:string,cantidad:number){const f=new Date(mes+'-01T12:00:00Z');f.setUTCMonth(f.getUTCMonth()+cantidad);return f.toISOString().slice(0,7);}
export function diasCalendario(mes:string){const primero=mes+'-01';const semana=(new Date(primero+'T12:00:00Z').getUTCDay()+6)%7;const comienzo=sumarDias(primero,-semana);return Array.from({length:42},(_,i)=>sumarDias(comienzo,i));}
export const instanteColombia=(dia:string,hora:string)=>new Date(`${dia}T${hora}:00-05:00`).toISOString();
export function descripcionCambio(c:CambioAgenda){if(c.accion==='INSERT')return 'Creó la cita';if(c.accion==='DELETE')return 'Eliminó el registro junto con el expediente';if(c.anterior?.estado!==c.nuevo?.estado)return 'Cambió el estado a '+(ESTADOS[c.nuevo?.estado as EstadoAgenda]??c.nuevo?.estado);if(c.anterior?.inicio!==c.nuevo?.inicio||c.anterior?.fin!==c.nuevo?.fin)return 'Reprogramó la cita';return 'Actualizó los datos de la cita';}

export function ocurreEnDia(c:Cita,dia:string){return Date.parse(c.inicio)<Date.parse(sumarDias(dia,1)+'T00:00:00-05:00')&&Date.parse(c.fin)>Date.parse(dia+'T00:00:00-05:00');}
