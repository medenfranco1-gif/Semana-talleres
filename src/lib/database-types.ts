// =====================================================================
// Tipado de la base de datos para Supabase (Database interface)
// =====================================================================
// Versión acotada a las tablas del dominio. Podés regenerar la versión
// completa con `supabase gen types typescript` contra tu proyecto.
// =====================================================================

export interface Database {
  public: {
    Tables: {
      alumnos: {
        Row: {
          id: string;
          auth_user_id: string;
          nombre: string;
          apellido: string;
          documento: string | null;
          curso: string;
          division: string;
          email: string;
          rol: "alumno" | "admin";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id: string;
          nombre: string;
          apellido: string;
          documento?: string | null;
          curso: string;
          division: string;
          email: string;
          rol?: "alumno" | "admin";
          created_at?: string;
          updated_at?: string;
        };
        // `rol` NO se incluye acá a propósito: el cambio de rol está reservado
        // a admins y protegido por el trigger trg_bloquear_cambio_rol en la BD.
        Update: {
          nombre?: string;
          apellido?: string;
          documento?: string | null;
          curso?: string;
          division?: string;
          email?: string;
        };
        Relationships: [];
      };
      talleres: {
        Row: {
          id: string;
          titulo: string;
          descripcion: string;
          profesor: string;
          aula: string;
          categoria: string;
          dia: 1 | 2 | 3;
          hora_inicio: string;
          hora_fin: string;
          cupo_max: number;
          activo: boolean;
          requiere_materiales: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          titulo: string;
          descripcion?: string;
          profesor?: string;
          aula?: string;
          categoria: string;
          dia: 1 | 2 | 3;
          hora_inicio: string;
          hora_fin: string;
          cupo_max: number;
          activo?: boolean;
          requiere_materiales?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          titulo?: string;
          descripcion?: string;
          profesor?: string;
          aula?: string;
          categoria?: string;
          dia?: 1 | 2 | 3;
          hora_inicio?: string;
          hora_fin?: string;
          cupo_max?: number;
          activo?: boolean;
          requiere_materiales?: boolean;
        };
        Relationships: [];
      };
      inscripciones: {
        Row: {
          id: string;
          alumno_id: string;
          taller_id: string;
          fecha_inscripcion: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          alumno_id: string;
          taller_id: string;
          fecha_inscripcion?: string;
          created_at?: string;
        };
        Update: {
          alumno_id?: string;
          taller_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inscripciones_alumno_id_fkey";
            columns: ["alumno_id"];
            referencedRelation: "alumnos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inscripciones_taller_id_fkey";
            columns: ["taller_id"];
            referencedRelation: "talleres";
            referencedColumns: ["id"];
          },
        ];
      };
      categorias: {
        Row: {
          id: string;
          nombre: string;
          orden: number;
          activa: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          orden?: number;
          activa?: boolean;
          created_at?: string;
        };
        Update: {
          nombre?: string;
          orden?: number;
          activa?: boolean;
        };
        Relationships: [];
      };
      configuracion: {
        Row: {
          id: number;
          inscripciones_abiertas_global: boolean;
          inscripciones_abiertas_dia1: boolean;
          inscripciones_abiertas_dia2: boolean;
          inscripciones_abiertas_dia3: boolean;
          updated_at: string;
        };
        Insert: {
          id?: number;
          inscripciones_abiertas_global?: boolean;
          inscripciones_abiertas_dia1?: boolean;
          inscripciones_abiertas_dia2?: boolean;
          inscripciones_abiertas_dia3?: boolean;
          updated_at?: string;
        };
        Update: {
          inscripciones_abiertas_global?: boolean;
          inscripciones_abiertas_dia1?: boolean;
          inscripciones_abiertas_dia2?: boolean;
          inscripciones_abiertas_dia3?: boolean;
        };
        Relationships: [];
      };
    };
    Views: { [key: string]: never };
    Functions: { [key: string]: never };
    Enums: { [key: string]: never };
    CompositeTypes: { [key: string]: never };
  };
}
