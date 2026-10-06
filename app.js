/* Phase 1: shell, dark theme, home page with sample subject tiles.
   Sample data below is temporary; real subjects load from the repo in Phase 3. */

const SAMPLE_SUBJECTS = [
  "Computer Networks",
  "Python",
  "C++",
  "Database management Systems",
  "Git & Github",
  "General Aptitude",
];

const app = document.getElementById("app");
const LAST_KEY = "notes:lastSubject";

/* ---------- helpers ---------- */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function getLast() {
  try { return localStorage.getItem(LAST_KEY); } catch { return null; }
}
function setLast(name) {
  try { localStorage.setItem(LAST_KEY, name); } catch { /* storage unavailable */ }
}

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

/* ---------- views ---------- */
function renderHome() {
  document.title = "Notes";
  const last = getLast();

  const tiles = SAMPLE_SUBJECTS.length
    ? SAMPLE_SUBJECTS.map((name, i) => {
        const cls = name === last ? "tile last-opened" : "tile";
        return `<a class="${cls}" style="animation-delay:${i * 50}ms" href="#/subject/${encodeURIComponent(name)}">${esc(name)}</a>`;
      }).join("")
    : `<p class="empty">No subjects yet.</p>`;

  app.innerHTML = `
    <header class="page-head">
      <h1>Subject List</h1>
      <button class="icon-btn" id="add-subject" aria-label="Add subject" title="Add subject">+</button>
    </header>
    <section class="tiles">${tiles}</section>
  `;

  document.getElementById("add-subject").addEventListener("click", () => {
    toast("Adding subjects arrives in Phase 5 (write mode only)");
  });
}

function renderSubject(name) {
  document.title = `${name} · Notes`;
  setLast(name);
  app.innerHTML = `
    <a class="back-link" href="#/">← All subjects</a>
    <header class="page-head"><h1>${esc(name)}</h1></header>
    <div class="placeholder">
      <h2>Subject page coming in Phase 2</h2>
      <p>The index bar, chapters and content panel will appear here.</p>
    </div>
  `;
}

/* ---------- router (hash-based, works on GitHub Pages) ---------- */
function route() {
  const hash = location.hash || "#/";
  const match = hash.match(/^#\/subject\/(.+)$/);
  if (match) {
    renderSubject(decodeURIComponent(match[1]));
  } else {
    renderHome();
  }
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", route);
route();
