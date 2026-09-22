// node --experimental-vm-modules --test tests/skills-unit.cjs
// Almacenamiento real de skills con el sistema de archivos en memoria, sin Electron.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { stripTypeScriptTypes } = require('node:module')
const { SourceTextModule, SyntheticModule } = require('node:vm')

const ORIGINAL = '---\nname: Example\ndescription: Original description\nauthor: Titanio\nicon: pencil\nkeywords: [one, two]\n---\n# Original\nInstructions\n'
const BUILTIN = '/app/resources/skills/example/SKILL.md'
const LOCAL = '/user/skills/example/SKILL.md'

async function setup() {
  const files = new Map([[BUILTIN, ORIGINAL]])
  const dirs = new Set(['/user/skills'])
  const state = { failRename: false }
  const exists = (file) => files.has(file) || dirs.has(file) || [...files.keys()].some((key) => key.startsWith(file + '/'))
  const read = (file) => {
    if (!files.has(file)) throw new Error('No existe el archivo')
    return files.get(file)
  }
  const synthetic = (values) => new SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value)
  })
  const mocks = {
    path: synthetic({ join: path.join, dirname: path.dirname, basename: path.basename, relative: path.relative, isAbsolute: path.isAbsolute }),
    crypto: synthetic({ randomUUID }),
    fs: synthetic({
      readFileSync: read,
      existsSync: exists,
      mkdirSync: (dir) => dirs.add(dir),
      readdirSync: (dir) => [...new Set([...files.keys()].filter((file) => file.startsWith(dir + '/')).map((file) => file.slice(dir.length + 1).split('/')[0]))].map((name) => ({ name, isDirectory: () => true })),
      statSync: () => ({ mtime: new Date('2026-09-21') }),
      realpathSync: (dir) => dir,
      writeFileSync: (file, content) => files.set(file, content),
      renameSync: (from, to) => {
        if (state.failRename) throw new Error('No se pudo escribir')
        files.set(to, read(from)); files.delete(from)
      },
      unlinkSync: (file) => files.delete(file)
    }),
    electron: synthetic({ app: { isPackaged: false, getAppPath: () => '/app', getPath: () => '/user' } }),
    './jsonfile': synthetic({ readJson: (_file, fallback) => fallback, writeJson: () => ({ ok: true }) }),
    './favicons': synthetic({ faviconFor: () => null, resolveFavicon: async () => false }),
    './mcp/client': synthetic({ mcpCapabilities: () => new Set() })
  }
  const source = fs.readFileSync(path.join(__dirname, '../src/main/skills.ts'), 'utf8')
  const module = new SourceTextModule(stripTypeScriptTypes(source))
  await module.link((name) => mocks[name])
  await module.evaluate()
  module.namespace.initSkills()
  return { skills: module.namespace, files, state }
}

test('editar una skill oficial crea una copia local y conserva el original y los metadatos', async () => {
  const { skills, files } = await setup()
  const next = ORIGINAL.replace('# Original\nInstructions', '# Edited\nNew instructions')
  const result = skills.saveSkill('example', next, ORIGINAL)
  assert.equal(files.get(BUILTIN), ORIGINAL)
  assert.equal(files.get(LOCAL), next)
  assert.equal(result.source, next)
  assert.equal(result.icon, 'pencil')
  assert.deepEqual([...result.keywords], ['one', 'two'])
  assert.equal(result.builtin, true)
  assert.equal(result.customized, true)
  assert.equal(skills.listSkills().length, 1)
})

test('el agente usa la edición y la conserva al reinicializar skills', async () => {
  const { skills } = await setup()
  const next = ORIGINAL.replace('Instructions', 'New instructions')
  skills.saveSkill('example', next, ORIGINAL)
  skills.initSkills()
  assert.match(skills.enabledSkills()[0].body, /New instructions/)
  assert.equal(skills.getSkill('example').source, next)
  assert.equal(skills.skillFolder('example'), '/user/skills/example')
})

test('editar una skill local actualiza el mismo archivo y refleja nombre y descripción', async () => {
  const { skills, files } = await setup()
  files.set('/user/skills/mine/SKILL.md', ORIGINAL)
  const next = ORIGINAL.replace('name: Example', 'name: My skill').replace('Original description', 'New description')
  const result = skills.saveSkill('mine', next, ORIGINAL)
  assert.equal(result.name, 'My skill')
  assert.equal(result.description, 'New description')
  assert.equal(result.builtin, false)
  assert.equal(files.get('/user/skills/mine/SKILL.md'), next)
})

test('rechaza un guardado obsoleto sin pisar una edición externa', async () => {
  const { skills, files } = await setup()
  files.set(LOCAL, ORIGINAL + '\nExternal edit')
  assert.throws(() => skills.saveSkill('example', ORIGINAL + '\nMy edit', ORIGINAL), /cambió/)
  assert.match(files.get(LOCAL), /External edit/)
})

test('valida ruta, contenido y metadatos antes de guardar', async () => {
  const { skills, files } = await setup()
  for (const id of ['../example', '.', '..', 'nested/example', 'nested\\example']) {
    assert.throws(() => skills.saveSkill(id, ORIGINAL, ORIGINAL), /Identificador/)
  }
  for (const source of ['', ' ', 'x'.repeat(1024 * 1024 + 1), '---\nname: Missing end', '---\nname: [invalid]\n---\nBody']) {
    assert.throws(() => skills.saveSkill('example', source, ORIGINAL))
  }
  assert.equal(files.has(LOCAL), false)
})

test('un fallo al escribir conserva el contenido anterior y limpia el archivo temporal', async () => {
  const { skills, files, state } = await setup()
  files.set(LOCAL, ORIGINAL)
  state.failRename = true
  assert.throws(() => skills.saveSkill('example', ORIGINAL + '\nChanged', ORIGINAL), /escribir/)
  assert.equal(files.get(LOCAL), ORIGINAL)
  assert.equal([...files.keys()].some((file) => file.endsWith('.tmp')), false)
})
