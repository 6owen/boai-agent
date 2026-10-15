/*
 * [OUTPUT]: 2026-10-15文件预览标注进入原聊天明确修改；成果固定版本修订、附件固定来源/权限和未知回执保持；实际结果归8组14。
 * [INPUT]: 用户在文件预览中选中的原文、位置说明与明确修改要求。
 * [OUTPUT]: 有界标注与统一修改消息；标注仅为用户指示，不作为文件身份或权限。
 * [POS]: 预览/聊天共用的文件修改语义，固定版本由各宿主来源合同核验。
 * [PROTOCOL]: 修改时同步 Header 和所属 .folder.md。
 */
export interface FileEditAnnotation { quote?: string; location?: string }
export const FILE_EDIT_QUOTE_LIMIT = 4000
export const FILE_EDIT_LOCATION_LIMIT = 300

export function fileEditContent(request: string, annotation?: FileEditAnnotation) {
  const location = annotation?.location?.trim(), quote = annotation?.quote?.trim()
  if (!location && !quote) return request
  return `${location ? `修改位置：${location}\n` : ''}${quote ? `选中的原文（定位参考）：\n${quote}\n\n` : ''}修改要求：\n${request}`
}
