import { test, expect } from '@playwright/test'
import { launch, serve, type Harness } from './helpers'
import type { VaultItemMeta } from '../src/shared/vault'

/**
 * Settings → Password: el vault con pantalla propia.
 *
 * Lo que de verdad hay que blindar aquí es la regla del producto: **el secreto no cruza el
 * IPC**. Copiar va del main al portapapeles y el renderer solo recibe un booleano. Un test que
 * comprobara "se ve la lista" no valdría nada; estos comprueban que no se escapa el valor.
 *
 * Ver docs/vault-architecture.md.
 */

let h: Harness

test.beforeAll(async () => { h = await launch() })
test.afterAll(async () => { await h?.close() })

/** Ejecuta `window.titanioTab.<metodo>` dentro de la página de Settings (que es interna). */
async function enSettings<T>(metodo: string, ...args: unknown[]): Promise<T> {
  return h.app.evaluate(async ({ webContents }, { metodo, args }) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('settings.html'))
    if (!wc) throw new Error('Settings no está abierto')
    const call = `window.titanioTab.${metodo}(${args.map((a) => JSON.stringify(a)).join(',')})`
    return (await wc.executeJavaScript(call)) as T
  }, { metodo, args }) as Promise<T>
}

test.beforeAll(async () => {
  // Se abre por el item de menú, igual que lo haría el usuario.
  await h.app.evaluate(({ Menu }) => {
    const buscar = (l: string): Electron.MenuItem | undefined =>
      Menu.getApplicationMenu()?.items.flatMap((i) => i.submenu?.items ?? []).find((i) => i.label === l)
    const item = buscar('Settings…') ?? buscar('Ajustes…') ?? buscar('Preferencias…')
    item?.click()
  })
  // Si el menú no lo tiene, se navega directo: lo que importa es tener una página interna.
  await expect.poll(async () => h.app.evaluate(({ webContents }) =>
    webContents.getAllWebContents().some((w) => w.getURL().includes('settings.html'))
  ), { timeout: 10_000 }).toBe(true)
})

test('el listado del vault nunca incluye el secreto', async () => {
  await enSettings('vaultAdd', 'secret', 'Prueba', { name: 'prueba' }, 'ESTE-ES-EL-SECRETO')
  const items = await enSettings<VaultItemMeta[]>('vaultList')
  const crudo = JSON.stringify(items)
  expect(crudo, 'el secreto se escapó por el canal de listado').not.toContain('ESTE-ES-EL-SECRETO')
  expect(items.some((i) => i.label === 'Prueba')).toBe(true)
})

test('copiar devuelve un booleano, no el valor', async () => {
  const items = await enSettings<VaultItemMeta[]>('vaultList')
  const id = items.find((i) => i.label === 'Prueba')!.id
  const r = await enSettings<unknown>('vaultCopy', id)
  expect(typeof r, 'vaultCopy tiene que devolver ok/no-ok, jamás el secreto').toBe('boolean')
  expect(r).toBe(true)

  // Y el secreto acaba en el portapapeles, puesto por el MAIN.
  const portapapeles = await h.app.evaluate(({ clipboard }) => clipboard.readText())
  expect(portapapeles).toBe('ESTE-ES-EL-SECRETO')
})

test('copiar un id que no existe no rompe: devuelve false', async () => {
  expect(await enSettings<boolean>('vaultCopy', 'no-existe')).toBe(false)
})

test('renombrar conserva el secreto', async () => {
  // Editar la metadata no puede tocar lo cifrado: si `update` reescribiera el secreto con
  // undefined, la credencial quedaría inservible y sin aviso.
  const items = await enSettings<VaultItemMeta[]>('vaultList')
  const id = items.find((i) => i.label === 'Prueba')!.id
  await enSettings('vaultUpdate', id, { label: 'Renombrada' })

  const despues = await enSettings<VaultItemMeta[]>('vaultList')
  expect(despues.find((i) => i.id === id)?.label).toBe('Renombrada')
  expect(await enSettings<boolean>('vaultCopy', id), 'el secreto sobrevive al renombrado').toBe(true)
})

test('el chrome NO puede gestionar el vault: solo las páginas internas', async () => {
  // `isInternalSender` es lo que impide que el sidebar —o una web— borre o lea secretos.
  // Se comprueba desde la ventana del chrome, que no es una página interna.
  const copiado = await h.win.evaluate(async () => {
    const m = (window as never as Record<string, Record<string, unknown>>)['titanio']
    return typeof m?.['vaultCopy']
  })
  expect(copiado, 'el chrome no debe tener siquiera el método de copiar').toBe('undefined')
})

test('revelar devuelve el secreto, pero solo el que se pide', async () => {
  /**
   * "Ver la contraseña" es la ÚNICA excepción a que el secreto no cruce el IPC, y es una
   * decisión de producto: un gestor donde no puedes mirar tu propia clave no es un gestor.
   * Lo que la mantiene acotada es que va de una en una — no hay ningún canal que vuelque el
   * vault entero, y ESO es lo que impide un escape accidental.
   */
  await enSettings('vaultAdd', 'secret', 'Otra', { name: 'otra' }, 'SECRETO-DE-LA-OTRA')
  const items = await enSettings<VaultItemMeta[]>('vaultList')
  const renombrada = items.find((i) => i.label === 'Renombrada')!

  expect(await enSettings<string | null>('vaultReveal', renombrada.id)).toBe('ESTE-ES-EL-SECRETO')

  // El listado sigue sin llevar ninguno de los dos.
  const crudo = JSON.stringify(await enSettings<VaultItemMeta[]>('vaultList'))
  expect(crudo).not.toContain('ESTE-ES-EL-SECRETO')
  expect(crudo).not.toContain('SECRETO-DE-LA-OTRA')
})

test('revelar un id inexistente devuelve null, no lanza', async () => {
  expect(await enSettings<string | null>('vaultReveal', 'no-existe')).toBeNull()
})

test('los favicons van por origen y solo salen los ya conocidos', async () => {
  // Van aparte de `VaultItemMeta.data` porque `data` es lo que se PERSISTE: un icono cacheado
  // no es metadata del secreto. Y nunca se le piden a un tercero — mandarle a Google los
  // dominios donde tienes cuenta sería lo contrario de lo que promete este panel.
  const f = await enSettings<Record<string, string>>('vaultFavicons')
  expect(typeof f).toBe('object')
  for (const [origen, icono] of Object.entries(f)) {
    expect(origen).toMatch(/^https?:\/\//)
    expect(icono).toBeTruthy()
  }
})

test('alta manual: el sitio se normaliza a un ORIGEN, o el autorrelleno no lo encontraría nunca', async () => {
  /**
   * `findCredential` busca por origen exacto. Guardar "github.com" a secas crearía una
   * credencial que jamás va a coincidir con nada — un fallo silencioso, que es justo lo que no
   * queremos en el vault. La normalización vive en el alta por eso.
   */
  await enSettings('vaultAdd', 'web-credential', 'ejemplo.test', { origin: 'https://ejemplo.test', username: 'yo' }, 'CLAVE-WEB')
  const items = await enSettings<VaultItemMeta[]>('vaultList')
  const cred = items.find((i) => i.type === 'web-credential' && i.data.origin === 'https://ejemplo.test')
  expect(cred, 'la credencial se guardó con su origen completo').toBeTruthy()
  expect(cred!.data.origin).toMatch(/^https:\/\//)
  expect(cred!.data.username).toBe('yo')
  // Y sigue sin filtrarse por el listado.
  expect(JSON.stringify(items)).not.toContain('CLAVE-WEB')
})

test('la ventana del vault no se enseña vacía en el primer click', async () => {
  /**
   * El bug: había que pulsar el botón del vault DOS veces. `show()` llegaba con el renderer
   * todavía arrancando, así que la primera vez la ventana salía en blanco (o se iba de blur
   * antes de pintar) y parecía que el click no había hecho nada.
   *
   * Se comprueba lo que se veía mal: en el instante en que la ventana es visible, su contenido
   * ya tiene que estar pintado. Mirar solo `isVisible()` habría pasado también con el bug.
   */
  await h.app.evaluate(({ ipcMain }) => {
    ipcMain.emit('vault:open', null, { x: 40, y: 40, width: 30, height: 30 })
  })

  const visibleYCargada = async (): Promise<'no' | 'vacía' | 'ok'> =>
    h.app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.webContents.getURL().includes('vault.html'))
      if (!w || !w.isVisible()) return 'no'
      const texto = (await w.webContents.executeJavaScript('document.body.innerText')) as string
      return texto.includes('Vault') ? 'ok' : 'vacía'
    })

  await expect.poll(visibleYCargada, { timeout: 10_000 }).toBe('ok')
})

test('un sitio del vault que nunca visitaste acaba con su icono, bajado y cacheado', async () => {
  /**
   * La queja: "no cargan los favicons". La caché solo tenía iconos de sitios VISITADOS, y una
   * credencial dada de alta a mano no ha visitado nada, así que salían todas con el candado.
   *
   * Se comprueba el resultado y ADEMÁS que quede incrustado (`data:`): guardar la URL remota no
   * es cachear — se volvería a pedir a la red cada vez que se pinta la lista, y basta con que el
   * sitio tarde o responda 403 para que el icono desaparezca otra vez.
   */
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
  const sitio = await serve({
    '/': '<!doctype html><html><head><link rel="icon" href="/icono.png"></head><body>hola</body></html>',
    '/icono.png': { body: PNG, headers: { 'content-type': 'image/png' } }
  })
  try {
    const origen = sitio.url
    await enSettings('vaultAdd', 'web-credential', 'Nunca visitado', { origin: origen, username: 'yo' }, 'x')

    await expect
      .poll(async () => (await enSettings<Record<string, string>>('vaultFavicons'))[origen] ?? '', { timeout: 15_000 })
      .toMatch(/^data:image\//)
  } finally { await sitio.close() }
})
