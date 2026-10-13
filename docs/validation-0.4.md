# 0.4.0 验证与复现

当前交付仍为电脑 Node 24 服务 + 响应式 PWA。没有新增 APK、Windows 原生安装器或自动更新。

## 核心命令

```powershell
npm ci
npm test
npm run build
npm run test:smoke
npm run test:package
$env:PORT='4188'
node server/index.mjs
```

测试目录与默认消费界面分离。在另一终端启动公开媒体测试配置：

```powershell
$env:PORT='4189'
$env:STREAMDESK_SOURCES='data/quality-sources.json'
node server/index.mjs
# 第三个终端
$env:APP_URL='http://127.0.0.1:4189'
npm run test:e2e
# 真实搜索、筛选、触摸模拟、完整 HLS 下载、断网解码
$env:APP_URL='http://127.0.0.1:4188'
$env:FIXTURE_URL='http://127.0.0.1:4189'
node scripts/experience.mjs
```

外网隔离的 smoke 只验证应用路径与持久化，不计入真实媒体成功率。`experience.mjs` 的下载测试使用完整开放电影，约 69 MiB；日常启动不下载测试影片。

## 新来源验证

```powershell
$env:TEST_SOURCES='data/expansion-0.4-sources.json'
$env:TEST_WORKS='data/expansion-0.4-works.json'
$env:RUN_DIR='reports/runs/my-expansion'
npm run acceptance:search
# 代表作品的实际浏览器解码；默认地址 4188
Remove-Item Env:RUN_DIR
node scripts/expansion-playback.mjs
# 复现持续播放，使用刚生成的证据
$env:APP_URL='http://127.0.0.1:4188'
$env:RUN_DIR='reports/runs/my-expansion'
$env:WORK_INDEX='1'
$env:SOURCE_ID='ikun'
$env:SOAK_MINUTES='10'
npm run acceptance:soak
```

每轮使用新的 RUN_DIR。API 搜索并发 2；媒体预检并发 1；实际浏览器播放并发 1。`expansion-playback.mjs` 的运行目录同样可用 RUN_DIR 覆盖。原始失败、纠正后的结果和截图分别保存。

## 手机待续测

0.4 的旧 Mate 60 记录保留真实搜索、1080p 解码及快进；双击和长按未通过。后来加入触摸覆盖层并通过桌面 Chromium 触摸模拟，不能据此宣称华为实机已通过。用户于 2026-10-13 断开手机，明确先完成其他工作。

重新连接时只使用已有华为浏览器：开启自己的 4190 测试服务，`adb reverse tcp:4190 tcp:4190`，解锁后打开 `http://localhost:4190/`。依据当前浏览器 PID，转发它的调试 socket 到本机 9228，再运行 `node scripts/mobile-experience.mjs`。脚本只选择该测试 URL 的页面，申请临时屏幕唤醒锁，并在结束时释放。无需安装 APK、清数据、修改休眠时间或关闭 ADB 服务。真实设备截图需要确认测试浏览器处于前台。脚本提供旧失败的复测路径，不把触摸模拟混作实机数据。

DLNA 实机电视未发现；接收器出画、暂停/继续、进度恢复与不同电视格式兼容性均待实机验证。无须为了测试去修改路由器、防火墙或手机系统设置。
