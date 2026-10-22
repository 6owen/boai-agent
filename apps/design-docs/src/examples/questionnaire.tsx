/*
 * [INPUT]: BOAI共享组件与仅存在于当前预览的示例状态。
 * [OUTPUT]: 可交互的真实组件示例；源码原样展示并可复制。
 * [POS]: Design示例，不连接业务服务或持久化用户数据。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { useState } from 'react'
import * as Q from '@boai/ui/questionnaire'
export default function QuestionnaireExample() {
 const [result,setResult] = useState('')
 return <div className="example-stack"><Q.Questionnaire items={[{name:'style',required:true,choices:[{value:'compact'},{value:'comfortable'}]}]} onSubmit={event => { event.preventDefault(); setResult(String(new FormData(event.currentTarget).get('style') ?? '')) }}><Q.QuestionnaireProgress /><Q.QuestionnaireItem name="style" required><Q.QuestionnaireTitle>选择界面密度</Q.QuestionnaireTitle><Q.QuestionnaireDescription>示例选项只保留在此预览。</Q.QuestionnaireDescription><Q.QuestionnaireChoices><Q.QuestionnaireChoice value="compact">紧凑<Q.QuestionnaireChoiceDescription>适合密集工作流</Q.QuestionnaireChoiceDescription></Q.QuestionnaireChoice><Q.QuestionnaireChoice value="comfortable">舒适<Q.QuestionnaireChoiceDescription>更多内容间距</Q.QuestionnaireChoiceDescription></Q.QuestionnaireChoice></Q.QuestionnaireChoices><Q.QuestionnaireError>请选择一项</Q.QuestionnaireError></Q.QuestionnaireItem><Q.QuestionnaireActions><Q.QuestionnaireSubmit>提交选择</Q.QuestionnaireSubmit></Q.QuestionnaireActions></Q.Questionnaire><output aria-live="polite">{result ? `已选择：${result}` : '尚未提交'}</output></div>
}
