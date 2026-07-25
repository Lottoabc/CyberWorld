<script setup>
import { ref } from 'vue'

const props = defineProps({
  target: { type: Object, default: null },
  messages: { type: Array, default: () => [] },
  position: { type: Object, default: null },
})

const emit = defineEmits(['add', 'remove', 'emoji'])
const draft = ref('')
const emojis = ['✨', '🪐', '👾', '🌿', '💬', '🫧']

function submit() {
  if (!draft.value.trim() || !props.target) return
  emit('add', draft.value)
  draft.value = ''
}
</script>

<template>
  <aside
    v-if="target && position"
    class="message-board"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    aria-label="参照物留言板"
  >
    <header class="message-board__header">
      <button
        v-for="emoji in emojis"
        :key="emoji"
        class="emoji-choice"
        type="button"
        :class="{ 'emoji-choice--active': target.emoji === emoji }"
        :aria-label="`使用 ${emoji}`"
        @click="$emit('emoji', emoji)"
      >
        {{ emoji }}
      </button>
    </header>
    <div class="message-board__list">
      <p v-if="messages.length === 0">还没有留言，写下第一句吧。</p>
      <article v-for="message in messages" :key="message.id">
        <span>{{ message.text }}</span>
        <button type="button" aria-label="删除留言" @click="$emit('remove', message.id)">×</button>
      </article>
    </div>
    <form class="message-board__composer" @submit.prevent="submit">
      <input v-model="draft" maxlength="280" placeholder="留一句话…" aria-label="留言内容" />
      <button type="submit">发送</button>
    </form>
  </aside>
</template>
