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

  it('parks and reuses one permanently connected scene across route visits', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const pause = vi.fn()
    const play = vi.fn()
    const resize = vi.fn()
    const setAnimationLoop = vi.fn()
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
        scene.pause = pause
        scene.play = play
        scene.resize = resize
        scene.render = vi.fn()
        scene.renderer = { setAnimationLoop }
        scene.systems ??= { 'mindar-image-system': system }
      },
    })

    await engine.mount(container, new ArrayBuffer(2), [{ id: 'a', emoji: '✨' }])
    const originalScene = engine.scene.value
    engine.park()
    expect(container.hidden).toBe(true)
    expect(originalScene.isConnected).toBe(true)
    expect(pause).toHaveBeenCalledOnce()
    expect(setAnimationLoop).toHaveBeenLastCalledWith(null)

    await engine.mount(container, new ArrayBuffer(2), [{ id: 'b', emoji: '🎝' }])
    expect(engine.scene.value).toBe(originalScene)
    expect(container.hidden).toBe(false)
    expect(container.querySelectorAll('a-scene')).toHaveLength(1)
    expect(play).toHaveBeenCalledOnce()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(resize).toHaveBeenCalled()
    engine.destroy()
    container.remove()
  })

  it('cancels a pending MindAR readiness wait when parked', async () => {
    const container = document.createElement('div')
    const stop = vi.fn()
    const system = { start: vi.fn(), stop }
    const engine = createArEngine({
      urlApi: {
        createObjectURL: vi.fn(() => 'blob:test'),
        revokeObjectURL: vi.fn(),
      },
    })

    const mounting = engine.mount(container, new ArrayBuffer(2), [{ id: 'a', emoji: '✨' }])
    const scene = container.querySelector('a-scene')
    scene.systems = { 'mindar-image-system': system }
    scene.dispatchEvent(new Event('renderstart'))
    engine.park()

    await expect(mounting).rejects.toMatchObject({ code: 'AR_OPERATION_CANCELLED' })
    expect(stop).toHaveBeenCalledOnce()
    engine.destroy()
  })

  it('stops a camera stream that resolves after the scene was parked', async () => {
    const container = document.createElement('div')
    let resolveCamera
    const stopTrack = vi.fn()
    const getUserMedia = vi.fn(() => new Promise((resolve) => {
      resolveCamera = resolve
    }))
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })
    const video = { srcObject: null }
    const system = {
      video,
      controller: null,
      _startAR: async function startAR() {
        video.srcObject = await navigator.mediaDevices.getUserMedia({ video: true })
      },
      start() {
        return this._startAR()
      },
      stop() {
        if (!this.controller || !this.video.srcObject) throw new Error('partially initialized')
      },
    }
    const engine = createArEngine({
      urlApi: {
        createObjectURL: vi.fn(() => 'blob:test'),
        revokeObjectURL: vi.fn(),
      },
    })

    const mounting = engine.mount(container, new ArrayBuffer(2), [{ id: 'a', emoji: '✨' }])
    const scene = container.querySelector('a-scene')
    scene.systems = { 'mindar-image-system': system }
    scene.dispatchEvent(new Event('renderstart'))
    expect(getUserMedia).toHaveBeenCalledOnce()

    engine.park()
    resolveCamera({ getTracks: () => [{ stop: stopTrack }] })
    await Promise.resolve()
    await Promise.resolve()

    await expect(mounting).rejects.toMatchObject({ code: 'AR_OPERATION_CANCELLED' })
    expect(stopTrack).toHaveBeenCalledOnce()
    expect(video.srcObject).toBeNull()
    engine.destroy()
  })
})
