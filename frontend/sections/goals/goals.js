(() => {
  if (window.__goals && typeof window.__goals.cleanup === "function") {
    window.__goals.cleanup()
  }
 

  const __ana = (window.__ana = window.__ana || {})
  if (__ana.fromCompleted === undefined) __ana.fromCompleted = false
  if (__ana.currentGoalId === undefined) __ana.currentGoalId = null
  if (__ana.goal === undefined) __ana.goal = null
  if (__ana.section === undefined) __ana.section = null
  if (!__ana.filter) __ana.filter = { startISO: null, endISO: null, mode: "monthly" }
  if (!__ana.ui) __ana.ui = {}

  const ROOT = () => document.getElementById("go-root")

  const $ = (sel, root = document) => {
    if (!sel) return null
    const s = String(sel).trim()
    if (
      s.startsWith("#") ||
      s.startsWith(".") ||
      s.startsWith("[") ||
      s.includes(" ") ||
      s.includes(">") ||
      s.includes(":")
    ) {
      return root.querySelector(s)
    }
    if (root !== document) {
      return root.querySelector(`#${s}`) || root.querySelector(s)
    }
    return document.getElementById(s) || document.querySelector(`#${s}`) || document.querySelector(s)
  }

  const $$ = (sel, root = document) => {
    if (!sel) return []
    const s = String(sel).trim()
    if (
      s.startsWith("#") ||
      s.startsWith(".") ||
      s.startsWith("[") ||
      s.includes(" ") ||
      s.includes(">") ||
      s.includes(":")
    ) {
      return Array.from(root.querySelectorAll(s))
    }
    const one =
      root !== document
        ? root.querySelector(`#${s}`) || root.querySelector(s)
        : document.getElementById(s) || document.querySelector(`#${s}`) || document.querySelector(s)
    return one ? [one] : []
  }

  let cachedAutoPay = null
  let cachedBalanceForAuto = null

  const fmt = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })

  const fmtDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })
  const fmtDateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })
  const DAY_MS = 86400000

  const tISO = () => new Date().toISOString()

const pISO = (s) => {
  if (!s) return new Date(NaN)
  if (s instanceof Date) return s

  const str = String(s).trim()
  if (!str) return new Date(NaN)

  const m = str.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?(Z|[+\-]\d{2}:?\d{2})?)?$/
  )

  if (m) {
    const hasTZ = !!m[8]
    if (hasTZ) return new Date(str)

    const Y = Number(m[1])
    const Mo = Number(m[2]) - 1
    const D = Number(m[3])
    const H = m[4] != null ? Number(m[4]) : 0
    const Mi = m[5] != null ? Number(m[5]) : 0
    const S = m[6] != null ? Number(m[6]) : 0
    const msRaw = m[7] != null ? String(m[7]) : "0"
    const MS = Number(msRaw.slice(0, 3).padEnd(3, "0"))

    return new Date(Y, Mo, D, H, Mi, S, MS)
  }

  return new Date(str)
}



  const esc = (s = "") =>
    String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]))

  const clamp01 = (x) => Math.max(0, Math.min(1, x))
  const ceil2 = (n) => Math.round(n * 100) / 100

  function rewardTaskReady(taskId) {
  try {
    window.dispatchEvent(
      new CustomEvent("rewards:task-ready", { detail: { taskId } })
    )
  } catch {}
}

  function monthWindow() {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return { start, end }
  }

  function inMonthISO(iso) {
    const { start, end } = monthWindow()
    const d = pISO(iso)
    return d >= start && d < end
  }

  const dateOnly = (val) => {
    if (!val) return null
    if (typeof val === "string") {
      const s = val.trim()
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
      const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (m) {
        const mm = String(m[1]).padStart(2, "0")
        const dd = String(m[2]).padStart(2, "0")
        const yy = m[3]
        return `${yy}-${mm}-${dd}`
      }
      if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10)
    }
    const d = val instanceof Date ? val : new Date(val)
    if (!Number.isFinite(d.getTime())) return null
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, "0")
    const da = String(d.getDate()).padStart(2, "0")
    return `${y}-${mo}-${da}`
  }

  const timeHM = (val) => {
    if (!val) return null
    const s = String(val).trim()
    const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
    if (!m) return null
    const hh = String(Math.min(23, Math.max(0, Number(m[1]) || 0))).padStart(2, "0")
    const mm = String(Math.min(59, Math.max(0, Number(m[2]) || 0))).padStart(2, "0")
    return `${hh}:${mm}`
  }

async function loadTx() {
  let server = []
  try {
    const headers = { Accept: "application/json" }
    const res = await fetch("/api/activity", { headers, credentials: "include" })
    if (res.ok) {
      const data = await res.json()
      const list =
        Array.isArray(data) ? data
        : Array.isArray(data.items) ? data.items
        : Array.isArray(data.transactions) ? data.transactions
        : []
      server = Array.isArray(list) ? list : []
    }
  } catch {}

  let sample = []
  try {
    const r = await fetch(`/data/sample_transactions.json?v=${Date.now()}`)
    if (r.ok) sample = await r.json()
  } catch {}

  const merged = []
    .concat(server)
    .concat(Array.isArray(sample) ? sample : [])
    .map((t) => ({
      ...t,
      amount: Number(t.amount),
      date: t.date || t.postedAt || t.txDate || t.tx_date || t.createdAt
    }))
    .filter((t) => Number.isFinite(t.amount) && t.date)

  const map = new Map()
  for (const x of merged) {
    const key = String(x.id || `${x.date}_${x.amount}_${x.name || ""}`)
    if (!map.has(key)) map.set(key, x)
  }

  const deduped = [...map.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)))
  window.__sampleTx = deduped
  return deduped
}

async function currentBalance() {
  try {
    const res = await fetch("/api/accounts/freedom/balances", {
      headers: { Accept: "application/json" },
      credentials: "include"
    })
    if (res.ok) {
      const data = await res.json()

      const allBal = Number(data && (data.allBalance ?? data.availableBalance))
      if (Number.isFinite(allBal)) return allBal

      const chk = Number(data && data.checkingBalance)
      if (Number.isFinite(chk)) return Math.max(0, chk)
    }
  } catch {}

  let rows = []
  try {
    const res = await fetch("/api/activity", { headers: { Accept: "application/json" }, credentials: "include" })
    if (res.ok) {
      const data = await res.json()
      rows =
        Array.isArray(data) ? data
        : Array.isArray(data.items) ? data.items
        : Array.isArray(data.transactions) ? data.transactions
        : []
    }
  } catch {}

  let bal = 0
  for (const t of rows) {
    const amt = Number(t.amount)
    if (!Number.isFinite(amt)) continue
    const type = String(t.type || "").toLowerCase()
    bal += type === "income" ? amt : -amt
  }
  return bal
}

  function normalizeGoalFromDb(g) {
    const id = g?.id ?? g?.goal_id ?? g?.goalId ?? ""
    const name = g?.name ?? g?.title ?? ""

    const priceAmount =
      g?.price && g.price.amount != null ? Number(g.price.amount) : g?.price_amount != null ? Number(g.price_amount) : g?.priceAmount != null ? Number(g.priceAmount) : 0

    const taxIncluded =
      g?.price && typeof g.price.taxIncluded === "boolean"
        ? g.price.taxIncluded
        : typeof g?.price_tax_included === "boolean"
          ? g.price_tax_included
          : typeof g?.priceTaxIncluded === "boolean"
            ? g.priceTaxIncluded
            : g?.price_tax_included != null
              ? !!Number(g.price_tax_included)
              : g?.priceTaxIncluded != null
                ? !!Number(g.priceTaxIncluded)
                : false

    const taxRateRaw =
      g?.price && g.price.taxRate != null ? g.price.taxRate : g?.price_tax_rate != null ? g.price_tax_rate : g?.priceTaxRate != null ? g.priceTaxRate : null

    const taxRateNum = taxRateRaw == null ? null : Number(taxRateRaw)
    const taxRate = taxRateNum == null || !Number.isFinite(taxRateNum) ? null : taxRateNum

    const minMonthlyDepositRaw = g?.minMonthlyDeposit != null ? g.minMonthlyDeposit : g?.min_monthly_deposit != null ? g.min_monthly_deposit : null
    const minMonthlyDepositNum = minMonthlyDepositRaw == null ? null : Number(minMonthlyDepositRaw)
    const minMonthlyDeposit = minMonthlyDepositNum == null || !Number.isFinite(minMonthlyDepositNum) ? null : minMonthlyDepositNum

    const depositPaused = typeof g?.depositPaused === "boolean" ? g.depositPaused : g?.deposit_paused != null ? !!Number(g.deposit_paused) : false

    const depositDate = dateOnly(g?.depositDate || g?.deposit_date || null)
    const depositTime = timeHM(g?.depositTime || g?.deposit_time || null)

    const startDate = dateOnly(g?.startDate || g?.start_date || null)
    const endDate = dateOnly(g?.endDate || g?.end_date || null)

    return {
      ...g,
      id: id != null ? String(id) : "",
      name: String(name || "").trim(),
      priority: Number(g?.priority ?? 3),
      status: String(g?.status || "active"),
      startDate,
      endDate,
      price: {
        amount: Number(priceAmount) || 0,
        taxIncluded: !!taxIncluded,
        taxRate
      },
      priceAmount: Number(priceAmount) || 0,
      priceTaxIncluded: !!taxIncluded,
      priceTaxRate: taxRate,
      minMonthlyDeposit,
      depositDate,
      depositTime,
      depositPaused: !!depositPaused,
      manualDeposits: [],
      autoDeposits: [],
      totalDeposited: Number(g?.totalDeposited) || 0
    }
  }

async function loadSections() {
  try {
    const headers = { Accept: "application/json" }

    const res = await fetch("/api/goals/sections", { headers, credentials: "include" })
    if (!res.ok) return []

    const data = await res.json()
    const rawSections = Array.isArray(data)
      ? data
      : Array.isArray(data.sections)
        ? data.sections
        : Array.isArray(data.data)
          ? data.data
          : []

    if (!Array.isArray(rawSections)) return []

    const sections = rawSections.map((s) => ({
      ...s,
      id: s?.id != null ? String(s.id) : "",
      name: String(s?.name || "").trim(),
      startISO: s?.startISO || s?.start_iso || s?.start || s?.startDate || null,
      endISO: s?.endISO || s?.end_iso || s?.end || s?.endDate || null,
      goals: Array.isArray(s?.goals) ? s.goals : undefined
    }))

    for (const sec of sections) {
      if (!sec || !sec.id) continue

      let rawGoals = []
      if (Array.isArray(sec.goals)) {
        rawGoals = sec.goals
      } else {
        try {
          const gr = await fetch(
            `/api/goals/sections/${encodeURIComponent(sec.id)}/goals`,
            { headers, credentials: "include" }
          )
          if (!gr.ok) {
            sec.goals = []
            continue
          }
          const gdata = await gr.json()
          rawGoals = Array.isArray(gdata) ? gdata : Array.isArray(gdata.goals) ? gdata.goals : []
        } catch {
          sec.goals = []
          continue
        }
      }

      sec.goals = (Array.isArray(rawGoals) ? rawGoals : []).map((g) => normalizeGoalFromDb(g))

      for (const goal of sec.goals) {
        const gid = goal && goal.id != null ? String(goal.id) : ""
        if (!gid) continue

        let deposits = []
        try {
          const dr = await fetch(
            `/api/goals/goals/${encodeURIComponent(gid)}/deposits`,
            { headers, credentials: "include" }
          )
          if (dr.ok) {
            const ddata = await dr.json()
            deposits = Array.isArray(ddata) ? ddata : Array.isArray(ddata.deposits) ? ddata.deposits : []
          }
        } catch {}

        goal.manualDeposits = []
        goal.autoDeposits = []

        for (const d of (Array.isArray(deposits) ? deposits : [])) {
          const status = String(d?.status || d?.depositStatus || d?.deposit_status || "applied").toLowerCase()
          if (status !== "applied" && status !== "missed") continue

          const amt = Number(d?.amount)
          if (!Number.isFinite(amt) || amt <= 0) continue

          const t = String(d?.type || d?.depositType || d?.deposit_type || "").toLowerCase()
          const rawDate =
            d?.date ||
            d?.depositDate ||
            d?.deposit_date ||
            d?.createdAt ||
            d?.created_at ||
            new Date().toISOString()

          const obj = { amount: amt, date: rawDate, type: t || "manual", status }

          if ((t || "") === "auto") goal.autoDeposits.push(obj)
          else goal.manualDeposits.push(obj)
        }

        goal.totalDeposited =
          goal.manualDeposits.reduce((s, x) => s + (x.status === "applied" ? (Number(x.amount) || 0) : 0), 0) +
          goal.autoDeposits.reduce((s, x) => s + (x.status === "applied" ? (Number(x.amount) || 0) : 0), 0)
      }
    }

    return sections
  } catch {
    return []
  }
}


async function spentByCategoryThisMonth() {
  const tx = await loadTx()
  const map = new Map()
  for (const t of tx) {
    const type = String(t.type || "").toLowerCase()
    if (type !== "expense") continue
    if (!inMonthISO(t.date)) continue
    const k = (t.category || "Uncategorized").trim()
    map.set(k, (map.get(k) || 0) + Math.abs(Number(t.amount) || 0))
  }
  return map
}


  function priceTarget(goal) {
    const base = Number(goal.price?.amount || 0)
    if (!goal.price?.taxIncluded) return base
    const rate = Number(goal.price?.taxRate)
    return base * (1 + (isFinite(rate) ? rate : 0) / 100)
  }

  function parseLocalDateTime(dateStr, timeStr) {
    const d = pISO(dateStr)
    if (!Number.isFinite(d.getTime())) return new Date(NaN)

    const parts = String(timeStr || "00:00").split(":")
    const hh = Math.max(0, Math.min(23, Number(parts[0]) || 0))
    const mm = Math.max(0, Math.min(59, Number(parts[1]) || 0))

    const y = d.getFullYear()
    const m = d.getMonth()
    const desiredDay = d.getDate()

    const lastDay = new Date(y, m + 1, 0).getDate()
    const day = Math.min(Math.max(1, Number(desiredDay) || 1), lastDay)

    return new Date(y, m, day, hh, mm, 0, 0)
  }

  function addMonthsClamped(baseDate, monthsToAdd, desiredDay, hh, mm) {
    const y = baseDate.getFullYear()
    const m = baseDate.getMonth() + monthsToAdd

    const y2 = new Date(y, m, 1).getFullYear()
    const m2 = new Date(y, m, 1).getMonth()

    const lastDay = new Date(y2, m2 + 1, 0).getDate()
    const day = Math.min(Math.max(1, Number(desiredDay) || 1), lastDay)

    return new Date(y2, m2, day, hh, mm, 0, 0)
  }

  function formatLocalDateTime(d) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const da = String(d.getDate()).padStart(2, "0")
    const hh = String(d.getHours()).padStart(2, "0")
    const mm = String(d.getMinutes()).padStart(2, "0")
    return `${y}-${m}-${da}T${hh}:${mm}:00`
  }

function executedDeposits(goal, opts = {}) {
  const includePlanned = !!opts.includePlanned

  const raw =
    (Array.isArray(goal.deposits) ? goal.deposits : null) ||
    (Array.isArray(goal.goalDeposits) ? goal.goalDeposits : null) ||
    (Array.isArray(goal.depositHistory) ? goal.depositHistory : null) ||
    null

  const fromArrays = [
    ...(goal.manualDeposits || []),
    ...(goal.autoDeposits || [])
  ]

  const parseMySql = (val, asUTC) => {
    if (!val) return new Date(NaN)
    if (val instanceof Date) return val

    const str = String(val).trim()
    if (!str) return new Date(NaN)

    const m = str.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/
    )
    if (!m) return new Date(str)

    const Y = Number(m[1])
    const Mo = Number(m[2]) - 1
    const D = Number(m[3])
    const H = m[4] != null ? Number(m[4]) : 0
    const Mi = m[5] != null ? Number(m[5]) : 0
    const S = m[6] != null ? Number(m[6]) : 0

    if (asUTC) return new Date(Date.UTC(Y, Mo, D, H, Mi, S, 0))
    return new Date(Y, Mo, D, H, Mi, S, 0)
  }

  const pickFirst = (...vals) => {
    for (const v of vals) {
      if (v != null && String(v).trim() !== "") return v
    }
    return null
  }

  const normType = (v) => {
    const t0 = String(v || "").toLowerCase()
    if (t0.includes("manual")) return "manual"
    if (t0.includes("auto")) return "auto"
    return v ? String(v) : "manual"
  }

  const normStatus = (v) => {
    const s0 = String(v || "").toLowerCase()
    if (!s0) return ""
    if (s0.includes("miss")) return "missed"
    if (s0.includes("appl") || s0.includes("paid") || s0.includes("success")) return "applied"
    if (s0.includes("plan") || s0.includes("upcom") || s0.includes("future")) return "planned"
    return String(v)
  }

  const isMissedFlag = (d) => {
    const mv = d && d.missed
    if (mv === true) return true
    if (mv === 1) return true
    if (mv === "1") return true
    if (typeof mv === "string" && mv.trim().toLowerCase() === "true") return true
    return false
  }

  const baseList = (raw || fromArrays).map((d) => {
    const typeSrc = pickFirst(
      d.type,
      d.deposit_type, d.depositType,
      d.kind, d.deposit_kind
    )
    const t = normType(typeSrc)

    const statusSrc = pickFirst(
      d.status,
      d.deposit_status, d.depositStatus,
      d.state, d.deposit_state
    )
    let st = normStatus(statusSrc)

    // Critical: if backend marks missed via a boolean/flag, force status to missed
    if (isMissedFlag(d)) st = "missed"

    const amtSrc = pickFirst(
      d.amount,
      d.deposit_amount, d.depositAmount,
      d.amt
    )
    const amt = Number(amtSrc) || 0

    const src = pickFirst(
      d.date,
      d.deposit_date, d.depositDate,
      d.executedAt, d.executed_at,
      d.createdAt, d.created_at,
      d.created,
      d.timestamp,
      d.time
    )

    const cameFromCreated =
      src === d.createdAt ||
      src === d.created_at ||
      src === d.created ||
      src === d.timestamp ||
      src === d.time ||
      src === d.executedAt ||
      src === d.executed_at

    const dateObj =
      cameFromCreated
        ? parseMySql(src, true)
        : (t === "auto"
            ? parseMySql(src, false)
            : parseMySql(src, true))

    return {
      ...d,
      type: t,
      status: st || (isMissedFlag(d) ? "missed" : ""),
      amount: amt,
      date: dateObj
    }
  })

  const seen = new Set()
  const all = []
  for (const d of baseList) {
    const dt = d.date instanceof Date && Number.isFinite(d.date.getTime()) ? d.date.getTime() : 0
    const id = d.id != null ? String(d.id) : ""
    const key = `${id}|${String(d.type || "")}|${String(d.status || "")}|${Number(d.amount) || 0}|${dt}`
    if (seen.has(key)) continue
    seen.add(key)
    all.push(d)
  }

  if (includePlanned) {
    const min = Number(goal.minMonthlyDeposit || 0)
    const startISO = goal.depositDate

    if (min > 0 && startISO && !goal.depositPaused) {
      const target = priceTarget(goal)

      const actualTotal = all.reduce((sum, d) => {
        const st = String(d.status || "").toLowerCase()
        const missed = st === "missed" || isMissedFlag(d)
        if (missed) return sum
        return sum + (st === "applied" ? (Number(d.amount) || 0) : 0)
      }, 0)

      let remaining = Math.max(0, target - actualTotal)

      if (remaining > 0.005) {
        const now = new Date()
        const base = parseLocalDateTime(startISO, goal.depositTime || "00:00")

        if (Number.isFinite(base.getTime())) {
          const desiredDay = base.getDate()
          const hh = base.getHours()
          const mm = base.getMinutes()

          let cur = new Date(base.getTime())
          let preGuard = 600
          while (preGuard-- > 0 && cur <= now) cur = addMonthsClamped(cur, 1, desiredDay, hh, mm)

          const endISO = goal.endDate || null
          const end = endISO ? pISO(endISO) : null

          let guard = 60
          while (guard-- > 0 && remaining > 0.005) {
            if (end && cur > end) break

            const amt2 = Math.min(min, remaining)

            all.push({
              date: new Date(cur.getTime()),
              amount: amt2,
              type: "auto-planned",
              status: "planned",
              planned: true
            })

            remaining -= amt2
            cur = addMonthsClamped(cur, 1, desiredDay, hh, mm)
          }
        }
      }
    }
  }

  return all.sort((a, b) => {
    const ta = a.date instanceof Date && Number.isFinite(a.date.getTime()) ? a.date.getTime() : 0
    const tb = b.date instanceof Date && Number.isFinite(b.date.getTime()) ? b.date.getTime() : 0
    return ta - tb
  })
}

function processAutoDeposits(goal, section) {
  const raw =
    (Array.isArray(goal.deposits) ? goal.deposits : null) ||
    (Array.isArray(goal.goalDeposits) ? goal.goalDeposits : null) ||
    (Array.isArray(goal.depositHistory) ? goal.depositHistory : null) ||
    null

  const fromArrays = [
    ...(goal.manualDeposits || []),
    ...(goal.autoDeposits || [])
  ]

  let all = (raw || fromArrays)
    .map((d) => {
      const t0 = String(d.type || "").toLowerCase()
      const t =
        t0.includes("manual") ? "manual" :
        t0.includes("auto") ? "auto" :
        (d.type || "manual")

      return {
        ...d,
        type: t,
        amount: Number(d.amount) || 0,
        date: d.date || d.createdAt || d.created_at || d.created || d.timestamp || d.time || null
      }
    })
    .filter((d) => String(d.type || "").toLowerCase() === "manual")

  if (!goal.minMonthlyDeposit || !goal.depositDate || goal.depositPaused) {
    return all.sort((a, b) => pISO(a.date) - pISO(b.date))
  }

  const first = parseLocalDateTime(goal.depositDate, goal.depositTime || "00:00")
  if (!Number.isFinite(first.getTime())) {
    return all.sort((a, b) => pISO(a.date) - pISO(b.date))
  }

  const desiredDay = first.getDate()
  const hh = first.getHours()
  const mm = first.getMinutes()

  const startBound = (() => {
    const gStart = goal.startDate ? pISO(goal.startDate) : null
    const sStart = section?.startISO ? pISO(section.startISO) : null
    if (gStart && sStart) return gStart > sStart ? gStart : sStart
    return gStart || sStart || first
  })()

  const endBound = (() => {
    if (goal.endDate) return pISO(goal.endDate)
    if (section?.endISO) return pISO(section.endISO)
    const tmp = new Date(first.getTime())
    tmp.setFullYear(tmp.getFullYear() + 10)
    return tmp
  })()

  let cursor = new Date(first.getTime())
  let preGuard = 600
  while (preGuard-- > 0 && cursor < startBound) cursor = addMonthsClamped(cursor, 1, desiredDay, hh, mm)

  let guard = 600
  while (guard-- > 0 && cursor <= endBound) {
    if (cursor >= startBound) {
      const exists = all.some((d) => {
        const dt = pISO(d.date)
        return Number.isFinite(dt.getTime()) && dt.toDateString() === cursor.toDateString()
      })

      if (!exists) {
        all.push({
          amount: Number(goal.minMonthlyDeposit) || 0,
          date: formatLocalDateTime(cursor),
          type: "auto"
        })
      }
    }
    cursor = addMonthsClamped(cursor, 1, desiredDay, hh, mm)
  }

  all.sort((a, b) => pISO(a.date) - pISO(b.date))

  const target = priceTarget(goal) || 0
  if (target <= 0) return all

  let cum = 0
  const capped = []

  for (const d of all) {
    const dAmount = Number(d.amount) || 0

    if (cum >= target) {
      if (d.type === "manual") capped.push(d)
      continue
    }

    let amt = dAmount
    if (d.type === "auto" && cum + amt > target) {
      amt = Math.max(0, ceil2(target - cum))
    }

    cum = Math.min(target, ceil2(cum + amt))
    capped.push({ ...d, amount: amt })
  }

  return capped.filter((d) => d.type === "manual" || d.amount > 0.005)
}


// computePlan: builds next deposit plan for analytics (respects goal/section start)
function computePlan(goal, section) {
  const min = Number(goal.minMonthlyDeposit) || 0
  if (min <= 0 || goal.depositPaused) {
    return {
      nextAmount: 0,
      depositsRemaining: 0,
      lastDueDate: null,
      adjusted: [],
      behind: false,
      ahead: false,
      monthsSaved: 0
    }
  }

  const target = priceTarget(goal, section)
  const actualFunded = fundedAmountToDate(goal, section)
  const amountRemaining = Math.max(0, ceil2(target - actualFunded))

  if (amountRemaining <= 0) {
    return {
      nextAmount: 0,
      depositsRemaining: 0,
      lastDueDate: null,
      adjusted: [],
      behind: false,
      ahead: false,
      monthsSaved: 0
    }
  }

  const now = new Date()
  const endDate = goal.endDate ? pISO(goal.endDate) : null
  if (!(endDate instanceof Date) || !Number.isFinite(endDate.getTime())) {
    return {
      nextAmount: 0,
      depositsRemaining: 0,
      lastDueDate: null,
      adjusted: [],
      behind: false,
      ahead: false,
      monthsSaved: 0
    }
  }

  const baseStart = goal.depositDate ? pISO(goal.depositDate) : now
  const desiredDay = baseStart.getDate()

  const addMonthClamped = (d) => {
    const y = d.getFullYear()
    const m = d.getMonth()
    const base = new Date(y, m + 1, 1)
    const last = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
    const day = Math.min(desiredDay, last)
    return new Date(base.getFullYear(), base.getMonth(), day)
  }

  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const adjusted = []
  let rem = amountRemaining
  let guard = 0

  while (rem > 0.005 && guard++ < 240) {
    if (cursor > endDate) break
    const amt = Math.min(min, rem)
    adjusted.push({ date: dateOnly(cursor), type: "auto", amount: amt })
    rem = ceil2(rem - amt)
    cursor = addMonthClamped(cursor)
  }

  const depositsRemaining = adjusted.length
  const nextAmount = adjusted[0] ? adjusted[0].amount : 0
  const lastDueDate =
    depositsRemaining ? pISO(adjusted[depositsRemaining - 1].date) : null

  // monthsRemaining = full months from now to end date
  let monthsRemaining =
    (endDate.getFullYear() - now.getFullYear()) * 12 +
    (endDate.getMonth() - now.getMonth())

  if (endDate.getDate() < now.getDate()) monthsRemaining--
  monthsRemaining = Math.max(1, monthsRemaining)

  // dynamic required pace
  const requiredPace = amountRemaining / monthsRemaining

  // expected funded by now based on remaining time
  const expectedFundedToDate =
    target - monthsRemaining * requiredPace

  const delta = ceil2(actualFunded - expectedFundedToDate)

  let ahead = false
  let behind = false
  let monthsSaved = 0

  if (delta > requiredPace) {
    ahead = true
    monthsSaved = Math.floor(delta / requiredPace)
  } else if (delta < -requiredPace) {
    behind = true
    monthsSaved = Math.floor(Math.abs(delta) / requiredPace)
  }

  return {
    nextAmount,
    depositsRemaining,
    lastDueDate,
    adjusted,
    behind,
    ahead,
    monthsSaved
  }
}



function fundedAmountToDate(goal, section) {
  const now = new Date()
  const all = executedDeposits(goal, { includePlanned: false })

  return all.reduce((s, d) => {
    const dt = pISO(d.date)
    if (!(dt instanceof Date) || !Number.isFinite(dt.getTime())) return s
    if (dt > now) return s

    const st = String(d.status || "").toLowerCase()
    const missed =
      st === "missed" ||
      d.missed === true ||
      d.missed === 1 ||
      d.missed === "1" ||
      (typeof d.missed === "string" && d.missed.trim().toLowerCase() === "true")

    if (missed) return s
    if (st !== "applied") return s

    return s + (Number(d.amount) || 0)
  }, 0)
}

  // remainingNeeded: how much is left to reach target
function remainingNeeded(goal, section) {
  const st = String(goal?.status || "").toLowerCase()
  if (st === "completed") return 0

  const target = priceTarget(goal, section)
  const funded = fundedAmountToDate(goal, section)
  return Math.max(0, ceil2((Number(target) || 0) - (Number(funded) || 0)))
}


  // futureAutoSchedule: future auto deposits within goal/section range
  function futureAutoSchedule(goal, section) {
    const all = processAutoDeposits(goal, section);
    const now = new Date();
    const gEnd = goal.endDate ? pISO(goal.endDate) : null;
    const sEnd = section?.endISO ? pISO(section.endISO) : null;
    const endBound = gEnd || sEnd || null;

    return all
      .filter(d => {
        const dt = pISO(d.date);
        return d.type === "auto" &&
               dt > now &&
               (!endBound || dt <= endBound);
      })
      .sort((a, b) => pISO(a.date) - pISO(b.date));
  }

  function monthsBetweenInclusive(startDate, endDate) {
    if (!(startDate instanceof Date) || !(endDate instanceof Date)) return 0;

    const sY = startDate.getFullYear();
    const sM = startDate.getMonth();
    const eY = endDate.getFullYear();
    const eM = endDate.getMonth();

    let diff = (eY - sY) * 12 + (eM - sM);
    if (diff < 0) return 0;
    return diff + 1;
  }


  // pctClass: returns color class based on progress percent
  function pctClass(p) {
    return p >= 0.8 ? "ok" : p >= 0.4 ? "mid" : "low";
  }

 // monthlyDepositsThisMonth: smart auto-pay with available balance (NO localStorage)
async function monthlyDepositsThisMonth(sections, availableBalance) {
  const now = new Date()
  const pad2 = (n) => String(n).padStart(2, "0")
  const monthKey = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`

  const { start, end } = monthWindow()
  const tx = await loadTx()

  const paidKeys = new Set()
  const monthGoalTx = tx.filter((t) => {
    const d = pISO(t.date)
    if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return false
    if (!(d >= start && d < end)) return false

    const origin = String(t.origin || t.source || "").toLowerCase()
    const name = String(t.name || t.title || t.label || t.memo || t.description || "")
    const low = name.toLowerCase()

    const isGoalTx =
      origin === "goal" ||
      origin === "goals" ||
      low.startsWith("auto-deposit:") ||
      low.startsWith("auto deposit:") ||
      low.startsWith("auto deposit") ||
      low.startsWith("auto-deposit")

    const type = String(t.type || "").toLowerCase()
    return isGoalTx && type === "expense"
  })

  const keyFromTx = (t) => {
    const d = pISO(t.date)

    const keyDate =
      d instanceof Date && Number.isFinite(d.getTime())
        ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
        : String(t.date || "").slice(0, 10)

    const amt = Number(t.amount) || 0
    const keyAmt = amt.toFixed(2)

    const goalId = t.goalId || (t.meta && t.meta.goalId) || t.goal_id || ""
    if (goalId) return `${goalId}|${keyDate}|${keyAmt}`

    const nm = String(t.name || t.title || t.label || t.memo || t.description || "")
    const goalName = nm.replace(/^auto[-\s]?deposit:\s*/i, "").trim()
    return `${goalName}|${keyDate}|${keyAmt}`
  }

  monthGoalTx.forEach((t) => paidKeys.add(keyFromTx(t)))

  let remainingBalance = Number(availableBalance) || 0
  const events = []

  sections.forEach((sec) => {
    ;(sec.goals || []).forEach((g) => {
      if (g.status === "deleted") return
      if (!g.minMonthlyDeposit || g.depositPaused) return
      if (remainingNeeded(g, sec) <= 0.005) return

      const all = processAutoDeposits(g, sec)
      all.forEach((d) => {
        if (String(d.type || "").toLowerCase() !== "auto") return

        const dt = pISO(d.date)
        if (!(dt instanceof Date) || !Number.isFinite(dt.getTime())) return

        if (dt <= now && inMonthISO(dt)) {
          events.push({
            date: dt,
            amount: Number(d.amount) || 0,
            goalId: g.id,
            goalName: g.name || "Goal"
          })
        }
      })
    })
  })

  events.sort((a, b) => {
    const ta = a.date.getTime()
    const tb = b.date.getTime()
    if (ta !== tb) return ta - tb
    return a.amount - b.amount
  })

  let totalPaid = 0

  for (const ev of events) {
    const amt = Number(ev.amount) || 0
    if (amt <= 0) continue

    const d = ev.date
    const keyDate = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    const keyAmt = amt.toFixed(2)

    const keyById = `${ev.goalId}|${keyDate}|${keyAmt}`
    const keyByName = `${ev.goalName}|${keyDate}|${keyAmt}`

    if (paidKeys.has(keyById) || paidKeys.has(keyByName)) continue
    if (remainingBalance < amt) continue

    const ok = await writeActivity(`Auto Deposit: ${ev.goalName}`, amt, "expense")
    if (!ok) continue

    totalPaid += amt
    remainingBalance -= amt

    paidKeys.add(keyById)
    paidKeys.add(keyByName)
  }

  window.__goalsAuto = { monthKey, paidKeys }
  return totalPaid
}




  // setKpiRow: toggles main vs analytics KPI layout
  function setKpiRow(mode) {
    const host = $('.goals-section');
    if (!host) return;

    host.classList.toggle('page-analytics', mode === 'analytics');

    if (mode !== 'analytics') {
      host.classList.remove('from-section', 'from-completed');
    }
  }

  // renderMainKpis: updates main KPI row values (NO localStorage)
async function renderMainKpis() {
  const bal = await currentBalance()
  const sections = await loadSections()

  const activeGoals = []
  sections.forEach(sec => {
    (sec.goals || []).forEach(g => {
      if (g.status === "deleted" || g.status === "completed") return
      const rem = remainingNeeded(g, sec)
      if (rem <= 0.005) return
      activeGoals.push({ g, sec })
    })
  })

  let allocatedMonthly = 0
  activeGoals.forEach(({ g }) => {
    if (g.depositPaused) return
    const min = Number(g.minMonthlyDeposit || 0)
    if (min > 0) allocatedMonthly += min
  })

  let totalTarget = 0
  let totalFunded = 0
  activeGoals.forEach(({ g, sec }) => {
    const target = priceTarget(g) || 0
    if (target <= 0) return
    totalTarget += target
    totalFunded += fundedAmountToDate(g, sec)
  })
  const progressPct = totalTarget > 0
    ? Math.round((totalFunded / totalTarget) * 100)
    : 0

  if (cachedBalanceForAuto !== bal) {
    cachedBalanceForAuto = bal
    cachedAutoPay = await monthlyDepositsThisMonth(sections, bal)
  }

  const { start, end } = monthWindow()
  const tx = await loadTx()

  let monthlyDeposits = 0
  tx.forEach(t => {
    const origin = String(t.origin || t.source || "").toLowerCase()
    const name = String(t.name || t.title || t.label || t.memo || t.description || "")
    const isGoalTx =
      origin === "goal" ||
      origin === "goals" ||
      name.toLowerCase().startsWith("auto-deposit:") ||
      name.toLowerCase().startsWith("auto deposit:") ||
      name.toLowerCase().startsWith("manual deposit:")

    if (!isGoalTx) return

    const type = String(t.type || "").toLowerCase()
    if (type !== "expense") return

    const d = pISO(t.date)
    if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return
    if (d >= start && d < end) {
      monthlyDeposits += Number(t.amount) || 0
    }
  })

  const set = (id, val) => {
    const el = document.getElementById(id)
    if (el) el.textContent = val
  }

  set("kpi-go-balance", fmt.format(bal))
  set("kpi-go-monthly", fmt.format(monthlyDeposits))
  set("kpi-go-allocated", fmt.format(allocatedMonthly))
  set("kpi-go-progress", `${progressPct}%`)
}


  // renderAnalyticsKpis: fills STATUS and FINANCIALS KPI cards in analytics view
  function renderAnalyticsKpis({ nextAmount, nextDateLabel, depositsRemaining, amountRemaining, pace }) {
    const set = (sel, val) => {
      const el = $(sel);
      if (el) el.textContent = val;
    };

    const nextLabel =
      depositsRemaining > 0 && nextAmount > 0
        ? `Next Deposit: ${fmt.format(nextAmount)}`
        : "Next Deposit: —";

    set('[data-kpi="next-amount"]', nextLabel);
    set('[data-kpi="next-date"]', nextDateLabel || "—");
    set('[data-kpi="remain"]', depositsRemaining ? String(depositsRemaining) : "0");
    set('[data-kpi="pace"]', pace || "On Pace");
    set('[data-kpi="left"]', fmt.format(amountRemaining));
  }

  // parseRoute: parses hash to decide list vs analytics route
function parseRoute() {
  const h = location.hash.replace(/^#\/?/, "")
  if (!h || h === "goals") return { page: "list" }

  const m = h.match(/^goals\/section\/([^/]+)\/analytics$/)
  if (!m) return { page: "list" }

  let sectionId = m[1]
  try { sectionId = decodeURIComponent(sectionId) } catch {}
  return { page: "analytics", sectionId }
}


// goToList: navigates to main list view
function goToList() {
  try {
    if (window.__ana) window.__ana.fromCompleted = false
  } catch {}

  const target = "#/goals"
  if (location.hash !== target) {
    history.replaceState(null, "", target)
  }

  setKpiRow("list")
  safeRender()
}

function clearTimers() {
  try {
    if (window.__goalsTimers && Array.isArray(window.__goalsTimers)) {
      window.__goalsTimers.forEach((t) => {
        try { clearTimeout(t) } catch {}
        try { clearInterval(t) } catch {}
      })
      window.__goalsTimers = []
    }
  } catch {}

  try {
    const ana = window.__ana
    if (ana) {
      if (ana.chartObserver) {
        try { ana.chartObserver.disconnect() } catch {}
        ana.chartObserver = null
      }
      if (ana._raf) {
        try { cancelAnimationFrame(ana._raf) } catch {}
        ana._raf = null
      }
      if (ana._timer) {
        try { clearInterval(ana._timer) } catch {}
        ana._timer = null
      }

      if (ana._autoRefresh) {
        try { clearTimeout(ana._autoRefresh) } catch {}
        ana._autoRefresh = null
      }
      if (ana._autoRefreshTimeout) {
        try { clearTimeout(ana._autoRefreshTimeout) } catch {}
        ana._autoRefreshTimeout = null
      }
      if (ana._autoRefreshWatch) {
        try { clearInterval(ana._autoRefreshWatch) } catch {}
        ana._autoRefreshWatch = null
      }

      if (ana._dataUpdatedRenderTimer) {
        try { clearTimeout(ana._dataUpdatedRenderTimer) } catch {}
        ana._dataUpdatedRenderTimer = null
      }

      ana._autoRefreshAt = null
      ana._lastDataUpdatedMinuteKey = null
      ana._pendingDataUpdated = false
    }
  } catch {}

  try {
    const tip = document.getElementById("analytics-tooltip")
    if (tip) tip.remove()
  } catch {}
}



async function renderList() {
  try {
    try {
      await renderMainKpis()
    } catch (e) {
      console.error("renderMainKpis failed:", e)
    }

    const r = ROOT()
    if (!r) return

    const head = $(".goals-head")
    if (head) {
      const headLeft  = head.querySelector(".head-left") || head
      const titleEl   = headLeft.querySelector("h2")
      const subEl     = headLeft.querySelector("p")
      const cdEl      = head.querySelector(".goals-countdown")
      const backBtn   = document.getElementById("go-analytics-back")
      const headRight = head.querySelector(".head-right")
      const completedBtn = document.getElementById("go-completed-goals")

      if (titleEl) titleEl.classList.add("shine-title")
      if (subEl) subEl.style.display = ""
      if (cdEl) cdEl.remove()
      if (backBtn) backBtn.onclick = null

      if (headRight) headRight.style.display = ""
      if (completedBtn) {
        completedBtn.style.display = ""
        completedBtn.textContent = "Completed Goals"
      }
    }

    const mainStrip = document.getElementById("kpis-main")
    const anaStrip  = document.getElementById("kpis-ana")
    if (mainStrip) mainStrip.style.display = ""
    if (anaStrip)  anaStrip.style.display  = "none"

    let sections = []
    try {
      const data = await loadSections()
      sections = Array.isArray(data) ? data : []
    } catch (err) {
      console.error("loadSections failed:", err?.message || err)
      sections = []
    }

    const countEl = document.getElementById("go-section-count")
    if (countEl) countEl.textContent = `(${sections.length} / 5)`

    clearTimers()

    if (!sections.length) {
      r.innerHTML = `<div class="empty">No goal sections yet. Click “Add Goal Section”.</div>`
      const shell = document.querySelector(".goals-section")
      if (shell && !shell.classList.contains("ready")) shell.classList.add("ready")
      return
    }

    r.innerHTML = `<div class="go-sections">${sections.map(sectionCard).join("")}</div>`
    sections.forEach(wireSectionEvents)

    sections.forEach(sec => {
      const cd = $(`.section-card[data-sec-id="${sec.id}"] .section-meta .countdown`)
      if (cd) cd.textContent = ""
    })

    const shell = document.querySelector(".goals-section")
    if (shell && !shell.classList.contains("ready")) shell.classList.add("ready")
  } catch (err) {
    console.error("renderList fatal:", err)
    const r = ROOT()
    if (r) r.innerHTML = `<div class="empty">Unable to render Goals. Check console for errors.</div>`
    const shell = document.querySelector(".goals-section")
    if (shell && !shell.classList.contains("ready")) shell.classList.add("ready")
  }
}

// sectionCard: returns HTML for a section card
function sectionCard(sec, idx) {
  const theme = `theme-${(idx % 5) + 1}`
  const maxSlots = 3

  const allGoals = sec.goals || []
  const activeGoals = allGoals.filter((g) => {
    if (!g) return false
    const st = String(g.status || "").trim().toLowerCase()
    if (st === "deleted" || st === "completed") return false
    const remaining = remainingNeeded(g, sec)
    return Number(remaining) > 0.005
  })

  const realGoalsHtml = activeGoals.map((g) => goalRow(g, sec)).join("")

  const placeholdersCount = Math.max(0, maxSlots - activeGoals.length)
  const placeholdersHtml = placeholdersCount
    ? `
      <div class="goal-placeholder-list">
        ${Array.from({ length: placeholdersCount }, (_, i) => `
          <div class="goal-placeholder">
            <div class="goal-placeholder-title">Empty goal slot ${activeGoals.length + i + 1}</div>
            <div class="goal-placeholder-sub">
              Click "Add Goal" in the section header to create a goal here.
            </div>
          </div>
        `).join("")}
      </div>
    `
    : ""

  const goalsHtml = realGoalsHtml + placeholdersHtml

  return `
    <div class="section-card ${theme}" data-sec-id="${sec.id}">
      <div class="section-head">
        <div>
          <div class="section-title">${esc(sec.name || "Goal Section")}</div>
        </div>
        <div class="section-actions">
          <button class="btn secondary sm ana-btn">Analytics</button>
          <button class="btn secondary sm edit-sec">Edit</button>
          <button class="btn secondary sm delete-sec">Delete</button>
          <button class="btn primary sm add-goal">+ Add Goal</button>
        </div>
      </div>
      <div class="section-body">${goalsHtml}</div>
    </div>`
}

  // goalRow: returns HTML for a single goal row
  function goalRow(g, sec) {
    const target = priceTarget(g);
    const funded = fundedAmountToDate(g, sec);
    const pct = target > 0 ? clamp01(funded / target) : 0;
    const cls = pctClass(pct);
    const paused = g.depositPaused ? 'paused' : '';
    const isCompleted = pct >= 1 || g.status === 'completed';
    const etaTxt = isCompleted ? "Ready Now" : (() => {
      const plan = computePlan(g, sec);
      return plan.depositsRemaining === 0 ? "Ready Now" : `~ ${Math.max(1, Math.ceil((plan.lastDueDate - new Date()) / DAY_MS))} days`;
    })();
    return `
      <div class="goal-item ${paused} ${isCompleted ? 'completed' : ''}" data-goal-id="${g.id}">
        <div class="goal-icon"><i class="fas fa-bullseye"></i></div>
        <div class="goal-info">
          <div class="goal-name">${esc(g.name)}</div>
          <div class="goal-price-eta"><span>${fmt.format(target)}</span> • <span>ETA: ${etaTxt}</span>${g.depositPaused ? ' • <span style="color:var(--color-danger);font-weight:600;">Paused</span>' : ''}</div>
        </div>
        <div class="goal-actions">
          <button class="icon-btn add-manual-deposit" title="Add Manual Deposit" ${isCompleted ? 'disabled' : ''}><i class="fas fa-plus-circle"></i></button>
          <button class="icon-btn edit-goal" title="Edit Goal" ${isCompleted ? 'disabled' : ''}><i class="fas fa-pen"></i></button>
          <button class="icon-btn delete-goal" title="Delete Goal"><i class="fas fa-trash"></i></button>
        </div>
        <div class="goal-progress">
          <div class="progress-bar-container">
            <div class="progress-bar"><div class="progress-bar-fill ${cls}" style="width:${pct*100}%"></div></div>
            <div class="pct">${Math.round(pct*100)}%</div>
          </div>
        </div>
      </div>`;
  }

// ===============================
// FIX START: wireSectionEvents(sec)
// Replace from the line: function wireSectionEvents(sec) {
// Until the matching closing brace: }
// ===============================

// wireSectionEvents: attaches click handlers for a section card + goals (DB-based)
function wireSectionEvents(sec) {
  const card = $(`.section-card[data-sec-id="${sec.id}"]`);
  if (!card) return;

  const anaBtn = $(".ana-btn", card);
  if (anaBtn) {
    anaBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      goToAnalytics(String(sec.id));
    });
  }

  const editBtn = $(".edit-sec", card);
  if (editBtn) {
    editBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openSectionModal(sec);
    });
  }

const delBtn = $(".delete-sec", card);
if (delBtn) {
  delBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

const refunds = (sec.goals || [])
  .filter(g => {
    if (!g) return false
    const st = String(g.status || "").trim().toLowerCase()
    if (st === "deleted") return false
    if (st === "completed") return false
    return true
  })
  .map(g => {
    const amt = Number(fundedAmountToDate(g, sec) || 0)
    return { id: g.id, name: g.name || "Goal", amount: amt }
  })
  .filter(x => x.amount > 0.01)

    const refundText = refunds.length
      ? `<br><br><strong>Refunds to main balance:</strong><br>` +
        refunds.map(x => `• Refund from <strong>${esc(x.name)}</strong>: <strong>${fmt.format(x.amount)}</strong>`).join("<br>")
      : "";

    showWarning({
      title: "Delete section",
      text: `Delete "<strong>${esc(sec.name)}</strong>" and all its goals.${refundText}`,
      type: "danger",
      footerNote: "This cannot be undone.",
      onConfirm: async () => {
        try {
          const headers = { "Accept": "application/json" };

          const res = await fetch(`/api/goals/sections/${encodeURIComponent(sec.id)}`, {
            method: "DELETE",
            headers,
            credentials: "include"
          });

          if (!res.ok) throw new Error("Failed to delete section from database.");

          // Refund AFTER delete succeeds (prevents fake refunds if delete fails)
          for (const r of refunds) {
            await writeActivity(`Refund from ${r.name}`, r.amount, "income");
          }

          window.dispatchEvent(new CustomEvent("data:updated"));
        } catch (err) {
          console.error("Delete section failed:", err);
          showWarning({
            title: "Delete failed",
            text: `Could not delete the section. ${esc(err?.message || "")}`,
            okOnly: true
          });
        }
      }
    });
  });
}


  const addGoalBtn = $(".add-goal", card);
  if (addGoalBtn) {
    addGoalBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const count = (sec.goals || []).filter(g => {
        if (!g) return false;
        if (g.status === "deleted") return false;
        const remaining = remainingNeeded(g, sec);
        return remaining > 0.005;
      }).length;

      if (count >= 3) {
        showWarning({
          title: "Goal limit reached",
          text: "Each section can have up to <strong>3</strong> goals.",
          okOnly: true
        });
        return;
      }

      openGoalModal({ sectionId: sec.id });
    });
  }

  $$(".goal-item", card).forEach(row => {
    const gid = row.dataset.goalId;
    const goal = (sec.goals || []).find(g => String(g.id) === String(gid));
    if (!goal) return;

    $(".edit-goal", row)?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openGoalModal({ sectionId: sec.id, goal });
    });

    $(".add-manual-deposit", row)?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openManualDepositModal(goal.id);
    });

    $(".delete-goal", row)?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const refund = fundedAmountToDate(goal, sec);

      showWarning({
        title: "Delete goal",
        text: `Delete "<strong>${esc(goal.name)}</strong>". Deposited funds (<strong>${fmt.format(refund)}</strong>) will be refunded to your main balance.`,
        type: "danger",
        footerNote: "This cannot be undone.",
        onConfirm: async () => {
          try {
            const headers = { "Accept": "application/json" };
            
            let ok = false;

            // 1) Correct route in your backend routes file:
            //    router.delete("/goals/:id", goals.deleteGoal);
            //    mounted under /api/goals -> /api/goals/goals/:id
            try {
              const r1 = await fetch(`/api/goals/goals/${encodeURIComponent(goal.id)}`, {
                method: "DELETE",
                headers,
                credentials: "include"
              });
              ok = r1.ok;
            } catch {}

            // 2) Fallbacks (safe, in case you have another router mount)
            if (!ok) {
              try {
                const r2 = await fetch(`/api/goals/${encodeURIComponent(goal.id)}`, {
                  method: "DELETE",
                  headers,
                  credentials: "include"
                });
                ok = r2.ok;
              } catch {}
            }

            // Only refund after delete succeeds (prevents fake refunds if delete fails)
            if (!ok) throw new Error("Failed to delete goal from database.");

            await writeActivity(`Refund: ${goal.name}`, refund, "income");

            window.dispatchEvent(new CustomEvent("data:updated"));
          } catch (err) {
            console.error("Delete goal failed:", err);
            showWarning({
              title: "Delete failed",
              text: `Could not delete the goal. ${esc(err?.message || "")}`,
              okOnly: true
            });
          }
        }
      });
    });
  });
}

// ===============================
// FIX END: wireSectionEvents(sec)
// ===============================

/// renderAnalytics: renders analytics page for a specific section
async function renderAnalytics(sectionId) {
  let sections = []
  try {
    const data = await loadSections()
    sections = Array.isArray(data) ? data : []
  } catch (err) {
    console.error("renderAnalytics: loadSections failed:", err)
    const r0 = ROOT()
    if (r0) r0.innerHTML = `<div class="empty">Could not load Analytics. Please try again.</div>`
    return
  }

  const sid = String(sectionId || "")
  const sec = sections.find(s => String(s.id) === sid)
  if (!sec) { goToList(); return }

  const r = ROOT()
  if (!r) return

  const allSections = sections
  const countEl = document.getElementById("go-section-count")
  if (countEl) countEl.textContent = `(${allSections.length} / 5)`

  try {
    const balForAuto = await currentBalance()
    if (cachedBalanceForAuto !== balForAuto) {
      cachedBalanceForAuto = balForAuto
      cachedAutoPay = await monthlyDepositsThisMonth(allSections, balForAuto)
    }
  } catch (e) {
    console.warn("renderAnalytics: currentBalance/monthlyDepositsThisMonth failed:", e)
  }

  const head          = $(".goals-head")
  const etaChip       = document.getElementById("go-eta-chip")
  const pickerHost    = document.getElementById("ana-picker-container")
  const completedBtn  = document.getElementById("go-completed-goals")
  const fromCompleted = !!(__ana && __ana.fromCompleted)

  if (head) {
    const headLeft = head.querySelector(".head-left") || head
    const titleEl  = headLeft.querySelector("h2")
    const subEl    = headLeft.querySelector("p")
    const backBtn  = document.getElementById("go-analytics-back")

    if (titleEl) titleEl.classList.add("shine-title")
    if (subEl) {
      subEl.textContent = "Plan your spending and track your progress."
      subEl.style.display = ""
    }
    if (backBtn) backBtn.onclick = () => {
      try { clearTimers() } catch {}
      goToList()
    }

  }

  if (etaChip) {
    etaChip.textContent = ""
    etaChip.style.display = fromCompleted ? "none" : "inline-flex"
  }
  if (pickerHost) {
    pickerHost.innerHTML = ""
    pickerHost.style.display = fromCompleted ? "none" : "inline-flex"
  }
  if (completedBtn) {
    completedBtn.style.display = fromCompleted ? "" : "none"
  }

  clearTimers()

  r.innerHTML = `
    <div class="ana-hero">
      <div class="ana-hero-left"></div>
      <div class="ana-hero-right"></div>
    </div>

    <div class="ana-summary-row">
      <div class="ana-summary-card ana-summary-financials">
        <div class="ana-summary-title">
          <div class="ana-summary-icon"><i class="fas fa-wallet"></i></div>
          <div class="ana-summary-label">FINANCIALS</div>
        </div>
        <div class="ana-summary-main" data-kpi="funded">$0.00</div>
        <div class="ana-summary-pill">Funded So Far</div>
        <div class="ana-summary-meta">
          <div>Amount Remaining: <span data-kpi="left">$0.00</span></div>
          <div>Target: <span data-kpi="price">$0.00</span></div>
        </div>
      </div>

      <div class="ana-summary-card ana-summary-status">
        <div class="ana-summary-title">
          <div class="ana-summary-icon"><i class="fas fa-briefcase"></i></div>
          <div class="ana-summary-label">STATUS</div>
        </div>
        <div class="ana-summary-main" data-kpi="next-amount">$0.00</div>
        <div class="ana-summary-sub" data-kpi="next-date">—</div>
        <div class="ana-summary-meta">
          <span data-kpi="remain">0</span> Deposits Remaining •
          <span data-kpi="pace">On Pace</span>
        </div>
      </div>

      <div class="ana-summary-card ana-summary-timeline">
        <div class="ana-summary-title">
          <div class="ana-summary-icon"><i class="fas fa-clock"></i></div>
          <div class="ana-summary-label">TIMELINE</div>
        </div>
        <div class="ana-summary-sub">Projected ETA:</div>
        <div class="ana-summary-date-wrap">
          <div class="ana-summary-date" data-kpi="eta-date">—</div>
          <div class="eta-note" data-kpi="eta-note"></div>
        </div>
      </div>
    </div>

    <div class="ana-grid">
      <div class="chart-container">
        <div class="chart-header">
          <div class="chart-title-group">
            <h4>Contribution Progress</h4>
            <button id="go-date-filter-btn" class="icon-btn" title="Filter by Date">
              <i class="fas fa-calendar-alt"></i>
            </button>
          </div>
          <div class="chart-legend"></div>
        </div>
        <canvas id="analytics-chart"></canvas>
        <div id="analytics-tooltip" class="chart-tooltip"></div>
      </div>

      <div class="whatif-card whatif-launch">
        <div id="go-ai-stage" class="lottie-stage"></div>
        <button id="open-whatif-modal" class="launch-button">What-If Calculator</button>
      </div>
    </div>

    <div class="transactions-container">
      <h4>Goal Transactions</h4>
      <div id="goal-transaction-list" class="transaction-list"></div>
    </div>
  `

  const allGoals = Array.isArray(sec.goals) ? sec.goals : []
  const goals = fromCompleted ? allGoals : allGoals.filter(g => g.status !== "completed")

  let currentId = (__ana && __ana.currentGoalId) || goals[0]?.id || null
  currentId = currentId == null ? null : String(currentId)

function setDefaultFilterForGoal(goal) {
  // Default to CURRENT half-year based on real "today"
  // (not goal.startDate, which can be Dec 2025 and force Jul–Dec 2025)
  const base = new Date()

  const y = base.getFullYear()
  const m = base.getMonth()
  let start, end

  if (m < 6) {
    start = new Date(y, 0, 1)
    end   = new Date(y, 6, 1)
  } else {
    start = new Date(y, 6, 1)
    end   = new Date(y + 1, 0, 1)
  }

  __ana.dateFilter = { start, end }
}

  if (goals.length) {
    const firstGoal = goals.find(g => String(g.id) === String(currentId)) || goals[0]
    currentId = String(firstGoal.id)
    __ana.currentGoalId = currentId

   if (!__ana.userSetDateFilter) setDefaultFilterForGoal(firstGoal)
  } else {
    __ana.dateFilter = null
    __ana.currentGoalId = null
    currentId = null
  }

  const pickerGoals = allGoals.filter(g => {
    if (g.status === "completed") return false
    const remaining = remainingNeeded(g, sec)
    return remaining > 0.005
  })

  $("#go-date-filter-btn")?.addEventListener("click", () => {
    try { openDateFilterModal(sec) } catch (e) { console.error(e) }
  })

  ;(function ensureInlineWhatIfModal() {
    if (document.getElementById("whatif-modal")) return

    document.body.insertAdjacentHTML("beforeend", `
      <dialog id="whatif-modal" class="modal">
        <div class="modal-form" style="max-width:1080px;">
          <div class="modal-header">
            <h3>What-If Calculator</h3>
            <button id="whatif-close-x" class="icon-btn" aria-label="Close">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body">
            <div id="whatif-left"></div>
            <div id="whatif-right" class="ai-panel">
              <div class="ai-head">
                <div class="ai-title">
                  <i class="fas fa-robot"></i><span>AI Analyst</span>
                </div>
                <button id="ai-analyze" class="btn primary sm">
                  <i class="fas fa-wand-magic-sparkles"></i> Analyze Scenarios
                </button>
              </div>
              <div id="ai-output" class="ai-output empty">
                I’ll read your goal and budget changes and write a concise plan here.
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn secondary" id="whatif-close">Close</button>
          </div>
        </div>
      </dialog>
    `)

    const dlg = $("#whatif-modal")
    const mb = $(".modal-body", dlg)
    if (mb) {
      mb.style.display = "grid"
      mb.style.gridTemplateColumns = "minmax(0,1.1fr) minmax(0,1fr)"
      mb.style.gap = "28px"
      mb.style.backgroundColor = "var(--color-bg)"
    }

    const close = () => dlg.close()
    dlg.addEventListener("click", (e) => { if (e.target === dlg) close() })
    $("#whatif-close", dlg)?.addEventListener("click", close)
    $("#whatif-close-x", dlg)?.addEventListener("click", close)
  })()

  const openWhatIf = async () => {
    const dlg = $("#whatif-modal")
    const mb  = $(".modal-body", dlg)

    if (mb) {
      mb.style.display = "grid"
      mb.style.gridTemplateColumns = "minmax(0,1.1fr) minmax(0,1fr)"
      mb.style.gap = "28px"
    }

    dlg?.showModal()

    try { await renderWhatIf() } catch (e) { console.error("renderWhatIf failed:", e) }

    const left = document.getElementById("whatif-left")
    if (left) {
      const table = left.querySelector("table")
      const rows  = table ? table.querySelectorAll("tbody tr") : left.querySelectorAll("tbody tr")

      rows.forEach(row => {
        const cells = row.querySelectorAll("td")
        if (!cells.length) return

        const catCell = cells[0]
        const labelText = (catCell.textContent || "")
          .replace(/\s+/g, " ")
          .toLowerCase()
          .trim()

        if (labelText.includes("savings goal")) {
          row.remove()
          return
        }

        const newLimitCell = cells[cells.length - 1]
        const input =
          newLimitCell.querySelector('input[type="number"]') ||
          newLimitCell.querySelector("input")

        if (input) {
          input.value = ""
          if (!input.placeholder) input.placeholder = "$0"
        }
      })
    }

    try { wireAIAnalyze() } catch (e) { console.error("wireAIAnalyze failed:", e) }
  }

  $("#open-whatif-modal")?.addEventListener("click", openWhatIf)
  $("#go-ai-stage")?.addEventListener("click", openWhatIf)
  try { ensureLottieLib(() => mountAIAnim()) } catch (e) { console.error(e) }

function updateEtaChip(goal) {
  if (!etaChip) return

  if (__ana.fromCompleted || !goal) {
    etaChip.textContent = ""
    etaChip.style.display = "none"
    return
  }

  const section = (__ana && __ana.section) || sec || null

  let fullyFunded = false
  if (section) {
    const target = priceTarget(goal, section) || 0
    const funded = fundedAmountToDate(goal, section) || 0
    const remaining = Math.max(0, target - funded)
    fullyFunded = remaining <= 1e-6 || String(goal.status || "").trim().toLowerCase() === "completed"
  } else {
    fullyFunded = String(goal.status || "").trim().toLowerCase() === "completed"
  }

  if (fullyFunded) {
    etaChip.style.display = "inline-flex"
    etaChip.innerHTML =
      `<span class="eta-chip-text">Goal is fully funded</span>` +
      `<i class="fas fa-rocket eta-chip-icon" style="margin-left:0.4rem;"></i>`
    return
  }

  const endISO = goal.endDate || (section && section.endISO) || (sec && sec.endISO)
  if (!endISO) {
    etaChip.textContent = ""
    etaChip.style.display = "none"
    return
  }

  const end = new Date(endISO)
  const t = end.getTime()
  if (!Number.isFinite(t)) {
    etaChip.textContent = ""
    etaChip.style.display = "none"
    return
  }

  const now = new Date()
  const diff = Math.max(0, t - now.getTime())

  const secRem  = Math.floor(diff / 1000) % 60
  const minRem  = Math.floor(diff / (1000 * 60)) % 60
  const dayRem  = Math.floor(diff / DAY_MS) % 365
  const yearRem = Math.floor(diff / (DAY_MS * 365))

  const s = (v, label) => `${v} ${label}${v !== 1 ? "s" : ""}`
  const parts = []

  if (yearRem > 0) {
    parts.push(s(yearRem, "year"))
    parts.push(s(dayRem, "day"))
  } else if (dayRem > 0) {
    parts.push(s(dayRem, "day"))
    parts.push(s(minRem, "minute"))
  } else {
    parts.push(s(minRem, "minute"))
    parts.push(s(secRem, "second"))
  }

  etaChip.textContent = `Goal ends in ${parts.join(" ")}`
  etaChip.style.display = "inline-flex"
}

if (pickerGoals.length && pickerHost && !__ana.fromCompleted) {
  if (!pickerGoals.some(g => String(g.id) === String(currentId))) {
    currentId = String(pickerGoals[0].id)
    __ana.currentGoalId = currentId
  }

  createCustomPicker(pickerGoals, currentId, (newId) => {
    currentId = String(newId)
    __ana.currentGoalId = currentId
    const g = allGoals.find(x => String(x.id) === String(currentId))
    if (g) setDefaultFilterForGoal(g)
    recompute()
  })

  pickerHost.style.display = "inline-flex"
} else if (pickerHost) {
  pickerHost.innerHTML = ""
  pickerHost.style.display = "none"
}


function recompute() {
  const goal = goals.find(g => String(g.id) === String(currentId))
  if (!goal) {
    const c = $(".chart-container")
    if (c) c.innerHTML = '<div class="empty">Select a goal to see the chart.</div>'
    updateEtaChip(null)
    return
  }

  __ana.section = sec
  __ana.goal = goal

  if (completedBtn) {
    completedBtn.textContent = __ana.fromCompleted ? (goal.name || "Completed Goal") : "Completed Goals"
  }

  updateEtaChip(goal)

  const plan = computePlan(goal, sec)
  const amountRemaining = remainingNeeded(goal, sec)
  const funded = fundedAmountToDate(goal, sec)
  const price  = priceTarget(goal, sec)

  let nextDateLabel = "—"
  if (plan.depositsRemaining && plan.adjusted && plan.adjusted[0]) {
    const base = pISO(plan.adjusted[0].date)
    if (goal.depositTime) {
      const [hh, mm] = goal.depositTime.split(":").map(Number)
      base.setHours(hh || 0, mm || 0, 0, 0)
      nextDateLabel = fmtDateTime.format(base)
    } else {
      nextDateLabel = fmtDate.format(base)
    }
  }

  const hasPlan      = Number(goal.minMonthlyDeposit) > 0 && !goal.depositPaused
  const fullyFunded  = amountRemaining <= 1e-6 || String(goal.status || "").trim().toLowerCase() === "completed"
  const hasProgress  = funded > 0

  let paceLabel
  if (fullyFunded) paceLabel = "Completed"
  else if (!hasPlan) paceLabel = "Manual only"
  else if (!hasProgress) paceLabel = "On Pace"
  else {
    const endDate = goal.endDate ? pISO(goal.endDate) : null
    if (endDate && plan.lastDueDate && plan.lastDueDate > endDate) paceLabel = "Needs attention"
    else if (plan.ahead) paceLabel = "Great"
    else paceLabel = "On Pace"
  }

  renderAnalyticsKpis({
    nextAmount: plan.nextAmount || 0,
    nextDateLabel,
    depositsRemaining: plan.depositsRemaining,
    amountRemaining,
    pace: paceLabel
  })

  const endDate = goal.endDate ? pISO(goal.endDate) : null
  let etaDate = "—"
  let etaNote = ""
  let etaGood = false
  let etaBad  = false

  if (fullyFunded) {
    etaDate = "Ready now"
    etaNote = "Goal is fully funded"
    etaGood = true
  } else if (hasPlan && plan.lastDueDate) {
    if (endDate) {
      if (plan.lastDueDate <= endDate) {
        etaDate = fmtDate.format(plan.lastDueDate)

        const now = new Date()

        const startISO = goal.startDate || (sec && sec.startISO) || goal.depositDate || null
        let start = startISO ? new Date(startISO) : null
        if (!start || !Number.isFinite(start.getTime())) {
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        }

        const monthsBetweenFloor = (a, b) => {
          if (!(a instanceof Date) || !(b instanceof Date)) return 0
          if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return 0
          if (b <= a) return 0
          let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
          if (b.getDate() < a.getDate()) m--
          return Math.max(0, m)
        }

        const totalMonths = Math.max(1, monthsBetweenFloor(start, endDate))
        const elapsedMonths = now < start ? 0 : Math.min(totalMonths, monthsBetweenFloor(start, now) + 1)

        const pace = (price > 0 && totalMonths > 0) ? (price / totalMonths) : 0
        const expectedFundedToDate = pace * elapsedMonths
        const delta = (funded || 0) - expectedFundedToDate

        const eps = 0.01

        if (pace <= eps || price <= eps) {
          etaNote = "Stable"
          etaGood = true
        } else if (delta >= pace - eps && hasProgress) {
          const monthsAhead = Math.floor(delta / pace)
          if (monthsAhead > 0) {
            const years = Math.floor(monthsAhead / 12)
            const rem = monthsAhead % 12
            let label
            if (years > 0 && rem > 0) label = `${years} year${years > 1 ? "s" : ""} ${rem} month${rem > 1 ? "s" : ""} ahead of schedule`
            else if (years > 0) label = `${years} year${years > 1 ? "s" : ""} ahead of schedule`
            else label = `${monthsAhead} month${monthsAhead > 1 ? "s" : ""} ahead of schedule`
            etaNote = label
          } else {
            etaNote = "Stable"
          }
          etaGood = true
        } else if (delta >= -pace + eps) {
          etaNote = "Stable"
          etaGood = true
        } else {
          const deficit = Math.max(0, expectedFundedToDate - (funded || 0))
          const need = Math.ceil(deficit)
          const missedMonths = Math.floor(deficit / pace)

          if (missedMonths >= 2) etaNote = `In danger — deposit $${need.toLocaleString()}`
          else etaNote = `At risk — deposit $${need.toLocaleString()}`
          etaBad = true
        }

        if (!etaBad) etaGood = true
      } else {
        etaDate = fmtDate.format(plan.lastDueDate)
        etaNote = "Behind schedule"
        etaBad  = true
      }
    } else {
      etaDate = fmtDate.format(plan.lastDueDate)
      etaGood = true
    }
  } else if (endDate) {
    etaDate = fmtDate.format(endDate)
  }

  const fundedEl  = $('[data-kpi="funded"]')
  const priceEl   = $('[data-kpi="price"]')
  const etaDateEl = $('[data-kpi="eta-date"]')
  const etaNoteEl = $('[data-kpi="eta-note"]')

  if (fundedEl) fundedEl.textContent = fmt.format(funded)
  if (priceEl)  priceEl.textContent  = fmt.format(price)
  if (etaDateEl) etaDateEl.textContent = etaDate

  if (etaNoteEl) {
    etaNoteEl.classList.remove("eta-good", "eta-bad", "visible")
    if (etaNote) {
      etaNoteEl.innerHTML =
        `<span class="eta-note-text">${etaNote}</span>` +
        `<i class="fas fa-rocket eta-note-icon"></i>`
      if (etaGood) etaNoteEl.classList.add("eta-good")
      if (etaBad)  etaNoteEl.classList.add("eta-bad")
      etaNoteEl.classList.add("visible")
    } else {
      etaNoteEl.innerHTML = ""
    }
  }

  try { renderTx(goal) } catch (e) { console.error("renderTx failed:", e) }
  try { renderRibbonChart(goal, sec) } catch (e) { console.error("renderRibbonChart failed:", e) }
}

try {
  recompute()
} catch (err) {
  console.error("renderAnalytics recompute failed:", err)
  const c = $(".chart-container")
  if (c) c.innerHTML = `<div class="empty">Analytics failed to render. Open DevTools console for details.</div>`
}
 
}



 // createCustomPicker: builds the dropdown goal picker in analytics header
function createCustomPicker(goals, selectedId, onChange) {
  const container = $("#ana-picker-container")
  if (!container) return

  if (!Array.isArray(goals) || !goals.length) {
    container.innerHTML = "<span>No active goals in this section.</span>"
    return
  }

  const selId = selectedId != null ? String(selectedId) : ""
  const selected = goals.find(g => String(g.id) === selId) || goals[0]

  container.innerHTML = `
    <button class="picker-btn" type="button">
      <span class="picker-icon"><i class="fas fa-bullseye"></i></span>
      <span id="picker-selected-label" class="picker-label">${esc(selected.name)}</span>
      <i class="fas fa-chevron-down picker-caret"></i>
    </button>
    <div class="picker-options">
      ${goals.map(g => `
        <div class="picker-option" data-value="${esc(String(g.id))}">
          <i class="fas fa-bullseye icon"></i>
          <span class="picker-option-label">
            ${esc(g.name)} &nbsp; ${fmt.format(priceTarget(g))}
          </span>
        </div>
      `).join("")}
    </div>
  `

  const btn = $(".picker-btn", container)
  const box = $(".picker-options", container)

  if (btn) {
    btn.addEventListener("click", (e) => {
      e.stopPropagation()
      btn.classList.toggle("open")
      if (box) box.classList.toggle("show")
    })
  }

  $$(".picker-option", container).forEach(opt => {
    opt.addEventListener("click", (e) => {
      e.stopPropagation()

      const labelSpan = opt.querySelector(".picker-option-label")
      const labelEl = $("#picker-selected-label")
      if (labelEl) {
        labelEl.textContent =
          labelSpan?.textContent ||
          opt.querySelector("span")?.textContent ||
          ""
      }

      if (btn) btn.classList.remove("open")
      if (box) box.classList.remove("show")

      const val = opt.dataset.value != null ? String(opt.dataset.value) : ""
      if (typeof onChange === "function") onChange(val)
    })
  })

  if (container._pickerDocHandler) {
    document.removeEventListener("click", container._pickerDocHandler)
    container._pickerDocHandler = null
  }

  container._pickerDocHandler = (e) => {
    if (!container.contains(e.target)) {
      if (btn) btn.classList.remove("open")
      if (box) box.classList.remove("show")
    }
  }

  document.addEventListener("click", container._pickerDocHandler)
}

 
// renderTx: shows executed deposits for analytics goal (past only)
function renderTx(goal) {
  const host = $("#goal-transaction-list")
  if (!host || !__ana.section) return

  const now = new Date()

  const pWall = (s) => {
    if (!s) return new Date(NaN)
    if (s instanceof Date) return s
    const str = String(s).trim()
    if (!str) return new Date(NaN)

    const m = str.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/
    )
    if (!m) return new Date(str)

    const Y = Number(m[1])
    const Mo = Number(m[2]) - 1
    const D = Number(m[3])
    const H = m[4] != null ? Number(m[4]) : 0
    const Mi = m[5] != null ? Number(m[5]) : 0
    const S = m[6] != null ? Number(m[6]) : 0
    return new Date(Y, Mo, D, H, Mi, S, 0)
  }

  const pInstant = (s) => pISO(s)

  const executed = executedDeposits(goal)
    .filter(d => {
      const isAuto = String(d.type || "").toLowerCase().startsWith("auto")
      const dt = isAuto ? pWall(d.date) : pInstant(d.date)
      return dt instanceof Date && Number.isFinite(dt.getTime()) && dt <= now
    })
    .sort((a, b) => {
      const aAuto = String(a.type || "").toLowerCase().startsWith("auto")
      const bAuto = String(b.type || "").toLowerCase().startsWith("auto")
      const da = aAuto ? pWall(a.date) : pInstant(a.date)
      const db = bAuto ? pWall(b.date) : pInstant(b.date)
      const ta = da instanceof Date && Number.isFinite(da.getTime()) ? da.getTime() : 0
      const tb = db instanceof Date && Number.isFinite(db.getTime()) ? db.getTime() : 0
      return tb - ta
    })

  if (!executed.length) {
    host.innerHTML = `<div class="empty" style="padding:20px;">No transactions have occurred yet.</div>`
    return
  }

  host.innerHTML = executed.map(d => {
    const t = String(d.type || "").toLowerCase()
    const isAuto = t.startsWith("auto")
    const st = String(d.status || "").toLowerCase()
    const isMissed = st === "missed" || d.missed === true

    const dt = isAuto ? pWall(d.date) : pInstant(d.date)
    const amt = Number(d.amount) || 0

    const label =
      isAuto
        ? (isMissed ? "Auto-Deposit (missed)" : "Auto-Deposit")
        : "Manual Deposit"

    const amountClass =
      isMissed ? "transaction-amount missed" : "transaction-amount income"

    const amountText =
      isMissed ? fmt.format(amt) : `+${fmt.format(amt)}`

    return `
      <div class="transaction-item">
        <div class="transaction-details">
          <div class="type">${label}</div>
          <div class="date">${fmtDateTime.format(dt)}</div>
        </div>
        <div class="${amountClass}">${amountText}</div>
      </div>
    `
  }).join("")
}


// openDateFilterModal: compact year + half-year picker for chart
function openDateFilterModal(section) {
  let modal = $('#go-date-filter-modal');
  if (!modal) {
    document.body.insertAdjacentHTML('beforeend', `
      <dialog id="go-date-filter-modal" class="modal">
        <div class="modal-form">
          <div class="modal-header">
            <h3>Filter Chart by Date</h3>
            <button type="button" class="icon-btn" id="go-date-filter-close">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body" id="go-date-filter-body"></div>
          <div class="modal-footer">
            <button type="button" class="btn secondary" id="go-date-filter-cancel">Cancel</button>
            <button type="button" class="btn primary" id="go-date-filter-confirm">Confirm</button>
          </div>
        </div>
      </dialog>
    `);
    modal = $('#go-date-filter-modal');
    $('#go-date-filter-close').addEventListener('click', () => modal.close());
    $('#go-date-filter-cancel').addEventListener('click', () => modal.close());
    modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });
  }

  const body = $('#go-date-filter-body');
  body.innerHTML = '';

  const goal = __ana.goal;
  if (!goal) {
    body.innerHTML = '<div class="empty">No goal selected.</div>';
    modal.showModal();
    return;
  }

  // --- build full deposit timeline: executed + upcoming (respecting finish date) ---

  const executed = executedDeposits(goal, { includePlanned: false }) || [];
  let fundedSoFar = 0;
  executed.forEach(ev => {
    fundedSoFar += Number(ev.amount) || 0;
  });

  const targetAmount = priceTarget(goal) || 0;
  let amountRemaining = Math.max(0, targetAmount - fundedSoFar);

  const minMonthly = Number(goal.minMonthlyDeposit || 0);
  const now = new Date();

  // finish date (try finishDate, fall back to endDate if needed)
  let finish = null;
  if (goal.finishDate) finish = pISO(goal.finishDate);
  else if (goal.endDate) finish = pISO(goal.endDate);
  if (!(finish instanceof Date) || !isFinite(finish)) finish = null;

  const upcoming = [];
  if (minMonthly > 0 && goal.depositDate && amountRemaining > 0) {
    const pad2 = n => String(n).padStart(2, "0");

    let base = pISO(goal.depositDate);
    if (!(base instanceof Date) || !isFinite(base)) base = now;

    let hh = 8, mm = 0;
    if (typeof goal.depositTime === "string" &&
        /^([01]\d|2[0-3]):([0-5]\d)$/.test(goal.depositTime)) {
      hh = Number(goal.depositTime.slice(0, 2));
      mm = Number(goal.depositTime.slice(3, 5));
    }
    base = new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh, mm, 0, 0);

    // IMPORTANT FIX:
    // JS Date month+1 with day 29/30/31 can skip months (Feb) by rolling into March.
    // We clamp to the last day of the target month using the original "desired day".
    const desiredDay = base.getDate();
    const addMonthClamped = (d) => {
      const y = d.getFullYear();
      const m = d.getMonth() + 1; // next month
      const last = new Date(y, m + 1, 0).getDate();
      const day = Math.min(desiredDay, last);
      return new Date(y, m, day, d.getHours(), d.getMinutes(), 0, 0);
    };

    // how many monthly slots remain until finish date?
    let monthsRemainingByFinish = Infinity;
    if (finish) {
      let tmp = new Date(base);
      let count = 0;
      let guardMonths = 600;
      while (guardMonths-- > 0 && tmp <= finish) {
        if (tmp > now) count++;
        tmp = addMonthClamped(tmp);
      }
      monthsRemainingByFinish = count;
    }

    const monthsNeeded = minMonthly > 0
      ? Math.max(0, Math.ceil(amountRemaining / minMonthly))
      : 0;

    const maxUpcomingMonths = Math.min(monthsRemainingByFinish, monthsNeeded);

    // IMPORTANT FIX:
    // Advance to the first upcoming deposit without consuming the maxUpcomingMonths count.
    let next = new Date(base);
    let preGuard = 600;
    while (preGuard-- > 0 && next <= now) {
      next = addMonthClamped(next);
      if (finish && next > finish) break;
    }

    let i = 0;
    while (i < maxUpcomingMonths && amountRemaining > 0) {
      if (next > now && (!finish || next <= finish)) {
        const amtForThis = Math.min(minMonthly, amountRemaining);
        upcoming.push({
          date: `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`,
          time: `${pad2(next.getHours())}:${pad2(next.getMinutes())}`,
          amount: amtForThis,
          type: "auto",
          future: true,
          status: "upcoming"
        });
        amountRemaining -= amtForThis;
        i++;
      } else {
        // safety: if we somehow landed in the past again, do not burn i
      }

      next = addMonthClamped(next);
      if (finish && next > finish) break;
    }
  }

  const allEvents = [...executed, ...upcoming];

  const events = allEvents
    .map(ev => {
      let d = pISO(ev.date);
      if (!(d instanceof Date) || !isFinite(d)) return null;
      if (ev.future && typeof ev.time === "string" &&
          /^([01]\d|2[0-3]):([0-5]\d)$/.test(ev.time)) {
        const hh = Number(ev.time.slice(0, 2));
        const mm = Number(ev.time.slice(3, 5));
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0);
      }
      return d;
    })
    .filter(d => d && isFinite(d))
    .sort((a, b) => a - b);

  if (!events.length) {
    body.innerHTML = '<div class="empty">No deposits to filter yet.</div>';
    modal.showModal();
    return;
  }

  // collect which half-years exist per year
  const rangesByYear = new Map();
  for (const d of events) {
    const y = d.getFullYear();
    const half = d.getMonth() < 6 ? 'h1' : 'h2';
    let info = rangesByYear.get(y);
    if (!info) {
      info = { year: y, hasH1: false, hasH2: false };
      rangesByYear.set(y, info);
    }
    if (half === 'h1') info.hasH1 = true;
    else info.hasH2 = true;
  }

  const years = [...rangesByYear.keys()].sort((a, b) => a - b);
  if (!years.length) {
    body.innerHTML = '<div class="empty">No deposit activity in any half-year range.</div>';
    modal.showModal();
    return;
  }

  // initial selection
  let selectedYear = years[0];
  let activeHalf = 'h1';
  let tempFilter = { ...__ana.dateFilter };

  if (tempFilter?.start && tempFilter?.end) {
    const s = tempFilter.start;
    const y = s.getFullYear();
    const m = s.getMonth();
    if (rangesByYear.has(y)) {
      selectedYear = y;
      activeHalf = m < 6 ? 'h1' : 'h2';
    }
  } else {
    const now2 = new Date();
    const ny = now2.getFullYear();
    if (rangesByYear.has(ny)) selectedYear = ny;
    const info = rangesByYear.get(selectedYear);
    if (info && !info.hasH1 && info.hasH2) activeHalf = 'h2';
  }

  body.innerHTML = `
    <div class="filter-simple-layout">
      <div class="filter-row">
        <div class="filter-label">Year</div>
        <div class="year-picker">
          <button type="button" id="go-year-btn" class="year-btn">
            <span id="go-year-label"></span>
            <i class="fas fa-chevron-down year-caret"></i>
          </button>
          <div id="go-year-dropdown" class="year-dropdown"></div>
        </div>
      </div>

      <div class="filter-row">
        <div class="filter-label">Months</div>
        <div class="half-btn-group">
          <button type="button" class="half-btn" data-half="h1">Jan - Jun</button>
          <button type="button" class="half-btn" data-half="h2">Jul - Dec</button>
        </div>
      </div>

      <div class="filter-hint">Only ranges with deposit activity are enabled.</div>
    </div>
  `;

  const yearBtn      = $('#go-year-btn', body);
  const yearLabelEl  = $('#go-year-label', body);
  const yearDropdown = $('#go-year-dropdown', body);
  const halfButtons  = $$('.half-btn', body);

  yearDropdown.innerHTML = years.map(y => `
    <button type="button" class="year-option" data-year="${y}">${y}</button>
  `).join('');

  function setYear(y) {
    selectedYear = y;
    yearLabelEl.textContent = y;
    refreshHalfButtons();
  }

  function refreshHalfButtons() {
    const info = rangesByYear.get(selectedYear) || { hasH1: false, hasH2: false };
    let hasH1 = info.hasH1;
    let hasH2 = info.hasH2;

    if (activeHalf === 'h1' && !hasH1 && hasH2) activeHalf = 'h2';
    if (activeHalf === 'h2' && !hasH2 && hasH1) activeHalf = 'h1';

    halfButtons.forEach(btn => {
      const h = btn.dataset.half;
      const enabled = h === 'h1' ? hasH1 : hasH2;
      btn.disabled = !enabled;
      btn.classList.toggle('disabled', !enabled);
      btn.classList.toggle('active', enabled && h === activeHalf);
    });

    const start = new Date(selectedYear, activeHalf === 'h1' ? 0 : 6, 1);
    const end   = activeHalf === 'h1'
      ? new Date(selectedYear, 6, 1)
      : new Date(selectedYear + 1, 0, 1);

    tempFilter = { start, end };
  }

  setYear(selectedYear);

  function closeDropdown() {
    yearDropdown.classList.remove('open');
    yearBtn.classList.remove('open');
  }

  yearBtn.addEventListener('click', e => {
    e.stopPropagation();
    yearDropdown.classList.toggle('open');
    yearBtn.classList.toggle('open');
  });

  $$('.year-option', yearDropdown).forEach(opt => {
    opt.addEventListener('click', e => {
      e.stopPropagation();
      const y = Number(opt.dataset.year);
      if (rangesByYear.has(y)) {
        setYear(y);
      }
      closeDropdown();
    });
  });

  document.addEventListener('click', function onDocClick(e) {
    const inside = yearBtn.contains(e.target) || yearDropdown.contains(e.target);
    if (!inside) closeDropdown();
    if (!modal.open) document.removeEventListener('click', onDocClick);
  });

  halfButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      activeHalf = btn.dataset.half;
      refreshHalfButtons();
    });
  });

  refreshHalfButtons();

$('#go-date-filter-confirm').onclick = () => {
  __ana.userSetDateFilter = true;
  __ana.dateFilter = tempFilter;
  renderAnalytics(__ana.section.id);
  modal.close();
};

  modal.showModal();
}


function renderRibbonChart(goal, section) {
  const cvs = document.getElementById('analytics-chart')
  if (!cvs) return
  const ctx = cvs.getContext('2d')
  const host = cvs.closest('.chart-container')
  if (!host) return

  const COLOR_AUTO_PAID     = '#3b82f6'
  const COLOR_AUTO_MISSED   = '#ef4444'
  const COLOR_AUTO_UPCOMING = '#8b5cf6'
  const COLOR_MANUAL        = '#22c55e'

  const legend = host.querySelector('.chart-legend')
  if (legend) {
    legend.innerHTML = `
      <span style="display:inline-flex;align-items:center;gap:6px;margin-right:14px;">
        <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${COLOR_AUTO_PAID};"></span> Auto (paid)
      </span>
      <span style="display:inline-flex;align-items:center;gap:6px;margin-right:14px;">
        <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${COLOR_AUTO_MISSED};"></span> Auto (missed)
      </span>
      <span style="display:inline-flex;align-items:center;gap:6px;margin-right:14px;">
        <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${COLOR_AUTO_UPCOMING};"></span> Auto (upcoming)
      </span>
      <span style="display:inline-flex;align-items:center;gap:6px;">
        <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${COLOR_MANUAL};"></span> Manual
      </span>`
  }

  // If no filter is set yet, default to the CURRENT half-year:
  // Jan–Jun when current month is 0..5, Jul–Dec when current month is 6..11.
  if (!__ana.dateFilter || !__ana.dateFilter.start || !__ana.dateFilter.end) {
    const now = new Date()
    const y = now.getFullYear()
    const h2 = now.getMonth() >= 6

    const start = new Date(y, h2 ? 6 : 0, 1)
    const end = h2 ? new Date(y + 1, 0, 1) : new Date(y, 6, 1)

    __ana.dateFilter = { start, end }
  }


  if (!__ana.chartObserver) {
    __ana.chartObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (__ana.goal && __ana.section) renderRibbonChart(__ana.goal, __ana.section)
      })
    })
    __ana.chartObserver.observe(host)
  }

  const dpr = window.devicePixelRatio || 1
  const rect = cvs.getBoundingClientRect()
  const width  = rect.width  || host.clientWidth  || 600
  const height = rect.height || host.clientHeight || 300

  if (cvs.width !== width * dpr || cvs.height !== height * dpr) {
    cvs.width  = width * dpr
    cvs.height = height * dpr
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const W = width
  const H = height
  const PAD = { top: 40, right: 20, bottom: 40, left: 60 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const now = new Date()

  const hasTimeInString = (s) => {
    const str = String(s || "").trim()
    if (!str) return false
    return /\d{2}:\d{2}/.test(str)
  }

  const bestStamp = (ev) =>
    ev.executedAt || ev.executed_at ||
    ev.createdAt  || ev.created_at  ||
    ev.timestamp  || ev.timeStamp   ||
    ev.time       || null

  const eventDateTime = (ev) => {
    if (!ev) return new Date(NaN)

    // Future autos: date + explicit time
    if (
      ev.future &&
      typeof ev.time === "string" &&
      /^([01]\d|2[0-3]):([0-5]\d)$/.test(ev.time)
    ) {
      let d = pISO(ev.date)
      if (d instanceof Date && Number.isFinite(d.getTime())) {
        const hh = Number(ev.time.slice(0, 2))
        const mm = Number(ev.time.slice(3, 5))
        return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0)
      }
    }

    // Executed: if date is missing a time, prefer createdAt/executedAt
    const dateRaw = ev.date
    const stampRaw = bestStamp(ev)

    if (dateRaw && !hasTimeInString(dateRaw) && stampRaw) {
      const t = pISO(stampRaw)
      if (t instanceof Date && Number.isFinite(t.getTime())) return t
    }

    const d1 = pISO(dateRaw || stampRaw)
    return d1 instanceof Date && Number.isFinite(d1.getTime()) ? d1 : new Date(NaN)
  }

  const executed = executedDeposits(goal, { includePlanned: false }) || []
  const goalStart = goal.startDate ? pISO(goal.startDate) : null
  const price = priceTarget(goal) || 1

  let fundedSoFar = 0
  executed.forEach(d => {
    const st = String(d?.status || "").toLowerCase()
    const isMissed = st === "missed" || d.missed === true
    if (!isMissed) fundedSoFar += Number(d.amount) || 0
  })

  let amountRemaining = Math.max(0, price - fundedSoFar)
  const minMonthly = Number(goal.minMonthlyDeposit || 0)

  let finish = null
  if (goal.finishDate) finish = pISO(goal.finishDate)
  else if (goal.endDate) finish = pISO(goal.endDate)
  if (!(finish instanceof Date) || !Number.isFinite(finish.getTime())) finish = null

  const upcoming = []
  if (minMonthly > 0 && goal.depositDate && !goal.depositPaused && amountRemaining > 0) {
    const pad2 = n => String(n).padStart(2, "0")

    let hh = 8, mm = 0
    if (
      typeof goal.depositTime === "string" &&
      /^([01]\d|2[0-3]):([0-5]\d)$/.test(goal.depositTime)
    ) {
      hh = Number(goal.depositTime.slice(0, 2))
      mm = Number(goal.depositTime.slice(3, 5))
    }

    let base = parseLocalDateTime(goal.depositDate, `${pad2(hh)}:${pad2(mm)}`)
    if (!(base instanceof Date) || !Number.isFinite(base.getTime())) base = new Date(now.getTime())

    const desiredDay = base.getDate()

    let monthsRemainingByFinish = Infinity
    if (finish) {
      let tmp = new Date(base.getTime())
      let count = 0
      let guardMonths = 600
      while (guardMonths-- > 0 && tmp <= finish) {
        if (tmp > now) count++
        tmp = addMonthsClamped(tmp, 1, desiredDay, tmp.getHours(), tmp.getMinutes())
      }
      monthsRemainingByFinish = count
    }

    const monthsNeeded = minMonthly > 0
      ? Math.max(0, Math.ceil(amountRemaining / minMonthly))
      : 0

    const maxUpcomingMonths = Math.min(monthsRemainingByFinish, monthsNeeded)

    let next = new Date(base.getTime())
    let preGuard = 600
    while (preGuard-- > 0 && next <= now) {
      next = addMonthsClamped(next, 1, desiredDay, next.getHours(), next.getMinutes())
      if (finish && next > finish) break
    }

    let guard = maxUpcomingMonths
    while (guard-- > 0 && amountRemaining > 0) {
      if (next > now && (!finish || next <= finish)) {
        const amtForThis = Math.min(minMonthly, amountRemaining)

        upcoming.push({
          date: `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`,
          time: `${pad2(next.getHours())}:${pad2(next.getMinutes())}`,
          amount: amtForThis,
          type: "auto",
          future: true,
          status: "upcoming"
        })

        amountRemaining -= amtForThis
      }

      next = addMonthsClamped(next, 1, desiredDay, next.getHours(), next.getMinutes())
      if (finish && next > finish) break
    }
  }

  const allDeposits = [...executed, ...upcoming].sort((a, b) => {
    const da = eventDateTime(a)
    const db = eventDateTime(b)
    const ta = da instanceof Date && Number.isFinite(da.getTime()) ? da.getTime() : 0
    const tb = db instanceof Date && Number.isFinite(db.getTime()) ? db.getTime() : 0
    return ta - tb
  })

  let baseCumulative = 0
  allDeposits.forEach(ev => {
    const dt = eventDateTime(ev)
    if (!(dt instanceof Date) || !Number.isFinite(dt.getTime())) return
    if (goalStart && dt < goalStart) return
    if (dt < __ana.dateFilter.start) {
      const st = String(ev?.status || "").toLowerCase()
      const isMissed = st === "missed" || ev.missed === true
      if (!isMissed) baseCumulative += Number(ev.amount) || 0
    }
  })

  const chartEvents = allDeposits.filter(ev => {
    const dt = eventDateTime(ev)
    if (!(dt instanceof Date) || !Number.isFinite(dt.getTime())) return false
    if (goalStart && dt < goalStart) return false
    return dt >= __ana.dateFilter.start && dt < __ana.dateFilter.end
  })

  ctx.clearRect(0, 0, W, H)

  if (!chartEvents.length) {
    ctx.fillStyle = '#6b7280'
    ctx.font = '14px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('No deposits in this period.', W / 2, H / 2)
    return
  }

  const maxY = price
  const barWidth = Math.max(20, Math.min(50, chartW / (chartEvents.length + 2) * 0.8))
  const xStep = chartW / (chartEvents.length > 1 ? chartEvents.length : 2)

  const xTo = (i) => PAD.left + (chartEvents.length > 1 ? i * xStep + xStep / 2 : chartW / 2)
  const yTo = (v) => PAD.top + chartH - (v / maxY) * chartH

  ctx.strokeStyle = '#eef2f7'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i <= 4; i++) {
    const y = yTo(i * maxY / 4)
    ctx.moveTo(PAD.left, y)
    ctx.lineTo(PAD.left + chartW, y)
  }
  ctx.stroke()

  let cumulativeTotal = baseCumulative
  const hits = []

  chartEvents.forEach((event, i) => {
    const dt = eventDateTime(event)
    if (!(dt instanceof Date) || !Number.isFinite(dt.getTime())) return

    const st = String(event?.status || "").toLowerCase()
    const isMissed = st === "missed" || event.missed === true

    if (!isMissed) cumulativeTotal += Number(event.amount) || 0
    const cappedCum = Math.min(cumulativeTotal, maxY)

    const x = xTo(i) - barWidth / 2
    const y = yTo(maxY)
    const heightBar = H - PAD.bottom - y
    const pct = Math.min(1, cappedCum / maxY)

    ctx.fillStyle = '#e5e7eb'
    ctx.beginPath()
    ctx.roundRect(x, y, barWidth, heightBar, [5, 5, 0, 0])
    ctx.fill()

    let mode = 'autoPaid'
    if (String(event.type || "").toLowerCase() === 'manual') {
      mode = 'manual'
    } else {
      if (isMissed) mode = 'autoMissed'
      else if (event.future) mode = 'autoUpcoming'
      else mode = 'autoPaid'
    }

    let barColor = COLOR_AUTO_PAID
    let kindLabel = 'Auto (paid)'
    if (mode === 'autoMissed') {
      barColor = COLOR_AUTO_MISSED
      kindLabel = 'Auto (missed)'
    } else if (mode === 'autoUpcoming') {
      barColor = COLOR_AUTO_UPCOMING
      kindLabel = 'Auto (upcoming)'
    } else if (mode === 'manual') {
      barColor = COLOR_MANUAL
      kindLabel = 'Manual'
    }

    const fillHeight = heightBar * pct
    const fillY = y + (heightBar - fillHeight)

    ctx.fillStyle = barColor
    ctx.beginPath()
    ctx.roundRect(x, fillY, barWidth, fillHeight, [5, 5, 0, 0])
    ctx.fill()

    const pctText = `${Math.round(pct * 100)}%`
    ctx.font = 'bold 12px system-ui'
    ctx.textAlign = 'center'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(15,23,42,0.85)'
    ctx.strokeText(pctText, x + barWidth / 2, y - 8)
    ctx.fillStyle = '#e5e7eb'
    ctx.fillText(pctText, x + barWidth / 2, y - 8)

    ctx.fillStyle = '#64748b'
    ctx.font = '11px system-ui'
    const dateLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(dt)
    ctx.fillText(dateLabel, x + barWidth / 2, H - PAD.bottom + 15)

    hits.push({
      x,
      y,
      w: barWidth,
      h: heightBar,
      event: {
        ...event,
        cumulative: cappedCum,
        dateObj: dt,
        mode,
        kindLabel
      }
    })
  })

  ctx.fillStyle = '#64748b'
  ctx.font = '12px system-ui'
  ctx.textAlign = 'right'
  for (let i = 0; i <= 4; i++) {
    const val = i * maxY / 4
    ctx.fillText(fmt.format(val).replace('.00', ''), PAD.left - 8, yTo(val) + 4)
  }

  const tip = document.getElementById('analytics-tooltip')
  if (!tip) return

  if (!cvs._tooltipHandlers) cvs._tooltipHandlers = {}
  const oldMove  = cvs._tooltipHandlers.moveHandler
  const oldLeave = cvs._tooltipHandlers.leaveHandler
  if (oldMove)  cvs.removeEventListener('mousemove',  oldMove)
  if (oldLeave) cvs.removeEventListener('mouseleave', oldLeave)

  const moveHandler = (e) => {
    const r = cvs.getBoundingClientRect()
    const mx = e.clientX - r.left
    const my = e.clientY - r.top
    const hit = hits.find(h => mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= (h.y + h.h))
    if (hit) {
      const ev = hit.event
      const d = ev.dateObj instanceof Date && Number.isFinite(ev.dateObj.getTime())
        ? ev.dateObj
        : eventDateTime(ev)

      const dateStr = d instanceof Date && Number.isFinite(d.getTime())
        ? d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
        : String(ev.date)

      const kind = ev.kindLabel || (String(ev.type || "").toLowerCase() === 'manual' ? 'Manual' : 'Auto')

      tip.classList.add('show')
      tip.innerHTML =
        `<strong>${dateStr}</strong><br>` +
        `+${fmt.format(ev.amount)} (${kind})<br>` +
        `New Total: ${fmt.format(ev.cumulative)}`
      tip.style.left = `${e.clientX + 15}px`
      tip.style.top  = `${e.clientY + 15}px`
    } else {
      tip.classList.remove('show')
    }
  }

  const leaveHandler = () => tip.classList.remove('show')

  cvs._tooltipHandlers.moveHandler  = moveHandler
  cvs._tooltipHandlers.leaveHandler = leaveHandler
  cvs.addEventListener('mousemove',  moveHandler)
  cvs.addEventListener('mouseleave', leaveHandler)
}






// ensureLottieLib: lazy-loads lottie-web
function ensureLottieLib(cb) {
  if (window.bodymovin) { cb?.(); return }
  const s = document.createElement("script")
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js"
  s.onload = () => cb?.()
  document.head.appendChild(s)
}

// mountAIAnim: mounts looped AI animation in analytics card
let aiAnim = null
function mountAIAnim() {
  const stage = $("#go-ai-stage")
  if (!stage) return

  if (aiAnim && typeof aiAnim.destroy === "function") aiAnim.destroy()
  stage.innerHTML = ""

  const host = document.createElement("div")
  host.style.cssText = "width:100%;height:100%;"
  stage.appendChild(host)

  try {
    aiAnim = window.bodymovin.loadAnimation({
      container: host,
      renderer: "svg",
      loop: true,
      autoplay: true,
      path: "/assets/animations/ai.json"
    })
  } catch (e) {
    console.warn("Lottie load failed:", e)
  }
} 

async function writeActivity(name, amount, type) {
  const headers = { "Content-Type": "application/json", "Accept": "application/json" }

  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) return false

  const now = new Date()
  const pad = n => String(n).padStart(2, "0")
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

  const label = String(name || "").trim() || "Goal transaction"
  const txType = String(type || "").toLowerCase() === "income" ? "income" : "expense"

  const payload = {
    name: label,
    merchant: label,
    category: "Goals",
    type: txType,
    amount: amt,
    date,
    time,
    origin: "goal",
    externalId: `goal_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  }

  const tryPost = async (url) => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(payload)
      })

      if (res.ok) return true

      let msg = ""
      try {
        const ct = (res.headers.get("content-type") || "").toLowerCase()
        msg = ct.includes("application/json")
          ? JSON.stringify(await res.json())
          : await res.text()
      } catch {}

      console.error(`[writeActivity] POST ${url} failed`, res.status, msg, payload)
      return false
    } catch (err) {
      console.error(`[writeActivity] POST ${url} error`, err, payload)
      return false
    }
  }

  let ok = await tryPost("/api/transactions")
  if (!ok) ok = await tryPost("/api/activity")
  if (!ok) ok = await tryPost("/api/activity/transactions")

  return ok
}

 
// openSectionModal: opens Add/Edit Section modal with data
function openSectionModal(section = null) {
  const dlg = document.getElementById("go-section-modal")
  const titleEl = document.getElementById("go-section-title")
  const idEl = document.getElementById("sec-id")
  const nameEl = document.getElementById("sec-name")
  if (!dlg || !titleEl || !idEl || !nameEl) return

  const isEdit = !!(section && section.id != null && String(section.id).trim() !== "")

  titleEl.textContent = isEdit ? "Edit section name" : "Add Section"
  nameEl.placeholder = isEdit ? "Edit section name" : "Add section name"

  if (isEdit) {
    idEl.value = String(section.id)
    nameEl.value = ""                 // IMPORTANT: do NOT prefill "Kitchen"
  } else {
    idEl.value = ""
    nameEl.value = ""
  }

  try { dlg.showModal() } catch { dlg.setAttribute("open", "true") }
  nameEl.focus()
}




// openGoalModal: opens Add/Edit Goal modal with data
function openGoalModal({ sectionId, goal } = {}) {
  const dlg = $("#go-goal-modal")
  if (!dlg) return

  $("#goal-section-id").value = sectionId || ""

  const idEl       = $("#goal-id")
  const nameEl     = $("#goal-name")
  const priceEl    = $("#goal-price")
  const taxToggle  = $("#goal-tax-toggle")
  const taxRateEl  = $("#goal-tax-rate")
  const minEl      = $("#goal-min")
  const startEl    = $("#goal-start-date")
  const endEl      = $("#goal-end-date")

  const depRow       = $("#auto-deposit-row")
  const depDateEl    = $("#goal-deposit-date")
  const depTimeEl    = $("#go-auto-time")
  const hourSel      = $("#go-auto-hour")
  const minSel       = $("#go-auto-minute")
  const depTimeField = depTimeEl ? (depTimeEl.closest(".time-field") || depTimeEl) : null

  const titleEl  = $("#go-goal-title")
  const totalEl  = $("#goal-total-price")
  const totalRow = $("#goal-total-row")

  const pad = n => String(n).padStart(2, "0")

  const today = new Date()
  const todayISO = [
    today.getFullYear(),
    pad(today.getMonth() + 1),
    pad(today.getDate())
  ].join("-")

  const toISODate = (d) => [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate())
  ].join("-")

  const windowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const windowEnd   = new Date(today.getFullYear(), today.getMonth() + 2, 0)
  const windowStartISO = todayISO
  const windowEndISO   = toISODate(windowEnd)

  const updateTotalPreview = () => {
    const amount  = Number(priceEl.value) || 0
    const taxOn   = taxToggle.checked
    const rateRaw = taxRateEl.value.trim()
    const rate    = taxOn && rateRaw !== "" ? Number(rateRaw) : 0
    const effRate = Number.isFinite(rate) ? rate : 0
    const total   = amount * (1 + effRate / 100)

    if (totalEl)  totalEl.textContent = fmt.format(total || 0)
    if (totalRow) totalRow.style.display = taxOn ? "" : "none"
  }

  const updateAutoDepositBounds = () => {
    if (!depDateEl || !startEl.value) return

    const parts = startEl.value.split("-")
    if (parts.length < 3) return

    const y = Number(parts[0])
    const mIndex = Number(parts[1]) - 1
    const dd = Number(parts[2])

    const startFull = new Date(y, mIndex, dd)

    let minDate = startFull
    if (today > minDate) minDate = today

    let maxDate = new Date(y, mIndex + 2, 0)
    if (minDate > maxDate) maxDate = new Date(minDate)

    const min = toISODate(minDate)
    const max = toISODate(maxDate)

    depDateEl.min = min
    depDateEl.max = max

    if (!depDateEl.value || depDateEl.value < min || depDateEl.value > max) {
      depDateEl.value = min
    }
  }

  const syncAutoDepositVisibility = () => {
    if (!depRow) return

    const hasMin = !!minEl.value.trim()
    const show   = hasMin

    depRow.style.display = show ? "" : "none"
    if (depTimeField) {
      depTimeField.style.display = show ? "" : "none"
      depTimeField.classList.remove("is-open")
    }

    if (!show) {
      if (depDateEl) depDateEl.value = ""
      if (depTimeEl) depTimeEl.value = ""
      if (hourSel) hourSel.value = ""
      if (minSel)  minSel.value  = ""
      return
    }
    updateAutoDepositBounds()
  }

  const getEarliestTimeForDate = (dateISO) => {
    if (!dateISO || dateISO !== todayISO) return null
    const nowPlus5 = new Date(Date.now() + 5 * 60 * 1000)
    let h = nowPlus5.getHours()
    let m = nowPlus5.getMinutes()
    if (h >= 24) { h = 23; m = 59 }
    return { h, m }
  }

  const initTimeWheels = (initialTime) => {
    if (!hourSel || !minSel || !depTimeEl || !depTimeField) return

    depTimeEl.placeholder = "HH:MM"
    depTimeEl.readOnly = true

    hourSel.innerHTML = ""
    minSel.innerHTML  = ""

    for (let h = 0; h < 24; h++) {
      const opt = document.createElement("option")
      const v = pad(h)
      opt.value = v
      opt.textContent = v
      hourSel.appendChild(opt)
    }

    for (let m = 0; m < 60; m++) {
      const opt = document.createElement("option")
      const v = pad(m)
      opt.value = v
      opt.textContent = v
      minSel.appendChild(opt)
    }

    let hh = "08"
    let mm = "00"
    if (initialTime && /^([01]\d|2[0-3]):([0-5]\d)$/.test(initialTime)) {
      hh = initialTime.slice(0, 2)
      mm = initialTime.slice(3, 5)
    }

    hourSel.value = hh
    minSel.value  = mm
    depTimeEl.value = `${hh}:${mm}`

    const applyDynamicMin = () => {
      if (!depDateEl) return

      const earliest = getEarliestTimeForDate(depDateEl.value)
      const allHours = Array.from(hourSel.options)
      const allMins  = Array.from(minSel.options)

      allHours.forEach(opt => {
        opt.disabled = false
        opt.classList.remove("is-disabled")
      })
      allMins.forEach(opt => {
        opt.disabled = false
        opt.classList.remove("is-disabled")
      })

      if (!earliest) return

      const minH = earliest.h
      const minM = earliest.m

      allHours.forEach(opt => {
        const h = Number(opt.value)
        const disableHour = h < minH
        opt.disabled = disableHour
        opt.classList.toggle("is-disabled", disableHour)
      })

      const selH = Number(hourSel.value || "0")

      allMins.forEach(opt => {
        const m = Number(opt.value)
        let disableMin = false

        if (selH < minH) disableMin = true
        else if (selH === minH && m < minM) disableMin = true

        opt.disabled = disableMin
        opt.classList.toggle("is-disabled", disableMin)
      })

      const curH = Number(hourSel.value || "0")
      const curM = Number(minSel.value || "0")

      if (curH < minH || (curH === minH && curM < minM)) {
        const nh = pad(minH)
        const nm = pad(minM)
        hourSel.value = nh
        minSel.value  = nm
        depTimeEl.value = `${nh}:${nm}`
      }
    }

    if (dlg._goalsAutoTickId) {
      clearInterval(dlg._goalsAutoTickId)
      dlg._goalsAutoTickId = null
    }

    const startAutoTick = () => {
      if (!depDateEl) return
      if (depDateEl.value !== todayISO) return
      if (dlg._goalsAutoTickId) return

      applyDynamicMin()
      dlg._goalsAutoTickId = setInterval(() => {
        if (!dlg.open || !depDateEl || depDateEl.value !== todayISO) {
          stopAutoTick()
          return
        }
        applyDynamicMin()
      }, 60 * 1000)
    }

    const stopAutoTick = () => {
      if (dlg._goalsAutoTickId) {
        clearInterval(dlg._goalsAutoTickId)
        dlg._goalsAutoTickId = null
      }
    }

    const openPicker = () => {
      if (depTimeField.style.display === "none") return
      applyDynamicMin()
      startAutoTick()
      depTimeField.classList.add("is-open")
    }

    const closePicker = () => {
      depTimeField.classList.remove("is-open")
    }

    depTimeEl.onclick = () => {
      if (depTimeField.classList.contains("is-open")) closePicker()
      else openPicker()
    }

    depTimeEl.onfocus = () => {
      openPicker()
    }

    hourSel.onchange = () => {
      applyDynamicMin()
      if (hourSel.value && minSel.value) depTimeEl.value = `${hourSel.value}:${minSel.value}`
    }

    minSel.onchange = () => {
      if (hourSel.value && minSel.value) depTimeEl.value = `${hourSel.value}:${minSel.value}`
      closePicker()
    }

    if (depTimeField._outsideHandler) {
      document.removeEventListener("mousedown", depTimeField._outsideHandler)
      depTimeField._outsideHandler = null
    }
    depTimeField._outsideHandler = (ev) => {
      if (!depTimeField.classList.contains("is-open")) return
      if (depTimeField.contains(ev.target)) return
      closePicker()
    }
    document.addEventListener("mousedown", depTimeField._outsideHandler)

    if (dlg._goalsDlgCloseHandler) {
      dlg.removeEventListener("close", dlg._goalsDlgCloseHandler)
      dlg._goalsDlgCloseHandler = null
    }
    dlg._goalsDlgCloseHandler = () => {
      if (depTimeField._outsideHandler) {
        document.removeEventListener("mousedown", depTimeField._outsideHandler)
        depTimeField._outsideHandler = null
      }
      stopAutoTick()
    }
    dlg.addEventListener("close", dlg._goalsDlgCloseHandler)

    if (depDateEl) {
      if (depDateEl._goalsDateChangeHandler) {
        depDateEl.removeEventListener("change", depDateEl._goalsDateChangeHandler)
        depDateEl._goalsDateChangeHandler = null
      }
      depDateEl._goalsDateChangeHandler = () => {
        applyDynamicMin()
        if (depDateEl.value === todayISO) startAutoTick()
        else stopAutoTick()
      }
      depDateEl.addEventListener("change", depDateEl._goalsDateChangeHandler)
    }
  }

  if (goal) {
    if (titleEl) titleEl.textContent = "Edit Goal"

    idEl.value    = goal.id
    nameEl.value  = goal.name || ""
    priceEl.value = goal.price?.amount ?? ""

    const taxIncluded = !!goal.price?.taxIncluded
    taxToggle.checked  = taxIncluded
    taxRateEl.disabled = !taxIncluded
    taxRateEl.value    = taxIncluded && goal.price?.taxRate != null ? goal.price.taxRate : ""

    let origStart = goal.startDate ? pISO(goal.startDate) : today
    if (!(origStart instanceof Date) || !isFinite(origStart)) origStart = today
    const origStartStr = goal.startDate ? goal.startDate.slice(0, 10) : todayISO

    const base1 = new Date(origStart)
    const y1 = base1.getFullYear()
    const m1 = base1.getMonth() + 1
    const day1 = base1.getDate()
    const hh1 = base1.getHours()
    const mm1 = base1.getMinutes()
    const first1 = new Date(y1, m1, 1, hh1, mm1, 0, 0)
    const lastDay1 = new Date(first1.getFullYear(), first1.getMonth() + 1, 0).getDate()
    const safeDay1 = Math.min(Math.max(1, day1), lastDay1)
    const minFinishDate = new Date(first1.getFullYear(), first1.getMonth(), safeDay1, hh1, mm1, 0, 0)
    const minFinishStr = toISODate(minFinishDate)

    const maxEndDate = new Date(origStart)
    maxEndDate.setFullYear(maxEndDate.getFullYear() + 30)
    const maxEndStr = toISODate(maxEndDate)

    let endVal = goal.endDate ? goal.endDate.slice(0, 10) : minFinishStr
    if (endVal < minFinishStr) endVal = minFinishStr
    if (endVal > maxEndStr)    endVal = maxEndStr

    startEl.value = origStartStr
    endEl.value   = endVal

    startEl.disabled = true
    startEl.classList.add("readonly-date")

    startEl.min = origStartStr
    startEl.max = origStartStr
    endEl.min   = minFinishStr
    endEl.max   = maxEndStr

    minEl.value = goal.minMonthlyDeposit != null ? String(goal.minMonthlyDeposit) : ""

    if (depDateEl) depDateEl.value = goal.depositDate ? goal.depositDate.slice(0, 10) : ""

    const rawTime = goal.depositTime || ""
    initTimeWheels(rawTime)

    if (depTimeField) depTimeField.style.display = minEl.value ? "" : "none"

    updateAutoDepositBounds()
  } else {
    if (titleEl) titleEl.textContent = "Add Goal"

    idEl.value    = ""
    nameEl.value  = ""
    priceEl.value = ""

    taxToggle.checked  = false
    taxRateEl.disabled = true
    taxRateEl.value    = ""

    startEl.disabled = false
    startEl.classList.remove("readonly-date")
    startEl.value = todayISO
    startEl.min   = windowStartISO
    startEl.max   = windowEndISO

    const base2 = new Date(today)
    const y2 = base2.getFullYear()
    const m2 = base2.getMonth() + 1
    const day2 = base2.getDate()
    const hh2 = base2.getHours()
    const mm2 = base2.getMinutes()
    const first2 = new Date(y2, m2, 1, hh2, mm2, 0, 0)
    const lastDay2 = new Date(first2.getFullYear(), first2.getMonth() + 1, 0).getDate()
    const safeDay2 = Math.min(Math.max(1, day2), lastDay2)
    const minFinishDate = new Date(first2.getFullYear(), first2.getMonth(), safeDay2, hh2, mm2, 0, 0)
    const minFinishStr = toISODate(minFinishDate)

    const maxEndDate = new Date(today)
    maxEndDate.setFullYear(maxEndDate.getFullYear() + 30)
    const maxEndStr = toISODate(maxEndDate)

    endEl.value = minFinishStr
    endEl.min   = minFinishStr
    endEl.max   = maxEndStr

    minEl.value = ""

    if (depDateEl) depDateEl.value = ""
    initTimeWheels("")

    if (depTimeField) {
      depTimeField.style.display = "none"
      depTimeField.classList.remove("is-open")
    }
  }

  startEl.onchange = () => {
    if (!startEl.value) {
      syncAutoDepositVisibility()
      return
    }

    if (!goal) {
      if (startEl.value < windowStartISO) startEl.value = windowStartISO
      if (startEl.value > windowEndISO)   startEl.value = windowEndISO
    }

    const s = pISO(startEl.value)
    if (!(s instanceof Date) || !isFinite(s)) {
      syncAutoDepositVisibility()
      return
    }

    const base3 = new Date(s)
    const y3 = base3.getFullYear()
    const m3 = base3.getMonth() + 1
    const day3 = base3.getDate()
    const hh3 = base3.getHours()
    const mm3 = base3.getMinutes()
    const first3 = new Date(y3, m3, 1, hh3, mm3, 0, 0)
    const lastDay3 = new Date(first3.getFullYear(), first3.getMonth() + 1, 0).getDate()
    const safeDay3 = Math.min(Math.max(1, day3), lastDay3)
    const minFinishDate = new Date(first3.getFullYear(), first3.getMonth(), safeDay3, hh3, mm3, 0, 0)
    const minStr = toISODate(minFinishDate)

    const maxEnd = new Date(s)
    maxEnd.setFullYear(maxEnd.getFullYear() + 30)
    const maxStr = toISODate(maxEnd)

    endEl.min = minStr
    endEl.max = maxStr

    if (!endEl.value || endEl.value < minStr) endEl.value = minStr
    if (endEl.value > maxStr)                 endEl.value = maxStr

    syncAutoDepositVisibility()
    updateAutoDepositBounds()
  }

  endEl.onchange = () => {
    if (!endEl.value || !startEl.value) return

    let s = pISO(startEl.value)
    if (!(s instanceof Date) || !isFinite(s)) s = today

    const base4 = new Date(s)
    const y4 = base4.getFullYear()
    const m4 = base4.getMonth() + 1
    const day4 = base4.getDate()
    const hh4 = base4.getHours()
    const mm4 = base4.getMinutes()
    const first4 = new Date(y4, m4, 1, hh4, mm4, 0, 0)
    const lastDay4 = new Date(first4.getFullYear(), first4.getMonth() + 1, 0).getDate()
    const safeDay4 = Math.min(Math.max(1, day4), lastDay4)
    const minFinish = new Date(first4.getFullYear(), first4.getMonth(), safeDay4, hh4, mm4, 0, 0)
    const minStr = toISODate(minFinish)

    const maxEnd = new Date(s)
    maxEnd.setFullYear(maxEnd.getFullYear() + 30)
    const maxStr = toISODate(maxEnd)

    let endStr = endEl.value
    if (endStr < minStr) endStr = minStr
    if (endStr > maxStr) endStr = maxStr

    endEl.value = endStr
  }

  priceEl.oninput    = updateTotalPreview
  taxRateEl.oninput  = updateTotalPreview
  taxToggle.onchange = () => {
    taxRateEl.disabled = !taxToggle.checked
    if (!taxToggle.checked) taxRateEl.value = ""
    updateTotalPreview()
  }
  updateTotalPreview()

  minEl.oninput   = syncAutoDepositVisibility
  startEl.oninput = syncAutoDepositVisibility
  syncAutoDepositVisibility()

  dlg.showModal()
}

function openManualDepositModal(goalId) {
  const dlg = $("#go-manual-deposit-modal")
  if (!dlg) return

  const gidEl = $("#manual-deposit-goal-id")
  if (gidEl) gidEl.value = goalId != null ? String(goalId) : ""

  const amtEl = $("#manual-deposit-amount")
  if (amtEl) amtEl.value = ""

  const warnEl = $("#manual-deposit-warning")
  if (warnEl) {
    warnEl.textContent = ""
    warnEl.style.display = "none"
  }

  try {
    if (dlg.open) dlg.close()
    dlg.showModal()
  } catch {
    dlg.setAttribute("open", "true")
  }

  try { amtEl && amtEl.focus && amtEl.focus() } catch {}
}

// =================== REPLACE START: openManualDepositModal =================== 
// openManualDepositModal: opens Manual Deposit modal for a goal (balance-aware)
// openDepositsManager: opens Manage Auto-Deposits modal
async function openDepositsManager() {
  const sections = await loadSections()
  const body = $("#go-deposits-body")
  if (!body) return

  const fmt = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" })
  const fmtDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" })

  const safeISO = (v) => {
    const d = pISO(v)
    return (d instanceof Date && Number.isFinite(d.getTime())) ? d.toISOString().slice(0, 10) : ""
  }

  const sectionTotal = (sec) => {
    let sum = 0
    for (const g of (sec.goals || [])) {
      const m = Number(g.minMonthlyDeposit || 0)
      if (g.status === "active" && m > 0 && !g.depositPaused) sum += m
    }
    return sum
  }

  const html = (sections || []).map(sec => {
    const goals = (sec.goals || []).filter(g => g.status === "active" && Number(g.minMonthlyDeposit || 0) > 0)
    if (!goals.length) return ""

    const minDateISO = sec.startISO ? safeISO(sec.startISO) : ""
    const maxDateISO = sec.endISO ? safeISO(sec.endISO) : ""

    return `
      <div class="deposit-sec-group" data-sec-id="${esc(String(sec.id))}">
        <div class="deposit-sec-header">
          <h4>${esc(sec.name)}</h4>
          <span class="deposit-sec-total">${fmt.format(sectionTotal(sec))}</span>
        </div>

        <div class="deposit-sec-goals">
          ${
            goals.map(g => {
              const currentMin = Number(g.minMonthlyDeposit || 0)

              let nextDate = null
              if (g.depositDate && !g.depositPaused && currentMin > 0) {
                const raw = String(g.depositDate || "")
                const iso = raw.includes("T") ? raw.slice(0, 10) : raw
                const d = pISO(iso)
                if (d instanceof Date && Number.isFinite(d.getTime())) nextDate = d
              }

              const nxtLabel = nextDate ? fmtDate.format(nextDate) : "—"

              return `
                <div class="deposit-goal-row ${g.depositPaused ? "paused" : "active"}"
                     data-goal-id="${esc(String(g.id))}"
                     data-amount="${currentMin.toFixed(2)}"
                     data-min-date="${minDateISO}"
                     data-max-date="${maxDateISO}">
                  <span class="goal-name">${esc(g.name)}</span>
                  <span class="goal-next">Next: ${nxtLabel}</span>
                  <span class="goal-amount">${fmt.format(currentMin)}</span>
                  <button class="pause-btn ${g.depositPaused ? "paused" : "active"}" title="Pause/Resume" type="button">
                    <i class="fas ${g.depositPaused ? "fa-play-circle" : "fa-pause-circle"}"></i>
                  </button>
                </div>
              `
            }).join("")
          }
        </div>
      </div>
    `
  }).join("")

  body.innerHTML = html || `<div class="empty">No active auto-deposits to manage.</div>`

  const updateTotals = () => {
    let grand = 0
    $$(".deposit-sec-group", body).forEach(group => {
      let st = 0
      $$(".deposit-goal-row", group).forEach(row => {
        const paused = row.classList.contains("paused")
        const amt = Number(row.dataset.amount || "0")
        if (!paused) st += amt
      })
      const label = $(".deposit-sec-total", group)
      if (label) label.textContent = fmt.format(st)
      grand += st
    })
    const totalEl = $("#go-deposits-total .amount")
    if (totalEl) totalEl.textContent = fmt.format(grand)
  }

  $$(".pause-btn", body).forEach(btn => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("paused")
      btn.classList.toggle("active")

      const icon = $("i", btn)
      if (icon) icon.className = `fas ${btn.classList.contains("paused") ? "fa-play-circle" : "fa-pause-circle"}`

      const row = btn.closest(".deposit-goal-row")
      if (row) {
        row.classList.toggle("paused")
        row.classList.toggle("active")
      }

      updateTotals()
    })
  })

  updateTotals()

  const modal = $("#go-deposits-modal")
  if (!modal) return

  // ✅ Fix: wire X + close/cancel buttons (this is what was missing)
  const xBtn =
    $("#go-deposits-close", modal) ||
    $("#go-deposits-x", modal) ||
    modal.querySelector('button[aria-label="Close"]') ||
    modal.querySelector(".modal-x") ||
    modal.querySelector(".modal-close")

  if (xBtn) {
    if (xBtn._handler) xBtn.removeEventListener("click", xBtn._handler)
    xBtn._handler = () => { try { modal.close() } catch { modal.removeAttribute("open") } }
    xBtn.addEventListener("click", xBtn._handler)
  }

  const cancelBtn =
    $("#go-deposits-cancel", modal) ||
    $("#go-deposits-cancel-btn", modal) ||
    $("#go-deposits-close-btn", modal)

  if (cancelBtn) {
    if (cancelBtn._handler) cancelBtn.removeEventListener("click", cancelBtn._handler)
    cancelBtn._handler = () => { try { modal.close() } catch { modal.removeAttribute("open") } }
    cancelBtn.addEventListener("click", cancelBtn._handler)
  }

  try { modal.showModal() } catch { modal.setAttribute("open", "true") }
  modal.addEventListener("click", e => { if (e.target === modal) modal.close() }, { once: true })

  const saveBtn = $("#go-deposits-save")
  if (!saveBtn) return

  if (saveBtn._handler) saveBtn.removeEventListener("click", saveBtn._handler)

  saveBtn._handler = async () => {
    saveBtn.disabled = true

    const headersLocal = { "Content-Type": "application/json", "Accept": "application/json" }

    let allOk = true
    let lastErr = ""

    const rows = $$(".deposit-goal-row", body)
    for (const row of rows) {
      const gid = row.dataset.goalId
      if (!gid) continue

      const paused = row.classList.contains("paused")

      const payload = {
        depositPaused: paused,
        depositPausedValue: paused ? 1 : 0,
        deposit_paused: paused ? 1 : 0
      }

      const gidEnc = encodeURIComponent(String(gid))

      const urls = [
        `/api/goals/goals/${gidEnc}`,
        `/api/goals/${gidEnc}`
      ]

      let ok = false
      for (const url of urls) {
        try {
          const res = await fetch(url, {
            method: "PUT",
            headers: headersLocal,
            credentials: "include",
            body: JSON.stringify(payload)
          })
          if (res.ok) { ok = true; break }

          try {
            const t = await res.text()
            if (t) lastErr = t
          } catch {}
        } catch (e) {
          lastErr = String(e?.message || e || "")
        }
      }

      if (!ok) allOk = false
    }

    saveBtn.disabled = false

    if (!allOk) {
      showWarning({
        title: "Save failed",
        text: "Could not save auto-deposit pause state to the database." +
          (lastErr ? `<br><br><div style="opacity:.85">${esc(String(lastErr)).slice(0, 500)}</div>` : ""),
        okOnly: true
      })
      return
    }

    modal.close()
    window.dispatchEvent(new CustomEvent("data:updated"))
  }

  saveBtn.addEventListener("click", saveBtn._handler)
}

// ──────────────────────────────────────────────────────────────
// End Manage Auto-Deposits save block
// ──────────────────────────────────────────────────────────────

 
async function runAutoDepositTick() {
  const sections = await loadSections()
  if (!Array.isArray(sections) || !sections.length) return

  const now = new Date()
  let changed = false

  let available = await currentBalance()
  if (!Number.isFinite(available) || available < 0) available = 0

  const addMonthClamped = (d, desiredDay, hh, mm) => {
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const last = new Date(y, m + 1, 0).getDate()
    const day = Math.min(desiredDay, last)
    return new Date(y, m, day, hh, mm, 0, 0)
  }

  const pWall = (s) => {
    if (!s) return new Date(NaN)
    if (s instanceof Date) return s
    const str = String(s).trim()
    if (!str) return new Date(NaN)

    const m = str.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/
    )
    if (!m) return new Date(str)

    const Y = Number(m[1])
    const Mo = Number(m[2]) - 1
    const D = Number(m[3])
    const H = m[4] != null ? Number(m[4]) : 0
    const Mi = m[5] != null ? Number(m[5]) : 0
    const S = m[6] != null ? Number(m[6]) : 0
    return new Date(Y, Mo, D, H, Mi, S, 0)
  }

  const fmtKey16 = (d) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const da = String(d.getDate()).padStart(2, "0")
    const hh = String(d.getHours()).padStart(2, "0")
    const mm = String(d.getMinutes()).padStart(2, "0")
    return `${y}-${m}-${da}T${hh}:${mm}`
  }

  const dueEvents = []
  const advancePlans = []

  for (const sec of sections) {
    const goals = sec.goals || []
    for (const g of goals) {
      if (!g || g.status !== "active") continue

      const min = Number(g.minMonthlyDeposit || 0)
      if (!(min > 0)) continue
      if (g.depositPaused) continue
      if (!g.depositDate) continue

      const base = parseLocalDateTime(g.depositDate, g.depositTime || "00:00")
      if (!(base instanceof Date) || !Number.isFinite(base.getTime())) continue

      const desiredDay = base.getDate()
      const hh = base.getHours()
      const mm = base.getMinutes()

      let depDate = new Date(base.getTime())
      let lastProcessed = null

      let guard = 60
      while (guard-- > 0) {
        if (now < depDate) break

        const remaining = Number(remainingNeeded(g, sec))
        if (!Number.isFinite(remaining) || remaining <= 0.005) break

        const amt = Math.min(min, remaining)
        if (!Number.isFinite(amt) || amt <= 0) break

        const whenStr = typeof formatLocalDateTime === "function" ? formatLocalDateTime(depDate) : depDate.toISOString()
        const whenKey16 = fmtKey16(depDate)

        const already =
          (g.autoDeposits || []).some(d => {
            const st = String(d.status || "").toLowerCase()
            if (st !== "applied" && st !== "missed") return false
            if (String(d.type || "").toLowerCase() !== "auto") return false

            const dtWall = pWall(d.date)
            if (!(dtWall instanceof Date) || !Number.isFinite(dtWall.getTime())) return false

            const dKey16 = fmtKey16(dtWall)
            if (dKey16 !== whenKey16) return false

            return Math.abs((Number(d.amount) || 0) - amt) < 0.01
          })

        if (!already) {
          dueEvents.push({ sec, goal: g, amount: amt, when: new Date(depDate.getTime()), whenStr })
        }

        lastProcessed = new Date(depDate.getTime())
        depDate = addMonthClamped(depDate, desiredDay, hh, mm)
      }

      if (lastProcessed) {
        const nextDate10 = depDate.toISOString().slice(0, 10)
        const curDate10 = String(g.depositDate || "").slice(0, 10)

        if (nextDate10 && nextDate10 !== curDate10) {
          advancePlans.push({
            goal: g,
            nextDate: nextDate10
          })
        }
      }
    }
  }

  if (!dueEvents.length && !advancePlans.length) return

  dueEvents.sort((a, b) => {
    const t = a.when.getTime() - b.when.getTime()
    if (Math.abs(t) > 1000) return t
    return a.amount - b.amount
  })

  for (const ev of dueEvents) {
    const g = ev.goal
    const sec = ev.sec

    const remaining = Number(remainingNeeded(g, sec))
    if (!Number.isFinite(remaining) || remaining <= 0.005) continue

    const amt = Math.min(Number(ev.amount) || 0, remaining)
    if (!Number.isFinite(amt) || amt <= 0) continue

 const headers = { "Accept": "application/json", "Content-Type": "application/json" }


    const gidEnc = encodeURIComponent(String(g.id))

    if (available >= amt - 1e-6) {
      const txOk = await writeActivity(`Auto Deposit: ${g.name}`, amt, "expense")
      if (!txOk) {
        try {
          await fetch(`/api/goals/goals/${gidEnc}/deposits`, {
            method: "POST",
            headers,
            credentials: "include",
            body: JSON.stringify({
              amount: amt,
              type: "auto",
              status: "missed",
              date: ev.whenStr,
              deposit_status: "missed",
              deposit_type: "auto",
              deposit_date: ev.whenStr
            })
          })
        } catch {}
        changed = true
        continue
      }

      let saved = false
      try {
        const r = await fetch(`/api/goals/goals/${gidEnc}/deposits`, {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            amount: amt,
            type: "auto",
            status: "applied",
            date: ev.whenStr,
            deposit_status: "applied",
            deposit_type: "auto",
            deposit_date: ev.whenStr
          })
        })
        saved = r.ok
      } catch {}

      if (!saved) {
        await writeActivity(`Refund (auto deposit save failed): ${g.name}`, amt, "income")
        try {
          await fetch(`/api/goals/goals/${gidEnc}/deposits`, {
            method: "POST",
            headers,
            credentials: "include",
            body: JSON.stringify({
              amount: amt,
              type: "auto",
              status: "missed",
              date: ev.whenStr,
              deposit_status: "missed",
              deposit_type: "auto",
              deposit_date: ev.whenStr
            })
          })
        } catch {}
        changed = true
        continue
      }

      available -= amt
      changed = true
    } else {
      try {
        await fetch(`/api/goals/goals/${gidEnc}/deposits`, {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            amount: amt,
            type: "auto",
            status: "missed",
            date: ev.whenStr,
            deposit_status: "missed",
            deposit_type: "auto",
            deposit_date: ev.whenStr
          })
        })
      } catch {}
      changed = true
    }
  }

  for (const adv of advancePlans) {
    const g = adv.goal
    if (!g || !g.id || !adv.nextDate) continue

    const curDate10 = String(g.depositDate || "").slice(0, 10)
    if (String(adv.nextDate) === curDate10) continue

    const gidEnc = encodeURIComponent(String(g.id))

    const headers = { "Accept": "application/json", "Content-Type": "application/json" }

    let ok = false
    const payload = {
      depositDate: adv.nextDate,
      deposit_date: adv.nextDate
    }

    const urls = [
      `/api/goals/goals/${gidEnc}`,
      `/api/goals/${gidEnc}`
    ]

    for (const url of urls) {
      try {
        const r = await fetch(url, {
          method: "PUT",
          headers,
          credentials: "include",
          body: JSON.stringify(payload)
        })
        if (r.ok) { ok = true; break }
      } catch {}
    }

    if (ok) changed = true
  }

  if (changed) window.dispatchEvent(new CustomEvent("data:updated"))
}


 
// showWarning: opens generic warning/confirm modal with handlers
function showWarning({ title, text, onConfirm, type = "warning", footerNote, okOnly = false }) {
  $("#warn-title").textContent = title;
  $("#warn-text").innerHTML = text || "";
  const modal = $("#go-warning-modal"), confirmBtn = $("#warn-confirm"), cancelBtn = $("#warn-cancel");
  const icon = $(".warning-icon i", modal);
  if (icon) icon.className = (type === "danger") ? "fas fa-exclamation-triangle" : "fas fa-info-circle";
  const fnote = $("#warn-footnote");
  if (fnote) {
    fnote.textContent = footerNote || "";
    fnote.style.display = footerNote ? "inline-block" : "none";
  }
  confirmBtn.className = type === "danger" ? "btn danger" : "btn primary";
  cancelBtn.style.display = okOnly ? "none" : "";
  confirmBtn.onclick = () => { onConfirm?.(); modal.close(); };
  cancelBtn.onclick  = () => modal.close();
  modal.showModal();
  modal.addEventListener("click", e => { if (e.target === modal) modal.close(); });
}

async function renderWhatIf() {
  const modal = $("#whatif-modal")
  if (!modal) return

  const left = $("#whatif-left")
  if (!left) return

  const headers = { "Accept": "application/json" }

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  let rows = []
  try {
    const res = await fetch(`/api/budgets/${year}/${month}`, { headers, credentials: "include" })
    if (res.ok) {
      const data = await res.json()
      rows = Array.isArray(data)
        ? data
        : Array.isArray(data?.budgets)
          ? data.budgets
          : Array.isArray(data?.rows)
            ? data.rows
            : []
    }
  } catch {}

  const budgets = (rows || [])
    .map(r => {
      const category = String(r.category || "").trim()
      const enabledRaw = r.enabled
      const enabled =
        enabledRaw === true ||
        enabledRaw === 1 ||
        enabledRaw === "1" ||
        enabledRaw === "true" ||
        Number(enabledRaw) === 1

      const monthlyLimit = Number(r.monthlyLimit ?? r.monthly_limit ?? r.limit ?? 0) || 0

      return { category, enabled, monthlyLimit }
    })
    .filter(b => b.enabled && b.category)
    .filter(b => {
      const c = b.category.toLowerCase()
      return c !== "savings goal" && c !== "goals"
    })

  const spentMap = await spentByCategoryThisMonth()

  const fmt0 = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  })

  left.innerHTML = `
    <div class="wi-head">
      <div class="wi-col wi-cat">CATEGORY</div>
      <div class="wi-col wi-spent">SPENT</div>
      <div class="wi-col wi-limit">NEW LIMIT</div>
    </div>
    <div class="wi-body">
      ${
        budgets.map(b => {
          const spent = Number(spentMap.get(b.category) || 0)
          const maxLimit = Math.max(0, b.monthlyLimit)

          return `
            <div class="wi-row"
                 data-spent="${spent}"
                 data-max="${maxLimit}">
              <div class="wi-cat">${esc(b.category)}</div>
              <div class="wi-spent">${fmt.format(spent)}</div>
              <div class="wi-limit">
                <input type="number"
                       class="wi-input"
                       step="1"
                       inputmode="decimal"
                       placeholder="0"
                       value="">
                <span class="wi-max">/${fmt0.format(maxLimit)}</span>
              </div>
            </div>`
        }).join("") || `<div class="empty">No enabled budget categories.</div>`
      }
    </div>
    <div class="wi-foot">
      <div class="wi-surplus">
        Adjustable Surplus: <strong id="wi-surplus">$0</strong>
      </div>
    </div>`

  const wiRows = $$(".wi-row", left)
  const surplusEl = $("#wi-surplus")

  const calc = () => {
    let surplus = 0
    wiRows.forEach(row => {
      const spent = Number(row.dataset.spent || 0)
      const max = Number(row.dataset.max || 0)
      const input = row.querySelector("input")
      const val = input ? Number(input.value || 0) : 0
      const newLimit = Math.max(0, val)

      if (newLimit >= spent) {
        const delta = max - newLimit
        surplus += delta
      }
    })
    if (surplusEl) surplusEl.textContent = fmt.format(Math.max(0, surplus))
  }

  wiRows.forEach(row => {
    const input = row.querySelector("input")
    if (!input) return
    input.addEventListener("input", calc)
  })

  calc()
}




function wireAIAnalyze() {
  const btn = $("#ai-analyze")
  if (!btn) return

  btn.onclick = async () => {
    const out = $("#ai-output")
    if (!out) return

    let goal = window.__ana && window.__ana.goal
    let section = window.__ana && window.__ana.section

    if (!goal || !section) {
      try {
        const route = typeof parseRoute === "function" ? parseRoute() : { page: null }
        if (route.page === "analytics" && route.sectionId) {
          const sections = await loadSections()
          section = sections.find(s => String(s.id) === String(route.sectionId)) || null

          if (section && Array.isArray(section.goals) && section.goals.length) {
            const currentGoalId =
              (window.__ana && window.__ana.currentGoalId) ||
              (section.goals.find(g => g.status === "active")?.id) ||
              section.goals[0].id

            goal = (section.goals || []).find(g => String(g.id) === String(currentGoalId)) || null
          }
        }
      } catch {}
    }

    if (!goal || !section) {
      out.classList.remove("empty")
      out.innerHTML =
        `<div style="opacity:.8">
          Choose a goal in <strong>Analytics</strong> first, then open What-If and try Analyze again.
        </div>`
      return
    }

    const shiftMonthsClamped = (dateObj, deltaMonths) => {
      const base = new Date(dateObj)
      if (!Number.isFinite(base.getTime())) return new Date(NaN)

      const y = base.getFullYear()
      const m = base.getMonth() + Number(deltaMonths || 0)
      const desiredDay = base.getDate()
      const hh = base.getHours()
      const mm = base.getMinutes()
      const ss = base.getSeconds()
      const ms = base.getMilliseconds()

      const first = new Date(y, m, 1, hh, mm, ss, ms)
      const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
      const day = Math.min(Math.max(1, desiredDay), lastDay)

      return new Date(first.getFullYear(), first.getMonth(), day, hh, mm, ss, ms)
    }

    const now = new Date()
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const scenarioMonthLabel = nextMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })

    const wiLeft = $("#whatif-left")
    const wiRows = wiLeft ? $$(".wi-row", wiLeft) : []

    const budgets = wiRows.map(row => {
      const category = String(row.dataset.cat || "").trim()
      if (!category) return null

      const spent = Number(row.dataset.min || 0)

      const max = Number(row.dataset.max || 0)
      const inp = $(".wi-input", row)
      const rawStr = inp ? String(inp.value || "").trim() : ""
      const hasNumber = rawStr !== "" && Number.isFinite(Number(rawStr))
      const raw = hasNumber ? Number(rawStr) : NaN
      const newLimit = hasNumber ? Math.min(Math.max(raw, spent), max) : spent

      return {
        category,
        spent,
        currentLimit: max,
        newLimit
      }
    }).filter(Boolean)

    const surplusText = $("#wi-surplus")?.textContent || "$0.00"
    const surplus = Number((surplusText || "0").replace(/[^0-9.-]/g, "")) || 0

    const targetPrice = priceTarget(goal)
    const fundedSoFar = fundedAmountToDate(goal, section)
    const amountRemaining = Math.max(0, targetPrice - fundedSoFar)

    const plan = computePlan(goal, section)
    const monthly = Math.max(0, Number(goal?.minMonthlyDeposit) || 0)
    const depositsRemaining = Math.max(0, Number(plan.depositsRemaining || 0))
    const originalETA = plan.lastDueDate ? fmtDate.format(plan.lastDueDate) : "Ready now"

    const newRemaining = Math.max(0, amountRemaining - surplus)

    const ceilDiv = (a, b) => (b > 0 ? Math.ceil(a / b) : 0)
    const monthsNeededAfter = (monthly > 0) ? ceilDiv(newRemaining, monthly) : 0
    let monthsSaved = Math.max(0, depositsRemaining - monthsNeededAfter)

    const fullyFundedNow = (newRemaining === 0) && depositsRemaining > 0

    let nudge = null
    if (!fullyFundedNow && monthly > 0 && monthsNeededAfter > 0 && monthsNeededAfter <= 6) {
      const rem = newRemaining % monthly
      if (rem > 0) nudge = monthly - rem
    }

    let newETA = "Ready now"
    if (!fullyFundedNow && plan.lastDueDate) {
      const baseDue = new Date(plan.lastDueDate)
      const shifted = shiftMonthsClamped(baseDue, -monthsSaved)
      newETA = Number.isFinite(shifted.getTime()) ? fmtDate.format(shifted) : fmtDate.format(baseDue)
    }

    out.classList.remove("empty")
    out.innerHTML = `<div style="opacity:.8">Analyzing your budgets &amp; goal…</div>`

    let text = ""
    try {
      const headers = { "Content-Type": "application/json", "Accept": "application/json" }


      const res = await fetch("/api/ai/whatif", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          goal: {
            id: goal.id,
            name: goal.name,
            targetPrice,
            fundedSoFar,
            amountRemaining,
            originalETA,
            monthlyDeposit: monthly,
            depositsRemaining
          },
          scenario: {
            surplus,
            newRemaining,
            newETA,
            monthsSaved,
            nudge: nudge || 0,
            monthLabel: scenarioMonthLabel,
            budgets
          }
        })
      })
      if (res.ok) {
        const data = await res.json()
        text = String(data?.message || data?.text || "").trim()
      }
    } catch {}

    if (!text) {
      const money = (x) => fmt.format(Math.max(0, Number(x) || 0))
      const green = (s) => `<span style="color:#16a34a;font-weight:700;">${s}</span>`

      const header =
        `You're making solid progress on <strong>${esc(goal.name || "your goal")}</strong>! ` +
        `Target: ${money(targetPrice)} • Funded: ${money(fundedSoFar)} • Remaining: ${money(amountRemaining)}. ` +
        `Adjustable surplus (applied in <strong>${esc(scenarioMonthLabel)}</strong>): ${money(surplus)}.`

      let body = ""
      if (surplus <= 0) {
        body =
          "Try nudging a few categories on the left to create a surplus for next month. " +
          "Then hit <em>Analyze Scenarios</em> to see how much faster you can get there."
      } else if (fullyFundedNow) {
        body =
          `Your surplus covers the entire remaining balance. You can complete this goal <strong>right now</strong>. ` +
          `That’s ${green(`${monthsSaved} month${monthsSaved > 1 ? "s" : ""}`)} saved (was ${originalETA}).`
      } else if (monthsSaved === 0) {
        body =
          `Applying this surplus from <strong>${esc(scenarioMonthLabel)}</strong> ` +
          `trims the remaining to ${money(newRemaining)}. Keep going and you’ll start skipping whole months soon.`
      } else {
        body =
          `This surplus (starting in <strong>${esc(scenarioMonthLabel)}</strong>) ` +
          `skips ${green(`${monthsSaved} month${monthsSaved > 1 ? "s" : ""}`)} of payments. ` +
          `New projected finish: <strong>${newETA}</strong> (was ${originalETA}).`
      }

      if (nudge != null && nudge > 0) {
        body += `<br>Find just <strong>${money(nudge)}</strong> more in next-month surplus to save another full month.`
      }

      const tips =
        "<ul style=\"margin:8px 0 0 18px;\">" +
          "<li>Automate savings so progress stays consistent.</li>" +
          "<li>Pause a non-essential for 1–2 months to accelerate progress.</li>" +
          "<li>Celebrate milestones to stay motivated.</li>" +
        "</ul>"

      text = `${header}<br><br>${body}<br>${tips}`
    }

    out.innerHTML = text.replace(/\n/g, "<br>")
    rewardTaskReady("what-if")
  }
}

// =============================================================
// END REPLACE: wireAIAnalyze (Analyze Scenarios button)
// =============================================================


// ──────────────────────────────────────────────────────────────
// initGlobalUI
// Copy and paste this WHOLE function
// ──────────────────────────────────────────────────────────────
function initGlobalUI() {
  const on = (id, ev, fn) => {
    const el = document.getElementById(id)
    if (el) el.addEventListener(ev, fn)
  }

  on("go-add-section", "click", async () => {
    const sections = await loadSections()
    if (sections.length >= 5) {
      showWarning({
        title: "Limit reached",
        text: "You can have a maximum of <strong>5</strong> goal sections.",
        okOnly: true
      })
      return
    }
    openSectionModal()
  })

  on("go-manage-deposits", "click", openDepositsManager)

  on("go-finish-goal", "click", () => {
    const route = parseRoute()
    if (route.page !== "analytics") return

    const modal = $("#go-finish-modal")
    if (!modal) return

    const nameEl = $("#go-finish-name")
    const summaryEl = $("#go-finish-summary")
    const warnEl = $("#go-finish-warning")
    const fundedEl = $("#go-finish-funded")

    const titleEl =
      $("#go-finish-title") ||
      modal.querySelector(".modal-title") ||
      modal.querySelector("h2") ||
      modal.querySelector("h3")

    const goal = __ana && __ana.goal
    const section = __ana && __ana.section
    if (!goal || !section) return

    const target = priceTarget(goal)
    const funded = fundedAmountToDate(goal, section)
    const remaining = Math.max(0, target - funded)
    const money = x => fmt.format(Math.max(0, Number(x) || 0))

    if (titleEl) {
      const gname = (goal.name || "").trim()
      titleEl.textContent = gname ? `Finish Goal ${gname}` : "Finish Goal"
    }

    if (nameEl) nameEl.textContent = ""
    if (summaryEl) summaryEl.innerHTML = ""
    if (fundedEl) fundedEl.textContent = money(funded)

    if (warnEl) {
      if (remaining > 0.01) {
        warnEl.style.display = ""
        warnEl.innerHTML =
          `You still have <strong>${money(remaining)}</strong> left on this goal.<br>` +
          `Finishing now will mark it as <strong>completed</strong> and stop future deposits.`
      } else {
        warnEl.style.display = "none"
        warnEl.innerHTML = ""
      }
    }

    const priceInput =
      modal.querySelector("input[data-role='finish-price']") ||
      modal.querySelector("input[type='number']") ||
      modal.querySelector("input[type='text']")
    if (priceInput) priceInput.value = ""

    const form = document.getElementById("go-finish-form")
    if (form) {
      form.dataset.secId = section.id
      form.dataset.goalId = goal.id
      form.dataset.funded = String(funded)
    }

    try { modal.showModal() } catch { modal.setAttribute("open", "true") }
  })

  on("go-completed-goals", "click", async () => {
    const modal = $("#go-completed-modal")
    const emptyEl = $("#go-completed-empty")
    const bodyEl = $("#go-completed-body")
    if (!modal || !emptyEl || !bodyEl) return

    const sections = await loadSections()
    const items = []

    sections.forEach(sec => {
      ;(sec.goals || []).forEach(g => {
        if (g.status === "deleted") return
        const target = priceTarget(g)
        const funded = fundedAmountToDate(g, sec)
        const remaining = Math.max(0, target - funded)
        const isCompleted =
          (target > 0 && funded >= target - 0.005) ||
          remaining <= 0.005 ||
          g.status === "completed"
        if (!isCompleted) return
        items.push({ secId: sec.id, secName: sec.name || "Goal Section", goal: g, target, funded })
      })
    })

    if (!items.length) {
      emptyEl.style.display = ""
      bodyEl.innerHTML = ""
    } else {
      emptyEl.style.display = "none"
      bodyEl.innerHTML = items.map(item => {
        const pct = item.target > 0 ? Math.round(Math.min(1, item.funded / item.target) * 100) : 100
        return `
          <div class="completed-card" data-sec-id="${item.secId}" data-goal-id="${item.goal.id}">
            <div class="completed-main">
              <div class="completed-name">${esc(item.goal.name)}</div>
              <div class="completed-section">Section: ${esc(item.secName)}</div>
              <div class="completed-amount">
                ${fmt.format(item.funded)} of ${fmt.format(item.target)} (${pct}%)
              </div>
            </div>
            <div class="completed-actions">
              <button type="button"
                      class="btn secondary sm go-completed-analytics-btn"
                      data-sec-id="${item.secId}"
                      data-goal-id="${item.goal.id}">
                <i class="fas fa-chart-line"></i> Analytics
              </button>
            </div>
          </div>`
      }).join("")

      $$(".go-completed-analytics-btn", bodyEl).forEach(btn => {
        btn.addEventListener("click", () => {
          const secId = btn.dataset.secId
          const goalId = btn.dataset.goalId
          modal.close()
          __ana.currentGoalId = goalId
          goToAnalytics(secId, { fromCompleted: true })
        })
      })
    }

    try { modal.showModal() } catch { modal.setAttribute("open", "true") }
  })

  $$(".modal").forEach(modal => {
    modal.addEventListener("click", e => { if (e.target === modal) modal.close() })
  })

  const setupForm = (formId, handler) => {
    const form = document.getElementById(formId)
    if (!form) return
    const fresh = form.cloneNode(true)
    form.replaceWith(fresh)
    fresh.addEventListener("submit", handler)
  }

  // ──────────────────────────────────────────────────────────────
  // go-section-form (DB based)
  // ──────────────────────────────────────────────────────────────
  setupForm("go-section-form", async (e) => {
    e.preventDefault()

    const dlg = document.getElementById("go-section-modal")
    const idEl = document.getElementById("sec-id")
    const nameEl = document.getElementById("sec-name")

    const id = (idEl?.value || "").trim()
    const name = (nameEl?.value || "").trim()

    if (!name) {
      showWarning({ title: "Missing name", text: "Please enter a section name.", okOnly: true })
      return
    }

    const headers = { "Accept": "application/json", "Content-Type": "application/json" }

    let ok = false

    try {
      if (id) {
        const res = await fetch(`/api/goals/sections/${encodeURIComponent(id)}`, {
          method: "PUT",
          headers,
          credentials: "include",
          body: JSON.stringify({ name })
        })
        ok = res.ok
      } else {
        const res = await fetch("/api/goals/sections", {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({ name })
        })
        ok = res.ok
      }
    } catch {}

    if (!ok) {
      showWarning({
        title: "Save failed",
        text: "Could not save the section. Failed to save goal sections to the database.",
        okOnly: true
      })
      return
    }

    dlg?.close()
    if (idEl) idEl.value = ""
    if (nameEl) nameEl.value = ""
    window.dispatchEvent(new CustomEvent("data:updated"))
  })

  // ──────────────────────────────────────────────────────────────
  // go-goal-form (DB create/update)
  // ──────────────────────────────────────────────────────────────
  setupForm("go-goal-form", async (e) => {
    e.preventDefault()

    const secId = $("#goal-section-id").value
    const sections = await loadSections()
    const sec = sections.find(s => String(s.id) === String(secId))
    if (!sec) return

    const rawId = ($("#goal-id").value || "").trim()
    const isNew = !rawId

    const name = $("#goal-name").value.trim()
    const amount = Number($("#goal-price").value)

    const startDateInput = $("#goal-start-date").value
    const endDateInput = $("#goal-end-date").value

    const taxOn = $("#goal-tax-toggle").checked
    const taxRateRaw = $("#goal-tax-rate").value.trim()

    const pad = n => String(n).padStart(2, "0")
    const today = new Date()
    const todayStr = [today.getFullYear(), pad(today.getMonth() + 1), pad(today.getDate())].join("-")

    if (!name) { showWarning({ title: "Missing name", text: "Please enter a goal name.", okOnly: true }); return }
    if (!Number.isFinite(amount) || amount <= 0) { showWarning({ title: "Invalid price", text: "Please enter a valid price greater than 0.", okOnly: true }); return }
    if (!startDateInput || !endDateInput) { showWarning({ title: "Missing dates", text: "Please choose both a start date and a finish date.", okOnly: true }); return }
    if (isNew && startDateInput < todayStr) { showWarning({ title: "Invalid start date", text: "Start date cannot be in the past.", okOnly: true }); return }

    if (taxOn && (!taxRateRaw || !Number.isFinite(Number(taxRateRaw)) || Number(taxRateRaw) < 0)) {
      showWarning({ title: "Invalid tax rate", text: "Please enter a valid tax rate (0 or positive) when tax is enabled.", okOnly: true })
      return
    }

    if (isNew && (sec.goals || []).some(g =>
      String(g.name || "").trim().toLowerCase() === name.toLowerCase() &&
      Number(g.price?.amount || 0) === amount
    )) {
      showWarning({ title: "Duplicate goal", text: "A goal with that name and price already exists.", okOnly: true })
      return
    }

    const existing = (!isNew ? (sec.goals || []).find(g => String(g.id) === String(rawId)) : null) || {}

    if (!isNew && existing && existing.id != null) {
      const fundedSoFar = fundedAmountToDate(existing, sec)
      if (amount + 0.01 < fundedSoFar) {
        showWarning({
          title: "Price too low",
          text: `You have already funded <strong>${fmt.format(fundedSoFar)}</strong> for this goal. Price (USD) cannot be set below the funded amount.`,
          okOnly: true
        })
        return
      }
    }

    const taxRate = (taxOn && taxRateRaw !== "") ? Number(taxRateRaw) : undefined

    let startDateVal = startDateInput || ""
    if (!isNew && existing.startDate) startDateVal = String(existing.startDate).slice(0, 10)
    const endDateVal = endDateInput || ""

    const padLocal = (n) => String(n).padStart(2, "0")
    const toISODateLocal = (d) => [d.getFullYear(), padLocal(d.getMonth() + 1), padLocal(d.getDate())].join("-")

    let origStart = startDateVal ? pISO(startDateVal) : new Date()
    if (!isNew && existing.startDate) origStart = pISO(existing.startDate)
    if (!(origStart instanceof Date) || !Number.isFinite(origStart.getTime())) origStart = new Date()

    const minFinish = new Date(origStart)
    minFinish.setMonth(minFinish.getMonth() + 1)
    const minFinishStr = toISODateLocal(minFinish)

    const maxEndDate = new Date(origStart)
    maxEndDate.setFullYear(maxEndDate.getFullYear() + 30)
    const maxEndStr = toISODateLocal(maxEndDate)

    if (endDateVal < minFinishStr) {
      showWarning({
        title: "Goal too short",
        text: `Finish date must be at least 1 month after the start date (on or after <strong>${minFinishStr}</strong>).`,
        okOnly: true
      })
      return
    }

    if (endDateVal > maxEndStr) {
      showWarning({
        title: "Goal too long",
        text: `Goals can be at most 30 years long. Please choose a finish date on or before <strong>${maxEndStr}</strong>.`,
        okOnly: true
      })
      return
    }

    const depDateVal = $("#goal-deposit-date").value || ""
    const depTimeVal = $("#go-auto-time")?.value || ""

    const rawMinInput = $("#goal-min").value ? Number($("#goal-min").value) : 0
    const oldMin = Number(existing.minMonthlyDeposit || 0)
    const hasOldMin = !isNew && oldMin > 0
    const inputHasValue = $("#goal-min").value.trim() !== ""
    let minMonthlyDeposit = inputHasValue ? rawMinInput : undefined

    if (inputHasValue && (!Number.isFinite(rawMinInput) || rawMinInput <= 0)) {
      showWarning({ title: "Invalid deposit", text: "Min Monthly Deposit must be greater than 0, or leave it empty.", okOnly: true })
      return
    }

    if (minMonthlyDeposit && !depDateVal && !existing.depositDate) {
      showWarning({ title: "Missing auto-deposit date", text: "Please choose an auto-deposit date when Min Monthly Deposit is set.", okOnly: true })
      return
    }

    if (minMonthlyDeposit && depDateVal) {
      const dParts = depDateVal.split("-")
      if (dParts.length === 3) {
        const y = Number(dParts[0])
        const m = Number(dParts[1]) - 1
        const dd = Number(dParts[2])

        let hh = 0, mm = 0
        const tMatch = depTimeVal.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
        if (tMatch) { hh = Number(tMatch[1]); mm = Number(tMatch[2]) }

        const depDt = new Date(y, m, dd, hh, mm)
        if (Number.isFinite(depDt.getTime())) {
          const nowDt = new Date()
          if (depDt <= nowDt) {
            showWarning({ title: "Invalid auto-deposit time", text: "Auto deposit date and time must be in the future.", okOnly: true })
            return
          }
        }
      }
    }

    const priceDraftGoal = { price: { amount, taxIncluded: taxOn, taxRate } }
    const totalTarget = priceTarget(priceDraftGoal)

    const fundedSoFarDraft = existing && existing.id != null ? fundedAmountToDate(existing, sec) : 0
    const requiredBase = Math.max(0, totalTarget - fundedSoFarDraft)

    let months = 1
    if (startDateVal && endDateVal) {
      const s = pISO(startDateVal)
      const e2 = pISO(endDateVal)
      if (e2 > s) {
        if (isNew) {
          const sMonth = new Date(s.getFullYear(), s.getMonth(), 1)
          const eMonth = new Date(e2.getFullYear(), e2.getMonth(), 1)
          months = Math.max(1, monthsBetweenInclusive(sMonth, eMonth))
        } else {
          const now2 = new Date()
          const anchor = now2 > s ? now2 : s
          const aMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
          const eMonth = new Date(e2.getFullYear(), e2.getMonth(), 1)
          months = Math.max(1, monthsBetweenInclusive(aMonth, eMonth))
        }
      }
    }

    const requiredMonthly = months > 0 ? requiredBase / months : requiredBase

    const endChanged =
      !isNew &&
      existing.endDate &&
      endDateVal &&
      endDateVal !== String(existing.endDate).slice(0, 10)

    const hasOldMinForAdjust =
      hasOldMin &&
      (!inputHasValue || Math.abs(rawMinInput - oldMin) < 0.01)

    if (endChanged && hasOldMinForAdjust && requiredBase > 0) {
      minMonthlyDeposit = ceil2(requiredBase / months)
    }

    const goalObj = {
      ...existing,
      id: isNew ? (existing.id ?? "") : String(existing.id ?? rawId),
      name,
      price: { amount, taxIncluded: taxOn, taxRate },
      priority: typeof existing.priority === "number" ? existing.priority : 3,
      minMonthlyDeposit,
      depositDate: (minMonthlyDeposit && depDateVal) ? depDateVal : existing.depositDate,
      depositTime: (minMonthlyDeposit && (depDateVal || existing.depositDate) && depTimeVal) ? depTimeVal : existing.depositTime,
      categories: Array.isArray(existing.categories) ? existing.categories : [],
      status: existing.status || "active",
      createdAt: rawId ? existing.createdAt : tISO(),
      startDate: isNew ? (startDateVal || undefined) : existing.startDate,
      endDate: endDateVal || existing.endDate || undefined
    }

    const headers = { "Accept": "application/json", "Content-Type": "application/json" }

    const proceedToSave = async () => {
      let ok = false

      const gidRaw = String(existing.id ?? rawId ?? "")

      const payload = {
        sectionId: secId,
        section_id: secId,

        name: goalObj.name,
        priority: goalObj.priority,
        status: goalObj.status || "active",

        startDate: goalObj.startDate || null,
        endDate: goalObj.endDate || null,

        price: goalObj.price,

        minMonthlyDeposit: (goalObj.minMonthlyDeposit == null ? null : Number(goalObj.minMonthlyDeposit)),
        depositDate: goalObj.depositDate || null,
        depositTime: goalObj.depositTime || null,
        depositPaused: goalObj.depositPaused ? true : false,

        price_amount: Number(goalObj.price?.amount || 0),
        price_tax_included: !!goalObj.price?.taxIncluded,
        price_tax_rate: (goalObj.price?.taxRate == null ? null : Number(goalObj.price.taxRate)),

        min_monthly_deposit: (goalObj.minMonthlyDeposit == null ? null : Number(goalObj.minMonthlyDeposit)),
        deposit_date: goalObj.depositDate || null,
        deposit_time: goalObj.depositTime || null,
        deposit_paused: goalObj.depositPaused ? 1 : 0,

        start_date: goalObj.startDate ? String(goalObj.startDate).slice(0, 10) : null,
        end_date: goalObj.endDate ? String(goalObj.endDate).slice(0, 10) : null,

        goal: goalObj
      }

      if (!isNew && gidRaw) {
        payload.id = gidRaw
        payload.goalId = gidRaw
      }

      try {
        if (isNew) {
          const r1 = await fetch(`/api/goals/sections/${encodeURIComponent(secId)}/goals`, {
            method: "POST",
            headers,
            credentials: "include",
            body: JSON.stringify(payload)
          })
          ok = r1.ok

          if (!ok) {
            const r2 = await fetch(`/api/goals/sections/${encodeURIComponent(secId)}/goals`, {
              method: "POST",
              headers,
              credentials: "include",
              body: JSON.stringify({ goal: payload })
            })
            ok = r2.ok
          }

          if (!ok) {
            const r3 = await fetch(`/api/goals`, {
              method: "POST",
              headers,
              credentials: "include",
              body: JSON.stringify(payload)
            })
            ok = r3.ok
          }

          if (!ok) {
            const r4 = await fetch(`/api/goals`, {
              method: "POST",
              headers,
              credentials: "include",
              body: JSON.stringify({ goal: payload })
            })
            ok = r4.ok
          }
        } else {
          const gid = encodeURIComponent(gidRaw)

          const u0 = await fetch(`/api/goals/goals/${gid}`, {
            method: "PUT",
            headers,
            credentials: "include",
            body: JSON.stringify(payload)
          })
          ok = u0.ok

          if (!ok) {
            const u0b = await fetch(`/api/goals/goals/${gid}`, {
              method: "PUT",
              headers,
              credentials: "include",
              body: JSON.stringify({ goal: payload })
            })
            ok = u0b.ok
          }

          if (!ok) {
            const u1 = await fetch(`/api/goals/sections/${encodeURIComponent(secId)}/goals/${gid}`, {
              method: "PUT",
              headers,
              credentials: "include",
              body: JSON.stringify(payload)
            })
            ok = u1.ok
          }

          if (!ok) {
            const u2 = await fetch(`/api/goals/sections/${encodeURIComponent(secId)}/goals/${gid}`, {
              method: "PUT",
              headers,
              credentials: "include",
              body: JSON.stringify({ goal: payload })
            })
            ok = u2.ok
          }

          if (!ok) {
            const u3 = await fetch(`/api/goals/${gid}`, {
              method: "PUT",
              headers,
              credentials: "include",
              body: JSON.stringify(payload)
            })
            ok = u3.ok
          }

          if (!ok) {
            const u4 = await fetch(`/api/goals/${gid}`, {
              method: "PUT",
              headers,
              credentials: "include",
              body: JSON.stringify({ goal: payload })
            })
            ok = u4.ok
          }

          if (!ok) {
            const u5 = await fetch(`/api/goals/sections/${encodeURIComponent(secId)}/goals/${gid}`, {
              method: "PATCH",
              headers,
              credentials: "include",
              body: JSON.stringify(payload)
            })
            ok = u5.ok
          }
        }
      } catch {}

      if (!ok) {
        showWarning({
          title: "Save failed",
          text: "Could not save the goal to the database.",
          okOnly: true
        })
        return
      }

      $("#go-goal-modal")?.close()

      try {
        $("#goal-id").value = ""
        $("#goal-name").value = ""
        $("#goal-price").value = ""
      } catch {}

      window.dispatchEvent(new CustomEvent("data:updated"))
    }

    if (goalObj.minMonthlyDeposit && goalObj.minMonthlyDeposit < requiredMonthly - 1e-6 && endDateVal) {
      const monthsLabel = months === 1 ? "1 month" : `${months} months`
      const calcLine = `${fmt.format(requiredBase)} ÷ ${monthsLabel} = ${fmt.format(requiredMonthly)}/month`

      showWarning({
        title: "Deposit Too Low",
        text: `To finish by the end date, you need:<br>${calcLine}<br><br>Your setting is ${fmt.format(goalObj.minMonthlyDeposit)}.<br>Proceed anyway?`,
        type: "danger",
        onConfirm: proceedToSave
      })
    } else {
      await proceedToSave()
    }
  })

  // ──────────────────────────────────────────────────────────────
  // go-manual-deposit-form (DB backed)
  // ──────────────────────────────────────────────────────────────
  setupForm("go-manual-deposit-form", async (e) => {
    e.preventDefault()

    const form = e.currentTarget
    const submitBtn = e.submitter || form.querySelector('button[type="submit"]')
    if (submitBtn && submitBtn.disabled) return
    if (submitBtn) submitBtn.disabled = true

    const input = $("#manual-deposit-amount")
    const warning = $("#manual-deposit-warning")
    const gid = ($("#manual-deposit-goal-id").value || "").trim()
    const amt = Number(input.value)

    if (warning) {
      warning.textContent = ""
      warning.style.display = "none"
    }
    if (input) input.classList.remove("invalid")

    if (!gid || !Number.isFinite(amt) || amt <= 0) {
      if (submitBtn) submitBtn.disabled = false
      return
    }

    const sections = await loadSections()
    let foundGoal = null
    let foundSec = null

    for (const sec of sections) {
      const goal = (sec.goals || []).find(g => String(g.id) === String(gid))
      if (!goal) continue
      foundGoal = goal
      foundSec = sec
      break
    }

    if (!foundGoal || !foundSec) {
      if (submitBtn) submitBtn.disabled = false
      return
    }

    if (String(foundGoal.status || "").toLowerCase() === "completed") {
      if (warning) {
        warning.textContent = "This goal has been marked as finished. You cannot add more manual deposits."
        warning.style.display = "block"
      }
      if (submitBtn) submitBtn.disabled = false
      return
    }

    const remaining = remainingNeeded(foundGoal, foundSec)
    const remainingAllowed = Math.max(0, ceil2(remaining))

    if (remainingAllowed <= 0.005) {
      if (warning) {
        warning.textContent = "This goal is already fully funded. You cannot add more manual deposits."
        warning.style.display = "block"
      }
      if (submitBtn) submitBtn.disabled = false
      return
    }

    const now = new Date()
    let start = null
    if (foundGoal.startDate) start = pISO(foundGoal.startDate)
    else if (foundSec.startISO) start = pISO(foundSec.startISO)

    if (start && now < start) {
      showWarning({
        title: "Goal not started",
        text: `This goal starts on <strong>${fmtDate.format(start)}</strong>. You can add deposits after it starts.`,
        okOnly: true
      })
      if (submitBtn) submitBtn.disabled = false
      return
    }

    const bal = await currentBalance()
    const balanceAllowed = Math.max(0, ceil2(bal))
    const maxAllowed = Math.max(0, Math.min(remainingAllowed, balanceAllowed))

    if (maxAllowed <= 0.005) {
      showWarning({
        title: "Insufficient balance",
        text: `You only have <strong>${fmt.format(Math.max(0, Number(bal) || 0))}</strong> available.`,
        okOnly: true
      })
      if (submitBtn) submitBtn.disabled = false
      return
    }

    if (amt > maxAllowed + 1e-6) {
      if (warning) {
        warning.textContent = `You can only deposit up to $${maxAllowed.toFixed(2)} (limited by remaining and current balance).`
        warning.style.display = "block"
      }
      if (input) input.classList.add("invalid")
      if (submitBtn) submitBtn.disabled = false
      return
    }

    const txOk = await writeActivity(`Manual Deposit: ${foundGoal.name}`, amt, "expense")
    if (!txOk) {
      showWarning({
        title: "Save failed",
        text: "Could not update your balance in the database. Manual deposit was not applied.",
        okOnly: true
      })
      if (submitBtn) submitBtn.disabled = false
      return
    }

    const headers = { "Accept": "application/json", "Content-Type": "application/json" }

    let ok = false
    try {
      const res = await fetch(`/api/goals/goals/${encodeURIComponent(gid)}/deposits`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          amount: amt,
          type: "manual"
        })
      })
      ok = res.ok
    } catch {}

    if (!ok) {
      await writeActivity(`Refund (deposit failed): ${foundGoal.name}`, amt, "income")

      if (warning) {
        warning.textContent = "Deposit failed. Please try again."
        warning.style.display = "block"
      }
      if (submitBtn) submitBtn.disabled = false
      return
    }

    $("#go-manual-deposit-modal")?.close()
    if (input) input.value = ""
    if (warning) warning.style.display = "none"

    rewardTaskReady("goal-deposit-manual")

    window.dispatchEvent(new CustomEvent("data:updated"))
    if (submitBtn) submitBtn.disabled = false
  })

  // ──────────────────────────────────────────────────────────────
  // go-finish-form (DB backed)
  // ──────────────────────────────────────────────────────────────
  setupForm("go-finish-form", async (e) => {
    e.preventDefault()

    const form = e.currentTarget
    const modal = $("#go-finish-modal")

    const secId = form.dataset.secId
    const goalId = form.dataset.goalId
    const funded = Number(form.dataset.funded || "0")

    const priceInput =
      form.querySelector("input[data-role='finish-price']") ||
      form.querySelector("input[type='number']") ||
      form.querySelector("input[type='text']")

    let actual = funded
    if (priceInput && priceInput.value.trim() !== "") actual = Number(priceInput.value)

    if (!Number.isFinite(actual) || actual < 0) {
      showWarning({ title: "Invalid price", text: "Please enter a valid actual purchase price (0 or greater).", okOnly: true })
      return
    }

    if (actual > funded + 0.01) {
      showWarning({
        title: "Price too high",
        text: `In order to finish this goal, the actual purchase price must be less than or equal to the amount already funded (${fmt.format(funded)}).`,
        okOnly: true
      })
      return
    }

    const sections = await loadSections()
    const sec = sections.find(s => String(s.id) === String(secId))
    if (!sec || !sec.goals) { if (modal) modal.close(); return }

    const g = sec.goals.find(x => String(x.id) === String(goalId))
    if (!g) { if (modal) modal.close(); return }

    const extra = Math.max(0, funded - actual)
    if (extra > 0.01) writeActivity(`Goal Finished (refund): ${g.name}`, extra, "income")

    const headers = { "Accept": "application/json", "Content-Type": "application/json" }

    let ok = false
    try {
      const res = await fetch(`/api/goals/goals/${encodeURIComponent(goalId)}`, {
        method: "PUT",
        headers,
        credentials: "include",
        body: JSON.stringify({
          status: "completed",
          actualPrice: actual,
          minMonthlyDeposit: null,
          depositDate: null,
          depositTime: null
        })
      })
      ok = res.ok
    } catch {}

    if (!ok) {
      showWarning({ title: "Finish failed", text: "Could not finish the goal in the database.", okOnly: true })
      return
    }

    window.dispatchEvent(new CustomEvent("data:updated"))
    if (modal) modal.close()
  })

  on("go-section-close", "click", () => $("#go-section-modal")?.close())
  on("go-section-cancel", "click", () => $("#go-section-modal")?.close())
  on("go-goal-close", "click", () => $("#go-goal-modal")?.close())
  on("go-goal-cancel", "click", () => $("#go-goal-modal")?.close())
  on("go-manual-deposit-cancel", "click", () => $("#go-manual-deposit-modal")?.close())
  on("go-completed-close", "click", () => $("#go-completed-modal")?.close())
  on("go-completed-close-footer", "click", () => $("#go-completed-modal")?.close())
  on("go-finish-close", "click", () => $("#go-finish-modal")?.close())
  on("go-finish-cancel", "click", () => $("#go-finish-modal")?.close())

  const secDlg = document.getElementById("go-section-modal")
  if (secDlg && !secDlg.dataset.bound) {
    secDlg.dataset.bound = "1"

    secDlg.addEventListener("close", () => {
      const idEl = document.getElementById("sec-id")
      const nameEl = document.getElementById("sec-name")
      if (idEl) idEl.value = ""
      if (nameEl) nameEl.value = ""
    })
  }
}

// render: decides which view to show based on hash route
async function render() {
  const route = parseRoute()
  const isAnalytics = !!(route && route.page === "analytics" && route.sectionId)

  setKpiRow(isAnalytics ? "analytics" : "list")

  if (isAnalytics) {
    await renderAnalytics(String(route.sectionId))
  } else {
    await renderList()
  }

  const btn = document.getElementById("go-finish-goal")
  if (btn) btn.style.display = isAnalytics ? "" : "none"

  const finButtons = document.querySelectorAll("#go-finish-goal")
  if (finButtons.length > 1) {
    finButtons.forEach((b, idx) => {
      if (idx > 0) b.remove()
    })
  }
}

let mounted = false
let autoDepTimer = null
let __mounting = false

function goToList(opts = {}) {
  const silent = !!opts.silent

  if (location.hash !== "#/goals") {
    history.replaceState(null, "", "#/goals")
  }

  if (!silent) safeRender()
}

function goToAnalytics(sectionId, opts = {}) {
  const silent = !!opts.silent
  const sid = sectionId != null ? String(sectionId).trim() : ""

  try {
    if (window.__ana) window.__ana.fromCompleted = !!opts.fromCompleted
  } catch {}

  if (!sid || sid === "undefined" || sid === "null") {
    console.warn("goToAnalytics called without a valid sectionId:", sectionId)
    goToList({ silent })
    return
  }

  const target = `#/goals/section/${encodeURIComponent(sid)}/analytics`
  if (location.hash !== target) {
    history.replaceState(null, "", target)
  }

  if (!silent) safeRender()
}


const safeRender = () => {
  const root = ROOT()
  const host = $(".goals-section")

  if (!host || !root || !document.documentElement.contains(root)) {
    mounted = false
    if (!__mounting) tryMount()
    return
  }

  Promise.resolve()
    .then(() => render())
    .catch((err) => {
      console.error("goals.render error:", err)

      try {
        clearTimers()
        setKpiRow("list")
        goToList({ silent: true })
        renderList().catch(() => {})
      } catch {}
    })
}

const onDataUpdated = () => {
  try {
    const route = parseRoute()
    const isAnalytics = !!(route && route.page === "analytics" && route.sectionId)

    if (!isAnalytics) {
      safeRender()
      return
    }

    window.__ana = window.__ana || {}
    const ana = window.__ana

    ana._pendingDataUpdated = true

    if (ana._dataUpdatedRenderTimer) return

    ana._dataUpdatedRenderTimer = setTimeout(() => {
      ana._dataUpdatedRenderTimer = null

      const rt = parseRoute()
      const stillAnalytics = !!(rt && rt.page === "analytics" && rt.sectionId)
      if (!stillAnalytics) {
        ana._pendingDataUpdated = false
        return
      }

      if (!ana._pendingDataUpdated) return
      ana._pendingDataUpdated = false

      safeRender()
    }, 200)
  } catch {
    safeRender()
  }
}




// tryMount: mounts Goals module once DOM is ready and host exists
function tryMount() {
  if (__mounting) return
  __mounting = true

  try {
    const host = $(".goals-section")
    const root = ROOT()

    if (!host || !root) {
      mounted = false
      return
    }

    if (mounted && document.documentElement.contains(root)) return

    mounted = true

    initGlobalUI()

    window.removeEventListener("data:updated", onDataUpdated)
    window.removeEventListener("hashchange", safeRender)
    window.addEventListener("data:updated", onDataUpdated)
    window.addEventListener("hashchange", safeRender)


    const h = String(location.hash || "")
    if (!h || h === "#" || h === "#goals" || h === "#/goals" || h === "#/") {
      history.replaceState(null, "", "#/goals")
    }

    safeRender()

    if (!autoDepTimer) {
      runAutoDepositTick()
      autoDepTimer = setInterval(runAutoDepositTick, 60000)
    }
  } finally {
    __mounting = false
  }
}

if (document.readyState !== "loading") tryMount()
else document.addEventListener("DOMContentLoaded", tryMount)

window.addEventListener("section:mounted", (e) => {
  if (e.detail?.section === "goals") tryMount()
})

const obs = new MutationObserver(() => {
  if ($(".goals-section") && ROOT()) {
    tryMount()
  } else {
    mounted = false
  }
})

obs.observe(document.documentElement, { childList: true, subtree: true })

window.__goals = {
  cleanup() {
    window.removeEventListener("data:updated", onDataUpdated)
    window.removeEventListener("hashchange", safeRender)


    if (aiAnim && typeof aiAnim.destroy === "function") aiAnim.destroy()
    aiAnim = null

    const tip = document.getElementById("analytics-tooltip")
    if (tip) tip.remove()

    clearTimers()
    if (window.__ana && window.__ana.chartObserver) window.__ana.chartObserver.disconnect()

    if (autoDepTimer) {
      clearInterval(autoDepTimer)
      autoDepTimer = null
    }

    mounted = false
  }
}
})()
