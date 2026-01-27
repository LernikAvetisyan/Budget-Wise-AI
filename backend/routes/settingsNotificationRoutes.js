// backend/routes/settingsNotificationRoutes.js

const express = require("express");
const router = express.Router();

const {
  getNotifications,
  updateNotifications
} = require("../controllers/settingsNotificationController");

const auth = require("../controllers/authController");

router.use(auth.verifyToken);

router.get("/", getNotifications);
router.put("/", updateNotifications);

module.exports = router;
