<script setup>
import { useRouter } from 'vue-router'

defineOptions({ name: 'WelcomeView' })

const router = useRouter()
</script>

<template>
  <main class="welcome">
    <div class="welcome__glow" aria-hidden="true"></div>
    <section class="welcome__card">
      <p class="eyebrow">LOCAL-FIRST WEBAR</p>
      <h1>把现实留成<br /><span>一扇入口</span></h1>
      <p class="welcome__intro">
        拍下身边的图像作为参照物。再次对准它时，让 emoji 与留言从现实中浮现。
      </p>
      <ul class="welcome__facts" aria-label="隐私与功能">
        <li>所有图片与留言只保存在当前设备</li>
        <li>无需账号，不会上传任何内容</li>
        <li>最多保存 5 个本地参照物</li>
      </ul>
      <button class="primary-button" type="button" @click="router.push('/scan')">
        进入 CyberWorld
        <span aria-hidden="true">↗</span>
      </button>
      <p class="welcome__permission">进入扫描器后才会请求摄像头权限</p>
    </section>
  </main>
</template>
