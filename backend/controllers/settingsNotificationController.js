//backend/controllers/settingsNotificationController.js
const SettingsNotification = require("../models/settingsNotification");

async function getNotifications(req, res) {
  try {
    const username = req.user.username;

    let settings = await SettingsNotification.findByUsername(username);

    if (!settings) {
      settings = await SettingsNotification.createDefault(username);
    }

    res.json(settings);
  } catch (err) {
    console.error("getNotifications error:", err);
    res.status(500).json({ error: "Failed to load notification settings" });
  }
}

async function updateNotifications(req, res) {
  try {
    const username = req.user.username;

    const allowedFields = [
      "notify_budget_alert",
      "notify_weekly_summary",
      "notify_goal_completed",
      "notify_missed_deposit",
      "notify_over_budget",
      "notify_success_month"
    ];

    const updates = {};

    for (const key of allowedFields) {
      if (key in req.body) {
        updates[key] = !!req.body[key];
      }
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    let settings = await SettingsNotification.findByUsername(username);

    if (!settings) {
      await SettingsNotification.createDefault(username);
    }

    settings = await SettingsNotification.update(username, updates);

    res.json(settings);
  } catch (err) {
    console.error("updateNotifications error:", err);
    res.status(500).json({ error: "Failed to update notification settings" });
  }
}

module.exports = {
  getNotifications,
  updateNotifications
};
