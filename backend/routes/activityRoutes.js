// backend/routes/activityRoutes.js
const express = require("express")
const router = express.Router()

const auth = require("../controllers/authController")
const activityController = require("../controllers/activityController")

router.use(auth.verifyToken)

router.get("/", activityController.list)
router.post("/", activityController.create)
router.put("/:id", activityController.update)
router.delete("/:id", activityController.remove)

module.exports = router
