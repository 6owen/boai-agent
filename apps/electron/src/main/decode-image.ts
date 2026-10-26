import { BrowserWindow, nativeImage } from 'electron'
import { randomUUID } from 'node:crypto'
import { imageFormat } from './appearance'
/** Electron nativeImage handles PNG/JPEG; Chromium decodes WebP in an isolated, ephemeral renderer. */
export async function decodeImage(bytes:Buffer):Promise<{width:number;height:number}>{
 if(imageFormat(bytes)!=='webp')return nativeImage.createFromBuffer(bytes).getSize()
 const decoder=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true,partition:`appearance-decoder-${randomUUID()}`}})
 decoder.webContents.session.setPermissionRequestHandler((_webContents,_permission,done)=>done(false))
 const timeout=setTimeout(()=>{if(!decoder.isDestroyed())decoder.destroy()},5000)
 try{
  await decoder.loadURL('data:text/html,<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src blob: data:">')
  const base64=bytes.toString('base64')
  return await decoder.webContents.executeJavaScript(`(async()=>{const data=Uint8Array.from(atob('${base64}'),c=>c.charCodeAt(0));const bitmap=await createImageBitmap(new Blob([data],{type:'image/webp'}));const size={width:bitmap.width,height:bitmap.height};bitmap.close();return size})()`)
 }catch{throw new Error('WebP 图片无法解码，请选择有效图片。')}
 finally{clearTimeout(timeout);if(!decoder.isDestroyed())decoder.destroy()}
}
