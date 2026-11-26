import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { GRADOS, anioActual, nombreGrado, mensajeError } from "../estudiantes/modelos";
import type { Perfil } from "../../types/perfil";
import "./CursosDocentes.css";
import AsignacionesDesplegable from "./AsignacionesDesplegable";
import type { Asignacion } from "./AsignacionesDesplegable";
import { eliminarRegistro } from "../../lib/eliminaciones";
import { ordenarCursos, seleccionarRango } from "./seleccionCursos";

type Grupo = { id: string; anio_lectivo: number; grado: string; seccion: string };
type Panel = { grupos: Grupo[]; docentes: { id: string; nombre: string }[]; asignaciones: Asignacion[] };
const nombreCurso = (g: { grado: string; seccion: string }) => `${nombreGrado(g.grado)}${g.seccion ? ` · ${g.seccion}` : " · Sin sección"}`;
export default function CursosDocentes({ perfil }: { perfil: Perfil }) {
  const permitido = ["superadministrador", "desarrollador"].includes(perfil.rol);
  const [anio, setAnio] = useState(anioActual());
  const anioValido = Number.isInteger(anio) && anio >= 2000 && anio <= 2100;
  const [panel, setPanel] = useState<Panel>({ grupos: [], docentes: [], asignaciones: [] });
  const [grado, setGrado] = useState(""); const [seccion, setSeccion] = useState("");
  const [docente, setDocente] = useState("");
  const [modo, setModo] = useState<"seleccion" | "rango">("seleccion");
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [desde, setDesde] = useState("1"); const [hasta, setHasta] = useState("5");
  const [seccionRango, setSeccionRango] = useState("*");
  const [excluirGrados, setExcluirGrados] = useState<string[]>([]);
  const [excluirCursos, setExcluirCursos] = useState<string[]>([]);
  function limpiarExcepciones() { setExcluirGrados([]); setExcluirCursos([]); }
  function excluir(valor: string, elegido: boolean, nivel: "grado" | "curso") {
    const actualizar = nivel === "grado" ? setExcluirGrados : setExcluirCursos;
    actualizar(actual => elegido ? [...new Set([...actual, valor])] : actual.filter(item => item !== valor));
  }
  const inicioRango = GRADOS.findIndex(g => g.valor === desde);
  const finRango = GRADOS.findIndex(g => g.valor === hasta);
  const gradosDelRango = inicioRango >= 0 && finRango >= inicioRango ? GRADOS.slice(inicioRango, finRango + 1) : [];
  const todosDelRango = seleccionarRango(panel.grupos, desde, hasta, "*").cursos;
  const excepciones = todosDelRango.filter(c => excluirGrados.includes(c.grado) || excluirCursos.includes(c.id));
  const cursosOrdenados = ordenarCursos(panel.grupos);
  const rango = seleccionarRango(panel.grupos, desde, hasta, seccionRango, excluirGrados, excluirCursos);
  const objetivos = modo === "rango" ? rango.cursos : cursosOrdenados.filter(c => seleccionados.includes(c.id));
  const rangoIncompleto = modo === "rango" && (!!rango.error || rango.faltantes.length > 0);
  function marcar(id: string, elegido: boolean) { setSeleccionados(actual => elegido ? [...new Set([...actual, id])] : actual.filter(item => item !== id)); }
  const [cargando, setCargando] = useState(true); const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(""); const [mensaje, setMensaje] = useState("");
  const cargar = useCallback(async (signal?: AbortSignal) => {
    if (!supabase || !permitido) return;
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) { setPanel({ grupos: [], docentes: [], asignaciones: [] }); setCargando(false); return; }
    setCargando(true);
    try {
      let consulta = supabase.rpc("panel_cursos", { p_anio: anio });
      if (signal) consulta = consulta.abortSignal(signal);
      const { data, error: fallo } = await consulta;
      if (signal?.aborted) return;
      if (fallo) throw fallo;
      setPanel(data as Panel);
    } catch (fallo) { if (!signal?.aborted) setError(mensajeError(fallo)); }
    finally { if (!signal?.aborted) setCargando(false); }
  }, [anio, permitido]);
  useEffect(() => {
    const controller = new AbortController();
    const inicio = window.setTimeout(() => void cargar(controller.signal), 0);
    return () => { window.clearTimeout(inicio); controller.abort(); };
  }, [cargar]);

  async function ejecutar(operacion: () => PromiseLike<{ error: unknown }>, exito: string) {
    if (ocupado) return; setOcupado(true); setError(""); setMensaje("");
    try { const { error: fallo } = await operacion(); if (fallo) throw fallo; setMensaje(exito); await cargar(); }
    catch (fallo) { setError(mensajeError(fallo)); }
    finally { setOcupado(false); }
  }
  function crear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return; const cliente = supabase;
    void ejecutar(() => cliente.rpc("crear_curso", { p_anio: anio, p_grado: grado, p_seccion: seccion }), "Curso guardado. Si ya existía, se conservó el mismo registro.");
  }
  function asignar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || ocupado || cargando) return;
    if ((objetivos.length === 0 && (modo !== "rango" || excepciones.length === 0)) || rangoIncompleto) { setError("Selecciona los cursos y completa los grados que faltan antes de asignar."); return; }
    const cliente = supabase;
    if (modo === "rango") {
      void ejecutar(() => cliente.rpc("configurar_docente_rango", { p_docente: docente, p_incluir: objetivos.map(curso => curso.id), p_excluir: excepciones.map(curso => curso.id), p_anio: anio }), `Rango guardado: ${objetivos.length} cursos incluidos y ${excepciones.length} excluidos. Las excepciones retiraron las asignaciones previas correspondientes, si existían.`);
    } else {
      void ejecutar(() => cliente.rpc("asignar_docente_cursos", { p_docente: docente, p_grupos: objetivos.map(curso => curso.id), p_anio: anio }), `Asignación guardada para ${objetivos.length} cursos. Se conservaron las demás asignaciones del docente.`);
    }
  }
  function retirar(item: Asignacion) {
    if (!supabase || !window.confirm(`¿Retirar a ${item.docente_nombre} del curso ${nombreCurso(item)}? Dejará de ver sus estudiantes a través de esta asignación. Se conservará el historial.`)) return;
    const cliente = supabase; void ejecutar(() => cliente.rpc("retirar_docente_curso", { p_id: item.id }), "Asignación retirada. Se conservó su historial.");
  }
  async function borrarCurso(tipo: "curso" | "grado", id: string | null, gradoBorrar: string, etiqueta: string) {
    if (!["superadministrador", "desarrollador"].includes(perfil.rol) || ocupado) return;
    const confirmacion = window.prompt(`Eliminar ${etiqueta} del año ${anio}. Solo se permite si no tiene matrículas ni asignaciones activas. El historial se conserva. Escribe ELIMINAR para confirmar.`);
    if (confirmacion === null) return;
    if (confirmacion !== "ELIMINAR") { setError("La confirmación no coincide."); return; }
    setOcupado(true); setError(""); setMensaje("");
    try { await eliminarRegistro(tipo, confirmacion, id, anio, gradoBorrar); setSeleccionados([]); limpiarExcepciones(); setMensaje("Curso o grado eliminado. El historial se conserva."); await cargar(); }
    catch (fallo) { setError(mensajeError(fallo)); }
    finally { setOcupado(false); }
  }
  if (!permitido) return <section className="panel"><h1>Acceso restringido</h1><p>Solo superadministradores y desarrollador administran estas asignaciones.</p></section>;
  return <div className="cursos-modulo">
    <section className="page-heading"><div><p className="eyebrow">ORGANIZACIÓN ESCOLAR</p><h1>Cursos y docentes</h1><p>Define qué cursos tiene a cargo cada docente durante el año lectivo.</p></div></section>
    {error && <p className="estudiantes-error" role="alert">{error}</p>}{mensaje && <p className="estudiantes-exito" role="status">{mensaje}</p>}
    <section className="panel cursos-panel"><div className="cursos-cabecera"><label>Año lectivo<input type="number" min={2000} max={2100} value={anio || ""} disabled={ocupado} onChange={e => { setAnio(Number(e.target.value)); setPanel({ grupos: [], docentes: [], asignaciones: [] }); setSeleccionados([]); setSeccionRango("*"); limpiarExcepciones(); setError(""); setMensaje(""); }} /></label><button className="acceso-secundario" type="button" disabled={cargando || ocupado} onClick={() => { setError(""); void cargar(); }}>Actualizar</button></div></section>
    <div className="cursos-formularios">
      <section className="panel cursos-panel"><h2>Crear curso</h2><p>Ejemplos: 5.º sin sección, 5.º A o 5.º B. No se duplican cursos que ya estén registrados.</p><form onSubmit={crear}>
        <label>Grado<select required value={grado} disabled={ocupado} onChange={e => setGrado(e.target.value)}><option value="">Selecciona el grado</option>{GRADOS.map(item => <option key={item.valor} value={item.valor}>{item.nombre}</option>)}</select></label>
        <label>Grupo o sección (opcional)<input maxLength={30} value={seccion} disabled={ocupado} placeholder="Ejemplo: A o B" onChange={e => setSeccion(e.target.value.toUpperCase())} /></label>
        <button className="primary-button" type="submit" disabled={ocupado || !anioValido}>{ocupado ? "Procesando…" : "Guardar curso"}</button>
      </form></section>
      <section className="panel cursos-panel"><h2>Asignar docente</h2><p>Un docente puede tener varios cursos y un curso puede tener varios docentes.</p><form onSubmit={asignar}>
        <label>Docente<select required value={docente} disabled={ocupado || cargando} onChange={e => setDocente(e.target.value)}><option value="">Selecciona el docente</option>{panel.docentes.map(item => <option value={item.id} key={item.id}>{item.nombre}</option>)}</select></label>
        <label>Forma de asignación<select value={modo} disabled={ocupado || cargando} onChange={e => setModo(e.target.value as "seleccion" | "rango")}><option value="seleccion">Elegir cursos específicos</option><option value="rango">Rango con excepciones</option></select></label>
        {modo === "rango" ? <>
          <div className="cursos-rango"><label>Desde<select value={desde} disabled={ocupado || cargando} onChange={e => { setDesde(e.target.value); limpiarExcepciones(); }}>{GRADOS.map(g => <option key={g.valor} value={g.valor}>{g.nombre}</option>)}</select></label><label>Hasta<select value={hasta} disabled={ocupado || cargando} onChange={e => { setHasta(e.target.value); limpiarExcepciones(); }}>{GRADOS.map(g => <option key={g.valor} value={g.valor}>{g.nombre}</option>)}</select></label></div>
          <label>Grupos incluidos<select value={seccionRango} disabled={ocupado || cargando} onChange={e => { setSeccionRango(e.target.value); limpiarExcepciones(); }}><option value="*">Todos los grupos de esos grados</option>{[...new Set(panel.grupos.map(c => c.seccion))].sort().map(seccion => <option key={seccion} value={seccion}>{seccion ? `Solo grupo ${seccion}` : "Solo cursos sin sección"}</option>)}</select></label>
          <fieldset className="cursos-seleccion cursos-excepciones" disabled={ocupado || cargando}><legend>Excepto estos cursos</legend>
            <p>Marca los grados completos o los grupos específicos a los que este docente no da clase.</p>
            <strong>Excluir grados completos</strong><div className="cursos-opciones">{gradosDelRango.map(g => <label className="cursos-opcion" key={g.valor}><input type="checkbox" checked={excluirGrados.includes(g.valor)} onChange={e => excluir(g.valor, e.target.checked, "grado")} />Todo {g.nombre}</label>)}</div>
            <strong>Excluir grupos específicos</strong><div className="cursos-opciones">{todosDelRango.map(curso => <label className="cursos-opcion" key={curso.id}><input type="checkbox" checked={excluirGrados.includes(curso.grado) || excluirCursos.includes(curso.id)} disabled={excluirGrados.includes(curso.grado)} onChange={e => excluir(curso.id, e.target.checked, "curso")} />{nombreCurso(curso)}</label>)}</div>
            <button type="button" className="acceso-secundario" onClick={limpiarExcepciones}>Quitar todas las excepciones</button>
            <p className="estudiantes-ayuda">Si el docente ya tenía alguno de estos cursos, al guardar se retirará esa asignación. Las asignaciones fuera de esta selección se conservan.</p>
          </fieldset>
          {rango.error && <p className="estudiantes-error" role="alert">{rango.error}</p>}
          {rango.faltantes.length > 0 && <p className="estudiantes-error" role="status">Faltan cursos registrados para: {rango.faltantes.join(", ")}. Créelos primero o elige cursos específicos. Registra el curso o excluye explícitamente ese grado si el docente no le da clase.</p>}
        </> : <fieldset className="cursos-seleccion" disabled={ocupado || cargando}><legend>Selecciona los cursos de {anio || "este año"}</legend>
          <div className="cursos-controles"><button type="button" className="acceso-secundario" onClick={() => setSeleccionados(panel.grupos.map(c => c.id))}>Seleccionar todos</button><button type="button" className="acceso-secundario" onClick={() => setSeleccionados([])}>Limpiar</button></div>
          <div className="cursos-opciones">{cursosOrdenados.map(curso => <label className="cursos-opcion" key={curso.id}><input type="checkbox" checked={seleccionados.includes(curso.id)} onChange={e => marcar(curso.id, e.target.checked)} />{nombreCurso(curso)}</label>)}</div>
          {panel.grupos.length === 0 && <p>Primero registra los cursos del año seleccionado.</p>}
        </fieldset>}
        <div className="cursos-resumen"><strong>Cursos que se asignarán: {objetivos.length}</strong><p>Año lectivo: {anio || "Sin seleccionar"}. {modo === "rango" ? "Se agregarán los cursos incluidos. Las excepciones marcadas retirarán esas asignaciones si ya existían." : "Se agregan a las asignaciones existentes."}</p><div className="cursos-etiquetas">{objetivos.map(curso => <span key={curso.id}>{nombreCurso(curso)}</span>)}</div></div>
        {modo === "rango" && excepciones.length > 0 && <div className="cursos-resumen cursos-excluidos"><strong>Quedarán excluidos: {excepciones.length}</strong><div className="cursos-etiquetas">{excepciones.map(curso => <span key={curso.id}>{nombreCurso(curso)}</span>)}</div></div>}
        <button className="primary-button" type="submit" disabled={ocupado || cargando || !anioValido || (objetivos.length === 0 && (modo !== "rango" || excepciones.length === 0)) || rangoIncompleto || panel.docentes.length === 0}>{modo === "rango" ? "Guardar rango y excepciones" : `Asignar ${objetivos.length} cursos`}</button>
        {!cargando && panel.docentes.length === 0 && <p>Primero crea una cuenta con rol Docente en Personal.</p>}
      </form></section>
    </div>
    <section className="panel cursos-panel"><h2>Cursos registrados · {anio || "Sin año"}</h2>{cargando ? <p role="status">Consultando…</p> : panel.grupos.length ? <div className="cursos-etiquetas">{panel.grupos.map(item => <span key={item.id}>{nombreCurso(item)}{["superadministrador", "desarrollador"].includes(perfil.rol) && <button type="button" className="cursos-borrar" disabled={ocupado} onClick={() => void borrarCurso("curso", item.id, item.grado, nombreCurso(item))}>Eliminar curso</button>}</span>)}</div> : <p>Todavía no hay cursos registrados para este año.</p>}</section>
    {["superadministrador", "desarrollador"].includes(perfil.rol) && panel.grupos.length > 0 && <section className="panel cursos-panel"><h2>Eliminar un grado del año {anio}</h2><p>Esta opción elimina todos los grupos registrados para ese grado en este año. Se bloqueará si alguno tiene matrículas o asignaciones activas.</p><div className="cursos-controles">{[...new Set(panel.grupos.map(g => g.grado))].map(g => <button type="button" key={g} className="personal-peligro" disabled={ocupado || cargando} onClick={() => void borrarCurso("grado", null, g, `todos los grupos de ${nombreGrado(g)}`)}>Eliminar {nombreGrado(g)} de {anio}</button>)}</div></section>}
    <AsignacionesDesplegable key={anio} asignaciones={panel.asignaciones} cargando={cargando} ocupado={ocupado} onRetirar={retirar} />
  </div>;
}
