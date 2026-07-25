const DATABASE_NAME = 'cyberworld'
const DATABASE_VERSION = 1
const memoryImages = new Map()
let memoryBuffer = null
let memoryTargetIds = null
let sessionOnly = false

export function openCyberWorldDb(factory = globalThis.indexedDB) {
  if (!factory) {
    return Promise.reject(Object.assign(new Error('IndexedDB unavailable'), { code: 'STORAGE_UNAVAILABLE' }))
  }
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains('images')) database.createObjectStore('images')
      if (!database.objectStoreNames.contains('compiled')) database.createObjectStore('compiled')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(Object.assign(new Error('IndexedDB blocked'), { code: 'STORAGE_BLOCKED' }))
  })
}

async function execute(storeName, mode, operation) {
  const database = await openCyberWorldDb()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode)
    const store = transaction.objectStore(storeName)
    let request
    try {
      request = operation(store)
    } catch (error) {
      database.close()
      reject(error)
      return
    }
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => {
      database.close()
      resolve(request.result ?? null)
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error)
    }
    transaction.onabort = () => {
      database.close()
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
    }
  })
}

async function withFallback(databaseOperation, memoryOperation) {
  if (sessionOnly) return memoryOperation()
  try {
    return await databaseOperation()
  } catch {
    sessionOnly = true
    return memoryOperation()
  }
}

export function isSessionOnlyPersistence() {
  return sessionOnly
}

export async function putImage(id, blob) {
  memoryImages.set(id, blob)
  return withFallback(
    () => execute('images', 'readwrite', (store) => store.put(blob, id)),
    () => id,
  )
}

export async function getImage(id) {
  return withFallback(
    async () => {
      const value = await execute('images', 'readonly', (store) => store.get(id))
      if (value) memoryImages.set(id, value)
      return value
    },
    () => memoryImages.get(id) ?? null,
  )
}

export async function deleteImage(id) {
  memoryImages.delete(id)
  return withFallback(
    () => execute('images', 'readwrite', (store) => store.delete(id)),
    () => null,
  )
}

export async function putMindBuffer(buffer) {
  memoryBuffer = buffer
  return withFallback(
    () => execute('compiled', 'readwrite', (store) => store.put(buffer, 'active')),
    () => 'active',
  )
}

export async function getMindBuffer() {
  return withFallback(
    async () => {
      const value = await execute('compiled', 'readonly', (store) => store.get('active'))
      if (value) memoryBuffer = value
      return value
    },
    () => memoryBuffer,
  )
}

export async function putCompiledState(buffer, targetIds) {
  memoryBuffer = buffer
  memoryTargetIds = [...targetIds]
  return withFallback(
    async () => {
      const database = await openCyberWorldDb()
      return new Promise((resolve, reject) => {
        const transaction = database.transaction('compiled', 'readwrite')
        const store = transaction.objectStore('compiled')
        store.put(buffer, 'active')
        store.put([...targetIds], 'targetIds')
        transaction.oncomplete = () => {
          database.close()
          resolve()
        }
        transaction.onerror = transaction.onabort = () => {
          database.close()
          reject(transaction.error ?? new Error('Compiled state transaction failed'))
        }
      })
    },
    () => null,
  )
}

export async function getCompiledTargetIds() {
  return withFallback(
    async () => {
      const value = await execute('compiled', 'readonly', (store) => store.get('targetIds'))
      if (Array.isArray(value)) memoryTargetIds = value
      return Array.isArray(value) ? value : null
    },
    () => memoryTargetIds,
  )
}

export async function deleteMindBuffer() {
  memoryBuffer = null
  memoryTargetIds = null
  return withFallback(
    async () => {
      const database = await openCyberWorldDb()
      return new Promise((resolve, reject) => {
        const transaction = database.transaction('compiled', 'readwrite')
        const store = transaction.objectStore('compiled')
        store.delete('active')
        store.delete('targetIds')
        transaction.oncomplete = () => {
          database.close()
          resolve()
        }
        transaction.onerror = transaction.onabort = () => {
          database.close()
          reject(transaction.error ?? new Error('Compiled state delete failed'))
        }
      })
    },
    () => null,
  )
}
