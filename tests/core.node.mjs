import assert from 'node:assert/strict'
import test from 'node:test'
import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { createEmptyState, loadLocalState, saveLocalState } from '../src/persistence/localState.js'
import { deleteImage, getImage, getMindBuffer, putImage, putMindBuffer } from '../src/persistence/indexedDb.js'
import { useMessageStore } from '../src/stores/messages.js'
import { useTargetStore } from '../src/stores/targets.js'
import { createTargetRegistry } from '../src/utils/targetRegistry.js'

test('metadata round-trips and malformed data falls back', () => {
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
  const state = { version: 1, targets: [{ id: 'a' }], messages: [] }
  saveLocalState(storage, state)
  assert.deepEqual(loadLocalState(storage), state)
  values.set('cyberworld.state.v1', '{broken')
  assert.deepEqual(loadLocalState(storage), createEmptyState())
})

test('binary data round-trips through IndexedDB', async () => {
  const image = new Blob(['image'], { type: 'image/jpeg' })
  await putImage('a', image)
  assert.equal(await (await getImage('a')).text(), 'image')
  await deleteImage('a')
  assert.equal(await getImage('a'), null)
  await putMindBuffer(new Uint8Array([1, 2, 3]).buffer)
  assert.deepEqual([...new Uint8Array(await getMindBuffer())], [1, 2, 3])
})

test('registry and stores preserve stable target identity', () => {
  setActivePinia(createPinia())
  const targets = useTargetStore()
  const messages = useMessageStore()
  targets.commitCandidate({ id: 'a', emoji: '✨' })
  targets.commitCandidate({ id: 'c', emoji: '🪐' })
  messages.addMessage('c', ' hello ')
  const registry = createTargetRegistry(targets.targets)
  assert.equal(registry.indexFor('c'), 1)
  assert.equal(messages.messagesFor('c')[0].text, 'hello')
  assert.equal(messages.messagesFor('a').length, 0)
})
