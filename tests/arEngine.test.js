import { describe, expect, it, vi } from 'vitest'
import { createArEngine } from '../src/composables/useArEngine.js'

describe('isolated AR engine', () => {
  it('creates one imperative scene with one anchor per target and cleans it up', async () => {
    const container = document.createElement('div')
    const stop = vi.fn()
    const engine = createArEngine({
      sceneStarter: async (scene) => {
        scene.systems = { 'mindar-image-system': { start: vi.fn(), stop, video: document.createElement('video') } }
      },
    })
    await engine.mount(container, new ArrayBuffer(2), [
      { id: 'a', emoji: '✨' },
      { id: 'b', emoji: '🪐' },
    ])
    expect(container.querySelectorAll('a-scene')).toHaveLength(1)
    expect(container.querySelectorAll('[mindar-image-target]')).toHaveLength(2)
    engine.destroy()
    expect(container.children).toHaveLength(0)
    expect(stop).toHaveBeenCalledOnce()
  })
})
