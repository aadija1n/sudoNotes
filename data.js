/* Phase 3: data layer. Reads the repo folder tree from the GitHub API (one call,
   cached for a minute) and note text from the site itself.

   Expected repo layout:
     notes/<Subject>/Chapter 01 - Name/1.1 Topic title.md                            */

(function (global) {
  const cfg = global.NOTES_CONFIG || {};
  const root = String(cfg.root || "notes").replace(/^\/+|\/+$/g, "");
  const TREE_TTL_MS = 60 * 1000;

  const CHAPTER_RE = /^Chapter\s+(\d+)\s*-\s*(.+)$/i;
  const TOPIC_RE = /^(\d+)\.(\d+)\s+(.+)\.md$/i;

  function fail(code, message) {
    const e = new Error(message);
    e.code = code;
    return e;
  }

  /* ---------- which backend? ----------
     source() answers "github" (read the repo through the GitHub API, write with the admin token)
     or "local" (read and write the cloned repo's notes folder with browser folder access).

     Rule order, first match wins:
       1. Host is *.github.io                  -> "github". Always. Pages never shows local screens,
                                                  so ?source=local and config.mode "local" are ignored there.
       2. ?source=local|github in the address  -> that value.
       3. mode: "local"|"github" in config.js  -> that value.
       4. Opened from this computer (file:, localhost, 127.x, ::1) -> "local".
       5. Any other host (custom domain)       -> "github".
     Then one capability check: if the result is "local" but this browser has no showDirectoryPicker
     (Brave by default, Firefox, Safari) and owner/repo are known (config.js), use "github" read-only
     instead (sourceInfo().fallback is true). With no repo known it stays "local" and the app shows
     how to enable folder access.
     owner/repo in config.js no longer decide the source on their own: they only say which repo to read. */
  const LOCAL_HOST_RE = /^(localhost|127(\.\d+){3}|\[?::1\]?|.+\.localhost)$/;
  const hostName = () => ((global.location && global.location.hostname) || "").toLowerCase();
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

    const fallback = want === "local" && !canOpenFolders() && !!detectRepo();
    const source = fallback ? "github" : want;
    // Read-only: folder-access fallback, or a file:// page (cannot fetch auth.json or notes by relative path)
    const viewOnly = fallback || (source === "github" && !!global.location && global.location.protocol === "file:");
    return { source, fallback, viewOnly };
  }
  const source = () => sourceInfo().source;

  /* ---------- repo detection ---------- */
  function detectRepo() {
    let owner = cfg.owner;
    let repo = cfg.repo;
    if (owner && repo) return { owner, repo };
    const host = (global.location && global.location.hostname) || "";
    if (host.endsWith(".github.io")) {
      owner = owner || host.split(".")[0];
      const first = global.location.pathname.split("/").filter(Boolean)[0];
      repo = repo || (first && !/\.html?$/i.test(first) ? first : `${owner}.github.io`);
      return { owner, repo };
    }
    return null;
  }

  /* ---------- GitHub API ---------- */
  /* In writing mode the admin token is attached to reads too (higher rate limit,
     always the latest data). If GitHub rejects the token we silently retry without it. */
  let tokenProvider = null;

  async function api(path, allowAuth = true) {
    const token = allowAuth && tokenProvider ? tokenProvider() : null;
    let res;
    try {
      res = await fetch(`https://api.github.com${path}`, {
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
    if (res.status === 404) throw fail("not-found", "Repository or branch not found. The repo must be public.");
    if (!res.ok) throw fail("http", `GitHub returned an unexpected error (${res.status}).`);
    return res.json();
  }

  async function fetchPaths(repo) {
    const key = `notes:tree:${repo.owner}/${repo.repo}:${cfg.branch || "default"}`;
    try {
      const hit = JSON.parse(sessionStorage.getItem(key) || "null");
      if (hit && Date.now() - hit.t < TREE_TTL_MS) return hit.paths;
    } catch { /* ignore cache problems */ }

    const base = `/repos/${repo.owner}/${repo.repo}`;
    let data;
    try {
      data = await api(`${base}/git/trees/${encodeURIComponent(cfg.branch || "HEAD")}?recursive=1`);
    } catch (e) {
      if (e.code === "not-found" && !cfg.branch) {
        const info = await api(base);
        data = await api(`${base}/git/trees/${encodeURIComponent(info.default_branch)}?recursive=1`);
      } else {
        throw e;
      }
    }
    const prefix = `${root}/`;
    const paths = (data.tree || []).filter((n) => n.type === "blob" && n.path.startsWith(prefix)).map((n) => n.path);
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
      if (!ch) subj.chapters.set(num, (ch = { num, name: cm[2].trim(), folder: chapDir, topics: [] }));

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
            .map((c) => ({ ...c, topics: c.topics.sort((a, b) => a.idx - b.idx) })),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    };
  }

  /* ---------- public API ---------- */
  let dataPromise = null;
  function loadData() {
    if (!dataPromise) {
      dataPromise = (async () => {
        if (source() === "local") return parseTree(await global.NotesLocal.listPaths(), root);
        const repo = detectRepo();
        if (!repo) throw fail("no-config", "Could not work out which GitHub repo to read from.");
        return parseTree(await fetchPaths(repo), root);
      })();
      dataPromise.catch(() => { dataPromise = null; }); // allow retry after a failure
    }
    return dataPromise;
  }

  function resetData() {
    dataPromise = null;
    try {
      Object.keys(sessionStorage).filter((k) => k.startsWith("notes:tree:")).forEach((k) => sessionStorage.removeItem(k));
    } catch { /* ignore */ }
  }

  /* Re-reads the whole tree right after a save, from the new tree's id, so the UI
     shows the change instantly without waiting for GitHub Pages to publish. */
  async function refresh(result) {
    if (source() === "local") {
      dataPromise = null;
      return loadData();
    }
    const treeSha = result.treeSha;
    const repo = detectRepo();
    if (!repo) throw fail("no-config", "Could not work out which GitHub repo to read from.");
    const data = await api(`/repos/${repo.owner}/${repo.repo}/git/trees/${treeSha}?recursive=1`);
    const prefix = `${root}/`;
    const paths = (data.tree || []).filter((n) => n.type === "blob" && n.path.startsWith(prefix)).map((n) => n.path);
    try {
      Object.keys(sessionStorage).filter((k) => k.startsWith("notes:tree:")).forEach((k) => sessionStorage.removeItem(k));
    } catch { /* ignore */ }
    const parsed = parseTree(paths, root);
    dataPromise = Promise.resolve(parsed);
    return parsed;
  }

  async function loadNote(path) {
    if (source() === "local") return global.NotesLocal.readText(path);
    const url = path.split("/").map(encodeURIComponent).join("/");

    // In writing mode read through the API: it is always current, while the published
    // site can lag a minute or two behind a save.
    const token = tokenProvider ? tokenProvider() : null;
    const repo = token ? detectRepo() : null;
    if (token && repo) {
      try {
        const ref = cfg.branch ? `?ref=${encodeURIComponent(cfg.branch)}` : "";
        const r = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/contents/${url}${ref}`, {
          headers: { Accept: "application/vnd.github.raw+json", Authorization: `Bearer ${token}` },
        });
        if (r.ok) return r.text();
      } catch { /* fall back to the published site */ }
    }

    // From a file:// page, or the read-only fallback, the notes are not next to the page:
    // read them from the repo's raw file host (it allows cross-site reads).
    let target = url;
    if (sourceInfo().fallback || (global.location && global.location.protocol === "file:")) {
      const r0 = detectRepo();
      if (!r0) throw fail("no-config", "Could not work out which GitHub repo to read from.");
      target = `https://raw.githubusercontent.com/${r0.owner}/${r0.repo}/${encodeURIComponent(cfg.branch || "HEAD")}/${url}`;
    }

    let res;
    try {
      res = await fetch(target, { cache: "no-cache" });
    } catch {
      throw fail("network", "Could not load this note. Check your internet connection.");
    }
    if (res.status === 404) throw fail("not-found", "This note is not published yet. GitHub Pages can take a minute or two after a change.");
    if (!res.ok) throw fail("http", `The note could not be loaded (${res.status}).`);
    return res.text();
  }

  global.NotesData = {
    loadData, resetData, loadNote, parseTree, detectRepo, refresh, source, sourceInfo, root,
    setTokenProvider(fn) { tokenProvider = fn; },
  };
})(typeof window !== "undefined" ? window : globalThis);
