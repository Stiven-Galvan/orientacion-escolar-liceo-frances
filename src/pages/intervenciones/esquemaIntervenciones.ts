export const ESQUEMAS_INTERVENCIONES = {
 "individual": {
  "titulo": "Intervención individual",
  "subtitulo": "Acompañamiento educativo al estudiante y acuerdos de la sesión.",
  "secciones": [
   "Datos de la atención",
   "Motivo y propósito",
   "Desarrollo de la intervención",
   "Respuesta y avances del estudiante",
   "Acuerdos y apoyos",
   "Seguimiento y constancia"
  ],
  "campos": [
   {
    "clave": "fecha",
    "etiqueta": "Fecha de atención",
    "tipo": "date",
    "maximo": 10,
    "requerido": true,
    "seccion": 1
   },
   {
    "clave": "inicio",
    "etiqueta": "Hora de inicio",
    "tipo": "time",
    "maximo": 5,
    "requerido": true,
    "seccion": 1
   },
   {
    "clave": "cierre",
    "etiqueta": "Hora de cierre",
    "tipo": "time",
    "maximo": 5,
    "requerido": true,
    "seccion": 1
   },
   {
    "clave": "sesion",
    "etiqueta": "Sesión n.º",
    "tipo": "number",
    "maximo": 5,
    "requerido": true,
    "seccion": 1
   },
   {
    "clave": "lugar",
    "etiqueta": "Lugar",
    "tipo": "text",
    "maximo": 180,
    "requerido": true,
    "seccion": 1
   },
   {
    "clave": "origen",
    "etiqueta": "Origen",
    "tipo": "multiple",
    "maximo": 6000,
    "requerido": false,
    "seccion": 1,
    "opciones": [
     "Solicitud propia",
     "Docente",
     "Familia",
     "Seguimiento",
     "Otro"
    ]
   },
   {
    "clave": "origen_otro",
    "etiqueta": "Otro origen",
    "tipo": "text",
    "maximo": 400,
    "requerido": false,
    "seccion": 1,
    "condicion": [
     "origen",
     "Otro"
    ]
   },
   {
    "clave": "motivo",
    "etiqueta": "Situación que motiva la atención y objetivo de esta sesión",
    "tipo": "area",
    "maximo": 6000,
    "requerido": true,
    "seccion": 2
   },
   {
    "clave": "estrategias",
    "etiqueta": "Estrategias utilizadas",
    "tipo": "multiple",
    "maximo": 6000,
    "requerido": false,
    "seccion": 3,
    "opciones": [
     "Escucha y diálogo",
     "Orientación",
     "Actividad reflexiva",
     "Habilidades socioemocionales",
     "Hábitos de estudio",
     "Resolución de conflictos",
     "Otra"
    ]
   },
   {
    "clave": "estrategia_otra",
    "etiqueta": "Otra estrategia",
    "tipo": "text",
    "maximo": 400,
    "requerido": false,
    "seccion": 3,
    "condicion": [
     "estrategias",
     "Otra"
    ]
   },
   {
    "clave": "desarrollo",
    "etiqueta": "Aspectos abordados y estrategias utilizadas",
    "tipo": "area",
    "maximo": 16000,
    "requerido": true,
    "seccion": 3
   },
   {
    "clave": "respuesta",
    "etiqueta": "Participación, recursos identificados y cambios observados o expresados",
    "tipo": "area",
    "maximo": 8000,
    "requerido": false,
    "seccion": 4
   },
   {
    "clave": "apoyos",
    "etiqueta": "Apoyo o remisión requerida y gestión realizada",
    "tipo": "area",
    "maximo": 4000,
    "requerido": false,
    "seccion": 5
   },
   {
    "clave": "participante_nombre",
    "etiqueta": "Nombre del participante o acudiente",
    "tipo": "text",
    "maximo": 180,
    "requerido": false,
    "seccion": 6
   },
   {
    "clave": "seguimiento_resultado",
    "etiqueta": "Resultado del seguimiento",
    "tipo": "area",
    "maximo": 8000,
    "requerido": false,
    "seccion": 6
   },
   {
    "clave": "revision_fecha",
    "etiqueta": "Próxima revisión",
    "tipo": "date",
    "maximo": 10,
    "requerido": false,
    "seccion": 6
   },
   {
    "clave": "revision_responsable",
    "etiqueta": "Responsable de revisión",
    "tipo": "text",
    "maximo": 180,
    "requerido": false,
    "seccion": 6
   },
   {
    "clave": "estado",
    "etiqueta": "Estado",
    "tipo": "select",
    "maximo": 30,
    "requerido": true,
    "seccion": 6,
    "opciones": [
     "En seguimiento",
     "Cerrado",
     "Remitido"
    ]
   },
   {
    "clave": "destino",
    "etiqueta": "Destino de la remisión",
    "tipo": "text",
    "maximo": 400,
    "requerido": false,
    "seccion": 6,
    "condicion": [
     "estado",
     "Remitido"
    ]
   },
   {
    "clave": "motivo_no_firma",
    "etiqueta": "Motivo si no se obtiene alguna firma",
    "tipo": "area",
    "maximo": 2000,
    "requerido": false,
    "seccion": 6
   }
  ],
  "nota": "Este registro corresponde a orientación escolar; no constituye un diagnóstico clínico."
 },
 "familiar": {
  "titulo": "Intervención familiar",
  "subtitulo": "Encuentro con la familia para acordar apoyos al proceso escolar.",
  "secciones": [
   "Datos del encuentro",
   "Participantes",
   "Motivo y objetivo",
   "Desarrollo del encuentro",
   "Acuerdos entre la familia y el colegio",
   "Seguimiento y constancia"
  ],
  "campos": [
   {
    "clave": "fecha",
    "etiqueta": "Fecha de atención",
    "tipo": "date",
    "maximo": 10,
    "requerido": true,
    "seccion": 1
   },
   {
    "clave": "inicio",
    "etiqueta": "Hora de inicio",
    "tipo": "time",
    "maximo": 5,
    "requerido": true,
    "seccion": 1
   },
   {
    "clave": "cierre",
    "etiqueta": "Hora de cierre",
    "tipo": "time",
    "maximo": 5,
    "requerido": true,
    "seccion": 1
   },
   {
    "clave": "sesion",
    "etiqueta": "Sesión n.º",
    "tipo": "number",
    "maximo": 5,
    "requerido": true,
    "seccion": 1
   },
   {
    "clave": "lugar",
    "etiqueta": "Lugar",
    "tipo": "text",
    "maximo": 180,
    "requerido": true,
    "seccion": 1
   },
   {
    "clave": "modalidad",
    "etiqueta": "Modalidad",
    "tipo": "select",
    "maximo": 30,
    "requerido": true,
    "seccion": 1,
    "opciones": [
     "Presencial",
     "Virtual",
     "Telefónica"
    ]
   },
   {
    "clave": "contacto",
    "etiqueta": "Contacto",
    "tipo": "text",
    "maximo": 180,
    "requerido": false,
    "seccion": 1
   },
   {
    "clave": "motivo",
    "etiqueta": "Situación abordada y propósito del encuentro",
    "tipo": "area",
    "maximo": 6000,
    "requerido": true,
    "seccion": 3
   },
   {
    "clave": "temas",
    "etiqueta": "Temas abordados",
    "tipo": "multiple",
    "maximo": 6000,
    "requerido": false,
    "seccion": 4,
    "opciones": [
     "Comunicación",
     "Acompañamiento académico",
     "Convivencia",
     "Rutinas y límites",
     "Apoyo socioemocional",
     "Relación familia y colegio",
     "Otro"
    ]
   },
   {
    "clave": "tema_otro",
    "etiqueta": "Otro tema",
    "tipo": "text",
    "maximo": 400,
    "requerido": false,
    "seccion": 4,
    "condicion": [
     "temas",
     "Otro"
    ]
   },
   {
    "clave": "desarrollo",
    "etiqueta": "Perspectiva de la familia, orientaciones brindadas y recursos de apoyo identificados",
    "tipo": "area",
    "maximo": 16000,
    "requerido": true,
    "seccion": 4
   },
   {
    "clave": "apoyos",
    "etiqueta": "Apoyos o gestiones pendientes",
    "tipo": "area",
    "maximo": 4000,
    "requerido": false,
    "seccion": 5
   },
   {
    "clave": "seguimiento_resultado",
    "etiqueta": "Resultado del seguimiento",
    "tipo": "area",
    "maximo": 8000,
    "requerido": false,
    "seccion": 6
   },
   {
    "clave": "revision_fecha",
    "etiqueta": "Próxima revisión",
    "tipo": "date",
    "maximo": 10,
    "requerido": false,
    "seccion": 6
   },
   {
    "clave": "revision_responsable",
    "etiqueta": "Responsable de revisión",
    "tipo": "text",
    "maximo": 180,
    "requerido": false,
    "seccion": 6
   },
   {
    "clave": "estado",
    "etiqueta": "Estado",
    "tipo": "select",
    "maximo": 30,
    "requerido": true,
    "seccion": 6,
    "opciones": [
     "En seguimiento",
     "Cerrado",
     "Remitido"
    ]
   },
   {
    "clave": "destino",
    "etiqueta": "Destino de la remisión",
    "tipo": "text",
    "maximo": 400,
    "requerido": false,
    "seccion": 6,
    "condicion": [
     "estado",
     "Remitido"
    ]
   },
   {
    "clave": "motivo_no_firma",
    "etiqueta": "Motivo si no se obtiene alguna firma",
    "tipo": "area",
    "maximo": 2000,
    "requerido": false,
    "seccion": 6
   }
  ],
  "nota": "Registrar hechos y acuerdos pertinentes. Compartir solo la información necesaria para el acompañamiento."
 },
 "grupal": {
  "titulo": "Intervención grupal",
  "subtitulo": "Trabajo con docentes y coordinadores para construir acciones de acompañamiento escolar.",
  "secciones": [
   "Datos del encuentro",
   "Participantes",
   "Necesidad y objetivo del encuentro",
   "Trabajo realizado",
   "Acuerdos del equipo",
   "Seguimiento y constancia"
  ],
  "campos": [
   {
    "clave": "fecha",
    "etiqueta": "Fecha de atención",
    "tipo": "date",
    "maximo": 10,
    "requerido": true,
    "seccion": 1
   },
   {
    "clave": "inicio",
    "etiqueta": "Hora de inicio",
    "tipo": "time",
    "maximo": 5,
    "requerido": true,
    "seccion": 1
   },
   {
    "clave": "cierre",
    "etiqueta": "Hora de cierre",
    "tipo": "time",
    "maximo": 5,
    "requerido": true,
    "seccion": 1
   },
   {
    "clave": "sesion",
    "etiqueta": "Sesión n.º",
    "tipo": "number",
    "maximo": 5,
    "requerido": true,
    "seccion": 1
   },
   {
    "clave": "lugar",
    "etiqueta": "Lugar",
    "tipo": "text",
    "maximo": 180,
    "requerido": true,
    "seccion": 1
   },
   {
    "clave": "equipo",
    "etiqueta": "Equipo o cursos vinculados",
    "tipo": "text",
    "maximo": 400,
    "requerido": true,
    "seccion": 1
   },
   {
    "clave": "tipo_encuentro",
    "etiqueta": "Tipo de encuentro",
    "tipo": "select",
    "maximo": 40,
    "requerido": true,
    "seccion": 1,
    "opciones": [
     "Taller",
     "Asesoría grupal",
     "Reunión de seguimiento",
     "Otro"
    ]
   },
   {
    "clave": "tipo_otro",
    "etiqueta": "Otro tipo de encuentro",
    "tipo": "text",
    "maximo": 400,
    "requerido": false,
    "seccion": 1,
    "condicion": [
     "tipo_encuentro",
     "Otro"
    ]
   },
   {
    "clave": "motivo",
    "etiqueta": "Necesidad y objetivo del encuentro",
    "tipo": "area",
    "maximo": 6000,
    "requerido": true,
    "seccion": 3
   },
   {
    "clave": "temas",
    "etiqueta": "Temas de trabajo",
    "tipo": "multiple",
    "maximo": 6000,
    "requerido": false,
    "seccion": 4,
    "opciones": [
     "Manejo de aula",
     "Convivencia",
     "Inclusión",
     "Comunicación",
     "Bienestar del equipo",
     "Coordinación de apoyos",
     "Otro"
    ]
   },
   {
    "clave": "tema_otro",
    "etiqueta": "Otro tema",
    "tipo": "text",
    "maximo": 400,
    "requerido": false,
    "seccion": 4,
    "condicion": [
     "temas",
     "Otro"
    ]
   },
   {
    "clave": "desarrollo",
    "etiqueta": "Estrategias desarrolladas, aportes del equipo y conclusiones",
    "tipo": "area",
    "maximo": 16000,
    "requerido": true,
    "seccion": 4
   },
   {
    "clave": "seguimiento_resultado",
    "etiqueta": "Resultado del seguimiento",
    "tipo": "area",
    "maximo": 8000,
    "requerido": false,
    "seccion": 6
   },
   {
    "clave": "revision_fecha",
    "etiqueta": "Próxima revisión",
    "tipo": "date",
    "maximo": 10,
    "requerido": false,
    "seccion": 6
   },
   {
    "clave": "revision_responsable",
    "etiqueta": "Responsable de revisión",
    "tipo": "text",
    "maximo": 180,
    "requerido": false,
    "seccion": 6
   },
   {
    "clave": "estado",
    "etiqueta": "Estado",
    "tipo": "select",
    "maximo": 30,
    "requerido": true,
    "seccion": 6,
    "opciones": [
     "En seguimiento",
     "Cerrado",
     "Remitido"
    ]
   },
   {
    "clave": "destino",
    "etiqueta": "Destino de la remisión",
    "tipo": "text",
    "maximo": 400,
    "requerido": false,
    "seccion": 6,
    "condicion": [
     "estado",
     "Remitido"
    ]
   },
   {
    "clave": "motivo_no_firma",
    "etiqueta": "Motivo si no se obtiene alguna firma",
    "tipo": "area",
    "maximo": 2000,
    "requerido": false,
    "seccion": 6
   }
  ],
  "nota": "En encuentros grupales, usar referencias generales y evitar detalles sensibles de casos individuales."
 },
 "aula": {
  "titulo": "Intervención en aula",
  "subtitulo": "Acompañamiento a un estudiante dentro de su salón durante las actividades habituales.",
  "secciones": [
   "Datos del estudiante y de la atención",
   "Necesidad y objetivo",
   "Intervención realizada en el aula",
   "Respuesta del estudiante y resultados",
   "Acuerdos para continuar el apoyo",
   "Seguimiento y constancia"
  ],
  "campos": [
   {
    "clave": "fecha",
    "etiqueta": "Fecha de atención",
    "tipo": "date",
    "maximo": 10,
    "requerido": true,
    "seccion": 1
   },
   {
    "clave": "inicio",
    "etiqueta": "Hora de inicio",
    "tipo": "time",
    "maximo": 5,
    "requerido": true,
    "seccion": 1
   },
   {
    "clave": "cierre",
    "etiqueta": "Hora de cierre",
    "tipo": "time",
    "maximo": 5,
    "requerido": true,
    "seccion": 1
   },
   {
    "clave": "sesion",
    "etiqueta": "Sesión n.º",
    "tipo": "number",
    "maximo": 5,
    "requerido": true,
    "seccion": 1
   },
   {
    "clave": "lugar",
    "etiqueta": "Lugar",
    "tipo": "text",
    "maximo": 180,
    "requerido": true,
    "seccion": 1
   },
   {
    "clave": "docente",
    "etiqueta": "Docente presente",
    "tipo": "text",
    "maximo": 180,
    "requerido": true,
    "seccion": 1
   },
   {
    "clave": "necesidades",
    "etiqueta": "Necesidades identificadas",
    "tipo": "multiple",
    "maximo": 6000,
    "requerido": false,
    "seccion": 2,
    "opciones": [
     "Atención y participación",
     "Seguimiento de instrucciones",
     "Interacción con compañeros",
     "Regulación emocional",
     "Organización de tareas",
     "Otro"
    ]
   },
   {
    "clave": "necesidad_otra",
    "etiqueta": "Otra necesidad",
    "tipo": "text",
    "maximo": 400,
    "requerido": false,
    "seccion": 2,
    "condicion": [
     "necesidades",
     "Otro"
    ]
   },
   {
    "clave": "motivo",
    "etiqueta": "Necesidad del estudiante y objetivo concreto de la intervención",
    "tipo": "area",
    "maximo": 6000,
    "requerido": true,
    "seccion": 2
   },
   {
    "clave": "contexto",
    "etiqueta": "Actividad de clase y contexto",
    "tipo": "area",
    "maximo": 4000,
    "requerido": true,
    "seccion": 3
   },
   {
    "clave": "estrategias",
    "etiqueta": "Estrategias de apoyo",
    "tipo": "multiple",
    "maximo": 6000,
    "requerido": false,
    "seccion": 3,
    "opciones": [
     "Apoyo en tarea",
     "Modelado",
     "Mediación",
     "Ajuste del entorno",
     "Otra"
    ]
   },
   {
    "clave": "estrategia_otra",
    "etiqueta": "Otra estrategia",
    "tipo": "text",
    "maximo": 400,
    "requerido": false,
    "seccion": 3,
    "condicion": [
     "estrategias",
     "Otra"
    ]
   },
   {
    "clave": "desarrollo",
    "etiqueta": "Acciones del orientador y apoyos coordinados con el docente",
    "tipo": "area",
    "maximo": 16000,
    "requerido": true,
    "seccion": 3
   },
   {
    "clave": "respuesta",
    "etiqueta": "Conducta inicial, respuesta a los apoyos y avances o dificultades observadas",
    "tipo": "area",
    "maximo": 8000,
    "requerido": false,
    "seccion": 4
   },
   {
    "clave": "avance_verificar",
    "etiqueta": "Avance del estudiante que se verificará",
    "tipo": "area",
    "maximo": 2000,
    "requerido": false,
    "seccion": 6
   },
   {
    "clave": "seguimiento_resultado",
    "etiqueta": "Resultado del seguimiento",
    "tipo": "area",
    "maximo": 8000,
    "requerido": false,
    "seccion": 6
   },
   {
    "clave": "revision_fecha",
    "etiqueta": "Próxima revisión",
    "tipo": "date",
    "maximo": 10,
    "requerido": false,
    "seccion": 6
   },
   {
    "clave": "revision_responsable",
    "etiqueta": "Responsable de revisión",
    "tipo": "text",
    "maximo": 180,
    "requerido": false,
    "seccion": 6
   },
   {
    "clave": "estado",
    "etiqueta": "Estado",
    "tipo": "select",
    "maximo": 30,
    "requerido": true,
    "seccion": 6,
    "opciones": [
     "En seguimiento",
     "Cerrado",
     "Remitido"
    ]
   },
   {
    "clave": "destino",
    "etiqueta": "Destino de la remisión",
    "tipo": "text",
    "maximo": 400,
    "requerido": false,
    "seccion": 6,
    "condicion": [
     "estado",
     "Remitido"
    ]
   },
   {
    "clave": "motivo_no_firma",
    "etiqueta": "Motivo si no se obtiene alguna firma",
    "tipo": "area",
    "maximo": 2000,
    "requerido": false,
    "seccion": 6
   }
  ],
  "nota": "Registrar hechos concretos y brindar los apoyos sin exponer al estudiante ante el grupo."
 }
} as const;
