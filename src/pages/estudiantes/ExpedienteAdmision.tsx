import { useCallback, useEffect, useState } from "react";
import { cargarEntrevistas, eliminarEntrevista, obtenerSoporte } from "../../lib/entrevistas";
import type { EntrevistaGuardada, SoporteGuardado } from "../../lib/entrevistas";
import { mensajeError } from "./modelos";
import VistaPreviaEntrevista from "../admisiones/components/VistaPreviaEntrevista";
import { descargarEntrevista } from "../admisiones/utils/descargarEntrevista";
export default function ExpedienteAdmision({ estudianteId, puedeEliminar }: { estudianteId: string; puedeEliminar: boolean }) {
  const [entrevistas, setEntrevistas] = useState<EntrevistaGuardada[]>([]);
  const [cargando, setCargando] = useState(true); const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(""); const [preview, setPreview] = useState<string | null>(null);
  const actualizar = useCallback(async () => {
    setCargando(true);
    try { setEntrevistas(await cargarEntrevistas(estudianteId)); }
    catch (fallo) { setError(mensajeError(fallo)); }
    finally { setCargando(false); }
  }, [estudianteId]);
  useEffect(() => {
    let vigente = true;
    void cargarEntrevistas(estudianteId)
      .then(datos => { if (vigente) setEntrevistas(datos); })
      .catch(fallo => { if (vigente) setError(mensajeError(fallo)); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [estudianteId]);
  function datosDocumento(item: EntrevistaGuardada) { return { ...item.datos, grado: `${item.datos.grado}${item.datos.grupo?.trim() ? ` · Grupo ${item.datos.grupo.trim()}` : ""}` }; }
  async function pdf(item: EntrevistaGuardada) {
    setError("");
    try { await descargarEntrevista(datosDocumento(item), item.firmas); } catch { setError("No se pudo generar el PDF. Revisa el escudo y el generador de documentos."); }
  }
  async function soporte(archivo: SoporteGuardado) {
    setError("");
    try {
      const blob = await obtenerSoporte(archivo); const url = URL.createObjectURL(blob); const enlace = document.createElement("a");
      enlace.href = url; enlace.download = archivo.name; document.body.appendChild(enlace); enlace.click(); enlace.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (fallo) { setError(mensajeError(fallo)); }
  }
  async function borrar(item: EntrevistaGuardada) {
    if (!puedeEliminar || ocupado) return;
    const nombre = window.prompt(`Eliminar únicamente esta entrevista, sus firmas y soporte. La ficha del estudiante se conserva. Escribe ELIMINAR para confirmar la baja de ${item.datos.nombre}`);
    if (nombre === null) return;
    if (nombre.trim().toUpperCase() !== "ELIMINAR") { setError("Debes escribir ELIMINAR para confirmar."); return; }
    setOcupado(true); setError("");
    try { await eliminarEntrevista(item, item.datos.nombre); setEntrevistas(prev => prev.filter(e => e.id !== item.id)); }
    catch (fallo) { await actualizar(); setError(mensajeError(fallo)); }
    finally { setOcupado(false); }
  }
  return <section className="panel estudiantes-panel"><div className="estudiantes-cabecera"><div><h2>Expediente de admisión</h2><p>Entrevistas, firmas y soportes trasladados desde Estudiantes nuevos.</p></div><button type="button" className="acceso-secundario" disabled={cargando || ocupado} onClick={() => { setError(""); void actualizar(); }}>Actualizar expediente</button></div>
    {error && <p className="estudiantes-error" role="alert">{error}</p>}
    {cargando ? <p role="status">Consultando expediente de admisión…</p> : entrevistas.length === 0 ? <p>No hay entrevistas de admisión vinculadas que tu cuenta pueda consultar. Las observaciones privadas mantienen los permisos de su autor.</p> : entrevistas.map(item => <article className="estudiantes-admision" key={item.id}>
      <h3>Entrevista del {item.datos.fecha} · Ingreso {item.datos.ingreso}</h3>
      {item.eliminando ? <p className="estudiantes-error">Hay una eliminación pendiente. Un superadministrador o el desarrollador puede terminar el borrado del expediente.</p> : <>
        <div className="estudiantes-acciones"><button type="button" className="acceso-secundario" onClick={() => setPreview(preview === item.id ? null : item.id)}>{preview === item.id ? "Cerrar vista previa" : "Ver entrevista y firmas"}</button><button type="button" className="acceso-secundario" onClick={() => void pdf(item)}>Descargar PDF</button>{item.soporteProfesional && <button type="button" className="acceso-secundario" onClick={() => void soporte(item.soporteProfesional!)}>Descargar soporte · {item.soporteProfesional.name}</button>}</div>
        {preview === item.id && <VistaPreviaEntrevista datos={datosDocumento(item)} firmas={item.firmas} />}
        <details className="estudiantes-observaciones-privadas"><summary>Observaciones adicionales privadas y antecedentes</summary><p style={{ whiteSpace: "pre-wrap" }}>{item.notasPrivadas || "Sin observaciones adicionales"}</p><p><strong>Condiciones registradas:</strong> {item.condiciones.length ? item.condiciones.join(" · ") : "Sin condiciones registradas"}</p>{item.fuente && <p><strong>Fuente:</strong> {item.fuente}</p>}</details>
      </>}
      {puedeEliminar && (!item.eliminando || item.borradoMotivo === "manual") && <button type="button" className="personal-peligro" disabled={ocupado} onClick={() => void borrar(item)}>{item.eliminando ? "Reintentar eliminación de entrevista" : "Eliminar solo esta entrevista"}</button>}
    </article>)}
  </section>;
}
