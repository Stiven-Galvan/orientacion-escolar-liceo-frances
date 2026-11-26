import { aplicarPlantillaInstitucional } from '../../lib/documentosInstitucionales';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument,rgb } from 'pdf-lib';
import type { PDFPage,PDFFont } from 'pdf-lib';
import { camposPap,fechaPap,formatoInicial,numeroPap,valorPap } from './modelosPap';
import type { AtencionPap } from './modelosPap';
export async function generarPdfPap(a:AtencionPap):Promise<Blob>{
 const base=import.meta.env.BASE_URL??'/';const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const fuentes=await Promise.all(['DejaVuSans.ttf','DejaVuSans-Bold.ttf'].map(async n=>{const f=await fetch(`${base}plantillas/fonts/${n}`);if(!f.ok)throw new Error('Faltan las fuentes del PDF. Copia la carpeta public completa.');return f.arrayBuffer();}));
 const escudoRespuesta=await fetch(`${base}plantillas/escudo-pap.png`);if(!escudoRespuesta.ok)throw new Error('Falta el escudo PAP. Copia la carpeta public completa.');const escudo=await doc.embedPng(await escudoRespuesta.arrayBuffer());
 const normal=await doc.embedFont(fuentes[0],{subset:true});const bold=await doc.embedFont(fuentes[1],{subset:true});const ink=rgb(.12,.20,.17),verde=rgb(.16,.35,.26),gris=rgb(.42,.47,.44),linea=rgb(.83,.87,.83);
 let page:PDFPage;let y=0;const ancho=508;const secciones=[...new Set(camposPap.map(c=>c.seccion))];const f=formatoInicial(a);const conjunto=new Set(normal.getCharacterSet());
 const limpio=(s:string)=>Array.from(s.replace(/\r/g,'').replace(/\t/g,'    ')).map(c=>c==='\n'||conjunto.has(c.codePointAt(0)!)?c:'?').join('');
 function envolver(texto:string,w:number,size:number,font:PDFFont){const out:string[]=[];for(const p of limpio(texto).split('\n')){let actual='';for(const palabra of p.split(/\s+/)){if(!palabra)continue;const t=actual?actual+' '+palabra:palabra;if(font.widthOfTextAtSize(t,size)<=w){actual=t;continue;}if(actual)out.push(actual);let parte='';for(const ch of palabra){if(parte&&font.widthOfTextAtSize(parte+ch,size)>w){out.push(parte);parte='';}parte+=ch;}actual=parte;}out.push(actual);}return out;}
 function nueva(){page=doc.addPage([612,792]);page.drawRectangle({x:0,y:784,width:612,height:8,color:verde});page.drawImage(escudo,{x:52,y:728,width:36,height:36});page.drawText('LICEO FRANCÉS JEAN DU PLESSIS',{x:100,y:750,font:bold,size:10,color:verde});page.drawText('Orientación escolar | Registro confidencial PAP',{x:100,y:733,font:normal,size:8,color:gris});page.drawText(limpio(numeroPap(a.numero)),{x:437,y:750,font:bold,size:10,color:verde});page.drawLine({start:{x:52,y:718},end:{x:560,y:718},color:linea,thickness:.6});y=692;}
 function texto(s:string,size=10,font=normal,color=ink,w=ancho,x=52,paso=15){for(const l of envolver(s,w,size,font)){if(y<60)nueva();page.drawText(l,{x,y,font,size,color});y-=paso;}}
 function titulo(s:string){if(y<175)nueva();y-=8;texto(s,13,bold,verde,ancho,52,19);page.drawLine({start:{x:52,y:y+6},end:{x:560,y:y+6},color:linea,thickness:.5});y-=10;}
 function respuesta(label:string,v:unknown){const value=valorPap(v);const lines=envolver(label,ancho,9,bold).length;const min=lines*13+30;if(y<60+min)nueva();texto(label,9,bold,gris,ancho,52,13);texto(value,10,normal,ink,ancho,52,15);y-=11;}
 nueva();
 function par(l1:string,v1:string,l2:string,v2:string){const celdas=[[l1,v1],[l2,v2]];const h=Math.max(...celdas.map(([l,v])=>envolver(l,240,8,bold).length*12+envolver(v,240,10,normal).length*15));if(y-h<65)nueva();celdas.forEach(([l,v],i)=>{let yy=y;for(const lineaTexto of envolver(l,240,8,bold)){page.drawText(lineaTexto,{x:52+i*268,y:yy,font:bold,size:8,color:gris});yy-=12;}for(const lineaTexto of envolver(v,240,10,normal)){page.drawText(lineaTexto,{x:52+i*268,y:yy,font:normal,size:10,color:ink});yy-=15;}});y-=h+16;}
 par('Estudiante',a.persona,'Curso',a.curso||'Sin curso registrado');par('Registrado por',a.orientador_nombre,'Número de registro',numeroPap(a.numero));par('Primer guardado',fechaPap(a.fecha),'Última actualización',fechaPap(a.actualizado_en));if(a.fin){respuesta('Cierre registrado',fechaPap(a.fin));const minutos=Math.max(0,Math.round((Date.parse(a.fin)-Date.parse(a.fecha))/60000));respuesta('Intervalo entre primer guardado y cierre',minutos+' minutos');}
 respuesta('Estado',valorPap(f.proceso));texto('Las fechas y horas de este documento corresponden al registro automático del sistema y se muestran en hora de Colombia.',8,normal,gris,ancho,52,12);y-=10;
 for(const [i,s]of secciones.entries()){titulo(`${i+1}  ${s}`);const campos=camposPap.filter(c=>c.seccion===s).filter(c=>{const v=f[c.clave];return c.requerido||c.tipo==='opcion'||c.tipo==='multiple'||(Array.isArray(v)?v.length>0:!!v?.trim());});if(!campos.length)texto('Sin información registrada.',10,normal,gris);for(const c of campos)respuesta(c.etiqueta,f[c.clave]);
  const marca=s==='Comunicación y activación de rutas'?['contacto','ruta']:s==='Seguridad y necesidades'?['alerta']:s==='Cierre y acuerdos'?['entrega']:[];
  for(const k of marca){const t=a.tiempos?.[k];if(t)respuesta('Registro automático de '+({contacto:'comunicación',ruta:'ruta',alerta:'medidas',entrega:'entrega'}[k]??k),fechaPap(t.fecha)+' | '+t.orientador);}
 }
 titulo('Seguimientos registrados');if(a.seguimientos?.length){for(const s of a.seguimientos)respuesta(fechaPap(s.fecha)+' | '+s.orientador,s.resultado);}else texto('No hay seguimientos posteriores registrados.',10,normal,gris);
 y-=15;texto('Confidencialidad. Acceso reservado a orientación, superadministración y desarrollador según sus permisos. Este documento registra la atención realizada y no acredita un diagnóstico.',8,normal,gris,ancho,52,12);
 doc.getPages().forEach((p,i)=>{p.drawLine({start:{x:52,y:42},end:{x:560,y:42},color:linea,thickness:.5});p.drawText(limpio(numeroPap(a.numero)+' | Versión '+a.version),{x:52,y:28,font:normal,size:8,color:gris});p.drawText(`${i+1} / ${doc.getPageCount()}`,{x:520,y:28,font:normal,size:8,color:gris});});
 doc.setTitle('PAP '+a.persona+' '+a.curso);doc.setAuthor(a.orientador_nombre);return aplicarPlantillaInstitucional(doc,{titulo:'Registro de primeros auxilios psicológicos (PAP)',version:a.version,superior:708,inferior:57,nota:numeroPap(a.numero)+' · Registro confidencial de orientación escolar.'});
}
