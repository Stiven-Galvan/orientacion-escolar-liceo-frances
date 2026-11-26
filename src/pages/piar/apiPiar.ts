import { supabase } from '../../lib/supabase';
export async function piar<T=Record<string,unknown>>(accion:string,id:string|null=null,datos:Record<string,unknown>={}):Promise<T>{if(!supabase)throw new Error('Falta configurar Supabase');const {data,error}=await supabase.rpc('piar_flujo',{p_accion:accion,p_id:id,p_datos:datos});if(error)throw error;return data as T;}
