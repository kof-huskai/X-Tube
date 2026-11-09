/* X Tube service worker: every network call to Google lives here. */
const API = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULTS = { geminiKey: "", model: "gemini-2.5-flash", language: "auto" };

chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
chrome.commands.onCommand.addListener(async cmd => {
  if (cmd !== "open-sidebar") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
});

class TMError extends Error { constructor(msg, code) { super(msg); this.code = code; } }
async function settings() { const { settings: s } = await chrome.storage.local.get("settings"); return { ...DEFAULTS, ...(s || {}) }; }
const langRule = s => s.language === "fa" ? "Write ALL output in Persian (Farsi)."
  : s.language === "en" ? "Write ALL output in English."
  : "Write in the same language as the user's input text (Persian input -> Persian output).";

function explain(status, body, model) {
  const msg = body?.error?.message || "";
  if (status === 400 && /api key/i.test(msg)) return ["Your Google AI Studio API key is not valid. Check it in Settings.", "BAD_KEY"];
  if (status === 400) return [msg || "The request was rejected by Gemini.", "BAD_REQUEST"];
  if (status === 401 || status === 403) return ["Gemini refused this key (permission denied or restricted key). Create a new key in Google AI Studio.", "BAD_KEY"];
  if (status === 404) return [`Model “${model}” is not available for this key. Pick another model in Settings.`, "BAD_MODEL"];
  if (status === 429) return ["Gemini quota or rate limit reached. Wait a minute and try again, or choose a lighter model in Settings.", "QUOTA"];
  return [msg || `Gemini error ${status}. Please try again.`, "UPSTREAM"];
}

async function geminiRaw(path, { method = "GET", body, key, signal, model } = {}) {
  let attempt = 0;
  for (;;) {
    let r;
    try {
      r = await fetch(`${API}/${path}`, { method, credentials: "omit", signal, headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      if (e.name === "AbortError") throw new TMError("Gemini took too long. Try again.", "TIMEOUT");
      throw new TMError("Cannot reach Google. Check your internet connection (or VPN).", "NETWORK");
    }
    const j = await r.json().catch(() => ({}));
    if (r.ok) return j;
    if (r.status >= 500 && attempt++ < 1) { await new Promise(res => setTimeout(res, 1500)); continue; }
    const [m, c] = explain(r.status, j, model); throw new TMError(m, c);
  }
}

async function gemini({ system, parts, schema, temperature = 0.8, config, timeoutMs = 60000 }) {
  const s = await settings();
  if (!s.geminiKey) throw new TMError("Add your Google AI Studio API key in Settings to use AI features.", "NO_KEY");
  const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const j = await geminiRaw(`models/${encodeURIComponent(s.model)}:generateContent`, {
      method: "POST", key: s.geminiKey, signal: ac.signal, model: s.model,
      body: {
        systemInstruction: { parts: [{ text: `${system}\n${langRule(s)}` }] },
        contents: [{ role: "user", parts }],
        generationConfig: { temperature, responseMimeType: "application/json", responseSchema: schema, ...(config || {}) }
      }
    });
    const block = j.promptFeedback?.blockReason;
    if (block) throw new TMError("Gemini blocked this request (" + block + "). Rephrase and try again.", "BLOCKED");
    const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
    if (!text) throw new TMError("Gemini returned an empty answer. Try Refresh.", "EMPTY");
    try { return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")); }
    catch { throw new TMError("Gemini returned an unreadable answer. Try Refresh.", "PARSE"); }
  } finally { clearTimeout(timer); }
}

const S = t => ({ type: "STRING", ...(t || {}) });
const A = (items) => ({ type: "ARRAY", items });
const O = (properties, required) => ({ type: "OBJECT", properties, required: required || Object.keys(properties) });
const uniq = (a, n = 99) => [...new Set((a || []).map(x => String(x).trim()).filter(Boolean))].slice(0, n);
const cleanTags = a => uniq((a || []).map(t => String(t).replace(/^#+/, "").trim()).filter(t => t && t.length <= 30), 25);

/* ---------- features ---------- */
async function titlesAndTags({ title, description, avoid }) {
  if (!title || title.trim().length < 3) throw new TMError("Type a title or topic first.", "INPUT");
  const avoidTxt = avoid?.length ? `\nDo NOT repeat or closely paraphrase these earlier suggestions: ${JSON.stringify(avoid.slice(-20))}` : "";
  const r = await gemini({
    system: "You are a senior YouTube SEO strategist and copywriter. Titles must be accurate (never promise what the video does not contain), natural, and at most 70 characters, with no surrounding quotes and no emoji spam. Make the titles genuinely different in style (curiosity, how-to, list/number, benefit-driven, question, direct). Tags must be real search phrases viewers type, most important first, a mix of short and long-tail, without the # symbol, each at most 30 characters.",
    parts: [{ text: `Video title or topic: "${title.trim()}"\n${description ? `Extra context: "${description.slice(0, 800)}"\n` : ""}Return 6 title ideas and 20 tags.${avoidTxt}` }],
    schema: O({ titles: A(S()), tags: A(S()) }), temperature: avoid?.length ? 1 : 0.8
  });
  const titles = uniq(r.titles).map(t => t.replace(/^["“”']|["“”']$/g, "").slice(0, 100)).filter(t => !(avoid || []).includes(t)).slice(0, 6);
  if (!titles.length) throw new TMError("No new ideas came back. Try Refresh again.", "EMPTY");
  return { titles, tags: cleanTags(r.tags) };
}

async function writeDescription({ title, tags, notes }) {
  if (!title || title.trim().length < 3) throw new TMError("Enter the video title first.", "INPUT");
  const r = await gemini({
    system: "You write high-performing YouTube descriptions. Structure: a 1–2 sentence hook containing the main keyword (this is what shows in search), a short summary paragraph, 3–5 bullet points of what viewers will learn (use '•'), a one-line call to action to like/subscribe, then 3 relevant hashtags on the last line. NEVER invent facts, links, timestamps, names or claims that are not in the user's input. Where a link or timestamps would belong, leave a clear [bracketed placeholder].",
    parts: [{ text: `Title: "${title.trim()}"\nTags: ${(tags || []).join(", ") || "(none)"}\nNotes from the creator: ${notes || "(none)"}` }],
    schema: O({ description: S() })
  });
  return { description: String(r.description || "").trim() };
}

async function suggestQueries(q) {
  const r = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(q)}`, { credentials: "omit" });
  if (!r.ok) throw new Error("suggest " + r.status);
  const j = await r.json(); return Array.isArray(j[1]) ? j[1] : [];
}
async function keywords({ seed }) {
  seed = (seed || "").trim(); if (seed.length < 2) throw new TMError("Enter a keyword.", "INPUT");
  const fa = /[؀-ۿ]/.test(seed);
  const suffix = fa ? ["", " چیست", " آموزش", " بهترین", " چگونه", " برای مبتدیان", " ۱۴۰۵", " ا", " ب", " م"]
                    : ["", " how to", " best", " for beginners", " vs", " tutorial", " 2026", " a", " b", " s"];
  const lists = await Promise.all(suffix.map(x => suggestQueries(seed + x).catch(() => null)));
  if (lists.every(l => l === null)) throw new TMError("Could not reach YouTube suggestions. Check your connection.", "NETWORK");
  const found = uniq(lists.flat().filter(Boolean), 60);
  let ai = null, aiError = null;
  try {
    ai = await gemini({
      system: "You are a YouTube keyword and content strategist. Base your answer ONLY on the real YouTube autocomplete phrases supplied (real viewer searches). Do not invent search volumes or statistics.",
      parts: [{ text: `Seed: "${seed}"\nReal autocomplete phrases: ${JSON.stringify(found)}` }],
      schema: O({
        best: A(O({ keyword: S(), reason: S() })),
        ideas: A(O({ title: S(), angle: S() })),
        questions: A(S())
      }), temperature: 0.7
    });
  } catch (e) { aiError = { message: e.message, code: e.code }; }
  return { seed, found, ai, aiError };
}

async function auditAI({ title, description, tags }) {
  return gemini({
    system: "You are a YouTube SEO auditor. Review the metadata and improve it without changing the video's meaning or inventing facts.",
    parts: [{ text: `Title: "${title}"\nDescription (first 1500 chars): "${(description || "").slice(0, 1500)}"\nTags: ${JSON.stringify(tags || [])}\nGive a short verdict, the 3 most important problems, 4 better titles, 15 better tags and an improved description opening (hook + summary, max 600 chars).` }],
    schema: O({ verdict: S(), problems: A(S()), titles: A(S()), tags: A(S()), description: S() })
  }).then(r => ({ ...r, titles: uniq(r.titles, 4), tags: cleanTags(r.tags) }));
}

function b64(buf) { let s = ""; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
async function loadThumb(videoId) {
  if (!/^[\w-]{6,20}$/.test(videoId || "")) throw new TMError("Invalid video id.", "INPUT");
  for (const name of ["maxresdefault", "hqdefault"]) {
    const r = await fetch(`https://i.ytimg.com/vi/${videoId}/${name}.jpg`, { credentials: "omit" }).catch(() => null);
    if (r && r.ok) { const buf = await r.arrayBuffer(); if (buf.byteLength > 2000) return { mime: "image/jpeg", data: b64(buf) }; }
  }
  throw new TMError("Could not download this video's thumbnail.", "NETWORK");
}
async function thumbnail({ videoId, dataUrl, title }) {
  let img;
  if (dataUrl) { const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl); if (!m) throw new TMError("Unsupported image. Use PNG, JPG or WebP.", "INPUT"); img = { mime: m[1], data: m[2] }; }
  else img = await loadThumb(videoId);
  return gemini({
    system: "You are a YouTube thumbnail and click-through-rate expert. Judge only what is visible. Be specific and concrete; score honestly (0-100).",
    parts: [{ inline_data: { mime_type: img.mime, data: img.data } }, { text: `Review this thumbnail${title ? ` for a video titled "${title}"` : ""}. Evaluate focal point, text readability at small size, contrast, faces/emotion, clutter and curiosity.` }],
    schema: O({ score: { type: "INTEGER" }, summary: S(), strengths: A(S()), issues: A(S()), suggestions: A(S()) }), temperature: 0.4
  });
}

async function testKey({ key }) {
  if (!key) throw new TMError("Paste your API key first.", "INPUT");
  const j = await geminiRaw("models?pageSize=200", { key });
  const models = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes("generateContent") && /^models\/gemini/.test(m.name) && !/(tts|image|live|embedding|audio|computer|robotics|learnlm)/i.test(m.name))
    .map(m => ({ id: m.name.replace("models/", ""), name: m.displayName || m.name.replace("models/", "") }));
  return { models };
}

/* ================= Chapters: cascade of strategies ================= */
const fmtTime = (sec, hours) => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return hours ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(s).padStart(2, "0")}`; };
const countTimestamps = t => (String(t || "").match(/\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?\s*(?:-->|[\s\]\)\-–—:]\s*\S)/g) || []).length;

function extractJsonArray(html, key) {
  const i = html.indexOf(`"${key}":[`); if (i < 0) return null;
  let j = html.indexOf("[", i), depth = 0, inStr = false, esc = false;
  for (let k = j; k < html.length; k++) {
    const c = html[k];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === "[") depth++; else if (c === "]" && --depth === 0) { try { return JSON.parse(html.slice(j, k + 1)); } catch { return null; } }
  }
  return null;
}
function pickTrack(tracks, pref) {
  const score = t => (t.kind !== "asr" ? 10 : 0) + (pref && (t.languageCode || "").startsWith(pref) ? 5 : 0);
  return [...tracks].sort((a, b) => score(b) - score(a));
}
const decodeEntities = t => t.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
function parseJson3(text) {
  const j = JSON.parse(text); const out = [];
  for (const e of j.events || []) { if (!e.segs) continue; const t = e.segs.map(s => s.utf8 || "").join("").replace(/\s*\n\s*/g, " ").trim(); if (t) out.push([(e.tStartMs || 0) / 1000, t]); }
  return out;
}
function parseXml(text) {
  const out = []; const re = /<(?:text|p)\b[^>]*?(?:start="([\d.]+)"|t="(\d+)")[^>]*>([\s\S]*?)<\/(?:text|p)>/g; let m;
  while ((m = re.exec(text))) { const start = m[1] ? parseFloat(m[1]) : parseInt(m[2], 10) / 1000; const t = decodeEntities(m[3].replace(/<[^>]+>/g, "")).replace(/\s*\n\s*/g, " ").trim(); if (t) out.push([start, t]); }
  return out;
}
function toTranscript(lines, hours) {
  const last = lines.length ? lines[lines.length - 1][0] : 0; let bucket = 10, text = "";
  for (;;) {
    const rows = new Map();
    for (const [t, s] of lines) { const k = Math.floor(t / bucket) * bucket; rows.set(k, (rows.get(k) ? rows.get(k) + " " : "") + s); }
    text = [...rows].map(([k, s]) => `[${fmtTime(k, hours)}] ${s}`).join("\n");
    if (text.length <= 80000 || bucket >= 120) break; bucket *= 2;
  }
  return { text, duration: Math.ceil(last) };
}

async function tryCaptions(videoId, lang, pageTracks) {
  const errors = []; let sawTracks = false;
  const sources = [];
  if (pageTracks && pageTracks.length) sources.push(async () => pageTracks);          // links handed over by the YouTube page itself
  sources.push(async () => {                                                          // links parsed from the watch-page HTML
    const watch = await fetch(`https://www.youtube.com/watch?v=${videoId}`, { credentials: "omit" }).catch(() => null);
    if (!watch || !watch.ok) throw new Error("could not open the video page");
    return extractJsonArray(await watch.text(), "captionTracks");
  });
  for (const getTracks of sources) {
    let tracks; try { tracks = await getTracks(); } catch (e) { errors.push(e.message); continue; }
    if (!tracks || !tracks.length) continue;
    sawTracks = true;
    for (const fmt of ["json3", "xml"]) {
      for (const tr of pickTrack(tracks, lang === "fa" ? "fa" : lang === "en" ? "en" : "").slice(0, 2)) {
        try {
          const r = await fetch(fmt === "json3" ? tr.baseUrl + "&fmt=json3" : tr.baseUrl, { credentials: "omit" }); const body = await r.text();
          if (!r.ok || !body.trim()) { errors.push(`${fmt}/${tr.languageCode}: empty response`); continue; }
          const lines = fmt === "json3" ? parseJson3(body) : parseXml(body);
          if (lines.length >= 3) return { lines, label: `${tr.languageCode}${tr.kind === "asr" ? ", auto-generated" : ""}`, fmt };
          errors.push(`${fmt}/${tr.languageCode}: no text`);
        } catch (e) { errors.push(`${fmt}/${tr.languageCode}: ${e.message}`); }
      }
    }
  }
  throw new Error(sawTracks ? "captions exist but YouTube refused to hand them over (" + (errors[0] || "unknown") + ")" : errors.find(e => /open the video/.test(e)) || "this video has no captions (YouTube shows none for it yet)");
}

const CHAPTER_SYSTEM = "You create YouTube chapters. Rules: the first chapter starts at 0 seconds; use between 3 and 15 chapters (roughly one per 1-5 minutes, fewer for short videos); every chapter lasts at least 10 seconds; titles are short (2-6 words, max 50 characters), descriptive, specific and written in the language of the video; use ONLY timings that appear in the supplied text or video and never invent timings; return each start in whole seconds.";
const CHAPTER_SCHEMA = O({ chapters: A(O({ start: { type: "INTEGER" }, title: S() })) });

function validateChapters(raw, duration) {
  let list = (raw || []).map(c => ({ start: Math.max(0, Math.round(Number(c.start) || 0)), title: String(c.title || "").replace(/^[\d:\s\-–—.]+/, "").trim().slice(0, 60) })).filter(c => c.title);
  list.sort((a, b) => a.start - b.start);
  if (duration) list = list.filter(c => c.start < duration - 5);
  if (list.length && list[0].start > 0) { if (list[0].start <= 30) list[0].start = 0; else list.unshift({ start: 0, title: "Intro" }); }
  const out = []; for (const c of list) { if (out.length && c.start - out[out.length - 1].start < 10) continue; out.push(c); }
  if (out.length < 3) throw new TMError("too few usable chapters (" + out.length + ")", "FEW");
  const hours = Math.max(duration || 0, out[out.length - 1].start) >= 3600;
  return { chapters: out, text: out.map(c => `${fmtTime(c.start, hours)} ${c.title}`).join("\n") };
}

async function chapters({ videoId, text, duration, tracks }) {
  const attempts = []; const s = await settings(); const hard = e => ["NO_KEY", "BAD_KEY", "QUOTA", "BAD_MODEL"].includes(e.code);
  const finish = (res, source) => ({ ok: true, ...res, source, attempts });
  const fromText = async (transcript, dur, label) => {
    const r = await gemini({ system: CHAPTER_SYSTEM, parts: [{ text: `Create chapters from this ${label}:\n\n${transcript}` }], schema: CHAPTER_SCHEMA, temperature: 0.3 });
    return validateChapters(r.chapters, dur);
  };

  // 1) text pasted by the user
  if (text && text.trim()) {
    if (countTimestamps(text) >= 3) {
      try { const r = await fromText(text.trim().slice(0, 120000), duration, "transcript / notes with timestamps"); attempts.push({ method: "Your pasted text", ok: true }); return finish(r, "your pasted text"); }
      catch (e) { if (hard(e)) throw e; attempts.push({ method: "Your pasted text", ok: false, note: e.message }); }
    } else attempts.push({ method: "Your pasted text", ok: false, note: "it has fewer than 3 timestamps (like 00:00 or 12:30), so times can't be taken from it" });
  }
  if (videoId && /^[\w-]{11}$/.test(videoId)) {
    // 2 + 3) real captions, JSON3 then XML (and a second track)
    try {
      const cap = await tryCaptions(videoId, s.language, tracks); const t = toTranscript(cap.lines, (duration || 0) >= 3600 || cap.lines[cap.lines.length - 1][0] >= 3600);
      const r = await fromText(t.text, duration || t.duration, "timed transcript (captions)");
      attempts.push({ method: `YouTube captions (${cap.label}, ${cap.fmt})`, ok: true }); return finish(r, `captions (${cap.label})`);
    } catch (e) { if (hard(e)) throw e; attempts.push({ method: "YouTube captions", ok: false, note: e.message }); }
    // 4) Gemini watches the public video by URL
    if (duration && duration > 7200) attempts.push({ method: "AI video analysis", ok: false, note: "video is longer than 2 hours" });
    else try {
      const r = await gemini({ system: CHAPTER_SYSTEM, parts: [{ file_data: { file_uri: `https://www.youtube.com/watch?v=${videoId}` } }, { text: "Create chapters for this video." }], schema: CHAPTER_SCHEMA, temperature: 0.3, timeoutMs: 150000, config: { mediaResolution: "MEDIA_RESOLUTION_LOW" } });
      const v = validateChapters(r.chapters, duration); attempts.push({ method: "AI video analysis (Gemini watches the video)", ok: true }); return finish(v, "AI video analysis");
    } catch (e) { if (hard(e)) throw e; attempts.push({ method: "AI video analysis", ok: false, note: /FEW/.test(e.code || "") ? e.message : "Gemini could not open this video (it must be public, not private/unlisted)" }); }
  } else attempts.push({ method: "YouTube captions & AI video analysis", ok: false, note: "no published video detected yet (a fresh upload has no captions)" });

  // 5) nothing worked: tell the user exactly what is needed
  const needs = [];
  if (!videoId) needs.push("Publish or save the video first, then open its edit page — captions appear after YouTube finishes processing it.");
  else needs.push("Make sure the video has captions (Studio → Subtitles) or is public.");
  needs.push("OR paste a transcript with timestamps (SRT/VTT, or lines like “00:00 text”) into the box.");
  needs.push("OR paste your own rough notes with timestamps (like “2:10 editing basics”) — AI will clean the titles and format them.");
  return { ok: false, needs, attempts };
}

/* tm.css as text: floating windows inject it themselves because YouTube blocks chrome-extension:// loads. */
let cssCache = null;
async function getCss() { if (!cssCache) cssCache = await (await fetch(chrome.runtime.getURL("tm.css"))).text(); return cssCache; }

const handlers = {
  GET_CSS: getCss, CHAPTERS: chapters,
  TITLES_TAGS: titlesAndTags, DESCRIPTION: writeDescription, KEYWORDS: keywords, AUDIT_AI: auditAI, THUMBNAIL: thumbnail, TEST_KEY: testKey
};
chrome.runtime.onMessage.addListener((m, sender, send) => {
  if (m && m.type === "OPEN_PANEL") {
    // Must be called synchronously inside the message handler so Chrome still counts it as a user gesture.
    const opened = sender.tab ? chrome.sidePanel.open({ tabId: sender.tab.id }) : Promise.reject(new Error("No tab"));
    if (m.tab) chrome.storage.local.set({ pendingTab: m.tab });   // not awaited: the open() call above already consumed the gesture
    let done = false; const reply = r => { if (!done) { done = true; send(r); } };
    opened.then(() => { reply({ data: true }); }, e => { reply({ error: "Could not open the side panel: " + (e.message || e) }); });
    setTimeout(() => reply({ data: true }), 1500);
    return true;
  }
  const fn = handlers[m && m.type]; if (!fn) return false;
  Promise.resolve().then(() => fn(m, sender)).then(data => send({ data }), e => send({ error: e.message || String(e), code: e.code, attempts: e.attempts }));
  return true;
});
