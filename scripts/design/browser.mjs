/*
 * [INPUT]: 原Excalidraw面板HTML、宿主bootstrap及同源随机会话路径。
 * [OUTPUT]: 原生编辑/保存与明确选区接Agent通用桥，工具更新回到原编辑器。
 * [POS]: 开发侧外部页面；参考固定上游browser-fixture，许可见NOTICE.md。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
const safeJSON = value => JSON.stringify(value).replaceAll('<', '\\u003c')
const referenceMessage = '已加入对话输入框，可继续输入修改要求。'
const bridgeMessage = '已提交到开发桥，请让当前开发 Agent 读取选区。'
const escapedJS = value => [...value].map(character => character.charCodeAt(0) > 127 ? '\\u' + character.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0') : character).join('')
export function adaptResource(resource) {
  return { ...resource, contents: resource.contents.map(content => {
    if (!content.uri.startsWith('ui://excalidraw/assets/bundle-') || typeof content.text !== 'string') return content
    return { ...content, text: content.text.replaceAll(escapedJS(referenceMessage), escapedJS(bridgeMessage)).replaceAll(referenceMessage, bridgeMessage).replaceAll('Added to the chat input. Describe your changes there.', 'Sent to the developer bridge. Ask your development agent to read the selection.') }
  }) }
}
export function panelHTML(html, prefix, bootstrap) {
  if (!html.includes('<script>')) throw new Error('固定上游面板入口不兼容')
  const bridge = `<script>
  const base=${safeJSON(prefix)};
  async function rpc(method,args){const response=await fetch(base+'/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,args})});const value=await response.json();if(!response.ok)throw Error(value.error);return value;}
  window.__pluginClient={theme:'light',locale:'zh-CN',toolCancelled:null,...${safeJSON(bootstrap)},
    readResource:uri=>rpc('readResource',{uri}),callTool:(name,args)=>rpc('callTool',{name,arguments:args}),
    updateModelContext:value=>rpc('context',value),
    setWidgetState:async value=>{await rpc('widgetState',value);window.__pluginClient.widgetState=value},notifyIntrinsicHeight:()=>{}};
  const events=new EventSource(base+'/events');events.onmessage=event=>{const value=JSON.parse(event.data);window.__pluginClient.toolInput=value.input;window.__pluginClient.toolOutput=value.output;window.dispatchEvent(new Event('plugin:change'))};
  window.addEventListener('pagehide',()=>events.close());
  </script>`
  // 原宿主会注入聊天输入框；此桥由客户端Agent显式读取，不能显示原宿主承诺。
  return html.replaceAll(referenceMessage, bridgeMessage)
    .replaceAll('Added to the chat input. Describe your changes there.','Sent to the developer bridge. Ask your development agent to read the selection.')
    .replace('<script>', bridge + '<script>')
}
export function editorHTML(prefix) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>BOAI 开发画板</title><style>body{margin:0;height:100vh;display:flex;flex-direction:column;font:13px system-ui}header{padding:8px 14px;border-bottom:1px solid #ddd}iframe{flex:1;border:0;width:100%;min-height:0}</style><header>BOAI 开发画板 · 保存写入插件文档库；导出到 ai-docs/design 后才是仓库设计。引用后，让当前开发 Agent 调用 get_editor_context；不会自动写入聊天输入框。</header><iframe title="Excalidraw 开发画板" src="${prefix}/panel"></iframe></html>`
}
