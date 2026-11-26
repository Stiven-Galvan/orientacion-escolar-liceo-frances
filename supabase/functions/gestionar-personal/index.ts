import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const responder = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
const roles = ["docente", "orientador", "coordinacion_academica", "coordinacion_convivencial", "superadministrador"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return responder(405, { error: "Método no permitido" });
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get("Authorization") ?? "")?.[1];
  if (!token) return responder(401, { error: "Inicia sesión para continuar" });
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return responder(500, { error: "No está disponible la configuración del servidor" });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: { user }, error: errorUsuario } = await admin.auth.getUser(token);
    if (errorUsuario || !user) return responder(401, { error: "Sesión inválida. Vuelve a ingresar" });
    const rpc = async (accion: string, datos: Record<string, unknown> = {}) => {
      const { data, error } = await admin.rpc("personal_gestion", { p_actor: user.id, p_accion: accion, p_datos: datos });
      return { data, error };
    };
    const permiso = await rpc("validar");
    if (permiso.error) return responder(403, { error: "Solo superadministradores y desarrollador con acceso activo pueden administrar personal" });
    const texto = await req.text();
    if (texto.length > 16000) return responder(413, { error: "Solicitud demasiado grande" });
    let datos: Record<string, unknown>;
    try { datos = JSON.parse(texto); } catch { return responder(400, { error: "Solicitud inválida" }); }
    if (!datos || typeof datos !== "object" || Array.isArray(datos)) return responder(400, { error: "Solicitud inválida" });
    const accion = datos.accion;
    const falloBase = (error: { code?: string; message: string }) => responder(400, { error: error.code === "P0001" ? error.message : error.code === "23505" ? "El correo o el documento ya están registrados" : "No se pudo completar la operación. Actualiza la lista e inténtalo nuevamente" });

    if (accion === "listar") {
      const r = await rpc("listar");
      return r.error ? falloBase(r.error) : responder(200, { personal: r.data });
    }
    if (accion === "crear") {
      const nombre = typeof datos.nombre === "string" ? datos.nombre.trim() : "";
      const correo = typeof datos.correo === "string" ? datos.correo.trim().toLowerCase() : "";
      const documento = typeof datos.documento === "string" ? datos.documento.trim() : "";
      const password = typeof datos.password === "string" ? datos.password : "";
      const rol = typeof datos.rol === "string" ? datos.rol : "";
      if (nombre.length < 2 || nombre.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || correo.length > 254 || !/^[0-9]{5,20}$/.test(documento) || password.length < 12 || password.length > 128 || !roles.includes(rol)) {
        return responder(400, { error: "Revisa nombre, correo, documento, rol y contraseña temporal de 12 a 128 caracteres" });
      }
      const existente = await admin.from("perfiles").select("id").eq("correo", correo).maybeSingle();
      if (existente.error) return responder(500, { error: "No se pudo verificar el correo" });
      if (existente.data) return responder(409, { error: "Ese correo ya tiene un perfil registrado" });
      // Crear cuenta confirmada; no enviar invitaciones ni correos desde esta función.
      const creada = await admin.auth.admin.createUser({ email: correo, password, email_confirm: true });
      if (creada.error || !creada.data.user) return responder(400, { error: "No se pudo crear la cuenta. El correo podría estar registrado o la contraseña no cumplir los requisitos" });
      const cuenta = creada.data.user.id;
      const alta = await rpc("crear", { nombre, correo, documento, rol, auth_user_id: cuenta });
      if (alta.error) {
        const deshacer = await admin.auth.admin.deleteUser(cuenta);
        if (deshacer.error) return responder(500, { error: "No se completó el alta. Quedó una cuenta sin perfil: pide al desarrollador revisar Authentication antes de reintentar" });
        return falloBase(alta.error);
      }
      return responder(200, { ok: true, mensaje: "Personal creado. Deberá cambiar su contraseña temporal al ingresar" });
    }
    const id = typeof datos.id === "string" ? datos.id : "";
    if (!uuid.test(id)) return responder(400, { error: "Identificador inválido" });
    if (accion === "cambiar_rol") {
      if (typeof datos.rol !== "string" || !roles.includes(datos.rol)) return responder(400, { error: "Rol inválido" });
      const r = await rpc("cambiar_rol", { id, rol: datos.rol });
      return r.error ? falloBase(r.error) : responder(200, { ok: true, mensaje: "Rol actualizado. El usuario verá el menú actualizado al recargar o regresar a la ventana" });
    }
    if (accion === "eliminar") {
      // La confirmación escrita se exige también en el servidor.
      if (typeof datos.confirmacion !== "string") return responder(400, { error: "Falta confirmar el correo de la persona" });
      const ficha = await admin.from("perfiles").select("correo").eq("id", id).maybeSingle();
      if (ficha.error) return responder(500, { error: "No se pudo verificar la persona" });
      if (ficha.data && datos.confirmacion.trim().toLowerCase() !== ficha.data.correo) return responder(400, { error: "El correo de confirmación no coincide" });
      const inicio = await rpc("preparar_eliminacion", { id });
      if (inicio.error) return falloBase(inicio.error);
      if (inicio.data?.eliminado) return responder(200, { ok: true, mensaje: "La cuenta ya fue eliminada" });
      const cuenta = inicio.data?.auth_user_id as string | null;
      if (cuenta) {
        const borrada = await admin.auth.admin.deleteUser(cuenta);
        if (borrada.error && borrada.error.status !== 404 && borrada.error.code !== "user_not_found") {
          return responder(409, { error: "La cuenta quedó bloqueada con eliminación pendiente. Actualiza la lista y pulsa Reintentar eliminación; no se ha completado el borrado" });
        }
      }
      const fin = await rpc("finalizar_eliminacion", { id });
      if (fin.error) return responder(409, { error: "La cuenta de acceso fue eliminada, pero falta retirar su ficha. Actualiza y pulsa Reintentar eliminación" });
      return responder(200, { ok: true, mensaje: "Cuenta y ficha de personal eliminadas. Se conservó el historial de sus actuaciones" });
    }
    return responder(400, { error: "Acción inválida" });
  } catch {
    return responder(500, { error: "No se pudo completar la solicitud. Actualiza la lista antes de reintentar" });
  }
});
