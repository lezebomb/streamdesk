# Mate 60 浏览器复现

这是连接手机的实机网页验收。不是 APK：搜索 / 目录请求经 ADB reverse 交给电脑 Node 服务，真实视频直接由手机下载、解码。只有 Mate 60 / 华为浏览器实测，不外推所有 Android 设备。

先构建 0.5.0，启动一个独立测试实例。不要复用已有目录缓存写入路径，避免两个服务同时写同一文件。

```powershell
npm run build
$env:PORT='4191'
$env:HOST='127.0.0.1'
$env:STREAMDESK_RESULT_CACHE='reports/evidence/runtime/mobile-test-cache.json'
node server/index.mjs
```

另开终端；手机须由所有者授权 USB 调试、解锁。不要修改系统休眠设置、清数据、安装软件或停止其它应用。使用本任务自己的端口映射。

```powershell
adb devices -l
adb reverse tcp:4191 tcp:4191
adb shell pidof com.huawei.browser
adb shell cat /proc/net/unix | Select-String devtools_remote
# 将下面的 <实际 socket> 替换为上面发现的 Huawei 调试 socket；不要猜 PID。
adb forward tcp:9228 localabstract:<实际 socket>
adb shell am start -a android.intent.action.VIEW -d http://localhost:4191/ -p com.huawei.browser
$env:MOBILE_APP_URL='http://localhost:4191/'
$env:RUN_DIR='reports/runs/mobile-new-core'
node scripts/mobile-experience-0.5.mjs
```

脚本只选择精确匹配的 StreamDesk 页面。临时 Screen Wake Lock 保持前台测试可见，finally 释放；不替换系统休眠时间。截图前检查当前页面属于 StreamDesk、华为浏览器在前台、账号对话框关闭。账号密码由所有者输入，脚本不读取认证存储或密码。目录 48 项、类型交集、季数相关性、搜索图标、导航、三类正片解码、未缓冲快进、真实触屏双击 / 长按 / 取消、同集手动换源分别保存结果。

剧集第一次出画后，还要等待播放时间继续前进；只收到 seeked 或首个恢复帧不代表随后没有卡顿。原本固定两秒观察的失败保留，本脚本改为最多等待 20 秒并保留全部卡顿记录。局部复测可设置 SKIP_UI=1、WORK_FILTER=tv，避免重复全套。复测使用不同 RUN_DIR，不能覆盖原始失败。

```powershell
$env:RUN_DIR='reports/runs/mobile-new-recovery'
node scripts/mobile-playback-0.5.mjs
# 只重测 ABR 时设置 ABR_ONLY=1；下一轮完整测试前清除此变量。
```

此脚本对真实剧集的当前媒体主机注入测试用 HTTP 404，再验证实际备用源、同季同集和 1200 秒进度。注入不是服务器真实故障，finally 取消拦截。公开 Mux 多码率流只临时加载进播放器验证画质，不加入用户片库 / 历史。首次缓冲超时和孤立复测成功都保留。

`node scripts/mobile-fullscreen-0.5.mjs` 单独验证应用容器全屏的继续播放、长按与双击；先等待新作品实际出画和正在播放，避免把播放器上次保留的指标误当新首帧。finally 只退出本应用的全屏，再关闭播放。普通原生视频全屏和浏览器视频助手行为不在此验收内。

```powershell
$env:RUN_DIR='reports/runs/mobile-new-soak'
$env:SOAK_MINUTES='10'
node scripts/mobile-soak-0.5.mjs
```

持续播放使用已核对身份的如意动漫 2025 版，关闭增强、禁止自动换源以隔离线路表现，每十秒采样；每分钟只读浏览器主进程 CPU / PSS、电池温度、系统热状态。超过保守温度阈值或严重热状态提前结束，不修改手机设置。CPU / 内存包含华为浏览器其它标签页及自身服务，不能等同于播放器独占占用；thermalservice 值可能缓存。USB 充电状态不能推导实际耗电量，也没有可用 GPU 利用率计数器。

测试后停止播放、释放唤醒锁、恢复此前自动换源开关；若仍需网页使用，可以保留本地服务与 reverse。移除映射时只删除自己的 tcp:4191 / tcp:9228，不使用 --remove-all，不关闭 ADB 服务。重新连接后可能需要重新发现 socket。

双设备同步通过用户已经登录的桌面页面和手机页面验证，不把邮箱确认等同于登录。不要为了控制方便创建新的匿名桌面会话，再误认成用户已登录页。公开汇总排除邮箱、账号 ID、认证令牌和带播放地址的原始事件；原始证据只保留本地。

本轮没有重复所有作品 × 所有设备、增强 / 4K 全矩阵、离线下载全矩阵，避免重复旧测试；实际电视未发现，投屏出画仍未验收。手机独立 API、WebView / Media3、安装和后台播放要在今后的 APK 中单独验证。
