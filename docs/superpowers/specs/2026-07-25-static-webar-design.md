# CyberWorld 纯前端 WebAR 设计

## 目标

从空仓库创建一个可部署到 GitHub Pages 的单机 WebAR 应用。应用使用 Vue 3、Pinia、Vite、Hash 模式 Vue Router、MindAR 1.2.5 和 A-Frame 1.5.0；不包含后端、Socket.IO、REST 上传接口或多人协作功能。

用户点击“开始扫描”后授权摄像头。应用可以拍摄最多五个本地参照物，在浏览器中编译 MindAR 目标文件，识别目标后显示对应 emoji 和留言。目标、留言和编译结果在刷新后保留。

## 支持范围

- 主要支持最新版 Android Chrome 和 iOS Safari。
- 部署路径固定为 `/CyberWorld/`。
- GitHub Pages 使用 HTTPS，满足摄像头安全上下文要求。
- 单个浏览器最多保存五个参照物。
- 所有数据仅保存在当前浏览器中，不跨设备同步。

## 技术决策

### 持久化

- `localStorage` 保存 schema 版本、应用设置、留言、emoji 和轻量目标元数据。
- IndexedDB 保存压缩后的目标图片 Blob 和已编译的 `.mind` ArrayBuffer。
- 若 IndexedDB 不可用，应用降级为仅当前会话可用，并明确提示数据不会在刷新后保留。

### 编译

应用使用 MindAR 1.2.5 官方 `Compiler`。Compiler 在主线程完成必要的 DOM canvas 准备，并使用 MindAR 内置 Worker 执行特征编译。应用不再额外把 Compiler 包装进自定义 Worker，因为 Compiler 依赖 `document.createElement`，在普通 Worker 中不可用。

每次新增或删除目标时，应用按稳定顺序重新编译全部目标，生成单个合并 `.mind` ArrayBuffer。任何时刻最多运行一个编译任务。编译失败不会覆盖最后一次成功的目标集合和 `.mind` 数据。

### AR 更新

MindAR A-Frame system 没有稳定公开的运行时 `hotSwap` API。应用采用“单场景受控重启式热更新”：

1. 新编译结果成功持久化后创建新 Blob URL。
2. 显示短暂过渡蒙版；停止当前唯一摄像头流，避免移动端双流抢占。
3. 保留唯一 A-Frame 场景，停止 MindAR system 并清理其目标与 resize 监听器。
4. 使用新 Blob URL 重新配置 system，只重建 target 节点。
5. 等待 system 再次发出 `arReady`。
6. 隐藏过渡蒙版并回收旧 Blob URL。

若新 system 启动失败，应用在同一场景中使用最后一次成功的 `.mind` 数据回滚。Blob URL 只有在不再被 system 引用后才会调用 `URL.revokeObjectURL`。

## 架构

### 应用外壳

- Vue Router 使用 `createWebHashHistory()`。
- `/` 为欢迎与权限说明页。
- `/scan` 为 AR 扫描页。
- Pinia 保存可序列化的应用状态，不保存 MediaStream、DOM 节点、A-Frame 对象或 Blob URL。

### A-Frame DOM 隔离

A-Frame 场景由 `useArEngine` 在 Vue 管理范围之外的原生挂载容器中创建。Vue 只持有容器 ref，不通过模板渲染 `<a-scene>` 子树。目标节点和事件监听器全部通过原生 DOM API 管理，避免 Vue Virtual DOM 与 A-Frame 的 DOM 改写冲突。

### 核心模块

- `useCameraStream`：在尚无 AR 目标时请求后置摄像头并维护预览；存在 AR 目标时改为读取 MindAR 的视频元素；负责恢复 iOS 播放、复制当前帧以及释放应用自有轨道。
- `useTargetCompiler`：加载 MindAR Compiler、顺序编译全部图片、报告进度并导出 ArrayBuffer。
- `useArEngine`：创建和销毁唯一 AR 场景，启动、暂停、恢复及重启 MindAR system；管理 Blob URL 与全局监听器生命周期。
- `useTargetRegistry`：把稳定目标 ID 映射到当前 `.mind` 文件的 `targetIndex`。
- `useCoordinateProjector`：从 target entity 读取世界坐标，投影到二维屏幕坐标，以最近五帧平均值平滑位置。
- `usePersistence`：封装 localStorage 和 IndexedDB，并处理 schema 版本。
- `targetStore`：保存目标元数据、编译状态、进度、当前识别目标和错误状态。
- `messageStore`：按稳定目标 ID 保存 emoji 和留言。

### UI 组件

- `WelcomeView`：功能说明和“开始扫描”按钮。
- `ScannerView`：组合摄像头、AR 挂载层、留言层、工具栏和过渡状态。
- `TargetAnchor`：表示目标的 emoji AR 内容和追踪事件。
- `MessageBoard`：显示并编辑当前目标留言。
- `EditorToolbar`：拍照、目标计数、目标管理和编译进度。
- `TransitionOverlay`：权限、编译、AR 重建、恢复及错误过渡。
- `ToastHost`：显示“参照物已设定”等非阻塞反馈。

## 数据模型

### 目标元数据

每个目标包含：

- `id`：随机生成且永久稳定的字符串。
- `name`：用户可见名称。
- `emoji`：默认或用户选择的 emoji。
- `createdAt`：ISO 时间。
- `imageKey`：IndexedDB 图片键。

数组顺序决定当前编译的 `targetIndex`，但留言始终按 `id` 关联。删除目标并重新编译后，registry 会重新生成索引映射，留言不会错配。

### 留言

每条留言包含：

- `id`
- `targetId`
- `text`
- `createdAt`

留言长度有限制，空白留言不保存。

## 用户流程

1. 首次进入只显示欢迎页，不请求摄像头。
2. 用户点击“开始扫描”，应用请求环境摄像头并进入扫描页。
3. 应用从 IndexedDB 恢复最后一次成功的 `.mind` 数据。
4. 存在目标时由 MindAR 持有唯一摄像头流；不存在目标时由应用持有唯一预览流并提示拍摄第一个参照物。
5. 用户点击拍照后，应用从当前唯一视频元素复制帧，视频不暂停。
6. 应用立即显示“参照物已设定”Toast，并开始压缩、持久化及重新编译。
7. 编译期间当前视频预览、留言查看和目标管理保持可用；拍照按钮暂时禁用以阻止并发编译。
8. 编译成功后在单一 A-Frame 场景内执行 MindAR system 受控重启式热更新。
9. MindAR 识别目标时显示 emoji，并将目标的三维坐标投影给留言板。
10. 目标丢失时留言板平滑隐藏。

## 移动端与资源管理

- 视频元素始终设置 `muted`、`autoplay` 和 `playsinline`。
- 摄像头只在明确的用户手势后启动。
- 页面隐藏时暂停 MindAR 处理和视频；返回前台后恢复播放与识别。
- WebGL context lost 时阻止默认销毁行为，展示恢复状态并重建场景。
- 所有固定控件使用 `env(safe-area-inset-*)`。
- 截图在编译前缩放并压缩，限制单次编译内存峰值。
- 销毁时释放 MediaStreamTrack、Blob URL、requestAnimationFrame、计时器和事件监听器。

## 错误处理

- 摄像头权限被拒绝：说明原因并提供重试按钮。
- 浏览器不支持摄像头：展示兼容性提示。
- 图片解码或编译失败：删除本次候选数据，保留旧目标和旧 AR 场景。
- 存储空间不足：保留当前会话中的候选目标，提示用户删除旧目标或释放浏览器空间。
- AR 重建失败：回滚上一个成功版本并展示可重试错误。
- 页面恢复失败：重新请求视频播放；若浏览器要求用户手势，则显示“继续扫描”按钮。

## 测试与验收

### 自动验证

- `npm run test` 通过。
- `npm run build` 零错误。
- 测试目标 registry 在新增、删除、重排后仍按稳定 ID 关联留言。
- 测试持久化序列化、schema 恢复和存储降级。
- 测试 Blob URL 在成功替换、回滚和销毁路径中均正确回收。
- 测试编译队列拒绝并发任务。

### 浏览器验证

- `/CyberWorld/` 可加载，Hash 路由刷新不返回 404。
- 首次进入不会自动请求摄像头。
- 拍照时实时预览不冻结。
- 新目标编译后无需刷新即可识别。
- 刷新后目标、emoji 和留言仍存在。
- 删除目标后其留言不会显示在其他目标上。
- 页面切到后台再返回时可以继续扫描。
- AR 重建过程有状态提示，失败时旧目标仍可恢复。

真实 Android Chrome 和 iOS Safari 上的摄像头、编译耗时、识别质量和 WebGL 恢复效果需要部署后进行最终设备验收。

## 交付

- 完整 Vite 项目与源码。
- GitHub Pages 部署工作流。
- README：本地运行、构建、部署、浏览器支持及隐私说明。
- 设计文档和后续实施计划。
