// backend/models/User.js
const pool = require('../config/db');

module.exports = {
  async findByUsername(username) {
    const [rows] = await pool.query(
      'SELECT id, username, password, firstName, lastName, createdAt, updatedAt FROM `user` WHERE username = ?',
      [username]
    );
    return rows.length ? rows[0] : null;
  },

  async create({ username, firstName, lastName, password }) {
    await pool.query(
      'INSERT INTO `user` (username, password, firstName, lastName) VALUES (?, ?, ?, ?)',
      [username, password, firstName, lastName]
    );
    const [rows] = await pool.query(
      'SELECT id, username, password, firstName, lastName, createdAt, updatedAt FROM `user` WHERE username = ?',
      [username]
    );
    return rows.length ? rows[0] : null;
  },

  async updateProfile(username, firstName, lastName) {
    await pool.query(
      'UPDATE `user` SET firstName = ?, lastName = ? WHERE username = ?',
      [firstName, lastName, username]
    );
    const [rows] = await pool.query(
      'SELECT id, username, password, firstName, lastName, createdAt, updatedAt FROM `user` WHERE username = ?',
      [username]
    );
    return rows.length ? rows[0] : null;
  },

  async updatePassword(username, password) {
    await pool.query(
      'UPDATE `user` SET password = ? WHERE username = ?',
      [password, username]
    );
  },

  async updateUsername(oldUsername, newUsername) {
    await pool.query(
      'UPDATE `user` SET username = ? WHERE username = ?',
      [newUsername, oldUsername]
    );
    const [rows] = await pool.query(
      'SELECT id, username, password, firstName, lastName, createdAt, updatedAt FROM `user` WHERE username = ?',
      [newUsername]
    );
    return rows.length ? rows[0] : null;
  }
};
