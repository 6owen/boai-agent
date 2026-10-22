/*
 * [INPUT]: BOAI共享组件与仅存在于当前预览的示例状态。
 * [OUTPUT]: 可交互的真实组件示例；源码原样展示并可复制。
 * [POS]: Design示例，不连接业务服务或持久化用户数据。
 * [PROTOCOL]: 修改时同步Header与所属目录.folder.md。
 */
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@boai/ui/input-group'
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@boai/ui/input-otp'
import { NumberField } from '@boai/ui/number-field'
export default function Inputs() {
 return <div className="example-stack"><label>站点地址<InputGroup><InputGroupAddon><InputGroupText>https://</InputGroupText></InputGroupAddon><InputGroupInput aria-label="站点地址" placeholder="boai.example" /></InputGroup></label><label>验证码<InputOTP maxLength={6} aria-label="验证码"><InputOTPGroup>{[0,1,2].map(index => <InputOTPSlot index={index} key={index} />)}</InputOTPGroup><InputOTPSeparator /><InputOTPGroup>{[3,4,5].map(index => <InputOTPSlot index={index} key={index} />)}</InputOTPGroup></InputOTP></label><label>人数<NumberField aria-label="人数" defaultValue={3} minValue={1} maxValue={10} /></label><NumberField aria-label="禁用人数" defaultValue={3} isDisabled /></div>
}
