// backend/models/goalDeposit.js
const pool = require("../config/db");

module.exports = {
  async findByGoalForUser(username, goalId) {
    const [rows] = await pool.query(
      `
      SELECT
        d.id,
        d.goal_id   AS goalId,
        d.amount,
        d.date,
        d.type,
        d.status,
        d.createdAt
      FROM goal_deposit d
      INNER JOIN goal g
        ON g.id = d.goal_id
      INNER JOIN goal_section s
        ON s.id = g.section_id
       AND s.username = ?
      WHERE d.goal_id = ?
      ORDER BY d.date ASC, d.createdAt ASC
      `,
      [username, goalId]
    );
    return rows;
  },

  async createForGoal(username, goalId, data) {
    const [rowsGoal] = await pool.query(
      `
      SELECT g.id
      FROM goal g
      INNER JOIN goal_section s
        ON s.id = g.section_id
       AND s.username = ?
      WHERE g.id = ?
      `,
      [username, goalId]
    );
    if (!rowsGoal.length) return null;
    const { amount, type, status = "applied", date = null } = data;
    await pool.query(
      `
      INSERT INTO goal_deposit
        (goal_id, amount, date, type, status)
      VALUES
        (?, ?, COALESCE(?, NOW()), ?, ?)
      `,
      [goalId, amount, date, type, status]
    );
    const [rows] = await pool.query(
      `
      SELECT
        d.id,
        d.goal_id   AS goalId,
        d.amount,
        d.date,
        d.type,
        d.status,
        d.createdAt
      FROM goal_deposit d
      INNER JOIN goal g
        ON g.id = d.goal_id
      INNER JOIN goal_section s
        ON s.id = g.section_id
       AND s.username = ?
      WHERE d.goal_id = ?
      ORDER BY d.id DESC
      LIMIT 1
      `,
      [username, goalId]
    );
    return rows[0] || null;
  }
};
