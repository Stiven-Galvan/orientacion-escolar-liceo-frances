import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { nombresRol } from "../types/perfil";
import type { Perfil } from "../types/perfil";
import "./Acceso.css";

function Marco({ children }: { children: ReactNode }) {
  return <main className="acceso-fondo"><section className="acceso-tarjeta">
    <img className="acceso-logo" src={`${import.meta.env.BASE_URL}ESCUDO LICEO.jpeg`} alt="Escudo del Liceo Francés Jean Du Plessis" width={80} height={80} />
    <p className="acceso-institucion">LICEO FRANCÉS JEAN DU PLESSIS</p>
    {children}
  </section></main>;
}

function IniciarSesion() {
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState("");

  async function entrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || ocupado) return;
    setMensaje(""); setOcupado(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: correo.trim().toLowerCase(), password });
      if (error) {
        setMensaje(error.status === 429
          ? "Demasiados intentos. Espera unos minutos y vuelve a intentar."
          : "No fue posible ingresar. Revisa el correo, la contraseña y tu conexión.");
      } else {
        setPassword("");
      }
    } catch {
      setMensaje("No se pudo conectar. Revisa tu conexión e inténtalo nuevamente.");
    } finally { setOcupado(false); }
  }

  return <Marco>
    <h1>Orientación escolar</h1>
    <p>Ingresa con tu cuenta autorizada.</p>
    <form className="acceso-formulario" onSubmit={entrar}>
      <label htmlFor="correo-acceso">Correo electrónico</label>
      <input id="correo-acceso" type="email" autoComplete="username" required value={correo} disabled={ocupado} onChange={e => setCorreo(e.target.value)} />
      <label htmlFor="password-acceso">Contraseña</label>
      <input id="password-acceso" type={visible ? "text" : "password"} autoComplete="current-password" required value={password} disabled={ocupado} onChange={e => setPassword(e.target.value)} />
      <label className="acceso-check"><input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} />Mostrar contraseña</label>
      {mensaje && <p className="acceso-error" role="alert">{mensaje}</p>}
      <button className="acceso-primario" type="submit" disabled={ocupado}>{ocupado ? "Ingresando…" : "Ingresar"}</button>
    </form>
    <p className="acceso-ayuda">Si necesitas recuperar tu cuenta, contacta a la administración.</p>
  </Marco>;
}

export function BotonSalir() {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  async function salir() {
    if (!supabase || ocupado) return;
    if (!window.confirm("¿Cerrar sesión? Los formularios y entrevistas sin guardar en la base de datos se perderán.")) return;
    setOcupado(true); setError("");
    try {
      const { error: fallo } = await supabase.auth.signOut({ scope: "local" });
      if (fallo) setError("No se pudo cerrar sesión. Inténtalo nuevamente.");
    } catch { setError("No se pudo cerrar sesión. Revisa tu conexión."); }
    finally { setOcupado(false); }
  }
  return <div className="acceso-salida">
    <button className="acceso-secundario" type="button" disabled={ocupado} onClick={() => void salir()}>{ocupado ? "Saliendo…" : "Cerrar sesión"}</button>
    {error && <p className="acceso-error" role="alert">{error}</p>}
  </div>;
}

function CambiarPassword({ perfil, recargar }: { perfil: Perfil; recargar: () => Promise<void> }) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [guardada, setGuardada] = useState(false);

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || ocupado) return;
    if (nueva.length < 12) { setMensaje("Usa al menos 12 caracteres. Puedes usar una frase fácil de recordar."); return; }
    if (nueva !== repetida) { setMensaje("Las contraseñas nuevas no coinciden."); return; }
    if (nueva === actual) { setMensaje("Elige una contraseña diferente de la temporal."); return; }
    setOcupado(true); setMensaje("");
    try {
      const { error } = await supabase.auth.updateUser({ password: nueva, current_password: actual });
      if (error) {
        setMensaje(error.code === "same_password" ? "La contraseña debe ser diferente de la actual." : "No se pudo cambiar la contraseña. Revisa la contraseña actual y los requisitos de seguridad de tu cuenta.");
        return;
      }
      setActual(""); setNueva(""); setRepetida(""); setGuardada(true);
      await recargar();
    } catch { setMensaje("No se pudo completar la operación. Revisa tu conexión."); }
    finally { setOcupado(false); }
  }

  return <Marco>
    <h1>Crea tu contraseña</h1>
    <p>{perfil.nombre}, cambia la contraseña temporal para activar tu acceso.</p>
    {guardada ? <>
      <p role="status">La contraseña fue actualizada. Estamos verificando la activación de tu perfil.</p>
      <button type="button" className="acceso-primario" disabled={ocupado} onClick={() => void recargar()}>Verificar acceso</button>
    </> : <form className="acceso-formulario" onSubmit={guardar}>
      <label htmlFor="password-actual">Contraseña actual</label>
      <input id="password-actual" type="password" autoComplete="current-password" required value={actual} disabled={ocupado} onChange={e => setActual(e.target.value)} />
      <label htmlFor="password-nueva">Nueva contraseña</label>
      <input id="password-nueva" type="password" autoComplete="new-password" minLength={12} required value={nueva} disabled={ocupado} onChange={e => setNueva(e.target.value)} />
      <label htmlFor="password-repetida">Repetir nueva contraseña</label>
      <input id="password-repetida" type="password" autoComplete="new-password" minLength={12} required value={repetida} disabled={ocupado} onChange={e => setRepetida(e.target.value)} />
      <p className="acceso-ayuda">Mínimo 12 caracteres. Utiliza una contraseña propia.</p>
      {mensaje && <p className="acceso-error" role="alert">{mensaje}</p>}
      <button type="submit" className="acceso-primario" disabled={ocupado}>{ocupado ? "Actualizando…" : "Guardar contraseña y continuar"}</button>
    </form>}
    <BotonSalir />
  </Marco>;
}

export default function Acceso({ children }: { children: (perfil: Perfil) => ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [resultado, setResultado] = useState<{ usuario: string; perfil: Perfil | null; error: string } | null>(null);
  const secuencia = useRef(0);
  const usuario = session?.user.id;

  // El callback se mantiene síncrono: las consultas del perfil van fuera.
  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evento, nuevaSession) => {
      if (!nuevaSession) {
        secuencia.current += 1;
        setResultado(null);
      }
      setSession(nuevaSession);
    });
    return () => subscription.unsubscribe();
  }, []);

  const recargar = useCallback(async () => {
    if (!supabase || !usuario) return;
    const turno = ++secuencia.current;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const { data, error } = await supabase.from("perfiles")
        .select("id,auth_user_id,nombre,correo,rol,activo,requiere_cambio_password")
        .eq("auth_user_id", usuario).abortSignal(controller.signal).maybeSingle();
      if (turno !== secuencia.current) return;
      if (error) throw error;
      if (!data) throw new Error("Esta cuenta no tiene un perfil vinculado. Contacta a la administración.");
      if (!data.activo) throw new Error("Tu cuenta está desactivada. Contacta a la administración.");
      if (!Object.prototype.hasOwnProperty.call(nombresRol, data.rol)) throw new Error("El perfil no tiene un rol válido.");
      setResultado({ usuario, perfil: data as Perfil, error: "" });
    } catch (error) {
      if (turno !== secuencia.current) return;
      setResultado({ usuario, perfil: null, error: error instanceof Error ? error.message : "No se pudo consultar tu perfil. Revisa la conexión e inténtalo de nuevo." });
    } finally { window.clearTimeout(timeout); }
  }, [usuario]);

  useEffect(() => {
    const revisar = () => { void recargar(); };
    const inicio = window.setTimeout(revisar, 0);
    window.addEventListener("focus", revisar);
    return () => { window.clearTimeout(inicio); secuencia.current += 1; window.removeEventListener("focus", revisar); };
  }, [recargar]);

  if (!supabase) return <Marco><h1>Falta configurar la conexión</h1><p>Revisa VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en .env.local y reinicia npm run dev.</p></Marco>;
  if (session === undefined) return <Marco><p role="status">Comprobando sesión…</p></Marco>;
  if (!session) return <IniciarSesion />;
  if (!resultado || resultado.usuario !== usuario) return <Marco><p role="status">Cargando tu perfil…</p><BotonSalir /></Marco>;
  if (!resultado.perfil) return <Marco><h1>No se pudo abrir tu perfil</h1><p role="alert">{resultado.error}</p><button type="button" className="acceso-primario" onClick={() => void recargar()}>Reintentar</button><BotonSalir /></Marco>;
  if (resultado.perfil.requiere_cambio_password) return <CambiarPassword key={usuario} perfil={resultado.perfil} recargar={recargar} />;
  return <>{children(resultado.perfil)}</>;
}
