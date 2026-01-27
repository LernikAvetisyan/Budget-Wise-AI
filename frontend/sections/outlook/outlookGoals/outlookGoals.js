;(() => {
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

  const state = {
    root: null,
    sections: [],
    selectedSectionId: null,
    selectedGoalId: null,
    selectedGoal: null,
    selectedSection: null,
    deposits: [],
    years: [],
    year: new Date().getFullYear(),
    tempYear: null,
    monthIndex: new Date().getMonth(),
    minYear: null,
    minMonth: null,
    maxYear: null,
    maxMonth: null,
    barChart: null,
    // Donut chart removed in favor of custom Canvas Rings
    donutChart: null
  }

  const fmtMoney = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" })
  const $ = (sel, root) => (root || document).querySelector(sel)

  const esc = (s) =>
    String(s == null ? "" : s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;")

  const safeNum = (v) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  const dateOnly = (d) => {
    if (!d) return null
    const s = String(d)
    return s.length >= 10 ? s.slice(0, 10) : s
  }

  const parseYMD = (ymd) => {
    const s = dateOnly(ymd)
    if (!s) return null
    const [y, m, d] = s.split("-").map((x) => Number(x))
    if (!y || !m || !d) return null
    return new Date(Date.UTC(y, m - 1, d))
  }

  const parseDT = (dt) => {
    if (!dt) return null
    const d = new Date(dt)
    return isNaN(d.getTime()) ? null : d
  }

  const monthStartUtc = (year, mi) => new Date(Date.UTC(year, mi, 1))
  const monthEndUtc = (year, mi) => new Date(Date.UTC(year, mi + 1, 0, 23, 59, 59, 999))

const diffMonthsInclusive = (startUtc, endUtc) => {
  if (!startUtc || !endUtc) return 0

  const y1 = startUtc.getUTCFullYear()
  const m1 = startUtc.getUTCMonth()
  const d1 = startUtc.getUTCDate()

  const y2 = endUtc.getUTCFullYear()
  const m2 = endUtc.getUTCMonth()
  const d2 = endUtc.getUTCDate()

  let months = (y2 - y1) * 12 + (m2 - m1)
  if (d2 < d1) months -= 1

  return months > 0 ? months : 0
}

  const diffDays = (startUtc, endUtc) => {
    if (!startUtc || !endUtc) return 0
    const ms = endUtc.getTime() - startUtc.getTime()
    return ms > 0 ? Math.round(ms / 86400000) : 0
  }

  const goalTarget = (g) => {
    const actual = g && g.actualPrice != null ? Number(g.actualPrice) : null
    if (actual != null && Number.isFinite(actual) && actual > 0) return actual
    const price = Number(g && g.priceAmount != null ? g.priceAmount : 0)
    return price > 0 ? price : 0
  }

  const normalizeGoal = (g) => {
    const id = g && g.id != null ? String(g.id) : ""
    const name = String(g && g.name ? g.name : "").trim()
    const startDate = dateOnly(g && (g.startDate || g.start_date || g.createdAt || g.created_at))
    const endDate = dateOnly(g && (g.endDate || g.end_date))
    const minMonthlyDeposit =
      g && g.minMonthlyDeposit != null ? Number(g.minMonthlyDeposit)
      : g && g.min_monthly_deposit != null ? Number(g.min_monthly_deposit)
      : null
    const totalDeposited = g && g.totalDeposited != null ? Number(g.totalDeposited) : 0

    return {
      ...g,
      id,
      name,
      startDate,
      endDate,
      minMonthlyDeposit: Number.isFinite(minMonthlyDeposit) ? minMonthlyDeposit : null,
      totalDeposited: Number.isFinite(totalDeposited) ? totalDeposited : 0
    }
  }

  const normalizeDeposit = (d) => {
    const dt = parseDT(d && (d.date || d.createdAt || d.created_at))
    return {
      id: d && d.id != null ? String(d.id) : "",
      goalId: d && (d.goalId != null || d.goal_id != null) ? String(d.goalId != null ? d.goalId : d.goal_id) : "",
      amount: safeNum(d && d.amount),
      type: d && String(d.type).toLowerCase() === "auto" ? "auto" : "manual",
      status: d && String(d.status).toLowerCase() === "missed" ? "missed" : "applied",
      date: d && (d.date || d.createdAt || d.created_at) ? (d.date || d.createdAt || d.created_at) : null,
      dt
    }
  }

  const fetchJson = async (url, opts) => {
    const res = await fetch(url, { credentials: "include", ...(opts || {}) })
    if (!res.ok) {
      let t = ""
      try { t = await res.text() } catch {}
      const err = new Error(`Request failed ${res.status}`)
      err.status = res.status
      err.body = t
      throw err
    }
    const ct = res.headers.get("content-type") || ""
    if (!ct.includes("application/json")) return null
    return await res.json()
  }

  const loadSections = async () => {
    const headers = { Accept: "application/json" }
    const secs = await fetchJson("/api/goals/sections", { headers })
    const sections = Array.isArray(secs) ? secs : Array.isArray(secs && secs.sections) ? secs.sections : []
    const out = []

    for (const s of sections) {
      const sid = s && s.id != null ? String(s.id) : ""
      if (!sid) continue

      let goals = []
      try {
        const gl = await fetchJson(`/api/goals/sections/${encodeURIComponent(sid)}/goals`, { headers })
        const arr = Array.isArray(gl) ? gl : Array.isArray(gl && gl.goals) ? gl.goals : []
        goals = arr
          .map(normalizeGoal)
          .filter((g) => String(g && g.status != null ? g.status : "active").toLowerCase() === "active")
      } catch {
        goals = []
      }

      out.push({
        ...s,
        id: sid,
        name: String(s && s.name ? s.name : "").trim(),
        startDate: dateOnly(s && (s.startDate || s.start_date)),
        endDate: dateOnly(s && (s.endDate || s.end_date)),
        goals
      })
    }

    return out
  }

  const loadDepositsForGoal = async (goalId) => {
    const headers = { Accept: "application/json" }
    const data = await fetchJson(`/api/goals/goals/${encodeURIComponent(goalId)}/deposits`, { headers })
    const arr = Array.isArray(data) ? data : Array.isArray(data && data.deposits) ? data.deposits : []
    return arr.map(normalizeDeposit).filter((d) => d.dt)
  }

  const iconPalette = [
    { bg: "rgba(236,72,153,0.1)", bd: "rgba(236,72,153,0.3)", fg: "#f472b6", t: "🏆" },
    { bg: "rgba(245,158,11,0.1)", bd: "rgba(245,158,11,0.3)", fg: "#fbbf24", t: "📅" },
    { bg: "rgba(16,185,129,0.1)", bd: "rgba(16,185,129,0.3)", fg: "#34d399", t: "🎯" },
    { bg: "rgba(59,130,246,0.1)", bd: "rgba(59,130,246,0.3)", fg: "#60a5fa", t: "⚡" },
    { bg: "rgba(139,92,246,0.1)", bd: "rgba(139,92,246,0.3)", fg: "#a78bfa", t: "🐷" }
  ]
  const sectionIcon = (idx) => iconPalette[idx % iconPalette.length]

  const showView = (key) => {
    const v1 = $("#outlk-goals-sections-view", state.root)
    const v2 = $("#outlk-goals-analysis-view", state.root)
    if (!v1 || !v2) return
    v1.classList.remove("active")
    v2.classList.remove("active")
    if (key === "analysis") v2.classList.add("active")
    else v1.classList.add("active")
  }

  const openDialog = (dlg) => {
    if (!dlg) return
    try { dlg.showModal() } catch { dlg.setAttribute("open", "true") }
  }

  const closeDialog = (dlg) => {
    if (!dlg) return
    try { dlg.close() } catch { dlg.removeAttribute("open") }
  }

  const isDialogOpen = (dlg) => !!dlg && (dlg.open || dlg.getAttribute("open") === "true")

const bindClickAwayClose = (dlg) => {
  if (!dlg) return
  if (dlg.__outlkBoundClickAway) return
  dlg.__outlkBoundClickAway = true

  const isOpen = () => dlg.open || dlg.getAttribute("open") === "true"

  // 1) Click-away: close if click is on backdrop or anywhere outside the modal panel
  dlg.addEventListener(
    "pointerdown",
    (e) => {
      if (!isOpen()) return

      const t = e.target
      if (t && t.closest && t.closest('[data-close="1"]')) {
        closeDialog(dlg)
        return
      }

      // If click is NOT inside the panel, close
      const insidePanel = t && t.closest && t.closest(".outlk-modal-wide")
      if (!insidePanel) closeDialog(dlg)
    },
    true
  )

  // 2) Escape key close (since this is not a real <dialog>)
  const onKeyDown = (e) => {
    if (!isOpen()) return
    if (e.key === "Escape") {
      e.preventDefault()
      closeDialog(dlg)
    }
  }
  document.addEventListener("keydown", onKeyDown, true)

  dlg.__outlkUnbindClickAway = () => {
    document.removeEventListener("keydown", onKeyDown, true)
  }
}


  // --- RENDER SECTIONS (Glassmorphic Cards) ---
  const renderSections = () => {
    const grid = $("#outlk-goals-sections-grid", state.root)
    const empty = $("#outlk-goals-empty", state.root)
    if (!grid || !empty) return

    const secs = Array.isArray(state.sections) ? state.sections : []
    grid.innerHTML = ""

    if (!secs.length) {
      empty.style.display = ""
      return
    }

    empty.style.display = "none"

    secs.forEach((sec, i) => {
      const ico = sectionIcon(i)
      const goals = Array.isArray(sec.goals) ? sec.goals : []
      const count = goals.length
      const topGoals = goals.slice(0, 3)

      const card = document.createElement("div")
      card.className = "outlk-goalcard"
      card.dataset.secId = sec.id

      card.innerHTML = `
        <div class="outlk-goalcard-top">
          <div class="outlk-goalcard-ico" style="background:${ico.bg};border-color:${ico.bd};color:${ico.fg}">
            ${esc(ico.t)}
          </div>
          <div class="outlk-goalcard-badge">${count} Goals</div>
        </div>

        <div class="outlk-goalcard-name">${esc(sec.name || "Untitled Section")}</div>
        <div class="outlk-goalcard-subline">${count ? "Active Goals" : "No goals"}</div>

        <div class="outlk-goalitems">
          ${
            topGoals.length
              ? topGoals
                  .map((g) => {
                    const target = goalTarget(g)
                    const deposited = safeNum(g.totalDeposited)
                    const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((deposited / target) * 100))) : 0
                    return `
                      <div class="outlk-goalitem">
                        <div class="outlk-goalitem-row">
                          <div class="outlk-goalitem-name">${esc(g.name || "Goal")}</div>
                          <div class="outlk-goalitem-meta">${pct}%</div>
                        </div>
                        <div class="outlk-goalbar"><div style="width:${pct}%"></div></div>
                      </div>
                    `
                  })
                  .join("")
              : `<div class="outlk-goalitem-meta">Empty section</div>`
          }
        </div>
      `

      card.addEventListener("click", () => openGoalPicker(sec.id))
      grid.appendChild(card)
    })
  }

  const openGoalPicker = (sectionId) => {
    const sec = (state.sections || []).find((s) => String(s.id) === String(sectionId))
    if (!sec) return

    const dlg = $("#outlk-goals-modal", state.root)
    const sub = $("#outlk-goals-modal-sub", state.root)
    const list = $("#outlk-goals-modal-list", state.root)
    if (!dlg || !sub || !list) return

    const goals = Array.isArray(sec.goals) ? sec.goals : []
    sub.innerHTML = `Select a goal from <strong>${esc(sec.name || "Section")}</strong>`
    list.innerHTML = ""

    if (!goals.length) {
      list.innerHTML = `<div class="outlk-modal-sub">No goals found.</div>`
      openDialog(dlg)
      return
    }

    goals.forEach((g, idx) => {
      const ico = sectionIcon(idx)
      const target = goalTarget(g)
      const deposited = safeNum(g.totalDeposited)
      const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((deposited / target) * 100))) : 0

      const row = document.createElement("div")
      row.className = "outlk-goalpick"
      row.dataset.goalId = g.id

      row.innerHTML = `
        <div class="outlk-goalpick-left">
          <div class="outlk-goalpick-ico" style="background:${ico.bg};border-color:${ico.bd};color:${ico.fg}">
            ⦿
          </div>
          <div class="outlk-goalpick-text">
            <div class="outlk-goalpick-title">${esc(g.name || "Untitled Goal")}</div>
            <div class="outlk-goalpick-sub">${fmtMoney.format(deposited)} / ${fmtMoney.format(target)}</div>
          </div>
        </div>
        <div class="outlk-goalpick-right">${pct}%</div>
      `

      row.addEventListener("click", async () => {
        closeDialog(dlg)
        await selectGoal(sec.id, g.id)
      })

      list.appendChild(row)
    })

    openDialog(dlg)
  }

  const requiredMonthly = (goal, section) => {
    const target = goalTarget(goal)
    const s =
      parseYMD(goal && goal.startDate) ||
      parseYMD(section && section.startDate) ||
      parseYMD(goal && (goal.createdAt || goal.created_at)) ||
      null
    const e =
      parseYMD(goal && goal.endDate) ||
      parseYMD(section && section.endDate) ||
      null
    if (!target || !s || !e) return 0
    const months = diffMonthsInclusive(s, e)
    if (!months) return 0
    return target / months
  }

  const requiredDaily = (goal, section) => {
    const target = goalTarget(goal)
    const s =
      parseYMD(goal && goal.startDate) ||
      parseYMD(section && section.startDate) ||
      null
    const e =
      parseYMD(goal && goal.endDate) ||
      parseYMD(section && section.endDate) ||
      null
    if (!target || !s || !e) return 0
    const days = diffDays(s, e)
    if (!days) return 0
    return target / days
  }

  const sumAppliedUntilEndOfMonth = (year, mi) => {
    const end = monthEndUtc(year, mi).getTime()
    let total = 0
    for (const d of state.deposits || []) {
      if (!d || !d.dt) continue
      if (d.dt.getTime() <= end && d.status === "applied") total += safeNum(d.amount)
    }
    return total
  }

  const sumAppliedInMonth = (year, mi) => {
    const start = monthStartUtc(year, mi).getTime()
    const end = monthEndUtc(year, mi).getTime()
    let total = 0
    for (const d of state.deposits || []) {
      if (!d || !d.dt) continue
      const t = d.dt.getTime()
      if (t >= start && t <= end && d.status === "applied") total += safeNum(d.amount)
    }
    return total
  }

  const splitMonthByType = (year, mi) => {
    const start = monthStartUtc(year, mi).getTime()
    const end = monthEndUtc(year, mi).getTime()
    let manual = 0
    let autoPaid = 0
    let autoMissed = 0
    let txCount = 0

    for (const d of state.deposits || []) {
      if (!d || !d.dt) continue
      const t = d.dt.getTime()
      if (t < start || t > end) continue
      txCount += 1
      if (d.type === "manual" && d.status === "applied") manual += safeNum(d.amount)
      if (d.type === "auto" && d.status === "applied") autoPaid += safeNum(d.amount)
      if (d.type === "auto" && d.status === "missed") autoMissed += safeNum(d.amount)
    }

    return { manual, autoPaid, autoMissed, txCount }
  }

  const destroyCharts = () => {
    try { state.barChart && state.barChart.destroy && state.barChart.destroy() } catch {}
    // Donut chart is now canvas based, so no destroy method needed
    state.barChart = null
  }

  const updateHeader = () => {
    const meta = $("#outlk-goals-details-meta", state.root)
    const g = state.selectedGoal
    if (!g) { if (meta) meta.textContent = ""; return }
    const target = goalTarget(g)
    const end = g.endDate ? g.endDate : "—"
    if (meta) meta.innerHTML = `${esc(g.name)} <span style="opacity:0.4;margin:0 6px">|</span> Target: ${fmtMoney.format(target)} <span style="opacity:0.4;margin:0 6px">|</span> Finish: ${end}`
  }

  const clampMonthYear = (y, m) => {
    let yy = y
    let mm = m
    if (yy < state.minYear) yy = state.minYear
    if (yy > state.maxYear) yy = state.maxYear
    if (yy === state.minYear && mm < state.minMonth) mm = state.minMonth
    if (yy === state.maxYear && mm > state.maxMonth) mm = state.maxMonth
    if (mm < 0) mm = 0
    if (mm > 11) mm = 11
    return { y: yy, m: mm }
  }

  const buildAllowedYears = () => {
    const set = new Set()
    if (Number.isFinite(state.minYear)) set.add(state.minYear)
    if (Number.isFinite(state.maxYear)) set.add(state.maxYear)
    for (const d of state.deposits || []) {
      if (d && d.dt) set.add(d.dt.getFullYear())
    }
    const years = Array.from(set).sort((a, b) => a - b)
    state.years = years
    if (!years.length) state.years = [new Date().getFullYear()]
  }

  const updateYearLabel = () => {
    const yl = $("#outlk-goals-year-label", state.root)
    if (yl) yl.textContent = state.year ? String(state.year) : "Year"
  }

const updateMonthNavUI = () => {
  const prev = $("#outlk-goals-prev", state.root)
  const next = $("#outlk-goals-next", state.root)
  const mEl = $("#outlk-goals-month", state.root)

  const m = state.monthIndex
  if (mEl) mEl.textContent = MONTHS[m]

  const now = new Date()
  const nowY = now.getFullYear()
  const nowM = now.getMonth()

  let firstTxYear = null
  let firstTxMonth = null

  for (const d of state.deposits || []) {
    if (!d || !d.dt) continue
    if (d.status !== "applied") continue
    const y = d.dt.getFullYear()
    const mi = d.dt.getMonth()

    if (firstTxYear == null) {
      firstTxYear = y
      firstTxMonth = mi
    } else if (y < firstTxYear || (y === firstTxYear && mi < firstTxMonth)) {
      firstTxYear = y
      firstTxMonth = mi
    }
  }

  const atCurrentMonthLimit = state.year === nowY ? m >= nowM : m >= 11

  let atFirstTxLimit = false
  if (firstTxYear == null) {
    atFirstTxLimit = m <= 0
  } else if (state.year < firstTxYear) {
    atFirstTxLimit = m <= 0
  } else if (state.year === firstTxYear) {
    atFirstTxLimit = m <= firstTxMonth
  } else {
    atFirstTxLimit = m <= 0
  }

  if (prev) prev.disabled = !!atFirstTxLimit
  if (next) next.disabled = !!atCurrentMonthLimit
}



  const renderSummary = () => {
    const el = $("#outlk-goals-summary", state.root)
    if (!el) return
    const g = state.selectedGoal
    const target = goalTarget(g)
    const total = sumAppliedUntilEndOfMonth(state.year, state.monthIndex)
    const pct = target > 0 ? Math.round((Math.min(total, target) / target) * 100) : 0

    el.innerHTML = `
      <div style="margin-bottom:6px">Total Saved: <strong style="color:#fff">${fmtMoney.format(total)}</strong></div>
      <div>Goal Target: <strong>${fmtMoney.format(target)}</strong></div>
      <div>Overall Progress: <strong>${pct}%</strong></div>
    `
  }

  const renderAheadBehind = () => {
    const el = $("#outlk-goals-ahead", state.root)
    if (!el) return
    const g = state.selectedGoal
    const s = state.selectedSection
    const reqM = requiredMonthly(g, s)
    const total = sumAppliedUntilEndOfMonth(state.year, state.monthIndex)

    // Simplified calc for demo
    const elapsedMonths = Math.max(1, state.monthIndex + 1)
    const requiredToDate = reqM > 0 ? reqM * elapsedMonths : 0
    const extra = total - requiredToDate
    const ok = extra >= -0.01

    const mode = ok ? "good" : "bad"
    const icon = ok ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-exclamation-triangle"></i>'
    const title = ok ? "AHEAD OF SCHEDULE" : "BEHIND SCHEDULE"
    
    el.className = `outlk-summary ${mode}`
    el.innerHTML = `
      <div class="outlk-summary-head">${icon} ${title}</div>
      <div class="outlk-summary-sub">
        ${ok ? `You are <strong>${fmtMoney.format(extra)}</strong> ahead of target.` : `You are <strong>${fmtMoney.format(Math.abs(extra))}</strong> behind target.`}
      </div>
    `
  }

  const renderLegend = () => {
    const el = $("#outlk-goals-legend", state.root)
    if (!el) return
    const { manual, autoPaid, autoMissed, txCount } = splitMonthByType(state.year, state.monthIndex)

    // Update center number
    const txEl = $("#outlk-goals-txcount", state.root)
    if (txEl) txEl.textContent = String(txCount || 0)

    el.innerHTML = `
      <div class="outlk-legrow">
        <div class="outlk-legleft">
          <div class="outlk-legdot" style="background:#22c55e"></div>
          <div class="outlk-legtext">
            <div class="outlk-legtitle">Manual Deposit</div>
            <div class="outlk-legsub">One-time transfers</div>
          </div>
        </div>
        <div class="outlk-legright">${fmtMoney.format(manual)}</div>
      </div>

      <div class="outlk-legrow">
        <div class="outlk-legleft">
          <div class="outlk-legdot" style="background:#3b82f6"></div>
          <div class="outlk-legtext">
            <div class="outlk-legtitle">Auto (Paid)</div>
            <div class="outlk-legsub">Scheduled</div>
          </div>
        </div>
        <div class="outlk-legright">${fmtMoney.format(autoPaid)}</div>
      </div>

      <div class="outlk-legrow">
        <div class="outlk-legleft">
          <div class="outlk-legdot" style="background:#ef4444"></div>
          <div class="outlk-legtext">
            <div class="outlk-legtitle">Auto (Missed)</div>
            <div class="outlk-legsub">Failed/Skipped</div>
          </div>
        </div>
        <div class="outlk-legright">${fmtMoney.format(autoMissed)}</div>
      </div>
    `
  }

  // --- CUSTOM CONCENTRIC RINGS (Canvas) ---
  const drawConcentricRings = (canvas, dataValues, colors) => {
    if(!canvas) return
    const ctx = canvas.getContext('2d')
    const w = canvas.width; const h = canvas.height
    ctx.clearRect(0, 0, w, h)

    const centerX = w / 2; const centerY = h / 2
    const maxRadius = Math.min(w, h) / 2 - 10
    const ringWidth = 12
    const spacing = 8

    // Calculate total to determine 100% reference? 
    // Or relative to Goal Target?
    // For this breakdown, let's treat the largest value as 100% of its ring (progress bar style) 
    // OR normalized to total monthly deposit.
    // Let's normalize to Total Monthly Deposit so they show relative contribution.
    const total = dataValues.reduce((a, b) => a + b, 0) || 1

    dataValues.forEach((val, i) => {
        const radius = maxRadius - (i * (ringWidth + spacing))
        const pct = val / total
        const endAngle = (Math.PI * 2) * pct - (Math.PI / 2) 

        // Draw Track (Faint background ring)
        ctx.beginPath()
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
        ctx.strokeStyle = "rgba(255,255,255,0.05)"
        ctx.lineWidth = ringWidth
        ctx.lineCap = "round"
        ctx.stroke()

        // Draw Value Ring
        if (val > 0) {
            ctx.beginPath()
            ctx.arc(centerX, centerY, radius, -Math.PI / 2, endAngle)
            ctx.strokeStyle = colors[i]
            ctx.lineWidth = ringWidth
            ctx.lineCap = "round"
            ctx.stroke()
        }
    })
  }

 const renderChartsAndPanels = () => {
  const g = state.selectedGoal
  const s = state.selectedSection
  if (!g || !s) return

  const labels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

  const year = state.year
  const reqM = requiredMonthly(g, s)

  const now = new Date()
  const nowY = now.getFullYear()
  const nowM = now.getMonth()

  const monthDeposits = new Array(12).fill(0)

  let firstTxYear = null
  let firstTxMonth = null

  for (const d of state.deposits || []) {
    if (!d || !d.dt) continue
    if (d.status !== "applied") continue

    const y = d.dt.getFullYear()
    const m = d.dt.getMonth()

    if (y === year) monthDeposits[m] += safeNum(d.amount)

    if (firstTxYear == null) {
      firstTxYear = y
      firstTxMonth = m
    } else if (y < firstTxYear || (y === firstTxYear && m < firstTxMonth)) {
      firstTxYear = y
      firstTxMonth = m
    }
  }

  const endMi = year === nowY ? nowM : 11

  let reqStartMi = null
  if (firstTxYear == null) {
    reqStartMi = null
  } else if (year < firstTxYear) {
    reqStartMi = null
  } else if (year === firstTxYear) {
    reqStartMi = firstTxMonth
  } else {
    reqStartMi = 0
  }

  const reqBars = new Array(12).fill(0)
  for (let mi = 0; mi < 12; mi++) {
    const isFutureInCurrentYear = year === nowY && mi > nowM
    if (isFutureInCurrentYear) {
      monthDeposits[mi] = 0
      reqBars[mi] = 0
      continue
    }

    if (reqStartMi == null) {
      reqBars[mi] = 0
      continue
    }

    reqBars[mi] = mi >= reqStartMi && mi <= endMi ? (reqM || 0) : 0
  }

  destroyCharts()

  const barCanvas = $("#outlk-goals-bar", state.root)
  if (barCanvas && window.Chart) {
    const ctx = barCanvas.getContext("2d")
    state.barChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Deposited",
            data: monthDeposits,
            backgroundColor: "#22c55e",
            borderRadius: 4,
            barPercentage: 0.7
          },
          {
            label: "Min Required",
            data: reqBars,
            backgroundColor: "#3b82f6",
            borderRadius: 4,
            barPercentage: 0.7
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,

        // ✅ THIS is what makes the tooltip show BOTH datasets together (like Activity)
        interaction: { mode: "index", intersect: false },

        plugins: {
          legend: { labels: { color: "#fff" } },
          tooltip: {
            enabled: true,
            mode: "index",
            intersect: false,
            callbacks: {
              title: (items) => (items && items[0] ? items[0].label : ""),
              label: (ctx) => `${ctx.dataset.label}: ${fmtMoney.format(Number(ctx.parsed?.y || 0))}`
            }
          }
        },

        scales: {
          x: { grid: { display: false }, ticks: { color: "#94a3b8" } },
          y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { color: "#94a3b8" } }
        }
      }
    })
  }

  const split = splitMonthByType(year, state.monthIndex)
  const vals = [split.manual, split.autoPaid, split.autoMissed]
  const colors = ["#22c55e", "#3b82f6", "#ef4444"]

  const ringCanvas = $("#outlk-goals-rings", state.root)
  drawConcentricRings(ringCanvas, vals, colors)

  updateHeader()
  updateYearLabel()
  updateMonthNavUI()
  renderSummary()
  renderLegend()
  renderAheadBehind()
}

  // --- AI ---
  function typeWriter(text, element) {
    element.textContent = ""; let i = 0;
    function type() { if(i < text.length) { element.textContent += text.charAt(i); i++; setTimeout(type, 10); } }
    type();
  }

 /* Goals AI analysis
   This section types an immediate “generating” line, then replaces it with the final AI report */
const renderAi = async () => {
  const out = $("#outlk-goals-ai-out", state.root)
  const g = state.selectedGoal
  const s = state.selectedSection
  if (!out || !g || !s) return

  if (state.aiBusy) return
  state.aiBusy = true

  const aiBtn = $("#outlk-goals-ai-btn", state.root)
  if (aiBtn) aiBtn.disabled = true

  const TZ = "America/Los_Angeles"
  const laFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })

  const laYMD = (dt) => {
    const parts = laFmt.formatToParts(dt)
    const y = parts.find((p) => p.type === "year")?.value || "1970"
    const m = parts.find((p) => p.type === "month")?.value || "01"
    const d = parts.find((p) => p.type === "day")?.value || "01"
    return `${y}-${m}-${d}`
  }

  const clampYMD = (v) => (v && String(v).length >= 10 ? String(v).slice(0, 10) : null)

  const maxYMD = (a, b) => {
    if (!a) return b
    if (!b) return a
    return a > b ? a : b
  }

  const minYMD = (a, b) => {
    if (!a) return b
    if (!b) return a
    return a < b ? a : b
  }

  try {
    const now = new Date()
    const todayISO = laYMD(now)
    const nowY = Number(todayISO.slice(0, 4))

    const year = Number(state.year)
    const yearStartISO = `${year}-01-01`
    const yearEndISO = year === nowY ? todayISO : `${year}-12-31`

    const goalStartISO = clampYMD(
      g.startDate || g.start_date || g.createdAt || g.created_at || s.startDate || s.start_date
    )
    const goalEndISO = clampYMD(g.endDate || g.end_date || s.endDate || s.end_date)

    const activeStartISO = maxYMD(yearStartISO, goalStartISO)
    const activeEndISO = minYMD(yearEndISO, goalEndISO)

    // Match Budgets style: write a terminal command line first, then replace with the final report
    const msgStart = activeStartISO || yearStartISO
    const msgEnd = activeEndISO || yearEndISO
    typeWriter(`> Generating AI analysis for ${year} (${msgStart} to ${msgEnd})...\n`, out)

    const target = goalTarget(g)
    const reqMonthly = requiredMonthly(g, s)
    const reqDaily = requiredDaily(g, s)

    const monthly = new Array(12).fill(0).map((_, mi) => ({
      month: MONTHS[mi],
      deposited: 0,
      manual: 0,
      autoPaid: 0,
      autoMissed: 0,
      txCount: 0
    }))

    let appliedInRange = 0
    let appliedAllTime = 0
    let appliedToActiveEnd = 0

    let missedAutoCountInRange = 0
    let missedAutoAmountInRange = 0

    let lastDepositISO = null

    for (const d of state.deposits || []) {
      if (!d || !d.dt) continue

      const dt = d.dt
      const ymd = laYMD(dt)
      const y = Number(ymd.slice(0, 4))
      const mi = Number(ymd.slice(5, 7)) - 1

      if (y === year && mi >= 0 && mi <= 11) {
        monthly[mi].txCount += 1

        if (d.type === "manual" && d.status === "applied") monthly[mi].manual += safeNum(d.amount)
        if (d.type === "auto" && d.status === "applied") monthly[mi].autoPaid += safeNum(d.amount)
        if (d.type === "auto" && d.status === "missed") monthly[mi].autoMissed += safeNum(d.amount)
      }

      if (d.status === "applied") {
        appliedAllTime += safeNum(d.amount)

        if (!lastDepositISO || ymd > lastDepositISO) lastDepositISO = ymd

        if (activeEndISO && ymd <= activeEndISO) appliedToActiveEnd += safeNum(d.amount)

        if (activeStartISO && activeEndISO && ymd >= activeStartISO && ymd <= activeEndISO) {
          appliedInRange += safeNum(d.amount)
        }
      }

      if (d.type === "auto" && d.status === "missed") {
        if (activeStartISO && activeEndISO && ymd >= activeStartISO && ymd <= activeEndISO) {
          missedAutoCountInRange += 1
          missedAutoAmountInRange += safeNum(d.amount)
        }
      }
    }

    for (let mi = 0; mi < 12; mi++) monthly[mi].deposited = monthly[mi].manual + monthly[mi].autoPaid

    const remaining = Math.max(0, target - appliedToActiveEnd)
    const progressPct = target > 0 ? Math.max(0, Math.min(100, (appliedToActiveEnd / target) * 100)) : 0

    const startUtc = parseYMD(goalStartISO || activeStartISO || yearStartISO)
    const endUtc = parseYMD(activeEndISO || yearEndISO)

    const monthsElapsed = startUtc && endUtc ? diffMonthsInclusive(startUtc, endUtc) || 0 : 0
    const requiredToDate = reqMonthly > 0 ? reqMonthly * Math.max(1, monthsElapsed) : 0
    const aheadBehind = appliedToActiveEnd - requiredToDate

    const promptPayload = {
      year,
      range: { startISO: activeStartISO || yearStartISO, endISO: activeEndISO || yearEndISO },
      goal: {
        id: String(g.id || ""),
        name: String(g.name || "Goal").trim(),
        target,
        startISO: goalStartISO,
        endISO: goalEndISO,
        lastDepositISO
      },
      progress: {
        savedToDate: appliedToActiveEnd,
        savedInRange: appliedInRange,
        savedAllTime: appliedAllTime,
        remaining,
        progressPct,
        requiredMonthly: reqMonthly,
        requiredDaily: reqDaily,
        monthsElapsed,
        requiredToDate,
        aheadBehind
      },
      consistency: {
        missedAutoCountInRange,
        missedAutoAmountInRange
      },
      monthly
    }

    const headers = { Accept: "application/json", "Content-Type": "application/json" }
    const r = await fetchJson("/api/ai/outlook/goals", {
      method: "POST",
      headers,
      body: JSON.stringify(promptPayload)
    })

    const text = String(r && r.text ? r.text : "").trim()
    if (!text) {
      typeWriter(`> Generated for ${year} (${msgStart} to ${msgEnd})\nNo AI response received.\n`, out)
      return
    }

    typeWriter(text, out)
  } catch {
    out.textContent = "AI analysis failed. Please try again."
  } finally {
    state.aiBusy = false
    if (aiBtn) aiBtn.disabled = false
  }
}

  const openYearPicker = () => {
    const dlg = $("#outlk-goals-yearmodal", state.root)
    if(dlg) { 
        $("#outlk-goals-yeardisplay", state.root).textContent = state.year
        try{ dlg.showModal() } catch{ dlg.setAttribute("open","true") } 
    }
  }

  const applyYearPicker = () => {
    const y = Number(state.tempYear)
    if (!Number.isFinite(y) || !state.years.includes(y)) { closeDialog($("#outlk-goals-yearmodal", state.root)); return }
    state.year = y
    const clamped = clampMonthYear(state.year, state.monthIndex)
    state.year = clamped.y
    state.monthIndex = clamped.m
    updateYearLabel()
    updateMonthNavUI()
    renderChartsAndPanels()
    closeDialog($("#outlk-goals-yearmodal", state.root))
  }

  const selectGoal = async (sid, gid) => {
    state.selectedSectionId = String(sid)
    state.selectedGoalId = String(gid)
    state.selectedSection = state.sections.find(s => String(s.id) === String(sid))
    state.selectedGoal = state.selectedSection?.goals.find(g => String(g.id) === String(gid))

    if(!state.selectedGoal) return

    try { state.deposits = await loadDepositsForGoal(gid) } catch { state.deposits = [] }

    // Init dates
    const now = new Date(); const nowY = now.getFullYear(); const nowM = now.getMonth()
    const rawStart = (state.selectedGoal.startDate) || (state.selectedSection.startDate) || (state.selectedGoal.createdAt) || null
    let start = rawStart ? new Date(rawStart) : new Date(nowY, nowM, 1)
    if (!Number.isFinite(start.getTime())) start = new Date(nowY, nowM, 1)

    state.minYear = start.getFullYear()
    state.minMonth = start.getMonth()
    state.maxYear = nowY
    state.maxMonth = nowM
    buildAllowedYears()

    state.year = nowY; state.monthIndex = nowM
    showView("analysis")
    renderChartsAndPanels()
  }

 const wire = () => {
  const yearBtn = $("#outlk-goals-year", state.root)
  const prev = $("#outlk-goals-prev", state.root)
  const next = $("#outlk-goals-next", state.root)
  const aiBtn = $("#outlk-goals-ai-btn", state.root)

  const dlg = $("#outlk-goals-modal", state.root)
  const x1 = $("#outlk-goals-modal-x", state.root)

  const ydlg = $("#outlk-goals-yearmodal", state.root)
  const yx = $("#outlk-goals-yearmodal-x", state.root)
  const yp = $("#outlk-goals-yearprev", state.root)
  const yn = $("#outlk-goals-yearnext", state.root)
  const ya = $("#outlk-goals-yearapply", state.root)
  const yd = $("#outlk-goals-yeardisplay", state.root)

  const inAnalysisView = () => {
    const v = $("#outlk-goals-analysis-view", state.root)
    return !!(v && v.classList.contains("active"))
  }

  if (dlg) bindClickAwayClose(dlg)
  if (ydlg) bindClickAwayClose(ydlg)

  if (yearBtn) yearBtn.addEventListener("click", () => {
    if (!inAnalysisView()) return
    openYearPicker()
  })

  if (prev) prev.addEventListener("click", () => {
    if (!inAnalysisView()) return
    const nm = state.monthIndex - 1
    if (nm < 0) return
    state.monthIndex = nm
    updateMonthNavUI()
    renderChartsAndPanels()
  })

  if (next) next.addEventListener("click", () => {
    if (!inAnalysisView()) return
    const nm = state.monthIndex + 1
    if (nm > 11) return
    state.monthIndex = nm
    updateMonthNavUI()
    renderChartsAndPanels()
  })

  if (aiBtn) aiBtn.addEventListener("click", async () => {
    if (!inAnalysisView()) return
    await renderAi()
  })

  if (x1) x1.addEventListener("click", () => closeDialog(dlg))
  if (yx) yx.addEventListener("click", () => closeDialog(ydlg))

  if (yp && yd) yp.addEventListener("click", () => {
    if (!inAnalysisView()) return
    if (!Number.isFinite(state.tempYear)) state.tempYear = state.year
    const idx = state.years.indexOf(state.tempYear)
    if (idx > 0) state.tempYear = state.years[idx - 1]
    yd.textContent = String(state.tempYear)
  })

  if (yn && yd) yn.addEventListener("click", () => {
    if (!inAnalysisView()) return
    if (!Number.isFinite(state.tempYear)) state.tempYear = state.year
    const idx = state.years.indexOf(state.tempYear)
    if (idx >= 0 && idx < state.years.length - 1) state.tempYear = state.years[idx + 1]
    yd.textContent = String(state.tempYear)
  })

  if (ya) ya.addEventListener("click", () => {
    if (!inAnalysisView()) return
    applyYearPicker()
  })

  $("#outlk-goals-back", state.root)?.addEventListener("click", () => showView("sections"))
}

const refresh = async () => {
  state.sections = []
  try { state.sections = await loadSections() } catch { state.sections = [] }
  showView("sections")
  renderSections()
}

window.__outlook_pages = window.__outlook_pages || {}
window.__outlook_pages.goals = {
  init: async ({ rootId } = {}) => {
    state.root = document.getElementById(rootId || "outlk-goals-root")
    if (state.root) { wire(); await refresh() }
  }
}
})()
