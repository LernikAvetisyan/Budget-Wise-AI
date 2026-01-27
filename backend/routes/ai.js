// backend/routes/ai.js
// Purpose: Central AI endpoints for the website (DB-backed, no localStorage)
//
// Endpoints
// - POST /api/ai/whatif: Goal what-if narrative (Goals "Analyze Scenarios")
// - GET  /api/ai/assistant/today: Fetch today's stored Assistant.exe message (LA date)
// - POST /api/ai/assistant/today: Generate today's Assistant.exe message (if missing or force) and store in MySQL
// - POST /api/ai/outlook/*: Terminal-ready Outlook analysis endpoints

const express = require("express")
const OpenAI = require("openai")

const pool = require("../config/db")
const auth = require("../controllers/authController")
const DailyAiSummary = require("../models/dailyAiSummary")

const router = express.Router()
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

/* =========================================
   1) Shared helpers
   Purpose: Formatting, LA-time utilities, and shared AI text assembly
========================================= */

const LA_TZ = "America/Los_Angeles"

const fmtMoney = (n, sym) => {
  const v = Number(n || 0)
  return `${sym}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/*
  Outlook AI formatting
  Purpose: Keep terminal output clean plain text with readable symbols (no markdown noise)
*/
const sanitizeOutlookText = (raw) => {
  let t = String(raw || "").replace(/\r/g, "").trim()
  if (!t) return ""

  t = t.replace(/\*\*(.*?)\*\*/g, "$1")
  t = t.replace(/__(.*?)__/g, "$1")
  t = t.replace(/`+/g, "")
  t = t.replace(/^#{1,6}\s*/gm, "")

  t = t.replace(/^\s*[-*]\s+/gm, "• ")
  t = t.replace(/^\s*\d+\.\s+/gm, "• ")

  t = t.replace(/\n{3,}/g, "\n\n")

  return t.trim()
}

function laParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: LA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23"
  })
  const parts = fmt.formatToParts(now)
  const get = (t) => parts.find((p) => p.type === t)?.value || ""
  let hh = get("hour")
  if (hh === "24") hh = "00"
  return {
    y: get("year"),
    mo: get("month"),
    d: get("day"),
    hh,
    mm: get("minute"),
    ss: get("second")
  }
}

function laTimestampPT(now = new Date()) {
  const p = laParts(now)
  return `${p.y}-${p.mo}-${p.d} ${p.hh}:${p.mm}:${p.ss} PT`
}

function laDayString(now = new Date()) {
  const p = laParts(now)
  return `${p.y}-${p.mo}-${p.d}`
}


function addDaysToKey(dayKey, deltaDays) {
  const [y, m, d] = String(dayKey).split("-").map((x) => Number(x))
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + Number(deltaDays || 0))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(dt.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

function laWeekdayShort(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: LA_TZ, weekday: "short" })
  return fmt.format(now)
}

/*
  LA midnight scheduler math
  Purpose: Return ms until next LA midnight without hardcoding -08/-07
*/
function msUntilNextLAMidnight(now = new Date()) {
  const todayKey = laDayString(now)
  const tomorrowKey = addDaysToKey(todayKey, 1)
  const [ty, tm, td] = tomorrowKey.split("-").map((x) => Number(x))

  let guess = new Date(Date.UTC(ty, tm - 1, td, 8, 0, 0, 0))

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: LA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  })

  for (let i = 0; i < 10; i++) {
    const parts = fmt.formatToParts(guess)
    const get = (t) => parts.find((p) => p.type === t)?.value || ""

    const gy = Number(get("year"))
    const gmo = Number(get("month"))
    const gd = Number(get("day"))
    const gh = Number(get("hour"))
    const gmin = Number(get("minute"))
    const gsec = Number(get("second"))

    if (gy === ty && gmo === tm && gd === td && gh === 0 && gmin === 0 && gsec === 0) break

    let errSec = 0

    if (gy !== ty || gmo !== tm || gd !== td) {
      const dateGuessKey = `${gy}-${String(gmo).padStart(2, "0")}-${String(gd).padStart(2, "0")}`
      if (dateGuessKey < tomorrowKey) errSec += 6 * 3600
      else errSec -= 6 * 3600
    } else {
      errSec += gh * 3600 + gmin * 60 + gsec
      errSec = -errSec
    }

    guess = new Date(guess.getTime() + errSec * 1000)
  }

  const ms = guess.getTime() - now.getTime()
  return Math.max(1000, ms)
}

function buildTerminalStatusBlock(status, pressureLine, criticalLine) {
  const st = status || "STABLE"
  const pressure = pressureLine || "Budget utilization within safe range"
  const critical = criticalLine || "No critical alerts detected"

  return [
    `Financial status: ${st}`,
    ``,
    pressure,
    ``,
    critical,
    ``,
    `Monitoring active`
  ].join("\n")
}

function computeStatusLines(snapshot) {
  const budgetUtil = Number(snapshot?.budgetUtilization || 0)
  const budgetTotal = Number(snapshot?.budgetTotal || 0)
  const missedDeposits = Number(snapshot?.missedDeposits || 0)
  const activeAlerts = Number(snapshot?.activeAlerts || 0)

  const pressure =
    budgetTotal <= 0
      ? "Budget utilization unavailable"
      : budgetUtil >= 1
        ? "Budget limit exceeded"
        : budgetUtil >= 0.9
          ? "Budget utilization elevated"
          : budgetUtil >= 0.75
            ? "Budget utilization rising"
            : "Budget utilization within safe range"

  const criticalLine =
    activeAlerts > 0 || (budgetTotal > 0 && budgetUtil >= 1)
      ? "Critical conditions detected"
      : "No critical alerts detected"

  const st =
    activeAlerts > 0 || (budgetTotal > 0 && budgetUtil >= 1)
      ? "RISK"
      : ((budgetTotal > 0 && budgetUtil >= 0.75) || missedDeposits > 0)
        ? "WATCH"
        : "STABLE"

  return { st, pressure, criticalLine }
}

async function generateAssistantTextFromSnapshot(snapshot) {
  const symbol = String(snapshot?.currencySymbol || "$")
  const budgetUtil = Number(snapshot?.budgetUtilization || 0)
  const budgetTotal = Number(snapshot?.budgetTotal || 0)
  const budgetSpent = Number(snapshot?.budgetSpent || 0)
  const daysRemaining = Number(snapshot?.daysRemaining || 0)

  const weeklyIncome = Number(snapshot?.weeklyIncome || 0)
  const weeklySpent = Number(snapshot?.weeklySpent || 0)
  const weeklyNet = Number(snapshot?.weeklyNet || (weeklyIncome - weeklySpent))

  const completedGoals = Number(snapshot?.completedGoals || 0)
  const missedDeposits = Number(snapshot?.missedDeposits || 0)
  const activeAlerts = Number(snapshot?.activeAlerts || 0)

  const { st, pressure, criticalLine } = computeStatusLines({
    budgetUtilization: budgetUtil,
    budgetTotal,
    missedDeposits,
    activeAlerts
  })

  const system =
    "You are Assistant.exe, a professional financial analysis narrator for a budgeting website. " +
    "Do not restate alert rules or thresholds. " +
    "Do not use markdown. Do not use **. " +
    "Do not use these phrases: Budget Alert, Over Budget, Successful Month, Missed Deposit alert. " +
    "Write 2 to 3 short paragraphs with practical interpretation and calm, professional tone. " +
    "Optionally use small icons like 📌 ⚠️ ✅ where appropriate. " +
    "Do not output a terminal status block. The system will append it."

  const user = [
    "Snapshot:",
    `Currency: ${symbol}`,
    `Budget total: ${fmtMoney(budgetTotal, symbol)}`,
    `Budget spent: ${fmtMoney(budgetSpent, symbol)}`,
    `Budget utilization ratio: ${Number.isFinite(budgetUtil) ? budgetUtil.toFixed(4) : "0.0000"}`,
    `Days remaining in month: ${Number.isFinite(daysRemaining) ? String(daysRemaining) : "0"}`,
    `Weekly income (Mon–Sun): ${fmtMoney(weeklyIncome, symbol)}`,
    `Weekly spending (Mon–Sun): ${fmtMoney(weeklySpent, symbol)}`,
    `Weekly net (Mon–Sun): ${fmtMoney(weeklyNet, symbol)}`,
    `Completed goals count: ${Number.isFinite(completedGoals) ? String(completedGoals) : "0"}`,
    `Missed deposits count: ${Number.isFinite(missedDeposits) ? String(missedDeposits) : "0"}`,
    `Active critical signals count: ${Number.isFinite(activeAlerts) ? String(activeAlerts) : "0"}`
  ].join("\n")

  const resp = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.4,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  })

  let narrative = String(resp.choices?.[0]?.message?.content || "").trim()
  narrative = sanitizeOutlookText(narrative)

  const block = buildTerminalStatusBlock(st, pressure, criticalLine)

  let finalText = narrative || "Status analysis unavailable at this time."
  finalText = `${finalText}\n\n${block}`.replace(/\s+$/g, "")

  return { status: st, text: finalText }
}

/* =========================================
   2) Auth
   Purpose: Protect all AI endpoints
========================================= */

router.use(auth.verifyToken)

/* =========================================
   3) POST /whatif
   Purpose: Goal scenario narration (Goals "Analyze Scenarios")
========================================= */

const flattenWhatIfPayload = (p = {}) => {
  const goal = p.goal || {}
  const scen = p.scenario || {}
  return {
    goalName: goal.name,
    targetPrice: goal.targetPrice,
    fundedSoFar: goal.fundedSoFar,
    remaining: p.remaining ?? goal.amountRemaining,
    monthlyDeposit: goal.monthlyDeposit,
    finalPayment: goal.finalPayment,
    depositsRemaining: goal.depositsRemaining,
    originalETA: goal.originalETA,
    newETA: scen.newETA,
    surplus: scen.surplus,
    currencySymbol: p.currencySymbol || goal.currencySymbol || "$"
  }
}

router.post("/whatif", async (req, res) => {
  try {
    const d = flattenWhatIfPayload(req.body || {})
    const symbol = d.currencySymbol || "$"

    const target = Number(d.targetPrice || 0)
    const funded = Number(d.fundedSoFar || 0)

    const baseRemaining = Math.max(0, Number(d.remaining != null ? d.remaining : target - funded))
    const monthly = Math.max(0, Number(d.monthlyDeposit || 0))
    const surplus = Math.max(0, Number(d.surplus || 0))
    const depositsRemainingRaw = Number.isFinite(d.depositsRemaining) ? Number(d.depositsRemaining) : null

    const ceilDiv = (a, b) => (b > 0 ? Math.ceil(a / b) : 0)

    const remainingAfterSurplus = Math.max(0, baseRemaining - surplus)

    const baselineMonths =
      depositsRemainingRaw != null
        ? Math.max(0, depositsRemainingRaw)
        : (monthly > 0 ? ceilDiv(baseRemaining, monthly) : 0)

    const monthsNeededAfter = monthly > 0 ? ceilDiv(remainingAfterSurplus, monthly) : 0
    const monthsSaved = Math.max(0, baselineMonths - monthsNeededAfter)
    const fullyFundedNow = (remainingAfterSurplus === 0) && baselineMonths > 0

    let nudge = null
    if (!fullyFundedNow && monthly > 0 && monthsNeededAfter > 0 && monthsNeededAfter <= 6) {
      const rem = remainingAfterSurplus % monthly
      if (rem > 0) nudge = monthly - rem
    }

    const scenarioHints = []
    if (baseRemaining <= 0) {
      scenarioHints.push("Scenario: Fully funded already. Congratulate and suggest next steps.")
    } else if (surplus <= 0) {
      scenarioHints.push("Scenario: Initial state. Invite the user to create a surplus and analyze again.")
    } else if (fullyFundedNow) {
      scenarioHints.push("Scenario: Goal can be completed immediately. Celebrate and encourage action today.")
    } else if (monthsSaved === 0) {
      scenarioHints.push("Scenario: Small boost. Encourage; no full month skipped yet.")
    } else if (monthsSaved >= 1) {
      scenarioHints.push("Scenario: Major milestone. Celebrate and state exact months saved.")
    }
    if (nudge && nudge > 0) {
      scenarioHints.push("Scenario: Nudge. Show the exact extra needed to save another full month (near-term only).")
    }

    const system =
      "You are a warm, encouraging personal-finance coach. " +
      "Keep it concise: 2 short paragraphs plus 2 to 3 tiny bullets. " +
      "Always weave these numbers naturally: Target price, Funded so far, Remaining, Adjustable surplus, Monthly deposit (if > 0). " +
      "If surplus fully funds the goal, clearly say it can be completed now. " +
      "If months are saved, insert the token <<HIGHLIGHT_MONTHS>> where the number of months saved should appear. " +
      "If there is a near-miss nudge, state the exact extra needed to save another month."

    const keyLines = [
      `Goal: ${d.goalName || "your goal"}`,
      `Target price: ${fmtMoney(target, symbol)}`,
      `Funded so far: ${fmtMoney(funded, symbol)}`,
      `Remaining: ${fmtMoney(baseRemaining, symbol)}`,
      monthly > 0 ? `Monthly deposit: ${fmtMoney(monthly, symbol)}` : null,
      `Adjustable surplus: ${fmtMoney(surplus, symbol)}`,
      d.originalETA ? `Original ETA: ${String(d.originalETA)}` : null,
      d.newETA ? `New ETA (what-if): ${String(d.newETA)}` : null,
      monthsSaved > 0 ? `Months saved: ${monthsSaved}` : null,
      (nudge && nudge > 0) ? `Extra needed for next month: ${fmtMoney(nudge, symbol)}` : null
    ].filter(Boolean).join("\n")

    const user =
      `Here are the inputs:\n\n${keyLines}\n\n` +
      `Rules:\n` +
      `- If surplus >= Remaining, say the goal can be completed now and how many months are saved (use <<HIGHLIGHT_MONTHS>>).\n` +
      `- If monthsSaved >= 1, celebrate and clearly state the saved time (use <<HIGHLIGHT_MONTHS>>).\n` +
      `- If close to the next month and near-term, show the exact extra (the nudge).\n` +
      `- Finish with 2 to 3 very short tips.\n` +
      scenarioHints.map(s => `- ${s}`).join("\n")

    const resp = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.6,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })

    let message = String(resp.choices?.[0]?.message?.content || "").trim()

    if (monthsSaved > 0) {
      const green = `<span style="color:#16a34a;font-weight:600">${monthsSaved}</span>`
      message = message.replaceAll("<<HIGHLIGHT_MONTHS>>", green)
    } else {
      message = message.replaceAll("<<HIGHLIGHT_MONTHS>>", "")
    }

    message = message
      .replace(/\bmonths\s+months\b/gi, "months")
      .replace(/\bmonth\s+month\b/gi, "month")
      .replace(/\b1\s+months\b/gi, "1 month")

    if (message) {
      message = message
        .replace(/^Congratulations\b/i, "🎉 Congratulations")
        .replace(/\bgoals?\b/gi, m => (m.toLowerCase() === "goal" ? "🎯 goal" : "🎯 goals"))
        .replace(/\bETA\b/g, "🗓️ ETA")
        .replace(/\bmonthly\b/gi, "📆 monthly")
        .replace(/\bsurplus\b/gi, "💰 surplus")
    }

    if (fullyFundedNow && !/complete|today|right now/i.test(message)) {
      message += `<br><br>✅ With your current surplus, you can <strong>finish this goal today</strong> and skip the remaining schedule.`
    }

    return res.json({ message })
  } catch (e) {
    console.error("[ai/whatif] error:", e)
    return res.status(500).json({ message: "", error: String(e) })
  }
})

/* =========================================
   4) GET /assistant/today
   Purpose: Read today's stored Assistant.exe message from MySQL (LA day)
========================================= */

router.get("/assistant/today", async (req, res) => {
  try {
    const username = req.user.username
    const today = laDayString()

    const row = await DailyAiSummary.getLatestByUser(username)
    if (!row) return res.json({ exists: false })

    if (String(row.day) !== String(today)) return res.json({ exists: false })

    return res.json({
      exists: true,
      day: row.day,
      status: row.status,
      message: row.message,
      snapshot: row.snapshotJson || null,
      updatedAt: row.updatedAt
    })
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Failed to load daily assistant summary" })
  }
})

/* =========================================
   5) POST /assistant/today
   Purpose: Generate (if missing or forced) and store today's Assistant.exe message
   Input: { force: boolean, snapshot: {...} }
========================================= */

router.post("/assistant/today", async (req, res) => {
  try {
    if (!req.user || !req.user.username) {
      return res.status(401).json({ message: "", error: "Unauthorized" })
    }

    const username = req.user.username
    const today = laDayString()

    const force = !!(req.body && req.body.force)
    const snapshot = (req.body && req.body.snapshot) ? req.body.snapshot : null

    if (!force) {
      const existing = await DailyAiSummary.getLatestByUser(username)
      if (existing && String(existing.day || "") === today && String(existing.message || "").trim()) {
        return res.json({
          exists: true,
          isToday: true,
          day: existing.day,
          status: existing.status,
          message: existing.message,
          updatedAt: existing.updatedAt
        })
      }
    }

    if (!snapshot || typeof snapshot !== "object") {
      return res.status(400).json({ message: "", error: "Missing snapshot" })
    }

    const gen = await generateAssistantTextFromSnapshot(snapshot)
    const saved = await DailyAiSummary.upsertLatest(username, today, gen.status, gen.text, snapshot)

    return res.json({
      exists: true,
      isToday: true,
      day: saved.day,
      status: saved.status,
      message: saved.message,
      updatedAt: saved.updatedAt
    })
  } catch (e) {
    console.error("[ai/assistant/today POST] error:", e)
    return res.status(500).json({ message: "", error: String(e) })
  }
})

/* =========================================
   6) Server-side LA-midnight Assistant.exe job
   Purpose: Refresh all users daily at LA midnight and catch up on server start
========================================= */

async function listAllUsernames() {
  const [rows] = await pool.query(`SELECT username FROM user`)
  return (rows || []).map((r) => String(r.username)).filter(Boolean)
}

async function computeAssistantSnapshotForUser(username) {
  const now = new Date()
  const p = laParts(now)
  const year = Number(p.y)
  const month = Number(p.mo)
  const todayKey = `${p.y}-${p.mo}-${p.d}`

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const dayOfMonth = Number(p.d)
  const daysRemaining = Math.max(0, daysInMonth - dayOfMonth)

  const [bRows] = await pool.query(
    `
    SELECT
      COALESCE(SUM(CASE WHEN enabled = 1 THEN monthly_limit ELSE 0 END), 0) AS totalBudget,
      COALESCE(SUM(CASE WHEN enabled = 1 THEN spent_amount ELSE 0 END), 0) AS budgetSpent
    FROM budget_month_category
    WHERE username = ? AND year = ? AND month = ?
    `,
    [username, year, month]
  )

  const totalBudget = Number(bRows?.[0]?.totalBudget || 0)
  const budgetSpent = Number(bRows?.[0]?.budgetSpent || 0)
  const utilization = totalBudget > 0 ? budgetSpent / totalBudget : 0

  const wd = laWeekdayShort(now)
  const map = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
  const offset = map[wd] != null ? map[wd] : 0

  const weekStart = addDaysToKey(todayKey, -offset)
  const weekEnd = addDaysToKey(weekStart, 6)

  const [wRows] = await pool.query(
    `
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expenses
    FROM transactions
    WHERE username = ? AND date >= ? AND date <= ?
    `,
    [username, weekStart, weekEnd]
  )

  const weeklyIncome = Number(wRows?.[0]?.income || 0)
  const weeklySpent = Number(wRows?.[0]?.expenses || 0)
  const weeklyNet = weeklyIncome - weeklySpent

  const monthStart = `${p.y}-${p.mo}-01`
  const monthEnd = todayKey

  const [missRows] = await pool.query(
    `
    SELECT COALESCE(COUNT(*), 0) AS missed
    FROM goal_deposit gd
    JOIN goal g ON g.id = gd.goal_id
    JOIN goal_section gs ON gs.id = g.section_id
    WHERE gs.username = ?
      AND gd.status = 'missed'
      AND gd.date >= ?
      AND gd.date <= ?
    `,
    [username, monthStart, monthEnd]
  )

  const missedDeposits = Number(missRows?.[0]?.missed || 0)

  const [setRows] = await pool.query(
    `
    SELECT notify_over_budget, notify_missed_deposit
    FROM settings_notification
    WHERE username = ?
    LIMIT 1
    `,
    [username]
  )

  const notifyOverBudget = Number(setRows?.[0]?.notify_over_budget || 0) === 1
  const notifyMissedDeposit = Number(setRows?.[0]?.notify_missed_deposit || 0) === 1

  let activeAlerts = 0
  if (notifyOverBudget && totalBudget > 0 && utilization >= 1) activeAlerts += 1
  if (notifyMissedDeposit && missedDeposits > 0) activeAlerts += 1

  return {
    budgetUtilization: utilization,
    budgetTotal: totalBudget,
    budgetSpent,
    daysRemaining,
    weeklyIncome,
    weeklySpent,
    weeklyNet,
    completedGoals: 0,
    missedDeposits,
    activeAlerts,
    currencySymbol: "$"
  }
}

async function generateAndStoreDailyAssistant(username) {
  const today = laDayString()
  const snapshot = await computeAssistantSnapshotForUser(username)

  const gen = await generateAssistantTextFromSnapshot(snapshot)
  await DailyAiSummary.upsertLatest(username, today, gen.status, gen.text, snapshot)
}

async function runDailyAssistantForAllUsersIfStale() {
  const today = laDayString()
  const users = await listAllUsernames()

  for (const u of users) {
    const row = await DailyAiSummary.getLatestByUser(u)
    if (row && String(row.day) === String(today)) continue
    await generateAndStoreDailyAssistant(u)
  }
}

function startDailyAssistantMidnightJob() {
  if (global.__dailyAssistantMidnightJobStarted) return
  global.__dailyAssistantMidnightJobStarted = true

  const enabled = String(process.env.DAILY_AI_JOB_ENABLED || "1") !== "0"
  if (!enabled) return

  runDailyAssistantForAllUsersIfStale().catch(() => {})

  const scheduleNext = () => {
    const delay = msUntilNextLAMidnight(new Date())
    setTimeout(async () => {
      try {
        await runDailyAssistantForAllUsersIfStale()
      } catch (_) {}
      scheduleNext()
    }, delay)
  }

  scheduleNext()
}

startDailyAssistantMidnightJob()

/* =========================================
   7) OUTLOOK: ACTIVITY ANALYSIS (AI)
   POST /api/ai/outlook/activity
========================================= */

router.post("/outlook/activity", async (req, res) => {
  try {
    const { year, rangeStart, rangeEnd, summary } = req.body || {}

    const y = Number(year)
    if (!Number.isFinite(y)) return res.status(400).json({ error: "Missing or invalid year." })

    const s = summary && typeof summary === "object" ? summary : null
    if (!s) return res.status(400).json({ error: "Missing summary payload." })

    const money = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n || 0))

    const topIncome = Array.isArray(s.topIncome) ? s.topIncome.slice(0, 3) : []
    const topExpense = Array.isArray(s.topExpense) ? s.topExpense.slice(0, 3) : []

    const months = Array.isArray(s.months) ? s.months : []
    let maxExpenseMonth = null
    let maxExpenseVal = -1
    for (const m of months) {
      const exp = Number(m?.expenses || 0)
      if (exp > maxExpenseVal) {
        maxExpenseVal = exp
        maxExpenseMonth = m?.label || null
      }
    }

    const sys = [
      "You are AI Analyst BETA for a budgeting website.",
      "Write plain text for a terminal window, no markdown, no bullets that rely on special formatting.",
      "Be specific and data-driven. Mention the year and date range explicitly.",
      "Keep it concise, about 8 to 12 lines.",
      "Include 2 actionable recommendations based on the data.",
      "Do not invent numbers. Only use the provided stats."
    ].join("\n")

    const user = [
      `Context: Activity yearly overview analysis`,
      `Year: ${y}`,
      `Date range: ${String(rangeStart || "")} to ${String(rangeEnd || "")}`,
      ``,
      `Totals:`,
      `- Income: ${money(s.income)}`,
      `- Expenses: ${money(s.expenses)}`,
      `- Net: ${money(s.net)}`,
      `- Transactions: ${Number(s.txCount || 0)} (income ${Number(s.incomeCount || 0)}, expense ${Number(s.expenseCount || 0)})`,
      ``,
      `Top income categories: ${topIncome.map(x => `${x.name} ${money(x.amount)}`).join(", ") || "N/A"}`,
      `Top expense categories: ${topExpense.map(x => `${x.name} ${money(x.amount)}`).join(", ") || "N/A"}`,
      `Highest expense month: ${maxExpenseMonth ? `${maxExpenseMonth} ${money(maxExpenseVal)}` : "N/A"}`
    ].join("\n")

    const r = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user }
      ]
    })

    const text = sanitizeOutlookText(String(r?.choices?.[0]?.message?.content || ""))
    return res.json({ text })
  } catch (err) {
    console.error("AI outlook/activity failed:", err)
    return res.status(500).json({ error: "AI generation failed." })
  }
})

/* =========================================
   8) OUTLOOK: BUDGETS ANALYSIS (AI)
   POST /api/ai/outlook/budgets
========================================= */

router.post("/outlook/budgets", async (req, res) => {
  try {
    const { year, range, totals, topCategories, monthly, currentGoal, goalByMonth } = req.body || {}
    const startISO = range && range.startISO ? String(range.startISO) : "unknown"
    const endISO = range && range.endISO ? String(range.endISO) : "unknown"
    const y = Number(year)

    if (!Number.isFinite(y)) return res.status(400).json({ error: "Missing or invalid year." })

    const gbm = Array.isArray(goalByMonth) ? goalByMonth : []

    const monthsWithLimit = gbm.filter(m => Number(m?.limit || 0) > 0)
    const metMonths = monthsWithLimit.filter(m => m.met === true)
    const missMonths = monthsWithLimit.filter(m => m.met === false)

    const totalSaved = metMonths.reduce((s, m) => s + Math.max(0, Number(m.saved || 0)), 0)
    const totalOver = missMonths.reduce((s, m) => s + Math.max(0, Number(m.over || 0)), 0)

    const best = metMonths.slice().sort((a, b) => Number(b.saved || 0) - Number(a.saved || 0))[0] || null
    const worst = missMonths.slice().sort((a, b) => Number(b.over || 0) - Number(a.over || 0))[0] || null

    const scorecardLines = monthsWithLimit.map(m => {
      const name = String(m.monthName || "").trim() || `M${Number(m.monthIndex || 0) + 1}`
      const spent = fmtMoney(Number(m.spent || 0), "$")
      const lim = fmtMoney(Number(m.limit || 0), "$")
      if (m.met === true) return `${name}: ✅ ${spent} of ${lim} (saved ${fmtMoney(Number(m.saved || 0), "$")})`
      return `${name}: ❌ ${spent} of ${lim} (over ${fmtMoney(Number(m.over || 0), "$")})`
    })

    const cur = currentGoal || {}
    const curName = String(cur.monthName || "").trim() || "Current month"
    const curSpent = fmtMoney(Number(cur.spent || 0), "$")
    const curLimit = fmtMoney(Number(cur.limit || 0), "$")
    const curStatus =
      Number(cur.limit || 0) <= 0 ? "No limit set"
      : cur.met === true ? `✅ GOAL MET (saved ${fmtMoney(Number(cur.saved || 0), "$")})`
      : `❌ OVER LIMIT (over ${fmtMoney(Number(cur.over || 0), "$")})`

    const prompt = [
      `You are AI Analyst BETA for a finance dashboard terminal.`,
      ``,
      `Strict formatting rules:`,
      `- Plain text only`,
      `- No markdown, no **, no headings`,
      `- Use symbols: 📅 🎯 📌 🔎 ⚠ ✅ 💡 •`,
      `- Bullets must start with "• "`,
      ``,
      `Required output structure:`,
      `1) First line: 📅 Year ${y} | ${startISO} to ${endISO}`,
      `2) 🎯 Budget Goal Summary: say months met vs months with limits, total saved, total over`,
      `3) 📌 Current Month (${curName}): state spent vs limit and GOAL MET or OVER LIMIT`,
      `4) 🔎 What drove results: reference top categories and explain impact`,
      `5) 💡 Next month plan: 4 to 6 bullets that are concrete and tied to the data`,
      ``,
      `Data (do not invent numbers):`,
      `Totals: ${JSON.stringify(totals || {})}`,
      `Top categories: ${JSON.stringify(topCategories || [])}`,
      `Monthly (income and expenses): ${JSON.stringify(monthly || [])}`,
      ``,
      `Goal scorecard lines:`,
      scorecardLines.join("\n") || "N/A",
      ``,
      `Computed summary:`,
      `Months with limits: ${monthsWithLimit.length}`,
      `Months met: ${metMonths.length}`,
      `Months not met: ${missMonths.length}`,
      `Total saved: ${fmtMoney(totalSaved, "$")}`,
      `Total over: ${fmtMoney(totalOver, "$")}`,
      best ? `Best month: ${best.monthName} saved ${fmtMoney(Number(best.saved || 0), "$")}` : `Best month: N/A`,
      worst ? `Worst month: ${worst.monthName} over ${fmtMoney(Number(worst.over || 0), "$")}` : `Worst month: N/A`,
      ``,
      `Current month status: ${curName} -> ${curSpent} of ${curLimit} | ${curStatus}`
    ].join("\n")

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.35,
      max_tokens: 750,
      messages: [
        {
          role: "system",
          content:
            "You write terminal output for a budgeting website. Plain text only. No markdown. Focus on goal met vs missed, savings, overages, and a concrete next month plan. Use symbols and bullets starting with •."
        },
        { role: "user", content: prompt }
      ]
    })

    const raw = String(completion.choices?.[0]?.message?.content || "")
    const text = sanitizeOutlookText(raw)
    return res.json({ text })
  } catch (err) {
    return res.status(500).json({ error: err?.message || "AI budgets analysis failed" })
  }
})

/* =========================================
   9) OUTLOOK: CHECKING ANALYSIS (AI)
   POST /api/ai/outlook/checking
========================================= */

router.post("/outlook/checking", async (req, res) => {
  try {
    const { year, range, totals, topTx, monthly } = req.body || {}
    const startISO = range && range.startISO ? String(range.startISO) : "unknown"
    const endISO = range && range.endISO ? String(range.endISO) : "unknown"
    const y = Number(year)

    if (!Number.isFinite(y)) return res.status(400).json({ error: "Missing or invalid year." })

    const prompt = [
      `You are AI Analyst BETA for a finance dashboard terminal.`,
      ``,
      `Strict formatting rules:`,
      `- Output plain text only`,
      `- Do not use markdown of any kind`,
      `- Do not output **, __, backticks, or # headings`,
      `- Use symbols: 📅 📌 ⚠ ✅ 💡 •`,
      ``,
      `Required structure:`,
      `1) First line must be: 📅 Year ${y} | ${startISO} to ${endISO}`,
      `2) 📌 Summary (income vs expenses, 2 to 3 short lines)`,
      `3) ⚠ Risk Signals (only if data supports it)`,
      `4) ✅ Wins (1 to 2 lines if applicable)`,
      `5) 💡 Recommendations (3 to 5 bullets, each starting with "• ")`,
      ``,
      `Data (do not invent numbers):`,
      `Totals: ${JSON.stringify(totals || {})}`,
      `Top transactions: ${JSON.stringify(topTx || [])}`,
      `Monthly: ${JSON.stringify(monthly || [])}`
    ].join("\n")

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.35,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content:
            "You write terminal output for a checking dashboard. Plain text only. No markdown. Use symbols and bullet lines starting with •. Do not use ** or headings."
        },
        { role: "user", content: prompt }
      ]
    })

    const raw = String(completion.choices?.[0]?.message?.content || "")
    const text = sanitizeOutlookText(raw)
    return res.json({ text })
  } catch (err) {
    return res.status(500).json({ error: err?.message || "AI checking analysis failed" })
  }
})

/* =========================================
   10) OUTLOOK: CREDIT ANALYSIS (AI)
   POST /api/ai/outlook/credit
========================================= */

router.post("/outlook/credit", async (req, res) => {
  try {
    const { year, range, totals, topTx, monthly } = req.body || {}
    const startISO = range && range.startISO ? String(range.startISO) : "unknown"
    const endISO = range && range.endISO ? String(range.endISO) : "unknown"
    const y = Number(year)

    if (!Number.isFinite(y)) return res.status(400).json({ error: "Missing or invalid year." })

    const prompt = [
      `You are AI Analyst BETA for a finance dashboard terminal.`,
      ``,
      `Strict formatting rules:`,
      `- Output plain text only`,
      `- Do not use markdown of any kind`,
      `- Do not output **, __, backticks, or # headings`,
      `- Use symbols: 📅 📌 ⚠ ✅ 💡 •`,
      ``,
      `Required structure:`,
      `1) First line must be: 📅 Year ${y} | ${startISO} to ${endISO}`,
      `2) 📌 Summary (trend, acceleration, 2 to 3 short lines)`,
      `3) ⚠ Risk Signals (clear and direct, only if data supports it)`,
      `4) ✅ Wins (optional, 1 line if applicable)`,
      `5) 💡 Recommendations (3 to 5 bullets, each starting with "• ")`,
      ``,
      `Data (do not invent numbers):`,
      `Totals: ${JSON.stringify(totals || {})}`,
      `Top transactions: ${JSON.stringify(topTx || [])}`,
      `Monthly: ${JSON.stringify(monthly || [])}`
    ].join("\n")

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.35,
      max_tokens: 750,
      messages: [
        {
          role: "system",
          content:
            "You write terminal output for a credit dashboard. Plain text only. No markdown. Use symbols and bullet lines starting with •. Do not use ** or headings. Focus on risk and corrective actions."
        },
        { role: "user", content: prompt }
      ]
    })

    const raw = String(completion.choices?.[0]?.message?.content || "")
    const text = sanitizeOutlookText(raw)
    return res.json({ text })
  } catch (err) {
    return res.status(500).json({ error: err?.message || "AI credit analysis failed" })
  }
})

/* =========================================
   11) OUTLOOK: GOALS ANALYSIS (AI)
   POST /api/ai/outlook/goals
========================================= */

router.post("/outlook/goals", async (req, res) => {
  try {
    const b = req.body || {}
    const year = Number(b.year)
    if (!Number.isFinite(year)) return res.status(400).json({ error: "Invalid year." })

    const range = b.range && typeof b.range === "object" ? b.range : {}
    const startISO = String(range.startISO || "")
    const endISO = String(range.endISO || "")

    const goal = b.goal && typeof b.goal === "object" ? b.goal : {}
    const progress = b.progress && typeof b.progress === "object" ? b.progress : {}
    const consistency = b.consistency && typeof b.consistency === "object" ? b.consistency : {}
    const monthly = Array.isArray(b.monthly) ? b.monthly : []

    const money = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n || 0))

    const gName = String(goal.name || "Goal")
    const target = Number(goal.target || 0)
    const savedToDate = Number(progress.savedToDate || 0)
    const remaining = Number(progress.remaining || 0)
    const pct = Number(progress.progressPct || 0)

    let best = null
    let worst = null
    for (const m of monthly) {
      const v = Number(m?.deposited || 0)
      if (!best || v > best.v) best = { m: m?.month || "?", v }
      if (!worst || v < worst.v) worst = { m: m?.month || "?", v }
    }

    const sys = [
      "You are AI Analyst BETA for a budgeting website Goals dashboard.",
      "Output plain text for a terminal window.",
      "No markdown, no asterisks, no code blocks, no headings with ##.",
      "Use tasteful icons at the start of lines like: 📅 🎯 ✅ ⚠️ 💡 📈.",
      "Be data-driven and specific. Do not invent numbers."
    ].join("\n")

    const user = [
      `Context: GOALS savings analysis`,
      `📅 Year ${year} | ${startISO} to ${endISO}`,
      ``,
      `Goal: ${gName}`,
      `Target: ${money(target)}`,
      `Saved to date (within goal active window): ${money(savedToDate)}`,
      `Remaining: ${money(remaining)}`,
      `Progress: ${pct.toFixed(1)}%`,
      `Required monthly: ${money(progress.requiredMonthly || 0)}`,
      `Required daily: ${money(progress.requiredDaily || 0)}`,
      `Schedule delta (ahead positive / behind negative): ${money(progress.aheadBehind || 0)}`,
      ``,
      `Consistency:`,
      `- Missed auto deposits in range: ${Number(consistency.missedAutoCountInRange || 0)}`,
      `- Missed auto amount in range: ${money(consistency.missedAutoAmountInRange || 0)}`,
      ``,
      `Monthly deposits (Deposited, Manual, AutoPaid, AutoMissed, TxCount):`,
      JSON.stringify(monthly),
      ``,
      `Write a concise report that MUST include:`,
      `1) A first line that repeats: "📅 Year ${year} | ${startISO} to ${endISO}"`,
      `2) A "🎯 Goal Status" line that includes target, saved, remaining, and progress %`,
      `3) A "✅ On Track" or "⚠️ Behind" line based on schedule delta and what it implies`,
      `4) A short "📈 Best vs Weakest month" line using the data`,
      `5) A "💡 Next Month Plan" section with 3 specific actions tied to this goal and the missed deposits (if any)`,
      `Keep it about 10 to 14 lines total.`
    ].join("\n")

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.35,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user }
      ]
    })

    const raw = String(completion?.choices?.[0]?.message?.content || "")
    const text = sanitizeOutlookText(raw)

    return res.json({ text })
  } catch (err) {
    return res.status(500).json({ error: err?.message || "AI goals analysis failed" })
  }
})

module.exports = router
