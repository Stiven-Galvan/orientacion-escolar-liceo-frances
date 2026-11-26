import InicioPorRol from "./components/InicioPorRol";
import BuzonRemisiones from "./pages/remisiones/BuzonRemisiones";
import NotificacionesPiar from "./pages/piar/NotificacionesPiar";
import { lazy, Suspense, useState } from "react";
import "./App.css";
import Acceso, { BotonSalir } from "./components/Acceso";
import { modulosPorRol, nombresRol } from "./types/perfil";
import type { Perfil, Rol } from "./types/perfil";
const Seguimiento = lazy(() => import("./pages/seguimiento/Seguimiento"));
const CentroRemisiones = lazy(() => import("./pages/remisiones/CentroRemisiones"));
const Analisis = lazy(() => import("./pages/gestion/Analisis"));
const Administracion = lazy(() => import("./pages/gestion/Administracion"));
const RemisionesEspeciales = lazy(() => import("./pages/especiales/RemisionesEspeciales"));
const Protocolos = lazy(() => import("./pages/protocolos/Protocolos"));
const ProcesosAutonomos = lazy(() => import("./pages/autonomos/ProcesosAutonomos"));
const Intervenciones = lazy(() => import("./pages/intervenciones/Intervenciones"));
const ObservacionesAula = lazy(() => import("./pages/aula/ObservacionesAula"));
const Actividades = lazy(() => import("./pages/actividades/Actividades"));
const Pap = lazy(() => import("./pages/pap/Pap"));
const Remisiones = lazy(() => import("./pages/remisiones/Remisiones"));
const Agenda = lazy(() => import("./pages/agenda/Agenda"));
const PanelObservacion = lazy(() => import("./pages/observaciones/PanelObservacion"));
const ProcesosPiar = lazy(() => import("./pages/piar/ProcesosPiar"));
const ErrorModulo = lazy(() => import("./components/ErrorModulo"));
const ObservacionDocente = lazy(() => import("./pages/observaciones/ObservacionDocente"));
const Personal = lazy(() => import("./pages/personal/Personal"));
const CursosDocentes = lazy(() => import("./pages/cursos/CursosDocentes"));
const Estudiantes = lazy(() => import("./pages/estudiantes/Estudiantes"));
const EstudiantesNuevos = lazy(() => import("./pages/admisiones/EstudiantesNuevos"));

const modules = [
  { id: "inicio", name: "Inicio", icon: "◈" },
  { id: "personal", name: "Personal", icon: "♙" },
  { id: "cursos-docentes", name: "Cursos y docentes", icon: "▦" },
  { id: "estudiantes", name: "Estudiantes", icon: "◎" },
  { id: "seguimiento", name: "Seguimiento", icon: "◷" },
  { id: "admisiones", name: "Estudiantes nuevos", icon: "⊕" },
  { id: "observaciones", name: "Observación docente", icon: "▤" },
  { id: "piar", name: "PIAR", icon: "▥" },
  { id: "remisiones-especiales", name: "Remisiones especiales", icon: "↗" },
  { id: "remisiones", name: "Remisiones", icon: "↗" },
  { id: "intervenciones", name: "Intervenciones", icon: "◇" },
  { id: "agenda", name: "Agenda", icon: "▦" },
  { id: "pap", name: "PAP · Primeros auxilios psicológicos", icon: "♡" },
  { id: "buzon", name: "Buzón y mensajes", icon: "✉" },
  { id: "actividades", name: "Actividades", icon: "◉" },
  { id: "protocolos", name: "Protocolos", icon: "▧" },
  { id: "analisis", name: "Análisis", icon: "▥" },
  { id: "administracion", name: "Administración", icon: "⚙" },
  {
    id: "observaciones-aula",
    name: "Observaciones de aula",
    icon: "▤",
  },
  {
    id: "procesos-autonomos",
    name: "Procesos autónomos",
    icon: "◇",
  },
];
const descriptions: Record<string, string> = {
  personal: "Administra las cuentas y roles del personal del colegio.",
  estudiantes: "Consulta estudiantes por grado y accede a sus expedientes.",
  seguimiento: "Revisa acciones, acuerdos y remisiones pendientes.",
  admisiones: "Organiza aspirantes, entrevistas y decisiones de admisión.",
  observaciones: "Diligencia y consulta las observaciones docentes.",
  piar: "Organiza los planes individuales de ajustes razonables.",
  "remisiones-especiales": "Remisiones externas a EPS y Comisaría de Familia.",
  remisiones: "Gestiona las solicitudes y autorizaciones de remisión.",
  intervenciones: "Registra atenciones, compromisos y seguimientos.",
  agenda: "Organiza citas, actividades y próximas atenciones.",
  buzon: "Consulta documentos pendientes y conversaciones.",
  actividades: "Organiza escuelas de padres y actividades institucionales.",
  protocolos: "Consulta los procedimientos autorizados para tu rol.",
  analisis: "Consulta indicadores del programa de orientación.",
  administracion: "Gestiona usuarios y revisa su historial de actividad.",
  "observaciones-aula":
    "Registra observaciones de salones completos o de estudiantes dentro del aula.",
  "procesos-autonomos":
    "Documenta actuaciones realizadas directamente por orientación y sus seguimientos.",
};

function EspacioTrabajo({ perfil }: { perfil: Perfil }) {
  const [piarParaAbrir,setPiarParaAbrir] = useState<string|null>(null);
  const [activeModule, setActiveModule] = useState("inicio");
  const [admisionesAbiertas, setAdmisionesAbiertas] = useState(false);
  const [remisionParaAbrir,setRemisionParaAbrir]=useState<string|null>(null);
  const [revisionRemision,setRevisionRemision]=useState(0);
  const [remisionParaCrear,setRemisionParaCrear]=useState<string|null>(null);
  const [hayCambios, setHayCambios] = useState(false);
  const [estudianteParaAbrir, setEstudianteParaAbrir] = useState<string | null>(null);
  function navegar(destino: string, estudianteId?: string) {
    if (!modulosPorRol[rolVista].includes(destino) || destino === activeModule) return;
    if (hayCambios && !window.confirm(activeModule === "admisiones" ? "La entrevista aún no se ha terminado. Puedes volver para terminarla. Guarda antes de recargar. ¿Cambiar de apartado?" : "Hay cambios del formulario sin guardar. ¿Salir y descartarlos?")) return;
    setHayCambios(false);
    if (destino === "estudiantes") {setEstudianteParaAbrir(estudianteId ?? null);setRemisionParaCrear(null);}
    if(destino === "remisiones")setRemisionParaAbrir(null);
    if (destino === "piar") setPiarParaAbrir(null);
    if (destino === "admisiones") setAdmisionesAbiertas(true);
    setActiveModule(destino);
  }
  function abrirRemision(id:string){if(hayCambios&&!window.confirm("Hay cambios sin guardar. ¿Descartarlos y abrir la remisión?"))return;setHayCambios(false);setRemisionParaAbrir(id);setRevisionRemision(v=>v+1);setRemisionParaCrear(null);setActiveModule("remisiones");}
  function crearDesdeRemision(id:string){setHayCambios(false);setEstudianteParaAbrir(null);setRemisionParaCrear(id);setActiveModule("estudiantes");}
  const [vista, setVista] = useState<Rol>("desarrollador");
  const esDesarrollador = perfil.rol === "desarrollador";
  const rolVista = esDesarrollador ? vista : perfil.rol;
  const permitidos = modulosPorRol[rolVista];
  const modulosVisibles = permitidos.flatMap(id => {
    const module = modules.find(m => m.id === id);
    if (!module || id === "remisiones-especiales") return [];
    const name = id === "seguimiento" && rolVista === "orientador" ? "Mis casos"
      : id === "remisiones" && rolVista.startsWith("coordinacion_") ? "Solicitudes de remisión"
      : id === "estudiantes" && rolVista === "docente" ? "Mis estudiantes"
      : id === "remisiones" && rolVista === "docente" ? "Mis remisiones" : module.name;
    return [{ ...module, name }];
  });
  const moduloSeguro = permitidos.includes(activeModule) ? activeModule : "inicio";
  const iniciales = perfil.nombre.split(/\s+/).slice(0, 2).map(parte => parte[0]).join("").toUpperCase();
  const currentModule =
    modulosVisibles.find((module) => module.id === moduloSeguro) ?? modules.find(module => module.id === moduloSeguro) ?? modulosVisibles[0];
  return (
    <div className={`app-layout rol-${rolVista}`}>
      <aside className="sidebar">
        <div className="brand">
          <img
            className="brand-logo"
            src={`${import.meta.env.BASE_URL}ESCUDO LICEO.jpeg`}
            alt="Escudo del Liceo Francés Jean Du Plessis"
            width={52}
            height={52}
            style={{
              width: 52,
              height: 52,
              maxWidth: 52,
              flexShrink: 0,
              objectFit: "contain",
              backgroundColor: "#ffffff",
              borderRadius: "50%",
              padding: 3,
            }}
          />
          <div>
            <strong>Orientación</strong>
            <span>Liceo Francés</span>
          </div>
        </div>
        <p className="navigation-label">ESPACIO DE TRABAJO</p>
        <nav aria-label="Navegación principal">
          {modulosVisibles.map((module) => (
            <button
              type="button"
              key={module.id}
              className={`nav-button ${
                moduloSeguro === module.id ? "active" : ""
              }`}
              onClick={() => navegar(module.id)}
              aria-current={moduloSeguro === module.id ? "page" : undefined}
            >
              <span className="nav-icon" aria-hidden="true">
                {module.icon}
              </span>
              {module.name}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" aria-hidden="true" />
          Acceso institucional · R3
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Orientación escolar
            <span aria-hidden="true">/</span>
            <strong>{currentModule.name}</strong>
          </div>
          <div className="account">
            <div className="avatar" aria-hidden="true">
              {iniciales}
            </div>
            <div>
              <strong>{perfil.nombre}</strong>
              <span className="account-role">{nombresRol[perfil.rol]}</span>
            </div>
            <BuzonRemisiones compacto onAbrir={abrirRemision}/>
            <NotificacionesPiar perfil={perfil} onAbrir={id => { if (hayCambios && !window.confirm("Hay cambios sin guardar. ¿Descartarlos y abrir la novedad PIAR?")) return; setHayCambios(false); setPiarParaAbrir(id); setActiveModule("piar"); }} />
            <BotonSalir />
            {esDesarrollador && (
              <label className="developer-control">
                <span>Vista de perfil · Solo desarrollador</span>
                <select value={vista} onChange={event => {
                  if (hayCambios && !window.confirm(activeModule === "admisiones" ? "La entrevista está sin terminar. Guarda antes de recargar. ¿Cambiar de vista?" : "Hay cambios del formulario sin guardar. ¿Cambiar de vista y descartarlos?")) return;
                  setHayCambios(false);
                  setVista(event.target.value as Rol);
                  setActiveModule("inicio");
                }}>
                  {Object.entries(nombresRol).map(([valor, nombre]) => (
                    <option key={valor} value={valor}>{valor === "desarrollador" ? "Mi panel de desarrollador" : nombre}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </header>
        <main className="main-content">
          {esDesarrollador && (
            <div className="developer-notice" role="status">
              <strong>Vista: {nombresRol[rolVista]}.</strong>{" "}
              Sigues conectado como desarrollador. El selector cambia los menús y las pantallas;
              las acciones se realizan con tu cuenta y tus permisos reales. Tu cuenta conserva sus permisos completos. Para usar tus herramientas de administración, vuelve a tu panel de desarrollador. Las acciones quedan registradas a tu nombre. {rolVista !== "desarrollador" && <button type="button" className="text-button" onClick={() => { if (hayCambios && !window.confirm("Hay cambios sin guardar. ¿Volver a tu panel?")) return; setHayCambios(false); setVista("desarrollador"); setActiveModule("inicio"); }}>Volver a mi panel de desarrollador</button>}
            </div>
          )}
          <div className="demo-notice"><span className="demo-badge">ACCESOS POR PERFIL</span>Cada perfil muestra las herramientas correspondientes a sus funciones.</div>
          {admisionesAbiertas && permitidos.includes("admisiones") && (
            <div hidden={moduloSeguro !== "admisiones"} style={{ display: moduloSeguro === "admisiones" ? "block" : "none" }}>
              <ErrorModulo>
                <Suspense fallback={<p role="status">Cargando Admisiones…</p>}>
                  <EstudiantesNuevos key={rolVista} perfil={perfil} rolVista={rolVista} activa={moduloSeguro === "admisiones"} onPendientes={setHayCambios} onAbrirEstudiante={id => navegar("estudiantes", id)} />
                </Suspense>
              </ErrorModulo>
            </div>
          )}
          <ErrorModulo key={moduloSeguro}>
            <Suspense fallback={<p role="status">Cargando módulo…</p>}>
          {moduloSeguro === "estudiantes" ? (
            <Estudiantes remisionId={remisionParaCrear} onCancelarRemision={()=>{const id=remisionParaCrear;setRemisionParaCrear(null);if(id)abrirRemision(id);}} onRemisionRegistrada={()=>setRemisionParaCrear(null)} onAbrirRemision={abrirRemision} perfil={perfil} rolVista={rolVista} onPendientes={setHayCambios} abrirId={estudianteParaAbrir} />
          ) : moduloSeguro === "seguimiento" ? (
            <Seguimiento key={rolVista} perfil={perfil} rolVista={rolVista} onAbrirEstudiante={id => navegar("estudiantes", id)} onAbrirRemision={abrirRemision} onPendientes={setHayCambios} />
          ) : moduloSeguro === "observaciones" ? (
            rolVista === "docente" ? <ObservacionDocente perfil={perfil} onPendientes={setHayCambios} /> : <PanelObservacion perfil={perfil} onPendientes={setHayCambios} onAbrirEstudiante={id => navegar("estudiantes", id)} />
          ) : moduloSeguro === "piar" ? (
            <ProcesosPiar key={piarParaAbrir??"lista"} abrirId={piarParaAbrir} perfil={perfil} rolVista={rolVista} onPendientes={setHayCambios} onAbrirEstudiante={id => navegar("estudiantes", id)} />
          ) : moduloSeguro === "remisiones-especiales" ? (
            <RemisionesEspeciales perfil={perfil} onPendientes={setHayCambios} onAbrirEstudiante={id=>navegar("estudiantes",id)}/>
          ) : moduloSeguro === "remisiones" ? (
            ["orientador","superadministrador","desarrollador"].includes(rolVista)?<CentroRemisiones key={`${remisionParaAbrir??"lista"}:${revisionRemision}`} abrirId={remisionParaAbrir} perfil={perfil} rolVista={rolVista} onPendientes={setHayCambios} onCrear={crearDesdeRemision} onAbrirEstudiante={id=>navegar("estudiantes",id)}/>:<Remisiones key={`${remisionParaAbrir??"lista"}:${revisionRemision}`} abrirId={remisionParaAbrir} perfil={perfil} rolVista={rolVista} onPendientes={setHayCambios} onCrear={crearDesdeRemision} onAbrirEstudiante={id=>navegar("estudiantes",id)}/>
          ) : moduloSeguro === "buzon" ? (
            <BuzonRemisiones onAbrir={abrirRemision}/>
          ) : moduloSeguro === "pap" ? (
            <Pap perfil={perfil} onPendientes={setHayCambios}/>
          ) : moduloSeguro === "procesos-autonomos" ? (
            <ProcesosAutonomos perfil={perfil} onPendientes={setHayCambios} onAbrirEstudiante={id=>navegar("estudiantes",id)}/>
          ) : moduloSeguro === "intervenciones" ? (
            <Intervenciones perfil={perfil} onPendientes={setHayCambios} onAbrirEstudiante={id=>navegar("estudiantes",id)}/>
          ) : moduloSeguro === "observaciones-aula" ? (
            <ObservacionesAula perfil={perfil} onPendientes={setHayCambios}/>
          ) : moduloSeguro === "actividades" ? (
            <Actividades perfil={perfil} onPendientes={setHayCambios}/>
          ) : moduloSeguro === "analisis" ? (
            <Analisis perfil={perfil} onNavegar={m=>navegar(m)}/>
          ) : moduloSeguro === "administracion" ? (
            <Administracion perfil={perfil} onNavegar={m=>navegar(m)}/>
          ) : moduloSeguro === "protocolos" ? (
            <Protocolos />
          ) : moduloSeguro === "agenda" ? (
            <Agenda perfil={perfil} rolVista={rolVista} onPendientes={setHayCambios} onAbrirEstudiante={id => navegar("estudiantes", id)} />
          ) : moduloSeguro === "cursos-docentes" ? (
            <CursosDocentes perfil={perfil} />
          ) : moduloSeguro === "personal" ? (
            <Personal perfil={perfil} />
          ) : moduloSeguro === "admisiones" ? (
            null
          ) : moduloSeguro === "inicio" ? (
            <InicioPorRol rol={rolVista} nombre={perfil.nombre} onNavegar={navegar}/>
          ) : (
            <>
              <section className="page-heading">
                <div>
                  <p className="eyebrow">ESPACIO DE TRABAJO</p>
                  <h1>{currentModule.name}</h1>
                  <p>{descriptions[moduloSeguro]}</p>
                </div>
              </section>
              <section className="panel empty-state">
                <span className="empty-icon" aria-hidden="true">
                  {currentModule.icon}
                </span>
                <h2>La estructura de este módulo está lista</h2>
                <p>
                  En el siguiente paso construiremos sus registros, formularios
                  y acciones con sus permisos. En docentes, el acceso por estudiante y la habilitación de PIAR u observación se conectarán en esa etapa.
                </p>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => navegar("inicio")}
                >
                  Volver al inicio
                </button>
              </section>
            </>
          )}
            </Suspense>
          </ErrorModulo>
          <footer className="page-footer">
            <span>Liceo Francés · Orientación escolar</span>
            <span>Actualización OE-2026.11.03-R3</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
export default function App() {
  return <Acceso>{perfil => <EspacioTrabajo key={perfil.auth_user_id} perfil={perfil} />}</Acceso>;
}
