(() => {
  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 })
  const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short" })

  const $q = (root, sel) => root.querySelector(sel)
  const monthName = (m) => monthFmt.format(new Date(2000, m, 1))
  const clampMonth = (m) => Math.max(0, Math.min(11, m))

  const pISO = (s) => {
    if (s == null) return new Date(NaN)
    if (s instanceof Date) return s
    if (typeof s === "number" && Number.isFinite(s)) return new Date(s)
    const str = String(s).trim()
    if (!str) return new Date(NaN)
    if (/^\d{10,13}$/.test(str)) {
      const n = Number(str)
      if (Number.isFinite(n)) return new Date(str.length === 10 ? n * 1000 : n)
    }
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] || 0, m[5] || 0, m[6] || 0)
    return new Date(str)
  }

  const txDate = (t) => {
    const d = t?.date || t?.dateAdded || t?.createdAt || t?.timestamp
    const time = t?.time || ""
    if (d && typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && typeof time === "string" && /^\d{2}:\d{2}/.test(time)) {
      return pISO(`${d} ${time}`)
    }
    return pISO(d)
  }

  const txYear = (t) => txDate(t).getFullYear()
  const txMonthIndex = (t) => txDate(t).getMonth()
  const txType = (t) => (String(t.type || t.kind || t.direction || "").toLowerCase() === "income" ? "income" : "expense")
  const txAmount = (t) => Number(t.amount || t.value || 0) || 0
  const txCategory = (t) => String(t.category || t.cat || t.group || t.label || "Uncategorized").trim() || "Uncategorized"

  const fetchJSON = async (url) => {
    const res = await fetch(url, { headers: { Accept: "application/json" }, credentials: "include" })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  }

const state = {
  root: null,
  tx: [],
  years: [],
  activeYear: new Date().getFullYear(),
  month: new Date().getMonth(),
  chart: null,
  typingTimer: 0,
  aiBusy: false
}

  const destroyChart = () => { if (state.chart) state.chart.destroy(); state.chart = null }

  const yearsWithTx = (tx) => {
    const set = new Set()
    for (const t of tx || []) {
      const d = txDate(t)
      const y = d instanceof Date ? d.getFullYear() : NaN
      if (Number.isFinite(y)) set.add(y)
    }
    return Array.from(set).sort((a, b) => b - a)
  }

  const yearMonthStats = (year) => {
    const months = new Set()
    for (const t of state.tx || []) {
      const d = txDate(t)
      if (!(d instanceof Date) || !Number.isFinite(d.getTime())) continue
      if (d.getFullYear() !== year) continue
      months.add(d.getMonth())
    }
    if (!months.size) return { months, min: 0, max: 11, hasJan: false }
    let min = 11, max = 0
    for (const m of months) { if (m < min) min = m; if (m > max) max = m }
    return { months, min, max, hasJan: months.has(0) }
  }

  const defaultMonthForYear = (year) => {
    const now = new Date()
    const curYear = now.getFullYear()
    const curMonth = now.getMonth()

    if (year === curYear) return curMonth

    const st = yearMonthStats(year)
    if (year < curYear) return st.hasJan ? 0 : st.min

    return st.min
  }

  const monthBoundsForYear = (year) => {
    const now = new Date()
    const curYear = now.getFullYear()
    const curMonth = now.getMonth()

    const st = yearMonthStats(year)
    const min = st.hasJan ? 0 : st.min

    if (year === curYear) return { min, max: curMonth }

    return { min, max: 11 }
  }

  const paintLabels = () => {
    const yearDisplay = $q(state.root, "#year-display")
    if (yearDisplay) yearDisplay.textContent = String(state.activeYear)

    const yearText = $q(state.root, "#outlk-act-yeartext")
    if (yearText) yearText.textContent = String(state.activeYear)

    const monthLbl = $q(state.root, "#outlk-act-month")
    if (monthLbl) monthLbl.textContent = monthName(state.month)
  }

const yearSummary = (list, year, start, end) => {
  const startMs = start instanceof Date && Number.isFinite(start.getTime()) ? start.getTime() : null
  const endMs = end instanceof Date && Number.isFinite(end.getTime()) ? end.getTime() : null

  let income = 0
  let expenses = 0
  let incomeCount = 0
  let expenseCount = 0

  const byIncomeCat = new Map()
  const byExpenseCat = new Map()

  const months = Array.from({ length: 12 }).map((_, i) => ({
    idx: i,
    label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(year, i, 1)),
    income: 0,
    expenses: 0,
    net: 0
  }))

  for (const t of list || []) {
    const d = txDate(t)
    if (!d) continue
    if (d.getFullYear() !== Number(year)) continue

    const ms = d.getTime()
    if (startMs != null && ms < startMs) continue
    if (endMs != null && ms > endMs) continue

    const amt = Number(t.amount || 0)
    const type = String(t.type || "").toLowerCase()
    const cat = String(t.category || t.categoryName || t.label || "Other")

    const mi = d.getMonth()

    if (type === "income") {
      income += amt
      incomeCount++
      months[mi].income += amt
      const cur = byIncomeCat.get(cat) || 0
      byIncomeCat.set(cat, cur + amt)
    } else {
      expenses += Math.abs(amt)
      expenseCount++
      months[mi].expenses += Math.abs(amt)
      const cur = byExpenseCat.get(cat) || 0
      byExpenseCat.set(cat, cur + Math.abs(amt))
    }
  }

  for (const m of months) m.net = m.income - m.expenses

  const topN = (m, n) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([name, amount]) => ({ name, amount }))

  const net = income - expenses

  return {
    year: Number(year),
    income,
    expenses,
    net,
    txCount: incomeCount + expenseCount,
    incomeCount,
    expenseCount,
    topIncome: topN(byIncomeCat, 3),
    topExpense: topN(byExpenseCat, 3),
    months
  }
}

const buildAI = async (year, rangeStart, rangeEnd, summary) => {
  const res = await fetch("/api/ai/outlook/activity", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({ year, rangeStart, rangeEnd, summary })
  })

  let data = null
  try { data = await res.json() } catch {}

  if (!res.ok) {
    const msg = data?.error || "AI generation failed."
    throw new Error(msg)
  }

  const text = String(data?.text || "").trim()
  if (!text) throw new Error("AI returned empty response.")
  return text
}

  const buildYearChart = () => {
    const canvas = $q(state.root, "#outlk-act-year")
    if (!canvas || !window.Chart) return
    destroyChart()

    const year = Number(state.activeYear)
    const activeMonth = Number(state.month)
    const tx = (state.tx || []).filter((t) => txYear(t) === year)

    const income = Array(12).fill(0)
    const expense = Array(12).fill(0)

    for (const t of tx) {
      const m = txMonthIndex(t)
      const amt = Math.abs(txAmount(t))
      if (m >= 0 && m <= 11) txType(t) === "income" ? income[m] += amt : expense[m] += amt
    }

    const net = income.map((v, i) => v - expense[i])

    const C_INC = "#22c55e"
    const C_EXP = "#ef4444"
    const C_NET = "#3b82f6"

    const full = (hex) => Array.from({ length: 12 }, () => hex)
    const borderColors = () => Array.from({ length: 12 }, (_, i) => (i === activeMonth ? "#ffffff" : "transparent"))
    const borderWidths = () => Array.from({ length: 12 }, (_, i) => (i === activeMonth ? 2 : 0))

    state.chart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: Array.from({ length: 12 }, (_, i) => monthName(i)),
        datasets: [
          { label: "Income", data: income, backgroundColor: full(C_INC), borderColor: borderColors(), borderWidth: borderWidths(), borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.8 },
          { label: "Expenses", data: expense, backgroundColor: full(C_EXP), borderColor: borderColors(), borderWidth: borderWidths(), borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.8 },
          { label: "Net", data: net, backgroundColor: full(C_NET), borderColor: borderColors(), borderWidth: borderWidths(), borderRadius: 4, barPercentage: 0.7, categoryPercentage: 0.8 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { mode: "index", intersect: false },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: (ctx) => (ctx.index === activeMonth ? "#fff" : "#64748b"),
              font: (ctx) => (ctx.index === activeMonth ? { weight: "bold", size: 13 } : { weight: "normal" })
            }
          },
          y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#94a3b8" } }
        },
        plugins: {
          legend: { labels: { color: "#fff" } },
          tooltip: {
            backgroundColor: "rgba(15, 23, 42, 0.95)",
            titleColor: "#fff",
            bodyColor: "#cbd5e1",
            borderColor: "rgba(148, 163, 184, 0.2)",
            borderWidth: 1,
            callbacks: {
              label: (context) => {
                let label = context.dataset.label || ""
                if (label) label += ": "
                if (context.parsed.y != null) label += fmt.format(context.parsed.y)
                return label
              }
            }
          }
        }
      }
    })
  }

  const groupCategoryMonth = (year, month) => {
    const tx = (state.tx || []).filter((t) => txYear(t) === year && txMonthIndex(t) === month)
    const agg = new Map()
    let iC = 0, eC = 0
    for (const t of tx) {
      const cat = txCategory(t)
      const amt = Math.abs(txAmount(t))
      const type = txType(t)
      const key = `${type}::${cat}`
      agg.set(key, (agg.get(key) || 0) + amt)
      type === "income" ? iC++ : eC++
    }
    const rows = Array.from(agg.entries()).map(([k, v]) => {
      const [type, cat] = k.split("::")
      return { type, cat, val: v }
    }).sort((a, b) => b.val - a.val)
    return { rows, iC, eC }
  }

  const renderMonth = () => {
    paintLabels()

    const { rows, iC, eC } = groupCategoryMonth(Number(state.activeYear), Number(state.month))

    const iEl = $q(state.root, "#outlk-act-income-pill .outlk-pillval")
    const eEl = $q(state.root, "#outlk-act-expense-pill .outlk-pillval")
    if (iEl) iEl.textContent = String(iC)
    if (eEl) eEl.textContent = String(eC)

    const list = $q(state.root, "#outlk-act-catrows")
    if (!list) return

    if (!rows.length) {
      list.innerHTML = `<div style="text-align:center;color:#64748b;padding:20px;">No Data</div>`
      return
    }

    list.innerHTML = rows.map((r) => {
      const dot = r.type === "income" ? "green" : "red"
      const amtCls = r.type === "income" ? "green" : "red"
      return `
      <div class="outlk-catrow">
        <div class="outlk-catleft">
          <div class="outlk-dot ${dot}"></div>
          <div>
            <div class="outlk-catname">${r.cat}</div>
            <div class="outlk-catsub">${r.type === "income" ? "Income" : "Expense"}</div>
          </div>
        </div>
        <div class="outlk-catamt ${amtCls}">${fmt.format(r.val)}</div>
      </div>`
    }).join("")
  }

  const stopTyping = () => {
    if (state.typingTimer) clearTimeout(state.typingTimer)
    state.typingTimer = 0
  }

  const typeWriter = (text, element) => {
    stopTyping()
    element.textContent = ""
    element.classList.remove("outlk-hidden")
    let i = 0
    const tick = () => {
      if (i < text.length) {
        element.textContent += text.charAt(i)
        i++
        state.typingTimer = setTimeout(tick, 10)
      }
    }
    tick()
  }

const renderYearGrid = () => {
  const grid = $q(state.root, "#outlk-act-year-list")
  if (!grid) return
  grid.innerHTML = ""
  grid.style.display = "none"
}


  const applyYear = (year) => {
    if (!state.years.includes(year)) return

    state.activeYear = year
    state.month = clampMonth(defaultMonthForYear(year))

    const b = monthBoundsForYear(year)
    if (state.month < b.min) state.month = b.min
    if (state.month > b.max) state.month = b.max

    const out = $q(state.root, "#outlk-act-ai-out")
    if (out) { out.textContent = ""; out.classList.add("outlk-hidden") }

    paintLabels()
    buildYearChart()
    renderMonth()
  }

const wire = () => {
  const modal = $q(state.root, "#outlk-act-year-modal")

  const closeModal = () => {
    try { if (modal?.open) modal.close() } catch {}
  }

  const openModal = () => {
    if (!modal) return
    const v = $q(state.root, "#outlk-act-year-value")
    if (v) v.textContent = String(state.activeYear)
    renderYearGrid()
    try { modal.showModal() } catch {}
  }

  $q(state.root, "#outlk-act-yearbtn")?.addEventListener("click", openModal)
  $q(state.root, "#outlk-act-year-close")?.addEventListener("click", closeModal)
  $q(state.root, "#outlk-act-year-cancel")?.addEventListener("click", closeModal)

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal()
    })
    modal.addEventListener("cancel", (e) => {
      e.preventDefault()
      closeModal()
    })
  }

  const moveModalYear = (dir) => {
    const v = $q(state.root, "#outlk-act-year-value")
    if (!v) return
    const years = state.years || []
    if (!years.length) return

    const cur = Number(v.textContent)
    const idx = years.indexOf(cur)
    if (idx === -1) { v.textContent = String(state.activeYear); return }

    const nextIdx = Math.max(0, Math.min(years.length - 1, idx + dir))
    v.textContent = String(years[nextIdx])
  }

  $q(state.root, "#outlk-act-year-dec")?.addEventListener("click", () => moveModalYear(+1))
  $q(state.root, "#outlk-act-year-inc")?.addEventListener("click", () => moveModalYear(-1))

  $q(state.root, "#outlk-act-year-apply")?.addEventListener("click", () => {
    const v = $q(state.root, "#outlk-act-year-value")
    const y = Number(v ? v.textContent : NaN)
    if (Number.isFinite(y)) applyYear(y)
    closeModal()
  })

  const moveMonth = (dir) => {
    const year = Number(state.activeYear)
    const b = monthBoundsForYear(year)
    const next = clampMonth(state.month + dir)
    if (next < b.min || next > b.max) return
    state.month = next
    renderMonth()
    buildYearChart()
  }

  $q(state.root, "#outlk-act-prev")?.addEventListener("click", () => moveMonth(-1))
  $q(state.root, "#outlk-act-next")?.addEventListener("click", () => moveMonth(+1))

  $q(state.root, "#outlk-act-ai-btn")?.addEventListener("click", async () => {
    const out = $q(state.root, "#outlk-act-ai-out")
    if (!out) return
    if (state.aiBusy) return
    state.aiBusy = true

    stopTyping()
    out.textContent = ""

    const year = Number(state.activeYear)
    const now = new Date()
    const nowYear = now.getFullYear()

    let start = new Date(year, 0, 1)
    let end = year === nowYear ? now : new Date(year, 11, 31, 23, 59, 59, 999)

    let minInYear = null
    for (const t of state.tx || []) {
      const d = txDate(t)
      if (!d) continue
      if (d.getFullYear() !== year) continue
      if (!minInYear || d < minInYear) minInYear = d
    }

    if (!minInYear) {
      typeWriter(`> No transactions found for ${year}.`, out)
      state.aiBusy = false
      return
    }

    if (year !== nowYear) {
      const floor = new Date(minInYear.getFullYear(), minInYear.getMonth(), minInYear.getDate())
      if (floor > start) start = floor
    }

    const pad2 = (n) => String(n).padStart(2, "0")
    const rangeStart = `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}`
    const rangeEnd = `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`

    const summary = yearSummary(state.tx, year, start, end)

    typeWriter(`> Generating AI analysis for ${year} (${rangeStart} to ${rangeEnd})...\n`, out)

    try {
      const text = await buildAI(year, rangeStart, rangeEnd, summary)
      stopTyping()
      out.textContent = ""
      typeWriter(text, out)
    } catch (e) {
      stopTyping()
      out.textContent = ""
      typeWriter(`> ${String(e?.message || "AI generation failed.")}`, out)
    } finally {
      state.aiBusy = false
    }
  })
}

const init = async ({ rootId }) => {
  const root = document.getElementById(rootId)
  if (!root) return
  state.root = root

  let data = []
  try {
    const r = await fetchJSON("/api/activity")
    data =
      Array.isArray(r) ? r
      : Array.isArray(r.items) ? r.items
      : Array.isArray(r.data) ? r.data
      : Array.isArray(r.transactions) ? r.transactions
      : []

    data = data.filter((t) => String(t.accountType || "").toLowerCase() !== "credit")
  } catch {
    data = []
  }

  state.tx = Array.isArray(data) ? data : []
  state.years = yearsWithTx(state.tx)

  if (state.years.length) {
    const nowYear = new Date().getFullYear()
    state.activeYear = state.years.includes(nowYear) ? nowYear : state.years[0]
    state.month = clampMonth(defaultMonthForYear(state.activeYear))

    const b = monthBoundsForYear(state.activeYear)
    if (state.month < b.min) state.month = b.min
    if (state.month > b.max) state.month = b.max
  } else {
    state.activeYear = new Date().getFullYear()
    state.month = new Date().getMonth()
  }

  paintLabels()
  wire()
  buildYearChart()
  renderMonth()
}


  const cleanup = () => {
    stopTyping()
    destroyChart()
    try {
      const modal = state.root ? $q(state.root, "#outlk-act-year-modal") : null
      if (modal?.open) modal.close()
    } catch {}
  }

  window.__outlook_pages = window.__outlook_pages || {}
  window.__outlook_pages.activity = { init, cleanup }
})()
