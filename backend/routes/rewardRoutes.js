const express = require("express")
const router = express.Router()

const auth = require("../controllers/authController")
const rewardController = require("../controllers/rewardController")

router.use(auth.verifyToken)

router.get("/", rewardController.getRewards)

// Alias: both mark a task eligible for today
router.post("/trigger", rewardController.triggerTask)
router.post("/eligible", rewardController.triggerTask)

router.post("/complete", rewardController.completeTask)

module.exports = router
