//backend/routes/auth.js
const express = require('express');
const router = express.Router();
const auth = require('../controllers/authController');

// Public
router.post('/signup', auth.signup);
router.post('/login', auth.login);
router.post("/logout", auth.logout);
// Username availability check
router.get('/check-username', auth.checkUsername);

// Protected (requires login)
router.get('/me', auth.getMe);
router.put('/me/profile', auth.verifyToken, auth.updateProfile);
router.put('/me/password', auth.verifyToken, auth.changePassword);
router.put('/me/username', auth.verifyToken, auth.changeUsername);

module.exports = router;