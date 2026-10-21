/*
 * [INPUT]: 锁定Electron可执行文件、独立临时userData与实际screen API。
 * [OUTPUT]: 无窗口等待实际显示指标稳定后读取尺寸/缩放和主屏工作区；与截图进程同API，无设备ID。
 * [POS]: UI环境预检入口；由原生guard监督，不加载产品或用户数据。
 * [PROTOCOL]: 修改同步Header与scripts/.folder.md。
 */
const { app, screen } = require('electron')
const { isAbsolute } = require('node:path')
const stableDisplays = require('./ui-display-stability.cjs')
const directory = process.argv[2]
if (!directory || !isAbsolute(directory)) throw new Error('UI preflight requires an isolated absolute userData path')
app.setName('BoAI Agent')
app.setPath('userData', directory)
app.setPath('sessionData', directory)
app.whenReady().then(async () => {
  const displays = await stableDisplays(screen)
  process.stdout.write('BOAI_UI_DISPLAYS ' + JSON.stringify({ displays, electron: process.versions.electron, execPath: process.execPath }) + '\n', () => app.quit())
}).catch(error => { console.error(error); app.exit(1) })
