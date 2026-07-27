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
