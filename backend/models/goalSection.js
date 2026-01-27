// backend/models/goalSection.js
const pool = require("../config/db");

module.exports = {
  async findByUser(username) {
    const [rows] = await pool.query(
      `
      SELECT
        id,
        username,
        name,
        start_date  AS startDate,
        end_date    AS endDate,
        createdAt,
        updatedAt
      FROM goal_section
      WHERE username = ?
      ORDER BY createdAt ASC
      `,
      [username]
    );
    return rows;
  },

  async findByIdForUser(username, id) {
    const [rows] = await pool.query(
      `
      SELECT
        id,
        username,
        name,
        start_date  AS startDate,
        end_date    AS endDate,
        createdAt,
        updatedAt
      FROM goal_section
      WHERE username = ? AND id = ?
      `,
      [username, id]
    );
    return rows[0] || null;
  },

  async create(username, data) {
    const { name, startDate = null, endDate = null } = data;
    await pool.query(
      `
      INSERT INTO goal_section
        (username, name, start_date, end_date)
      VALUES
        (?, ?, ?, ?)
      `,
      [username, name, startDate, endDate]
    );
    const [rows] = await pool.query(
      `
      SELECT
        id,
        username,
        name,
        start_date  AS startDate,
        end_date    AS endDate,
        createdAt,
        updatedAt
      FROM goal_section
      WHERE username = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [username]
    );
    return rows[0] || null;
  },

  async update(username, id, data) {
    const fields = [];
    const values = [];
    ["name", "startDate", "endDate"].forEach((key) => {
      if (data[key] !== undefined) {
        if (key === "startDate") {
          fields.push("start_date = ?");
        } else if (key === "endDate") {
          fields.push("end_date = ?");
        } else {
          fields.push(`${key} = ?`);
        }
        values.push(data[key]);
      }
    });
    if (!fields.length) return null;
    values.push(username, id);
    await pool.query(
      `UPDATE goal_section SET ${fields.join(", ")} WHERE username = ? AND id = ?`,
      values
    );
    const [rows] = await pool.query(
      `
      SELECT
        id,
        username,
        name,
        start_date  AS startDate,
        end_date    AS endDate,
        createdAt,
        updatedAt
      FROM goal_section
      WHERE username = ? AND id = ?
      `,
      [username, id]
    );
    return rows[0] || null;
  },

  async remove(username, id) {
    const [res] = await pool.query(
      "DELETE FROM goal_section WHERE username = ? AND id = ?",
      [username, id]
    );
    return res.affectedRows > 0;
  }
};
