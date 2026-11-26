export const escalaAdmision = {
  verde: ["Recomendado para admisión", "Cumple los criterios revisados. Pendiente de la decisión final."],
  amarillo: ["En observación", "Requiere revisión adicional."],
  azul: ["Seguimiento", "Requiere monitoreo y revisión de su progreso."],
  morado: ["PIAR", "Revisar los apoyos y ajustes razonables que podría necesitar."],
  rojo: ["Posible no admisión", "Caso pendiente de evaluación y decisión final."],
} as const;

export type Clasificacion = keyof typeof escalaAdmision;
