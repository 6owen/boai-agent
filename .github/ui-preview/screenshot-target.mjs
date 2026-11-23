/*
 * [INPUT]: PR changed paths and the optional boai-screenshot block.
 * [OUTPUT]: Clicks, optional hover and a visible selector for the target screenshot.
 * [POS]: Trusted UI preview routing before the PR application runs.
 * [PROTOCOL]: Update this header, .folder.md and UI_TEST_CI.md when changed.
 */
const libraryContent = 'main[aria-label="资源库内容"]'
const pageRoutes = [
  ['定时任务', ['schedules']],
  ['通讯录', ['contacts']],
  ['资源库', ['library', 'sources']],
  ['会话', ['conversations']],
]
const libraryCatalogs = [
  [/\/renderer\/pages\/sources\//, '数据源', '数据源管理'],
  [/\/renderer\/pages\/library\/(?:prompt-|use-prompt-)/, '提示词', '提示词管理'],
  [/\/renderer\/pages\/library\/applications-view\.tsx$/, '应用', '应用目录'],
  [/\/renderer\/pages\/library\/assistants-view\.tsx$/, '助手', '助手目录'],
]

export function screenshotTarget(paths, body = '') {
  const hint = (body || '').match(/<!--\s*boai-screenshot\s+([\s\S]*?)-->/)
  if (hint) {
    const { clicks, hover, visible } = JSON.parse(hint[1])
    const selectors = Array.isArray(clicks) && [...clicks, visible, ...(hover === undefined ? [] : [hover])]
    if (!selectors || clicks.length > 8 || !selectors.every(s => typeof s === 'string' && s.trim() && s.length <= 512)) {
      throw Error('boai-screenshot requires up to eight click selectors, an optional hover selector and a visible target')
    }
    return hover === undefined ? { clicks, visible } : { clicks, hover, visible }
  }
  const nav = name => `nav[aria-label="主导航"] button[aria-label="${name}"]`
  if (paths.some(p => /\/schedules\/automation-history-(dialog|list)\.tsx$/.test(p))) {
    return { clicks: [nav('定时任务'), 'role=button[name="定时任务选项"]', 'role=menuitem[name="执行记录"]'], visible: 'role=dialog >> role=textbox[name="搜索执行记录"]' }
  }
  const route = pageRoutes.find(([, folders]) => folders.some(folder => paths.some(p => p.includes(`/renderer/pages/${folder}/`))))
  if (route) {
    const [name] = route
    if (name === '资源库') return libraryTarget(paths, nav(name))
    return { clicks: [nav(name)], visible: nav(name) + '[aria-current="page"]' }
  }
  if (paths.some(p => p.includes('/renderer/pages/settings/'))) {
    return { clicks: ['role=button[name="我的菜单"]', 'role=menuitem[name="其他配置"]', 'role=menuitem[name="模型连接"]'], visible: 'role=navigation[name="设置分类"]' }
  }
  return { clicks: [], visible: 'nav[aria-label="主导航"]' }
}

function libraryTarget(paths, openLibrary) {
  if (paths.some(p => p.endsWith('/renderer/pages/library/library-display-menu.tsx'))) {
    return {
      clicks: [openLibrary, 'role=button[name="显示资源库分类"]'],
      visible: 'role=menuitemcheckbox[name="技能"]',
    }
  }
  const catalog = libraryCatalogs.find(([pattern]) => paths.some(p => pattern.test(p)))
  if (!catalog) return { clicks: [openLibrary], visible: libraryContent }
  const [, name, label] = catalog
  return {
    clicks: [openLibrary, `role=complementary[name="资源库导航"] >> role=button[name="${name}"s]`],
    visible: `${libraryContent} section[aria-label="${label}"]`,
  }
}
