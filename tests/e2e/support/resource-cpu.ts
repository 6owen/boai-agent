/*
 * [INPUT]: Same native process identities and cumulative CPU seconds at two monotonic boundaries.
 * [OUTPUT]: CPU percentage over actual work/idle time between observations; missing/reset identities never become zero.
 * [POS]: Resource evidence arithmetic; excludes only the separately bounded GC/heap observation, not application work between samples.
 * [PROTOCOL]: Update Header and support/.folder.md when changed.
 */
export interface ResourceCpuProcess {
  pid: number
  createdAt: number
  type: string
  name?: string
  cpuSeconds?: number
}
export interface ResourceCpuPoint { capturedAtMs: number; processes: ResourceCpuProcess[] }
const selected = (process: ResourceCpuProcess) => process.type === 'Browser' || process.type === 'Tab' || process.name === 'BoAI Agent Runtime'
const identity = (process: ResourceCpuProcess) => `${process.pid}:${process.createdAt}`

export function resourceCpuWindow(previousObservationEnd: ResourceCpuPoint | undefined, nextObservationStart: ResourceCpuPoint) {
  const processes: (ResourceCpuProcess & { cpuPercent: number })[] = [], errors: string[] = []
  const elapsedMs = previousObservationEnd ? nextObservationStart.capturedAtMs - previousObservationEnd.capturedAtMs : 0
  if (!previousObservationEnd) errors.push('First sample has no preceding CPU boundary')
  else if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) errors.push('CPU window requires increasing monotonic time')
  else {
    const previous = new Map(previousObservationEnd.processes.map(process => [identity(process), process]))
    for (const process of nextObservationStart.processes.filter(selected)) {
      const before = previous.get(identity(process))
      if (!before || before.type !== process.type || before.name !== process.name) { errors.push(`Process identity changed: ${identity(process)}`); continue }
      if (!Number.isFinite(before.cpuSeconds) || !Number.isFinite(process.cpuSeconds) || before.cpuSeconds! < 0 || process.cpuSeconds! < before.cpuSeconds!) {
        errors.push(`Cumulative CPU unavailable or reset: ${identity(process)}`); continue
      }
      processes.push({ ...process, cpuPercent: (process.cpuSeconds! - before.cpuSeconds!) * 100_000 / elapsedMs })
    }
    if (!processes.length) errors.push('CPU window has no observed application processes')
  }
  return { complete: errors.length === 0, startedAtMs: previousObservationEnd?.capturedAtMs ?? null, endedAtMs: nextObservationStart.capturedAtMs, elapsedMs, processes, errors }
}
