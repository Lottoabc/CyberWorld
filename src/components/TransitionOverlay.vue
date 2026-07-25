<script setup>
defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: '' },
  detail: { type: String, default: '' },
  actionLabel: { type: String, default: '' },
  error: { type: Boolean, default: false },
})

defineEmits(['action'])
</script>

<template>
  <Transition name="overlay">
    <section v-if="visible" class="transition-overlay" :class="{ 'transition-overlay--error': error }">
      <div class="transition-overlay__mark" aria-hidden="true">
        <span>{{ error ? '!' : '◌' }}</span>
      </div>
      <h2>{{ title }}</h2>
      <p>{{ detail }}</p>
      <button
        v-if="actionLabel"
        data-test="start-scanning"
        class="primary-button transition-overlay__action"
        type="button"
        @click="$emit('action')"
      >
        {{ actionLabel }}
      </button>
    </section>
  </Transition>
</template>
