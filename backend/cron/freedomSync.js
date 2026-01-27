// backend/cron/freedomSync.js
const pool = require('../config/db');
const Activity = require('../models/activityModel');

const FREEDOM_SERVER_API_KEY = process.env.FREEDOM_SERVER_API_KEY;
const FREEDOM_API_BASE =
  process.env.FREEDOM_BANK_API_BASE ||
  'https://us-central1-freedom-bank-9c209.cloudfunctions.net/api';

const ACCOUNT_TYPES = ['checking', 'credit'];

async function fetchWithRetry(url, opts = {}, tries = 3) {
  let lastErr = null;

  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15000);

    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Freedom fetch failed ${res.status} ${text}`);
      }

      return await res.json();
    } catch (e) {
      clearTimeout(timeout);
      lastErr = e;

      const code = e && (e.code || (e.cause && e.cause.code));
      const retryable =
        code === "ECONNRESET" ||
        code === "ETIMEDOUT" ||
        code === "ECONNREFUSED" ||
        e.name === "AbortError";

      if (!retryable) throw e;

      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }

  throw lastErr;
}


async function refreshIdToken(refreshToken) {
  if (!FREEDOM_SERVER_API_KEY) {
    console.error('FREEDOM_SERVER_API_KEY is not set in environment');
    throw new Error('Missing Freedom Bank server API key');
  }

  const url =
    'https://securetoken.googleapis.com/v1/token?key=' +
    encodeURIComponent(FREEDOM_SERVER_API_KEY);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('refreshIdToken error status=', res.status, 'body=', body);
    throw new Error('Failed to refresh Freedom Bank idToken');
  }

  const data = await res.json();
  return {
    idToken: data.id_token,
    userId: data.user_id,
    newRefreshToken: data.refresh_token || refreshToken
  };
}

async function fetchFreedomTransactions(idToken, accountType) {
  const url =
    FREEDOM_API_BASE +
    '/transactions?account=' +
    encodeURIComponent(accountType) +
    '&limit=200';

  try {
    const data = await fetchWithRetry(url, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + idToken,
        'Content-Type': 'application/json'
      }
    });

    return data && Array.isArray(data.items) ? data.items : [];
  } catch (err) {
    console.error(
      'cron fetchFreedomTransactions error for',
      accountType,
      err && (err.message || err)
    );
    return [];
  }
}


async function importTransactions(username, items, accountId) {
  for (const t of items) {
    try {
      const dateStr = t.date || null;

      let timeStr = '';
      if (t.timestamp) {
        const d = new Date(t.timestamp);
        if (!Number.isNaN(d.getTime())) {
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          timeStr = `${hh}:${mm}`;
        }
      }

      const rawAmount = Number(t.amount || 0);
      if (!rawAmount) continue;

      const isIncome = rawAmount < 0;
      const amountAbs = Math.abs(rawAmount);
      const type = isIncome ? 'income' : 'expense';

      const baseId = [
        t.date || '',
        t.merchant || '',
        rawAmount.toFixed(2),
        type
      ].join('|');

      const externalId = t.id || baseId;

      await Activity.create(username, {
        date: dateStr,
        time: timeStr || null,
        merchant: t.merchant || '',
        category: t.category || '',
        type,
        amount: amountAbs,
        origin: 'freedom_bank',
        externalId,
        accountId: accountId || null
      });
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') {
        continue;
      }
      console.error('cron importTransactions item error:', err);
    }
  }
}

async function runFreedomRefreshJob() {
  try {
      const [rows] = await pool.query(
        `
        SELECT
          id,
          username,
          email,
          account_type,
          fb_refresh_token,
          fb_uid
        FROM accounts
        WHERE bank_name = 'Freedom Bank'
          AND fb_refresh_token IS NOT NULL
          AND status = 'connected'
        `
      );

    if (!rows.length) {
      return;
    }

    const byUser = new Map();

    for (const r of rows) {
      if (!r.fb_refresh_token) continue;
      const key = r.username;
      if (!byUser.has(key)) {
        byUser.set(key, {
          username: r.username,
          email: r.email,
          refreshToken: r.fb_refresh_token,
          uid: r.fb_uid,
          accounts: []
        });
      }
      byUser.get(key).accounts.push({
        id: r.id,
        accountType: r.account_type
      });
    }

    for (const [, userEntry] of byUser) {
      const { username, refreshToken, accounts } = userEntry;
      if (!refreshToken || !accounts.length) continue;

      try {
        const { idToken } = await refreshIdToken(refreshToken);

        for (const acc of accounts) {
          const acctType = acc.accountType;
          if (!ACCOUNT_TYPES.includes(acctType)) continue;

          try {
            const items = await fetchFreedomTransactions(idToken, acctType);
            await importTransactions(username, items, acc.id);
          } catch (err) {
            console.error(
              'cron fetch/import error for user=',
              username,
              'type=',
              acctType,
              err
            );
          }
        }
      } catch (err) {
        console.error(
          'cron refreshIdToken error for user=',
          username,
          err.message || err
        );
      }
    }
  } catch (err) {
    console.error('runFreedomRefreshJob top-level error:', err);
  }
}

function startFreedomSync(intervalMs = 5 * 60 * 1000) {
  runFreedomRefreshJob().catch(err => {
    console.error('initial runFreedomRefreshJob error:', err);
  });
  setInterval(() => {
    runFreedomRefreshJob().catch(err => {
      console.error('interval runFreedomRefreshJob error:', err);
    });
  }, intervalMs);
}

module.exports = {
  startFreedomSync
};