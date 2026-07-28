/**
 * La URL como la escribiría una persona: sin protocolo, sin `www.` y sin barra final.
 *
 * Vive en `shared` porque la usan LOS DOS lados y tienen que coincidir carácter a carácter:
 * el main la usa para el subtexto de la sugerencia (lo que ves) y el renderer para el
 * completado inline (lo que se escribe solo).
 *
 * Estaban implementadas por separado y se desincronizaron: el main quitaba el `www.` y el
 * renderer no. Google devuelve `https://www.mediotiempo.com/`, así que al escribir "medio" la
 * base de completado era `www.mediotiempo.com` — que no empieza por "medio" — y **no
 * completaba nada**, mientras en pantalla ponía `mediotiempo.com` e invitaba a esperar que sí.
 * Un bug invisible en el código y evidente en la pantalla.
 */
export function urlVisible(url: string): string {
  return url
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '')
}

/**
 * Un nombre legible para una URL sin título.
 *
 * Hace falta porque **Chromium guarda marcadores con el nombre vacío**: los que arrastras a la
 * barra o guardas con ⌘D sin tocar el título. Medido en un perfil real: 20 de 79. Cayendo a la
 * URL cruda, el sidebar se llena de `https://supabase.com/dashboard/project/sqlaum…` en vez de
 * "Supabase".
 *
 * Es mecánico a propósito, sin tabla de marcas: una lista de nombres bonitos envejece mal y
 * hay que mantenerla. "Youtube" en vez de "YouTube" es un precio pequeño por que funcione
 * igual con el panel interno de tu empresa.
 */
export function nombreDeUrl(url: string): string {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return url
  }
  const host = u.hostname.replace(/^www\./i, '')

  // localhost, IPs y hosts sin punto se quedan tal cual, CON el puerto: en desarrollo el
  // puerto es lo único que distingue un proyecto de otro.
  if (!host.includes('.') || /^[\d.]+$/.test(host)) return u.port ? `${host}:${u.port}` : host

  const partes = host.split('.')
  // TLDs compuestos (co.uk, com.mx): sin esto `bbc.co.uk` se quedaría en "Co".
  const compuesto = partes.length > 2 && ['co', 'com', 'net', 'org', 'gov', 'edu', 'ac'].includes(partes[partes.length - 2]!)
  const nombre = partes[partes.length - (compuesto ? 3 : 2)] ?? host
  return nombre.charAt(0).toUpperCase() + nombre.slice(1)
}
