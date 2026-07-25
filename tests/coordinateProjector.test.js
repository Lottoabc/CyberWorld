import { describe, expect, it } from 'vitest'
import { createCoordinateProjector } from '../src/composables/useCoordinateProjector.js'

describe('coordinate projector', () => {
  it('returns the average of the latest five projected frames', () => {
    const vector = { x: 0, y: 0, z: 0, project() { return this } }
    const projector = createCoordinateProjector({
      viewport: () => ({ width: 100, height: 100 }),
      vectorFactory: () => vector,
      smoothingFrames: 5,
    })
    const object3D = {
      visible: true,
      getWorldPosition(target) {
        target.x += 0.2
        target.y = 0
        target.z = 0
      },
    }
    const camera = {}
    const positions = Array.from({ length: 5 }, () => projector.project(object3D, camera))
    expect(positions.at(-1).x).toBeCloseTo(80)
    expect(positions.at(-1).y).toBeCloseTo(50)
  })

  it('returns null for invisible or out-of-depth targets', () => {
    const projector = createCoordinateProjector({
      vectorFactory: () => ({ x: 0, y: 0, z: 2, project() { return this } }),
    })
    expect(projector.project({ visible: false }, {})).toBeNull()
    expect(projector.project({ visible: true, getWorldPosition() {} }, {})).toBeNull()
  })
})
