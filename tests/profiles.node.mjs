import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, unwatchFile } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const folder = mkdtempSync(join(tmpdir(), 'titanio-profiles-'))
const result = await build({
  stdin: { contents: `export * as profiles from './src/main/perfiles'; export * as ai from './src/main/ai/store'; export * as vault from './src/main/vault/store'; export * from './src/shared/profiles'; export * from './src/main/agent/profile';`, resolveDir: process.cwd() },
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
const { profiles: p, ai, vault, searchUrlFor, profileTools, profileInstructions, defaultProfilePreferences } = module.exports

test('personalización y aislamiento de perfiles', async (t) => {
  t.after(() => { unwatchFile(join(folder, 'titanio.jsonc')); rmSync(folder, { recursive: true, force: true }) })
  writeFileSync(join(folder, 'perfiles.json'), JSON.stringify({ activo: 'default', perfiles: [{ id: 'default', nombre: 'Personal', avatar: null }] }))
  writeFileSync(join(folder, 'panels.json'), JSON.stringify({ tint: '#164e63' }))
  p.initPerfiles(folder)

  await t.test('migra perfiles existentes y conserva el tema anterior', () => {
    assert.equal(p.profileSettings().profiles[0].nombre, 'Personal')
    assert.equal(p.preferencesFor().tint, '#164e63')
    assert.equal(p.preferencesFor().searchEngine, 'google')
    assert.ok(p.preferencesFor().agent.browserTools)
  })

  const work = p.crearPerfil('Trabajo')
  await t.test('guarda identidad, navegación e instrucciones sin modificar otro perfil', () => {
    const profile = p.profileSettings().profiles.find((x) => x.id === work.id)
    profile.preferences.color = '#2563eb'
    profile.preferences.icon = 'briefcase'
    profile.preferences.homePage = 'https://example.com/work'
    profile.preferences.newTab = 'home'
    profile.preferences.searchEngine = 'duckduckgo'
    profile.preferences.agent.instructions = 'Responde de forma concisa.'
    profile.preferences.agent.browserTools = false
    p.updateBrowserProfile(profile)
    p.initPerfiles(folder)
    assert.equal(p.preferencesFor(work.id).homePage, 'https://example.com/work')
    assert.equal(p.preferencesFor(work.id).icon, 'briefcase')
    assert.equal(p.preferencesFor().homePage, '')
    assert.equal(p.preferencesFor().agent.instructions, '')
  })

  await t.test('rechaza URLs internas y preferencias inválidas sin sobrescribir datos', () => {
    const profile = p.profileSettings().profiles.find((x) => x.id === work.id)
    const before = readFileSync(join(folder, 'perfiles.json'), 'utf8')
    profile.preferences.homePage = 'javascript:alert(1)'
    assert.throws(() => p.updateBrowserProfile(profile))
    assert.equal(readFileSync(join(folder, 'perfiles.json'), 'utf8'), before)
  })

  await t.test('las rutas de MCP, skills, apariencia y modelo están separadas', () => {
    for (const file of ['mcp-servers.json', 'skills-enabled.json', 'panels.json', 'chat.json']) {
      p.activarPerfil('default')
      const personal = p.rutaDePerfil(file)
      p.activarPerfil(work.id)
      const business = p.rutaDePerfil(file)
      assert.notEqual(personal, business)
      assert.ok(business.includes(join('perfiles', work.id)))
    }
  })

  await t.test('cada buscador produce la URL esperada y escapa la consulta', () => {
    for (const [engine, host] of Object.entries({ google: 'www.google.com', duckduckgo: 'duckduckgo.com', bing: 'www.bing.com', brave: 'search.brave.com' })) {
      const url = new URL(searchUrlFor('a & b', engine))
      assert.equal(url.hostname, host)
      assert.equal(url.searchParams.get('q'), 'a & b')
    }
  })

  await t.test('desactivar herramientas las retira del agente y conserva sus instrucciones', () => {
    const prefs = p.preferencesFor(work.id).agent
    prefs.mcp = false
    prefs.skills = false
    const selected = profileTools({ run_js: 1, navigate: 1, click: 1, use_skill: 1, mcp__a__b: 1, memory_read: 1, open_settings: 1 }, prefs)
    assert.deepEqual(Object.keys(selected), ['memory_read', 'open_settings'])
    assert.match(profileInstructions(prefs), /Responde de forma concisa/)
    assert.match(profileInstructions(prefs), /desactivado/)
    assert.equal(Object.keys(profileTools({ run_js: 1, use_skill: 1, mcp__a__b: 1 }, defaultProfilePreferences().agent)).length, 3)
  })

  await t.test('el modelo predeterminado y la última selección no se cruzan entre perfiles', () => {
    vault.initVault()
    p.activarPerfil('default')
    ai.initAI()
    ai.saveProvider({ label: 'Test provider', kind: 'openai', models: [{ id: 'first', name: 'First' }, { id: 'second', name: 'Second' }] }, 'test-key')
    const providerId = ai.listProviders()[0].id
    ai.setModel('first')
    p.activarPerfil(work.id)
    const profile = p.profileSettings().profiles.find((x) => x.id === work.id)
    profile.preferences.agent.defaultModel = { providerId, id: 'second' }
    p.updateBrowserProfile(profile)
    ai.initAI()
    assert.equal(ai.getActiveProvider().model, 'second')
    p.activarPerfil('default')
    ai.initAI()
    assert.equal(ai.getActiveProvider().model, 'first')
  })

  await t.test('un perfil nuevo no reutiliza datos de un perfil retirado', () => {
    const old = p.crearPerfil('Temporal')
    p.dirDePerfil(old.id)
    assert.ok(p.borrarPerfil(old.id))
    const fresh = p.crearPerfil('Temporal')
    assert.notEqual(old.id, fresh.id)
  })
})
