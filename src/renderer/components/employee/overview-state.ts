/*
 * [OUTPUT]: Claude自动化沿原七项表单、原Mastra时钟/occurrence/预算和宿主文件交付接入；明确程序/API来源逐次核对，命令/旧ACP限制保持，实际验证见第13组06 §57。
 * [OUTPUT]: Claude能力说明覆盖已接核心团队/组织群，程序验证与API认证分开，自动化沿明确程序/API来源与原预算开放。
 * [OUTPUT]: Claude分别呈现程序核对、API来源与单聊/普通群分工/文件/四类图片传输；视觉理解取决于模型，不借用Codex协作/订阅声明。
 * [OUTPUT]: bobo可选择API或本机Codex；组织/具名团队按原运行配置创建独立员工，混合成员共原预算；本机自动化沿原时钟/预算接入，实际验证归第13组06。
 * [OUTPUT]: 原生Codex与API共用技能/知识/命令事实投影；本机连接另核对版本，说明可读不冒充执行成功。
 * [INPUT]: 已提交员工、资源和连接快照，以及固定配置版本的说明/握手记录和同次启动项只读身份核对。
 * [OUTPUT]: 区分配置声明、绑定、说明、命令授权及原握手范围；程序/登录依赖失效与旧配置验证不冒充当前能力。
 * [POS]: 员工资料能力的只读投影，不探测程序或执行技能。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { AgentHome, DigitalAgent, LaunchProfile, LaunchProfileStatus, Snapshot } from '@shared/domain'

export interface EmployeeCapabilityFact { id: string; name: string; status: string; detail: string; skillId?: string }

export function employeeCapabilityFacts(agent: DigitalAgent, snapshot: Snapshot, home: AgentHome | null, profile?: LaunchProfile, launchStatus?: LaunchProfileStatus): EmployeeCapabilityFact[] {
  if (agent.executionBackend && agent.executionBackend.kind !== 'mastra-model' && profile?.id !== agent.executionBackend.profileId) profile = undefined
  const checked = profile && launchStatus && launchStatus.profile.id === profile.id && launchStatus.profile.revision === profile.revision && launchStatus.profile.executableHash === profile.executableHash ? launchStatus : undefined
  const mismatchedCheck = Boolean(profile && launchStatus && !checked)
  const dependencyUnavailable = checked?.status === 'unavailable', changed = checked?.status === 'changed'
  let nativeConnection: EmployeeCapabilityFact | undefined = agent.executionBackend?.kind === 'codex-local' ? { id: 'connection', name: '本机 Codex', status: !profile ? '启动项不可用' : mismatchedCheck ? '当前启动项待核对' : dependencyUnavailable ? '执行依赖不可用' : changed ? '连接验证已失效' : profile.verified ? '已记录连接验证' : '连接待核对', detail: checked?.status !== 'available' ? checked?.detail ?? '当前依赖待核对。' : '单聊、普通群聊与文件任务；无需模型 API。命令仅按员工设置逐次批准。内部模型调用次数未知，已知用量按外部请求累计。材料、已绑定技能/知识与来源关联记忆沿宿主规则接入；普通群支持分工和结果等待；支持 bobo 组织群；关闭命令权限后可用于定时任务，连接验证不代表交付。' } : undefined
  if (agent.executionBackend?.kind === 'claude-local') nativeConnection = {
    id: 'connection', name: '本机 Claude', status: !profile ? '启动项不可用' : mismatchedCheck ? '当前程序待核对' : dependencyUnavailable ? '程序不可用' : changed ? '程序核对已失效' : profile.verified ? '已记录程序核对' : '程序待核对',
    detail: checked?.status !== 'available' ? checked?.detail ?? '当前依赖待核对。' : '已核对本机程序版本；这不证明API认证或实际交付。支持独立员工单聊、普通群分工与结果等待、宿主文件任务及PNG、JPEG、GIF、WebP图片输入；图片理解取决于所选模型。支持核心助手建团队与组织群；关闭命令权限后可用于定时任务。',
  }
  if (agent.executionBackend?.kind === 'acp-local') return [{
    id: 'connection', name: '外部任务连接',
    status: !profile ? '启动项不可用' : mismatchedCheck ? '当前启动项待核对' : dependencyUnavailable ? '执行依赖不可用' : changed ? '连接验证已失效' : profile.verified ? '已记录连接验证' : checked ? '当前配置未验证' : '已配置 · 未验证',
    detail: !profile ? '请在配置中核对外部启动项。' : mismatchedCheck
      ? '读取结果不属于当前启动项配置版本；不能使用其他启动项或旧版本的核对记录。'
      : dependencyUnavailable || changed
      ? `${profile.name} · 配置版本 ${profile.revision}。${checked!.detail} 原连接验证不能证明当前程序与登录依赖可用；请在配置中核对后明确测试。`
      : profile.verified
      ? `${profile.name} · 配置版本 ${profile.revision} · ${profile.verified.name} ${profile.verified.version}。验证仅覆盖当时的连接握手，实际任务仍需核验当前程序与权限。`
      : `${profile.name} · 配置版本 ${profile.revision}。仅支持明确任务；尚无当前启动项的连接验证，配置修改后不能继续使用旧验证。当前资料不启动验证。`,
  }, { id: 'external-scope', name: '能力范围', status: '由外部程序管理', detail: 'BoAI 的技能、知识和记忆不会自动传给外部程序；当前资料不推断它的工具或模型能力。' }]
  const connection = snapshot.connections.find(item => item.id === agent.connectionId)
  const model = agent.modelId || connection?.defaultModel
  const facts: EmployeeCapabilityFact[] = [nativeConnection ?? { id: 'model', name: '模型连接', status: connection && model ? '已配置' : '尚未配置', detail: connection && model ? `${connection.name} · ${model}。配置存在不代表连接或输出效果已验证。` : '请在配置中选择连接与模型。' }, {
    id: 'commands', name: '命令授权', status: agent.allowCommands ? '可申请 · 逐次批准' : '未启用', detail: agent.allowCommands ? '配置允许申请命令执行；具体命令仍在原员工聊天请求批准，当前资料不执行检查。' : '当前员工不能申请执行主机命令。',
  }]
  if (agent.executionBackend?.kind === 'claude-local') facts.splice(1, 0, { id: 'model', name: 'Claude模型来源', status: connection?.hasApiKey && model ? '已配置' : '尚未配置', detail: connection && model ? `${connection.name} · ${model}。由本机Claude调用，不额外使用API父模型；实际用量按外部阶段记录，内部模型调用次数未知。` : '请在员工配置中选择兼容API连接和模型。' })
  const currentEnvironment = home?.agentId === agent.id && home.configVersion === agent.configVersion ? home.environment : undefined
  for (const id of agent.skillIds) {
    const resource = snapshot.resources.find(item => item.id === id && item.kind === 'skill' && (!item.ownerAgentId || item.ownerAgentId === agent.id))
    const readiness = currentEnvironment?.skills.find(item => item.resourceId === id)
    facts.push({ id: `skill:${id}`, skillId: resource ? id : undefined, name: resource?.name ?? '已绑定技能',
      status: !resource ? '来源不可用' : !readiness ? '已绑定 · 读取状态待核对' : readiness.instructions === 'invalid' ? '已绑定 · 说明不可读' : '已绑定 · 说明可读',
      detail: !resource ? '原绑定资源已移除或不属于该员工，不能作为可用能力。' : !readiness ? '尚无当前配置版本的说明读取结果；依赖与执行效果未验证。' : `${readiness.detail}${readiness.instructions === 'available' ? '说明读取通过不表示执行依赖或交付效果已验证。' : ''}`,
    })
  }
  if (agent.knowledgeIds.length) facts.push({ id: 'knowledge', name: '知识资料', status: `已绑定 ${agent.knowledgeIds.length} 项`, detail: '实际任务仍按当前聊天权限读取；群聊只使用群内明确共享的资料。' })
  return facts
}
