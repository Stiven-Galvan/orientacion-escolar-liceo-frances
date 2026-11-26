import { useEffect,useState } from 'react';
import { remision,ESTADOS_REMISION,fechaRemision } from './modelosRemision';
import type { ResumenRemision } from './modelosRemision';
import { mensajeError } from '../estudiantes/modelos';
import './Remisiones.css';
export default function RemisionesEstudiante({id,onAbrir}:{id:string;onAbrir?:(id:string)=>void}){
 const [items,setItems]=useState<ResumenRemision[]>([]);const [error,setError]=useState('');
 useEffect(()=>{let vigente=true;void remision<ResumenRemision[]>('por_estudiante',id).then(d=>{if(vigente)setItems(d);}).catch(e=>{if(vigente)setError(mensajeError(e));});return()=>{vigente=false;};},[id]);
 return <section className="rm-root rm-card"><h2>Remisiones a orientación</h2>{error&&<p className="rm-error">{error}</p>}{!items.length&&!error&&<p>No hay remisiones vinculadas a esta ficha.</p>}<ul className="rm-student-remissions">{items.map(r=><li key={r.id}><span><strong>{r.docente_nombre}</strong><small>{ESTADOS_REMISION[r.estado]} · {fechaRemision(r.actualizado_en)}</small></span>{onAbrir&&<button className="rm-button" onClick={()=>onAbrir(r.id)}>Ver formato y firmas</button>}</li>)}</ul></section>;
}
