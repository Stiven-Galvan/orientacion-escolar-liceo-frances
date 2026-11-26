export const nombresRol = {
  desarrollador: "Desarrollador",
  superadministrador: "Superadministrador",
  orientador: "Orientador",
  coordinacion_academica: "Coordinación académica",
  coordinacion_convivencial: "Coordinación convivencial",
  docente: "Docente",
} as const;

export type Rol = keyof typeof nombresRol;
export type Perfil = {
  id: string;
  auth_user_id: string;
  nombre: string;
  correo: string;
  rol: Rol;
  activo: boolean;
  requiere_cambio_password: boolean;
};

// El menú sigue el rol de la vista. La base de datos autoriza con el perfil real.
export const modulosPorRol: Record<Rol, readonly string[]> = {
  desarrollador: ["inicio", "administracion", "personal", "cursos-docentes", "estudiantes", "admisiones", "seguimiento", "remisiones", "buzon", "agenda", "observaciones", "piar", "intervenciones", "observaciones-aula", "procesos-autonomos", "pap", "actividades", "protocolos", "analisis", "remisiones-especiales"],
  superadministrador: ["inicio", "administracion", "personal", "cursos-docentes", "estudiantes", "admisiones", "seguimiento", "remisiones", "buzon", "agenda", "observaciones", "piar", "intervenciones", "observaciones-aula", "procesos-autonomos", "pap", "actividades", "protocolos", "analisis", "remisiones-especiales"],
  orientador: ["inicio", "agenda", "buzon", "estudiantes", "admisiones", "seguimiento", "remisiones", "observaciones", "piar", "intervenciones", "observaciones-aula", "procesos-autonomos", "pap", "actividades", "protocolos", "analisis", "remisiones-especiales"],
  coordinacion_academica: ["inicio", "buzon", "seguimiento", "remisiones", "protocolos"],
  coordinacion_convivencial: ["inicio", "buzon", "seguimiento", "remisiones", "protocolos"],
  docente: ["inicio", "estudiantes", "observaciones", "piar", "remisiones", "buzon", "protocolos"],
};
