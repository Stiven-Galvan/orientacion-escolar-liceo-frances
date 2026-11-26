import { remision } from "../remisiones/modelosRemision";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { GRADOS, DOCUMENTOS, anioActual, fechaColombia, mensajeError } from "./modelos";
import type { DatosFormulario, Ficha } from "./modelos";

type Props = { ficha?: Ficha; remisionId?:string; inicialRemision?:Partial<DatosFormulario>; onCancelar: () => void; onGuardado: (id: string) => void; onPendientes: (valor: boolean) => void };
export default function FormularioEstudiante({ ficha, remisionId, inicialRemision, onCancelar, onGuardado, onPendientes }: Props) {
  const [id] = useState(() => ficha?.estudiante.id ?? crypto.randomUUID());
  const [inicial] = useState<DatosFormulario>(() => {
    const e = ficha?.estudiante; const m = ficha?.matriculas[0];
    return { nombre: e?.nombre ?? "", tipo_documento: e ? e.tipo_documento ?? "" : "TI", numero_documento: e?.numero_documento ?? "", fecha_nacimiento: e?.fecha_nacimiento ?? "", estado: e?.estado ?? "activo", es_prueba: e?.es_prueba ?? false, acudiente_nombre: e?.acudiente_nombre ?? "", acudiente_parentesco: e?.acudiente_parentesco ?? "", acudiente_telefono: e?.acudiente_telefono ?? "", acudiente_correo: e?.acudiente_correo ?? "", anio_lectivo: m?.anio_lectivo ?? anioActual(), grado: m?.grado ?? "", seccion: m?.seccion ?? "", ...inicialRemision };
  });
  const [datos, setDatos] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const pendientes = JSON.stringify(datos) !== JSON.stringify(inicial);
  const campo = <K extends keyof DatosFormulario>(clave: K, valor: DatosFormulario[K]) => setDatos(actual => ({ ...actual, [clave]: valor }));

  useEffect(() => { onPendientes(pendientes); return () => onPendientes(false); }, [pendientes, onPendientes]);
  useEffect(() => {
    if (!pendientes) return;
    const avisar = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [pendientes]);

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || ocupado) return;
    if (!datos.tipo_documento && datos.numero_documento.trim()) { setError("Selecciona el tipo de documento."); return; }
    setOcupado(true); setError("");
    try {
      if(remisionId){const r=await remision<{id:string}>("registrar_estudiante",remisionId,{id,formulario:datos});onPendientes(false);onGuardado(r.id);return;}
      const { error: fallo } = await supabase.rpc("guardar_estudiante", { p_id: id, p_version: ficha?.estudiante.version ?? null, p_datos: datos });
      if (fallo) throw fallo;
      onPendientes(false); onGuardado(id);
    } catch (fallo) { setError(mensajeError(fallo)); }
    finally { setOcupado(false); }
  }
  function cancelar() {
    if (pendientes && !window.confirm("¿Descartar los cambios sin guardar?")) return;
    onPendientes(false); onCancelar();
  }
  return <section className="panel estudiantes-panel">
    <h2>{ficha ? "Editar estudiante y matrícula" : "Nuevo estudiante"}</h2>
    <p>Se guardará como registro del colegio. El estudiante no tendrá cuenta de acceso.</p>
    {error && <p className="estudiantes-error" role="alert">{error}</p>}
    <form className="estudiantes-formulario" onSubmit={guardar}>
      <fieldset disabled={ocupado}><legend>Datos del estudiante</legend><div className="estudiantes-campos">
        <label className="estudiantes-ancho">Nombre completo *<input required minLength={2} maxLength={180} readOnly={!!remisionId} value={datos.nombre} onChange={e => campo("nombre", e.target.value)} /></label>
        <label>Tipo de documento<select disabled={!!remisionId} value={datos.tipo_documento} onChange={e => { campo("tipo_documento", e.target.value); if (!e.target.value) campo("numero_documento", ""); }}><option value="">Sin documento registrado</option>{DOCUMENTOS.map(tipo => <option key={tipo}>{tipo}</option>)}</select></label>
        <label>Número de documento{datos.tipo_documento && " *"}<input required={!!datos.tipo_documento} disabled={!datos.tipo_documento} maxLength={30} readOnly={!!remisionId} pattern="[A-Za-z0-9-]{3,30}" title="Entre 3 y 30 letras, números o guiones, sin espacios" value={datos.numero_documento} onChange={e => campo("numero_documento", e.target.value.toUpperCase())} /></label>
        <label>Fecha de nacimiento<input type="date" min="1900-01-01" max={fechaColombia()} value={datos.fecha_nacimiento} onChange={e => campo("fecha_nacimiento", e.target.value)} /></label>
        <label>Estado<select value={datos.estado} onChange={e => campo("estado", e.target.value)}><option value="activo">Activo</option><option value="retirado">Retirado</option><option value="egresado">Egresado</option></select></label>
      </div></fieldset>
      <fieldset disabled={ocupado}><legend>Matrícula</legend><div className="estudiantes-campos">
        <label>Año lectivo *<input type="number" required min={2000} max={2100} value={datos.anio_lectivo || ""} onChange={e => campo("anio_lectivo", Number(e.target.value))} /></label>
        <label>Grado *<select required value={datos.grado} onChange={e => campo("grado", e.target.value)}><option value="">Selecciona el grado</option>{GRADOS.map(grado => <option key={grado.valor} value={grado.valor}>{grado.nombre}</option>)}</select></label>
        <label>Grupo o sección<input maxLength={30} placeholder="Ejemplo: A, B; puede quedar vacío" value={datos.seccion} onChange={e => campo("seccion", e.target.value.toUpperCase())} /></label>
      </div><p className="estudiantes-ayuda">Si cambias el año, agregarás o actualizarás la matrícula de ese año. Las matrículas de años anteriores se conservan.</p></fieldset>
      <fieldset disabled={ocupado}><legend>Contacto del acudiente</legend><div className="estudiantes-campos">
        <label>Nombre<input maxLength={180} value={datos.acudiente_nombre} onChange={e => campo("acudiente_nombre", e.target.value)} /></label>
        <label>Parentesco<input maxLength={60} value={datos.acudiente_parentesco} onChange={e => campo("acudiente_parentesco", e.target.value)} /></label>
        <label>Teléfono<input type="tel" maxLength={40} value={datos.acudiente_telefono} onChange={e => campo("acudiente_telefono", e.target.value)} /></label>
        <label>Correo<input type="email" maxLength={254} value={datos.acudiente_correo} onChange={e => campo("acudiente_correo", e.target.value)} /></label>
      </div></fieldset>
      <label className="estudiantes-check"><input type="checkbox" checked={datos.es_prueba} disabled={ocupado} onChange={e => campo("es_prueba", e.target.checked)} />Registro ficticio para pruebas</label>
      <div className="estudiantes-acciones"><button type="submit" className="primary-button" disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar estudiante"}</button><button type="button" className="acceso-secundario" disabled={ocupado} onClick={cancelar}>Cancelar</button></div>
    </form>
  </section>;
}
