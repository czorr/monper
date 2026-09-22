export { Page } from './page'
export type { PageOptions } from './page'
export { Locator } from './locator'
export type { ClickOptions, FillOptions, WaitOptions } from './locator'
export { takeSnapshot, formatSnapshot, REF_ATTR } from './snapshot'
export type { Snapshot, SnapshotNode, SnapshotOptions } from './snapshot'
export { toKeyCode, toModifiers, parseCombo, isPrintable } from './keys'
export type {
  Transport,
  MouseEventType,
  KeyEventType,
  MouseButton,
  MouseOptions,
  KeyOptions,
  Screenshot
} from './transport'

// El adaptador de Electron vive en el subpath "titaniowright/electron" para no
// exigir Electron a quien use un transport propio (CDP, socket, etc.).
