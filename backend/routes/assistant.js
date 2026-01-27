// backend/routes/assistant.js

const express = require("express")
const crypto = require("crypto")
const fs = require("fs")
const path = require("path")
const OpenAI = require("openai")

const pool = require("../config/db")
const auth = require("../controllers/authController")
const categoryMemory = require("../utils/assistant/categoryMemory")

const router = express.Router()

/* =========================================
   1) Core config
   Purpose: Keep behavior consistent and safe
========================================= */

const LA_TZ = "America/Los_Angeles"
const CATEGORY_CONF_THRESHOLD = 0.8
const CATEGORY_MIN_TOTAL = 5
const MAX_MESSAGE_LEN = 800
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

/* =========================================
   2) LA date helpers
   Purpose: Ensure "this month" and "today" are LA-based
========================================= */

function laParts(d = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-US", {
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

  const parts = dtf.formatToParts(d)
  const m = {}
  for (const p of parts) m[p.type] = p.value

  let hh = m.hour
  if (hh === "24") hh = "00"

  return {
    y: m.year,
    mo: m.month,
    d: m.day,
    hh,
    mm: m.minute,
    ss: m.second
  }
}

function lastDayOfMonth(year, month) {
  const y = Number(year)
  const m = Number(month)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

function ymRange(year, month) {
  const y = Number(year)
  const m = Number(month)
  const end = lastDayOfMonth(y, m)
  const mm = String(m).padStart(2, "0")
  return {
    start: `${y}-${mm}-01`,
    end: `${y}-${mm}-${String(end).padStart(2, "0")}`,
    label: `${y}-${mm}`
  }
}

function yearRange(year) {
  const y = Number(year)
  return {
    start: `${y}-01-01`,
    end: `${y}-12-31`,
    label: `${y}`
  }
}

/* =========================================
   3) Message parsing helpers
   Purpose: Detect greetings, data questions, and transaction drafts
========================================= */

function isGreeting(text) {
  const t = String(text || "").trim().toLowerCase()
  return (
    t === "hi" ||
    t === "hello" ||
    t === "hey" ||
    t === "yo" ||
    t.startsWith("hi ") ||
    t.startsWith("hello ") ||
    t.startsWith("hey ") ||
    t.includes("good morning") ||
    t.includes("good afternoon") ||
    t.includes("good evening")
  )
}

function looksLikeEditOrDelete(text) {
  const t = String(text || "").toLowerCase()
  return t.includes("delete transaction") || t.includes("remove transaction") || t.includes("edit transaction") || t.includes("update transaction")
}

function normalizeMoney(text) {
  const s = String(text || "")
  const m = s.match(/(?:\$|usd\s*)?(-?\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{1,2})?/i)
  if (!m) return null
  const raw = String(m[0]).replace(/usd/i, "").replace(/\$/g, "").replace(/,/g, "").trim()
  const v = Number(raw)
  if (!Number.isFinite(v)) return null
  if (v <= 0) return null
  return Math.round(v * 100) / 100
}

function extractMerchant(text) {
  const s = String(text || "").trim()
  const lowered = s.toLowerCase()

  const m1 = s.match(/(?:bought|paid|spent)\s+(?:at\s+)?([a-z0-9&.' -]{2,60})\s+(?:for|on)\s+\$?\d/i)
  if (m1 && m1[1]) return m1[1].trim()

  const m2 = s.match(/(?:at)\s+([a-z0-9&.' -]{2,60})\s+\$?\d/i)
  if (m2 && m2[1]) return m2[1].trim()

  if (lowered.includes("coffee")) return "Coffee"
  if (lowered.includes("uber")) return "Uber"
  if (lowered.includes("lyft")) return "Lyft"

  return null
}

function guessTypeFromText(text) {
  const t = String(text || "").toLowerCase()
  if (t.includes("income") || t.includes("salary") || t.includes("paycheck") || t.includes("got paid") || t.includes("earned")) return "income"
  if (t.includes("expense") || t.includes("expanse") || t.includes("spent") || t.includes("paid") || t.includes("bought") || t.includes("purchase")) return "expense"
  return null
}

function extractAccountPreference(lowerMsg) {
  if (lowerMsg.includes("credit") || lowerMsg.includes("credit card") || lowerMsg.includes("on my card") || lowerMsg.includes("on card")) return "credit"
  if (lowerMsg.includes("checking") || lowerMsg.includes("debit")) return "checking"
  return null
}

function wantsMoneyMetrics(lowerMsg) {
  if (lowerMsg.includes("expense") || lowerMsg.includes("expenses") || lowerMsg.includes("expanse") || lowerMsg.includes("expanses") || lowerMsg.includes("spent") || lowerMsg.includes("spend")) return true
  if (lowerMsg.includes("income") || lowerMsg.includes("earn") || lowerMsg.includes("earned") || lowerMsg.includes("salary")) return true
  if (lowerMsg.includes("net") || lowerMsg.includes("profit") || lowerMsg.includes("balance")) return true
  return false
}

function ymRangeFromText(lowerMsg) {
  const now = laParts(new Date())
  const y = Number(now.y)
  const mo = Number(now.mo)

  if (lowerMsg.includes("this month") || (lowerMsg.includes("this") && lowerMsg.includes("month"))) return ymRange(y, mo)
  if (lowerMsg.includes("last month") || (lowerMsg.includes("previous") && lowerMsg.includes("month"))) {
    const m = mo - 1
    if (m >= 1) return ymRange(y, m)
    return ymRange(y - 1, 12)
  }

  if (lowerMsg.includes("this year") || (lowerMsg.includes("this") && lowerMsg.includes("year"))) return yearRange(y)
  if (lowerMsg.includes("last year") || (lowerMsg.includes("previous") && lowerMsg.includes("year"))) return yearRange(y - 1)

  if (lowerMsg.includes("today")) {
    const start = `${now.y}-${now.mo}-${now.d}`
    return { start, end: start, label: `today (${start})` }
  }
  if (lowerMsg.includes("yesterday")) {
    const laNow = new Date()
    const p = laParts(new Date(laNow.getTime() - 24 * 60 * 60 * 1000))
    const d = `${p.y}-${p.mo}-${p.d}`
    return { start: d, end: d, label: `yesterday (${d})` }
  }

  return null
}

function isDataQuestion(text) {
  const t = String(text || "").toLowerCase()
  if (t.includes("how many") && t.includes("categor")) return true
  if (t.includes("how many") && t.includes("goal")) return true
  if (t.includes("how many") && t.includes("section")) return true
  if (t.includes("available balance")) return true
  if (t.includes("balance") && (t.includes("checking") || t.includes("credit"))) return true
  if (t.includes("biggest") && t.includes("expense")) return true
  if (t.includes("top") && t.includes("expense")) return true
  if (wantsMoneyMetrics(t) && (t.includes("this") || t.includes("last") || t.includes("month") || t.includes("year") || t.includes("today") || t.includes("yesterday"))) return true
  return false
}

/* =========================================
   4) Category memory bootstrap
   Purpose: Seed merchant-category guesses from existing MySQL history
========================================= */

async function bootstrapCategoryModelFromMysql() {
  try {
    const dbPath = categoryMemory.DB_PATH
    const dir = path.dirname(dbPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify({ v: 1, merchants: {} }, null, 2))

    const [rows] = await pool.query(
      `
      SELECT
        t.username,
        t.merchant,
        t.category,
        COUNT(*) AS cnt
      FROM transactions t
      WHERE t.merchant IS NOT NULL
        AND t.merchant <> ''
        AND t.category IS NOT NULL
        AND t.category <> ''
      GROUP BY t.username, t.merchant, t.category
      ORDER BY t.username ASC, t.merchant ASC, cnt DESC
      `
    )

    const pairs = []
    let lastKey = ""
    for (const r of rows) {
      const u = String(r.username || "").trim()
      const m = String(r.merchant || "").trim()
      const c = String(r.category || "").trim()
      if (!u || !m || !c) continue
      const key = `${u}||${m}`
      if (key === lastKey) continue
      lastKey = key
      pairs.push({ username: u, merchant: m, category: c })
    }

    if (pairs.length) await categoryMemory.bulkImport(pairs).catch(() => {})
  } catch (e) {
    console.error("bootstrapCategoryModelFromMysql error:", e)
  }
}

let __bootstrapStarted = false
function ensureBootstrap() {
  if (__bootstrapStarted) return
  __bootstrapStarted = true
  bootstrapCategoryModelFromMysql().catch(() => {})
}
ensureBootstrap()

/* =========================================
   5) DB helpers
   Purpose: Provide exact answers for common questions
========================================= */

async function getDefaultAccountId(username, preferredType) {
  const u = String(username || "").trim()
  if (!u) return null

  const pref = preferredType === "credit" || preferredType === "checking" ? preferredType : null

  if (pref) {
    const [rows] = await pool.query(
      `SELECT id FROM accounts WHERE username = ? AND status = 'connected' AND account_type = ? ORDER BY id ASC LIMIT 1`,
      [u, pref]
    )
    if (rows && rows.length) return Number(rows[0].id)
  }

  const [rows2] = await pool.query(
    `SELECT id, account_type FROM accounts WHERE username = ? AND status = 'connected' ORDER BY (account_type = 'checking') DESC, id ASC LIMIT 1`,
    [u]
  )
  if (rows2 && rows2.length) return Number(rows2[0].id)
  return null
}

async function buildQuickSnapshot(username) {
  const now = laParts(new Date())
  const y = Number(now.y)
  const mo = Number(now.mo)
  const end = lastDayOfMonth(y, mo)

  const monthStart = `${y}-${String(mo).padStart(2, "0")}-01`
  const monthEnd = `${y}-${String(mo).padStart(2, "0")}-${String(end).padStart(2, "0")}`
  const yearStart = `${y}-01-01`
  const yearEnd = `${y}-12-31`

  const [moneyRows] = await pool.query(
    `
    SELECT
      COALESCE(SUM(CASE WHEN date BETWEEN ? AND ? AND type = 'income' THEN amount ELSE 0 END), 0) AS income_month,
      COALESCE(SUM(CASE WHEN date BETWEEN ? AND ? AND type = 'expense' THEN amount ELSE 0 END), 0) AS expense_month,
      COALESCE(SUM(CASE WHEN date BETWEEN ? AND ? AND type = 'income' THEN amount ELSE 0 END), 0) AS income_year,
      COALESCE(SUM(CASE WHEN date BETWEEN ? AND ? AND type = 'expense' THEN amount ELSE 0 END), 0) AS expense_year
    FROM transactions
    WHERE username = ?
      AND date IS NOT NULL
    `,
    [monthStart, monthEnd, monthStart, monthEnd, yearStart, yearEnd, yearStart, yearEnd, username]
  )

  const incM = Number(moneyRows?.[0]?.income_month || 0)
  const expM = Number(moneyRows?.[0]?.expense_month || 0)
  const incY = Number(moneyRows?.[0]?.income_year || 0)
  const expY = Number(moneyRows?.[0]?.expense_year || 0)

  const [goalRows] = await pool.query(
    `
    SELECT
      (SELECT COALESCE(COUNT(*), 0) FROM goal_section WHERE username = ?) AS goal_sections,
      (SELECT COALESCE(COUNT(*), 0)
         FROM goal g
         JOIN goal_section gs ON gs.id = g.section_id
        WHERE gs.username = ? AND g.status <> 'deleted') AS goals_total,
      (SELECT COALESCE(COUNT(*), 0)
         FROM goal g
         JOIN goal_section gs ON gs.id = g.section_id
        WHERE gs.username = ? AND g.status = 'active') AS goals_active,
      (SELECT COALESCE(COUNT(*), 0)
         FROM goal g
         JOIN goal_section gs ON gs.id = g.section_id
        WHERE gs.username = ? AND g.status = 'completed') AS goals_completed
    `,
    [username, username, username, username]
  )

  const [txCatRows] = await pool.query(
    `SELECT COALESCE(COUNT(DISTINCT category), 0) AS cnt FROM transactions WHERE username = ? AND category IS NOT NULL AND category <> ''`,
    [username]
  )

  const [mRows] = await pool.query(
    `SELECT year, month FROM budget_month_category WHERE username = ? ORDER BY year DESC, month DESC LIMIT 1`,
    [username]
  )

  let bmcTotal = 0
  let bmcEnabled = 0
  let bmcYm = "none"

  if (mRows && mRows.length) {
    const y2 = Number(mRows[0].year)
    const m2 = Number(mRows[0].month)
    bmcYm = `${y2}-${String(m2).padStart(2, "0")}`
    const [bmcRows] = await pool.query(
      `
      SELECT
        COALESCE(COUNT(*), 0) AS total,
        COALESCE(SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END), 0) AS enabled
      FROM budget_month_category
      WHERE username = ? AND year = ? AND month = ?
      `,
      [username, y2, m2]
    )
    bmcTotal = Number(bmcRows?.[0]?.total || 0)
    bmcEnabled = Number(bmcRows?.[0]?.enabled || 0)
  }

  return {
    laDay: `${now.y}-${now.mo}-${now.d}`,
    monthLabel: `${now.y}-${now.mo}`,
    incomeMonth: incM,
    expenseMonth: expM,
    netMonth: incM - expM,
    incomeYear: incY,
    expenseYear: expY,
    netYear: incY - expY,
    goalSections: Number(goalRows?.[0]?.goal_sections || 0),
    goalsTotal: Number(goalRows?.[0]?.goals_total || 0),
    goalsActive: Number(goalRows?.[0]?.goals_active || 0),
    goalsCompleted: Number(goalRows?.[0]?.goals_completed || 0),
    transactionCategories: Number(txCatRows?.[0]?.cnt || 0),
    budgetCategoriesYm: bmcYm,
    budgetCategoriesTotal: bmcTotal,
    budgetCategoriesEnabled: bmcEnabled
  }
}

/* =========================================
   6) Health
   Purpose: Quick check that assistant route is alive
========================================= */

router.get("/health", auth.verifyToken, async (req, res) => {
  try {
    return res.json({ ok: true })
  } catch {
    return res.status(500).json({ ok: false })
  }
})

/* =========================================
   7) Main chat endpoint
   Purpose: Answers DB questions and creates transactions via confirm flow
========================================= */

router.post("/chat", auth.verifyToken, async (req, res) => {
  try {
    const username = req.user && req.user.username
    if (!username) return res.status(401).json({ error: "Unauthorized" })

    const body = req.body || {}
    const message = String(body.message || "").trim()
    const pending = body.pending && typeof body.pending === "object" ? body.pending : null

    if (!message) return res.status(400).json({ error: "Message is required" })
    if (message.length > MAX_MESSAGE_LEN) return res.status(400).json({ error: "Message too long" })

    const lowerMsg = message.toLowerCase()

    if (isGreeting(message)) {
      return res.json({
        reply: "Hi. What would you like to do. You can ask about totals like expenses this month, or you can log a transaction like 'Bought coffee for $6'.",
        pending: null
      })
    }

    if (looksLikeEditOrDelete(message)) {
      return res.json({
        reply: "I cannot edit or delete transactions. I can only create new transactions. Use the Activity section to edit or delete.",
        pending: null
      })
    }

    const p = laParts(new Date())
    const today = `${p.y}-${p.mo}-${p.d}`
    const nowTime = `${p.hh}:${p.mm}:${p.ss}`

    // Pending stage: confirm transaction creation
    if (pending && pending.stage === "need_confirm" && pending.draft && typeof pending.draft === "object") {
      if (lowerMsg === "confirm" || lowerMsg === "yes" || lowerMsg === "y") {
        const requestId = String(pending.requestId || "").trim()
        const draft = pending.draft

        if (!requestId) return res.status(400).json({ error: "Missing requestId" })
        if (!draft.type || (draft.type !== "income" && draft.type !== "expense")) return res.status(400).json({ error: "Invalid draft.type" })
        if (!draft.amount || !(Number(draft.amount) > 0)) return res.status(400).json({ error: "Invalid draft.amount" })
        if (!draft.category) return res.status(400).json({ error: "Draft missing category" })

        const [existsRows] = await pool.query(
          `SELECT id FROM transactions WHERE username = ? AND origin = 'assistant' AND assistant_request_id = ? LIMIT 1`,
          [username, requestId]
        )
        if (existsRows && existsRows.length) {
          return res.json({ reply: "Already confirmed. That transaction was already created.", pending: null })
        }

        const preferredType = extractAccountPreference(String(draft.rawText || "").toLowerCase())
        const accountId = await getDefaultAccountId(username, preferredType)

        await pool.query(
          `
          INSERT INTO transactions
            (username, account_id, date, time, merchant, category, type, amount, origin, assistant_request_id, externalId)
          VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, 'assistant', ?, NULL)
          `,
          [
            username,
            accountId,
            draft.date || today,
            draft.time || nowTime,
            draft.merchant || null,
            draft.category || null,
            draft.type,
            Number(draft.amount),
            requestId
          ]
        )

        if (draft.merchant && draft.category) {
          await categoryMemory.record(username, draft.merchant, draft.category).catch(() => {})
        }

        const acctText = accountId ? "" : " (No connected account found, saved without account link.)"
        return res.json({
          reply: `Done. I created the ${draft.type} transaction for $${Number(draft.amount).toFixed(2)}.${acctText}`,
          pending: null
        })
      }

      if (lowerMsg === "cancel" || lowerMsg === "no" || lowerMsg === "n") {
        return res.json({ reply: "Canceled.", pending: null })
      }

      return res.json({ reply: 'Please reply "confirm" to create it, or "cancel" to discard it.', pending })
    }

    // Pending stage: user typed a category
    if (pending && pending.stage === "need_category" && pending.draft && typeof pending.draft === "object") {
      const cat = String(message || "").trim()
      if (!cat) {
        return res.json({ reply: "What category should I use. Example: Groceries, Dining, Gas, Rent.", pending })
      }

      const nextDraft = { ...pending.draft, category: cat }
      return res.json({
        reply:
          `Draft ready. Please confirm:\n` +
          `• Type: ${nextDraft.type || "(missing)"}\n` +
          `• Amount: $${Number(nextDraft.amount || 0).toFixed(2)}\n` +
          `• Merchant: ${nextDraft.merchant || "(none)"}\n` +
          `• Category: ${nextDraft.category}\n` +
          `• Date: ${nextDraft.date || today}\n` +
          `Reply "confirm" or press Confirm.`,
        pending: { stage: "need_confirm", requestId: String(pending.requestId || ""), draft: nextDraft }
      })
    }

    // Pending stage: user typed income or expense
    if (pending && pending.stage === "need_type" && pending.draft && typeof pending.draft === "object") {
      const t = lowerMsg
      const txType = t === "income" || t === "expense" ? t : null
      if (!txType) {
        return res.json({ reply: 'Please reply exactly: "income" or "expense".', pending })
      }

      const draft = { ...pending.draft, type: txType }
      const suggestion = draft.merchant ? await categoryMemory.suggest(draft.merchant) : null
      const best = suggestion && suggestion.category ? String(suggestion.category).trim() : ""
      const conf = Number(suggestion && suggestion.confidence != null ? suggestion.confidence : 0)
      const total = Number(suggestion && suggestion.total != null ? suggestion.total : 0)
      const confident = best && total >= CATEGORY_MIN_TOTAL && conf >= CATEGORY_CONF_THRESHOLD

      if (!confident) {
        return res.json({
          reply: `What category should I use for "${draft.merchant || "this"}". Example: Groceries, Dining, Gas, Rent.`,
          pending: { stage: "need_category", requestId: String(pending.requestId || ""), draft }
        })
      }

      draft.category = best

      return res.json({
        reply:
          `Draft ready. Please confirm:\n` +
          `• Type: ${draft.type}\n` +
          `• Amount: $${Number(draft.amount).toFixed(2)}\n` +
          `• Merchant: ${draft.merchant || "(none)"}\n` +
          `• Category: ${draft.category}\n` +
          `• Date: ${draft.date}\n` +
          `Reply "confirm" or press Confirm.`,
        pending: { stage: "need_confirm", requestId: String(pending.requestId || ""), draft }
      })
    }

    // Data questions: always answer from MySQL (exact)
    if (isDataQuestion(message)) {
      const t = lowerMsg

      // Goal sections count
      if (t.includes("goal") && t.includes("section") && t.includes("how many")) {
        const [rows] = await pool.query(`SELECT COALESCE(COUNT(*), 0) AS cnt FROM goal_section WHERE username = ?`, [username])
        return res.json({ reply: `You have ${Number(rows?.[0]?.cnt || 0)} goal sections.`, pending: null })
      }

      // Goals count
      if (t.includes("goal") && t.includes("how many") && !t.includes("section")) {
        const [rows] = await pool.query(
          `
          SELECT
            COALESCE(COUNT(*), 0) AS total,
            COALESCE(SUM(CASE WHEN g.status = 'active' THEN 1 ELSE 0 END), 0) AS active,
            COALESCE(SUM(CASE WHEN g.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed
          FROM goal g
          JOIN goal_section gs ON gs.id = g.section_id
          WHERE gs.username = ? AND g.status <> 'deleted'
          `,
          [username]
        )
        const total = Number(rows?.[0]?.total || 0)
        const active = Number(rows?.[0]?.active || 0)
        const completed = Number(rows?.[0]?.completed || 0)
        return res.json({ reply: `You have ${total} goals. Active: ${active}. Completed: ${completed}.`, pending: null })
      }

      // Category counts (budget categories and transaction categories)
      if (t.includes("how many") && t.includes("categor")) {
        const [txCatRows] = await pool.query(
          `SELECT COALESCE(COUNT(DISTINCT category), 0) AS cnt FROM transactions WHERE username = ? AND category IS NOT NULL AND category <> ''`,
          [username]
        )

        const txCats = Number(txCatRows?.[0]?.cnt || 0)

        const [mRows] = await pool.query(
          `SELECT year, month FROM budget_month_category WHERE username = ? ORDER BY year DESC, month DESC LIMIT 1`,
          [username]
        )

        if (!mRows || !mRows.length) {
          return res.json({
            reply: `You have ${txCats} transaction categories in your history. You do not have any budget categories yet.`,
            pending: null
          })
        }

        const year = Number(mRows[0].year)
        const month = Number(mRows[0].month)

        const [bmcRows] = await pool.query(
          `
          SELECT
            COALESCE(COUNT(*), 0) AS total,
            COALESCE(SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END), 0) AS enabled
          FROM budget_month_category
          WHERE username = ? AND year = ? AND month = ?
          `,
          [username, year, month]
        )

        const total = Number(bmcRows?.[0]?.total || 0)
        const enabled = Number(bmcRows?.[0]?.enabled || 0)

        return res.json({
          reply: `Budget categories (${year}-${String(month).padStart(2, "0")}): ${total}. Enabled: ${enabled}. Transaction categories (all time): ${txCats}.`,
          pending: null
        })
      }

      // Balance by account type
      if (t.includes("available balance") || (t.includes("balance") && (t.includes("checking") || t.includes("credit")))) {
        const [rows] = await pool.query(
          `
          SELECT
            a.account_type AS accountType,
            COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END), 0) AS balance
          FROM accounts a
          LEFT JOIN transactions t
            ON t.account_id = a.id
           AND t.username = a.username
          WHERE a.username = ?
          GROUP BY a.account_type
          `,
          [username]
        )

        const map = {}
        for (const r of rows || []) map[String(r.accountType || "").toLowerCase()] = Number(r.balance || 0)

        const checking = Number(map.checking || 0)
        const credit = Number(map.credit || 0)

        if (t.includes("checking") && !t.includes("credit")) return res.json({ reply: `Checking available balance is $${checking.toFixed(2)}.`, pending: null })
        if (t.includes("credit") && !t.includes("checking")) return res.json({ reply: `Credit available balance is $${credit.toFixed(2)}.`, pending: null })

        return res.json({ reply: `Available balances:\n• Checking: $${checking.toFixed(2)}\n• Credit: $${credit.toFixed(2)}`, pending: null })
      }

      // Income or expense metrics for a period
      if (wantsMoneyMetrics(t)) {
        const range = ymRangeFromText(t)
        if (!range) {
          return res.json({
            reply: "I can answer money totals for time periods like 'this month', 'last month', 'this year', or 'last year'. Example: 'What is my expense this month'.",
            pending: null
          })
        }

        const [rows] = await pool.query(
          `
          SELECT
            COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
            COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
          FROM transactions
          WHERE username = ?
            AND date IS NOT NULL
            AND date BETWEEN ? AND ?
          `,
          [username, range.start, range.end]
        )

        const income = Number(rows?.[0]?.income || 0)
        const expense = Number(rows?.[0]?.expense || 0)
        const net = income - expense

        if (t.includes("income") && !t.includes("expense") && !t.includes("spent")) {
          return res.json({ reply: `Income for ${range.label} is $${income.toFixed(2)}.`, pending: null })
        }
        if ((t.includes("expense") || t.includes("expanse") || t.includes("spent") || t.includes("spend")) && !t.includes("income")) {
          return res.json({ reply: `Expenses for ${range.label} are $${expense.toFixed(2)}.`, pending: null })
        }
        if (t.includes("net")) {
          return res.json({ reply: `Net for ${range.label} is $${net.toFixed(2)} (income $${income.toFixed(2)} minus expenses $${expense.toFixed(2)}).`, pending: null })
        }

        return res.json({ reply: `For ${range.label}: income $${income.toFixed(2)}, expenses $${expense.toFixed(2)}, net $${net.toFixed(2)}.`, pending: null })
      }

      // Biggest expense category this month or year
      if ((t.includes("biggest") || t.includes("top")) && t.includes("expense") && t.includes("categor")) {
        const range = ymRangeFromText(t) || ymRangeFromText("this month")
        const [rows] = await pool.query(
          `
          SELECT
            category,
            COALESCE(SUM(amount), 0) AS total
          FROM transactions
          WHERE username = ?
            AND type = 'expense'
            AND date IS NOT NULL
            AND date BETWEEN ? AND ?
            AND category IS NOT NULL
            AND category <> ''
          GROUP BY category
          ORDER BY total DESC
          LIMIT 1
          `,
          [username, range.start, range.end]
        )

        if (!rows || !rows.length) return res.json({ reply: `No expense categories found for ${range.label}.`, pending: null })
        return res.json({ reply: `Biggest expense category for ${range.label} is ${rows[0].category} at $${Number(rows[0].total || 0).toFixed(2)}.`, pending: null })
      }

      return res.json({
        reply: "I can answer totals and counts (budgets, goals, categories, balances) or log a new transaction for you.",
        pending: null
      })
    }

    /*
      If it is not a data question:
      - If it includes an amount, treat as a transaction draft
      - Otherwise, use AI (optional) for natural guidance with a DB snapshot
    */

    const amount = normalizeMoney(message)
    if (!amount) {
      if (openai) {
        const snap = await buildQuickSnapshot(username).catch(() => null)
        const sys =
          "You are BudgetWise AI Assistant. You must not invent numbers. If a question asks for a database value you do not have, say what you can answer and ask for a supported phrasing. Reply in concise plain text."

        const userText =
          `Today (LA): ${snap?.laDay || today}\n` +
          `Snapshot:\n` +
          `- This month (${snap?.monthLabel || ""}): income $${Number(snap?.incomeMonth || 0).toFixed(2)}, expenses $${Number(snap?.expenseMonth || 0).toFixed(2)}, net $${Number(snap?.netMonth || 0).toFixed(2)}\n` +
          `- This year: income $${Number(snap?.incomeYear || 0).toFixed(2)}, expenses $${Number(snap?.expenseYear || 0).toFixed(2)}, net $${Number(snap?.netYear || 0).toFixed(2)}\n` +
          `- Goals: ${Number(snap?.goalsTotal || 0)} total, ${Number(snap?.goalsActive || 0)} active, ${Number(snap?.goalsCompleted || 0)} completed\n` +
          `- Goal sections: ${Number(snap?.goalSections || 0)}\n` +
          `- Transaction categories (all time): ${Number(snap?.transactionCategories || 0)}\n` +
          `- Budget categories latest month (${snap?.budgetCategoriesYm || "none"}): ${Number(snap?.budgetCategoriesTotal || 0)} total, ${Number(snap?.budgetCategoriesEnabled || 0)} enabled\n\n` +
          `User question: ${message}`

        try {
          const r = await openai.chat.completions.create({
            model: OPENAI_MODEL,
            temperature: 0.3,
            messages: [
              { role: "system", content: sys },
              { role: "user", content: userText }
            ]
          })

          const out = String(r?.choices?.[0]?.message?.content || "").trim()
          if (out) return res.json({ reply: out, pending: null })
        } catch (e) {
          console.error("[assistant/chat] openai fallback error:", e)
        }
      }

      return res.json({
        reply:
          "I can answer questions like 'How many goals do I have', 'Expenses this month', 'Income this year', or 'Checking balance'. If you want to log a transaction, include an amount like 'Bought coffee for $6'.",
        pending: null
      })
    }

    const merchant = extractMerchant(message)
    const txType = guessTypeFromText(message)
    const requestId = crypto.randomBytes(16).toString("hex")

    const draft = { amount, merchant, date: today, time: nowTime, rawText: message }

    if (!txType) {
      return res.json({
        reply: 'Is this income or expense. Please reply exactly: "income" or "expense".',
        pending: { stage: "need_type", requestId, draft }
      })
    }

    draft.type = txType

    const suggestion = merchant ? await categoryMemory.suggest(merchant) : null
    const best = suggestion && suggestion.category ? String(suggestion.category).trim() : ""
    const conf = Number(suggestion && suggestion.confidence != null ? suggestion.confidence : 0)
    const total = Number(suggestion && suggestion.total != null ? suggestion.total : 0)
    const confident = best && total >= CATEGORY_MIN_TOTAL && conf >= CATEGORY_CONF_THRESHOLD

    if (!confident) {
      let hint = ""
      const top = Array.isArray(suggestion && suggestion.breakdown) ? suggestion.breakdown.slice(0, 3) : []
      if (top.length) {
        const parts = top.map((x) => `${x.category} (${Math.round(Number(x.pct || 0) * 100)}%)`)
        hint = ` Suggested: ${parts.join(", ")}.`
      }

      return res.json({
        reply: `What category should I use for "${merchant || "this"}".${hint} Example: Groceries, Dining, Gas, Rent.`,
        pending: { stage: "need_category", requestId, draft }
      })
    }

    draft.category = best

    return res.json({
      reply:
        `Draft ready. Please confirm:\n` +
        `• Type: ${draft.type}\n` +
        `• Amount: $${Number(draft.amount).toFixed(2)}\n` +
        `• Merchant: ${draft.merchant || "(none)"}\n` +
        `• Category: ${draft.category}\n` +
        `• Date: ${draft.date}\n` +
        `Reply "confirm" or press Confirm.`,
      pending: { stage: "need_confirm", requestId, draft }
    })
  } catch (e) {
    console.error("[assistant/chat] error:", e)
    return res.status(500).json({ error: "Assistant failed" })
  }
})

module.exports = router
