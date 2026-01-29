// frontend/loginpage/js/signup.js
document.addEventListener("DOMContentLoaded", () => {
  const signupForm = document.getElementById("signupForm")
  if (!signupForm) return

  const usernameInput = document.getElementById("username")
  const firstNameInput = document.getElementById("firstName")
  const lastNameInput = document.getElementById("lastName")
  const passwordInput = document.getElementById("password")
  const confirmPassInput = document.getElementById("confirmPassword")
  const termsCheckbox = document.getElementById("terms")

  const usernameAvailability = document.getElementById("usernameAvailability")
  const passwordError = document.getElementById("passwordError")
  const confirmError = document.getElementById("confirmPasswordError")
  const notify = document.getElementById("signupNotification")

  const reqList = document.querySelector(".signup-pass-req-list")
  const reqLength = document.getElementById("req-length")
  const reqUpper = document.getElementById("req-upper")
  const reqLower = document.getElementById("req-lower")
  const reqNum = document.getElementById("req-num")
  const reqSymbol = document.getElementById("req-symbol")

  const passStatus = document.getElementById("signup-pass-status")
  const confirmStatus = document.getElementById("signup-confirm-pass-status")

  const submitBtn = signupForm.querySelector('button[type="submit"]')

  const showNotification = (msg, isError = true) => {
    if (!notify) return
    notify.textContent = msg
    notify.style.color = isError ? "#f97373" : "#22c55e"
  }

  // Password Eye Toggle
  // Click toggles visible/invisible, blur hides
  const wireToggle = (toggleId, inputEl) => {
    const toggleEl = document.getElementById(toggleId)
    if (!toggleEl || !inputEl) return

    const setState = (show) => {
      inputEl.setAttribute("type", show ? "text" : "password")
      toggleEl.classList.toggle("fa-eye", !show)
      toggleEl.classList.toggle("fa-eye-slash", show)
      toggleEl.setAttribute("aria-label", show ? "Hide password" : "Show password")
      toggleEl.setAttribute("role", "button")
      toggleEl.setAttribute("tabindex", "0")
    }

    const toggle = () => {
      const show = inputEl.getAttribute("type") === "password"
      setState(show)
      inputEl.focus({ preventScroll: true })
    }

    setState(false)

    const preventBlur = (e) => { e.preventDefault() }
    toggleEl.addEventListener("pointerdown", preventBlur)
    toggleEl.addEventListener("mousedown", preventBlur)
    toggleEl.addEventListener("touchstart", preventBlur, { passive: false })

    toggleEl.addEventListener("click", toggle)

    toggleEl.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return
      e.preventDefault()
      toggle()
    })

    inputEl.addEventListener("blur", () => setState(false))
  }

  wireToggle("toggleSignupPassword", passwordInput)
  wireToggle("toggleSignupConfirmPassword", confirmPassInput)

  // Settings-style status icon helper
  const setStatus = (el, ok, show) => {
    if (!el) return
    if (!show) {
      el.textContent = ""
      el.style.color = ""
      return
    }
    el.textContent = ok ? "✔" : "✖"
    el.style.color = ok ? "#22c55e" : "#f97373"
  }

  const showReqList = () => {
    if (!reqList) return
    reqList.style.display = "grid"
  }

  const hideReqList = () => {
    if (!reqList) return
    reqList.style.display = "none"
  }

  const evalRules = (v) => {
    return {
      len: (v || "").length >= 8,
      upper: /[A-Z]/.test(v || ""),
      lower: /[a-z]/.test(v || ""),
      num: /\d/.test(v || ""),
      sym: /[^A-Za-z0-9]/.test(v || "")
    }
  }

  const updatePasswordReqUI = () => {
    if (!passwordInput) return
    const v = passwordInput.value || ""
    const r = evalRules(v)

    reqLength?.classList.toggle("valid", r.len)
    reqUpper?.classList.toggle("valid", r.upper)
    reqLower?.classList.toggle("valid", r.lower)
    reqNum?.classList.toggle("valid", r.num)
    reqSymbol?.classList.toggle("valid", r.sym)
  }

  const allRulesOk = (v) => {
    const r = evalRules(v)
    return r.len && r.upper && r.lower && r.num && r.sym
  }

  const updateNewPasswordStatusUI = (forceShow) => {
    if (!passwordInput) return
    const v = passwordInput.value || ""
    const ok = !!v && allRulesOk(v)
    setStatus(passStatus, ok, forceShow ? !!v : false)
  }

  const updateConfirmStatusUI = (forceShow) => {
    if (!passwordInput || !confirmPassInput) return
    const pwd = passwordInput.value || ""
    const cp = confirmPassInput.value || ""
    const ok = !!cp && !!pwd && cp === pwd
    setStatus(confirmStatus, ok, forceShow ? !!cp : false)
  }

  // Username availability (with symbols)
  let usernameTimer
  usernameInput?.addEventListener("input", () => {
    clearTimeout(usernameTimer)
    if (usernameAvailability) {
      usernameAvailability.textContent = ""
      usernameAvailability.style.color = ""
    }

    const u = (usernameInput.value || "").trim()
    if (!u) return

    usernameTimer = setTimeout(async () => {
      if (!usernameAvailability) return
      usernameAvailability.textContent = "Checking..."
      usernameAvailability.style.color = ""

      try {
        const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(u)}`, {
          credentials: "include"
        })
        const json = await res.json()
        const ok = !!json.available

        usernameAvailability.textContent = ok ? "✅ Available" : "❌ Taken"
        usernameAvailability.style.color = ok ? "#22c55e" : "#f97373"
      } catch {
        usernameAvailability.textContent = "Error"
        usernameAvailability.style.color = "#f97373"
      }
    }, 500)
  })

  // Password behavior like Settings
  hideReqList()
  setStatus(passStatus, false, false)
  setStatus(confirmStatus, false, false)

  passwordInput?.addEventListener("focus", () => {
    const v = passwordInput.value || ""
    if (!v) return
    showReqList()
  })

  passwordInput?.addEventListener("input", () => {
    const v = passwordInput.value || ""
    if (passwordError) passwordError.textContent = ""

    if (!v) {
      hideReqList()
      updatePasswordReqUI()
      setStatus(passStatus, false, false)
      updateConfirmStatusUI(true)
      return
    }

    showReqList()
    updatePasswordReqUI()
    setStatus(passStatus, false, false)
    updateConfirmStatusUI(true)
  })

  passwordInput?.addEventListener("blur", () => {
    hideReqList()
    updateNewPasswordStatusUI(true)
  })

  confirmPassInput?.addEventListener("input", () => {
    if (confirmError) confirmError.textContent = ""
    updateConfirmStatusUI(true)
  })

  confirmPassInput?.addEventListener("blur", () => {
    updateConfirmStatusUI(true)
  })

  // Submit
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault()

    if (passwordError) passwordError.textContent = ""
    if (confirmError) confirmError.textContent = ""
    if (notify) notify.textContent = ""
    if (submitBtn) submitBtn.disabled = true

    const username = (usernameInput?.value || "").trim()
    const firstName = (firstNameInput?.value || "").trim()
    const lastName = (lastNameInput?.value || "").trim()
    const password = passwordInput?.value || ""
    const confirm = confirmPassInput?.value || ""

    if (!username || !firstName || !lastName || !password || !confirm) {
      showNotification("Please fill in all fields.")
      if (submitBtn) submitBtn.disabled = false
      return
    }

    if (!allRulesOk(password)) {
      if (passwordError) passwordError.textContent = "Password does not meet all requirements."
      hideReqList()
      updatePasswordReqUI()
      updateNewPasswordStatusUI(true)
      showNotification("Password does not meet all requirements.")
      if (submitBtn) submitBtn.disabled = false
      return
    }

    if (password !== confirm) {
      if (confirmError) confirmError.textContent = "Passwords do not match."
      updateConfirmStatusUI(true)
      showNotification("Passwords do not match.")
      if (submitBtn) submitBtn.disabled = false
      return
    }

    if (!termsCheckbox?.checked) {
      showNotification("Please agree to the Terms & Conditions.")
      if (submitBtn) submitBtn.disabled = false
      return
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
      })

      let json = {}
      try {
        json = await res.json()
      } catch {
        json = {}
      }

      if (!res.ok) {
        showNotification(json.error || "Signup failed.")
        return
      }

      const container = document.getElementById("signupContainer")
      const successEl = document.getElementById("signupSuccess")

      if (container) container.style.display = "none"
      if (successEl) {
        successEl.style.display = "flex"
        const loginBtn = document.getElementById("loginBtn")
        if (loginBtn) {
          loginBtn.addEventListener("click", () => {
            window.location.href = "/index.html"
          })
        }
      }
    } catch (err) {
      console.error("Signup error:", err)
      showNotification("An unexpected error occurred.")
    } finally {
      if (submitBtn) submitBtn.disabled = false
    }
  })
});