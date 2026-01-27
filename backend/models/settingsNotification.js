// backend/models/settingsNotification.js
const pool = require("../config/db");

async function findByUsername(username) {
  const [rows] = await pool.query(
    `
    SELECT
      username,
      notify_budget_alert,
      notify_weekly_summary,
      notify_goal_completed,
      notify_missed_deposit,
      notify_over_budget,
      notify_success_month,
      createdAt,
      updatedAt
    FROM settings_notification
    WHERE username = ?
    `,
    [username]
  );

  return rows[0] || null;
}

async function createDefault(username) {
  await pool.query(
    `
    INSERT INTO settings_notification (username)
    VALUES (?)
    ON DUPLICATE KEY UPDATE username = username
    `,
    [username]
  );

  return findByUsername(username);
}

async function update(username, data) {
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    values.push(value ? 1 : 0);
  }

  if (!fields.length) return findByUsername(username);

  await pool.query(
    `
    UPDATE settings_notification
    SET ${fields.join(", ")}
    WHERE username = ?
    `,
    [...values, username]
  );

  return findByUsername(username);
}

module.exports = {
  findByUsername,
  createDefault,
  update
};
