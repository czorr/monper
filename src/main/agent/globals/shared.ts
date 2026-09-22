// Helpers compartidos por los globals del REPL.

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
}

export function stripHtml(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n').replace(/<[^>]+>/g, '').trim()
}

/** Objeto cuyos métodos lanzan un error guía: el agente debe operar el servicio con `page`. */
export function serviceStub(name: string, label: string, url: string): unknown {
  const hint = url
    ? `${name} no está portado a Titanio todavía. Opera ${label} navegando la web: await page.goto('${url}') y luego page.click/type/evaluate/snapshotText.`
    : `${name} no está disponible en Titanio. Pide al usuario que lo haga manualmente si involucra credenciales.`
  return new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'then') return undefined // no es una promesa
        return () => { throw new Error(`${name}.${String(prop)}(): ${hint}`) }
      }
    }
  )
}

/** Envuelve una impl parcial: los métodos no implementados caen al stub guía. */
export function withFallback(impl: Record<string, unknown>, name: string, label: string, url: string): unknown {
  const stub = serviceStub(name, label, url) as Record<string | symbol, unknown>
  return new Proxy(impl, { get: (t, prop) => (prop in t ? (t as Record<string | symbol, unknown>)[prop] : stub[prop]) })
}
