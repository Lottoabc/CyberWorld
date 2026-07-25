import { describe, expect, it, vi } from 'vitest'
import { createCameraStream } from '../src/composables/useCameraStream.js'

describe('camera stream', () => {
  it('requests one environment camera and releases every owned track', async () => {
    const stop = vi.fn()
    const stream = { getTracks: () => [{ stop }] }
    const mediaDevices = { getUserMedia: vi.fn().mockResolvedValue(stream) }
    const video = { play: vi.fn().mockResolvedValue(), set srcObject(value) { this.stream = value } }
    const camera = createCameraStream({ mediaDevices })

    await camera.start(video)
    camera.stop()

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: false, video: expect.objectContaining({ facingMode: { ideal: 'environment' } }) }),
    )
    expect(stop).toHaveBeenCalledOnce()
  })

  it('captures a frame without pausing the source video', async () => {
    const pause = vi.fn()
    const drawImage = vi.fn()
    const canvas = {
      getContext: () => ({ drawImage }),
      toBlob: (callback) => callback(new Blob(['jpeg'], { type: 'image/jpeg' })),
    }
    const documentRef = { createElement: (tag) => (tag === 'canvas' ? canvas : {}) }
    const camera = createCameraStream({ documentRef })

    const blob = await camera.captureFrame({ videoWidth: 1920, videoHeight: 1080, pause })

    expect(blob.type).toBe('image/jpeg')
    expect(drawImage).toHaveBeenCalledOnce()
    expect(pause).not.toHaveBeenCalled()
    expect(canvas.width).toBe(1280)
    expect(canvas.height).toBe(720)
  })
})
