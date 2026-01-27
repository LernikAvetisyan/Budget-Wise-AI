// backend/server.js
// Purpose: Express server entry for Budget Tracker backend API and frontend hosting

const express = require("express")
const cookieParser = require("cookie-parser")
const path = require("path")

/*
  1) Environment Setup
  Loads .env from backend/.env so all routes can use process.env values.
*/
require("dotenv").config({ path: path.join(__dirname, ".env") })

/*
  2) Route Imports
  Each route file registers endpoints for its feature area.
*/
const authRoutes = require("./routes/auth")
const aiRoutes = require("./routes/ai")
const assistantRoutes = require("./routes/assistant")

const activityRoutes = require("./routes/activityRoutes")
const accountRoutes = require("./routes/accountRoutes")
const budgetRoutes = require("./routes/budgetRoutes")
const goalsRoutes = require("./routes/goalsRoutes")
const rewardRoutes = require("./routes/rewardRoutes")
const settingsNotificationRoutes = require("./routes/settingsNotificationRoutes")

/*
  3) App Init
  Creates the Express app and configures the port.
*/
const app = express()
const PORT = process.env.PORT || 3000

/*
  4) Background Jobs
  Freedom Bank sync job runs on an interval in the background.
*/
const { startFreedomSync } = require("./cron/freedomSync")
startFreedomSync(60 * 60 * 1000)

/*
  5) Parsers and Middleware
  These must be registered before routes so req.body and cookies work everywhere.
*/
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

/*
  6) Optional Request Logger
  Useful when debugging routes. Keep it off unless needed.
*/
app.use((req, _res, next) => {
  // console.log(`${req.method} ${req.url}`)
  next()
})

/*
  7) API Routes
  Mount each feature under a clear /api prefix.
*/
app.use("/api/auth", authRoutes)
app.use("/api/ai", aiRoutes)
app.use("/api/assistant", require("./routes/assistant"))

app.use("/api/activity", activityRoutes)
app.use("/api/accounts", accountRoutes)
app.use("/api/budgets", budgetRoutes)
app.use("/api/goals", goalsRoutes)
app.use("/api/rewards", rewardRoutes)
app.use("/api/settings/notifications", settingsNotificationRoutes)

/*
  8) Health Check
  Simple endpoint to confirm server is running.
*/
app.get("/api/health", (_req, res) => res.json({ ok: true }))

/*
  9) Serve Frontend
  Serves static files from /frontend and supports SPA routing.
*/
const FRONTEND_DIR = path.join(__dirname, "../frontend")
app.use(express.static(FRONTEND_DIR))

app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"))
})

/*
  10) Unknown API Handler
  Ensures unknown /api routes return JSON 404.
*/
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }))

/*
  11) Global Error Handler
  Catches unhandled errors and returns a consistent JSON response.
*/
app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: "Server error" })
})

/*
  12) Start Server
*/
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`)
})
