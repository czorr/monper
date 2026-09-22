import { test, expect } from '@playwright/test'
import { launch, api, serve, type Harness } from './helpers'

/**
 * Página que no responde: el usuario tiene que poder salir.
 *
 * Un bucle infinito en el JS de una web congela su pestaña: no repinta y no responde a clics.
 * Sin aviso, el usuario no sabe si es la web, la red o Titanio — y no tiene forma de cerrarla.
 *
 * El evento `unresponsive` de Electron NO sirve aquí: medido, no dispara nunca en un
 * `WebContentsView`. La detección es propia — se le pide a la página que evalúe algo trivial y
 * se mira si contesta. Por eso este test vale: prueba el mecanismo que de verdad corre.
 */

test('una página colgada ofrece esperar o cerrarla', async () => {
  const site = await serve({
    '/': `<!doctype html><title>Colgada</title><body>x<script>
      setTimeout(() => { while (true) {} }, 300)
    </script></body>`
  })
  const h: Harness = await launch()

  // Se intercepta el diálogo nativo: abrirlo de verdad bloquearía el test para siempre.
  await h.app.evaluate(({ dialog }) => {
    const g = globalThis as unknown as { __dialogos: string[] }
    g.__dialogos = []
    dialog.showMessageBox = ((_w: unknown, opts: { message?: string }) => {
      g.__dialogos.push(String(opts?.message ?? ''))
      return Promise.resolve({ response: 0, checkboxChecked: false })
    }) as typeof dialog.showMessageBox
  })

  await api(h.win, 'newTab')
  await api(h.win, 'go', site.url + '/')

  await expect
    .poll(async () => h.app.evaluate(() => (globalThis as unknown as { __dialogos: string[] }).__dialogos),
      { timeout: 40_000, message: 'nunca se avisó de que la página no responde' })
    .toEqual(expect.arrayContaining([expect.stringContaining('no responde')]))

  await h.close(); await site.close()
})
