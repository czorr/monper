import { test, expect } from '@playwright/test'
import { launch, api, waitForState, serve, type Harness } from './helpers'

/**
 * Titanio se presenta como Chrome, no como Chromium.
 *
 * No es cosmética: Google bloquea el inicio de sesión con "This browser or app may not be
 * secure" cuando detecta un navegador embebido, y lo detecta por aquí. Esto se rompe en
 * SILENCIO —nadie ve un error, simplemente un día no puedes entrar en tu correo—, así que
 * conviene que lo diga un test y no un usuario.
 *
 * Se comprueban las tres fuentes a la vez porque lo que delata no es que falte una, sino que
 * se contradigan: ningún navegador real manda una cabecera y expone otra cosa en JS.
 */

let h: Harness

test.beforeAll(async () => { h = await launch() })
test.afterAll(async () => { await h?.close() })

test('la identidad de Chrome es coherente entre la cabecera y el JS', async () => {
  let secChUa: string | undefined
  const site = await serve({
    '/': (req) => {
      secChUa = req.headers['sec-ch-ua'] as string | undefined
      return {
        body: `<!doctype html><meta charset="utf-8"><title>identidad</title><body>
          <script>
            const uad = navigator.userAgentData
            document.title = JSON.stringify({
              brands: uad ? uad.brands.map(b => b.brand) : null,
              chrome: window.chrome ? Object.keys(window.chrome).sort() : []
            })
          </script>`
      }
    }
  })
  try {
    await api(h.win, 'newTab')
    await api(h.win, 'go', site.url + '/')
    // La página vuelca el resultado en su <title>: es la vía que ya tenemos para leer algo
    // de dentro de un WebContentsView desde el test.
    const estado = await waitForState(
      h.win,
      (s) => (s.tabs.find((t) => t.id === s.activeId)?.title ?? '').startsWith('{')
    )
    const raw = estado.tabs.find((t) => t.id === estado.activeId)?.title ?? '{}'
    const visto = JSON.parse(raw) as { brands: string[] | null; chrome: string[] }

    // 1) Desde JavaScript: la marca que Electron no pone por su cuenta.
    expect(visto.brands).toContain('Google Chrome')
    expect(visto.brands).toContain('Chromium')

    // 2) `window.chrome` vacío es la comprobación de una línea que usa media web.
    expect(visto.chrome).toContain('loadTimes')
    expect(visto.chrome).toContain('csi')

    // 3) La cabecera tiene que decir LO MISMO. Si el sitio no pidió Client Hints puede no
    //    venir; solo se exige coherencia cuando viaja.
    if (secChUa) {
      expect(secChUa).toContain('"Google Chrome"')
      for (const marca of visto.brands ?? []) {
        expect(secChUa).toContain(`"${marca}"`)
      }
    }
  } finally {
    await site.close()
  }
})
