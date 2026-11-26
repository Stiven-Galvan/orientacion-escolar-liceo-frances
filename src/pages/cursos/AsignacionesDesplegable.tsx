import { useState } from "react";
import { GRADOS, nombreGrado } from "../estudiantes/modelos";

export type Asignacion = { id: string; docente_id: string | null; docente_nombre: string; grupo_id: string; grado: string; seccion: string; activo: boolean };
const normalizar = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
const nombreCurso = (item: Asignacion) => `${nombreGrado(item.grado)} · ${item.seccion || "Sin sección"}`;

export default function AsignacionesDesplegable({ asignaciones, cargando, ocupado, onRetirar }: { asignaciones: Asignacion[]; cargando: boolean; ocupado: boolean; onRetirar: (item: Asignacion) => void }) {
  const [busqueda, setBusqueda] = useState("");
  const [grado, setGrado] = useState("");
  const [seccion, setSeccion] = useState("*");
  const [mostrarRetiradas, setMostrarRetiradas] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [docenteAbierto, setDocenteAbierto] = useState<string | null>(null);
  const texto = normalizar(busqueda);
  const filtradas = asignaciones.filter(item => (mostrarRetiradas || item.activo)
    && (!grado || item.grado === grado)
    && (seccion === "*" || item.seccion === seccion)
    && (!texto || normalizar(`${item.docente_nombre} ${nombreCurso(item)}`).includes(texto)));
  const grupos = new Map<string, { id: string; nombre: string; cursos: Asignacion[] }>();
  for (const item of filtradas) {
    const id = item.docente_id ?? `historico:${item.docente_nombre}`;
    const grupo = grupos.get(id) ?? { id, nombre: item.docente_nombre, cursos: [] };
    grupo.cursos.push(item); grupos.set(id, grupo);
  }
  const docentes = [...grupos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
  const paginas = Math.max(1, Math.ceil(docentes.length / 8));
  const paginaSegura = Math.min(pagina, paginas);
  const visibles = docentes.slice((paginaSegura - 1) * 8, paginaSegura * 8);
  function limpiar() { setBusqueda(""); setGrado(""); setSeccion("*"); setMostrarRetiradas(false); setPagina(1); setDocenteAbierto(null); }
  return <section className="panel cursos-panel">
    <details className="asignaciones-desplegable">
      <summary><span><strong>Asignaciones</strong><small>{asignaciones.filter(item => item.activo).length} activas · Abrir para buscar y consultar por docente</small></span></summary>
      <div className="asignaciones-contenido">
        <div className="asignaciones-filtros">
          <label>Buscar docente o curso<input type="search" placeholder="Nombre del docente, 6.º, grupo A…" maxLength={180} value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(1); }} /></label>
          <label>Grado<select value={grado} onChange={e => { setGrado(e.target.value); setPagina(1); }}><option value="">Todos los grados</option>{GRADOS.map(item => <option key={item.valor} value={item.valor}>{item.nombre}</option>)}</select></label>
          <label>Grupo o sección<select value={seccion} onChange={e => { setSeccion(e.target.value); setPagina(1); }}><option value="*">Todos los grupos</option>{[...new Set(asignaciones.map(item => item.seccion))].sort().map(valor => <option key={valor} value={valor}>{valor || "Sin sección"}</option>)}</select></label>
        </div>
        <div className="cursos-cabecera asignaciones-herramientas"><label className="cursos-check"><input type="checkbox" checked={mostrarRetiradas} onChange={e => { setMostrarRetiradas(e.target.checked); setPagina(1); }} />Mostrar también retiradas</label><button type="button" className="acceso-secundario" onClick={limpiar}>Limpiar filtros</button></div>
        {cargando ? <p role="status">Consultando asignaciones…</p> : <>
          <p role="status">{docentes.length} docentes · {filtradas.length} asignaciones encontradas</p>
          <div className="asignaciones-docentes">
            {visibles.map(docente => {
              const abierto = docenteAbierto === docente.id;
              return <div className="asignaciones-docente" key={docente.id}>
                <button type="button" className="asignaciones-toggle" aria-expanded={abierto} onClick={() => setDocenteAbierto(abierto ? null : docente.id)}><span><strong>{docente.nombre}</strong><small>{docente.cursos.length} cursos según los filtros</small></span><span aria-hidden="true">{abierto ? "▴" : "▾"}</span></button>
                {abierto && <div className="asignaciones-tabla" tabIndex={0} role="region" aria-label={`Cursos de ${docente.nombre}`}><table className="estudiantes-tabla"><thead><tr><th scope="col">Curso</th><th scope="col">Estado</th><th scope="col">Acción</th></tr></thead><tbody>{[...docente.cursos].sort((a, b) => GRADOS.findIndex(g => g.valor === a.grado) - GRADOS.findIndex(g => g.valor === b.grado) || a.seccion.localeCompare(b.seccion, "es", { numeric: true })).map(item => <tr key={item.id}><td>{nombreCurso(item)}</td><td>{item.activo ? "Activa" : "Retirada"}</td><td>{item.activo ? <button type="button" className="acceso-secundario" disabled={ocupado} onClick={() => onRetirar(item)}>Retirar asignación</button> : "Historial conservado"}</td></tr>)}</tbody></table></div>}
              </div>;
            })}
          </div>
          {!docentes.length && <p>No hay asignaciones para estos filtros.</p>}
          {docentes.length > 8 && <div className="asignaciones-paginacion"><button type="button" className="acceso-secundario" disabled={paginaSegura <= 1} onClick={() => { setPagina(paginaSegura - 1); setDocenteAbierto(null); }}>Anterior</button><span>Página {paginaSegura} de {paginas}</span><button type="button" className="acceso-secundario" disabled={paginaSegura >= paginas} onClick={() => { setPagina(paginaSegura + 1); setDocenteAbierto(null); }}>Siguiente</button></div>}
        </>}
        <p className="estudiantes-ayuda">Si cambia el año lectivo, registra sus asignaciones. Retirar una asignación conserva el historial y no elimina docentes ni estudiantes.</p>
      </div>
    </details>
  </section>;
}
