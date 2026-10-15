# 手机播放控制（0.6.9）

轻点画面切换控制栏，双击播放 / 暂停；横向滑动画面调整进度，长按右半边临时 2×，松开恢复。进度条支持直接点击位置和拖动，松手提交，取消手势保留原进度。拖动预览不会被 timeupdate 覆盖；提交先于滑块回显，避免旧位置在 pointerup / change 顺序中覆盖目标。

Android APK 的全屏由受限的本机消息接口处理：仅来自应用同源主框架的 fullscreen 指令有效。Activity 请求横屏，隐藏状态栏和导航栏，移除播放器外边距；控制栏避开摄像头缺口。退出按钮 / 系统返回恢复原方向和系统栏。不会修改手机自动旋转、休眠、锁屏或其他系统设置。Activity 已声明 orientation / screenSize 配置变化，不为旋转重建播放器。

手机全屏默认等比铺满，可能裁掉上下或两侧画面；选择“完整画面”改回等比完整显示，此时比例不一致会有黑边。不会拉伸变形或把缩放称为原生 4K。增强画布使用相同的缩放比例，ABR、媒体实例与播放进度不因全屏重建。

PWA 使用浏览器 Fullscreen / Screen Orientation API；自动横屏受到浏览器限制，失败会提示手动旋转。电脑默认完整画面。不接管第三方 iframe 内部的进度条、画面裁切或播放器权限。

## 复现

```powershell
npm ci
npm test
npm run build
npm run test:mobile-player
```

最后一个脚本使用独立本地控制栏、Chromium 触摸模拟和真实公开 HLS 样片；不读取个人配置、账号或观看库。验证两次定点跳转、拖动中 timeupdate、取消拖动、键盘可访问操作、铺满 / 完整切换、退出和 ABR 实例保持。触摸模拟不能证明 Android 横屏或系统栏行为，需实机另测。

2026-10-15 已在 Mate 60 的安装 APK 验证定点跳转、横屏铺满、原生返回及按钮退出、播放位置与 ABR 保持；一加 Ace 6T 尚未实测本版本。证据仅保存在本地 reports，未上传个人资料。本轮为控制交互修复，没有重复全库搜索、长时间播放、功耗和温度测试。

参考：[Android 沉浸模式](https://developer.android.com/develop/ui/views/layout/immersive)、[Screen Orientation](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock)。
