/*
 * [INPUT]: Source-bound structured activity analyses; Alma archived main.txt R-A3 gX/yX/bX/vX/EX and AX grouping (67042–67275).
 * [OUTPUT]: Deterministic thematic clusters with merged named entities and source IDs.
 * [POS]: Pure activity grouping; no continuous-duration estimate or automatic long-term memory promotion.
 * [PROTOCOL]: Update this Header, owning .folder.md and Memory spec 15 when changed.
 */
import type { ActivityAnalysis, ActivityEntities, ActivityTopicCluster } from '../../../shared/domain/desktop-activity'

export const emptyActivityEntities = (): ActivityEntities => ({ prs: [], issues: [], commits: [], people: [], identifiers: [], repos: [], versions: [], events: [], decisions: [], urls: [] })

/** Alma's entity merge keys, with cloned output so persisted analyses remain immutable. */
function mergeEntities(target: ActivityEntities, source: ActivityEntities) {
  for (const kind of ['prs', 'issues', 'commits'] as const) {
    const keys = new Set(target[kind].map(item => `${item.repo ?? ''}#${item.ref ?? item.label}`.toLocaleLowerCase()))
    for (const item of source[kind]) {
      const key = `${item.repo ?? ''}#${item.ref ?? item.label}`.toLocaleLowerCase()
      if (!keys.has(key)) { keys.add(key); target[kind].push({ ...item }) }
    }
  }
  const people = new Set(target.people.map(item => item.handle.toLocaleLowerCase()))
  for (const person of source.people) {
    const key = person.handle.toLocaleLowerCase()
    if (!people.has(key)) { people.add(key); target.people.push({ ...person }) }
  }
  for (const kind of ['identifiers', 'repos', 'versions', 'events', 'decisions', 'urls'] as const) {
    const keys = new Set(target[kind].map(value => value.toLocaleLowerCase()))
    for (const value of source[kind]) {
      const key = value.toLocaleLowerCase()
      if (!keys.has(key)) { keys.add(key); target[kind].push(value) }
    }
  }
}

const host = (url: string) => {
  try {
    const value = new URL(url).host.replace(/^www\./, '')
    return /^(google\.com|bing\.com|duckduckgo\.com)$/i.test(value) ? undefined : value
  } catch { return undefined }
}

function features(item: Pick<ActivityAnalysis, 'project' | 'topics' | 'entities'>) {
  const result = new Set<string>()
  if (item.project) result.add(`proj:${item.project.toLocaleLowerCase()}`)
  for (const topic of item.topics) result.add(`topic:${topic.toLocaleLowerCase()}`)
  for (const repo of item.entities.repos) result.add(`repo:${repo.toLocaleLowerCase()}`)
  for (const identifier of item.entities.identifiers) result.add(`id:${identifier.toLocaleLowerCase()}`)
  for (const pr of item.entities.prs) if (pr.repo) result.add(`repo:${pr.repo.toLocaleLowerCase()}`)
  for (const person of item.entities.people) result.add(`person:${person.handle.toLocaleLowerCase()}`)
  for (const url of item.entities.urls) { const value = host(url); if (value) result.add(`host:${value}`) }
  return result
}

/** Jaccard threshold mirrors Alma R-A3; OCR-only BOAI has no reliable session duration for its misc bucket. */
function similarity(first: Set<string>, second: Set<string>) {
  if (!first.size || !second.size) return 0
  let shared = 0
  for (const feature of first) if (second.has(feature)) shared++
  return shared / (first.size + second.size - shared)
}

export function clusterActivityAnalyses(analyses: ActivityAnalysis[]): ActivityTopicCluster[] {
  const clusters: ActivityTopicCluster[] = []
  const groups: { cluster: ActivityTopicCluster; analyses: ActivityAnalysis[] }[] = []
  for (const analysis of [...analyses].filter(item => item.worth).sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.id.localeCompare(b.id))) {
    let group: (typeof groups)[number] | undefined
    if (analysis.project) group = groups.find(item => item.cluster.key === `proj:${analysis.project!.toLocaleLowerCase()}`)
    else {
      const own = features(analysis)
      let best = 0
      for (const candidate of groups) {
        const overlap = similarity(own, features({ project: candidate.cluster.project, topics: candidate.cluster.topics, entities: candidate.cluster.entities }))
        if (overlap > best) { best = overlap; group = candidate }
      }
      if (best < 0.18) group = undefined
    }
    if (!group) {
      const cluster: ActivityTopicCluster = { key: analysis.project ? `proj:${analysis.project.toLocaleLowerCase()}` : `fragment:${analysis.id}`,
        title: analysis.project || analysis.topics[0] || analysis.title.slice(0, 60) || '未命名主题', project: analysis.project,
        analysisIds: [], sampleIds: [], topics: [], highlights: [], entities: emptyActivityEntities() }
      group = { cluster, analyses: [] }; groups.push(group); clusters.push(cluster)
    }
    group.analyses.push(analysis)
    group.cluster.analysisIds.push(analysis.id)
    for (const id of analysis.sampleIds) if (!group.cluster.sampleIds.includes(id)) group.cluster.sampleIds.push(id)
    for (const topic of analysis.topics) if (!group.cluster.topics.includes(topic)) group.cluster.topics.push(topic)
    for (const highlight of analysis.highlights) if (!group.cluster.highlights.includes(highlight)) group.cluster.highlights.push(highlight)
    mergeEntities(group.cluster.entities, analysis.entities)
  }
  return clusters
}
