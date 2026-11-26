import fontkit from '@pdf-lib/fontkit';
import { BlendMode, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream, rgb } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';

type Marco = { titulo:string; version?:number; superior:number | ((indice:number)=>number); inferior?:number | ((indice:number)=>number); rotulo?:(indice:number)=>string|undefined; nota?:string };
async function recurso(nombre:string) {
  const r=await fetch(`${import.meta.env.BASE_URL??'/'}plantillas/${nombre}`);
  if(!r.ok) throw new Error('No se pudo cargar la plantilla institucional. Copia también la carpeta public de esta actualización.');
  return r.arrayBuffer();
}
function lineas(texto:string,font:PDFFont,size:number,ancho:number) {
  const chars=new Set(font.getCharacterSet());
  const limpio=Array.from(texto.replace(/\r/g,'').replace(/\t/g,' ')).map(c=>c==='\n'||chars.has(c.codePointAt(0)!)?c:'?').join('');
  const out:string[]=[];
  for(const parrafo of limpio.split('\n')) { let actual='';for(const palabra of parrafo.split(/\s+/).filter(Boolean)) {
    if(actual&&font.widthOfTextAtSize(actual+' '+palabra,size)>ancho){out.push(actual);actual='';}
    for(const c of (actual?' ':'')+palabra){if(actual&&font.widthOfTextAtSize(actual+c,size)>ancho){out.push(actual);actual='';}actual+=c;}
  }out.push(actual); }
  return out;
}

const plantillasFinalizadas = new Set(['plantilla-institucional-v2', 'plantilla-institucional-v3']);

/** Reencuadra únicamente el área del formulario: conserva texto, tablas y firmas vectoriales. */
export async function aplicarPlantillaInstitucional(original:PDFDocument,op:Marco):Promise<Blob> {
  if(plantillasFinalizadas.has(original.getSubject() ?? ''))return new Blob([new Uint8Array(await original.save())],{type:'application/pdf'});
  // Save first so embedded subset fonts and signature resources are finalized.
  const fuente=await PDFDocument.load(await original.save());
  const anterior=fuente.getSubject()==='plantilla-institucional-v1';
  if(anterior)quitarImagenesMembreteAnterior(fuente);
  const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
  const [plantilla,marca,fn,fb]=await Promise.all(['membrete-certificaciones.pdf','marca-agua-certificaciones.png','fonts/DejaVuSans.ttf','fonts/DejaVuSans-Bold.ttf'].map(recurso));
  const fondoFuente=await PDFDocument.load(plantilla);
  const cabecera=await doc.embedPage(fondoFuente.getPage(0),{left:0,bottom:682,right:612,top:792});
  const escudo=await doc.embedPng(marca);
  const normal=await doc.embedFont(fn,{subset:true}),bold=await doc.embedFont(fb,{subset:true});
  const total=fuente.getPageCount(),gris=rgb(.38,.36,.33),cafe=rgb(.52,.32,.23);
  const areas=fuente.getPages().map((p,i)=>{
    const {width,height}=p.getSize();const techo=anterior?690:typeof op.superior==='function'?op.superior(i):op.superior;
    const bottom=anterior?72:typeof op.inferior==='function'?op.inferior(i):(op.inferior??58);const top=Math.min(height,techo);
    if(top<=bottom)throw new Error('El documento no tiene un área de contenido válida.');
    return {left:0,bottom,right:width,top};
  });
  // One batch shares original font/image objects between pages instead of copying them repeatedly.
  const cuerpos=await doc.embedPages(fuente.getPages(),areas);
  for(const [i,p] of fuente.getPages().entries()) {
    const width=p.getWidth(),{top,bottom}=areas[i],cuerpo=cuerpos[i];
    const nueva=doc.addPage([612,792]);
    const anchoCabecera=484;
    const altoCabecera=cabecera.height*anchoCabecera/cabecera.width;
    nueva.drawPage(cabecera,{x:(612-anchoCabecera)/2,y:784-altoCabecera,width:anchoCabecera,height:altoCabecera});
    const titulos=lineas(op.titulo,bold,14,508);
    titulos.forEach((s,n)=>nueva.drawText(s,{x:52,y:680-n*18,font:bold,size:14,color:rgb(.08,.25,.20)}));
    const techoContenido=680-titulos.length*18-5;
    const rotulo=anterior?undefined:op.rotulo?.(i);const textoRotulo=rotulo?lineas(rotulo,bold,9,508):[];
    textoRotulo.forEach((s,n)=>nueva.drawText(s,{x:52,y:techoContenido-n*13,font:bold,size:9}));
    const inicio=techoContenido-(textoRotulo.length?textoRotulo.length*13+7:0);
    const escala=Math.min(1,612/width,(inicio-59)/(top-bottom));
    nueva.drawPage(cuerpo,{x:(612-width*escala)/2,y:inicio-(top-bottom)*escala,width:width*escala,height:(top-bottom)*escala});
    // Multiply keeps the template's pale crest visible over imported white page backgrounds without washing out text.
    nueva.drawImage(escudo,{x:176,y:222,width:260,height:257,opacity:.68,blendMode:BlendMode.Multiply});
    nueva.drawLine({start:{x:52,y:50},end:{x:560,y:50},thickness:.6,color:cafe});
    const pie='Orientación escolar'+(op.version===undefined?'':' · Versión '+op.version);
    nueva.drawText(pie,{x:52,y:37,font:bold,size:8,color:gris});
    const pag=`Página ${i+1} de ${total}`;nueva.drawText(pag,{x:560-normal.widthOfTextAtSize(pag,8),y:37,font:normal,size:8,color:gris});
    const notas=lineas(op.nota??'Documento institucional · Acceso según los permisos del registro.',normal,7,508);
    notas.slice(0,2).forEach((s,n)=>nueva.drawText(s,{x:52,y:25-n*9,font:normal,size:7,color:gris}));
  }
  doc.setTitle(op.titulo);doc.setSubject('plantilla-institucional-v3');doc.setAuthor(original.getAuthor()??'Liceo Francés Jean Du Plessis');
  return new Blob([new Uint8Array(await doc.save())],{type:'application/pdf'});
}

/** v1 wraps the real content in Form XObjects; only its two direct images are branding. */
function quitarImagenesMembreteAnterior(doc:PDFDocument) {
  for(const p of doc.getPages()) {
    const xobjects=p.node.Resources()?.lookup(PDFName.of('XObject'));
    if(!(xobjects instanceof PDFDict))throw new Error('No se pudo identificar el membrete anterior.');
    const imagenes:string[]=[];let formularios=0;
    for(const [nombre,ref] of xobjects.entries()) {
      const objeto=doc.context.lookup(ref);
      if(!(objeto instanceof PDFRawStream))continue;
      const tipo=objeto.dict.lookup(PDFName.of('Subtype'));
      if(tipo===PDFName.of('Image'))imagenes.push(nombre.toString());
      if(tipo===PDFName.of('Form'))formularios++;
    }
    if(!formularios)throw new Error('No se encontró el contenido original del documento.');
    const contenido=p.node.Contents();const refs=contenido instanceof PDFArray?contenido.asArray():[contenido];
    let texto='';
    for(const ref of refs){const stream=doc.context.lookup(ref);if(stream instanceof PDFRawStream)texto+=new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode())+'\n';}
    for(const nombre of imagenes){const seguro=nombre.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');texto=texto.replace(new RegExp(seguro+'\\s+Do\\b','g'),'');}
    p.node.set(PDFName.of('Contents'),doc.context.register(doc.context.flateStream(texto)));
  }
}

/** Presentation copy only: never replaces a previously stored or hashed original. */
export async function presentarDocumentoInstitucional(blob:Blob,op:Marco) {
  const doc=await PDFDocument.load(await blob.arrayBuffer());
  if(plantillasFinalizadas.has(doc.getSubject() ?? ''))return blob;
  return aplicarPlantillaInstitucional(doc,op);
}

type SeccionDocumento = {
  titulo: string;
  campos: { titulo: string; valor: string }[];
  columnas?: 1 | 2;
};
export type FirmaDocumento = { nombre: string; documento?: string; cargo?: string; imagen: string };

export async function generarDocumentoTexto(titulo: string, secciones: SeccionDocumento[], firmas: FirmaDocumento[] = []) {
  const doc=await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [fn,fb]=await Promise.all([recurso('fonts/DejaVuSans.ttf'),recurso('fonts/DejaVuSans-Bold.ttf')]);
  const normal=await doc.embedFont(fn,{subset:true}), bold=await doc.embedFont(fb,{subset:true});
  const tinta=rgb(.12,.22,.18), subtitulo=rgb(.14,.33,.27), fondo=rgb(.93,.96,.94);
  const ancho=508, margen=52, limite=72, paso=14;
  let pagina=doc.addPage([612,792]), y=729;
  function nuevaPagina() { pagina=doc.addPage([612,792]); y=729; }
  function encabezado(texto: string, minimo: number) {
    if(y-minimo<limite) nuevaPagina();
    pagina.drawRectangle({x:margen,y:y-17,width:ancho,height:22,color:fondo});
    pagina.drawText(texto,{x:margen+8,y:y-9,font:bold,size:11,color:subtitulo});
    y-=27;
  }
  function dibujar(texto: string, x: number, alto: number, font: PDFFont, size: number) {
    pagina.drawText(texto,{x,y:alto,font,size,color:tinta});
  }

  for(const seccion of secciones) {
    encabezado(seccion.titulo,72);
    const columnas=seccion.columnas??1;
    const anchoCelda=(ancho-(columnas-1)*20)/columnas;
    for(let i=0;i<seccion.campos.length;i+=columnas) {
      const celdas=seccion.campos.slice(i,i+columnas).map(campo=>({
        etiqueta:lineas(campo.titulo,bold,9,anchoCelda),
        valor:lineas(campo.valor?.trim()||'Sin registrar',normal,11,anchoCelda),
      }));
      const etiquetas=Math.max(...celdas.map(c=>c.etiqueta.length));
      const valores=Math.max(...celdas.map(c=>c.valor.length));
      const altoFila=etiquetas*12+valores*paso+7;
      if(y-Math.min(altoFila,80)<limite) { nuevaPagina(); encabezado(seccion.titulo+' · Continuación',72); }
      celdas.forEach((c,j)=>c.etiqueta.forEach((l,k)=>dibujar(l,margen+j*(anchoCelda+20),y-k*12,bold,9)));
      y-=etiquetas*12;
      for(let k=0;k<valores;k++) {
        if(y<limite) { nuevaPagina(); encabezado(seccion.titulo+' · Continuación',72); }
        celdas.forEach((c,j)=>{ if(c.valor[k]!==undefined) dibujar(c.valor[k],margen+j*(anchoCelda+20),y,normal,11); });
        y-=paso;
      }
      y-=8;
    }
    y-=5;
  }

  for(let i=0;i<firmas.length;i+=2) {
    const pareja=firmas.slice(i,i+2), anchoFirma=(ancho-20)/2;
    const tarjetas=await Promise.all(pareja.map(async firma=>{
      const imagen=firma.imagen.startsWith('data:image/jpeg')?await doc.embedJpg(firma.imagen):await doc.embedPng(firma.imagen);
      const textos=[...lineas(firma.nombre||'Sin registrar',normal,10,anchoFirma),
        ...(firma.documento?lineas('Documento: '+firma.documento,normal,10,anchoFirma):[])];
      return {firma,imagen,textos};
    }));
    const alto=91+Math.max(...tarjetas.map(t=>t.textos.length))*13;
    encabezado(i?'Firmas · Continuación':'Firmas',alto+27);
    for(const [j,{firma,imagen,textos}] of tarjetas.entries()) {
      const x=margen+j*(anchoFirma+20), medida=imagen.scaleToFit(anchoFirma,43);
      dibujar(firma.cargo||'Firma',x,y,bold,9);
      pagina.drawImage(imagen,{x,y:y-55,width:medida.width,height:medida.height});
      textos.forEach((texto,k)=>dibujar(texto,x,y-70-k*13,normal,10));
    }
    y-=alto;
  }
  return aplicarPlantillaInstitucional(doc,{
    titulo,superior:740,inferior:64,
    nota:firmas.length?'Firmas electrónicas vinculadas al registro; sin certificación digital.':undefined,
  });
}
export function descargarDocumento(blob:Blob,nombre:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=nombre;document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),60000);}
