import {useCallback,useState} from 'react';
import type {ComponentProps} from 'react';
import Remisiones from './Remisiones';
import RemisionesEspeciales from '../especiales/RemisionesEspeciales';
import './CentroRemisiones.css';
type Props=ComponentProps<typeof Remisiones>;
export default function CentroRemisiones(props:Props){
 const {onPendientes}=props;
 const [pestana,setPestana]=useState<'recibidas'|'eps'|'comisaria'>('recibidas');const [sucio,setSucio]=useState(false);
 const pendientes=useCallback((valor:boolean)=>{setSucio(valor);onPendientes(valor);},[onPendientes]);
 function abrir(p:typeof pestana){if(p===pestana)return;if(sucio&&!window.confirm('Hay cambios sin guardar. ¿Cambiar de tipo de remisión y descartarlos?'))return;setSucio(false);props.onPendientes(false);setPestana(p);}
 return <div className="cr-root"><header className="cr-heading"><p>ORIENTACIÓN ESCOLAR</p><h1>Remisiones</h1><span>Consulta las solicitudes del colegio o diligencia una remisión para una entidad externa.</span></header><div className="cr-pestanas" role="group" aria-label="Tipos de remisión">{([['recibidas','Remisiones recibidas','Solicitudes de docentes y coordinación'],['eps','Remisión a EPS','Formato para atención en salud'],['comisaria','Comisaría de Familia','Formato dirigido a la Comisaría']] as const).map(([v,t,n])=><button key={v} type="button" aria-pressed={pestana===v} className={pestana===v?'cr-pestana cr-activa':'cr-pestana'} onClick={()=>abrir(v)}><strong>{t}</strong><span>{n}</span></button>)}</div><div className="cr-contenido">{pestana==='recibidas'?<Remisiones {...props} onPendientes={pendientes}/>:<RemisionesEspeciales key={pestana} perfil={props.perfil} tipoInicial={pestana==='eps'?'remision_eps':'remision_comisaria'} ocultarDestinos onPendientes={pendientes} onAbrirEstudiante={props.onAbrirEstudiante}/>}</div></div>;
}
