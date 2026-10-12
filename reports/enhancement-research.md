# 画质增强技术调查与实现边界（0.3.0）

调查日期：2026-10-12。当前实现仍使用原有 hls.js / HTML video；视频传输、解码、ABR、快进和换源由原播放器管理。增强只读取已经解码的 SDR 帧，绘制独立 WebGL2 画布。它不会生成新片源、改变编码码率或把输出称为原生 4K。

| 技术 | 集成方式与取舍 | 本轮状态 |
|---|---|---|
| NVIDIA RTX Video Super Resolution | 官方浏览器功能依赖 RTX GPU 与驱动/应用设置；网页不能用标准 API 开启或确认其激活。RTX Video SDK 面向原生媒体应用并使用 Tensor Core，不是 hls.js 插件。高性能 GPU 常驻会增加笔记本耗电。 | 调研；没有改变系统/NVIDIA 设置，没有测量或宣称 RTX VSR 本身的效果。RTX 实测数字属于本项目 WebGL 滤镜。 |
| Anime4K | MIT 的动漫恢复/放大着色器，现行算法主要针对 1080p 动漫。mpv 的 HOOK/BIND 多阶段纹理规则不能直接当作 WebGL fragment shader。Ani-SS 提供旧 Anime4K 3.x 的 WebGL2/WASM 路径，但有亮度和缩放规则兼容问题。 | 保留实验方案；未把本项目“动漫”空间滤镜冒称为 Anime4K CNN。需要逐个移植并验证多遍纹理、颜色与热稳定性。 |
| FSRCNNX | FSRCNN 的学习型 x2 放大与多层特征计算需要专门模型/权重和 GPU 调度。作者提供训练实现及生成 mpv/libplacebo 着色器的工具；不存在已验证可直接接入本项目的 HTML video 插件。 | 调研；未在手机上运行或宣称实时。不能借用上游桌面性能数字充当本机实测。 |
| 单次 WebGL2 空间处理 | 原创四次双线性取样的 B-spline 平滑缩放、受限 unsharp 锐化、保边空间降噪，轻度抑制平坦区域压缩噪声/块边界。不能恢复丢失细节，也不是完整的运动补偿降噪或神经超分。 | 已实现并在 Intel、RTX 5060 Laptop、Mate 60 Maleoon 910 验证。默认关闭。 |

主资料：[NVIDIA FAQ](https://nvidia.custhelp.com/app/answers/detail/a_id/5448/~/rtx-video-faq)、[RTX Video SDK](https://developer.nvidia.com/rtx-video-sdk)、[Anime4K](https://github.com/bloc97/Anime4K)、[Ani-SS](https://github.com/pinnouse/ani-ss)、[FSRCNN 作者仓库](https://github.com/igv/FSRCNN-TensorFlow)。算法仓库的授权与模型授权需分别复核；本轮没有复制这些神经网络代码或权重。

## 浏览器与设备差异

WebGL2 能力以运行时建上下文、编译并实际上传视频纹理为准；不能仅凭 UA 推断支持。跨域纹理需要 CORS 许可，不能用代理或修改鉴权绕过；错误时关闭增强，保留原播放器。参考 [MDN 纹理规则](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Using_textures_in_WebGL)。

WebGPU 的覆盖已有进展，但浏览器/OS/驱动组合仍有差异，API 存在不等于拿到可用适配器。Chrome/Edge、Firefox、Safari 的平台条件见 [浏览器官方说明](https://web.dev/blog/webgpu-supported-major-browsers)。本轮选择 WebGL2，WebGPU CNN 只保留后续实验路线。

- 集成 GPU：优先避免启用独显；Intel 本机 1080p 路径约 1.6 ms GPU 时间，但不推广到所有集显。
- 独立 GPU：实际核实渲染器为 RTX 后测试；驱动整卡功耗/利用率包括其他活动，不能等同本页面的纯增量。
- 手机：Maleoon 910 实测纹理上传/提交成本比桌面高。默认关闭，自动策略保守选择轻量，原生超过轻量预算时保留原画；不能把本机结果泛化到低端手机。
- 软件 GPU、已声明 PQ/HLG、CORS/上下文丢失、超出预算：回退原画。缺少 HDR 元数据时无法可靠识别所有 HDR，应关闭增强保留浏览器色彩链路。

## 已实现的策略与限制

轻量输出最多 1280×720，均衡/动漫最多 1920×1080；不为增强主动降低原生分辨率，超过预算直接回退。自动策略结合原生尺寸、显示尺寸、GPU 分类、内存提示、手机触控、省流量、电池低电量与实际帧处理成本。GPU 分类是渲染器字符串提示；unknown 走轻量。CPU/GPU 时间超预算或持续高掉帧时停止滤镜，不修改 ABR、不重新加载媒体。快进/缓冲/不可见时重置掉帧窗口，避免把这些状态算作增强故障。自动选级仍是实验性启发式，不是训练得到的跨设备质量模型。

增强复用原播放器 requestVideoFrameCallback，没有另建渲染轮询；关闭时删除画布、纹理、program、query 和 GPU 上下文。原生全屏、PiP、原生字幕显示时回退原画；“增强全屏”保留整个播放器区域。底部控制区域保持原生画面。参考 [呈现帧回调定义](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback)。

真人使用更弱锐化/降噪，动漫模式稍加强边缘，但旧片噪点、线条和字幕可能被改变。只有同一暂停帧对比可用于视觉判断；锐度提高不能作为恢复真实细节的证据。对比图和性能数据见 performance.md / enhancement-summary.json。

手机实时超分的模型、多遍 GPU 方案、离线增强、帧插值与 HDR 重建均未集成。当前范围内先交付可关闭、可降级的空间增强，并保留明确的实验接口。
