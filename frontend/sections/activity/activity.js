(() => {
  if (window.__activity && typeof window.__activity.cleanup === "function") {
    window.__activity.cleanup();
  }

  const DAY_MS = 86400000;
  const $ = (id) => document.getElementById(id);

  const fmtMoney = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
  const fmtDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
  const fmtFullDate = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" });

  const toLocalISO = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const parseLocalISO = (iso) => new Date(`${iso}T00:00:00`);

  const catIcon = (category) => {
    const map = {
      groceries: "fas fa-shopping-cart",
      "food & dining": "fas fa-utensils",
      dining: "fas fa-utensils",
      transport: "fas fa-car",
      transportation: "fas fa-car",
      auto: "fas fa-car",
      utilities: "fas fa-lightbulb",
      housing: "fas fa-home",
      rent: "fas fa-home",
      entertainment: "fas fa-film",
      shopping: "fas fa-tshirt",
      health: "fas fa-heartbeat",
      travel: "fas fa-plane",
      education: "fas fa-graduation-cap",
      subscriptions: "fas fa-calendar-check",
      subscription: "fas fa-calendar-check",
      salary: "fas fa-money-bill-wave",
      freelance: "fas fa-briefcase",
      investment: "fas fa-chart-line",
      "savings goal": "fas fa-bullseye"
    };
    const key = (category || "default").toLowerCase();
    return map[key] || "fas fa-tag";
  };

  async function apiFetch(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    const res = await fetch(path, {
      ...options,
      headers,
      credentials: "include"
    });

    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try {
        const data = await res.json();
        if (data && data.error) msg = data.error;
      } catch {}
      throw new Error(msg);
    }

    const text = await res.text();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  let mounted = false;
  let chart = null;

const state = {
  all: [],
  reviewAll: [],
  filters: { from: null, to: null, category: "", type: "all", account: "all" },
  kpiRange: "month",
  currentPage: 1,
  perPage: 15,
  editingId: null,
  freedomBalances: null
};

 function normalizeTx(t, originFallback) {
  const date = (t.date || toLocalISO(new Date())).slice(0, 10);

  let time = t.time || "";
  if (time) time = time.slice(0, 5);

  let createdAt;
  if (typeof t.createdAt === "number") {
    createdAt = t.createdAt;
  } else if (typeof t.createdAt === "string") {
    const ts = Date.parse(t.createdAt);
    createdAt = Number.isNaN(ts) ? Date.parse(`${date}T${time || "12:00"}:00`) : ts;
  } else {
    createdAt = Date.parse(`${date}T${time || "12:00"}:00`) || Date.now();
  }

  const nowTs = Date.now();
  if (createdAt > nowTs) createdAt = nowTs;

  let sortTs = Date.parse(`${date}T${time || "00:00"}:00`);
  if (Number.isNaN(sortTs)) sortTs = createdAt;
  if (sortTs > nowTs) sortTs = nowTs;

  let id = t.id;
  if (id == null) id = `tx_${Math.random().toString(36).slice(2)}`;
  else id = String(id);

  let accountType = t.accountType || t.account_type || null;
  if (typeof accountType === "string") accountType = accountType.toLowerCase();

  return {
    id,
    date,
    time,
    merchant: t.merchant || "",
    category: t.category || "",
    type: t.type === "income" ? "income" : "expense",
    amount: Number(t.amount) || 0,
    origin: t.origin || originFallback || "manual",
    createdAt,
    sortTs,
    accountType
  };
}

async function loadAllTransactions() {
  const scope = String(state.filters.account || "all").toLowerCase().trim()

  let url = "/api/activity"
  if (scope === "checking") url = "/api/activity?accountType=checking&strict=1"
  else if (scope === "credit") url = "/api/activity?accountType=credit&strict=1"

  let data = null
  try {
    data = await apiFetch(url)
  } catch (_) {
    data = null
  }

  const items = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : [])

  const normalized = items.map((t) => normalizeTx(t)).filter(Boolean)

  // View dataset (what the table/KPIs use)
  if (scope === "all") {
    state.all = normalized.filter((t) => String(t.accountType || "").toLowerCase() !== "credit")
  } else {
    state.all = normalized
  }

  // Review dataset (always unscoped so manual "Add Transaction" rows appear even in Checking/Credit view)
  if (scope === "all") {
    state.reviewAll = state.all
  } else {
    try {
      const allData = await apiFetch("/api/activity")
      const allItems = Array.isArray(allData)
        ? allData
        : (allData && Array.isArray(allData.items) ? allData.items : [])
      state.reviewAll = allItems.map((t) => normalizeTx(t)).filter(Boolean)
    } catch (_) {
      state.reviewAll = state.all
    }
  }
}

async function createTx(tx) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const localTime = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const payload = {
    date: tx.date,
    time: (tx.time && String(tx.time).trim()) ? tx.time : localTime,
    merchant: tx.merchant,
    category: tx.category,
    type: tx.type,
    amount: tx.amount,
    origin: tx.origin || "manual"
  };

  const endpoints = ["/api/transactions", "/api/activity", "/api/activity/transactions"];

  let res = null;
  let lastErr = null;

  for (const url of endpoints) {
    try {
      res = await apiFetch(url, { method: "POST", body: JSON.stringify(payload) });
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (lastErr) throw lastErr;

  const raw = (res && res.transaction) ? res.transaction : (res || payload);
  const safe = normalizeTx(raw, payload.origin || "manual");

  state.all.unshift(safe);
  state.all.sort((a, b) => b.sortTs - a.sortTs);

  window.dispatchEvent(new CustomEvent("data:updated", { detail: { tx: safe } }));
}

async function updateTx(updated) {
  const payload = {
    date: updated.date,
    time: (updated.time && String(updated.time).trim()) ? updated.time : null,
    merchant: updated.merchant,
    category: updated.category,
    type: updated.type,
    amount: updated.amount,
    origin: updated.origin || "manual"
  };

  const endpoints = [
    `/api/transactions/${encodeURIComponent(updated.id)}`,
    `/api/activity/${encodeURIComponent(updated.id)}`,
    `/api/activity/transactions/${encodeURIComponent(updated.id)}`
  ];

  let res = null;
  let lastErr = null;

  for (const url of endpoints) {
    try {
      res = await apiFetch(url, { method: "PUT", body: JSON.stringify(payload) });
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (lastErr) throw lastErr;

  const raw = (res && res.transaction) ? res.transaction : (res || updated);
  const safe = normalizeTx(raw, payload.origin || "manual");

  const idx = state.all.findIndex((t) => t.id === safe.id);
  if (idx >= 0) state.all[idx] = safe;
  else state.all.unshift(safe);

  state.all.sort((a, b) => b.sortTs - a.sortTs);

  window.dispatchEvent(new CustomEvent("data:updated", { detail: { tx: safe } }));
}

async function deleteTx(id) {
  await apiFetch(`/api/transactions/${encodeURIComponent(id)}`, { method: "DELETE" })
  state.all = state.all.filter((t) => t.id !== id)
  window.dispatchEvent(new CustomEvent("data:updated", { detail: { deletedId: id } }))
}


function matches(tx) {
  const f = state.filters
  let from = null
  let to = null
  const now = new Date()

  if (state.kpiRange === "month") from = toLocalISO(new Date(now.getFullYear(), now.getMonth(), 1))
  else if (state.kpiRange === "year") from = toLocalISO(new Date(now.getFullYear(), 0, 1))
  else if (state.kpiRange === "custom") {
    from = f.from
    to = f.to
  }

  if (from && tx.date < from) return false
  if (to && tx.date > to) return false

  if (f.type !== "all" && tx.type !== f.type) return false
  if (f.category && (tx.category || "").toLowerCase() !== f.category.toLowerCase()) return false

  const acc = String(tx.accountType || "").toLowerCase().trim()
  const org = String(tx.origin || "").toLowerCase().trim()

  const isManualOrGoal = (org === "goal" || org === "user" || org === "manual")

  if (f.account === "all") {
    if (acc === "credit") return false
    return true
  }

  if (!acc) return false

  if (f.account === "checking") {
    if (acc !== "checking") return false
    if (isManualOrGoal) return false
    return true
  }

  if (f.account === "credit") {
    if (acc !== "credit") return false
    if (isManualOrGoal) return false
    return true
  }

  return true
}

  function groupByDay(rows) {
    return rows.reduce((acc, tx) => {
      const key = tx.date || "unknown";
      (acc[key] = acc[key] || []).push(tx);
      return acc;
    }, {});
  }

  function updateActiveLight() {
    const switcher = $("act-view-switcher");
    if (!switcher) return;
    const activeBtn = switcher.querySelector(".switcher-btn.active");
    const light = switcher.querySelector(".active-light");
    if (activeBtn && light) {
      light.style.left = `${activeBtn.offsetLeft}px`;
      light.style.width = `${activeBtn.offsetWidth}px`;
    }
  }

function renderKPIs() {
  const now = new Date();
  let rows = [...state.all];
  let label = "This Month";

  switch (state.kpiRange) {
    case "year": {
      const start = new Date(now.getFullYear(), 0, 1);
      rows = rows.filter((t) => parseLocalISO(t.date) >= start);
      label = "This Year";
      break;
    }
    case "overall":
      label = "Overall";
      break;
    case "custom": {
      rows = rows.filter((t) => {
        const fromOk = !state.filters.from || t.date >= state.filters.from;
        const toOk = !state.filters.to || t.date <= state.filters.to;
        return fromOk && toOk;
      });
      label = "Custom Range";
      break;
    }
    case "month":
    default: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      rows = rows.filter((t) => parseLocalISO(t.date) >= start);
      label = "This Month";
    }
  }

  const accKey = (state.filters.account || "all").toString().toLowerCase().trim();

  if (accKey && accKey !== "all") {
    rows = rows.filter((t) => {
      const acc = (t.accountType || "").toString().toLowerCase().trim();
      if (!acc) return false;
      if (accKey === "checking") return acc === "checking";
      if (accKey === "credit") return acc === "credit";
      return acc === accKey;
    });
  }

  const typeKey = (state.filters.type || "all").toString().toLowerCase().trim();
  if (typeKey && typeKey !== "all") {
    rows = rows.filter((t) => String(t.type || "").toLowerCase() === typeKey);
  }

  const income = Number(
    rows.filter((t) => t.type === "income").reduce((s, t) => s + (Number(t.amount) || 0), 0).toFixed(2)
  );
  const spent = Number(
    rows.filter((t) => t.type === "expense").reduce((s, t) => s + (Number(t.amount) || 0), 0).toFixed(2)
  );

  const net = Number((income - spent).toFixed(2));

  let balanceValue = 0;
  let balanceLabel = "Available Balance";
  let incomeLabel = "Income";
  const expensesLabel = "Expenses";

  const chkBal =
    state.freedomBalances && Number.isFinite(Number(state.freedomBalances.checkingBalance))
      ? Number(state.freedomBalances.checkingBalance)
      : 0;

  const ccBal =
    state.freedomBalances && Number.isFinite(Number(state.freedomBalances.creditBalance))
      ? Number(state.freedomBalances.creditBalance)
      : 0;

  const allBal =
    state.freedomBalances && Number.isFinite(Number(state.freedomBalances.allBalance))
      ? Number(state.freedomBalances.allBalance)
      : chkBal;

  if (accKey === "credit") {
    balanceLabel = "Credit Card Debt";
    incomeLabel = "Payments";
    balanceValue = Math.abs(Math.min(0, ccBal));
  } else if (accKey === "checking") {
    balanceLabel = "Available Balance";
    balanceValue = Math.max(0, chkBal);
  } else {
    balanceLabel = "Available Balance";
    balanceValue = allBal;
  }

  const balLabelEl = document.querySelector(".kpi.balance .label");
  if (balLabelEl) balLabelEl.textContent = balanceLabel;

  $("act-balance").textContent = fmtMoney.format(balanceValue);
  $("act-total-income").textContent = fmtMoney.format(income);
  $("act-total-spent").textContent = fmtMoney.format(spent);
  $("act-net").textContent = fmtMoney.format(net);

  $("kpi-income-label").textContent = `${incomeLabel} (${label})`;
  $("kpi-spent-label").textContent = `${expensesLabel} (${label})`;
  $("kpi-net-label").textContent = `Net Change (${label})`;
}

  function renderChart() {
    const canvas = $("spending-chart");
    if (!canvas) return;

    if (chart) {
      try { chart.destroy(); } catch {}
      chart = null;
    }

    const f = state.filters || {};

    const matchesForChart = (tx) => {
      let from = null;
      let to = null;
      const now = new Date();

      if (state.kpiRange === "month") from = toLocalISO(new Date(now.getFullYear(), now.getMonth(), 1));
      else if (state.kpiRange === "year") from = toLocalISO(new Date(now.getFullYear(), 0, 1));
      else if (state.kpiRange === "custom") { from = f.from; to = f.to; }

      if (from && tx.date < from) return false;
      if (to && tx.date > to) return false;

      if (f.category && (tx.category || "").toLowerCase() !== f.category.toLowerCase()) return false;

      if (f.account && f.account !== "all") {
        const acc = (tx.accountType || "").toString().toLowerCase().trim();
        if (!acc) return false;
        if (f.account === "checking" && acc !== "checking") return false;
        if (f.account === "credit" && acc !== "credit") return false;
      }

      return true;
    };

    const base = state.all.filter(matchesForChart);

    const byCat = base
      .filter((t) => t.type === "expense")
      .reduce((acc, t) => {
        const c = (t.category || "Other").trim() || "Other";
        const amt = Math.abs(Number(t.amount) || 0);
        if (!(amt > 0)) return acc;
        acc[c] = (acc[c] || 0) + amt;
        return acc;
      }, {});

    const labels = Object.keys(byCat);
    const data = Object.values(byCat);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!labels.length) {
      const w = canvas.width || canvas.clientWidth || 1;
      const h = canvas.height || canvas.clientHeight || 1;
      ctx.clearRect(0, 0, w, h);
      return;
    }

    chart = new Chart(ctx, {
      type: "doughnut",
      data: { labels, datasets: [{ data }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { position: "bottom" } }
      }
    });

    try { chart.resize(); } catch {}
    try { chart.update("none"); } catch {}
  }

  function renderTimeline() {
    const host = $("act-timeline");
    const loadMoreBox = $("load-more-container");
    if (!host || !loadMoreBox) return;

    const filtered = state.all.filter(matches);
    const limit = state.currentPage * state.perPage;
    const rows = filtered.slice(0, limit);

    loadMoreBox.style.display = rows.length < filtered.length ? "block" : "none";

    if (!rows.length) {
      host.innerHTML = `<div class="empty">No transactions found.</div>`;
      return;
    }

    const grouped = groupByDay(rows);
    const daysDesc = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

    host.innerHTML = daysDesc
      .map((iso) => {
        const items = grouped[iso].slice().sort((a, b) => b.sortTs - a.sortTs);
        return `
          <div class="day-group">
            <div class="day-header">${fmtFullDate.format(parseLocalISO(iso))}</div>
            ${items
              .map((tx) => {
                const timePart = tx.time ? " " + tx.time.slice(0, 5) : "";
                const acc = (tx.accountType || "").toLowerCase();
                let accountText = "";
                if (tx.origin === "freedom_bank") {
                  if (acc === "credit") accountText = " · Credit Card";
                  else if (acc === "checking") accountText = " · Checking Account";
                }
                return `
                  <div class="tx-row">
                    <div class="tx-icon"><i class="${catIcon(tx.category)}"></i></div>
                    <div class="tx-details">
                      <div class="merchant">${tx.merchant || "N/A"}</div>
                      <div class="category">${tx.category || "Uncategorized"}${accountText}</div>
                    </div>
                    <div class="tx-amount">
                      <div class="amount ${tx.type}">${tx.type === "income" ? "+" : "-"}${fmtMoney.format(tx.amount)}</div>
                      <div class="date">${fmtDate.format(parseLocalISO(tx.date))}${timePart}</div>
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        `;
      })
      .join("");
  }

  const render = () => {
    renderKPIs();
    renderChart();
    renderTimeline();
  };

  let recentTimerInterval = null;

  function startRecentCountdownLoop() {
    if (recentTimerInterval) {
      clearInterval(recentTimerInterval);
      recentTimerInterval = null;
    }

    function updateAll() {
      const now = Date.now();
      document.querySelectorAll("#review-list .recent-timer").forEach((el) => {
        const expiresMs = Number(el.dataset.expires || 0);
        if (!expiresMs) return;

        const diff = expiresMs - now;
        if (diff <= 0) {
          el.textContent = "expired";
          el.classList.add("expired");
          return;
        }

        const totalMinutes = Math.floor(diff / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        if (hours > 0) el.textContent = `${hours}h ${minutes}m left`;
        else el.textContent = `${minutes}m left`;
      });
    }

    updateAll();
    recentTimerInterval = setInterval(updateAll, 30000);
  }

function buildReviewModal() {
  const list = $("review-list");
  const empty = $("review-empty");
  if (!list) return;

  const cutoff = Date.now() - DAY_MS;

const source = Array.isArray(state.reviewAll) && state.reviewAll.length ? state.reviewAll : state.all;
const recent = source

    .filter((tx) => {
      const origin = (tx.origin || "").toLowerCase();

      // Keep excluding system samples and imported Freedom data from "Recent"
      if (origin === "sample" || origin === "freedom_bank") return false;

      // Must have a createdAt and be within last 24 hours
      if (typeof tx.createdAt !== "number") return false;
      if (tx.createdAt < cutoff) return false;

      // Exclude goals
      if (origin === "goal" || origin === "goals") return false;

      const cat = (tx.category || "").trim().toLowerCase();
      const merch = (tx.merchant || "").trim().toLowerCase();

      const isAutoDepositGoal = merch.startsWith("auto deposit:");
      const isManualDepositGoal = merch.startsWith("manual deposit:");
 
// Only hide goal-savings style items when they are actually goal-origin.
// Manual "Add Transaction" rows are origin='user' and must remain visible.
const looksLikeGoalSavings =
  origin === "goal" &&
  (cat === "savings goal" ||
    merch.startsWith("auto deposit:") ||
    merch.startsWith("manual deposit:"));

if (looksLikeGoalSavings) return false;


      return true;
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  if (!recent.length) {
    list.innerHTML = "";
    if (empty) empty.style.display = "block";

    if (recentTimerInterval) {
      clearInterval(recentTimerInterval);
      recentTimerInterval = null;
    }
    return;
  }

  if (empty) empty.style.display = "none";

  list.innerHTML = recent
    .map((tx) => {
      const timePart = tx.time ? " " + tx.time.slice(0, 5) : "";
      const when = `${fmtFullDate.format(parseLocalISO(tx.date))}${timePart}`;
      const catLabel = tx.category || "Uncategorized";
      const amount = `${tx.type === "income" ? "+" : "-"}${fmtMoney.format(tx.amount)}`;
      const expires = (typeof tx.createdAt === "number" ? tx.createdAt : Date.now()) + DAY_MS;

      return `
        <div class="recent-item" data-id="${tx.id}">
          <div class="recent-main">
            <div class="recent-merchant">${tx.merchant || "N/A"}</div>
            <div class="recent-meta">${catLabel} ${when}</div>
          </div>
          <div class="recent-right">
            <div class="recent-amount ${tx.type}">${amount}</div>
            <div class="recent-actions">
              <button type="button" class="btn-small edit">Edit</button>
              <button type="button" class="btn-small delete">Delete</button>
            </div>
            <div class="recent-timer" data-expires="${expires}"></div>
          </div>
        </div>
      `;
    })
    .join("");

  startRecentCountdownLoop();
}


  function openReviewModal() {
    const modal = $("review-modal");
    if (!modal) return;
    buildReviewModal();
    if (!modal.open) modal.showModal();
  }

  async function onReviewClick(e) {
    const row = e.target.closest(".recent-item");
    if (!row) return;

    const id = row.dataset.id;
    const tx = state.all.find((t) => t.id === id);
    if (!tx) return;

    if (e.target.closest(".delete")) {
      try {
        await deleteTx(id);
      } catch (err) {
        console.error("Delete failed:", err.message);
      }
      render();
      buildReviewModal();
      return;
    }

    if (e.target.closest(".edit")) {
      const reviewDialog = $("review-modal");
      if (reviewDialog && reviewDialog.open) reviewDialog.close();
      startEditTransaction(tx);
    }
  }

  function onAddOpen() {
    state.editingId = null;

    const todayIso = toLocalISO(new Date());

    $("add-date").value = todayIso;
    $("add-time").value = "";
    $("add-type").value = "expense";
    $("add-merchant").value = "";
    $("add-category").value = "";
    $("add-amount").value = "";

    const titleEl = $("add-modal-title");
    const submitEl = $("add-submit-label");
    if (titleEl) titleEl.textContent = "Add Transaction";
    if (submitEl) submitEl.textContent = "Save Transaction";

    $("add-modal")?.showModal();
  }

  function startEditTransaction(tx) {
    state.editingId = tx.id;

    $("add-date").value = tx.date || toLocalISO(new Date());
    $("add-time").value = tx.time || "";
    $("add-type").value = tx.type || "expense";
    $("add-merchant").value = tx.merchant || "";
    $("add-category").value = tx.category || "";
    $("add-amount").value = tx.amount != null ? tx.amount : "";

    const tabs = $("add-modal")?.querySelector(".modal-tabs");
    if (tabs) {
      tabs.querySelector(".tab-btn.active")?.classList.remove("active");
      tabs.querySelector('[data-tab="manual"]')?.classList.add("active");
    }
    $("ai-content").style.display = "none";
    $("manual-content").style.display = "block";

    const titleEl = $("add-modal-title");
    const submitEl = $("add-submit-label");
    if (titleEl) titleEl.textContent = "Edit Transaction";
    if (submitEl) submitEl.textContent = "Update Transaction";

    $("add-modal")?.showModal();
  }

  function showBalanceWarning(message) {
    const modal = $("balance-warning-modal");
    if (!modal) {
      window.alert(message);
      return;
    }
    const textEl = $("balance-warning-text");
    if (textEl) textEl.textContent = message;
    modal.showModal();
  }

async function onAddSubmit(e) {
  e.preventDefault();

  const base = {
    id: state.editingId || null,
    date: $("add-date").value || toLocalISO(new Date()),
    time: $("add-time").value || "",
    merchant: $("add-merchant").value,
    category: $("add-category").value || "Other",
    type: $("add-type").value,
    amount: Number($("add-amount").value)
  };

  if (!(base.amount > 0)) return;

  const accKey = (state.filters.account || "all").toString().toLowerCase().trim();
  const enforceNoNegative = accKey !== "credit";

  if (enforceNoNegative && base.type === "expense") {
    const relevant = state.all.filter((t) => {
      if (accKey === "checking") return (t.accountType || "").toLowerCase() === "checking";
      if (accKey === "all") return true;
      return true;
    });

    const currentCash = relevant.reduce(
      (sum, t) => sum + (t.type === "income" ? t.amount : -t.amount),
      0
    );

    let availableCash = Math.max(0, currentCash);

    if (state.editingId) {
      const prev = state.all.find((t) => t.id === state.editingId);
      if (prev) {
        const prevDelta = prev.type === "income" ? prev.amount : -prev.amount;
        availableCash = Math.max(0, availableCash - prevDelta);
      }
    }

    const projected = availableCash - base.amount;
    if (projected < 0) {
      showBalanceWarning("You cannot add an expense larger than your available balance.");
      return;
    }
  }

  try {
    if (state.editingId) {
      const prev = state.all.find((t) => t.id === state.editingId);
      const updated = {
        ...prev,
        ...base,
        id: prev.id,
        origin: prev.origin || "manual",
        createdAt: prev.createdAt || Date.now()
      };
      await updateTx(updated);
    } else {
      await createTx(base);
    }
  } catch (err) {
    console.error("Save transaction failed:", err.message);
    window.alert(`Save transaction failed: ${err.message}`);
    return;
  }

  state.editingId = null;
  render();
  $("add-modal")?.close();
  buildReviewModal();
}

  function resetPagingAndRender() {
    state.currentPage = 1;
    renderTimeline();
  }

  function onViewSwitch(e) {
    const btn = e.target.closest(".switcher-btn");
    if (!btn) return;
    const wrap = btn.parentElement;
    wrap.querySelector(".active")?.classList.remove("active");
    btn.classList.add("active");
    state.filters.type = btn.dataset.type || "all";
    updateActiveLight();
    resetPagingAndRender();
  }

  function onFilterOpen() {
    $("flt-from").value = state.filters.from || "";
    $("flt-to").value = state.filters.to || "";
    $("flt-category").value = state.filters.category || "";
    $("flt-type").value = state.filters.type || "all";

    const hiddenAcc = $("flt-account");
    if (hiddenAcc) hiddenAcc.value = state.filters.account || "all";
    const group = document.getElementById("flt-account-group");
    if (group) {
      const current = hiddenAcc ? hiddenAcc.value : "all";
      group.querySelectorAll(".chip-btn").forEach((btn) => {
        const val = btn.dataset.account || "all";
        btn.classList.toggle("active", val === current);
      });
    }

    $("filter-modal")?.showModal();
  }

async function onFilterApply(e) {
  e.preventDefault()

  state.filters.from = $("flt-from").value || null
  state.filters.to = $("flt-to").value || null
  state.filters.category = $("flt-category").value.trim()
  state.filters.type = $("flt-type").value || "all"
  state.filters.account = $("flt-account")?.value || "all"

  await loadAllTransactions()
  await loadFreedomBalances()

  document.querySelectorAll(".kpi-range-switcher .range-btn").forEach((b) => b.classList.remove("active"))
  if (state.filters.from || state.filters.to) {
    state.kpiRange = "custom"
  } else {
    state.kpiRange = "month"
    document.querySelector('.kpi-range-switcher [data-range="month"]')?.classList.add("active")
  }

  const s = $("act-view-switcher")
  if (s) {
    s.querySelector(".active")?.classList.remove("active")
    s.querySelector(`[data-type="${state.filters.type}"]`)?.classList.add("active")
    updateActiveLight()
  }

  state.currentPage = 1
  render()
  $("filter-modal")?.close()
}


async function onFilterReset(e) {
  e?.preventDefault()

  state.filters = { from: null, to: null, category: "", type: "all", account: "all" }
  state.kpiRange = "month"

  await loadAllTransactions()
  await loadFreedomBalances()

  document.querySelectorAll(".kpi-range-switcher .range-btn").forEach((b) => b.classList.remove("active"))
  document.querySelector('.kpi-range-switcher [data-range="month"]')?.classList.add("active")

  const s = $("act-view-switcher")
  if (s) {
    s.querySelector(".active")?.classList.remove("active")
    s.querySelector(`[data-type="all"]`)?.classList.add("active")
    updateActiveLight()
  }

  state.currentPage = 1
  render()
  $("filter-modal")?.close()
}


  function onAccountChipClick(e) {
    const btn = e.target.closest(".chip-btn");
    if (!btn) return;
    const group = btn.parentElement;
    group.querySelectorAll(".chip-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const val = btn.dataset.account || "all";
    const hidden = $("flt-account");
    if (hidden) hidden.value = val;
  }

  function onLoadMore() {
    state.currentPage += 1;
    renderTimeline();
  }

  function onKpiRangeClick(e) {
    const btn = e.target.closest(".range-btn");
    if (!btn) return;
    state.kpiRange = btn.dataset.range || "month";
    if (state.kpiRange !== "custom") {
      state.filters.from = null;
      state.filters.to = null;
    }
    btn.parentElement.querySelectorAll(".active").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.currentPage = 1;
    render();
  }

  function onTabSwitch(e) {
    const tab = e.target.closest(".tab-btn");
    if (!tab) return;
    const target = tab.dataset.tab;
    tab.parentElement.querySelector(".active")?.classList.remove("active");
    tab.classList.add("active");
    $("ai-content").style.display = "none";
    $("manual-content").style.display = "none";
    $(`${target}-content`).style.display = "block";
  }

  function onSendMessage() {
    const input = $("chat-input");
    const text = input.value.trim();
    if (!text) return;
    addMessage("user", text);
    input.value = "";
    showTyping();
    setTimeout(() => {
      hideTyping();
      addMessage("ai", "Thanks! A connected AI would extract the data and add it to your transactions.");
    }, 900);
  }

  function addMessage(sender, text) {
    const wrap = $("chat-window");
    const el = document.createElement("div");
    el.className = `chat-message ${sender}-message`;
    el.innerHTML = `<div class="message-bubble">${text}</div>`;
    wrap.appendChild(el);
    wrap.scrollTop = wrap.scrollHeight;
  }

  function showTyping() {
    const wrap = $("chat-window");
    const el = document.createElement("div");
    el.className = "chat-message ai-message typing-indicator";
    el.innerHTML = `<div class="message-bubble"><span></span><span></span><span></span></div>`;
    wrap.appendChild(el);
    wrap.scrollTop = wrap.scrollHeight;
  }

  function hideTyping() {
    $("chat-window").querySelector(".typing-indicator")?.remove();
  }

async function loadFreedomBalances() {
  const base = { allBalance: 0, checkingBalance: 0, creditBalance: 0 }

  try {
    const all = await apiFetch("/api/accounts/balances")
    const allBal = all && typeof all === "object" ? Number(all.allBalance ?? all.availableBalance ?? 0) : 0
    base.allBalance = Number.isFinite(allBal) ? allBal : 0
  } catch (_) {}

  // STRICT: checking card only, exclude goal/manual/user
  try {
    const chk = await apiFetch("/api/accounts/balances/account?accountType=checking&strict=1")
    const chkBal = chk && typeof chk === "object" ? Number(chk.balance ?? 0) : 0
    base.checkingBalance = Number.isFinite(chkBal) ? chkBal : 0
  } catch (_) {}

  // STRICT: credit card only, exclude goal/manual/user
  try {
    const cc = await apiFetch("/api/accounts/balances/account?accountType=credit&strict=1")
    const ccBal = cc && typeof cc === "object" ? Number(cc.balance ?? 0) : 0
    base.creditBalance = Number.isFinite(ccBal) ? ccBal : 0
  } catch (_) {}

  state.freedomBalances = base
}

  
  async function mount() {
    if (mounted) return;
    mounted = true;

    await loadAllTransactions();
    await loadFreedomBalances();

    $("act-add")?.addEventListener("click", onAddOpen);
    $("act-filter")?.addEventListener("click", onFilterOpen);
    $("act-review")?.addEventListener("click", openReviewModal);
    $("act-view-switcher")?.addEventListener("click", onViewSwitch);
    $("load-more-btn")?.addEventListener("click", onLoadMore);
    document.querySelector(".kpi-range-switcher")?.addEventListener("click", onKpiRangeClick);

    $("add-form")?.addEventListener("submit", onAddSubmit);
    $("add-cancel")?.addEventListener("click", () => $("add-modal")?.close());
    $("add-close")?.addEventListener("click", () => $("add-modal")?.close());
    $("add-modal")?.querySelector(".modal-tabs")?.addEventListener("click", onTabSwitch);

    $("filter-form")?.addEventListener("submit", onFilterApply);
    $("filter-reset")?.addEventListener("click", onFilterReset);
    $("filter-close")?.addEventListener("click", () => $("filter-modal")?.close());
    document.getElementById("flt-account-group")?.addEventListener("click", onAccountChipClick);

    $("review-close")?.addEventListener("click", () => $("review-modal")?.close());
    $("review-list")?.addEventListener("click", onReviewClick);

    $("balance-warning-close")?.addEventListener("click", () => $("balance-warning-modal")?.close());
    $("balance-warning-ok")?.addEventListener("click", () => $("balance-warning-modal")?.close());
    document.getElementById("balance-warning-modal")?.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) e.currentTarget.close();
    });

    $("chat-send-btn")?.addEventListener("click", onSendMessage);
    $("chat-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") onSendMessage();
    });

    document.querySelectorAll(".activity-section .modal").forEach((m) =>
      m.addEventListener("click", (e) => {
        if (e.target === m) m.close();
      })
    );

    window.addEventListener("resize", updateActiveLight);

    const onDataUpdated = async () => {
    await loadAllTransactions();
    await loadFreedomBalances();
    render();
      buildReviewModal();

      requestAnimationFrame(() => {
        updateActiveLight();
        try { renderChart(); } catch {}
        try { chart?.resize?.(); } catch {}
        try { chart?.update?.("none"); } catch {}
      });

      setTimeout(() => {
        try { renderChart(); } catch {}
        try { chart?.resize?.(); } catch {}
        try { chart?.update?.("none"); } catch {}
        updateActiveLight();
      }, 140);
    };

    window.addEventListener("data:updated", onDataUpdated);

    const onSectionShow = (e) => {
      if (e?.detail?.section !== "activity") return;

      requestAnimationFrame(() => {
        updateActiveLight();
        renderTimeline();
        try { renderChart(); } catch {}
        try { chart?.resize?.(); } catch {}
        try { chart?.update?.("none"); } catch {}
      });

      setTimeout(() => {
        try { renderChart(); } catch {}
        try { chart?.resize?.(); } catch {}
        try { chart?.update?.("none"); } catch {}
        updateActiveLight();
      }, 140);
    };

    window.addEventListener("section:show", onSectionShow);

    updateActiveLight();
    render();

    requestAnimationFrame(() => {
      updateActiveLight();
      renderTimeline();
      try { renderChart(); } catch {}
      try { chart?.resize?.(); } catch {}
      try { chart?.update?.("none"); } catch {}
    });

    setTimeout(() => {
      updateActiveLight();
      try { renderChart(); } catch {}
      try { chart?.resize?.(); } catch {}
      try { chart?.update?.("none"); } catch {}
    }, 120);

    window.__activity = {
      cleanup() {
        window.removeEventListener("data:updated", onDataUpdated);
        window.removeEventListener("resize", updateActiveLight);
        window.removeEventListener("section:show", onSectionShow);

        try { chart?.destroy?.(); } catch {}
        chart = null;

        if (recentTimerInterval) {
          clearInterval(recentTimerInterval);
          recentTimerInterval = null;
        }

        mounted = false;
      }
    };
  }

  if (document.querySelector(".activity-section")) {
    mount();
  } else {
    window.addEventListener("section:mounted", (e) => {
      if (e.detail?.section === "activity") mount();
    });
  }
})();