# StreamDesk 0.3.0

0.3.0 基于 0.2.0，集中扩展红牛/速播备用媒体、真实分片检查与可完全关闭的 WebGL2 空间增强。保留 hls.js、LibreTV 恢复核心、ABR、选集/进度和收藏历史，不重做页面布局。实际可播范围和长时故障见 [本轮性能报告](reports/performance.md)，算法取舍见 [增强调查](reports/enhancement-research.md)。旧来源配置可在来源管理点击“添加本轮验证的备用来源”，原配置不被覆盖。

增强默认关闭，可选轻量、均衡、动漫空间滤镜与实验性自动策略。它不是 RTX VSR、Anime4K CNN 或原生 4K；显示的原生分辨率仍来自解码器。预算、已知 HDR、GPU/CORS 不满足时回退原画；原生视频全屏、PiP 和原生字幕显示时也保持原画。“增强全屏”使用包含画布的播放器区域，底部 52 px 留给原生控制栏。

华为 Mate 60 / 4.2.0.220 已通过真实 HLS、增强开关与快进实测。手机 PWA 使用电脑 Node 后端，通过 ADB 转发访问；这不等同于独立 Android 客户端。手机测试不安装 APK，不清数据，不更改系统设置。


在 0.1.0 上迭代，保留 hls.js / LibreTV 恢复核心与原页面布局。新增 Apple CMS 全播放分组、渐进式搜索、同年同季同半集匹配、实际清晰度与帧率、平滑手动档位切换、设备/网络缓冲策略和可迁移收藏历史。

默认增加光速来源，平台付费入口搜索按用户要求取消。真实作品测试、30 分钟连续播放、公开 2160p 解码与失败证据见 [实测报告](reports/performance.md) 和 [逐部汇总](reports/coverage-summary.json)。不同来源的 API 成功与媒体可播分别计数。

GitHub 源码不包含 dist，需要 npm ci 和 npm run build 后启动。交付 ZIP 包含已构建的 dist，安装 Node.js 24 后可直接启动。升级前关闭旧 StreamDesk 服务窗口，保留 data/sources.json 并导出收藏/历史，重新启动相同端口以保持 PWA 存储原点。

[Windows / Android 架构与更新方案](docs/clients-and-updates.md) 已准备；本版本没有独立 Windows 安装器或 Android APK。API 后端仍运行于电脑 Node，不把手机布局/ADB 转发视为 Android 独立客户端。

## 本轮复现

```powershell
npm ci
npm test
npm run build
npm run test:smoke
# 普通启动；生产使用 Node 24，无须 npm 运行时依赖
node server/index.mjs
```

另一个终端针对已运行应用：

```powershell
$env:APP_URL='http://127.0.0.1:4173'
npm run test:iteration
npm run test:e2e
```

UHD 测试使用独立配置：

```powershell
$env:PORT='4177'
$env:STREAMDESK_SOURCES='data/quality-sources.json'
node server/index.mjs
# 另一个终端
$env:APP_URL='http://127.0.0.1:4177'
npm run test:quality
node scripts/abr.mjs
```

31 部作品测试需要另一个测试服务：

```powershell
$env:PORT='4176'
$env:STREAMDESK_SOURCES='data/acceptance-sources.json'
node server/index.mjs
# 另一个终端：先生成 API / 媒体证据
$env:RUN_DIR='reports/runs/my-run'
npm run acceptance:search
# 浏览器逐部 45 秒 + 未缓存快进
$env:APP_URL='http://127.0.0.1:4176'
npm run acceptance:playback
# 爱情公寓3 第一集，30 分钟，单源隔离
$env:WORK_INDEX='11'
$env:SOURCE_ID='guangsu'
$env:SOAK_MINUTES='30'
npm run acceptance:soak
```

RESUME=1 可从已有证据续跑；ONLY_TITLES 以英文逗号限制复测片名。每次实验使用新的 RUN_DIR 保留旧证据。完整本地证据随交付包提供，GitHub 仅保存小型汇总，避免提交大量临时截图。Chrome 为 Windows 默认测试浏览器；Linux 先 npx playwright install --with-deps chromium。

CI 在 Windows/Linux 运行单元测试与构建，另以隔离外网的浏览器检查 PWA 和数据持久化。release-pwa 工作流生成 ZIP 与 SHA256；原生签名和应用内安装更新需要后续客户端构建，当前没有假成功的原生构建步骤。

下列内容保留原型的调查背景与使用约束，当前实测数字以本轮报告为准。
# StreamDesk 个人影视工作台

可运行的本地 PWA 原型，复用 LibreTV 的 CMS 解析与恢复核心，使用 hls.js 播放。已实现多来源搜索、详情、选集、直接媒体播放、收藏、历史、来源评分、手动/自动换源和进度恢复。FrameXTV 只作为可配置的 Embed 类型，未声称其内部视频已实测可播。

调查结论见 [技术调查](reports/research.md)，实测数字见 [性能报告](reports/performance.md)，原始验收结果见 [acceptance.json](reports/acceptance.json)。失败数据也保留；目前不能保证商业影视全面覆盖或任一外部来源长期稳定。

## 立即运行

需要 **Node.js 24 或更新版本**。交付包含已构建的 `dist/`，生产启动不需要安装 npm 依赖。

Windows 双击 `Start-StreamDesk.cmd`，或在项目目录运行：

```powershell
node server/index.mjs
```

浏览器打开 **http://127.0.0.1:4173**。Chromium 浏览器满足安装条件时，可点击「安装应用」或浏览器的安装按钮，作为电脑 PWA 使用。首次进入安装 Service Worker 后，外壳可离线打开；搜索、详情和远程视频仍需要后端/网络。

默认启用公开影片 HLS、同 CDN 备用清单、Blender 预告、暴风与光速。Apple UHD 测试目录可在来源管理启用。搜索近期样本可用片名「亲爱的警督」「女友的朋友」。这些片名来自实测时 API 最新列表，之后可能变化。旧 MP4 / 量子 / 非凡 / FrameXTV 默认停用。暴风的部分旧片已确认失效，不能把搜索命中当成可播放。

在「来源管理」切换启用状态；高级 JSON 变更保存至 `data/sources.json`，此文件不进入版本控制。首次运行读取 `data/sources.example.json`。不修改默认模板即可继续复现本次配置。

## Android 使用

本次交付是 PWA，没有 APK。已在华为 Mate 60 / 4.2.0.220、Huawei Browser 17.0.8.310 上验证真实 HLS、增强开关与快进。测试通过 USB/ADB 连接电脑后端；不能等同于独立 Android 应用。

Android Chrome 安装 PWA 需要安全来源。USB 调试环境可用 ADB 将手机的 localhost 转发到电脑：

```powershell
adb reverse tcp:4173 tcp:4173
```

保持电脑服务运行，再在手机 Chrome 打开 `http://localhost:4173`。这条部署路径写为复现方案，未在本次环境连接真机验证。也可部署在自己的 HTTPS 服务上。普通局域网 HTTP 地址可访问网页，但不保证 PWA 安装与 Service Worker 能工作；手机访问电脑回环地址也不能直接连通。

默认服务仅监听本机回环。若选择局域网访问，可在自己的可信网络运行：

```powershell
$env:HOST='0.0.0.0'
node server/index.mjs
```

本原型没有公网账户/鉴权部署方案，不应直接把配置写接口暴露给公网。后端在电脑上，电脑停止服务后，手机无法继续通过它搜索/获取详情。没有跨设备同步或云端托管。

## 开发与复现

```powershell
npm.cmd ci --cache .npm-cache
npm.cmd run build
npm.cmd test
npm.cmd start
```

另开终端，按顺序运行，避免网络采样与播放实验抢带宽：

```powershell
npm.cmd run bench:network
node scripts/probe-catalog.mjs
node scripts/provider-media.mjs
node scripts/probe-latest.mjs
node scripts/provider-media.mjs --latest
npm.cmd run bench:playback
node scripts/abr.mjs
npm.cmd run test:e2e
npm.cmd run report
```

Windows 测试脚本默认使用已安装 Chrome。其他系统先安装 Playwright Chromium：`npx playwright install chromium`，或设置 `BROWSER_PATH`。不使用用户日常浏览器配置或登录 Cookie。

`reports/test-plan.json` 固定了本次两轮播放的来源与影片 ID。`ROUNDS` 默认 2，`WATCH_SECONDS` 默认 12；`APP_URL` 默认回环 4173。首帧等待上限 25 秒，快进上限 16 秒。每轮使用独立浏览器上下文；测试失败会保留错误，不伪造指标。数据量有界：网络并发 2、单个分片最多 8 MiB；播放实验并发 1。外部来源 ID、地址、授权和可用性变化会改变结果。

早期的 `initial-playback.json` 和 `initial-network.json` 是旧来源基线；`warm-playback.json` 为固定 60 秒快进的中间数据，其中 Sintel 预告成功判定阈值不适用于短片，因此不作为最终成功率依据。最终 `playback.json` 使用按实际时长计算的目标，并标注 buffered/unbuffered，保留中间文件便于审计。

`scripts/research.mjs`、`frame-docs.mjs`、`frame-browser.mjs` 与来源文档探测脚本可重做公开能力核实。研究中的网页 JS 只作为观察证据，未执行/复用其解析算法。本地源码快照：

```powershell
git -c http.sslBackend=openssl clone https://github.com/LibreSpark/LibreTV.git research/upstream/LibreTV
git -C research/upstream/LibreTV checkout a24ad336a3f7c8a16ca93d1f1198e08ac6b7e943
```

其他两个上游提交在技术报告中记录。上游源码不在轻量运行包中；复用的必要文件与许可证已随应用保留。

## 来源适配器

在 `server/adapters.mjs` 的 Map 中注册插件。插件实现：

```typescript
search(source, query, signal): Promise<Film[]>
detail(source, id, signal): Promise<Film | undefined>
```

统一 `Film` / `Episode` / `Health` 模型见 `shared/model.ts`。`Episode.kind` 显式为 hls / mp4 / embed；一个条目的 key 应在不同线路中稳定。CMS 只取已返回的直接 `.m3u8` / `.mp4`，不爬解析页面，不猜播放 API。电影的单集使用 feature，连续剧按集号/标签匹配；匹配失败便不自动换源。

Apple CMS 配置格式：

```json
{"id":"my-source","name":"我的来源","type":"applecms","enabled":true,"api":"已核实的公开接口完整地址"}
```

Embed 示例仅演示配置结构，URL 必须来自你实际核实的来源：

```json
{
  "id":"my-embed", "name":"嵌入来源", "type":"embed", "enabled":true,
  "items":[{"id":"movie-id","sourceId":"my-embed","title":"影片名",
    "episodes":[{"key":"feature","label":"正片","kind":"embed","url":"已核实的 HTTPS Embed 地址"}]}]
}
```

Embed 是跨来源 iframe，保留来源自己的控制界面；不测内部首帧、不保存内部进度、不自动调码率或切换其内部服务器。PWA 不缓存任何媒体或凭证。

当前网络的虚拟 DNS 兼容规则仅包含已核实的三家域名和指定虚拟 IP 范围。如果你新增来源也使用虚拟 DNS，需要先核实真实目的地再更新限定列表；不会全局放行内网请求。实际普通公网 DNS 环境无需这条例外。

## 已知边界

- 覆盖量取决于实际可播来源；旧媒体 404、拒绝访问 403、跨来源 CORS 和 CDN 波动无法靠播放器代码修复。
- ABR 仅适用于源提供多码率清单的情况，具体观测见报告；单码率源只能换源。
- 本次为短时样本测试，不证明完整电影数小时不卡顿。自动换源会有重连时间。
- 剪辑版本、片头长度或广告插入不同，恢复相同秒数不保证画面完全相同。
- 收藏与历史按浏览器和 origin 保存；更换端口/设备/浏览器或清理数据不会自动同步。现有导出按钮可保存 JSON。
- `HOST`、`PORT` 等从进程环境读取；`.env.example` 是说明，不自动加载。

Node / 依赖精确版本在 package-lock.json 与 performance.json。许可证和来源署名见 THIRD_PARTY_NOTICES.md。
