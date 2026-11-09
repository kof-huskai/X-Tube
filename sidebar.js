(() => {
  const { h, ui, icon } = TM;
  const app = document.getElementById("app");
  const notify = m => TM.toast(app, m);
  let S = { ...TM.DEFAULTS };
  let ctx = { kind: "other" };
  const subs = new Set();

  /* ---------- active tab context ---------- */
  async function refreshCtx() {
    let next = { kind: "other" };
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab && tab.id && /^https:\/\/(www|studio)\.youtube\.com\//.test(tab.url || "")) {
        try { next = { ...(await chrome.tabs.sendMessage(tab.id, { type: "GET_CONTEXT" })), tabId: tab.id }; }
        catch { next = { kind: "other", stale: true }; }
      }
    } catch {}
    const changed = JSON.stringify([ctx.kind, ctx.videoId, ctx.tabId]) !== JSON.stringify([next.kind, next.videoId, next.tabId]);
    ctx = next; if (changed) subs.forEach(f => f());
  }
  chrome.tabs.onActivated.addListener(refreshCtx);
  chrome.tabs.onUpdated.addListener((_id, info) => { if (info.status === "complete" || info.url) refreshCtx(); });
  setInterval(refreshCtx, 2500);

  async function toStudio(payload) {
    if (ctx.kind !== "studio") return notify("Open YouTube Studio (upload or edit page) first");
    try {
      const r = await chrome.tabs.sendMessage(ctx.tabId, { type: "APPLY", ...payload });
      notify(r && r.ok ? "Applied in Studio" : (r && r.error) || "Could not apply");
    } catch { notify("Reload the Studio tab, then try again"); }
  }
  const studioBtn = (label, payload, extra = {}) => ctx.kind === "studio" ? ui.button({ label, icon: "arrow", size: "sm", variant: "primary", onClick: () => toStudio(payload()), ...extra }) : null;
  const errBanner = e => ui.banner("error", e.message, ["NO_KEY", "BAD_KEY", "BAD_MODEL"].includes(e.code) ? [ui.button({ label: "Open settings", icon: "settings", size: "sm", onClick: () => showSettings(true) })] : null);

  /* ---------- tabs ---------- */
  const tabs = [];
  const panels = {};
  const tabBar = h("div", { class: "tm-tabs", role: "tablist" });
  const main = h("main", { class: "tm-main" });
  const arrowPrev = h("button", { type: "button", class: "tm-tabs-arrow tm-tabs-arrow--prev", tabindex: "-1", "aria-label": "Scroll tabs left", title: "Previous tabs" }, icon("arrow", 16));
  const arrowNext = h("button", { type: "button", class: "tm-tabs-arrow tm-tabs-arrow--next", tabindex: "-1", "aria-label": "Scroll tabs right", title: "More tabs" }, icon("arrow", 16));
  const tabsWrap = h("div", { class: "tm-tabs-wrap" }, arrowPrev, tabBar, arrowNext);
  (function tabScroll() {
    const step = () => Math.max(120, tabBar.clientWidth * 0.6);
    const update = () => {
      const max = tabBar.scrollWidth - tabBar.clientWidth;
      arrowPrev.classList.toggle("is-on", tabBar.scrollLeft > 2);
      arrowNext.classList.toggle("is-on", tabBar.scrollLeft < max - 2);
    };
    arrowPrev.addEventListener("click", () => tabBar.scrollBy({ left: -step(), behavior: "smooth" }));
    arrowNext.addEventListener("click", () => tabBar.scrollBy({ left: step(), behavior: "smooth" }));
    tabBar.addEventListener("scroll", update, { passive: true });
    // mouse wheel (vertical) scrolls the tab strip sideways
    tabsWrap.addEventListener("wheel", e => {
      if (tabBar.scrollWidth <= tabBar.clientWidth) return;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return; e.preventDefault();
      tabBar.style.scrollBehavior = "auto"; tabBar.scrollLeft += d; requestAnimationFrame(() => { tabBar.style.scrollBehavior = ""; });
    }, { passive: false });
    new ResizeObserver(update).observe(tabBar); addEventListener("resize", update);
    window.TM_updateTabArrows = update; setTimeout(update, 0);
  })();
  let activeTab = "titles";
  function addTab(id, label, ic, build) {
    const btn = h("button", { type: "button", class: "tm-tab", role: "tab", id: "tab-" + id, "aria-selected": "false", onClick: () => selectTab(id) }, icon(ic, 15), label);
    const panel = h("section", { role: "tabpanel", hidden: true, style: "display:flex;flex-direction:column;gap:14px" });
    const api = build(panel) || {};
    tabs.push({ id, btn, panel, api }); panels[id] = panel; tabBar.append(btn); main.append(panel);
  }
  function selectTab(id) {
    if (!panels[id]) return;
    activeTab = id;
    for (const t of tabs) { const on = t.id === id; t.btn.setAttribute("aria-selected", on); t.panel.hidden = !on; if (on && t.api.onShow) t.api.onShow(); if (on) t.btn.scrollIntoView({ block: "nearest", inline: "nearest" }); }
  }
  subs.add(() => tabs.forEach(t => t.api.onCtx && t.api.onCtx()));

  /* ===== Titles & Tags ===== */
  addTab("titles", "Titles & Tags", "sparkles", p => {
    const input = h("textarea", { class: "tm-textarea", rows: 2, dir: "auto", placeholder: "e.g. آموزش ساخت کانال یوتیوب از صفر" });
    const extra = h("textarea", { class: "tm-textarea", rows: 2, dir: "auto", placeholder: "Optional: what is the video about?" });
    const out = h("div", { style: "display:flex;flex-direction:column;gap:14px" });
    const hint = h("div"), useBtnWrap = h("span");
    let last = null, seen = [], req = 0;
    async function run(refresh) {
      const title = input.value.trim(); if (title.length < 3) return notify("Type a title or topic first");
      if (refresh && last) seen.push(...last.titles); else if (!refresh) seen = [];
      const my = ++req; out.replaceChildren(ui.spinner("Generating ideas with Gemini…"));
      try {
        const r = last = await TM.call("TITLES_TAGS", { title, description: extra.value, avoid: seen });
        if (my !== req) return; render(r);
      } catch (e) { if (my === req) out.replaceChildren(errBanner(e)); }
    }
    function render(r) {
      out.replaceChildren(
        ui.titleList(r.titles, { notify, onRefresh: () => run(true), onUse: ctx.kind === "studio" ? t => toStudio({ title: t }) : null }),
        ui.tagBlock(r.tags, { notify, onApply: ctx.kind === "studio" ? l => toStudio({ tags: l }) : null }));
    }
    function paintHint() {
      hint.replaceChildren(ctx.kind === "studio" ? ui.banner("ok", "YouTube Studio detected — results can be inserted directly.", [ui.button({ label: "Use Studio title", size: "sm", onClick: () => { input.value = ctx.title || ""; } })]) : "");
      if (last) render(last);
    }
    p.append(hint, ui.card(null, [ui.field("Video title or topic", input), ui.field("Context (optional)", extra),
      h("div", { class: "tm-row" }, ui.button({ label: "Generate", icon: "sparkles", variant: "primary", onClick: () => run(false) }))]), out);
    input.addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) run(false); });
    paintHint();
    window.TM_prefillTitle = t => { input.value = t; input.focus(); };
    return { onCtx: paintHint };
  });

  /* ===== Description ===== */
  addTab("desc", "Description", "text", p => {
    const title = h("input", { class: "tm-input", dir: "auto", placeholder: "Video title" });
    const tags = h("input", { class: "tm-input", dir: "auto", placeholder: "tag one, tag two, …" });
    const notes = h("textarea", { class: "tm-textarea", rows: 3, dir: "auto", placeholder: "Key points, what viewers learn, links you want to add…" });
    const out = h("div", { style: "display:flex;flex-direction:column;gap:14px" });
    const hint = h("div");
    async function run() {
      if (title.value.trim().length < 3) return notify("Enter the video title first");
      out.replaceChildren(ui.spinner("Writing description…"));
      try {
        const r = await TM.call("DESCRIPTION", { title: title.value, tags: tags.value.split(/[,،]/).map(s => s.trim()).filter(Boolean), notes: notes.value });
        const ta = h("textarea", { class: "tm-textarea", rows: 12, dir: "auto" }); ta.value = r.description;
        out.replaceChildren(ui.card("Description", [ta, h("div", { class: "tm-row" },
          ui.button({ label: "Copy", icon: "copy", size: "sm", onClick: async () => notify((await TM.copy(ta.value)) ? "Copied" : "Copy failed") }),
          ui.button({ label: "Regenerate", icon: "refresh", size: "sm", onClick: run }),
          studioBtn("Insert in Studio", () => ({ description: ta.value })))]));
      } catch (e) { out.replaceChildren(errBanner(e)); }
    }
    function paint() { hint.replaceChildren(ctx.kind === "studio" ? ui.banner("ok", "Studio detected.", [ui.button({ label: "Use Studio title", size: "sm", onClick: () => { title.value = ctx.title || ""; } })]) : ""); }
    p.append(hint, ui.card(null, [ui.field("Title", title), ui.field("Tags (optional)", tags), ui.field("Notes (optional)", notes),
      h("div", { class: "tm-row" }, ui.button({ label: "Write description", icon: "sparkles", variant: "primary", onClick: run }))]), out);
    paint(); return { onCtx: paint };
  });

  /* ===== Keywords ===== */
  addTab("keywords", "Keywords", "search", p => {
    const seed = h("input", { class: "tm-input", dir: "auto", placeholder: "e.g. یوتیوب or video editing" });
    const out = h("div", { style: "display:flex;flex-direction:column;gap:14px" });
    async function run() {
      if (seed.value.trim().length < 2) return notify("Enter a keyword");
      out.replaceChildren(ui.spinner("Reading YouTube suggestions…"));
      try {
        const r = await TM.call("KEYWORDS", { seed: seed.value });
        const nodes = [ui.card(`Real YouTube searches (${r.found.length})`, r.found.length ? ui.chips(r.found, notify) : h("span", { class: "tm-hint" }, "No suggestions found for this keyword."),
          r.found.length ? [ui.copyButton(r.found.join(", "), notify)] : null)];
        if (r.aiError) nodes.push(errBanner(r.aiError));
        else if (r.ai) {
          nodes.push(ui.card("Best keywords", h("div", { class: "tm-list" }, (r.ai.best || []).map(b => ui.item(b.keyword, { sub: b.reason, notify })))));
          nodes.push(ui.card("Video ideas", h("div", { class: "tm-list" }, (r.ai.ideas || []).map(i => ui.item(i.title, { sub: i.angle, notify,
            actions: [ui.button({ label: "Use", size: "sm", onClick: () => { window.TM_prefillTitle && window.TM_prefillTitle(i.title); selectTab("titles"); } })] })))));
          if ((r.ai.questions || []).length) nodes.push(ui.card("Questions viewers ask", h("div", { class: "tm-list" }, r.ai.questions.map(q => ui.item(q, { notify })))));
        }
        out.replaceChildren(...nodes);
      } catch (e) { out.replaceChildren(errBanner(e)); }
    }
    seed.addEventListener("keydown", e => { if (e.key === "Enter") run(); });
    p.append(ui.card(null, [ui.field("Seed keyword", h("div", { class: "tm-input-row" }, seed, ui.button({ label: "Explore", icon: "search", variant: "primary", onClick: run })),
      "Uses live YouTube autocomplete, then Gemini ranks and turns it into ideas.")]), out);
  });

  /* ===== Chapters ===== */
  addTab("chapters", "Chapters", "list", p => {
    let len = 0, tracks = [];
    const card = ui.chapterGenerator({ getInfo: () => ({ videoId: ctx.videoId || "", duration: len, tracks }), canInsert: () => ctx.kind === "studio",
      onInsert: block => toStudio({ chapters: block }), notify, onOpenSettings: () => showSettings(true) });
    async function sync() {
      len = 0; tracks = []; card.paintInfo();
      if (ctx.kind === "watch") { try { const r = await chrome.tabs.sendMessage(ctx.tabId, { type: "GET_VIDEO" }); len = Number(r.video && r.video.lengthSeconds) || 0; tracks = (r.video && r.video.captionTracks) || []; } catch {} }
    }
    p.append(card); sync();
    return { onCtx: sync, onShow: card.paintInfo };
  });

  /* ===== Video audit ===== */
  addTab("video", "Video", "chart", p => {
    const out = h("div", { style: "display:flex;flex-direction:column;gap:14px" });
    let req = 0, cur = null;
    async function load() {
      const my = ++req;
      if (ctx.kind !== "watch") { out.replaceChildren(ui.empty("Open a YouTube video", "Go to a video page to see its tags and an SEO audit.")); return; }
      out.replaceChildren(ui.spinner("Reading the video…"));
      let v; try { v = (await chrome.tabs.sendMessage(ctx.tabId, { type: "GET_VIDEO" })).video; } catch { v = null; }
      if (my !== req) return;
      if (!v) return out.replaceChildren(ui.banner("warn", "Could not read this video. Reload the YouTube tab and try again."));
      cur = v; render(v);
    }
    function render(v) {
      const a = TM.auditVideo(v);
      const ai = h("div", { style: "display:flex;flex-direction:column;gap:14px" });
      out.replaceChildren(
        h("img", { class: "tm-thumb", alt: "", src: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg` }),
        ui.card(null, [h("div", { class: "tm-row" }, ui.score(a.score), h("div", { style: "flex:1;min-width:0" }, h("div", { class: "tm-item-text", dir: "auto" }, h("b", null, v.title)),
          h("div", { class: "tm-meta" }, [v.author, v.views ? Number(v.views).toLocaleString() + " views" : ""].filter(Boolean).join(" · "))))]),
        ui.card("SEO checklist", h("div", { class: "tm-list" }, a.checks.map(c => ui.check(c.pass, c.text, c.sub)))),
        ui.card(`Tags (${v.tags.length})`, v.tags.length ? ui.chips(v.tags, notify) : h("span", { class: "tm-hint" }, "No public tags."), v.tags.length ? [ui.copyButton(v.tags.join(", "), notify)] : null),
        h("div", { class: "tm-row" }, ui.button({ label: "Improve with AI", icon: "sparkles", variant: "primary", onClick: async e => {
          const b = e.currentTarget; b.disabled = true; ai.replaceChildren(ui.spinner("Auditing with Gemini…"));
          try {
            const r = await TM.call("AUDIT_AI", { title: v.title, description: v.description, tags: v.tags });
            ai.replaceChildren(ui.banner("ok", r.verdict), ui.card("Main problems", h("div", { class: "tm-list" }, (r.problems || []).map(x => ui.item(x, { noCopy: true })))),
              ui.titleList(r.titles, { notify }), ui.tagBlock(r.tags, { notify }), ui.card("Better description opening", [h("div", { class: "tm-item-text", dir: "auto", style: "white-space:pre-wrap" }, r.description), h("div", { class: "tm-row" }, ui.copyButton(r.description, notify))]));
          } catch (er) { ai.replaceChildren(errBanner(er)); }
          b.disabled = false;
        } }), ui.button({ label: "Refresh", icon: "refresh", onClick: load })), ai);
    }
    p.append(out); load();
    return { onShow: () => { if (!cur || cur.videoId !== ctx.videoId) load(); }, onCtx: () => { if (activeTab === "video") load(); } };
  });

  /* ===== Thumbnail ===== */
  addTab("thumb", "Thumbnail", "image", p => {
    const out = h("div", { style: "display:flex;flex-direction:column;gap:14px" });
    const file = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", hidden: true });
    const drop = h("div", { class: "tm-drop", tabindex: "0", role: "button" }, icon("upload", 20), h("div", null, "Drop a thumbnail here or click to choose"), h("div", { class: "tm-hint" }, "PNG, JPG or WebP"));
    const src = h("div");
    let req = 0;
    function paintSrc() {
      src.replaceChildren(ctx.kind === "watch" ? ui.button({ label: "Analyze this video's thumbnail", icon: "sparkles", variant: "primary", block: true, onClick: () => run({ videoId: ctx.videoId }, `https://i.ytimg.com/vi/${ctx.videoId}/mqdefault.jpg`) }) : "");
    }
    async function toDataUrl(f) {
      const bmp = await createImageBitmap(f); const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      /* white backdrop: PNG transparency would turn black in JPEG */ const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", 0.9);
    }
    async function run(payload, preview) {
      const my = ++req; out.replaceChildren(h("img", { class: "tm-thumb", alt: "", src: preview }), ui.spinner("Reviewing the thumbnail with Gemini…"));
      try {
        const r = await TM.call("THUMBNAIL", payload); if (my !== req) return;
        const sc = Math.max(0, Math.min(100, Number(r.score) || 0));
        const list = (t, a) => (a || []).length ? ui.card(t, h("div", { class: "tm-list" }, a.map(x => ui.item(x, { noCopy: true })))) : null;
        out.replaceChildren(h("img", { class: "tm-thumb", alt: "", src: preview }),
          ui.card(null, h("div", { class: "tm-row" }, ui.score(sc), h("div", { class: "tm-item-text", style: "flex:1" }, r.summary))),
          list("Strengths", r.strengths), list("Problems", r.issues), list("Suggestions", r.suggestions));
      } catch (e) { if (my === req) out.replaceChildren(h("img", { class: "tm-thumb", alt: "", src: preview }), errBanner(e)); }
    }
    async function pick(f) {
      if (!f) return; if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return notify("Use a PNG, JPG or WebP image");
      try { const d = await toDataUrl(f); run({ dataUrl: d, title: ctx.title }, d); } catch { notify("Could not read that image"); }
    }
    drop.addEventListener("click", () => file.click());
    drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } });
    file.addEventListener("change", () => { pick(file.files[0]); file.value = ""; });
    ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("is-over"); }));
    drop.addEventListener("drop", e => pick(e.dataTransfer.files[0]));
    p.append(src, drop, file, out); paintSrc();
    return { onCtx: paintSrc };
  });

  /* ---------- settings view ---------- */
  const settingsView = h("div", { class: "tm-main", hidden: true });
  const DEFAULT_MODELS = [{ id: "gemini-2.5-flash", name: "gemini-2.5-flash" }, { id: "gemini-2.5-flash-lite", name: "gemini-2.5-flash-lite" }, { id: "gemini-2.5-pro", name: "gemini-2.5-pro" }];
  function buildSettings() {
    const key = h("input", { class: "tm-input", type: "password", autocomplete: "off", spellcheck: "false", placeholder: "AIza…", value: S.geminiKey, dir: "ltr" });
    const eye = ui.iconButton("eye", "Show key", () => { const show = key.type === "password"; key.type = show ? "text" : "password"; eye.replaceChildren(icon(show ? "eyeoff" : "eye", 16)); eye.title = show ? "Hide key" : "Show key"; });
    const model = h("select", { class: "tm-select", dir: "ltr" });
    const fill = (list, sel) => { const l = list.some(m => m.id === sel) ? list : [{ id: sel, name: sel }, ...list]; model.replaceChildren(...l.map(m => h("option", { value: m.id }, m.name))); model.value = sel; };
    fill(DEFAULT_MODELS, S.model);
    const status = h("div");
    const save = async patch => { S = await TM.saveSettings(patch); notify("Saved"); };
    const test = ui.button({ label: "Test key & load models", icon: "check", onClick: async () => {
      const k = key.value.trim(); test.disabled = true; status.replaceChildren(ui.spinner("Checking with Google…"));
      try {
        const r = await TM.call("TEST_KEY", { key: k }); await save({ geminiKey: k });
        const list = r.models.length ? r.models : DEFAULT_MODELS;
        const prefer = list.some(m => m.id === S.model) ? S.model : (list.find(m => /flash/.test(m.id) && !/lite/.test(m.id)) || list[0]).id;
        fill(list, prefer); if (prefer !== S.model) await save({ model: prefer });
        status.replaceChildren(ui.banner("ok", `Key works. ${r.models.length} models available.`));
      } catch (e) { status.replaceChildren(ui.banner("error", e.message)); }
      test.disabled = false;
    } });
    key.addEventListener("change", () => save({ geminiKey: key.value.trim() }));
    model.addEventListener("change", () => save({ model: model.value }));

    const seg = (name, opts, cur) => {
      const wrap = h("div", { class: "tm-seg", role: "group" });
      const paint = v => [...wrap.children].forEach(b => b.setAttribute("aria-pressed", b.dataset.v === v));
      opts.forEach(([v, l]) => wrap.append(h("button", { type: "button", "data-v": v, "aria-pressed": "false", onClick: () => { paint(v); save({ [name]: v }); } }, l)));
      paint(cur); return wrap;
    };
    const sw = (name, label, sub) => { const i = h("input", { type: "checkbox" }); i.checked = !!S[name]; i.addEventListener("change", () => save({ [name]: i.checked }));
      return h("label", { class: "tm-switch" }, h("span", null, label, sub && h("small", { class: "tm-hint", style: "display:block" }, sub)), i); };
    const reset = ui.button({ label: "Remove key & reset settings", icon: "trash", variant: "danger", onClick: async () => {
      if (!reset.dataset.armed) { reset.dataset.armed = "1"; reset.lastChild.textContent = "Click again to confirm"; setTimeout(() => { delete reset.dataset.armed; reset.lastChild.textContent = "Remove key & reset settings"; }, 3500); return; }
      await chrome.storage.local.remove("settings"); S = { ...TM.DEFAULTS }; key.value = ""; fill(DEFAULT_MODELS, S.model); status.replaceChildren(); notify("Settings reset"); buildSettings();
    } });
    settingsView.replaceChildren(
      ui.card("Google AI Studio", [
        ui.field("API key", h("div", { class: "tm-input-row" }, key, eye), h("span", null, "Free key from ", h("a", { href: "https://aistudio.google.com/apikey", target: "_blank", rel: "noopener" }, "aistudio.google.com/apikey"), ". It is stored only in this browser and sent only to Google.")),
        ui.field("Model", model), test, status]),
      ui.card("Appearance", [ui.field("Theme", seg("theme", [["system", "System"], ["light", "Light"], ["dark", "Dark"]], S.theme)),
        ui.field("AI output language", seg("language", [["auto", "Auto"], ["fa", "فارسی"], ["en", "English"]], S.language), "Auto answers in the language you type.")]),
      ui.card("Behavior", [sw("autoSuggest", "Auto-suggest while typing in Studio", "Uses your Gemini quota."), sw("showStudioAssistant", "Show assistant window in Studio"), sw("showWatchTags", "Show tags window on video pages")]),
      ui.card("Data", [reset]),
      aboutFooter());
  }

  /* ---------- About footer ---------- */
  const BRAND_SVG = {
    github: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
    telegram: "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"
  };
  function brandLink(kind, label, href) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path"); path.setAttribute("d", BRAND_SVG[kind]); svg.append(path);
    return h("a", { class: "tm-icon-btn tm-social-btn", href, target: "_blank", rel: "noopener noreferrer", title: label, "aria-label": label }, svg);
  }
  function aboutFooter() {
    const version = chrome.runtime.getManifest().version.replace(/\.0$/, "");
    return h("div", { class: "tm-foot" }, h("span", null, "Version ", version),
      h("div", { class: "tm-row", style: "gap:4px" }, brandLink("github", "GitHub · X-Tube", "https://github.com/kof-huskai/X-Tube"), brandLink("telegram", "Telegram · drunkducks", "https://t.me/drunkducks")));
  }

  /* ---------- header & view switching ---------- */
  const headerActions = h("span", { style: "display:contents" });
  const header = ui.header({ title: "X Tube", sub: "Free YouTube toolkit", actions: [headerActions] });
  let inSettings = false;
  function showSettings(on) {
    inSettings = on; settingsView.hidden = !on; main.hidden = on; tabsWrap.hidden = on;
    header.querySelector(".tm-title small").textContent = on ? "Settings" : "Free YouTube toolkit";
    headerActions.replaceChildren(on ? ui.iconButton("x", "Close settings", () => showSettings(false)) : ui.iconButton("settings", "Settings", () => showSettings(true)));
    if (on) buildSettings();
  }
  app.append(header, tabsWrap, main, settingsView);

  /* ---------- boot ---------- */
  (async () => {
    S = await TM.getSettings(); TM.applyTheme(app, S.theme);
    showSettings(false); selectTab("titles"); await refreshCtx();
    const { pendingTab } = await chrome.storage.local.get("pendingTab");
    if (pendingTab) { await chrome.storage.local.remove("pendingTab"); openTab(pendingTab); }
    else if (!S.geminiKey) showSettings(true);
  })();
  function openTab(t) { if (t === "settings") showSettings(true); else { showSettings(false); selectTab(t); } }
  TM.onSettings(s => { S = s; TM.applyTheme(app, s.theme); });
  chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch.pendingTab && ch.pendingTab.newValue) { openTab(ch.pendingTab.newValue); chrome.storage.local.remove("pendingTab"); } });
})();
