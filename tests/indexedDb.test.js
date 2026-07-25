import { beforeEach, describe, expect, it } from 'vitest'
import {
  deleteImage,
  getCompiledTargetIds,
  getImage,
  getMindBuffer,
  putCompiledState,
  putImage,
  putMindBuffer,
} from '../src/persistence/indexedDb.js'

beforeEach(async () => {
  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase('cyberworld')
    request.onsuccess = request.onerror = request.onblocked = () => resolve()
  })
})

describe('IndexedDB persistence', () => {
  it('stores and deletes target image blobs', async () => {
    const blob = new Blob(['image'], { type: 'image/jpeg' })
    await putImage('target-a', blob)
    const stored = await getImage('target-a')
    expect(stored).toMatchObject({ size: 5, type: 'image/jpeg' })
    await deleteImage('target-a')
    expect(await getImage('target-a')).toBeNull()
  })

  it('stores the active compiled target buffer', async () => {
    await putMindBuffer(new Uint8Array([4, 2, 1]).buffer)
    expect([...new Uint8Array(await getMindBuffer())]).toEqual([4, 2, 1])
  })

  it('commits the compiled buffer and its authoritative target order together', async () => {
    await putCompiledState(new Uint8Array([8, 3]).buffer, ['target-c', 'target-a'])
    expect([...new Uint8Array(await getMindBuffer())]).toEqual([8, 3])
    expect(await getCompiledTargetIds()).toEqual(['target-c', 'target-a'])
  })
})
