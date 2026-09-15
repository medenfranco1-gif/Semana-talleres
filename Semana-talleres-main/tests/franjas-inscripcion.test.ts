/**
 * Tests unitarios para el sistema de franjas MANUALES de inscripción.
 *
 * Las franjas se abren/cierran a mano desde el admin (flags en configuracion).
 * NO hay reloj ni Date: el estado depende solo de los flags.
 *
 * Valida:
 * - Detección correcta de franja por hora_inicio (Día 1)
 * - Apertura/cierre según los flags franja_1/2/3_abierta
 * - Regla: global + día 1 + franja deben estar todos abiertos
 * - Talleres fuera de franjas definidas
 * - Talleres de días que no tienen franjas (Día 2 y Día 3)
 */

import { test, expect } from "@playwright/test";
const describe = test.describe;
const it = test;
import {
  estadoFranjaTaller,
  puedeInscribirsePorFranja,
  type FranjasConfig,
} from "../src/lib/franjas-inscripcion";
import type { Taller } from "../src/lib/types";

// Helper para crear taller de prueba
function crearTaller(dia: 1 | 2 | 3, horaInicio: string): Taller {
  return {
    id: `test-${dia}-${horaInicio}`,
    titulo: `Taller ${horaInicio}`,
    descripcion: "",
    profesor: "",
    aula: "",
    categoria: "Test",
    dia,
    hora_inicio: horaInicio,
    hora_fin: "15:00:00",
    cupo_max: 20,
    activo: true,
    requiere_materiales: true,
    created_at: "",
    updated_at: "",
  };
}

// Helper para armar la config de franjas.
function crearConfig(overrides: Partial<FranjasConfig> = {}): FranjasConfig {
  return {
    inscripciones_abiertas_global: true,
    inscripciones_abiertas_dia1: true,
    franja_1_abierta: false,
    franja_2_abierta: false,
    franja_3_abierta: false,
    ...overrides,
  };
}

describe("Franjas manuales - Detección de franja por hora_inicio", () => {
  it("Taller 08:00 pertenece a Franja 1", () => {
    const r = estadoFranjaTaller(crearTaller(1, "08:00:00"), crearConfig());
    expect(r.franja).toBe(1);
  });

  it("Taller 09:30 pertenece a Franja 1", () => {
    const r = estadoFranjaTaller(crearTaller(1, "09:30:00"), crearConfig());
    expect(r.franja).toBe(1);
  });

  it("Taller 10:00 pertenece a Franja 2", () => {
    const r = estadoFranjaTaller(crearTaller(1, "10:00:00"), crearConfig());
    expect(r.franja).toBe(2);
  });

  it("Taller 12:00 pertenece a Franja 2", () => {
    const r = estadoFranjaTaller(crearTaller(1, "12:00:00"), crearConfig());
    expect(r.franja).toBe(2);
  });

  it("Taller 13:00 pertenece a Franja 3", () => {
    const r = estadoFranjaTaller(crearTaller(1, "13:00:00"), crearConfig());
    expect(r.franja).toBe(3);
  });

  it("Taller 15:00 pertenece a Franja 3", () => {
    const r = estadoFranjaTaller(crearTaller(1, "15:00:00"), crearConfig());
    expect(r.franja).toBe(3);
  });

  it("Taller 09:45 NO pertenece a ninguna franja", () => {
    const r = estadoFranjaTaller(crearTaller(1, "09:45:00"), crearConfig());
    expect(r.franja).toBeUndefined();
    expect(r.permitido).toBe(false);
    expect(r.estado).toBe("fuera_de_franja");
  });

  it("Taller 12:30 NO pertenece a ninguna franja", () => {
    const r = estadoFranjaTaller(crearTaller(1, "12:30:00"), crearConfig());
    expect(r.estado).toBe("fuera_de_franja");
  });

  it("Taller 15:30 NO pertenece a ninguna franja", () => {
    const r = estadoFranjaTaller(crearTaller(1, "15:30:00"), crearConfig());
    expect(r.estado).toBe("fuera_de_franja");
  });
});

describe("Franjas manuales - Apertura según flags", () => {
  const taller08 = crearTaller(1, "08:00:00"); // Franja 1
  const taller10 = crearTaller(1, "10:00:00"); // Franja 2
  const taller13 = crearTaller(1, "13:00:00"); // Franja 3

  it("Todas las franjas cerradas → nada inscribible", () => {
    const config = crearConfig();
    expect(puedeInscribirsePorFranja(taller08, config)).toBe(false);
    expect(puedeInscribirsePorFranja(taller10, config)).toBe(false);
    expect(puedeInscribirsePorFranja(taller13, config)).toBe(false);
  });

  it("Solo franja 1 abierta → solo talleres 08:00-09:30", () => {
    const config = crearConfig({ franja_1_abierta: true });
    expect(puedeInscribirsePorFranja(taller08, config)).toBe(true);
    expect(puedeInscribirsePorFranja(taller10, config)).toBe(false);
    expect(puedeInscribirsePorFranja(taller13, config)).toBe(false);
    expect(estadoFranjaTaller(taller08, config).estado).toBe("disponible");
    expect(estadoFranjaTaller(taller10, config).estado).toBe("cerrado");
  });

  it("Solo franja 2 abierta → solo talleres 10:00-12:00", () => {
    const config = crearConfig({ franja_2_abierta: true });
    expect(puedeInscribirsePorFranja(taller08, config)).toBe(false);
    expect(puedeInscribirsePorFranja(taller10, config)).toBe(true);
    expect(puedeInscribirsePorFranja(taller13, config)).toBe(false);
  });

  it("Solo franja 3 abierta → solo talleres 13:00-15:00", () => {
    const config = crearConfig({ franja_3_abierta: true });
    expect(puedeInscribirsePorFranja(taller08, config)).toBe(false);
    expect(puedeInscribirsePorFranja(taller10, config)).toBe(false);
    expect(puedeInscribirsePorFranja(taller13, config)).toBe(true);
  });

  it("Varias franjas abiertas a la vez → todas sus talleres inscribibles", () => {
    const config = crearConfig({
      franja_1_abierta: true,
      franja_2_abierta: true,
      franja_3_abierta: true,
    });
    expect(puedeInscribirsePorFranja(taller08, config)).toBe(true);
    expect(puedeInscribirsePorFranja(taller10, config)).toBe(true);
    expect(puedeInscribirsePorFranja(taller13, config)).toBe(true);
  });
});

describe("Franjas manuales - Regla global + día 1 + franja", () => {
  const taller = crearTaller(1, "08:00:00"); // Franja 1

  it("Global cerrado → franja no habilita aunque su flag esté true", () => {
    const config = crearConfig({
      inscripciones_abiertas_global: false,
      franja_1_abierta: true,
    });
    expect(puedeInscribirsePorFranja(taller, config)).toBe(false);
    expect(estadoFranjaTaller(taller, config).estado).toBe("cerrado");
  });

  it("Día 1 cerrado → franja no habilita aunque su flag esté true", () => {
    const config = crearConfig({
      inscripciones_abiertas_dia1: false,
      franja_1_abierta: true,
    });
    expect(puedeInscribirsePorFranja(taller, config)).toBe(false);
  });

  it("Global + día 1 + franja abiertos → permite inscripción", () => {
    const config = crearConfig({ franja_1_abierta: true });
    expect(puedeInscribirsePorFranja(taller, config)).toBe(true);
  });

  it("Sin config (null) → cerrado por seguridad", () => {
    expect(puedeInscribirsePorFranja(taller, null)).toBe(false);
    expect(estadoFranjaTaller(taller, null).estado).toBe("cerrado");
  });
});

describe("Franjas manuales - Días que NO tienen franjas (Día 2 y Día 3)", () => {
  it("Taller de Día 2 no depende de franjas (siempre disponible acá)", () => {
    const r = estadoFranjaTaller(crearTaller(2, "08:00:00"), crearConfig());
    expect(r.permitido).toBe(true);
    expect(r.estado).toBe("disponible");
    expect(r.franja).toBeUndefined();
  });

  it("Taller de Día 3 no depende de franjas (siempre disponible acá)", () => {
    const r = estadoFranjaTaller(crearTaller(3, "10:00:00"), crearConfig());
    expect(r.permitido).toBe(true);
    expect(r.estado).toBe("disponible");
  });

  it("Día 2 disponible aunque todas las franjas del Día 1 estén cerradas", () => {
    const config = crearConfig(); // todas las franjas en false
    expect(puedeInscribirsePorFranja(crearTaller(2, "10:00:00"), config)).toBe(
      true,
    );
  });
});

describe("Franjas manuales - Mensajes", () => {
  it("Franja abierta → mensaje de abiertas", () => {
    const config = crearConfig({ franja_1_abierta: true });
    const r = estadoFranjaTaller(crearTaller(1, "08:00:00"), config);
    expect(r.mensaje).toBe("Inscripciones abiertas");
  });

  it("Franja cerrada → 'Inscripciones cerradas'", () => {
    const config = crearConfig({ franja_1_abierta: false });
    const r = estadoFranjaTaller(crearTaller(1, "08:00:00"), config);
    expect(r.mensaje).toBe("Inscripciones cerradas");
  });
});
