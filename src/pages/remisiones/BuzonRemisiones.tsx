import { useEffect,useRef,useState } from 'react';
import { mensajeError } from '../estudiantes/modelos';
import { remision,fechaRemision } from './modelosRemision';
import type { AvisoRemision } from './modelosRemision';
import './Remisiones.css';
export default function BuzonRemisiones({onAbrir,compacto=false}:{onAbrir:(id:string)=>void;compacto?:boolean}){
 const [items,setItems]=useState<AvisoRemision[]>([]);const [total,setTotal]=useState(0);const [error,setError]=useState('');const [revision,setRevision]=useState(0);const [ocupado,setOcupado]=useState(false);const details=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{let vigente=true;void remision<{sin_leer:number;items:AvisoRemision[]}>('notificaciones').then(d=>{if(vigente){setItems(d.items);setTotal(d.sin_leer);setError('');}}).catch(e=>{if(vigente)setError(mensajeError(e));});return()=>{vigente=false;};},[revision]);
 useEffect(()=>{const t=window.setInterval(()=>{if(!document.hidden)setRevision(v=>v+1);},20000);return()=>clearInterval(t);},[]);
 async function abrir(n:AvisoRemision){if(ocupado)return;setOcupado(true);try{await remision('leer_notificacion',n.id);if(details.current)details.current.open=false;setRevision(v=>v+1);onAbrir(n.remision_id);}catch(e){setError(mensajeError(e));}finally{setOcupado(false);}}
 const lista=<>{error&&<p role="alert" className="rm-error">{error}</p>}{!items.length&&<p className="rm-muted">No tienes avisos de remisiones todavía.</p>}<ul className="rm-inbox-list">{items.slice(0,compacto?8:100).map(n=><li key={n.id}><button type="button" disabled={ocupado} className={n.leida_en?'rm-read':''} onClick={()=>void abrir(n)}><span>{n.mensaje}</span><small>{fechaRemision(n.creado_en)}{!n.leida_en?' · Sin leer':''}</small></button></li>)}</ul></>;
 return compacto?<details className="rm-notify rm-root" ref={details}><summary>Remisiones <b>{total}</b></summary><div className="rm-notify-panel"><h3>Avisos de remisiones</h3>{lista}</div></details>:<div className="rm-root"><header className="rm-heading"><div><p className="rm-kicker">COMUNICACIÓN DEL PROCESO</p><h1>Buzón de remisiones</h1><p>Solicitudes, decisiones de coordinación y recepción de orientación.</p></div><button className="rm-button" onClick={()=>setRevision(v=>v+1)}>Actualizar</button></header><section className="rm-card"><p>{total} avisos sin leer · Últimos 100 mensajes</p>{lista}</section></div>;
}
