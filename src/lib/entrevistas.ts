import { supabase } from "./supabase";
import type { Firmas } from "../pages/admisiones/components/FirmasEntrevista";
import type { Clasificacion } from "../pages/admisiones/escalaAdmision";
type VistaAdmision = "orientador" | "superadministrador";
export const BUCKET_SOPORTES = "admisiones-soportes";
export type SoporteGuardado = { name: string; type: string; size: number; ruta: string };
export type EntrevistaGuardada = {
  id: string; datos: Record<string,string>; notasPrivadas: string; condiciones: string[]; fuente: string;
  estado: "Borrador" | "Pendiente" | "Admitido" | "No admitido" | "Sin seguimiento";
  firmas: Firmas; archivado: boolean; soporteProfesional: SoporteGuardado | null; estudianteId: string | null;
  clasificacion: Clasificacion | null;
  version: number; eliminando: boolean; creadoPor: string; borradoMotivo: string | null;
};
export function convertirEntrevista(fila: Record<string, unknown>): EntrevistaGuardada {
  return { id: String(fila.id), clasificacion: (fila.clasificacion as Clasificacion | undefined) ?? null, datos: fila.datos as Record<string,string>, notasPrivadas: String(fila.notas_privadas ?? ""), condiciones: fila.condiciones as string[], fuente: String(fila.fuente ?? ""), estado: fila.estado as EntrevistaGuardada["estado"], firmas: fila.firmas as Firmas, archivado: Boolean(fila.archivado), estudianteId: fila.estudiante_id ? String(fila.estudiante_id) : null, version: Number(fila.version), eliminando: Boolean(fila.eliminando), creadoPor: String(fila.creado_por), borradoMotivo: fila.borrado_motivo ? String(fila.borrado_motivo) : null, soporteProfesional: fila.soporte_nombre ? { name: String(fila.soporte_nombre), type: String(fila.soporte_tipo), size: Number(fila.soporte_tamano), ruta: `${fila.id}/soporte` } : null };
}
export async function operarEntrevista<T = Record<string, unknown>>(accion: string, id: string, datos: Record<string, unknown> = {}, vista?: VistaAdmision): Promise<T> {
  if (!supabase) throw new Error("Falta configurar Supabase");
  const { data, error } = await supabase.rpc("entrevista_operar", { p_accion: accion, p_id: id, p_datos: vista ? { ...datos, vista } : datos });
  if (error) throw error; return data as T;
}
export async function cargarEntrevistas(estudianteId?: string, incluirClasificacion = false, vista?: VistaAdmision, autor?: string) {
  if (!supabase) throw new Error("Falta configurar Supabase");
  const filas: EntrevistaGuardada[] = [];
  for (let inicio = 0; ; inicio += 100) {
    let consulta = supabase.from("entrevistas_admision").select("*").order("creado_en", { ascending: false }).order("id", { ascending: false }).range(inicio, inicio + 99);
    consulta = estudianteId ? consulta.eq("estudiante_id", estudianteId).eq("estado", "Admitido") : consulta.neq("estado", "Admitido");
    if (vista === "orientador" && autor) consulta = consulta.eq("creado_por", autor);
    const { data, error } = await consulta;
    if (error) throw error;
    const filasPagina = data ?? [];
    const colores = new Map<string, Clasificacion>();
    if (incluirClasificacion && filasPagina.length) {
      const ids = filasPagina.map(fila => fila.id as string);
      const anexo = vista
        ? await operarEntrevista<{ entrevista_id: string; color: Clasificacion }[]>("clasificaciones_vista", ids[0], { ids }, vista)
        : await (async () => {
          const { data, error: fallo } = await supabase.from("admision_clasificaciones")
            .select("entrevista_id,color").in("entrevista_id", ids);
          if (fallo) throw fallo;
          return data;
        })();
      for (const fila of anexo ?? []) colores.set(fila.entrevista_id, fila.color as Clasificacion);
    }
    filas.push(...filasPagina.map(fila => convertirEntrevista({ ...fila, clasificacion: colores.get(fila.id) })));
    if ((data?.length ?? 0) < 100) break;
  }
  return [...new Map(filas.map(fila => [fila.id, fila])).values()];
}
export async function guardarEntrevista(id: string, datos: Record<string,string>, firmas: Firmas, notasPrivadas: string, condiciones: string[], fuente: string, sinAdicionales: boolean, archivo: File | null, clasificacion?: Clasificacion, vista?: VistaAdmision) {
  if (!supabase) throw new Error("Falta configurar Supabase");
  const tipo = archivo ? archivo.type || (/\.pdf$/i.test(archivo.name) ? "application/pdf" : /\.png$/i.test(archivo.name) ? "image/png" : "image/jpeg") : null;
  let fila = await operarEntrevista("reservar", id, { datos, firmas, notasPrivadas, condiciones, fuente, sinAdicionales, soporteNombre: archivo?.name ?? null, soporteTipo: tipo, soporteTamano: archivo?.size ?? null });
  if (fila.estado !== "Borrador") {
    if (clasificacion && fila.estado === "Pendiente") fila = await operarEntrevista("finalizar", id, { clasificacion }, vista);
    return convertirEntrevista(fila);
  }
  if (archivo) {
    const preparacion = await supabase.functions.invoke("preparar-soportes", { body: {} });
    if (preparacion.error || !preparacion.data?.ok) throw new Error("No se pudo preparar el almacenamiento. Revisa tu sesión y reintenta; el borrador se conserva.");
    const subida = await supabase.storage.from(BUCKET_SOPORTES).upload(`${id}/soporte`, archivo, { upsert: true, contentType: tipo!, cacheControl: "0" });
    if (subida.error) throw new Error(`No terminó la subida del soporte: ${subida.error.message}. El borrador se conserva.`);
  }
  fila = await operarEntrevista("finalizar", id, { clasificacion }, vista);
  return convertirEntrevista(fila);
}
export async function obtenerSoporte(archivo: SoporteGuardado) {
  if (!supabase) throw new Error("Falta configurar Supabase");
  const { data, error } = await supabase.storage.from(BUCKET_SOPORTES).download(archivo.ruta);
  if (error || !data) throw new Error("No se pudo descargar el soporte. Revisa tu sesión o contacta al superadministrador.");
  return data;
}
export async function eliminarEntrevista(item: EntrevistaGuardada, confirmacion: string) {
  if (!supabase) throw new Error("Falta configurar Supabase");
  const paso = await operarEntrevista<{ ruta?: string | null; eliminado?: boolean }>("preparar_borrado", item.id, { confirmacion });
  if (paso.eliminado) return;
  if (paso.ruta) {
    const { error } = await supabase.storage.from(BUCKET_SOPORTES).remove([paso.ruta]);
    if (error) {
      try { await operarEntrevista("finalizar_borrado", item.id, { confirmacion }); return; }
      catch { throw new Error("El borrado quedó pendiente al retirar el soporte. Actualiza el listado y reintenta la eliminación."); }
    }
  }
  await operarEntrevista("finalizar_borrado", item.id, { confirmacion });
}

export async function rechazarEntrevista(item: EntrevistaGuardada, vista?: VistaAdmision) {
  if (!supabase) throw new Error("Falta configurar Supabase");
  const paso = await operarEntrevista<{ ruta?: string | null; eliminado?: boolean }>("rechazar_preparar", item.id, { version: item.version }, vista);
  if (paso.eliminado) return;
  if (paso.ruta) {
    const { error } = await supabase.storage.from(BUCKET_SOPORTES).remove([paso.ruta]);
    if (error) {
      try { await operarEntrevista("rechazar_finalizar", item.id, {}, vista); return; }
      catch { throw new Error("El rechazo quedó registrado, pero falta retirar el soporte. Actualiza y pulsa Completar rechazo."); }
    }
  }
  await operarEntrevista("rechazar_finalizar", item.id, {}, vista);
}
