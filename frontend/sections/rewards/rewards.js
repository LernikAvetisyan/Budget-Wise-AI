;(() => {
  // Rewards Section Bootstrap
  // Prevents duplicate event wiring if this script is evaluated more than once.
  if (window.__rewardsInitialized) return
  window.__rewardsInitialized = true

  const root = document.getElementById("rewards-root")
  if (!root) return

  const $ = (sel) => root.querySelector(sel)

  const LEVEL_CAPS = [0, 1000, 25000, 50000, 65000, 75000, 100000, 150000, 200000, 250000, 300000]
  const API_BASE = "/api/rewards"

  let xpChart = null
  let isLoading = false

  const state = {
    overallXp: 0,
    streak: 0,
    lastActiveDate: null,
    today: { day: "", xpEarned: 0, eligibleTaskIds: [], completedTaskIds: [] },
    history7: []
  }

  // Date Helper
  // Returns YYYY-MM-DD using local browser date.
  function ymdLocal() {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }

  // API Helper
  // Calls Rewards endpoints with credentials and JSON handling.
  async function apiFetch(path, { method = "GET", body } = {}) {
    const opts = { method, credentials: "include", headers: { Accept: "application/json" } }
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json"
      opts.body = JSON.stringify(body)
    }

    const res = await fetch(`${API_BASE}${path}`, opts)

    let data = null
    try { data = await res.json() } catch { data = null }

    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`
      const err = new Error(msg)
      err.status = res.status
      err.data = data
      throw err
    }

    return data
  }

  // State Sync
  // Normalizes server payload into the local state model.
  function syncStateFromPayload(data) {
  if (data && data.profile) {
    state.overallXp = Number(data.profile.overallXp || 0)
    state.streak = Number(data.profile.streak || 0)
    state.lastActiveDate = data.profile.lastActiveDate || null
  }

  if (data && data.today) {
    state.today = {
      day: data.today.day || ymdLocal(),
      xpEarned: Number(data.today.xpEarned || 0),
      eligibleTaskIds: Array.isArray(data.today.eligibleTaskIds) ? data.today.eligibleTaskIds : [],
      completedTaskIds: Array.isArray(data.today.completedTaskIds) ? data.today.completedTaskIds : []
    }
  }

  const raw = (data && Array.isArray(data.history7)) ? data.history7 : []

  const byDay = new Map()
  raw.forEach((p) => {
    const day = String(p && p.day || "").slice(0, 10)
    if (!day) return
    const xp = Number(p && p.xp)
    byDay.set(day, Number.isFinite(xp) ? xp : 0)
  })

  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()

  const fixed = []
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(y, m, d - i)
    const yy = dt.getFullYear()
    const mm = String(dt.getMonth() + 1).padStart(2, "0")
    const dd = String(dt.getDate()).padStart(2, "0")
    const dayStr = `${yy}-${mm}-${dd}`
    const xp = byDay.has(dayStr) ? Number(byDay.get(dayStr) || 0) : 0
    fixed.push({ day: dayStr, xp })
  }

  state.history7 = fixed
}

  // Header UI
  // Updates top-level stats like total XP and streak.
function updateHeaderUI() {
  const total = $("#rw-total-xp")
  if (total) {
    const hist = Array.isArray(state.history7) ? state.history7 : []

    let sumStreak = 0
    let daysCounted = 0

    for (let i = hist.length - 1; i >= 0; i--) {
      const v = Number(hist[i] && hist[i].xp)
      const xp = Number.isFinite(v) ? v : 0

      if (xp > 0) {
        sumStreak += xp
        daysCounted++
        if (daysCounted >= 7) break
      } else {
        break
      }
    }

    total.textContent = sumStreak.toLocaleString()
  }

  const streak = $("#rw-stat-streak")
  if (streak) streak.textContent = Number(state.streak || 0)
}

  // Level UI
  // Calculates level progress and updates ring, bar, and milestone markers.
  function applyLevelUI() {
  const overall = Number(state.overallXp || 0)

  const maxLevel = LEVEL_CAPS.length - 1

  let currentLevel = 1
  for (let i = 0; i < LEVEL_CAPS.length - 1; i++) {
    if (overall >= LEVEL_CAPS[i]) currentLevel = i + 1
  }
  if (currentLevel > maxLevel) currentLevel = maxLevel

  const lvlEl = $("#rw-level-current")
  if (lvlEl) lvlEl.textContent = currentLevel

  const curXpEl = $("#rw-level-current-xp")
  if (curXpEl) curXpEl.textContent = overall.toLocaleString()

  const capEl = $("#rw-level-xp-cap")
  const xpToNext = $("#rw-stat-xp-to-next")
  const xpToNextLine = xpToNext ? xpToNext.closest(".xp-remain-text") : null

  if (overall >= LEVEL_CAPS[LEVEL_CAPS.length - 1]) {
    if (capEl) capEl.textContent = LEVEL_CAPS[LEVEL_CAPS.length - 1].toLocaleString()
    if (xpToNextLine) xpToNextLine.textContent = "Max Level Reached"
  } else {
    const nextTotal = LEVEL_CAPS[currentLevel]
    const needed = Math.max(0, nextTotal - overall)

    if (capEl) capEl.textContent = nextTotal.toLocaleString()
    if (xpToNext) xpToNext.textContent = needed.toLocaleString()
    if (xpToNextLine) {
      xpToNextLine.innerHTML = `<span id="rw-stat-xp-to-next">${needed.toLocaleString()}</span> XP needed to level up`
    }
  }

  const levelStart = LEVEL_CAPS[currentLevel - 1] || 0
  const nextTotal = overall >= LEVEL_CAPS[LEVEL_CAPS.length - 1]
    ? LEVEL_CAPS[LEVEL_CAPS.length - 1]
    : LEVEL_CAPS[currentLevel]

  const levelDelta = Math.max(1, nextTotal - levelStart)
  const xpInCurrent = Math.max(0, overall - levelStart)

  const circle = $("#xp-ring-circle")
  if (circle) {
    const radius = circle.r.baseVal.value
    const circumference = radius * 2 * Math.PI
    circle.style.strokeDasharray = `${circumference}`
    const percent = Math.min(100, Math.max(0, (xpInCurrent / levelDelta) * 100))
    const offset = circumference - (percent / 100) * circumference
    circle.style.strokeDashoffset = offset
  }

  const barFill = $("#xp-bar-fill")
  if (barFill) {
    const percent = Math.min(100, Math.max(0, (xpInCurrent / levelDelta) * 100))
    barFill.style.width = `${percent}%`
  }

  root.querySelectorAll(".milestone-item").forEach((el) => {
    const lvl = parseInt(el.dataset.level, 10)
    el.classList.remove("current", "unlocked")
    if (lvl < currentLevel) el.classList.add("unlocked")
    if (lvl === currentLevel) el.classList.add("current")
  })
}

  // Task Cards UI
  // Applies locked, claimable, completed states based on eligibility and completion.
  function updateTasksUI() {
    const eligibleSet = new Set(state.today.eligibleTaskIds || [])
    const completedSet = new Set(state.today.completedTaskIds || [])

    const tasks = root.querySelectorAll(".rw-task-card")
    let completedCount = 0

    tasks.forEach((card) => {
      const id = card.dataset.taskId

      card.classList.remove("locked", "claimable")
      if (completedSet.has(id)) {
        card.classList.add("completed")
        completedCount++
      } else {
        card.classList.remove("completed")
        if (eligibleSet.has(id)) card.classList.add("claimable")
        else card.classList.add("locked")
      }
    })

    const countEl = $("#rw-tasks-completed-small")
    if (countEl) countEl.textContent = completedCount
  }

  // XP History Chart
  // Renders the 7-day XP history bar chart.
function renderChart() {
  const canvas = document.getElementById("xp-history-chart")
  if (!canvas || typeof Chart === "undefined") return

  const points = state.history7.map((p) => {
    const v = Number(p && p.xp)
    return Number.isFinite(v) ? v : 0
  })

  const labels = state.history7.map((p) => {
    const d = new Date(String(p && p.day || ""))
    return d.toLocaleDateString("en-US", { weekday: "short" })
  })

  if (xpChart) xpChart.destroy()

  const ctx = canvas.getContext("2d")
  const gradient = ctx.createLinearGradient(0, 0, 0, 400)
  gradient.addColorStop(0, "#8b5cf6")
  gradient.addColorStop(1, "#3b82f6")

  const barColors = points.map((v) => (v <= 0 ? "rgba(239, 68, 68, 0.9)" : gradient))

  const maxPoint = points.reduce((m, v) => (v > m ? v : m), 0)
  const baseTicks = [0, 100, 200, 300, 400, 500, 600, 700, 1000]
  const yMax = Math.max(1000, maxPoint)

  let tickVals = baseTicks.filter(v => v <= yMax)
  if (maxPoint > 1000 && !tickVals.includes(yMax)) tickVals.push(yMax)

  xpChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "XP Earned",
          data: points,
          backgroundColor: barColors,
          borderRadius: 6,
          barThickness: 20
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          min: 0,
          max: yMax,
          afterBuildTicks: (scale) => {
            scale.ticks = tickVals.map(v => ({ value: v }))
          },
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: {
            color: "#64748b",
            callback: (value) => Number(value).toLocaleString()
          }
        },
        x: {
          display: true,
          grid: { display: false },
          ticks: {
            color: "#64748b",
            maxRotation: 0,
            minRotation: 0,
            autoSkip: false
          }
        }
      }
    }
  })
}

  // Card Flash
  // Adds a short visual flash effect after updates.
  function flashCard(card) {
    card.classList.add("rw-flash")
    setTimeout(() => card.classList.remove("rw-flash"), 700)
  }

  // Claim Handler
  // Claims a claimable task and updates UI from server response.
  async function handleTaskClick(e) {
    const card = e.currentTarget
    const taskId = String(card.dataset.taskId || "").trim()
    const xp = Math.trunc(Number(card.dataset.xp || 0))

    if (!taskId || !Number.isFinite(xp) || xp <= 0) return
    if (!card.classList.contains("claimable")) return

    try {
      const data = await apiFetch("/complete", { method: "POST", body: { taskId, xp } })
      syncStateFromPayload(data)
      updateHeaderUI()
      applyLevelUI()
      updateTasksUI()
      renderChart()
      flashCard(card)
    } catch (err) {
      console.error("claim failed:", err)
      alert(err.message || "Could not claim reward.")
    }
  }

  // Data Reload
  // Re-fetches Rewards state so tasks completed in other sections show immediately.
  async function reloadRewardsUI() {
    if (isLoading) return
    isLoading = true

    try {
      const data = await apiFetch("/", { method: "GET" })
      syncStateFromPayload(data)
    } catch (err) {
      console.error("Rewards load failed:", err)
      state.today = { day: ymdLocal(), xpEarned: 0, eligibleTaskIds: [], completedTaskIds: [] }
      state.history7 = []
    }

    updateHeaderUI()
    applyLevelUI()
    updateTasksUI()
    setTimeout(renderChart, 50)

    isLoading = false
  }

  // Auto Eligibility
  // Ensures a default task is eligible if it is not already eligible or completed.
  async function ensureAutoEligibleOpenAccount() {
    try {
      const taskId = "open-account"
      const alreadyEligible = (state.today.eligibleTaskIds || []).includes(taskId)
      const alreadyCompleted = (state.today.completedTaskIds || []).includes(taskId)

      if (!alreadyEligible && !alreadyCompleted) {
        const data = await apiFetch("/eligible", { method: "POST", body: { taskId } })
        syncStateFromPayload(data)

        updateHeaderUI()
        applyLevelUI()
        updateTasksUI()
        setTimeout(renderChart, 50)

        const card = root.querySelector(`.rw-task-card[data-task-id="${CSS.escape(taskId)}"]`)
        if (card) flashCard(card)
      }
    } catch (err) {
      console.error("auto-eligible failed:", err)
    }
  }

  // Event Wiring
  // Attaches listeners once and refreshes when Rewards becomes active.
  async function init() {
    root.querySelectorAll(".rw-task-card").forEach((card) => {
      card.addEventListener("click", handleTaskClick)
    })

    window.addEventListener("rewards:task-ready", async (e) => {
      const taskId = String(e?.detail?.taskId || "").trim()
      if (!taskId) return

      const alreadyEligible = (state.today.eligibleTaskIds || []).includes(taskId)
      const alreadyCompleted = (state.today.completedTaskIds || []).includes(taskId)
      if (alreadyEligible || alreadyCompleted) return

      try {
        const data = await apiFetch("/eligible", { method: "POST", body: { taskId } })
        syncStateFromPayload(data)
        updateHeaderUI()
        applyLevelUI()
        updateTasksUI()
        renderChart()

        const card = root.querySelector(`.rw-task-card[data-task-id="${CSS.escape(taskId)}"]`)
        if (card) flashCard(card)
      } catch (err) {
        console.error("eligible failed:", err)
      }
    })

    window.addEventListener("section:ready", (e) => {
      if (e && e.detail && e.detail.section === "rewards") reloadRewardsUI()
    })

    window.addEventListener("section:mounted", (e) => {
      if (e && e.detail && e.detail.section === "rewards") reloadRewardsUI()
    })

    await reloadRewardsUI()
    await ensureAutoEligibleOpenAccount()
  }

  init()
})()