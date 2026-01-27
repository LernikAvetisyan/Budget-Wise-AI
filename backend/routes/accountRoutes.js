const express = require("express");
const router = express.Router();

const {
  listAccounts,
  createAccount,
  deleteAccount,
  updateAccountStatus,
  freedomConnect,
  refreshFromFreedom,
  freedomDisconnect,
  getMysqlBalances,
  getMysqlAvailableBalance
} = require("../controllers/accountController");

const auth = require("../controllers/authController");

router.use(auth.verifyToken);

router.post("/freedom/connect", freedomConnect);
router.post("/freedom/refresh", refreshFromFreedom);
router.post("/freedom/disconnect", freedomDisconnect);

router.get("/balances", getMysqlAvailableBalance);
router.get("/balances/account", getMysqlBalances);
router.get("/freedom/balances", getMysqlAvailableBalance);

router.get("/", listAccounts);
router.post("/", createAccount);

router.patch("/:id/status", updateAccountStatus);

router.delete("/:id", deleteAccount);

module.exports = router;
