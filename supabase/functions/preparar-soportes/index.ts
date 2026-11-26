import { createClient } from "npm:@supabase/supabase-js@2.118.0";
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json", "Cache-Control": "no-store" };
const responder = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers });
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return responder(405, { error: "Método no permitido" });
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get("Authorization") ?? "")?.[1];
  if (!token) return responder(401, { error: "Inicia sesión" });
  const url = Deno.env.get("SUPABASE_URL"); const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return responder(500, { error: "Configuración del servidor no disponible" });
  try {
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return responder(401, { error: "Sesión inválida" });
    const p = await admin.from("perfiles").select("rol,activo,requiere_cambio_password").eq("auth_user_id", user.id).maybeSingle();
    if (p.error || !p.data?.activo || p.data.requiere_cambio_password || !["orientador", "superadministrador", "desarrollador"].includes(p.data.rol)) return responder(403, { error: "No tienes permiso para guardar soportes" });
    let bucket = await admin.storage.getBucket("admisiones-soportes");
    if (bucket.error && (String(bucket.error.statusCode) === "404" || /not found|does not exist/i.test(bucket.error.message))) {
      await admin.storage.createBucket("admisiones-soportes", { public: false, fileSizeLimit: 20971520, allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png"] });
      bucket = await admin.storage.getBucket("admisiones-soportes");
    }
    if (bucket.error || !bucket.data || bucket.data.public) return responder(500, { error: "No se pudo preparar el almacenamiento privado" });
    return responder(200, { ok: true });
  } catch { return responder(500, { error: "No se pudo preparar el almacenamiento privado" }); }
});
