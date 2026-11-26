import { BUCKET_ACTIVIDADES } from "../pages/actividades/modelosActividades";
import { BUCKET_AUTONOMOS } from "../pages/autonomos/modelosAutonomos";
import { BUCKET_INTERVENCIONES } from "../pages/intervenciones/modelosIntervenciones";
import { BUCKET_REMISION } from "../pages/remisiones/modelosRemision";
import { BUCKET_EVIDENCIAS } from "./evidenciasDocentes";
import { supabase } from "./supabase";
import { BUCKET_SOPORTES } from "./entrevistas";
export async function eliminarRegistro(tipo: "estudiante" | "matricula" | "curso" | "grado", confirmacion: string, id: string | null = null, anio: number | null = null, grado: string | null = null) {
  if (!supabase) throw new Error("Falta configurar Supabase");
  if (tipo === "estudiante") {
    const llamar = async (finalizar: boolean) => {
      const { data, error } = await supabase!.rpc("baja_estudiante", { p_id: id, p_confirmacion: confirmacion, p_finalizar: finalizar });
      if (error) throw error;
      return data as { eliminado?: boolean; rutas?: string[]; evidencias_rutas?: string[]; remisiones_rutas?:string[]; intervenciones_rutas?:string[]; autonomos_rutas?:string[];especiales_rutas?:string[] };
    };
    const paso = await llamar(false);
    if (paso.eliminado) return;
    for (const [bucket, rutas] of [[BUCKET_SOPORTES, paso.rutas], [BUCKET_EVIDENCIAS, paso.evidencias_rutas], [BUCKET_REMISION,paso.remisiones_rutas], [BUCKET_INTERVENCIONES,paso.intervenciones_rutas], [BUCKET_AUTONOMOS,paso.autonomos_rutas], [BUCKET_ACTIVIDADES,paso.especiales_rutas]] as const) {
      if (!rutas?.length) continue;
      for(let i=0;i<rutas.length;i+=100){
      const { error: falloArchivo } = await supabase.storage.from(bucket).remove(rutas.slice(i,i+100));
      if (falloArchivo) throw new Error("El expediente tiene una eliminación pendiente. No se pudieron retirar todos los soportes, evidencias o intervenciones; actualiza la ficha y pulsa Reintentar eliminación.");
      }
    }
    await llamar(true); return;
  }
  const { error } = await supabase.rpc("eliminar_registro_escolar", { p_tipo: tipo, p_id: id, p_anio: anio, p_grado: grado, p_confirmacion: confirmacion });
  if (error) throw error;
}
