import assert from 'node:assert/strict'
import test from 'node:test'
import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { createCameraStream } from '../src/composables/useCameraStream.js'
import { createTargetCompiler } from '../src/composables/useTargetCompiler.js'
import { createCoordinateProjector } from '../src/composables/useCoordinateProjector.js'
import { createEmptyState, loadLocalState, saveLocalState } from '../src/persistence/localState.js'
import { deleteImage, getImage, getMindBuffer, putImage, putMindBuffer } from '../src/persistence/indexedDb.js'
import { useMessageStore } from '../src/stores/messages.js'
import { useTargetStore } from '../src/stores/targets.js'
import { createTargetRegistry } from '../src/utils/targetRegistry.js'
import { createBlobUrlLease } from '../src/utils/blobUrlLease.js'

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

test('camera frame capture does not pause the live video', async () => {
  let paused = false
  const canvas = {
    getContext: () => ({ drawImage() {} }),
    toBlob: (callback) => callback(new Blob(['jpeg'], { type: 'image/jpeg' })),
  }
  const camera = createCameraStream({ documentRef: { createElement: () => canvas } })
  const blob = await camera.captureFrame({
    videoWidth: 1920,
    videoHeight: 1080,
    pause: () => { paused = true },
  })
  assert.equal(blob.type, 'image/jpeg')
  assert.equal(paused, false)
  assert.equal(canvas.width, 1280)
  assert.equal(canvas.height, 720)
})

test('target compiler preserves order and releases decoded images', async () => {
  const released = []
  class Compiler {
    async compileImageTargets(images, progress) {
      assert.deepEqual(images.map((item) => item.label), ['a', 'b'])
      progress(51)
    }
    async exportData() {
      return new Uint8Array([9, 4]).buffer
    }
  }
  const progress = []
  const compiler = createTargetCompiler({
    CompilerClass: Compiler,
    decodeBlob: async (blob) => ({
      label: await blob.text(),
      close: () => released.push(blob),
    }),
  })
  const result = await compiler.compile([new Blob(['a']), new Blob(['b'])], (value) => progress.push(value))
  assert.deepEqual([...new Uint8Array(result)], [9, 4])
  assert.deepEqual(progress, [51])
  assert.equal(released.length, 2)
})

test('Blob URL swap revokes only URLs that are no longer active', () => {
  const revoked = []
  let id = 0
  const lease = createBlobUrlLease({
    createObjectURL: () => `blob:${++id}`,
    revokeObjectURL: (url) => revoked.push(url),
  })
  lease.stage(new ArrayBuffer(1))
  lease.commit()
  lease.stage(new ArrayBuffer(1))
  assert.deepEqual(revoked, [])
  lease.commit()
  assert.deepEqual(revoked, ['blob:1'])
  lease.dispose()
  assert.deepEqual(revoked, ['blob:1', 'blob:2'])
})

test('coordinate projection smooths the latest five frames', () => {
  const vector = { x: 0, y: 0, z: 0, project() { return this } }
  const projector = createCoordinateProjector({
    viewport: () => ({ width: 100, height: 100 }),
    vectorFactory: () => vector,
  })
  const target = {
    visible: true,
    getWorldPosition(value) {
      value.x += 0.2
      value.y = 0
      value.z = 0
    },
  }
  let point
  for (let index = 0; index < 5; index += 1) point = projector.project(target, {})
  assert.equal(Math.round(point.x), 80)
  assert.equal(Math.round(point.y), 50)
})
