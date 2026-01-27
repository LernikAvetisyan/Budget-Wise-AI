// backend/models/dailyAiSummary.js
// Daily Assistant.exe summary store.
// This model keeps ONE row per user by updating the newest row and removing older duplicates.

const pool = require("../config/db")

async function getLatestByUser(username) {
  const [rows] = await pool.query(
    `
    SELECT
      id,
      username,
      DATE_FORMAT(day, '%Y-%m-%d') AS day,
      status,
      message,
      snapshot_json AS snapshotJson,
      createdAt,
      updatedAt
    FROM daily_ai_summary
    WHERE username = ?
    ORDER BY id DESC
    LIMIT 1
    `,
    [username]
  )
  return rows[0] || null
}

async function upsertLatest(username, day, status, message, snapshotJson) {
  const snap = snapshotJson != null ? JSON.stringify(snapshotJson) : null

  const [latestRows] = await pool.query(
    `
    SELECT id
    FROM daily_ai_summary
    WHERE username = ?
    ORDER BY id DESC
    LIMIT 1
    `,
    [username]
  )

  const latestId = latestRows?.[0]?.id ? Number(latestRows[0].id) : 0

  if (!latestId) {
    const [ins] = await pool.query(
      `
      INSERT INTO daily_ai_summary (username, day, status, message, snapshot_json)
      VALUES (?, ?, ?, ?, ?)
      `,
      [username, day, status, message, snap]
    )

    const newId = Number(ins.insertId || 0)

    await pool.query(
      `
      DELETE FROM daily_ai_summary
      WHERE username = ? AND id <> ?
      `,
      [username, newId]
    )

    const [rows] = await pool.query(
      `
      SELECT
        id,
        username,
        DATE_FORMAT(day, '%Y-%m-%d') AS day,
        status,
        message,
        snapshot_json AS snapshotJson,
        createdAt,
        updatedAt
      FROM daily_ai_summary
      WHERE id = ?
      LIMIT 1
      `,
      [newId]
    )
    return rows[0] || null
  }

  await pool.query(
    `
    UPDATE daily_ai_summary
    SET day = ?, status = ?, message = ?, snapshot_json = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
    LIMIT 1
    `,
    [day, status, message, snap, latestId]
  )

  await pool.query(
    `
    DELETE FROM daily_ai_summary
    WHERE username = ? AND id <> ?
    `,
    [username, latestId]
  )

  const [rows] = await pool.query(
    `
    SELECT
      id,
      username,
      DATE_FORMAT(day, '%Y-%m-%d') AS day,
      status,
      message,
      snapshot_json AS snapshotJson,
      createdAt,
      updatedAt
    FROM daily_ai_summary
    WHERE id = ?
    LIMIT 1
    `,
    [latestId]
  )
  return rows[0] || null
}

// Compatibility helpers used by ai.js
async function getByUserAndDay(username, day) {
  const row = await getLatestByUser(username)
  if (!row) return null
  return String(row.day) === String(day) ? row : null
}

async function upsert(username, day, status, message, snapshotJson) {
  return upsertLatest(username, day, status, message, snapshotJson)
}

module.exports = {
  getLatestByUser,
  upsertLatest,
  getByUserAndDay,
  upsert
}
