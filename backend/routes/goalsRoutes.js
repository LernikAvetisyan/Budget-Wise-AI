// backend/routes/goalsRoutes.js
// Purpose: Goals API routing, protected by verifyToken

const express = require("express");
const router = express.Router();
const auth = require("../controllers/authController");
const goals = require("../controllers/goalsController");

router.use(auth.verifyToken);

router.get("/sections", goals.listSections);
router.post("/sections", goals.createSection);
router.put("/sections/:id", goals.updateSection);
router.delete("/sections/:id", goals.deleteSection);

router.get("/sections/:sectionId/goals", goals.listGoalsForSection);
router.post("/sections/:sectionId/goals", goals.createGoalInSection);

router.put("/goals/:id", goals.updateGoal);
router.delete("/goals/:id", goals.deleteGoal);

router.get("/goals/:goalId/deposits", goals.listDepositsForGoal);
router.post("/goals/:goalId/deposits", goals.createDepositForGoal);

module.exports = router;
