/* Phase 7: staged changes (GitHub mode only).
   Edits do not commit. Each one is stored as an operation DESCRIPTOR {type, args, label}; the screens show a
   VIRTUAL TREE = base tree + the pending operations applied in order (each plan sees the result of the one before).
   Save folds the final virtual tree against the repository into ONE change list and makes ONE commit.

   Generic on purpose: later phases (topics, note edits) only add an entry to NotesWrite's OPS registry.

   Virtual entries are {path, mode, type:"blob", sha} (an existing blob) or {path, mode, type:"blob", content}
   (new text that exists only in memory). A moved or renamed file keeps its sha (or its content), so its text can
   always be read: staged content from memory, existing files from their blob (the "base path" never matters).
   Local mode never uses this file: NotesWrite.run applies changes to the folder immediately.
   Tokens are never stored or logged. */

(function (global) {
  const W = global.NotesWrite;
  const D = global.NotesData;
  const I = W._internal; // { OPS, getHead, writeCommit, getWriteRepo, fail, guardOk }
  const fail = I.fail;
  const KEY = "notes:pending"; // sessionStorage: descriptors only (never the token)
  const MAX_RETRIES = 3;

  let base = null; // { repo, commitSha, treeSha, map } the repository state the virtual tree started from
  let virtual = null; // Map path -> entry
  let pending = []; // [{type, args, label, out}]
  let saving = false;
  let persistOk = true;
  let chain = Promise.resolve();
  const listeners = new Set();

  /* ---------- small helpers ---------- */
  const repoKey = (r) => `${r.owner}/${r.repo}/${r.branch || ""}/${r.root}`;
  const rootPrefix = () => `${D.root}/`;
  const emit = () => listeners.forEach((fn) => { try { fn(); } catch { /* a listener must never break staging */ } });
  const enqueue = (fn) => { const p = chain.then(fn); chain = p.catch(() => {}); return p; };

  function toMap(entries) {
    const m = new Map();
    for (const e of entries) {
      if (e.type === "blob" && e.path.startsWith(rootPrefix())) m.set(e.path, { path: e.path, mode: e.mode || "100644", type: "blob", sha: e.sha });
    }
    return m;
  }

  /* Applies a plan's change list: removals first, then additions (so a path that is vacated and refilled works). */
  function applyChanges(m, changes) {
    const next = new Map(m);
    for (const c of changes) if (c.sha === null) next.delete(c.path);
    for (const c of changes) {
      if (c.sha === null) continue;
      const mode = c.mode || "100644";
      next.set(c.path, "content" in c ? { path: c.path, mode, type: "blob", content: c.content } : { path: c.path, mode, type: "blob", sha: c.sha });
    }
    return next;
  }

  function runPlan(m, type, args) {
    const op = I.OPS[type];
    if (!op) throw fail("invalid", "Unknown change.");
    const out = {};
    const changes = op.plan([...m.values()], args, out);
    return { map: applyChanges(m, changes), out };
  }

  /* Final virtual tree vs the repository tree -> ONE change list. */
  function fold(baseMap, finalMap) {
    const changes = [];
    for (const [p, e] of baseMap) if (!finalMap.has(p)) changes.push({ path: p, mode: e.mode, type: "blob", sha: null });
    for (const [p, e] of finalMap) {
      const b = baseMap.get(p);
      if (e.content !== undefined) changes.push({ path: p, mode: e.mode, type: "blob", content: e.content });
      else if (!b || b.sha !== e.sha || b.mode !== e.mode) changes.push({ path: p, mode: e.mode, type: "blob", sha: e.sha });
    }
    return changes;
  }

  function dropBase() { base = null; virtual = null; }

  async function ensureBase() {
    if (base) return;
    const repo = I.getWriteRepo();
    const head = await I.getHead(repo); // fresh read: the base commit is remembered for conflict detection
    base = { repo, commitSha: head.commitSha, treeSha: head.treeSha, map: toMap(head.entries) };
    virtual = new Map(base.map);
  }

  /* ---------- optional persistence (descriptors only) ---------- */
  function persist() {
    try {
      if (pending.length && base) sessionStorage.setItem(KEY, JSON.stringify({ key: repoKey(base.repo), ops: pending.map(({ type, args, label }) => ({ type, args, label })) }));
      else sessionStorage.removeItem(KEY);
      persistOk = true;
    } catch { persistOk = false; }
  }
  function readSaved() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
      const repo = D.notesRepo();
      if (saved && Array.isArray(saved.ops) && saved.ops.length && repo && saved.key === repoKey(repo)) return saved;
    } catch { /* unreadable */ }
    return null;
  }
  const clearSaved = () => { try { sessionStorage.removeItem(KEY); } catch { /* unavailable */ } };

  /* ---------- the overlay NotesData reads from ---------- */
  D.setOverlay({
    active: () => pending.length > 0 && !!virtual,
    paths: () => [...virtual.keys()],
    resolve: (path) => {
      const e = virtual && virtual.get(path);
      if (!e) return null;
      return e.content !== undefined ? { content: e.content } : { sha: e.sha };
    },
  });

  /* ---------- staging ---------- */
  function stage(type, args, label) {
    return enqueue(async () => {
      if (!I.guardOk()) throw fail("locked", "Writing mode is locked. Click W and log in again.");
      if (saving) throw fail("busy", "A save is in progress. Wait until it finishes.");
      await ensureBase();
      let r;
      try {
        r = runPlan(virtual, type, args); // re-validates against the virtual tree; a failure stages nothing
      } catch (e) {
        if (!pending.length) dropBase();
        throw e;
      }
      virtual = r.map;
      pending.push({ type, args, label, out: r.out });
      persist();
      emit();
      return { staged: true, ...r.out };
    });
  }

  /* Recomputes the virtual tree from the base and the remaining descriptors. */
  function rebuild() {
    if (!pending.length) { dropBase(); return; }
    let m = new Map(base.map);
    for (const p of pending) {
      const r = runPlan(m, p.type, p.args);
      m = r.map;
      p.out = r.out;
    }
    virtual = m;
  }

  /* Removes the last descriptor. Returns it (with its results) or null. */
  function undoLast() {
    if (!pending.length || saving) return null;
    const entry = pending.pop();
    try { rebuild(); } catch { pending = []; dropBase(); } // cannot happen (the same plans worked before); fail safe
    persist();
    emit();
    return entry;
  }

  /* Drops everything. Returns the dropped descriptors (the app uses them to move the open route back). */
  function discard() {
    if (saving) return [];
    const all = pending.slice();
    pending = [];
    dropBase();
    clearSaved();
    emit();
    return all;
  }

  /* Forget the list in memory but keep the sessionStorage copy (used when writing mode locks itself). */
  function suspend() {
    pending = [];
    dropBase();
    emit();
  }

  /* ---------- Save ---------- */
  function commitMessage() {
    const n = pending.length;
    const head = `Update notes: ${n} change${n === 1 ? "" : "s"}`;
    const lines = [];
    let size = 0;
    for (let i = 0; i < pending.length; i++) {
      const line = `- ${pending[i].label}`.slice(0, 200);
      if (lines.length >= 50 || size + line.length > 5000) { lines.push(`- …and ${pending.length - i} more`); break; }
      lines.push(line);
      size += line.length + 1;
    }
    return `${head}\n\n${lines.join("\n")}`;
  }

  /* Re-applies the descriptors on a newer repository state. Operations that no longer apply are collected, not skipped silently. */
  function replay(startMap) {
    let m = startMap;
    const failures = [];
    for (const p of pending) {
      try { m = runPlan(m, p.type, p.args).map; }
      catch (e) { failures.push({ label: p.label, message: e.message || "It no longer applies." }); }
    }
    return { map: m, failures };
  }

  function finish() {
    pending = [];
    dropBase();
    clearSaved();
  }

  /* Resolves {treeSha, commitSha, merged} or {noChanges, merged}. Throws:
       "replay-failed" (with .failures: nothing was committed), "busy" (branch kept moving), or a GitHub/network error.
     In every failure the pending list is kept untouched. */
  async function save() {
    if (saving) throw fail("busy", "A save is already in progress.");
    if (!pending.length) return { noChanges: true };
    if (!I.guardOk()) throw fail("locked", "Writing mode is locked. Click W and log in again.");
    await chain.catch(() => {}); // let a staging call that is still running finish first
    saving = true;
    emit();
    try {
      const repo = I.getWriteRepo();
      let merged = false;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const head = await I.getHead(repo);
        const headMap = toMap(head.entries);
        let finalMap;
        if (head.commitSha === base.commitSha) {
          finalMap = virtual; // fast path: the repository is exactly what the changes were made on
        } else {
          merged = true; // someone else changed the repository: use it as the new base and replay
          const r = replay(headMap);
          if (r.failures.length) {
            const e = fail("replay-failed", "Some changes can no longer be applied to the newer version of the repository. Nothing was saved.");
            e.failures = r.failures;
            throw e;
          }
          finalMap = r.map;
        }
        const changes = fold(headMap, finalMap);
        if (!changes.length) { finish(); return { noChanges: true, merged }; }
        try {
          const made = await I.writeCommit(repo, head, changes, commitMessage());
          finish();
          return { ...made, merged };
        } catch (e) {
          if (e.code !== "conflict") throw e;
          if (attempt === MAX_RETRIES - 1) throw fail("busy", "The notes repository is busy and kept changing while saving. Your changes are still here. Try Save again in a moment.");
          // the branch moved between our read and the ref update: read it again and replay (never force)
        }
      }
      throw fail("busy", "The notes repository is busy. Try Save again in a moment.");
    } finally {
      saving = false;
      emit();
    }
  }

  /* ---------- restore after a refresh or an automatic lock ---------- */
  function restore() {
    return enqueue(async () => {
      const saved = readSaved();
      if (!saved || pending.length) return { restored: 0, failed: [] };
      await ensureBase();
      const failed = [];
      for (const op of saved.ops) {
        try {
          const r = runPlan(virtual, op.type, op.args);
          virtual = r.map;
          pending.push({ type: op.type, args: op.args, label: op.label, out: r.out });
        } catch (e) {
          failed.push({ label: op.label, message: e.message || "It no longer applies." });
        }
      }
      if (!pending.length) dropBase();
      persist();
      emit();
      return { restored: pending.length, failed };
    });
  }

  global.NotesStage = {
    stage, undoLast, discard, suspend, save, restore,
    count: () => pending.length,
    isSaving: () => saving,
    labels: () => pending.map((p) => p.label),
    entries: () => pending.slice(),
    hasSaved: () => !!readSaved(),
    savedCount: () => { const s = readSaved(); return s ? s.ops.length : 0; },
    clearSaved,
    canSuspend: () => persistOk,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
})(window);
