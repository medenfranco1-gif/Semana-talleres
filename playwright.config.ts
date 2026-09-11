import { defineConfig, devices } from '@playwright/test';

/**
 * Configuración de Playwright para pruebas de carga
 * https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/load',

  /* Tiempo máximo por test */
  timeout: 60 * 1000,

  /* Configuración de expect */
  expect: {
    timeout: 15000
  },

  /* Ejecutar tests en paralelo */
  fullyParallel: true,

  /* Fallar el build en CI si dejaste test.only */
  forbidOnly: !!process.env.CI,

  /* Reintentos en CI solamente */
  retries: process.env.CI ? 2 : 0,

  /* Workers: cantidad de usuarios simultáneos */
  workers: process.env.CONCURRENCY ? parseInt(process.env.CONCURRENCY) : 5,

  /* Reporter */
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/load/report', open: 'never' }]
  ],

  /* Configuración compartida para todos los proyectos */
  use: {
    /* URL base */
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    /* Captura de screenshot solo en fallo */
    screenshot: 'only-on-failure',

    /* Video solo en fallo */
    video: 'retain-on-failure',

    /* Trace solo en fallo */
    trace: 'retain-on-failure',

    /* Timeout de navegación */
    navigationTimeout: 30000,

    /* Timeout de acción */
    actionTimeout: 15000,
  },

  /* Configurar proyecto para Chromium */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* No levantar servidor local (asumimos que BASE_URL está configurada) */
  webServer: undefined,
});
