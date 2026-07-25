import { describe, expect, it, vi } from 'vitest'
import { createArEngine } from '../src/composables/useArEngine.js'

describe('isolated AR engine', () => {
  it('creates one imperative scene with one anchor per target and cleans it up', async () => {
    const container = document.createElement('div')
    const stop = vi.fn()
    const engine = createArEngine({
      urlApi: {
        createObjectURL: vi.fn(() => 'blob:test'),
        revokeObjectURL: vi.fn(),
      },
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

  it('reuses the same A-Frame scene while replacing MindAR targets', async () => {
    const container = document.createElement('div')
    const system = {
      start: vi.fn(),
      stop: vi.fn(),
      setup: vi.fn(),
      anchorEntities: [],
      video: document.createElement('video'),
    }
    const engine = createArEngine({
      urlApi: {
        createObjectURL: vi.fn()
          .mockReturnValueOnce('blob:first')
          .mockReturnValueOnce('blob:second'),
        revokeObjectURL: vi.fn(),
      },
      sceneStarter: async (scene) => {
        scene.systems ??= { 'mindar-image-system': system }
      },
    })
    await engine.mount(container, new ArrayBuffer(2), [{ id: 'a', emoji: '✨' }])
    const originalScene = engine.scene.value
    await engine.swap(new ArrayBuffer(2), [{ id: 'b', emoji: '🪐' }])
    expect(engine.scene.value).toBe(originalScene)
    expect(container.querySelectorAll('a-scene')).toHaveLength(1)
    expect(container.querySelector('[data-target-id]').dataset.targetId).toBe('b')
    expect(system.stop).toHaveBeenCalledOnce()
    engine.destroy()
  })

  it('removes global listeners registered while an A-Frame scene starts', async () => {
    const container = document.createElement('div')
    const listener = vi.fn()
    const engine = createArEngine({
      urlApi: {
        createObjectURL: vi.fn(() => 'blob:test'),
        revokeObjectURL: vi.fn(),
      },
      sceneStarter: async (scene) => {
        window.addEventListener('resize', listener)
        scene.systems = {
          'mindar-image-system': {
            start: vi.fn(),
            stop: vi.fn(),
            video: document.createElement('video'),
          },
        }
      },
    })

    await engine.mount(container, new ArrayBuffer(2), [{ id: 'a', emoji: '✨' }])
    window.dispatchEvent(new Event('resize'))
    expect(listener).toHaveBeenCalledOnce()

    engine.destroy()
    window.dispatchEvent(new Event('resize'))
    expect(listener).toHaveBeenCalledOnce()
  })
})
