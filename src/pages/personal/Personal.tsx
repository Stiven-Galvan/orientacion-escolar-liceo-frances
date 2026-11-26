import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { nombresRol } from "../../types/perfil";
import type { Perfil, Rol } from "../../types/perfil";
import "./Personal.css";

type Persona = Omit<Perfil, "auth_user_id"> & { auth_user_id: string | null; eliminacion_pendiente: boolean };
const roles: Rol[] = ["docente", "orientador", "coordinacion_academica", "coordinacion_convivencial", "superadministrador"];
const vacio = { nombre: "", correo: "", documento: "", rol: "docente" as Rol, password: "" };

async function solicitar(datos: Record<string, unknown>) {
  if (!supabase) throw new Error("Falta configurar la conexión");
  const { data, error } = await supabase.functions.invoke("gestionar-personal", { body: datos });
  if (error) {
    const contexto = (error as { context?: Response }).context;
    if (contexto && typeof contexto.json === "function") {
      const detalle = await contexto.json().catch(() => null) as { error?: string } | null;
      throw new Error(detalle?.error ?? "No se pudo completar la operación. Actualiza la lista y revisa tu sesión");
    }
    throw new Error("No se pudo contactar al servidor. Revisa tu conexión y vuelve a ingresar si tu sesión venció");
  }
  if (data?.error) throw new Error(String(data.error));
  return data;
}
const textoError = (error: unknown) => error instanceof Error ? error.message : "No se pudo completar la operación";

export default function Personal({ perfil }: { perfil: Perfil }) {
  const [personal, setPersonal] = useState<Persona[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [formulario, setFormulario] = useState(vacio);
  const [busqueda, setBusqueda] = useState("");
  const [cambios, setCambios] = useState<Record<string, Rol>>({});
  const turno = useRef(0);
  const permitido = ["superadministrador", "desarrollador"].includes(perfil.rol) || perfil.rol === "desarrollador";

  const cargar = useCallback(async () => {
    const actual = ++turno.current;
    setCargando(true);
    try {
      const data = await solicitar({ accion: "listar" });
      if (turno.current !== actual) return;
      setPersonal(data.personal ?? []); setCambios({});
    } catch (fallo) {
      if (turno.current === actual) setError(textoError(fallo));
    } finally { if (turno.current === actual) setCargando(false); }
  }, []);

  useEffect(() => {
    if (!permitido) return;
    const inicio = window.setTimeout(() => void cargar(), 0);
    return () => { window.clearTimeout(inicio); turno.current += 1; };
  }, [cargar, permitido]);

  async function crear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (ocupado) return;
    setOcupado(true); setError(""); setMensaje("");
    try {
      const data = await solicitar({ accion: "crear", ...formulario });
      setFormulario({ ...vacio }); setMensaje(data.mensaje);
      await cargar();
    } catch (fallo) { setError(textoError(fallo)); }
    finally { setFormulario(actual => ({ ...actual, password: "" })); setOcupado(false); }
  }

  async function cambiarRol(persona: Persona) {
    const nuevoRol = cambios[persona.id];
    if (ocupado || !nuevoRol || nuevoRol === persona.rol) return;
    if (!window.confirm(`¿Cambiar el rol de ${persona.nombre} de ${nombresRol[persona.rol]} a ${nombresRol[nuevoRol]}? Cambiará su acceso a la plataforma.`)) return;
    setOcupado(true); setError(""); setMensaje("");
    try {
      const data = await solicitar({ accion: "cambiar_rol", id: persona.id, rol: nuevoRol });
      setMensaje(data.mensaje); await cargar();
    } catch (fallo) { setError(textoError(fallo)); await cargar(); }
    finally { setOcupado(false); }
  }

  async function eliminar(persona: Persona) {
    if (ocupado) return;
    const confirmacion = window.prompt(`Eliminar a ${persona.nombre}: se borrarán su cuenta de acceso, documento y ficha de personal. Se conservarán los registros de estudiantes y el historial. Esta acción no se puede deshacer.\n\nEscribe su correo para confirmar:\n${persona.correo}`);
    if (confirmacion === null) return;
    if (confirmacion.trim().toLowerCase() !== persona.correo) { setError("El correo no coincide. No se eliminó la cuenta"); return; }
    setOcupado(true); setError(""); setMensaje("");
    try {
      const data = await solicitar({ accion: "eliminar", id: persona.id, confirmacion });
      setMensaje(data.mensaje);
    } catch (fallo) { setError(textoError(fallo)); }
    finally { await cargar(); setOcupado(false); }
  }

  if (!permitido) return <section className="panel"><h1>Acceso restringido</h1><p>Tu cuenta no administra personal.</p></section>;
  const filtro = busqueda.trim().toLocaleLowerCase("es");
  const visibles = personal.filter(persona => `${persona.nombre} ${persona.correo} ${nombresRol[persona.rol]}`.toLocaleLowerCase("es").includes(filtro));

  return <div className="personal-modulo">
    <section className="page-heading"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Personal</h1><p>Gestiona cuentas y roles del equipo del colegio.</p></div></section>
    {error && <p className="personal-error" role="alert">{error}</p>}
    {mensaje && <p className="personal-exito" role="status">{mensaje}</p>}
    <section className="panel">
      <h2>Agregar persona</h2>
      <p>Se crea su cuenta de acceso y su perfil. Deberá cambiar la contraseña temporal en el primer ingreso.</p>
      <form className="personal-formulario" onSubmit={crear}>
        <label>Nombre completo<input required minLength={2} maxLength={180} value={formulario.nombre} disabled={ocupado} onChange={e => setFormulario({ ...formulario, nombre: e.target.value })} /></label>
        <label>Correo electrónico<input type="email" autoComplete="off" required maxLength={254} value={formulario.correo} disabled={ocupado} onChange={e => setFormulario({ ...formulario, correo: e.target.value })} /></label>
        <label>Cédula de ciudadanía<input required inputMode="numeric" pattern="[0-9]{5,20}" title="Entre 5 y 20 dígitos" value={formulario.documento} disabled={ocupado} onChange={e => setFormulario({ ...formulario, documento: e.target.value })} /></label>
        <label>Rol<select value={formulario.rol} disabled={ocupado} onChange={e => setFormulario({ ...formulario, rol: e.target.value as Rol })}>{roles.map(rol => <option value={rol} key={rol}>{nombresRol[rol]}</option>)}</select></label>
        <label className="personal-password">Contraseña temporal<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={formulario.password} disabled={ocupado} onChange={e => setFormulario({ ...formulario, password: e.target.value })} /><small>Entre 12 y 128 caracteres. Entrégala directamente a su titular; no podrá consultarse después.</small></label>
        <button className="primary-button" type="submit" disabled={ocupado}>{ocupado ? "Procesando…" : "Crear cuenta"}</button>
      </form>
    </section>
    <section className="panel">
      <div className="personal-cabecera"><div><h2>Equipo registrado</h2><p>{personal.length} perfiles</p></div><button className="acceso-secundario" type="button" disabled={ocupado || cargando} onClick={() => { setError(""); void cargar(); }}>Actualizar</button></div>
      <label className="personal-busqueda">Buscar por nombre, correo o rol<input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar personal…" /></label>
      {cargando ? <p role="status">Consultando personal…</p> : <div className="personal-tabla-contenedor"><table className="personal-tabla">
        <thead><tr><th scope="col">Nombre y correo</th><th scope="col">Estado</th><th scope="col">Rol</th><th scope="col">Acciones</th></tr></thead>
        <tbody>{visibles.map(persona => {
          const protegido = persona.rol === "desarrollador" || persona.id === perfil.id;
          return <tr key={persona.id}>
            <td><strong>{persona.nombre}</strong><span className="personal-correo">{persona.correo}</span>{persona.id === perfil.id && <small>Tu cuenta</small>}</td>
            <td>{persona.eliminacion_pendiente ? "Eliminación pendiente · Bloqueada" : !persona.activo ? "Inactiva" : !persona.auth_user_id ? "Sin cuenta de acceso" : persona.requiere_cambio_password ? "Pendiente de cambiar contraseña" : "Activa"}</td>
            <td>{protegido ? nombresRol[persona.rol] : <select aria-label={`Rol de ${persona.nombre}`} value={cambios[persona.id] ?? persona.rol} disabled={ocupado || persona.eliminacion_pendiente} onChange={e => setCambios({ ...cambios, [persona.id]: e.target.value as Rol })}>{roles.map(rol => <option key={rol} value={rol}>{nombresRol[rol]}</option>)}</select>}</td>
            <td>{protegido ? <span className="personal-protegido">Cuenta protegida</span> : <div className="personal-acciones">
              <button type="button" className="acceso-secundario" disabled={ocupado || persona.eliminacion_pendiente || !cambios[persona.id] || cambios[persona.id] === persona.rol} onClick={() => void cambiarRol(persona)}>Guardar rol</button>
              {["superadministrador", "desarrollador"].includes(perfil.rol) && <button type="button" className="personal-peligro" disabled={ocupado} onClick={() => void eliminar(persona)}>{persona.eliminacion_pendiente ? "Reintentar eliminación" : "Eliminar"}</button>}
            </div>}</td>
          </tr>;
        })}</tbody>
      </table>{visibles.length === 0 && <p>No hay personas que coincidan con la búsqueda.</p>}</div>}
    </section>
  </div>;
}
