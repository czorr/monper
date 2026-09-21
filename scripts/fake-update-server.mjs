#!/usr/bin/env node
/**
 * Servidor de actualizaciones de prueba.
 *
 * Publica un `latest-mac.yml` válido (con su sha512 y tamaño reales) apuntando a un ZIP,
 * para poder probar el ciclo de actualización SIN cuenta de Apple ni release en GitHub:
 * detección → descarga con progreso → verificación de integridad.
 *
 *   node scripts/fake-update-server.mjs                 # ZIP de relleno (rápido)
 *   node scripts/fake-update-server.mjs --version 0.3.0
 *   node scripts/fake-update-server.mjs --zip release/Titanio-0.1.0-arm64-mac.zip
 *
 * Y en otra terminal:
 *   MONPER_UPDATE_FEED=http://localhost:8788 pnpm dev
 *   # o sobre la app empaquetada:
 *   MONPER_UPDATE_FEED=http://localhost:8788 ./release/mac-arm64/Titanio.app/Contents/MacOS/Titanio
 *
 * OJO: la INSTALACIÓN fallará si la app no está firmada — macOS lo exige. Esto verifica
 * todo lo anterior, que es justo lo que no podíamos comprobar.
 */
import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, basename } from 'node:path'

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const PORT = Number(arg('port', '8788'))
const VERSION = arg('version', '0.2.0')
const ARCH = arg('arch', 'arm64')
const SRC_ZIP = arg('zip', null)
const DIR = join(process.cwd(), '.update-test')

mkdirSync(DIR, { recursive: true })

// El ZIP: uno real si nos lo dan, o relleno si solo queremos probar el flujo.
const zipName = `Titanio-${VERSION}-${ARCH}-mac.zip`
let zip
if (SRC_ZIP) {
  if (!existsSync(SRC_ZIP)) {
    console.error(`No existe ${SRC_ZIP}. Genera uno con: pnpm dist:mac`)
    process.exit(1)
  }
  zip = readFileSync(SRC_ZIP)
  console.log(`ZIP real: ${basename(SRC_ZIP)} (${(zip.length / 1e6).toFixed(1)} MB)`)
} else {
  // Tiene que ser un ZIP VÁLIDO, no bytes al azar: electron-updater lo descomprime en
  // cuanto acaba la descarga, así que un relleno inválido falla ahí y parece que la
  // descarga se rompió. Dentro va basura incompresible solo para que pese y se vea el %.
  const pad = join(DIR, 'payload.bin')
  writeFileSync(pad, randomBytes(8 * 1024 * 1024))
  const tmpZip = join(DIR, 'filler.zip')
  rmSync(tmpZip, { force: true })
  try {
    execFileSync('zip', ['-q', '-0', '-j', tmpZip, pad])
  } catch {
    console.error('No se pudo crear el ZIP de relleno (falta el binario `zip`).')
    console.error('Usa uno real: pnpm dist:mac && node scripts/fake-update-server.mjs --zip release/Titanio-0.1.0-arm64-mac.zip')
    process.exit(1)
  }
  zip = readFileSync(tmpZip)
  rmSync(pad, { force: true })
  console.log(`ZIP de relleno válido: ${(zip.length / 1e6).toFixed(1)} MB (la instalación no se prueba)`)
}
writeFileSync(join(DIR, zipName), zip)

// electron-updater valida el sha512 en base64 del archivo descargado.
const sha512 = createHash('sha512').update(zip).digest('base64')
const yml = [
  `version: ${VERSION}`,
  'files:',
  `  - url: ${zipName}`,
  `    sha512: ${sha512}`,
  `    size: ${zip.length}`,
  `path: ${zipName}`,
  `sha512: ${sha512}`,
  `releaseDate: '${new Date(0).toISOString()}'`,
  ''
].join('\n')
writeFileSync(join(DIR, 'latest-mac.yml'), yml)

const server = createServer((req, res) => {
  const name = decodeURIComponent((req.url ?? '/').split('?')[0].replace(/^\/+/, ''))
  const file = join(DIR, name)
  if (!name || !existsSync(file)) {
    console.log('404', name || '/')
    res.writeHead(404).end('not found')
    return
  }
  const body = readFileSync(file)
  console.log('200', name, `(${body.length} bytes)`)
  res.writeHead(200, {
    'content-type': name.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream',
    'content-length': String(body.length)
  }).end(body)
})

// Si el puerto está ocupado (típicamente por otra instancia de este mismo script),
// dilo en una línea con la solución, en vez de escupir un stack trace de Node.
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\nEl puerto ${PORT} ya está en uso. Libéralo o usa otro:`)
    console.error(`  lsof -ti:${PORT} | xargs kill`)
    console.error(`  node scripts/fake-update-server.mjs --port ${PORT + 1}\n`)
  } else {
    console.error('\nNo se pudo arrancar el servidor:', e.message, '\n')
  }
  process.exit(1)
})

server.listen(PORT, () => {
  console.log(`\nFeed de prueba en http://localhost:${PORT}`)
  console.log(`  versión ofrecida : ${VERSION}  (la app debe tener una MENOR)`)
  console.log(`  archivos         : latest-mac.yml, ${zipName}`)
  console.log(`\nArranca Titanio con:\n  MONPER_UPDATE_FEED=http://localhost:${PORT} pnpm dev\n`)
  console.log('Ctrl+C para detenerlo.\n')
})
