import { useEffect, useState } from 'react';
import type { Perfil } from '../../types/perfil';
import { piar } from './apiPiar';
import './Piar.css';
type Novedades={total:number;eventos:{id:number;proceso_id:string;texto:string;actor_nombre:string;fecha:string;estudiante_nombre:string}[]};
export default function NotificacionesPiar({perfil,onAbrir}:{perfil:Perfil;onAbrir:(id:string)=>void}){
 const [novedades,setNovedades]=useState<Novedades>({total:0,eventos:[]});const [error,setError]=useState('');const permitido=['orientador','superadministrador','desarrollador'].includes(perfil.rol);
 useEffect(()=>{if(!permitido)return;let vigente=true;const consultar=()=>{if(document.hidden)return;void piar<Novedades>('novedades').then(d=>{if(vigente){setNovedades(d);setError('');}}).catch(()=>{if(vigente)setError('No se pudieron actualizar los avisos PIAR.');});};consultar();const timer=window.setInterval(consultar,15000);return()=>{vigente=false;clearInterval(timer);};},[permitido]);
 if(!permitido)return null;
 return <details className="piar-notificaciones"><summary>PIAR · {novedades.total} novedades</summary><div className="piar-notificaciones-lista">{error&&<p role="status">{error}</p>}{!novedades.eventos.length&&<p>No tienes novedades pendientes.</p>}{novedades.eventos.map(e=><button type="button" key={e.id} onClick={()=>onAbrir(e.proceso_id)}><strong>{e.estudiante_nombre}</strong><span>{e.actor_nombre} · {e.texto}</span></button>)}{novedades.eventos.length>0&&<button type="button" onClick={()=>{const ultimo=Math.max(...novedades.eventos.map(e=>e.id));void piar('leer_novedades',null,{ultimo_id:ultimo}).then(()=>piar<Novedades>('novedades')).then(setNovedades).catch(()=>setError('No se pudieron marcar las novedades como leídas.'));}}>Marcar estas novedades como leídas</button>}</div></details>;
}
