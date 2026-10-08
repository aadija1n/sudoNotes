/* Phase 3 / 5R: data layer. Reads the folder tree of the NOTES repository from the GitHub API
   (one call, cached for a minute) and note text from raw.githubusercontent.com.

   Two repositories are kept strictly apart:
     - APP repo   = where this site and auth.json live. Detected from the Pages URL by appRepo().
                    The only thing ever written there is config.js (one time, when you set the notes repo).
     - NOTES repo = where the notes live. Comes from config.js (owner/repo/branch/root) via notesRepo(),
                    or from the admin's "Set notes repository" choice for the current page session.
                    Empty owner/repo means "not configured": nothing is read from anywhere.

   Expected layout inside the notes repo:
     notes/<Subject>/Chapter 01 - Name/1.1 Topic title.md                            */

(function (global) {
  const cfg = global.NOTES_CONFIG || {};
  const TREE_TTL_MS = 60 * 1000;
  const DEFAULT_ROOT = "notes";

  const CHAPTER_RE = /^Chapter\s+(\d+)\s*-\s*(.+)$/i;
  const TOPIC_RE = /^(\d+)\.(\d+)\s+(.+)\.md$/i;

  function fail(code, message) {
    const e = new Error(message);
    e.code = code;
    return e;
  }

  /* ---------- the notes repository (from config.js, or set for this session) ---------- */
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const cleanRoot = (r) => str(r).replace(/^\/+|\/+$/g, "") || DEFAULT_ROOT;
  const fromConfig = () => ({ owner: str(cfg.owner), repo: str(cfg.repo), branch: str(cfg.branch), root: cleanRoot(cfg.root) });
  let active = fromConfig();

  /* { owner, repo, branch, root } or null when no notes repository is configured. */
  function notesRepo() {
    return active.owner && active.repo ? { ...active } : null;
  }
  const isConfigured = () => !!notesRepo();

  /* Uses another notes repository from now on (this page session only; config.js is untouched). */
  function setNotesRepo(r) {
    active = { owner: str(r.owner), repo: str(r.repo), branch: str(r.branch), root: cleanRoot(r.root) };
    resetData();
  }

  /* ---------- the app repository (only ever used to save config.js) ---------- */
  const hostName = () => ((global.location && global.location.hostname) || "").toLowerCase();

  function appRepo() {
    const host = hostName();
    if (!host.endsWith(".github.io")) return null; // custom domain, localhost, file: cannot be told
    const owner = host.split(".")[0];
    const first = global.location.pathname.split("/").filter(Boolean)[0];
    const repo = first && !/\.html?$/i.test(first) ? first : `${owner}.github.io`;
    return { owner, repo };
  }

  /* The text of config.js for a given notes repository (used by the one-time save and the paste fallback). */
  function configText(r) {
    const q = (v) => JSON.stringify(String(v == null ? "" : v));
    const mode = cfg.mode === "local" || cfg.mode === "github" ? `  mode: ${q(cfg.mode)},\n` : "";
    return `/* Configuration.
   owner / repo / branch / root describe the NOTES repository: the separate, public GitHub
   repo that holds all your notes. This site's own repo is never used for notes.
   - Leave owner and repo empty while no notes repository is set. Visitors then see a
     "not configured" notice. Log in with W and use "Set notes repository" and the app
     writes this file for you.
   - branch: leave empty to use the repository's default branch.
   - root: the folder in the notes repo that holds all subjects (default "notes"). */
window.NOTES_CONFIG = {
  owner: ${q(r && r.owner)},
  repo: ${q(r && r.repo)},
  branch: ${q(r && r.branch)},
  root: ${q(cleanRoot(r && r.root))},
${mode}};
`;
  }

  /* ---------- which backend? ----------
     source() answers "github" (read the notes repo through GitHub, write with the admin token)
     or "local" (read and write the cloned project's notes folder with browser folder access).

     Rule order, first match wins:
       1. Host is *.github.io                  -> "github". Always. Pages never shows local screens,
                                                  so ?source=local and config.mode "local" are ignored there.
       2. ?source=local|github in the address  -> that value.
       3. mode: "local"|"github" in config.js  -> that value.
       4. Opened from this computer (file:, localhost, 127.x, ::1) -> "local".
       5. Any other host (custom domain)       -> "github".
     Then one capability check: if the result is "local" but this browser has no showDirectoryPicker
     (Brave by default, Firefox, Safari) and a notes repository is configured, use "github" read-only
     instead (sourceInfo().fallback is true). With no notes repository it stays "local" and the app shows
     how to enable folder access.
     owner/repo in config.js do not decide the source on their own: they only say which notes repo to read. */
  const LOCAL_HOST_RE = /^(localhost|127(\.\d+){3}|\[?::1\]?|.+\.localhost)$/;
  const onGithubPages = () => hostName().endsWith(".github.io");
  const onThisComputer = () => (global.location && global.location.protocol === "file:") || hostName() === "" || LOCAL_HOST_RE.test(hostName());
  const canOpenFolders = () => typeof global.showDirectoryPicker === "function";

  function sourceInfo() {
    const m = ((global.location && global.location.search) || "").match(/[?&]source=(local|github)\b/);
    const forced = (m && m[1]) || cfg.mode;
    let want;
    if (onGithubPages()) want = "github";
    else if (forced === "local" || forced === "github") want = forced;
    else want = onThisComputer() ? "local" : "github";

    const fallback = want === "local" && !canOpenFolders() && isConfigured();
    const source = fallback ? "github" : want;
    // Read-only: folder-access fallback, or a file:// page (cannot fetch auth.json by relative path)
    const viewOnly = fallback || (source === "github" && !!global.location && global.location.protocol === "file:");
    return { source, fallback, viewOnly };
  }
  const source = () => sourceInfo().source;

  /* ---------- GitHub API (reads) ---------- */
  /* In writing mode the admin token is attached to reads too (higher rate limit,
     always the latest data). If GitHub rejects the token we silently retry without it. */
  let tokenProvider = null;

  async function api(path, allowAuth = true) {
    const token = allowAuth && tokenProvider ? tokenProvider() : null;
    let res;
    try {
      res = await fetch(`https://api.github.com${path}`, {
        cache: "no-cache", // always revalidate (a 304 costs no rate limit); never serve a stale branch
        headers: { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
    } catch {
      throw fail("network", "Could not reach GitHub. Check your internet connection and try again.");
    }
    if (token && res.status === 401) return api(path, false);
    if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
      const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
      const mins = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 60000)) : null;
      throw fail("rate-limit", `GitHub's hourly limit for anonymous requests was reached${mins ? `. Try again in about ${mins} minute${mins > 1 ? "s" : ""}` : ""}.`);
    }
    if (res.status === 404) throw fail("not-found", "The notes repository or branch was not found. Check the repository and branch in config.js. The repository must be public.");
    if (res.status === 409) throw fail("empty-repo", "The notes repository has no commits yet. Create its first commit on GitHub (for example add a README), then try again.");
    if (!res.ok) throw fail("http", `GitHub returned an unexpected error (${res.status}).`);
    return res.json();
  }

  const segs = (s) => s.split("/").map(encodeURIComponent).join("/");
  const rawBase = (r) => `https://raw.githubusercontent.com/${r.owner}/${r.repo}/${segs(r.branch || "HEAD")}/`;
  const pathsOf = (data, root) => (data.tree || []).filter((n) => n.type === "blob" && n.path.startsWith(`${root}/`)).map((n) => n.path);
  const clearTreeCache = () => {
    try { Object.keys(sessionStorage).filter((k) => k.startsWith("notes:tree:")).forEach((k) => sessionStorage.removeItem(k)); } catch { /* ignore */ }
  };

  async function fetchPaths(repo) {
    const key = `notes:tree:${repo.owner}/${repo.repo}:${repo.branch || "default"}:${repo.root}`;
    try {
      const hit = JSON.parse(sessionStorage.getItem(key) || "null");
      if (hit && Date.now() - hit.t < TREE_TTL_MS) return hit.paths;
    } catch { /* ignore cache problems */ }

    const base = `/repos/${repo.owner}/${repo.repo}`;
    let data;
    try {
      data = await api(`${base}/git/trees/${encodeURIComponent(repo.branch || "HEAD")}?recursive=1`);
    } catch (e) {
      if (e.code === "not-found" && !repo.branch) {
        const info = await api(base);
        data = await api(`${base}/git/trees/${encodeURIComponent(info.default_branch)}?recursive=1`);
      } else {
        throw e;
      }
    }
    const paths = pathsOf(data, repo.root);
    try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), paths })); } catch { /* ignore */ }
    return paths;
  }

  /* ---------- parsing (pure, no network) ---------- */
  function parseTree(paths, rootDir) {
    const subjects = new Map();
    for (const p of paths) {
      const parts = p.slice(rootDir.length + 1).split("/");
      if (parts.length < 2) continue; // a loose file directly in the root
      const [subjName, chapDir, file] = parts;

      let subj = subjects.get(subjName);
      if (!subj) subjects.set(subjName, (subj = { name: subjName, chapters: new Map() }));
      if (parts.length !== 3) continue; // only Subject/Chapter/Topic is used

      const cm = chapDir.match(CHAPTER_RE);
      if (!cm) continue;
      const num = parseInt(cm[1], 10);
      let ch = subj.chapters.get(num);
      if (!ch) subj.chapters.set(num, (ch = { num, name: cm[2].trim(), folder: chapDir, topics: [], dups: [] }));
      else if (ch.folder !== chapDir && !ch.dups.includes(chapDir)) ch.dups.push(chapDir); // two folders, one number (Phase 7 warning)

      const tm = file.match(TOPIC_RE);
      if (!tm) continue;
      const idx = parseInt(tm[2], 10);
      ch.topics.push({ id: `${num}.${idx}`, num, idx, title: tm[3].trim(), path: p });
    }

    return {
      subjects: [...subjects.values()]
        .map((s) => ({
          name: s.name,
          chapters: [...s.chapters.values()]
            .sort((a, b) => a.num - b.num)
            .map((c) => {
              const topics = c.topics.sort((a, b) => a.idx - b.idx);
              // Phase 8B: topic indexes that more than one file uses (for example "1.2 A.md" and "1.2 B.md")
              const seen = new Set();
              const topicDups = [];
              for (const t of topics) { if (seen.has(t.idx) && !topicDups.includes(t.idx)) topicDups.push(t.idx); seen.add(t.idx); }
              return { ...c, topics, topicDups };
            }),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    };
  }

  /* ---------- staged changes (Phase 7) ----------
     stage.js registers an overlay while changes are pending (GitHub mode, writing mode). Then every view reads
     the virtual tree (base + pending changes) instead of the repository, and note text of moved or new files
     comes from the stage (staged text, or the original blob). The signatures below do not change. */
  let overlay = null; // { active(), paths(), resolve(path) -> {content}|{sha}|null }
  const overlayOn = () => !!(overlay && overlay.active());
  function setOverlay(o) { overlay = o; }

  async function loadBlob(repo, sha) {
    const token = tokenProvider ? tokenProvider() : null;
    let res;
    try {
      res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/git/blobs/${encodeURIComponent(sha)}`, {
        cache: "no-store",
        headers: { Accept: "application/vnd.github.raw+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
    } catch {
      throw fail("network", "Could not load this note. Check your internet connection.");
    }
    if (!res.ok) throw fail("http", `The note could not be loaded (${res.status}).`);
    return res.text();
  }

  /* ---------- public API ---------- */
  let dataPromise = null;
  function loadData() {
    if (overlayOn()) return Promise.resolve(parseTree(overlay.paths(), active.root)); // never cached: it changes with every edit
    if (!dataPromise) {
      dataPromise = (async () => {
        if (source() === "local") return parseTree(await global.NotesLocal.listPaths(), active.root);
        const repo = notesRepo();
        if (!repo) throw fail("not-configured", "No notes repository has been configured for this site yet.");
        return parseTree(await fetchPaths(repo), repo.root);
      })();
      dataPromise.catch(() => { dataPromise = null; }); // allow retry after a failure
    }
    return dataPromise;
  }

  function resetData() {
    dataPromise = null;
    clearTreeCache();
  }

  /* Re-reads the whole tree right after a save, from the new tree's id, so the UI
     shows the change instantly without waiting for any cache. Always the NOTES repo. */
  async function refresh(result) {
    if (source() === "local") {
      dataPromise = null;
      return loadData();
    }
    const repo = notesRepo();
    if (!repo) throw fail("not-configured", "No notes repository has been configured for this site yet.");
    const data = await api(`/repos/${repo.owner}/${repo.repo}/git/trees/${result.treeSha}?recursive=1`);
    clearTreeCache();
    const parsed = parseTree(pathsOf(data, repo.root), repo.root);
    dataPromise = Promise.resolve(parsed);
    return parsed;
  }

  async function loadNote(path) {
    if (source() === "local") return global.NotesLocal.readText(path);
    const repo = notesRepo();
    if (!repo) throw fail("not-configured", "No notes repository has been configured for this site yet.");
    if (overlayOn()) {
      const r = overlay.resolve(path); // a staged file: its text, or the blob it came from (even if it was moved or renamed)
      if (r && r.content !== undefined) return r.content;
      if (r && r.sha) return loadBlob(repo, r.sha);
    }
    const url = path.split("/").map(encodeURIComponent).join("/");

    // In writing mode read through the API: it is always current, while the raw file host
    // can lag a few minutes behind a save.
    const token = tokenProvider ? tokenProvider() : null;
    if (token) {
      try {
        const ref = repo.branch ? `?ref=${encodeURIComponent(repo.branch)}` : "";
        const r = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/contents/${url}${ref}`, {
          cache: "no-store",
          headers: { Accept: "application/vnd.github.raw+json", Authorization: `Bearer ${token}` },
        });
        if (r.ok) return r.text();
      } catch { /* fall back to the raw file host */ }
    }

    // Everyone else: raw file host of the notes repo (no API quota, allows cross-site reads).
    let res;
    try {
      res = await fetch(`${rawBase(repo)}${url}`, { cache: "no-cache" });
    } catch {
      throw fail("network", "Could not load this note. Check your internet connection.");
    }
    if (res.status === 404) throw fail("not-found", "This note was not found in the notes repository. If you just saved it, wait a minute and try again.");
    if (!res.ok) throw fail("http", `The note could not be loaded (${res.status}).`);
    return res.text();
  }

  /* Absolute address for a file next to a note (images). `encodedPath` is already URL-encoded.
     null in offline mode (relative paths work there) or when nothing is configured. */
  function assetUrl(encodedPath) {
    if (source() === "local") return null;
    const repo = notesRepo();
    return repo ? `${rawBase(repo)}${encodedPath}` : null;
  }

  global.NotesData = {
    loadData, resetData, loadNote, parseTree, refresh, source, sourceInfo,
    notesRepo, appRepo, isConfigured, setNotesRepo, configText, assetUrl, setOverlay,
    get root() { return active.root; },
    setTokenProvider(fn) { tokenProvider = fn; },
  };
})(typeof window !== "undefined" ? window : globalThis);
