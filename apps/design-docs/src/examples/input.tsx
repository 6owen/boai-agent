/*
 * [INPUT]: BOAI共享组件与局部示例状态。
 * [OUTPUT]: input真实示例；页面展示此文件的实际源码。
 * [POS]: 设计站公开示例，不连接BOAI业务服务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { useId, useState } from 'react'
import { Field, FieldDescription, FieldGroup, FieldLabel, Input, Textarea } from '@boai/ui'

export default function InputExample() {
  const id = useId()
  const [value, setValue] = useState('')
  return <FieldGroup className="example-form">
    <Field><FieldLabel htmlFor={`${id}-name`}>项目名称</FieldLabel><Input id={`${id}-name`} aria-describedby={`${id}-description`} placeholder="为项目起个名字" value={value} onChange={event => setValue(event.currentTarget.value)} /><FieldDescription id={`${id}-description`}>{value ? `当前输入：${value}` : '名称可以随时修改。'}</FieldDescription></Field>
    <Field><FieldLabel htmlFor={`${id}-notes`}>说明</FieldLabel><Textarea id={`${id}-notes`} rows={3} placeholder="记录一些想法…" /></Field>
    <Field data-disabled><FieldLabel htmlFor={`${id}-disabled`}>不可编辑</FieldLabel><Input id={`${id}-disabled`} value="由管理员管理" disabled /></Field>
  </FieldGroup>
}
