// node --experimental-vm-modules --test tests/vault-unit.cjs
// Ejecuta el código real con disco y llavero en memoria, sin iniciar Electron.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { stripTypeScriptTypes } = require('node:module')
const { SourceTextModule, SyntheticModule } = require('node:vm')

async function setup(initial = []) {
  const disk = new Map([
    ['/vault/vault.json', structuredClone(initial)],
    ['/vault/vault.secrets.json', Object.fromEntries(initial.map((i) => [i.id, Buffer.from('encrypted:old').toString('base64')]))]
  ])
  const state = { failMeta: false, failEncryption: false, scripts: [] }
  const synthetic = (values) => new SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value)
  })
  const mocks = {
    electron: synthetic({ app: { getPath: () => '/vault' }, safeStorage: {
      isEncryptionAvailable: () => !state.failEncryption,
      encryptString: (value) => Buffer.from('encrypted:' + value),
      decryptString: (value) => value.toString().slice('encrypted:'.length)
    } }),
    path: synthetic({ join }),
    '../jsonfile': synthetic({
      readJson: (file, fallback) => structuredClone(disk.get(file) ?? fallback),
      writeJson: (file, value) => {
        if (state.failMeta && file.endsWith('/vault.json')) return { ok: false }
        disk.set(file, structuredClone(value))
        return { ok: true }
      }
    }),
    './favicons': synthetic({ faviconFor: () => null })
  }
  const load = (file) => new SourceTextModule(stripTypeScriptTypes(readFileSync(join(__dirname, '..', file), 'utf8')), { identifier: file })
  const shared = load('src/shared/vault.ts')
  const i18n = load('src/shared/i18n.ts')
  const messages = load('src/shared/locales/messages.ts')
  await i18n.link(() => messages)
  const store = load('src/main/vault/store.ts')
  const autofill = load('src/main/autofill.ts')
  const link = (specifier) => {
    if (specifier.endsWith('/shared/i18n')) return i18n
    if (specifier.endsWith('/shared/vault')) return shared
    if (specifier === './vault/store') return store
    if (mocks[specifier]) return mocks[specifier]
    throw new Error(`Import inesperado: ${specifier}`)
  }
  await store.link(link)
  await store.evaluate()
  await autofill.link(link)
  await autofill.evaluate()
  store.namespace.initVault()
  return { vault: store.namespace, shared: shared.namespace, autofill: autofill.namespace, disk, state }
}

test('migra credenciales antiguas sin cambiar ids ni secretos', async () => {
  const { vault, disk } = await setup([{ id: 'legacy', type: 'web-credential', label: 'Example', data: { url: 'https://example.com/login', username: ' alice ' } }])
  assert.equal(vault.findCredential('https://example.com', 'alice').id, 'legacy')
  assert.equal(vault.get('legacy').data.origin, 'https://example.com')
  assert.equal(vault.get('legacy').data.url, undefined)
  assert.equal(vault.getSecret('legacy'), 'old')
  assert.equal(disk.get('/vault/vault.json')[0].data.origin, 'https://example.com')
})

test('importar es idempotente por sitio y cuenta, sin reemplazar la contraseña actual', async () => {
  const { vault } = await setup()
  assert.equal(vault.importCredential('https://example.com/login', 'alice', 'first'), true)
  assert.equal(vault.importCredential('https://www.example.com/other', 'alice', 'other'), false)
  assert.equal(vault.importCredential('https://example.com', 'bob', 'second'), true)
  assert.equal(vault.list().length, 2)
  assert.equal(vault.getSecret(vault.findCredential('https://example.com', 'alice').id), 'first')
  assert.equal(vault.findCredential('https://example.com'), undefined)
  assert.equal(vault.findCredential('https://example.com', ''), undefined)
})

test('actualizar una cuenta conserva las otras y permite cambiar el sitio', async () => {
  const { vault } = await setup()
  vault.importCredential('https://example.com', 'alice', 'first')
  vault.importCredential('https://example.com', 'bob', 'second')
  const alice = vault.findCredential('https://example.com', 'alice')
  const bob = vault.findCredential('https://example.com', 'bob')
  vault.update(bob.id, { secret: 'updated' })
  assert.equal(vault.getSecret(alice.id), 'first')
  assert.equal(vault.getSecret(bob.id), 'updated')
  assert.throws(() => vault.update(bob.id, { data: { username: 'alice' } }), /Ya existe/)
  vault.update(alice.id, { data: { origin: 'other.example.com/login', username: 'new-alice' } })
  assert.equal(vault.findCredential('https://example.com', 'alice'), undefined)
  assert.equal(vault.findCredential('https://other.example.com', 'new-alice').id, alice.id)
  assert.equal(vault.getSecret(alice.id), 'first')
})

test('normaliza URLs sin mezclar protocolos, puertos ni subdominios', async () => {
  const { shared } = await setup()
  assert.equal(shared.normalizeCredentialOrigin('localhost:3000/login'), 'https://localhost:3000')
  assert.equal(shared.normalizeCredentialOrigin('HTTP://example.com:80/path'), 'http://example.com')
  for (const url of ['ftp://example.com', 'file:///tmp/secret', 'javascript:alert(1)', 'https://user:password@example.com', '']) {
    assert.equal(shared.normalizeCredentialOrigin(url), null)
  }
  assert.equal(shared.sameCredentialSite('https://example.com', 'https://www.example.com'), true)
  for (const url of ['http://example.com', 'https://login.example.com', 'https://example.com:444', 'https://example.com.attacker.test']) {
    assert.equal(shared.sameCredentialSite('https://example.com', url), false)
  }
})

test('edita tokens preservando metadata y conserva el secreto cuando no se reemplaza', async () => {
  const { vault } = await setup()
  const token = vault.add('service-token', 'Token', { service: 'old', account: 'old', extra: 'keep' }, 'secret')
  vault.update(token.id, { label: 'Nuevo', data: { service: 'github', account: 'alice' } })
  assert.equal(vault.get(token.id).data.extra, 'keep')
  assert.equal(vault.get(token.id).data.account, 'alice')
  assert.equal(vault.getSecret(token.id), 'secret')
  vault.update(token.id, { secret: 'replacement' })
  assert.equal(vault.getSecret(token.id), 'replacement')
})

test('un fallo al guardar no aplica metadata ni deja un reemplazo parcial', async () => {
  const { vault, state } = await setup()
  const item = vault.add('secret', 'Original', {}, 'original')
  state.failEncryption = true
  assert.throws(() => vault.update(item.id, { label: 'Changed', secret: 'new' }))
  assert.equal(vault.get(item.id).label, 'Original')
  state.failEncryption = false
  state.failMeta = true
  assert.throws(() => vault.update(item.id, { label: 'Changed', secret: 'new' }))
  assert.equal(vault.get(item.id).label, 'Original')
  assert.equal(vault.getSecret(item.id), 'original')
  assert.throws(() => vault.add('secret', 'Failed', {}, 'new'))
  assert.equal(vault.list().length, 1)
})

test('autorrelleno enumera ambas cuentas y solo inyecta la elegida en el sitio correspondiente', async () => {
  const { vault, autofill, state } = await setup()
  vault.importCredential('https://example.com', 'alice', 'first')
  vault.importCredential('https://example.com', 'bob', 'second')
  const choices = autofill.credentialsFor('https://example.com')
  assert.equal(choices.length, 2)
  const wc = { getURL: () => 'https://example.com/login', executeJavaScript: async (script) => { state.scripts.push(script); return ['username', 'password'] } }
  await autofill.fillFromVault(wc, choices.find((i) => i.username === 'bob').id)
  assert.match(state.scripts[0], /"second"/)
  assert.doesNotMatch(state.scripts[0], /"first"/)
  wc.getURL = () => 'https://other.example.com'
  assert.deepEqual(await autofill.fillFromVault(wc, choices[0].id), [])
  assert.equal(state.scripts.length, 1)
})
