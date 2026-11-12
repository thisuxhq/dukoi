// Reads cron schedules like '*/15 * * * *': minute, hour, day of month, month, day of week.
// Each part can be *, a number, a range (1-5), a step (*/15 or 0-30/10) or a list (1,15).
// Times are the phone's local time.

const PARTS = [
  ['minute', 0, 59],
  ['hour', 0, 23],
  ['day of month', 1, 31],
  ['month', 1, 12],
  ['day of week', 0, 7],
]

const SHORTCUTS = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
}

export function parse(text) {
  const fields = (SHORTCUTS[text.trim()] ?? text).trim().split(/\s+/)
  if (fields.length !== 5) {
    throw new Error(`"${text}" needs 5 parts: minute, hour, day of month, month and day of week.`)
  }
  const sets = fields.map((field, i) => values(field, PARTS[i], text))
  if (sets[4].has(7)) sets[4].add(0) // 7 is Sunday too
  return { sets, anyDay: fields[2] === '*', anyWeekday: fields[4] === '*' }
}

function values(field, [name, min, max], text) {
  const out = new Set()
  for (const part of field.split(',')) {
    const m = part.match(/^(?:\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/)
    if (!m) throw new Error(`"${part}" in "${text}" isn't a ${name} cron understands.`)
    const star = m[1] === undefined
    const lo = star ? min : Number(m[1])
    const hi = star ? max : m[2] !== undefined ? Number(m[2]) : m[3] ? max : lo
    const step = m[3] ? Number(m[3]) : 1
    if (lo < min || hi > max)
      throw new Error(`The ${name} in "${text}" must be from ${min} to ${max}.`)
    if (lo > hi)
      throw new Error(`"${part}" in "${text}" goes backwards. Write the smaller number first.`)
    if (step < 1) throw new Error(`"${part}" in "${text}" needs a step of 1 or more.`)
    for (let v = lo; v <= hi; v += step) out.add(v)
  }
  return out
}

export function matches({ sets, anyDay, anyWeekday }, date) {
  const [minute, hour, day, month, weekday] = sets
  if (
    !minute.has(date.getMinutes()) ||
    !hour.has(date.getHours()) ||
    !month.has(date.getMonth() + 1)
  ) {
    return false
  }
  // Classic cron: when both day parts are set, either one is enough.
  const dayOk = day.has(date.getDate())
  const weekdayOk = weekday.has(date.getDay())
  return anyDay || anyWeekday ? dayOk && weekdayOk : dayOk || weekdayOk
}

/** The next minute after `from` that the schedule matches, up to a year ahead. */
export function next(schedule, from = new Date()) {
  const date = new Date(from)
  date.setSeconds(0, 0)
  for (let i = 0; i < 366 * 24 * 60; i++) {
    date.setMinutes(date.getMinutes() + 1)
    if (matches(schedule, date)) return date
  }
  return null
}
