(() => {
  /* =========================================================
     0) CONSTANTS + FORMATTERS
  ========================================================= */

  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

  /* =========================================================
     1) SMALL UTILS
  ========================================================= */

  const safeNum = (v) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  const normCat = (s) => String(s || "").toLowerCase().trim()

  const fetchJSON = async (url) => {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      credentials: "include"
    })

    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try {
        const j = await res.json()
        if (j && j.error) msg = j.error
      } catch {}
      throw new Error(msg)
    }

    const text = await res.text()
    if (!text) return null
    try { return JSON.parse(text) } catch { return null }
  }

  const unwrapRows = (data) => {
    if (Array.isArray(data)) return data
    if (data && Array.isArray(data.rows)) return data.rows
    if (data && Array.isArray(data.data)) return data.data
    if (data && Array.isArray(data.items)) return data.items
    if (data && Array.isArray(data.snapshot)) return data.snapshot
    return []
  }

  const rowLimit = (r) => safeNum(r?.monthly_limit ?? r?.monthlyLimit ?? r?.limit ?? 0)
  const rowSpent = (r) => safeNum(r?.spent_amount ?? r?.spentAmount ?? r?.spent ?? 0)

  const rowEnabled = (r) => {
    const v = r?.enabled
    if (v === true) return 1
    if (v === false) return 0
    return safeNum(v)
  }

  const isGoalOrigin = (t) => {
    const o = String(t?.origin || "").toLowerCase().trim()
    return o === "goal" || o === "goals"
  }

  /* =========================================================
     2) MODULE FACTORY
  ========================================================= */

  const buildApi = () => {
    const state = {
      root: null,

      year: new Date().getFullYear(),
      monthIndex: new Date().getMonth(),
      tempYear: null,

      txAll: [],
      yearsWithTx: [],

      monthRows: [],
      yearSeries: Array.from({ length: 12 }, () => ({ spent: 0, limit: 0, net: 0 })),

      lineChart: null,
      top5Chart: null,

      viewMode: "budget",
      activeAccount: null,
      activeAccountId: null,
      prevYearsWithTx: null,
      cardYearSeries: null,
      cardMonthAgg: null,
      aiBusyBudgets: false,
      aiBusyChecking: false,
      aiBusyCredit: false,

      accountsByType: { checking: null, credit: null }
    }

    /* =========================================================
       3) DOM HELPER (SCOPED TO ROOT)
    ========================================================= */

    const $ = (sel) => {
      if (!state.root) return null
      const s = String(sel || "").trim()
      if (!s) return null

      const looksLikeBareId =
        !s.startsWith("#") &&
        !s.startsWith(".") &&
        !s.startsWith("[") &&
        !s.includes(" ") &&
        !s.includes(">") &&
        !s.includes(":") &&
        !s.includes(",")

      return state.root.querySelector(looksLikeBareId ? `#${s}` : s)
    }

    /* =========================================================
       4) TRANSACTION TIME PARSING
    ========================================================= */

    const parseTxTS = (t) => {
      const dateStr = String(t?.date || "").slice(0, 10)
      let timeStr = String(t?.time || "").trim()

      if (timeStr) {
        const m = timeStr.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/)
        if (m) {
          const hh = m[1]
          const mm = m[2]
          const ss = m[3] || "00"
          timeStr = `${hh}:${mm}:${ss}`
        } else {
          timeStr = ""
        }
      }

      let ts = NaN

      if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const iso = `${dateStr}T${timeStr || "00:00:00"}`
        ts = Date.parse(iso)
      }

      if (!Number.isFinite(ts)) {
        const fallback = t?.createdAt || t?.dateAdded || t?.timestamp || ""
        const t2 = Date.parse(String(fallback))
        if (Number.isFinite(t2)) ts = t2
      }

      if (!Number.isFinite(ts)) return NaN

      const now = Date.now()
      if (ts > now) ts = now

      return ts
    }

/* Outlook AI date range helper
   Uses Los Angeles calendar dates so your prompts match the UI rules */
const OUTLOOK_TZ = "America/Los_Angeles"

const laDateKey = (d) => {
  if (!(d instanceof Date)) return ""
  const t = d.getTime()
  if (!Number.isFinite(t)) return ""
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: OUTLOOK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(d)

  const yy = parts.find(p => p.type === "year")?.value || ""
  const mm = parts.find(p => p.type === "month")?.value || ""
  const dd = parts.find(p => p.type === "day")?.value || ""
  if (!yy || !mm || !dd) return ""
  return `${yy}-${mm}-${dd}`
}

const computeOutlookYearRange = (tx, year) => {
  const y = Number(year)

  const todayKey = laDateKey(new Date())
  const todayYear = Number(String(todayKey).slice(0, 4))
  const endISO = y === todayYear ? todayKey : `${y}-12-31`

  const fallback = { startISO: `${y}-01-01`, endISO }
  if (!Array.isArray(tx) || !tx.length) return fallback

  let minKey = null

  for (const t of tx) {
    const ms = parseTxTS(t)
    if (!Number.isFinite(ms)) continue

    const d = new Date(ms)
    const key = laDateKey(d)
    if (!key) continue

    const ky = Number(String(key).slice(0, 4))
    if (ky !== y) continue

    if (!minKey || key < minKey) minKey = key
  }

  return { startISO: minKey || fallback.startISO, endISO }
}

  const parseTs = (raw) => {
  if (!raw) return null

  if (raw instanceof Date) {
    const ms = raw.getTime()
    return Number.isFinite(ms) ? raw : null
  }

  if (typeof raw === "number") {
    const ms = raw < 1e12 ? raw * 1000 : raw
    const d = new Date(ms)
    return Number.isFinite(d.getTime()) ? d : null
  }

  if (typeof raw === "string") {
    const s = raw.trim()
    if (!s) return null

    if (/^\d+$/.test(s)) {
      const n = Number(s)
      return Number.isFinite(n) ? parseTs(n) : null
    }

    const d = new Date(s)
    return Number.isFinite(d.getTime()) ? d : null
  }

  if (typeof raw === "object") {
    if (typeof raw.toDate === "function") {
      const d = raw.toDate()
      return d && Number.isFinite(d.getTime()) ? d : null
    }

    const sec = raw.seconds ?? raw._seconds
    const ns = raw.nanoseconds ?? raw._nanoseconds

    if (Number.isFinite(sec)) {
      const ms = sec * 1000 + (Number.isFinite(ns) ? Math.floor(ns / 1e6) : 0)
      const d = new Date(ms)
      return Number.isFinite(d.getTime()) ? d : null
    }
  }

  return null
}


    /* =========================================================
       5) MONTH AND YEAR AVAILABILITY (TRANSACTION DRIVEN)
    ========================================================= */

    const cardMatchesAccount = (t, wantedAccount, wantedAccountId) => {
      const acctId = safeNum(t.account_id ?? t.accountId ?? t.accountID ?? 0)
      if (wantedAccountId && acctId) return acctId === wantedAccountId

      const acc = String(t.accountType || t.account_type || "").toLowerCase().trim()
      if (!wantedAccount || wantedAccount === "all") return true
      if (wantedAccount === "checking") return acc === "checking"
      if (wantedAccount === "credit") return acc === "credit"
      return true
    }

    const monthsWithTxForYear = (year) => {
      const set = new Set()

      const inCardMode = state.viewMode === "card"
      const wanted = String(state.activeAccount || "").toLowerCase()
      const wantedId = safeNum(state.activeAccountId ?? 0)

      for (const t of state.txAll) {
        const origin = String(t?.origin || "").toLowerCase().trim()

        if (origin === "sample") continue
        if (!inCardMode && isGoalOrigin(t)) continue

        if (inCardMode) {
          if (origin !== "freedom_bank") continue
          if (!cardMatchesAccount(t, wanted, wantedId)) continue
        }

        const ts = parseTxTS(t)
        if (!Number.isFinite(ts)) continue

        const d = new Date(ts)
        if (d.getFullYear() !== year) continue

        set.add(d.getMonth())
      }

      return Array.from(set).sort((a, b) => a - b)
    }

    const firstTxMonthForYear = (year) => {
      const months = monthsWithTxForYear(year)
      return months.length ? months[0] : null
    }

    const defaultMonthForYear = (year) => {
      const now = new Date()
      const currentYear = now.getFullYear()

      if (year === currentYear) return now.getMonth()

      const startedYear = state.yearsWithTx.length ? state.yearsWithTx[0] : null
      if (startedYear === year) {
        const first = firstTxMonthForYear(year)
        if (first !== null) return first
      }

      return 0
    }

    const normalizeMonthToTxMonths = () => {
      const months = monthsWithTxForYear(state.year)

      if (!months.length) {
        const now = new Date()
        state.monthIndex = state.year === now.getFullYear() ? now.getMonth() : 0
        return
      }

      if (months.includes(state.monthIndex)) return

      let best = months[0]
      let bestDist = Math.abs(best - state.monthIndex)

      for (const m of months) {
        const dist = Math.abs(m - state.monthIndex)
        if (dist < bestDist) {
          best = m
          bestDist = dist
        }
      }

      state.monthIndex = best
    }

    const stepMonthByTx = (dir) => {
      const months = monthsWithTxForYear(state.year)
      if (!months.length) return

      normalizeMonthToTxMonths()
      const idx = months.indexOf(state.monthIndex)
      if (idx < 0) return

      const nextIdx = idx + dir
      if (nextIdx < 0 || nextIdx >= months.length) return

      state.monthIndex = months[nextIdx]
    }

    /* =========================================================
       6) HEADER + TAB UI
    ========================================================= */

    const paintHeader = () => {
      const y = $("#outlk-bud-year")
      const y2 = $("#outlk-bud-ai-year")
      const m = $("#outlk-bud-month")

      if (y) y.textContent = String(state.year)
      if (y2) y2.textContent = String(state.year)
      if (m) m.textContent = MONTHS[state.monthIndex]
    }

    const setTab = (tab) => {
      const tCats = $("#outlk-bud-tab-categories")
      const tCards = $("#outlk-bud-tab-cards")
      const vCats = $("#outlk-bud-view-categories")
      const vCards = $("#outlk-bud-view-cards")

      const catsActive = tab === "categories"

      if (tCats) {
        tCats.classList.toggle("active", catsActive)
        tCats.setAttribute("aria-selected", catsActive ? "true" : "false")
      }

      if (tCards) {
        tCards.classList.toggle("active", !catsActive)
        tCards.setAttribute("aria-selected", !catsActive ? "true" : "false")
      }

      if (vCats) vCats.classList.toggle("active", catsActive)
      if (vCards) vCards.classList.toggle("active", !catsActive)

      if (!catsActive) applyCardsConnectionState()
    }

    /* =========================================================
       7) ACCOUNTS (CONNECTION STATE FOR CARDS TAB)
    ========================================================= */

    const loadAccounts = async () => {
      let rows = []
      try {
        const data = await fetchJSON("/api/accounts")
        rows = Array.isArray(data) ? data : (data && Array.isArray(data.accounts) ? data.accounts : [])
      } catch {
        rows = []
      }

      let checking = null
      let credit = null

      for (const a of rows) {
        const t = String(a.account_type || a.accountType || "").toLowerCase()
        if (t === "checking") checking = a
        if (t === "credit") credit = a
      }

      state.accountsByType.checking = checking
      state.accountsByType.credit = credit
    }

    const applyCardsConnectionState = async () => {
      try { await loadAccounts() } catch {}

      const cardsView = $("#outlk-bud-view-cards")
      if (!cardsView) return

      const checkingAcc = state.accountsByType.checking
      const creditAcc = state.accountsByType.credit

      const checkingConnected = !!checkingAcc && String(checkingAcc.status || "").toLowerCase() === "connected"
      const creditConnected = !!creditAcc && String(creditAcc.status || "").toLowerCase() === "connected"

      const creditCardEl = $("#outlk-card-cc")
      const checkingCardEl = $("#outlk-card-chk")

      if (creditCardEl) {
        creditCardEl.style.display = creditConnected ? "" : "none"
        if (creditAcc && creditAcc.id != null) creditCardEl.dataset.accountId = String(creditAcc.id)
      }

      if (checkingCardEl) {
        checkingCardEl.style.display = checkingConnected ? "" : "none"
        if (checkingAcc && checkingAcc.id != null) checkingCardEl.dataset.accountId = String(checkingAcc.id)
      }

      const bothDisconnected = !creditConnected && !checkingConnected
      const emptyEl = $("#outlk-cards-empty")
      if (emptyEl) emptyEl.style.display = bothDisconnected ? "block" : "none"

      const cardsTabIsActive = $("#outlk-bud-view-cards")?.classList.contains("active")
      const anyConnected = creditConnected || checkingConnected

      if (cardsTabIsActive && anyConnected) {
        try { await loadActivity() } catch {}
        try { await renderCardsOverview() } catch {}
      }
    }

    /* =========================================================
       8) ACTIVITY LOAD (YEARS LIST MUST BE BASED ON REAL TX)
    ========================================================= */

    const loadActivity = async () => {
      try { await loadAccounts() } catch {}

      let r
      try {
        r = await fetchJSON("/api/activity")
      } catch {
        r = []
      }

      const list =
        Array.isArray(r) ? r
        : Array.isArray(r.items) ? r.items
        : Array.isArray(r.data) ? r.data
        : Array.isArray(r.transactions) ? r.transactions
        : []

      state.txAll = Array.isArray(list) ? list : []

      const yrs = new Set()

      for (const t of state.txAll) {
        const origin = String(t?.origin || "").toLowerCase().trim()
        if (origin === "sample") continue
        if (isGoalOrigin(t)) continue

        const ts = parseTxTS(t)
        if (!Number.isFinite(ts)) continue

        yrs.add(new Date(ts).getFullYear())
      }

      state.yearsWithTx = Array.from(yrs).sort((a, b) => a - b)

      if (!state.yearsWithTx.length) {
        const now = new Date()
        state.year = now.getFullYear()
        state.monthIndex = now.getMonth()
        return
      }

      if (!state.yearsWithTx.includes(state.year)) {
        state.year = state.yearsWithTx[state.yearsWithTx.length - 1]
        state.monthIndex = defaultMonthForYear(state.year)
      }

      state.monthIndex = Math.max(0, Math.min(11, safeNum(state.monthIndex)))
      normalizeMonthToTxMonths()
    }

    /* =========================================================
       9) BUDGETS MODE DATA (CATEGORY COUNTS + BUDGET SNAPSHOT)
    ========================================================= */

    const txCountsForMonth = () => {
      const map = new Map()
      const start = new Date(state.year, state.monthIndex, 1).getTime()
      const end = new Date(state.year, state.monthIndex + 1, 1).getTime()

      for (const t of state.txAll) {
        const origin = String(t?.origin || "").toLowerCase().trim()
        if (origin === "sample") continue
        if (isGoalOrigin(t)) continue

        const ts = parseTxTS(t)
        if (!Number.isFinite(ts)) continue
        if (!(ts >= start && ts < end)) continue

        const c = normCat(t.category)
        if (!c) continue
        map.set(c, (map.get(c) || 0) + 1)
      }

      return map
    }

    const fetchBudgetMonthRows = async (year, month) => {
      const data = await fetchJSON(`/api/budgets/${encodeURIComponent(year)}/${encodeURIComponent(month)}`)
      return unwrapRows(data)
    }

    const keepBudgetRows = (rows) =>
      rows.filter(r => rowSpent(r) > 0 || rowLimit(r) > 0 || rowEnabled(r) === 1)

    const loadMonthBudget = async () => {
      const month = state.monthIndex + 1
      const rows = await fetchBudgetMonthRows(state.year, month)
      state.monthRows = keepBudgetRows(rows)
    }

    const calcOverall = (rows) => {
      let limit = 0
      let spent = 0
      for (const r of rows) {
        limit += rowLimit(r)
        spent += rowSpent(r)
      }
      return { limit, spent, net: limit - spent }
    }

    const loadYearSeries = async () => {
      const series = []
      for (let m = 1; m <= 12; m++) {
        try {
          const rows = keepBudgetRows(await fetchBudgetMonthRows(state.year, m))
          const t = calcOverall(rows)
          series.push({ spent: t.spent, limit: t.limit, net: t.net })
        } catch {
          series.push({ spent: 0, limit: 0, net: 0 })
        }
      }
      state.yearSeries = series
    }

    /* =========================================================
       10) CHARTS
    ========================================================= */

    const destroyCharts = () => {
      if (state.lineChart) { try { state.lineChart.destroy() } catch {} }
      if (state.top5Chart) { try { state.top5Chart.destroy() } catch {} }
      state.lineChart = null
      state.top5Chart = null
    }

    const renderCharts = () => {
      if (typeof Chart === "undefined") return

      const lineCanvas = $("#outlk-bud-line")
      const top5Canvas = $("#outlk-bud-top5")

      destroyCharts()

      if (lineCanvas) {
        const ctx = lineCanvas.getContext("2d")
        const activeMonth = state.monthIndex

        const getColor = (hex) => Array.from({ length: 12 }, () => hex)
        const getBorder = () => Array.from({ length: 12 }, (_, i) => i === activeMonth ? "#fff" : "transparent")
        const getWidth = () => Array.from({ length: 12 }, (_, i) => i === activeMonth ? 2 : 0)

        state.lineChart = new Chart(ctx, {
          type: "bar",
          data: {
            labels: MONTHS,
            datasets: [
              {
                label: "Spent",
                data: state.yearSeries.map(x => safeNum(x.spent)),
                backgroundColor: getColor("#ef4444"),
                hoverBackgroundColor: "#ef4444",
                borderColor: getBorder(),
                borderWidth: getWidth(),
                borderRadius: 4,
                barPercentage: 0.7,
                categoryPercentage: 0.8
              },
              {
                label: "Limit",
                data: state.yearSeries.map(x => safeNum(x.limit)),
                backgroundColor: getColor("#3b82f6"),
                hoverBackgroundColor: "#3b82f6",
                borderColor: getBorder(),
                borderWidth: getWidth(),
                borderRadius: 4,
                barPercentage: 0.7,
                categoryPercentage: 0.8
              },
              {
                label: "Net",
                data: state.yearSeries.map(x => safeNum(x.net)),
                backgroundColor: getColor("#22c55e"),
                hoverBackgroundColor: "#22c55e",
                borderColor: getBorder(),
                borderWidth: getWidth(),
                borderRadius: 4,
                barPercentage: 0.7,
                categoryPercentage: 0.8
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
              legend: { position: "top", labels: { color: "#fff" } },
              tooltip: { backgroundColor: "rgba(15, 23, 42, 0.95)", titleColor: "#fff", bodyColor: "#cbd5e1" }
            },
            scales: {
              x: { grid: { display: false }, ticks: { color: (ctx2) => ctx2.index === activeMonth ? "#fff" : "#94a3b8" } },
              y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#94a3b8" } }
            }
          }
        })
      }

      if (top5Canvas) {
        const ctx = top5Canvas.getContext("2d")
        const top = state.monthRows.slice().sort((a, b) => rowSpent(b) - rowSpent(a)).slice(0, 5)

        const colors = ["#ef4444", "#f97316", "#f59e0b", "#8b5cf6", "#3b82f6"]
        const datasets = top.map((r, i) => ({
          label: String(r.category || "Uncategorized"),
          data: [rowSpent(r)],
          backgroundColor: colors[i % colors.length],
          hoverBackgroundColor: colors[i % colors.length],
          barThickness: 40,
          borderRadius: 0
        }))

        if (datasets.length > 0) datasets[0].borderRadius = { topLeft: 20, bottomLeft: 20 }
        if (datasets.length > 1) datasets[datasets.length - 1].borderRadius = { topRight: 20, bottomRight: 20 }
        if (datasets.length === 1) datasets[0].borderRadius = 20

        state.top5Chart = new Chart(ctx, {
          type: "bar",
          data: { labels: ["Total"], datasets },
          options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            scales: { x: { stacked: true, display: false }, y: { stacked: true, display: false } },
            plugins: { legend: { position: "bottom", labels: { color: "#fff", boxWidth: 12, padding: 20 } } }
          }
        })
      }
    }

    /* =========================================================
       11) CARDS MODE AGGREGATIONS
    ========================================================= */

    const cardTxForYearMonth = (year, monthIndex) => {
      const start = new Date(year, monthIndex, 1).getTime()
      const end = new Date(year, monthIndex + 1, 1).getTime()

      const wanted = String(state.activeAccount || "").toLowerCase()
      const wantedId = safeNum(state.activeAccountId ?? 0)

      return state.txAll.filter(t => {
        const origin = String(t.origin || "").toLowerCase().trim()
        if (origin !== "freedom_bank") return false

        const ts = parseTxTS(t)
        if (!Number.isFinite(ts)) return false
        if (!(ts >= start && ts < end)) return false

        return cardMatchesAccount(t, wanted, wantedId)
      })
    }

    const cardYearsForAccount = () => {
      const yrs = new Set()
      const wanted = String(state.activeAccount || "").toLowerCase()
      const wantedId = safeNum(state.activeAccountId ?? 0)

      for (const t of state.txAll) {
        const origin = String(t.origin || "").toLowerCase().trim()
        if (origin !== "freedom_bank") continue

        if (!cardMatchesAccount(t, wanted, wantedId)) continue

        const ts = parseTxTS(t)
        if (!Number.isFinite(ts)) continue
        yrs.add(new Date(ts).getFullYear())
      }

      return Array.from(yrs).sort((a, b) => a - b)
    }

    const cardAggMonth = (year, monthIndex) => {
      const tx = cardTxForYearMonth(year, monthIndex)

      const agg = new Map()
      const cnt = new Map()

      let income = 0
      let expense = 0
      let incomeCount = 0
      let expenseCount = 0

      for (const t of tx) {
        const cat = String(t.category || "Uncategorized").trim() || "Uncategorized"
        const type = String(t.type || "").toLowerCase() === "income" ? "income" : "expense"
        const amt = Math.abs(safeNum(t.amount))

        const key = `${type}::${cat}`
        agg.set(key, (agg.get(key) || 0) + amt)
        cnt.set(key, (cnt.get(key) || 0) + 1)

        if (type === "income") { income += amt; incomeCount++ }
        else { expense += amt; expenseCount++ }
      }

      const rows = Array.from(agg.entries()).map(([key, val]) => {
        const [type, cat] = key.split("::")
        return { type, cat, val, n: cnt.get(key) || 0 }
      }).sort((a, b) => b.val - a.val)

      const isCredit = String(state.activeAccount || "").toLowerCase() === "credit"
      const net = isCredit ? (expense - income) : (income - expense)

      return { rows, income, expense, net, incomeCount, expenseCount }
    }

    const cardAggYear = (year) => {
      const now = new Date()
      const isCurrentYear = year === now.getFullYear()
      const currentMonth = now.getMonth()

      const wanted = String(state.activeAccount || "").toLowerCase()
      const wantedId = safeNum(state.activeAccountId ?? 0)

      const yearStartTs = new Date(year, 0, 1).getTime()

      let carryDebt = 0
      let carryBal = 0

      for (const t of state.txAll) {
        const origin = String(t.origin || "").toLowerCase().trim()
        if (origin !== "freedom_bank") continue
        if (!cardMatchesAccount(t, wanted, wantedId)) continue

        const ts = parseTxTS(t)
        if (!Number.isFinite(ts)) continue
        if (ts >= yearStartTs) continue

        const type = String(t.type || "").toLowerCase() === "income" ? "income" : "expense"
        const amt = Math.abs(safeNum(t.amount))

        if (wanted === "credit") {
          if (type === "expense") carryDebt += amt
          else carryDebt -= amt
        } else {
          if (type === "income") carryBal += amt
          else carryBal -= amt
        }
      }

      const txMonths = []
      for (const t of state.txAll) {
        const origin = String(t.origin || "").toLowerCase().trim()
        if (origin !== "freedom_bank") continue
        if (!cardMatchesAccount(t, wanted, wantedId)) continue

        const ts = parseTxTS(t)
        if (!Number.isFinite(ts)) continue

        const d = new Date(ts)
        if (d.getFullYear() !== year) continue

        txMonths.push(d.getMonth())
      }

      let lastTxMonth = txMonths.length ? Math.max(...txMonths) : -1
      if (isCurrentYear) lastTxMonth = Math.min(Math.max(lastTxMonth, 0), currentMonth)

      const months = []
      let runDebt = carryDebt
      let runBal = carryBal

      for (let mi = 0; mi < 12; mi++) {
        if (mi > lastTxMonth && lastTxMonth >= 0) {
          months.push({ spent: null, deposits: null, debt: null, income: null, expense: null, balance: null, net: null })
          continue
        }

        if (lastTxMonth < 0 && isCurrentYear && mi > currentMonth) {
          months.push({ spent: null, deposits: null, debt: null, income: null, expense: null, balance: null, net: null })
          continue
        }

        const a = cardAggMonth(year, mi)
        const spent = a.expense
        const deposits = a.income

        runDebt += (spent - deposits)
        runBal += (deposits - spent)

        months.push({
          spent,
          deposits,
          debt: runDebt,
          income: deposits,
          expense: spent,
          balance: runBal,
          net: a.net
        })
      }

      return months
    }

    const renderChartsCard = () => {
      if (typeof Chart === "undefined") return

      const lineCanvas = $("#outlk-bud-line")
      const top5Canvas = $("#outlk-bud-top5")

      destroyCharts()

      if (!lineCanvas) return
      const ctx = lineCanvas.getContext("2d")

      const series = state.cardYearSeries || cardAggYear(state.year)
      state.cardYearSeries = series

      const activeMonth = state.monthIndex
      const getWidth = () => Array.from({ length: 12 }, (_, i) => i === activeMonth ? 2 : 0)
      const getBorder = () => Array.from({ length: 12 }, (_, i) => i === activeMonth ? "#fff" : "transparent")

      const v = (x) => (x == null ? null : safeNum(x))

      if (state.activeAccount === "credit") {
        state.lineChart = new Chart(ctx, {
          type: "bar",
          data: {
            labels: MONTHS,
            datasets: [
              { label: "Debt Amount", data: series.map(x => v(x.debt)), backgroundColor: "#f59e0b", hoverBackgroundColor: "#f59e0b", borderColor: getBorder(), borderWidth: getWidth(), borderRadius: 4 },
              { label: "Spent", data: series.map(x => v(x.spent)), backgroundColor: "#ef4444", hoverBackgroundColor: "#ef4444", borderColor: getBorder(), borderWidth: getWidth(), borderRadius: 4 },
              { label: "Deposits", data: series.map(x => v(x.deposits)), backgroundColor: "#22c55e", hoverBackgroundColor: "#22c55e", borderColor: getBorder(), borderWidth: getWidth(), borderRadius: 4 }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: { legend: { labels: { color: "#fff" } }, tooltip: { backgroundColor: "rgba(15, 23, 42, 0.95)" } },
            scales: {
              x: { grid: { display: false }, ticks: { color: (ctx2) => ctx2.index === activeMonth ? "#fff" : "#94a3b8" } },
              y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#94a3b8" } }
            }
          }
        })
      } else {
        state.lineChart = new Chart(ctx, {
          type: "bar",
          data: {
            labels: MONTHS,
            datasets: [
              { label: "Balance", data: series.map(x => v(x.balance)), backgroundColor: "#3b82f6", hoverBackgroundColor: "#3b82f6", borderColor: getBorder(), borderWidth: getWidth(), borderRadius: 4 },
              { label: "Income", data: series.map(x => v(x.income)), backgroundColor: "#22c55e", hoverBackgroundColor: "#22c55e", borderColor: getBorder(), borderWidth: getWidth(), borderRadius: 4 },
              { label: "Expenses", data: series.map(x => v(x.expense)), backgroundColor: "#ef4444", hoverBackgroundColor: "#ef4444", borderColor: getBorder(), borderWidth: getWidth(), borderRadius: 4 },
              { label: "Net Change", data: series.map(x => v(x.net)), backgroundColor: "#8b5cf6", hoverBackgroundColor: "#8b5cf6", borderColor: getBorder(), borderWidth: getWidth(), borderRadius: 4 }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: { legend: { labels: { color: "#fff" } }, tooltip: { backgroundColor: "rgba(15, 23, 42, 0.95)" } },
            scales: {
              x: { grid: { display: false }, ticks: { color: (ctx2) => ctx2.index === activeMonth ? "#fff" : "#94a3b8" } },
              y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#94a3b8" } }
            }
          }
        })
      }

      if (!top5Canvas) return
      const bctx = top5Canvas.getContext("2d")
      const tx = cardTxForYearMonth(state.year, state.monthIndex)

      const byCat = new Map()
      for (const t of tx) {
        const type = (t.type || "").toLowerCase()
        if (type !== "expense") continue
        const name = String(t.category || "Uncategorized")
        byCat.set(name, (byCat.get(name) || 0) + Math.abs(safeNum(t.amount)))
      }

      const top = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)
      const colors = ["#ef4444", "#f97316", "#f59e0b", "#8b5cf6", "#3b82f6"]

      const datasets = top.map((r, i) => ({
        label: r[0],
        data: [r[1]],
        backgroundColor: colors[i % colors.length],
        barThickness: 40,
        borderRadius: 0
      }))

      if (datasets.length > 0) datasets[0].borderRadius = { topLeft: 20, bottomLeft: 20 }
      if (datasets.length > 1) datasets[datasets.length - 1].borderRadius = { topRight: 20, bottomRight: 20 }
      if (datasets.length === 1) datasets[0].borderRadius = 20

      state.top5Chart = new Chart(bctx, {
        type: "bar",
        data: { labels: ["Total"], datasets },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: { stacked: true, display: false }, y: { stacked: true, display: false } },
          plugins: { legend: { position: "bottom", labels: { color: "#fff", boxWidth: 12, padding: 20 } } }
        }
      })
    }

    /* =========================================================
       12) RENDER LISTS + SUMMARY BANNERS
    ========================================================= */

    const renderCategoryList = () => {
      const list = $("#outlk-bud-catlist")
      if (!list) return

      const txCounts = txCountsForMonth()
      const rows = state.monthRows.slice().sort((a, b) => rowSpent(b) - rowSpent(a))

      if (!rows.length) {
        list.innerHTML = `<div style="text-align:center;color:#64748b;padding:20px;">No budget data for this month.</div>`
        return
      }

      list.innerHTML = rows.map(r => {
        const name = String(r.category || "Uncategorized")
        const spent = rowSpent(r)
        const limit = rowLimit(r)
        const txc = txCounts.get(normCat(name)) || 0

        if (limit <= 0) {
          return `
            <div class="outlk-catrow good">
              <div class="outlk-catname">
                <span class="outlk-dot" style="background:#22c55e;box-shadow:0 0 8px #22c55e;"></span>
                <div>
                  <div>${name}</div>
                  <div class="outlk-txcount">${txc} transactions</div>
                </div>
              </div>
              <div class="outlk-catamt">${money.format(spent)} <span style="opacity:.75">No limit</span></div>
            </div>
          `
        }

        const met = spent <= limit
        const cls = met ? "good" : "bad"
        const dotColor = met ? "#22c55e" : "#ef4444"

        return `
          <div class="outlk-catrow ${cls}">
            <div class="outlk-catname">
              <span class="outlk-dot" style="background:${dotColor};box-shadow:0 0 8px ${dotColor};"></span>
              <div>
                <div>${name}</div>
                <div class="outlk-txcount">${txc} transactions</div>
              </div>
            </div>
            <div class="outlk-catamt">${money.format(spent)} / ${money.format(limit)}</div>
          </div>
        `
      }).join("")
    }

    const renderCategoryListCard = () => {
      const list = $("#outlk-bud-catlist")
      if (!list) return

      const a = state.cardMonthAgg || cardAggMonth(state.year, state.monthIndex)
      state.cardMonthAgg = a

      const isCredit = String(state.activeAccount || "").toLowerCase() === "credit"
      const leftLabel = isCredit ? "Deposits" : "Income"
      const rightLabel = "Expenses"

      const leftCount = safeNum(a.incomeCount)
      const rightCount = safeNum(a.expenseCount)
      const leftAmt = safeNum(a.income)
      const rightAmt = safeNum(a.expense)

      const rows = Array.isArray(a.rows) ? a.rows : []

      const summaryTop = `
        <div class="outlk-pillrow">
          <div class="outlk-pill outlk-pill-income">
            <div class="outlk-pillnum">${leftCount}</div>
            <div class="outlk-pilllbl">${leftLabel} transactions</div>
            <div class="outlk-pillamt">${money.format(leftAmt)}</div>
          </div>

          <div class="outlk-pill outlk-pill-expense">
            <div class="outlk-pillnum">${rightCount}</div>
            <div class="outlk-pilllbl">${rightLabel} transactions</div>
            <div class="outlk-pillamt">${money.format(rightAmt)}</div>
          </div>
        </div>
      `

      if (!rows.length) {
        list.innerHTML = `
          ${summaryTop}
          <div class="outlk-catrows">
            <div class="outlk-catrow">
              <div class="outlk-catname">No transactions</div>
              <div class="outlk-catamt">—</div>
            </div>
          </div>
        `
        return
      }

      const rowsHtml = rows.map(r => {
        const isIncomeRow = r.type === "income"
        const dotColor = isIncomeRow ? "#22c55e" : "#ef4444"
        const label = isIncomeRow ? leftLabel : "Expenses"

        return `
          <div class="outlk-catrow">
            <div class="outlk-catname">
              <span class="outlk-dot" style="background:${dotColor};box-shadow:0 0 8px ${dotColor};"></span>
              <div>
                <div>${r.cat}</div>
                <div class="outlk-txcount">${label} • ${safeNum(r.n)} transactions</div>
              </div>
            </div>
            <div class="outlk-catamt" style="color:${dotColor}">${money.format(safeNum(r.val))}</div>
          </div>
        `
      }).join("")

      list.innerHTML = `
        ${summaryTop}
        <div class="outlk-catrows">
          ${rowsHtml}
        </div>
      `
    }

    const iconSVG = (type) => {
      if (type === "good") return `<i class="fas fa-check-circle" style="font-size:1.5rem;color:#22c55e;"></i>`
      return `<i class="fas fa-exclamation-circle" style="font-size:1.5rem;color:#ef4444;"></i>`
    }

    const renderSummaryBanner = () => {
      const box = $("#outlk-bud-summary")
      if (!box) return

      const t = calcOverall(state.monthRows)

      if (t.limit <= 0) {
        box.style.display = "flex"
        box.className = "outlk-summary good"
        box.innerHTML = `
          <div class="outlk-summary-top">
            ${iconSVG("good")}
            <div>NO LIMITS SET</div>
          </div>
          <div class="outlk-summary-sub">${money.format(t.spent)} spent this month</div>
        `
        return
      }

      const met = t.spent <= t.limit
      const mode = met ? "good" : "bad"
      const pct = Math.max(0, Math.min(100, (t.spent / t.limit) * 100))

      box.style.display = "flex"
      box.className = `outlk-summary ${mode}`
      box.innerHTML = `
        <div class="outlk-summary-top">
          ${iconSVG(mode)}
          <div>${met ? "GOAL MET" : "LIMIT EXCEEDED"}</div>
        </div>
        <div class="outlk-summary-sub">${money.format(t.spent)} of ${money.format(t.limit)} spent</div>
        <div class="outlk-progress">
          <div class="outlk-progress-fill" style="width:${pct}%"></div>
        </div>
      `
    }

    const renderSummaryBannerCard = () => {
      const box = $("#outlk-bud-summary")
      if (!box) return

      const series = state.cardYearSeries || cardAggYear(state.year)
      state.cardYearSeries = series

      if (state.activeAccount === "credit") {
        const m = series[state.monthIndex] || { spent: 0 }
        const spend = safeNum(m.spent)

        let ccText = "SPENDING IS HEALTHY"
        let cls = "good"

        if (spend <= 2000) { ccText = "SPENDING IS HEALTHY"; cls = "good" }
        else if (spend <= 10000) { ccText = "ELEVATED SPENDING"; cls = "good" }
        else if (spend <= 25000) { ccText = "DANGER ZONE"; cls = "bad" }
        else { ccText = "CRITICAL BALANCE"; cls = "bad" }

        box.style.display = "flex"
        box.className = `outlk-summary ${cls}`
        box.innerHTML = `
          <div class="outlk-summary-top">
            <div class="outlk-summary-val">${money.format(spend)}</div>
          </div>
          <div class="outlk-summary-status">
            <span>${ccText}</span>
          </div>
        `
        return
      }

      const m = series[state.monthIndex] || { balance: 0 }
      const bal = safeNum(m.balance)

      let text = "HEALTHY BALANCE"
      let cls = "good"
      if (bal < 0) { text = "VERY LOW BALANCE"; cls = "bad" }
      else if (bal < 2000) { text = "LOW BALANCE"; cls = "good" }

      box.style.display = "flex"
      box.className = `outlk-summary ${cls}`
      box.innerHTML = `
        <div class="outlk-summary-top">
          <div class="outlk-summary-val">${money.format(bal)}</div>
        </div>
        <div class="outlk-summary-status">
          <span>${text}</span>
        </div>
      `
    }

   /* =========================================================
   13) AI OUTPUT
   This section powers the AI Analyst for:
   - Budgets view (overall)
   - Checking card
   - Credit card
========================================================= */

const typeWriter = (text, element) => {
  element.textContent = ""
  let i = 0

  const s = String(text || "")
  const tick = () => {
    if (i >= s.length) return
    element.textContent += s.charAt(i)
    i += 1
    setTimeout(tick, 10)
  }

  tick()
}

const txMs = (t) => {
  const ms = parseTxTS(t)
  return Number.isFinite(ms) ? ms : NaN
}

const txLAKey = (t) => {
  const ms = txMs(t)
  if (!Number.isFinite(ms)) return ""
  return laDateKey(new Date(ms))
}

const txAccountType = (t) => {
  return String(t?.accountType || t?.account_type || t?.account || "")
    .toLowerCase()
    .trim()
}

/* Budgets AI analysis
   This section sends goal performance (spent vs limit) so the AI can explain goal met, savings, and misses by month */
const generateAIAnalysis = async () => {
  const out = $("#outlk-bud-ai-out")
  if (!out) return
  if (state.aiBusyBudgets) return

  state.aiBusyBudgets = true

  try {
    const year = Number(state.year)

    const todayKey = laDateKey(new Date())
    const todayYear = Number(String(todayKey || "").slice(0, 4) || "0")

    const txAll = Array.isArray(state.txAll) ? state.txAll : []

    let tx = txAll.filter((t) => {
      const ts = parseTxTS(t)
      if (!Number.isFinite(ts)) return false

      const key = laDateKey(new Date(ts))
      if (!key) return false

      const ky = Number(String(key).slice(0, 4))
      if (ky !== year) return false

      const acct = String(t.accountType || t.account_type || "").toLowerCase().trim()
      if (acct === "credit") return false

      return true
    })

    const r0 = computeOutlookYearRange(tx, year)
    const startISO = year === todayYear ? `${year}-01-01` : r0.startISO
    const endISO = r0.endISO

    tx = tx.filter((t) => {
      const ts = parseTxTS(t)
      if (!Number.isFinite(ts)) return false

      const key = laDateKey(new Date(ts))
      if (!key) return false

      return key >= startISO && key <= endISO
    })

    let income = 0
    let expense = 0

    const monthly = Array.from({ length: 12 }, () => ({ income: 0, expense: 0 }))
    const cats = new Map()

    for (const t of tx) {
      const amt = Number(t.amount || 0)
      const type = String(t.type || "").toLowerCase().trim()

      const ts = parseTxTS(t)
      if (!Number.isFinite(ts)) continue

      const key = laDateKey(new Date(ts))
      if (!key || key.length < 10) continue

      const m = Math.max(0, Math.min(11, Number(key.slice(5, 7)) - 1))
      const cat = String(t.category || t.categoryName || t.merchantCategory || "Uncategorized")

      if (type === "income") {
        income += amt
        monthly[m].income += amt
      } else {
        expense += amt
        monthly[m].expense += amt
        cats.set(cat, (cats.get(cat) || 0) + amt)
      }
    }

    const topCategories = Array.from(cats.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, spent]) => ({ name, spent }))

    const yearSeries = Array.isArray(state.yearSeries) ? state.yearSeries : []
    const goalByMonth = yearSeries.map((x, idx) => {
      const spent = safeNum(x.spent)
      const limit = safeNum(x.limit)
      const net = safeNum(x.net)

      const hasLimit = limit > 0
      const met = hasLimit ? spent <= limit : null
      const saved = hasLimit ? Math.max(0, limit - spent) : null
      const over = hasLimit ? Math.max(0, spent - limit) : null
      const pct = hasLimit ? (limit > 0 ? (spent / limit) : 0) : null

      return {
        monthIndex: idx,
        monthName: MONTHS[idx],
        spent,
        limit,
        net,
        met,
        saved,
        over,
        pct
      }
    })

    const curIdx = Math.max(0, Math.min(11, Number(state.monthIndex || 0)))
    const curGoal = goalByMonth[curIdx] || {
      monthIndex: curIdx,
      monthName: MONTHS[curIdx],
      spent: 0,
      limit: 0,
      net: 0,
      met: null,
      saved: null,
      over: null,
      pct: null
    }

    const payload = {
      year,
      range: { startISO, endISO },
      totals: { income, expense, net: income - expense },
      topCategories,
      monthly: monthly.map((x, idx) => ({
        monthIndex: idx,
        income: x.income,
        expense: x.expense,
        net: x.income - x.expense
      })),
      currentGoal: curGoal,
      goalByMonth
    }

    const r = await fetch("/api/ai/outlook/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    })

    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`)

    const text = String(j.text || j.analysis || j.content || "").trim()
    typeWriter(text || "No analysis returned.", out)
  } catch (e) {
    const msg = (e && e.message) ? e.message : "AI analysis failed."
    out.textContent = `AI error: ${msg}`
  } finally {
    state.aiBusyBudgets = false
  }
}

const generateAICardAnalysis = async (accountType) => {
  const acct = String(accountType || "").toLowerCase().trim()
  const out = acct === "credit" ? $("#outlk-credit-ai-out") : $("#outlk-check-ai-out")
  if (!out) return

  if (acct === "credit" && state.aiBusyCredit) return
  if (acct !== "credit" && state.aiBusyChecking) return

  if (acct === "credit") state.aiBusyCredit = true
  else state.aiBusyChecking = true

  try {
    const year = Number(state.year)

    const todayKey = laDateKey(new Date())
    const todayYear = Number(String(todayKey || "").slice(0, 4) || "0")

    const txAll = Array.isArray(state.txAll) ? state.txAll : []

    let tx = txAll.filter((t) => {
      const origin = String(t?.origin || "").toLowerCase().trim()
      if (origin !== "freedom_bank") return false

      const key = txLAKey(t)
      if (!key) return false

      const ky = Number(String(key).slice(0, 4))
      if (ky !== year) return false

      const a = txAccountType(t)
      if (a !== acct) return false

      return true
    })

    const r0 = computeOutlookYearRange(tx, year)
    const startISO = year === todayYear ? `${year}-01-01` : r0.startISO
    const endISO = r0.endISO

    tx = tx.filter((t) => {
      const key = txLAKey(t)
      if (!key) return false
      return key >= startISO && key <= endISO
    })

    let income = 0
    let expense = 0

    const monthly = Array.from({ length: 12 }, () => ({ income: 0, expense: 0 }))
    const top = []

    for (const t of tx) {
      const amt = Number(t.amount || 0)
      const type = String(t.type || "").toLowerCase().trim()

      const key = txLAKey(t)
      if (!key || key.length < 10) continue

      const m = Math.max(0, Math.min(11, Number(key.slice(5, 7)) - 1))
      const label = String(t.merchant || t.name || t.description || t.category || "Transaction")

      if (type === "income") {
        income += amt
        monthly[m].income += amt
      } else {
        expense += amt
        monthly[m].expense += amt
      }

      top.push({ label, amount: amt, type })
    }

    top.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    const topTx = top.slice(0, 8)

    const payload = {
      year,
      accountType: acct,
      range: { startISO, endISO },
      totals: { income, expense, net: income - expense },
      topTx,
      monthly: monthly.map((x, idx) => ({
        monthIndex: idx,
        income: x.income,
        expense: x.expense,
        net: x.income - x.expense
      }))
    }

    const url = acct === "credit" ? "/api/ai/outlook/credit" : "/api/ai/outlook/checking"

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    })

    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`)

    const text = String(j.text || j.analysis || j.content || "").trim()
    typeWriter(text || "No analysis returned.", out)
  } catch (e) {
    const msg = (e && e.message) ? e.message : "AI analysis failed."
    out.textContent = `AI error: ${msg}`
  } finally {
    if (acct === "credit") state.aiBusyCredit = false
    else state.aiBusyChecking = false
  }
}

    /* =========================================================
       14) YEAR MODAL (NO DUPES, SINGLE SOURCE OF TRUTH)
    ========================================================= */

    const yearListForModal = () => {
      const base =
        state.viewMode === "card"
          ? cardYearsForAccount()
          : state.yearsWithTx.slice()

      return base
        .map((y) => Number(y))
        .filter((y) => Number.isFinite(y))
        .map((y) => Math.trunc(y))
        .sort((a, b) => a - b)
    }

    const openYearModal = () => {
      const modal = $("#outlk-bud-yearmodal")
      if (!modal) return

      const years = yearListForModal()
      const fallback = new Date().getFullYear()

      const cur = Number(state.year)
      if (years.length) state.tempYear = years.includes(cur) ? cur : years[years.length - 1]
      else state.tempYear = Number.isFinite(cur) ? cur : fallback

      const big = $("#outlk-bud-yearbig")
      if (big) big.textContent = String(state.tempYear)

      syncYearNavButtons()

      modal.classList.add("open")
      modal.setAttribute("aria-hidden", "false")
    }

    const closeYearModal = () => {
      const modal = $("#outlk-bud-yearmodal")
      if (!modal) return
      modal.classList.remove("open")
      modal.setAttribute("aria-hidden", "true")
    }

    const syncYearNavButtons = () => {
      const prev = $("#outlk-bud-yearprev")
      const next = $("#outlk-bud-yearnext")
      const label = $("#outlk-bud-yearbig")

      const years = yearListForModal()
      const cur = Number(state.tempYear ?? state.year)
      const idx = years.indexOf(cur)

      if (label) label.textContent = String(Number.isFinite(cur) ? cur : (years[0] ?? new Date().getFullYear()))

      const has = years.length > 0
      if (prev) prev.disabled = !has || idx <= 0
      if (next) next.disabled = !has || idx < 0 || idx >= years.length - 1
    }

    const stepTempYear = (dir) => {
      const years = yearListForModal()
      if (!years.length) return

      const cur = Number(state.tempYear ?? state.year)
      let idx = years.indexOf(cur)
      if (idx < 0) idx = years.length - 1

      const nextIdx = Math.max(0, Math.min(years.length - 1, idx + (dir < 0 ? -1 : 1)))
      state.tempYear = years[nextIdx]

      const big = $("#outlk-bud-yearbig")
      if (big) big.textContent = String(state.tempYear)

      syncYearNavButtons()
    }

    /* =========================================================
       15) CARDS OVERVIEW TILES
    ========================================================= */

    const renderCardsOverview = async () => {
      try { await loadAccounts() } catch {}

      const ccAcc = state.accountsByType.credit
      const chkAcc = state.accountsByType.checking

      const ccId = ccAcc && ccAcc.id != null ? safeNum(ccAcc.id) : 0
      const chkId = chkAcc && chkAcc.id != null ? safeNum(chkAcc.id) : 0

      if (!state.txAll.length) {
        try { await loadActivity() } catch {}
      }

      const y = state.year
      const mi = state.monthIndex

      const ccMonth = (() => {
        const prevAcc = state.activeAccount
        const prevId = state.activeAccountId
        state.activeAccount = "credit"
        state.activeAccountId = ccId || null
        const a = cardAggMonth(y, mi)
        state.activeAccount = prevAcc
        state.activeAccountId = prevId
        return a
      })()

      const chkMonth = (() => {
        const prevAcc = state.activeAccount
        const prevId = state.activeAccountId
        state.activeAccount = "checking"
        state.activeAccountId = chkId || null
        const a = cardAggMonth(y, mi)
        state.activeAccount = prevAcc
        state.activeAccountId = prevId
        return a
      })()

      const aggAll = (accountId, accountName) => {
        let income = 0
        let expense = 0
        let last = null

        for (const t of state.txAll) {
          const origin = String(t.origin || "").toLowerCase().trim()
          if (origin !== "freedom_bank") continue

          if (!cardMatchesAccount(t, accountName, accountId)) continue

          const ts = parseTxTS(t)
          if (Number.isFinite(ts) && (!last || ts > last)) last = ts

          const amt = Math.abs(safeNum(t.amount))
          const type = String(t.type || "").toLowerCase() === "income" ? "income" : "expense"
          if (type === "income") income += amt
          else expense += amt
        }

        return { income, expense, lastTs: last }
      }

      const ccAll = aggAll(ccId || null, "credit")
      const chkAll = aggAll(chkId || null, "checking")

      const ccDebtNow = Math.max(0, safeNum(ccAll.expense) - safeNum(ccAll.income))
      const chkBalNow = safeNum(chkAll.income) - safeNum(chkAll.expense)

      const ccAmount = document.getElementById("outlk-card-cc-amount")
      const ccDeposits = document.getElementById("outlk-card-cc-deposits")
      const ccSpent = document.getElementById("outlk-card-cc-spent")
      const chkAmount = document.getElementById("outlk-card-chk-amount")
      const chkIncome = document.getElementById("outlk-card-chk-income")
      const chkExpenses = document.getElementById("outlk-card-chk-expenses")

      if (ccAmount) ccAmount.textContent = money.format(ccDebtNow)
      if (ccDeposits) ccDeposits.textContent = money.format(safeNum(ccMonth.income))
      if (ccSpent) ccSpent.textContent = money.format(safeNum(ccMonth.expense))

      if (chkAmount) chkAmount.textContent = money.format(chkBalNow)
      if (chkIncome) chkIncome.textContent = money.format(safeNum(chkMonth.income))
      if (chkExpenses) chkExpenses.textContent = money.format(safeNum(chkMonth.expense))

      const formatLastTx = (ts) => {
        if (!Number.isFinite(ts)) return "—"
        const d = new Date(ts)
        if (Number.isNaN(d.getTime())) return "—"

        const now = new Date()
        const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
        const hh = String(d.getHours()).padStart(2, "0")
        const mm = String(d.getMinutes()).padStart(2, "0")
        const time = `${hh}:${mm}`

        if (sameDay) return `Last Transaction Today ${time}`
        return `Last Transaction ${d.toLocaleDateString("en-US", { month: "short", day: "2-digit" })}`
      }

      const ccLast = document.getElementById("outlk-card-cc-last")
      const chkLast = document.getElementById("outlk-card-chk-last")
      if (ccLast) ccLast.textContent = formatLastTx(ccAll.lastTs)
      if (chkLast) chkLast.textContent = formatLastTx(chkAll.lastTs)

      const ccBar = document.getElementById("outlk-card-cc-bar")
      const chkBar = document.getElementById("outlk-card-chk-bar")

      const ccSpend = safeNum(ccMonth.expense)
      const ccP = ccSpend <= 2000 ? 22 : ccSpend <= 10000 ? 55 : ccSpend <= 25000 ? 80 : 95
      const chkP = chkBalNow < 0 ? 95 : chkBalNow < 2000 ? 70 : 35

      if (ccBar) ccBar.style.setProperty("--p", `${Math.max(0, Math.min(100, ccP))}%`)
      if (chkBar) chkBar.style.setProperty("--p", `${Math.max(0, Math.min(100, chkP))}%`)
    }

    /* =========================================================
       16) ENTER AND EXIT CARD MODE
    ========================================================= */

    const enterCardMode = async ({ account, accountId } = {}) => {
      state.viewMode = "card"
      state.activeAccount = String(account || "").toLowerCase()

      const dbAcc =
        state.activeAccount === "credit"
          ? state.accountsByType.credit
          : state.activeAccount === "checking"
            ? state.accountsByType.checking
            : null

      const dbId = dbAcc && dbAcc.id != null ? safeNum(dbAcc.id) : 0
      const forced = safeNum(accountId || 0)
      state.activeAccountId = forced || dbId || null

      if (!state.prevYearsWithTx) state.prevYearsWithTx = state.yearsWithTx.slice()

      const yrs = cardYearsForAccount()
      if (yrs.length) state.yearsWithTx = yrs

      if (state.yearsWithTx.length && !state.yearsWithTx.includes(state.year)) {
        state.year = state.yearsWithTx[state.yearsWithTx.length - 1]
      }

      state.monthIndex = defaultMonthForYear(state.year)
      state.monthIndex = Math.max(0, Math.min(11, safeNum(state.monthIndex)))
      normalizeMonthToTxMonths()

      state.cardYearSeries = null
      state.cardMonthAgg = null

      setTab("categories")
      await refresh()
    }

    const exitCardMode = () => {
      state.viewMode = "budget"
      state.activeAccount = null
      state.activeAccountId = null
      state.cardYearSeries = null
      state.cardMonthAgg = null

      if (state.prevYearsWithTx) {
        state.yearsWithTx = state.prevYearsWithTx.slice()
        state.prevYearsWithTx = null

        if (state.yearsWithTx.length && !state.yearsWithTx.includes(state.year)) {
          state.year = state.yearsWithTx[state.yearsWithTx.length - 1]
        }

        state.monthIndex = defaultMonthForYear(state.year)
        state.monthIndex = Math.max(0, Math.min(11, safeNum(state.monthIndex)))
        normalizeMonthToTxMonths()
      }
    }

    const wireDynamicCards = () => {
      state.root.querySelectorAll(".outlk-card-select").forEach(el => {
        el.addEventListener("click", async () => {
          const account = el.dataset.account || ""
          const accountId = el.dataset.accountId || ""
          await enterCardMode({ account, accountId })
        })
      })
    }

    /* =========================================================
       17) REFRESH
    ========================================================= */

const refresh = async () => {
  paintHeader()

  const budAI =
    $("#outlk-bud-ai-wrap") ||
    $("#outlk-bud-ai-btn")?.closest(".outlk-panel") ||
    $("#outlk-bud-ai-out")?.closest(".outlk-panel")

  const cardAI = $("#outlk-card-ai-wrap")
  const cardAIChk = $("#outlk-card-ai-checking")
  const cardAICc = $("#outlk-card-ai-credit")

  if (state.viewMode === "card") {
    if (budAI) budAI.style.display = "none"
    if (cardAI) cardAI.style.display = ""
    if (cardAIChk) cardAIChk.style.display = state.activeAccount === "checking" ? "" : "none"
    if (cardAICc) cardAICc.style.display = state.activeAccount === "credit" ? "" : "none"

    try { await loadActivity() } catch {}
    normalizeMonthToTxMonths()
    paintHeader()

    state.cardYearSeries = null
    state.cardMonthAgg = null

    renderCategoryListCard()
    renderSummaryBannerCard()
    renderChartsCard()
    return
  }

  if (budAI) budAI.style.display = ""
  if (cardAI) cardAI.style.display = "none"
  if (cardAIChk) cardAIChk.style.display = "none"
  if (cardAICc) cardAICc.style.display = "none"

  try {
    await loadActivity()
    await loadYearSeries()
    await loadMonthBudget()
  } catch {}

  paintHeader()
  renderCategoryList()
  renderSummaryBanner()
  renderCharts()
}

const wire = () => {
  if (state._outlkBudWired) return
  state._outlkBudWired = true

  $("#outlk-bud-tab-categories")?.addEventListener("click", async () => {
    if (state.viewMode === "card") exitCardMode()
    setTab("categories")
    await refresh()
  })

  $("#outlk-bud-tab-cards")?.addEventListener("click", async () => {
    setTab("cards")
    await applyCardsConnectionState()
    await renderCardsOverview()
  })

  wireDynamicCards()

  $("#outlk-bud-prev")?.addEventListener("click", async () => {
    if (!state.txAll.length) { try { await loadActivity() } catch {} }
    stepMonthByTx(-1)
    await refresh()
  })

  $("#outlk-bud-next")?.addEventListener("click", async () => {
    if (!state.txAll.length) { try { await loadActivity() } catch {} }
    stepMonthByTx(1)
    await refresh()
  })

  $("#outlk-bud-yearbtn")?.addEventListener("click", async () => {
    if (!state.txAll.length) { try { await loadActivity() } catch {} }
    openYearModal()
  })

  const modal = $("#outlk-bud-yearmodal")
  if (modal) {
    modal.addEventListener("click", (e) => {
      const t = e.target

      if (t === modal) { closeYearModal(); return }

      const closeEl = (t && t.closest) ? t.closest("[data-close]") : null
      if (closeEl) { closeYearModal(); return }

      if (t && t.closest) {
        const panel = t.closest(".outlk-modal-wide, .outlk-modal-panel, .outlk-modal-card, .modal-card")
        if (!panel) closeYearModal()
      }
    })
  }

  $("#outlk-bud-yearprev")?.addEventListener("click", (e) => {
    if (e) e.stopPropagation()
    stepTempYear(-1)
  })

  $("#outlk-bud-yearnext")?.addEventListener("click", (e) => {
    if (e) e.stopPropagation()
    stepTempYear(1)
  })

  $("#outlk-bud-yearcancel")?.addEventListener("click", (e) => {
    if (e) e.stopPropagation()
    state.tempYear = null
    closeYearModal()
  })

  $("#outlk-bud-yearapply")?.addEventListener("click", async (e) => {
    if (e) e.stopPropagation()

    const years = yearListForModal()
    if (!years.length) {
      state.tempYear = null
      closeYearModal()
      return
    }

    const nextYearRaw = Number(state.tempYear)
    const nextYear = years.includes(nextYearRaw) ? nextYearRaw : years[years.length - 1]

    state.year = nextYear
    state.monthIndex = defaultMonthForYear(state.year)
    state.monthIndex = Math.max(0, Math.min(11, safeNum(state.monthIndex)))

    if (!state.txAll.length) { try { await loadActivity() } catch {} }
    normalizeMonthToTxMonths()

    state.tempYear = null
    closeYearModal()

    state.cardYearSeries = null
    state.cardMonthAgg = null

    await refresh()
  })

  /* Budgets AI Analyst BETA
     Generates AI analysis for the budgets view only */
  $("#outlk-bud-ai-btn")?.addEventListener("click", async () => {
    const out = $("#outlk-bud-ai-out")
    if (!out) return
    if (state.aiBusyBudgets) return
    if (!state.txAll.length) { try { await loadActivity() } catch {} }

    const year = Number(state.year)
    const todayKey = laDateKey(new Date())
    const todayYear = Number(String(todayKey).slice(0, 4))

    const txAll = Array.isArray(state.txAll) ? state.txAll : []
    const tx = txAll.filter((t) => {
      const d = parseTs(t.timestamp || t.createdAt || t.date || null)
      if (!d) return false
      const key = laDateKey(d)
      if (!key) return false
      const ky = Number(String(key).slice(0, 4))
      if (ky !== year) return false
      const acct = String(t.accountType || "").toLowerCase()
      return acct !== "credit"
    })

    const r0 = computeOutlookYearRange(tx, year)
    const startISO = year === todayYear ? `${year}-01-01` : r0.startISO
    const endISO = r0.endISO

    out.textContent = `> Generating AI analysis for ${year} (${startISO} to ${endISO})...\n\n`
    await generateAIAnalysis()
  })

  /* Checking AI Analyst BETA
     Generates AI analysis for the checking card only */
  $("#outlk-check-ai-btn")?.addEventListener("click", async () => {
    const out = $("#outlk-check-ai-out")
    if (!out) return
    if (state.aiBusyChecking) return
    if (!state.txAll.length) { try { await loadActivity() } catch {} }

    const year = Number(state.year)
    const todayKey = laDateKey(new Date())
    const todayYear = Number(String(todayKey).slice(0, 4))

    const txAll = Array.isArray(state.txAll) ? state.txAll : []
    const tx = txAll.filter((t) => {
      const d = parseTs(t.timestamp || t.createdAt || t.date || null)
      if (!d) return false
      const key = laDateKey(d)
      if (!key) return false
      const ky = Number(String(key).slice(0, 4))
      if (ky !== year) return false
      const acct = String(t.accountType || "").toLowerCase()
      return acct === "checking"
    })

    const r0 = computeOutlookYearRange(tx, year)
    const startISO = year === todayYear ? `${year}-01-01` : r0.startISO
    const endISO = r0.endISO

    out.textContent = `> Generating AI analysis for Checking (${year}) (${startISO} to ${endISO})...\n\n`
    await generateAICardAnalysis("checking")
  })

  /* Credit AI Analyst BETA
     Generates AI analysis for the credit card only */
  $("#outlk-credit-ai-btn")?.addEventListener("click", async () => {
    const out = $("#outlk-credit-ai-out")
    if (!out) return
    if (state.aiBusyCredit) return
    if (!state.txAll.length) { try { await loadActivity() } catch {} }

    const year = Number(state.year)
    const todayKey = laDateKey(new Date())
    const todayYear = Number(String(todayKey).slice(0, 4))

    const txAll = Array.isArray(state.txAll) ? state.txAll : []
    const tx = txAll.filter((t) => {
      const d = parseTs(t.timestamp || t.createdAt || t.date || null)
      if (!d) return false
      const key = laDateKey(d)
      if (!key) return false
      const ky = Number(String(key).slice(0, 4))
      if (ky !== year) return false
      const acct = String(t.accountType || "").toLowerCase()
      return acct === "credit"
    })

    const r0 = computeOutlookYearRange(tx, year)
    const startISO = year === todayYear ? `${year}-01-01` : r0.startISO
    const endISO = r0.endISO

    out.textContent = `> Generating AI analysis for Credit (${year}) (${startISO} to ${endISO})...\n\n`
    await generateAICardAnalysis("credit")
  })

  window.addEventListener("data:updated", () => refresh())
  window.addEventListener("budget:updated", () => refresh())
}

    /* =========================================================
       19) PUBLIC API
    ========================================================= */

/* Page lifecycle: init
   This section safely re-binds all button handlers when the Budgets page is re-entered */
const init = async ({ rootId } = {}) => {
  const nextRoot =
    document.getElementById(rootId || "") ||
    document.getElementById("outlk-budgets-root")

  if (!nextRoot) return

  const rootChanged = state.root !== nextRoot
  state.root = nextRoot

  // If the page DOM was rebuilt, our old listeners are gone, so we must re-wire.
  if (rootChanged) state._outlkBudWired = false

  wire()
  await applyCardsConnectionState()
  await refresh()
}

/* Page lifecycle: cleanup
   This section resets wiring state so the page works after you leave and enter again */
const cleanup = () => {
  destroyCharts()

  // Close modal state defensively (new DOM on next entry, but state should not carry over)
  state.tempYear = null
  closeYearModal()

  // Reset view state
  state.viewMode = "budget"
  state.activeAccount = null
  state.activeAccountId = null
  state.prevYearsWithTx = null
  state.cardYearSeries = null
  state.cardMonthAgg = null

  // Important: allow re-binding listeners next time the page is opened
  state._outlkBudWired = false
  state.root = null

  // Optional but helps avoid stale assumptions on re-entry
  state.txAll = []
  state.yearsWithTx = []

  state.year = new Date().getFullYear()
  state.monthIndex = new Date().getMonth()

  setTab("categories")
}
    return { init, cleanup }
  }

  window.__outlook_pages = window.__outlook_pages || {}
  window.__outlook_pages.budgets = buildApi()
})()
