const DATABASE_NAME = 'cyberworld'
const DATABASE_VERSION = 1

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

export function putImage(id, blob) {
  return execute('images', 'readwrite', (store) => store.put(blob, id))
}

export function getImage(id) {
  return execute('images', 'readonly', (store) => store.get(id))
}

export function deleteImage(id) {
  return execute('images', 'readwrite', (store) => store.delete(id))
}

export function putMindBuffer(buffer) {
  return execute('compiled', 'readwrite', (store) => store.put(buffer, 'active'))
}

export function getMindBuffer() {
  return execute('compiled', 'readonly', (store) => store.get('active'))
}

export function deleteMindBuffer() {
  return execute('compiled', 'readwrite', (store) => store.delete('active'))
}
