/*
 * [INPUT]: ready后的实际Electron screen及其显示指标变更事件。
 * [OUTPUT]: 采样及事件均持续1秒稳定才返回全部显示器；10秒仍变化则拒绝并释放监听器。
 * [POS]: 无窗口UI环境预检的就绪屏障，不修改显示器或增加截图容差。
 * [PROTOCOL]: 修改同步Header与scripts/.folder.md。
 */
module.exports = function stableDisplays(screen) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    let stableSince = started, previous
    const changed = () => { stableSince = Date.now() }
    const finish = (error, value) => {
      clearInterval(timer); screen.removeListener('display-metrics-changed', changed)
      if (error) reject(error); else resolve(value)
    }
    const sample = () => {
      try {
        const primary = screen.getPrimaryDisplay()
        const displays = screen.getAllDisplays().map(item => ({
          width: item.bounds.width, height: item.bounds.height,
          ...(item.id === primary.id ? { workWidth: item.workArea.width, workHeight: item.workArea.height } : {}),
          scaleFactor: item.scaleFactor, primary: item.id === primary.id,
        })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
        const signature = JSON.stringify(displays), now = Date.now()
        if (!displays.length || displays.filter(item => item.primary).length !== 1) throw new Error('UI preflight requires exactly one primary display')
        if (signature !== previous) { previous = signature; stableSince = now }
        if (now - started >= 10_000) finish(new Error('UI display metrics did not settle within 10 seconds'))
        else if (now - stableSince >= 1_000) finish(null, displays)
      } catch (error) { finish(error) }
    }
    screen.on('display-metrics-changed', changed)
    const timer = setInterval(sample, 100)
    sample()
  })
}
