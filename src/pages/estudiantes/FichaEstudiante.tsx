import Seguimiento from "../seguimiento/Seguimiento";
import RemisionesEspeciales from "../especiales/RemisionesEspeciales";
import ProcesosAutonomos from "../autonomos/ProcesosAutonomos";
import Intervenciones from "../intervenciones/Intervenciones";
import RemisionesEstudiante from "../remisiones/RemisionesEstudiante";
import PasarPiar from "../piar/PasarPiar";
import { IntervencionesEstudiante } from "../observaciones/ObservacionDocente";
import type { Perfil } from "../../types/perfil";
import { nombreGrado } from "./modelos";
import DocentesDelEstudiante from "./DocentesDelEstudiante";
import ExpedienteAdmision from "./ExpedienteAdmision";
import type { Ficha, Evento } from "./modelos";

const etiquetas: Record<string, string> = { nombre: "Nombre", tipo_documento: "Tipo de documento", numero_documento: "Documento", fecha_nacimiento: "Nacimiento", estado: "Estado", es_prueba: "Registro de prueba", acudiente_nombre: "Acudiente", acudiente_parentesco: "Parentesco", acudiente_telefono: "Teléfono", acudiente_correo: "Correo del acudiente" };
const mostrar = (valor: unknown) => valor === true ? "Sí" : valor === false ? "No" : valor === null || valor === undefined || valor === "" ? "Sin registrar" : String(valor);
function cambios(evento: Evento) {
  if(evento.tabla === "remisiones_especiales") return [`Remisión: ${mostrar(evento.nuevo?.tipo ?? evento.anterior?.tipo)}`,`Versión: ${mostrar(evento.nuevo?.version ?? evento.anterior?.version)}`];
  if(evento.tabla === "procesos_autonomos") return [`Registro de procesos autónomos · Versión: ${mostrar(evento.nuevo?.version ?? evento.anterior?.version)}`];
  if(evento.tabla === "autonomo_archivos") return [`Archivo: ${mostrar(evento.nuevo?.nombre ?? evento.anterior?.nombre)}`];
  if(evento.tabla === "intervenciones") return [`Formato: ${mostrar(evento.nuevo?.tipo ?? evento.anterior?.tipo)}`, `Estado: ${mostrar(evento.nuevo?.estado ?? evento.anterior?.estado)}`, `Sesión: ${mostrar(evento.nuevo?.sesion ?? evento.anterior?.sesion)}`, `Versión: ${mostrar(evento.nuevo?.version ?? evento.anterior?.version)}`];
  if (evento.tabla === "procesos_piar") return [`Año lectivo: ${mostrar(evento.nuevo?.anio_lectivo ?? evento.anterior?.anio_lectivo)}`, `Iniciado por: ${mostrar(evento.nuevo?.iniciado_nombre ?? evento.anterior?.iniciado_nombre)}`, evento.accion === "DELETE" ? "Proceso PIAR retirado con el expediente" : "Estudiante pasado a PIAR"];
  if (evento.tabla === "observaciones_docentes") return [`Docente: ${mostrar(evento.nuevo?.docente_nombre ?? evento.anterior?.docente_nombre)}`, `Año: ${mostrar(evento.nuevo?.anio_lectivo ?? evento.anterior?.anio_lectivo)} · Período: ${mostrar(evento.nuevo?.periodo ?? evento.anterior?.periodo)}`, evento.accion === "DELETE" ? "Formato retirado con el expediente" : evento.nuevo?.enviado_en ? "Formato diligenciado y enviado" : "Formato habilitado, pendiente de diligenciar"];
  if (evento.tabla === "admisiones_vinculos") return [`${evento.accion === "DELETE" ? "Vinculación de admisión eliminada" : "Entrevista de admisión vinculada a esta ficha"}. Año de ingreso: ${mostrar(evento.nuevo?.anio_lectivo ?? evento.anterior?.anio_lectivo)}`];
  if (evento.tabla === "matriculas") return [`Año lectivo: ${mostrar(evento.nuevo?.anio_lectivo ?? evento.anterior?.anio_lectivo)}`, ...(evento.accion === "UPDATE" ? ["Se cambió el grupo asignado para este año."] : [])];
  return Object.entries(etiquetas).filter(([clave]) => evento.accion === "INSERT" ? evento.nuevo?.[clave] != null : JSON.stringify(evento.anterior?.[clave]) !== JSON.stringify(evento.nuevo?.[clave])).map(([clave, etiqueta]) => `${etiqueta}: ${evento.accion === "UPDATE" ? `${mostrar(evento.anterior?.[clave])} → ` : ""}${mostrar(evento.nuevo?.[clave])}`);
}
const sinPendientes=()=>{};
export default function FichaEstudiante({ onPendientes=sinPendientes,onAbrirRemision, perfil, ficha, onVolver, onEditar, onActualizar, ocupado, puedeEliminar, onEliminarEstudiante, onEliminarMatricula }: { onPendientes?:(b:boolean)=>void; onAbrirRemision?:(id:string)=>void; perfil: Perfil; ficha: Ficha; onVolver: () => void; onEditar: () => void; onActualizar: () => void; ocupado: boolean; puedeEliminar: boolean; onEliminarEstudiante: () => void; onEliminarMatricula: (id: string) => void }) {
  if (!["orientador", "superadministrador", "desarrollador"].includes(perfil.rol)) return <p role="alert">Tu cuenta no tiene acceso a la ficha administrativa.</p>;
  const e = ficha.estudiante;
  return <div className="estudiantes-ficha">
    <section className="panel estudiantes-panel">
      <div className="estudiantes-cabecera"><div><p className="eyebrow">FICHA DEL ESTUDIANTE</p><h2>{e.nombre}</h2><p>{e.tipo_documento ? `${e.tipo_documento} · ${e.numero_documento}` : "Sin documento registrado"}{e.es_prueba && " · Registro ficticio de prueba"}</p></div><div className="estudiantes-acciones">{puedeEliminar && <button type="button" className="personal-peligro" disabled={ocupado} onClick={onEliminarEstudiante}>{e.eliminando ? "Reintentar eliminación" : "Eliminar expediente completo"}</button>}<button type="button" className="primary-button" disabled={ocupado || e.eliminando} onClick={onEditar}>Editar ficha</button><button type="button" className="acceso-secundario" disabled={ocupado} onClick={onActualizar}>Actualizar</button><button type="button" className="acceso-secundario" disabled={ocupado} onClick={onVolver}>Volver a la lista</button></div></div>
      <dl className="estudiantes-datos"><div><dt>Nacimiento</dt><dd>{e.fecha_nacimiento ?? "Sin registrar"}</dd></div><div><dt>Estado</dt><dd>{e.estado}</dd></div><div><dt>Acudiente</dt><dd>{e.acudiente_nombre ?? "Sin registrar"}</dd></div><div><dt>Parentesco</dt><dd>{e.acudiente_parentesco ?? "Sin registrar"}</dd></div><div><dt>Teléfono</dt><dd>{e.acudiente_telefono ?? "Sin registrar"}</dd></div><div><dt>Correo</dt><dd>{e.acudiente_correo ?? "Sin registrar"}</dd></div></dl>
    </section>
    <section className="panel estudiantes-panel"><h2>Matrículas por año</h2>{ficha.matriculas.length ? <ul className="estudiantes-matriculas">{ficha.matriculas.map(m => <li key={m.id}><strong>{m.anio_lectivo}</strong><span>{nombreGrado(m.grado)}{m.seccion ? ` · Grupo ${m.seccion}` : " · Sin sección"}</span>{puedeEliminar && <button type="button" className="personal-peligro" disabled={ocupado || e.eliminando} onClick={() => onEliminarMatricula(m.id)}>Eliminar matrícula</button>}</li>)}</ul> : <p>Sin matrícula registrada. Usa Editar ficha para asignar año y grado.</p>}</section>
    {e.eliminando && <p className="estudiantes-error" role="status">El expediente tiene una eliminación pendiente. Un superadministrador o el desarrollador puede reintentar para terminar de retirar sus soportes y registros.</p>}
    <RemisionesEstudiante id={e.id} onAbrir={onAbrirRemision}/>
    {!e.eliminando && <Seguimiento key={e.id} perfil={perfil} rolVista={perfil.rol} estudianteId={e.id} onAbrirRemision={onAbrirRemision} />}
    <PasarPiar perfil={perfil} estudianteId={e.id} anios={ficha.matriculas.map(m => m.anio_lectivo)} bloqueado={ocupado || !!e.eliminando || e.estado !== "activo"} onActualizar={onActualizar} />
    <ExpedienteAdmision key={e.id} estudianteId={e.id} puedeEliminar={puedeEliminar} />
    <DocentesDelEstudiante key={e.id + ":" + e.version} estudianteId={e.id} matriculas={ficha.matriculas} />
    <RemisionesEspeciales key={"especiales-"+e.id} perfil={perfil} estudianteId={e.id} bloqueado={!!e.eliminando} onPendientes={onPendientes}/>
    <ProcesosAutonomos key={"autonomos-"+e.id} perfil={perfil} estudianteId={e.id} bloqueado={!!e.eliminando} onPendientes={onPendientes}/>
    <Intervenciones key={e.id} perfil={perfil} estudianteId={e.id} bloqueado={!!e.eliminando} onPendientes={onPendientes}/>
    <IntervencionesEstudiante perfil={perfil} estudianteId={e.id} anios={ficha.matriculas.map(m => m.anio_lectivo).sort((a,b)=>b-a)} bloqueado={!!e.eliminando} />
    <section className="panel estudiantes-panel"><h2>Historial del estudiante</h2><p>Últimos 100 eventos. Las fechas se muestran en hora de Colombia.</p>{ficha.historial.length ? <ol className="estudiantes-historial">{ficha.historial.map(evento => <li key={evento.tabla+":"+evento.id}><div><strong>{evento.tabla === "remisiones_especiales" ? "Remisión especial" : evento.tabla === "procesos_autonomos" ? "Proceso autónomo" : evento.tabla === "autonomo_archivos" ? "Archivo de proceso autónomo" : evento.tabla === "intervenciones" ? "Intervención" : evento.tabla === "procesos_piar" ? "Proceso PIAR" : evento.tabla === "observaciones_docentes" ? "Observación docente" : evento.tabla === "matriculas" ? "Matrícula" : evento.tabla === "admisiones_vinculos" ? "Admisión" : "Ficha"} · {evento.accion === "INSERT" ? "Creación" : evento.accion === "UPDATE" ? "Actualización" : "Eliminación"}</strong><span>{new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(evento.fecha))} · {evento.actor_nombre ?? "Administración de la base de datos"}</span></div><details><summary>Ver cambios</summary><ul>{cambios(evento).map((texto, index) => <li key={index}>{texto}</li>)}</ul></details></li>)}</ol> : <p>No hay eventos registrados.</p>}</section>
  </div>;
}
