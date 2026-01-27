const express = require("express")
const router = express.Router()
const { verifyToken } = require("../controllers/authController")
const budgetController = require("../controllers/budgetController")
const cardsController = require("../controllers/cardsController")

router.use(verifyToken)

router.get("/", budgetController.list)
router.get("/cards", cardsController.getCards)

router.post("/limit", budgetController.setLimit)
router.post("/toggle", budgetController.toggle)
router.post("/refresh", budgetController.refresh)

router.get("/:year/:month", budgetController.getSnapshot)

module.exports = router
