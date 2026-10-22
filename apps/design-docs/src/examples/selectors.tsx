/*
 * [INPUT]: BOAI共享组件与仅存在于当前预览的示例状态。
 * [OUTPUT]: 可交互的真实组件示例；源码原样展示并可复制。
 * [POS]: Design示例，不连接业务服务或持久化用户数据。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { useState } from 'react'
import { SelectField } from '@boai/ui/select-field'
import { NativeSelect, NativeSelectOption } from '@boai/ui/native-select'
import { Checkbox } from '@boai/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@boai/ui/radio-group'
import { Switch } from '@boai/ui/switch'
import { Slider } from '@boai/ui/slider'
import { Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty } from '@boai/ui/combobox'
const options = ['设计', '工程', '产品']
export default function Selectors() {
 const [role, setRole] = useState('设计'), [enabled, setEnabled] = useState(true), [volume, setVolume] = useState<number[]>([40])
 return <div className="example-stack"><label>角色<SelectField aria-label="角色" value={role} onValueChange={setRole} options={options.map(value => ({ value, label: value }))} /></label><label>原生选择<NativeSelect aria-label="原生选择">{options.map(item => <NativeSelectOption key={item}>{item}</NativeSelectOption>)}</NativeSelect></label><Combobox items={options}><ComboboxInput aria-label="搜索角色" placeholder="搜索角色" /><ComboboxContent><ComboboxEmpty>没有匹配项</ComboboxEmpty><ComboboxList>{item => <ComboboxItem key={item} value={item}>{item}</ComboboxItem>}</ComboboxList></ComboboxContent></Combobox><label className="example-row"><Checkbox defaultChecked />接受通知</label><label className="example-row"><Checkbox disabled />禁用选项</label><RadioGroup defaultValue="daily" aria-label="频率"><label className="example-row"><RadioGroupItem value="daily" />每天</label><label className="example-row"><RadioGroupItem value="weekly" />每周</label></RadioGroup><label className="example-row"><Switch checked={enabled} onCheckedChange={setEnabled} />{enabled ? '已开启' : '已关闭'}</label><Slider aria-label="音量" value={volume} onValueChange={value => setVolume(Array.isArray(value) ? value : [value])} /><output>音量：{Array.isArray(volume) ? volume.join(' – ') : volume}</output></div>
}
