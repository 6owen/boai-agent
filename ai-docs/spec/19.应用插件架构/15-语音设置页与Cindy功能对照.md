<!--
[INPUT]: 2026-10-27用户提供的Whisper及Cindy语音设置截图、已合并main 6a56c633、Cindy固定源码c8e600b6与Qwen官方协议。
[OUTPUT]: 独立语音设置页合同、现有能力对照和后续配置建议；用户已授权第5节四项增量，实际实现及验证归12第7节。
[POS]: 第19组语音设置产品入口和功能取舍说明；补充11/14，不扩展为系统听写或TTS。
[PROTOCOL]: 修改时同步Header、README和.folder.md；实际验证仅登记12第7节。
-->

# 语音设置页与 Cindy 功能对照

- 核对日期：2026-10-27。
- BOAI 起点：已合并的 main `6a56c6336d014cf4a963701e53d74af9489a782b`。
- Cindy 固定版本：`c8e600b676f44137ce1d40e50f4aa280196a5f5f`。以下“已接线”来自源码审阅，没有启动 Cindy 或进行效果验证。
- 本文讨论语音输入，即把声音转成聊天草稿；语音输出/TTS 是另一条能力，不能把 ASR 的配置当成朗读配置。
- 截图1/2的 Whisper 下载目录不属于该 BOAI main 的现有实现；当前后端为本地 SenseVoiceSmall 与在线 Qwen 实时识别。不能展示尚未接入的 Whisper 模型下载项。

## 1. 独立设置入口

- 设置的“配置”分组增加“语音输入”，与网页检索、插件同级。
- 插件管理仍拥有原启停记录，配置按钮跳转到这一页。停用时也可配置；两处启停共用原插件存储，没有第二个布尔真源。
- 页面按识别、文字整理、术语分组，复用现有 SettingsLayout、Card 和设置行；有用说明放入 Tooltip，保存成功和失败使用 Sonner，不添加常驻“已保存/未保存”DOM文案。
- 启停即时保存；识别方式、在线地址/模型/密钥、文字整理连接/模型和术语表沿原显式保存。未保存草稿通过现有离页确认保护。
- 保存携带草稿读取时的 revision。失败后保留草稿，不把新 revision 偷换进旧草稿再重试；用户可重新读取最新配置后编辑。
- 本地只管理实际提供的 SenseVoiceSmall 及其 VAD 依赖；下载必须由用户触发。页面重入可读取下载进度，打开设置或启用插件不启动麦克风。
- 在线模式无需安装本地模型。文字整理仍是独立授权，选择本地识别不表示已授权发送转写文字给文字模型。

## 2. Cindy 已接线的功能与实施前 BOAI 差距

本节的 BOAI 状态对应前述 main 起点；随后授权的实现合同见第5节，实际进度见12第7节。

- 语言选择：Cindy 把所选语言传给识别服务；BOAI 目前没有语言字段，使用后端自动识别。建议补“自动”和后端支持的语言，切换后端时校验支持范围。
- 麦克风选择与授权：Cindy 枚举输入设备、申请权限，并把 deviceId 传给录音引擎。BOAI 目前通过 getUserMedia 使用默认输入，没有设备选择页。建议优先补；设备拔出后应说明并让用户重选，不能悄悄切到另一支麦克风。
- 快捷键：Cindy 有组合键、长按阶段及原生修饰键监听。BOAI 目前只有聊天中的录音入口。建议先增加 BOAI 活跃窗口内的语音快捷键，复用现有快捷键设置和冲突校验；全局跨应用听写属于额外范围。
- 语音润色：Cindy 调用独立文字模型，支持自定义整理规则并保留原转写。BOAI 已有默认关闭的“文字整理”、独立连接/模型选择和撤销接线；目前规则固定。建议后续把规则编辑放入高级设置，仍只做本次转写整理，不回答或执行口述内容。
- 自定义词典：Cindy 有词典与匹配上下文。BOAI 已有手工术语表和别名，Qwen ASR 的 corpus 与可选文字整理都会使用；本地 SenseVoice 不做机械替换。当前先保留这一层，不把自动学习或同步当成现成功能。
- 录音时静音：Cindy 的桌面代码调用 SystemAudioMuteGuard，按平台支持执行并恢复系统输出状态。BOAI 未接入。可以后续提供可选开关；需要处理中断恢复和用户录音期间自行调整音量，避免覆盖用户的新状态。
- 快速启动：Cindy 有麦克风保活和预热，空闲30分钟释放，并处理电源/设备变化。BOAI 未接入。先测真实启动延迟；若有收益再提供默认关闭开关。它会延长设备占用，不只是改一个模型参数。
- 长按输入框：Cindy 的 ChatInput 内有手势识别、选字避让、松开结束等代码。固定版本的设置页已不再展示截图中的同款开关，截图不能当成当前默认值的依据。BOAI 未接入。建议先保留明确麦克风按钮和快捷键，避免干扰选字、拖动与正常编辑。
- 交互提示音：Cindy 在开始/结束路径播放短提示音，并和静音恢复协作。BOAI 未接入。可作为后续低优先级偏好；有清楚的录音视觉状态时，并非使用前提。
- 识别我的声音：Cindy 有声纹登记、加密存储、独立本地模型和音频门控。BOAI 未接入。个人使用先后置；只有多人或嘈杂环境确有需求时再设计和验收，不能声称可完整分离重叠讲话。

源码依据：

- [VoiceInputSection](https://github.com/makecindy/cindy/blob/c8e600b676f44137ce1d40e50f4aa280196a5f5f/apps/desktop/src/renderer/components/settings/VoiceInputSection.tsx)：语言、设备、权限、快捷键、润色与偏好入口。
- [useVoiceInput](https://github.com/makecindy/cindy/blob/c8e600b676f44137ce1d40e50f4aa280196a5f5f/apps/desktop/src/renderer/voice-input/useVoiceInput.ts)：设备选择、静音、预热及录音生命周期接线。
- [WebMicAudioEngine](https://github.com/makecindy/cindy/blob/c8e600b676f44137ce1d40e50f4aa280196a5f5f/apps/desktop/src/renderer/voice-input/WebMicAudioEngine.ts)：预热、设备释放和30分钟空闲期限。
- [ChatInput](https://github.com/makecindy/cindy/blob/c8e600b676f44137ce1d40e50f4aa280196a5f5f/apps/desktop/src/renderer/components/new-chat/ChatInput.tsx)：长按输入手势。
- [VoiceInputOverlay](https://github.com/makecindy/cindy/blob/c8e600b676f44137ce1d40e50f4aa280196a5f5f/apps/desktop/src/renderer/voice-input/VoiceInputOverlay.tsx)、[SystemAudioMuteGuard](https://github.com/makecindy/cindy/blob/c8e600b676f44137ce1d40e50f4aa280196a5f5f/apps/desktop/src/main/voice-input/SystemAudioMuteGuard.ts)：提示音和系统音量管理。
- [DictationRefiner](https://github.com/makecindy/cindy/blob/c8e600b676f44137ce1d40e50f4aa280196a5f5f/packages/voice-input-core/src/DictationRefiner.ts)：单独调用文字模型，自定义规则与词典上下文。
- [speakerModels](https://github.com/makecindy/cindy/blob/c8e600b676f44137ce1d40e50f4aa280196a5f5f/packages/voice-input-core/src/speakerModels.ts)、[speakerProfileStore](https://github.com/makecindy/cindy/blob/c8e600b676f44137ce1d40e50f4aa280196a5f5f/apps/desktop/src/main/voice-input/speaker/speakerProfileStore.ts)：Silero VAD、CAM++ 声纹模型及系统密钥加密保存。

## 3. Qwen 能承担哪部分

- 此处指 Qwen-ASR 实时语音识别服务，不能泛指所有 Qwen 模型。
- 官方会话协议支持识别语言提示、corpus 上下文/术语和 VAD 参数。BOAI 已使用术语上下文，本批增加语言选择；这些提示有助于识别，不保证每个专有名词一定正确。
- 润色可选择一个 Qwen 文字模型，但那是另外一次文本请求，并不是 ASR 模型自动具备规则编辑和文字整理流程。
- 麦克风、快捷键、静音、预热、长按和提示音都由应用与操作系统实现，不属于 ASR 参数。
- VAD 判断语音片段起止，不代表辨认“是不是本人”。Cindy 另用 CAM++ 做声纹表示和筛选；不能因为 BOAI 已有 Silero VAD 就显示“识别我的声音”开关。
- 协议依据：[Qwen-ASR Realtime 客户端事件](https://www.alibabacloud.com/help/en/model-studio/qwen-asr-realtime-client-events)。

## 4. 建议顺序与验收边界

- 第一批落实独立设置页，复用已接入能力；用户随后授权第5节四项增量。
- 原建议的语言、麦克风选择/权限入口、应用内语音快捷键及高级润色规则已进入本批实现；源码与验证状态见12第7节。
- 提示音、系统输出静音按实际使用需求后续补；预热、长按和声纹筛选先后置，不以“Cindy 有”作为全部移植的理由。
- 语言需验中文、英文和混读；设备需验权限拒绝/拔出/切换；快捷键需验冲突、重复按键、取消与正确草稿归属；润色需验数字/否定词保留和撤销。
- 新页沿原 application-plugins BDD 增补双入口、启停同源、离页保留/放弃、保存和重启检查；打开配置不下载/不录音的原合同保持。测试源码存在不等于执行通过。
- 导航新增一行预计影响 `settings-light`、`settings-dark`、`shortcuts-light`、`shortcuts-dark` 的全页基线。后续提交时须准备官方候选并审阅相应差异；本轮不改已接受 PNG，不宣称现有18项覆盖了新页内容。
- 新页本地/在线、文字整理开/关、停用/只读/保存冲突及窄窗口状态仍需桌面验收和视觉材料；模型质量、VI0静音失败及真实麦克风验证继续归[12第7节](./12-语音输入插件实施与验收.md#7-唯一实际进度)，不能由页面静态检查代替。

## 5. 2026-10-27 用户授权实施的增量合同

- 用户要求实现后 git cp；本批落实语言、麦克风选择/授权、应用内语音快捷键、高级润色规则。静音、提示音、预热、长按和声纹不属于本批。
- 语音配置升级v2，旧v1只读时投影为自动语言、系统默认设备、空附加规则，保留旧revision/凭据/术语；明确保存才写v2。损坏、未来版本与不支持的本地语言保持只读保护。
- 语言在本地支持自动/中文/粤语/英文/日文/韩文，在线沿Qwen官方语言清单；自动识别在Qwen协议省略语言字段。切换后端若语言不支持，要求显式重选，不能静默改变。
- 麦克风默认跟随系统；指定设备使用exact deviceId，缺失或断开即报错，不自动换设备。授权按钮通过可信主窗口的临时音频许可读取设备，立即停止探测流，不发送识别、不保存音频；退出页面、取消、隐藏或锁屏释放许可。不开页面自动访问麦克风。
- 快捷键新增到原统一快捷键配置，默认关闭且未绑定。语音页显示原绑定并跳到快捷键页录入；按下时只作用于当前聚焦的聊天输入框，录音后同键停止。复用原冲突、保存回执和录入抑制，忽略长按重复/输入法组合，不注册系统热键、不自动发送。
- 高级规则保存在独立文字整理配置中，空值采用原默认整理规则；只影响标点、口头语和表达偏好，固定保留原意/数字/否定词及不回答/不执行边界。整理失败继续保留原文和现有撤销机制。
- 验收沿原单元/BDD来源补旧数据迁移、语言真正下发、设备精确选择及迟到关闭、快捷键目标与重复/冲突、规则传递与草稿保存；静态检查、云端UI与真实语音分别报告。

- 语言清单补充依据：[SenseVoiceSmall官方模型说明](https://k2-fsa.github.io/sherpa/onnx/sense-voice/pretrained.html)，本地五种语言加自动检测，在线按Qwen官方清单。
