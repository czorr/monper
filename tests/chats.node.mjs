import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const folder = mkdtempSync(join(tmpdir(), 'titanio-chats-'))
const result = await build({
  entryPoints: ['src/main/chats.ts'], bundle: true, platform: 'node', format: 'cjs', write: false,
  plugins: [{ name: 'electron-test', setup(b) {
    b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'test' }))
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `export const app = { getPath: () => ${JSON.stringify(folder)} };` }))
  } }]
})
const module = { exports: {} }
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const chats = module.exports

test('persistencia del historial con errores del agente', async (t) => {
  t.after(() => rmSync(folder, { recursive: true, force: true }))
  chats.initChats()
  const { id } = chats.startSession()
  const fail = {
    tipo: 'auth', titulo: 'Faltan credenciales para Azure OpenAI',
    detalle: 'La variable AZURE_API_KEY no está disponible.',
    accion: { label: 'Revisar conexión', kind: 'settings' }
  }

  await t.test('guarda un error sin pasos y lo recupera tras reiniciar', () => {
    chats.saveSession(id, [
      { role: 'user', text: 'Hola' },
      { role: 'assistant', parts: [{ type: 'fail', fail }] }
    ])
    chats.initChats()
    assert.deepEqual(chats.openSession(id).messages[1].parts, [{ type: 'fail', fail }])
  })

  await t.test('conserva texto, pasos y errores en orden, sin imágenes en disco', () => {
    chats.saveSession(id, [
      { role: 'user', text: 'Mira esta página', attachments: [{ type: 'image', dataUrl: 'data:image/png;base64,PRIVATE' }] },
      { role: 'assistant', parts: [
        { type: 'text', text: 'Revisando' },
        { type: 'step', step: { state: 'working', label: 'Captura', image: 'data:image/png;base64,SCREENSHOT' } },
        { type: 'fail', fail }
      ] }
    ])
    const text = readFileSync(join(folder, 'chats.json'), 'utf8')
    assert.ok(!text.includes('data:image'))
    chats.initChats()
    const messages = chats.openSession(id).messages
    assert.equal(messages[0].attachments, 1)
    assert.deepEqual(messages[1].parts, [
      { type: 'text', text: 'Revisando' },
      { type: 'step', step: { state: 'working', label: 'Captura' }, hadImage: true },
      { type: 'fail', fail }
    ])
  })

  await t.test('un paso malformado no destruye el historial anterior', () => {
    const before = readFileSync(join(folder, 'chats.json'), 'utf8')
    assert.throws(() => chats.saveSession(id, [{ role: 'assistant', parts: [{ type: 'step' }] }]))
    assert.equal(readFileSync(join(folder, 'chats.json'), 'utf8'), before)
    assert.equal(chats.openSession(id).messages[1].parts[2].type, 'fail')
  })
})
