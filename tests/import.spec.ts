import { test, expect } from '@playwright/test'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { navegadoresDisponibles, appInstalada, leerMarcadores } from '../src/main/import/browsers'

/**
 * Detección de navegadores para importar.
 *
 * No lanza la app: es lógica pura sobre el sistema de ficheros, y así corre en milisegundos.
 * Los números dependen de la máquina, así que se afirman INVARIANTES, no cantidades.
 */

test('no se ofrece ningún navegador cuya app no esté instalada', () => {
  /**
   * El bug que lo motivó: desinstalar un navegador **no borra su carpeta de perfil**.
   * Detectando solo el perfil, se ofrecía importar de Chrome y de Arc en una máquina donde
   * ninguno de los dos estaba instalado — carpetas huérfanas de hace meses.
   */
  const apps: Record<string, string> = {
    chrome: 'Google Chrome', arc: 'Arc', brave: 'Brave Browser',
    edge: 'Microsoft Edge', safari: 'Safari'
  }
  for (const n of navegadoresDisponibles().filter((x) => x.disponible)) {
    expect(appInstalada(apps[n.id]!), `${n.nombre} se ofrece pero su .app no existe`).toBe(true)
  }
})

test('no se ofrece ningún navegador sin datos que traer', () => {
  // La otra dirección: una app recién instalada y nunca abierta no tiene perfil, y ofrecerla
  // llevaría a una importación de cero elementos sin explicación.
  const perfiles: Record<string, string> = {
    chrome: 'Application Support/Google/Chrome/Default/Bookmarks',
    arc: 'Application Support/Arc/User Data/Default/Bookmarks',
    brave: 'Application Support/BraveSoftware/Brave-Browser/Default/Bookmarks',
    edge: 'Application Support/Microsoft Edge/Default/Bookmarks',
    safari: 'Safari/Bookmarks.plist'
  }
  for (const n of navegadoresDisponibles().filter((x) => x.disponible)) {
    expect(existsSync(join(homedir(), 'Library', perfiles[n.id]!)), `${n.nombre} se ofrece sin perfil`).toBe(true)
  }
})

test('siempre se devuelven todos los navegadores conocidos, marcados', () => {
  // La lista completa se devuelve siempre y es la UI quien filtra: así el main no decide
  // presentación, y un futuro "no encuentro mi navegador" puede enseñar los descartados.
  const ids = navegadoresDisponibles().map((n) => n.id).sort()
  expect(ids).toEqual(['arc', 'brave', 'chrome', 'edge', 'safari'])
})

test('los marcadores traen la carpeta del navegador de origen, aplanada a un nivel', () => {
  /**
   * Chromium anida sin límite y nuestro árbol es de UN nivel: `Trabajo/Clientes/Acme` tiene que
   * acabar en `Trabajo`, la carpeta que el usuario reconoce. Lo que no puede pasar es que un
   * marcador se pierda por no tener dónde ponerlo, ni que las raíces del sistema
   * (`bookmark_bar`, `other`) se cuelen como si fueran carpetas del usuario.
   */
  for (const n of navegadoresDisponibles().filter((x) => x.disponible && x.id !== 'safari')) {
    const ms = leerMarcadores(n.id)
    if (ms.length === 0) continue
    for (const m of ms) {
      expect(typeof m.url === 'string' && /^https?:/i.test(m.url), `${n.nombre}: url rara`).toBe(true)
      expect(m.carpeta === null || m.carpeta === undefined || typeof m.carpeta === 'string').toBe(true)
      if (typeof m.carpeta === 'string') {
        expect(m.carpeta.trim().length, `${n.nombre}: carpeta con nombre vacío`).toBeGreaterThan(0)
        expect(['bookmark_bar', 'other', 'synced']).not.toContain(m.carpeta)
      }
    }
  }
})
