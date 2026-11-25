// Native-consumer regression for the session-header Pomodoro utility.
//
// The unit tests in test/client-i18n.test.js only run the plugin against a
// fake `ctx.slots` fixture, which cannot catch a mismatch with the real DSH
// list-slot consumer. This script extracts the *installed* renderer's
// `register(...)` method from the Desktop app.asar (or the installed SDK
// assets) and drives it directly. It never connects to the user's window,
// writes the profile, or calls a model.
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)

const SLOT = 'conversation.session.header.utilities'
const DESKTOP_ASAR = process.env.DSH_DESKTOP_ASAR
  ?? '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar'

/** Read one file out of an Electron app.asar from raw bytes (no mount, no link follow). */
function readAsarFile(archive, matcher) {
  const rawFs = process.versions.electron ? require('original-fs') : require('node:fs')
  const fd = rawFs.openSync(archive, 'r')
  try {
    const prefix = Buffer.alloc(16)
    rawFs.readSync(fd, prefix, 0, 16, 0)
    const headerSize = prefix.readUInt32LE(4)
    const jsonSize = prefix.readUInt32LE(12)
    const bytes = Buffer.alloc(jsonSize)
    rawFs.readSync(fd, bytes, 0, bytes.length, 16)
    const header = JSON.parse(bytes.toString())
    const base = 8 + headerSize
    const leaves = []
    const stack = []
    for (const [k, v] of Object.entries(header.files)) stack.push([v, k])
    while (stack.length) {
      const [node, p] = stack.pop()
      if (node && node.files) {
        for (const [k, v] of Object.entries(node.files)) stack.push([v, p + '/' + k])
      } else if (node) {
        leaves.push({ path: p, size: node.size, offset: node.offset, unpacked: !!node.unpacked })
      }
    }
    const file = leaves.find((entry) => matcher(entry.path))
    if (!file) return undefined
    if (file.unpacked) return readFileSync(path.join(archive + '.unpacked', file.path), 'utf8')
    const data = Buffer.alloc(file.size)
    rawFs.readSync(fd, data, 0, data.length, base + Number(file.offset))
    return data.toString()
  } finally {
    rawFs.closeSync(fd)
  }
}

/** The installed renderer source: Desktop frontend bundle, else SDK assets. */
function installedRenderer() {
  if (existsSync(DESKTOP_ASAR)) {
    const source = readAsarFile(DESKTOP_ASAR, (p) => /dsh-web-frontend\/dist\/assets\/index-.*\.js$/.test(p))
    if (source) return { source, kind: 'installed DSH Desktop' }
  }
  const assets = new URL('../../node_modules/@deepseek-ai/dsh-web-frontend/dist/assets/', import.meta.url)
  const name = readdirSync(assets).find((entry) => /^index-.*\.js$/.test(entry))
  assert.ok(name, 'Installed SDK renderer entry is present')
  return { source: readFileSync(new URL(name, assets), 'utf8'), kind: 'installed DSH SDK' }
}

/** Extract the real `register(options, component)` method from the renderer bundle. */
function actualListRegister(source) {
  const needle = source.indexOf('requires options.id')
  assert.ok(needle >= 0, 'renderer list-slot validator is present')
  const candidates = [...source.slice(0, needle).matchAll(/\bregister\s*\([^)]*\)\s*\{/g)]
  const start = candidates.at(-1)?.index
  assert.ok(start !== undefined, 'native register method is present')
  for (let end = source.indexOf('}', needle); end >= 0 && end < start + 20000; end = source.indexOf('}', end + 1)) {
    let script
    try {
      script = new vm.Script('({' + source.slice(start, end + 1) + '}).register')
    } catch (error) {
      if (error.name === 'SyntaxError') continue
      throw error
    }
    return script.runInNewContext()
  }
  throw new Error('native register method boundary not found')
}

/** Minimal hook shim so the registered component can be rendered without react-dom. */
function fakeReact(tree) {
  const React = {
    createElement(type, props, ...children) {
      const node = { type, props: props || {}, children: children.flat(Infinity) }
      tree.push(node)
      return node
    },
    useState(init) { return [typeof init === 'function' ? init() : init, () => {}] },
    useReducer(reducer, init) { return [typeof init === 'function' ? init() : init, () => {}] },
    useEffect() {},
    useLayoutEffect() {},
    useMemo(factory) { return factory() },
    useRef(value) { return { current: value } },
    useCallback(fn) { return fn },
    Fragment: 'Fragment',
  }
  return React
}

function documentStub() {
  return {
    getElementById() { return null },
    createElement() { return { id: '', textContent: '', remove() {} } },
    head: { append() {} },
    addEventListener() {},
    removeEventListener() {},
  }
}

/** Load the plugin client factory in isolation and run apply against a capturing ctx. */
function loadPlugin() {
  let entry
  const sandbox = {
    window: { __ModuleLoader__: { load(value) { entry = value } } },
    document: documentStub(),
    console,
    setTimeout,
    clearTimeout,
    Date,
  }
  sandbox.globalThis = sandbox
  vm.runInNewContext(readFileSync(new URL('../../lib/client.js', import.meta.url), 'utf8'), sandbox)
  assert.ok(entry && typeof entry.factory === 'function', 'client module factory is present')
  return entry
}

const renderer = installedRenderer()
const register = actualListRegister(renderer.source)

// 1) The old wrong shape (key, no id) is genuinely rejected by this consumer.
const probe = { spec: { kind: 'list', scope: 'session' }, entries: [] }
const probeRegistry = { records: new Map([[SLOT, probe]]), markDirty() {}, releaseEntry() {} }
assert.throws(
  () => register.call(probeRegistry, { name: SLOT, key: 'wrong' }, () => null),
  /requires options\.id/,
  'the installed consumer still enforces options.id for list slots',
)

// 2) Drive the plugin's real registration options through the real consumer.
const tree = []
const captured = []
const registry = { records: new Map([[SLOT, { spec: { kind: 'list', scope: 'session' }, entries: [] }]]), markDirty() {}, releaseEntry() {} }
const ctx = {
  effect(fn) { try { return fn() } catch { return () => {} } },
  get() { return null },
  locale: null,
  slots: {
    inject(_names, callback) { return callback() },
    register(options, component) {
      captured.push({ options, component })
      if (options.name === SLOT) return register.call(registry, options, component)
      return () => {}
    },
  },
}

const plugin = loadPlugin()
const client = plugin.factory((id) => (id === 'react' ? fakeReact(tree) : {}))
assert.equal(typeof client.apply, 'function', 'client exposes apply')
client.apply(ctx)

const contribution = captured.find((item) => item.options.name === SLOT)
assert.ok(contribution, 'the plugin registers the session-header utilities slot')
assert.equal(contribution.options.id, 'dsh-todo-pomodoro', 'registration carries an id')
assert.equal(contribution.options.order, 5, 'registration order is preserved')

const record = registry.records.get(SLOT)
assert.equal(record.entries.length, 1, 'the installed consumer accepted the Pomodoro utility')
assert.equal(record.entries[0].options.id, 'dsh-todo-pomodoro', 'the consumer stored the expected id')

// 3) Render the accepted component through the fake React tree and confirm the
// independent mm:ss readout is produced (the original "countdown is missing" bug).
tree.length = 0
const entryComponent = record.entries[0].component
const element = entryComponent({})
assert.ok(element, 'the header utility renders an element')
// The registered factory returns `PomodoroHeaderTimer` as an element; invoke it
// so the fake React tree records the container, ring and readout.
if (typeof element.type === 'function') element.type(element.props)
const types = tree.map((node) => node.type)
assert.ok(types.includes('div'), 'the utility renders a container div')
const readout = tree.find((node) => node.props && node.props.className === 'todo-header-timer-readout')
assert.ok(readout, 'the utility renders the independent countdown readout')
assert.match(String(readout.children[0]), /^\d{1,3}:\d{2}$/, 'the readout is a mm:ss clock')

console.log(`Native slot regression passed against ${renderer.kind}: Pomodoro header utility registers, mounts, and renders its mm:ss readout.`)
