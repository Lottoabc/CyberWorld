import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useTargetStore } from './targets.js'

function codedError(message, code) {
  return Object.assign(new Error(message), { code })
}

export const useMessageStore = defineStore('messages', () => {
  const messages = ref([])

  function hydrate(items) {
    messages.value = Array.isArray(items) ? items : []
  }

  function messagesFor(targetId) {
    return messages.value.filter((message) => message.targetId === targetId)
  }

  function addMessage(targetId, input) {
    const characters = [...String(input).trim()]
    if (characters.length === 0) throw codedError('留言不能为空', 'EMPTY_MESSAGE')
    const message = {
      id: crypto.randomUUID(),
      targetId,
      text: characters.slice(0, 280).join(''),
      createdAt: new Date().toISOString(),
    }
    messages.value.push(message)
    return message
  }

  function removeMessage(id) {
    const index = messages.value.findIndex((message) => message.id === id)
    if (index !== -1) messages.value.splice(index, 1)
  }

  function removeForTarget(targetId) {
    messages.value = messages.value.filter((message) => message.targetId !== targetId)
  }

  function setEmoji(targetId, emoji) {
    useTargetStore().updateEmoji(targetId, [...String(emoji)].slice(0, 4).join('') || '✨')
  }

  return {
    messages,
    hydrate,
    messagesFor,
    addMessage,
    removeMessage,
    removeForTarget,
    setEmoji,
  }
})
