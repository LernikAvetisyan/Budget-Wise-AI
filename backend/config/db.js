// backend/db.js
const mysql = require("mysql2/promise")
require("dotenv").config()

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "budgettracker",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "Z",
  dateStrings: false,
  supportBigNumbers: true,
  multipleStatements: false
})

async function setUtcSession(conn) {
  try {
    await conn.query("SET time_zone = '+00:00'")
  } catch {}
}

const _getConnection = pool.getConnection.bind(pool)
pool.getConnection = async () => {
  const conn = await _getConnection()
  await setUtcSession(conn)
  return conn
}

pool.query = async (sql, params) => {
  const conn = await pool.getConnection()
  try {
    const [rows] = await conn.query(sql, params)
    return [rows]
  } finally {
    conn.release()
  }
}

;(async () => {
  try {
    await pool.query("SELECT DATABASE() AS db, @@session.time_zone AS tz")
  } catch (err) {
    console.error("DB connection check failed:", err.message)
  }
})()

module.exports = pool
