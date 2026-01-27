// frontend/loginpage/js/signup.js
document.addEventListener("DOMContentLoaded", () => {
  const signupForm = document.getElementById("signupForm");
  if (!signupForm) return;

  const usernameInput = document.getElementById("username");
  const firstNameInput = document.getElementById("firstName");
  const lastNameInput = document.getElementById("lastName");
  const passwordInput = document.getElementById("password");
  const confirmPassInput = document.getElementById("confirmPassword");
  const termsCheckbox = document.getElementById("terms");

  const usernameAvailability = document.getElementById("usernameAvailability");
  const passwordError = document.getElementById("passwordError");
  const confirmStatus = document.getElementById("confirmPasswordError");
  const notify = document.getElementById("signupNotification");

  const reqList = document.querySelector(".signup-pass-req-list");
  const reqLength = document.getElementById("req-length");
  const reqUpper = document.getElementById("req-upper");
  const reqLower = document.getElementById("req-lower");
  const reqNum = document.getElementById("req-num");
  const reqSymbol = document.getElementById("req-symbol");

  const submitBtn = signupForm.querySelector('button[type="submit"]');

  function showNotification(msg, isError = true) {
    if (!notify) return;
    notify.textContent = msg;
    notify.style.color = isError ? "#f97373" : "#22c55e";
  }

  let usernameTimer;
  usernameInput?.addEventListener("input", () => {
    clearTimeout(usernameTimer);
    if (usernameAvailability) {
      usernameAvailability.textContent = "";
      usernameAvailability.style.color = "";
    }

    const u = (usernameInput.value || "").trim();
    if (!u) return;

    usernameTimer = setTimeout(async () => {
      if (!usernameAvailability) return;
      usernameAvailability.textContent = "Checking...";
      usernameAvailability.style.color = "";

      try {
        const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(u)}`, {
          credentials: "include"
        });
        const json = await res.json();
        const ok = !!json.available;

        usernameAvailability.textContent = ok ? "Available" : "Taken";
        usernameAvailability.style.color = ok ? "#22c55e" : "#f97373";
      } catch {
        usernameAvailability.textContent = "Error";
        usernameAvailability.style.color = "#f97373";
      }
    }, 500);
  });

  function updatePasswordRequirements() {
    if (!passwordInput || !reqList) return;
    const v = passwordInput.value || "";

    if (!v) {
      reqList.style.display = "none";
      [reqLength, reqUpper, reqLower, reqNum, reqSymbol].forEach((el) => el && el.classList.remove("valid"));
      if (passwordError) passwordError.textContent = "";
      return;
    }

    reqList.style.display = "block";

    const len = v.length >= 8;
    const upper = /[A-Z]/.test(v);
    const lower = /[a-z]/.test(v);
    const num = /\d/.test(v);
    const sym = /[^A-Za-z0-9]/.test(v);

    reqLength?.classList.toggle("valid", len);
    reqUpper?.classList.toggle("valid", upper);
    reqLower?.classList.toggle("valid", lower);
    reqNum?.classList.toggle("valid", num);
    reqSymbol?.classList.toggle("valid", sym);
  }

  function updateConfirmStatus() {
    if (!confirmPassInput || !confirmStatus || !passwordInput) return;

    const pwd = passwordInput.value || "";
    const cp = confirmPassInput.value || "";

    if (!cp) {
      confirmStatus.textContent = "";
      confirmStatus.style.color = "#f97373";
      return;
    }

    if (pwd && cp === pwd) {
      confirmStatus.textContent = "Correct";
      confirmStatus.style.color = "#22c55e";
    } else {
      confirmStatus.textContent = "Passwords do not match.";
      confirmStatus.style.color = "#f97373";
    }
  }

  passwordInput?.addEventListener("input", () => {
    updatePasswordRequirements();
    updateConfirmStatus();
  });

  confirmPassInput?.addEventListener("input", updateConfirmStatus);

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (passwordError) passwordError.textContent = "";
    if (confirmStatus) confirmStatus.textContent = "";
    if (notify) notify.textContent = "";
    if (submitBtn) submitBtn.disabled = true;

    const username = (usernameInput?.value || "").trim();
    const firstName = (firstNameInput?.value || "").trim();
    const lastName = (lastNameInput?.value || "").trim();
    const password = passwordInput?.value || "";
    const confirm = confirmPassInput?.value || "";

    if (!username || !firstName || !lastName || !password) {
      showNotification("Please fill in all fields.");
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    const len = password.length >= 8;
    const upper = /[A-Z]/.test(password);
    const lower = /[a-z]/.test(password);
    const num = /\d/.test(password);
    const sym = /[^A-Za-z0-9]/.test(password);

    if (!(len && upper && lower && num && sym)) {
      if (passwordError) passwordError.textContent = "Password does not meet all requirements.";
      updatePasswordRequirements();
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    if (password !== confirm) {
      if (confirmStatus) {
        confirmStatus.textContent = "Passwords do not match.";
        confirmStatus.style.color = "#f97373";
      }
      showNotification("Passwords do not match.");
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    if (!termsCheckbox?.checked) {
      showNotification("Please agree to the Terms & Conditions.");
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ username, firstName, lastName, password })
      });

      let json = {};
      try {
        json = await res.json();
      } catch {
        json = {};
      }

      if (!res.ok) {
        showNotification(json.error || "Signup failed.");
        return;
      }

      const container = document.getElementById("signupContainer");
      const successEl = document.getElementById("signupSuccess");

      if (container) container.style.display = "none";
      if (successEl) {
        successEl.style.display = "flex";
        const loginBtn = document.getElementById("loginBtn");
        if (loginBtn) {
          loginBtn.addEventListener("click", () => {
            window.location.href = "/index.html";
          });
        }
      }
    } catch (err) {
      console.error("Signup error:", err);
      showNotification("An unexpected error occurred.");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  if (reqList) reqList.style.display = "none";
});