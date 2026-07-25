# CyberWorld

CyberWorld 是一个完全在浏览器中运行的本地 WebAR 留言应用。你可以拍摄现实中的图片作为参照物；再次对准它时，应用会显示关联的 emoji 和留言。

## 主要特性

- Vue 3、Pinia、Vite 与 Hash 模式 Vue Router。
- MindAR 1.2.5 + A-Frame 1.5.0。
- 浏览器内编译最多 5 个图片参照物。
- 拍照时不暂停实时摄像头画面。
- 编译完成后自动重建追踪引擎，无需刷新页面。
- 参照物图片和 `.mind` 数据保存在 IndexedDB。
- emoji、留言和目标元数据保存在 localStorage。
- 无服务器、无账号、无上传、无跨设备同步。
- 针对安全区域、iOS 自动播放恢复、页面可见性和 WebGL context lost 做了处理。

## 在线体验

部署完成后访问：

https://lottoabc.github.io/CyberWorld/

摄像头只能在 HTTPS 或 localhost 安全上下文中使用。GitHub Pages 默认提供 HTTPS。

## 本地开发

需要 Node.js 22。

```bash
npm install
npm run dev
```

浏览器打开 Vite 输出的本地地址，然后进入扫描器并允许摄像头权限。

## 测试与构建

```bash
npm run test
npm run test:core
npm run build
```

生产文件输出到 `dist/`。Vite 的部署基路径固定为 `/CyberWorld/`。

## 使用说明

1. 进入扫描器并点击“开始扫描”。
2. 没有目标时，点击底部圆形按钮拍摄第一个参照物。
3. 后台编译完成后，对准刚才拍摄的图像。
4. 目标被识别后，可选择 emoji 并添加留言。
5. 点击左下角目标计数可管理或删除参照物。

选择细节丰富、光线均匀、对比明显的平面图片会有更好的识别效果。浏览器端编译需要一定时间，性能取决于手机型号和目标复杂度。

## 浏览器支持

- 最新版 Android Chrome
- 最新版 iOS Safari

桌面 Chrome 可用于开发，但最终摄像头、编译速度和 WebGL 恢复效果应在真实手机上验收。

## 隐私与本地数据

图片和留言不会离开当前浏览器。卸载浏览器、清理网站数据、使用隐私模式或系统回收存储都可能删除这些内容。

如需重置 CyberWorld：

1. 打开浏览器的网站设置。
2. 找到 `lottoabc.github.io`。
3. 清除该网站的存储与权限。

## GitHub Pages

`.github/workflows/deploy.yml` 会在每次分支推送时运行测试和构建；只有 `main` 分支通过全部检查后才部署到 GitHub Pages。
