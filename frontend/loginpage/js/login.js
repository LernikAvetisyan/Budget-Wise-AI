// frontend/loginpage/js/login.js
document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");

  if (!loginForm) return;

  const submitBtn = loginForm.querySelector('button[type="submit"]');

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (loginError) loginError.textContent = "";
    if (submitBtn) submitBtn.disabled = true;

    const username = (document.getElementById("identifier")?.value || "").trim();
    const password = document.getElementById("password")?.value || "";

    if (!username || !password) {
      if (loginError) loginError.textContent = "Please enter username and password.";
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ username, password })
      });

      let json = {};
      try {
        json = await res.json();
      } catch {
        json = {};
      }

      if (!res.ok) {
        throw new Error(json.error || "Login failed");
      }

      window.location.href = "/index.html";
    } catch (err) {
      if (loginError) loginError.textContent = err.message || "Unexpected error";
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
});