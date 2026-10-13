# StreamDesk 0.6.3

个人影视应用，提供 PWA、Windows Electron 客户端和 Android WebView APK。支持多来源搜索、分类筛选、选集播放、自动换源、画质选择、收藏、观看历史与邮箱账号同步。界面保留首页 / 我的；手机卡片每行两部，标题最多两行。

本轮重构目录索引和评分边界：类型多选取交集，语言与地区分开，年份使用发行时间；首页排除体育、短剧、明确 AI 制作和中国动画推荐。高分目录优先正常核对的豆瓣评分，资源站自报评分单独保存且标注未核验。目录和搜索只读评分缓存，打开影片后再独立核验，不阻塞播放。相关规则见 [目录与评分](docs/ratings-and-catalogue.md)。

## 启动

```powershell
npm ci
npm test
npm run build
node runtime/server.mjs
```

需 Node.js 24，打开 http://127.0.0.1:4173/ 。开发模式为 npm run dev。预构建 PWA 包包含前端及打包后的后端，无需安装 npm 运行时依赖，可双击 Start-StreamDesk.cmd。

## 私人配置

公开仓库不附带个人来源。把自己可正常使用的 Apple CMS 来源写入本机 data/sources.json，字段格式由 shared/model.ts 和 server/adapters.mjs 校验；仅配置已验证的公开接口，全部启用时 enabled 为 true。来源配置、目录缓存和观看证据不提交 GitHub。

升级时保留 data 目录，使用原端口及浏览器，以保留本机收藏和历史。我的页面可备份、恢复记录。邮箱同步使用独立 Supabase Free 项目，配置见 [账号说明](docs/cloud.md)。不存视频文件，不需要管理密钥。

## 验证

```powershell
npm run test:smoke
npm run test:package
```

单元测试检查作品身份、季数、类型交集、音轨、评分来源隔离、限流缓存、并发、恢复及数据迁移。浏览器 smoke 禁用外网，仅验证页面、收藏、备份及离线外壳，不代表实际影视可播放。实际作品的请求、解码、首帧、快进及失败证据保留在本机 reports/，不进入公开仓库或分发包。

目录元数据不等于媒体可播性。公开榜单并非完整影视库；供应商字段缺失或冲突时不猜测，部分窄筛选仍需加载更多。播放器保留 hls.js ABR、手动画质、实际解码分辨率及自动换源；画面增强可完全关闭，增强画面不标作原生 4K。

手机双击暂停 / 继续、右侧长按临时倍速；电脑空格播放 / 暂停、右箭头短按快进五秒、长按临时两倍速。Android 使用本机 Java 网络桥接与共享来源适配器，不依赖电脑 Node 服务。安装、签名、数据迁移和更新边界见 [客户端说明](docs/clients-and-updates.md)。公开安装包不附带私人来源；个人包只留在本地。

## 安全与许可证

服务只绑定回环地址，拒绝跨站请求，不提供任意 URL 代理，不暴露私人文件。更多边界见 [数据安全](docs/privacy.md)。已有公开 Git 历史不会因本轮文件清理自动消失。

采用 AGPL-3.0-or-later，复用 LibreTV 解析 / 恢复核心及 hls.js。第三方署名与许可证见 THIRD_PARTY_NOTICES.md 和 LICENSES/。只使用正常返回的媒体地址，不绕过 DRM、付费鉴权或访问控制。Embed 保留来源自己的播放器。
