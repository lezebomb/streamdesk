# 技术调查与复用决策

调查日期：2026-10-12，Asia/Shanghai。以下是读取公开页面、下载代码与普通 HTTP / 浏览器验证所得的结果。接口路径出现于页面代码，和接口已成功调用、视频已成功播放，是三个不同的证据级别。

## 复用选择

| 项目与固定提交 | 实际架构和播放内核 | 来源与换源 | 本项目的取舍 |
|---|---|---|---|
| [LibreTV](https://github.com/LibreSpark/LibreTV/tree/a24ad336a3f7c8a16ca93d1f1198e08ac6b7e943)，2.16.12 | 当前版本为 Next.js 15 / React 19；ArtPlayer、hls.js、mpegts.js；Zustand、Dexie | Apple CMS JSON、来源订阅、TVBox 配置导入、直播；搜索逐源返回、健康停用；恢复策略有次数上限；跨源面板匹配标题、详情测速后切换 | **PWA 最值得复用。** 原样复用 CMS 解析器、恢复决策和类型。补充真正的媒体指标、自动选择备用线路和缓存故障前进度。没有复制其媒体代理、防盗链处理、过滤媒体分片或解析站代码。 |
| [FongMi/TV](https://github.com/FongMi/TV/tree/b49b7027639edd42c7209651f9f0dab7150ae7ba) | Android Java，mobile/leanback 两种界面；当前版本为 Media3 / ExoPlayer 与 mpv，支持硬解、FFmpeg 软解 | 外部配置、CatVod Spider，Java / Python / JavaScript 扩展；播放解析任务与播放引擎分离；PlaybackSnapshot 保存进度与播放状态 | **Android 原生版首选。** 原生编解码、遥控器、字幕能力更全面。当前仓库不是简单 clone 即可编译：README 要求 JDK 21、SDK 对应平台、额外 AAR、自己的签名配置。本次没有编译 APK。 |
| [LunaTV](https://github.com/MoonTechLab/LunaTV/tree/6c0428d1ae7a8322efa8031909ec77cac22fd866) | Next.js 14 / React 18、ArtPlayer / hls.js、next-pwa；Redis / Upstash / Kvrocks 等存储 | 管理端来源配置，统一搜索与详情结构；播放页限并发测速，评分包括加载速度等，选集与观看记录 | 已有服务端账户、跨设备同步需求时更合适。个人单机原型不需要这套账户与数据库复杂度。本次只研究架构。 |

LibreTV 的 `PlaybackRecovery` 返回 `switch-source` 是一个决策；原版组件会显示错误或请求打开换源面板，不能把它直接等同于已完成全自动换源。原版换源面板以详情 API 耗时测速，详情快不代表媒体快。本原型在这些边界上进行了补充。

许可证分别为 LibreTV AGPL-3.0-or-later、FongMi GPL-3.0、LunaTV CC BY-NC-SA 4.0；具体副本见下载的 LICENSE 与本项目 THIRD_PARTY_NOTICES.md。

## FrameXTV：公开能力与验证边界

[用户给出的入口](https://framextv.xyz/) 普通 Node HTTP 请求返回 200；页面 canonical 指向 `framextv.tech`，浏览器对 Embed 最终收到的消息 origin 为 `https://framextv.xyz`。网页检索工具访问失败，因此主要证据保存在 `research/framextv-access.json`、`framextv-docs-access.json`、`framextv-browser.json`。

读取实际页面引用的 `DocsPage-BdagsVI-.js`，核实了[公开文档入口](https://framextv.xyz/docs)中的如下接口形式：

- 电影 Embed：`/embed/{tmdbId}`，文档示例 TMDB 550。
- 剧集 Embed：`/embed/{tmdbId}/{season}/{episode}`。主应用还注册 `/embed/movie/:tmdbId` 与 `/embed/tv/:tmdbId/:season/:episode` 路由；这里只把它们标为代码中观察到的路由。
- 动漫：主应用注册 `/embed/anime/*` 与 `/anime/embed/*`；本次没有核实可直接使用的动漫 ID / 参数契约，未自动拼接动漫 URL。
- 文档描述 autoplay、muted、t/start 参数，以及 postMessage 的 play、pause、seek、seekBy、setVolume、mute、setProvider 等命令。**文档存在不等于命令实测成功。** 本次没有取得可靠的进度回报或命令确认。

普通 iframe 测试确实收到了 `frameXTV:ready` 消息；没有观察到可证明首帧或连续播放的事件。Headless 浏览器里文档页面 DOM 文本为空，Embed 没有可用的视频性能证据。本次没有屏蔽其脚本、解决挑战、修改鉴权、复制其内部解析逻辑。FrameXTV 默认停用，仅保留通用 Embed 适配能力。

### 三层接口必须区分

| 层级 | 实际观察 | 可以据此做什么 |
|---|---|---|
| 元数据 | FrameXTV 页面查询模块引用 `/api/meta?id=...&type=...`；采集站 API 返回片名、年份、分类、剧集清单 | FrameXTV 该路径只属页面内部调用观察，未作为公开第三方 API 接入；采集站已对指定搜索与详情做实测 |
| 播放解析 | FrameXTV 应用代码引用 `/api/stream`、`/api/stream/check`；Embed 文档公开播放器页面 | 未取得外部解析 API 契约；不复制内部请求/加密流程。只用普通 iframe |
| 视频媒体 | API 返回的 `.m3u8` / `.mp4`，以及清单里逐级解析得到的真实分片 | 必须继续下载分片、在浏览器解码并观测时间推进。API 200、清单 200、iframe ready 均不能替代播放验证 |

## 自行寻找来源的结果

核实了[暴风帮助页](https://bfzy.tv/helps/)、[量子帮助页](https://lzizy.net/help)与[非凡帮助页](https://ffzy5.tv/help/)公开列出的采集入口。具体调用与延迟见 `reports/provider-api.json`；媒体结果见 `provider-media.json`、`provider-recent-media.json`。

三类片名分别用《流浪地球》《琅琊榜》《葬送的芙莉莲》验证搜索。三个 API 均能返回结果，但这些样本的媒体返回 404 或 403。进一步依据真实最新列表测试，暴风的部分近期剧集和动漫清单及分片可下载；量子、非凡的近期样本仍失败。**因此没有把任一来源称为长期稳定，也没有把 API 中的总条目数当成有效可播覆盖量。**

又查看了黑木耳、森林的公开站点：前者本次连接失败，后者帮助页 521，停止接入。未更换未验证域名、猜测解析参数、伪造 Referer/Origin 或通过代理绕过来源的限制。

当前默认保留 Mux/hls.js 公开测试影片、Blender 官方预告片和暴风来源；旧 MP4、量子、非凡、FrameXTV 默认停用。暴风部分旧片失败是已知限制，不宣称商业电影、电视剧、动漫已全面稳定覆盖。公开测试清单来源为 [Mux 测试页](https://test-streams.mux.dev/)；Sintel 预告地址取自 [Blender 官方目录](https://download.blender.org/durian/trailer/)。

## 原型实现边界

前端 Vite + TypeScript，后端 Node 24 原生 HTTP。播放器为 hls.js + HTML video；插件在 `server/adapters.mjs` 注册 `search` / `detail`，标准模型把媒体类型显式区分为 hls、mp4、embed。单源异常只返回该源的失败项，并发上限 2，CMS 超时 8 秒，DNS 上限 3 秒；只读元数据缓存 60 秒，不缓存媒体清单、密钥或分片。

播放恢复有次数上限；HTTP 401/403/404/410 直接结束该线路。持续缓冲超过 8 秒才触发恢复/换源；缓冲充足时先尝试解码恢复。HLS 使用 Web Worker、30 秒目标缓冲、60 秒缓冲长度配置上限（完整分片可能略超）、20 秒回看、30 MB 缓冲预算；ABR 使用保守带宽系数，只有多码率清单才有自适应空间。单码率源不能凭空生成多个清晰度。

健康统计分开记录 API 成功和媒体表现，媒体还按来源 + CDN 域名单独记分。先排除正片/预告/解说及类别不一致，再优先用有效豆瓣 ID；否则要求同名、同年份、同类别。剧集按 key/季集号/标签匹配，不按数组下标换集。单集电影用统一 feature key。保留最后有效播放位置，可处理清单重载后 video.currentTime 归零的情况。不同剪辑版本仍可能有时间偏差，不能保证画面内容精确对齐。

本机 DNS 返回 198.18/15 与 `fdfe:dcba:9876` 虚拟地址，普通 fetch 能访问对应公网服务。只对三家已核实 API 域名与这些特定虚拟范围增加兼容例外；其他内网/保留地址仍拒绝，API 不接受任意客户端 URL、凭证或重定向。服务默认仅监听回环地址，不是公网服务部署方案。

收藏和历史在当前浏览器 localStorage，历史每 5 秒及关闭时写入。PWA 只缓存应用外壳；媒体没有离线下载。没有跨设备账号同步、APK、Electron 安装包、长时间压力测试或 Android 真机测试。
