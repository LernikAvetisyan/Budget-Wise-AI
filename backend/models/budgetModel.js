const pool = require("../config/db")

const LA_TZ = "America/Los_Angeles"

function currentYearMonthLA() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LA_TZ,
    year: "numeric",
    month: "numeric"
  }).formatToParts(new Date())

  let year = 0
  let month = 0
  for (const p of parts) {
    if (p.type === "year") year = Number(p.value)
    if (p.type === "month") month = Number(p.value)
  }
  return { year, month }
}

function isPastMonthLA(year, month) {
  const now = currentYearMonthLA()
  return year < now.year || (year === now.year && month < now.month)
}

function monthRange(year, month) {
  const y = Number(year)
  const m = Number(month)

  const start = `${y}-${String(m).padStart(2, "0")}-01`

  let ny = y
  let nm = m + 1
  if (nm === 13) {
    nm = 1
    ny++
  }
  const end = `${ny}-${String(nm).padStart(2, "0")}-01`

  return { start, end }
}

function prevYearMonth(year, month) {
  let y = Number(year)
  let m = Number(month) - 1
  if (m === 0) {
    m = 12
    y -= 1
  }
  return { year: y, month: m }
}

async function ensureMonthRowsFromTransactions(username, year, month) {
  const { start, end } = monthRange(year, month)
  const prev = prevYearMonth(year, month)

  const maxAttempts = 6
  let attempt = 0
  let lastErr = null

  while (attempt < maxAttempts) {
    attempt += 1
    try {
      await pool.query(
        `
        INSERT INTO budget_month_category
          (username, year, month, category, enabled, monthly_limit, spent_amount, limits_locked)
        SELECT
          ?, ?, ?,
          MIN(TRIM(t.category)),
          0,
          COALESCE(MAX(p.monthly_limit), 0.00),
          SUM(ABS(t.amount)),
          IF(?, 1, 0)
        FROM transactions t
        LEFT JOIN budget_month_category p
          ON p.username = ?
         AND p.year = ?
         AND p.month = ?
         AND LOWER(TRIM(p.category)) = LOWER(TRIM(t.category))
        WHERE t.username = ?
          AND t.type = 'expense'
          AND t.category IS NOT NULL
          AND TRIM(t.category) <> ''
          AND t.\`date\` >= ?
          AND t.\`date\` < ?
        GROUP BY LOWER(TRIM(t.category))
        ON DUPLICATE KEY UPDATE
          spent_amount = VALUES(spent_amount),
          limits_locked = GREATEST(limits_locked, VALUES(limits_locked))
        `,
        [
          username,
          year,
          month,
          isPastMonthLA(year, month) ? 1 : 0,
          username,
          prev.year,
          prev.month,
          username,
          start,
          end
        ]
      )
      return
    } catch (err) {
      lastErr = err
      const deadlock =
        err &&
        (err.code === "ER_LOCK_DEADLOCK" ||
          err.errno === 1213 ||
          err.sqlState === "40001")

      if (!deadlock) throw err

      const delayMs = 25 * attempt * attempt
      await new Promise(r => setTimeout(r, delayMs))
    }
  }

  throw lastErr
}


async function ensureCategoryRow(username, year, month, category) {
  const cat = String(category || "").trim()
  if (!cat) return

  const prev = prevYearMonth(year, month)

  await pool.query(
    `
    INSERT INTO budget_month_category
      (username, year, month, category, enabled, monthly_limit, spent_amount, limits_locked)
    VALUES
      (
        ?, ?, ?, ?, 0,
        COALESCE(
          (
            SELECT x.monthly_limit
            FROM (
              SELECT monthly_limit
              FROM budget_month_category
              WHERE username = ?
                AND year = ?
                AND month = ?
                AND LOWER(TRIM(category)) = LOWER(TRIM(?))
              LIMIT 1
            ) x
          ),
          0.00
        ),
        0.00,
        ?
      )
    ON DUPLICATE KEY UPDATE
      category = VALUES(category)
    `,
    [
      username,
      year,
      month,
      cat,
      username,
      prev.year,
      prev.month,
      cat,
      isPastMonthLA(year, month) ? 1 : 0
    ]
  )
}

async function refreshSpent(username, year, month) {
  const { start, end } = monthRange(year, month)

  await pool.query(
    `
    UPDATE budget_month_category b
    LEFT JOIN (
      SELECT
        TRIM(category) AS category,
        SUM(ABS(amount)) AS spent
      FROM transactions
      WHERE username = ?
        AND type = 'expense'
        AND category IS NOT NULL
        AND TRIM(category) <> ''
        AND \`date\` >= ?
        AND \`date\` < ?
      GROUP BY TRIM(category)
    ) x
      ON LOWER(TRIM(x.category)) = LOWER(TRIM(b.category))
    SET b.spent_amount = COALESCE(x.spent, 0.00)
    WHERE b.username = ?
      AND b.year = ?
      AND b.month = ?
    `,
    [username, start, end, username, year, month]
  )
}

async function lockIfPast(username, year, month) {
  if (!isPastMonthLA(year, month)) return
  await pool.query(
    `
    UPDATE budget_month_category
    SET limits_locked = 1
    WHERE username = ?
      AND year = ?
      AND month = ?
    `,
    [username, year, month]
  )
}

async function assertCurrentMonthUnlocked(username) {
  const { year, month } = currentYearMonthLA()

  await pool.query(
    `
    UPDATE budget_month_category
    SET limits_locked = 1
    WHERE username = ?
      AND (year < ? OR (year = ? AND month < ?))
    `,
    [username, year, year, month]
  )

  const [rows] = await pool.query(
    `
    SELECT 1
    FROM budget_month_category
    WHERE username = ?
      AND year = ?
      AND month = ?
      AND limits_locked = 1
    LIMIT 1
    `,
    [username, year, month]
  )

  if (rows.length) throw new Error("LIMITS_LOCKED")
}

function mapRows(rows) {
  return rows.map(r => ({
    id: r.id,
    category: r.category,
    enabled: r.enabled === 1,
    monthlyLimit: Number(r.monthly_limit),
    spentAmount: Number(r.spent_amount),
    limitsLocked: r.limits_locked === 1
  }))
}

async function listCurrentMonth(username) {
  const { year, month } = currentYearMonthLA()

  await ensureMonthRowsFromTransactions(username, year, month)
  await refreshSpent(username, year, month)
  await lockIfPast(username, year, month)

  const [rows] = await pool.query(
    `
    SELECT
      id,
      category,
      enabled,
      monthly_limit,
      spent_amount,
      limits_locked
    FROM budget_month_category
    WHERE username = ?
      AND year = ?
      AND month = ?
    ORDER BY category
    `,
    [username, year, month]
  )

  return mapRows(rows)
}

async function updateLimit(username, category, limit) {
  const { year, month } = currentYearMonthLA()
  const cat = String(category || "").trim()
  if (!cat) return

  await ensureMonthRowsFromTransactions(username, year, month)
  await ensureCategoryRow(username, year, month, cat)

  await assertCurrentMonthUnlocked(username)

  const lim = Number(limit)
  const finalLimit = Number.isFinite(lim) && lim >= 0 ? lim : 0

  await pool.query(
    `
    UPDATE budget_month_category
    SET monthly_limit = ?
    WHERE username = ?
      AND year = ?
      AND month = ?
      AND LOWER(TRIM(category)) = LOWER(TRIM(?))
    `,
    [finalLimit, username, year, month, cat]
  )
}

async function toggleCategory(username, category, enabled) {
  const { year, month } = currentYearMonthLA()
  const cat = String(category || "").trim()
  if (!cat) return

  await ensureMonthRowsFromTransactions(username, year, month)
  await ensureCategoryRow(username, year, month, cat)

  await assertCurrentMonthUnlocked(username)

  await pool.query(
    `
    UPDATE budget_month_category
    SET enabled = ?
    WHERE username = ?
      AND year = ?
      AND month = ?
      AND LOWER(TRIM(category)) = LOWER(TRIM(?))
    `,
    [enabled ? 1 : 0, username, year, month, cat]
  )
}

async function getMonth(username, year, month) {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return []

  await ensureMonthRowsFromTransactions(username, y, m)
  await refreshSpent(username, y, m)
  await lockIfPast(username, y, m)

  const [rows] = await pool.query(
    `
    SELECT
      id,
      category,
      enabled,
      monthly_limit,
      spent_amount,
      limits_locked
    FROM budget_month_category
    WHERE username = ?
      AND year = ?
      AND month = ?
    ORDER BY category
    `,
    [username, y, m]
  )

  return mapRows(rows)
}

async function refreshMonth(username, year, month) {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return

  await ensureMonthRowsFromTransactions(username, y, m)
  await refreshSpent(username, y, m)
  await lockIfPast(username, y, m)
}

async function refreshAllMonths(username) {
  const [rows] = await pool.query(
    `
    SELECT DISTINCT YEAR(\`date\`) AS y, MONTH(\`date\`) AS m
    FROM transactions
    WHERE username = ?
      AND \`date\` IS NOT NULL
    `,
    [username]
  )

  const now = currentYearMonthLA()
  const months = rows.map(r => ({ year: Number(r.y), month: Number(r.m) }))
  months.push(now)

  const seen = new Set()
  const uniq = []
  for (const mm of months) {
    const k = `${mm.year}-${mm.month}`
    if (seen.has(k)) continue
    seen.add(k)
    uniq.push(mm)
  }

  for (const mm of uniq) {
    await refreshMonth(username, mm.year, mm.month)
  }
}

module.exports = {
  listCurrentMonth,
  updateLimit,
  toggleCategory,
  getMonth,
  refreshMonth,
  refreshAllMonths
}
