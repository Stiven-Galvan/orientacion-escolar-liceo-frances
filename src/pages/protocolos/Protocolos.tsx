import { useRef, useState } from 'react';
import { INDICE_PROTOCOLO } from './indiceProtocolo';
import './Protocolos.css';

const base = import.meta.env.BASE_URL;
export const PDF_PROTOCOLO = `${base}protocolos/estrategias-docentes-aula-2026.pdf`;
const titulo = 'Estrategias docentes para el manejo de situaciones recurrentes en el aula';
const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function Icono({ tipo }: { tipo: 'pdf' | 'descarga' | 'externo' | 'ojo' }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {tipo === 'pdf' ? <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></> : tipo === 'descarga' ? <><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/></> : tipo === 'externo' ? <><path d="M14 3h7v7m0-7L10 14M10 3H4v17h17v-6"/></> : <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>}
  </svg>;
}

export default function Protocolos() {
  const [busqueda, setBusqueda] = useState('');
  const [seleccion, setSeleccion] = useState(0);
  const [ver, setVer] = useState(false);
  const lector = useRef<HTMLElement>(null);
  const tema = INDICE_PROTOCOLO[seleccion];
  const consulta = normalizar(busqueda.trim());
  const resultados = INDICE_PROTOCOLO.map((item, index) => ({ ...item, index })).filter(item => normalizar(`${item.criterio ?? ''} ${item.titulo}`).includes(consulta));
  const enlace = `${PDF_PROTOCOLO}#page=${tema.pagina}&view=FitH&toolbar=1&navpanes=0`;

  function abrir(index = seleccion) {
    setSeleccion(index);
    setVer(true);
    window.requestAnimationFrame(() => lector.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  return <div className="pr-root">
    <header className="pr-heading">
      <div><p className="pr-eyebrow">ORIENTACIÓN ESCOLAR · LICEO FRANCÉS</p><h1>Protocolos</h1><p>Herramientas para acompañar las situaciones cotidianas del aula.</p></div>
      <span className="pr-disponible"><span aria-hidden="true"/>Disponible para todo el equipo docente</span>
    </header>

    <article className="pr-documento">
      <div className="pr-portada"><img src={`${base}protocolos/portada-estrategias-docentes.jpg`} alt="Portada del protocolo institucional de estrategias docentes" width="390" height="550"/></div>
      <div className="pr-presentacion">
        <div className="pr-etiquetas"><span><Icono tipo="pdf"/>GUÍA INSTITUCIONAL</span><span>2026</span></div>
        <h2>{titulo}</h2>
        <p>Consulta las estrategias de actuación docente y los criterios para solicitar acompañamiento de Orientación Escolar.</p>
        <dl className="pr-datos"><div><dt>Extensión</dt><dd>19 páginas</dd></div><div><dt>Contenido</dt><dd>15 criterios de actuación</dd></div><div><dt>Formato</dt><dd>PDF · 3,6 MB</dd></div></dl>
        <div className="pr-acciones">
          <button type="button" className="pr-boton pr-principal" onClick={() => abrir()} aria-controls="pr-lector"><Icono tipo="ojo"/>{ver ? 'Ir a la lectura' : 'Leer protocolo'}</button>
          <a className="pr-boton pr-descarga" href={PDF_PROTOCOLO} download="Protocolo_Estrategias_Docentes_Aula_2026.pdf"><Icono tipo="descarga"/>Descargar PDF</a>
          <a className="pr-enlace" href={PDF_PROTOCOLO} target="_blank" rel="noopener noreferrer"><Icono tipo="externo"/>Abrir en otra pestaña</a>
        </div>
      </div>
    </article>

    <div className="pr-consulta">
      <aside className="pr-indice" aria-label="Índice del protocolo">
        <div className="pr-indice-cabecera"><h2>Encuentra una situación</h2><p>Selecciona un tema para abrir su página en el PDF.</p><label htmlFor="pr-busqueda">Buscar en el índice</label><input id="pr-busqueda" type="search" maxLength={120} value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Ej. instrucciones, ansiedad, bullying…"/><small role="status">{resultados.length} temas encontrados</small></div>
        <nav className="pr-temas" aria-label="Temas y páginas">
          {resultados.map(item => <button type="button" key={item.index} className={ver && seleccion === item.index ? 'pr-tema pr-elegido' : 'pr-tema'} aria-current={ver && seleccion === item.index ? 'location' : undefined} onClick={() => abrir(item.index)}><span>{item.criterio ? <small>Criterio {item.criterio}</small> : <small>Guía general</small>}<strong>{item.titulo}</strong></span><span className="pr-pagina">P. {item.pagina}</span></button>)}
          {!resultados.length && <p className="pr-sin-resultados">No se encontraron temas. Prueba otra palabra o <button type="button" onClick={() => setBusqueda('')}>limpia la búsqueda</button>.</p>}
        </nav>
      </aside>

      <section id="pr-lector" ref={lector} className="pr-lector" aria-label="Lector del protocolo">
        <header className="pr-lector-cabecera"><div><p className="pr-eyebrow">{ver ? 'SECCIÓN SELECCIONADA' : 'LECTURA DEL DOCUMENTO'}</p><h2>{ver ? tema.titulo : 'Tu guía de consulta en el aula'}</h2>{ver && <p>Inicio de la sección: página {tema.pagina} de 19</p>}</div>{ver && <button type="button" className="pr-boton" onClick={() => setVer(false)}>Cerrar lector</button>}</header>
        {ver ? <><iframe key={seleccion} src={enlace} title={`Protocolo institucional · ${tema.titulo}`} className="pr-pdf"/><p className="pr-ayuda">Si la vista previa no se muestra en tu dispositivo, <a href={enlace} target="_blank" rel="noopener noreferrer">abre el PDF en otra pestaña</a> o <a href={PDF_PROTOCOLO} download="Protocolo_Estrategias_Docentes_Aula_2026.pdf">descarga el documento</a>. El salto de página depende del lector PDF del navegador.</p></> : <div className="pr-inicio-lector"><span className="pr-icono-grande"><Icono tipo="pdf"/></span><h3>El protocolo completo, en un solo lugar</h3><p>Abre la guía desde el principio o elige una situación en el índice para consultar el documento institucional.</p><button type="button" className="pr-boton pr-principal" onClick={() => abrir(0)}><Icono tipo="ojo"/>Comenzar lectura</button><p className="pr-original">Documento original con sus logos y formato institucional.</p></div>}
      </section>
    </div>
  </div>;
}
