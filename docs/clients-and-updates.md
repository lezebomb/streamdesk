# 客户端构建与更新

Windows 使用 Electron + NSIS，Android 使用 AndroidX WebKit + Java 本机网络桥接。两者复用来源适配器、标题与季数匹配、筛选、hls.js、播放策略和版本化收藏/历史。Android 不运行 Node，也不通过电脑转发 API 才能播放。Capacitor 和 Media3 尚未接入。

## Windows

Node.js 24 环境执行 `npm ci`、`npm run build`、`npm run desktop:build`，产物为 `artifacts/windows/StreamDesk-Setup-X.Y.Z.exe`、blockmap 和 latest.yml。构建缓存位于工作区 .tooling。安装器为当前用户安装，用户数据与安装目录分开。

渲染进程使用稳定 app://streamdesk 原点、contextIsolation/sandbox、禁用 nodeIntegration，API 请求只转发至应用自己的回环 Node 进程。私人 JSON 在 Electron userData/data 内；公开包不包含来源或云项目配置。现有 PWA 数据需通过“我的”备份/导入迁移，浏览器登录会话不会自动复制。

目前 Windows 安装器未做 Authenticode 签名；HTTPS 与更新清单 SHA512 校验不能替代发行者代码签名。请保留这一限制，不宣称已具备签名验证。

## Android

需要 JDK 21、Android SDK 36/build-tools 36、Gradle 9.3.1，设置 JAVA_HOME、ANDROID_HOME、GRADLE_USER_HOME 后执行：

```powershell
npm ci
npm run build
node scripts/init-android-signing.mjs
npm run android:prepare
gradle -p android assembleRelease --no-daemon
```

签名脚本首次创建 data/signing/streamdesk.p12 和 .tooling/signing.password，之后保留现有身份；丢失密码应恢复备份，不能换密钥冒充更新。两个文件必须离线备份且不提交。可用 STREAMDESK_ANDROID_KEYSTORE 和 STREAMDESK_ANDROID_PASSWORD_FILE 指定文件路径。固定包名 com.lezebomb.streamdesk，最低 Android 9；versionCode = major × 1000000 + minor × 1000 + patch。minor/patch 应小于 1000，新版必须递增。

公开构建使用干净 checkout，不包含 private assets。本机个人构建可在准备资源前设置 STREAMDESK_PERSONAL_BUILD=1，复制本地 sources.json、cloud.json 和已核验元数据到 APK；这种 APK 只能本地保留。首次启动复制配置到应用私有目录，覆盖安装保留原配置、索引、收藏与历史。禁止卸载再装作为更新步骤。

WebViewAssetLoader 提供固定 HTTPS 本地原点，原生消息只接受该原点的主框架；请求限制为已配置的 HTTPS API，保留超时、大小与并发边界。关闭文件访问、明文流量、外部顶层导航、证书错误放行；release 关闭 WebView 调试。视频仍由 HTML Video / hls.js 解码。旧 WebView 的 AbortSignal.any 有兼容实现。

播放时只保持本应用窗口亮屏；暂停、离开后台后释放，不改全局休眠设置。电视发现/控制尚未接入独立 APK，入口会明确提示，可用手机系统无线投屏；网页已有 DLNA 实现也未经过真实电视验收。不能宣称支持所有电视。

## 更新

应用启动及“我的”中可检查 GitHub Releases。提交源码本身不是可安装的更新：需递增 package.json 版本，并成功构建发布相应安装资产。Windows release-clients 工作流在主分支版本文件变更时构建并发布；已存在的版本不覆盖。Android 自动发布尚未配置稳定签名的 CI，个人 APK 绝不能上传公开 Releases。

Windows 使用 electron-updater，提示后下载，校验完成再由用户点击重启安装；下载失败保留当前版本和数据。Android 查找 StreamDesk-Android-X.Y.Z.apk，验证 GitHub SHA256、大小、包名、递增版本及与当前安装相同的签名证书，再交给系统覆盖安装。下载与验证失败不卸载当前应用。系统可能要求允许本应用安装未知来源或本人输入锁屏密码，不能绕过。

原生客户端已完成本机安装、实际媒体及收藏持久化检查；全部证据只保留本地。APK 新设备密码登录、真实电视投屏及从公开 Release 下载后覆盖安装的完整更新链路，尚不能用已完成的界面/错误路径检查代替验收。

## Windows 本地服务恢复

0.6.7 将配置目录直接传入打包服务，固定来源、账号、目录缓存和静态文件路径；桌面服务不采用继承的测试目录或其他 Supabase 项目配置。启动时核对目录指纹、来源数量及账号配置状态，配置不一致时不展示空页面。

窗口重新获得焦点及每 30 秒进行一次本机状态检查。服务退出或检查不一致时，重新启动本机服务并刷新窗口；每分钟最多尝试一次恢复。账户会话、收藏和历史继续使用原应用目录，恢复不清除它们。连续失败时显示连接失败提示。

应用数据目录内的 `runtime-events.jsonl` 仅记录版本、时间及事件代码，限额 128 KiB；不包含来源地址、邮箱、密码、令牌或观看记录。状态接口继续受回环地址、Host、Origin 和跨站请求限制保护。

## 0.6.8 首次安装

Windows 和 Android 发行包均内置公共默认来源和账号客户端连接信息。首次安装或旧的空配置自动初始化；已有非空来源、账号配置、收藏、历史和会话保留。公开字段仅限公共 HTTPS 接口、账号服务 URL 和 publishable key；不打包密码、管理密钥、私人原始配置或观看证据。

Android 使用原生系统栏、摄像头缺口和键盘 insets 调整 WebView 可用区域，网页同时适配不同宽度和安全边距。Android 16 一加设备已检查实际安装界面、本人密码登录和同步；不能将它扩大为所有手机机型均已测试。

如果仓库日后改为 private，未获授权的安装客户端将无法读取 Releases 自动更新；失败提示不会卸载应用或清除记录。已经下载的安装包不会因修改仓库可见性被撤回。

## Windows 本地服务恢复

0.6.7 将配置目录直接传入打包服务，固定来源、账号、目录缓存和静态文件路径；桌面服务不采用继承的测试目录或其他 Supabase 项目配置。启动时核对目录指纹、来源数量及账号配置状态，配置不一致时不展示空页面。

窗口重新获得焦点及每 30 秒进行一次本机状态检查。服务退出或检查不一致时，重新启动本机服务并刷新窗口；每分钟最多尝试一次恢复。账户会话、收藏和历史继续使用原应用目录，恢复不清除它们。连续失败时显示连接失败提示。

应用数据目录内的 `runtime-events.jsonl` 仅记录版本、时间及事件代码，限额 128 KiB；不包含来源地址、邮箱、密码、令牌或观看记录。状态接口继续受回环地址、Host、Origin 和跨站请求限制保护。
## Windows 本地服务恢复

0.6.7 将配置目录直接传入打包服务，固定来源、账号、目录缓存和静态文件路径；桌面服务不采用继承的测试目录或其他 Supabase 项目配置。启动时核对目录指纹、来源数量及账号配置状态，禁止配置不一致时展示空页面。

窗口重新获得焦点及每 30 秒进行一次本机状态检查。服务退出或检查不一致时，重新启动本机服务并刷新应用窗口；每分钟最多尝试一次恢复。账户会话、收藏和历史继续使用原应用目录，恢复不清除它们。连续失败时显示连接失败提示。

应用数据目录内的 `runtime-events.jsonl` 仅记录版本、时间及事件代码，限额 128 KiB；不包含来源地址、邮箱、密码、令牌或观看记录。状态接口继续受回环地址、Host、Origin 和跨站请求限制保护。
