# CyberWorld Static WebAR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete browser-only WebAR experience that captures up to five local image targets, compiles and tracks them with MindAR, persists content locally, and deploys under GitHub Pages at `/CyberWorld/`.

**Architecture:** Vue owns application UI and serializable Pinia state while an imperative AR adapter owns an isolated A-Frame DOM subtree. MindAR's official Compiler performs browser-side compilation, IndexedDB atomically stores compiled data plus authoritative target order, and a controlled MindAR system restart swaps targets inside one retained A-Frame scene. Only one camera stream is active: the app owns it before the first target, and MindAR owns it while AR is active.

**Tech Stack:** Vue 3 Composition API, Pinia, Vue Router hash history, Vite, Vitest, fake-indexeddb, MindAR 1.2.5 CDN build, A-Frame 1.5.0 CDN build, GitHub Actions/Pages.

## Global Constraints

- The application is fully static and contains no server, Socket.IO, REST upload endpoint, or remote database.
- Vite `base` is exactly `/CyberWorld/`.
- Vue Router uses `createWebHashHistory()`.
- MindAR is exactly 1.2.5 and A-Frame is exactly 1.5.0, loaded from CDN scripts in root `index.html`.
- A browser profile stores no more than five targets.
- `localStorage` stores lightweight metadata/messages; IndexedDB stores image Blob and `.mind` ArrayBuffer values.
- Vue never renders or patches the children of the isolated A-Frame mount element.
- Every replaced Blob URL, media track, animation frame, timer, and event listener is released.
- The supported mobile baseline is current Android Chrome and iOS Safari.

---

## File Map

```text
.
├── .github/workflows/deploy.yml
├── docs/superpowers/
│   ├── plans/2026-07-25-static-webar-implementation.md
│   └── specs/2026-07-25-static-webar-design.md
├── src/
│   ├── app/App.vue
│   ├── components/
│   │   ├── EditorToolbar.vue
│   │   ├── MessageBoard.vue
│   │   ├── TargetAnchor.js
│   │   ├── ToastHost.vue
│   │   └── TransitionOverlay.vue
│   ├── composables/
│   │   ├── useArEngine.js
│   │   ├── useCameraStream.js
│   │   ├── useCoordinateProjector.js
│   │   ├── useLifecycleRecovery.js
│   │   └── useTargetCompiler.js
│   ├── persistence/
│   │   ├── indexedDb.js
│   │   └── localState.js
│   ├── router/index.js
│   ├── stores/
│   │   ├── messages.js
│   │   └── targets.js
│   ├── styles/main.css
│   ├── utils/blobUrlLease.js
│   ├── utils/targetRegistry.js
│   ├── views/ScannerView.vue
│   ├── views/WelcomeView.vue
│   └── main.js
├── tests/
│   ├── setup.js
│   ├── arEngine.test.js
│   ├── blobUrlLease.test.js
│   ├── cameraStream.test.js
│   ├── coordinateProjector.test.js
│   ├── indexedDb.test.js
│   ├── lifecycleRecovery.test.js
│   ├── localState.test.js
│   ├── messages.test.js
│   ├── router.test.js
│   ├── scannerView.test.js
│   ├── targetCompiler.test.js
│   ├── targetRegistry.test.js
│   └── targets.test.js
├── .gitignore
├── index.html
├── package.json
├── README.md
├── vite.config.js
└── vitest.config.js
```

---

### Task 1: Runnable Vue Shell and GitHub Pages Base

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `vitest.config.js`
- Create: `index.html`
- Create: `.gitignore`
- Create: `src/main.js`
- Create: `src/app/App.vue`
- Create: `src/router/index.js`
- Create: `src/views/WelcomeView.vue`
- Create: `src/views/ScannerView.vue`
- Create: `src/styles/main.css`
- Create: `tests/setup.js`

**Interfaces:**
- Produces: Vue application mounted at `#app`.
- Produces: router with `/` and `/scan` routes using hash history.
- Produces: global `window.MINDAR` and `window.AFRAME` from pinned CDN scripts.

- [ ] **Step 1: Create the package manifest and build configuration**

Use exact scripts `dev`, `build`, `preview`, and `test`. Pin exact package versions: `vue@3.5.13`, `pinia@2.3.1`, `vue-router@4.5.0`, `vite@6.1.0`, `@vitejs/plugin-vue@5.2.1`, `vitest@3.0.5`, `jsdom@26.0.0`, `@vue/test-utils@2.4.6`, and `fake-indexeddb@6.0.0`. Configure:

```js
// vite.config.js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/CyberWorld/',
  plugins: [vue()],
  build: { target: 'es2020' },
})
```

- [ ] **Step 2: Create the root HTML with pinned AR scripts**

Place A-Frame before the MindAR A-Frame bundle and load both before Vite's module entry. MindAR's A-Frame bundle imports the image-target index, which exposes `window.MINDAR.IMAGE.Compiler`, and registers the scene system and target component:

```html
<script src="https://aframe.io/releases/1.5.0/aframe.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-aframe.prod.js"></script>
<script type="module" src="/src/main.js"></script>
```

- [ ] **Step 3: Add router smoke test and verify initial failure**

Add a test that imports the router, asserts hash history is used, and resolves `/scan` to `ScannerView`. Run:

```text
npm install
npm run test -- tests/router.test.js
```

Expected: FAIL because `src/router/index.js` does not yet exist.

- [ ] **Step 4: Implement the minimal app shell**

Create Pinia, install the router, mount `App.vue`, and render `<RouterView />`. The welcome button calls `router.push('/scan')`. `ScannerView` initially renders a semantic `<main aria-label="AR 扫描器">`.

- [ ] **Step 5: Verify shell and build**

Run:

```text
npm run test
npm run build
```

Expected: all tests PASS and `dist/index.html` references `/CyberWorld/assets/`.

- [ ] **Step 6: Commit**

```text
git add package.json package-lock.json vite.config.js vitest.config.js index.html .gitignore src tests
git commit -m "feat: scaffold static Vue application"
```

---

### Task 2: Durable Local Persistence

**Files:**
- Create: `src/persistence/localState.js`
- Create: `src/persistence/indexedDb.js`
- Create: `tests/localState.test.js`
- Create: `tests/indexedDb.test.js`

**Interfaces:**
- Produces: `loadLocalState(storage): { version: 1, targets: [], messages: [] }`.
- Produces: `saveLocalState(storage, state): void`.
- Produces: `openCyberWorldDb(): Promise<IDBDatabase>`.
- Produces: `putImage(id, blob)`, `getImage(id)`, `deleteImage(id)`.
- Produces: `putMindBuffer(buffer)`, `getMindBuffer()`.

- [ ] **Step 1: Write local state failure tests**

Test valid state round-trip, malformed JSON fallback, unsupported schema fallback, and quota error propagation. The canonical storage key is `cyberworld.state.v1`.

- [ ] **Step 2: Run local state tests**

Run `npm run test -- tests/localState.test.js`.

Expected: FAIL because the persistence module is missing.

- [ ] **Step 3: Implement schema-safe local state**

Use this default factory and validate every array before accepting stored data:

```js
export const createEmptyState = () => ({
  version: 1,
  targets: [],
  messages: [],
})
```

Malformed or incompatible input returns a fresh empty state without modifying storage.

- [ ] **Step 4: Write IndexedDB failure tests**

Use `fake-indexeddb/auto`. Verify Blob round-trip by `id`, ArrayBuffer round-trip under key `active`, deletion, and database-open failure behavior.

- [ ] **Step 5: Implement IndexedDB stores**

Open database `cyberworld`, version `1`, with object stores `images` and `compiled`. Wrap requests and transactions in Promises and reject with the original `DOMException`.

- [ ] **Step 6: Run persistence tests**

Run `npm run test -- tests/localState.test.js tests/indexedDb.test.js`.

Expected: all persistence tests PASS.

- [ ] **Step 7: Commit**

```text
git add src/persistence tests/localState.test.js tests/indexedDb.test.js
git commit -m "feat: persist AR data in browser storage"
```

---

### Task 3: Stable Target Registry and Pinia Stores

**Files:**
- Create: `src/utils/targetRegistry.js`
- Create: `src/stores/targets.js`
- Create: `src/stores/messages.js`
- Create: `tests/targetRegistry.test.js`
- Create: `tests/targets.test.js`
- Create: `tests/messages.test.js`

**Interfaces:**
- Produces: `createTargetRegistry(targets): { indexFor(id), idFor(index), entries }`.
- Produces: `useTargetStore()` with `targets`, `activeTargetId`, `compileState`, `addCandidate`, `commitCandidate`, `removeTarget`, `setCompileProgress`.
- Produces: `useMessageStore()` with `messagesFor(targetId)`, `addMessage(targetId, text)`, `removeMessage(id)`, `setEmoji(targetId, emoji)`.

- [ ] **Step 1: Test stable ID/index mapping**

For targets `a`, `b`, `c`, assert indices `0`, `1`, `2`. Remove `b`, rebuild, and assert `a` remains index `0`, `c` becomes index `1`, while all content lookup still uses ID `c`.

- [ ] **Step 2: Implement registry and verify**

The registry snapshots target order, stores both `Map<string, number>` and an ID array, and returns `null` for unknown values. Run `npm run test -- tests/targetRegistry.test.js`.

- [ ] **Step 3: Test target store constraints**

Verify:

- the sixth target is rejected with code `TARGET_LIMIT`;
- two simultaneous compile starts are rejected with code `COMPILE_BUSY`;
- a candidate only joins the committed target list after successful compilation;
- removal updates active target state.

- [ ] **Step 4: Implement target store**

Use explicit compile states:

```js
const compileState = reactive({
  phase: 'idle',
  progress: 0,
  candidateId: null,
  error: null,
})
```

Allowed phases are `idle`, `encoding`, `compiling`, `swapping`, and `error`.

- [ ] **Step 5: Test and implement message store**

Reject trimmed empty text, cap text at 280 Unicode code points, and keep messages keyed by stable `targetId`. Emoji changes update target metadata without altering `targetIndex`.

- [ ] **Step 6: Run store tests**

Run `npm run test -- tests/targetRegistry.test.js tests/targets.test.js tests/messages.test.js`.

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```text
git add src/utils/targetRegistry.js src/stores tests
git commit -m "feat: add target and message state"
```

---

### Task 4: Non-Freezing Camera Capture

**Files:**
- Create: `src/composables/useCameraStream.js`
- Create: `tests/cameraStream.test.js`

**Interfaces:**
- Produces: `useCameraStream({ mediaDevices, documentRef })`.
- Produces methods: `start(videoEl)`, `resume(videoEl)`, `captureFrame(videoEl)`, `stop()`.
- `captureFrame` returns `Promise<Blob>` without calling `pause()` or replacing the preview source.
- `start` is used only when no compiled AR targets exist; while AR is active, `captureFrame` receives the MindAR system's video element and no second stream is requested.

- [ ] **Step 1: Write camera behavior tests**

Mock `getUserMedia`, MediaStreamTrack `clone`/`stop`, a canvas 2D context, and `toBlob`. Assert environment facing mode, `playsInline`, no video pause during capture, and all tracks stopped during cleanup.

- [ ] **Step 2: Run failure test**

Run `npm run test -- tests/cameraStream.test.js`.

Expected: FAIL because `useCameraStream` is missing.

- [ ] **Step 3: Implement camera lifecycle**

Request:

```js
{
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
}
```

Set `muted`, `autoplay`, and `playsInline` before assigning `srcObject`. `captureFrame` draws the current video frame into an offscreen canvas scaled to a maximum long edge of 1280 pixels and exports JPEG at quality `0.86`.

- [ ] **Step 4: Verify camera tests**

Run `npm run test -- tests/cameraStream.test.js`.

Expected: PASS, including the assertion that `pause` was never called.

- [ ] **Step 5: Commit**

```text
git add src/composables/useCameraStream.js tests/cameraStream.test.js
git commit -m "feat: capture targets without freezing preview"
```

---

### Task 5: MindAR Compilation Coordinator

**Files:**
- Create: `src/composables/useTargetCompiler.js`
- Create: `tests/targetCompiler.test.js`

**Interfaces:**
- Consumes: image Blobs from `getImage(id)`.
- Produces: `createTargetCompiler({ CompilerClass, createImageBitmapFn })`.
- Produces: `compile(blobs, onProgress): Promise<ArrayBuffer>`.
- Produces: `isCompiling: Readonly<Ref<boolean>>`.

- [ ] **Step 1: Write compiler contract tests**

Use a fake Compiler with `compileImageTargets(images, callback)` and `exportData()`. Assert ordered input, monotonic integer progress, exported ArrayBuffer, bitmap cleanup, and `COMPILE_BUSY` on concurrent calls.

- [ ] **Step 2: Run failure test**

Run `npm run test -- tests/targetCompiler.test.js`.

Expected: FAIL because the compiler coordinator is missing.

- [ ] **Step 3: Implement compiler orchestration**

Resolve the official constructor from the CDN namespace once the script is loaded. Convert each Blob using `createImageBitmap`, compile in target order, export data, and close each bitmap in `finally`. Normalize progress to `0..100`.

The production resolver checks these supported CDN namespace locations in order:

```js
window.MINDAR?.IMAGE?.Compiler
window.MINDAR?.Compiler
```

If neither exists, throw an error with code `COMPILER_UNAVAILABLE`.

- [ ] **Step 4: Verify compilation tests**

Run `npm run test -- tests/targetCompiler.test.js`.

Expected: PASS for success, failure cleanup, and concurrency rejection.

- [ ] **Step 5: Commit**

```text
git add src/composables/useTargetCompiler.js tests/targetCompiler.test.js
git commit -m "feat: compile image targets in the browser"
```

---

### Task 6: Isolated A-Frame Engine, Blob Leases, and Projection

**Files:**
- Create: `src/utils/blobUrlLease.js`
- Create: `src/components/TargetAnchor.js`
- Create: `src/composables/useArEngine.js`
- Create: `src/composables/useCoordinateProjector.js`
- Create: `tests/blobUrlLease.test.js`
- Create: `tests/arEngine.test.js`
- Create: `tests/coordinateProjector.test.js`

**Interfaces:**
- Produces: `createBlobUrlLease(urlApi)` with `stage(buffer)`, `commit()`, `rollback()`, `dispose()`.
- Produces: `createTargetAnchor({ target, index, documentRef })`.
- Produces: `useArEngine({ documentRef, urlApi })` with `mount(container, buffer, targets)`, `swap(buffer, targets)`, `pause()`, `resume()`, `destroy()`.
- Produces: `createCoordinateProjector({ camera, viewport, smoothingFrames: 5 })` with `project(object3D)` and `reset()`.

- [ ] **Step 1: Test Blob URL ownership**

Verify the active URL is not revoked while staged swap is pending, the previous active URL is revoked exactly once after commit, staged URL is revoked on rollback, and all remaining URLs are revoked on dispose.

- [ ] **Step 2: Implement Blob lease**

Track `activeUrl` and `stagedUrl` privately. Reject a second stage until commit or rollback. `commit()` returns the new active URL; `rollback()` preserves the old active URL.

- [ ] **Step 3: Test imperative scene isolation**

With jsdom and fake AFRAME custom elements, verify:

- mount appends one `<a-scene>` directly under the supplied container;
- target entity count equals target count;
- each entity uses the registry index;
- swap retains the scene, removes old target nodes, and releases the previous MindAR resize listener;
- failed `arReady` causes Blob rollback;
- destroy leaves the container empty.

- [ ] **Step 4: Implement A-Frame scene adapter**

Create all scene nodes with `document.createElement`. Set:

```text
mindar-image="imageTargetSrc: <blob-url>; autoStart: false; maxTrack: 1; uiLoading: no; uiScanning: no; uiError: no"
vr-mode-ui="enabled: false"
device-orientation-permission-ui="enabled: false"
renderer="colorManagement: true; physicallyCorrectLights: true"
```

Append one camera and one target entity per registry entry. Start through `scene.systems['mindar-image-system'].start()` only after `renderstart`. Resolve mount on `arReady`; reject on `arError` or timeout. On swap, stop the old system idempotently, retain the scene, clear the old target registry, configure the system with the staged URL, rebuild target nodes, and commit the Blob lease only after `arReady`. Capture and remove MindAR's anonymous resize listener on every restart.

- [ ] **Step 5: Test five-frame projection smoothing**

Use a fake Three.js vector/camera contract. Feed five known screen positions and assert the returned position equals their moving average; reset removes previous samples; invisible/behind-camera targets return `null`.

- [ ] **Step 6: Implement projector**

Read world position from `object3D.getWorldPosition`, call `.project(camera)`, convert normalized device coordinates to viewport pixels, and average the last five valid samples.

- [ ] **Step 7: Run engine tests**

Run:

```text
npm run test -- tests/blobUrlLease.test.js tests/arEngine.test.js tests/coordinateProjector.test.js
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```text
git add src/utils/blobUrlLease.js src/components/TargetAnchor.js src/composables/useArEngine.js src/composables/useCoordinateProjector.js tests
git commit -m "feat: add isolated AR engine lifecycle"
```

---

### Task 7: Scanner UI and Complete Capture-to-Track Flow

**Files:**
- Create: `src/components/EditorToolbar.vue`
- Create: `src/components/MessageBoard.vue`
- Create: `src/components/ToastHost.vue`
- Create: `src/components/TransitionOverlay.vue`
- Modify: `src/views/ScannerView.vue`
- Modify: `src/views/WelcomeView.vue`
- Modify: `src/styles/main.css`
- Create: `tests/scannerView.test.js`

**Interfaces:**
- Consumes all stores, persistence adapters, camera, compiler, AR engine, and projector.
- Produces the complete user flow from permission gesture through capture, compile, swap, recognition, message editing, and deletion.

- [ ] **Step 1: Write scanner interaction tests**

Mount `ScannerView` with mocked adapters and assert:

- no `getUserMedia` call before “开始扫描”;
- one call after click;
- capture shows “参照物已设定” without pausing preview;
- capture is disabled while compiling;
- progress is visible;
- successful compile calls persistence before AR swap;
- failed compile keeps the previous target list and displays a retryable error;
- delete triggers recompilation and never reassigns messages to another target.

- [ ] **Step 2: Run failure test**

Run `npm run test -- tests/scannerView.test.js`.

Expected: FAIL because the scanner UI components and integration do not exist.

- [ ] **Step 3: Implement capture transaction**

Use this order:

```text
capture Blob
create candidate metadata
show toast
persist candidate image
load all committed images plus candidate
compile ordered images
persist new .mind buffer
stop the app-owned preview stream when adding the first target
swap AR scene
commit candidate metadata and local state
```

On any failure before swap commit, remove the candidate image and restore the previous compile state. On failure after the new buffer is persisted but before scene readiness, rewrite the previous active buffer.

- [ ] **Step 4: Implement target deletion transaction**

If targets remain, compile the remaining ordered images, persist, swap, then delete the removed image and metadata. If none remain, destroy the AR scene, delete compiled data, start the app-owned preview stream, and clear the removed target's messages.

- [ ] **Step 5: Implement UI components and responsive styling**

`EditorToolbar` always occupies the safe bottom zone, shows `n / 5`, provides capture and target-management controls, and displays compact progress. `MessageBoard` follows projected coordinates without intercepting camera gestures outside its controls. `TransitionOverlay` covers permission, initial loading, swapping, recovery, and fatal error states. `ToastHost` uses an `aria-live="polite"` region.

- [ ] **Step 6: Verify scanner tests and production build**

Run:

```text
npm run test -- tests/scannerView.test.js
npm run build
```

Expected: tests PASS and build completes without warnings about unresolved imports.

- [ ] **Step 7: Commit**

```text
git add src/components src/views src/styles tests/scannerView.test.js
git commit -m "feat: complete local WebAR scanner flow"
```

---

### Task 8: Mobile Lifecycle and Recovery

**Files:**
- Create: `src/composables/useLifecycleRecovery.js`
- Modify: `src/views/ScannerView.vue`
- Create: `tests/lifecycleRecovery.test.js`

**Interfaces:**
- Produces: `useLifecycleRecovery({ documentRef, windowRef, pause, resume, rebuild })`.
- Produces: `attach(canvas)`, `detach()`, and reactive `needsUserResume`.

- [ ] **Step 1: Write lifecycle tests**

Assert hidden documents call `pause`, visible documents call `resume`, rejected autoplay sets `needsUserResume`, WebGL context loss calls `preventDefault` and `rebuild`, and detach removes every listener.

- [ ] **Step 2: Run failure test**

Run `npm run test -- tests/lifecycleRecovery.test.js`.

Expected: FAIL because the lifecycle composable is missing.

- [ ] **Step 3: Implement lifecycle recovery**

Register `visibilitychange`, `webglcontextlost`, and `webglcontextrestored`. Serialize resume/rebuild work so visibility and WebGL events cannot launch overlapping scene rebuilds. Expose a user-gesture “继续扫描” action when `video.play()` rejects with `NotAllowedError`.

- [ ] **Step 4: Integrate safe areas and recovery UI**

Apply top/bottom padding using `max(12px, env(safe-area-inset-*))`. Show a non-destructive recovery overlay while rebuilding and preserve the last successful target state.

- [ ] **Step 5: Run lifecycle and full test suites**

Run:

```text
npm run test -- tests/lifecycleRecovery.test.js
npm run test
npm run build
```

Expected: all tests PASS and production build succeeds.

- [ ] **Step 6: Commit**

```text
git add src/composables/useLifecycleRecovery.js src/views/ScannerView.vue src/styles/main.css tests/lifecycleRecovery.test.js
git commit -m "feat: recover mobile AR lifecycle"
```

---

### Task 9: Deployment, Documentation, and Final Verification

**Files:**
- Create: `.github/workflows/deploy.yml`
- Create: `README.md`
- Modify: `package.json`

**Interfaces:**
- Produces: GitHub Pages artifact from `dist`.
- Produces: documented local development, browser support, privacy behavior, storage reset, and deployment steps.

- [ ] **Step 1: Add GitHub Pages workflow**

Trigger on pushes to `main` and manual dispatch. Use Node 22, `npm ci`, `npm run test`, `npm run build`, `actions/upload-pages-artifact`, and `actions/deploy-pages`. Grant only `contents: read`, `pages: write`, and `id-token: write`.

- [ ] **Step 2: Write README**

Document:

- `npm install`, `npm run dev`, `npm run test`, and `npm run build`;
- required HTTPS camera context;
- target limit of five;
- local-only storage and no upload;
- Android Chrome and iOS Safari support;
- how to clear site data;
- the Pages URL `https://lottoabc.github.io/CyberWorld/`.

- [ ] **Step 3: Run clean verification**

Delete only generated `node_modules` and `dist` directories after resolving their exact repository paths, then run:

```text
npm ci
npm run test
npm run build
git status --short
```

Expected: tests PASS, build succeeds, and status lists only intended documentation/workflow changes before commit.

- [ ] **Step 4: Inspect built asset paths**

Search `dist/index.html` and assert all application asset URLs begin with `/CyberWorld/`. Confirm router URLs use `#/`.

- [ ] **Step 5: Commit**

```text
git add .github/workflows/deploy.yml README.md package.json package-lock.json
git commit -m "docs: add Pages deployment and usage guide"
```

- [ ] **Step 6: Final repository verification**

Run:

```text
npm run test
npm run build
git status --short
git log --oneline --decorate -12
```

Expected: all tests PASS, build succeeds, working tree is clean, and the task commits are present on `main`.

- [ ] **Step 7: Push**

Use the configured 7897 proxy and push only after all verification evidence is current:

```text
git -c http.sslBackend=openssl -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push -u origin main
```

Expected: `main` is pushed to `Lottoabc/CyberWorld` and the Pages workflow starts.
