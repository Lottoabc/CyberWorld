import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'

const MAX_TARGETS = 5

function codedError(message, code) {
  return Object.assign(new Error(message), { code })
}

export const useTargetStore = defineStore('targets', () => {
  const targets = ref([])
  const activeTargetId = ref(null)
  const compileState = reactive({
    phase: 'idle',
    progress: 0,
    candidateId: null,
    error: null,
  })

  const isCompiling = computed(() =>
    ['encoding', 'compiling', 'swapping'].includes(compileState.phase),
  )

  function hydrate(items) {
    targets.value = Array.isArray(items) ? items.slice(0, MAX_TARGETS) : []
  }

  function addCandidate(candidate) {
    if (targets.value.length >= MAX_TARGETS) {
      throw codedError('最多保存 5 个参照物', 'TARGET_LIMIT')
    }
    return {
      name: `参照物 ${targets.value.length + 1}`,
      emoji: '✨',
      createdAt: new Date().toISOString(),
      imageKey: candidate.id,
      ...candidate,
    }
  }

  function commitCandidate(candidate) {
    if (!targets.value.some((target) => target.id === candidate.id)) {
      if (targets.value.length >= MAX_TARGETS) throw codedError('最多保存 5 个参照物', 'TARGET_LIMIT')
      targets.value.push(candidate)
    }
    finishCompile()
  }

  function beginCompile(candidateId = null) {
    if (isCompiling.value) throw codedError('已有编译任务正在运行', 'COMPILE_BUSY')
    Object.assign(compileState, {
      phase: 'encoding',
      progress: 0,
      candidateId,
      error: null,
    })
  }

  function setCompileProgress(progress) {
    compileState.phase = 'compiling'
    compileState.progress = Math.max(0, Math.min(100, Math.round(progress)))
  }

  function beginSwap() {
    compileState.phase = 'swapping'
    compileState.progress = 100
  }

  function finishCompile() {
    Object.assign(compileState, {
      phase: 'idle',
      progress: 0,
      candidateId: null,
      error: null,
    })
  }

  function failCompile(error) {
    Object.assign(compileState, {
      phase: 'error',
      progress: 0,
      candidateId: null,
      error: error?.message ?? String(error),
    })
  }

  function removeTarget(id) {
    const index = targets.value.findIndex((target) => target.id === id)
    if (index === -1) return null
    const [removed] = targets.value.splice(index, 1)
    if (activeTargetId.value === id) activeTargetId.value = null
    return removed
  }

  function updateEmoji(id, emoji) {
    const target = targets.value.find((item) => item.id === id)
    if (target) target.emoji = emoji
  }

  function setActiveTarget(id) {
    activeTargetId.value = id
  }

  return {
    targets,
    activeTargetId,
    compileState,
    isCompiling,
    hydrate,
    addCandidate,
    commitCandidate,
    beginCompile,
    setCompileProgress,
    beginSwap,
    finishCompile,
    failCompile,
    removeTarget,
    updateEmoji,
    setActiveTarget,
  }
})
