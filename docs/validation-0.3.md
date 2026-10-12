# 0.3.0 有限范围复现

生产预览与验收请使用 `node server/index.mjs`，避免 Vite 热重载在持续播放中重新加载页面。所有测试使用新 RUN_DIR，保留旧失败证据。需要 Node 24、npm ci、Chrome；Linux 可以安装 Playwright Chromium。

## 新来源

```powershell
$env:PORT='4187'
$env:STREAMDESK_SOURCES='data/sources.example.json'
node server/index.mjs
# 另一个终端
$env:APP_URL='http://127.0.0.1:4187'
$env:TEST_SOURCES='data/expansion-verified.json'
$env:TEST_WORKS='data/expansion-works.json'
$env:RUN_DIR='reports/runs/your-new-run'
npm run acceptance:search
$env:ONLY_TITLES='流浪地球,爱情公寓3,葬送的芙莉莲,女友的朋友,漫长的季节,灌篮高手'
npm run acceptance:playback
```

每个 API 最多 3 页，API 并发 2；每部每源最多 2 直接分组。不要把 HTTP 200 或首片下载当作解码成功。复用已失败首片证据，避免浏览器重复请求明确 403/404。34 部全部长播放不属于本轮默认流程。

## 增强与画质

```powershell
$env:APP_URL='http://127.0.0.1:4187'
$env:RUN_DIR='reports/runs/your-enhancement-run'
npm run bench:enhancement
# 独显路径：仅作用于这个测试 Chrome，实际 renderer 必须核实
$env:GPU_HIGH_PERFORMANCE='1'
$env:RUN_DIR='reports/runs/your-rtx-run'
$env:BENCH_SAMPLES='low-animation,anime-1080'
npm run bench:enhancement
```

benchmark 使用真实可见视频，输出原生掉帧、播放推进、卡顿与处理成本。首次提交增强不是已扫描到屏幕的时刻。Native 掉帧和画布掉帧不是同一指标。Windows GPU 计数器不可靠时输出 null；不要替换成 0。

`test:quality`、`scripts/abr.mjs` 使用另一个服务及 data/quality-sources.json，支持 ENHANCEMENT=balanced。ABR 禁用媒体缓存与自动换源，要求多码率清单和实际级别变化，避免单码率备用流造成假成功。历史、收藏、手动换线使用原 test:e2e / test:iteration。

## 持续播放

先确保 RUN_DIR 内已有对应 work-N.json。SOAK_MINUTES=30、WORK_INDEX=11、SOURCE_ID=subo。AUTO_SWITCH=1 可以观察真实恢复链，未设置时隔离单源。ENHANCEMENT=balanced 手动启用。进程结束 JSON 中必须有 success/completedAt；被会话中断的半成品不算通过。

失败分类使用实际 HTTP、加载失败和视频状态。连接关闭/timeout 无法仅凭客户端区分服务器与网络。合成 404 注入见 scripts/source-failover.mjs，必须注明故障合成、备用媒体真实。

## Mate 60 实机流程

本轮使用已有 Huawei Browser，不安装测试 APK，不重置浏览器。ADB 必须经用户在手机上授权。仅选择自己的测试页，不对其他 App/WebView 调试。

1. 电脑先运行 4187 服务；node scripts/mobile-session.mjs 启动只监听回环的 4190 测试助手。
2. 先检查 `adb reverse --list`，确认端口没有用户映射，再 `adb reverse tcp:4190 tcp:4190`。
3. 用现有浏览器打开 http://localhost:4190/，点击测试页的“开始测试”。页面申请临时 screen WakeLock，不修改屏幕休眠设置；测试结束停止视频、释放锁。
4. 需要 CDP 时，先用 pidof com.huawei.browser 核实 PID；仅转发对应 huawei_webview_devtools_remote_PID 到一个空闲本地端口（脚本约定 9228）。mobile-cdp.mjs 仅选 localhost:4190 测试页，不调用清数据/重启浏览器功能。
5. mobile-soak.mjs 运行 10 分钟，并读取浏览器主进程 CPU、RSS 和电池温度。CPU 100% 表示一核；它不是全系统或所有浏览器子进程。USB 充电下不能由电量变化计算播放功耗。
6. 手机上的 WebGL 暂停帧离屏 CDP 截图不可靠；mobile-physical-visual.mjs 改用 ADB 真实屏幕。对比必须保留同一暂停进度，原生播放控制层不用于画质比较。
7. 清理只移除本轮创建的 reverse/forward 映射、停止本轮助手、关闭测试页并释放唤醒锁；不 force-stop 用户浏览器、不清它的缓存或应用数据，也不 kill-server 影响其他 ADB 会话。

不要对低端手机复用 Mate 60 的性能结论。手机默认增强关闭；自动策略倾向轻量，1080p 超过轻量预算时原画更稳。真人、动漫神经超分及多遍滤镜没有集成，见 enhancement-research.md。

## 干净打包

npm run test:package 模拟不带忽略文件的检出，复制已构建 dist，验证必要模块、清单、静态 JS 和目录 API。npm run package:pwa 创建 artifacts/streamdesk-VERSION，存在旧包时拒绝覆盖。INCLUDE_EVIDENCE=1 只在本地附带 raw reports；GitHub 工作流默认生成小型完整运行包，不需要 research 或私人 sources.json。

GitHub CI 的 dist artifact 只是前端构建产物；release-pwa 的 ZIP 才含 Node 后端、shared、vendor、默认数据与启动脚本。ZIP 需要电脑安装 Node 24，不包含独立客户端或自动安装更新。
