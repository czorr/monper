export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function luminance(color: string): number {
  // `transparent` no es un color claro: no es ninguno. Lo mandan las páginas internas, que
  // dejan ver la vibrancy oscura de la ventana. Sin este caso caía al blanco de abajo y
  // devolvía 1, que es justo la respuesta contraria a la correcta.
  if (color === 'transparent') return 0
  let r = 255, g = 255, b = 255
  let m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
  if (m) {
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return 0
    ;[r, g, b] = [+m[1], +m[2], +m[3]]
  } else if ((m = color.match(/^#([0-9a-f]{6})$/i))) {
    r = parseInt(m[1].slice(0, 2), 16); g = parseInt(m[1].slice(2, 4), 16); b = parseInt(m[1].slice(4, 6), 16)
  }
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}
