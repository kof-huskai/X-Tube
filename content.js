/* X Tube content script: tags window on video pages + AI assistant in YouTube Studio. */
(() => {
  if (window.__xtubeLoaded) return; window.__xtubeLoaded = true;
  const { h, ui } = TM;
  const isStudio = location.hostname === "studio.youtube.com";
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let S = { ...TM.DEFAULTS };

  /* ================= floating window (same design system as the side panel) ================= */
  const host = h("div", { id: "xtube-host", style: "all:initial" });
  const shadow = host.attachShadow({ mode: "open" });
  const wrap = h("div", { class: "tm-root tm-float", hidden: true, role: "dialog", "aria-label": "X Tube" });
  const bodyEl = h("div", { class: "tm-body" });
  let titleEl, minimized = false, closedFor = null;
  const notify = msg => TM.toast(wrap, msg);
  const win = {
    show() { if (!wrap.hidden) return; wrap.hidden = false; },
    hide() { wrap.hidden = true; },
    set(...nodes) { bodyEl.replaceChildren(...nodes.flat().filter(Boolean)); },
    setTitle(t, sub) { titleEl.replaceChildren(t, sub ? h("small", null, sub) : ""); }
  };
  (function build() {
    const header = ui.header({ title: "X Tube", actions: [
      ui.iconButton("settings", "Open settings", () => TM.call("OPEN_PANEL", { tab: "settings" }).catch(() => notify("Click the X Tube icon in the toolbar"))),
      ui.iconButton("minus", "Minimize", () => { minimized = !minimized; bodyEl.hidden = minimized; }),
      ui.iconButton("x", "Close", () => { win.hide(); closedFor = isStudio ? "studio" : currentVid(); })
    ] });
    titleEl = header.querySelector(".tm-title");
    wrap.append(header, bodyEl);
    wrap.style.top = "72px"; wrap.style.right = "16px";
    shadow.append(wrap);
    document.documentElement.append(host);
    let ox = 0, oy = 0, on = false;
    header.addEventListener("mousedown", e => { if (e.target.closest("button")) return; on = true; const r = wrap.getBoundingClientRect(); ox = e.clientX - r.left; oy = e.clientY - r.top; e.preventDefault(); });
    addEventListener("mousemove", e => { if (!on) return; wrap.style.left = Math.min(Math.max(0, e.clientX - ox), innerWidth - 60) + "px"; wrap.style.top = Math.min(Math.max(0, e.clientY - oy), innerHeight - 40) + "px"; wrap.style.right = "auto"; });
    addEventListener("mouseup", () => { on = false; });
  })();
  // Styles are fetched through the service worker and injected as text: pages (YouTube) may block chrome-extension:// loads.
  const cssReady = TM.call("GET_CSS").then(css => {
    try { const sheet = new CSSStyleSheet(); sheet.replaceSync(css); shadow.adoptedStyleSheets = [sheet]; }
    catch { shadow.prepend(h("style", null, css)); }
  }).catch(e => console.debug("[X Tube] css", e));
  const sync = () => { TM.applyTheme(wrap, S.theme); };
  TM.getSettings().then(s => { S = s; sync(); });
  TM.onSettings(s => { S = s; sync(); if (!shouldShow()) win.hide(); });
  const shouldShow = () => isStudio ? S.showStudioAssistant : S.showWatchTags;

  /* ================= video pages ================= */
  const currentVid = () => (location.pathname === "/watch" ? new URLSearchParams(location.search).get("v") : null);
  const cache = new Map();
  let bridgeId = 0;
  const bridge = () => new Promise(res => {
    const id = ++bridgeId;
    const on = e => { if (e.data && e.data.tm === "RES_VIDEO" && e.data.id === id) { removeEventListener("message", on); res(e.data.data); } };
    addEventListener("message", on); postMessage({ tm: "REQ_VIDEO", id }, "*");
    setTimeout(() => { removeEventListener("message", on); res(null); }, 600);
  });
  async function fromHtml(vid) {
    try {
      const html = await (await fetch(`/watch?v=${encodeURIComponent(vid)}`, { credentials: "omit" })).text();
      const grab = re => { const m = html.match(re); if (!m) return null; try { return JSON.parse(m[1]); } catch { return null; } };
      return { videoId: vid, title: grab(new RegExp(`"videoDetails":\\{"videoId":"${vid}","title":("(?:[^"\\\\]|\\\\.)*")`)) || "",
        author: grab(/"author":("(?:[^"\\]|\\.)*")/) || "", keywords: grab(/"keywords":(\[[^\]]*\])/) || [],
        description: grab(/"shortDescription":("(?:[^"\\]|\\.)*")/) || "", views: grab(/"viewCount":("\d+")/) || "" };
    } catch { return { videoId: vid, title: "", keywords: [], description: "" }; }
  }
  async function getVideo(vid) {
    if (cache.has(vid)) return cache.get(vid);
    let d = null;
    for (let i = 0; i < 5 && !(d && d.videoId === vid); i++) { d = await bridge(); if (!(d && d.videoId === vid)) await sleep(450); }
    if (!(d && d.videoId === vid)) d = await fromHtml(vid);
    d.tags = d.keywords || []; cache.set(vid, d); if (cache.size > 20) cache.delete(cache.keys().next().value);
    return d;
  }
  let shownVid = null;
  async function renderWatch(vid) {
    win.setTitle("Video tags"); win.set(ui.spinner("Reading tags…")); win.show();
    const v = await getVideo(vid);
    if (shownVid !== vid) return;
    win.setTitle("Video tags", `${v.tags.length} tags`);
    const nodes = [h("div", { class: "tm-item-text", dir: "auto" }, v.title || "")];
    nodes.push(v.tags.length ? ui.tagBlock(v.tags, { notify })
      : ui.banner("warn", "This video has no public tags (the creator didn't add any)."));
    nodes.push(h("div", { class: "tm-row" }, ui.button({ label: "Audit & Improve", icon: "chart", variant: "primary", onClick: () => TM.call("OPEN_PANEL", { tab: "video" }).catch(() => notify("Click the X Tube icon in the toolbar")) })));
    win.set(nodes);
  }
  function watchTick() {
    const vid = currentVid();
    if (!vid || !S.showWatchTags) { if (shownVid || !vid) { shownVid = null; win.hide(); } return; }
    if (vid === shownVid) return;
    shownVid = vid; if (closedFor === vid) return; closedFor = null; renderWatch(vid);
  }

  /* ================= Studio assistant ================= */
  const Q = {
    title: () => document.querySelector("#title-textarea #textbox, ytcp-video-title #textbox"),
    desc: () => document.querySelector("#description-textarea #textbox, ytcp-video-description #textbox"),
    tags: () => document.querySelector("#tags-container input#text-input, #tags-container input, ytcp-chip-bar input#text-input"),
    chips: () => [...document.querySelectorAll("#tags-container ytcp-chip, ytcp-chip-bar ytcp-chip")]
  };
  const studioVideoId = () => { const m = location.pathname.match(/\/video\/([\w-]{11})(?:\/|$)/); return m ? m[1] : ""; };
  const TS_LINE = /^\s*\(?\d{1,2}:\d{2}(?::\d{2})?\)?\s+\S/;
  function mergeChapters(desc, block) {
    const lines = desc.replace(/\n{3,}/g, "\n\n").split("\n"); let bestStart = -1, bestLen = 0;
    for (let i = 0; i < lines.length; i++) { let j = i; while (j < lines.length && TS_LINE.test(lines[j])) j++; if (j - i >= 3 && j - i > bestLen) { bestStart = i; bestLen = j - i; } i = Math.max(i, j - 1); }
    if (bestStart >= 0) { lines.splice(bestStart, bestLen, ...block.split("\n")); return lines.join("\n"); }
    return desc.trim() ? desc.replace(/\s+$/, "") + "\n\n" + block : block;
  }
  function insertChapters(block) {
    const d = Q.desc(); if (!d) return notify("Description box not found");
    setEditable(d, mergeChapters(textOf(d), block.trim())); notify("Chapters added to the description");
  }
  const chapCard = ui.chapterGenerator({ getInfo: () => ({ videoId: studioVideoId() }), onInsert: insertChapters, canInsert: () => true, notify,
    onOpenSettings: () => TM.call("OPEN_PANEL", { tab: "settings" }).catch(() => {}) });
  const st = { bound: null, timer: null, req: 0, last: null, seen: [], text: "", applying: false };
  const textOf = el => (el ? el.innerText || el.textContent || "" : "").trim();

  function setEditable(el, text) {
    st.applying = true;
    el.focus();
    const sel = getSelection(), r = document.createRange(); r.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(r);
    if (!document.execCommand("insertText", false, text)) { el.textContent = text; el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text })); }
    setTimeout(() => { st.applying = false; }, 400);
  }
  async function insertTags(list) {
    let inp = Q.tags();
    if (!inp) { const t = document.querySelector("#toggle-button"); if (t) { t.click(); await sleep(700); inp = Q.tags(); } }
    if (!inp) { await TM.copy(list.join(", ")); notify("Tags field not found — tags copied, paste them into the Tags box."); return; }
    const existing = Q.chips().map(c => textOf(c).replace(/\s+/g, " ").toLowerCase());
    const budget = 500 - existing.join(",").length - 2;
    const fresh = TM.trimTags(list.filter(t => !existing.includes(t.toLowerCase())), Math.max(0, budget));
    if (!fresh.length) return notify("Nothing to add — tag limit reached or already present.");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    inp.focus();
    for (const t of fresh) {
      setter.call(inp, t + ","); inp.dispatchEvent(new Event("input", { bubbles: true })); await sleep(50);
      if (inp.value) { inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true })); await sleep(50); }
    }
    notify(`${fresh.length} tags added`);
  }
  function useTitle(t) { const el = Q.title(); if (!el) return notify("Title box not found"); st.text = t; setEditable(el, t); notify("Title replaced"); }

  function descCard(title, tags) {
    const out = h("div", { class: "tm-field" });
    const gen = async btn => {
      btn.disabled = true; out.replaceChildren(ui.spinner("Writing description…"));
      try {
        const r = await TM.call("DESCRIPTION", { title, tags });
        const ta = h("textarea", { class: "tm-textarea", rows: 8, dir: "auto" }); ta.value = r.description;
        out.replaceChildren(ta, h("div", { class: "tm-row" },
          ui.button({ label: "Use", variant: "primary", size: "sm", onClick: () => { const d = Q.desc(); d ? (setEditable(d, ta.value), notify("Description replaced")) : notify("Description box not found"); } }),
          ui.button({ label: "Copy", icon: "copy", size: "sm", onClick: async () => notify((await TM.copy(ta.value)) ? "Copied" : "Copy failed") })));
      } catch (e) { out.replaceChildren(ui.banner("error", e.message)); }
      btn.disabled = false;
    };
    const b = ui.button({ label: "Write description", icon: "text", size: "sm", onClick: () => gen(b) });
    return ui.card("Description", [out], [b]);
  }

  function renderIdle() {
    win.setTitle("Studio assistant", "Type a title to get ideas");
    chapCard.paintInfo();
    win.set(ui.empty("Type your video title", S.autoSuggest ? "Suggestions appear automatically after you pause typing." : "Then press Suggest."),
      h("div", { class: "tm-row" }, ui.button({ label: "Suggest", icon: "sparkles", variant: "primary", onClick: () => runSuggest(false) })), chapCard);
  }
  function renderError(e) {
    const actions = [];
    if (["NO_KEY", "BAD_KEY", "BAD_MODEL"].includes(e.code)) actions.push(ui.button({ label: "Open settings", icon: "settings", size: "sm", onClick: () => TM.call("OPEN_PANEL", { tab: "settings" }).catch(() => {}) }));
    actions.push(ui.button({ label: "Try again", icon: "refresh", size: "sm", onClick: () => runSuggest(true) }));
    chapCard.paintInfo(); win.set(ui.banner("error", e.message, actions), chapCard);
  }
  async function runSuggest(force) {
    const el = Q.title(); if (!el) return;
    const title = textOf(el);
    if (title.length < 3) return renderIdle();
    if (!force && st.last && st.last.forTitle === title) return;
    if (!force) st.seen = []; else if (st.last) st.seen.push(...st.last.titles);
    const my = ++st.req; win.show(); win.setTitle("Studio assistant", "Thinking…"); win.set(ui.spinner("Generating ideas with Gemini…"));
    try {
      const r = await TM.call("TITLES_TAGS", { title, description: textOf(Q.desc()), avoid: st.seen });
      if (my !== st.req) return;
      st.last = { ...r, forTitle: title };
      win.setTitle("Studio assistant", "Ideas for your title");
      win.set(ui.titleList(r.titles, { onUse: useTitle, notify, onRefresh: () => runSuggest(true) }), ui.tagBlock(r.tags, { onApply: insertTags, notify }), descCard(title, r.tags), (chapCard.paintInfo(), chapCard));
    } catch (e) { if (my === st.req) renderError(e); }
  }
  function studioTick() {
    const el = Q.title();
    if (!el || !S.showStudioAssistant) { if (st.bound) { st.bound = null; st.last = null; st.seen = []; st.req++; win.hide(); closedFor = null; } if (!S.showStudioAssistant) win.hide(); return; }
    if (st.bound === el) return;
    st.bound = el; st.last = null; st.seen = [];
    if (closedFor !== "studio") { renderIdle(); win.show(); }
    el.addEventListener("input", () => {
      if (st.applying) return; clearTimeout(st.timer);
      if (S.autoSuggest && closedFor !== "studio") st.timer = setTimeout(() => runSuggest(false), 1800);
    });
    if (textOf(el).length >= 3 && S.autoSuggest && closedFor !== "studio") runSuggest(false);
  }

  /* ================= messages from the side panel ================= */
  chrome.runtime.onMessage.addListener((m, _s, send) => {
    if (m.type === "GET_CONTEXT") {
      send({ kind: isStudio ? "studio" : currentVid() ? "watch" : "other", videoId: isStudio ? studioVideoId() : currentVid(), title: isStudio ? textOf(Q.title()) : "", description: isStudio ? textOf(Q.desc()) : "" });
    } else if (m.type === "GET_VIDEO") {
      const vid = currentVid(); if (!vid) return send({ video: null });
      getVideo(vid).then(v => send({ video: v })); return true;
    } else if (m.type === "APPLY") {
      (async () => {
        if (!isStudio) return send({ ok: false, error: "Open YouTube Studio's upload or edit page first." });
        try {
          if (m.title) { const el = Q.title(); if (!el) throw new Error("Title box not found"); st.text = m.title; setEditable(el, m.title); }
          if (m.description) { const el = Q.desc(); if (!el) throw new Error("Description box not found"); setEditable(el, m.description); }
          if (m.chapters) insertChapters(m.chapters);
          if (m.tags && m.tags.length) await insertTags(m.tags);
          send({ ok: true });
        } catch (e) { send({ ok: false, error: e.message }); }
      })(); return true;
    }
    return false;
  });

  /* ================= boot ================= */
  cssReady.then(() => {
    const timer = setInterval(() => {
      if (!chrome.runtime || !chrome.runtime.id) { clearInterval(timer); host.remove(); return; }   // extension reloaded
      try { isStudio ? studioTick() : watchTick(); } catch (e) { console.debug("[X Tube]", e); }
    }, 900);
  });
})();
