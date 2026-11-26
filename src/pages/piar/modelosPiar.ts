import esquema from './esquemaPiar';
export const CAMPOS_PIAR=esquema.campos;
export const MATERIAS_PIAR=esquema.materias;
export type FirmaPiar={nombre:string;documento:string;cargo:string;imagen:string;aceptacion:boolean;fecha:string};
export type Convocado={docente_id:string;nombre:string;periodo:number;enviado:boolean;activo:boolean};
export type AportePiar={id:string;docente_perfil_id:string;docente_nombre:string;periodo:number;asignaturas:string[];datos:Record<string,{objetivos:string;barreras:string;ajustes:string;evaluacion:string}>;firma:FirmaPiar;enviado_en:string;enviado_nombre:string};
export type DocumentoPiar={proceso:Record<string,unknown>;estudiante:Record<string,string>;campos:Record<string,string>;firmas:Record<string,FirmaPiar>;materias:string[];aportes:AportePiar[];completo:boolean};
export type DetallePiar={id:string;estudiante_id:string;estudiante_nombre:string;anio_lectivo:number;periodo_activo:number;orientacion_enviado:boolean;publicada:Record<string,unknown>|null;version:number;version_orientacion:number;campos:Record<string,string>;firmas:Record<string,FirmaPiar>;materias:string[];convocados:Convocado[];aportes:AportePiar[];faltantes:string[];completo:boolean;eventos:{id:number;texto:string;fecha:string;actor_nombre:string}[];estudiante:Record<string,string>};

export const firmaVacia=(nombre='',cargo=''):FirmaPiar=>({nombre,documento:'',cargo,imagen:'',aceptacion:false,fecha:''});
