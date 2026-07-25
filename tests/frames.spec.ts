import { test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { launch, api, waitForState, serve, html, type Harness } from './helpers'

/**
 * Frames del compositor de Chromium, vía `contentTracing`.
 *
 * Es el ÚNICO instrumento que tenemos para ver artefactos visuales: `win.capturePage()` no
 * captura las vistas nativas y grabar la pantalla necesita un permiso de macOS que hay que
 * conceder a mano. Aquí se lee el estado de cada frame que reporta el compositor
 * (`PipelineReporter`): presentado, descartado o "no había nada que dibujar".
 *
 * OJO: los valores absolutos son RUIDOSOS — en reposo ya salen frames descartados, y dos
 * corridas del mismo build dan 16 y 26. Sirve para A/B con el mismo guion, no como umbral.
 * Ver docs/rendimiento.md.
 */

async function frames(h: Harness, accion: () => Promise<void>): Promise<Record<string, number>> {
  await h.app.evaluate(({ contentTracing }) =>
    contentTracing.startRecording({ included_categories: ['viz', 'cc', 'benchmark'] })
  )
  await accion()
  const file = await h.app.evaluate(({ contentTracing }) => contentTracing.stopRecording())
  const ev = JSON.parse(readFileSync(file, 'utf8')).traceEvents as {
    name: string
    args?: { frame_reporter?: { state?: string } }
  }[]
  const out: Record<string, number> = {}
  for (const e of ev) {
    const st = e.name === 'PipelineReporter' ? e.args?.frame_reporter?.state : undefined
    if (st) out[st] = (out[st] ?? 0) + 1
  }
  return out
}

const linea = (label: string, f: Record<string, number>): void => {
  const pres = f['STATE_PRESENTED_ALL'] ?? 0
  const drop = f['STATE_DROPPED'] ?? 0
  const pct = pres + drop ? Math.round((drop / (pres + drop)) * 100) : 0
  console.log(`  ${label.padEnd(30)} presentados ${String(pres).padStart(4)}   descartados ${String(drop).padStart(3)}  (${pct}%)`)
}

test('frames del compositor por interacción', async () => {
  const site = await serve({ '/a': html('A'), '/b': html('B') })
  const h = await launch()
  try {
    const a = await api<number>(h.win, 'newTab')
    await api(h.win, 'go', site.url + '/a')
    await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.title === 'A')
    const b = await api<number>(h.win, 'newTab')
    await api(h.win, 'go', site.url + '/b')
    await waitForState(h.win, (s) => s.tabs.find((t) => t.id === s.activeId)?.title === 'B')

    linea('12 cambios de pestaña', await frames(h, async () => {
      for (let i = 0; i < 12; i++) {
        await api(h.win, 'selectTab', i % 2 ? a : b)
        await new Promise((r) => setTimeout(r, 250))
      }
    }))

    linea('8 colapsos del sidebar', await frames(h, async () => {
      for (let i = 0; i < 8; i++) {
        await api(h.win, 'setCollapsed', true); await new Promise((r) => setTimeout(r, 280))
        await api(h.win, 'setCollapsed', false); await new Promise((r) => setTimeout(r, 280))
      }
    }))
  } finally {
    await h.close()
    await site.close()
  }
})
