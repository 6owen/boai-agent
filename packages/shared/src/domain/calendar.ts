/*
 * [INPUT]: Host dates, ISO calendar days, or explicit time zones and epoch milliseconds.
 * [OUTPUT]: Local dates, calendar-day arithmetic, timezone validation and stable minute keys for schedule identities.
 * [POS]: Portable calendar rules shared by storage, scheduler and renderer.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
export function localCalendarDate(input: Date | number | string) {
  const date = input instanceof Date ? input : new Date(input)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function shiftCalendarDate(day: string, offset: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10)
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone })
    return true
  } catch {
    return false
  }
}

/** The space separator is part of persisted schedule identities. Scope a formatter to its query. */
export function createZonedMinuteFormatter(timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  return (at: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(at).map(part => [part.type, part.value]))
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
  }
}
