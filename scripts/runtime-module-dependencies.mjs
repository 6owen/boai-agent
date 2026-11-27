/*
 * [INPUT]: Resolved workspace value imports, re-exports and literal CommonJS requires.
 * [OUTPUT]: Direct business-module dependencies and source locations for each edge participating in a cycle.
 * [POS]: Business-module ownership check used by check-workspace-boundaries.
 * [PROTOCOL]: Keep scripts/.folder.md and the architecture inventory in sync.
 */
import { sep } from 'node:path'

export function inspectRuntimeModules(graph, modulesRoot) {
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
      if (!reachable.get(next).has(name)) continue
      const { file, line } = imports.get(name).get(next)
      errors.push({ file, message: `line ${line} runtime module cycle edge: ${name} -> ${next}; group: ${group.join(', ')}` })
    }
  }
  return { dependencies, cycleGroups, errors }
}
