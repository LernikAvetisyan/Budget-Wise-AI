// backend/models/cardsModel.js



const pool = require("../config/db");

function toTxDateTime(dateVal, timeVal) {
  if (!dateVal) return null;

  try {
    let y, m, d;

    if (dateVal instanceof Date && !Number.isNaN(dateVal.getTime())) {
      y = dateVal.getUTCFullYear();
      m = dateVal.getUTCMonth();
      d = dateVal.getUTCDate();
    } else {
      const s = String(dateVal).trim();
      const md = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!md) return null;
      y = Number(md[1]);
      m = Number(md[2]) - 1;
      d = Number(md[3]);
    }

    let hh = 0, mm = 0, ss = 0;

    if (timeVal != null) {
      const t = String(timeVal).trim();
      if (t) {
        const mt = t.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
        if (mt) {
          hh = Number(mt[1]) || 0;
          mm = Number(mt[2]) || 0;
          ss = Number(mt[3]) || 0;
        } else {
          const mt2 = t.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/);
          if (mt2) {
            hh = Number(mt2[1]) || 0;
            mm = Number(mt2[2]) || 0;
            ss = Number(mt2[3]) || 0;
          }
        }
      }
    }

    return new Date(y, m, d, hh, mm, ss, 0);
  } catch {
    return null;
  }
}

async function getCardSummaries(username) {
  const [accounts] = await pool.query(
    `
    SELECT
      id,
      account_type,
      account_number_last4
    FROM accounts
    WHERE username = ?
      AND bank_name = 'Freedom Bank'
      AND account_type IN ('checking', 'credit')
    `,
    [username]
  );

  if (!accounts.length) return [];

  const ids = accounts.map((a) => a.id);
  const placeholders = ids.map(() => "?").join(",");

  const params = [username, ...ids];
  const [txRows] = await pool.query(
    `
    SELECT
      account_id,
      type,
      date,
      time,
      amount,
      createdAt
    FROM transactions
    WHERE username = ?
      AND origin = 'freedom_bank'
      AND account_id IN (${placeholders})
    `,
    params
  );

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const accMap = new Map();
  for (const acc of accounts) {
    accMap.set(acc.id, {
      accountId: acc.id,
      accountType: acc.account_type,
      last4: acc.account_number_last4,
      currentBalance: 0,
      monthlySpend: 0,
      lastTxAt: null
    });
  }

  for (const row of txRows) {
    const target = accMap.get(row.account_id);
    if (!target) continue;

    const amount = Number(row.amount) || 0;

    const txAt =
      toTxDateTime(row.date, row.time) ||
      (row.createdAt ? new Date(row.createdAt) : null);

    if (row.type === "income") {
      target.currentBalance += amount;
    } else {
      target.currentBalance -= amount;

      if (txAt && txAt >= monthStart) {
        target.monthlySpend += amount;
      }
    }

    if (txAt && (!target.lastTxAt || txAt > target.lastTxAt)) {
      target.lastTxAt = txAt;
    }
  }

  return Array.from(accMap.values());
}

module.exports = {
  getCardSummaries
};
