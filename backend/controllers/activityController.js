// backend/controllers/activityController.js
const Activity = require("../models/activityModel")

function toDateOnlyString(v) {
  if (v == null) return null

  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, "0")
    const d = String(v.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }

  const s = String(v)
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

function toTimeHHMM(v) {
  if (v == null) return ""
  const s = String(v).trim()
  if (!s) return ""
  const m = s.match(/^(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : s.slice(0, 5)
}

function toMs(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.getTime()
  if (typeof v === "number") return v
  if (typeof v === "string") {
    const t = Date.parse(v)
    if (!Number.isNaN(t)) return t
  }
  return Date.now()
}

/*
  Origin normalization
  We removed origin='user' from MySQL. Default is now 'manual'.
*/
function normalizeOrigin(v) {
  const s = String(v || "").trim().toLowerCase()
  if (s === "manual" || s === "assistant" || s === "freedom_bank" || s === "goal") return s
  return "manual"
}

function toClientRow(row) {
  return {
    id: row.id,
    date: toDateOnlyString(row.date),
    time: toTimeHHMM(row.time),
    merchant: row.merchant || "",
    category: row.category || "",
    type: row.type === "income" ? "income" : "expense",
    amount: Number(row.amount) || 0,
    origin: row.origin || "manual",
    assistantRequestId: row.assistant_request_id || null,
    accountId: row.account_id || null,
    accountType: row.accountType || null,
    accountLast4: row.accountLast4 || null,
    bankName: row.bankName || null,
    externalId: row.externalId || null,
    createdAt: toMs(row.createdAt)
  }
}

exports.list = async (req, res) => {
  try {
    if (!req.user || !req.user.username) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    const username = req.user.username
    const accountType = String(req.query.accountType || "").trim().toLowerCase()
    const strict = String(req.query.strict || "").trim() === "1"

    const rows = await Activity.list(username, { accountType, strict })
    return res.json({ items: rows })
  } catch (err) {
    console.error("activity.list error:", err)
    return res.status(500).json({ error: "Failed to load activity" })
  }
}

exports.create = async (req, res) => {
  try {
    if (!req.user || !req.user.username) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    const { date, time, merchant, category, type, amount, origin, accountId, externalId, assistantRequestId } = req.body || {}

    if (!date || !type || amount == null) {
      return res.status(400).json({ error: "date, type and amount are required" })
    }

    const numAmount = Number(amount)
    if (!(numAmount > 0)) {
      return res.status(400).json({ error: "amount must be positive" })
    }

    if (type !== "income" && type !== "expense") {
      return res.status(400).json({ error: "type must be income or expense" })
    }

    const originClean = normalizeOrigin(origin)

    /*
      Account assignment rules
      - manual + assistant: never attach to checking/credit (account_id stays NULL)
      - freedom_bank + goal: may attach to accounts (default to checking if not provided)
    */
    let finalAccountId = accountId != null && String(accountId).trim() !== "" ? Number(accountId) : null
    if (!Number.isFinite(finalAccountId)) finalAccountId = null

    if (originClean === "manual" || originClean === "assistant") {
      finalAccountId = null
    } else if (!finalAccountId && (originClean === "freedom_bank" || originClean === "goal")) {
      const Account = require("../models/account")
      const accs = await Account.findByUser(req.user.username)

      const pickChecking =
        (accs || []).find(
          (a) =>
            String(a.accountType || a.account_type || "").trim().toLowerCase() === "checking" &&
            String(a.status || "").trim().toLowerCase() === "connected"
        ) ||
        (accs || []).find((a) => String(a.accountType || a.account_type || "").trim().toLowerCase() === "checking") ||
        null

      if (pickChecking && pickChecking.id != null) {
        const idNum = Number(pickChecking.id)
        if (Number.isFinite(idNum)) finalAccountId = idNum
      }
    }

    const row = await Activity.create(req.user.username, {
      date,
      time,
      merchant,
      category,
      type,
      amount: numAmount,
      origin: originClean,
      accountId: finalAccountId,
      externalId,
      assistantRequestId
    })

    if (!row) return res.status(500).json({ error: "Failed to create transaction" })
    return res.status(201).json(toClientRow(row))
  } catch (err) {
    console.error("activity.create error:", err)
    return res.status(500).json({ error: "Server error creating transaction" })
  }
}

exports.update = async (req, res) => {
  try {
    if (!req.user || !req.user.username) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: "Invalid id" })

    const patch = {}
    ;["date", "time", "merchant", "category", "type", "amount", "origin"].forEach((k) => {
      if (req.body[k] !== undefined) patch[k] = req.body[k]
    })

    if (req.body.accountId !== undefined) patch.accountId = req.body.accountId
    if (req.body.assistantRequestId !== undefined) patch.assistantRequestId = req.body.assistantRequestId

    if (patch.amount != null) {
      const numAmount = Number(patch.amount)
      if (!(numAmount > 0)) return res.status(400).json({ error: "amount must be positive" })
      patch.amount = numAmount
    }

    if (patch.type && patch.type !== "income" && patch.type !== "expense") {
      return res.status(400).json({ error: "type must be income or expense" })
    }

    if (patch.origin !== undefined) patch.origin = normalizeOrigin(patch.origin)

    const row = await Activity.update(req.user.username, id, patch)
    if (!row) return res.status(404).json({ error: "Transaction not found" })

    return res.json(toClientRow(row))
  } catch (err) {
    console.error("activity.update error:", err)
    return res.status(500).json({ error: "Server error updating transaction" })
  }
}

exports.remove = async (req, res) => {
  try {
    if (!req.user || !req.user.username) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: "Invalid id" })

    const ok = await Activity.remove(req.user.username, id)
    if (!ok) return res.status(404).json({ error: "Transaction not found" })

    return res.status(204).end()
  } catch (err) {
    console.error("activity.remove error:", err)
    return res.status(500).json({ error: "Server error deleting transaction" })
  }
}
