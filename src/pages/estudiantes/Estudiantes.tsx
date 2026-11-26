import RegistroDesdeRemision from "../remisiones/RegistroDesdeRemision";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Perfil, Rol } from "../../types/perfil";
import { GRADOS, nombreGrado, mensajeError } from "./modelos";
import type { Resumen, Ficha } from "./modelos";
import FormularioEstudiante from "./FormularioEstudiante";
import FichaEstudiante from "./FichaEstudiante";
import MisEstudiantes from "./MisEstudiantes";
import { eliminarRegistro } from "../../lib/eliminaciones";
import "./Estudiantes.css";

type Props = { perfil: Perfil; rolVista: Rol; onPendientes: (valor: boolean) => void; abrirId?: string | null; remisionId?:string|null; onCancelarRemision?:()=>void; onRemisionRegistrada?:()=>void; onAbrirRemision?:(id:string)=>void };
export default function Estudiantes({ perfil, rolVista, onPendientes, abrirId, remisionId, onCancelarRemision, onRemisionRegistrada, onAbrirRemision }: Props) {
  const permitido = ["orientador", "superadministrador", "desarrollador"].includes(perfil.rol) && rolVista !== "docente";
  const [vista, setVista] = useState<"lista" | "nuevo" | "ficha" | "editar">("lista");
  const [filtros, setFiltros] = useState({ busqueda: "", anio: "", grado: "", estado: "", pagina: 1 });
  const [listado, setListado] = useState<{ estudiantes: Resumen[]; total: number }>({ estudiantes: [], total: 0 });
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [cargando, setCargando] = useState(true);
  const [abriendo, setAbriendo] = useState(false);
  const [refrescar, setRefrescar] = useState(0);
  const [error, setError] = useState("");
  const [errorLista, setErrorLista] = useState("");
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    if (!supabase || !permitido) return;
    const cliente = supabase; const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCargando(true); setErrorLista("");
      void (async () => {
        try {
          const { data, error: fallo } = await cliente.rpc("listar_estudiantes", { p_busqueda: filtros.busqueda, p_anio: filtros.anio ? Number(filtros.anio) : null, p_grado: filtros.grado || null, p_estado: filtros.estado || null, p_pagina: filtros.pagina }).abortSignal(controller.signal);
          if (controller.signal.aborted) return;
          if (fallo) throw fallo;
          setListado(data as { estudiantes: Resumen[]; total: number });
        } catch (fallo) { if (!controller.signal.aborted) { setListado({ estudiantes: [], total: 0 }); setErrorLista(mensajeError(fallo)); } }
        finally { if (!controller.signal.aborted) setCargando(false); }
      })();
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [filtros, refrescar, permitido]);

  const abrirFicha = useCallback(async (id: string, guardado = false) => {
    if (!supabase) return;
    setAbriendo(true); setError("");
    try {
      const { data, error: fallo } = await supabase.rpc("ficha_estudiante", { p_id: id });
      if (fallo) throw fallo;
      if (!data?.estudiante) throw new Error("No se encontró el estudiante o tu cuenta ya no tiene acceso.");
      setFicha(data as Ficha); setVista("ficha");
    } catch (fallo) { setError(`${guardado ? "El estudiante se guardó, pero no se pudo abrir la ficha. " : ""}${mensajeError(fallo)}`); setVista("lista"); }
    finally { setAbriendo(false); }
  }, []);
  useEffect(() => {
    if (!abrirId || !permitido || !supabase) return;
    let vigente = true;
    void Promise.resolve(supabase.rpc("ficha_estudiante", { p_id: abrirId })).then(({ data, error: fallo }) => {
      if (!vigente) return;
      if (fallo || !data?.estudiante) { setError(fallo?.message ?? "No se encontró el estudiante."); return; }
      setFicha(data as Ficha); setVista("ficha");
    }).catch(fallo => { if(vigente) setError(mensajeError(fallo)); });
    return () => { vigente = false; };
  }, [abrirId, permitido]);
  function guardado(id: string) {
    setMensaje("Estudiante y matrícula guardados en Supabase.");
    setVista("lista"); setRefrescar(valor => valor + 1); void abrirFicha(id, true);
  }

  async function borrarRegistro(tipo: "estudiante" | "matricula", id: string) {
    if (!["superadministrador", "desarrollador"].includes(perfil.rol) || !ficha || abriendo) return;
    const esperado = "ELIMINAR";
    const confirmacion = window.prompt(tipo === "estudiante" ? `Se eliminará el expediente completo: ficha, matrículas, entrevistas vinculadas, firmas, soportes y observaciones docentes. El historial de la acción se conserva. Escribe ELIMINAR para confirmar la baja de ${ficha.estudiante.nombre}` : "Se eliminará esta matrícula, conservando la ficha y el historial. Escribe ELIMINAR para confirmar.");
    if (confirmacion === null) return;
    if (confirmacion.trim().toUpperCase() !== esperado) { setError("La confirmación no coincide."); return; }
    setAbriendo(true); setError(""); setMensaje("");
    try {
      await eliminarRegistro(tipo, tipo === "estudiante" ? ficha.estudiante.nombre : "ELIMINAR", id);
      setMensaje("Registro eliminado. El historial de la acción se conserva."); setRefrescar(valor => valor + 1);
      if (tipo === "estudiante") { setFicha(null); setVista("lista"); } else { await abrirFicha(ficha.estudiante.id); }
    } catch (fallo) {
      const aviso = mensajeError(fallo);
      if (tipo === "estudiante") await abrirFicha(ficha.estudiante.id);
      setError(aviso);
    }
    finally { setAbriendo(false); }
  }
  if (!permitido) return <MisEstudiantes perfil={perfil} onPendientes={onPendientes} />;
  if(remisionId)return <RegistroDesdeRemision key={remisionId} id={remisionId} onPendientes={onPendientes} onVolver={()=>onCancelarRemision?.()} onGuardado={id=>{onRemisionRegistrada?.();guardado(id);}}/>;
  const paginas = Math.max(1, Math.ceil(listado.total / 25));
  return <div className="estudiantes-modulo">
    {(error || errorLista) && <p role="alert" className="estudiantes-error">{error || errorLista}</p>}
    {mensaje && <p role="status" className="estudiantes-exito">{mensaje}</p>}
    {abriendo && <p role="status">Abriendo ficha…</p>}
    {vista === "nuevo" || vista === "editar" ? <FormularioEstudiante key={vista === "editar" ? `editar-${ficha?.estudiante.id}-${ficha?.estudiante.version}` : "nuevo"} ficha={vista === "editar" ? ficha ?? undefined : undefined} onPendientes={onPendientes} onCancelar={() => setVista(ficha && vista === "editar" ? "ficha" : "lista")} onGuardado={guardado} />
    : vista === "ficha" && ficha ? <FichaEstudiante onPendientes={onPendientes} onAbrirRemision={onAbrirRemision} perfil={perfil} ficha={ficha} ocupado={abriendo} puedeEliminar={["superadministrador", "desarrollador"].includes(perfil.rol)} onEliminarEstudiante={() => void borrarRegistro("estudiante", ficha.estudiante.id)} onEliminarMatricula={id => void borrarRegistro("matricula", id)} onEditar={() => { setMensaje(""); setVista("editar"); }} onVolver={() => { setVista("lista"); setMensaje(""); }} onActualizar={() => void abrirFicha(ficha.estudiante.id)} />
    : <>
      <section className="page-heading"><div><p className="eyebrow">REGISTRO ESCOLAR</p><h1>Estudiantes</h1><p>Consulta las fichas y las matrículas del colegio.</p></div><div className="estudiantes-acciones"><button type="button" className="primary-button" disabled={abriendo} onClick={() => { setError(""); setMensaje(""); setVista("nuevo"); }}>Agregar estudiante</button><button type="button" className="acceso-secundario" disabled={cargando || abriendo} onClick={() => setRefrescar(valor => valor + 1)}>Actualizar</button></div></section>
      <section className="panel estudiantes-panel">
        <div className="estudiantes-filtros">
          <label>Buscar por nombre o documento<input type="search" maxLength={180} placeholder="Nombre o documento…" value={filtros.busqueda} onChange={e => setFiltros({ ...filtros, busqueda: e.target.value, pagina: 1 })} /></label>
          <label>Año lectivo<input type="number" min={2000} max={2100} placeholder="Todos" value={filtros.anio} onChange={e => setFiltros({ ...filtros, anio: e.target.value, pagina: 1 })} /></label>
          <label>Grado<select value={filtros.grado} onChange={e => setFiltros({ ...filtros, grado: e.target.value, pagina: 1 })}><option value="">Todos</option>{GRADOS.map(grado => <option key={grado.valor} value={grado.valor}>{grado.nombre}</option>)}</select></label>
          <label>Estado<select value={filtros.estado} onChange={e => setFiltros({ ...filtros, estado: e.target.value, pagina: 1 })}><option value="">Todos</option><option value="activo">Activo</option><option value="retirado">Retirado</option><option value="egresado">Egresado</option></select></label>
        </div>
        {cargando ? <p role="status">Consultando estudiantes…</p> : <>
          <p>{listado.total} estudiantes encontrados. Si filtras por año, se muestra la matrícula de ese año; sin filtro, se muestra la más reciente.</p>
          <div className="estudiantes-tabla-contenedor"><table className="estudiantes-tabla"><thead><tr><th scope="col">Estudiante</th><th scope="col">Documento</th><th scope="col">Matrícula</th><th scope="col">Estado</th><th scope="col">Acción</th></tr></thead><tbody>{listado.estudiantes.map(e => <tr key={e.id}><td><strong>{e.nombre}</strong>{e.eliminando && <span className="estudiantes-insignia">Eliminación pendiente</span>}{e.es_prueba && <span className="estudiantes-insignia">Prueba</span>}</td><td>{e.tipo_documento ? `${e.tipo_documento} · ${e.numero_documento}` : "Sin registrar"}</td><td>{e.anio_lectivo ? `${e.anio_lectivo} · ${nombreGrado(e.grado)}${e.seccion ? ` · ${e.seccion}` : ""}` : "Sin matrícula"}</td><td>{e.estado}</td><td><button type="button" className="acceso-secundario" disabled={abriendo} onClick={() => { setMensaje(""); void abrirFicha(e.id); }}>Ver ficha</button></td></tr>)}</tbody></table></div>
          {listado.estudiantes.length === 0 && <p>No hay estudiantes para estos filtros. Puedes limpiar los filtros o agregar un registro.</p>}
          <div className="estudiantes-paginacion"><button type="button" className="acceso-secundario" disabled={filtros.pagina <= 1 || abriendo} onClick={() => setFiltros({ ...filtros, pagina: filtros.pagina - 1 })}>Anterior</button><span>Página {filtros.pagina} de {paginas}</span><button type="button" className="acceso-secundario" disabled={filtros.pagina >= paginas || abriendo} onClick={() => setFiltros({ ...filtros, pagina: filtros.pagina + 1 })}>Siguiente</button></div>
        </>}
      </section>
    </>}
  </div>;
}
