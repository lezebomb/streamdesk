# 第三方署名

本项目采用 AGPL-3.0-or-later，许可证全文见 LICENSE。

- LibreTV，https://github.com/LibreSpark/LibreTV ，提交 a24ad336a3f7c8a16ca93d1f1198e08ac6b7e943，AGPL-3.0-or-later。src/vendor/cms-parser.ts、playback-recovery.ts、types.ts 复用其代码，保留原始版权说明。
- hls.js，https://github.com/video-dev/hls.js ，Apache-2.0，依赖版本由 package-lock.json 固定，上游许可证见 LICENSES/hls.js.txt。
- Phosphor Icons，https://github.com/phosphor-icons/web ，MIT，许可证见 LICENSES/phosphor-icons.txt。
- Supabase JavaScript SDK，https://github.com/supabase/supabase-js ，MIT，许可证见 LICENSES/supabase-js.txt。
- LinkeDOM，https://github.com/WebReflection/linkedom ，ISC，用于解析正常公开 HTML。打包时保留其及解析依赖的独立许可证，见 LICENSES/。
- Big Buck Bunny、Sintel、Tears of Steel 是 Blender Foundation 开放电影，仅用于显式选择的测试夹具，媒体不打包进应用。
- LunaTV 与 FongMi/TV 仅用于架构研究，没有复制代码。

私人来源配置与个人测试证据不进入公开源码或发行包。应用不存储第三方视频，不实现鉴权或 DRM 绕过。分发软件时请保留相应源码、署名及许可证。
