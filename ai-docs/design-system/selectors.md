<!--
[INPUT]: BOAI共享实现及受控示例。
[OUTPUT]: 公开组件使用、API入口与验证边界。
[POS]: ai-docs/design-system公开文档。
[PROTOCOL]: 修改时同步Header及所属.folder.md。
-->
# Select、Combobox 与选择控件

单选、检索、多选、开关与滑块。

## 组成与导入

- `@boai/ui/select`
- `@boai/ui/select-field`
- `@boai/ui/native-select`
- `@boai/ui/combobox`
- `@boai/ui/checkbox`
- `@boai/ui/radio-group`
- `@boai/ui/switch`
- `@boai/ui/slider`

SelectField 是 Select 的受控组合，使用 value、options、onValueChange。Combobox 接收 items，并由 List 渲染过滤结果；选择器保持各自的键盘行为。Switch 和 Checkbox 使用 checked / onCheckedChange；Slider 使用 value / onValueChange。

## 交互与状态

单选、原生选择、可检索下拉、复选、单选组、开关、滑块以及禁用项。

上方预览可切换窄屏和明暗对照，UI、正文、代码字号分别来自共享注册表。每个预览有独立的文档、Portal 和通知容器；需要完整窗口时使用“独立打开”。所有演示状态都在本地，刷新后恢复。

“查看源码”展示实际运行的示例文件；“导入与 API”列出真实导出，并可展开完整属性与实现。复合控件的触发器使用 `render={<Button />}` 组合，避免嵌套两个按钮（写法以可复制示例为准）。

## 接入约定

先加载 Tailwind v4，再加载 `@boai/ui/styles.css`。组件内的颜色、Soft 边缘、阴影和圆角来自共享包，禁止在文档站复制一套皮肤。禁用状态仍需真实 `disabled` / `isDisabled` 语义；图标按钮要提供可访问名称。使用 [Token 目录](/foundations/tokens) 查找颜色、排版和圆角。

预览覆盖上述展示与本地交互；真实持久化、权限、异步失败和业务回执由宿主负责。公开包当前仍为工作区内使用，源码迁移不表示已经完成 npm 发布。

## 页面组件索引

- [Checkbox](#api-checkbox)：`@boai/ui/checkbox`；Checkbox
- [Combobox](#api-combobox)：`@boai/ui/combobox`；Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxGroup, ComboboxLabel, ComboboxCollection, ComboboxEmpty, ComboboxSeparator, ComboboxChips, ComboboxChip, ComboboxChipsInput, ComboboxTrigger, ComboboxValue, useComboboxAnchor
- [NativeSelect](#api-native-select)：`@boai/ui/native-select`；NativeSelect, NativeSelectOptGroup, NativeSelectOption
- [RadioGroup](#api-radio-group)：`@boai/ui/radio-group`；RadioGroup, RadioGroupItem
- [SelectField](#api-select-field)：`@boai/ui/select-field`；SelectField
- [Select](#api-select)：`@boai/ui/select`；Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger, SelectValue
- [Slider](#api-slider)：`@boai/ui/slider`；Slider
- [Switch](#api-switch)：`@boai/ui/switch`；Switch
