import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { mensajeError, nombreGrado } from "./modelos";
import type { Matricula } from "./modelos";
export default function DocentesDelEstudiante({ estudianteId, matriculas }: { estudianteId: string; matriculas: Matricula[] }) {
  const [anio, setAnio] = useState(matriculas[0]?.anio_lectivo ?? 0);
  const [docentes, setDocentes] = useState<{ id: string; nombre: string }[]>([]);
  const [cargando, setCargando] = useState(false); const [error, setError] = useState(""); const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!supabase || !anio) return;
    const cliente = supabase; const controller = new AbortController();
    const inicio = window.setTimeout(async () => {
      setCargando(true); setError("");
      try {
        const { data, error: fallo } = await cliente.rpc("docentes_de_estudiante", { p_estudiante: estudianteId, p_anio: anio }).abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        if (fallo) throw fallo;
        setDocentes(data ?? []);
      } catch (fallo) { if (!controller.signal.aborted) { setDocentes([]); setError(mensajeError(fallo)); } }
      finally { if (!controller.signal.aborted) setCargando(false); }
    }, 0);
    return () => { window.clearTimeout(inicio); controller.abort(); };
  }, [estudianteId, anio, revision]);
  return <section className="panel estudiantes-panel"><h2>Docentes del curso</h2><p>Asignaciones activas para la matrícula seleccionada.</p>{matriculas.length === 0 ? <p>Primero registra su matrícula y asigna docentes al curso.</p> : <><div className="estudiantes-acciones"><label>Matrícula<select value={anio} onChange={e => setAnio(Number(e.target.value))}>{matriculas.map(item => <option key={item.id} value={item.anio_lectivo}>{item.anio_lectivo} · {nombreGrado(item.grado)}{item.seccion ? ` · ${item.seccion}` : ""}</option>)}</select></label><button type="button" className="acceso-secundario" disabled={cargando} onClick={() => setRevision(valor => valor + 1)}>Actualizar docentes</button></div>{error && <p role="alert" className="estudiantes-error">{error}</p>}{cargando ? <p role="status">Consultando…</p> : docentes.length ? <ul>{docentes.map(item => <li key={item.id}>{item.nombre}</li>)}</ul> : <p>No hay docentes asignados. El superadministrador puede registrarlos en Cursos y docentes.</p>}</>}</section>;
}
