/*
 * [INPUT]: Resolved workspace value imports and recorded runtime module cycle edges.
 * [OUTPUT]: Direct module dependencies, strongly connected groups and changes to their recorded edges.
 * [POS]: Business-module ownership check used by check-workspace-boundaries.
 * [PROTOCOL]: Keep scripts/.folder.md and the architecture inventory in sync.
 */
import { sep } from 'node:path'

export function inspectRuntimeModules(graph, modulesRoot, recorded) {
  const prefix = modulesRoot + sep
  const owner = path => {
    if (!path.startsWith(prefix)) return undefined
    const end = path.indexOf(sep, prefix.length)
    return end > prefix.length ? path.slice(prefix.length, end) : undefined
  }
  const imports = new Map()
  for (const [file, edges] of graph) {
    const from = owner(file)
    if (!from) continue
    if (!imports.has(from)) imports.set(from, new Map())
    for (const edge of edges) {
      const to = owner(edge.target)
      if (!to || from === to || !graph.has(edge.target) || !(edge.staticImport || edge.kind === 'require')) continue
      if (!imports.get(from).has(to)) imports.get(from).set(to, { file, line: edge.line })
    }
  }

  const dependencies = Object.fromEntries([...imports.keys()].sort().map(name => [name, [...imports.get(name).keys()].sort()]))
  const reachable = new Map()
  for (const name of Object.keys(dependencies)) {
    const seen = new Set([name])
    for (const member of seen) for (const next of dependencies[member]) seen.add(next)
    reachable.set(name, seen)
  }

  const cycleGroups = [], errors = []
  for (const [name, closure] of reachable) {
    const group = [...closure].filter(other => reachable.get(other).has(name)).sort()
    if (group.length > 1 && group[0] === name) cycleGroups.push(group)
    for (const next of dependencies[name]) {
      if (!reachable.get(next).has(name) || recorded[name]?.includes(next)) continue
      const { file, line } = imports.get(name).get(next)
      errors.push({ file, message: `line ${line} unrecorded runtime module cycle edge: ${name} -> ${next}; group: ${group.join(', ')}` })
    }
  }
  for (const [from, names] of Object.entries(recorded)) {
    for (const to of names) {
      if (!(imports.get(from)?.has(to) && reachable.get(to)?.has(from))) {
        errors.push({ message: `remove retired runtime module cycle edge: ${from} -> ${to}` })
      }
    }
  }
  return { dependencies, cycleGroups, errors }
}
