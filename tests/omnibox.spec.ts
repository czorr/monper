import { test, expect } from '@playwright/test'
import { urlVisible } from '../src/shared/url'

/**
 * La invariante del completado inline: **lo que se muestra y lo que se completa tienen que ser
 * la misma cadena**.
 *
 * Estaban calculadas por separado —el main quitaba el `www.`, el renderer no— y el resultado
 * era que al escribir "medio" no se autocompletaba nada, aunque en pantalla pusiera
 * `mediotiempo.com`. Google devuelve `https://www.mediotiempo.com/`, así que la base era
 * `www.mediotiempo.com` y no empezaba por lo escrito.
 *
 * No necesita lanzar la app: es una función pura, y una regresión aquí se ve antes.
 */

test('la forma visible de una URL es lo que una persona escribiría', () => {
  expect(urlVisible('https://www.mediotiempo.com/')).toBe('mediotiempo.com')
  expect(urlVisible('http://github.com/czorr/monper')).toBe('github.com/czorr/monper')
  expect(urlVisible('https://www.google.com')).toBe('google.com')
  // `www` como parte del nombre, no como subdominio: no se toca.
  expect(urlVisible('https://wwwhatsnew.com')).toBe('wwwhatsnew.com')
  // Sin protocolo también vale: llega así desde el propio input.
  expect(urlVisible('www.notion.so/')).toBe('notion.so')
})

test('lo escrito completa contra la forma visible, con www o sin él', () => {
  // El caso exacto del bug, escrito como se vive: escribo "medio" y Google me da la URL con www.
  const escrito = 'medio'
  const base = urlVisible('https://www.mediotiempo.com/')
  expect(base.startsWith(escrito), 'sin esto no se autocompleta nada').toBe(true)
  expect(base.length).toBeGreaterThan(escrito.length)
})

test('es idempotente: aplicarla dos veces no cambia nada', () => {
  // El main la aplica para mostrar y el renderer para completar; si no fuera idempotente,
  // pasar una URL ya normalizada la rompería.
  for (const u of ['https://www.mediotiempo.com/', 'github.com/x', 'https://a.b.co/p/']) {
    expect(urlVisible(urlVisible(u))).toBe(urlVisible(u))
  }
})
