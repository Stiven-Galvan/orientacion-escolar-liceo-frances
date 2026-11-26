import { supabase } from './supabase';
export const BUCKET_EVIDENCIAS = 'observacion-evidencias';
export const MAX_EVIDENCIA = 20 * 1024 * 1024;
export const TIPOS_EVIDENCIA: Record<string,string> = {jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',pdf:'application/pdf',zip:'application/zip',rar:'application/vnd.rar','7z':'application/x-7z-compressed'};
export type Evidencia = {id:string;observacion_id:string;nombre:string;tipo:string;tamano:number;ruta:string;subido:boolean;confirmado:boolean;retirando:boolean};
export async function validarEvidencia(archivo:File):Promise<string> {
 if(!archivo.size || archivo.size>MAX_EVIDENCIA) throw new Error(`${archivo.name}: el archivo debe pesar entre 1 byte y 20 MB.`);
 const extension=archivo.name.split('.').pop()?.toLowerCase()??'';const tipo=TIPOS_EVIDENCIA[extension];
 if(!tipo)throw new Error(`${archivo.name}: solo se admite JPG, PNG, WEBP, PDF, ZIP, RAR o 7Z.`);
 const bytes=new Uint8Array(await archivo.slice(0,16).arrayBuffer());
 const empieza=(valores:number[])=>valores.every((v,i)=>bytes[i]===v);
 const texto=(inicio:number,fin:number)=>String.fromCharCode(...bytes.slice(inicio,fin));
 const valido=tipo==='image/jpeg'?empieza([255,216,255]):tipo==='image/png'?empieza([137,80,78,71,13,10,26,10]):tipo==='image/webp'?texto(0,4)==='RIFF'&&texto(8,12)==='WEBP':tipo==='application/pdf'?texto(0,5)==='%PDF-':tipo==='application/zip'?empieza([80,75,3,4])||empieza([80,75,5,6])||empieza([80,75,7,8]):tipo==='application/vnd.rar'?empieza([82,97,114,33,26,7]):empieza([55,122,188,175,39,28]);
 if(!valido)throw new Error(`${archivo.name}: el contenido no corresponde a su extensión.`);
 return tipo;
}
async function operar(accion:string,id:string,datos:Record<string,unknown>={}) {
 if(!supabase)throw new Error('Falta configurar Supabase');
 const {data,error}=await supabase.rpc('evidencia_operar',{p_accion:accion,p_observacion:id,p_datos:datos});if(error)throw error;return data;
}
export async function cargarEvidencias(id:string):Promise<Evidencia[]> {return await operar('listar',id) as Evidencia[];}
export async function subirEvidencia(observacion:string,archivo:File) {
 if(!supabase)throw new Error('Falta configurar Supabase');
 const tipo=await validarEvidencia(archivo);
 const preparacion=await supabase.functions.invoke('preparar-evidencias',{body:{}});
 if(preparacion.error||!preparacion.data?.ok)throw new Error('No se pudo preparar el almacenamiento privado. Revisa tu sesión y vuelve a intentar.');
 const reserva=await operar('reservar',observacion,{id:crypto.randomUUID(),nombre:archivo.name,tipo,tamano:archivo.size}) as Evidencia;
 const subida=await supabase.storage.from(BUCKET_EVIDENCIAS).upload(reserva.ruta,archivo,{contentType:tipo,upsert:false,cacheControl:'0'});
 if(subida.error)throw new Error(`${archivo.name}: no terminó la subida. Retira el intento pendiente y vuelve a seleccionar el archivo. ${subida.error.message}`);
}
export async function retirarEvidencia(item:Evidencia) {
 if(!supabase)throw new Error('Falta configurar Supabase');
 await operar('retirar_preparar',item.observacion_id,{id:item.id});
 const borrado=await supabase.storage.from(BUCKET_EVIDENCIAS).remove([item.ruta]);
 if(borrado.error)throw new Error('No se pudo retirar la evidencia. Reintenta su retirada antes de enviar.');
 await operar('quitar',item.observacion_id,{id:item.id});
}
export async function descargarEvidencia(item:Evidencia):Promise<Blob> {
 if(!supabase)throw new Error('Falta configurar Supabase');
 const {data,error}=await supabase.storage.from(BUCKET_EVIDENCIAS).download(item.ruta);if(error||!data)throw new Error('No se pudo descargar la evidencia. Revisa tu sesión y tus permisos.');return data;
}
export function evidenciaCompleta(items:Evidencia[]) { return items.length>0&&items.every(x=>x.subido&&!x.retirando)&&items.some(x=>x.tipo.startsWith('image/')&&x.subido&&!x.retirando); }
