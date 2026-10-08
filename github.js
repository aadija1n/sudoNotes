/* Phase 5 / 5R: write layer.
   Notes: every change is ONE commit to the NOTES repository, made with the GitHub Git Data API,
   so a rename that touches many files either fully happens or doesn't happen at all.
   App repo: the only thing ever written there is config.js, once, by saveConfig().
   Needs writing mode to be unlocked (the token lives in Auth, in memory only). Tokens are never logged. */

(function (global) {
  const D = global.NotesData;
  const NOTES = "notes repository";
  const APP = "site repository";
  const branchCache = new Map();
  let guard = null; // set by the app: returns false while writing mode is locked

  function fail(code, message, status) {
    const e = new Error(message);
    e.code = code;
    if (status) e.status = status;
    return e;
  }

  const sameRepo = (a, b) => a.owner.toLowerCase() === b.owner.toLowerCase() && a.repo.toLowerCase() === b.repo.toLowerCase();
  const label = (r) => `${r.owner}/${r.repo}`;

  /* The repository every note change goes to (the notes repo). Never the app repo. */
  function getWriteRepo() {
    const r = D.notesRepo();
    if (!r) throw fail("not-configured", "No notes repository is set yet. Click W, log in and choose “Set notes repository”.");
    return r;
  }

  const encRef = (branch) => branch.split("/").map(encodeURIComponent).join("/");
  const refPath = (branch) => `/git/ref/heads/${encRef(branch)}`;
  const refUpdatePath = (branch) => `/git/refs/heads/${encRef(branch)}`;

  /* One authenticated call to a repo's API. Errors become short, human messages. */
  async function ghRepo(repo, what, method, path, body, step = "complete the request") {
    const token = global.Auth.getToken();
    if (!token) throw fail("locked", "Writing mode is locked. Click W and log in again.");
    let res;
    try {
      res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}${path}`, {
        method,
        cache: "no-store", // GitHub lets browsers cache GETs for ~1 minute: a stale branch head would hide the newest changes
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw fail("network", "Could not reach GitHub. Check your internet connection. Nothing was changed.");
    }
    if (res.ok) return res.json();

    let detail = "";
    try { detail = (await res.json()).message || ""; } catch { /* no body */ }
    const where = `the ${what} (${label(repo)})`;
    if (res.status === 401) throw fail("auth", "GitHub rejected the saved token. It may have expired. Create a new one with setup.html.", 401);
    if (res.status === 403) {
      if (/rate limit/i.test(detail)) throw fail("rate-limit", "GitHub is limiting requests right now. Wait a minute and try again.", 403);
      if (/saml/i.test(detail)) throw fail("forbidden", "Your organization requires this token to be authorized for it (SAML). Authorize it in the token's settings on GitHub.", 403);
      if (/not accessible|permission/i.test(detail)) {
        throw fail("forbidden", `GitHub says this token is not allowed to ${step} in ${where}. On GitHub open Settings → Developer settings → Fine-grained tokens, edit the token, select this repository and set Repository permissions → Contents to "Read and write". (GitHub said: ${detail})`, 403);
      }
      throw fail("forbidden", `GitHub refused to ${step} in ${where}${detail ? `: ${detail}` : "."}`, 403);
    }
    if (res.status === 404) throw fail("not-found", `GitHub could not find ${where} or its branch. Check the name, and that the token includes this repository.`, 404);
    if (res.status === 409 && /empty/i.test(detail)) {
      throw fail("empty-repo", `The ${what} (${label(repo)}) has no commits yet. Create its first commit on GitHub (for example open the repo and choose “Add a README”), then try again.`, 409);
    }
    throw fail("http", `GitHub reported a problem${detail ? `: ${detail}` : ""} (${res.status}). Nothing was changed.`, res.status);
  }

  async function getBranch(repo) {
    if (repo.branch) return repo.branch;
    const key = label(repo).toLowerCase();
    if (!branchCache.has(key)) branchCache.set(key, (await ghRepo(repo, NOTES, "GET", "", null, "read the repository")).default_branch);
    return branchCache.get(key);
  }

  /* The latest commit and the full file list, read fresh so we never edit stale state. */
  async function getHead(repo) {
    const branch = await getBranch(repo);
    const ref = await ghRepo(repo, NOTES, "GET", refPath(branch), null, "read the branch");
    const commit = await ghRepo(repo, NOTES, "GET", `/git/commits/${ref.object.sha}`, null, "read the latest commit");
    const tree = await ghRepo(repo, NOTES, "GET", `/git/trees/${commit.tree.sha}?recursive=1`, null, "read the file list");
    if (tree.truncated) throw fail("too-big", "This repository is too large to change from the browser.");
    return { branch, commitSha: ref.object.sha, treeSha: commit.tree.sha, entries: tree.tree };
  }

  /* Reads the notes repo, lets `plan` decide the changes, then writes them as a single commit. */
  async function commit(message, plan) {
    if (guard && !guard()) throw fail("locked", "Writing mode is locked. Click W and log in again.");
    if (D.source() === "local") return global.NotesLocal.commit(message, plan);
    const repo = getWriteRepo();
    const head = await getHead(repo);
    return writeCommit(repo, head, plan(head.entries), message);
  }

  /* Writes a ready change list on top of `head` as ONE commit: one tree, one commit, one ref update.
     A branch that moved meanwhile (422/409 on the ref update) becomes the coded error "conflict". Never forces. */
  async function writeCommit(repo, head, changes, message) {
    const tree = await ghRepo(repo, NOTES, "POST", "/git/trees", { base_tree: head.treeSha, tree: changes }, "prepare the change");
    const made = await ghRepo(repo, NOTES, "POST", "/git/commits", { message, tree: tree.sha, parents: [head.commitSha] }, "create the commit");
    try {
      await ghRepo(repo, NOTES, "PATCH", refUpdatePath(head.branch), { sha: made.sha }, "update the branch");
    } catch (e) {
      if (e.status === 422 || e.status === 409) throw fail("conflict", "The notes repository changed while saving. Nothing was lost. Please try again.");
      throw e;
    }
    return { treeSha: tree.sha, commitSha: made.sha, repo: label(repo) };
  }

  /* ---------- the one-time notes-repository setup ---------- */

  /* "owner/name" or a github.com address -> {owner, repo}, or null. */
  function parseRepoInput(text) {
    const t = String(text || "").trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\.git$/i, "").replace(/\/+$/, "");
    const m = t.match(/^([A-Za-z0-9][A-Za-z0-9-]*)\/([\w.-]+)$/);
    return m && !/^\.+$/.test(m[2]) ? { owner: m[1], repo: m[2] } : null;
  }

  function cleanRootInput(raw) {
    const r = String(raw || "").trim().replace(/^\/+|\/+$/g, "");
    if (!r) return "notes";
    if (r.split("/").some((s) => !s || s === "." || s === ".." || /[\\:*?"<>|\u0000-\u001f]/.test(s))) {
      throw fail("invalid", "That folder name is not valid. Use a plain folder name such as notes.");
    }
    return r;
  }

  /* Checks everything about a candidate notes repo and returns the settings to use:
     exists, public, not this site's own repo, branch exists, not empty, token can write.
     Writes nothing except the harmless unreferenced blob of Auth.checkWriteAccess. */
  async function verifyNotesRepo(input) {
    const token = global.Auth.getToken();
    if (!token) throw fail("locked", "Writing mode is locked. Click W and log in again.");

    const parsed = parseRepoInput(input && input.repo);
    if (!parsed) throw fail("invalid", "Enter the repository as owner/name, for example your-name/my-notes.");
    const root = cleanRootInput(input.root);
    const wantBranch = String((input && input.branch) || "").trim();
    if (wantBranch && /[\s~^:?*[\\]|\.\.|\/\/|^\/|\/$/.test(wantBranch)) throw fail("invalid", "That branch name is not valid.");

    const sameAsSite = () => fail("same-repo", "That is this site's own repository. Notes must live in a separate repository, otherwise every note edit would rebuild this site. Create a new public repository for your notes and enter that one.");
    const app = D.appRepo();
    if (app && sameRepo(app, parsed)) throw sameAsSite();

    let info;
    try {
      info = await ghRepo(parsed, NOTES, "GET", "", null, "read the repository");
    } catch (e) {
      if (e.code === "not-found") {
        throw fail("not-found", `The repository ${label(parsed)} was not found. Check the spelling. If it exists, edit your GitHub token and add it under Repository access, then log in again.`);
      }
      throw e;
    }
    const [owner, repoName] = String(info.full_name || label(parsed)).split("/");
    const canonical = { owner, repo: repoName };
    if (app && sameRepo(app, canonical)) throw sameAsSite();
    if (info.private) throw fail("private", `${label(canonical)} is private. Visitors could not read your notes. Make the repository public (Settings → General → Danger Zone → Change visibility), then try again.`);
    if (info.archived) throw fail("archived", `${label(canonical)} is archived, so it is read-only. Unarchive it in its Settings, or choose another repository.`);

    const branch = wantBranch || info.default_branch;
    try {
      await ghRepo(canonical, NOTES, "GET", refPath(branch), null, "read the branch");
    } catch (e) {
      if (e.code === "not-found") {
        throw fail("branch-missing", wantBranch
          ? `The branch “${wantBranch}” does not exist in ${label(canonical)}. Check the spelling, or leave Branch empty to use the default branch (${info.default_branch}).`
          : `The default branch (${branch}) was not found in ${label(canonical)}. Enter the branch name you want to use.`);
      }
      throw e; // includes "empty-repo" with its own instruction
    }

    const w = await global.Auth.checkWriteAccess(token, canonical);
    if (w.ok !== true) throw fail(w.ok === false ? "no-write" : "check-failed", w.reason || "Could not check that the token can write to this repository.");

    const warnings = [];
    if (info.has_pages) warnings.push(`GitHub Pages is turned on for ${label(canonical)}. Every note edit would rebuild it. Turn Pages off in that repository's Settings → Pages.`);
    return { repo: { owner: canonical.owner, repo: canonical.repo, branch: wantBranch, root }, defaultBranch: info.default_branch, warnings };
  }

  const utf8b64 = (text) => {
    const bytes = new TextEncoder().encode(text);
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };

  /* Saves the notes-repo choice into config.js of the APP repo: ONE commit (Contents API).
     Throws a coded error when it cannot (the app then shows the paste fallback):
       no-app-repo, no-write (token cannot write to the app repo), conflict, network, rate-limit, ... */
  async function saveConfig(notes) {
    const token = global.Auth.getToken();
    if (!token) throw fail("locked", "Writing mode is locked. Click W and log in again.");
    const app = D.appRepo();
    if (!app) throw fail("no-app-repo", "This page is not on a github.io address, so the app cannot tell which repository holds the site.");
    if (sameRepo(app, notes)) throw fail("same-repo", "The notes repository cannot be this site's own repository.");

    const w = await global.Auth.checkWriteAccess(token, app);
    if (w.ok !== true) {
      throw fail("no-write", w.ok === false
        ? `${w.reason} (This is the site repository ${label(app)}. The token only needs access to it for this one-time save.)`
        : (w.reason || "Could not check the token against the site repository."));
    }

    const branch = (await ghRepo(app, APP, "GET", "", null, "read the repository")).default_branch;
    const content = utf8b64(D.configText(notes));
    const message = `Set notes repository: ${label(notes)}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      let sha;
      try {
        sha = (await ghRepo(app, APP, "GET", `/contents/config.js?ref=${encodeURIComponent(branch)}`, null, "read config.js")).sha;
      } catch (e) {
        if (e.code !== "not-found") throw e; // no config.js yet: it will be created
      }
      try {
        const res = await ghRepo(app, APP, "PUT", "/contents/config.js", { message, content, branch, ...(sha ? { sha } : {}) }, "save config.js");
        return { commitSha: res && res.commit ? res.commit.sha : null, repo: label(app) };
      } catch (e) {
        if ((e.status === 409 || e.status === 422) && attempt < 2) continue; // changed meanwhile: re-read and retry
        if (e.status === 409 || e.status === 422) throw fail("conflict", "The site's repository changed while saving the setting. Nothing was lost. Try again in a moment.");
        throw e;
      }
    }
    throw fail("conflict", "The site's repository kept changing while saving. Try again in a moment.");
  }

  /* ---------- names ---------- */
  const cleanName = (raw) => String(raw).replace(/\s+/g, " ").trim();

  /* Returns an error message, or "" when the name is fine. `takenLower` = names already in use.
     `what` names the kind of thing for the "already exists" message ("subject" by default). */
  function validateName(raw, takenLower, what) {
    const n = cleanName(raw);
    if (!n) return "Enter a name.";
    if (n.length > 80) return "Keep the name under 80 characters.";
    if (/[\\/:*?"<>|\u0000-\u001f]/.test(n)) return 'Names cannot contain / \\ : * ? " < > |';
    if (n.startsWith(".")) return "A name cannot start with a dot.";
    if (/[. ]$/.test(n)) return "A name cannot end with a dot.";
    if ((takenLower || []).includes(n.toLowerCase())) return `A ${what || "subject"} with this name already exists.`;
    return "";
  }

  const subjectsIn = (entries) => {
    const prefix = `${D.root}/`;
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

  /* ---------- plan builders ----------
     Every operation is a plan builder: plan(entries, args, out) gets the CURRENT file list and returns the tree
     changes; `out` collects results the UI needs (new chapter number, renumber map, ...).
     The same builders run in three places: immediately (local mode), against the virtual tree (staging, GitHub mode)
     and again when a pending list is replayed on a newer repository state. Each re-validates against the entries it is given. */
  const CHAPTER_RE = /^Chapter\s+(\d+)\s*-\s*(.+)$/i; // same pattern data.js parses folders with
  const TOPIC_FILE_RE = /^(\d+)\.(\d+)(\s+.+\.md)$/i; // "N.M Title.md" (M and the title text are kept as written)
  const MAX_CHAPTER_NUMBER = 999999;
  const padNum = (n) => String(n).padStart(2, "0"); // 00 ... 99, then 100 (three digits)
  const chapterFolder = (num, name) => `Chapter ${padNum(num)} - ${name}`;
  const gitkeep = (path) => ({ path, mode: "100644", type: "blob", content: "" });
  /* A moved file keeps its blob (sha), or its staged text (content) when it is not in the repository yet. */
  const moved = (e, path) => (e.content !== undefined
    ? { path, mode: e.mode, type: "blob", content: e.content }
    : { path, mode: e.mode, type: "blob", sha: e.sha });

  /* Reads the chapters of one subject from the file list. `exists` = the subject has any file. */
  function chaptersIn(entries, subject) {
    const prefix = `${D.root}/${subject}/`;
    const byFolder = new Map();
    let exists = false;
    for (const e of entries) {
      if (e.type !== "blob" || !e.path.startsWith(prefix)) continue;
      exists = true;
      const rel = e.path.slice(prefix.length).split("/");
      if (rel.length < 2) continue;
      const m = rel[0].match(CHAPTER_RE);
      if (m && !byFolder.has(rel[0])) byFolder.set(rel[0], { folder: rel[0], num: parseInt(m[1], 10), name: m[2].trim() });
    }
    return { exists, chapters: [...byFolder.values()] };
  }

  function findChapter(entries, subject, folder) {
    const info = chaptersIn(entries, subject);
    if (!info.exists) throw fail("missing", "That subject no longer exists in the repo. Reload the page.");
    const chapter = info.chapters.find((c) => c.folder === folder);
    if (!chapter) throw fail("missing", "That chapter no longer exists in the repo (it may have been changed in another window). Reload the page.");
    return { chapter, chapters: info.chapters };
  }

  /* Groups of chapter folders that share one number, e.g. [["Chapter 1 - A", "Chapter 01 - B"]]. */
  function duplicateGroups(chapters) {
    const byNum = new Map();
    for (const c of chapters) byNum.set(c.num, [...(byNum.get(c.num) || []), c.folder]);
    return [...byNum.values()].filter((g) => g.length > 1);
  }

  function duplicateMessage(groups) {
    const names = groups.map((g) => g.map((f) => `"${f}"`).join(" and ")).join("; ");
    return `Two chapter folders share the same number (${names}). Rename one of those folders so each chapter has its own number (in your notes repository or your notes folder), then try again. Moving, deleting and renumbering chapters is turned off for this subject until then.`;
  }

  function assertNoDuplicates(chapters) {
    const groups = duplicateGroups(chapters);
    if (groups.length) throw fail("duplicate", duplicateMessage(groups));
  }

  /* A subject with no files would vanish (git and the offline folder both drop empty folders),
     so when a change would empty it, the same commit also writes notes/<Subject>/.gitkeep. */
  function keepSubjectAlive(entries, subject, changes) {
    const prefix = `${D.root}/${subject}/`;
    const gone = new Set(changes.filter((c) => c.sha === null).map((c) => c.path));
    const stays = entries.some((e) => e.type === "blob" && e.path.startsWith(prefix) && !gone.has(e.path));
    const arrives = changes.some((c) => c.sha !== null && c.path.startsWith(prefix));
    return stays || arrives ? changes : [...changes, gitkeep(`${prefix}.gitkeep`)];
  }

  /* Gives one chapter a new number: its folder becomes "Chapter <NN> - Name" and every "N.M Title.md" directly
     inside becomes "<new>.M Title.md". Other files (.gitkeep, images, subfolders) move unchanged.
     Returns the removals and the additions separately so callers can put all removals first. */
  function renumberChapter(entries, subject, chapter, newNum) {
    const from = `${D.root}/${subject}/${chapter.folder}/`;
    const newFolder = chapterFolder(newNum, chapter.name);
    const to = `${D.root}/${subject}/${newFolder}/`;
    const targets = new Set();
    const removals = [];
    const adds = [];
    for (const e of blobsUnder(entries, from.slice(0, -1))) {
      let rel = e.path.slice(from.length);
      const t = rel.includes("/") ? null : rel.match(TOPIC_FILE_RE);
      if (t) rel = `${newNum}.${t[2]}${t[3]}`;
      if (targets.has(rel.toLowerCase())) throw fail("invalid", `Two topics would end up with the same file name (${rel}). Nothing was changed.`);
      targets.add(rel.toLowerCase());
      removals.push(removal(e));
      adds.push(moved(e, to + rel));
    }
    return { removals, adds, folder: newFolder };
  }

  const OPS = {
    addSubject: {
      label: (a) => `Add subject: ${cleanName(a.name)}`,
      plan(entries, a) {
        const name = cleanName(a.name);
        const err = validateName(name, subjectsIn(entries).map((s) => s.toLowerCase()));
        if (err) throw fail("invalid", err);
        // git cannot store empty folders, so a .gitkeep file holds the subject open
        return [gitkeep(`${D.root}/${name}/.gitkeep`)];
      },
    },

    renameSubject: {
      label: (a) => `Rename subject: ${a.oldName} → ${cleanName(a.name)}`,
      plan(entries, a) {
        const name = cleanName(a.name);
        const files = blobsUnder(entries, `${D.root}/${a.oldName}`);
        if (!files.length) throw fail("missing", "That subject no longer exists in the repo. Reload the page.");
        const others = subjectsIn(entries).filter((s) => s !== a.oldName).map((s) => s.toLowerCase());
        const err = validateName(name, others);
        if (err) throw fail("invalid", err);
        const from = `${D.root}/${a.oldName}/`;
        const to = `${D.root}/${name}/`;
        return files.flatMap((e) => [removal(e), moved(e, to + e.path.slice(from.length))]);
      },
    },

    deleteSubject: {
      label: (a) => `Delete subject: ${a.name}`,
      plan(entries, a) {
        const files = blobsUnder(entries, `${D.root}/${a.name}`);
        if (!files.length) throw fail("missing", "That subject no longer exists in the repo. Reload the page.");
        return files.map(removal);
      },
    },

    /* Number 00 if the subject has no chapters, else highest + 1. */
    addChapter: {
      label: (a) => `Add chapter: ${cleanName(a.name)} (${a.subject})`,
      plan(entries, a, out) {
        const name = cleanName(a.name);
        const err = validateName(name, null, "chapter");
        if (err) throw fail("invalid", err);
        const { exists, chapters } = chaptersIn(entries, a.subject);
        if (!exists) throw fail("missing", "That subject no longer exists in the repo. Reload the page.");
        const num = chapters.length ? Math.max(...chapters.map((c) => c.num)) + 1 : 0;
        out.num = num;
        out.folder = chapterFolder(num, name);
        // git cannot store empty folders, so a .gitkeep file holds the chapter open
        return [gitkeep(`${D.root}/${a.subject}/${out.folder}/.gitkeep`)];
      },
    },

    /* Changes only the name part. The number and the topic files stay as they are. */
    renameChapter: {
      label: (a) => `Rename chapter: ${a.folder} → ${cleanName(a.name)}`,
      plan(entries, a, out) {
        const name = cleanName(a.name);
        const err = validateName(name, null, "chapter");
        if (err) throw fail("invalid", err);
        const { chapter, chapters } = findChapter(entries, a.subject, a.folder);
        const newFolder = chapterFolder(chapter.num, name);
        if (newFolder === a.folder) throw fail("invalid", "That is already the name of this chapter.");
        if (chapters.some((c) => c.folder !== a.folder && c.folder.toLowerCase() === newFolder.toLowerCase())) {
          throw fail("invalid", "Another chapter folder already has that name and number.");
        }
        const from = `${D.root}/${a.subject}/${a.folder}/`;
        const to = `${D.root}/${a.subject}/${newFolder}/`;
        out.num = chapter.num;
        out.folder = newFolder;
        const changes = blobsUnder(entries, from.slice(0, -1)).flatMap((e) => [removal(e), moved(e, to + e.path.slice(from.length))]);
        return keepSubjectAlive(entries, a.subject, changes);
      },
    },

    /* Manual number. One commit-worth of changes: folder renamed, topic files renamed. */
    changeChapterNumber: {
      label: (a) => `Change chapter number: ${a.folder} → ${Number.isInteger(a.newNum) ? padNum(a.newNum) : String(a.newNum)}`,
      plan(entries, a, out) {
        const newNum = a.newNum;
        if (!Number.isInteger(newNum) || newNum < 0 || newNum > MAX_CHAPTER_NUMBER) {
          throw fail("invalid", `Enter a whole number from 0 to ${MAX_CHAPTER_NUMBER}.`);
        }
        const { chapter, chapters } = findChapter(entries, a.subject, a.folder);
        assertNoDuplicates(chapters);
        if (newNum === chapter.num) throw fail("invalid", "That chapter already has this number.");
        if (chapters.some((c) => c.folder !== a.folder && c.num === newNum)) {
          throw fail("invalid", `Chapter ${padNum(newNum)} already exists. Pick a number that is not used yet.`);
        }
        const r = renumberChapter(entries, a.subject, chapter, newNum);
        out.oldNum = chapter.num;
        out.num = newNum;
        out.folder = r.folder;
        out.map = { [chapter.num]: newNum };
        return keepSubjectAlive(entries, a.subject, [...r.removals, ...r.adds]);
      },
    },

    /* Deleting a chapter also shifts every chapter with a HIGHER number down by one (folders and topic files),
       so numbers stay continuous. Lower numbers, and gaps below the deleted chapter, are left alone. */
    deleteChapter: {
      label: (a) => `Delete chapter: ${a.folder} (${a.subject})`,
      plan(entries, a, out) {
        const { chapter, chapters } = findChapter(entries, a.subject, a.folder);
        assertNoDuplicates(chapters);
        const removals = blobsUnder(entries, `${D.root}/${a.subject}/${a.folder}`).map(removal);
        const higher = chapters.filter((c) => c.num > chapter.num).sort((x, y) => x.num - y.num);
        const gone = [];
        const adds = [];
        const map = {};
        for (const c of higher) {
          const r = renumberChapter(entries, a.subject, c, c.num - 1);
          gone.push(...r.removals);
          adds.push(...r.adds);
          map[c.num] = c.num - 1;
        }
        out.removed = chapter.num;
        out.map = map;
        return keepSubjectAlive(entries, a.subject, [...removals, ...gone, ...adds]);
      },
    },

    /* Swaps the numbers of two neighbouring chapters (names stay). "Up" = the previous chapter in the list sorted by
       number (not always number - 1 when gaps exist). All blobs of both old folders are removed first, then added at
       the new paths, so two chapters with the same name (swapped paths equal each other's old paths) still work. */
    moveChapter: {
      label: (a) => `Move chapter ${a.dir === "up" ? "up" : "down"}: ${a.folder} (${a.subject})`,
      plan(entries, a, out) {
        if (a.dir !== "up" && a.dir !== "down") throw fail("invalid", "Unknown direction.");
        const { chapter, chapters } = findChapter(entries, a.subject, a.folder);
        assertNoDuplicates(chapters);
        const sorted = [...chapters].sort((x, y) => x.num - y.num);
        const i = sorted.findIndex((c) => c.folder === chapter.folder);
        const other = sorted[a.dir === "up" ? i - 1 : i + 1];
        if (!other) throw fail("invalid", a.dir === "up" ? "This is already the first chapter." : "This is already the last chapter.");
        const mine = renumberChapter(entries, a.subject, chapter, other.num);
        const theirs = renumberChapter(entries, a.subject, other, chapter.num);
        out.map = { [chapter.num]: other.num, [other.num]: chapter.num };
        out.num = other.num;
        out.folder = mine.folder;
        return [...mine.removals, ...theirs.removals, ...mine.adds, ...theirs.adds];
      },
    },
  };

  /* ---------- running an operation ----------
     run() is the ONE entry point for the UI.
       local mode  -> applied to the folder immediately (one change, no staging)
       GitHub mode -> staged by NotesStage; one Save commits everything. */
  async function immediate(type, args) {
    const op = OPS[type];
    const out = {};
    const res = await commit(op.label(args), (entries) => op.plan(entries, args, out));
    return { ...res, ...out };
  }

  async function run(type, args) {
    if (!OPS[type]) throw fail("invalid", "Unknown change.");
    if (guard && !guard()) throw fail("locked", "Writing mode is locked. Click W and log in again.");
    if (D.source() === "local") return immediate(type, args);
    if (!global.NotesStage) throw fail("no-stage", "The change list is not available. Reload the page.");
    return global.NotesStage.stage(type, args, OPS[type].label(args));
  }

  /* The older one-call functions keep working exactly as before (they commit immediately). */
  const addSubject = (rawName) => immediate("addSubject", { name: rawName });
  const renameSubject = (oldName, rawNew) => immediate("renameSubject", { oldName, name: rawNew });
  const deleteSubject = (name) => immediate("deleteSubject", { name });
  const addChapter = (subject, rawName) => immediate("addChapter", { subject, name: rawName });
  const renameChapter = (subject, folder, rawName) => immediate("renameChapter", { subject, folder, name: rawName });
  const changeChapterNumber = (subject, folder, newNum) => immediate("changeChapterNumber", { subject, folder, newNum });
  const deleteChapter = (subject, folder) => immediate("deleteChapter", { subject, folder });
  const moveChapter = (subject, folder, dir) => immediate("moveChapter", { subject, folder, dir });

  global.NotesWrite = {
    cleanName, validateName, addSubject, renameSubject, deleteSubject,
    addChapter, renameChapter, changeChapterNumber, deleteChapter, moveChapter,
    run, duplicateGroups, duplicateMessage,
    getWriteRepo, verifyNotesRepo, saveConfig, parseRepoInput,
    setGuard(fn) { guard = fn; },
    /* used by stage.js only */
    _internal: { OPS, getHead, writeCommit, getWriteRepo, fail, guardOk: () => !guard || guard() },
  };
})(window);
