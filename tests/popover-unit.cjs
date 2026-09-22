// node --experimental-vm-modules --test tests/popover-unit.cjs
// Ciclo de apertura real con ventanas simuladas; no inicia Electron.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { stripTypeScriptTypes } = require('node:module')
const { SourceTextModule, SyntheticModule, createContext } = require('node:vm')

async function setup() {
  const windows = []
  class Window extends EventEmitter {
    constructor() {
      super()
      windows.push(this)
      this.webContents = new EventEmitter()
      this.webContents.send = () => {}
      this.visible = false
      this.destroyed = false
      this.shows = 0
    }
    isDestroyed() { return this.destroyed }
    isVisible() { return this.visible }
    setBounds() {}
    loadFile() {}
    show() { this.visible = true; this.shows++ }
    focus() {}
    hide() { this.visible = false }
  }
  const context = createContext({ __dirname: '/app/main' })
  const synthetic = (values) => new SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value)
  }, { context })
  const source = readFileSync(join(__dirname, '../src/main/popover.ts'), 'utf8')
  const module = new SourceTextModule(stripTypeScriptTypes(source), { context })
  const mocks = { path: synthetic({ join }), electron: synthetic({ BrowserWindow: Window, ipcMain: new EventEmitter() }) }
  await module.link((name) => mocks[name])
  await module.evaluate()
  const parent = { getContentBounds: () => ({ x: 0, y: 0, width: 1000, height: 800 }) }
  const menu = module.namespace.createPopover(() => parent, { name: 'profilemenu', width: 240, preload: 'profilemenu', page: 'profilemenu' })
  return { menu, windows, anchor: { x: 20, y: 40, width: 100, height: 32 } }
}

test('preparar el menú no lo muestra y el clic posterior no espera otro ready-to-show', async () => {
  const { menu, windows, anchor } = await setup()
  const warm = menu.ensure()
  assert.equal(warm.visible, false)
  warm.emit('ready-to-show')
  menu.show(anchor)
  assert.equal(warm.shows, 1)
  menu.hide()
  menu.show(anchor)
  assert.equal(warm.shows, 2)
  assert.equal(windows.length, 1)
})

test('cancelar una apertura fría impide que aparezca al terminar de cargar', async () => {
  const { menu, windows, anchor } = await setup()
  menu.show(anchor)
  assert.equal(windows[0].visible, false)
  menu.hide()
  windows[0].emit('ready-to-show')
  assert.equal(windows[0].shows, 0)
})

test('si se destruye la ventana, espera el primer frame de la nueva', async () => {
  const { menu, windows, anchor } = await setup()
  menu.ensure().emit('ready-to-show')
  windows[0].destroyed = true
  menu.show(anchor)
  assert.equal(windows.length, 2)
  assert.equal(windows[1].shows, 0)
  windows[1].emit('ready-to-show')
  assert.equal(windows[1].shows, 1)
})
