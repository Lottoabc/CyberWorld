import { shallowRef } from 'vue'
import { createTargetAnchor } from '../components/TargetAnchor.js'
import { createBlobUrlLease } from '../utils/blobUrlLease.js'

function codedError(message, code, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { code })
}

function defaultSceneStarter(scene, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let timer
    const cleanup = () => {
      clearTimeout(timer)
      scene.removeEventListener('arReady', ready)
      scene.removeEventListener('arError', failed)
      scene.removeEventListener('renderstart', start)
    }
    const ready = () => {
      cleanup()
      resolve()
    }
    const failed = (event) => {
      cleanup()
      reject(codedError('MindAR 启动失败', 'AR_START_FAILED', event.detail?.error))
    }
    const start = () => {
      try {
        scene.systems?.['mindar-image-system']?.start()
      } catch (error) {
        cleanup()
        reject(codedError('MindAR 无法启动', 'AR_START_FAILED', error))
      }
    }
    scene.addEventListener('arReady', ready, { once: true })
    scene.addEventListener('arError', failed, { once: true })
    scene.addEventListener('renderstart', start, { once: true })
    timer = setTimeout(() => {
      cleanup()
      reject(codedError('MindAR 启动超时', 'AR_START_TIMEOUT'))
    }, timeoutMs)
  })
}

export function createArEngine({
  documentRef = globalThis.document,
  urlApi = globalThis.URL,
  sceneStarter = defaultSceneStarter,
} = {}) {
  const lease = createBlobUrlLease(urlApi)
  const sceneRef = shallowRef(null)
  let containerRef = null
  let currentTargets = []

  function buildScene(url, targets) {
    const scene = documentRef.createElement('a-scene')
    scene.setAttribute(
      'mindar-image',
      `imageTargetSrc: ${url}; autoStart: false; maxTrack: 1; uiLoading: no; uiScanning: no; uiError: no`,
    )
    scene.setAttribute('embedded', '')
    scene.setAttribute('vr-mode-ui', 'enabled: false')
    scene.setAttribute('device-orientation-permission-ui', 'enabled: false')
    scene.setAttribute('renderer', 'colorManagement: true; physicallyCorrectLights: true; alpha: true')

    const camera = documentRef.createElement('a-camera')
    camera.setAttribute('position', '0 0 0')
    camera.setAttribute('look-controls', 'enabled: false')
    scene.appendChild(camera)
    targets.forEach((target, index) => {
      scene.appendChild(createTargetAnchor({ target, index, documentRef }))
    })
    return scene
  }

  function stopScene(scene) {
    if (!scene) return
    try {
      scene.systems?.['mindar-image-system']?.stop()
    } catch {
      // A partially initialized scene may not own a video yet.
    }
    scene.remove()
  }

  async function activate(url, targets) {
    const scene = buildScene(url, targets)
    sceneRef.value = scene
    containerRef.replaceChildren(scene)
    try {
      await sceneStarter(scene)
      return scene
    } catch (error) {
      stopScene(scene)
      if (sceneRef.value === scene) sceneRef.value = null
      throw error
    }
  }

  async function mount(container, buffer, targets) {
    destroy()
    containerRef = container
    currentTargets = [...targets]
    const stagedUrl = lease.stage(buffer)
    try {
      await activate(stagedUrl, currentTargets)
      lease.commit()
      return sceneRef.value
    } catch (error) {
      lease.rollback()
      throw error
    }
  }

  async function swap(buffer, targets) {
    if (!containerRef || !lease.activeUrl) {
      throw codedError('AR 引擎尚未挂载', 'AR_NOT_MOUNTED')
    }
    const previousTargets = currentTargets
    const previousUrl = lease.activeUrl
    const stagedUrl = lease.stage(buffer)
    stopScene(sceneRef.value)
    sceneRef.value = null
    try {
      currentTargets = [...targets]
      await activate(stagedUrl, currentTargets)
      lease.commit()
      return sceneRef.value
    } catch (error) {
      lease.rollback()
      currentTargets = previousTargets
      try {
        await activate(previousUrl, previousTargets)
      } catch (rollbackError) {
        throw codedError('AR 更新和回滚均失败', 'AR_ROLLBACK_FAILED', rollbackError)
      }
      throw codedError('AR 更新失败，已恢复旧目标', 'AR_SWAP_FAILED', error)
    }
  }

  function pause(keepVideo = false) {
    sceneRef.value?.systems?.['mindar-image-system']?.pause(keepVideo)
  }

  function resume() {
    sceneRef.value?.systems?.['mindar-image-system']?.unpause()
  }

  function getVideoElement() {
    return sceneRef.value?.systems?.['mindar-image-system']?.video ?? null
  }

  function getCamera() {
    return sceneRef.value?.querySelector('a-camera')?.getObject3D?.('camera') ?? null
  }

  function getAnchor(targetId) {
    return [...(sceneRef.value?.querySelectorAll('[data-target-id]') ?? [])]
      .find((element) => element.dataset.targetId === targetId) ?? null
  }

  function destroy() {
    stopScene(sceneRef.value)
    sceneRef.value = null
    containerRef?.replaceChildren()
    containerRef = null
    currentTargets = []
    lease.dispose()
  }

  return {
    scene: sceneRef,
    mount,
    swap,
    pause,
    resume,
    getVideoElement,
    getCamera,
    getAnchor,
    destroy,
  }
}

export const useArEngine = createArEngine
