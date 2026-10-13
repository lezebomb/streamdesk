# 第三方代码与媒体

本项目采用 AGPL-3.0-or-later，许可证全文见 LICENSE。

- LibreTV，https://github.com/LibreSpark/LibreTV ，提交 a24ad336a3f7c8a16ca93d1f1198e08ac6b7e943，AGPL-3.0-or-later。`src/vendor/cms-parser.ts`、`playback-recovery.ts`、`types.ts` 原样复用；集成代码为本项目编写。
- hls.js，https://github.com/video-dev/hls.js ，依赖版本由 package-lock.json 固定，Apache-2.0。通过 npm 包保留其上游许可证。
- LunaTV 与 FongMi/TV 仅做架构研究；没有复制其代码。各自许可证见研究报告。
- Big Buck Bunny、Sintel、Tears of Steel 为 Blender Foundation 开放电影。测试媒体来自 Mux/hls.js 的公开测试清单、Blender 官方下载目录。片库中明确区分 Sintel 预告与正片。媒体没有打包进应用。
- 暴风、量子、非凡与 FrameXTV 是外部服务。本应用不持有其视频，不保证内容授权状态或长期可用性。使用普通公开接口与标准播放器；不实现 DRM 绕过、伪造凭证、请求头伪装或受限视频下载。

向他人分发或提供网络服务时，请保留相应许可证、署名和对应源码。第三方服务的内容和访问权限由其自身管理。
- Phosphor Icons 2.1.2，https://github.com/phosphor-icons/web ，MIT。使用原始字形与图标定义；许可证见 LICENSES/phosphor-icons.txt。魔都与 ikun 为本轮新增外部公开 API 服务，其文档链接随来源配置保留。

- Supabase JavaScript SDK 2.117.3，https://github.com/supabase/supabase-js ，MIT，许可证见 LICENSES/supabase-js.txt。如意为新增外部公开 API 服务，文档见来源配置；不复制其网站前端或破解受限媒体。
