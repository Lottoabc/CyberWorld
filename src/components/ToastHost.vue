<script setup>
defineProps({
  items: { type: Array, default: () => [] },
})
</script>

<template>
  <div class="toast-host" aria-live="polite" aria-atomic="true">
    <TransitionGroup name="toast">
      <div v-for="item in items" :key="item.id" class="toast">
        <span aria-hidden="true">{{ item.icon || '✓' }}</span>
        {{ item.text }}
      </div>
    </TransitionGroup>
  </div>
</template>
