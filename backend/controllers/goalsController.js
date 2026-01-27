// =============================================================
// START REPLACE: backend/controllers/goalsController.js (FULL FILE)
// =============================================================
const GoalSection = require("../models/goalSection");
const Goal = require("../models/goal");
const GoalDeposit = require("../models/goalDeposit");

function toSectionDto(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    startDate: row.startDate,
    endDate: row.endDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function toGoalDto(row) {
  return {
    id: row.id,
    sectionId: row.sectionId,
    name: row.name,
    priceAmount: Number(row.priceAmount || 0),
    priceTaxIncluded: !!row.priceTaxIncluded,
    priceTaxRate: row.priceTaxRate != null ? Number(row.priceTaxRate) : null,
    priority: row.priority != null ? Number(row.priority) : null,
    minMonthlyDeposit: row.minMonthlyDeposit != null ? Number(row.minMonthlyDeposit) : null,
    depositDate: row.depositDate,
    depositTime: row.depositTime,
    depositPaused: !!row.depositPaused,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    actualPrice: row.actualPrice != null ? Number(row.actualPrice) : null,
    totalDeposited: row.totalDeposited != null ? Number(row.totalDeposited) : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function toDepositDto(row) {
  return {
    id: row.id,
    goalId: row.goalId,
    amount: Number(row.amount || 0),
    date: row.date,
    type: row.type,
    status: row.status,
    createdAt: row.createdAt
  };
}

// ---- helpers: accept BOTH camelCase and snake_case payloads safely ----
function pick(body, ...keys) {
  for (const k of keys) {
    if (body && body[k] !== undefined) return body[k];
  }
  return undefined;
}
function toBool01(v) {
  if (v === true || v === 1 || v === "1" || v === "true") return 1;
  return 0;
}
function toBool(v) {
  return !!toBool01(v);
}
function toNumOrNull(v) {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toNumOrUndef(v) {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function toDateOrNull(v) {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const s = String(v).slice(0, 10);
  return s;
}

exports.listSections = async (req, res) => {
  try {
    const rows = await GoalSection.findByUser(req.user.username);
    res.json(rows.map(toSectionDto));
  } catch (err) {
    console.error("goals.listSections error:", err);
    res.status(500).json({ error: "Server error fetching goal sections" });
  }
};

exports.createSection = async (req, res) => {
  try {
    const nameRaw = pick(req.body, "name");
    const name = (nameRaw == null ? "" : String(nameRaw)).trim();
    if (!name) return res.status(400).json({ error: "name is required" });

    const startDate = pick(req.body, "startDate", "start_date") || null;
    const endDate = pick(req.body, "endDate", "end_date") || null;

    const row = await GoalSection.create(req.user.username, {
      name,
      startDate: startDate || null,
      endDate: endDate || null
    });

    if (!row) return res.status(500).json({ error: "Failed to create section" });
    res.status(201).json(toSectionDto(row));
  } catch (err) {
    console.error("goals.createSection error:", err);
    res.status(500).json({ error: "Server error creating goal section" });
  }
};

exports.updateSection = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const patch = {};

    const nameRaw = pick(req.body, "name");
    if (nameRaw !== undefined) patch.name = String(nameRaw).trim();

    const startRaw = pick(req.body, "startDate", "start_date");
    if (startRaw !== undefined) patch.startDate = startRaw || null;

    const endRaw = pick(req.body, "endDate", "end_date");
    if (endRaw !== undefined) patch.endDate = endRaw || null;

    const row = await GoalSection.update(req.user.username, id, patch);
    if (!row) return res.status(404).json({ error: "Section not found" });

    res.json(toSectionDto(row));
  } catch (err) {
    console.error("goals.updateSection error:", err);
    res.status(500).json({ error: "Server error updating goal section" });
  }
};

exports.deleteSection = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const ok = await GoalSection.remove(req.user.username, id);
    if (!ok) return res.status(404).json({ error: "Section not found" });

    res.status(204).end();
  } catch (err) {
    console.error("goals.deleteSection error:", err);
    res.status(500).json({ error: "Server error deleting goal section" });
  }
};

exports.listGoalsForSection = async (req, res) => {
  try {
    const sectionId = Number(req.params.sectionId);
    if (!sectionId) return res.status(400).json({ error: "Invalid sectionId" });

    const rows = await Goal.findBySectionForUser(req.user.username, sectionId);
    res.json(rows.map(toGoalDto));
  } catch (err) {
    console.error("goals.listGoalsForSection error:", err);
    res.status(500).json({ error: "Server error fetching goals" });
  }
};

exports.createGoalInSection = async (req, res) => {
  try {
    const sectionId = Number(req.params.sectionId);
    if (!sectionId) return res.status(400).json({ error: "Invalid sectionId" });

    const nameRaw = pick(req.body, "name");
    const name = (nameRaw == null ? "" : String(nameRaw)).trim();
    if (!name) return res.status(400).json({ error: "name is required" });

    const priceAmount = pick(req.body, "priceAmount", "price_amount");
    const numPrice = Number(priceAmount);
    if (!(numPrice > 0)) return res.status(400).json({ error: "priceAmount must be positive" });

    const row = await Goal.create(req.user.username, sectionId, {
      name,
      priceAmount: numPrice,
      priceTaxIncluded: toBool01(pick(req.body, "priceTaxIncluded", "price_tax_included")),
      priceTaxRate: toNumOrNull(pick(req.body, "priceTaxRate", "price_tax_rate")),
      priority: toNumOrUndef(pick(req.body, "priority")) ?? 3,
      minMonthlyDeposit: toNumOrNull(pick(req.body, "minMonthlyDeposit", "min_monthly_deposit")),
      depositDate: pick(req.body, "depositDate", "deposit_date") || null,
      depositTime: pick(req.body, "depositTime", "deposit_time") || null,
      depositPaused: toBool01(pick(req.body, "depositPaused", "deposit_paused")),
      status: pick(req.body, "status") || "active",
      startDate: pick(req.body, "startDate", "start_date") || null,
      endDate: pick(req.body, "endDate", "end_date") || null,
      actualPrice: toNumOrNull(pick(req.body, "actualPrice", "actual_price"))
    });

    if (!row) return res.status(404).json({ error: "Section not found" });
    res.status(201).json(toGoalDto(row));
  } catch (err) {
    console.error("goals.createGoalInSection error:", err);
    res.status(500).json({ error: "Server error creating goal" });
  }
};

exports.updateGoal = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const patch = {};

    // Accept both: sectionId / section_id
    const secIdRaw = pick(req.body, "sectionId", "section_id");
    if (secIdRaw !== undefined) patch.sectionId = Number(secIdRaw) || null;

    const nameRaw = pick(req.body, "name");
    if (nameRaw !== undefined) patch.name = String(nameRaw).trim();

    const priceRaw = pick(req.body, "priceAmount", "price_amount");
    if (priceRaw !== undefined) patch.priceAmount = Number(priceRaw) || 0;

    const taxIncRaw = pick(req.body, "priceTaxIncluded", "price_tax_included");
    if (taxIncRaw !== undefined) patch.priceTaxIncluded = toBool(taxIncRaw);

    const taxRateRaw = pick(req.body, "priceTaxRate", "price_tax_rate");
    if (taxRateRaw !== undefined) patch.priceTaxRate = toNumOrNull(taxRateRaw);

    const prioRaw = pick(req.body, "priority");
    if (prioRaw !== undefined) patch.priority = Number(prioRaw);

    const minRaw = pick(req.body, "minMonthlyDeposit", "min_monthly_deposit");
    if (minRaw !== undefined) patch.minMonthlyDeposit = toNumOrNull(minRaw);

    const depDateRaw = pick(req.body, "depositDate", "deposit_date");
    if (depDateRaw !== undefined) patch.depositDate = depDateRaw || null;

    const depTimeRaw = pick(req.body, "depositTime", "deposit_time");
    if (depTimeRaw !== undefined) patch.depositTime = depTimeRaw || null;

    const depPausedRaw = pick(req.body, "depositPaused", "deposit_paused");
    if (depPausedRaw !== undefined) patch.depositPaused = toBool(depPausedRaw);

    const statusRaw = pick(req.body, "status");
    if (statusRaw !== undefined) patch.status = statusRaw;

    const startRaw = pick(req.body, "startDate", "start_date");
    if (startRaw !== undefined) patch.startDate = startRaw || null;

    const endRaw = pick(req.body, "endDate", "end_date");
    if (endRaw !== undefined) patch.endDate = endRaw || null;

    const actualRaw = pick(req.body, "actualPrice", "actual_price");
    if (actualRaw !== undefined) patch.actualPrice = toNumOrNull(actualRaw);

    // Guardrail: do not allow empty name if provided
    if (patch.name !== undefined && !patch.name) {
      return res.status(400).json({ error: "name is required" });
    }

    // Optional: normalize YYYY-MM-DD if client sends ISO datetime
    if (patch.startDate !== undefined) patch.startDate = toDateOrNull(patch.startDate);
    if (patch.endDate !== undefined) patch.endDate = toDateOrNull(patch.endDate);

    const row = await Goal.update(req.user.username, id, patch);
    if (!row) return res.status(404).json({ error: "Goal not found" });

    res.json(toGoalDto(row));
  } catch (err) {
    console.error("goals.updateGoal error:", err);
    res.status(500).json({ error: "Server error updating goal" });
  }
};

exports.deleteGoal = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const ok = await Goal.remove(req.user.username, id);
    if (!ok) return res.status(404).json({ error: "Goal not found" });

    res.status(204).end();
  } catch (err) {
    console.error("goals.deleteGoal error:", err);
    res.status(500).json({ error: "Server error deleting goal" });
  }
};

exports.listDepositsForGoal = async (req, res) => {
  try {
    const goalId = Number(req.params.goalId);
    if (!goalId) return res.status(400).json({ error: "Invalid goalId" });

    const rows = await GoalDeposit.findByGoalForUser(req.user.username, goalId);
    res.json(rows.map(toDepositDto));
  } catch (err) {
    console.error("goals.listDepositsForGoal error:", err);
    res.status(500).json({ error: "Server error fetching goal deposits" });
  }
};

exports.createDepositForGoal = async (req, res) => {
  try {
    const goalId = Number(req.params.goalId);
    if (!goalId) return res.status(400).json({ error: "Invalid goalId" });

    const numAmount = Number(pick(req.body, "amount"));
    if (!(numAmount > 0)) return res.status(400).json({ error: "amount must be positive" });

    const type = pick(req.body, "type") === "auto" ? "auto" : "manual";
    const status = pick(req.body, "status") || "applied";
    const date = pick(req.body, "date") || null;

    const row = await GoalDeposit.createForGoal(req.user.username, goalId, {
      amount: numAmount,
      type,
      status,
      date
    });

    if (!row) return res.status(404).json({ error: "Goal not found" });
    res.status(201).json(toDepositDto(row));
  } catch (err) {
    console.error("goals.createDepositForGoal error:", err);
    res.status(500).json({ error: "Server error creating goal deposit" });
  }
};
// =============================================================
// END REPLACE: backend/controllers/goalsController.js (FULL FILE)
// =============================================================
