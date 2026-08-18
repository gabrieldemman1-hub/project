import 'fake-indexeddb/auto'

// jsdom is not installed and not needed: every test here is either a pure
// function or a Dexie call against fake-indexeddb. The DOM assertions that
// matter (the reveal invariant) run in a real browser via Playwright instead.
// Minimal localStorage, so the draft safety net can be tested without a DOM.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size
      },
    },
  })
}

if (typeof globalThis.structuredClone !== 'function') {
  throw new Error('structuredClone is required — use Node 18+')
}
