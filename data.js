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
  async function api(path) {
    let res;
    try {
      res = await fetch(`https://api.github.com${path}`, { headers: { Accept: "application/vnd.github+json" } });
    } catch {
      throw fail("network", "Could not reach GitHub. Check your internet connection and try again.");
    }
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

  async function loadNote(path) {
    const url = path.split("/").map(encodeURIComponent).join("/");
    let res;
    try {
      res = await fetch(url, { cache: "no-cache" });
    } catch {
      throw fail("network", "Could not load this note. Check your internet connection.");
    }
    if (res.status === 404) throw fail("not-found", "This note is not published yet. GitHub Pages can take a minute or two after a change.");
    if (!res.ok) throw fail("http", `The note could not be loaded (${res.status}).`);
    return res.text();
  }

  global.NotesData = { loadData, resetData, loadNote, parseTree, root };
})(typeof window !== "undefined" ? window : globalThis);
