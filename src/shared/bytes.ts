/**
 * Tamaño legible. Vive en shared porque lo usan la página de descargas y su popover, y tener
 * dos copias garantizaba que un día el mismo archivo se viera como "1.4 MB" en un sitio y
 * "1,4 MB" en el otro.
 */
export function fmtBytes(n: number): string {
  if (!n || n < 0) return ''
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}
