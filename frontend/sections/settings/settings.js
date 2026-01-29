(() => {
  // Runs a function when DOM is ready.
  const onReady = fn => {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn, { once: true })
    else fn()
  }

  onReady(() => {
    window.dispatchEvent(new CustomEvent("data:updated"))

    const API_BASE = "/api/auth"
    const ACCOUNTS_API_BASE = "/api/accounts"
    const NOTIF_API_BASE = "/api/settings/notifications"

    // Short querySelector helper.
    const $ = sel => document.querySelector(sel)

    // Cached profile info.
    let profile = { first: "", last: "", username: "" }

    // Raw accounts from backend.
    let backendAccounts = []

    // Notification preferences state.
    let notif = {
      notify_budget_alert: true,
      notify_weekly_summary: true,
      notify_goal_completed: true,
      notify_missed_deposit: true,
      notify_over_budget: true,
      notify_success_month: true
    }

    // Fetch wrapper that always uses JSON and includes credentials.
    async function jsonFetch(url, options = {}) {
      const headers = { "Content-Type": "application/json", ...(options.headers || {}) }
      return fetch(url, { ...options, headers, credentials: "include" })
    }

    // Convenience wrapper for /api/auth endpoints.
    async function authFetch(path, options = {}) {
      return jsonFetch(API_BASE + path, options)
    }

    // Normalizes different backend payload shapes into an accounts array.
    function normalizeAccountsResponse(payload) {
      if (Array.isArray(payload)) return payload
      if (payload && Array.isArray(payload.accounts)) return payload.accounts
      if (payload && Array.isArray(payload.data)) return payload.data
      return []
    }

    // Normalizes a single account object to consistent front-end fields.
    function normalizeAccountRow(a) {
      if (!a || typeof a !== "object") return null

      const id = a.id ?? a.accountId ?? a.account_id ?? a.accountID ?? null
      const accountTypeRaw = a.accountType ?? a.account_type ?? a.type ?? null
      const last4Raw = a.last4 ?? a.account_number_last4 ?? a.lastFour ?? null
      const statusRaw = a.status ?? a.connection_status ?? a.connectionStatus ?? "disconnected"
      const bankNameRaw = a.bankName ?? a.bank_name ?? a.bank ?? a.institution ?? ""

      const accountType = accountTypeRaw == null ? null : String(accountTypeRaw).trim().toLowerCase()
      const status = statusRaw == null ? "disconnected" : String(statusRaw).trim().toLowerCase()
      const bankName = String(bankNameRaw || "").trim()

      // Keep last4 exactly 4 digits if possible.
      const last4 = last4Raw == null ? null : String(last4Raw).replace(/\D/g, "").slice(-4) || null

      // Try to preserve any token fields if backend returns them.
      const refreshToken = a.refreshToken ?? a.refresh_token ?? a.fb_refresh_token ?? null
      const uid = a.uid ?? a.fb_uid ?? null

      return { ...a, id, accountType, last4, status, bankName, refreshToken, uid }
    }

    // Returns true if this account row belongs to Freedom Bank (case-insensitive).
    function isFreedomAccount(a) {
      const name = String(a?.bankName || "").trim().toLowerCase()
      return name.includes("freedom")
    }

    // Returns the Freedom Bank account row for the specified type (checking or credit).
    function findAccountByType(type) {
      const t = String(type || "").trim().toLowerCase()
      return backendAccounts.find(a => a && a.accountType === t && isFreedomAccount(a))
    }

    // Returns true if a specific account row is marked connected.
    function isConnected(acc) {
      if (!acc) return false
      return String(acc.status || "disconnected").trim().toLowerCase() === "connected"
    }

    // Global "linked" means Freedom tokens exist (not per-card status).
    // This matches your requirement:
    // - Global connect stores tokens and enables card-level controls
    // - Card-level connect/disconnect is separate per account type
    function hasLinkedAccounts() {
      return backendAccounts.some(a => {
        if (!a || !a.id) return false
        if (!isFreedomAccount(a)) return false
        return !!(a.refreshToken || a.uid)
      })
    }

    // Formats the connected label using sanitized last4.
    function maskLast4(acc) {
      const last4 = acc && acc.last4 != null ? String(acc.last4).replace(/\D/g, "").slice(-4) : ""
      return last4 ? `Connected ••••${last4}` : "Connected"
    }

    // Initializes the top profile hero UI.
    function initProfile() {
      const heroName = $("#st-hero-name")
      const heroUser = $("#st-hero-username")
      const heroAvatar = $("#st-profile-initials")

      if (heroName) {
        const fullName = (profile.first + " " + profile.last).trim()
        heroName.textContent = fullName || "User"
      }

      if (heroUser) heroUser.textContent = profile.username ? `@${profile.username}` : "@user"

      if (heroAvatar) {
        const fI = (profile.first || "").charAt(0)
        const lI = (profile.last || "").charAt(0)
        heroAvatar.textContent = (fI + lI).toUpperCase() || "U"
      }
    }

    // Initializes the readonly current username field.
    function initUsername() {
      const u = $("#st-current-username")
      if (u) u.value = profile.username || ""
    }

    // Initializes notification toggle checkboxes from current state.
    function initNotifications() {
      const map = [
        ["#st-notif-budget", "notify_budget_alert"],
        ["#st-notif-weekly", "notify_weekly_summary"],
        ["#st-notif-goal-finished", "notify_goal_completed"],
        ["#st-notif-missed-deposit", "notify_missed_deposit"],
        ["#st-notif-overbudget", "notify_over_budget"],
        ["#st-notif-success-month", "notify_success_month"]
      ]

      map.forEach(([sel, key]) => {
        const el = $(sel)
        if (!el) return
        el.checked = !!notif[key]
      })
    }

    // Initializes the accounts UI state: big connect button and per-card controls.
    function initAccounts() {
      const checking = $("#st-acc-checking")
      const credit = $("#st-acc-credit")
      const connectBtn = $("#st-connect-freedom")
      if (!checking || !credit || !connectBtn) return

      const chkStatus = checking.querySelector(".st-acc-status")
      const chkBtn = checking.querySelector(".st-acc-btn")
      const crdStatus = credit.querySelector(".st-acc-status")
      const crdBtn = credit.querySelector(".st-acc-btn")

      const checkingAcc = findAccountByType("checking")
      const creditAcc = findAccountByType("credit")

      const linked = hasLinkedAccounts()

      // Big global connect/disconnect button.
      if (!linked) {
        connectBtn.innerHTML = `<i class="fas fa-plus"></i> Connect Freedom Bank Account`
        connectBtn.classList.remove("danger")
      } else {
        connectBtn.innerHTML = `<i class="fas fa-unlink"></i> Disconnect Freedom Bank Account`
        connectBtn.classList.add("danger")
      }

      // Updates each card row according to rules:
      // - If not linked globally: show Not connected and disable the card button
      // - If linked globally: allow per-card Connect or Disconnect
      const updateRow = (acc, statusEl, btnEl) => {
        if (!statusEl || !btnEl) return

        // If the account row does not exist yet, user has never created it.
        if (!acc || !acc.id) {
          statusEl.textContent = "Not connected"
          statusEl.style.color = "var(--muted)"
          btnEl.textContent = "Connect"
          btnEl.dataset.action = "connect"
          btnEl.dataset.id = ""
          btnEl.disabled = true
          return
        }

        // Global is not linked: per-card buttons must not work.
        if (!linked) {
          statusEl.textContent = "Not connected"
          statusEl.style.color = "var(--muted)"
          btnEl.textContent = "Connect"
          btnEl.dataset.action = "connect"
          btnEl.dataset.id = String(acc.id)
          btnEl.disabled = true
          return
        }

        // Global linked: per-card connect/disconnect is allowed.
        if (isConnected(acc)) {
          statusEl.textContent = maskLast4(acc)
          statusEl.style.color = "var(--color-success)"
          btnEl.textContent = "Disconnect"
          btnEl.dataset.action = "disconnect"
          btnEl.dataset.id = String(acc.id)
          btnEl.disabled = false
        } else {
          statusEl.textContent = "Not connected"
          statusEl.style.color = "var(--muted)"
          btnEl.textContent = "Connect"
          btnEl.dataset.action = "connect"
          btnEl.dataset.id = String(acc.id)
          btnEl.disabled = false
        }
      }

      updateRow(checkingAcc, chkStatus, chkBtn)
      updateRow(creditAcc, crdStatus, crdBtn)
    }

    // Loads profile from backend and updates UI.
    async function loadProfileFromBackend() {
      try {
        const res = await authFetch("/me", { method: "GET" })
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        profile.first = data.firstName || ""
        profile.last = data.lastName || ""
        profile.username = data.username || ""
        initProfile()
        initUsername()
      } catch {}
    }

    // Loads accounts from backend and updates UI.
    async function loadAccountsFromBackend() {
      try {
        const res = await jsonFetch(ACCOUNTS_API_BASE, { method: "GET" })
        if (!res.ok) return
        const raw = await res.json().catch(() => null)
        const list = normalizeAccountsResponse(raw)
        backendAccounts = list.map(normalizeAccountRow).filter(Boolean)
        initAccounts()
        window.dispatchEvent(new CustomEvent("data:updated", { detail: { source: "accounts" } }))
      } catch (err) {
        console.error(err)
      }
    }

    // Loads notification preferences from backend and updates UI.
    async function loadNotificationsFromBackend() {
      try {
        const res = await jsonFetch(NOTIF_API_BASE, { method: "GET" })
        if (!res.ok) return
        const data = await res.json().catch(() => null)
        if (!data || typeof data !== "object") return

        notif = {
          notify_budget_alert: !!data.notify_budget_alert,
          notify_weekly_summary: !!data.notify_weekly_summary,
          notify_goal_completed: !!data.notify_goal_completed,
          notify_missed_deposit: !!data.notify_missed_deposit,
          notify_over_budget: !!data.notify_over_budget,
          notify_success_month: !!data.notify_success_month
        }

        initNotifications()
      } catch (err) {
        console.error(err)
      }
    }

    // Updates a single notification preference on backend.
    async function updateNotification(key, value) {
      try {
        const res = await jsonFetch(NOTIF_API_BASE, {
          method: "PUT",
          body: JSON.stringify({ [key]: !!value })
        })
        if (!res.ok) return false

        const data = await res.json().catch(() => null)
        if (data && typeof data === "object") {
          Object.assign(notif, data)
          initNotifications()
        }
        return true
      } catch {
        return false
      }
    }

    // Opens a dialog modal by selector.
    function openModal(sel) {
      const dlg = $(sel)
      if (dlg && typeof dlg.showModal === "function") dlg.showModal()
    }

    // Closes a dialog modal element.
    function closeModal(dlg) {
      if (dlg) dlg.close()
    }

    // Wire modal close buttons.
    document.querySelectorAll(".st-close-modal").forEach(btn => {
      btn.addEventListener("click", () => {
        const d = btn.closest("dialog")
        if (d) d.close()
      })
    })

    // Clicking outside or pressing escape closes modals.
    document.querySelectorAll("dialog.st-modal").forEach(dialog => {
      dialog.addEventListener("click", e => {
        if (e.target === dialog) dialog.close()
      })
      dialog.addEventListener("cancel", e => {
        e.preventDefault()
        dialog.close()
      })
    })

    // Edit profile modal open.
    const editProfileBtn = $("#st-edit-profile")
    if (editProfileBtn) {
      editProfileBtn.addEventListener("click", () => {
        const f = $("#st-edit-first")
        const l = $("#st-edit-last")
        if (f) f.value = profile.first || ""
        if (l) l.value = profile.last || ""
        openModal("#st-edit-profile-modal")
      })
    }

    // Edit profile modal save.
    const editProfileSave = $("#st-edit-profile-save")
    if (editProfileSave) {
      editProfileSave.addEventListener("click", async () => {
        const f = $("#st-edit-first")?.value.trim() || ""
        const l = $("#st-edit-last")?.value.trim() || ""
        if (!f || !l) return

        const res = await authFetch("/me/profile", {
          method: "PUT",
          body: JSON.stringify({ firstName: f, lastName: l })
        })
        if (!res.ok) return

        profile.first = f
        profile.last = l
        initProfile()
        closeModal($("#st-edit-profile-modal"))
      })
    }

    // Notification toggles.
    const notifMap = [
      ["#st-notif-budget", "notify_budget_alert"],
      ["#st-notif-weekly", "notify_weekly_summary"],
      ["#st-notif-goal-finished", "notify_goal_completed"],
      ["#st-notif-missed-deposit", "notify_missed_deposit"],
      ["#st-notif-overbudget", "notify_over_budget"],
      ["#st-notif-success-month", "notify_success_month"]
    ]

    notifMap.forEach(([sel, key]) => {
      const el = $(sel)
      if (!el) return
      el.addEventListener("change", async e => {
        const nextVal = !!e.target.checked
        const ok = await updateNotification(key, nextVal)
        if (!ok) e.target.checked = !nextVal
      })
    })

    // Ensures an inline status element exists after a given input element.
    function ensureInlineStatusAfterInput(inputEl, id) {
      if (!inputEl) return null
      let el = $("#" + id)
      if (el) return el
      el = document.createElement("div")
      el.id = id
      el.className = "st-status-icon"
      inputEl.insertAdjacentElement("afterend", el)
      return el
    }

    // Sets status icon state for inline statuses.
    function setStatus(el, mode, text = "") {
      if (!el) return
      if (!mode) {
        el.className = "st-status-icon"
        el.textContent = ""
        return
      }
      el.className = "st-status-icon " + mode
      el.textContent = text
    }

    // Evaluates password requirements.
    function evaluatePasswordRules(v) {
      return {
        len: v.length >= 8,
        upper: /[A-Z]/.test(v),
        lower: /[a-z]/.test(v),
        num: /\d/.test(v),
        sym: /[^A-Za-z0-9]/.test(v)
      }
    }

    // Sets requirement list item valid or invalid state.
    function setReqValid(id, ok) {
      const el = $("#" + id)
      if (!el) return
      el.classList.toggle("valid", !!ok)
      el.classList.toggle("invalid", !ok)
    }

    // Hides the password requirement list UI.
    function hideReqList() {
      const reqList = $(".st-pass-req-list")
      if (!reqList) return
      reqList.classList.remove("show")
      reqList.style.display = "none"
    }

    // Shows the password requirement list UI.
    function showReqList() {
      const reqList = $(".st-pass-req-list")
      if (!reqList) return
      reqList.classList.add("show")
      reqList.style.display = "grid"
    }

    // Updates requirement list UI based on password content.
    function updatePasswordReqUI(v) {
      if (!v) {
        hideReqList()
        setReqValid("req-length", false)
        setReqValid("req-upper", false)
        setReqValid("req-lower", false)
        setReqValid("req-num", false)
        setReqValid("req-symbol", false)
        return
      }

      showReqList()
      const r = evaluatePasswordRules(v)
      setReqValid("req-length", r.len)
      setReqValid("req-upper", r.upper)
      setReqValid("req-lower", r.lower)
      setReqValid("req-num", r.num)
      setReqValid("req-symbol", r.sym)
    }

    // Updates new password status icon on blur.
    function updateNewPasswordStatusUI() {
      const np = $("#st-new-pass")?.value || ""
      const icon = $("#st-new-pass-status")
      if (!np) {
        setStatus(icon, "", "")
        return
      }

      const r = evaluatePasswordRules(np)
      const ok = r.len && r.upper && r.lower && r.num && r.sym
      setStatus(icon, ok ? "valid" : "invalid", ok ? "✔" : "✖")
    }

    // Updates confirm password match icon.
    function updateConfirmPasswordUI() {
      const np = $("#st-new-pass")?.value || ""
      const cp = $("#st-confirm-pass")?.value || ""
      const confirmIcon = $("#st-confirm-pass-status")

      if (!cp) {
        setStatus(confirmIcon, "", "")
        return
      }
      if (!np) {
        setStatus(confirmIcon, "invalid", "✖")
        return
      }
      setStatus(confirmIcon, cp === np ? "valid" : "invalid", cp === np ? "✔" : "✖")
    }

    // Resets password modal UI.
    function resetPasswordUI() {
      hideReqList()
      ;["req-length", "req-upper", "req-lower", "req-num", "req-symbol"].forEach(id => setReqValid(id, false))
      setStatus($("#st-old-pass-status"), "", "")
      setStatus($("#st-confirm-pass-status"), "", "")
      setStatus($("#st-new-pass-status"), "", "")
    }

   const resetOldEye = wireEyeToggle("st-old-pass-eye", "st-old-pass")
   const resetNewEye = wireEyeToggle("st-new-pass-eye", "st-new-pass")
   const resetConfirmEye = wireEyeToggle("st-confirm-pass-eye", "st-confirm-pass")

    // Open change password modal.
    const changePassBtn = $("#st-change-password")
    if (changePassBtn) {
      changePassBtn.addEventListener("click", () => {
        const old = $("#st-old-pass")
        const np = $("#st-new-pass")
        const cp = $("#st-confirm-pass")

        if (old) old.value = ""
        if (np) np.value = ""
        if (cp) cp.value = ""

        ensureInlineStatusAfterInput(np, "st-new-pass-status")
        ensureInlineStatusAfterInput(cp, "st-confirm-pass-status")

       resetOldEye()
       resetNewEye()
       resetConfirmEye()

        resetPasswordUI()
        openModal("#st-password-modal")
      })
    }

    // Old password input behavior.
    const oldPass = $("#st-old-pass")
    if (oldPass) {
      oldPass.addEventListener("focus", hideReqList)
      oldPass.addEventListener("input", () => setStatus($("#st-old-pass-status"), "", ""))
    }

    // New password input behavior.
    const newPass = $("#st-new-pass")
    if (newPass) {
      newPass.addEventListener("focus", () => {
        const v = newPass.value || ""
        if (v) updatePasswordReqUI(v)
        setStatus($("#st-new-pass-status"), "", "")
      })

      newPass.addEventListener("input", e => {
        const v = e.target.value || ""
        updatePasswordReqUI(v)
        updateConfirmPasswordUI()
        setStatus($("#st-new-pass-status"), "", "")
      })

      newPass.addEventListener("blur", () => {
        hideReqList()
        updateNewPasswordStatusUI()
      })
    }

    // Confirm password input behavior.
    const confirmPass = $("#st-confirm-pass")
    if (confirmPass) {
      ensureInlineStatusAfterInput(confirmPass, "st-confirm-pass-status")
      confirmPass.addEventListener("focus", hideReqList)
      confirmPass.addEventListener("input", updateConfirmPasswordUI)
    }

    // Save password.
    const savePassBtn = $("#st-password-save")
    if (savePassBtn) {
      savePassBtn.addEventListener("click", async () => {
        const old = $("#st-old-pass")?.value || ""
        const np = $("#st-new-pass")?.value || ""
        const cp = $("#st-confirm-pass")?.value || ""
        const icon = $("#st-old-pass-status")

        const r = evaluatePasswordRules(np)
        const ok = r.len && r.upper && r.lower && r.num && r.sym && np === cp

        if (!old) {
          setStatus(icon, "invalid", "Enter old password")
          return
        }
        if (!np) {
          setStatus(icon, "invalid", "Enter new password")
          return
        }
        if (!ok) {
          setStatus(icon, "invalid", "Requirements not met")
          updateNewPasswordStatusUI()
          return
        }

        const res = await authFetch("/me/password", {
          method: "PUT",
          body: JSON.stringify({ oldPassword: old, newPassword: np })
        })

        if (res.status === 401) {
          setStatus(icon, "invalid", "Old password incorrect")
          return
        }

        if (!res.ok) {
          let msg = "Failed to update"
          try {
            const data = await res.json()
            if (data && data.error) msg = data.error
          } catch {}
          setStatus(icon, "invalid", msg)
          return
        }

        setStatus(icon, "valid", "Updated")
        closeModal($("#st-password-modal"))
      })
    }

    // Change username modal behavior.
    const changeUserBtn = $("#st-change-username")
    const saveUserBtn = $("#st-username-save")
    let usernameCheckTimer = null

    if (changeUserBtn) {
      changeUserBtn.addEventListener("click", () => {
        const cur = $("#st-current-username")
        const nu = $("#st-new-username")
        const status = $("#st-username-status")

        if (cur) cur.value = profile.username || ""
        if (nu) nu.value = ""
        setStatus(status, "", "")

        if (saveUserBtn) saveUserBtn.disabled = true
        openModal("#st-username-modal")
      })
    }

    const newUserInput = $("#st-new-username")
    if (newUserInput) {
      newUserInput.addEventListener("input", e => {
        const val = e.target.value.trim()
        const status = $("#st-username-status")
        if (!status) return

        clearTimeout(usernameCheckTimer)

        if (!val) {
          setStatus(status, "", "")
          if (saveUserBtn) saveUserBtn.disabled = true
          return
        }

        if (profile.username && val.toLowerCase() === profile.username.toLowerCase()) {
          setStatus(status, "invalid", "✖ Same as current")
          if (saveUserBtn) saveUserBtn.disabled = true
          return
        }

        setStatus(status, "", "Checking...")
        if (saveUserBtn) saveUserBtn.disabled = true

        usernameCheckTimer = setTimeout(async () => {
          try {
            const res = await fetch(API_BASE + "/check-username?username=" + encodeURIComponent(val), {
              credentials: "include"
            })

            if (!res.ok) {
              setStatus(status, "invalid", "⚠ Error")
              if (saveUserBtn) saveUserBtn.disabled = true
              return
            }

            const data = await res.json().catch(() => null)
            if (data && data.available) {
              setStatus(status, "valid", "✔ Available")
              if (saveUserBtn) saveUserBtn.disabled = false
            } else {
              setStatus(status, "invalid", "✖ Taken")
              if (saveUserBtn) saveUserBtn.disabled = true
            }
          } catch {
            setStatus(status, "invalid", "⚠ Error")
            if (saveUserBtn) saveUserBtn.disabled = true
          }
        }, 500)
      })
    }

    if (saveUserBtn) {
      saveUserBtn.addEventListener("click", async () => {
        const newU = $("#st-new-username")?.value.trim() || ""
        const status = $("#st-username-status")
        if (!newU) return
        if (profile.username && newU.toLowerCase() === profile.username.toLowerCase()) return
        if (status && status.classList.contains("invalid")) return

        const res = await authFetch("/me/username", {
          method: "PUT",
          body: JSON.stringify({ newUsername: newU })
        })

        if (!res.ok) {
          let msg = "Failed to update username"
          try {
            const data = await res.json()
            if (data && data.error) msg = data.error
          } catch {}
          setStatus(status, "invalid", msg)
          if (saveUserBtn) saveUserBtn.disabled = true
          return
        }

        const data = await res.json().catch(() => ({}))
        profile.username = data.user?.username || newU

        initProfile()
        initUsername()
        closeModal($("#st-username-modal"))
      })
    }

    // Global connect/disconnect Freedom Bank.
    const connectBtn = $("#st-connect-freedom")
    const disconnectDialog = $("#st-disconnect-modal")
    const disconnectConfirm = $("#st-disconnect-confirm")

    if (connectBtn) {
      connectBtn.addEventListener("click", () => {
        const linked = hasLinkedAccounts()

        if (!linked) {
          const e = $("#st-connect-email")
          const p = $("#st-connect-password")
          const m = $("#st-connect-message")
          if (e) e.value = ""
          if (p) p.value = ""
          if (m) {
            m.textContent = ""
            m.className = "st-status-message"
          }
          openModal("#st-connect-fb-modal")
          return
        }

        openModal("#st-disconnect-modal")
      })
    }

    // Submits global Freedom Bank login.
    // Note: To meet your requirement, backend must store tokens but keep both accounts status = 'disconnected'.
    const connectSubmit = $("#st-connect-submit")
    if (connectSubmit) {
      connectSubmit.addEventListener("click", async () => {
        const email = $("#st-connect-email")?.value
        const password = $("#st-connect-password")?.value
        const msg = $("#st-connect-message")
        if (!email || !password) return

        if (msg) {
          msg.textContent = "Connecting..."
          msg.className = "st-status-message"
        }

        try {
          const res = await jsonFetch(ACCOUNTS_API_BASE + "/freedom/connect", {
            method: "POST",
            body: JSON.stringify({ email, password })
          })

          if (res.ok) {
            if (msg) {
              msg.textContent = "Success!"
              msg.className = "st-status-message success"
            }
            await loadAccountsFromBackend()
            setTimeout(() => closeModal($("#st-connect-fb-modal")), 800)
            return
          }

          let t = "Connection Failed"
          try {
            const data = await res.json()
            if (data && data.error) t = data.error
          } catch {}

          if (msg) {
            msg.textContent = t
            msg.className = "st-status-message error"
          }
        } catch {
          if (msg) {
            msg.textContent = "Error"
            msg.className = "st-status-message error"
          }
        }
      })
    }

    // Confirms global disconnect. Should clear tokens but keep data in MySQL.
    if (disconnectConfirm) {
      disconnectConfirm.addEventListener("click", async () => {
        try {
          const res = await jsonFetch(ACCOUNTS_API_BASE + "/freedom/disconnect", { method: "POST" })
          if (res.ok) {
            await loadAccountsFromBackend()
            closeModal(disconnectDialog)
          }
        } catch (e) {
          console.error(e)
        }
      })
    }

    // PATCHes a single account row status (connected or disconnected).
    async function setAccountStatus(id, status) {
      const res = await jsonFetch(`${ACCOUNTS_API_BASE}/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      })
      return res.ok
    }

    // Password Eye Toggle (Settings)
// Same behavior as Signup: click toggles show/hide, blur always hides
function wireEyeToggle(btnId, inputId) {
  const btn = document.getElementById(btnId)
  const input = document.getElementById(inputId)
  if (!btn || !input) return () => {}

  const icon = btn.querySelector("i")

  const setState = (show) => {
    input.setAttribute("type", show ? "text" : "password")
    if (icon) {
      icon.classList.toggle("fa-eye", !show)
      icon.classList.toggle("fa-eye-slash", show)
    }
    btn.setAttribute("aria-label", show ? "Hide password" : "Show password")
  }

  const toggle = () => {
    const show = input.getAttribute("type") === "password"
    setState(show)
    input.focus({ preventScroll: true })
  }

  setState(false)

  const preventBlur = (e) => { e.preventDefault() }
  btn.addEventListener("pointerdown", preventBlur)
  btn.addEventListener("mousedown", preventBlur)
  btn.addEventListener("touchstart", preventBlur, { passive: false })

  btn.addEventListener("click", toggle)
  btn.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return
    e.preventDefault()
    toggle()
  })

  input.addEventListener("blur", () => setState(false))

  return () => setState(false)
}


    // Per-card connect or disconnect controls.
    document.querySelectorAll(".st-acc-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const action = btn.dataset.action
        const id = btn.dataset.id

        // Cards cannot be operated unless global Freedom link exists.
        if (!hasLinkedAccounts()) return
        if (!id) return

        btn.disabled = true
        try {
          const next = action === "disconnect" ? "disconnected" : "connected"
          await setAccountStatus(id, next)
        } finally {
          await loadAccountsFromBackend()
        }
      })
    })

    // Initial UI render before network loads.
    initProfile()
    initUsername()
    initAccounts()
    initNotifications()

    // Load backend state.
    loadProfileFromBackend()
    loadAccountsFromBackend()
    loadNotificationsFromBackend()

    // Reset password UI state on page load.
    resetPasswordUI()
  })
})()
