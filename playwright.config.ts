import { defineConfig } from '@playwright/test'

/**
 * Smoke tests sobre la app real (Electron), no sobre componentes aislados.
 *
 * En serie y con un solo worker A PROPÓSITO: cada test arranca una instancia de Titanio
 * con su propio userData, y varias a la vez se pelean por el foco de la ventana y por
 * el puerto del dev server.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : [['list']]
})
