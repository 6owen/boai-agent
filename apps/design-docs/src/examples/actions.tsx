/*
 * [INPUT]: BOAI共享组件与仅存在于当前预览的示例状态。
 * [OUTPUT]: 可交互的真实组件示例；源码原样展示并可复制。
 * [POS]: Design示例，不连接业务服务或持久化用户数据。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { useState } from 'react'
import { Button } from '@boai/ui/button'
import { ButtonGroup, ButtonGroupSeparator } from '@boai/ui/button-group'
import { Toggle } from '@boai/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@boai/ui/toggle-group'
export default function Actions() {
  const [bold, setBold] = useState(false)
  return <div className="example-stack"><ButtonGroup><Button variant="secondary">上一个</Button><ButtonGroupSeparator /><Button variant="secondary">下一个</Button></ButtonGroup><Toggle aria-label="粗体" pressed={bold} onPressedChange={setBold}>B</Toggle><output>粗体：{bold ? '开启' : '关闭'}</output><ToggleGroup multiple defaultValue={['left']}><ToggleGroupItem value="left" aria-label="左对齐">左</ToggleGroupItem><ToggleGroupItem value="center" aria-label="居中">中</ToggleGroupItem><ToggleGroupItem value="right" aria-label="右对齐">右</ToggleGroupItem></ToggleGroup></div>
}
