import PiarDetalle from "../piar/PiarDetalle";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { anioActual, mensajeError, nombreGrado } from "./modelos";
import type { Perfil } from "../../types/perfil";
import ObservacionDocente from "../observaciones/ObservacionDocente";
type Curso = { id: string; anio_lectivo: number; grado: string; seccion: string };
type Alumno = { id: string; nombre: string; anio_lectivo: number; grupo_id: string; grado: string; seccion: string; pendientes: number; enviados: number; piar_id?: string | null; piar_periodo?: number };
export default function MisEstudiantes({ perfil, onPendientes }: { perfil: Perfil; onPendientes: (valor: boolean) => void }) {
  const [piarAbierto,setPiarAbierto]=useState<string|null>(null);
  const [filtro, setFiltro] = useState({ anio: anioActual(), grupo: "", busqueda: "", pagina: 1 });
  const [data, setData] = useState<{ grupos: Curso[]; estudiantes: Alumno[]; total: number }>({ grupos: [], estudiantes: [], total: 0 });
  const [cargando, setCargando] = useState(true); const [error, setError] = useState(""); const [revision, setRevision] = useState(0);
  const [abierto, setAbierto] = useState<{ alumno: Alumno; estado: "pendientes" | "enviados" } | null>(null);
  const [hayCambios, setHayCambios] = useState(false);
  const pendientes = useCallback((valor: boolean) => { setHayCambios(valor); onPendientes(valor); }, [onPendientes]);
  useEffect(() => {
    if (!supabase || perfil.rol !== "docente") return;
    const cliente = supabase; const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCargando(true); setError("");
      void (async () => {
        try {
          const { data: resultado, error: fallo } = await cliente.rpc("mis_estudiantes_cursos", { p_anio: filtro.anio, p_grupo: filtro.grupo || null, p_busqueda: filtro.busqueda, p_pagina: filtro.pagina }).abortSignal(controller.signal);
          if (controller.signal.aborted) return;
          if (fallo) throw fallo;
          setData(resultado as { grupos: Curso[]; estudiantes: Alumno[]; total: number });
        } catch (fallo) { if (!controller.signal.aborted) { setData({ grupos: [], estudiantes: [], total: 0 }); setError(mensajeError(fallo)); } }
        finally { if (!controller.signal.aborted) setCargando(false); }
      })();
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [filtro, revision, perfil.rol]);
  useEffect(()=>{if(perfil.rol!=="docente")return;const timer=window.setInterval(()=>{if(!document.hidden)setRevision(x=>x+1);},15000);return()=>clearInterval(timer);},[perfil.rol]);
  if (perfil.rol !== "docente") return <section className="panel estudiantes-panel"><h1>Mis estudiantes · Vista docente</h1><p>El docente solo ve estudiantes de sus cursos con formatos habilitados, diligencia sus pendientes y consulta sus propios envíos. Esta pantalla no incluye acciones administrativas.</p><p>Para probar una lista personal, ingresa con una cuenta docente. Tus permisos completos siguen disponibles en Mi panel de desarrollador.</p></section>;
  if (piarAbierto) return <PiarDetalle id={piarAbierto} perfil={perfil} onPendientes={pendientes} onVolver={()=>{setPiarAbierto(null);setRevision(x=>x+1);}}/>;
  if (abierto) return <div className="estudiantes-modulo"><section className="page-heading"><div><p className="eyebrow">MIS FORMATOS DEL ESTUDIANTE</p><h1>{abierto.alumno.nombre}</h1><p>Solo puedes diligenciar tus pendientes y consultar los formatos que tú enviaste.</p></div><button type="button" className="acceso-secundario" onClick={() => { if (hayCambios && !window.confirm("Hay un formato sin enviar. ¿Volver y descartar lo escrito?")) return; pendientes(false); setAbierto(null); setRevision(x => x + 1); }}>Volver a mis estudiantes</button></section>{abierto.alumno.piar_id && <section className="panel estudiantes-panel"><p>El estudiante ha pasado a formato PIAR · Período {abierto.alumno.piar_periodo}</p><button type="button" className="primary-button" onClick={()=>{if(hayCambios&&!window.confirm("Hay cambios sin enviar. ¿Descartarlos y abrir PIAR?"))return;pendientes(false);setPiarAbierto(abierto.alumno.piar_id!);}}>Ir al formato PIAR</button></section>}<ObservacionDocente key={`${abierto.alumno.id}:${abierto.alumno.anio_lectivo}:${abierto.estado}`} perfil={perfil} estudianteId={abierto.alumno.id} estadoInicial={abierto.estado} anioInicial={String(abierto.alumno.anio_lectivo)} onPendientes={pendientes} /></div>;
  const paginas = Math.max(1, Math.ceil(data.total / 25));
  return <div className="estudiantes-modulo">
    <section className="page-heading"><div><p className="eyebrow">PERFIL DOCENTE</p><h1>Mis estudiantes</h1><p>Estudiantes de tus cursos con formatos de intervención habilitados para ti. Consulta únicamente tus propios registros.</p></div><button type="button" className="acceso-secundario" disabled={cargando} onClick={() => setRevision(valor => valor + 1)}>Actualizar</button></section>
    {error && <p role="alert" className="estudiantes-error">{error}</p>}
    <section className="panel estudiantes-panel"><div className="estudiantes-filtros">
      <label>Año lectivo<input type="number" min={2000} max={2100} value={filtro.anio || ""} onChange={e => setFiltro({ ...filtro, anio: Number(e.target.value), grupo: "", pagina: 1 })} /></label>
      <label>Curso<select value={filtro.grupo} onChange={e => setFiltro({ ...filtro, grupo: e.target.value, pagina: 1 })}><option value="">Todos mis cursos</option>{data.grupos.map(item => <option value={item.id} key={item.id}>{nombreGrado(item.grado)}{item.seccion ? ` · ${item.seccion}` : " · Sin sección"}</option>)}</select></label>
      <label>Buscar estudiante<input type="search" maxLength={180} value={filtro.busqueda} onChange={e => setFiltro({ ...filtro, busqueda: e.target.value, pagina: 1 })} /></label>
    </div>
    {cargando ? <p role="status">Consultando estudiantes en procesos…</p> : <><p>{data.total} estudiantes con formatos habilitados o registros propios</p><div className="estudiantes-tabla-contenedor"><table className="estudiantes-tabla"><thead><tr><th scope="col">Estudiante</th><th scope="col">Curso</th><th scope="col">Año</th><th scope="col">Mis formatos</th></tr></thead><tbody>{data.estudiantes.map(item => <tr key={`${item.id}-${item.anio_lectivo}`}><td>{item.nombre}</td><td>{nombreGrado(item.grado)}{item.seccion ? ` · ${item.seccion}` : " · Sin sección"}</td><td>{item.anio_lectivo}</td><td><div className="estudiantes-acciones">{item.piar_id && <><span className="estudiantes-insignia">El estudiante ha pasado a formato PIAR</span><button type="button" className="primary-button" onClick={()=>setPiarAbierto(item.piar_id!)}>Ir al formato PIAR · Período {item.piar_periodo}</button></>}{item.pendientes > 0 && <button type="button" className="primary-button" onClick={() => setAbierto({ alumno: item, estado: "pendientes" })}>Diligenciar observación docente · {item.pendientes}</button>}{item.enviados > 0 && <button type="button" className="acceso-secundario" onClick={() => setAbierto({ alumno: item, estado: "enviados" })}>Ver mis registros · {item.enviados}</button>}</div></td></tr>)}</tbody></table>{data.total === 0 && <p>No tienes estudiantes con formatos habilitados para estos filtros. Orientación debe habilitar el proceso y debes estar asignado al curso.</p>}</div><div className="estudiantes-paginacion"><button className="acceso-secundario" type="button" disabled={filtro.pagina <= 1} onClick={() => setFiltro({ ...filtro, pagina: filtro.pagina - 1 })}>Anterior</button><span>Página {filtro.pagina} de {paginas}</span><button className="acceso-secundario" type="button" disabled={filtro.pagina >= paginas} onClick={() => setFiltro({ ...filtro, pagina: filtro.pagina + 1 })}>Siguiente</button></div></>}
    </section>
  </div>;
}
