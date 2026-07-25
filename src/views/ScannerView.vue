<script setup>
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import EditorToolbar from '../components/EditorToolbar.vue'
import MessageBoard from '../components/MessageBoard.vue'
import { emojiTextureUrl } from '../components/TargetAnchor.js'
import ToastHost from '../components/ToastHost.vue'
import TransitionOverlay from '../components/TransitionOverlay.vue'
import { useArEngine } from '../composables/useArEngine.js'
import { createCameraStream } from '../composables/useCameraStream.js'
import { createCoordinateProjector } from '../composables/useCoordinateProjector.js'
import { createLifecycleRecovery } from '../composables/useLifecycleRecovery.js'
import { createTargetCompiler } from '../composables/useTargetCompiler.js'
import {
  deleteImage,
  deleteMindBuffer,
  getCompiledTargetIds,
  getImage,
  getMindBuffer,
  isSessionOnlyPersistence,
  putCompiledState,
  putImage,
} from '../persistence/indexedDb.js'
import { loadLocalState, saveLocalState } from '../persistence/localState.js'
import { useMessageStore } from '../stores/messages.js'
import { useTargetStore } from '../stores/targets.js'

defineOptions({ name: 'ScannerView' })

const targetStore = useTargetStore()
const messageStore = useMessageStore()
const camera = createCameraStream()
const compiler = createTargetCompiler()
const arEngine = useArEngine()
const projector = createCoordinateProjector()

const previewVideo = ref(null)
const arMount = inject('arHost', ref(null))
const cameraReady = ref(false)
const managerOpen = ref(false)
const projectedPosition = ref(null)
const toasts = ref([])
const overlay = reactive({
  visible: true,
  title: '让现实留下回声',
  detail: '点击后将请求后置摄像头权限。所有内容只保存在这台设备。',
  actionLabel: '开始扫描',
  error: false,
})

let toastSerial = 0
let projectionFrame = 0
let storageWarningShown = false
let engineMutation = Promise.resolve()
let disposed = false
const toastTimers = new Set()

function mutateEngine(operation) {
  const guardedOperation = () => {
    if (disposed) {
      throw Object.assign(new Error('扫描页面已经关闭'), { code: 'VIEW_DISPOSED' })
    }
    return operation()
  }
  const result = engineMutation.then(guardedOperation, guardedOperation)
  engineMutation = result.catch(() => {})
  return result
}

function ensureActive() {
  if (disposed) {
    throw Object.assign(new Error('扫描页面已经关闭'), { code: 'VIEW_DISPOSED' })
  }
}

const lifecycle = createLifecycleRecovery({
  pause() {
    if (targetStore.targets.length > 0) arEngine.pause()
    else previewVideo.value?.pause()
  },
  async resume() {
    const video = targetStore.targets.length > 0 ? arEngine.getVideoElement() : previewVideo.value
    if (!video) return true
    const resumed = await camera.resume(video)
    if (resumed && targetStore.targets.length > 0) arEngine.resume()
    return resumed
  },
  async rebuild() {
    if (targetStore.targets.length === 0) return
    const buffer = await getMindBuffer()
    if (!buffer) throw new Error('找不到已编译的 AR 数据')
    setOverlay({ visible: true, title: '正在恢复画面', detail: 'WebGL 已重置，正在重建追踪引擎。' })
    resetTracking()
    await mutateEngine(() => arEngine.swap(buffer, targetStore.targets))
    ensureActive()
    bindTargetEvents(targetStore.targets)
    attachRecoveryCanvas()
    setOverlay({ visible: false })
  },
})

const activeTarget = computed(() =>
  targetStore.targets.find((target) => target.id === targetStore.activeTargetId) ?? null,
)
const activeMessages = computed(() =>
  activeTarget.value ? messageStore.messagesFor(activeTarget.value.id) : [],
)

function persistMetadata(targets = targetStore.targets, messages = messageStore.messages, required = false) {
  if (isSessionOnlyPersistence()) {
    warnSessionStorage()
    return true
  }
  try {
    saveLocalState(localStorage, { targets, messages })
    return true
  } catch (error) {
    if (required) {
      throw Object.assign(new Error('本地元数据保存失败，请检查浏览器存储空间', { cause: error }), {
        code: 'METADATA_SAVE_FAILED',
      })
    }
    showToast('本地设置保存失败，请检查浏览器存储空间', '!')
    return false
  }
}

function showToast(text, icon = '✓') {
  const id = ++toastSerial
  toasts.value.push({ id, text, icon })
  const timer = setTimeout(() => {
    toasts.value = toasts.value.filter((item) => item.id !== id)
    toastTimers.delete(timer)
  }, 2600)
  toastTimers.add(timer)
}

function warnSessionStorage() {
  if (!storageWarningShown && isSessionOnlyPersistence()) {
    storageWarningShown = true
    showToast('浏览器存储不可用，本次内容将在刷新后消失', '!')
  }
}

function resetTracking() {
  targetStore.setActiveTarget(null)
  projectedPosition.value = null
  projector.reset()
}

function setOverlay({ visible, title = '', detail = '', actionLabel = '', error = false }) {
  Object.assign(overlay, { visible, title, detail, actionLabel, error })
}

async function loadImages(targets) {
  const blobs = []
  for (const target of targets) {
    const blob = await getImage(target.imageKey)
    if (!blob) {
      throw Object.assign(new Error(`找不到“${target.name}”的本地图片`), { code: 'IMAGE_MISSING' })
    }
    blobs.push(blob)
  }
  return blobs
}

function bindTargetEvents(targets) {
  targets.forEach((target) => {
    const anchor = arEngine.getAnchor(target.id)
    if (!anchor) return
    anchor.addEventListener('targetFound', () => {
      targetStore.setActiveTarget(target.id)
      projector.reset()
    })
    anchor.addEventListener('targetLost', () => {
      if (targetStore.activeTargetId === target.id) {
        targetStore.setActiveTarget(null)
        projectedPosition.value = null
        projector.reset()
      }
    })
  })
}

function attachRecoveryCanvas() {
  const scene = arEngine.scene.value
  lifecycle.attach(scene?.canvas ?? scene?.querySelector?.('canvas') ?? null)
}

function updateProjection() {
  if (activeTarget.value) {
    const anchor = arEngine.getAnchor(activeTarget.value.id)
    const cameraObject = arEngine.getCamera()
    const point = projector.project(anchor?.object3D, cameraObject)
    if (point) {
      projectedPosition.value = {
        x: Math.max(24, Math.min(innerWidth - 24, point.x)),
        y: Math.max(120, Math.min(innerHeight - 150, point.y)),
      }
    } else {
      projectedPosition.value = null
    }
  }
  projectionFrame = requestAnimationFrame(updateProjection)
}

async function reconcileCompiledManifest() {
  const targetIds = await getCompiledTargetIds()
  warnSessionStorage()
  if (isSessionOnlyPersistence() && !Array.isArray(targetIds)) {
    targetStore.hydrate([])
    messageStore.hydrate([])
    return
  }
  if (!Array.isArray(targetIds)) return
  const currentById = new Map(targetStore.targets.map((target) => [target.id, target]))
  const reconciled = targetIds.map((id, index) => currentById.get(id) ?? {
    id,
    imageKey: id,
    name: `已恢复参照物 ${index + 1}`,
    emoji: '✨',
    createdAt: new Date().toISOString(),
  })
  if (reconciled.map((target) => target.id).join('|') !== targetStore.targets.map((target) => target.id).join('|')) {
    targetStore.hydrate(reconciled)
    messageStore.hydrate(messageStore.messages.filter((message) => targetIds.includes(message.targetId)))
    persistMetadata(reconciled, messageStore.messages)
  }
}

async function mountExistingTargets() {
  let buffer = await getMindBuffer()
  if (!buffer) {
    targetStore.beginCompile()
    const blobs = await loadImages(targetStore.targets)
    buffer = await compiler.compile(blobs, targetStore.setCompileProgress)
    await putCompiledState(buffer, targetStore.targets.map((target) => target.id))
    warnSessionStorage()
    targetStore.finishCompile()
  }
  resetTracking()
  await mutateEngine(() => arEngine.mount(arMount.value, buffer, targetStore.targets))
  ensureActive()
  bindTargetEvents(targetStore.targets)
  attachRecoveryCanvas()
}

async function startScanning() {
  setOverlay({
    visible: true,
    title: '正在打开镜头',
    detail: '请允许使用后置摄像头。',
  })
  try {
    await reconcileCompiledManifest()
    ensureActive()
    if (targetStore.targets.length > 0) {
      await mountExistingTargets()
    } else {
      await camera.start(previewVideo.value)
    }
    ensureActive()
    cameraReady.value = true
    setOverlay({ visible: false })
  } catch (error) {
    if (disposed || error?.code === 'VIEW_DISPOSED') return
    targetStore.failCompile(error)
    const denied = ['CAMERA_DENIED', 'AR_START_FAILED'].includes(error?.code)
    setOverlay({
      visible: true,
      title: denied ? '需要摄像头权限' : '扫描器未能启动',
      detail: denied ? '请在浏览器网站设置中允许摄像头，然后重试。' : error.message,
      actionLabel: '重试',
      error: true,
    })
  }
}

async function captureTarget() {
  if (disposed || !cameraReady.value || targetStore.isCompiling || targetStore.targets.length >= 5) return
  let candidate = null
  let oldBuffer = null
  let oldTargetIds = targetStore.targets.map((target) => target.id)
  let sceneUpdated = false
  try {
    targetStore.beginCompile()
    const sourceVideo = targetStore.targets.length > 0 ? arEngine.getVideoElement() : previewVideo.value
    const image = await camera.captureFrame(sourceVideo)
    ensureActive()
    candidate = targetStore.addCandidate({
      id: crypto.randomUUID(),
      imageKey: '',
    })
    candidate.imageKey = candidate.id
    showToast('参照物已设定')
    await putImage(candidate.imageKey, image)

    const nextTargets = [...targetStore.targets, candidate]
    const blobs = await loadImages(nextTargets)
    const buffer = await compiler.compile(blobs, targetStore.setCompileProgress)
    ensureActive()
    oldBuffer = await getMindBuffer()
    oldTargetIds = await getCompiledTargetIds() ?? oldTargetIds
    await putCompiledState(buffer, nextTargets.map((target) => target.id))
    warnSessionStorage()
    targetStore.beginSwap()

    setOverlay({
      visible: true,
      title: '正在更新现实',
      detail: '新参照物编译完成，正在重启追踪引擎。',
    })
    if (targetStore.targets.length === 0) {
      camera.stop()
      previewVideo.value.srcObject = null
      resetTracking()
      await mutateEngine(() => arEngine.mount(arMount.value, buffer, nextTargets))
    } else {
      resetTracking()
      await mutateEngine(() => arEngine.swap(buffer, nextTargets))
    }
    sceneUpdated = true
    ensureActive()
    persistMetadata(nextTargets, messageStore.messages, true)
    targetStore.commitCandidate(candidate)
    bindTargetEvents(nextTargets)
    attachRecoveryCanvas()
    setOverlay({ visible: false })
    showToast('新参照物已可识别', '✦')
  } catch (error) {
    if (oldBuffer) await putCompiledState(oldBuffer, oldTargetIds).catch(() => {})
    else await deleteMindBuffer().catch(() => {})
    if (sceneUpdated) {
      resetTracking()
      if (oldBuffer && targetStore.targets.length > 0) {
        await mutateEngine(() => arEngine.swap(oldBuffer, targetStore.targets)).catch(() => {})
        bindTargetEvents(targetStore.targets)
        attachRecoveryCanvas()
      } else {
        await mutateEngine(async () => arEngine.destroy()).catch(() => {})
      }
    }
    if (candidate) await deleteImage(candidate.imageKey).catch(() => {})
    if (disposed || error?.code === 'VIEW_DISPOSED') return
    targetStore.failCompile(error)
    if (targetStore.targets.length === 0 && !camera.stream.value) {
      await camera.start(previewVideo.value).catch(() => {})
    }
    setOverlay({ visible: false })
    showToast(error.message || '参照物处理失败', '!')
  }
}

async function removeTarget(target) {
  if (disposed || targetStore.isCompiling) return
  const remaining = targetStore.targets.filter((item) => item.id !== target.id)
  const remainingMessages = messageStore.messages.filter((message) => message.targetId !== target.id)
  const oldBuffer = await getMindBuffer().catch(() => null)
  const oldTargetIds = await getCompiledTargetIds().catch(() => targetStore.targets.map((item) => item.id))
  let sceneUpdated = false
  try {
    targetStore.beginCompile()
    if (remaining.length === 0) {
      await deleteMindBuffer()
      resetTracking()
      await mutateEngine(async () => arEngine.park())
      sceneUpdated = true
      ensureActive()
      await camera.start(previewVideo.value)
    } else {
      const blobs = await loadImages(remaining)
      const buffer = await compiler.compile(blobs, targetStore.setCompileProgress)
      ensureActive()
      await putCompiledState(buffer, remaining.map((item) => item.id))
      warnSessionStorage()
      targetStore.beginSwap()
      setOverlay({ visible: true, title: '正在整理目标', detail: '重新建立追踪索引。' })
      resetTracking()
      await mutateEngine(() => arEngine.swap(buffer, remaining))
      sceneUpdated = true
      ensureActive()
      bindTargetEvents(remaining)
      attachRecoveryCanvas()
    }
    persistMetadata(remaining, remainingMessages, true)
    targetStore.removeTarget(target.id)
    messageStore.removeForTarget(target.id)
    await deleteImage(target.imageKey).catch(() => {})
    targetStore.finishCompile()
    setOverlay({ visible: false })
    showToast('参照物已删除')
  } catch (error) {
    if (oldBuffer) await putCompiledState(oldBuffer, oldTargetIds ?? targetStore.targets.map((item) => item.id)).catch(() => {})
    if (sceneUpdated && oldBuffer) {
      camera.stop()
      resetTracking()
      if (arEngine.scene.value) await mutateEngine(() => arEngine.swap(oldBuffer, targetStore.targets)).catch(() => {})
      else await mutateEngine(() => arEngine.mount(arMount.value, oldBuffer, targetStore.targets)).catch(() => {})
      bindTargetEvents(targetStore.targets)
      attachRecoveryCanvas()
    }
    if (disposed || error?.code === 'VIEW_DISPOSED') return
    targetStore.failCompile(error)
    setOverlay({ visible: false })
    showToast(error.message || '删除失败', '!')
  }
}

function addMessage(text) {
  if (!activeTarget.value) return
  try {
    messageStore.addMessage(activeTarget.value.id, text)
    persistMetadata()
  } catch (error) {
    showToast(error.message, '!')
  }
}

function removeMessage(id) {
  messageStore.removeMessage(id)
  persistMetadata()
}

function setEmoji(emoji) {
  if (!activeTarget.value) return
  messageStore.setEmoji(activeTarget.value.id, emoji)
  const anchor = arEngine.getAnchor(activeTarget.value.id)
  anchor?.querySelector('a-image')?.setAttribute('src', emojiTextureUrl(emoji))
  persistMetadata()
}

async function handleOverlayAction() {
  if (lifecycle.lastError.value) {
    lifecycle.retryRecovery()
    return
  }
  if (lifecycle.needsUserResume.value) {
    const resumed = await lifecycle.resumeFromGesture()
    if (resumed) setOverlay({ visible: false })
    return
  }
  await startScanning()
}

watch(lifecycle.needsUserResume, (needed) => {
  if (needed) {
    setOverlay({
      visible: true,
      title: '点击继续扫描',
      detail: '浏览器需要再次确认播放摄像头画面。',
      actionLabel: '继续扫描',
    })
  }
})

watch(lifecycle.lastError, (error) => {
  if (error) {
    setOverlay({
      visible: true,
      title: '画面恢复失败',
      detail: error.message || '无法恢复 AR 画面，请重试。',
      actionLabel: '重试恢复',
      error: true,
    })
  }
})

onMounted(() => {
  if (!isSessionOnlyPersistence()) {
    const state = loadLocalState()
    targetStore.hydrate(state.targets)
    messageStore.hydrate(state.messages)
  }
  lifecycle.attach(null)
  projectionFrame = requestAnimationFrame(updateProjection)
})

onBeforeUnmount(() => {
  disposed = true
  cancelAnimationFrame(projectionFrame)
  lifecycle.detach()
  toastTimers.forEach((timer) => clearTimeout(timer))
  toastTimers.clear()
  camera.stop()
  arEngine.park()
  engineMutation = engineMutation.finally(() => {
    camera.stop()
    resetTracking()
    lifecycle.detach()
    arEngine.park()
  })
})
</script>

<template>
  <main class="scanner" aria-label="AR 扫描器">
    <video ref="previewVideo" class="scanner__preview" muted autoplay playsinline></video>
    <div class="scanner__vignette" aria-hidden="true"></div>

    <header class="scanner__header">
      <RouterLink class="scanner__back" to="/" aria-label="返回首页">←</RouterLink>
      <div>
        <strong>CYBERWORLD</strong>
        <small>{{ targetStore.activeTargetId ? '目标已锁定' : cameraReady ? '寻找参照物' : '等待启动' }}</small>
      </div>
      <span class="scanner__live" :class="{ 'scanner__live--on': cameraReady }">
        {{ cameraReady ? 'LIVE' : 'OFF' }}
      </span>
    </header>

    <div v-if="cameraReady && targetStore.targets.length === 0" class="empty-guide">
      <span aria-hidden="true">⌁</span>
      <strong>拍下第一个参照物</strong>
      <p>选择细节丰富、光线均匀的平面图像。</p>
    </div>

    <MessageBoard
      :target="activeTarget"
      :messages="activeMessages"
      :position="projectedPosition"
      @add="addMessage"
      @remove="removeMessage"
      @emoji="setEmoji"
    />

    <Transition name="manager">
      <aside v-if="managerOpen" class="target-manager">
        <header>
          <div>
            <small>LOCAL TARGETS</small>
            <h2>参照物</h2>
          </div>
          <button type="button" aria-label="关闭目标管理" @click="managerOpen = false">×</button>
        </header>
        <p v-if="targetStore.targets.length === 0" class="target-manager__empty">还没有保存参照物。</p>
        <article v-for="target in targetStore.targets" :key="target.id">
          <span>{{ target.emoji }}</span>
          <div>
            <strong>{{ target.name }}</strong>
            <small>{{ new Date(target.createdAt).toLocaleDateString() }}</small>
          </div>
          <button type="button" :disabled="targetStore.isCompiling" @click="removeTarget(target)">删除</button>
        </article>
      </aside>
    </Transition>

    <EditorToolbar
      :target-count="targetStore.targets.length"
      :busy="targetStore.isCompiling"
      :progress="targetStore.compileState.progress"
      :ready="cameraReady"
      @capture="captureTarget"
      @toggle-manager="managerOpen = !managerOpen"
    />
    <ToastHost :items="toasts" />
    <TransitionOverlay
      v-bind="overlay"
      @action="handleOverlayAction"
    />
  </main>
</template>
