/**
 * La identidad de Chrome que Titanio presenta a la web.
 *
 * Esto vive en `shared` a propósito: la identidad se declara en DOS sitios —la cabecera
 * `Sec-CH-UA` (main, `chromehints.ts`) y `navigator.userAgentData` (preload, `content.ts`)—
 * y **si los dos no dicen exactamente lo mismo es peor que no tocar nada**: una web que lea
 * las dos fuentes ve una incoherencia que ningún navegador real produce, y eso delata más
 * que la marca que falta.
 *
 * Por qué hace falta: Electron se anuncia como `Chromium`, nunca como `Google Chrome`. La UA
 * de texto ya se corrige en `index.ts`, pero Client Hints es una fuente aparte, y es la que
 * usa Google para el "This browser or app may not be secure" que bloquea el login.
 *
 * Medido en Electron 43 (Chromium 150): `navigator.userAgentData.brands` devolvía
 * `[Not;A=Brand, Chromium]` — sin `Google Chrome` — y `window.chrome` estaba vacío.
 */

export interface Brand {
  brand: string
  version: string
}

/**
 * La marca "Not;A=Brand" es el GREASE de Chrome: basura deliberada para que nadie parsee la
 * lista asumiendo un orden fijo. Chrome la varía entre versiones; aquí es estable porque una
 * lista que cambia sola sería una señal más, no menos.
 */
export function chromeBrands(majorVersion: string): Brand[] {
  return [
    { brand: 'Not;A=Brand', version: '24' },
    { brand: 'Chromium', version: majorVersion },
    { brand: 'Google Chrome', version: majorVersion }
  ]
}

/** Las mismas marcas con la versión completa (`sec-ch-ua-full-version-list`). */
export function chromeFullVersionBrands(fullVersion: string): Brand[] {
  return [
    { brand: 'Not;A=Brand', version: '24.0.0.0' },
    { brand: 'Chromium', version: fullVersion },
    { brand: 'Google Chrome', version: fullVersion }
  ]
}

/** Serializa una lista de marcas al formato de cabecera: `"Marca";v="150", …` */
export function brandsToHeader(brands: Brand[]): string {
  return brands.map((b) => `"${b.brand}";v="${b.version}"`).join(', ')
}

/** Mayor de una versión completa: `150.0.7871.129` → `150`. */
export function majorOf(fullVersion: string): string {
  return fullVersion.split('.')[0] ?? fullVersion
}
