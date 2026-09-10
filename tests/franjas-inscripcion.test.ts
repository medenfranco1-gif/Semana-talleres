/**
 * Tests unitarios para el sistema de franjas horarias de inscripción.
 *
 * Valida:
 * - Detección correcta de franjas por hora_inicio
 * - Ventanas de inscripción con bordes exactos
 * - Comportamiento en timezone America/Argentina/Buenos_Aires
 * - Talleres fuera de franjas definidas
 * - Talleres de días que no son miércoles
 */

import { test, expect } from "@playwright/test";
const describe = test.describe;
const it = test;
import {
  estadoFranjaTaller,
  puedeInscribirsePorFranja,
  puedeInscribirseConConfig,
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

// Helper para crear fecha mock en timezone Argentina
function crearFechaMock(hora: string, minuto: string): Date {
  // Crear fecha 2024-01-10 (miércoles) en hora Argentina
  const año = 2024;
  const mes = 0; // enero
  const dia = 10;
  const h = parseInt(hora, 10);
  const m = parseInt(minuto, 10);

  // Simular que estamos en Argentina creando la fecha directamente
  return new Date(año, mes, dia, h, m, 0);
}

describe("Franjas de inscripción - Detección de franja por hora_inicio", () => {
  it("Taller 08:00 debe pertenecer a Franja 1", () => {
    const taller = crearTaller(3, "08:00:00");
    const mockFecha = crearFechaMock("20", "05"); // 20:05 - dentro de ventana
    const resultado = estadoFranjaTaller(taller, mockFecha);

    expect(resultado.franja).toBe(1);
    expect(resultado.permitido).toBe(true);
  });

  it("Taller 09:30 debe pertenecer a Franja 1", () => {
    const taller = crearTaller(3, "09:30:00");
    const mockFecha = crearFechaMock("20", "05");
    const resultado = estadoFranjaTaller(taller, mockFecha);

    expect(resultado.franja).toBe(1);
  });

  it("Taller 10:00 debe pertenecer a Franja 2", () => {
    const taller = crearTaller(3, "10:00:00");
    const mockFecha = crearFechaMock("20", "15");
    const resultado = estadoFranjaTaller(taller, mockFecha);

    expect(resultado.franja).toBe(2);
    expect(resultado.permitido).toBe(true);
  });

  it("Taller 12:00 debe pertenecer a Franja 2", () => {
    const taller = crearTaller(3, "12:00:00");
    const mockFecha = crearFechaMock("20", "15");
    const resultado = estadoFranjaTaller(taller, mockFecha);

    expect(resultado.franja).toBe(2);
  });

  it("Taller 13:00 debe pertenecer a Franja 3", () => {
    const taller = crearTaller(3, "13:00:00");
    const mockFecha = crearFechaMock("20", "25");
    const resultado = estadoFranjaTaller(taller, mockFecha);

    expect(resultado.franja).toBe(3);
    expect(resultado.permitido).toBe(true);
  });

  it("Taller 15:00 debe pertenecer a Franja 3", () => {
    const taller = crearTaller(3, "15:00:00");
    const mockFecha = crearFechaMock("20", "25");
    const resultado = estadoFranjaTaller(taller, mockFecha);

    expect(resultado.franja).toBe(3);
  });

  it("Taller 09:45 NO debe pertenecer a ninguna franja", () => {
    const taller = crearTaller(3, "09:45:00");
    const mockFecha = crearFechaMock("20", "05");
    const resultado = estadoFranjaTaller(taller, mockFecha);

    expect(resultado.franja).toBeUndefined();
    expect(resultado.permitido).toBe(false);
    expect(resultado.estado).toBe("fuera_de_franja");
  });

  it("Taller 12:30 NO debe pertenecer a ninguna franja", () => {
    const taller = crearTaller(3, "12:30:00");
    const mockFecha = crearFechaMock("20", "15");
    const resultado = estadoFranjaTaller(taller, mockFecha);

    expect(resultado.franja).toBeUndefined();
    expect(resultado.estado).toBe("fuera_de_franja");
  });

  it("Taller 15:30 NO debe pertenecer a ninguna franja", () => {
    const taller = crearTaller(3, "15:30:00");
    const mockFecha = crearFechaMock("20", "25");
    const resultado = estadoFranjaTaller(taller, mockFecha);

    expect(resultado.franja).toBeUndefined();
    expect(resultado.estado).toBe("fuera_de_franja");
  });
});

describe("Franjas de inscripción - Bordes de tiempo exactos", () => {
  const taller08 = crearTaller(3, "08:00:00"); // Franja 1
  const taller10 = crearTaller(3, "10:00:00"); // Franja 2
  const taller13 = crearTaller(3, "13:00:00"); // Franja 3

  it("19:59 - Todos los talleres cerrados", () => {
    const mockFecha = crearFechaMock("19", "59");

    expect(puedeInscribirsePorFranja(taller08, mockFecha)).toBe(false);
    expect(puedeInscribirsePorFranja(taller10, mockFecha)).toBe(false);
    expect(puedeInscribirsePorFranja(taller13, mockFecha)).toBe(false);

    expect(estadoFranjaTaller(taller08, mockFecha).estado).toBe("proximo");
  });

  it("20:00 - Abre Franja 1 (08:00-09:30)", () => {
    const mockFecha = crearFechaMock("20", "00");

    expect(puedeInscribirsePorFranja(taller08, mockFecha)).toBe(true);
    expect(puedeInscribirsePorFranja(taller10, mockFecha)).toBe(false);
    expect(puedeInscribirsePorFranja(taller13, mockFecha)).toBe(false);

    expect(estadoFranjaTaller(taller08, mockFecha).estado).toBe("disponible");
  });

  it("20:09 - Sigue abierta Franja 1", () => {
    const mockFecha = crearFechaMock("20", "09");

    expect(puedeInscribirsePorFranja(taller08, mockFecha)).toBe(true);
    expect(puedeInscribirsePorFranja(taller10, mockFecha)).toBe(false);
    expect(puedeInscribirsePorFranja(taller13, mockFecha)).toBe(false);
  });

  it("20:10 - Cierra Franja 1, abre Franja 2 (10:00-12:00)", () => {
    const mockFecha = crearFechaMock("20", "10");

    expect(puedeInscribirsePorFranja(taller08, mockFecha)).toBe(false);
    expect(puedeInscribirsePorFranja(taller10, mockFecha)).toBe(true);
    expect(puedeInscribirsePorFranja(taller13, mockFecha)).toBe(false);

    expect(estadoFranjaTaller(taller08, mockFecha).estado).toBe("cerrado");
    expect(estadoFranjaTaller(taller10, mockFecha).estado).toBe("disponible");
  });

  it("20:19 - Sigue abierta Franja 2", () => {
    const mockFecha = crearFechaMock("20", "19");

    expect(puedeInscribirsePorFranja(taller08, mockFecha)).toBe(false);
    expect(puedeInscribirsePorFranja(taller10, mockFecha)).toBe(true);
    expect(puedeInscribirsePorFranja(taller13, mockFecha)).toBe(false);
  });

  it("20:20 - Cierra Franja 2, abre Franja 3 (13:00-15:00)", () => {
    const mockFecha = crearFechaMock("20", "20");

    expect(puedeInscribirsePorFranja(taller08, mockFecha)).toBe(false);
    expect(puedeInscribirsePorFranja(taller10, mockFecha)).toBe(false);
    expect(puedeInscribirsePorFranja(taller13, mockFecha)).toBe(true);

    expect(estadoFranjaTaller(taller10, mockFecha).estado).toBe("cerrado");
    expect(estadoFranjaTaller(taller13, mockFecha).estado).toBe("disponible");
  });

  it("20:29 - Sigue abierta Franja 3", () => {
    const mockFecha = crearFechaMock("20", "29");

    expect(puedeInscribirsePorFranja(taller08, mockFecha)).toBe(false);
    expect(puedeInscribirsePorFranja(taller10, mockFecha)).toBe(false);
    expect(puedeInscribirsePorFranja(taller13, mockFecha)).toBe(true);
  });

  it("20:30 - Todos los bloques cerrados", () => {
    const mockFecha = crearFechaMock("20", "30");

    expect(puedeInscribirsePorFranja(taller08, mockFecha)).toBe(false);
    expect(puedeInscribirsePorFranja(taller10, mockFecha)).toBe(false);
    expect(puedeInscribirsePorFranja(taller13, mockFecha)).toBe(false);

    expect(estadoFranjaTaller(taller08, mockFecha).estado).toBe("cerrado");
    expect(estadoFranjaTaller(taller10, mockFecha).estado).toBe("cerrado");
    expect(estadoFranjaTaller(taller13, mockFecha).estado).toBe("cerrado");
  });
});

describe("Franjas de inscripción - Días que NO son miércoles", () => {
  it("Taller de lunes (dia=1) siempre disponible", () => {
    const tallerLunes = crearTaller(1, "08:00:00");
    const mockFecha = crearFechaMock("19", "00"); // Fuera de ventanas

    const resultado = estadoFranjaTaller(tallerLunes, mockFecha);

    expect(resultado.permitido).toBe(true);
    expect(resultado.estado).toBe("disponible");
    expect(resultado.franja).toBeUndefined();
  });

  it("Taller de martes (dia=2) siempre disponible", () => {
    const tallerMartes = crearTaller(2, "10:00:00");
    const mockFecha = crearFechaMock("22", "00"); // Después de todas las ventanas

    const resultado = estadoFranjaTaller(tallerMartes, mockFecha);

    expect(resultado.permitido).toBe(true);
    expect(resultado.estado).toBe("disponible");
  });
});

describe("Franjas de inscripción - Combinación con configuración global", () => {
  const taller = crearTaller(3, "08:00:00");
  const mockFecha = crearFechaMock("20", "05"); // Dentro de ventana Franja 1

  it("Config global cerrada → NO permite inscripción (aunque franja esté abierta)", () => {
    const resultado = puedeInscribirseConConfig(taller, false, true, mockFecha);
    expect(resultado).toBe(false);
  });

  it("Config día cerrada → NO permite inscripción", () => {
    const resultado = puedeInscribirseConConfig(taller, true, false, mockFecha);
    expect(resultado).toBe(false);
  });

  it("Config abierta + franja abierta → Permite inscripción", () => {
    const resultado = puedeInscribirseConConfig(taller, true, true, mockFecha);
    expect(resultado).toBe(true);
  });

  it("Config abierta + franja cerrada → NO permite inscripción", () => {
    const mockFueraDeFranja = crearFechaMock("19", "00");
    const resultado = puedeInscribirseConConfig(taller, true, true, mockFueraDeFranja);
    expect(resultado).toBe(false);
  });
});

describe("Franjas de inscripción - Mensajes descriptivos", () => {
  it("Franja próxima debe mostrar hora de apertura", () => {
    const taller = crearTaller(3, "08:00:00");
    const mockFecha = crearFechaMock("19", "30");

    const resultado = estadoFranjaTaller(taller, mockFecha);

    expect(resultado.estado).toBe("proximo");
    expect(resultado.abreA).toBe("20:00");
    expect(resultado.mensaje).toContain("20:00");
  });

  it("Franja disponible debe mostrar hora de cierre", () => {
    const taller = crearTaller(3, "10:00:00");
    const mockFecha = crearFechaMock("20", "15");

    const resultado = estadoFranjaTaller(taller, mockFecha);

    expect(resultado.estado).toBe("disponible");
    expect(resultado.cierraA).toBe("20:20");
    expect(resultado.mensaje).toContain("20:20");
  });

  it("Franja cerrada debe indicar que finalizó", () => {
    const taller = crearTaller(3, "08:00:00");
    const mockFecha = crearFechaMock("20", "45");

    const resultado = estadoFranjaTaller(taller, mockFecha);

    expect(resultado.estado).toBe("cerrado");
    expect(resultado.mensaje).toContain("finalizó");
  });
});
