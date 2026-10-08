/* Phase 3 / 5R: real data from the notes repository, rendered markdown.
   Editing menus are still previews (they show which phase makes them work). */

/* Menu items: [label, phase in which it becomes functional, optional style] */
const MENUS = {
  subject: [["Insert new chapter", 0, "", "chapter:add"], ["Rename subject", 0, "", "subject:rename"], ["Delete subject", 0, "danger", "subject:delete"]],
  chapter: [["Rename chapter", 0, "", "chapter:rename"], ["Change chapter number", 0, "", "chapter:number"], ["Delete chapter", 0, "danger", "chapter:delete"]],
  topic: [["Rename", 8], ["Move up", 8], ["Move down", 8], ["Delete", 8, "danger"]],
};

const app = document.getElementById("app");
const LAST_SUBJECT = "notes:lastSubject";
const lastTopicKey = (s) => `notes:lastTopic:${s}`;

let mode = "r"; // always starts in read mode
let DATA = null; // { subjects: [...] } loaded from the repo
let subj = null; // the subject object being viewed
let currentSubject = null; // its name
let currentTopicId = null;
let routeToken = 0;
let noteToken = 0;
const noteCache = new Map();

/* ---------- helpers ---------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* unavailable */ } },
};

function toast(message, ms = 2600) {
  const host = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 260);
  }, ms);
}

function flatTopics(s) {
  return s.chapters.flatMap((ch) => ch.topics.map((t) => ({ ...t, label: `${t.id} ${t.title}`, chapter: ch })));
}

/* ---------- mode (R / W) ---------- */
/* The R and W buttons: bottom of the index bar on a subject page, bottom-left corner on the home page. */
function modeSwitch(extra = "") {
  return `<div class="mode-switch ${extra}">
    <button class="mode-btn" data-mode="r" aria-pressed="${mode === "r"}" title="Reading mode">R</button>
    <button class="mode-btn" data-mode="w" aria-pressed="${mode === "w"}" title="Writing mode">W</button>
  </div>`;
}

function setMode(next) {
  mode = next;
  document.body.classList.toggle("write", mode === "w");
  document.querySelectorAll(".mode-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  if (mode === "r") { closeMenu(); Auth.lock(); } // leaving write mode forgets the token
  armIdle();
}

/* ---------- dropdown menus ---------- */
let menuEl = null;
function closeMenu() {
  if (menuEl) { menuEl.remove(); menuEl = null; }
}
function openMenu(btn, type) {
  const same = menuEl && menuEl.dataset.owner === btn.dataset.uid;
  closeMenu();
  if (same) return;
  btn.dataset.uid = btn.dataset.uid || Math.random().toString(36).slice(2);

  menuEl = document.createElement("div");
  menuEl.className = "menu";
  menuEl.dataset.owner = btn.dataset.uid;
  const chapterEl = btn.closest(".chapter");
  menuEl.dataset.folder = chapterEl ? chapterEl.dataset.folder || "" : ""; // which chapter a chapter menu acts on
  menuEl.setAttribute("role", "menu");
  menuEl.innerHTML = MENUS[type]
    .map(([label, phase, cls, action]) => `<button role="menuitem" class="${cls || ""}" data-phase="${phase}" data-action="${action || ""}" data-label="${esc(label)}">${esc(label)}</button>`)
    .join("");
  document.body.appendChild(menuEl);

  const r = btn.getBoundingClientRect();
  const w = menuEl.offsetWidth;
  const h = menuEl.offsetHeight;
  menuEl.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
  menuEl.style.top = `${r.bottom + h + 12 > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4}px`;
}

/* ---------- loading and error views ---------- */
function showSkeleton(kind) {
  if (kind === "subject") {
    document.body.classList.add("subject-view");
    app.innerHTML = `
      <div class="shell">
        <aside class="index"><div style="padding:14px">
          <span class="sk sk-head"></span>
          ${'<span class="sk sk-ch"></span>'.repeat(4)}
        </div></aside>
        <section class="content"><div class="note-scroll"><div class="note">
          <span class="sk sk-title"></span>
          <span class="sk sk-line" style="width:92%"></span>
          <span class="sk sk-line" style="width:84%"></span>
          <span class="sk sk-line" style="width:88%"></span>
        </div></div></section>
      </div>`;
  } else {
    document.body.classList.remove("subject-view");
    app.innerHTML = `
      <header class="page-head"><h1>Subject List</h1></header>
      <div class="sk-tiles">${[140, 90, 70, 210, 120, 150].map((w) => `<span class="sk" style="width:${w}px"></span>`).join("")}</div>`;
  }
}

/* Screens for the offline (local folder) mode. Returns null for any other error. */
function localScreen(e) {
  const notice = (title, text, buttons) => `<div class="notice"><h2>${title}</h2><p>${text}</p><div class="row">${buttons}</div></div>`;
  const pick = `<button class="btn" data-local="pick">Choose another folder</button>`;
  switch (e.code) {
    case "unsupported": {
      const brave = !!(navigator.brave);
      const repoHint = `<p>To read your notes from GitHub in this browser instead, open <code>config.js</code> and fill in <code>owner</code> and <code>repo</code> of your <b>notes repository</b> (read-only view, no folder needed).</p>`;
      const body = brave
        ? `<p>Brave turns off folder access by default. To turn it on:</p>
           <ol style="text-align:left;color:var(--text-muted);margin:0 0 16px;padding-left:22px">
             <li>Open a new tab and go to <code>brave://flags/#file-system-access-api</code></li>
             <li>Set <b>File System Access API</b> to <b>Enabled</b></li>
             <li>Click <b>Relaunch</b>, then open this page again</li>
           </ol>
           <p>If you can't find that setting in your Brave version, use Chrome or Edge.</p>${repoHint}`
        : `<p>This browser can't open folders on your computer, which offline mode needs. Open the page in Chrome or Edge instead.</p>${repoHint}`;
      return `<div class="notice"><h2>${brave ? "Brave has folder access turned off" : "This browser can't open folders"}</h2>${body}<div class="row"><button class="btn" data-retry="data">Try again</button></div></div>`;
    }
    case "need-folder":
      return notice("Open your notes folder",
        `This page is running from your computer. Choose the folder of your notes project, the one that contains <code>index.html</code> and the <code>notes</code> folder. Your browser asks once and remembers it.`,
        `<button class="btn primary" data-local="pick">Choose folder</button>`);
    case "need-permission":
    case "denied":
      return notice("Reconnect to your folder",
        `${esc(e.message)} Your browser asks for this again each time you reopen the page.`,
        `<button class="btn primary" data-local="reconnect">Continue</button>${pick}`);
    case "no-notes":
      return notice("No notes folder yet", `${esc(e.message)} Create one there, or choose a different folder.`,
        `<button class="btn primary" data-local="create">Create "notes" folder</button>${pick}`);
    default:
      return null;
  }
}

function renderError(e) {
  currentSubject = null;
  subj = null;
  document.body.classList.remove("subject-view");
  if (e.code === "not-configured") { renderNotConfigured(); return; }
  const local = localScreen(e);
  if (local) {
    document.title = "Notes";
    app.innerHTML = local;
    return;
  }
  const titles = {
    "rate-limit": "GitHub limit reached",
    "not-found": "Notes repository not found",
    "empty-repo": "Notes repository is empty",
    network: "Can't connect",
    libs: "Couldn't load the page",
  };
  const extra = e.code === "not-found"
    ? `<p>Check <code>owner</code>, <code>repo</code> and <code>branch</code> in <code>config.js</code>. The notes repository must be public. To change it, click <b>W</b>, log in and choose “Change notes repository”.</p>`
    : "";
  document.title = "Notes";
  app.innerHTML = `
    <div class="notice">
      <h2>${esc(titles[e.code] || "Something went wrong")}</h2>
      <p>${esc(e.message || "An unexpected problem stopped the page from loading.")}</p>
      ${extra}
      ${titles[e.code] ? "" : `<p>Try again. If it keeps happening, reload the page or open it in Chrome or Edge.</p>`}
      <div class="row"><button class="btn" data-retry="data">Try again</button></div>
    </div>`;
}

/* Pages site with no notes repository set: nothing is read from anywhere. R / W stay so the admin can log in. */
function renderNotConfigured() {
  currentSubject = null;
  subj = null;
  document.body.classList.remove("subject-view");
  document.title = "Notes";
  app.innerHTML = `
    <div class="notice">
      <h2>No notes source yet</h2>
      <p>No notes source is configured for this site yet. Please check back later.</p>
      <div class="row"><button class="btn primary w-only" id="set-repo">Set notes repository</button></div>
    </div>
    ${modeSwitch("home-mode")}`;
  setMode(mode);
}

function renderNotFound(name) {
  currentSubject = null;
  subj = null;
  document.body.classList.remove("subject-view");
  document.title = "Notes";
  app.innerHTML = `
    <div class="notice">
      <h2>Subject not found</h2>
      <p>There is no subject called "${esc(name)}". It may have been renamed or removed.</p>
      <div class="row"><a class="btn" href="#/">Back to all subjects</a></div>
    </div>`;
}

/* ---------- views ---------- */
function renderHome() {
  currentSubject = null;
  subj = null;
  document.body.classList.remove("subject-view");
  document.title = "Notes";
  const last = store.get(LAST_SUBJECT);
  const nr = NotesData.notesRepo();
  const repoLabel = nr ? `${nr.owner}/${nr.repo}` : "";

  const tiles = DATA.subjects.map((s, i) => {
    const cls = s.name === last ? "tile last-opened" : "tile";
    return `<a class="${cls}" style="animation-delay:${Math.min(i, 12) * 50}ms" href="#/subject/${encodeURIComponent(s.name)}">${esc(s.name)}</a>`;
  }).join("");

  const empty = `
    <div class="notice-inline">
      <p>No subjects found yet.</p>
      <p>Add a note to your notes repository, for example <code>${esc(NotesData.root)}/Python/Chapter 01 - Basics/1.1 Variables.md</code>, and it will appear here.</p>
    </div>`;

  app.innerHTML = `
    <header class="page-head">
      <h1>Subject List</h1>
      <button class="icon-btn w-only" id="add-subject" aria-label="Add subject" title="Add subject">+</button>
    </header>
    <section class="tiles">${tiles}</section>
    ${DATA.subjects.length ? "" : empty}
    ${NotesData.source() === "local"
      ? `<p class="source-note">Working offline in the folder <b>${esc(NotesLocal.folderName())}</b>. <button class="link-btn" data-local="pick">Change folder</button></p>`
      : NotesData.sourceInfo().viewOnly
        ? `<p class="source-note">Read-only view from GitHub. ${NotesData.sourceInfo().fallback ? "This browser can't open folders, so editing is off here." : "Editing needs the published site or a folder-capable browser."}</p>`
        : `<p class="source-note">Notes from <b>${esc(repoLabel)}</b>. <button class="link-btn w-only" id="set-repo">Change notes repository</button></p>`}
    ${modeSwitch("home-mode")}
  `;
  setMode(mode);
}

function buildSubject(found) {
  subj = found;
  currentSubject = found.name;
  store.set(LAST_SUBJECT, found.name);
  document.body.classList.add("subject-view");
  const name = found.name;
  const enc = encodeURIComponent(name);

  const chapters = found.chapters.map((ch) => `
    <div class="chapter" data-ch="${ch.num}" data-folder="${esc(ch.folder)}">
      <div class="chapter-row">
        <button class="chapter-btn" aria-expanded="false">
          <span class="chev">›</span><span>Chapter ${pad(ch.num)} - ${esc(ch.name)}</span>
        </button>
        <button class="dots w-only" data-menu="chapter" aria-label="Chapter options">⋯</button>
      </div>
      <div class="topics"><div class="topics-inner"><ul>
        ${ch.topics.length ? ch.topics.map((t) => `
          <li><a class="topic" data-id="${t.id}" href="#/subject/${enc}/${t.id}">${t.id} ${esc(t.title)}</a>
            <button class="dots w-only" data-menu="topic" aria-label="Topic options">⋯</button></li>`).join("")
          : `<li class="empty-note" style="padding:6px 10px;font-size:13px">No topics yet</li>`}
      </ul></div></div>
    </div>`).join("");

  app.innerHTML = `
    <div class="shell">
      <aside class="index" id="index">
        <div class="index-head">
          <a class="home-link" href="#/" title="All subjects" aria-label="All subjects">←</a>
          <span class="subject-name" title="${esc(name)}">${esc(name)}</span>
          <button class="dots w-only" data-menu="subject" aria-label="Subject options">⋯</button>
        </div>
        <nav class="chapters" aria-label="Chapters">${chapters || `<p class="empty-note" style="padding:10px">No chapters yet.</p>`}</nav>
        ${modeSwitch()}
      </aside>
      <div class="backdrop" id="backdrop"></div>
      <section class="content">
        <div class="mobile-bar">
          <button class="icon-btn" id="open-index" aria-label="Open index">☰</button>
          <span>${esc(name)}</span>
        </div>
        <div class="note-scroll" id="note-scroll"></div>
        <div class="add-bar w-only"><button id="add-content" aria-label="Add content" title="Add content">+</button></div>
      </section>
    </div>
  `;
  setMode(mode);
}

function setChapterOpen(chapterEl, open) {
  chapterEl.classList.toggle("open", open);
  chapterEl.querySelector(".chapter-btn").setAttribute("aria-expanded", String(open));
}

function toggleChapter(chapterEl) {
  const willOpen = !chapterEl.classList.contains("open");
  document.querySelectorAll(".chapter.open").forEach((c) => setChapterOpen(c, false)); // accordion
  if (willOpen) setChapterOpen(chapterEl, true);
}

/* Drops the note's own first heading when it just repeats the topic title. */
function dropDuplicateTitle(el, topic) {
  const first = [...el.children].find((c) => !c.classList.contains("toc"));
  if (!first || first.tagName !== "H1") return;
  const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const text = norm(first.textContent);
  if (text === norm(topic.title) || text === norm(topic.label)) first.remove();
}

async function showTopic(id) {
  const token = ++noteToken;
  const host = document.getElementById("note-scroll");
  document.querySelectorAll(".topic.active").forEach((a) => a.classList.remove("active"));
  const list = flatTopics(subj);
  const idx = id ? list.findIndex((t) => t.id === id) : -1;
  const enc = encodeURIComponent(subj.name);
  currentTopicId = idx === -1 ? null : id;

  if (idx === -1) {
    const last = store.get(lastTopicKey(subj.name));
    const lastItem = list.find((t) => t.id === last);
    document.title = `${subj.name} · Notes`;
    const message = !list.length
      ? "This subject has no notes yet."
      : id ? "That topic could not be found. It may have been renamed or moved." : "Pick a topic from the index to start reading.";
    host.innerHTML = `
      <div class="empty-state"><div>
        <h2>${esc(subj.name)}</h2>
        <p>${message}</p>
        ${lastItem ? `<a class="continue-btn" href="#/subject/${enc}/${lastItem.id}">Continue: ${esc(lastItem.label)}</a>` : ""}
      </div></div>`;
    return;
  }

  const t = list[idx];
  store.set(lastTopicKey(subj.name), id);

  const link = document.querySelector(`.topic[data-id="${CSS.escape(id)}"]`);
  if (link) {
    link.classList.add("active");
    const chapterEl = link.closest(".chapter");
    document.querySelectorAll(".chapter.open").forEach((c) => { if (c !== chapterEl) setChapterOpen(c, false); });
    setChapterOpen(chapterEl, true);
    link.scrollIntoView({ block: "nearest" });
  }

  const prev = list[idx - 1];
  const next = list[idx + 1];
  document.title = `${t.label} · ${subj.name}`;
  host.scrollTop = 0;
  host.innerHTML = `
    <article class="note">
      <div class="crumbs">${esc(subj.name)} / Chapter ${pad(t.chapter.num)} - ${esc(t.chapter.name)}</div>
      <h1>${esc(t.label)}</h1>
      <div id="note-body">
        <span class="sk sk-line" style="width:92%"></span>
        <span class="sk sk-line" style="width:84%"></span>
        <span class="sk sk-line" style="width:88%"></span>
        <span class="sk sk-line" style="width:60%"></span>
      </div>
      <div class="note-nav">
        ${prev ? `<a class="prev" href="#/subject/${enc}/${prev.id}"><small>← Previous</small>${esc(prev.label)}</a>` : "<span></span>"}
        ${next ? `<a class="next" href="#/subject/${enc}/${next.id}"><small>Next →</small>${esc(next.label)}</a>` : ""}
      </div>
    </article>`;

  const body = host.querySelector("#note-body");
  try {
    let text = noteCache.get(t.path);
    if (text === undefined) {
      text = await NotesData.loadNote(t.path);
      noteCache.set(t.path, text);
    }
    if (token !== noteToken) return; // user already moved on
    if (!text.trim()) {
      body.innerHTML = `<p class="empty-note">This note is empty.</p>`;
    } else {
      const el = NotesRender.toElement(text, t.path.slice(0, t.path.lastIndexOf("/")));
      dropDuplicateTitle(el, t);
      body.replaceChildren(el);
    }
  } catch (err) {
    if (token !== noteToken) return;
    body.innerHTML = `
      <div class="notice-inline">
        <p>${esc(err.message)}</p>
        <button class="btn" data-retry="note">Try again</button>
      </div>`;
  }
}

/* ---------- drawer (mobile) ---------- */
function setDrawer(open) {
  const idx = document.getElementById("index");
  const bd = document.getElementById("backdrop");
  if (idx) idx.classList.toggle("open", open);
  if (bd) bd.classList.toggle("open", open);
}

/* ---------- router ---------- */
async function route() {
  const token = ++routeToken;
  closeMenu();
  const m = (location.hash || "#/").match(/^#\/subject\/([^/]+)(?:\/(.+))?$/);

  if (!DATA) {
    showSkeleton(m ? "subject" : "home");
    try {
      DATA = await NotesData.loadData();
    } catch (e) {
      if (token === routeToken) renderError(e);
      return;
    }
    if (token !== routeToken) return;
  }

  try {
    if (m) {
      const name = decodeURIComponent(m[1]);
      const found = DATA.subjects.find((s) => s.name === name);
      if (!found) { renderNotFound(name); return; }
      if (currentSubject !== name || !document.getElementById("index")) buildSubject(found);
      await showTopic(m[2] ? decodeURIComponent(m[2]) : null);
      setDrawer(false);
    } else {
      renderHome();
      window.scrollTo(0, 0);
    }
  } catch (e) {
    if (token === routeToken) renderError(e);
  }
}

/* ---------- admin login (W button) ---------- */
const IDLE_MS = 30 * 60 * 1000;
let idleTimer = null;
let modalReturnFocus = null;

/* Writing mode locks itself after 30 minutes without clicks or keys. */
function armIdle() {
  clearTimeout(idleTimer);
  if (mode !== "w") return;
  idleTimer = setTimeout(() => {
    setMode("r");
    toast("Locked after 30 minutes of inactivity", 4000);
  }, IDLE_MS);
}
["pointerdown", "keydown"].forEach((ev) => document.addEventListener(ev, armIdle, { passive: true }));

function closeModal() {
  const m = document.getElementById("modal");
  if (m) m.remove();
  if (modalReturnFocus && document.contains(modalReturnFocus)) modalReturnFocus.focus();
  modalReturnFocus = null;
}

function openModal(html) {
  const keep = modalReturnFocus;
  closeModal();
  modalReturnFocus = keep;
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.id = "modal";
  wrap.innerHTML = html;
  wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) closeModal(); });
  document.body.appendChild(wrap);
  return wrap;
}

async function requestWrite(btn) {
  if (mode === "w") return;
  modalReturnFocus = btn;
  if (NotesData.sourceInfo().viewOnly) {
    openModal(`
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
        <h2 id="m-title">Editing isn't available here</h2>
        <p class="modal-sub">${NotesData.sourceInfo().fallback
          ? "This browser can't open folders, so you are viewing a read-only copy from GitHub. To edit, open the page in Chrome or Edge, or turn on folder access in Brave (<code>brave://flags/#file-system-access-api</code>), or log in on your published site."
          : "This page was opened as a file, so it can only show your notes. To edit, log in on your published site, or open the app from your project folder in a browser that can open folders."}</p>
        <div class="modal-actions"><button class="btn" data-modal-close>Close</button></div>
      </div>`);
    return;
  }
  let record;
  try {
    record = await Auth.loadRecord();
  } catch (e) {
    const notSetup = e.code === "not-setup";
    if (notSetup && NotesData.source() === "local") {
      // working on your own computer with no auth.json in the folder: nothing to log in against
      setMode("w");
      toast("No admin login found in this folder, so writing mode is unlocked.", 4000);
      return;
    }
    openModal(`
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
        <h2 id="m-title">${notSetup ? "Admin login not set up" : "Can't open login"}</h2>
        <p class="modal-sub">${notSetup
          ? "Create your username and password with the setup page, then add the generated <code>auth.json</code> to your repo."
          : esc(e.message)}</p>
        <div class="modal-actions">
          <button class="btn" data-modal-close>Close</button>
          ${notSetup ? `<a class="btn primary" href="setup.html" target="_blank" rel="noopener">Open setup</a>` : ""}
        </div>
      </div>`);
    return;
  }
  showLogin(record);
}

function showLogin(record) {
  const wrap = openModal(`
    <form class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title" autocomplete="on">
      <h2 id="m-title">Admin login</h2>
      <p class="modal-sub">Enter your credentials to unlock writing mode.</p>
      <label class="field"><span>Username</span><input name="username" autocomplete="username" spellcheck="false" required /></label>
      <label class="field"><span>Password</span>
        <div class="pw"><input name="password" type="password" autocomplete="current-password" required />
        <button type="button" class="pw-toggle" aria-label="Show password">Show</button></div>
      </label>
      <p class="form-error" role="alert"></p>
      <div class="modal-actions">
        <button type="button" class="btn" data-modal-close>Cancel</button>
        <button type="submit" class="btn primary">Unlock</button>
      </div>
    </form>`);

  const form = wrap.querySelector("form");
  const user = form.elements.username;
  const pass = form.elements.password;
  const err = wrap.querySelector(".form-error");
  const submit = form.querySelector('[type="submit"]');
  let fails = 0;
  user.focus();

  const setBusy = (busy) => {
    user.disabled = pass.disabled = submit.disabled = busy;
    submit.textContent = busy ? "Checking…" : "Unlock";
  };

  wrap.querySelector(".pw-toggle").addEventListener("click", (e) => {
    const show = pass.type === "password";
    pass.type = show ? "text" : "password";
    e.currentTarget.textContent = show ? "Hide" : "Show";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.textContent = "";
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30)); // let "Checking…" paint before the heavy key derivation
    try {
      const token = await Auth.unlock(record, user.value, pass.value);
      closeModal();
      setMode("w");
      toast("Writing mode unlocked");
      checkTokenAccess(token);
    } catch (ex) {
      const wrong = ex.code === "bad-credentials";
      err.textContent = wrong ? "Incorrect username or password."
        : ex.code === "no-crypto" ? ex.message
        : "The admin file looks damaged. Generate it again with setup.html.";
      form.classList.remove("shake");
      void form.offsetWidth; // restart the shake animation
      form.classList.add("shake");
      pass.value = "";
      if (wrong && ++fails >= 3) await new Promise((r) => setTimeout(r, (fails - 2) * 1000)); // slow down guessing
      setBusy(false);
      pass.focus();
    }
  });
}

/* Right after login: with no notes repository the admin is taken to the setup form,
   otherwise this is advisory only (warns early if the token cannot write to the notes repo). */
async function checkTokenAccess(token) {
  const repo = NotesData.notesRepo();
  if (!repo) {
    if (NotesData.source() === "github") openNotesRepoForm();
    return;
  }
  const result = await Auth.checkWriteAccess(token, repo);
  if (result.ok === false) toast(`Heads up: ${result.reason}`, 6000);
}

/* ---------- Set notes repository (Phase 5R) ---------- */
function openNotesRepoForm() {
  if (mode !== "w" || !Auth.isUnlocked()) { toast("Click W and log in first."); return; }
  const cur = NotesData.notesRepo();
  modalReturnFocus = document.activeElement;
  const wrap = openModal(`
    <form class="modal wide" role="dialog" aria-modal="true" aria-labelledby="m-title" autocomplete="off">
      <h2 id="m-title">${cur ? "Change notes repository" : "Set notes repository"}</h2>
      <p class="modal-sub">Your notes live in their own <b>public</b> GitHub repository, separate from this site, so saving a note never rebuilds the site. Create that repository first if you have not (add a README so it has a first commit).</p>
      <label class="field"><span>Notes repository (owner/name)</span>
        <input name="repo" value="${esc(cur ? `${cur.owner}/${cur.repo}` : "")}" placeholder="your-name/my-notes" spellcheck="false" required /></label>
      <label class="field"><span>Branch (optional)</span>
        <input name="branch" value="${esc(cur ? cur.branch : "")}" placeholder="default branch" spellcheck="false" /></label>
      <label class="field"><span>Folder for subjects (optional)</span>
        <input name="root" value="${esc(cur ? cur.root : "")}" placeholder="notes" spellcheck="false" />
        <small>Leave empty to use <code>notes</code>.</small></label>
      <p class="form-error" role="alert"></p>
      <div class="modal-actions">
        <button type="button" class="btn" data-modal-close>Cancel</button>
        <button type="submit" class="btn primary">Verify and save</button>
      </div>
    </form>`);

  const form = wrap.querySelector("form");
  const err = form.querySelector(".form-error");
  const submit = form.querySelector('[type="submit"]');
  const fields = [form.elements.repo, form.elements.branch, form.elements.root];
  let busy = false;
  const setBusy = (on, text) => {
    busy = on;
    fields.forEach((f) => { f.disabled = on; });
    submit.disabled = on;
    submit.textContent = text || "Verify and save";
  };
  fields[0].focus();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    err.textContent = "";
    setBusy(true, "Checking repository…");
    let verified;
    try {
      verified = await NotesWrite.verifyNotesRepo({ repo: fields[0].value, branch: fields[1].value, root: fields[2].value });
    } catch (ex) {
      err.textContent = ex.message || "Could not check that repository. Nothing was changed.";
      setBusy(false);
      fields[0].focus();
      return;
    }

    // From now on this page session reads and writes the new notes repository (config.js is not deployed yet).
    NotesData.setNotesRepo(verified.repo);
    noteCache.clear();
    DATA = null;
    history.replaceState(null, "", `${location.pathname}${location.search}#/`);
    route();

    submit.textContent = "Saving the setting…";
    showRepoResult(wrap, verified, await trySaveConfig(verified.repo));
  });
}

async function trySaveConfig(repo) {
  try {
    await NotesWrite.saveConfig(repo);
    return { saved: true };
  } catch (ex) {
    return { saved: false, reason: ex.message || "The setting could not be saved." };
  }
}

function showRepoResult(wrap, verified, outcome) {
  const modal = wrap.querySelector(".modal");
  const name = `${verified.repo.owner}/${verified.repo.repo}`;
  const warn = verified.warnings.map((w) => `<p class="modal-sub form-warn">${esc(w)}</p>`).join("");

  if (outcome.saved) {
    modal.innerHTML = `
      <h2 id="m-title">Notes repository set</h2>
      <p class="modal-sub">This session now reads and writes <b>${esc(name)}</b> right away. The choice was saved to <code>config.js</code> in this site's repository (one commit). The <b>public site switches to the new notes repository after GitHub Pages finishes deploying</b>, usually within a minute or two.</p>
      ${warn}
      <div class="modal-actions"><button type="button" class="btn primary" data-modal-close>Done</button></div>`;
    return;
  }

  const text = NotesData.configText(verified.repo);
  modal.innerHTML = `
    <h2 id="m-title">Works now, but not saved yet</h2>
    <p class="modal-sub">This session already uses <b>${esc(name)}</b>, so you can keep working. The setting could not be saved to the site automatically: ${esc(outcome.reason)}</p>
    <p class="modal-sub">To make it permanent for everyone, replace the whole content of <code>config.js</code> with this text:</p>
    <textarea id="cfg-text" readonly spellcheck="false">${esc(text)}</textarea>
    <div class="row-btns">
      <button type="button" class="btn primary" id="cfg-copy">Copy</button>
      <button type="button" class="btn" id="cfg-retry">Try saving again</button>
    </div>
    <ol class="steps">
      <li>On GitHub open this site's repository and the file <code>config.js</code>.</li>
      <li>Click the pencil (Edit), select everything, paste, then choose <b>Commit changes</b>.</li>
      <li>Wait a minute or two for GitHub Pages to publish. After that the public site uses the notes repository.</li>
    </ol>
    ${warn}
    <div class="modal-actions"><button type="button" class="btn" data-modal-close>Done</button></div>`;

  const area = modal.querySelector("#cfg-text");
  const copy = modal.querySelector("#cfg-copy");
  copy.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(text); copy.textContent = "Copied"; }
    catch { area.select(); copy.textContent = "Press Ctrl+C"; }
    setTimeout(() => { copy.textContent = "Copy"; }, 1500);
  });
  const retry = modal.querySelector("#cfg-retry");
  retry.addEventListener("click", async () => {
    retry.disabled = true;
    retry.textContent = "Saving…";
    showRepoResult(wrap, verified, await trySaveConfig(verified.repo));
  });
}

/* ---------- writing: dialogs and subject actions (Phase 5) ---------- */

/* One reusable dialog: optional text input with live validation, a confirm button that
   shows "Saving…" while onSubmit runs, and the error (if any) shown inline. */
function dialog({ title, sub, input, confirm, danger, onSubmit }) {
  const wrap = openModal(`
    <form class="modal" role="dialog" aria-modal="true" aria-labelledby="m-title" autocomplete="off">
      <h2 id="m-title">${esc(title)}</h2>
      <p class="modal-sub">${sub}</p>
      ${input ? `<label class="field"><span>${esc(input.label)}</span>
        <input name="value" value="${esc(input.value || "")}" placeholder="${esc(input.placeholder || "")}" maxlength="120" spellcheck="false"${input.inputmode ? ` inputmode="${esc(input.inputmode)}"` : ""} /></label>` : ""}
      <p class="form-error" role="alert"></p>
      <div class="modal-actions">
        <button type="button" class="btn" data-modal-close>Cancel</button>
        <button type="submit" class="btn ${danger ? "danger" : "primary"}">${esc(confirm)}</button>
      </div>
    </form>`);

  const form = wrap.querySelector("form");
  const field = form.elements.value || null;
  const err = form.querySelector(".form-error");
  const submit = form.querySelector('[type="submit"]');
  const cancel = form.querySelector("[data-modal-close]");
  let busy = false;

  const check = () => {
    const msg = input.validate(field.value); // "" ok, " " = silently not ready, otherwise a message
    err.textContent = msg.trim();
    submit.disabled = !!msg;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy || submit.disabled) return;
    busy = true;
    const value = field ? NotesWrite.cleanName(field.value) : undefined;
    err.textContent = "";
    [field, submit, cancel].forEach((el) => { if (el) el.disabled = true; });
    submit.textContent = "Saving…";
    try {
      await onSubmit(value);
      closeModal();
    } catch (ex) {
      err.textContent = ex.message || "Something went wrong. Nothing was changed.";
      [field, cancel].forEach((el) => { if (el) el.disabled = false; });
      submit.disabled = false;
      submit.textContent = confirm;
      busy = false;
      if (field) field.focus();
    }
  });

  if (field) {
    field.addEventListener("input", check);
    field.focus();
    field.select();
    check();
  } else {
    cancel.focus(); // for confirmations the safe choice has focus
  }
}

/* Offline mode buttons (choose / reconnect / create). Must run straight from the click. */
async function localAction(kind) {
  try {
    if (kind === "pick") await NotesLocal.pickFolder();
    else if (kind === "reconnect") await NotesLocal.reconnect();
    else if (kind === "create") await NotesLocal.createNotesFolder();
  } catch (e) {
    if (e.code === "aborted") return;
    if (e.code === "no-notes") { renderError(e); return; }
    toast(e.name === "SecurityError"
      ? "The browser won't open that folder. Choose your project folder itself, not a system folder like Documents or Desktop."
      : (e.message || "Could not open that folder."), 6000);
    return;
  }
  noteCache.clear();
  NotesData.resetData();
  DATA = null;
  if (kind === "pick") history.replaceState(null, "", `${location.pathname}${location.search}#/`);
  route();
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function nameValidator(taken, current) {
  return (value) => {
    const n = NotesWrite.cleanName(value);
    if (!n || n === current) return " ";
    return NotesWrite.validateName(n, taken);
  };
}

const otherSubjects = (except) => DATA.subjects.map((s) => s.name).filter((n) => n !== except).map((n) => n.toLowerCase());

/* After a save: show the new state immediately (no waiting for GitHub Pages). */
async function applySave(result) {
  noteCache.clear();
  try {
    DATA = await NotesData.refresh(result);
  } catch {
    DATA = null; // could not re-read now, so the next route() loads fresh data
    NotesData.resetData();
  }
}

function forgetSubjectState(name, moveTo) {
  const topic = store.get(lastTopicKey(name));
  try {
    localStorage.removeItem(lastTopicKey(name));
    if (store.get(LAST_SUBJECT) === name) moveTo ? localStorage.setItem(LAST_SUBJECT, moveTo) : localStorage.removeItem(LAST_SUBJECT);
  } catch { /* storage unavailable */ }
  if (moveTo && topic) store.set(lastTopicKey(moveTo), topic);
}

function addSubjectDialog() {
  dialog({
    title: "New subject",
    sub: "Give the subject a name. You can add chapters to it next.",
    input: { label: "Subject name", placeholder: "e.g. Operating Systems", validate: nameValidator(otherSubjects()) },
    confirm: "Create subject",
    onSubmit: async (name) => {
      await applySave(await NotesWrite.addSubject(name));
      toast("Subject created");
      location.hash = `#/subject/${encodeURIComponent(name)}`;
    },
  });
}

function renameSubjectDialog() {
  const old = subj.name;
  const topicId = currentTopicId;
  dialog({
    title: "Rename subject",
    sub: `Everything inside <b>${esc(old)}</b> moves to the new name in a single save.`,
    input: { label: "Subject name", value: old, validate: nameValidator(otherSubjects(old), old) },
    confirm: "Rename",
    onSubmit: async (name) => {
      await applySave(await NotesWrite.renameSubject(old, name));
      forgetSubjectState(old, name);
      toast("Subject renamed");
      location.hash = `#/subject/${encodeURIComponent(name)}${topicId ? `/${topicId}` : ""}`;
    },
  });
}

function deleteSubjectDialog() {
  const name = subj.name;
  const chapters = subj.chapters.length;
  const notes = flatTopics(subj).length;
  dialog({
    title: "Delete this subject?",
    sub: `<b>${esc(name)}</b> will be removed along with ${plural(chapters, "chapter")} and ${plural(notes, "note")}. You can still recover it from your repo's commit history.`,
    confirm: "Delete subject",
    danger: true,
    onSubmit: async () => {
      await applySave(await NotesWrite.deleteSubject(name));
      forgetSubjectState(name, null);
      toast("Subject deleted");
      location.hash = "#/";
    },
  });
}

/* ---------- chapters (Phase 6) ---------- */
const chapterByFolder = (folder) => (subj ? subj.chapters.find((c) => c.folder === folder) : null);
const chapterLabel = (ch) => `Chapter ${pad(ch.num)} - ${esc(ch.name)}`;
const topicChapterNum = (id) => (id ? parseInt(String(id).split(".")[0], 10) : NaN);

function openChapterNum() {
  const el = document.querySelector(".chapter.open");
  return el ? parseInt(el.dataset.ch, 10) : null;
}

function numberValidator(usedByOthers, current) {
  return (value) => {
    const v = String(value).trim();
    if (!v) return " ";
    if (!/^\d+$/.test(v)) return "Enter a whole number, 0 or higher.";
    if (v.length > 6) return "That number is too large.";
    const n = parseInt(v, 10);
    if (n === current) return " ";
    if (usedByOthers.has(n)) return `Chapter ${pad(n)} already exists. Pick a number that is not used yet.`;
    return "";
  };
}

/* Rebuilds the subject page from the fresh data without a reload: sets the address to `topicId`,
   keeps the mobile drawer and the index scroll position, and opens chapter `openNum` (one at a time). */
async function showSubjectAfterSave({ topicId, openNum }) {
  const name = subj.name;
  try {
    history.replaceState(null, "", `${location.pathname}${location.search}#/subject/${encodeURIComponent(name)}${topicId ? `/${topicId}` : ""}`);
    const found = DATA && DATA.subjects.find((s) => s.name === name);
    if (!found) throw new Error("fresh data not available");
    const index = document.getElementById("index");
    const drawerOpen = !!(index && index.classList.contains("open"));
    const list = index && index.querySelector(".chapters");
    const scroll = list ? list.scrollTop : 0;
    buildSubject(found);
    setDrawer(drawerOpen);
    await showTopic(topicId || null);
    if (openNum != null) {
      const el = document.querySelector(`.chapter[data-ch="${CSS.escape(String(openNum))}"]`);
      if (el) {
        document.querySelectorAll(".chapter.open").forEach((c) => setChapterOpen(c, false));
        setChapterOpen(el, true);
      }
    }
    const nav = document.querySelector(".chapters");
    if (nav) nav.scrollTop = scroll;
    const opened = document.querySelector(".chapter.open");
    if (opened && openNum != null) opened.scrollIntoView({ block: "nearest" });
  } catch {
    currentSubject = null; // the save worked; just load everything again from the repo
    route();
  }
}

function addChapterDialog() {
  const subjectName = subj.name;
  dialog({
    title: "Insert new chapter",
    sub: `Give the chapter a name. Its number is chosen automatically (the first chapter is <b>00</b>, then one more than the highest existing number).`,
    input: { label: "Chapter name", placeholder: "e.g. Introduction", validate: nameValidator([]) },
    confirm: "Create chapter",
    onSubmit: async (name) => {
      const result = await NotesWrite.addChapter(subjectName, name);
      await applySave(result);
      toast(`Chapter ${pad(result.num)} created`);
      await showSubjectAfterSave({ topicId: currentTopicId, openNum: result.num });
    },
  });
}

function renameChapterDialog(folder) {
  const ch = chapterByFolder(folder);
  if (!ch) { toast("That chapter is not in the list any more. Reload the page."); return; }
  const subjectName = subj.name;
  dialog({
    title: "Rename chapter",
    sub: `Only the name of <b>${chapterLabel(ch)}</b> changes. Its number and its topics stay the same.`,
    input: { label: "Chapter name", value: ch.name, validate: nameValidator([], ch.name) },
    confirm: "Rename",
    onSubmit: async (name) => {
      const openNum = openChapterNum();
      await applySave(await NotesWrite.renameChapter(subjectName, folder, name));
      toast("Chapter renamed");
      await showSubjectAfterSave({ topicId: currentTopicId, openNum }); // topic ids do not change, so the open note stays open
    },
  });
}

function changeChapterNumberDialog(folder) {
  const ch = chapterByFolder(folder);
  if (!ch) { toast("That chapter is not in the list any more. Reload the page."); return; }
  const subjectName = subj.name;
  const oldNum = ch.num;
  const used = new Set(subj.chapters.filter((c) => c !== ch).map((c) => c.num));
  dialog({
    title: "Change chapter number",
    sub: `Choose a new number for <b>${chapterLabel(ch)}</b>. Numbers must be unique. The ${plural(ch.topics.length, "topic")} inside will be renamed to match (for example ${oldNum}.1 becomes the new number followed by .1).`,
    input: { label: "New chapter number", value: pad(oldNum), inputmode: "numeric", validate: numberValidator(used, oldNum) },
    confirm: "Change number",
    onSubmit: async (value) => {
      const newNum = parseInt(value, 10);
      const openNum = openChapterNum();
      await applySave(await NotesWrite.changeChapterNumber(subjectName, folder, newNum));

      // topic ids and addresses start with the chapter number, so follow the open topic and the remembered one
      const renumber = (id) => (topicChapterNum(id) === oldNum ? `${newNum}.${String(id).split(".")[1]}` : id);
      const last = store.get(lastTopicKey(subjectName));
      if (last && renumber(last) !== last) store.set(lastTopicKey(subjectName), renumber(last));
      toast("Chapter number changed");
      await showSubjectAfterSave({ topicId: renumber(currentTopicId), openNum: openNum === oldNum ? newNum : openNum });
    },
  });
}

function deleteChapterDialog(folder) {
  const ch = chapterByFolder(folder);
  if (!ch) { toast("That chapter is not in the list any more. Reload the page."); return; }
  const subjectName = subj.name;
  const oldNum = ch.num;
  dialog({
    title: "Delete this chapter?",
    sub: `<b>${chapterLabel(ch)}</b> will be removed along with ${plural(ch.topics.length, "topic")}. You can still recover it from your repo's commit history.`,
    confirm: "Delete chapter",
    danger: true,
    onSubmit: async () => {
      const openNum = openChapterNum();
      await applySave(await NotesWrite.deleteChapter(subjectName, folder));

      const last = store.get(lastTopicKey(subjectName));
      if (last && topicChapterNum(last) === oldNum) { try { localStorage.removeItem(lastTopicKey(subjectName)); } catch { /* storage unavailable */ } }
      const gone = topicChapterNum(currentTopicId) === oldNum;
      toast("Chapter deleted");
      await showSubjectAfterSave({ topicId: gone ? null : currentTopicId, openNum: openNum === oldNum ? null : openNum });
    },
  });
}

const ACTIONS = {
  "subject:rename": renameSubjectDialog,
  "subject:delete": deleteSubjectDialog,
  "chapter:add": addChapterDialog,
  "chapter:rename": renameChapterDialog,
  "chapter:number": changeChapterNumberDialog,
  "chapter:delete": deleteChapterDialog,
};

/* ---------- events (delegated) ---------- */
document.addEventListener("click", (e) => {
  const t = e.target;

  const menuItem = t.closest(".menu button");
  if (menuItem) {
    const action = ACTIONS[menuItem.dataset.action];
    const folder = menuEl ? menuEl.dataset.folder || "" : ""; // read before the menu is removed
    closeMenu();
    if (action) action(folder);
    else toast(`"${menuItem.dataset.label}" arrives in Phase ${menuItem.dataset.phase}`);
    return;
  }

  const dots = t.closest(".dots");
  if (dots) { e.stopPropagation(); openMenu(dots, dots.dataset.menu); return; }
  closeMenu();

  /* in-page links (table of contents, footnotes) scroll instead of changing the route */
  const anchor = t.closest('a[href^="#"]');
  if (anchor && !anchor.getAttribute("href").startsWith("#/")) {
    e.preventDefault();
    let target = null;
    try { target = document.getElementById(decodeURIComponent(anchor.getAttribute("href").slice(1))); } catch { /* bad escape */ }
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const localBtn = t.closest("[data-local]");
  if (localBtn) { localAction(localBtn.dataset.local); return; }

  const retry = t.closest("[data-retry]");
  if (retry) {
    if (retry.dataset.retry === "data") {
      NotesData.resetData();
      DATA = null;
      route();
    } else if (subj) {
      showTopic(currentTopicId);
    }
    return;
  }

  if (t.closest("[data-modal-close]")) { closeModal(); return; }

  if (t.closest("#set-repo")) { openNotesRepoForm(); return; }

  const modeBtn = t.closest(".mode-btn");
  if (modeBtn) {
    if (modeBtn.dataset.mode === "w") requestWrite(modeBtn);
    else setMode("r");
    return;
  }

  const chapterBtn = t.closest(".chapter-btn");
  if (chapterBtn) { toggleChapter(chapterBtn.closest(".chapter")); return; }

  if (t.closest("#open-index")) { setDrawer(true); return; }
  if (t.closest("#backdrop")) { setDrawer(false); return; }
  if (t.closest("#add-subject")) { addSubjectDialog(); return; }
  if (t.closest("#add-content")) { toast("The insert menu arrives in Phase 9"); return; }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeMenu(); closeModal(); setDrawer(false); }
});

NotesData.setTokenProvider(() => Auth.getToken());
NotesWrite.setGuard(() => mode === "w"); // saving is only possible while writing mode is unlocked
if (NotesData.source() === "local") Auth.setRecordLoader(() => NotesLocal.readRootFile("auth.json"));
window.addEventListener("hashchange", route);
window.addEventListener("resize", closeMenu);
route();
