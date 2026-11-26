export const CAMPOS_PAP = [
  {
    "seccion": "Datos del estudiante",
    "clave": "edad",
    "etiqueta": "Edad",
    "tipo": "numero",
    "requerido": false,
    "maximo": 3
  },
  {
    "seccion": "Datos del estudiante",
    "clave": "identificador",
    "etiqueta": "Identificador escolar",
    "tipo": "texto",
    "requerido": false,
    "maximo": 100
  },
  {
    "seccion": "Datos del estudiante",
    "clave": "acudiente",
    "etiqueta": "Acudiente",
    "tipo": "texto",
    "requerido": false,
    "maximo": 180
  },
  {
    "seccion": "Datos del estudiante",
    "clave": "parentesco",
    "etiqueta": "Parentesco",
    "tipo": "texto",
    "requerido": false,
    "maximo": 100
  },
  {
    "seccion": "Datos del estudiante",
    "clave": "telefono",
    "etiqueta": "Teléfono del acudiente",
    "tipo": "texto",
    "requerido": false,
    "maximo": 100
  },
  {
    "seccion": "Datos del estudiante",
    "clave": "origen",
    "etiqueta": "Origen de la atención",
    "tipo": "multiple",
    "requerido": false,
    "maximo": 2000,
    "opciones": [
      "Solicitud del estudiante",
      "Docente",
      "Coordinación",
      "Familia",
      "Observación directa",
      "Otro"
    ]
  },
  {
    "seccion": "Datos del estudiante",
    "clave": "origen_otro",
    "etiqueta": "Otro origen",
    "tipo": "texto",
    "requerido": false,
    "maximo": 250
  },
  {
    "seccion": "Datos del estudiante",
    "clave": "remitente",
    "etiqueta": "Remitente",
    "tipo": "texto",
    "requerido": false,
    "maximo": 180
  },
  {
    "seccion": "Acercamiento y participación",
    "clave": "proposito",
    "etiqueta": "Se explicó el propósito de la ayuda y los límites de la confidencialidad",
    "tipo": "opcion",
    "requerido": false,
    "maximo": 2000,
    "opciones": [
      "Sí",
      "No"
    ]
  },
  {
    "seccion": "Acercamiento y participación",
    "clave": "aceptacion",
    "etiqueta": "El estudiante acepta el acompañamiento",
    "tipo": "opcion",
    "requerido": false,
    "maximo": 2000,
    "opciones": [
      "Sí",
      "No",
      "No puede expresarlo en este momento"
    ]
  },
  {
    "seccion": "Acercamiento y participación",
    "clave": "comunicacion",
    "etiqueta": "Ajustes de comunicación o apoyo requeridos",
    "tipo": "area",
    "requerido": false,
    "maximo": 2000
  },
  {
    "seccion": "Acercamiento y participación",
    "clave": "proteccion",
    "etiqueta": "Si no acepta o no puede responder, situación y medidas de protección adoptadas",
    "tipo": "area",
    "requerido": false,
    "maximo": 2000
  },
  {
    "seccion": "Situación que motivó la atención",
    "clave": "hecho",
    "etiqueta": "Descripción del hecho y fuente de la información",
    "tipo": "area",
    "requerido": true,
    "maximo": 4000
  },
  {
    "seccion": "Situación que motivó la atención",
    "clave": "expresa",
    "etiqueta": "Qué expresa el estudiante y qué necesita en este momento",
    "tipo": "area",
    "requerido": false,
    "maximo": 4000
  },
  {
    "seccion": "Seguridad y necesidades",
    "clave": "seguridad",
    "etiqueta": "Seguridad observada",
    "tipo": "opcion",
    "requerido": false,
    "maximo": 2000,
    "opciones": [
      "Adecuada",
      "Requiere traslado a un lugar seguro",
      "Peligro actual"
    ]
  },
  {
    "seccion": "Seguridad y necesidades",
    "clave": "necesidades",
    "etiqueta": "Necesidades inmediatas",
    "tipo": "multiple",
    "requerido": false,
    "maximo": 2000,
    "opciones": [
      "Agua",
      "Descanso",
      "Acompañamiento",
      "Atención médica",
      "Contacto con persona de confianza",
      "Otra"
    ]
  },
  {
    "seccion": "Seguridad y necesidades",
    "clave": "necesidades_otra",
    "etiqueta": "Otra necesidad",
    "tipo": "area",
    "requerido": false,
    "maximo": 2000
  },
  {
    "seccion": "Seguridad y necesidades",
    "clave": "manifestaciones",
    "etiqueta": "Manifestaciones observadas o referidas",
    "tipo": "multiple",
    "requerido": false,
    "maximo": 2000,
    "opciones": [
      "Llanto",
      "Temor",
      "Agitación",
      "Silencio o retraimiento",
      "Dificultad para concentrarse",
      "Confusión",
      "Malestar físico",
      "Otra"
    ]
  },
  {
    "seccion": "Seguridad y necesidades",
    "clave": "manifestaciones_otra",
    "etiqueta": "Otra manifestación",
    "tipo": "area",
    "requerido": false,
    "maximo": 2000
  },
  {
    "seccion": "Seguridad y necesidades",
    "clave": "observado",
    "etiqueta": "Descripción de lo observado y referido sin interpretaciones diagnósticas",
    "tipo": "area",
    "requerido": false,
    "maximo": 4000
  },
  {
    "seccion": "Seguridad y necesidades",
    "clave": "alertas",
    "etiqueta": "Alertas identificadas o sospechadas",
    "tipo": "multiple",
    "requerido": false,
    "maximo": 2000,
    "opciones": [
      "Ninguna identificada al momento",
      "No se logra establecer",
      "Urgencia médica",
      "Autolesión o posible riesgo suicida",
      "Amenaza de daño a otras personas",
      "Posible violencia o vulneración de derechos",
      "Otra"
    ]
  },
  {
    "seccion": "Seguridad y necesidades",
    "clave": "alerta_otra",
    "etiqueta": "Otra alerta",
    "tipo": "area",
    "requerido": false,
    "maximo": 2000
  },
  {
    "seccion": "Seguridad y necesidades",
    "clave": "medidas",
    "etiqueta": "Alerta concreta y medidas inmediatas tomadas",
    "tipo": "area",
    "requerido": false,
    "maximo": 4000
  },
  {
    "seccion": "Escucha y apoyo brindado",
    "clave": "acciones",
    "etiqueta": "Acciones realizadas",
    "tipo": "multiple",
    "requerido": false,
    "maximo": 2000,
    "opciones": [
      "Presentación y explicación de la ayuda",
      "Escucha sin presionar",
      "Validación de emociones",
      "Acompañamiento en espacio tranquilo",
      "Apoyo práctico",
      "Orientación para recuperar la calma según tolerancia",
      "Información clara sobre próximos pasos",
      "Otra"
    ]
  },
  {
    "seccion": "Escucha y apoyo brindado",
    "clave": "accion_otra",
    "etiqueta": "Otra acción",
    "tipo": "area",
    "requerido": false,
    "maximo": 2000
  },
  {
    "seccion": "Escucha y apoyo brindado",
    "clave": "ayuda",
    "etiqueta": "Descripción de la ayuda brindada y respuesta del estudiante",
    "tipo": "area",
    "requerido": true,
    "maximo": 4000
  },
  {
    "seccion": "Conexión con apoyos",
    "clave": "confianza",
    "etiqueta": "Persona de confianza identificada",
    "tipo": "texto",
    "requerido": false,
    "maximo": 180
  },
  {
    "seccion": "Conexión con apoyos",
    "clave": "confianza_vinculo",
    "etiqueta": "Vínculo de la persona de confianza",
    "tipo": "texto",
    "requerido": false,
    "maximo": 100
  },
  {
    "seccion": "Conexión con apoyos",
    "clave": "apoyos",
    "etiqueta": "Apoyos disponibles",
    "tipo": "multiple",
    "requerido": false,
    "maximo": 2000,
    "opciones": [
      "Familia",
      "Orientación",
      "Docente",
      "Salud",
      "Protección",
      "Otro"
    ]
  },
  {
    "seccion": "Conexión con apoyos",
    "clave": "apoyos_otro",
    "etiqueta": "Otro apoyo",
    "tipo": "area",
    "requerido": false,
    "maximo": 2000
  },
  {
    "seccion": "Conexión con apoyos",
    "clave": "pendientes",
    "etiqueta": "Necesidades pendientes y apoyos que se gestionan",
    "tipo": "area",
    "requerido": false,
    "maximo": 4000
  },
  {
    "seccion": "Comunicación y activación de rutas",
    "clave": "contacto_estado",
    "etiqueta": "Contacto con acudiente o adulto seguro",
    "tipo": "opcion",
    "requerido": false,
    "maximo": 2000,
    "opciones": [
      "Logrado",
      "Sin respuesta",
      "Pendiente",
      "No procede por razones de protección"
    ]
  },
  {
    "seccion": "Comunicación y activación de rutas",
    "clave": "contacto_motivo",
    "etiqueta": "Motivo del estado del contacto",
    "tipo": "area",
    "requerido": false,
    "maximo": 2000
  },
  {
    "seccion": "Comunicación y activación de rutas",
    "clave": "contacto_persona",
    "etiqueta": "Persona contactada",
    "tipo": "texto",
    "requerido": false,
    "maximo": 180
  },
  {
    "seccion": "Comunicación y activación de rutas",
    "clave": "contacto_vinculo",
    "etiqueta": "Vínculo de la persona contactada",
    "tipo": "texto",
    "requerido": false,
    "maximo": 100
  },
  {
    "seccion": "Comunicación y activación de rutas",
    "clave": "contacto_telefono",
    "etiqueta": "Teléfono de la persona contactada",
    "tipo": "texto",
    "requerido": false,
    "maximo": 100
  },
  {
    "seccion": "Comunicación y activación de rutas",
    "clave": "contacto_medio",
    "etiqueta": "Medio utilizado",
    "tipo": "texto",
    "requerido": false,
    "maximo": 250
  },
  {
    "seccion": "Comunicación y activación de rutas",
    "clave": "contacto_info",
    "etiqueta": "Información relevante comunicada y respuesta recibida",
    "tipo": "area",
    "requerido": false,
    "maximo": 4000
  },
  {
    "seccion": "Comunicación y activación de rutas",
    "clave": "destino",
    "etiqueta": "Destino de la ruta",
    "tipo": "opcion",
    "requerido": false,
    "maximo": 2000,
    "opciones": [
      "Orientación",
      "Servicio de salud",
      "Emergencias",
      "Protección",
      "No requiere remisión"
    ]
  },
  {
    "seccion": "Comunicación y activación de rutas",
    "clave": "receptora",
    "etiqueta": "Entidad o persona receptora",
    "tipo": "texto",
    "requerido": false,
    "maximo": 250
  },
  {
    "seccion": "Comunicación y activación de rutas",
    "clave": "recepcion",
    "etiqueta": "Entrega o recepción confirmada",
    "tipo": "opcion",
    "requerido": false,
    "maximo": 2000,
    "opciones": [
      "Sí",
      "No",
      "Pendiente"
    ]
  },
  {
    "seccion": "Comunicación y activación de rutas",
    "clave": "continuidad",
    "etiqueta": "Si no se logra contacto o recepción, acción de continuidad",
    "tipo": "area",
    "requerido": false,
    "maximo": 4000
  },
  {
    "seccion": "Cierre y acuerdos",
    "clave": "estado_final",
    "etiqueta": "Estado al finalizar",
    "tipo": "opcion",
    "requerido": false,
    "maximo": 2000,
    "opciones": [
      "Menor malestar referido u observado",
      "Malestar persiste",
      "Empeora",
      "No se puede determinar"
    ]
  },
  {
    "seccion": "Cierre y acuerdos",
    "clave": "estado_descripcion",
    "etiqueta": "Descripción del estado al finalizar",
    "tipo": "area",
    "requerido": false,
    "maximo": 2000
  },
  {
    "seccion": "Cierre y acuerdos",
    "clave": "disposicion",
    "etiqueta": "Disposición",
    "tipo": "opcion",
    "requerido": false,
    "maximo": 2000,
    "opciones": [
      "Retoma actividades con apoyo",
      "Permanece acompañado en el colegio",
      "Entrega a adulto seguro",
      "Traslado a servicio",
      "Otra"
    ]
  },
  {
    "seccion": "Cierre y acuerdos",
    "clave": "disposicion_otra",
    "etiqueta": "Otra disposición",
    "tipo": "area",
    "requerido": false,
    "maximo": 2000
  },
  {
    "seccion": "Cierre y acuerdos",
    "clave": "recibe",
    "etiqueta": "Persona que recibe o acompaña",
    "tipo": "texto",
    "requerido": false,
    "maximo": 180
  },
  {
    "seccion": "Cierre y acuerdos",
    "clave": "acuerdos",
    "etiqueta": "Acuerdos concretos con el estudiante y la red de apoyo",
    "tipo": "area",
    "requerido": false,
    "maximo": 4000
  },
  {
    "seccion": "Plan de seguimiento",
    "clave": "proximo_contacto",
    "etiqueta": "Plan para el próximo contacto",
    "tipo": "area",
    "requerido": false,
    "maximo": 2000
  },
  {
    "seccion": "Plan de seguimiento",
    "clave": "plan_medio",
    "etiqueta": "Medio de contacto previsto",
    "tipo": "texto",
    "requerido": false,
    "maximo": 250
  },
  {
    "seccion": "Plan de seguimiento",
    "clave": "verificar",
    "etiqueta": "Aspecto a verificar",
    "tipo": "area",
    "requerido": false,
    "maximo": 2000
  },
  {
    "seccion": "Plan de seguimiento",
    "clave": "proceso",
    "etiqueta": "Estado del proceso",
    "tipo": "opcion",
    "requerido": true,
    "maximo": 2000,
    "opciones": [
      "Seguimiento activo",
      "Remitido con recepción confirmada",
      "Cierre PAP"
    ]
  },
  {
    "seccion": "Plan de seguimiento",
    "clave": "justificacion",
    "etiqueta": "Justificación y apoyos que continúan",
    "tipo": "area",
    "requerido": true,
    "maximo": 4000
  }
] as const;
