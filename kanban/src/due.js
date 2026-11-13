const ZONE = 'Asia/Shanghai'

function parts(date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const bag = Object.fromEntries(fmt.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return {
    key: `${bag.year}-${bag.month}-${bag.day}`,
    month: Number(bag.month),
    day: Number(bag.day),
    hm: `${bag.hour}:${bag.minute}`,
  }
}

function shiftKey(key, days) {
  const [year, month, day] = key.split('-').map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day))
  utc.setUTCDate(utc.getUTCDate() + days)
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const d = String(utc.getUTCDate()).padStart(2, '0')
  return `${utc.getUTCFullYear()}-${m}-${d}`
}

export function duePresentation(dueAt, now, done) {
  if (!dueAt) return { text: '', kind: 'none' }
  const due = new Date(dueAt)
  const dueParts = parts(due)
  const nowParts = parts(now)
  let text
  if (dueParts.key === nowParts.key) text = `今天 ${dueParts.hm} 截止`
  else if (dueParts.key === shiftKey(nowParts.key, -1)) text = `昨天 ${dueParts.hm} 截止`
  else if (dueParts.key > nowParts.key) text = `${dueParts.month}月${dueParts.day}日 截止`
  else text = `${dueParts.month}月${dueParts.day}日 ${dueParts.hm} 截止`
  if (done) return { text, kind: 'done' }
  if (now.getTime() > due.getTime()) return { text, kind: 'overdue' }
  if (dueParts.key === nowParts.key) return { text, kind: 'today' }
  return { text, kind: 'future' }
}
