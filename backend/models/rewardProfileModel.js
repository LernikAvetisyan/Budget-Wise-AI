const pool = require("../config/db")

async function ensure(conn, username) {
  await conn.query(
    "INSERT INTO reward_profile (username, overall_xp, streak, last_active_date) VALUES (?, 0, 0, NULL) ON DUPLICATE KEY UPDATE username = username",
    [username]
  )
}

async function get(conn, username) {
  const [rows] = await conn.query(
    "SELECT username, overall_xp, streak, last_active_date FROM reward_profile WHERE username = ?",
    [username]
  )
  return rows[0] || null
}

async function applyAwardAndStreak(conn, username, deltaXp, todayStr) {
  const [rows] = await conn.query(
    "SELECT overall_xp, streak, last_active_date FROM reward_profile WHERE username = ? FOR UPDATE",
    [username]
  )

  const current = rows[0] || { overall_xp: 0, streak: 0, last_active_date: null }

  const today = new Date(todayStr + "T00:00:00")
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  let nextStreak = current.streak || 0
  const last = current.last_active_date ? new Date(current.last_active_date) : null

  if (!last) {
    nextStreak = 1
  } else {
    const lastStr = last.toISOString().slice(0, 10)
    const yStr = yesterday.toISOString().slice(0, 10)
    if (lastStr === todayStr) nextStreak = current.streak || 0
    else if (lastStr === yStr) nextStreak = (current.streak || 0) + 1
    else nextStreak = 1
  }

  await conn.query(
    "UPDATE reward_profile SET overall_xp = overall_xp + ?, streak = ?, last_active_date = ? WHERE username = ?",
    [deltaXp, nextStreak, todayStr, username]
  )

  const [out] = await conn.query(
    "SELECT username, overall_xp, streak, last_active_date FROM reward_profile WHERE username = ?",
    [username]
  )
  return out[0] || null
}

module.exports = {
  pool,
  ensure,
  get,
  applyAwardAndStreak
}
