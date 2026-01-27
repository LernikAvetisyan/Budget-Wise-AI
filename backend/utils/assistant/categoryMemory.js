// backend/utils/assistant/categoryMemory.js
// Purpose: Lightweight on-disk model that learns merchant -> category based on user confirmations
// Data file: backend/utils/assistant/data/merchant_category_model.json
// Notes:
// - This does not touch MySQL
// - It stores aggregated counts and a small per-category user map to avoid duplicate counting per user

const fs = require("fs")
const path = require("path")

const DB_PATH = path.join(__dirname, "data", "merchant_category_model.json")

let _writeQueue = Promise.resolve()

function norm(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function ensureDbFile() {
  if (fs.existsSync(DB_PATH)) return
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  fs.writeFileSync(DB_PATH, JSON.stringify({ v: 1, merchants: {} }, null, 2))
}

function readDb() {
  ensureDbFile()
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8")
    const json = JSON.parse(raw || "{}")
    if (!json || typeof json !== "object") return { v: 1, merchants: {} }
    if (!json.merchants || typeof json.merchants !== "object") json.merchants = {}
    if (!json.v) json.v = 1
    return json
  } catch {
    return { v: 1, merchants: {} }
  }
}

function writeDb(db) {
  ensureDbFile()
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2))
}

function queueWrite(fn) {
  _writeQueue = _writeQueue.then(fn).catch(() => {})
  return _writeQueue
}

function getMerchantNode(db, merchantKey) {
  if (!db.merchants[merchantKey]) {
    db.merchants[merchantKey] = { total: 0, categories: {} }
  }
  const node = db.merchants[merchantKey]
  if (!node.categories || typeof node.categories !== "object") node.categories = {}
  if (typeof node.total !== "number") node.total = 0
  return node
}

function getCategoryNode(merchantNode, category) {
  const catKey = String(category || "").trim()
  if (!merchantNode.categories[catKey]) {
    merchantNode.categories[catKey] = { count: 0, users: {} }
  }
  const c = merchantNode.categories[catKey]
  if (typeof c.count !== "number") c.count = 0
  if (!c.users || typeof c.users !== "object") c.users = {}
  return c
}

async function record(username, merchant, category) {
  const u = String(username || "").trim()
  const m = norm(merchant)
  const c = String(category || "").trim()

  if (!u || !m || !c) return false

  await queueWrite(async () => {
    const db = readDb()
    const merchantNode = getMerchantNode(db, m)
    const catNode = getCategoryNode(merchantNode, c)

    if (catNode.users[u]) return

    catNode.users[u] = 1
    catNode.count += 1
    merchantNode.total += 1

    writeDb(db)
  })

  return true
}

function suggest(merchant) {
  const m = norm(merchant)
  if (!m) return null

  const db = readDb()
  const node = db.merchants[m]
  if (!node || !node.categories) return null

  const entries = Object.entries(node.categories)
    .map(([cat, obj]) => {
      const count = Number(obj && obj.count ? obj.count : 0)
      return { category: cat, count }
    })
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)

  const total = Number(node.total || 0)
  if (!entries.length || total <= 0) {
    return { category: "", confidence: 0, total: total || 0, breakdown: [] }
  }

  const best = entries[0]
  const confidence = best.count / total

  const breakdown = entries.slice(0, 5).map((x) => ({
    category: x.category,
    count: x.count,
    pct: total > 0 ? x.count / total : 0
  }))

  return {
    category: best.category,
    confidence,
    total,
    breakdown
  }
}

async function guess(username, merchant, threshold = 0.8) {
  const s = suggest(merchant)
  if (!s || !s.category) return null
  if (Number(s.total || 0) < 1) return null
  return Number(s.confidence || 0) >= threshold ? s.category : null
}

async function bulkImport(pairs) {
  if (!Array.isArray(pairs) || !pairs.length) return { imported: 0 }

  let imported = 0
  for (const p of pairs) {
    const ok = await record(p.username, p.merchant, p.category)
    if (ok) imported += 1
  }
  return { imported }
}

module.exports = {
  DB_PATH,
  record,
  suggest,
  guess,
  bulkImport
}
