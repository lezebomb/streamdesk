# FrameXTV 嵌入适配

新增 `framextv` 来源类型，Windows / Node 和 Android 共用 `shared/framextv.ts`。默认安装来源升级时按 ID 补充，保留用户已有来源、禁用状态和账号数据。

## 接口边界

- [FrameXTV 文档](https://framextv.xyz/docs)：电影 `/embed/{tmdbId}`，电视剧 `/embed/{tmdbId}/{season}/{episode}`。均为 HTTPS 页面，不是 m3u8。字幕、清晰度、内部线路和内部自动回退交给来源自己的播放器。
- 元数据接口来自该站当前公开前端实际使用的 `https://api.framextv.tech/api/search`、`/api/details`、`/api/season`；2026-10-16 已验证 JSON 响应，无需账号。它们没有独立的公开版本承诺，接口变化仅使此适配器报错，不清空其他来源结果。
- 未调用或复制提取、解密、令牌生成逻辑；不将 `/api/stream` 当作公开稳定的媒体解析 API。
- `matchedQuery` 仅保留上游跨语言搜索的相关性，不作为别名、评分匹配或自动换源的身份依据，也不进入云端收藏/历史载荷。
- 按返回的季、首播日期和集号生成选集；不同季分别保留首播年份。未来日期与其他季的剧集不生成播放入口。TMDB ID 只在其自己的命名空间使用，不与豆瓣 ID 混用。

## 线路

2026-10-16 公开 `/api/providers` 列出 `miner`、`headhunter`、`valkyrie`、`hog_rider`、`lavahound`、`super_barbarian`、`bowler`、`titan`。`backup` 同时出现在当前公开 Embed 播放器中。应用提供推荐入口和上述九条指定入口。电影默认采用来源自动选择；电视剧默认指定 Headhunter XXXI。实机发现来源自动选择的 Miner 曾把 S4E1 返回为疑似末集，故不采用它作为剧集默认。其他指定入口仍按未验证处理；宿主不能校验其内部真实媒体身份。它们属于同一个聚合服务，不能计作九个独立服务；“Available”、4K/FHD 名称均不代表本片实测成功或原生分辨率。

第三方查询和 iframe 都不接收本应用账号凭据、云端配置或观看历史列表。iframe 保留 sandbox，禁止弹窗、顶层跳转和下载；原生桥只允许主文档自己的 origin。服务器与 Android 仅放行三个已知元数据路径，不提供任意代理或降低 TLS 检查。

## 进度与限制

仅处理同时匹配 iframe 窗口、`https://framextv.xyz` origin 和有限数值范围的 `frameXTV:timeupdate`。切换线路时换用新的 iframe 窗口，拒绝旧窗口消息。URL 的 `t` 恢复未生效时，仅通过文档中的 `seek` 命令向精确 origin 尝试一次，等待返回进度确认后再更新历史。

iframe 加载、ready 和进度事件均不写入本地 hls.js 的首帧、解码分辨率、ABR 或片段下载统计。无进度 30 秒显示切线提示，不宣称已出画。不能可靠接管内部的暂停状态、画面增强、下载、投屏及手势，也不能保证第三方播放器始终无站内广告。宿主不添加广告，保留自己的直接媒体播放功能。

另查阅 [VidLink](https://vidlink.pro/) 与 [VidFast](https://vidfast.vc/) 的公开 iframe 文档、[非凡帮助中心](https://ffzy5.tv/help/)。文档可用不等于正片可播；未经实际播放验证的独立接口不进入本轮默认来源。

本地复现：`npm test`、`npm run build`、`npm run test:mobile-player`。手机正式包需进一步在真实设备检查搜索、iframe 出画、换线、横屏和退出。个人播放截图和请求明细仅保留在忽略的 `reports/evidence/`。
