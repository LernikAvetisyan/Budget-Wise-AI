const pool = require("../config/db")
const RewardProfile = require("../models/rewardProfileModel")
const RewardDaily = require("../models/rewardDailyModel")

function ymdLocal() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

const BASE_DAILY_TASKS = [
  "ask-ai",
  "what-if",
  "outlook-all",
  "visit-budgets",
  "goal-deposit-manual",
  "visit-dashboard",
  "open-account"
]

const DAILY_BONUS_TASK = "complete-daily"

async function buildPayload(conn, username, todayStr) {
  await RewardProfile.ensure(conn, username)
  await RewardDaily.ensureRow(conn, username, todayStr)
  await RewardDaily.pruneOlderThan7Days(conn)

  const profile = await RewardProfile.get(conn, username)
  const today = await RewardDaily.getDay(conn, username, todayStr)
  const history7 = await RewardDaily.getLast7(conn, username)

  return {
    ok: true,
    profile: {
      username: profile.username,
      overallXp: Number(profile.overall_xp || 0),
      streak: Number(profile.streak || 0),
      lastActiveDate: profile.last_active_date
    },
    today: {
      day: todayStr,
      xpEarned: Number(today.xp_earned || 0),
      eligibleTaskIds: today.eligible_task_ids,
      completedTaskIds: today.completed_task_ids
    },
    history7
  }
}

async function getRewards(req, res) {
  const username = req.user && req.user.username
  if (!username) return res.status(401).json({ ok: false, error: "Not authenticated" })

  const conn = await pool.getConnection()
  try {
    const todayStr = ymdLocal()
    const payload = await buildPayload(conn, username, todayStr)
    res.json(payload)
  } catch (err) {
    console.error("getRewards error:", err)
    res.status(500).json({ ok: false, error: "Server error" })
  } finally {
    conn.release()
  }
}

async function triggerTask(req, res) {
  const username = req.user && req.user.username
  if (!username) return res.status(401).json({ ok: false, error: "Not authenticated" })

  const taskId = String((req.body && req.body.taskId) || "").trim()
  if (!taskId || taskId.length > 64) return res.status(400).json({ ok: false, error: "Invalid taskId" })

  const conn = await pool.getConnection()
  try {
    const todayStr = ymdLocal()
    await conn.beginTransaction()

    await RewardProfile.ensure(conn, username)
    await RewardDaily.ensureRow(conn, username, todayStr)

    await RewardDaily.addEligibleIfNew(conn, username, todayStr, taskId)
    await RewardDaily.pruneOlderThan7Days(conn)

    await conn.commit()

    const payload = await buildPayload(conn, username, todayStr)
    res.json(payload)
  } catch (err) {
    try { await conn.rollback() } catch {}
    console.error("triggerTask error:", err)
    res.status(500).json({ ok: false, error: "Server error" })
  } finally {
    conn.release()
  }
}

async function completeTask(req, res) {
  const username = req.user && req.user.username
  if (!username) return res.status(401).json({ ok: false, error: "Not authenticated" })

  const taskId = String((req.body && req.body.taskId) || "").trim()
  const xpVal = Number((req.body && req.body.xp) ?? NaN)
  const xp = Number.isFinite(xpVal) ? Math.trunc(xpVal) : NaN

  if (!taskId || taskId.length > 64) return res.status(400).json({ ok: false, error: "Invalid taskId" })
  if (!Number.isFinite(xp) || xp <= 0 || xp > 100000) return res.status(400).json({ ok: false, error: "Invalid xp" })

  const conn = await pool.getConnection()
  try {
    const todayStr = ymdLocal()
    await conn.beginTransaction()

    await RewardProfile.ensure(conn, username)
    await RewardDaily.ensureRow(conn, username, todayStr)

    const result = await RewardDaily.claimEligible(conn, username, todayStr, taskId, xp)
    if (result.notEligible) {
      await conn.rollback()
      return res.status(403).json({ ok: false, error: "Task not eligible yet" })
    }

    if (result.awarded > 0) {
      await RewardProfile.applyAwardAndStreak(conn, username, result.awarded, todayStr)
    }

    // Auto-unlock Daily Grand Bonus when all 7 base tasks are completed
    try {
      const todayRow = await RewardDaily.getDay(conn, username, todayStr)
      const completed = Array.isArray(todayRow.completed_task_ids) ? todayRow.completed_task_ids : []
      const allDone = BASE_DAILY_TASKS.every((t) => completed.includes(t))

      if (allDone) {
        await RewardDaily.addEligibleIfNew(conn, username, todayStr, DAILY_BONUS_TASK)
      }
    } catch (e) {
      console.error("bonus unlock check failed:", e)
    }

    await RewardDaily.pruneOlderThan7Days(conn)

    await conn.commit()

    const payload = await buildPayload(conn, username, todayStr)
    payload.awarded = result.awarded
    res.json(payload)
  } catch (err) {
    try { await conn.rollback() } catch {}
    console.error("completeTask error:", err)
    res.status(500).json({ ok: false, error: "Server error" })
  } finally {
    conn.release()
  }
}

module.exports = {
  getRewards,
  triggerTask,
  completeTask
}
