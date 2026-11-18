// Routes are trusted defaults. Agents can identify a more specific visible state in the PR.
export function screenshotTarget(paths, body = '') {
  const hint = (body || '').match(/<!--\s*boai-screenshot\s+([\s\S]*?)-->/)
  if (hint) {
    const { clicks, visible } = JSON.parse(hint[1])
    if (!Array.isArray(clicks) || clicks.length > 8 || ![...clicks, visible].every(s => typeof s === 'string' && s.trim() && s.length <= 512)) {
      throw Error('boai-screenshot requires up to eight click selectors and a visible target')
    }
    return { clicks, visible }
  }
  const nav = name => `nav[aria-label="主导航"] button[aria-label="${name}"]`
  if (paths.some(p => /\/schedules\/automation-history-(dialog|list)\.tsx$/.test(p))) {
    return { clicks: [nav('定时任务'), 'role=button[name="定时任务选项"]', 'role=menuitem[name="执行记录"]'], visible: 'role=dialog >> role=textbox[name="搜索执行记录"]' }
  }
  for (const [folder, name] of [['schedules', '定时任务'], ['contacts', '通讯录'], ['library', '资源库'], ['sources', '资源库'], ['conversations', '会话']]) {
    if (paths.some(p => p.includes(`/renderer/pages/${folder}/`))) return { clicks: [nav(name)], visible: nav(name) + '[aria-current="page"]' }
  }
  if (paths.some(p => p.includes('/renderer/pages/settings/'))) {
    return { clicks: ['role=button[name="我的菜单"]', 'role=menuitem[name="其他配置"]', 'role=menuitem[name="模型连接"]'], visible: 'role=navigation[name="设置分类"]' }
  }
  return { clicks: [], visible: 'nav[aria-label="主导航"]' }
}
