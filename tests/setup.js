import 'fake-indexeddb/auto'

if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      randomUUID: () => '00000000-0000-4000-8000-000000000000',
    },
  })
}
