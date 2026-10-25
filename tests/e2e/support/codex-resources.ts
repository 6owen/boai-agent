/*
 * [INPUT]: 隔离桌面场景目录。
 * [OUTPUT]: 随机材料/技能/知识原件与三色PNG；不改变本机用户配置，不替换运行时或模型。
 * [OUTPUT]: 材料来源故障仅修改本场受管原件，保存原字节并显式恢复，不替换产品核验或模型响应。
 * [OUTPUT]: 发送恢复使用真实路径的Markdown/PNG/二进制三附件，原始文件仅在场景隔离目录生成。
 * [POS]: LR3桌面输入准备；真实结果与这些原件逐项核对。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { randomInt, randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import type { ConversationMaterial } from '../../../packages/shared/src/domain/materials'

export async function prepareCodexMaterialSource(root: string) {
  const directory = join(await realpath(root), 'native-material-source')
  await mkdir(directory, { recursive: true })
  const code = `CHAT_CODE_${randomUUID()}`, path = join(directory, '来源核对.md')
  await writeFile(path, `# 本聊天材料\n暗号：${code}\n我的长期写作偏好：报告标题使用紫色。\n`)
  return { path, code }
}

export async function prepareCodexSendMaterials(root: string) {
  const source = await prepareCodexMaterialSource(root), resources = await prepareCodexResources(root)
  const binary = join(await realpath(root), '附件原件.dat')
  await writeFile(binary, Buffer.from([0, 255, 19, 13, 0, 128, 211, 10]))
  return { source, files: [source.path, resources.image, binary] }
}

export async function faultCodexMaterialSource(dataPath: string, material: ConversationMaterial, kind: string) {
  if (!['原件外改', '原件丢失'].includes(kind)) throw new Error('未知本机材料故障')
  const path = join(await realpath(dataPath), 'materials', material.conversationId, material.id, 'original')
  const original = await readFile(path), saved = `${path}.bdd-saved`
  if (kind === '原件丢失') await rename(path, saved)
  else await writeFile(path, `外部修改的内容：UNAPPROVED_${randomUUID()}\n`)
  return { path, original, restore: async () => {
    if (kind === '原件丢失') await rename(saved, path)
    else await writeFile(path, original)
  } }
}

function pngChunk(type: string, bytes: Buffer) {
  const body = Buffer.concat([Buffer.from(type), bytes]), length = Buffer.alloc(4), checksum = Buffer.alloc(4)
  length.writeUInt32BE(bytes.length)
  let crc = 0xffffffff
  for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0) }
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return Buffer.concat([length, body, checksum])
}

export async function prepareCodexResources(root: string) {
  const directory = join(await realpath(root), 'native-resources'), skill = join(directory, 'native-proof')
  await mkdir(join(skill, 'references'), { recursive: true })
  const skillToken = `SKILL_PROOF_${randomUUID()}`, textToken = `TEXT_PROOF_${randomUUID()}`, knowledgeToken = `KNOWLEDGE_PROOF_${randomUUID()}`
  const instruction = '---\nname: native-proof\ndescription: Read the bound evidence reference when preparing a report\n---\nBefore writing the report, read references/proof.md with skill_read. Include the exact code found there. Do not invent a code.'
  const reference = join(skill, 'references/proof.md'), material = join(directory, '材料.md'), knowledge = join(directory, '知识.md'), image = join(directory, '色块.png')
  await writeFile(join(skill, 'SKILL.md'), instruction); await writeFile(reference, skillToken)
  await writeFile(material, `材料核对码：${textToken}\n`); await writeFile(knowledge, `KNOWLEDGE_PROOF ${knowledgeToken}\n`)
  const colors = [{ name: '紫色', rgb: [128, 0, 192] }, { name: '绿色', rgb: [0, 180, 0] }, { name: '橙色', rgb: [255, 128, 0] }]
  for (let i = colors.length - 1; i > 0; i--) { const other = randomInt(i + 1); [colors[i], colors[other]] = [colors[other], colors[i]] }
  const width = 300, height = 100, rowBytes = 1 + width * 3, pixels = Buffer.alloc(height * rowBytes)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) colors[Math.floor(x / 100)].rgb.forEach((value, channel) => { pixels[y * rowBytes + 1 + x * 3 + channel] = value })
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2
  await writeFile(image, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(pixels)), pngChunk('IEND', Buffer.alloc(0))]))
  return { skill, instruction, reference, material, knowledge, image, skillToken, textToken, knowledgeToken, imageOrder: colors.map(color => color.name).join(',') }
}
