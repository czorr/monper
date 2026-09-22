// node --experimental-vm-modules --test tests/i18n-unit.cjs
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { stripTypeScriptTypes } = require('node:module')
const { SourceTextModule, SyntheticModule, createContext } = require('node:vm')

function loader(mocks = {}, globals = {}) {
  const context = createContext({ console, ...globals })
  const cache = new Map()
  async function load(file) {
    if (cache.has(file)) return cache.get(file)
    const module = new SourceTextModule(stripTypeScriptTypes(fs.readFileSync(file, 'utf8')), { context, identifier: file })
    cache.set(file, module)
    await module.link(async (name, parent) => {
      if (mocks[name]) {
        const values = mocks[name]
        return new SyntheticModule(Object.keys(values), function () {
          for (const [key, value] of Object.entries(values)) this.setExport(key, value)
        }, { context })
      }
      return load(path.resolve(path.dirname(parent.identifier), name + '.ts'))
    })
    return module
  }
  return async (relative) => {
    const module = await load(path.resolve(__dirname, '../src', relative))
    if (module.status !== 'evaluated') await module.evaluate()
    return module.namespace
  }
}

test('el catálogo tiene ambos idiomas y conserva todos los parámetros', async () => {
  const load = loader()
  const { messages } = await load('shared/locales/messages.ts')
  const { t, setLocale } = await load('shared/i18n.ts')
  const parameters = (s) => [...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort()
  assert.ok(Object.keys(messages).length > 600)
  for (const [key, message] of Object.entries(messages)) {
    assert.ok(message.en && message.es, key)
    assert.deepEqual(parameters(message.en), parameters(message.es), key)
    for (const locale of ['es', 'en']) {
      setLocale(locale)
      assert.equal(t(key), message[locale])
    }
  }
})

test('interpolar no reinterpreta contenido del usuario ni los marcadores de acciones', async () => {
  const { t, setLocale } = await loader()('shared/i18n.ts')
  setLocale('en')
  assert.equal(t('Añadir “{0}” al diccionario', '<b>{1}</b>'), 'Add “<b>{1}</b>” to dictionary')
  assert.match(t('Instrucciones para el agente. Usa {{selection}} para incluir el texto.'), /\{\{selection\}\}/)
})

test('detecta español regional y usa inglés para otros idiomas', async () => {
  const { resolveLocale, isLocale } = await loader()('shared/i18n.ts')
  for (const tag of ['es', 'es-MX', 'es_ES', 'ES-ar']) assert.equal(resolveLocale(tag), 'es')
  for (const tag of ['en-US', 'fr', '', 'esperanto']) assert.equal(resolveLocale(tag), 'en')
  assert.equal(isLocale('fr'), false)
  assert.equal(isLocale('es-MX'), false)
})

test('actualiza suscriptores sin recargar y permite desuscribirse', async () => {
  const { setLocale, subscribeLocale, getLocale } = await loader()('shared/i18n.ts')
  const seen = []
  const off = subscribeLocale(() => seen.push(getLocale()))
  setLocale('en'); setLocale('en'); setLocale('es'); off(); setLocale('en')
  assert.deepEqual(seen, ['en', 'es'])
})

test('el documento y los títulos siguen el idioma, sin modificar los sitios externos', async () => {
  let changed
  const document = { documentElement: { lang: 'es' }, title: '' }
  const language = { initial: 'en', subscribe: (fn) => { changed = fn } }
  await loader({}, { document, location: { pathname: '/settings.html' }, window: { titanioLanguage: language } })('shared/i18n.ts')
  assert.equal(document.documentElement.lang, 'en')
  assert.equal(document.title, 'Settings')
  changed('es')
  assert.equal(document.title, 'Ajustes')
  assert.equal(document.documentElement.lang, 'es')
  const external = { documentElement: { lang: 'fr' }, title: 'Site' }
  await loader({}, { document: external, window: {} })('shared/i18n.ts')
  assert.equal(external.documentElement.lang, 'fr')
  assert.equal(external.title, 'Site')
})

test('guarda el idioma, lo restaura y valida el emisor antes de cambiarlo', async () => {
  const saved = {}
  let writable = true
  const handlers = new Map()
  const sent = []
  let menuChanges = 0
  const load = loader({
    electron: {
      app: { getPath: () => '/user', getLocale: () => 'en-US' },
      ipcMain: { on: (channel, fn) => handlers.set(channel, fn), handle: (channel, fn) => handlers.set(channel, fn) },
      webContents: { getAllWebContents: () => [{ isDestroyed: () => false, send: (...args) => sent.push(args) }] }
    },
    'node:path': { join: path.join },
    './jsonfile': {
      readJson: () => saved,
      writeJson: (_file, data) => { if (!writable) return { ok: false }; Object.assign(saved, data); return { ok: true } }
    }
  })
  const { initLanguage } = await load('main/language.ts')
  const { getLocale } = await load('shared/i18n.ts')
  const initialize = () => initLanguage((url) => url === 'file:///app/settings.html', () => menuChanges++)
  initialize()
  assert.equal(getLocale(), 'en')
  const frame = { url: 'file:///app/settings.html' }
  const event = { senderFrame: frame, sender: { mainFrame: frame } }
  handlers.get('language:set')(event, 'es')
  assert.equal(saved.locale, 'es')
  assert.equal(getLocale(), 'es')
  assert.equal(menuChanges, 1)
  assert.deepEqual(sent, [['language:changed', 'es']])
  assert.throws(() => handlers.get('language:set')(event, 'fr'))
  assert.throws(() => handlers.get('language:set')({ ...event, senderFrame: { url: frame.url } }, 'en'))
  frame.url = 'https://evil.example/settings.html'
  assert.throws(() => handlers.get('language:set')(event, 'en'))
  frame.url = 'file:///app/settings.html'
  writable = false
  assert.throws(() => handlers.get('language:set')(event, 'en'))
  assert.equal(getLocale(), 'es')
  assert.equal(menuChanges, 1)
  initialize()
  assert.equal(getLocale(), 'es')
  const request = {}
  handlers.get('language:get')(request)
  assert.equal(request.returnValue, 'es')
})

test('los menús y opciones estáticas cambian de idioma sin reimportar módulos', async () => {
  const load = loader()
  const { setLocale } = await load('shared/i18n.ts')
  const { EFFORTS } = await load('shared/types.ts')
  const { itemsDeVideo } = await load('main/contextmenu.ts')
  const video = { hay: true, enPip: false, url: 'https://example.com/video.mp4' }
  const actions = { alternarPip() {}, copiarUrl() {}, guardar() {} }
  setLocale('es')
  assert.equal(EFFORTS[0].name, 'Bajo')
  assert.equal(itemsDeVideo(video, actions)[1].label, 'Copiar dirección del vídeo')
  setLocale('en')
  assert.equal(EFFORTS[0].name, 'Low')
  assert.equal(itemsDeVideo(video, actions)[1].label, 'Copy video address')
})

test('las acciones de fábrica se traducen sin cambiar las acciones personalizadas', async () => {
  const load = loader()
  const { setLocale } = await load('shared/i18n.ts')
  const { DEFAULT_QUICK_ACTIONS, localizeQuickAction } = await load('shared/quickactions.ts')
  setLocale('es')
  assert.equal(localizeQuickAction(DEFAULT_QUICK_ACTIONS[0]).name, 'Resumir')
  setLocale('en')
  assert.match(localizeQuickAction(DEFAULT_QUICK_ACTIONS[0]).template, /^Summarize/)
  const custom = { ...DEFAULT_QUICK_ACTIONS[0], template: 'Mi texto' }
  assert.equal(localizeQuickAction(custom), custom)
})

test('el preload sandboxed compilado no depende de require de archivos locales', () => {
  const content = fs.readFileSync(path.resolve(__dirname, '../out/preload/content.js'), 'utf8')
  assert.equal(/require\(["']\./.test(content), false, 'El preload sandboxed debe ser autocontenido')
  assert.match(content, /language:get/)
})
