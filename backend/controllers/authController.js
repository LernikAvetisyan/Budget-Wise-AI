const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";
const ACCESS_EXPIRES_IN = "30d";

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_EXPIRES_IN });
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60 * 1000
  };
}

function clearCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  };
}

// ─────────────────────────────────────────────
// Middleware: verify JWT (cookie first, then Authorization fallback)
// ─────────────────────────────────────────────
exports.verifyToken = (req, res, next) => {
  let token = (req.cookies && (req.cookies.bt_token || req.cookies.token)) || "";

  if (!token) {
    const authHeader = req.headers.authorization || "";
    const [scheme, bearer] = authHeader.split(" ");
    if (scheme === "Bearer" && bearer) token = bearer;
  }

  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (_err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

// ─────────────────────────────────────────────
// Sign Up
// ─────────────────────────────────────────────
exports.signup = async (req, res) => {
  try {
    const { username, firstName, lastName, password } = req.body;

    if (!username || !firstName || !lastName || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const existing = await User.findByUsername(username);
    if (existing) return res.status(400).json({ error: "Username already taken" });

    const newUser = await User.create({ username, firstName, lastName, password });
    const token = signToken({ username: newUser.username });

    res.cookie("bt_token", token, cookieOptions());

    res.status(201).json({
      message: "Account created successfully",
      user: {
        username: newUser.username,
        firstName: newUser.firstName,
        lastName: newUser.lastName
      }
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Server error during signup" });
  }
};

// ─────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const user = await User.findByUsername(username);
    if (!user || user.password !== password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = signToken({ username: user.username });

    res.cookie("bt_token", token, cookieOptions());

    res.json({
      message: "Login successful",
      user: {
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error during login" });
  }
};

// ─────────────────────────────────────────────
// Logout: clears HttpOnly cookie
// ─────────────────────────────────────────────
exports.logout = async (_req, res) => {
  res.clearCookie("bt_token", clearCookieOptions());
  res.clearCookie("token", clearCookieOptions());
  res.json({ message: "Logged out" });
};

// ─────────────────────────────────────────────
// Check if username is available
// ─────────────────────────────────────────────
exports.checkUsername = async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) {
      return res.status(400).json({ available: false, error: "Username required" });
    }
    const exists = await User.findByUsername(username);
    res.json({ available: !exists });
  } catch (err) {
    console.error("checkUsername error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// ─────────────────────────────────────────────
// Get current user
// ─────────────────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    let token = (req.cookies && (req.cookies.bt_token || req.cookies.token)) || ""

    if (!token) {
      const authHeader = req.headers.authorization || ""
      const [scheme, bearer] = authHeader.split(" ")
      if (scheme === "Bearer" && bearer) token = bearer
    }

    if (!token) return res.status(200).json({ authenticated: false })

    let payload = null
    try {
      payload = jwt.verify(token, JWT_SECRET)
    } catch {
      return res.status(200).json({ authenticated: false })
    }

    const username = payload && payload.username
    if (!username) return res.status(200).json({ authenticated: false })

    const user = await User.findByUsername(username)
    if (!user) return res.status(200).json({ authenticated: false })

    return res.status(200).json({
      authenticated: true,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName
    })
  } catch (err) {
    console.error("getMe error:", err)
    return res.status(200).json({ authenticated: false })
  }
};



// ─────────────────────────────────────────────
// Update profile
// ─────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const { firstName, lastName } = req.body;
    if (!firstName || !lastName) {
      return res.status(400).json({ error: "firstName and lastName are required" });
    }

    const updated = await User.updateProfile(req.user.username, firstName, lastName);
    if (!updated) return res.status(404).json({ error: "User not found" });

    res.json({
      message: "Profile updated",
      user: {
        username: updated.username,
        firstName: updated.firstName,
        lastName: updated.lastName
      }
    });
  } catch (err) {
    console.error("updateProfile error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// ─────────────────────────────────────────────
// Change password
// ─────────────────────────────────────────────
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "oldPassword and newPassword are required" });
    }

    const user = await User.findByUsername(req.user.username);
    if (!user || user.password !== oldPassword) {
      return res.status(401).json({ error: "Old password is incorrect" });
    }

    await User.updatePassword(user.username, newPassword);
    res.json({ message: "Password updated" });
  } catch (err) {
    console.error("changePassword error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// ─────────────────────────────────────────────
// Change username (rotate cookie token)
// ─────────────────────────────────────────────
exports.changeUsername = async (req, res) => {
  try {
    const { newUsername } = req.body;
    if (!newUsername) return res.status(400).json({ error: "newUsername is required" });

    const current = await User.findByUsername(req.user.username);
    if (!current) return res.status(404).json({ error: "User not found" });

    if (newUsername === current.username) {
      return res.status(400).json({ error: "New username must be different" });
    }

    const exists = await User.findByUsername(newUsername);
    if (exists) return res.status(400).json({ error: "Username already taken" });

    const updated = await User.updateUsername(current.username, newUsername);
    const token = signToken({ username: updated.username });

    res.cookie("bt_token", token, cookieOptions());

    res.json({
      message: "Username updated",
      user: {
        username: updated.username,
        firstName: updated.firstName,
        lastName: updated.lastName
      }
    });
  } catch (err) {
    console.error("changeUsername error:", err);
    res.status(500).json({ error: "Server error" });
  }
};
