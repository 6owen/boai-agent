/*
 * [INPUT]: 明确版本、SHA、当前源码和应用元数据。
 * [OUTPUT]: 候选构建所需的干净源码及版本身份检查。
 * [POS]: 发布构建基础工具，不执行测试或授予发布资格。
 * [PROTOCOL]: 修改同步 Header 与 scripts/.folder.md。
 */
export function verifyReleaseSource({ version, sha, current, metadata }) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? '') || !version.split('.').every(part => Number.isSafeInteger(Number(part))) || !/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('版本须为稳定X.Y.Z，提交须为完整SHA')
  if (current?.sha !== sha || current.dirty !== false) throw new Error('必须是当前干净源码的同一提交')
  if (metadata?.version !== version || metadata?.build?.buildVersion !== version || metadata?.build?.appId !== 'com.boai.agent' || metadata?.build?.productName !== 'BoAI Agent') throw new Error('package版本/buildVersion或应用身份不匹配')
  return { version, tag: `v${version}`, sha, appId: metadata.build.appId, buildVersion: metadata.build.buildVersion }
}
