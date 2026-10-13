# 0.5.0 复现

Node 24，`npm ci`、`npm test`、`npm run build`；PORT=4188 启动 `node server/index.mjs`。默认媒体 API 并发不超过 3，每来源搜索最多 3 请求；分类最多 4 个上游页 / 来源、总截止 12 秒，达到 72 个匹配作品后停止增加请求。每来源独立游标保存实际读取位置，失败不推进游标。相同在途请求合并；一个页面取消不能取消其他页面仍需要的请求。

`node scripts/iteration-0.5.mjs`：真实默认分类、动作 / 英语 / 2026 / 高分、类型交集与取消选择、怪奇物语4及相关季、明显导航、手机宽度、如意动漫 / 剧集真实视频、键盘快进 / 长按 / 空格。`SKIP_PLAYBACK=1` 仅重测界面；RUN_DIR 指定独立证据目录，不能把跳过媒体算作新播放成功。

`npm run test:smoke` 在外网被隔离条件下测试离线外壳与数据保留，明确不代表媒体测试。`npm run test:package` 在清洁源码副本中构建运行包，检查必要模块和许可证齐全、无私人配置、无需 npm 运行时依赖。

真实源原始成功 / 失败证据：reports/runs/iteration-0.5、iteration-0.5-index、ruyi-exact-0.5；候选失败：reports/evidence/sources-0.5.json；接口与缓存基线：reports/evidence/api-0.5.json。这些大文件留在本地，GitHub 只提交汇总与复现脚本。

本轮复用上一版本 10 分钟及 0.3 的 30 分钟持续播放证据，没有重跑所有长时组合；如意仅完成三个核心短播放，不声称整集稳定。ABR、快进、失败恢复、进度保持的原有测试继续保留。手机 / 电视、native 安装及更新后续验证。
