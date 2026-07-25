<script setup>
defineProps({
  targetCount: { type: Number, required: true },
  busy: { type: Boolean, default: false },
  progress: { type: Number, default: 0 },
  ready: { type: Boolean, default: false },
})

defineEmits(['capture', 'toggle-manager'])
</script>

<template>
  <footer class="toolbar" aria-label="扫描工具栏">
    <button class="toolbar__side" type="button" aria-label="管理参照物" @click="$emit('toggle-manager')">
      <span aria-hidden="true">⌗</span>
      <small>{{ targetCount }} / 5</small>
    </button>
    <button
      class="capture-button"
      data-test="capture"
      type="button"
      :disabled="!ready || busy || targetCount >= 5"
      :aria-label="busy ? '正在编译参照物' : '拍照新增参照物'"
      @click="$emit('capture')"
    >
      <span class="capture-button__ring">
        <span aria-hidden="true">{{ busy ? '···' : '＋' }}</span>
      </span>
    </button>
    <div class="toolbar__status" :class="{ 'toolbar__status--busy': busy }">
      <span>{{ busy ? `${progress}%` : 'AR' }}</span>
      <small>{{ busy ? '后台编译' : '就绪' }}</small>
    </div>
    <div v-if="busy" class="toolbar__progress" aria-label="后台编译进度">
      <span :style="{ width: `${progress}%` }"></span>
    </div>
  </footer>
</template>
