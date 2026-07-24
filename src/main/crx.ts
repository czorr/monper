import { join, dirname } from 'path'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { inflateRawSync } from 'zlib'
import { net } from 'electron'

/**
 * Descarga e instala una extensión desde la Chrome Web Store.
 * Un .crx es un ZIP con cabecera; lo desempaquetamos con zlib (sin dependencias nuevas)
 * porque el flujo "Añadir a Chrome" de la Store no funciona fuera de Chrome.
 */

/** Extrae el id de 32 letras de una URL de la Store (o lo devuelve si ya es un id). */
export function extensionIdFrom(input: string): string | null {
  const s = input.trim()
  if (/^[a-p]{32}$/.test(s)) return s
  const m = s.match(/\/detail\/(?:[^/]+\/)?([a-p]{32})/) || s.match(/([a-p]{32})/)
  return m ? m[1] : null
}

function download(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, redirect: 'follow' })
    const chunks: Buffer[] = []
    req.on('response', (res) => {
      if (res.statusCode >= 400) { reject(new Error(`HTTP ${res.statusCode} al descargar la extensión`)); return }
      res.on('data', (c) => chunks.push(Buffer.from(c)))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
}

/** Quita la cabecera CRX (v2 o v3) y devuelve el ZIP que hay dentro. */
function crxToZip(buf: Buffer): Buffer {
  if (buf.slice(0, 4).toString() !== 'Cr24') return buf // ya es un zip
  const version = buf.readUInt32LE(4)
  if (version === 3) return buf.slice(12 + buf.readUInt32LE(8))
  // CRX2: magic(4) version(4) pubKeyLen(4) sigLen(4) + claves
  return buf.slice(16 + buf.readUInt32LE(8) + buf.readUInt32LE(12))
}

/** Lector de ZIP mínimo: recorre el directorio central e infla cada entrada. */
function unzip(zip: Buffer, dest: string): void {
  // End of Central Directory: buscamos su firma desde el final.
  let eocd = -1
  for (let i = zip.length - 22; i >= 0 && i > zip.length - 66000; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('El archivo de la extensión no es un ZIP válido.')
  const count = zip.readUInt16LE(eocd + 10)
  let p = zip.readUInt32LE(eocd + 16) // offset del directorio central

  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) break
    const method = zip.readUInt16LE(p + 10)
    const compSize = zip.readUInt32LE(p + 20)
    const nameLen = zip.readUInt16LE(p + 28)
    const extraLen = zip.readUInt16LE(p + 30)
    const commentLen = zip.readUInt16LE(p + 32)
    const localOff = zip.readUInt32LE(p + 42)
    const name = zip.slice(p + 46, p + 46 + nameLen).toString('utf8')
    p += 46 + nameLen + extraLen + commentLen

    // Cabecera local: los tamaños de nombre/extra pueden diferir del directorio central.
    if (zip.readUInt32LE(localOff) !== 0x04034b50) continue
    const lNameLen = zip.readUInt16LE(localOff + 26)
    const lExtraLen = zip.readUInt16LE(localOff + 28)
    const start = localOff + 30 + lNameLen + lExtraLen
    const data = zip.slice(start, start + compSize)

    // Zip-slip: nunca escribas fuera del destino.
    if (name.includes('..') || name.startsWith('/')) continue
    const out = join(dest, name)
    if (name.endsWith('/')) { mkdirSync(out, { recursive: true }); continue }
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, method === 8 ? inflateRawSync(data) : data)
  }
}

/** Descarga la extensión y la deja desempaquetada en `dest`. Devuelve la ruta. */
export async function installCrx(extensionId: string, dest: string, chromeVersion: string): Promise<string> {
  const url =
    'https://clients2.google.com/service/update2/crx' +
    `?response=redirect&acceptformat=crx2,crx3&prodversion=${encodeURIComponent(chromeVersion)}` +
    `&x=${encodeURIComponent(`id=${extensionId}&uc`)}`
  const crx = await download(url)
  if (crx.length < 100) throw new Error('La descarga vino vacía (¿id incorrecto?).')
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  try {
    unzip(crxToZip(crx), dest)
  } catch (e) {
    rmSync(dest, { recursive: true, force: true })
    throw e
  }
  return dest
}
