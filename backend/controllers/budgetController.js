const Budget = require("../models/budgetModel")

async function list(req, res) {
  try {
    const username = req.user.username
    const rows = await Budget.listCurrentMonth(username)
    res.json(rows)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: "Failed to load budgets" })
  }
}

async function refresh(req, res) {
  try {
    const username = req.user.username

    const hasYear = Object.prototype.hasOwnProperty.call(req.body || {}, "year")
    const hasMonth = Object.prototype.hasOwnProperty.call(req.body || {}, "month")

    const yearRaw = hasYear ? req.body.year : null
    const monthRaw = hasMonth ? req.body.month : null

    const year = yearRaw === null || yearRaw === undefined || yearRaw === "" ? null : Number(yearRaw)
    const month = monthRaw === null || monthRaw === undefined || monthRaw === "" ? null : Number(monthRaw)

    const validYear = Number.isInteger(year) && year >= 2000 && year <= 2100
    const validMonth = Number.isInteger(month) && month >= 1 && month <= 12

    if (validYear && validMonth) {
      await Budget.refreshMonth(username, year, month)
      return res.json({ status: "ok", scope: "month", year, month })
    }

    await Budget.refreshAllMonths(username)
    res.json({ status: "ok", scope: "all" })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: "Failed to refresh budgets" })
  }
}


async function getSnapshot(req, res) {
  try {
    const username = req.user.username
    const year = Number(req.params.year)
    const month = Number(req.params.month)

    const rows = await Budget.getMonth(username, year, month)
    res.json(rows)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: "Failed to load snapshot" })
  }
}

async function setLimit(req, res) {
  try {
    const username = req.user.username
    const category = String(req.body?.category || "").trim()

    const monthlyLimitRaw = req.body?.monthlyLimit ?? req.body?.monthly_limit ?? 0
    const monthlyLimit = Number(monthlyLimitRaw)
    const limit = Number.isFinite(monthlyLimit) && monthlyLimit >= 0 ? monthlyLimit : 0

    if (!category) return res.status(400).json({ error: "Category required" })

    await Budget.updateLimit(username, category, limit)
    const rows = await Budget.listCurrentMonth(username)
    res.json(rows)
  } catch (e) {
    const msg = String(e?.message || "")
    if (msg === "LIMITS_LOCKED") return res.status(409).json({ error: "Limits are locked for this month" })
    console.error(e)
    res.status(500).json({ error: "Failed to update limit" })
  }
}

async function toggle(req, res) {
  try {
    const username = req.user.username
    const category = String(req.body?.category || "").trim()
    const enabled = req.body?.enabled === true || req.body?.enabled === 1

    if (!category) return res.status(400).json({ error: "Category required" })

    await Budget.toggleCategory(username, category, enabled)
    const rows = await Budget.listCurrentMonth(username)
    res.json(rows)
  } catch (e) {
    const msg = String(e?.message || "")
    if (msg === "LIMITS_LOCKED") return res.status(409).json({ error: "Limits are locked for this month" })
    console.error(e)
    res.status(500).json({ error: "Failed to update category" })
  }
}

module.exports = {
  list,
  refresh,
  getSnapshot,
  setLimit,
  toggle
}
