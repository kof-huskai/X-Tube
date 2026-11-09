/* X Tube shared runtime: settings, messaging, tiny DOM helper and the UI kit used by every surface. */
var TM = (() => {
  const LOGO = "data:image/png;base64,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";
  const DEFAULTS = {
    geminiKey: "", model: "gemini-2.5-flash", language: "auto", theme: "system",
    autoSuggest: true, showWatchTags: true, showStudioAssistant: true
  };

  /* ---------- icons (24x24 stroke paths) ---------- */
  const ICONS = {
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    minus: '<path d="M5 12h14"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x2: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>',
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    text: '<path d="M17 6.1H3M21 12.1H3M15.1 18H3"/>',
    chart: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 8 10 8a13.2 13.2 0 0 1-1.67 2.68M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.39-1.61M2 2l20 20M14.12 14.12a3 3 0 1 1-4.24-4.24"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4"/>',
    trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    chef: '<path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 9.18 0A4 4 0 0 1 18 13.87V21H6z"/><path d="M6 17h12"/>'
  };
  const icon = (name, size) => {
    const s = document.createElement("span"); s.className = "tm-ic";
    s.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
    if (size) { s.style.width = s.style.height = size + "px"; }
    return s;
  };

  /* ---------- tiny hyperscript (never uses innerHTML for text -> AI output is XSS-safe) ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "value") el.value = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  /* ---------- settings ---------- */
  async function getSettings() {
    try { const { settings } = await chrome.storage.local.get("settings"); return { ...DEFAULTS, ...(settings || {}) }; }
    catch { return { ...DEFAULTS }; }
  }
  async function saveSettings(patch) {
    const s = { ...(await getSettings()), ...patch };
    await chrome.storage.local.set({ settings: s }); return s;
  }
  function onSettings(cb) {
    chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch.settings) cb({ ...DEFAULTS, ...(ch.settings.newValue || {}) }); });
  }
  const applyTheme = (el, theme) => el.setAttribute("data-theme", ["light", "dark"].includes(theme) ? theme : "system");

  /* ---------- messaging to the background worker ---------- */
  function call(type, payload) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type, ...(payload || {}) }, r => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!r) return reject(new Error("No response from the extension. Reload the page and try again."));
          if (r.error) { const e = new Error(r.error); e.code = r.code; e.attempts = r.attempts; return reject(e); }
          resolve(r.data);
        });
      } catch (e) { reject(new Error("The extension was updated. Reload this page.")); }
    });
  }

  /* ---------- helpers ---------- */
  function trimTags(tags, limit = 500) {
    const out = [], seen = new Set(); let len = 0;
    for (const raw of tags || []) {
      const t = String(raw).replace(/^#/, "").trim();
      if (!t || t.length > 30 || seen.has(t.toLowerCase())) continue;
      const add = t.length + (t.includes(" ") ? 2 : 0) + (out.length ? 1 : 0);
      if (len + add > limit) break;
      out.push(t); seen.add(t.toLowerCase()); len += add;
    }
    return out;
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    const ta = h("textarea", { style: "position:fixed;opacity:0" }); ta.value = text; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch {} ta.remove(); return ok;
  }
  function toast(host, msg) {
    host.querySelectorAll(":scope > .tm-toast").forEach(t => t.remove());
    const t = h("div", { class: "tm-toast", role: "status" }, msg); host.append(t); setTimeout(() => t.remove(), 2200);
  }

  /* ---------- UI kit ---------- */
  const ui = {
    button({ label, icon: ic, variant = "soft", size, block, onClick, title, disabled }) {
      return h("button", { type: "button", class: ["tm-btn", variant === "primary" && "tm-btn--primary", variant === "ghost" && "tm-btn--ghost", variant === "danger" && "tm-btn--danger",
        size === "sm" && "tm-btn--sm", block && "tm-btn--block"].filter(Boolean).join(" "), title, disabled, onClick }, ic && icon(ic, 15), label);
    },
    iconButton(name, title, onClick) {
      return h("button", { type: "button", class: "tm-icon-btn", title, "aria-label": title, onClick }, icon(name, 16));
    },
    copyButton(getText, notify) {
      const b = ui.iconButton("copy", "Copy", async () => {
        const ok = await copy(typeof getText === "function" ? getText() : getText);
        b.replaceChildren(icon(ok ? "check" : "x", 16)); b.classList.add("is-done"); notify && notify(ok ? "Copied" : "Copy failed");
        setTimeout(() => { b.replaceChildren(icon("copy", 16)); b.classList.remove("is-done"); }, 1200);
      });
      return b;
    },
    chip(text, notify) {
      const c = h("button", { type: "button", class: "tm-chip", title: "Click to copy", onClick: async () => {
        const ok = await copy(text); c.classList.add("is-done"); notify && notify(ok ? "Copied" : "Copy failed"); setTimeout(() => c.classList.remove("is-done"), 900);
      } }, text);
      return c;
    },
    chips(list, notify) { return h("div", { class: "tm-chips" }, (list || []).map(t => ui.chip(t, notify))); },
    item(text, { sub, actions = [], notify, noCopy } = {}) {
      return h("div", { class: "tm-item" }, h("div", { class: "tm-item-text", dir: "auto" }, text, sub && h("small", null, sub)),
        !noCopy && ui.copyButton(text, notify), ...actions);
    },
    card(title, body, actions) {
      return h("section", { class: "tm-card" }, (title || actions) && h("div", { class: "tm-card-head" }, h("h3", { class: "tm-h" }, title || ""), actions ? h("div", { class: "tm-row" }, actions) : null), body);
    },
    banner(kind, text, actions) {
      return h("div", { class: `tm-banner tm-banner--${kind}`, role: kind === "error" ? "alert" : "status" }, icon(kind === "ok" ? "check" : "alert", 16),
        h("div", { class: "tm-banner-body" }, h("span", null, text), actions && h("div", { class: "tm-row" }, actions)));
    },
    spinner(text) { return h("div", { class: "tm-spin", role: "status" }, text || "Working…"); },
    empty(title, sub) { return h("div", { class: "tm-empty" }, icon("chef", 28), h("b", null, title), sub && h("span", null, sub)); },
    score(n) {
      const v = Math.max(0, Math.min(100, Math.round(n)));
      return h("div", { class: `tm-score tm-score--${v >= 75 ? "good" : v >= 50 ? "mid" : "bad"}`, style: `--v:${v}`, role: "img", "aria-label": `Score ${v} out of 100` }, h("span", null, v));
    },
    field(label, control, hint) { return h("label", { class: "tm-field" }, h("span", { class: "tm-label" }, label), control, hint && h("span", { class: "tm-hint" }, hint)); },
    check(pass, text, sub) { return h("div", { class: `tm-check tm-check--${pass ? "pass" : "fail"}` }, icon(pass ? "check" : "x2", 16), h("div", null, text, sub && h("small", null, sub))); },
    header({ title, sub, actions }) {
      return h("header", { class: "tm-header" }, h("img", { class: "tm-logo", src: LOGO, alt: "", width: 28, height: 28 }),
        h("div", { class: "tm-title" }, title, sub && h("small", null, sub)), ...(actions || []));
    },

    /* Chapter generator card: shared by the Studio window and the side panel. */
    chapterGenerator({ getInfo, onInsert, canInsert, notify, onOpenSettings }) {
      const text = h("textarea", { class: "tm-textarea", rows: 4, dir: "auto", placeholder: "Optional: paste a transcript / SRT with timestamps, or rough notes like “2:10 editing basics”" });
      const status = h("div", { class: "tm-banner" });
      const out = h("div", { style: "display:flex;flex-direction:column;gap:10px" });
      const paint = () => {
        const { videoId } = getInfo() || {};
        status.replaceChildren(icon(videoId ? "check" : "alert", 16), h("div", { class: "tm-banner-body" },
          h("span", null, h("b", null, "Needs: "), "a published video with captions, or a transcript with timestamps pasted below."),
          h("span", { class: "tm-hint" }, videoId ? "Video detected. Order: your text → captions → AI video analysis (public videos)." : "No published video detected (fresh uploads have no captions yet), so paste a transcript or timestamp notes.")));
      };
      const btn = ui.button({ label: "Generate chapters", icon: "list", variant: "primary", onClick: run });
      async function run() {
        const info = getInfo() || {}; btn.disabled = true;
        out.replaceChildren(ui.spinner("Trying your text, captions, then AI video analysis… this can take up to a minute"));
        try { render(await call("CHAPTERS", { videoId: info.videoId || "", duration: info.duration || 0, tracks: info.tracks || [], text: text.value })); }
        catch (e) { out.replaceChildren(ui.banner("error", e.message, ["NO_KEY", "BAD_KEY", "BAD_MODEL"].includes(e.code) && onOpenSettings ? [ui.button({ label: "Open settings", icon: "settings", size: "sm", onClick: onOpenSettings })] : null)); }
        btn.disabled = false;
      }
      function render(r) {
        const log = r.attempts.length ? h("div", { class: "tm-list" }, r.attempts.map(a => ui.check(a.ok, a.method, a.note))) : null;
        if (!r.ok) {
          out.replaceChildren(ui.banner("warn", "Couldn't generate chapters automatically. I need one of these:", null),
            h("div", { class: "tm-list" }, r.needs.map(n => h("div", { class: "tm-item" }, h("div", { class: "tm-item-text", dir: "auto" }, n)))), log);
          text.focus(); return;
        }
        const ta = h("textarea", { class: "tm-textarea", rows: Math.min(14, r.chapters.length + 1), dir: "auto" }); ta.value = r.text;
        out.replaceChildren(ui.banner("ok", `${r.chapters.length} chapters from ${r.source}. Edit freely before inserting.`, null), ta,
          h("div", { class: "tm-row" }, canInsert && canInsert() && ui.button({ label: "Insert in description", icon: "arrow", variant: "primary", size: "sm", onClick: () => onInsert(ta.value) }),
            ui.button({ label: "Copy", icon: "copy", size: "sm", onClick: async () => notify && notify((await copy(ta.value)) ? "Chapters copied" : "Copy failed") }),
            ui.button({ label: "Regenerate", icon: "refresh", size: "sm", onClick: run })), log);
      }
      const card = ui.card("Chapters", [status, ui.field("Transcript or timestamps (optional)", text), h("div", { class: "tm-row" }, btn), out]);
      card.paintInfo = paint; paint(); return card;
    },
    /* The suggestion blocks are shared by the side panel and the Studio window, so they always look & behave the same. */
    titleList(titles, { onUse, notify, onRefresh }) {
      return ui.card("Title ideas", h("div", { class: "tm-list" }, (titles || []).map(t => ui.item(t, { notify, actions: onUse ? [ui.button({ label: "Use", variant: "primary", size: "sm", onClick: () => onUse(t) })] : [] }))),
        onRefresh ? [ui.button({ label: "Refresh", icon: "refresh", size: "sm", onClick: onRefresh })] : null);
    },
    tagBlock(tags, { onApply, notify }) {
      const list = trimTags(tags);
      return ui.card(`Tags (${list.length}/500 chars)`, [ui.chips(list, notify),
        h("div", { class: "tm-row" }, onApply && ui.button({ label: "Insert tags", icon: "tag", variant: "primary", size: "sm", onClick: () => onApply(list) }),
          ui.button({ label: "Copy all", icon: "copy", size: "sm", onClick: async () => notify && notify((await copy(list.join(", "))) ? "Tags copied" : "Copy failed") }))]);
    }
  };


  /* Local SEO checks (no AI, deterministic) */
  function auditVideo(v) {
    const title = v.title || "", desc = v.description || "", tags = v.tags || [];
    const words = tags.join(" ").toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const hit = s => words.some(w => s.toLowerCase().includes(w));
    const tagChars = tags.join(",").length;
    const hashtags = (desc.match(/(^|\s)#[^\s#]{2,}/g) || []).length;
    const checks = [
      { pass: title.length >= 30 && title.length <= 70, text: "Title length 30–70 characters", sub: `Now: ${title.length}` },
      { pass: !!title && hit(title), text: "Title contains a main keyword from the tags" },
      { pass: tags.length >= 8 && tags.length <= 25, text: "8–25 tags", sub: `Now: ${tags.length}` },
      { pass: tagChars <= 500, text: "Tags within 500 characters", sub: `Now: ${tagChars}` },
      { pass: desc.length >= 250, text: "Description at least 250 characters", sub: `Now: ${desc.length}` },
      { pass: !!desc && hit(desc.slice(0, 160)), text: "Keyword appears in the first 160 characters of the description" },
      { pass: hashtags >= 1 && hashtags <= 5, text: "1–5 hashtags in the description", sub: `Now: ${hashtags}` }
    ];
    return { checks, score: (checks.filter(c => c.pass).length / checks.length) * 100 };
  }

  return { DEFAULTS, icon, h, getSettings, saveSettings, onSettings, applyTheme, call, trimTags, copy, toast, ui, auditVideo };
})();
