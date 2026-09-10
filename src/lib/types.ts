// =====================================================================
// Tipos compartidos del dominio
// =====================================================================

export type Rol = "alumno" | "admin";

export interface Alumno {
  id: string;
  auth_user_id: string;
  nombre: string;
  apellido: string;
  documento: string | null;
  curso: string;
  division: string;
  email: string;
  rol: Rol;
  created_at: string;
  updated_at: string;
}

export interface Taller {
  id: string;
  titulo: string;
  descripcion: string;
  profesor: string;
  aula: string;
  categoria: string;
  dia: 1 | 2 | 3;
  hora_inicio: string; // "HH:MM:SS"
  hora_fin: string; // "HH:MM:SS"
  cupo_max: number;
  activo: boolean;
  // false = no requiere comprar materiales -> se pide alimento no perecedero
  requiere_materiales: boolean;
  created_at: string;
  updated_at: string;
  // campo calculado opcional (cupos)
  cupo_actual?: number;
}

export interface Inscripcion {
  id: string;
  alumno_id: string;
  taller_id: string;
  fecha_inscripcion: string;
  created_at: string;
}

export interface Categoria {
  id: string;
  nombre: string;
  orden: number;
  activa: boolean;
  created_at: string;
}

export interface Configuracion {
  id: number;
  inscripciones_abiertas_global: boolean;
  inscripciones_abiertas_dia1: boolean;
  inscripciones_abiertas_dia2: boolean;
  inscripciones_abiertas_dia3: boolean;
  // Franjas MANUALES del Día 1 (control on/off desde admin, sin reloj):
  // franja_1 -> talleres 08:00-09:30, franja_2 -> 10:00-12:00, franja_3 -> 13:00-15:00
  franja_1_abierta: boolean;
  franja_2_abierta: boolean;
  franja_3_abierta: boolean;
  updated_at: string;
}

// Inscripción con joins para mostrar en catálogo / itinerario
export interface InscripcionConTaller extends Inscripcion {
  taller: Taller;
}

export interface AlumnoConInscripciones extends Alumno {
  inscripciones: InscripcionConTaller[];
}

// Resultado de una operación de inscripción
export interface ResultadoInscripcion {
  ok: boolean;
  mensaje: string;
  taller_id?: string;
}
