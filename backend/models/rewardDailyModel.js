const pool = require("../config/db")

async function ensureRow(conn, username, dayStr) {
  await conn.query(
    "INSERT INTO rewards_daily (username, day, xp_earned, eligible_task_ids, completed_task_ids) VALUES (?, ?, 0, JSON_ARRAY(), JSON_ARRAY()) ON DUPLICATE KEY UPDATE username = username",
    [username, dayStr]
  )
}

async function getDay(conn, username, dayStr) {
  const [rows] = await conn.query(
    "SELECT day, xp_earned, eligible_task_ids, completed_task_ids FROM rewards_daily WHERE username = ? AND day = ?",
    [username, dayStr]
  )

  if (!rows[0]) return { day: dayStr, xp_earned: 0, eligible_task_ids: [], completed_task_ids: [] }

  const r = rows[0]

  let eligible = []
  let completed = []
  try { eligible = typeof r.eligible_task_ids === "string" ? JSON.parse(r.eligible_task_ids) : r.eligible_task_ids } catch {}
  try { completed = typeof r.completed_task_ids === "string" ? JSON.parse(r.completed_task_ids) : r.completed_task_ids } catch {}

  return {
    day: r.day,
    xp_earned: Number(r.xp_earned || 0),
    eligible_task_ids: Array.isArray(eligible) ? eligible : [],
    completed_task_ids: Array.isArray(completed) ? completed : []
  }
}

async function getLast7(conn, username) {
  const [rows] = await conn.query(
    "SELECT day, xp_earned FROM rewards_daily WHERE username = ? AND day >= (CURDATE() - INTERVAL 6 DAY) ORDER BY day ASC",
    [username]
  )
  return rows.map(r => ({ day: r.day, xp: Number(r.xp_earned || 0) }))
}

async function pruneOlderThan7Days(conn) {
  await conn.query("DELETE FROM rewards_daily WHERE day < (CURDATE() - INTERVAL 7 DAY)")
}

async function isCompleted(conn, username, dayStr, taskId) {
  const [rows] = await conn.query(
    "SELECT 1 FROM rewards_daily WHERE username = ? AND day = ? AND JSON_CONTAINS(completed_task_ids, JSON_QUOTE(?), '$') LIMIT 1",
    [username, dayStr, taskId]
  )
  return !!rows.length
}

async function isEligible(conn, username, dayStr, taskId) {
  const [rows] = await conn.query(
    "SELECT 1 FROM rewards_daily WHERE username = ? AND day = ? AND JSON_CONTAINS(eligible_task_ids, JSON_QUOTE(?), '$') LIMIT 1",
    [username, dayStr, taskId]
  )
  return !!rows.length
}

async function addEligibleIfNew(conn, username, dayStr, taskId) {
  const done = await isCompleted(conn, username, dayStr, taskId)
  if (done) return { changed: false }

  const eligible = await isEligible(conn, username, dayStr, taskId)
  if (eligible) return { changed: false }

  await conn.query(
    "UPDATE rewards_daily SET eligible_task_ids = JSON_ARRAY_APPEND(eligible_task_ids, '$', ?) WHERE username = ? AND day = ?",
    [taskId, username, dayStr]
  )
  return { changed: true }
}

async function claimEligible(conn, username, dayStr, taskId, xp) {
  const done = await isCompleted(conn, username, dayStr, taskId)
  if (done) return { awarded: 0 }

  const eligible = await isEligible(conn, username, dayStr, taskId)
  if (!eligible) return { awarded: 0, notEligible: true }

  await conn.query(
    "UPDATE rewards_daily SET " +
      "eligible_task_ids = JSON_REMOVE(eligible_task_ids, JSON_UNQUOTE(JSON_SEARCH(eligible_task_ids, 'one', ?))), " +
      "completed_task_ids = JSON_ARRAY_APPEND(completed_task_ids, '$', ?), " +
      "xp_earned = xp_earned + ? " +
    "WHERE username = ? AND day = ?",
    [taskId, taskId, xp, username, dayStr]
  )

  return { awarded: xp }
}

module.exports = {
  pool,
  ensureRow,
  getDay,
  getLast7,
  pruneOlderThan7Days,
  addEligibleIfNew,
  claimEligible
}
