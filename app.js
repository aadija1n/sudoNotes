/* Phase 2: subject page layout, chapter accordion, R/W buttons (UI only).
   All data below is sample data; real data loads from the repo in Phase 3. */

const SAMPLE_SUBJECTS = [
  "Computer Networks",
  "Python",
  "C++",
  "Database management Systems",
  "Git & Github",
  "General Aptitude",
];

const SAMPLE_CHAPTERS = [
  { num: 0, name: "Syllabus", topics: ["Course overview", "Reference books"] },
  { num: 1, name: "Introduction", topics: ["introduction", "xyztpoic"] },
  { num: 2, name: "Basics", topics: ["sample topic", "another topic"] },
];

/* Menu items: [label, phase in which it becomes functional, optional style] */
const MENUS = {
  subject: [["Insert new chapter", 6], ["Rename subject", 5], ["Delete subject", 5, "danger"]],
  chapter: [["Add topic", 8], ["Rename chapter", 6], ["Change number", 6], ["Move up", 7], ["Move down", 7], ["Delete chapter", 6, "danger"]],
  topic: [["Rename", 8], ["Move up", 8], ["Move down", 8], ["Delete", 8, "danger"]],
};

const app = document.getElementById("app");
const LAST_SUBJECT = "notes:lastSubject";
const lastTopicKey = (s) => `notes:lastTopic:${s}`;

let mode = "r"; // always starts in read mode
let currentSubject = null;

/* ---------- helpers ---------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* unavailable */ } },
};

function toast(message) {
  const host = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 260);
  }, 2600);
}

/* flat list of topics: id "1.2", label "1.2 xyztpoic", chapter info */
function flatTopics() {
  const out = [];
  SAMPLE_CHAPTERS.forEach((ch) => ch.topics.forEach((t, i) => {
    const id = `${ch.num}.${i + 1}`;
    out.push({ id, label: `${id} ${t}`, chapter: ch });
  }));
  return out;
}

/* ---------- mode (R / W) ---------- */
function setMode(next) {
  mode = next;
  document.body.classList.toggle("write", mode === "w");
  document.querySelectorAll(".mode-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  if (mode === "r") closeMenu();
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
  menuEl.setAttribute("role", "menu");
  menuEl.innerHTML = MENUS[type]
    .map(([label, phase, cls]) => `<button role="menuitem" class="${cls || ""}" data-phase="${phase}" data-label="${esc(label)}">${esc(label)}</button>`)
    .join("");
  document.body.appendChild(menuEl);

  const r = btn.getBoundingClientRect();
  const w = menuEl.offsetWidth;
  const h = menuEl.offsetHeight;
  menuEl.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
  menuEl.style.top = `${r.bottom + h + 12 > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4}px`;
}

/* ---------- views ---------- */
function renderHome() {
  currentSubject = null;
  document.body.classList.remove("subject-view");
  document.title = "Notes";
  const last = store.get(LAST_SUBJECT);

  const tiles = SAMPLE_SUBJECTS.map((name, i) => {
    const cls = name === last ? "tile last-opened" : "tile";
    return `<a class="${cls}" style="animation-delay:${i * 50}ms" href="#/subject/${encodeURIComponent(name)}">${esc(name)}</a>`;
  }).join("");

  app.innerHTML = `
    <header class="page-head">
      <h1>Subject List</h1>
      <button class="icon-btn w-only" id="add-subject" aria-label="Add subject" title="Add subject">+</button>
    </header>
    <section class="tiles">${tiles || `<p class="empty">No subjects yet.</p>`}</section>
  `;
}

function buildSubject(name) {
  currentSubject = name;
  store.set(LAST_SUBJECT, name);
  document.body.classList.add("subject-view");
  const enc = encodeURIComponent(name);

  const chapters = SAMPLE_CHAPTERS.map((ch) => `
    <div class="chapter" data-ch="${ch.num}">
      <div class="chapter-row">
        <button class="chapter-btn" aria-expanded="false">
          <span class="chev">›</span><span>Chapter ${pad(ch.num)} - ${esc(ch.name)}</span>
        </button>
        <button class="dots w-only" data-menu="chapter" aria-label="Chapter options">⋯</button>
      </div>
      <div class="topics"><div class="topics-inner"><ul>
        ${ch.topics.map((t, i) => {
          const id = `${ch.num}.${i + 1}`;
          return `<li><a class="topic" data-id="${id}" href="#/subject/${enc}/${id}">${id} ${esc(t)}</a>
            <button class="dots w-only" data-menu="topic" aria-label="Topic options">⋯</button></li>`;
        }).join("")}
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
        <nav class="chapters" aria-label="Chapters">${chapters}</nav>
        <div class="mode-switch">
          <button class="mode-btn" data-mode="r" aria-pressed="true" title="Reading mode">R</button>
          <button class="mode-btn" data-mode="w" aria-pressed="false" title="Writing mode">W</button>
        </div>
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

function showTopic(id) {
  const host = document.getElementById("note-scroll");
  document.querySelectorAll(".topic.active").forEach((a) => a.classList.remove("active"));
  const list = flatTopics();
  const idx = list.findIndex((t) => t.id === id);
  const enc = encodeURIComponent(currentSubject);

  if (idx === -1) {
    const last = store.get(lastTopicKey(currentSubject));
    const lastItem = list.find((t) => t.id === last);
    document.title = `${currentSubject} · Notes`;
    host.innerHTML = `
      <div class="empty-state"><div>
        <h2>${esc(currentSubject)}</h2>
        <p>Pick a topic from the index to start reading.</p>
        ${lastItem ? `<a class="continue-btn" href="#/subject/${enc}/${lastItem.id}">Continue: ${esc(lastItem.label)}</a>` : ""}
      </div></div>`;
    return;
  }

  const t = list[idx];
  store.set(lastTopicKey(currentSubject), id);

  const link = document.querySelector(`.topic[data-id="${id}"]`);
  if (link) {
    link.classList.add("active");
    const chapterEl = link.closest(".chapter");
    document.querySelectorAll(".chapter.open").forEach((c) => { if (c !== chapterEl) setChapterOpen(c, false); });
    setChapterOpen(chapterEl, true);
    link.scrollIntoView({ block: "nearest" });
  }

  const prev = list[idx - 1];
  const next = list[idx + 1];
  document.title = `${t.label} · ${currentSubject}`;
  host.scrollTop = 0;
  host.innerHTML = `
    <article class="note">
      <div class="crumbs">${esc(currentSubject)} / Chapter ${pad(t.chapter.num)} - ${esc(t.chapter.name)}</div>
      <h1>${esc(t.label)}</h1>
      <div class="note-placeholder">Notes will render here. Markdown loading from your repo arrives in Phase 3.</div>
      <div class="note-nav">
        ${prev ? `<a class="prev" href="#/subject/${enc}/${prev.id}"><small>← Previous</small>${esc(prev.label)}</a>` : "<span></span>"}
        ${next ? `<a class="next" href="#/subject/${enc}/${next.id}"><small>Next →</small>${esc(next.label)}</a>` : ""}
      </div>
    </article>`;
}

/* ---------- drawer (mobile) ---------- */
function setDrawer(open) {
  const idx = document.getElementById("index");
  const bd = document.getElementById("backdrop");
  if (idx) idx.classList.toggle("open", open);
  if (bd) bd.classList.toggle("open", open);
}

/* ---------- router ---------- */
function route() {
  closeMenu();
  const m = (location.hash || "#/").match(/^#\/subject\/([^/]+)(?:\/(.+))?$/);
  if (m) {
    const name = decodeURIComponent(m[1]);
    if (currentSubject !== name || !document.getElementById("index")) buildSubject(name);
    showTopic(m[2] ? decodeURIComponent(m[2]) : null);
    setDrawer(false);
  } else {
    renderHome();
    window.scrollTo(0, 0);
  }
}

/* ---------- events (delegated) ---------- */
document.addEventListener("click", (e) => {
  const t = e.target;

  const menuItem = t.closest(".menu button");
  if (menuItem) {
    toast(`"${menuItem.dataset.label}" arrives in Phase ${menuItem.dataset.phase}`);
    closeMenu();
    return;
  }

  const dots = t.closest(".dots");
  if (dots) { e.stopPropagation(); openMenu(dots, dots.dataset.menu); return; }
  closeMenu();

  const modeBtn = t.closest(".mode-btn");
  if (modeBtn) {
    const next = modeBtn.dataset.mode;
    if (next === "w" && mode !== "w") toast("Write mode preview. The login check arrives in Phase 4");
    setMode(next);
    return;
  }

  const chapterBtn = t.closest(".chapter-btn");
  if (chapterBtn) { toggleChapter(chapterBtn.closest(".chapter")); return; }

  if (t.closest("#open-index")) { setDrawer(true); return; }
  if (t.closest("#backdrop")) { setDrawer(false); return; }
  if (t.closest("#add-subject")) { toast("Adding subjects arrives in Phase 5"); return; }
  if (t.closest("#add-content")) { toast("The insert menu arrives in Phase 9"); return; }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeMenu(); setDrawer(false); }
});

window.addEventListener("hashchange", route);
window.addEventListener("resize", closeMenu);
route();
