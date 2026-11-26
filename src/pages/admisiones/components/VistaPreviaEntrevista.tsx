import { useEffect,useState } from 'react';
import { generarPdfEntrevista } from '../utils/descargarEntrevista';
export default function VistaPreviaEntrevista({datos,firmas}:{datos:Record<string,string>;firmas?:unknown}) {
  const [vista,setVista]=useState<{datos:Record<string,string>;firmas:unknown;url?:string;error?:string}|null>(null);
  useEffect(()=>{let vigente=true;let url='';void generarPdfEntrevista(datos,firmas).then(blob=>{if(!vigente)return;url=URL.createObjectURL(blob);setVista({datos,firmas,url});}).catch(e=>{if(vigente)setVista({datos,firmas,error:e instanceof Error?e.message:'No se pudo generar la vista previa.'});});return()=>{vigente=false;if(url)URL.revokeObjectURL(url);};},[datos,firmas]);
  if(vista?.datos!==datos||vista.firmas!==firmas)return <p role="status">Preparando documento institucional…</p>;
  if(vista.error)return <p role="alert">{vista.error}</p>;
  return <section><a href={vista.url} target="_blank" rel="noopener noreferrer">Abrir documento en otra pestaña</a><iframe src={vista.url} title="Vista previa de la entrevista de admisión" style={{width:'100%',height:'75vh',border:'1px solid #ddd',marginTop:12}}/></section>;
}
