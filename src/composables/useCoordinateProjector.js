export function createCoordinateProjector({
  viewport = () => ({ width: globalThis.innerWidth, height: globalThis.innerHeight }),
  vectorFactory = () => new globalThis.AFRAME.THREE.Vector3(),
  smoothingFrames = 5,
} = {}) {
  const samples = []

  function reset() {
    samples.length = 0
  }

  function project(object3D, camera) {
    if (!object3D?.visible || !camera) return null
    const vector = vectorFactory()
    object3D.getWorldPosition(vector)
    vector.project(camera)
    if (![vector.x, vector.y, vector.z].every(Number.isFinite) || vector.z < -1 || vector.z > 1) {
      return null
    }
    const { width, height } = viewport()
    const sample = {
      x: (vector.x * 0.5 + 0.5) * width,
      y: (-vector.y * 0.5 + 0.5) * height,
    }
    samples.push(sample)
    if (samples.length > smoothingFrames) samples.shift()
    return samples.reduce(
      (sum, point) => ({ x: sum.x + point.x / samples.length, y: sum.y + point.y / samples.length }),
      { x: 0, y: 0 },
    )
  }

  return { project, reset }
}

export const useCoordinateProjector = createCoordinateProjector
