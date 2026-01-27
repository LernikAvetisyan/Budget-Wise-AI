// backend/models/activityModel.js
const pool = require("../config/db");

let __originEnumValues = null;

/**
 * Coerces any input into a YYYY-MM-DD string (date only).
 * Accepts ISO strings like "2026-01-10T..." or "2026-01-10".
 * Returns null when invalid or empty.
 */
function __coerceDateOnly(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * Coerces any input into an HH:MM:SS string (time only).
 * Accepts "HH:MM", "HH:MM:SS", or ISO fragments containing "T..:..:..".
 * Returns null when invalid or empty.
 */
function __coerceTimeOnly(v) {
  const s = String(v || "").trim();
  if (!s) return null;

  const m1 = s.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m1) return `${m1[1]}:${m1[2]}:${m1[3] || "00"}`;

  const m2 = s.match(/T(\d{2}):(\d{2}):(\d{2})/);
  if (m2) return `${m2[1]}:${m2[2]}:${m2[3]}`;

  return null;
}

/**
 * Loads the allowed ENUM values for transactions.origin once.
 * This makes origin validation resilient if the enum changes later.
 */
async function __loadOriginEnumValuesOnce() {
  if (__originEnumValues !== null) return;

  __originEnumValues = [];
  try {
    const [rows] = await pool.query(`SHOW COLUMNS FROM transactions LIKE 'origin'`);
    const col = rows && rows[0];
    const t = String(col?.Type || "");
    const m = t.match(/^enum\((.*)\)$/i);

    if (m && m[1]) {
      __originEnumValues = m[1]
        .split(",")
        .map((x) => x.trim())
        .map((x) => x.replace(/^'/, "").replace(/'$/, "").replace(/\\'/g, "'"))
        .filter(Boolean);
    }
  } catch {}
}

/**
 * Ensures origin is a valid enum option.
 * Falls back to "manual" when enum values cannot be loaded.
 */
function __coerceOrigin(origin) {
  const o = String(origin || "").trim();
  if (!__originEnumValues || !__originEnumValues.length) return o || "manual";
  if (__originEnumValues.includes(o)) return o;
  return __originEnumValues[0];
}

module.exports = {

  async list(username, opts = {}) {
    const accountType = String(opts.accountType || "").trim().toLowerCase()
    const strict = !!opts.strict

    let where = "t.username = ?"
    const params = [username]

    const wantAcct = accountType === "checking" || accountType === "credit"
    const join = wantAcct ? "JOIN" : "LEFT JOIN"

    if (wantAcct) {
      where += " AND a.account_type = ?"
      params.push(accountType)

      if (strict) {
        where += " AND t.account_id IS NOT NULL"
        where += " AND LOWER(COALESCE(t.origin,'')) NOT IN ('goal','manual','assistant')"
      }
    }

    const [rows] = await pool.query(
      `
      SELECT
        t.id,
        t.username,
        t.account_id,
        DATE_FORMAT(t.date, '%Y-%m-%d') AS date,
        TIME_FORMAT(t.time, '%H:%i:%s') AS time,
        t.merchant,
        t.category,
        t.type,
        t.amount,
        t.origin,
        t.assistant_request_id,
        t.externalId,
        t.createdAt,
        t.updatedAt,
        a.account_type AS accountType,
        a.account_number_last4 AS accountLast4,
        a.bank_name AS bankName
      FROM transactions t
      ${join} accounts a
        ON a.id = t.account_id
       AND a.username = t.username
      WHERE ${where}
      ORDER BY t.date DESC, t.time DESC, t.id DESC
      `,
      params
    )

    return rows
  },

  /**
   * Returns all transactions for a user, with optional account metadata.
   * Dates/times are formatted as strings for frontend consistency.
   */
  async findByUser(username) {
    const [rows] = await pool.query(
      `
      SELECT
        t.id,
        t.username,
        t.account_id,
        DATE_FORMAT(t.date, '%Y-%m-%d') AS date,
        TIME_FORMAT(t.time, '%H:%i:%s') AS time,
        t.merchant,
        t.category,
        t.type,
        t.amount,
        t.origin,
        t.assistant_request_id,
        t.externalId,
        t.createdAt,
        t.updatedAt,
        a.account_type AS accountType,
        a.account_number_last4 AS accountLast4,
        a.bank_name AS bankName
      FROM transactions t
      LEFT JOIN accounts a
        ON a.id = t.account_id
       AND a.username = t.username
      WHERE t.username = ?
      ORDER BY t.date DESC, t.time DESC, t.id DESC
      `,
      [username]
    );
    return rows;
  },

  /**
   * Creates a transaction, or updates an existing one when a duplicate is detected.
   * Duplicate detection is based on your UNIQUE key: (username, origin, externalId).
   */
  async create(username, data) {
    await __loadOriginEnumValuesOnce();

    const {
      date,
      time,
      merchant,
      category,
      type,
      amount,
      origin = "manual",
      accountId,
      account_id,
      externalId,
      external_id,
      id
    } = data || {};

    const finalExternalId =
      externalId ||
      external_id ||
      id ||
      `tx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const d = __coerceDateOnly(date) || __coerceDateOnly(new Date().toISOString());
    const t = time != null && String(time).trim() !== "" ? __coerceTimeOnly(time) : null;

    const acct =
      accountId != null ? accountId :
      account_id != null ? account_id :
      null;

    const o = __coerceOrigin(origin);

    await pool.query(
      `
      INSERT INTO transactions
        (username, account_id, date, time, merchant, category, type, amount, origin, assistant_request_id, externalId)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        account_id = VALUES(account_id),
        date       = VALUES(date),
        time       = VALUES(time),
        merchant   = VALUES(merchant),
        category   = VALUES(category),
        type       = VALUES(type),
        amount     = VALUES(amount),
        assistant_request_id = VALUES(assistant_request_id),
        updatedAt  = CURRENT_TIMESTAMP
      `,
      [
        username,
        acct || null,
        d,
        t,
        merchant || "",
        category || "",
        type,
        Number(amount),
        o,
        (data.assistantRequestId || data.assistant_request_id || null),
        finalExternalId
      ]
    );

    const [rows] = await pool.query(
      `
      SELECT
        t.id,
        t.username,
        t.account_id,
        DATE_FORMAT(t.date, '%Y-%m-%d') AS date,
        TIME_FORMAT(t.time, '%H:%i:%s') AS time,
        t.merchant,
        t.category,
        t.type,
        t.amount,
        t.origin,
        t.assistant_request_id,
        t.externalId,
        t.createdAt,
        t.updatedAt,
        a.account_type AS accountType,
        a.account_number_last4 AS accountLast4,
        a.bank_name AS bankName
      FROM transactions t
      LEFT JOIN accounts a
        ON a.id = t.account_id
       AND a.username = t.username
      WHERE t.username = ?
        AND t.origin = ?
        AND t.externalId = ?
      LIMIT 1
      `,
      [username, o, finalExternalId]
    );

    return rows[0] || null;
  },

  /**
   * Updates editable fields for a transaction that belongs to the user.
   * Only fields in the allowlist can be updated.
   */
  async update(username, id, data) {
    await __loadOriginEnumValuesOnce();

    const fields = [];
    const values = [];

    const allowed = ["date", "time", "merchant", "category", "type", "amount", "origin", "assistant_request_id", "assistantRequestId", "account_id", "accountId"];

    allowed.forEach((key) => {
      if (data[key] === undefined) return;

      if (key === "date") {
        fields.push(`date = ?`);
        values.push(__coerceDateOnly(data[key]));
        return;
      }

      if (key === "time") {
        fields.push(`time = ?`);
        values.push(__coerceTimeOnly(data[key]));
        return;
      }

      if (key === "assistantRequestId" || key === "assistant_request_id") {
        fields.push(`assistant_request_id = ?`)
        values.push(data[key] ? String(data[key]) : null)
        return
      }

      if (key === "origin") {
        fields.push(`origin = ?`);
        values.push(__coerceOrigin(data[key]));
        return;
      }

      if (key === "accountId" || key === "account_id") {
        fields.push(`account_id = ?`);
        values.push(data[key] ? data[key] : null);
        return;
      }

      if (key === "amount") {
        fields.push(`amount = ?`);
        values.push(Number(data[key]));
        return;
      }

      fields.push(`${key} = ?`);
      values.push(data[key]);
    });

    if (!fields.length) return null;

    values.push(username, id);

    await pool.query(
      `UPDATE transactions SET ${fields.join(", ")} WHERE username = ? AND id = ?`,
      values
    );

    const [rows] = await pool.query(
      `
      SELECT
        t.id,
        t.username,
        t.account_id,
        DATE_FORMAT(t.date, '%Y-%m-%d') AS date,
        TIME_FORMAT(t.time, '%H:%i:%s') AS time,
        t.merchant,
        t.category,
        t.type,
        t.amount,
        t.origin,
        t.assistant_request_id,
        t.externalId,
        t.createdAt,
        t.updatedAt,
        a.account_type AS accountType,
        a.account_number_last4 AS accountLast4,
        a.bank_name AS bankName
      FROM transactions t
      LEFT JOIN accounts a
        ON a.id = t.account_id
       AND a.username = t.username
      WHERE t.username = ? AND t.id = ?
      `,
      [username, id]
    );

    return rows[0] || null;
  },

  async remove(username, id) {
    const [res] = await pool.query(
      "DELETE FROM transactions WHERE username = ? AND id = ?",
      [username, id]
    );
    return res.affectedRows > 0;
  }
};
