import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import type { Perfil, Rol } from "../../types/perfil";
import { mensajeError } from "../estudiantes/modelos";
import "./Seguimiento.css";

type Pendiente = { id: string; estado: "aprobada" | "aceptada" | "vinculada"; estudiante_id: string | null; nombre: string; orientador_nombre: string | null; enviado_en: string | null; docente_nombre: string };
type Acuerdo = { id: string; compromiso: string; responsable: string; revisar_el: string; resultado: string | null; reporte_docente: string | null };
type Caso = {
  id: string; estudiante_id: string; nombre: string; responsable_id: string | null; responsable: string; estado: "abierto" | "cerrado";
  proxima_accion: string | null; acuerdos_proximos: number; vence_el: string; cierre: string | null; version: number;
  remisiones: { id: string; autor: string; es_docente: boolean; indicacion: string | null }[];
  acuerdos: Acuerdo[];
  historial: { id: number; accion: Accion | "reportar_acuerdo"; detalle: string | null; actor: string; fecha: string }[];
};
type Resumen = { casos: Caso[]; pendientes: Pendiente[]; orientadores: { id: string; nombre: string }[] };
const acciones = {
  abrir: "Abrir caso", vincular: "Vincular remisión", planificar: "Programar siguiente acción",
  cerrar: "Cerrar caso", reabrir: "Reabrir caso", reasignar: "Reasignar responsable",
  acuerdo: "Registrar acuerdo", resultado: "Registrar resultado", devolver: "Enviar indicación al docente",
} as const;
type Accion = keyof typeof acciones;
type Edicion = { accion: Accion; caso?: Caso; remisionId?: string; acuerdoId?: string };
type Devolucion = { estado: Caso["estado"]; indicacion: string | null; enviada_en: string | null; acuerdos: Pick<Acuerdo, "id" | "compromiso" | "revisar_el" | "reporte_docente">[] };

async function consultar<T>(accion: string, id: string | null = null, datos: Record<string, unknown> = {}) {
  if (!supabase) throw new Error("Falta la conexión con Supabase");
  const { data, error } = await supabase.rpc("orientacion_seguimiento", { p_accion: accion, p_id: id, p_datos: datos });
  if (error) throw error;
  return data as T;
}

const fechaColombia = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" });
const fechaDia = (fecha: string) => fechaColombia.format(new Date(fecha + "T12:00:00-05:00"));
const isoBogota = (fecha: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(fecha);

export function DevolucionDocente({ remisionId, revision }: { remisionId: string; revision: number }) {
  const [recarga, setRecarga] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [devolucion, setDevolucion] = useState<Devolucion | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let vigente = true;
    void consultar<Devolucion | null>("devolucion_docente", remisionId)
      .then(dato => { if (vigente) { setDevolucion(dato); setError(""); } })
      .catch(fallo => { if (vigente) setError(mensajeError(fallo)); });
    return () => { vigente = false; };
  }, [remisionId, revision, recarga]);
  async function reportar(evento: FormEvent<HTMLFormElement>, acuerdoId: string) {
    evento.preventDefault();
    if (enviando) return;
    const texto = new FormData(evento.currentTarget).get("reporte");
    setEnviando(true);
    setError("");
    try {
      await consultar("reportar_acuerdo", remisionId, { acuerdo_id: acuerdoId, texto });
      setRecarga(valor => valor + 1);
    } catch (fallo) { setError(mensajeError(fallo)); }
    finally { setEnviando(false); }
  }
  return <section className="oc-section"><h3>Seguimiento de Orientación</h3>
    {error && <p role="alert">{error}</p>}
    <>
      <p>{devolucion ? devolucion.estado === "cerrado" ? "Caso cerrado" : "Caso en seguimiento" : "Pendiente de seguimiento"}</p>
      {devolucion?.indicacion && <><h4>Indicación para el aula</h4><p className="oc-texto">{devolucion.indicacion}</p></>}
      {devolucion?.acuerdos.map(acuerdo => <article className="oc-card" key={acuerdo.id}>
        <h4>{acuerdo.compromiso}</h4><p>Revisión · {fechaDia(acuerdo.revisar_el)}</p>
        {devolucion.estado === "abierto" ? <form className="oc-form" onSubmit={evento => void reportar(evento, acuerdo.id)}>
          <label>Aplicación del acuerdo<textarea name="reporte" required rows={3} maxLength={2000} defaultValue={acuerdo.reporte_docente ?? ""} /></label>
          <button type="submit" className="rm-button" disabled={enviando}>{enviando ? "Enviando…" : "Enviar a Orientación"}</button>
          {acuerdo.reporte_docente && <p>Reporte registrado.</p>}
        </form> : acuerdo.reporte_docente && <p>{acuerdo.reporte_docente}</p>}
      </article>)}
    </>
  </section>;
}

export default function Seguimiento({ perfil, rolVista, estudianteId, onAbrirEstudiante, onAbrirRemision, onPendientes }: {
  perfil: Perfil; rolVista: Rol; estudianteId?: string;
  onAbrirEstudiante?: (id: string) => void; onAbrirRemision?: (id: string) => void;
  onPendientes?: (valor: boolean) => void;
}) {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [filtro, setFiltro] = useState("abiertos");
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [sucio, setSucio] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const coord = rolVista.startsWith("coordinacion_");
  const admin = rolVista === "superadministrador" || rolVista === "desarrollador";
  const [referencia, setReferencia] = useState(() => new Date());
  const hoy = isoBogota(referencia);
  const semana = isoBogota(new Date(referencia.getTime() + 7 * 86400000));
  useEffect(() => {
    let vigente = true;
    void consultar<Resumen>("listar", estudianteId ?? null).then(data => {
      if (!vigente) return;
      if (perfil.rol === "desarrollador" && rolVista === "orientador") {
        data.casos = data.casos.filter(caso => caso.responsable_id === perfil.id);
      }
      setResumen(data);
      setError("");
    }).catch(fallo => { if (vigente) setError(mensajeError(fallo)); });
    return () => { vigente = false; };
  }, [estudianteId, perfil.id, perfil.rol, revision, rolVista]);

  useEffect(() => {
    onPendientes?.(sucio || ocupado);
    return () => onPendientes?.(false);
  }, [onPendientes, sucio, ocupado]);

  useEffect(() => {
    if (!sucio && !ocupado) return;
    const avisar = (evento: BeforeUnloadEvent) => evento.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sucio, ocupado]);

  function editar(siguiente: Edicion | null) {
    if (ocupado || (sucio && !window.confirm("Hay cambios en el seguimiento sin guardar. ¿Descartarlos?"))) return;
    setError("");
    setSucio(false);
    setEdicion(siguiente);
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!edicion || ocupado) return;
    const campos = Object.fromEntries(new FormData(evento.currentTarget));
    setOcupado(true);
    setError("");
    try {
      await consultar(edicion.accion, edicion.caso?.id, {
        ...campos, version: edicion.caso?.version,
        remision_id: edicion.remisionId ?? campos.remision_id, acuerdo_id: edicion.acuerdoId,
      });
      setEdicion(null);
      setSucio(false);
      setRevision(valor => valor + 1);
    } catch (fallo) { setError(mensajeError(fallo)); }
    finally { setOcupado(false); }
  }

  const pendientes = resumen?.pendientes ?? [];
  const casos = resumen?.casos ?? [];
  const elegible = (r: Pendiente) => r.estado !== "aprobada" && Boolean(r.estudiante_id);
  const vencidos = casos.filter(caso => caso.estado === "abierto" && caso.vence_el < hoy).length;
  const acuerdosProximos = casos.flatMap(caso => caso.acuerdos.flatMap(acuerdo =>
    !acuerdo.resultado && acuerdo.revisar_el <= semana && caso.estado === "abierto" ? [{ caso, acuerdo }] : []));
  const visibles = casos.filter(caso => {
    if (filtro === "cerrados") return caso.estado === "cerrado";
    if (filtro === "vencidos") return caso.estado === "abierto" && caso.vence_el < hoy;
    return caso.estado === "abierto";
  });
  const boton = (accion: Accion, caso: Caso, remisionId?: string, acuerdoId?: string) =>
    <button type="button" className="rm-button" disabled={ocupado} onClick={() => editar({ accion, caso, remisionId, acuerdoId })}>{acciones[accion]}</button>;
  const accion = edicion?.accion;
  const totalAcuerdosProximos = casos.reduce((total, caso) => total + (caso.estado === "abierto" ? caso.acuerdos_proximos : 0), 0);
  const usaFecha = accion === "abrir" || accion === "planificar" || accion === "reabrir" || accion === "acuerdo";

  return <section className="panel oc-section">
    <header className="oc-heading">
      {estudianteId ? <h2>Seguimiento del expediente</h2> : <h1>{coord ? "Seguimiento de remisiones" : admin ? "Casos de Orientación" : "Mis casos de Orientación"}</h1>}
      <button type="button" className="rm-button" disabled={ocupado} onClick={() => { setReferencia(new Date()); setRevision(valor => valor + 1); }}>Actualizar</button>
    </header>
    {error && <p className="rm-error" role="alert">{error}</p>}
    {!resumen && !error && <p role="status">Cargando seguimiento…</p>}
    {resumen && <>
      <div className="oc-actions"><p><strong>{vencidos}</strong> casos vencidos</p><p><strong>{pendientes.length}</strong> remisiones sin caso</p>
        <p><strong>{totalAcuerdosProximos}</strong> acuerdos por revisar hasta {fechaDia(semana)}</p></div>
      {edicion && <form className="oc-form" key={[accion, edicion.caso?.id, edicion.remisionId, edicion.acuerdoId].join(":")} onChange={() => setSucio(true)} onSubmit={evento => void guardar(evento)}>
        <h3>{acciones[edicion.accion]}</h3>
        {edicion.caso && <p>{edicion.caso.nombre}</p>}
        {accion === "vincular" && <label>Remisión del mismo estudiante
          <select required name="remision_id" defaultValue="">
            <option value="">Seleccionar</option>
            {pendientes.filter(r => elegible(r) && r.estudiante_id === edicion.caso?.estudiante_id).map(r =>
              <option key={r.id} value={r.id}>{r.docente_nombre} · {r.enviado_en ? fechaColombia.format(new Date(r.enviado_en)) : "Sin fecha"}</option>)}
          </select>
        </label>}
        {accion === "reasignar" && <label>Orientador responsable
          <select required name="perfil_id" defaultValue={edicion.caso?.responsable_id ?? ""}>
            <option value="">Seleccionar</option>
            {resumen.orientadores.map(orientador => <option key={orientador.id} value={orientador.id}>{orientador.nombre}</option>)}
          </select>
        </label>}
        {accion !== "vincular" && accion !== "reasignar" && <label>
          {accion === "cerrar" ? "Motivo, acciones realizadas y resultado" : accion === "acuerdo" ? "Compromiso" : accion === "resultado" ? "Resultado del acuerdo" : accion === "devolver" ? "Indicación de aula que recibirá el docente" : "Próxima acción"}
          <textarea name="texto" required rows={3} minLength={accion === "cerrar" ? 5 : 1} maxLength={accion === "cerrar" ? 3000 : 2000} />
        </label>}
        {accion === "acuerdo" && <>
          <label>Responsable<input name="responsable" required maxLength={180} /></label>
          <label>Docente al que se solicita reportar la aplicación
            <select name="remision_id" defaultValue="">
              <option value="">Sin reporte docente</option>
              {edicion.caso?.remisiones.filter(r => r.es_docente).map(r => <option key={r.id} value={r.id}>{r.autor}</option>)}
            </select>
          </label>
        </>}
        {usaFecha && <label>{accion === "acuerdo" ? "Fecha de revisión" : "Fecha límite"}<input required name="fecha" type="date" min={hoy} /></label>}
        <div className="oc-actions">
          <button type="submit" className="primary-button" disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar"}</button>
          <button type="button" className="rm-button" disabled={ocupado} onClick={() => editar(null)}>Cancelar</button>
        </div>
      </form>}
      {acuerdosProximos.length > 0 && <details className="oc-card"><summary>Acuerdos vencidos o próximos</summary>
        <ul>{acuerdosProximos.map(({ caso, acuerdo }) => <li key={acuerdo.id}>
          <strong>{caso.nombre}</strong> · {acuerdo.compromiso} · {acuerdo.responsable} · {fechaDia(acuerdo.revisar_el)}
          {boton("resultado", caso, undefined, acuerdo.id)}
        </li>)}</ul>
      </details>}
      {pendientes.length > 0 && <details className="oc-card" open><summary>Remisiones sin caso</summary>
        <ul>{pendientes.map(r => <li key={r.id}><strong>{r.nombre}</strong> · {r.orientador_nombre ?? "Por recibir en Orientación"}
          {r.enviado_en && <> · Radicada el {fechaColombia.format(new Date(r.enviado_en))}</>}
          <div className="oc-actions">
            {onAbrirRemision && <button type="button" className="rm-button" onClick={() => onAbrirRemision(r.id)}>Ver remisión</button>}
            {!coord && elegible(r) && <button type="button" className="rm-button" disabled={ocupado} onClick={() => editar({ accion: "abrir", remisionId: r.id })}>Abrir caso</button>}
          </div>
        </li>)}</ul>
      </details>}
      <label className="oc-filter">Estado del caso
        <select value={filtro} onChange={evento => setFiltro(evento.target.value)}>
          <option value="abiertos">Abiertos</option><option value="vencidos">Vencidos</option><option value="cerrados">Cerrados</option>
        </select>
      </label>
      {visibles.length === 0 && <p>No hay casos en esta vista.</p>}
      {visibles.map(caso => <article className="oc-card" key={caso.id}>
        <h3>{caso.nombre}</h3>
        <p>Responsable · {caso.responsable}</p>
        <p><strong>{caso.estado === "cerrado" ? "Cerrado" : caso.vence_el < hoy ? "Vencido" : "En seguimiento"}</strong>
          {caso.estado === "abierto" && <> · Fecha límite {fechaDia(caso.vence_el)}</>}</p>
        {caso.estado === "abierto" && caso.proxima_accion && <p className="oc-texto">{caso.proxima_accion}</p>}
        {caso.cierre && <p className="oc-texto">{caso.cierre}</p>}
        <div className="oc-actions">
          {onAbrirEstudiante && !coord && <button type="button" className="rm-button" onClick={() => onAbrirEstudiante(caso.estudiante_id)}>Ver expediente</button>}
          {!coord && (caso.estado === "abierto" ? <>
            {boton("planificar", caso)} {boton("acuerdo", caso)} {boton("cerrar", caso)}
            {admin && boton("reasignar", caso)}
            {pendientes.some(r => elegible(r) && r.estudiante_id === caso.estudiante_id) && boton("vincular", caso)}
          </> : boton("reabrir", caso))}
        </div>
        <details><summary>Remisiones vinculadas · {caso.remisiones.length}</summary><ul>
          {caso.remisiones.map(r => <li key={r.id}>{r.autor}
            <div className="oc-actions">
              {onAbrirRemision && <button type="button" className="rm-button" onClick={() => onAbrirRemision(r.id)}>Ver remisión</button>}
              {!coord && r.es_docente && boton("devolver", caso, r.id)}
            </div>
            {r.indicacion && <p className="oc-texto">{r.indicacion}</p>}
          </li>)}
        </ul></details>
        {!coord && <>
          <details><summary>Acuerdos · {caso.acuerdos.length}</summary><ul>
            {caso.acuerdos.map(a => <li key={a.id}><strong>{a.compromiso}</strong> · {a.responsable} · {fechaDia(a.revisar_el)}
              {a.reporte_docente && <p className="oc-texto">Reporte docente · {a.reporte_docente}</p>}
              {a.resultado ? <p className="oc-texto">{a.resultado}</p> : <p>Resultado pendiente</p>}
              {caso.estado === "abierto" && boton("resultado", caso, undefined, a.id)}
            </li>)}
          </ul></details>
          <details><summary>Historial del caso</summary><ol>
            {caso.historial.map(h => <li key={h.id}><strong>{h.accion === "reportar_acuerdo" ? "Reporte docente" : acciones[h.accion]}</strong> · {h.actor} · {fechaColombia.format(new Date(h.fecha))}
              {h.detalle && <p className="oc-texto">{h.detalle}</p>}
            </li>)}
          </ol></details>
        </>}
      </article>)}
    </>}
  </section>;
}
