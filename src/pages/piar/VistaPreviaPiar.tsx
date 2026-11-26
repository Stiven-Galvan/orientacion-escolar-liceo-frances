import { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { piar } from './apiPiar';
import { generarPiar } from './documentoPiar';
import type { DocumentoPiar } from './modelosPiar';
import { mensajeError } from '../estudiantes/modelos';
export default function VistaPreviaPiar({id,version}:{id:string;version:number}){
 const destino=useRef<HTMLDivElement>(null);const [error,setError]=useState('');const [listo,setListo]=useState(false);
 useEffect(()=>{let vigente=true;const temporal=document.createElement('div');void(async()=>{try{const datos=await piar<DocumentoPiar>('vista_previa',id);const blob=await generarPiar(datos);await renderAsync(blob,temporal,undefined,{inWrapper:true,ignoreWidth:false,ignoreHeight:false,breakPages:true,renderHeaders:true,renderFooters:true,useBase64URL:true,renderAltChunks:false});if(vigente&&destino.current){destino.current.replaceChildren(...Array.from(temporal.childNodes));setError('');setListo(true);}}catch(fallo){if(vigente)setError(mensajeError(fallo));}})();return()=>{vigente=false;temporal.replaceChildren();};},[id,version]);
 return <section className="panel piar-panel"><h2>Vista previa del Word original</h2><p>Conserva los anexos, tablas y logos de la plantilla. La paginación del navegador puede variar respecto de Microsoft Word. La descarga final se habilita al completar todos los requisitos.</p>{error&&<p role="alert" className="estudiantes-error">{error}</p>}{!listo&&!error&&<p role="status">Preparando vista previa…</p>}<div ref={destino} className="piar-preview"/></section>;
}
