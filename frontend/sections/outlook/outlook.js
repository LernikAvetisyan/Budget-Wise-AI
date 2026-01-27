(() => {
  const $ = (sel) => document.querySelector(sel);

  const state = {
    current: null,
    loadedCss: new Map(),
    loadedJs: new Map()
  };

  const setHeader = (title, sub) => {
    const t = $("#outlk-title");
    const s = $("#outlk-sub");
    if (t) t.textContent = title || "";
    if (s) s.textContent = sub || "";
  };

  const setHubMode = (isHub) => {
    document.body.classList.toggle("outlk-on-hub", !!isHub);
  };

  const showHub = () => {
    const hub = $("#outlk-hub");
    const content = $("#outlk-content");
    if (hub) hub.classList.remove("outlk-hidden");
    if (content) content.innerHTML = "";
    setHeader("Spending Outlook", "Analyze your financial patterns across different areas");
    setHubMode(true);
    for (const link of state.loadedCss.values()) link.disabled = true;
  };

  const cleanupCurrent = () => {
    try {
      document.querySelectorAll("dialog[open]").forEach((d) => {
        try { d.close(); } catch {}
      });
    } catch {}

    try {
      if (state.current && window.__outlook_pages && window.__outlook_pages[state.current]) {
        window.__outlook_pages[state.current].cleanup?.();
      }
    } catch {}

    state.current = null;
  };

  const ensureCss = (id, hrefUrl) => {
    if (!state.loadedCss.has(id)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = hrefUrl;
      link.dataset.outlk = id;
      document.head.appendChild(link);
      state.loadedCss.set(id, link);
    }

    for (const [key, link] of state.loadedCss.entries()) {
      link.disabled = key !== id;
    }
  };

  const ensureScript = (id, srcUrl) =>
    new Promise((resolve, reject) => {
      if (state.loadedJs.has(id)) return resolve();

      const s = document.createElement("script");
      s.src = srcUrl;
      s.async = true;
      s.dataset.outlk = id;

      s.onload = () => {
        state.loadedJs.set(id, s);
        resolve();
      };
      s.onerror = () => reject(new Error(`Failed to load script: ${srcUrl}`));

      document.body.appendChild(s);
    });

  const looksLikeLoginPage = (htmlText) => {
    const t = String(htmlText || "");
    return /account\s*login/i.test(t) && /<form/i.test(t);
  };

  const openSection = async (key) => {
    cleanupCurrent();

    const hub = $("#outlk-hub");
    const content = $("#outlk-content");
    if (hub) hub.classList.add("outlk-hidden");
    if (!content) return;

    setHubMode(false);

    const defs = {
      activity: {
        title: "Activity Analysis",
        sub: "Income and expense patterns throughout the year",
        html: "/sections/outlook/outlookActivity/outlookActivity.html",
        css: "/sections/outlook/outlookActivity/outlookActivity.css",
        js: "/sections/outlook/outlookActivity/outlookActivity.js",
        rootId: "outlk-activity-root"
      },
      budgets: {
        title: "Budgets Analysis",
        sub: "Track spending against budget limits",
        html: "/sections/outlook/outlookBudgets/outlookBudgets.html",
        css: "/sections/outlook/outlookBudgets/outlookBudgets.css",
        js: "/sections/outlook/outlookBudgets/outlookBudgets.js",
        rootId: "outlk-budgets-root"
      },
      goals: {
        title: "Goals Analysis",
        sub: "Track progress towards your financial goals",
        html: "/sections/outlook/outlookGoals/outlookGoals.html",
        css: "/sections/outlook/outlookGoals/outlookGoals.css",
        js: "/sections/outlook/outlookGoals/outlookGoals.js",
        rootId: "outlk-goals-root"
      }
    };

    const def = defs[key];
    if (!def) return;

    setHeader(def.title, def.sub);

    const htmlUrl = new URL(def.html, window.location.href).toString();
    const cssUrl = new URL(def.css, window.location.href).toString();
    const jsUrl = new URL(def.js, window.location.href).toString();

    let htmlText = "";
    try {
      const res = await fetch(htmlUrl, { credentials: "include" });
      htmlText = await res.text();
    } catch {
      htmlText = "";
    }

    if (!htmlText || looksLikeLoginPage(htmlText)) {
      content.innerHTML = `
        <div style="padding:16px;border:1px solid rgba(148,163,184,0.35);border-radius:18px;background:rgba(15,23,42,0.95)">
          <div style="font-weight:900;margin-bottom:8px;color:rgba(230,238,247,0.95)">This section URL is returning the Login page</div>
          <div style="color:rgba(144,166,188,0.95);font-weight:650;line-height:1.5">
            This usually means the path is wrong or your server is routing unknown paths to the login page.
            Requested: ${htmlUrl}
          </div>
        </div>
      `;
      return;
    }

    ensureCss(key, cssUrl);
    content.innerHTML = htmlText;

    try {
      await ensureScript(key, jsUrl);
    } catch (e) {
      content.innerHTML = `
        <div style="padding:16px;border:1px solid rgba(148,163,184,0.35);border-radius:18px;background:rgba(15,23,42,0.95)">
          <div style="font-weight:900;margin-bottom:8px;color:rgba(230,238,247,0.95)">Failed to load section script</div>
          <div style="color:rgba(144,166,188,0.95);font-weight:650;line-height:1.5">${String(e.message || e)}</div>
        </div>
      `;
      return;
    }

    state.current = key;

    try {
      const api = window.__outlook_pages?.[key];

      if (key === "budgets") {
        api?.cleanup?.();
      }

      api?.init?.({ rootId: def.rootId });
    } catch (e) {
      content.innerHTML = `
        <div style="padding:16px;border:1px solid rgba(148,163,184,0.35);border-radius:18px;background:rgba(15,23,42,0.95)">
          <div style="font-weight:900;margin-bottom:8px;color:rgba(230,238,247,0.95)">Section init error</div>
          <div style="color:rgba(144,166,188,0.95);font-weight:650;line-height:1.5">${String(e.message || e)}</div>
        </div>
      `;
    }
  };

  const wire = () => {
    $("#outlk-card-activity")?.addEventListener("click", () => openSection("activity"));
    $("#outlk-card-budgets")?.addEventListener("click", () => openSection("budgets"));
    $("#outlk-card-goals")?.addEventListener("click", () => openSection("goals"));

    $("#outlk-back")?.addEventListener("click", () => {
      cleanupCurrent();
      showHub();
    });
  };

  const resetOutlookDefault = () => {
    const hub = $("#outlk-hub");
    const isHubVisible = hub && !hub.classList.contains("outlk-hidden");
    if (!isHubVisible) return;
    cleanupCurrent();
    showHub();
  };

  window.addEventListener("pageshow", resetOutlookDefault);

  window.addEventListener("focus", () => {
    const hub = $("#outlk-hub");
    const isHubVisible = hub && !hub.classList.contains("outlk-hidden");
    if (isHubVisible) resetOutlookDefault();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    const hub = $("#outlk-hub");
    const isHubVisible = hub && !hub.classList.contains("outlk-hidden");
    if (isHubVisible) resetOutlookDefault();
  });

  window.__outlook_reset_default = resetOutlookDefault;

window.addEventListener("section:show", (e) => {
  if (e?.detail?.section === "outlook") {
    cleanupCurrent();
    showHub();

    fetch("/api/rewards/trigger", {
      method: "POST",
      credentials: "include",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: "outlook-all" })
    }).catch(() => {})
  }
});

  window.addEventListener("section:unmount", (e) => {
    if (e?.detail?.section === "outlook") {
      cleanupCurrent();
    }
  });

showHub();
wire();

fetch("/api/rewards/trigger", {
  method: "POST",
  credentials: "include",
  headers: { "Accept": "application/json", "Content-Type": "application/json" },
  body: JSON.stringify({ taskId: "outlook-all" })
}).catch(() => {})

})();