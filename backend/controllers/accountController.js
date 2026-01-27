// backend/controllers/accountController.js
const Account = require("../models/account")
const Activity = require("../models/activityModel")

/* =========================================================
   1) CONFIG
========================================================= */

const FB_API_KEY = process.env.FREEDOM_SERVER_API_KEY || process.env.FREEDOM_BANK_API_KEY || null

const FREEDOM_API_BASE =
  process.env.FREEDOM_BANK_API_BASE || "https://us-central1-freedom-bank-9c209.cloudfunctions.net/api"

const ACCOUNT_TYPES = ["checking", "credit"]

/* =========================================================
   2) UTILS: sleep + retryable network errors + fetchWithRetry
========================================================= */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function isRetryableNetworkError(err) {
  const code = err && (err.code || (err.cause && err.cause.code))
  return (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ECONNREFUSED" ||
    code === "EAI_AGAIN" ||
    (err && err.name === "AbortError")
  )
}

async function fetchWithRetry(url, options = {}, tries = 3, timeoutMs = 15000) {
  let lastErr = null

  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), timeoutMs)

    try {
      const res = await fetch(url, { ...options, signal: ctrl.signal })
      clearTimeout(timeout)
      return res
    } catch (e) {
      clearTimeout(timeout)
      lastErr = e
      if (!isRetryableNetworkError(e) || i === tries - 1) throw e
      await sleep(500 * (i + 1))
    }
  }

  throw lastErr
}

/* =========================================================
   3) FREEDOM LINK FLAG (BUDGET-WISE STATE IN FREEDOM FIRESTORE)
========================================================= */

async function setFreedomLinkedFlag(uid, linked) {
  const base =
    process.env.FREEDOM_BANK_API_BASE || "https://us-central1-freedom-bank-9c209.cloudfunctions.net"

  const key = process.env.FREEDOM_SERVER_API_KEY || process.env.FREEDOM_BANK_API_KEY || ""
  if (!uid || !key) return

  const url = base.replace(/\/+$/, "") + "/linkBudgetWise"

  try {
    await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + key
        },
        body: JSON.stringify({ uid: String(uid), linked: !!linked })
      },
      2,
      15000
    )
  } catch (e) {
    console.error("setFreedomLinkedFlag error:", e && (e.message || e))
  }
}

/* =========================================================
   4) ACCOUNTS API: list / create / delete / update status
========================================================= */

async function listAccounts(req, res) {
  try {
    const username = req.user.username
    const rows = await Account.findByUser(username)
    return res.json(rows)
  } catch (err) {
    console.error("listAccounts error:", err)
    return res.status(500).json({ error: "Failed to fetch accounts" })
  }
}

async function createAccount(req, res) {
  try {
    const username = req.user.username
    const { email, bankName, accountType, last4 } = req.body

    if (!email || !bankName || !accountType || !last4) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    if (!ACCOUNT_TYPES.includes(accountType)) {
      return res.status(400).json({ error: "Invalid accountType" })
    }

    const last4Digits = String(last4).replace(/\D/g, "").slice(-4)
    if (last4Digits.length !== 4) {
      return res.status(400).json({ error: "last4 must be 4 digits" })
    }

    const account = await Account.create({
      username,
      email,
      bankName,
      accountType,
      last4: last4Digits,
      refreshToken: null,
      uid: null,
      status: "disconnected"
    })

    return res.status(201).json(account)
  } catch (err) {
    console.error("createAccount error:", err)
    return res.status(500).json({ error: "Failed to create account" })
  }
}

async function deleteAccount(req, res) {
  try {
    const { id } = req.params
    const username = req.user.username
    await Account.remove(id, username)
    return res.json({ success: true })
  } catch (err) {
    console.error("deleteAccount error:", err)
    return res.status(500).json({ error: "Failed to delete account" })
  }
}

/*
  Card connect rules:
  - Global Freedom connect must happen first (token saved)
  - Clicking "Connect" on a card sets that account status to connected
  - When connecting a Freedom card, import only that card
*/
async function updateAccountStatus(req, res) {
  try {
    const id = String(req.params.id || "").trim()
    const username = req.user && req.user.username ? String(req.user.username) : ""

    const statusRaw = req.body && req.body.status != null ? String(req.body.status) : ""
    const status = statusRaw.trim().toLowerCase()

    if (!id) return res.status(400).json({ error: "Missing account id" })
    if (!username) return res.status(401).json({ error: "Missing authenticated user for Budget Tracker" })
    if (status !== "connected" && status !== "disconnected") {
      return res.status(400).json({ error: "status must be 'connected' or 'disconnected'" })
    }

    const existing = await Account.findById(id)
    if (!existing || existing.username !== username) {
      return res.status(404).json({ error: "Account not found" })
    }

    const isFreedom = String(existing.bankName || "").toLowerCase().includes("freedom")

    let tokenRow = null
    if (isFreedom && status === "connected") {
      const all = await Account.findByUser(username)
      tokenRow = all.find(
        (a) => String(a.bankName || "").toLowerCase().includes("freedom") && a.refreshToken
      )
      if (!tokenRow || !tokenRow.refreshToken) {
        return res.status(400).json({
          error: "Freedom Bank is not linked. Use 'Connect Freedom Bank' first."
        })
      }
    }

    await Account.updateStatus(id, username, status)

    if (isFreedom && status === "connected") {
      try {
        if (!tokenRow) {
          const all = await Account.findByUser(username)
          tokenRow = all.find(
            (a) => String(a.bankName || "").toLowerCase().includes("freedom") && a.refreshToken
          )
        }

        if (tokenRow && tokenRow.refreshToken) {
          const { idToken, refreshToken: newRefreshToken } = await refreshIdToken(tokenRow.refreshToken)

          // Update tokens on existing rows, never insert new rows here
          await Account.updateFreedomTokensForUser(username, newRefreshToken, tokenRow.uid || null)

          const updatedAcc = await Account.findById(id)
          const acctType = updatedAcc && updatedAcc.accountType ? String(updatedAcc.accountType).trim().toLowerCase() : ""

          if (ACCOUNT_TYPES.includes(acctType)) {
            const items = await fetchFreedomTransactions(idToken, acctType)
            await importTransactions(username, items, updatedAcc.id)
          }
        }
      } catch (e) {
        console.error("updateAccountStatus post-connect import error:", e)
      }
    }

    const updated = await Account.findById(id)
    return res.json(updated)
  } catch (err) {
    console.error("updateAccountStatus error:", err)
    return res.status(500).json({ error: "Failed to update account status" })
  }
}

/* =========================================================
   5) FREEDOM AUTH HELPERS
========================================================= */

async function signInToFreedomBank(email, password) {
  const url =
    "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" +
    encodeURIComponent(FB_API_KEY)

  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: "https://freedom-bank-9c209.web.app"
    },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true
    })
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    const msg = errBody.error && errBody.error.message ? errBody.error.message : "Failed to sign in to Freedom Bank"
    const error = new Error(msg)
    error.status = res.status === 400 || res.status === 401 ? 401 : 500
    throw error
  }

  const data = await res.json()
  return { idToken: data.idToken, refreshToken: data.refreshToken, uid: data.localId }
}

async function refreshIdToken(refreshToken) {
  const url = "https://securetoken.googleapis.com/v1/token?key=" + encodeURIComponent(FB_API_KEY)

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: String(refreshToken || "")
  }).toString()

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: "https://freedom-bank-9c209.web.app"
    },
    body
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => "")
    console.error("refreshIdToken error:", res.status, txt)
    throw new Error("Failed to refresh Freedom Bank token")
  }

  const data = await res.json()
  return { idToken: data.id_token, refreshToken: data.refresh_token }
}

async function fetchFreedomAccount(idToken, accountType) {
  const url = FREEDOM_API_BASE + "/account?account=" + encodeURIComponent(accountType)

  const res = await fetchWithRetry(url, {
    method: "GET",
    headers: { Authorization: "Bearer " + idToken, "Content-Type": "application/json" }
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    console.error("fetchFreedomAccount error for", accountType, "status=", res.status, "body=", body)
    throw new Error("Failed to fetch Freedom Bank account: " + accountType)
  }

  return res.json()
}

async function fetchFreedomTransactions(idToken, accountType) {
  const url =
    FREEDOM_API_BASE +
    "/transactions?account=" +
    encodeURIComponent(accountType) +
    "&limit=5000"

  const res = await fetchWithRetry(
    url,
    {
      method: "GET",
      headers: { Authorization: "Bearer " + idToken, "Content-Type": "application/json" }
    },
    3,
    20000
  )

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    console.error("fetchFreedomTransactions error for", accountType, "status=", res.status, "body=", body)
    return []
  }

  const data = await res.json().catch(() => ({ items: [] }))
  return Array.isArray(data.items) ? data.items : []
}

/* =========================================================
   6) IMPORT: Freedom transactions -> MySQL (dedupe via unique)
========================================================= */

async function importTransactions(username, items, accountId) {
  for (const t of items) {
    try {
      const dateStr = t.date || null

      let timeStr = ""
      if (t.timestamp) {
        const d = new Date(t.timestamp)
        if (!Number.isNaN(d.getTime())) {
          const hh = String(d.getHours()).padStart(2, "0")
          const mm = String(d.getMinutes()).padStart(2, "0")
          timeStr = `${hh}:${mm}`
        }
      }

      const rawAmount = Number(t.amount || 0)
      if (!rawAmount) continue

      const isIncome = rawAmount < 0
      const amountAbs = Math.abs(rawAmount)
      const type = isIncome ? "income" : "expense"

      const baseId = [t.date || "", t.merchant || "", rawAmount.toFixed(2), type].join("|")
      const externalId = t.id || baseId

      await Activity.create(username, {
        date: dateStr,
        time: timeStr || null,
        merchant: t.merchant || "",
        category: t.category || "",
        type,
        amount: amountAbs,
        origin: "freedom_bank",
        externalId,
        accountId: accountId || null
      })
    } catch (err) {
      if (err && err.code === "ER_DUP_ENTRY") continue
      console.error("importTransactions single item error:", err)
    }
  }
}

/* =========================================================
   7) GLOBAL FREEDOM CONNECT
   IMPORTANT: This does NOT import any transactions.
========================================================= */

async function freedomConnect(req, res) {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" })
    }

    if (!req.user || !req.user.username) {
      return res.status(401).json({ error: "Missing authenticated user for Budget Tracker" })
    }

    const username = req.user.username

    let authInfo
    try {
      authInfo = await signInToFreedomBank(email, password)
    } catch (err) {
      console.error("signInToFreedomBank error:", err.message || err)
      const status = err.status || 401
      return res.status(status).json({ error: "Invalid Freedom Bank credentials" })
    }

    const { idToken, refreshToken, uid } = authInfo
    console.log("Freedom Bank sign-in ok for uid:", uid)
    await setFreedomLinkedFlag(uid, true)

    const existingRows = await Account.findByUser(username)
    const existingByType = new Map()
    for (const row of existingRows) {
      if (String(row.bankName || "").toLowerCase().includes("freedom") && row.accountType) {
        existingByType.set(String(row.accountType).toLowerCase(), row)
      }
    }

    const createdAccounts = []

    for (const acctType of ACCOUNT_TYPES) {
      let last4 = "0000"

      try {
        const accData = await fetchFreedomAccount(idToken, acctType)
        const l4 =
          accData && accData.last4 != null ? String(accData.last4).replace(/\D/g, "").slice(-4) : ""
        if (l4 && l4.length === 4) last4 = l4
      } catch (err) {
        console.error("fetchFreedomAccount failed for", acctType, err && (err.message || err))
        const existing = existingByType.get(acctType)
        if (existing && existing.last4) {
          const l4 = String(existing.last4).replace(/\D/g, "").slice(-4)
          if (l4 && l4.length === 4) last4 = l4
        }
      }

      try {
        const acc = await Account.create({
          username,
          email,
          bankName: "Freedom Bank",
          accountType: acctType,
          last4,
          refreshToken,
          uid,
          status: "disconnected"
        })
        if (acc) createdAccounts.push(acc)
      } catch (err) {
        console.error("Account.create error for", acctType, err)
      }
    }

    return res.status(200).json({
      success: true,
      message: "Freedom Bank linked. Click per-card Connect to import transactions.",
      username,
      accounts: createdAccounts
    })
  } catch (err) {
    console.error("freedomConnect error:", err)
    return res.status(500).json({ error: "Failed to connect to Freedom Bank" })
  }
}

/* =========================================================
   8) FREEDOM REFRESH (HOURLY SYNC)
   Imports transactions ONLY for connected cards.
========================================================= */

async function refreshFromFreedom(req, res) {
  try {
    if (!req.user || !req.user.username) {
      return res.status(401).json({ error: "Missing authenticated user for Budget Tracker" })
    }

    const username = String(req.user.username || "").trim()
    const accounts0 = await Account.findByUser(username)

    const tokenRow = accounts0.find(
      (a) => String(a.bankName || "").toLowerCase().includes("freedom") && a.refreshToken
    )

    if (!tokenRow || !tokenRow.refreshToken) {
      return res.status(400).json({ error: "No Freedom Bank connection for this user" })
    }

    const { idToken, refreshToken } = await refreshIdToken(tokenRow.refreshToken)

    await Account.updateFreedomTokensForUser(username, refreshToken, tokenRow.uid || null)

    const accounts = await Account.findByUser(username)
    const importedSummary = []

    for (const acctTypeRaw of ACCOUNT_TYPES) {
      const acctType = String(acctTypeRaw || "").trim().toLowerCase()

      const accRow = accounts.find((a) => {
        const t = String(a.accountType || a.account_type || "").trim().toLowerCase()
        const st = String(a.status || "").trim().toLowerCase()
        return t === acctType && st === "connected"
      })

      if (!accRow) continue

      try {
        const items = await fetchFreedomTransactions(idToken, acctType)
        await importTransactions(username, items, accRow.id)
        importedSummary.push({ accountType: acctType, importedCount: Array.isArray(items) ? items.length : 0 })
      } catch (err) {
        console.error("refreshFromFreedom fetch/import error:", err)
      }
    }

    return res.json({ success: true, username, imported: importedSummary })
  } catch (err) {
    console.error("refreshFromFreedom error:", err)
    return res.status(500).json({ error: "Failed to refresh Freedom Bank data" })
  }
}

/* =========================================================
   9) FREEDOM DISCONNECT + BALANCES
========================================================= */

async function freedomDisconnect(req, res) {
  try {
    if (!req.user || !req.user.username) {
      return res.status(401).json({ error: "Missing authenticated user for Budget Tracker" })
    }

    const username = req.user.username
    const rows = await Account.findByUser(username)
    const freedomRow = rows.find((a) => String(a.bankName || "").toLowerCase().includes("freedom") && a.uid)
    const uid = freedomRow ? freedomRow.uid : null

    await Account.disconnectAllForUser(username)

    if (uid) await setFreedomLinkedFlag(uid, false)

    return res.status(200).json({
      success: true,
      message: "Disconnected all Freedom Bank accounts for this user"
    })
  } catch (err) {
    console.error("freedomDisconnect error:", err)
    return res.status(500).json({ error: "Failed to disconnect Freedom Bank accounts" })
  }
}

async function getMysqlBalances(req, res) {
  try {
    if (!req.user || !req.user.username) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    const username = req.user.username
    const accountTypeRaw = String(req.query.accountType || "").trim().toLowerCase()
    const strict = String(req.query.strict || "").trim() === "1"

    if (accountTypeRaw !== "checking" && accountTypeRaw !== "credit") {
      return res.status(400).json({ error: "accountType must be checking or credit" })
    }

    const pool = require("../config/db")

    const strictClause = strict
      ? "AND t.account_id IS NOT NULL AND LOWER(COALESCE(t.origin,'')) NOT IN ('goal','manual','assistant')"
      : ""

    const [rows] = await pool.query(
      `
      SELECT
        COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) AS totalIncome,
        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS totalExpenses,
        COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END), 0) AS balance
      FROM transactions t
      JOIN accounts a
        ON a.id = t.account_id
       AND a.username = t.username
      WHERE t.username = ?
        AND a.account_type = ?
        ${strictClause}
      `,
      [username, accountTypeRaw]
    )

    return res.json({
      accountType: accountTypeRaw,
      totalIncome: Number(rows[0]?.totalIncome || 0),
      totalExpenses: Number(rows[0]?.totalExpenses || 0),
      balance: Number(rows[0]?.balance || 0)
    })
  } catch (err) {
    console.error("getMysqlBalances error:", err)
    return res.status(500).json({ error: "Balance calculation failed" })
  }
}

async function getMysqlAvailableBalance(req, res) {
  try {
    if (!req.user || !req.user.username) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    const username = req.user.username
    const pool = require("../config/db")

    const [rows] = await pool.query(
      `
      SELECT
        COALESCE(SUM(
          CASE
            WHEN t.type = 'income' THEN t.amount
            ELSE -t.amount
          END
        ), 0) AS availableBalance,
        COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) AS totalIncome,
        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS totalExpenses
      FROM transactions t
      LEFT JOIN accounts a
        ON a.id = t.account_id
       AND a.username = t.username
      WHERE t.username = ?
        AND (t.account_id IS NULL OR a.account_type != 'credit')
      `,
      [username]
    )

    return res.json({
      totalIncome: Number(rows[0]?.totalIncome || 0),
      totalExpenses: Number(rows[0]?.totalExpenses || 0),
      availableBalance: Number(rows[0]?.availableBalance || 0),
      allBalance: Number(rows[0]?.availableBalance || 0)
    })
  } catch (err) {
    console.error("getMysqlAvailableBalance error:", err)
    return res.status(500).json({ error: "Balance calculation failed" })
  }
}


/* =========================================================
   10) EXPORTS
========================================================= */

module.exports = {
  listAccounts,
  createAccount,
  deleteAccount,
  updateAccountStatus,
  freedomConnect,
  refreshFromFreedom,
  freedomDisconnect,
  getMysqlBalances,
  getMysqlAvailableBalance
}
