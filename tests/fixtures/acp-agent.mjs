import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk'
import { Readable, Writable } from 'node:stream'
import { writeFile } from 'node:fs/promises'
let sessionId='',cwd='',cancelled=false
const connection=new AgentSideConnection(client=>({
 initialize:async()=>({protocolVersion:PROTOCOL_VERSION,agentCapabilities:{},agentInfo:{name:'boai-protocol-fixture',version:'1.0.0'}}),
 newSession:async params=>{cwd=params.cwd;sessionId=crypto.randomUUID();cancelled=false;return {sessionId}},
 authenticate:async()=>({}),
 cancel:async()=>{cancelled=true},
 prompt:async params=>{const prompt=params.prompt.map(p=>p.text??'').join('');await client.sessionUpdate({sessionId,update:{sessionUpdate:'agent_thought_chunk',content:{type:'text',text:'PRIVATE_THOUGHT_DO_NOT_PUBLISH'}}});
 if(prompt.includes('WAIT_FOREVER')){await new Promise(resolve=>setTimeout(resolve,60000));return {stopReason:'cancelled'}}
 if(prompt.includes('PERMISSION')){const answer=await client.requestPermission({sessionId,toolCall:{toolCallId:'tool-1',title:'写入测试文件',kind:'edit',rawInput:{path:'report.txt'}},options:[{optionId:'yes',name:'本次允许',kind:'allow_once'},{optionId:'no',name:'拒绝',kind:'reject_once'}]});if(answer.outcome.outcome!=='selected')return {stopReason:'refusal'}}
 await writeFile(cwd+'/report.txt','controlled external artifact')
 const content=`ACP report ${sessionId}. KEY=${process.env.BOAI_SECRET_SENTINEL??'absent'}`;await client.sessionUpdate({sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:content}}});return {stopReason:cancelled?'cancelled':'end_turn'}},
}),ndJsonStream(Writable.toWeb(process.stdout),Readable.toWeb(process.stdin)))
