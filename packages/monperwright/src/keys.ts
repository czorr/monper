/** Traducción de nombres de tecla estilo Playwright a keyCodes de bajo nivel. */

const NAMED: Record<string, string> = {
  Enter: 'Return',
  Return: 'Return',
  Escape: 'Escape',
  Esc: 'Escape',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Space: ' ',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Up: 'Up',
  Down: 'Down',
  Left: 'Left',
  Right: 'Right',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown'
}

const MODIFIERS: Record<string, string> = {
  Control: 'control',
  Ctrl: 'control',
  Shift: 'shift',
  Alt: 'alt',
  Option: 'alt',
  Meta: 'meta',
  Cmd: 'meta',
  Command: 'meta'
}

/** Convierte 'Enter' → 'Return', 'a' → 'a'. */
export function toKeyCode(key: string): string {
  return NAMED[key] ?? key
}

/** ¿La tecla produce un carácter imprimible? */
export function isPrintable(key: string): boolean {
  return key.length === 1
}

/** Normaliza modificadores ('Control' → 'control'). */
export function toModifiers(mods?: string[]): string[] {
  return (mods ?? []).map((m) => MODIFIERS[m] ?? m.toLowerCase())
}

/**
 * Descompone una combinación estilo Playwright ('Control+Shift+A') en
 * { modifiers, key }.
 */
export function parseCombo(combo: string): { modifiers: string[]; key: string } {
  const parts = combo.split('+')
  const key = parts.pop() ?? ''
  return { modifiers: toModifiers(parts), key }
}
