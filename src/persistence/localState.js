const STORAGE_KEY = 'cyberworld.state.v1'

export function createEmptyState() {
  return {
    version: 1,
    targets: [],
    messages: [],
  }
}

export function loadLocalState(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (!raw) return createEmptyState()
    const state = JSON.parse(raw)
    if (state?.version !== 1 || !Array.isArray(state.targets) || !Array.isArray(state.messages)) {
      return createEmptyState()
    }
    return {
      version: 1,
      targets: state.targets,
      messages: state.messages,
    }
  } catch {
    return createEmptyState()
  }
}

export function saveLocalState(storage = globalThis.localStorage, state) {
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      targets: Array.isArray(state.targets) ? state.targets : [],
      messages: Array.isArray(state.messages) ? state.messages : [],
    }),
  )
}
