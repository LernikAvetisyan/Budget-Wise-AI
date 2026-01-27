;(() => {
  /* =========================================
     0) DOM + API constants
  ========================================= */

  const $ = (id) => document.getElementById(id)

  const API = {
    ACTIVITY: "/api/activity",
    BUDGETS: "/api/budgets",
    CARDS: "/api/budgets/cards",

    GOALS_SECTIONS: "/api/goals/sections",
    GOALS_IN_SECTION: (sectionId) => `/api/goals/sections/${encodeURIComponent(sectionId)}/goals`,

    // matches backend route: GET /api/goals/:goalId/deposits
    GOAL_DEPOSITS: (goalId) => `/api/goals/goals/${encodeURIComponent(goalId)}/deposits`,

    NOTIFS: "/api/settings/notifications",
    REWARDS: "/api/rewards",

    // DB-backed Daily AI Assistant (no localStorage)
    AI_ASSISTANT_TODAY: "/api/ai/assistant/today"
  }

  /* =========================================
     1) Level system (existing UI feature)
  ========================================= */

  const LEVEL_CAPS = [0, 1000, 25000, 50000, 65000, 75000, 100000, 150000, 200000, 250000, 300000]
  const LEVEL_TITLES = {
    1: "Novice",
    2: "Active",
    3: "Secure",
    4: "Pro",
    5: "Winner",
    6: "Elite",
    7: "Master",
    8: "Grand",
    9: "Legend",
    10: "Mythic"
  }

  /* =========================================
     2) Runtime state
  ========================================= */

  const state = {
    tab: "transactions",

    cards: { checking: null, credit: null },

    activity: [],
    budgets: [],

    goalSections: [],
    goalsBySectionId: new Map(),
    depositsByGoalId: new Map(),

    notif: null,
    overallXp: 0,

    pulseChart: null,
    animId: null,

    refreshTimer: null,

    autoRotateTimer: null,
    autoRotateStopped: false,

    dailyAiTimer: null,
    dailyAiInterval: null,

    aiTypeSeq: 0,
    aiTypeTimer: null
  }

  /* =========================================
     3) Formatting helpers
  ========================================= */

  const safeText = (v) => (v == null ? "" : String(v))
  const fmtMoney = (n) => (Number(n) || 0).toLocaleString(undefined, { style: "currency", currency: "USD" })

  const fmtShortDate = (yyyyMmDd) => {
    if (!yyyyMmDd) return ""
    const s = String(yyyyMmDd).slice(0, 10)
    const dt = new Date(`${s}T00:00:00`)
    if (Number.isNaN(dt.getTime())) return s
    return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  }

  const fmtDateTime = (dtLike) => {
    if (!dtLike) return ""
    const d = new Date(dtLike)
    if (Number.isNaN(d.getTime())) return safeText(dtLike)
    return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} • ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
  }

  /* =========================================
     4) Network helper
  ========================================= */

  async function apiFetch(path, options = {}) {
    const headers = { Accept: "application/json", ...(options.headers || {}) }
    if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json"

    const res = await fetch(path, {
      method: options.method || "GET",
      headers,
      credentials: "include",
      body: options.body
    })

    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { data = text }

    if (!res.ok) {
      const msg = (data && data.error) || (typeof data === "string" && data.trim()) || `HTTP ${res.status}`
      throw new Error(msg)
    }

    return data
  }

  /* =========================================
     5) LA time helpers (America/Los_Angeles)
  ========================================= */

  function laNowDate() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))
  }

  function laYmdString() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date())

    let y = "0000", m = "00", d = "00"
    for (const p of parts) {
      if (p.type === "year") y = p.value
      if (p.type === "month") m = p.value
      if (p.type === "day") d = p.value
    }
    return `${y}-${m}-${d}`
  }

  function laYearMonth() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit"
    }).formatToParts(new Date())

    let y = "0000", m = "00"
    for (const p of parts) {
      if (p.type === "year") y = p.value
      if (p.type === "month") m = p.value
    }
    return { y: Number(y), m: Number(m), ym: `${y}-${m}` }
  }

  function daysInMonth(year, month1to12) {
    return new Date(year, month1to12, 0).getDate()
  }

  function laDaysInMonth() {
    const { y, m } = laYearMonth()
    if (!Number.isFinite(y) || !Number.isFinite(m) || y < 1970 || m < 1 || m > 12) {
      const now = new Date()
      return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    }
    return daysInMonth(y, m)
  }

  function laDaysRemainingInMonth() {
    const nowLA = laNowDate()
    const year = nowLA.getFullYear()
    const month1 = nowLA.getMonth() + 1
    const day = nowLA.getDate()
    const dim = daysInMonth(year, month1)
    return Math.max(1, dim - day + 1)
  }

  function computeWeekRangeLA_MonSun() {
    const nowLA = laNowDate()
    const d = new Date(nowLA)

    const dow = d.getDay()
    const diff = (dow + 6) % 7

    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - diff)

    const start = new Date(d)
    const end = new Date(d)
    end.setDate(end.getDate() + 7)

    return { start, end }
  }

  function txToDateTimeLocal(t) {
    const ds = String(t?.date || "").slice(0, 10)
    if (!ds) return null
    const ts = String(t?.time || "").slice(0, 8)
    const iso = ts ? `${ds}T${ts}` : `${ds}T00:00:00`
    const dt = new Date(iso)
    return Number.isNaN(dt.getTime()) ? null : dt
  }

  function laIsNewMonthMidnight() {
    const nowLA = laNowDate()
    return nowLA.getDate() === 1 && nowLA.getHours() === 0
  }

  /* =========================================
     6) Level badge UI
  ========================================= */

  function computeLevelFromXp(overallXp) {
    const overall = Math.max(0, Number(overallXp) || 0)

    let level = 1
    for (let i = 0; i < LEVEL_CAPS.length - 1; i++) {
      if (overall >= LEVEL_CAPS[i]) level = i + 1
    }
    if (overall >= LEVEL_CAPS[LEVEL_CAPS.length - 1]) level = 10

    return { level, title: LEVEL_TITLES[level] || "Novice" }
  }

  function applyLevelBadgeUI() {
    const lvlEl = $("dash-level-label")
    const titleEl = $("dash-level-title")
    if (!lvlEl || !titleEl) return

    const { level, title } = computeLevelFromXp(state.overallXp)
    lvlEl.textContent = `Level ${level}`
    titleEl.textContent = title
  }

  function setHeaderDate() {
    const el = $("dash-current-date")
    if (!el) return
    const d = new Date()
    el.textContent = d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
  }

  /* =========================================
     7) Core computed metrics (deterministic)
  ========================================= */

function availableBalanceFromTransactions() {
  const allBal = Number(state.cards.allBalance)
  if (Number.isFinite(allBal)) return allBal

  const chk = Number(state.cards.checking?.balance || 0)
  if (!Number.isFinite(chk)) return 0
  return Math.max(0, chk)
}

  function computeBudgets() {
    const rows = Array.isArray(state.budgets) ? state.budgets : []
    const enabled = rows.filter((r) => r && r.enabled)

    const total = enabled.reduce((a, r) => a + (Number(r.monthlyLimit) || 0), 0)
    const spent = enabled.reduce((a, r) => a + (Number(r.spentAmount) || 0), 0)
    const left = Math.max(0, total - spent)
    const pct = total > 0 ? Math.max(0, Math.min(100, (spent / total) * 100)) : 0

    const days = laDaysRemainingInMonth()
    const dailyAvg = left / Math.max(1, days)

    const utilization = total > 0 ? spent / total : 0

    return { total, spent, left, pct, dailyAvg, days, utilization }
  }

  function computeWeeklySummaryMonSun() {
    const { start, end } = computeWeekRangeLA_MonSun()
    const rows = Array.isArray(state.activity) ? state.activity : []

    let income = 0
    let spent = 0

    for (const t of rows) {
      const dt = txToDateTimeLocal(t)
      if (!dt) continue
      if (dt < start || dt >= end) continue

      const amt = Number(t.amount) || 0
      if (t.type === "income") income += amt
      if (t.type === "expense") spent += amt
    }

    return { income, spent, net: income - spent }
  }

  function normalizeDepositDateTime(goal) {
    const depDateRaw = goal && goal.depositDate != null ? String(goal.depositDate).trim() : ""
    const depTimeRaw = goal && goal.depositTime != null ? String(goal.depositTime).trim() : ""

    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()

    let day = null

    if (/^\d{4}-\d{2}-\d{2}/.test(depDateRaw)) {
      const d = new Date(`${depDateRaw.slice(0, 10)}T00:00:00`)
      if (!Number.isNaN(d.getTime())) day = d.getDate()
    } else if (/^\d{1,2}$/.test(depDateRaw)) {
      const d = Number(depDateRaw)
      if (d >= 1 && d <= 31) day = d
    }

    if (!day) return null

    let hh = 9, mm = 0
    const mt = depTimeRaw.match(/^(\d{2}):(\d{2})/)
    if (mt) {
      hh = Number(mt[1]) || 0
      mm = Number(mt[2]) || 0
    }

    const dt = new Date(y, m, day, hh, mm, 0, 0)
    return Number.isNaN(dt.getTime()) ? null : dt
  }

  function computeGoalsMeta() {
    const sections = Array.isArray(state.goalSections) ? state.goalSections : []
    const map = state.goalsBySectionId

    let monthly = 0
    let next = null

    for (const s of sections) {
      const goals = map.get(s.id) || []
      for (const g of goals) {
        if (String(g.status || "active").toLowerCase() !== "active") continue
        if (g.depositPaused) continue

        const mm = Number(g.minMonthlyDeposit)
        if (Number.isFinite(mm) && mm > 0) monthly += mm

        const dt = normalizeDepositDateTime(g)
        if (dt && (!next || dt < next)) next = dt
      }
    }

    return {
      totalMonthly: monthly,
      nextPayment: next
        ? `${next.toLocaleDateString(undefined, { month: "short", day: "numeric" })} • ${next.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
        : "—"
    }
  }

  function buildGoalsGridData() {
    const MAX_SECTIONS = 5
    const MAX_GOALS = 3

    const sections = Array.isArray(state.goalSections) ? state.goalSections : []
    const map = state.goalsBySectionId

    const out = []
    for (let i = 0; i < MAX_SECTIONS; i++) {
      const sec = sections[i] || null
      const secName = sec ? safeText(sec.name || "Not added") : "Not added"

      const goals = sec ? (map.get(sec.id) || []) : []
      const items = []

      for (let j = 0; j < MAX_GOALS; j++) {
        const g = goals[j] || null
        if (!g) {
          items.push({ name: "Not added", amount: 0, time: "" })
          continue
        }

        const dt = normalizeDepositDateTime(g)
        items.push({
          name: safeText(g.name || "Not added"),
          amount: Number(g.minMonthlyDeposit) || 0,
          time: dt ? `${dt.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""
        })
      }

      out.push({ name: secName, items })
    }

    return out
  }

  function computeActivityChartSeries() {
    const rows = Array.isArray(state.activity) ? state.activity : []
    const { ym } = laYearMonth()
    const ymStr = `${String(ym).slice(0, 4)}-${String(ym).slice(5, 7)}`
    const lastDay = laDaysInMonth()

    const keyDays = [1, 5, 10, 15, 20, 25]
    if (!keyDays.includes(lastDay)) keyDays.push(lastDay)
    keyDays.sort((a, b) => a - b)

    const counts = new Map()
    for (const d of keyDays) counts.set(d, 0)

    let income = 0
    let spent = 0

    for (const t of rows) {
      const ds = String(t.date || "").slice(0, 10)
      if (!ds || !ds.startsWith(ymStr)) continue

      const amt = Number(t.amount) || 0
      if (t.type === "income") income += amt
      if (t.type === "expense") spent += amt

      const dayNum = Number(ds.slice(8, 10))
      if (counts.has(dayNum)) counts.set(dayNum, (counts.get(dayNum) || 0) + 1)
    }

    const points = keyDays.map((d) => ({ x: d, y: counts.get(d) || 0 }))

    return {
      points,
      tickDays: keyDays,
      radiusDays: keyDays,
      xMax: lastDay,
      income,
      spent,
      net: income - spent
    }
  }

  function buildGoalsPaymentSeries() {
    const lastDay = laDaysInMonth()
    const payByDay = new Map()

    const sections = Array.isArray(state.goalSections) ? state.goalSections : []
    for (const s of sections) {
      const goals = state.goalsBySectionId.get(s.id) || []
      for (const g of goals) {
        if (!g) continue
        if (String(g.status || "active").toLowerCase() !== "active") continue
        if (g.depositPaused) continue

        const dt = normalizeDepositDateTime(g)
        if (!dt) continue

        const day = dt.getDate()
        if (day < 1 || day > lastDay) continue

        const amt = Number(g.minMonthlyDeposit) || 0
        if (amt <= 0) continue

        payByDay.set(day, (payByDay.get(day) || 0) + amt)
      }
    }

    const points = []
    const paymentDays = []

    for (let day = 1; day <= lastDay; day++) {
      const y = payByDay.get(day) || 0
      points.push({ x: day, y })
      if (y > 0) paymentDays.push(day)
    }

    return { points, radiusDays: paymentDays, xMax: lastDay }
  }

  /* =========================================
     8) Financial Overview HTML builders
  ========================================= */

  const setMainMeta = ({ label, amountText, rightHTML }) => {
    const labelEl = $("main-label")
    const amountEl = $("main-amount")
    const rightEl = $("dash-meta-right")
    if (labelEl) labelEl.textContent = label || ""
    if (amountEl) amountEl.textContent = amountText || ""
    if (rightEl) rightEl.innerHTML = rightHTML || ""
  }

  const getTxHTML = (stats) => `
    <div class="tx-view-wrap">
      <div class="tx-chart-container"><canvas id="dash-pulse-chart"></canvas></div>
      <div class="hero-stats-grid">
        <div class="hero-stat-item"><span class="h-stat-label">Income</span><span class="h-stat-val pos">${fmtMoney(stats.income)}</span></div>
        <div class="hero-stat-item"><span class="h-stat-label">Spent</span><span class="h-stat-val neg">-${fmtMoney(stats.spent).replace("$", "")}</span></div>
        <div class="hero-stat-item"><span class="h-stat-label">Net Change</span><span class="h-stat-val ${stats.net >= 0 ? "pos" : "neg"}">${stats.net >= 0 ? "" : "-"}${fmtMoney(Math.abs(stats.net))}</span></div>
      </div>
    </div>
  `

  const getBudHTML = (b) => `
    <div class="budget-view-wrap">
      <div class="b-main-headline">
        <div class="b-left-label">Left to spend</div>
        <div class="b-left-amount">${fmtMoney(b.left)}</div>
      </div>
      <div class="b-line-chart">
        <div class="b-track"><div class="b-fill" style="width: ${b.pct.toFixed(0)}%"></div></div>
        <div class="b-labels"><span class="l-spent">${fmtMoney(b.spent)} spent</span><span class="l-remain">${fmtMoney(b.total)} Total Budget</span></div>
      </div>
    </div>
  `

  const getGoalsHTML = (sections5x3) => {
    const secs = sections5x3.map(s => `
      <div class="goal-section-card">
        <div class="gs-title">${safeText(s.name)}</div>
        ${s.items.map(i => `
          <div class="g-item">
            <div>
              ${safeText(i.name)}
              <span class="g-time">${safeText(i.time)}</span>
            </div>
            <span>${fmtMoney(i.amount)}</span>
          </div>
        `).join("")}
      </div>
    `).join("")

    return `
      <div class="goals-view-wrap">
        <div class="goals-grid-container">${secs}</div>
        <div class="goals-chart-area"><canvas id="dash-pulse-chart"></canvas></div>
      </div>
    `
  }

  /* =========================================
     9) Chart renderer (stable, no constant rebuild)
  ========================================= */

  function renderChart(kind, payload) {
    const canvas = $("dash-pulse-chart")
    if (!canvas || typeof Chart === "undefined") return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    if (state.pulseChart) state.pulseChart.destroy()
    if (state.animId) cancelAnimationFrame(state.animId)

    const getDynamicGradient = (ctx2, chartArea, offset) => {
      const gradient = ctx2.createLinearGradient(chartArea.left, 0, chartArea.right, 0)
      const stops = [0, 0.25, 0.5, 0.75, 1]
      const colors = ["#22c55e", "#22d3ee", "#3b82f6", "#a855f7", "#22c55e"]
      stops.forEach((stop, i) => gradient.addColorStop((stop + offset) % 1, colors[i]))
      return gradient
    }

    const fillGrad = (() => {
      const g = ctx.createLinearGradient(0, 0, 0, 300)
      g.addColorStop(0, "rgba(34, 211, 238, 0.15)")
      g.addColorStop(1, "rgba(34, 211, 238, 0)")
      return g
    })()

    const points = Array.isArray(payload?.points) ? payload.points : []
    const xMax = Number(payload?.xMax) || 31
    const tickDays = Array.isArray(payload?.tickDays) ? payload.tickDays : []
    const radiusDays = Array.isArray(payload?.radiusDays) ? payload.radiusDays : []
    const radiusSet = new Set(radiusDays.map((n) => Number(n)))

    const dataPoints = points.length ? points : [{ x: 1, y: 0 }]

    const config = {
      type: "line",
      data: {
        datasets: [{
          data: dataPoints,
          parsing: false,
          borderWidth: 3,
          tension: 0.35,
          fill: true,
          backgroundColor: fillGrad,
          pointBorderWidth: 2,
          pointRadius: (ctx2) => {
            const x = Number(ctx2.raw && ctx2.raw.x)
            return radiusSet.has(x) ? 4 : 0
          },
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(15, 23, 42, 0.95)",
            titleColor: "#fff",
            bodyColor: "#4ade80",
            padding: 12,
            displayColors: false,
            callbacks: {
              title: (items) => {
                const x = items && items[0] && items[0].parsed ? items[0].parsed.x : null
                return x != null ? `Day ${x}` : ""
              },
              label: (tt) => {
                const y = Number(tt.parsed?.y) || 0
                if (kind === "transactions") return `Transactions: ${y}`
                if (kind === "goals") return `Payment: ${fmtMoney(y)}`
                return `Value: ${fmtMoney(y)}`
              }
            }
          }
        },
        scales: {
          x: {
            type: "linear",
            min: 1,
            max: xMax,
            grid: { display: false },
            ticks: {
              color: "#94a3b8",
              stepSize: 1,
              autoSkip: false,
              maxRotation: 0,
              minRotation: 0,
              callback: (v) => v
            }
          },
          y: { display: false }
        },
        layout: { padding: 10 }
      }
    }

    state.pulseChart = new Chart(ctx, config)

    let offset = 0
    const animate = () => {
      if (!state.pulseChart || !state.pulseChart.chartArea) return
      offset += 0.003
      if (offset > 1) offset = 0

      const grad = getDynamicGradient(ctx, state.pulseChart.chartArea, offset)
      const ds = state.pulseChart.data.datasets[0]

      ds.borderColor = grad
      ds.pointBackgroundColor = grad
      ds.pointBorderColor = "#ffffff"
      ds.pointHoverBackgroundColor = grad
      ds.pointHoverBorderColor = "#ffffff"

      state.pulseChart.update("none")
      state.animId = requestAnimationFrame(animate)
    }

    state.animId = requestAnimationFrame(animate)
  }

  function updateChartInPlace(points, xMax) {
    if (!state.pulseChart || !state.pulseChart.data?.datasets?.[0]) return
    state.pulseChart.data.datasets[0].data = Array.isArray(points) ? points : []
    if (state.pulseChart.options?.scales?.x && Number.isFinite(xMax)) state.pulseChart.options.scales.x.max = xMax
    state.pulseChart.update("none")
  }

  /* =========================================
     10) Recent Transactions (table)
  ========================================= */

  function renderRecentTransactionsTable() {
    const el = $("dash-activity-rows")
    if (!el) return

    const rows = Array.isArray(state.activity) ? state.activity.slice(0, 5) : []

    el.innerHTML = rows.map((t) => {
      const name = safeText(t.merchant || "Transaction")
      const cat = safeText(t.category || "—")
      const date = fmtShortDate(t.date)
      const amt = Number(t.amount) || 0
      const shown = fmtMoney(Math.abs(amt))
      const status = "completed"

      return `
        <tr>
          <td>${name}</td>
          <td>${cat}</td>
          <td>${date}</td>
          <td class="text-right">${shown}</td>
          <td class="text-center"><span class="status-badge ${status}">${status}</span></td>
        </tr>
      `
    }).join("")
  }

  /* =========================================
     11) Notification Preferences modal
  ========================================= */

  function renderNotifSettings() {
    const el = $("dash-notif-settings")
    if (!el) return

    const meta = [
      { key: "notify_budget_alert", label: "Budget Alerts", desc: "Get notified near budget limits", icon: "fa-wallet" },
      { key: "notify_weekly_summary", label: "Weekly Summary", desc: "Receive weekly spending reports", icon: "fa-calendar-week" },
      { key: "notify_goal_completed", label: "Goal Completed", desc: "Celebrate finishing a goal", icon: "fa-trophy" },
      { key: "notify_missed_deposit", label: "Missed Deposit", desc: "Alerts for missed savings", icon: "fa-piggy-bank" },
      { key: "notify_over_budget", label: "Over Budget", desc: "Alert when exceeding limits", icon: "fa-arrow-trend-down" },
      { key: "notify_success_month", label: "Successful Month", desc: "End of month recap", icon: "fa-star" }
    ]

    const cur = state.notif || {}
    el.innerHTML = meta.map((n) => {
      const on = !!cur[n.key]
      return `
        <div class="ns-item">
          <div class="ns-info">
            <div class="ns-icon"><i class="fas ${n.icon}"></i></div>
            <div class="ns-text"><h4>${n.label}</h4><p>${n.desc}</p></div>
          </div>
          <div class="dash-switch ${on ? "on" : "off"}" data-key="${n.key}"></div>
        </div>
      `
    }).join("")

    el.querySelectorAll(".dash-switch").forEach((b) => {
      b.addEventListener("click", () => {
        b.classList.toggle("on")
        b.classList.toggle("off")
      })
    })
  }

  function readNotifUI() {
    const el = $("dash-notif-settings")
    if (!el) return null

    const updates = {}
    el.querySelectorAll(".dash-switch").forEach((sw) => {
      const k = sw.getAttribute("data-key")
      if (!k) return
      updates[k] = sw.classList.contains("on")
    })
    return updates
  }

  function setupModal() {
    const nBtn = $("dash-notif-btn")
    const nModal = $("dash-notif-modal")
    if (!nBtn || !nModal) return

    const closeModal = () => nModal.classList.remove("active")

    nBtn.addEventListener("click", async () => {
      try { await loadNotificationsOnly() } catch {}
      nModal.classList.add("active")
      renderNotifSettings()
    })

    nModal.addEventListener("click", (e) => {
      const close = e.target && e.target.dataset && e.target.dataset.close
      if (close) closeModal()
    })

    const saveBtn = nModal.querySelector(".dash-btn-primary")
    if (saveBtn) {
      saveBtn.addEventListener("click", async () => {
        const updates = readNotifUI()
        if (!updates) return

        try {
          const res = await apiFetch(API.NOTIFS, { method: "PUT", body: JSON.stringify(updates) })
          if (res && typeof res === "object") state.notif = res
          renderAlerts()
        } catch (e) {
          console.error("Save notifications failed:", e.message)
        }
      })
    }
  }

  /* =========================================
     12) Financial Alerts (up to 6)
  ========================================= */

  function buildMaps() {
    const secById = new Map()
    for (const s of (Array.isArray(state.goalSections) ? state.goalSections : [])) {
      if (s && s.id != null) secById.set(Number(s.id), s)
    }

    const goalById = new Map()
    for (const [sid, goals] of state.goalsBySectionId.entries()) {
      for (const g of (Array.isArray(goals) ? goals : [])) {
        if (!g || g.id == null) continue
        goalById.set(Number(g.id), { ...g, _sectionId: Number(sid) })
      }
    }

    return { secById, goalById }
  }

  function renderAlerts() {
    const el = $("dash-alerts-list")
    if (!el) return

    const badge = $("dash-alerts-badge")
    const dot = document.querySelector(".dash-dot")

    const alerts = []
    const n = state.notif || {}
    const b = computeBudgets()
    const { secById, goalById } = buildMaps()

    const totalBudget = Number(b.total) || 0
    const spent = Number(b.spent) || 0
    const utilization = totalBudget > 0 ? spent / totalBudget : 0

    const pushAlert = (a) => { if (a) alerts.push(a) }

    if (n.notify_over_budget && totalBudget > 0 && utilization >= 1) {
      const overBy = Math.max(0, spent - totalBudget)
      pushAlert({
        pri: 1,
        type: "danger",
        title: "Over Budget",
        desc: `Over by ${fmtMoney(overBy)} (Spent ${fmtMoney(spent)} vs Budget ${fmtMoney(totalBudget)})`,
        icon: "fa-exclamation-triangle"
      })
    } else if (n.notify_budget_alert && totalBudget > 0) {
      if (utilization >= 0.9 && utilization < 1) {
        pushAlert({
          pri: 2,
          type: "danger",
          title: "Budget Critical",
          desc: `You have used 90% of your monthly budget (Spent ${fmtMoney(spent)} of ${fmtMoney(totalBudget)})`,
          icon: "fa-wallet"
        })
      } else if (utilization >= 0.75 && utilization < 0.9) {
        pushAlert({
          pri: 4,
          type: "warning",
          title: "Budget Warning",
          desc: `You have used 75% of your monthly budget (Spent ${fmtMoney(spent)} of ${fmtMoney(totalBudget)})`,
          icon: "fa-wallet"
        })
      } else if (utilization >= 0.5 && utilization < 0.75) {
        pushAlert({
          pri: 6,
          type: "warning",
          title: "Budget Update",
          desc: `You have used 50% of your monthly budget (Spent ${fmtMoney(spent)} of ${fmtMoney(totalBudget)})`,
          icon: "fa-wallet"
        })
      }
    }

    if (n.notify_missed_deposit) {
      const missed = []
      for (const [gid, deps] of state.depositsByGoalId.entries()) {
        for (const d of (Array.isArray(deps) ? deps : [])) {
          if (!d || String(d.status || "").toLowerCase() !== "missed") continue
          missed.push({ goalId: Number(gid), dep: d })
        }
      }

      missed.sort((a, c) => {
        const da = new Date(a.dep?.date || a.dep?.createdAt || 0).getTime()
        const dc = new Date(c.dep?.date || c.dep?.createdAt || 0).getTime()
        return dc - da
      })

      if (missed.length) {
        const top = missed[0]
        const g = goalById.get(top.goalId)
        const sec = g ? secById.get(Number(g._sectionId)) : null

        const goalName = safeText(g?.name || "Goal")
        const secName = safeText(sec?.name || "Section")
        const due = fmtDateTime(top.dep?.date || top.dep?.createdAt)
        const amt = Number(top.dep?.amount) || 0

        pushAlert({
          pri: 3,
          type: "danger",
          title: "Missed Deposit",
          desc: `${goalName} in ${secName} was due on ${due}${amt > 0 ? ` (Expected ${fmtMoney(amt)})` : ""}`,
          icon: "fa-piggy-bank"
        })
      }
    }

    if (n.notify_goal_completed) {
      const completed = []
      for (const [sid, goals] of state.goalsBySectionId.entries()) {
        for (const g of (Array.isArray(goals) ? goals : [])) {
          if (!g) continue
          if (String(g.status || "").toLowerCase() !== "completed") continue
          completed.push({ sectionId: Number(sid), goal: g })
        }
      }

      completed.sort((a, c) => {
        const da = new Date(a.goal?.updatedAt || a.goal?.createdAt || 0).getTime()
        const dc = new Date(c.goal?.updatedAt || c.goal?.createdAt || 0).getTime()
        return dc - da
      })

      if (completed.length) {
        const top = completed[0]
        const sec = secById.get(top.sectionId)
        const goalName = safeText(top.goal?.name || "Goal")
        const secName = safeText(sec?.name || "Section")

        pushAlert({
          pri: 5,
          type: "warning",
          title: "Goal Completed",
          desc: `${goalName} is complete in ${secName}`,
          icon: "fa-trophy"
        })
      }
    }

    if (n.notify_weekly_summary) {
      const ws = computeWeeklySummaryMonSun()
      pushAlert({
        pri: 7,
        type: "warning",
        title: "Weekly Summary",
        desc: `Mon–Sun: Income ${fmtMoney(ws.income)}, Spending ${fmtMoney(ws.spent)}, Net ${fmtMoney(ws.net)}`,
        icon: "fa-calendar-week"
      })
    }

    if (n.notify_success_month && laIsNewMonthMidnight() && totalBudget > 0 && utilization < 1) {
      const remaining = Math.max(0, totalBudget - spent)
      pushAlert({
        pri: 8,
        type: "warning",
        title: "Successful Month",
        desc: `You stayed within budget last month. Remaining ${fmtMoney(remaining)}`,
        icon: "fa-star"
      })
    }

    alerts.sort((a, c) => (a.pri || 99) - (c.pri || 99))
    const show = alerts.slice(0, 6)

    const count = show.length
    if (badge) badge.textContent = `${count} New`
    if (dot) dot.style.display = count > 0 ? "block" : "none"

    if (!show.length) {
      if (badge) badge.textContent = "0 New"
      if (dot) dot.style.display = "none"
      el.innerHTML = `
        <div class="alert-item">
          <div class="alert-icon warning"><i class="fas fa-bell"></i></div>
          <div class="alert-text"><h4>No Alerts</h4><p>You have no active financial alerts right now</p></div>
        </div>
      `
      return
    }

    el.innerHTML = show.map((a) => `
      <div class="alert-item">
        <div class="alert-icon ${a.type}"><i class="fas ${a.icon}"></i></div>
        <div class="alert-text"><h4>${safeText(a.title)}</h4><p>${safeText(a.desc)}</p></div>
      </div>
    `).join("")
  }

  /* =========================================
     13) Header mini-cards (checking/credit)
  ========================================= */

function applyCardsToTopRightUI() {
  const wrap = document.querySelector(".dash-header-cards")
  const checkingCard = document.querySelector(".dash-mini-card.card-checking")
  const creditCard = document.querySelector(".dash-mini-card.card-credit")

  const showChecking = !!state.cards.checking
  const showCredit = !!state.cards.credit

  if (checkingCard) checkingCard.style.display = showChecking ? "" : "none"
  if (creditCard) creditCard.style.display = showCredit ? "" : "none"

  if (wrap) wrap.style.display = (showChecking || showCredit) ? "" : "none"

  if (showChecking && checkingCard) {
    const bal = checkingCard.querySelector(".mini-card-bal")
    const last4 = checkingCard.querySelector(".mini-card-num")
    if (bal) bal.textContent = fmtMoney(state.cards.checking.balance || 0)
    if (last4) last4.textContent = `**${safeText(state.cards.checking.last4 || "----")}`
  }

  if (showCredit && creditCard) {
    const bal = creditCard.querySelector(".mini-card-bal")
    const last4 = creditCard.querySelector(".mini-card-num")
    const creditBalance = Math.abs(Number(state.cards.credit.balance || 0))
    if (bal) bal.textContent = fmtMoney(creditBalance)
    if (last4) last4.textContent = `**${safeText(state.cards.credit.last4 || "----")}`
  }
}

  /* =========================================
     14) Tabs: Financial Overview rendering
  ========================================= */

  function switchTab(tab) {
    state.tab = tab

    document.querySelectorAll(".toggle-btn").forEach((t) => t.classList.remove("active"))
    const active = document.querySelector(`[data-tab="${tab}"]`)
    if (active) active.classList.add("active")

    const mainContent = $("dash-overview-content")
    if (!mainContent) return

    if (tab === "transactions") {
      const avail = availableBalanceFromTransactions()
      const stats = computeActivityChartSeries()

      setMainMeta({ label: "Available Balance", amountText: fmtMoney(avail), rightHTML: "" })
      mainContent.innerHTML = getTxHTML(stats)

      setTimeout(() => {
        renderChart("transactions", {
          points: stats.points,
          tickDays: stats.tickDays,
          radiusDays: stats.radiusDays,
          xMax: stats.xMax
        })
      }, 50)

      return
    }

    if (tab === "budgets") {
      const avail = availableBalanceFromTransactions()
      const b = computeBudgets()

      setMainMeta({
        label: "Available Balance",
        amountText: fmtMoney(avail),
        rightHTML: `<div class="daily-stat-box"><div class="daily-val">${fmtMoney(b.dailyAvg)}/day</div><span class="daily-sub">avg for ${b.days}d</span></div>`
      })

      mainContent.innerHTML = getBudHTML(b)
      return
    }

    if (tab === "goals") {
      const g = computeGoalsMeta()
      const grid = buildGoalsGridData()

      setMainMeta({
        label: "Monthly Commitments",
        amountText: fmtMoney(g.totalMonthly),
        rightHTML: `<div class="next-pay-box"><div class="pay-time"><i class="fas fa-clock pay-icon"></i> ${safeText(g.nextPayment)}</div><span class="pay-sub">Next payment</span></div>`
      })

      mainContent.innerHTML = getGoalsHTML(grid)

      const pay = buildGoalsPaymentSeries()
      setTimeout(() => renderChart("goals", { points: pay.points, radiusDays: pay.radiusDays, xMax: pay.xMax }), 50)

      return
    }
  }

  function setupTabs() {
    document.querySelectorAll(".toggle-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.autoRotateStopped = true
        if (state.autoRotateTimer) {
          clearInterval(state.autoRotateTimer)
          state.autoRotateTimer = null
        }
        switchTab(btn.dataset.tab)
      })
    })
  }

  function startAutoRotateTabs(intervalMs) {
    if (state.autoRotateTimer || state.autoRotateStopped) return

    const order = ["transactions", "budgets", "goals"]
    state.autoRotateTimer = setInterval(() => {
      if (state.autoRotateStopped) return
      const idx = order.indexOf(state.tab)
      const next = order[(idx + 1) % order.length]
      switchTab(next)
    }, intervalMs)
  }

  /* =========================================
     15) Data loaders (backend endpoints)
  ========================================= */

async function loadCardsOnly() {
  let connectedChecking = null
  let connectedCredit = null

  try {
    const rows = await apiFetch("/api/accounts")
    const list = Array.isArray(rows) ? rows : (rows && Array.isArray(rows.accounts) ? rows.accounts : [])
    for (const a of list) {
      if (!a) continue
      const type = String(a.accountType || a.account_type || "").trim().toLowerCase()
      const status = String(a.status || "disconnected").trim().toLowerCase()
      if (status !== "connected") continue
      if (type === "checking") connectedChecking = a
      if (type === "credit") connectedCredit = a
    }
  } catch {}

  const cardsRes = await apiFetch(API.CARDS)
  const cards = (cardsRes && cardsRes.cards) || []
  const checking = cards.find((c) => String(c.accountType || "").toLowerCase() === "checking") || null
  const credit = cards.find((c) => String(c.accountType || "").toLowerCase() === "credit") || null

  state.cards.checking = connectedChecking
    ? { balance: Number(checking?.balance) || 0, last4: connectedChecking.last4 || checking?.last4 || "" }
    : null

  state.cards.credit = connectedCredit
    ? { balance: Number(credit?.balance) || 0, last4: connectedCredit.last4 || credit?.last4 || "" }
    : null

  state.cards.allBalance = null

  try {
    const b = await apiFetch("/api/accounts/freedom/balances")
    const chk = Number(b && b.checkingBalance)
    const cred = Number(b && b.creditBalance)
    const allBal = Number(b && b.allBalance)

    if (Number.isFinite(allBal)) state.cards.allBalance = allBal

    if (state.cards.checking && Number.isFinite(chk)) {
      state.cards.checking = { balance: chk, last4: state.cards.checking.last4 || "" }
    }

    if (state.cards.credit && Number.isFinite(cred)) {
      state.cards.credit = { balance: cred, last4: state.cards.credit.last4 || "" }
    }
  } catch {}
}

  async function loadRewardsOnly() {
    const data = await apiFetch(API.REWARDS)
    const xp = Number(data?.profile?.overallXp || 0)
    state.overallXp = Number.isFinite(xp) ? xp : 0
  }

  async function loadNotificationsOnly() {
    const data = await apiFetch(API.NOTIFS)
    if (data && typeof data === "object") state.notif = data
  }

  async function loadBudgetsOnly() {
    const budgetsRes = await apiFetch(API.BUDGETS)
    state.budgets = Array.isArray(budgetsRes) ? budgetsRes : []
  }

async function loadActivityOnly() {
  const activityRes = await apiFetch(API.ACTIVITY)

  const rows = Array.isArray(activityRes)
    ? activityRes
    : (activityRes && Array.isArray(activityRes.items) ? activityRes.items : [])

  // Dashboard should behave like Activity "All": exclude credit card
  state.activity = rows.filter((t) => String(t.accountType || "").toLowerCase() !== "credit")
}

  async function loadGoalsOnly() {
    try {
      const secs = await apiFetch(API.GOALS_SECTIONS)
      state.goalSections = Array.isArray(secs) ? secs : []
    } catch {
      state.goalSections = []
    }

    state.goalsBySectionId = new Map()
    await Promise.all(
      state.goalSections.map(async (s) => {
        try {
          const goals = await apiFetch(API.GOALS_IN_SECTION(s.id))
          state.goalsBySectionId.set(s.id, Array.isArray(goals) ? goals : [])
        } catch {
          state.goalsBySectionId.set(s.id, [])
        }
      })
    )
  }

  async function loadDepositsForAllGoals() {
    const goalIds = []
    for (const goals of state.goalsBySectionId.values()) {
      for (const g of (Array.isArray(goals) ? goals : [])) {
        if (g && g.id != null) goalIds.push(Number(g.id))
      }
    }

    const map = new Map()
    await Promise.all(
      goalIds.map(async (gid) => {
        try {
          const deps = await apiFetch(API.GOAL_DEPOSITS(gid))
          map.set(gid, Array.isArray(deps) ? deps : [])
        } catch {
          map.set(gid, [])
        }
      })
    )

    state.depositsByGoalId = map
  }

  async function loadStaticDataOnce() {
    await loadBudgetsOnly()
    try { await loadNotificationsOnly() } catch {}
    try { await loadRewardsOnly() } catch {}
    await loadGoalsOnly()
    await loadDepositsForAllGoals()
  }

  /* =========================================
     16) Polling (60s): updates UI + datasets
         Does NOT recreate tabs or charts
  ========================================= */

  function updateOverviewNumbersInPlace() {
    if (state.tab === "transactions") {
      const avail = availableBalanceFromTransactions()
      const availEl = $("main-amount")
      if (availEl) availEl.textContent = fmtMoney(avail)

      const stats = computeActivityChartSeries()
      const grid = document.querySelector(".hero-stats-grid")
      if (grid) {
        const items = grid.querySelectorAll(".hero-stat-item")
        if (items[0]) {
          const v = items[0].querySelector(".h-stat-val")
          if (v) v.textContent = fmtMoney(stats.income)
        }
        if (items[1]) {
          const v = items[1].querySelector(".h-stat-val")
          if (v) v.textContent = `-${fmtMoney(stats.spent).replace("$", "")}`
        }
        if (items[2]) {
          const v = items[2].querySelector(".h-stat-val")
          if (v) {
            v.classList.toggle("pos", stats.net >= 0)
            v.classList.toggle("neg", stats.net < 0)
            v.textContent = `${stats.net >= 0 ? "" : "-"}${fmtMoney(Math.abs(stats.net))}`
          }
        }
      }

      updateChartInPlace(stats.points, stats.xMax)
      return
    }

    if (state.tab === "budgets") {
      const avail = availableBalanceFromTransactions()
      const availEl = $("main-amount")
      if (availEl) availEl.textContent = fmtMoney(avail)

      const b = computeBudgets()
      const leftAmt = document.querySelector(".b-left-amount")
      if (leftAmt) leftAmt.textContent = fmtMoney(b.left)

      const fill = document.querySelector(".b-fill")
      if (fill) fill.style.width = `${b.pct.toFixed(0)}%`

      const spentEl = document.querySelector(".b-labels .l-spent")
      const totalEl = document.querySelector(".b-labels .l-remain")
      if (spentEl) spentEl.textContent = `${fmtMoney(b.spent)} spent`
      if (totalEl) totalEl.textContent = `${fmtMoney(b.total)} Total Budget`

      const dailyVal = document.querySelector(".daily-stat-box .daily-val")
      const dailySub = document.querySelector(".daily-stat-box .daily-sub")
      if (dailyVal) dailyVal.textContent = `${fmtMoney(b.dailyAvg)}/day`
      if (dailySub) dailySub.textContent = `avg for ${b.days}d`

      return
    }

    if (state.tab === "goals") {
      const g = computeGoalsMeta()
      const mainAmt = $("main-amount")
      if (mainAmt) mainAmt.textContent = fmtMoney(g.totalMonthly)

      const nextPay = document.querySelector(".next-pay-box .pay-time")
      if (nextPay) nextPay.innerHTML = `<i class="fas fa-clock pay-icon"></i> ${safeText(g.nextPayment)}`

      const pay = buildGoalsPaymentSeries()
      updateChartInPlace(pay.points, pay.xMax)
    }
  }

  function startPolling() {
    if (state.refreshTimer) clearInterval(state.refreshTimer)

    state.refreshTimer = setInterval(async () => {
      try { await loadActivityOnly() } catch (e) { console.error("Activity refresh failed:", e.message) }
      try { await loadBudgetsOnly() } catch (e) { console.error("Budgets refresh failed:", e.message) }
      try { await loadCardsOnly() } catch (e) { console.error("Cards refresh failed:", e.message) }
      try { await loadNotificationsOnly() } catch (e) { console.error("Notifications refresh failed:", e.message) }
      try { await loadRewardsOnly() } catch (e) { console.error("Rewards refresh failed:", e.message) }

      try {
        await loadGoalsOnly()
        await loadDepositsForAllGoals()
      } catch (e) {
        console.error("Goals/deposits refresh failed:", e.message)
      }

      try { renderRecentTransactionsTable() } catch {}
      try { applyCardsToTopRightUI() } catch {}
      try { applyLevelBadgeUI() } catch {}
      try { renderAlerts() } catch {}

      try { updateOverviewNumbersInPlace() } catch {}
    }, 60000)
  }

  /* =========================================
     17) Daily AI Assistant (DB-backed, no localStorage)
         Uses:
           GET  /api/ai/assistant/today
           POST /api/ai/assistant/today  { force, snapshot }
  ========================================= */

  function typeOutTerminal(el, text) {
    if (!el) return

    state.aiTypeSeq += 1
    const seq = state.aiTypeSeq

    if (state.aiTypeTimer) {
      clearTimeout(state.aiTypeTimer)
      state.aiTypeTimer = null
    }

    const s = String(text || "").replace(/\r\n/g, "\n")
    el.textContent = ""

    let i = 0
    const tick = () => {
      if (seq !== state.aiTypeSeq) return
      if (i >= s.length) return
      el.textContent += s.charAt(i)
      i += 1
      state.aiTypeTimer = setTimeout(tick, 8)
    }

    tick()
  }

  function computeAssistantSnapshot() {
    const b = computeBudgets()
    const ws = computeWeeklySummaryMonSun()

    let completedGoals = 0
    for (const goals of state.goalsBySectionId.values()) {
      for (const g of (Array.isArray(goals) ? goals : [])) {
        if (String(g?.status || "").toLowerCase() === "completed") completedGoals += 1
      }
    }

    let missedDeposits = 0
    for (const deps of state.depositsByGoalId.values()) {
      for (const d of (Array.isArray(deps) ? deps : [])) {
        if (String(d?.status || "").toLowerCase() === "missed") missedDeposits += 1
      }
    }

    const activeAlerts = (() => {
      const n = state.notif || {}
      const total = Number(b.total) || 0
      const util = total > 0 ? (Number(b.spent) || 0) / total : 0

      let c = 0
      if (n.notify_over_budget && total > 0 && util >= 1) c += 1
      if (n.notify_missed_deposit && missedDeposits > 0) c += 1
      return c
    })()

    return {
      currencySymbol: "$",
      budgetUtilization: b.total > 0 ? (b.spent / b.total) : 0,
      budgetTotal: b.total,
      budgetSpent: b.spent,
      daysRemaining: b.days,
      weeklyIncome: ws.income,
      weeklySpent: ws.spent,
      weeklyNet: ws.net,
      completedGoals,
      missedDeposits,
      activeAlerts
    }
  }

  function buildLocalFallbackTerminal(snap) {
    const pressureLine =
      snap.budgetTotal <= 0
        ? "Budget utilization unavailable"
        : snap.budgetUtilization >= 1
          ? "Budget limit exceeded"
          : snap.budgetUtilization >= 0.9
            ? "Budget utilization elevated"
            : snap.budgetUtilization >= 0.75
              ? "Budget utilization rising"
              : "Budget utilization within safe range"

    const criticalLine =
      snap.activeAlerts > 0 || (snap.budgetTotal > 0 && snap.budgetUtilization >= 1)
        ? "Critical conditions detected"
        : "No critical alerts detected"

    return (
      "Assistant.exe offline\n\n" +
      "Financial status: STABLE\n\n" +
      `${pressureLine}\n\n` +
      `${criticalLine}\n\n` +
      "Monitoring active"
    )
  }

async function loadAssistantFromDbOrGenerate(force) {
  const el = $("dash-ai-output")
  if (!el) return

  const toLAStamp = (d) => {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ""
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23"
    }).formatToParts(d)

    const get = (t) => parts.find((p) => p.type === t)?.value || ""
    let hh = get("hour")
    if (hh === "24") hh = "00"

    return `${get("year")}-${get("month")}-${get("day")} ${hh}:${get("minute")}:${get("second")} PT`
  }

  const stripUpdatedAtLines = (s) => {
    let x = String(s || "").replace(/\r\n/g, "\n").replace(/\s+$/g, "")
    x = x.replace(/\n\s*Updated At\s*:\s*[^\n]*\s*/gi, "\n")
    x = x.replace(/\n{3,}/g, "\n\n").replace(/\s+$/g, "")
    return x
  }

  typeOutTerminal(el, "Assistant.exe initializing...\n\nMonitoring active")

  // 1) DB read only on normal refresh
  try {
    const todayRes = await apiFetch(API.AI_ASSISTANT_TODAY)
    if (todayRes && todayRes.exists && todayRes.message) {
      const clean = stripUpdatedAtLines(todayRes.message)
      const stamp = todayRes.updatedAt ? toLAStamp(new Date(todayRes.updatedAt)) : ""
      const out = stamp ? `${clean}\n\nUpdated At: ${stamp}` : clean
      typeOutTerminal(el, out)
      return
    }
  } catch {}

  // 2) Not ready yet, do not generate on refresh
  if (!force) {
    typeOutTerminal(
      el,
      "Assistant.exe awaiting daily report...\n\nMonitoring active\n\n(Your daily report is generated once per day at LA midnight.)"
    )
    return
  }

  // 3) Midnight ensure: generate only if missing
  const snap = computeAssistantSnapshot()

  try {
    const genRes = await apiFetch(API.AI_ASSISTANT_TODAY, {
      method: "POST",
      body: JSON.stringify({ force: false, snapshot: snap })
    })

    if (genRes && genRes.message) {
      const clean = stripUpdatedAtLines(genRes.message)
      const stamp = genRes.updatedAt ? toLAStamp(new Date(genRes.updatedAt)) : ""
      const out = stamp ? `${clean}\n\nUpdated At: ${stamp}` : clean
      typeOutTerminal(el, out)
      return
    }
  } catch {}

  typeOutTerminal(el, buildLocalFallbackTerminal(snap))
}

function startDailyAIAssistantDbBacked() {
  if (state.dailyAiTimer) clearTimeout(state.dailyAiTimer)
  if (state.dailyAiInterval) clearInterval(state.dailyAiInterval)
  if (state.dailyAiCountdown) clearInterval(state.dailyAiCountdown)

  const nextEl = document.getElementById("assistantNextUpdate")

  const laParts = (now = new Date()) => {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
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
    return { y: get("year"), mo: get("month"), d: get("day"), hh, mm: get("minute"), ss: get("second") }
  }

  const laDayKey = (now = new Date()) => {
    const p = laParts(now)
    return `${p.y}-${p.mo}-${p.d}`
  }

  const addDaysToKey = (dayKey, deltaDays) => {
    const [y, m, d] = String(dayKey).split("-").map((x) => Number(x))
    const dt = new Date(Date.UTC(y, m - 1, d))
    dt.setUTCDate(dt.getUTCDate() + Number(deltaDays || 0))
    const yy = dt.getUTCFullYear()
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0")
    const dd = String(dt.getUTCDate()).padStart(2, "0")
    return `${yy}-${mm}-${dd}`
  }

  const msUntilNextLAMidnight = (now = new Date()) => {
    const todayKey = laDayKey(now)
    const tomorrowKey = addDaysToKey(todayKey, 1)
    const [ty, tm, td] = tomorrowKey.split("-").map((x) => Number(x))

    let guess = new Date(Date.UTC(ty, tm - 1, td, 8, 0, 0, 0))

    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23"
    })

    for (let i = 0; i < 10; i++) {
      const parts = fmt.formatToParts(guess)
      const get = (t) => parts.find((p) => p.type === t)?.value || ""

      const gy = Number(get("year"))
      const gmo = Number(get("month"))
      const gd = Number(get("day"))
      const ghRaw = get("hour")
      const gh = Number(ghRaw === "24" ? "0" : ghRaw)
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

  const fmtCountdown = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000))
    const hh = Math.floor(s / 3600)
    const mm = Math.floor((s % 3600) / 60)
    const ss = s % 60
    const pad2 = (n) => String(n).padStart(2, "0")
    return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`
  }

  const updateCountdown = (msLeft) => {
    if (!nextEl) return
    nextEl.textContent = `Next update in ${fmtCountdown(msLeft)}`
  }

  const scheduleNext = () => {
    if (state.dailyAiTimer) clearTimeout(state.dailyAiTimer)
    if (state.dailyAiCountdown) clearInterval(state.dailyAiCountdown)

    const startMs = msUntilNextLAMidnight(new Date())
    const startAt = Date.now()
    updateCountdown(startMs)

    state.dailyAiCountdown = setInterval(() => {
      const elapsed = Date.now() - startAt
      const left = Math.max(0, startMs - elapsed)
      updateCountdown(left)
    }, 1000)

    state.dailyAiTimer = setTimeout(async () => {
      await loadAssistantFromDbOrGenerate(true)
      scheduleNext()
    }, startMs)
  }

  loadAssistantFromDbOrGenerate(false)
  scheduleNext()
}

  /* =========================================
     18) Init
========================================= */

async function init() {
  setHeaderDate()
  setupModal()
  setupTabs()

  try {
    await loadCardsOnly()
    await loadStaticDataOnce()
    await loadActivityOnly()

    fetch("/api/rewards/trigger", {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: "visit-dashboard" })
    }).catch(() => {})
  } catch (e) {
    console.error("Dashboard load failed:", e && e.message ? e.message : e)
  }

  applyCardsToTopRightUI()

  // React to Settings connect and disconnect without refresh (attach once)
  if (!window.__dashAccountsListenerAttached) {
    window.__dashAccountsListenerAttached = true

    window.addEventListener("data:updated", async (e) => {
      const src = e && e.detail ? String(e.detail.source || "") : ""
      if (src && src !== "accounts") return

      const wrap = document.querySelector(".dash-header-cards")
      if (!wrap) return

      try {
        await loadCardsOnly()
        applyCardsToTopRightUI()
      } catch (_) {}
    })
  }

  applyLevelBadgeUI()
  renderRecentTransactionsTable()
  renderAlerts()
  switchTab("transactions")
  startAutoRotateTabs(30000)

  startPolling()
  startDailyAIAssistantDbBacked()
}

init().catch(console.error)

})()
