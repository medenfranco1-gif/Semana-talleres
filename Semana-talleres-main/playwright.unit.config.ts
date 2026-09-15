import { defineConfig } from '@playwright/test';

/**
 * Configuración de Playwright para tests unitarios de lógica pura
 * (sin navegador). Usado para tests/franjas-inscripcion.test.ts
 */
export default defineConfig({
  testDir: './tests',
  testMatch: 'franjas-inscripcion.test.ts',
  timeout: 10 * 1000,
  fullyParallel: true,
  reporter: [['list']],
});
