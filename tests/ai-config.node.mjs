import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, unwatchFile } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

// Pruebas del proceso main sin abrir Electron ni hacer llamadas a proveedores reales.
const folder = mkdtempSync(join(tmpdir(), 'titanio-ai-config-'))
const result = await build({
  stdin: { contents: `export * from './src/main/ai/store'; export * from './src/main/ai/config'; export { initVault, add as addVault } from './src/main/vault/store'; export { initPerfiles } from './src/main/perfiles'`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'cjs', write: false, external: ['jsonc-parser', 'zod'],
  plugins: [{ name: 'electron-test', setup(b) {
    b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'test' }))
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
      export const app = { getPath: () => ${JSON.stringify(folder)} };
      export const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() };
      export const net = { fetch: async () => { throw new Error('offline'); } };
    ` }))
  } }]
})
const module = { exports: {} }
new Function('require', 'module', 'exports', result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports)
const ai = module.exports

test('configuración bidireccional de proveedores', async (t) => {
  t.after(() => { unwatchFile(join(folder, 'titanio.jsonc')); rmSync(folder, { recursive: true, force: true }) })
  ai.initVault()
  ai.initPerfiles(folder)
  const legacy = ai.addVault('ai-key', 'Existing', { kind: 'openai' }, 'private-test-key')
  ai.initAI()
  const file = ai.providerConfigPath()

  await t.test('migra los providers sin escribir sus claves en JSONC', () => {
    assert.equal(ai.listProviders()[0].id, legacy.id)
    assert.equal(ai.listProviders()[0].hasKey, true)
    assert.ok(!readFileSync(file, 'utf8').includes('private-test-key'))
    assert.equal(ai.getActiveProvider().key, 'private-test-key')
  })

  await t.test('lee comentarios, trailing commas, referencias de entorno y modelos externos', () => {
    process.env.TITANIO_CONFIG_TEST_KEY = 'environment-test-key'
    writeFileSync(file, `{
      // conservar este comentario
      "provider": { "custom": { "name": "Custom", "kind": "openai",
        "options": { "baseURL": "https://example.com/v1", "apiKey": "{env:TITANIO_CONFIG_TEST_KEY}" },
        "models": { "gemma": { "id": "gemma-deployment", "name": "Gemma", "limit": { "context": 8192 } } },
      } },
    }`)
    const state = ai.providerSettings()
    assert.equal(state.error, undefined)
    assert.equal(state.providers[0].envVar, 'TITANIO_CONFIG_TEST_KEY')
    assert.equal(ai.getActiveProvider().model, 'gemma-deployment')
    assert.equal(ai.getActiveProvider().key, 'environment-test-key')
    assert.ok(!JSON.stringify(state).includes('environment-test-key'))
    delete process.env.TITANIO_CONFIG_TEST_KEY
  })

  await t.test('la UI conserva comentarios, alias y campos avanzados del modelo', () => {
    const state = ai.providerSettings()
    ai.saveProvider({ id: 'custom', label: 'Renamed', kind: 'openai', baseUrl: 'https://example.com/v1', models: [{ id: 'gemma-deployment', name: 'Gemma renamed' }] }, '', state.revision)
    const text = readFileSync(file, 'utf8')
    assert.ok(text.includes('// conservar este comentario'))
    const model = ai.parseConfig(text).provider.custom.models.gemma
    assert.equal(model.id, 'gemma-deployment')
    assert.equal(model.limit.context, 8192)
    assert.equal(model.name, 'Gemma renamed')
  })

  await t.test('rechaza una edición obsoleta sin borrar los cambios externos', () => {
    const { revision } = ai.providerSettings()
    const external = readFileSync(file, 'utf8').replace('Renamed', 'External')
    writeFileSync(file, external)
    assert.throws(() => ai.saveProvider({ id: 'custom', label: 'Stale', kind: 'openai' }, '', revision), /cambió/)
    assert.equal(readFileSync(file, 'utf8'), external)
  })

  await t.test('un JSONC inválido mantiene la última configuración y bloquea escrituras', () => {
    const previous = readFileSync(file, 'utf8')
    writeFileSync(file, '{ invalid')
    assert.match(ai.providerSettings().error, /línea/)
    assert.equal(ai.listProviders()[0].label, 'External')
    assert.throws(() => ai.removeProvider('custom'), /JSONC inválido/)
    assert.equal(readFileSync(file, 'utf8'), '{ invalid')
    writeFileSync(file, previous)
  })

  await t.test('valida URLs y referencias sin divulgar claves pegadas por error', () => {
    assert.throws(() => ai.parseConfig(JSON.stringify({ provider: { p: { name: 'P', kind: 'openai', options: { baseURL: 'file:///tmp/x' } } } })))
    assert.throws(() => ai.parseConfig(JSON.stringify({ provider: { p: { name: 'P', kind: 'openai', options: { apiKey: 'secret-value' } } } })), (e) => !e.message.includes('secret-value'))
  })

  await t.test('crear y eliminar desde la UI se refleja en el archivo', () => {
    const state = ai.providerSettings()
    const next = ai.saveProvider({ label: 'UI connection', kind: 'anthropic', models: [{ id: 'model-id', name: 'Model' }] }, 'new-test-key', state.revision)
    const added = next.providers.find((p) => p.label === 'UI connection')
    assert.ok(added.hasKey)
    ai.setActive(added.id)
    assert.equal(ai.getActiveProvider().key, 'new-test-key')
    assert.equal(ai.getActiveProvider().model, 'model-id')
    assert.ok(!readFileSync(file, 'utf8').includes('new-test-key'))
    ai.removeProvider(added.id, next.revision)
    assert.equal(ai.parseConfig(readFileSync(file, 'utf8')).provider[added.id], undefined)
  })

  await t.test('distingue un proveedor ausente de una conexión sin credenciales', () => {
    writeFileSync(file, '{"provider":{}}')
    assert.equal(ai.prepareActiveProvider().error.tipo, 'sin-proveedor')
    writeFileSync(file, JSON.stringify({ provider: { azure: {
      name: 'Azure OpenAI', kind: 'openai',
      options: { apiKey: '{env:TITANIO_MISSING_TEST_KEY}' },
      models: { 'gpt-test': { name: 'GPT test' } }
    } } }))
    delete process.env.TITANIO_MISSING_TEST_KEY
    const missing = ai.prepareActiveProvider()
    assert.equal(missing.ok, false)
    assert.equal(missing.error.tipo, 'auth')
    assert.match(missing.error.titulo, /Azure OpenAI/)
    assert.match(missing.error.detalle, /TITANIO_MISSING_TEST_KEY/)
    assert.equal(missing.error.accion.kind, 'settings')
    process.env.TITANIO_MISSING_TEST_KEY = 'only-main-can-see-this'
    const ready = ai.prepareActiveProvider()
    assert.equal(ready.ok, true)
    assert.equal(ready.active.model, 'gpt-test')
    assert.equal(ready.active.key, 'only-main-can-see-this')
    delete process.env.TITANIO_MISSING_TEST_KEY
  })

  await t.test('explica una clave sin configurar o inaccesible en el Vault', () => {
    const provider = { name: 'Custom', kind: 'openai', options: {} }
    writeFileSync(file, JSON.stringify({ provider: { custom: provider } }))
    const unconfigured = ai.prepareActiveProvider()
    assert.equal(unconfigured.error.tipo, 'auth')
    assert.match(unconfigured.error.detalle, /no tiene una API key/)
    provider.options.apiKey = '{vault:missing-key}'
    writeFileSync(file, JSON.stringify({ provider: { custom: provider } }))
    const unreadable = ai.prepareActiveProvider()
    assert.equal(unreadable.error.tipo, 'auth')
    assert.match(unreadable.error.detalle, /Vault/)
  })

  await t.test('bloquea el envío con configuración inválida o sin modelos', () => {
    writeFileSync(file, '{ invalid')
    assert.equal(ai.prepareActiveProvider().error.tipo, 'proveedor')
    writeFileSync(file, JSON.stringify({ provider: { custom: {
      name: 'Custom', kind: 'openai',
      options: { baseURL: 'https://example.com/v1', apiKey: `{vault:${legacy.id}}` }
    } } }))
    assert.equal(ai.prepareActiveProvider().error.tipo, 'modelo')
  })
})
