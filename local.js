/* Offline / local mode.
   When the app is opened from your computer (a file or localhost, not GitHub Pages) it reads and
   writes the `notes` folder of your cloned repo directly, using the browser's folder access
   (File System Access API: Chrome, Edge, Brave, Opera). No server, no token, no internet needed.
   You push the changed notes to GitHub yourself with git when you are back online.

   Changes arrive in the same format the GitHub writer uses (a list of tree changes), so every
   feature works the same in both modes. */

(function (global) {
  const root = global.NotesData.root;
  const JUNK = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

  let rootHandle = null; // the folder the user picked (the repo root)
  let notesHandle = null; // its `notes` folder
  let pending = null; // a remembered folder that still needs permission
  let candidate = null; // a picked folder that has no `notes` folder yet
  let store = null;

  function fail(code, message) {
    const e = new Error(message);
    e.code = code;
    return e;
  }

  const supported = () => typeof global.showDirectoryPicker === "function";

  /* ---------- remembers the chosen folder between visits (IndexedDB) ---------- */
  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("notes-app", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("handles");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  const defaultStore = {
    async get(key) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const r = db.transaction("handles").objectStore("handles").get(key);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => reject(r.error);
      });
    },
    async set(key, value) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("handles", "readwrite");
        tx.objectStore("handles").put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
  };
  const db = () => store || defaultStore;

  /* ---------- connecting ---------- */
  async function attach(handle) {
    let notes = null;
    try {
      notes = await handle.getDirectoryHandle(root);
    } catch { /* no notes folder inside */ }

    if (notes) {
      rootHandle = handle;
      notesHandle = notes;
    } else if (handle.name === root) {
      rootHandle = null; // the notes folder itself was picked (so auth.json is out of reach)
      notesHandle = handle;
    } else {
      candidate = handle;
      throw fail("no-notes", `There is no "${root}" folder inside "${handle.name}".`);
    }
    candidate = null;
    pending = null;
    try { await db().set("root", handle); } catch { /* cannot remember the folder (storage blocked): it still works for this visit */ }
  }

  /* Called before any read. Throws a coded error the UI turns into a friendly screen. */
  async function ensure() {
    if (notesHandle) return;
    if (!supported()) throw fail("unsupported", "Editing offline needs a browser that can open folders on your computer, such as Chrome, Edge or Brave.");
    let saved = null;
    try { saved = await db().get("root"); } catch { /* storage unavailable */ }
    if (!saved) throw fail("need-folder", "Choose the folder of your notes project.");
    let perm;
    try { perm = await saved.queryPermission({ mode: "readwrite" }); } catch { throw fail("need-folder", "Choose the folder of your notes project."); }
    if (perm !== "granted") {
      pending = saved;
      throw fail("need-permission", `Allow access to "${saved.name}" again to continue.`);
    }
    await attach(saved);
  }

  /* Both of these must be called straight from a click (browser rule). */
  async function pickFolder() {
    let handle;
    try {
      handle = await global.showDirectoryPicker({ id: "notes-app", mode: "readwrite" });
    } catch (e) {
      if (e && e.name === "AbortError") throw fail("aborted", "");
      throw e;
    }
    await attach(handle);
  }

  async function reconnect() {
    const saved = pending || (await db().get("root"));
    if (!saved) throw fail("need-folder", "Choose the folder of your notes project.");
    if ((await saved.requestPermission({ mode: "readwrite" })) !== "granted") throw fail("denied", "Access was not granted, so the notes cannot be opened.");
    await attach(saved);
  }

  async function createNotesFolder() {
    if (!candidate) throw fail("need-folder", "Choose the folder of your notes project.");
    const handle = candidate;
    await handle.getDirectoryHandle(root, { create: true });
    await attach(handle);
  }

  const folderName = () => (rootHandle || notesHandle || candidate || {}).name || "";
  const candidateName = () => (candidate ? candidate.name : "");

  /* ---------- reading ---------- */
  async function listPaths() {
    await ensure();
    const out = [];
    async function walk(dir, prefix) {
      for await (const [name, h] of dir.entries()) {
        if (h.kind === "directory") await walk(h, `${prefix}${name}/`);
        else out.push(`${prefix}${name}`);
      }
    }
    await walk(notesHandle, `${root}/`);
    return out;
  }

  const relSegments = (path) => {
    const parts = path.split("/");
    if (parts[0] !== root) throw fail("bad-path", "Unexpected path.");
    return parts.slice(1);
  };

  async function dirFor(segments, create) {
    let dir = notesHandle;
    for (const s of segments) dir = await dir.getDirectoryHandle(s, { create });
    return dir;
  }

  async function readFile(path) {
    await ensure();
    const segs = relSegments(path);
    const name = segs.pop();
    try {
      const dir = await dirFor(segs, false);
      return await (await dir.getFileHandle(name)).getFile();
    } catch (e) {
      if (e && e.name === "NotFoundError") throw fail("not-found", "This note was not found in your folder.");
      throw e;
    }
  }

  async function readText(path) {
    return (await readFile(path)).text();
  }

  /* A file in the project root (like auth.json), or null when it is not there. */
  async function readRootFile(name) {
    await ensure();
    if (!rootHandle) return null;
    try {
      return await (await (await rootHandle.getFileHandle(name)).getFile()).text();
    } catch (e) {
      if (e && e.name === "NotFoundError") return null;
      throw e;
    }
  }

  /* ---------- writing ---------- */
  async function writeFile(path, data) {
    const segs = relSegments(path);
    const name = segs.pop();
    const dir = await dirFor(segs, true);
    const handle = await dir.getFileHandle(name, { create: true });
    const w = await handle.createWritable();
    await w.write(data);
    await w.close();
  }

  async function removeFile(path) {
    const segs = relSegments(path);
    const name = segs.pop();
    try {
      const dir = await dirFor(segs, false);
      await dir.removeEntry(name);
    } catch (e) {
      if (!(e && e.name === "NotFoundError")) throw e;
    }
  }

  async function isEmptyDir(dir) {
    for await (const name of dir.keys()) if (!JUNK.has(name)) return false;
    return true;
  }

  /* Git cannot keep empty folders and neither should we: remove folders a change left empty. */
  async function pruneEmptyDirs(removedPaths) {
    const dirs = new Set();
    for (const p of removedPaths) {
      const segs = relSegments(p);
      segs.pop();
      while (segs.length) { dirs.add(segs.join("/")); segs.pop(); }
    }
    const deepestFirst = [...dirs].sort((a, b) => b.split("/").length - a.split("/").length);
    for (const d of deepestFirst) {
      const segs = d.split("/");
      const name = segs.pop();
      try {
        const parent = await dirFor(segs, false);
        const dir = await parent.getDirectoryHandle(name);
        if (await isEmptyDir(dir)) await parent.removeEntry(name, { recursive: true });
      } catch (e) {
        if (!(e && e.name === "NotFoundError")) throw e;
      }
    }
  }

  /* Applies a list of tree changes: {path, sha:null} deletes, {path, content} writes text,
     {path, sha:"local:<old path>"} copies an existing file (this is how moves and renames work). */
  async function applyChanges(changes) {
    const removals = [];
    const writes = [];
    for (const c of changes) {
      if (c.sha === null) removals.push(c.path);
      else if ("content" in c) writes.push({ path: c.path, data: c.content });
      else writes.push({ path: c.path, from: String(c.sha).replace(/^local:/, "") });
    }

    // Read everything we will move into memory first, so nothing is lost if a step fails later.
    for (const w of writes) if (w.from) w.data = await (await readFile(w.from)).arrayBuffer();

    // A rename that only changes capital letters points at the "same" file on Windows and macOS,
    // so those old files are removed before the new ones are written.
    const early = removals.filter((p) => writes.some((w) => w.path.toLowerCase() === p.toLowerCase()));
    const late = removals.filter((p) => !early.includes(p));

    for (const p of early) await removeFile(p);
    if (early.length) await pruneEmptyDirs(early);
    for (const w of writes) await writeFile(w.path, w.data);
    for (const p of late) await removeFile(p);
    if (late.length) await pruneEmptyDirs(late);
  }

  /* Same shape as the GitHub writer: `plan` sees the current file list and returns the changes. */
  async function commit(message, plan) {
    const paths = await listPaths();
    const entries = paths.map((p) => ({ path: p, type: "blob", mode: "100644", sha: `local:${p}` }));
    const changes = plan(entries);
    try {
      await applyChanges(changes);
    } catch (e) {
      if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) {
        throw fail("denied", "The browser no longer has permission to change your folder. Reload the page and allow access again.");
      }
      throw e;
    }
    return { local: true };
  }

  global.NotesLocal = {
    supported, ensure, pickFolder, reconnect, createNotesFolder, folderName, candidateName,
    listPaths, readText, readRootFile, commit,
    useStore(s) { store = s; }, // lets tests replace IndexedDB
  };
})(window);
