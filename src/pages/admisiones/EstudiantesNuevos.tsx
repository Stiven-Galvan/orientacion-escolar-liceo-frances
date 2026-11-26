import { ClasificarAdmision } from "./clasificacion";
import { escalaAdmision, type Clasificacion } from "./escalaAdmision";
import "./clasificacion.css";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cargarEntrevistas, convertirEntrevista, guardarEntrevista, operarEntrevista, obtenerSoporte, eliminarEntrevista, rechazarEntrevista } from "../../lib/entrevistas";
import type { EntrevistaGuardada as Entrevista, SoporteGuardado } from "../../lib/entrevistas";
import type { Perfil, Rol } from "../../types/perfil";
import { mensajeError } from "../estudiantes/modelos";
import type { FormEvent } from "react";
import "./EstudiantesNuevos.css";
import BotonesDocumento from "./components/BotonesDocumento";
import FirmasEntrevista from "./components/FirmasEntrevista";
import type { Firmas } from "./components/FirmasEntrevista";
import VistaPreviaEntrevista from "./components/VistaPreviaEntrevista";
import { descargarEntrevista } from "./utils/descargarEntrevista";
const GRADOS = [
  "Pre-Kinder",
  "Kinder",
  "Transición",
  "1.º",
  "2.º",
  "3.º",
  "4.º",
  "5.º",
  "6.º",
  "7.º",
  "8.º",
  "9.º",
  "10.º",
  "11.º",
];
const CONDICIONES = [
  // TRASTORNOS DEL NEURODESARROLLO
  "Trastorno del espectro autista (TEA)",
  "Trastorno por déficit de atención e hiperactividad (TDAH)",
  "Discapacidad intelectual",
  "Trastornos de la comunicación y del lenguaje",
  "Trastorno del desarrollo de la coordinación",
  // TRASTORNOS DEL APRENDIZAJE
  "Dislexia",
  "Discalculia",
  "Trastorno específico del aprendizaje con dificultades mixtas",
  // DIFICULTADES EMOCIONALES
  "Depresión",
  "Ansiedad",
  // OTRAS DISCAPACIDADES
  "Discapacidad auditiva",
  "Discapacidad visual",
  "Discapacidad física",
  // OTRAS CONDICIONES
  "Otra condición",
];
const FUENTES = [
  "Reportado por acudiente",
  "Documento profesional presentado",
  "Fuentes mixtas; detalladas en observaciones",
];
const SECCIONES = [
  ["historiaEscolar", "Historia escolar del estudiante"],
  ["contextoFamiliar", "Contexto familiar"],
  ["apoyos", "Necesidades educativas y apoyos requeridos"],
  ["documentos", "Matriz de documentos presentados"],
  ["observacionesFormato", "Observaciones del psicólogo/a"],
  ["compromisos", "Compromisos"],
  ["recomendaciones", "Recomendaciones"],
] as const;
type Vista = "lista" | "entrevista" | "firmas" | "adicionales" | "dashboard";
type DatosEntrevista = Record<string, string>;
type CampoTexto = {
  clave: string;
  etiqueta: string;
  tipo: "text" | "tel" | "email";
  obligatorio?: boolean;
  completo?: boolean;
};
const CAMPOS_CONTACTO: CampoTexto[] = [
  {
    clave: "celular",
    etiqueta: "Celular de contacto",
    tipo: "tel",
  },
  {
    clave: "correo",
    etiqueta: "Correo de contacto",
    tipo: "email",
  },
  {
    clave: "acudientes",
    etiqueta: "Nombre de los acudientes",
    tipo: "text",
    obligatorio: true,
    completo: true,
  },
  {
    clave: "eps",
    etiqueta: "EPS",
    tipo: "text",
  },
  {
    clave: "ips",
    etiqueta: "IPS",
    tipo: "text",
  },
];
function fechaColombia() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Bogota",
  }).format(new Date());
}
function edadCalculada(nacimiento: string, referencia: string) {
  if (!nacimiento || !referencia) return "";
  const [anioNacimiento, mesNacimiento, diaNacimiento] = nacimiento
    .split("-")
    .map(Number);
  const [anioActual, mesActual, diaActual] = referencia.split("-").map(Number);
  let edad = anioActual - anioNacimiento;
  if (
    mesActual < mesNacimiento ||
    (mesActual === mesNacimiento && diaActual < diaNacimiento)
  ) {
    edad--;
  }
  return Number.isFinite(edad) && edad >= 0 ? `${edad} años` : "";
}
function datosIniciales(orientador: string): DatosEntrevista {
  const fecha = fechaColombia();
  return {
    nombre: "",
    nacimiento: "",
    tipoDocumento: "TI",
    documento: "",
    fecha,
    ingreso: String(Number(fecha.slice(0, 4)) + 1),
    grado: "",
    celular: "",
    correo: "",
    acudientes: "",
    eps: "",
    ips: "",
    orientador,
    grupo: "",
    esPrueba: "false",
    historiaEscolar: "",
    contextoFamiliar: "",
    apoyos: "",
    documentos: "",
    observacionesFormato: "",
    compromisos: "",
    recomendaciones: "",
  };
}
function datosParaDocumento(datos: DatosEntrevista): DatosEntrevista {
  return { ...datos, grado: `${datos.grado}${datos.grupo?.trim() ? ` · Grupo ${datos.grupo.trim()}` : ""}` };
}
function permiteArchivar(entrevista: Entrevista) {
  return (
    entrevista.estado === "Sin seguimiento" &&
    entrevista.condiciones.length === 0 &&
    !entrevista.notasPrivadas.trim() &&
    !entrevista.soporteProfesional
  );
}
type Props = { perfil: Perfil; rolVista: Rol; activa: boolean; onAbrirEstudiante: (id: string) => void; onPendientes: (valor: boolean) => void };
export default function EstudiantesNuevos({ perfil, rolVista, activa, onAbrirEstudiante, onPendientes }: Props) {
  const vistaDelegada = perfil.rol === "desarrollador" && (rolVista === "orientador" || rolVista === "superadministrador")
    ? rolVista : undefined;
  const rolAdmision = vistaDelegada ?? perfil.rol;
  const mostrarClasificacion = rolAdmision === "orientador" || rolAdmision === "superadministrador";
  const puedeDecidir = rolAdmision === "superadministrador";
  const [clasificacion, setClasificacion] = useState<Clasificacion | "">("");
  const [edicionClasificacion, setEdicionClasificacion] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("lista");
  const [datos, setDatos] = useState<DatosEntrevista>(() => datosIniciales(perfil.nombre));
  const [notas, setNotas] = useState("");
  const [condiciones, setCondiciones] = useState<string[]>([]);
  const [fuente, setFuente] = useState(FUENTES[0]);
  const [entrevistas, setEntrevistas] = useState<Entrevista[]>([]);
  const [borradorId, setBorradorId] = useState<string>(() => crypto.randomUUID());
  const [cargando, setCargando] = useState(true);
  const [admitidoReciente, setAdmitidoReciente] = useState<string | null>(null);
  const [firmas, setFirmas] = useState<Firmas | null>(null);
  const [soporteProfesional, setSoporteProfesional] = useState<File | null>(
    null,
  );
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [mostrarArchivo, setMostrarArchivo] = useState(false);
  const [gradoDashboard, setGradoDashboard] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [errorSoporte, setErrorSoporte] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const operacion = useRef(false);
  const formularioAbierto = vista === "entrevista" || vista === "firmas" || vista === "adicionales";
  useEffect(() => {
    onPendientes(activa && (formularioAbierto || ocupado));
    return () => onPendientes(false);
  }, [activa, formularioAbierto, ocupado, onPendientes]);
  useEffect(() => {
    if (!formularioAbierto && !ocupado) return;
    const avisar = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [formularioAbierto, ocupado]);
  const actualizar = useCallback(async () => {
    setCargando(true);
    try { setEntrevistas(await cargarEntrevistas(undefined, mostrarClasificacion, vistaDelegada, perfil.auth_user_id)); }
    catch (fallo) { setError(mensajeError(fallo)); }
    finally { setCargando(false); }
  }, [mostrarClasificacion, vistaDelegada, perfil.auth_user_id]);
  useEffect(() => {
    if (!activa) return;
    let vigente = true;
    // La carga inicial ya empieza en true. Los cambios de estado se realizan
    // al recibir la respuesta externa, sin llamar a actualizar al montar.
    async function cargarInicial() {
      try {
        const guardadas = await cargarEntrevistas(undefined, mostrarClasificacion, vistaDelegada, perfil.auth_user_id);
        if (vigente) setEntrevistas(guardadas);
      } catch (fallo) {
        if (vigente) setError(mensajeError(fallo));
      } finally {
        if (vigente) setCargando(false);
      }
    }
    void cargarInicial();
    return () => { vigente = false; };
  }, [activa, mostrarClasificacion, vistaDelegada, perfil.auth_user_id]);
  function reemplazar(item: Entrevista) { setEntrevistas(prev => [item, ...prev.filter(e => e.id !== item.id)]); }
  const entrevistaPrevia = entrevistas.find((item) => item.id === previewId) ?? null;
  const datosPrevia = useMemo(
    () => entrevistaPrevia ? datosParaDocumento(entrevistaPrevia.datos) : null,
    [entrevistaPrevia],
  );
  const requiereSoporte = condiciones.length > 0 && fuente !== FUENTES[0];
  function cambiar(campo: string, valor: string) {
    setDatos((prev) => ({ ...prev, [campo]: valor }));
    setFirmas(null);
    setError("");
  }
  function nuevaEntrevista() {
    setClasificacion("");
    setAdmitidoReciente(null);
    setBorradorId(crypto.randomUUID());
    setDatos(datosIniciales(perfil.nombre));
    setNotas("");
    setCondiciones([]);
    setFuente(FUENTES[0]);
    setFirmas(null);
    setSoporteProfesional(null);
    setDetalleId(null);
    setPreviewId(null);
    setMostrarArchivo(false);
    setMensaje("");
    setError("");
    setErrorSoporte("");
    setVista("entrevista");
  }
  function volverLista() {
    setVista("lista");
    setDetalleId(null);
    setPreviewId(null);
    setMensaje("");
    setError("");
    setErrorSoporte("");
  }
  function cancelarEntrevista() {
    const confirmar = window.confirm(
      "¿Salir sin registrar esta entrevista? Se descartarán sus datos, firmas y soporte.",
    );
    if (!confirmar) return;
    setFirmas(null);
    setSoporteProfesional(null);
    volverLista();
  }
  function terminarFormato(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      datos.nombre.trim().length < 2 ||
      !datos.documento.trim() ||
      !datos.acudientes.trim() ||
      !datos.orientador.trim()
    ) {
      setError(
        "Completa el nombre, el documento, los acudientes y el orientador. No pueden contener solo espacios.",
      );
      return;
    }
    if (datos.correo.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo.trim())) {
      setError("Revisa el correo de contacto antes de pasar a firmas.");
      return;
    }
    setDatos((prev) => ({
      ...prev,
      nombre: prev.nombre.trim(),
      documento: prev.documento.trim(),
      acudientes: prev.acudientes.trim(),
      orientador: prev.orientador.trim(),
    }));
    setError("");
    setFirmas(null);
    setVista("firmas");
  }
  function seleccionarSoporte(archivo: File | undefined) {
    setErrorSoporte("");
    if (!archivo) return;
    const extension = archivo.name.split(".").pop()?.toLowerCase();
    const extensionValida =
      extension !== undefined &&
      ["pdf", "jpg", "jpeg", "png"].includes(extension);
    const tipoValido =
      !archivo.type ||
      ["application/pdf", "image/jpeg", "image/png"].includes(archivo.type);
    if (!extensionValida || !tipoValido) {
      setSoporteProfesional(null);
      setErrorSoporte("Selecciona un PDF o una imagen JPG o PNG.");
      return;
    }
    if (archivo.size === 0) {
      setSoporteProfesional(null);
      setErrorSoporte("El archivo está vacío.");
      return;
    }
    if (archivo.size > 20 * 1024 * 1024) {
      setSoporteProfesional(null);
      setErrorSoporte("El soporte debe pesar como máximo 20 MB.");
      return;
    }
    setSoporteProfesional(archivo);
    setError("");
  }
  function cambiarCondicion(condicion: string, seleccionada: boolean) {
    const nuevas = seleccionada
      ? [...condiciones, condicion]
      : condiciones.filter((item) => item !== condicion);
    setCondiciones(nuevas);
    setError("");
    if (nuevas.length === 0) {
      setFuente(FUENTES[0]);
      setSoporteProfesional(null);
      setErrorSoporte("");
    }
  }
  async function guardar(sinAdicionales: boolean) {
    if (operacion.current) return;
    if (mostrarClasificacion && !clasificacion) {
      setError("Selecciona la clasificación interna antes de terminar.");
      return;
    }
    if (!firmas) {
      setError("Completa las firmas antes de registrar la entrevista.");
      setVista("firmas");
      return;
    }
    if (!sinAdicionales && !notas.trim()) {
      setError(
        "Escribe las observaciones adicionales o selecciona “No se agregan cosas adicionales”.",
      );
      return;
    }
    if (!sinAdicionales && requiereSoporte && !soporteProfesional) {
      setError(
        "Adjunta el soporte profesional. Si aún no tienes documentación, registra la fuente como “Reportado por acudiente”.",
      );
      return;
    }
    if (
      sinAdicionales &&
      (notas.trim() || condiciones.length > 0 || soporteProfesional)
    ) {
      const confirmar = window.confirm(
        "Esta opción descartará las notas adicionales, condiciones y soporte seleccionados. La entrevista se finalizará con la información del formato y las firmas. ¿Continuar?",
      );
      if (!confirmar) return;
    }
    operacion.current = true; setOcupado(true); setError(""); setMensaje("");
    try {
      const item = await guardarEntrevista(borradorId, datos, firmas, sinAdicionales ? "" : notas.trim(), sinAdicionales ? [] : condiciones, !sinAdicionales && condiciones.length ? fuente : "", sinAdicionales, !sinAdicionales && requiereSoporte ? soporteProfesional : null, clasificacion || undefined, vistaDelegada);
      reemplazar(item); setDetalleId(null); setPreviewId(null); setFirmas(null); setSoporteProfesional(null); setMostrarArchivo(false); setVista("lista"); setErrorSoporte("");
      setMensaje("Entrevista guardada. Puedes consultar el informe desde el listado.");
    } catch (fallo) { setError(mensajeError(fallo)); }
    finally { operacion.current = false; setOcupado(false); }
  }
  async function actualizarClasificacion(item: Entrevista) {
    if (!clasificacion || operacion.current) return;
    operacion.current = true;
    setOcupado(true);
    setError("");
    try {
      const fila = await operarEntrevista("clasificar", item.id, { clasificacion, version: item.version }, vistaDelegada);
      const actualizada = convertirEntrevista(fila);
      setEntrevistas(prev => prev.map(entrevista => entrevista.id === item.id ? actualizada : entrevista));
      setEdicionClasificacion(null);
      setMensaje("Clasificación interna guardada.");
    } catch (fallo) {
      setError(mensajeError(fallo));
      await actualizar();
    } finally {
      operacion.current = false;
      setOcupado(false);
    }
  }
  async function decidir(id: string, estado: "Admitido" | "No admitido") {
    if (!puedeDecidir || operacion.current) return;
    const item = entrevistas.find(e => e.id === id);
    if (!item || item.eliminando || item.archivado || item.estado !== "Pendiente") return;
    if (!window.confirm(estado === "No admitido" ? `¿No admitir a ${item.datos.nombre}? Se eliminarán su entrevista, firmas, clasificación y soporte. Esta acción no crea ni elimina una ficha de estudiante ya existente.` : `¿Admitir a ${item.datos.nombre}? Su expediente pasará a Estudiantes y saldrá de este listado.`)) return;
    operacion.current = true; setOcupado(true); setError(""); setMensaje("");
    try {
      if (estado === "No admitido") {
        await rechazarEntrevista(item, vistaDelegada); setEntrevistas(prev => prev.filter(e => e.id !== item.id)); setDetalleId(null); setPreviewId(null); setMensaje("Aspirante no admitido: su entrevista, firmas y soportes se eliminaron."); return;
      }
      let fila = await operarEntrevista("decidir", id, { estado, version: item.version, confirmar_existente: false }, vistaDelegada);
      if (fila.requiere_confirmacion) {
        if (!window.confirm(`Ya existe ${fila.nombre_existente} con ese documento. ¿Vincular la entrevista conservando la ficha y la matrícula existentes?`)) return;
        fila = await operarEntrevista("decidir", id, { estado, version: item.version, confirmar_existente: true }, vistaDelegada);
      }
      setEntrevistas(prev => prev.filter(e => e.id !== item.id)); setDetalleId(null); setPreviewId(null);
      setAdmitidoReciente(String(fila.estudiante_id));
      setMensaje("Admitido: el expediente completo está en Estudiantes y ya no aparece en Estudiantes nuevos.");
    } catch (fallo) { setError(mensajeError(fallo)); await actualizar(); }
    finally { operacion.current = false; setOcupado(false); }
  }
  async function completarRechazo(item: Entrevista) {
    if (!puedeDecidir || operacion.current) return;
    operacion.current = true; setOcupado(true); setError(""); setMensaje("");
    try { await rechazarEntrevista(item, vistaDelegada); setEntrevistas(prev => prev.filter(e => e.id !== item.id)); setMensaje("Rechazo completado: entrevista, firmas y soportes eliminados."); }
    catch (fallo) { await actualizar(); setError(mensajeError(fallo)); }
    finally { operacion.current = false; setOcupado(false); }
  }
  async function cambiarArchivo(id: string, archivado: boolean) {
    if (operacion.current) return;
    const item = entrevistas.find(e => e.id === id); if (!item || item.eliminando) return;
    if (archivado && !permiteArchivar(item)) { setError("Solo se archivan entrevistas sin seguimiento, notas, condiciones ni soporte."); return; }
    operacion.current = true; setOcupado(true); setError(""); setMensaje("");
    try { reemplazar(convertirEntrevista(await operarEntrevista("archivar", id, { archivado, version: item.version }))); setMensaje(archivado ? "Entrevista archivada." : "Entrevista restaurada."); }
    catch (fallo) { setError(mensajeError(fallo)); await actualizar(); }
    finally { operacion.current = false; setOcupado(false); }
  }
  function archivarEntrevista(id: string) { void cambiarArchivo(id, true); }
  function restaurarEntrevista(id: string) { void cambiarArchivo(id, false); }
  async function borrar(item: Entrevista) {
    if (!["superadministrador", "desarrollador"].includes(rolAdmision) || operacion.current) return;
    const confirmacion = window.prompt(`Se eliminarán esta entrevista, sus firmas y el soporte. La ficha del estudiante y el historial de la acción se conservan. Escribe ELIMINAR para confirmar la baja de ${item.datos.nombre}`);
    if (confirmacion === null) return;
    if (confirmacion.trim().toUpperCase() !== "ELIMINAR") { setError("Debes escribir ELIMINAR para confirmar."); return; }
    operacion.current = true; setOcupado(true); setError(""); setMensaje("");
    try { await eliminarEntrevista(item, item.datos.nombre); setEntrevistas(prev => prev.filter(e => e.id !== item.id)); setDetalleId(null); setPreviewId(null); setMensaje("Entrevista y archivos eliminados. El historial de la acción se conserva."); }
    catch (fallo) { setError(mensajeError(fallo)); await actualizar(); }
    finally { operacion.current = false; setOcupado(false); }
  }
  async function continuarBorrador(item: Entrevista) {
    setClasificacion("");
    if ((item.creadoPor !== perfil.auth_user_id && perfil.rol !== "desarrollador") || item.eliminando || operacion.current) return;
    operacion.current = true; setOcupado(true); setError(""); setMensaje("");
    try {
      let archivo: File | null = null;
      if (item.soporteProfesional) {
        try { const blob = await obtenerSoporte(item.soporteProfesional); archivo = new File([blob], item.soporteProfesional.name, { type: item.soporteProfesional.type }); }
        catch { setMensaje("El borrador se recuperó. Selecciona nuevamente el soporte antes de finalizar."); }
      }
      setBorradorId(item.id); setDatos(item.datos); setNotas(item.notasPrivadas); setCondiciones(item.condiciones); setFuente(item.fuente || FUENTES[0]); setFirmas(item.firmas); setSoporteProfesional(archivo); setVista("adicionales");
    } finally { operacion.current = false; setOcupado(false); }
  }
  async function descargarPDF(entrevista: Entrevista) {
    try {
      setError("");
      // El PDF no recibe las notas privadas ni el soporte profesional.
      await descargarEntrevista(datosParaDocumento(entrevista.datos), entrevista.firmas);
    } catch {
      setError(
        "No fue posible generar el PDF. Revisa el archivo del escudo y la configuración del generador.",
      );
    }
  }
  async function descargarSoporte(archivo: SoporteGuardado) {
    let blob: Blob;
    try { blob = await obtenerSoporte(archivo); } catch (fallo) { setError(mensajeError(fallo)); return; }
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = archivo.name;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function abrirVistaPrevia(id: string) {
    setPreviewId(actual => actual === id ? null : id);
    setDetalleId(null);
    setMensaje("");
    setError("");
  }
  function abrirObservaciones(id: string) {
    setEdicionClasificacion(null);
    setDetalleId(actual => actual === id ? null : id);
    setPreviewId(null);
    setMensaje("");
    setError("");
  }
  function controlClasificacion(item: Entrevista) {
    const editando = edicionClasificacion === item.id;
    return <div className="en-class-control">
      {editando ? <>
        <ClasificarAdmision valor={clasificacion} onChange={setClasificacion} />
        <div className="en-actions">
          <button type="button" className="primary-button" disabled={!clasificacion}
            onClick={() => void actualizarClasificacion(item)}>Guardar clasificación</button>
          <button type="button" className="en-secondary" onClick={() => setEdicionClasificacion(null)}>Cancelar</button>
        </div>
      </> : <button type="button" className="en-secondary" onClick={() => {
        setClasificacion(item.clasificacion ?? "");
        setEdicionClasificacion(item.id);
        setError("");
        setMensaje("");
      }}>{item.clasificacion ? "Cambiar clasificación" : "Clasificar por color"}</button>}
    </div>;
  }

  function observacionesDe(item: Entrevista) {
    return <section id={`observaciones-${item.id}`} className="en-observaciones-inline"
      aria-label={`Observaciones de ${item.datos.nombre}`}>
      <h3>Observaciones adicionales privadas</h3>
      <p className="en-private-note">
        {item.notasPrivadas || "Sin observaciones adicionales."}
      </p>
      <div className="en-section">
        <p className="en-muted">
          <strong>Condiciones registradas:</strong>{" "}
          {item.condiciones.join(" · ") ||
            "Sin condición especificada"}
        </p>
        <p className="en-muted">
          <strong>Fuente:</strong> {item.fuente || "No registrada"}
        </p>
      </div>
      {item.soporteProfesional && (
        <div className="en-support-box">
          <p className="en-muted">
            <strong>Soporte profesional:</strong>{" "}
            {item.soporteProfesional.name}
          </p>
          <button
            type="button"
            className="en-secondary"
            onClick={() => {
              const archivo = item.soporteProfesional;
              if (archivo) void descargarSoporte(archivo);
            }}
          >
            Descargar soporte
          </button>
        </div>
      )}
    </section>;
  }

  function vistaPreviaAbierta() {
    if (!entrevistaPrevia || !datosPrevia) return null;
    return (
        <section id={`vista-previa-${entrevistaPrevia.id}`} className="en-preview-inline" aria-label={`Vista previa de ${entrevistaPrevia.datos.nombre}`}>
          <div className="panel-heading">
            <div>
              <h2>Vista previa de la entrevista</h2>
              <p>{entrevistaPrevia.datos.nombre}</p>
            </div>
            <div className="en-actions">
              <button
                type="button"
                className="en-secondary"
                onClick={() => {
                  void descargarPDF(entrevistaPrevia);
                }}
              >
                Descargar PDF ↓
              </button>
              <button
                type="button"
                className="en-secondary"
                onClick={() => setPreviewId(null)}
              >
                Cerrar vista previa
              </button>
            </div>
          </div>
          <VistaPreviaEntrevista
            datos={datosPrevia}
            firmas={entrevistaPrevia.firmas}
          />
          {mostrarClasificacion && entrevistaPrevia.clasificacion && <section className="en-section">
            <h3>Anexo interno de clasificación</h3>
            <p className={`en-class-label en-class-${entrevistaPrevia.clasificacion}`}>
              {escalaAdmision[entrevistaPrevia.clasificacion][0]}
            </p>
            <p>{escalaAdmision[entrevistaPrevia.clasificacion][1]}</p>
          </section>}
        </section>
    );
  }

  const conSeguimiento = entrevistas.filter(
    (item) => !item.archivado && item.estado === "Pendiente" && !item.eliminando,
  );
  const sinSeguimiento = entrevistas.filter(
    (item) => !item.archivado && item.estado === "Sin seguimiento" && !item.eliminando,
  );
  const archivadas = entrevistas.filter((item) => item.archivado && !item.eliminando);
  const filtradas = entrevistas.filter(
    (item) => item.estado !== "Borrador" && item.estado !== "No admitido" && !item.eliminando && (!gradoDashboard || item.datos.grado === gradoDashboard),
  );
  const barras = CONDICIONES.map((nombre) => ({
    nombre,
    cantidad: filtradas.filter((item) => item.condiciones.includes(nombre))
      .length,
  }));
  const maximo = Math.max(1, ...barras.map((item) => item.cantidad));
  return (
    <section className="new-students">
      <fieldset disabled={ocupado} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      {ocupado && <p className="en-message" role="status">Guardando admisión y matrícula en Supabase…</p>}
      <div className="page-heading">
        <div>
          <p className="eyebrow">ORIENTACIÓN ESCOLAR</p>
          <h1>Estudiantes nuevos</h1>
          <p>Entrevistas de aspirantes y seguimiento de admisión.</p>
        </div>
        {(vista === "lista" || vista === "dashboard") && (
          <div className="en-actions">
            {vista === "lista" ? (
              <>
                <button
                  type="button"
                  className="en-secondary"
                  onClick={() => {
                    setDetalleId(null);
                    setPreviewId(null);
                    setMensaje("");
                    setError("");
                    setVista("dashboard");
                  }}
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  className="en-secondary"
                  aria-expanded={mostrarArchivo}
                  onClick={() => {
                    setMostrarArchivo((prev) => !prev);
                    setDetalleId(null);
                    setPreviewId(null);
                  }}
                >
                  {mostrarArchivo
                    ? "Cerrar archivo reservado"
                    : "Archivo reservado"}
                  {" · "}
                  {archivadas.length}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="en-secondary"
                onClick={volverLista}
              >
                Volver a entrevistas
              </button>
            )}
            <button type="button" className="en-secondary" onClick={() => void actualizar()}>Actualizar entrevistas</button>
            <button
              type="button"
              className="primary-button"
              onClick={nuevaEntrevista}
            >
              + Nueva entrevista
            </button>
          </div>
        )}
      </div>
      <p className="en-warning">
        Las entrevistas finalizadas, firmas, observaciones y soportes se guardan de forma permanente.
        Los soportes son privados. Cada orientador consulta sus entrevistas; superadministradores y desarrollador pueden supervisarlas.
        La firma capturada es un trazo con aceptación: no verifica por sí sola la identidad del firmante.
      </p>
      {vistaDelegada && <p className="en-warning">
        Estás actuando como {vistaDelegada === "orientador" ? "orientador" : "superadministrador"} desde tu cuenta de desarrollador. Los cambios se guardan y quedan registrados a tu nombre.
      </p>}
      {mensaje && (
        <p className="en-message" role="status">
          {mensaje}
        </p>
      )}
      {error && (
        <p className="en-warning" role="alert">
          {error}
        </p>
      )}
      {admitidoReciente && vista === "lista" && <button type="button" className="primary-button" onClick={() => onAbrirEstudiante(admitidoReciente)}>Ver expediente en Estudiantes</button>}
      {cargando && <p role="status">Consultando entrevistas guardadas…</p>}
      {vista === "lista" && entrevistas.some(item => item.estado === "Borrador" || item.eliminando || item.estado === "No admitido") && <section className="panel en-section"><h2>Guardados o eliminaciones pendientes</h2>{entrevistas.filter(item => item.estado === "Borrador" || item.eliminando || item.estado === "No admitido").map(item => <div className="en-archive-row" key={item.id}><div><strong>{item.datos.nombre}</strong><small>{item.borradoMotivo === "rechazo" || item.estado === "No admitido" ? "Rechazo pendiente de terminar" : item.eliminando ? "Eliminación pendiente" : "Borrador guardado sin finalizar"}</small></div><div>{puedeDecidir && (item.borradoMotivo === "rechazo" || item.estado === "No admitido") && <button type="button" className="en-secondary en-danger" onClick={() => void completarRechazo(item)}>Completar rechazo</button>}{!item.eliminando && item.estado === "Borrador" && (item.creadoPor === perfil.auth_user_id || perfil.rol === "desarrollador") && <button type="button" className="en-secondary" onClick={() => void continuarBorrador(item)}>Continuar borrador</button>}{["superadministrador", "desarrollador"].includes(rolAdmision) && <button type="button" className="en-secondary en-danger" onClick={() => void borrar(item)}>{item.eliminando ? "Reintentar eliminación" : "Eliminar borrador"}</button>}</div></div>)}</section>}
      {vista === "lista" && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Aspirantes pendientes de decisión</h2>
                <p>{conSeguimiento.length} entrevistas registradas</p>
              </div>
            </div>
            {conSeguimiento.length === 0 ? (
              <div className="en-empty">
                Aún no hay entrevistas pendientes de decisión. Empieza
                con «Nueva entrevista».
              </div>
            ) : (
              <div className="en-table-wrap">
                <table className="en-table">
                  <thead>
                    <tr>
                      <th scope="col">Nombre del estudiante</th>
                      <th scope="col">Observaciones</th>
                      <th scope="col">Condiciones registradas</th>
                      {mostrarClasificacion && <th scope="col">Clasificación interna</th>}
                      {puedeDecidir && <th scope="col">Decisión</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {conSeguimiento.map((item) => (
                      <Fragment key={item.id}>
                      <tr>
                        <td>
                          <strong className={mostrarClasificacion && item.clasificacion
                            ? `en-class-label en-class-name en-class-${item.clasificacion}` : undefined}>
                            {item.datos.nombre}
                          </strong>
                          <small>
                            Grado {item.datos.grado} · {item.datos.ingreso}
                          </small>
                          <small>{item.datos.fecha}</small>
                          {["superadministrador", "desarrollador"].includes(rolAdmision) && <button type="button" className="en-secondary en-danger" onClick={() => void borrar(item)}>Eliminar entrevista</button>}
                          <BotonesDocumento
                            onVistaPrevia={() => abrirVistaPrevia(item.id)}
                            vistaPreviaId={`vista-previa-${item.id}`}
                            vistaPreviaAbierta={previewId === item.id}
                            onDescargar={() => {
                              void descargarPDF(item);
                            }}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="en-secondary"
                            aria-expanded={detalleId === item.id}
                            aria-controls={detalleId === item.id ? `observaciones-${item.id}` : undefined}
                            onClick={() => abrirObservaciones(item.id)}
                          >
                            {detalleId === item.id ? "Ocultar observaciones" : "Ver observaciones"}
                          </button>
                          {item.soporteProfesional && (
                            <small>Con soporte profesional adjunto</small>
                          )}
                        </td>
                        <td>
                          {item.condiciones.length > 0
                            ? item.condiciones.join(" · ")
                            : "Sin condición especificada"}
                        </td>
                        {mostrarClasificacion && <td className="en-class-cell">
                          <span className={item.clasificacion ? `en-class-label en-class-${item.clasificacion}` : undefined}>
                            {item.clasificacion ? escalaAdmision[item.clasificacion][0] : "Pendiente de clasificación"}
                          </span>
                          {controlClasificacion(item)}
                        </td>}
                        {puedeDecidir && <td>
                          <div className="en-actions">
                            <button type="button" className="en-secondary" onClick={() => void decidir(item.id, "Admitido")}>Admitir</button>
                            <button type="button" className="en-secondary en-danger" onClick={() => void decidir(item.id, "No admitido")}>No admitir</button>
                          </div>
                        </td>}
                      </tr>
                      {(detalleId === item.id || previewId === item.id) && <tr className="en-observaciones-row">
                        <td colSpan={3 + Number(mostrarClasificacion) + Number(puedeDecidir)}>
                          {detalleId === item.id ? observacionesDe(item) : vistaPreviaAbierta()}
                        </td>
                      </tr>}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {mostrarArchivo && (
            <section className="panel en-section">
              <div className="panel-heading">
                <div>
                  <h2>Archivo reservado</h2>
                  <p>
                    Entrevistas guardadas fuera del listado habitual, disponibles para las cuentas autorizadas de este apartado.
                  </p>
                </div>
              </div>
              {archivadas.length === 0 ? (
                <p className="en-muted">No hay entrevistas archivadas.</p>
              ) : (
                archivadas.map((item) => (
                  <Fragment key={item.id}>
                  <div className="en-archive-row">
                    <div>
                      <strong>{item.datos.nombre}</strong>
                      <small>
                        Grado {item.datos.grado} · {item.datos.fecha}
                      </small>
                    </div>
                    <div>
                      {["superadministrador", "desarrollador"].includes(rolAdmision) && <button type="button" className="en-secondary en-danger" onClick={() => void borrar(item)}>Eliminar entrevista</button>}
                      <BotonesDocumento
                        onVistaPrevia={() => abrirVistaPrevia(item.id)}
                            vistaPreviaId={`vista-previa-${item.id}`}
                            vistaPreviaAbierta={previewId === item.id}
                        onDescargar={() => {
                          void descargarPDF(item);
                        }}
                      />
                      <button
                        type="button"
                        className="en-archive-button"
                        onClick={() => restaurarEntrevista(item.id)}
                      >
                        Restaurar al listado
                      </button>
                    </div>
                  </div>
                  {previewId === item.id && vistaPreviaAbierta()}
                  </Fragment>
                ))
              )}
            </section>
          )}
          <section className="panel en-section">
            <div className="panel-heading">
              <div>
                <h2>Entrevistas finalizadas sin seguimiento</h2>
                <p>
                  Sin observaciones adicionales ni condiciones registradas.
                  Puedes enviarlas al archivo reservado.
                </p>
              </div>
            </div>
            {sinSeguimiento.length === 0 ? (
              <p className="en-muted">Todavía no hay registros.</p>
            ) : (
              sinSeguimiento.map((item) => (
                <Fragment key={item.id}>
                <div className="en-archive-row">
                  <div>
                    <strong>{item.datos.nombre}</strong>
                    <small>
                      Grado {item.datos.grado} · {item.datos.fecha}
                    </small>
                  </div>
                  <div>
                    {["superadministrador", "desarrollador"].includes(rolAdmision) && <button type="button" className="en-secondary en-danger" onClick={() => void borrar(item)}>Eliminar entrevista</button>}
                    {mostrarClasificacion && controlClasificacion(item)}
                    <BotonesDocumento
                      onVistaPrevia={() => abrirVistaPrevia(item.id)}
                            vistaPreviaId={`vista-previa-${item.id}`}
                            vistaPreviaAbierta={previewId === item.id}
                      onDescargar={() => {
                        void descargarPDF(item);
                      }}
                    />
                    <button
                      type="button"
                      className="en-archive-button"
                      onClick={() => archivarEntrevista(item.id)}
                    >
                      Enviar al archivo reservado
                    </button>
                  </div>
                </div>
                {previewId === item.id && vistaPreviaAbierta()}
                </Fragment>
              ))
            )}
          </section>
        </>
      )}
      {vista === "entrevista" && (
        <form className="panel" onSubmit={terminarFormato}>
          <div className="panel-heading">
            <div>
              <h2>Nueva entrevista</h2>
              <p>Proceso de admisión escolar</p>
            </div>
          </div>
          <p className="en-muted en-section">
            Este registro recoge observaciones y antecedentes reportados. No
            constituye un diagnóstico clínico. Los campos con * son
            obligatorios.
          </p>
          <div className="en-form-grid">
            <label>
              Nombre completo del estudiante *
              <input
                required
                minLength={2}
                maxLength={180}
                value={datos.nombre}
                onChange={(event) => cambiar("nombre", event.target.value)}
              />
            </label>
            <label>
              Fecha de nacimiento *
              <input
                required
                type="date"
                min="1900-01-01"
                max={datos.fecha}
                value={datos.nacimiento}
                onChange={(event) => cambiar("nacimiento", event.target.value)}
              />
            </label>
            <label>
              Edad calculada
              <input
                readOnly
                value={edadCalculada(datos.nacimiento, datos.fecha)}
              />
            </label>
            <label>
              Fecha de entrevista
              <input type="date" readOnly value={datos.fecha} />
            </label>
            <label>
              Tipo de documento *
              <select
                value={datos.tipoDocumento}
                onChange={(event) =>
                  cambiar("tipoDocumento", event.target.value)
                }
              >
                {["RC", "TI", "CC", "CE", "PPT", "Pasaporte", "Otro"].map(
                  (tipo) => (
                    <option key={tipo} value={tipo}>
                      {tipo}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              Número de documento *
              <input
                required
                minLength={3}
                maxLength={30}
                pattern="[A-Za-z0-9-]{3,30}"
                title="Entre 3 y 30 letras, números o guiones, sin espacios"
                value={datos.documento}
                onChange={(event) => cambiar("documento", event.target.value)}
              />
            </label>
            <label>
              Grado al que aspira *
              <select
                required
                value={datos.grado}
                onChange={(event) => cambiar("grado", event.target.value)}
              >
                <option value="">Selecciona un grado</option>
                {GRADOS.map((grado) => (
                  <option key={grado} value={grado}>
                    {grado}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Año de ingreso *
              <input
                required
                type="number"
                min="2020"
                max="2100"
                step="1"
                value={datos.ingreso}
                onChange={(event) => cambiar("ingreso", event.target.value)}
              />
            </label>
            <label>Grupo de ingreso (opcional)
              <input maxLength={30} value={datos.grupo} onChange={event => cambiar("grupo", event.target.value.toUpperCase())} placeholder="Ejemplo: A o B" />
            </label>
            <label className="en-full" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="checkbox" style={{ width: 18, height: 18 }} checked={datos.esPrueba === "true"} onChange={event => cambiar("esPrueba", String(event.target.checked))} />
              Registro ficticio para pruebas
            </label>
            {CAMPOS_CONTACTO.map((campo) => (
              <label
                key={campo.clave}
                className={campo.completo ? "en-full" : undefined}
              >
                {campo.etiqueta}
                {campo.obligatorio ? " *" : ""}
                <input
                  type={campo.tipo}
                  maxLength={campo.clave === "acudientes" ? 180 : campo.clave === "correo" ? 254 : campo.clave === "celular" ? 40 : 180}
                  required={campo.obligatorio}
                  value={datos[campo.clave]}
                  onChange={(event) => cambiar(campo.clave, event.target.value)}
                />
              </label>
            ))}
            <label className="en-full">
              Orientador responsable *
              <input
                required
                value={datos.orientador}
                onChange={(event) => cambiar("orientador", event.target.value)}
              />
            </label>
            {SECCIONES.map(([campo, titulo]) => (
              <label className="en-full" key={campo}>
                {titulo}
                <textarea
                  rows={4}
                  value={datos[campo]}
                  onChange={(event) => cambiar(campo, event.target.value)}
                />
              </label>
            ))}
          </div>
          <div className="en-actions en-section">
            <button type="submit" className="primary-button">
              Terminar entrevista y pasar a firmas →
            </button>
            <button
              type="button"
              className="en-secondary"
              onClick={cancelarEntrevista}
            >
              Volver sin registrar
            </button>
          </div>
        </form>
      )}
      {vista === "firmas" && (
        <>
          <VistaPreviaEntrevista datos={datosParaDocumento(datos)} />
          <FirmasEntrevista
            onContinuar={(firmasCapturadas) => {
              setFirmas(firmasCapturadas);
              setError("");
              setVista("adicionales");
            }}
            onVolver={() => {
              setFirmas(null);
              setError("");
              setVista("entrevista");
            }}
          />
        </>
      )}
      {vista === "adicionales" && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Observaciones adicionales privadas</h2>
              <p>
                {datos.nombre} · Grado {datos.grado}
              </p>
            </div>
          </div>
          <p className="en-muted en-section">
            Las firmas ya fueron capturadas. Las notas adicionales, condiciones
            y soporte profesional quedan fuera de la vista previa y del PDF de
            la entrevista.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void guardar(false);
            }}
          >
            <label className="en-field">
              Observaciones adicionales *
              <textarea
                required
                rows={8}
                value={notas}
                onChange={(event) => {
                  setNotas(event.target.value);
                  setError("");
                }}
                placeholder="Escribe los aspectos privados que requieren seguimiento..."
              />
            </label>
            <fieldset className="en-conditions">
              <legend>Condiciones o antecedentes registrados</legend>
              <p className="en-muted">
                Registra antecedentes reportados o documentados. Esta selección
                no establece un diagnóstico nuevo.
              </p>
              <div className="en-checkbox-grid">
                {CONDICIONES.map((condicion) => (
                  <label key={condicion}>
                    <input
                      type="checkbox"
                      checked={condiciones.includes(condicion)}
                      onChange={(event) =>
                        cambiarCondicion(condicion, event.target.checked)
                      }
                    />
                    {condicion}
                  </label>
                ))}
              </div>
            </fieldset>
            {condiciones.length > 0 && (
              <div className="en-section">
                <label className="en-field">
                  Fuente de los antecedentes
                  <select
                    value={fuente}
                    onChange={(event) => {
                      setFuente(event.target.value);
                      setSoporteProfesional(null);
                      setErrorSoporte("");
                      setError("");
                    }}
                  >
                    {FUENTES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                {requiereSoporte && (
                  <div className="en-support-box">
                    <label className="en-field">
                      Soporte profesional obligatorio *
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(event) => {
                          seleccionarSoporte(event.target.files?.[0]);
                          event.target.value = "";
                        }}
                      />
                    </label>
                    <p className="en-muted">
                      PDF, JPG o PNG. Máximo 20 MB. El archivo se subirá al almacenamiento privado al finalizar la entrevista.
                    </p>
                    {soporteProfesional && (
                      <div>
                        <p className="en-message">
                          Seleccionado: {soporteProfesional.name}
                          {" · "}
                          {(soporteProfesional.size / 1024 / 1024).toFixed(2)}
                          {" MB"}
                        </p>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            setSoporteProfesional(null);
                            setErrorSoporte("");
                          }}
                        >
                          Quitar soporte
                        </button>
                      </div>
                    )}
                    {errorSoporte && (
                      <p className="en-warning" role="alert">
                        {errorSoporte}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            {mostrarClasificacion && <ClasificarAdmision valor={clasificacion} onChange={setClasificacion} />}
            <div className="en-actions en-section">
              <button type="submit" className="primary-button">
                Terminar
              </button>
              <button
                type="button"
                className="en-secondary"
                onClick={() => { void guardar(true); }}
              >
                No se agregan cosas adicionales
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  const confirmar = window.confirm(
                    "Si vuelves al formato tendrás que capturar las firmas nuevamente. ¿Continuar?",
                  );
                  if (!confirmar) return;
                  setFirmas(null);
                  setError("");
                  setVista("entrevista");
                }}
              >
                Volver al formato
              </button>
            </div>
          </form>
        </section>
      )}
      {vista === "dashboard" && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Aspirantes por grado y condición</h2>
              <p>
                Incluye las entrevistas guardadas a las que tu cuenta tiene acceso,
                también las del archivo reservado.
              </p>
            </div>
          </div>
          <label className="en-field">
            Seleccionar grado
            <select
              value={gradoDashboard}
              onChange={(event) => setGradoDashboard(event.target.value)}
            >
              <option value="">Todos los grados</option>
              {GRADOS.map((grado) => (
                <option key={grado} value={grado}>
                  {grado}
                </option>
              ))}
            </select>
          </label>
          <div className="en-grade-grid">
            {GRADOS.map((grado) => (
              <button
                type="button"
                key={grado}
                className={`en-grade ${
                  gradoDashboard === grado ? "selected" : ""
                }`}
                onClick={() => setGradoDashboard(grado)}
              >
                <span>{grado}</span>
                <strong>
                  {
                    entrevistas.filter((item) => item.estado !== "Borrador" && item.estado !== "No admitido" && !item.eliminando && item.datos.grado === grado)
                      .length
                  }
                </strong>
              </button>
            ))}
          </div>
          <h3>
            {gradoDashboard ? `Grado ${gradoDashboard}` : "Todos los grados"}
            {" · "}
            {filtradas.length} aspirantes
          </h3>
          <p className="en-muted en-section">
            Cada barra cuenta personas con ese antecedente. Un aspirante puede
            aparecer en varias barras.
          </p>
          {barras.map((barra) => (
            <div className="en-bar-row" key={barra.nombre}>
              <span>{barra.nombre}</span>
              <div className="en-bar-track">
                <div
                  className="en-bar-fill"
                  style={{ width: `${(barra.cantidad / maximo) * 100}%` }}
                />
              </div>
              <strong>{barra.cantidad}</strong>
            </div>
          ))}
          <p className="en-muted en-section">
            Sin condiciones registradas:{" "}
            {filtradas.filter((item) => item.condiciones.length === 0).length}
          </p>
        </section>
      )}
      </fieldset>
    </section>
  );
}
