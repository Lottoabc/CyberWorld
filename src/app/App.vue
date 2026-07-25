<script setup>
import { provide, ref } from 'vue'

const arHost = ref(null)
provide('arHost', arHost)
</script>

<template>
  <div ref="arHost" class="ar-persistent-host" hidden aria-hidden="true"></div>
  <RouterView />
</template>
