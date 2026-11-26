import { aplicarPlantillaInstitucional } from '../../lib/documentosInstitucionales';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';
import type { PDFPage } from 'pdf-lib';
import type { DetalleRemision } from './modelosRemision';
import type { FirmaPiar } from '../piar/modelosPiar';
import { DESTINOS,ESTADOS_REMISION,fechaRemision } from './modelosRemision';
import { nombreGrado } from '../estudiantes/modelos';
export async function pdfRemision(d:DetalleRemision):Promise<Blob>{
 const response=await fetch(`${import.meta.env.BASE_URL??'/'}plantillas/FORMATO_REMISION.pdf`);if(!response.ok)throw new Error('No se encontró la plantilla PDF. Copia también la carpeta public del ZIP.');
 const pdf=await PDFDocument.load(await response.arrayBuffer());pdf.registerFontkit(fontkit);const base=import.meta.env.BASE_URL??'/';const fuentes=await Promise.all(['DejaVuSans.ttf','DejaVuSans-Bold.ttf'].map(async nombre=>{const f=await fetch(`${base}plantillas/fonts/${nombre}`);if(!f.ok)throw new Error('Faltan las fuentes PDF. Copia la carpeta public completa.');return f.arrayBuffer();}));const font=await pdf.embedFont(fuentes[0],{subset:true});const bold=await pdf.embedFont(fuentes[1],{subset:true});const r=d.remision;const anexos:{titulo:string;lineas:string[]}[]=[];
 function limpiar(texto:string){return texto.replace(/\t/g,'    ').replace(/\r/g,'').split('').map(c=>{if(c==='\n')return c;try{font.encodeText(c);return c;}catch{return '?';}}).join('');}
 function lineas(texto:string,ancho:number,size:number){const salida:string[]=[];for(const parrafo of limpiar(texto).split('\n')){let actual='';for(const palabra of parrafo.split(/\s+/)){if(!palabra)continue;const candidata=actual?actual+' '+palabra:palabra;if(font.widthOfTextAtSize(candidata,size)<=ancho){actual=candidata;continue;}if(actual)salida.push(actual);let trozo='';for(const letra of palabra){if(font.widthOfTextAtSize(trozo+letra,size)>ancho&&trozo){salida.push(trozo);trozo='';}trozo+=letra;}actual=trozo;}salida.push(actual);}return salida;}
 function caja(p:PDFPage,texto:string,x:number,top:number,w:number,h:number,titulo:string,size=9){const filas=lineas(texto||'No registrado',w,size);const paso=size*1.3;const capacidad=Math.max(1,Math.floor(h/paso));let visibles=filas;if(filas.length>capacidad){visibles=filas.slice(0,Math.max(0,capacidad-1));visibles.push('Ver continuación en anexo');anexos.push({titulo,lineas:lineas(texto,500,10)});}visibles.forEach((l,i)=>p.drawText(l,{x,y:792-top-size-i*paso,size,font,color:rgb(.08,.15,.12)}));}
 const p1=pdf.getPages()[0],p2=pdf.getPages()[1];
 if(r.origen==='coordinacion'){
  p1.drawRectangle({x:329,y:792-157,width:230,height:12,color:rgb(1,1,1)});
  p1.drawText('Coordinación que remite:',{x:330,y:792-154,size:8,font:bold});
  p2.drawRectangle({x:89,y:792-635,width:139,height:15,color:rgb(1,1,1)});
  caja(p2,'No aplica firma docente',91,624,135,12,'Origen de la remisión',7);
 }

 if(r.origen==='desarrollador'){
  p1.drawRectangle({x:329,y:792-157,width:230,height:12,color:rgb(1,1,1)});
  p1.drawText('Desarrollador que remite:',{x:330,y:792-154,size:8,font:bold});
  p2.drawRectangle({x:89,y:792-635,width:139,height:15,color:rgb(1,1,1)});
  caja(p2,'Firma del desarrollador',91,624,135,12,'Autor de la remisión',7);
 }
 caja(p1,fechaRemision(r.enviado_en),90,158,228,14,'Fecha de remisión',8);
 caja(p1,r.docente_nombre,330,158,228,14,'Docente que remite',8);
 caja(p1,r.datos.nombre,90,232,230,19,'Nombre del estudiante');
 caja(p1,`${nombreGrado(r.grado)} ${r.seccion} · ${r.anio_lectivo}`,330,232,119,19,'Curso',8);
 caja(p1,r.datos.edad,458,232,102,19,'Edad');
 caja(p1,`${r.datos.tipo_documento} ${r.datos.documento}`,90,268,230,17,'Identificación');
 caja(p1,r.datos.eps,330,268,119,17,'EPS',8);
 caja(p1,r.datos.reprobo,458,278,102,8,'¿Reprobó el año anterior?',6);
 caja(p1,r.datos.acudiente,90,303,230,17,'Acudiente',8);
 caja(p1,r.datos.telefono1,330,303,119,17,'Teléfono 1',8);
 caja(p1,r.datos.telefono2||'No registrado',458,303,102,17,'Teléfono 2',8);
 caja(p1,r.datos.motivo,92,383,427,227,'Motivo de la remisión',10);
 caja(p2,r.datos.riesgos,92,119,427,145,'Factores de riesgo',10);
 caja(p2,r.datos.estrategias,92,335,427,156,'Estrategias pedagógicas',10);
 async function firma(f:FirmaPiar,x:number,top:number,w:number){if(!f?.imagen)return;const img=await pdf.embedPng(f.imagen);const dimensions=img.scaleToFit(w,30);p2.drawImage(img,{x,y:792-top-dimensions.height,width:dimensions.width,height:dimensions.height});caja(p2,f.nombre,x,top+32,w,18,'Nombre de quien firma',7);caja(p2,'Doc. '+f.documento,x,top+51,w,9,'Documento de quien firma',6);}
 await firma(r.firma_docente,91,565,135);await firma(r.firma_coordinacion,238,565,135);
 caja(p2,r.recibido_en?fechaRemision(r.recibido_en):'Pendiente',385,590,135,12,'Recibido por orientación',7);
 if(r.firma_orientacion?.imagen){const img=await pdf.embedPng(r.firma_orientacion.imagen);const dim=img.scaleToFit(125,18);p2.drawImage(img,{x:386,y:792-604-dim.height,width:dim.width,height:dim.height});caja(p2,r.firma_orientacion.nombre,385,624,135,16,'Orientador que recibe',6);}
 const control=[`Origen: ${r.origen==='desarrollador'?'Desarrollador':r.origen==='coordinacion'?'Coordinación':'Docente'}`,`Estado: ${ESTADOS_REMISION[r.estado]}`,`Destino: ${r.origen==='coordinacion'?'Orientación escolar':DESTINOS[r.destino]}`,`Identificador: ${r.id}`,`Enviada: ${fechaRemision(r.enviado_en)}`,`Decisión de coordinación: ${fechaRemision(r.decidido_en)}`,`Coordinación: ${r.coordinador_nombre??'Pendiente'}`,`Recibida por: ${r.orientador_nombre??'Pendiente'}`,`Recepción de orientación: ${fechaRemision(r.recibido_en)}`];
 if(r.motivo_rechazo)control.push('Motivo del rechazo: '+r.motivo_rechazo);
 control.push('Adjuntos: '+(d.adjuntos.length?d.adjuntos.map(a=>a.nombre).join('; '):'Sin adjuntos'));
 control.push('Las firmas son capturas electrónicas vinculadas al registro y a su historial. Este PDF no tiene firma digital certificada.');
 anexos.push({titulo:'Control de la remisión',lineas:control.flatMap(t=>lineas(t,500,10))});
 let pagina:PDFPage|null=null;let y=0;
 function nuevaPagina(){const p=pdf.addPage([612,792]);p.drawText('LICEO FRANCÉS JEAN DU PLESSIS',{x:50,y:748,size:13,font:bold,color:rgb(.34,.45,.36)});p.drawText(limpiar('Anexo al formato de remisión · '+r.datos.nombre.slice(0,60)),{x:50,y:729,size:9,font});p.drawLine({start:{x:50,y:715},end:{x:562,y:715},thickness:.5,color:rgb(.75,.8,.75)});p.drawText('Página '+pdf.getPageCount(),{x:515,y:30,size:9,font});pagina=p;y=690;}
 for(const anexo of anexos){if(!pagina||y<125)nuevaPagina();pagina!.drawText(anexo.titulo,{x:50,y,size:12,font:bold});y-=24;for(const l of anexo.lineas){if(y<55)nuevaPagina();pagina!.drawText(l,{x:50,y,size:10,font});y-=14;}y-=25;}
 pdf.setTitle('Remisión escolar · '+r.datos.nombre);pdf.setAuthor('Liceo Francés Jean Du Plessis');return aplicarPlantillaInstitucional(pdf,{titulo:'Remisión a orientación escolar',version:r.version,superior:(i)=>i<2?682:710,inferior:(i)=>i<2?125:50,rotulo:(i)=>i===1?'FACTORES DE RIESGO (Describa detalladamente los factores de riesgo que inciden en la problemática del estudiante en los ámbitos grupales e individual):':undefined,nota:'Firmas electrónicas vinculadas al registro y su historial; sin certificación digital.'});
}
