import { beforeEach, describe, expect, it } from 'vitest'
import { deleteImage, getImage, getMindBuffer, putImage, putMindBuffer } from '../src/persistence/indexedDb.js'

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
    expect(await (await getImage('target-a')).text()).toBe('image')
    await deleteImage('target-a')
    expect(await getImage('target-a')).toBeNull()
  })

  it('stores the active compiled target buffer', async () => {
    await putMindBuffer(new Uint8Array([4, 2, 1]).buffer)
    expect([...new Uint8Array(await getMindBuffer())]).toEqual([4, 2, 1])
  })
})
