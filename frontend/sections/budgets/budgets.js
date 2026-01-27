/* frontend/sections/budgets/budgets.js */
(() => {
  if (window.__budgets && typeof window.__budgets.cleanup === "function") {
    window.__budgets.cleanup()
  }

  const $ = id => document.getElementById(id)

  const fmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2
  })
  const fmtInt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })
  const fmtDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
  const ICON = "fas fa-tag"

  const state = {
    txAll: [],
    budgets: [],
    currentMonthKey: ""
  }

  function monthKey(d = new Date()) {
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    return `${y}-${String(m).padStart(2, "0")}`
  }

  function parseISO(d) {
    if (!d) return new Date(NaN)
    if (d instanceof Date) return d
    if (typeof d === "string") {
      if (d.includes("T")) return new Date(d)
      return new Date(d + "T00:00:00")
    }
    return new Date(d)
  }

  function titleCase(s) {
    return (s || "").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
  }

  function nextMonthCountdown() {
    const now = new Date()
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const s = Math.max(0, Math.floor((end - now) / 1000))
    const d = Math.floor(s / 86400)
    const h = Math.floor((s % 86400) / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `Ends in ${d}d ${h}h ${m}m ${sec}s`
  }

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) }
  if (!headers.Accept) headers.Accept = "application/json"
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json"

  const res = await fetch(path, {
    credentials: "include",
    ...options,
    headers
  })

  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try {
      const data = await res.json()
      if (data && data.error) msg = data.error
    } catch {}
    const err = new Error(msg)
    err.status = res.status
    throw err
  }

  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

  function normalizeCat(s) {
    return String(s || "").toLowerCase().trim()
  }

  function asNumber(x, fallback = 0) {
    const n = Number(x)
    return Number.isFinite(n) ? n : fallback
  }

  // ──────────────────────────────────────────────────────────────
  // Data loading
  // ──────────────────────────────────────────────────────────────

  async function loadTransactions() {
    const res = await fetch("/api/activity", { credentials: "include", headers: { Accept: "application/json" } })
    if (!res.ok) throw new Error("Failed to load transactions")

 const data = await res.json().catch(() => ({}))
const tx =
  Array.isArray(data) ? data
  : (data && Array.isArray(data.items) ? data.items
  : (data && Array.isArray(data.transactions) ? data.transactions : []))


    state.txAll = tx.map(t => ({
      id: t.id,
      date: t.date,
      time: t.time,
      type: String(t.type || "").toLowerCase(),
      category: String(t.category || ""),
      merchant: String(t.merchant || ""),
      amount: asNumber(t.amount, 0),
      origin: t.origin || "manual",
      externalId: t.externalId || null,

      accountType: t.accountType || t.account_type || null,
      account_id: t.account_id ?? null
    }))

    window.__sampleTx = state.txAll
    return state.txAll
  }

  async function loadBudgetsFromServer() {
    try {
      const data = await apiFetch("/api/budgets")
      if (!Array.isArray(data)) {
        state.budgets = []
        saveBudgets()
        return
      }

      state.budgets = data.map(row => {
        const category = row.category || ""
        const ncat = normalizeCat(category)
        return {
          id: row.id,
          category,
          ncat,
          enabled: !!row.enabled,
          limit: asNumber(row.monthlyLimit ?? row.monthly_limit ?? 0, 0),
          limitsLocked: !!row.limitsLocked,
          spentAmount: asNumber(row.spentAmount ?? row.spent_amount ?? 0, 0)
        }
      })

      saveBudgets()
    } catch (err) {
      console.error("Budgets: failed to load budgets:", err.message)
      state.budgets = []
      saveBudgets()
    }
  }

  async function apiToggleCategory(category, enabled) {
    return apiFetch("/api/budgets/toggle", {
      method: "POST",
      body: JSON.stringify({ category, enabled })
    })
  }

  async function apiSetLimit(category, monthlyLimit) {
    return apiFetch("/api/budgets/limit", {
      method: "POST",
      body: JSON.stringify({ category, monthlyLimit })
    })
  }

  function applyServerBudgets(rows) {
    if (!Array.isArray(rows)) return
    state.budgets = rows.map(row => {
      const category = row.category || ""
      const ncat = normalizeCat(category)
      return {
        id: row.id,
        category,
        ncat,
        enabled: !!row.enabled,
        limit: asNumber(row.monthlyLimit ?? row.monthly_limit ?? 0, 0),
        limitsLocked: !!row.limitsLocked,
        spentAmount: asNumber(row.spentAmount ?? row.spent_amount ?? 0, 0)
      }
    })
    saveBudgets()
    renderAll()
  }

  // ──────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────

  function txThisMonth() {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return state.txAll.filter(t => {
      const d = parseISO(t.date)
      return d >= start && d < end
    })
  }

  function stats() {
    const rows = txThisMonth()
    const income = rows.filter(t => t.type === "income").reduce((s, t) => s + asNumber(t.amount, 0), 0)
    const spent = rows.filter(t => t.type === "expense").reduce((s, t) => s + asNumber(t.amount, 0), 0)
    const balance = income - spent
    return { rows, income, spent, balance }
  }

  function saveBudgets() {
    const out = state.budgets.map(b => ({
      id: b.id,
      ncat: normalizeCat(b.ncat || b.category),
      category: b.category,
      limit: asNumber(b.limit, 0),
      enabled: !!b.enabled
    }))
    window.dispatchEvent(new CustomEvent("budget:updated", { detail: { budgets: out } }))
  }

  function spentMap() {
    const m = new Map()

    state.budgets.filter(b => b.enabled).forEach(b => {
      const key = normalizeCat(b.ncat || b.category)
      if (key) m.set(key, 0)
    })

    txThisMonth()
      .filter(t => t.type !== "income")
      .forEach(t => {
        const key = normalizeCat(t.category)
        if (m.has(key)) m.set(key, m.get(key) + Math.abs(asNumber(t.amount, 0)))
      })

    return m
  }

  // ──────────────────────────────────────────────────────────────
  // Rendering
  // ──────────────────────────────────────────────────────────────

  function renderKPIs() {
    const s = stats()

    const elBal = $("bud-available-balance")
    const elInc = $("bud-total-income")
    const elSpent = $("bud-total-spent")
    const elLeft = $("bud-total-left")

    if (!elBal && !elInc && !elSpent && !elLeft) return

    if (elBal) elBal.textContent = fmt.format(asNumber(s.balance, 0))
    if (elInc) elInc.textContent = fmt.format(asNumber(s.income, 0))
    if (elSpent) elSpent.textContent = fmt.format(asNumber(s.spent, 0))
    if (elLeft) elLeft.textContent = fmt.format(asNumber(s.income - s.spent, 0))
  }

  function renderSummary() {
    const enabled = state.budgets.filter(b => b.enabled)
    const total = enabled.reduce((sum, b) => sum + asNumber(b.limit, 0), 0)

    const smap = spentMap()
    const spent = enabled.reduce((sum, b) => {
      const key = normalizeCat(b.ncat || b.category)
      return sum + (smap.get(key) || 0)
    }, 0)

    const net = Math.max(0, total - spent)
    const pct = total > 0 ? Math.min(100, (spent / total) * 100) : 0

    const elTotal = $("sum-total")
    const elSpent = $("sum-spent")
    const elNet = $("sum-net")
    if (elTotal) elTotal.textContent = `$${fmtInt.format(asNumber(total, 0))}`
    if (elSpent) elSpent.textContent = `$${fmtInt.format(asNumber(spent, 0))}`
    if (elNet) elNet.textContent = `$${fmtInt.format(asNumber(net, 0))}`

    const fillEl = $("summary-fill")
    if (fillEl) {
      const usedStr = `${pct}%`
      fillEl.style.width = usedStr
      const bar = fillEl.closest(".summary-bar")
      if (bar) bar.style.setProperty("--summary-used", usedStr)
    }

    const leftEl = $("summary-left")
    if (leftEl) {
      if (total > 0) leftEl.textContent = `${fmt.format(spent)} of ${fmt.format(total)} used`
      else leftEl.textContent = "No budgets set for this month"
    }

    const rightEl = $("summary-right")
    if (rightEl) rightEl.textContent = `${pct.toFixed(1)}% used`
  }

  function trTpl(b, spent) {
    const limit = asNumber(b.limit, 0)
    const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0
    const safePct = pct > 0 ? Math.max(pct, 2) : 0

    return `
      <tr class="row-click" data-id="${b.id}" data-ncat="${normalizeCat(b.ncat || b.category)}">
        <td class="col-cat">
          <div class="cat-cell">
            <div class="cat-dot"><i class="${ICON}"></i></div>
            <span>${b.category}</span>
          </div>
        </td>
        <td class="col-spent">${fmt.format(asNumber(spent, 0))}</td>
        <td class="col-budget">${fmt.format(limit)}</td>
        <td class="col-progress">
          <div class="prog-wrap">
            <div class="prog-bar">
              <div class="prog-fill" style="width:${safePct}%"></div>
            </div>
            <div class="prog-pct">${pct.toFixed(0)}%</div>
          </div>
        </td>
        <td class="col-actions" style="text-align:right">
          <button class="icon-btn action-edit" title="Edit">
            <i class="fas fa-pen"></i>
          </button>
          <button class="icon-btn action-del" title="Remove">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `
  }

  function renderTable() {
    const body = $("bud-tbody")
    if (!body) return

    const sm = spentMap()
    const rows = state.budgets.filter(b => b.enabled)

    body.innerHTML = rows
      .map(b => trTpl(b, sm.get(normalizeCat(b.ncat || b.category)) || 0))
      .join("")

    body.querySelectorAll("tr.row-click").forEach(tr => {
      tr.addEventListener("click", e => {
        if (e.target.closest(".icon-btn")) return
        openTxListModal(tr.dataset.ncat)
      })
    })

    body.querySelectorAll(".action-edit").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation()
        const tr = btn.closest("tr")
        const b =
          state.budgets.find(x => String(x.id) === String(tr?.dataset?.id)) ||
          state.budgets.find(x => normalizeCat(x.ncat || x.category) === normalizeCat(tr?.dataset?.ncat))
        if (b) openEditModal(b)
      })
    })

    body.querySelectorAll(".action-del").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation()
        const tr = btn.closest("tr")
        const id = tr?.dataset?.id || ""
        const ncat = normalizeCat(tr?.dataset?.ncat || "")
        const b =
          state.budgets.find(x => String(x.id) === String(id)) ||
          state.budgets.find(x => normalizeCat(x.ncat || x.category) === ncat)
        if (!b) return

        const prev = { ...b }
        const idx = state.budgets.findIndex(x => String(x.id) === String(prev.id))
        if (idx >= 0) state.budgets[idx] = { ...state.budgets[idx], enabled: false }

        saveBudgets()
        renderSummary()
        renderTable()

        try {
          const rows2 = await apiToggleCategory(prev.category, false)
          applyServerBudgets(rows2)
        } catch (err) {
          console.error("Budgets: disable category failed:", err.message)
          const idx2 = state.budgets.findIndex(x => String(x.id) === String(prev.id))
          if (idx2 >= 0) state.budgets[idx2] = prev
          saveBudgets()
          renderSummary()
          renderTable()
          alert("Failed to remove budget category: " + err.message)
        }
      })
    })
  }

  // Connected cards (Credit + Checking)
async function renderCards() {
  const creditCardEl = document.getElementById("card-credit")
  const checkingCardEl = document.getElementById("card-savings")
  const panelEl = (creditCardEl || checkingCardEl) ? (creditCardEl || checkingCardEl).closest("section") : null

  const ccMaskEl = $("cc-mask")
  const ccBalEl = $("cc-balance")
  const ccLastEl = $("cc-last")
  const ccSpendEl = $("cc-spend")
  const ccStatusEl = $("cc-status")

  const svMaskEl = $("sv-mask")
  const svBalEl = $("sv-balance")
  const svLastEl = $("sv-last")
  const svSpendEl = $("sv-spend")
  const svStatusEl = $("sv-status")

  let hasChecking = false
  let hasCredit = false

  try {
    const rows = await apiFetch("/api/accounts")
    const list = Array.isArray(rows) ? rows : (rows && Array.isArray(rows.accounts) ? rows.accounts : [])

    for (const a of list) {
      if (!a) continue
      const type = normalizeCat(a.accountType || a.account_type || "")
      const status = normalizeCat(a.status || "disconnected")
      if (status !== "connected") continue
      if (type === "checking") hasChecking = true
      if (type === "credit") hasCredit = true
    }
  } catch (_) {}

  if (checkingCardEl) checkingCardEl.style.display = hasChecking ? "" : "none"
  if (creditCardEl) creditCardEl.style.display = hasCredit ? "" : "none"
  if (panelEl) panelEl.style.display = (hasChecking || hasCredit) ? "" : "none"

  if (!hasChecking && !hasCredit) return

  let data = null
  try {
    data = await apiFetch("/api/budgets/cards")
  } catch (err) {
    console.error("Budgets: failed to load card summaries:", err.message)
    data = null
  }

  const rows2 = Array.isArray(data) ? data : (data && Array.isArray(data.cards) ? data.cards : [])
  const pick = (type) => rows2.find(r => normalizeCat(r.accountType) === type) || {}

  const credit = pick("credit")
  const checking = pick("checking")

  const creditLast4 = credit.last4 ?? credit.accountLast4 ?? credit.account_number_last4 ?? null
  const checkingLast4 = checking.last4 ?? checking.accountLast4 ?? checking.account_number_last4 ?? null

  const rawCreditBalance = asNumber(credit.currentBalance ?? credit.balance ?? credit.amount ?? 0, 0)
  const rawCheckingBalance = asNumber(checking.currentBalance ?? checking.balance ?? checking.amount ?? 0, 0)

  const creditBalance = Math.abs(rawCreditBalance)
  const checkingBalance = rawCheckingBalance

  const creditMonthlyBackend = asNumber(credit.monthlySpend ?? credit.monthly_spend ?? credit.monthlySpending ?? 0, 0)
  const checkingMonthlyBackend = asNumber(checking.monthlySpend ?? checking.monthly_spend ?? checking.monthlySpending ?? 0, 0)

  const monthTx = txThisMonth()

  const creditMonthlyFallback = monthTx
    .filter(t => normalizeCat(t.accountType) === "credit" && t.type === "expense")
    .reduce((s, t) => s + Math.abs(asNumber(t.amount, 0)), 0)

  const checkingMonthlyFallback = monthTx
    .filter(t => normalizeCat(t.accountType) === "checking" && t.type === "expense")
    .reduce((s, t) => s + Math.abs(asNumber(t.amount, 0)), 0)

  const creditMonthly = creditMonthlyBackend || creditMonthlyFallback
  const checkingMonthly = checkingMonthlyBackend || checkingMonthlyFallback

  if (hasCredit) {
    if (ccMaskEl) ccMaskEl.textContent = creditLast4 ? `Credit •••• ${creditLast4}` : "Credit •••• —"
    if (ccBalEl) ccBalEl.textContent = fmt.format(creditBalance)
    if (ccSpendEl) ccSpendEl.textContent = fmt.format(asNumber(creditMonthly, 0))
    if (ccLastEl) ccLastEl.textContent = credit.lastTxnAt ?? credit.lastTxn ?? credit.lastTransaction ?? "—"
  }

  if (hasChecking) {
    if (svMaskEl) svMaskEl.textContent = checkingLast4 ? `Checking •••• ${checkingLast4}` : "Checking •••• —"
    if (svBalEl) svBalEl.textContent = fmt.format(checkingBalance)
    if (svSpendEl) svSpendEl.textContent = fmt.format(asNumber(checkingMonthly, 0))
    if (svLastEl) svLastEl.textContent = checking.lastTxnAt ?? checking.lastTxn ?? checking.lastTransaction ?? "—"
  }

  if (hasCredit && ccStatusEl) {
    const levelFromApi = normalizeCat(credit.statusLevel)
    const bal = asNumber(creditBalance, 0)

    let level = levelFromApi || "good"
    if (!levelFromApi) {
      if (bal > 9000) level = "critical"
      else if (bal > 6000) level = "warn"
      else level = "good"
    }

    let ccClass = "badge-cc-good"
    let ccText = "Healthy spending"
    if (level === "warn" || level === "low") {
      ccClass = "badge-cc-warn"
      ccText = "Elevated spending"
    } else if (level === "critical" || level === "bad") {
      ccClass = "badge-cc-critical"
      ccText = "High debt"
    }

    ccStatusEl.textContent = ccText.toUpperCase()
    ccStatusEl.className = `status-pill ${ccClass}`
  }

  if (hasChecking && svStatusEl) {
    const levelFromApi = normalizeCat(checking.statusLevel)
    const bal = asNumber(checkingBalance, 0)

    let level = levelFromApi || "good"
    if (!levelFromApi) {
      if (bal < 0) level = "critical"
      else if (bal < 2000) level = "low"
      else level = "good"
    }

    let cls = "badge-chk-good"
    let text = "Healthy balance"
    if (level === "low" || level === "warn") {
      cls = "badge-chk-low"
      text = "Low balance"
    } else if (level === "critical" || level === "bad") {
      cls = "badge-chk-critical"
      text = "Very low balance"
    }

    svStatusEl.textContent = text.toUpperCase()
    svStatusEl.className = `status-pill ${cls}`
  }
}

  function renderAll() {
    renderKPIs()
    renderSummary()
    renderTable()
    renderCards().catch(() => {})
  }

  // ──────────────────────────────────────────────────────────────
  // Modals
  // ──────────────────────────────────────────────────────────────

  function attachDismiss(dlg) {
    if (!dlg) return
    if (dlg.dataset.dismissWired === "1") return
    dlg.dataset.dismissWired = "1"

    const clickAway = e => {
      if (!e.target.closest(".modal-surface")) dlg.close()
    }

    const onCancel = e => {
      e.preventDefault()
      dlg.close()
    }

    dlg.addEventListener("click", clickAway)
    dlg.addEventListener("cancel", onCancel)
  }

  function openEditModal(b) {
    const dlg = $("budget-modal")
    const idEl = $("bud-id")
    const catEl = $("bud-category")
    const limEl = $("bud-limit")
    const titleEl = $("bud-modal-title")

    if (idEl) idEl.value = String(b.id)
    if (catEl) catEl.value = b.category
    if (limEl) limEl.value = asNumber(b.limit, 0) > 0 ? String(asNumber(b.limit, 0)) : ""

    if (limEl) {
      const locked = !!b.limitsLocked
      limEl.disabled = locked
      limEl.required = !locked
    }

    if (titleEl) titleEl.textContent = b.limitsLocked ? "Budget Locked" : "Edit Budget"

    if (dlg) {
      dlg.showModal()
      attachDismiss(dlg)
    }
  }

async function openManageModal() {
  const list = $("manage-list")
  const dlg = $("manage-modal")
  if (!list || !dlg) return

  await loadTransactions()
  state.currentMonthKey = monthKey()

  const now = new Date()
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevYear = prevDate.getFullYear()
  const prevMonth = prevDate.getMonth() + 1

  const prevLimitMap = new Map()
  try {
    const prevRows = await apiFetch(`/api/budgets/${prevYear}/${prevMonth}`)
    if (Array.isArray(prevRows)) {
      prevRows.forEach(r => {
        const cat = String(r.category || "")
        const key = normalizeCat(cat)
        const lim = asNumber(r.monthlyLimit ?? r.monthly_limit ?? 0, 0)
        if (key && lim > 0) prevLimitMap.set(key, lim)
      })
    }
  } catch {}

  const monthRows = txThisMonth()

  const cats = Array.from(
    new Set(
      monthRows
        .filter(t => t.type !== "income")
        .map(t => normalizeCat(t.category))
        .filter(Boolean)
    )
  ).sort()

  const map = new Map(state.budgets.map(b => [normalizeCat(b.ncat || b.category), b]))

  if (!cats.length) {
    list.innerHTML = `<div class="panel-sub">No categories found for this month yet. Add transactions in Activity first.</div>`
    dlg.showModal()
    attachDismiss(dlg)
    return
  }

  list.innerHTML = cats
    .map(n => {
      const rec = map.get(n)
      const on = !!(rec ? rec.enabled : false)
      const label = rec?.category || titleCase(n)
      return `
        <div class="manage-row" data-n="${n}">
          <div class="manage-left">
            <div class="cat-dot" style="width:28px;height:28px">
              <i class="${ICON}"></i>
            </div>
            <div class="bank-name" style="font-size:14px">${label}</div>
          </div>
          <button class="toggle" aria-pressed="${on}">
            <span class="knob"></span>
          </button>
        </div>
      `
    })
    .join("")

  list.querySelectorAll(".toggle").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".manage-row")
      if (!row) return

      const n = normalizeCat(row.dataset.n)
      if (!n) return

      const pressed = btn.getAttribute("aria-pressed") === "true"
      const newEnabled = !pressed
      btn.setAttribute("aria-pressed", String(newEnabled))

      const idx = state.budgets.findIndex(b => normalizeCat(b.ncat || b.category) === n)
      const prevRec = idx >= 0 ? { ...state.budgets[idx] } : null

      const label = prevRec?.category || titleCase(n)
      const carryLimit = prevRec ? asNumber(prevRec.limit, 0) : asNumber(prevLimitMap.get(n) || 0, 0)
      const limit = carryLimit > 0 ? carryLimit : 0

      if (idx >= 0) {
        state.budgets[idx] = { ...state.budgets[idx], enabled: newEnabled, category: label, ncat: n, limit }
      } else {
        state.budgets.push({
          id: `tmp-${n}`,
          category: label,
          ncat: n,
          enabled: newEnabled,
          limit,
          limitsLocked: false
        })
      }

      saveBudgets()
      renderSummary()
      renderTable()

      try {
        const rows2 = await apiToggleCategory(label, newEnabled)
        applyServerBudgets(rows2)

        if (newEnabled) {
          const prevLim = asNumber(prevLimitMap.get(n) || 0, 0)
          if (prevLim > 0) {
            const cur = state.budgets.find(b => normalizeCat(b.ncat || b.category) === n)
            if (cur && asNumber(cur.limit, 0) <= 0.01) {
              try {
                const rows3 = await apiSetLimit(cur.category, prevLim)
                applyServerBudgets(rows3)
              } catch {}
            }
          }
        }
      } catch (err) {
        console.error("Budgets: toggle category failed:", err.message)

        btn.setAttribute("aria-pressed", String(pressed))

        if (prevRec) {
          const i2 = state.budgets.findIndex(b => normalizeCat(b.ncat || b.category) === n)
          if (i2 >= 0) state.budgets[i2] = prevRec
        } else {
          state.budgets = state.budgets.filter(b => normalizeCat(b.ncat || b.category) !== n)
        }

        saveBudgets()
        renderSummary()
        renderTable()

        alert("Failed to update budget category: " + err.message)
      }
    })
  })

  dlg.showModal()
  attachDismiss(dlg)
}


  function openTxListModal(ncat) {
    const dlg = $("txlist-modal")
    if (!dlg) return

    const keyRaw = normalizeCat(ncat)
    const altKeys = new Set([keyRaw])

    if (keyRaw === "savings goal" || keyRaw === "saving goal") {
      altKeys.add("savings")
      altKeys.add("saving")
    }

    const matchesCategory = cat => {
      const c = normalizeCat(cat)
      if (!c || !keyRaw) return false
      if (altKeys.has(c)) return true
      if (c === keyRaw) return true
      if (c.includes(keyRaw) || keyRaw.includes(c)) return true
      return false
    }

    const niceName = keyRaw ? titleCase(keyRaw) : "Category"
    const titleEl = $("txlist-title")
    if (titleEl) titleEl.textContent = niceName

    let rows = txThisMonth().filter(t => matchesCategory(t.category))
    if (!rows.length && Array.isArray(state.txAll)) rows = state.txAll.filter(t => matchesCategory(t.category))

    rows = rows.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))

    const total = rows.reduce((sum, t) => sum + Math.abs(asNumber(t.amount, 0)), 0)

    const sumEl = $("txlist-summary")
    if (sumEl) {
      sumEl.innerHTML =
        `Transactions: <strong>${rows.length}</strong> • ` +
        `Total Activity: <strong>${fmt.format(total)}</strong>`
    }

    const container = $("txlist-rows")
    if (!container) {
      dlg.showModal()
      attachDismiss(dlg)
      return
    }

    if (!rows.length) {
      container.innerHTML = `<div class="panel-sub">No transactions found for this category</div>`
    } else {
      container.innerHTML = rows
        .map(t => {
          const dateLabel = t.date ? fmtDate.format(parseISO(t.date)) : "—"
          const merchantLabel = t.merchant || "—"
          const categoryLabel = t.category || ""
          const isExpense = t.type === "expense"
          const sign = isExpense ? "-" : "+"
          const amountValue = Math.abs(asNumber(t.amount, 0))
          const amountLabel = `${sign}${fmt.format(amountValue)}`
          return `
            <div class="txrow">
              <div class="tx-date">${dateLabel}</div>
              <div class="tx-merchant">${merchantLabel}</div>
              <div class="tx-category">${categoryLabel}</div>
              <div class="tx-amount">${amountLabel}</div>
            </div>
          `
        })
        .join("")
    }

    dlg.showModal()
    attachDismiss(dlg)
  }

  // ──────────────────────────────────────────────────────────────
  // Ticker and lifecycle
  // ──────────────────────────────────────────────────────────────

  let ticker = null

  function startTicker() {
    const el = $("month-countdown")
    if (!el) return

    const tick = async () => {
      el.textContent = nextMonthCountdown()

      const mk = monthKey()
      if (mk !== state.currentMonthKey) {
        state.currentMonthKey = mk
        await Promise.all([loadTransactions(), loadBudgetsFromServer()])
        renderAll()
      }
    }

    tick()
    clearInterval(ticker)
    ticker = setInterval(tick, 1000)
  }

  function init() {
    state.currentMonthKey = monthKey()

    $("bud-manage-btn")?.addEventListener("click", openManageModal)
    $("manage-close")?.addEventListener("click", () => $("manage-modal")?.close())
    $("manage-done")?.addEventListener("click", () => $("manage-modal")?.close())

    $("bud-modal-close")?.addEventListener("click", () => $("budget-modal")?.close())
    $("bud-cancel")?.addEventListener("click", () => $("budget-modal")?.close())

    $("bud-form")?.addEventListener("submit", async e => {
      e.preventDefault()

      const id = $("bud-id")?.value || ""
      const limEl = $("bud-limit")
      if (limEl && limEl.disabled) {
        $("budget-modal")?.close()
        return
      }

      const limRaw = Number($("bud-limit")?.value || 0)
      const lim = Number.isFinite(limRaw) && limRaw >= 0 ? limRaw : 0

      const recIdx = state.budgets.findIndex(b => String(b.id) === String(id))
      const rec = recIdx >= 0 ? state.budgets[recIdx] : null

      if (!rec) {
        $("budget-modal")?.close()
        return
      }

      const prev = { ...rec }
      state.budgets[recIdx] = { ...state.budgets[recIdx], limit: lim }

      saveBudgets()
      renderSummary()
      renderTable()

      try {
        const rows2 = await apiSetLimit(prev.category, lim)
        applyServerBudgets(rows2)
        $("budget-modal")?.close()
      } catch (err) {
        console.error("Budgets: save limit failed:", err.message)
        state.budgets[recIdx] = prev
        saveBudgets()
        renderSummary()
        renderTable()
        alert("Failed to save budget limit: " + err.message)
      }
    })

    $("txlist-close")?.addEventListener("click", () => $("txlist-modal")?.close())

    window.addEventListener("data:updated", async () => {
      await Promise.all([loadTransactions(), loadBudgetsFromServer()])
      renderAll()
    })

    window.addEventListener("section:mounted", e => {
      if (e.detail?.section === "budgets") mount()
    })

    window.addEventListener("section:ready", e => {
      if (e.detail?.section === "budgets") requestAnimationFrame(renderAll)
    })
  }

async function mount() {
  await Promise.all([loadTransactions(), loadBudgetsFromServer()])

  fetch("/api/rewards/trigger", {
    method: "POST",
    credentials: "include",
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ taskId: "visit-budgets" })
  }).catch(() => {})

  startTicker()
  renderAll()
}


  init()

  window.__budgets = {
    cleanup() {
      clearInterval(ticker)
    }
  }
})()
