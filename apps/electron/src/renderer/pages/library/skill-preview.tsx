/*
 * [INPUT]: 固定扫描计划/候选身份和正文/文件 IPC。
 * [OUTPUT]: 安装/更新前的实际包正文和受限文件阅读。
 * [POS]: Skills 安装预览中的内容面板。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { useEffect, useState } from 'react'
import type { DesktopApi } from '@boai/shared/ipc'
import type { SkillPreview as Preview, SkillFileContent } from '@boai/shared/domain/skills'
import { Banner, errorText, Loading } from '@/components/common'
import { Button } from '@/components/ui/button'
import { SkillMarkdown } from './skill-markdown'

export function SkillPreview({ api, scanId, candidateId }: { api: DesktopApi; scanId: string; candidateId: string }) {
  const [preview, setPreview] = useState<Preview | null>(null), [error, setError] = useState('')
  const [path, setPath] = useState(''), [file, setFile] = useState<SkillFileContent | null>(null), [fileError, setFileError] = useState('')
  useEffect(() => {
    let alive = true
    setPreview(null); setPath(''); setError('')
    api.request('getSkillPreview', { scanId, candidateId }).then(value => { if (alive) setPreview(value) }, error => { if (alive) setError(errorText(error)) })
    return () => { alive = false }
  }, [api, scanId, candidateId])
  useEffect(() => {
    let alive = true
    setFile(null); setFileError('')
    if (path) api.request('readSkillPreviewFile', { scanId, candidateId, path }).then(value => { if (alive) setFile(value) }, error => { if (alive) setFileError(errorText(error)) })
    return () => { alive = false }
  }, [api, scanId, candidateId, path])
  return <div className="skill-package-preview" aria-label="安装前内容预览">{(error || fileError) && <Banner>{error || fileError}</Banner>}{!preview && !error && <Loading />}{preview && <><SkillMarkdown content={preview.content} /><h4>包内文件</h4><div className="skill-file-list">{preview.files.map(file => <Button key={file.path} variant="ghost" size="sm" className="skill-file-row" onClick={() => setPath(file.path)}>{file.path}</Button>)}</div>{file && (file.binary ? <p>二进制文件 · {file.size} 字节</p> : <pre className="skill-file-preview">{file.content}</pre>)}</>}</div>
}
