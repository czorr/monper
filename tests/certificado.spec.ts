import { test, expect } from '@playwright/test'
import { launch, api, waitForState, type Harness } from './helpers'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Certificado inválido: el usuario tiene que ENTENDER por qué no carga.
 *
 * Electron bloquea un certificado malo y, sin página de error, la pestaña se queda en blanco:
 * el usuario no sabe si es la red, el sitio o Titanio. Peor aún en un navegador que guarda
 * contraseñas — una pantalla en blanco ante un certificado sospechoso no avisa de nada.
 *
 * Se levanta un HTTPS con certificado AUTOFIRMADO de verdad. Comprobar el mapeo de códigos
 * a mano no valdría: lo que importa es que el camino completo —Chromium rechaza,
 * `did-fail-load` dispara, se carga la interstitial— acabe en la pantalla correcta.
 */

let h: Harness
let dir = ''
let url = ''
let cerrar: () => void = () => {}

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'titanio-cert-'))
  const key = join(dir, 'k.pem')
  const crt = join(dir, 'c.pem')
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-keyout', key, '-out', crt, '-subj', '/CN=sitio-de-prueba.invalido'
  ], { stdio: 'ignore' })

  const { createServer } = await import('node:https')
  const server = createServer(
    { key: readFileSync(key), cert: readFileSync(crt) },
    (_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<title>Secreto</title>ok')
  )
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const addr = server.address()
  url = `https://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/`
  cerrar = () => server.close()

  h = await launch()
})
test.afterAll(async () => { await h?.close(); cerrar(); rmSync(dir, { recursive: true, force: true }) })

test('un certificado inválido lleva a "Tu conexión no es privada", no a una página en blanco', async () => {
  await api(h.win, 'newTab')
  await api(h.win, 'go', url)

  // La pestaña acaba en NUESTRA página de error, no en blanco ni en el sitio.
  await expect
    .poll(async () => h.app.evaluate(({ webContents }) =>
      webContents.getAllWebContents().some((w) => w.getURL().includes('error.html'))
    ), { timeout: 10_000, message: 'no se cargó la página de error' })
    .toBe(true)

  const info = await h.app.evaluate(({ webContents }) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('error.html'))!
    const p = new URLSearchParams(new URL(wc.getURL()).search)
    return { code: Number(p.get('code')), kind: p.get('kind') }
  })
  // Los códigos de certificado de Chromium van del -200 al -219; es lo que dispara la
  // interstitial de "conexión no privada" en vez del texto genérico de red.
  expect(info.code, `código ${info.code}: no es un error de certificado`).toBeLessThanOrEqual(-200)
  expect(info.code).toBeGreaterThanOrEqual(-219)

  // Y el texto que ve el usuario menciona la privacidad de la conexión.
  const texto = await h.app.evaluate(async ({ webContents }) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('error.html'))!
    return String(await wc.executeJavaScript('document.body.innerText'))
  })
  expect(texto.toLowerCase()).toContain('no es privada')
})

test('el sitio NO se carga: un certificado malo no se salta solo', async () => {
  // La otra mitad: enseñar el aviso pero cargar el sitio igualmente sería peor que nada.
  const s = await waitForState(h.win, (st) => !!st.active)
  expect(s.tabs.some((t) => t.title === 'Secreto'), 'el sitio con certificado malo se cargó').toBe(false)
})
