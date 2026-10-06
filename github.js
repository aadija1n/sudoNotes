/* Phase 5: write layer. Every change is ONE commit made with the GitHub Git Data API,
   so a rename that touches many files either fully happens or doesn't happen at all.
   Needs writing mode to be unlocked (the token lives in Auth, in memory only). */

(function (global) {
  const cfg = global.NOTES_CONFIG || {};
  const root = global.NotesData.root;
  let branchCache = null;

  function fail(code, message, status) {
    const e = new Error(message);
    e.code = code;
    if (status) e.status = status;
    return e;
  }

  function repo() {
    const r = global.NotesData.detectRepo();
    if (!r) throw fail("no-config", "Could not work out which GitHub repo to save to.");
    return r;
  }

  const refPath = (branch) => `/git/ref/heads/${branch.split("/").map(encodeURIComponent).join("/")}`;
  const refUpdatePath = (branch) => `/git/refs/heads/${branch.split("/").map(encodeURIComponent).join("/")}`;

  /* One authenticated call to the repo's API. Errors become short, human messages. */
  async function gh(method, path, body) {
    const token = global.Auth.getToken();
    if (!token) throw fail("locked", "Writing mode is locked. Click W and log in again.");
    const r = repo();
    let res;
    try {
      res = await fetch(`https://api.github.com/repos/${r.owner}/${r.repo}${path}`, {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw fail("network", "Could not reach GitHub. Nothing was changed.");
    }
    if (res.ok) return res.json();

    let detail = "";
    try { detail = (await res.json()).message || ""; } catch { /* no body */ }
    if (res.status === 401) throw fail("auth", "GitHub rejected the saved token. It may have expired. Create a new one with setup.html.", 401);
    if (res.status === 403) throw fail("forbidden", "GitHub refused the change. The token needs Contents: Read and write on this repository.", 403);
    if (res.status === 404) throw fail("not-found", "GitHub could not find the repository or branch. Check that the token has access to this repo.", 404);
    throw fail("http", `GitHub reported a problem${detail ? `: ${detail}` : ""} (${res.status}). Nothing was changed.`, res.status);
  }

  async function getBranch() {
    if (!branchCache) branchCache = cfg.branch || (await gh("GET", "")).default_branch;
    return branchCache;
  }

  /* The latest commit and the full file list, read fresh so we never edit stale state. */
  async function getHead() {
    const branch = await getBranch();
    const ref = await gh("GET", refPath(branch));
    const commit = await gh("GET", `/git/commits/${ref.object.sha}`);
    const tree = await gh("GET", `/git/trees/${commit.tree.sha}?recursive=1`);
    if (tree.truncated) throw fail("too-big", "This repository is too large to change from the browser.");
    return { branch, commitSha: ref.object.sha, treeSha: commit.tree.sha, entries: tree.tree };
  }

  /* Reads the repo, lets `plan` decide the changes, then writes them as a single commit. */
  async function commit(message, plan) {
    const head = await getHead();
    const changes = plan(head.entries);
    const tree = await gh("POST", "/git/trees", { base_tree: head.treeSha, tree: changes });
    const made = await gh("POST", "/git/commits", { message, tree: tree.sha, parents: [head.commitSha] });
    try {
      await gh("PATCH", refUpdatePath(head.branch), { sha: made.sha });
    } catch (e) {
      if (e.status === 422 || e.status === 409) throw fail("conflict", "The repository changed while saving. Nothing was lost. Please try again.");
      throw e;
    }
    return { treeSha: tree.sha, commitSha: made.sha };
  }

  /* ---------- names ---------- */
  const cleanName = (raw) => String(raw).replace(/\s+/g, " ").trim();

  /* Returns an error message, or "" when the name is fine. `takenLower` = names already in use. */
  function validateName(raw, takenLower) {
    const n = cleanName(raw);
    if (!n) return "Enter a name.";
    if (n.length > 80) return "Keep the name under 80 characters.";
    if (/[\\/:*?"<>|\u0000-\u001f]/.test(n)) return 'Names cannot contain / \\ : * ? " < > |';
    if (n.startsWith(".")) return "A name cannot start with a dot.";
    if (/[. ]$/.test(n)) return "A name cannot end with a dot.";
    if ((takenLower || []).includes(n.toLowerCase())) return "A subject with this name already exists.";
    return "";
  }

  const subjectsIn = (entries) => {
    const prefix = `${root}/`;
    const names = new Set();
    for (const e of entries) {
      if (e.type !== "blob" || !e.path.startsWith(prefix)) continue;
      const parts = e.path.slice(prefix.length).split("/");
      if (parts.length >= 2) names.add(parts[0]);
    }
    return [...names];
  };

  const blobsUnder = (entries, folder) => entries.filter((e) => e.type === "blob" && e.path.startsWith(`${folder}/`));
  const removal = (e) => ({ path: e.path, mode: e.mode, type: "blob", sha: null });

  /* ---------- subject operations ---------- */
  function addSubject(rawName) {
    const name = cleanName(rawName);
    return commit(`Add subject: ${name}`, (entries) => {
      const err = validateName(name, subjectsIn(entries).map((s) => s.toLowerCase()));
      if (err) throw fail("invalid", err);
      // git cannot store empty folders, so a .gitkeep file holds the subject open
      return [{ path: `${root}/${name}/.gitkeep`, mode: "100644", type: "blob", content: "" }];
    });
  }

  function renameSubject(oldName, rawNew) {
    const name = cleanName(rawNew);
    return commit(`Rename subject: ${oldName} → ${name}`, (entries) => {
      const files = blobsUnder(entries, `${root}/${oldName}`);
      if (!files.length) throw fail("missing", "That subject no longer exists in the repo. Reload the page.");
      const others = subjectsIn(entries).filter((s) => s !== oldName).map((s) => s.toLowerCase());
      const err = validateName(name, others);
      if (err) throw fail("invalid", err);
      const from = `${root}/${oldName}/`;
      const to = `${root}/${name}/`;
      return files.flatMap((e) => [removal(e), { path: to + e.path.slice(from.length), mode: e.mode, type: "blob", sha: e.sha }]);
    });
  }

  function deleteSubject(name) {
    return commit(`Delete subject: ${name}`, (entries) => {
      const files = blobsUnder(entries, `${root}/${name}`);
      if (!files.length) throw fail("missing", "That subject no longer exists in the repo. Reload the page.");
      return files.map(removal);
    });
  }

  global.NotesWrite = { cleanName, validateName, addSubject, renameSubject, deleteSubject };
})(window);
