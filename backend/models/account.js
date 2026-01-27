// backend/models/account.js 
const pool = require('../config/db');

async function findByUser(username) {
  const [rows] = await pool.query(
    `
    SELECT
      id,
      username,
      email,
      bank_name            AS bankName,
      account_type         AS accountType,
      account_number_last4 AS last4,
      status,
      connectedAt,
      fb_refresh_token     AS refreshToken,
      fb_uid               AS uid
    FROM accounts
    WHERE username = ?
    ORDER BY connectedAt DESC
    `,
    [username]
  );
  return rows;
}

async function findConnectedByUser(username) {
  const [rows] = await pool.query(
    `
    SELECT
      id,
      username,
      email,
      bank_name            AS bankName,
      account_type         AS accountType,
      account_number_last4 AS last4,
      status,
      connectedAt,
      fb_refresh_token     AS refreshToken,
      fb_uid               AS uid
    FROM accounts
    WHERE username = ? AND status = 'connected'
    ORDER BY connectedAt DESC
    `,
    [username]
  );
  return rows;
}

async function disconnectAllForUser(username) {
  await pool.query(
    `
    UPDATE accounts
    SET status = 'disconnected',
        fb_refresh_token = NULL,
        fb_uid = NULL
    WHERE username = ?
    `,
    [username]
  )
}


async function findById(id) {
  const [rows] = await pool.query(
    `
    SELECT
      id,
      username,
      email,
      bank_name            AS bankName,
      account_type         AS accountType,
      account_number_last4 AS last4,
      status,
      connectedAt,
      fb_refresh_token     AS refreshToken,
      fb_uid               AS uid
    FROM accounts
    WHERE id = ?
    `,
    [id]
  );
  return rows[0] || null;
}

async function create({
  username,
  email,
  bankName,
  accountType,
  last4,
  refreshToken,
  uid,
  status = "disconnected"
}) {
  const st = String(status || "disconnected").trim().toLowerCase() === "connected" ? "connected" : "disconnected"
  const l4 = last4 == null ? null : String(last4).replace(/\D/g, "").slice(-4) || null

  const [result] = await pool.query(
    `
    INSERT INTO accounts (
      username,
      email,
      bank_name,
      account_type,
      account_number_last4,
      status,
      connectedAt,
      fb_refresh_token,
      fb_uid
    )
    VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?)
    ON DUPLICATE KEY UPDATE
      email                = VALUES(email),
      account_number_last4 = VALUES(account_number_last4),
      status               = VALUES(status),
      connectedAt          = IF(VALUES(status) = 'connected', NOW(), connectedAt),
      fb_refresh_token     = VALUES(fb_refresh_token),
      fb_uid               = VALUES(fb_uid)
    `,
    [username, email, bankName, accountType, l4, st, refreshToken || null, uid || null]
  )

  let id = result.insertId
  if (!id) {
    const [rows] = await pool.query(
      `
      SELECT id
      FROM accounts
      WHERE username = ? AND bank_name = ? AND account_type = ?
      `,
      [username, bankName, accountType]
    )
    if (!rows.length) return null
    id = rows[0].id
  }

  const [rows] = await pool.query(
    `
    SELECT
      id,
      username,
      email,
      bank_name            AS bankName,
      account_type         AS accountType,
      account_number_last4 AS last4,
      status,
      connectedAt,
      fb_refresh_token     AS refreshToken,
      fb_uid               AS uid
    FROM accounts
    WHERE id = ?
    `,
    [id]
  )
  return rows[0] || null
}

async function updateStatus(id, username, status) {
  const st = String(status || "disconnected").trim().toLowerCase() === "connected" ? "connected" : "disconnected"
  await pool.query(
    "UPDATE accounts SET status = ? WHERE id = ? AND username = ?",
    [st, id, username]
  )
}

async function remove(id, username) {
  await pool.query(
    'DELETE FROM accounts WHERE id = ? AND username = ?',
    [id, username]
  );
}

async function removeAllForUser(username) {
  await pool.query(
    'DELETE FROM accounts WHERE username = ?',
    [username]
  );
}

async function updateFreedomTokensForUser(username, refreshToken, uid) {
  await pool.query(
    `
    UPDATE accounts
    SET fb_refresh_token = ?,
        fb_uid = ?
    WHERE username = ?
      AND bank_name = 'Freedom Bank'
    `,
    [refreshToken || null, uid || null, username]
  )
}



module.exports = {
  findByUser,
  findConnectedByUser,
  findById,
  create,
  updateStatus,
  remove,
  removeAllForUser,
  disconnectAllForUser,
  updateFreedomTokensForUser
}
