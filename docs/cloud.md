# 免费账号与同步配置

使用独立 Supabase Free 项目，普通 Postgres、Auth、Data API 即可。没有付费计算、分支、复制实例、视频存储或自动升级。2026-10-13 核对官方 Free：500 MB 数据库、50,000 月活用户、5 GB 出站；不活跃一周可能暂停。个人收藏和历史数据量很小，但免费服务不是永久在线保证。

1. 在专用项目执行 `supabase/streamdesk.sql`，然后运行 Supabase Security / Performance Advisors。所有暴露表启用 RLS；读写均限制到 auth.uid()。RPC 使用 security invoker 并只写当前用户，旧时间戳不能覆盖新进度。没有 service_role 密钥。
2. 将 `data/cloud.example.json` 复制为 `data/cloud.json`，填写项目 URL 和 publishable key。也可用 SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY 环境变量。生产 Node 不自动读取 .env。私人配置不提交 GitHub。
3. Auth Site URL 设置为当前应用准确地址；本轮为 `http://127.0.0.1:4188/`。允许正式本地地址 `http://127.0.0.1:4173/`、`http://localhost:4173/`。客户端注册和重设密码使用当前应用地址；不要使用任意域名通配符。
4. 在“我的”登录 / 注册，使用邮箱和自己设置的密码。默认托管项目要求确认邮箱。邮件链接仅使用一次；过期或已使用时用邮箱密码登录或申请新的重设密码邮件。密码、确认链接、会话令牌不会写进项目报告。

Supabase 默认 SMTP 目前仅向项目团队邮箱发送，且每小时仅 2 封邮件。个人所有者账号已实际验证；若要注册其他邮箱，需另外配置支持免费额度的 SMTP，当前未配置第三方邮件服务。不要为此关闭邮箱验证。普通密码登录不发送邮件。

首次登录将本机访客收藏 / 历史合并到账号；账号本地备份按用户 ID 分开，退出恢复访客记录。不同设备按同一作品键与修改时间合并；取消收藏保留 tombstone，避免另一设备复活旧收藏。播放每 5 秒保存进度，同步去抖 3 秒；断网先保留本机记录，联网 / 再次前台 / 手动同步时重试。同步分页读取、批量有上限；本地历史保留最近 80 条，同步队列上限 2000 条。视频下载、健康测速和画面设置保持设备本地；云端不存视频地址、完整剧集清单或媒体文件。

数据库隔离和冲突规则已在真实 Free 数据库的回滚事务中验证。所有者真实账号已验证密码登录与收藏 / 历史写入。两个实机设备之间的完整同步尚未测试，手机断连后未伪造该结果。

GitHub / CI 包不含私人云配置。个人本机打包可设置 INCLUDE_CLOUD_CONFIG=1，打包器只允许 publishable / anon key；绝不将 secret / service_role key 装进客户端。

0.6.8 起，按所有者明确授权，公开发行包内置 `public/client-defaults/cloud.json` 的服务 URL 和 publishable key，便于新设备直接登录。它不包含管理密钥或任何用户会话。已核对实际云表启用 RLS，读写政策均限定 authenticated 用户的 auth.uid()，同步 RPC 使用 security invoker。

已有账号的密码登录与新邮箱注册应分开验收。一加 Android 16 新设备已由本人输入密码并完成实际同步；其他非项目团队邮箱的注册邮件仍需要配置自定义 SMTP，当前不能宣称已支持任意新邮箱注册。应用搜索播放不要求登录。不关闭邮箱确认，也不添加朋友为项目管理团队成员来绕过邮件限制。

来源目录采用本地持久元数据索引：速度优先且不消耗云端额度。完整查询结果缓存 15 分钟，部分失败短缓存 30 秒；分类信息缓存 30 分钟，播放详情仅短缓存 60 秒。任何分片和带时效播放地址均不进入持久目录缓存。来源配置、接口版本和筛选条件构成缓存键；停用来源不再参与结果。不是全库镜像，也不是完整豆瓣排行榜。

参考：[Free 额度](https://supabase.com/pricing)、[邮箱密码](https://supabase.com/docs/guides/auth/passwords)、[SMTP 限制](https://supabase.com/docs/guides/auth/auth-smtp)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)。
