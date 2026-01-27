// frontend/sections/assistant/assistant.js
// 1) Assistant Chat UI logic
//    This file wires your Assistant UI to the backend endpoints (/api/assistant/*).
//    It sends chat messages, renders replies, and supports the confirm step.
//
// Fixes in this version:
// - Always mounts if core elements exist (no silent failure because chips missing)
// - Mounts immediately on load and also listens for section:mounted
// - Preserves multi-line replies (pre-wrap) without using innerHTML
// - Confirm button uses /api/assistant/confirm if available, otherwise falls back to sending "confirm" to /api/assistant/chat
// - Prevents double-binding via cleanup + mounted flag

;(() => {
  if (window.__assistant && typeof window.__assistant.cleanup === "function") {
    window.__assistant.cleanup()
  }

  const $ = (id) => document.getElementById(id)

  let modeCards = []
  let currentMode = "advisor"
  let pending = null
  let busy = false
  let mounted = false

  function getEls() {
    return {
      chatWindow: $("ai-chat-window"),
      chatInput: $("ai-chat-input"),
      sendBtn: $("ai-send-btn"),
      suggestionChips: $("ai-suggestion-chips"),
      pendingWrap: $("ai-pending-actions"),
      pendingTextEl: $("ai-pending-text"),
      confirmBtn: $("ai-confirm-btn"),
      cancelBtn: $("ai-cancel-btn")
    }
  }

  function normalizeReplyText(x) {
    const v = x == null ? "" : String(x)
    return v.trim() ? v : "OK."
  }

  function isConfirmablePending() {
    return !!(pending && pending.stage === "need_confirm" && pending.requestId && pending.draft)
  }

  function setBusy(nextBusy) {
    busy = !!nextBusy
    const { sendBtn, chatInput, confirmBtn, cancelBtn } = getEls()
    if (sendBtn) sendBtn.disabled = busy
    if (chatInput) chatInput.disabled = busy
    if (confirmBtn) confirmBtn.disabled = busy || !isConfirmablePending()
    if (cancelBtn) cancelBtn.disabled = busy || !pending
  }

  function addMessage(sender, text) {
    const { chatWindow } = getEls()
    if (!chatWindow) return

    const messageEl = document.createElement("div")
    messageEl.className = `chat-message ${sender}-message`

    const bubble = document.createElement("div")
    bubble.className = "message-bubble"
    bubble.textContent = String(text ?? "")

    // Preserve new lines without HTML injection
    bubble.style.whiteSpace = "pre-wrap"
    bubble.style.wordBreak = "break-word"

    messageEl.appendChild(bubble)
    chatWindow.appendChild(messageEl)
    chatWindow.scrollTop = chatWindow.scrollHeight
  }

  function showTypingIndicator() {
    const { chatWindow } = getEls()
    if (!chatWindow) return

    const existing = chatWindow.querySelector(".typing-indicator")
    if (existing) existing.remove()

    const indicator = document.createElement("div")
    indicator.className = "chat-message ai-message typing-indicator"
    indicator.innerHTML = '<div class="message-bubble"><span></span><span></span><span></span></div>'
    chatWindow.appendChild(indicator)
    chatWindow.scrollTop = chatWindow.scrollHeight
  }

  function hideTypingIndicator() {
    const { chatWindow } = getEls()
    if (!chatWindow) return
    const existing = chatWindow.querySelector(".typing-indicator")
    if (existing) existing.remove()
  }

  function renderPendingBar() {
    const { pendingWrap, pendingTextEl } = getEls()
    if (!pendingWrap || !pendingTextEl) return

    if (!pending) {
      pendingWrap.style.display = "none"
      pendingTextEl.textContent = ""
      setBusy(busy)
      return
    }

    const stage = String(pending.stage || "")
    const d = pending.draft && typeof pending.draft === "object" ? pending.draft : {}

    if (stage === "need_confirm") {
      const type = d.type ? String(d.type) : ""
      const amount = d.amount != null ? Number(d.amount) : 0
      const merchant = d.merchant ? String(d.merchant) : "(none)"
      const category = d.category ? String(d.category) : "(none)"
      const date = d.date ? String(d.date) : ""

      pendingTextEl.textContent =
        `Ready to create: ${type} $${Number.isFinite(amount) ? amount.toFixed(2) : "0.00"} ` +
        `at ${merchant}, category ${category}${date ? `, date ${date}` : ""}.`
    } else if (stage === "need_type") {
      pendingTextEl.textContent = `Pending: please reply "income" or "expense".`
    } else if (stage === "need_category") {
      pendingTextEl.textContent = `Pending: please reply with a category (example: Dining, Groceries).`
    } else {
      pendingTextEl.textContent = `Pending action required.`
    }

    pendingWrap.style.display = "block"
    setBusy(busy)
  }

  async function postJson(url, body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "include",
      body: JSON.stringify(body || {})
    })

    const text = await r.text().catch(() => "")
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = null
    }

    if (!r.ok) {
      const msg =
        data && (data.error || data.message)
          ? String(data.error || data.message)
          : text && String(text).trim()
            ? String(text).trim()
            : `Request failed (${r.status})`
      const err = new Error(msg)
      err.status = r.status
      throw err
    }

    return data || {}
  }

  async function sendToAssistant(message) {
    const payload = { message, mode: currentMode, pending }
    return await postJson("/api/assistant/chat", payload)
  }

  async function confirmPending() {
    if (!isConfirmablePending()) return null

    const requestId = String(pending.requestId || "").trim()
    const draft = pending.draft && typeof pending.draft === "object" ? pending.draft : null
    if (!requestId || !draft) return null

    // Try the direct confirm endpoint first
    try {
      return await postJson("/api/assistant/confirm", { requestId, draft })
    } catch (e) {
      // If backend does not have /confirm, fall back to chat-confirm
      if (e && e.status === 404) {
        return await sendToAssistant("confirm")
      }
      throw e
    }
  }

  async function handleSendMessage(textOverride) {
    const { chatInput } = getEls()
    if (!chatInput || busy) return

    const text = String(textOverride != null ? textOverride : chatInput.value || "").trim()
    if (!text) return

    addMessage("user", text)
    if (textOverride == null) chatInput.value = ""

    setBusy(true)
    showTypingIndicator()

    try {
      const res = await sendToAssistant(text)
      hideTypingIndicator()

      const reply = normalizeReplyText(res.reply || res.message)
      addMessage("ai", reply)

      pending = res.pending && typeof res.pending === "object" ? res.pending : null
      renderPendingBar()
    } catch (e) {
      hideTypingIndicator()
      addMessage("ai", `Error: ${normalizeReplyText(e && e.message)}`)
      pending = null
      renderPendingBar()
    } finally {
      setBusy(false)
      const { chatInput: ci } = getEls()
      if (ci) ci.focus()
    }
  }

  function handleInputKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault()
      handleSendMessage()
    }
  }

  function handleChipClick(e) {
    const chip = e.target && e.target.closest ? e.target.closest("button.chip") : null
    if (!chip) return
    const text = String(chip.textContent || "").trim()
    if (!text || busy) return
    handleSendMessage(text)
  }

  function handleModeClick(e) {
    const clicked = e.currentTarget
    if (!clicked) return

    modeCards.forEach((card) => card.classList.remove("is-active"))
    clicked.classList.add("is-active")
    currentMode = clicked.getAttribute("data-mode") || "advisor"
  }

  async function handleConfirmClick() {
    if (busy) return
    if (!isConfirmablePending()) return

    setBusy(true)
    showTypingIndicator()

    try {
      const res = await confirmPending()
      hideTypingIndicator()

      const reply = normalizeReplyText((res && (res.reply || res.message)) || "Confirmed. Transaction created.")
      addMessage("ai", reply)

      pending = null
      renderPendingBar()
    } catch (e) {
      hideTypingIndicator()
      addMessage("ai", `Error: ${normalizeReplyText(e && e.message)}`)
    } finally {
      setBusy(false)
      const { chatInput } = getEls()
      if (chatInput) chatInput.focus()
    }
  }

  function handleCancelClick() {
    if (busy) return
    if (!pending) return

    pending = null
    renderPendingBar()
    addMessage("ai", "Canceled. Send a new transaction message when you are ready.")
    const { chatInput } = getEls()
    if (chatInput) chatInput.focus()
  }

  function mount() {
    if (mounted) return

    const { chatWindow, chatInput, sendBtn } = getEls()

    // Only require the core pieces to mount
    if (!chatWindow || !chatInput || !sendBtn) return

    mounted = true

    sendBtn.addEventListener("click", () => handleSendMessage())
    chatInput.addEventListener("keydown", handleInputKeydown)

    const { suggestionChips, confirmBtn, cancelBtn } = getEls()

    if (suggestionChips) suggestionChips.addEventListener("click", handleChipClick)
    if (confirmBtn) confirmBtn.addEventListener("click", handleConfirmClick)
    if (cancelBtn) cancelBtn.addEventListener("click", handleCancelClick)

    modeCards = Array.from(document.querySelectorAll(".mode-card"))
    modeCards.forEach((card) => card.addEventListener("click", handleModeClick))

    renderPendingBar()

    const sec = document.querySelector(".assistant-section")
    if (sec) sec.classList.add("ready")
  }

  function cleanup() {
    if (!mounted) return
    mounted = false

    const { sendBtn, chatInput, suggestionChips, confirmBtn, cancelBtn } = getEls()

    if (sendBtn) sendBtn.replaceWith(sendBtn.cloneNode(true))
    if (chatInput) chatInput.replaceWith(chatInput.cloneNode(true))
    if (suggestionChips) suggestionChips.replaceWith(suggestionChips.cloneNode(true))
    if (confirmBtn) confirmBtn.replaceWith(confirmBtn.cloneNode(true))
    if (cancelBtn) cancelBtn.replaceWith(cancelBtn.cloneNode(true))

    modeCards = []
    pending = null
    busy = false
  }

  function boot() {
    mount()

    window.addEventListener("section:mounted", (e) => {
      if (e && e.detail && e.detail.section === "assistant") mount()
    })

    const obs = new MutationObserver(() => mount())
    obs.observe(document.documentElement, { childList: true, subtree: true })
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot)
  else boot()

  window.__assistant = { cleanup }
})()
