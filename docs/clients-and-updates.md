# 双平台与更新实施方案

本阶段交付 PWA 与共享模块。Windows 安装器、Android APK、签名更新和 Media3 桥接尚未实现，也没有 Android 实机测试。

## 共用代码与边界

`shared/source-adapter.ts` 的 Apple CMS 适配器已经由 Node 服务实际使用。`shared/cms.ts`、`policy.ts`、`search.ts`、`playback-policy.ts`、`library.ts` 负责分组、身份匹配、逐源结果、恢复/缓冲策略和版本化备份；没有 Node 运行时依赖。`shared/platform.ts` 定义来源、持久化与播放器接口。

当前 `server/` 仍依赖 Node 的文件、DNS 与 HTTP 模块。Capacitor/WebView 不能直接运行它。Android 不能通过打包网页、ADB 转发或连接电脑来宣称独立运行。

## Windows：Electron

将现有 PWA 放入 Electron，主进程提供来源 HTTP、DNS 校验、本地 JSON 配置和文件备份。渲染进程保持 hls.js；用受限 IPC 注入来源与持久化接口，关闭 nodeIntegration、启用 contextIsolation/sandbox。采用稳定 `app://streamdesk` 原点，避免随机 localhost 端口导致 localStorage 换原点丢数据。

应用标识固定 `com.lezebomb.streamdesk`，显示名固定 StreamDesk，用户数据目录使用 Electron `userData`，与安装目录分离。安装包方案为 electron-builder NSIS + electron-updater；不能把 Electron 内置 Squirrel autoUpdater 直接当成 NSIS 更新器。

## Android：Capacitor + 原生网络/可选 Media3

使用相同前端和共享 Apple CMS 适配器，通过原生 HTTP 传输实现 `CmsTransport`，通过 Preferences/原子文件提供 `PersistencePort`。来源配置存储于 app 私有目录。原生传输必须保留来源白名单、大小限制、取消、超时和并发限制。

[CapacitorHttp](https://capacitorjs.com/docs/apis/http) 可处理 API 请求。它不能自动解决 hls.js 片段 XHR、WebView 解码器或跨域媒体兼容性；需要分别实测。对于不能可靠播放的设备，接入 [Media3 ExoPlayer](https://developer.android.com/media/media3/exoplayer)，原生负责媒体下载、ABR、缓冲和硬件解码，JavaScript 负责同片同集匹配与来源策略。

桥接命令为 `load(episode,position)`、`stop()`、`setQuality()`、`snapshot()`；事件包含第一帧、错误、缓冲、播放位置、轨道变化。Media3 使用 `onRenderedFirstFrame` 与实际视频轨道/解码器统计，不能把 `STATE_READY` 当作第一帧。应用包名固定 `com.lezebomb.streamdesk`，versionCode 单调递增；keystore 与密码只进入 CI Secrets/离线备份，不提交源码。

## 数据迁移

当前收藏/历史已支持 schema 1 备份、旧 0.1.0 备份导入、导入前快照与非法数据拒绝。旧 `sd:favorites` / `sd:history` 保留为回退。来源 JSON 与健康评分分别存储，后者与设备/网络有关，不作为跨设备性能承诺。

Windows 首次迁移从当前 PWA 导出，再由新客户端导入；Android 同样使用备份文件。新版本先验证数据再迁移，原文件留作备份；安装器不得清空 userData/app 私有数据。当前导出文件也含来源配置，可复制到来源 JSON 编辑器，导入收藏不会自动改写来源。

## GitHub Releases 发布

1. 单元测试、构建、离线浏览器检查通过后，修改 package/versionCode。
2. 创建匹配版本的 `vX.Y.Z` 标签；当前 release-pwa 工作流生成 PWA ZIP 与 SHA256，供人工审查和上传 Releases。
3. 后续增加 Windows 签名 NSIS、blockmap、latest.yml，Android release APK、校验和、固定证书签名验证；在相关构建环境与签名可用前，不配置会假成功的空原生构建步骤。
4. 先 Draft Release，完成旧版覆盖更新、断网/损坏包/空间不足测试后发布。

Windows 使用签名 NSIS 和 electron-updater 的完整下载/校验/安装流程；下载到临时目录，失败不替换当前安装。用户确认重启后再应用更新。Android 检查 Releases，下载并验证包完整性，交给系统 Package Installer 覆盖安装；系统校验包名与签名，用户授权安装。不得静默安装，也不卸载旧版作为更新步骤。

参考：[Electron 更新文档](https://www.electronjs.org/docs/latest/tutorial/updates)、[electron-builder 自动更新](https://github.com/electron-userland/electron-builder/blob/master/website/docs/features/auto-update.md)、[Android 应用签名](https://developer.android.com/studio/publish/app-signing)。安装器故障恢复与签名身份须在真实包上验证，文档不替代验证。
