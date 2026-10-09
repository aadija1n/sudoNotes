/* Phase 9G: global shortcuts (Mod+S save, Mod+E edit/done, Mod+/ and ? cheat sheet), tooltips, and the
   searchable cheat sheet (window.NotesShortcuts). Mod = Cmd on Mac, Ctrl elsewhere.
   Later phases add rows with NotesShortcuts.register(group, [{ label, keys, hint }]). */

(function (global) {
  const isMac = /Mac|iPhone|iPad/i.test((navigator && navigator.platform) || "") || /Mac OS X/.test((navigator && navigator.userAgent) || "");
  const MOD = isMac ? "Cmd" : "Ctrl";
  const disp = (s) => String(s).replace(/\bMod\b/g, MOD);

  const visible = (el) => !!el && el.getClientRects().length > 0;
  const byId = (id) => document.getElementById(id);
  const isWrite = () => document.body.classList.contains("write");
  const otherModal = () => visible(byId("modal")) || visible(byId("ins-modal"));
  const anyModal = () => otherModal() || visible(byId("ks-modal"));
  const say = (m) => { try { if (typeof toast === "function") toast(m); } catch { /* no toast */ } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(cond, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (cond()) return true; await sleep(50); }
    return !!cond();
  }
  const editorOpen = () => !!(global.NotesEditor && global.NotesEditor.isOpen());

  /* ---------- cheat sheet data ---------- */
  const STATIC = [
    { title: "Global", rows: [
      { label: "Save", keys: "Mod+S", hint: "Save all staged changes" },
      { label: "Edit note / Done", keys: "Mod+E", hint: "Open the editor, or finish editing" },
      { label: "Show shortcuts", keys: "Mod+/ or ?" },
      { label: "Back out / cancel", keys: "Esc" },
    ] },
    { title: "Formatting", from: "format", rows: [] },
    { title: "Blocks", rows: [
      { label: "Finish block and go to the next", keys: "Mod+Enter" },
      { label: "Move block up", keys: "Alt+Up" },
      { label: "Move block down", keys: "Alt+Down" },
      { label: "Cancel block edit", keys: "Esc" },
      { label: "Go to previous / next block", keys: "Up or Down", hint: "Caret at the very start / end of the block" },
      { label: "Open the slash menu", keys: "/", hint: "In an empty block" },
    ] },
    { title: "Smart typing", rows: [
      { label: "Continue a list or quote", keys: "Enter" },
      { label: "Start a new block", keys: "Enter then Enter", hint: "On an empty line at the end of a block" },
      { label: "Indent / outdent list items and code", keys: "Tab or Shift+Tab" },
      { label: "Close a code block", keys: "``` then Enter" },
      { label: "Brackets and quotes pair automatically", keys: "( [ { \" `" },
      { label: "Paste a link over selected text to make a link", keys: "Mod+V" },
    ] },
  ];
  const extra = []; // [{ title, rows }]

  function register(group, rows) {
    if (!group || !Array.isArray(rows)) return false;
    let g = extra.find((x) => x.title === group);
    if (!g) { g = { title: group, rows: [] }; extra.push(g); }
    rows.forEach((r) => { if (r && r.label && r.keys) g.rows.push({ label: r.label, keys: r.keys, hint: r.hint || "" }); });
    return true;
  }

  function collect() { // read at open time
    const groups = STATIC.map((g) => ({
      title: g.title,
      rows: g.from === "format"
        ? ((global.NotesFormat && global.NotesFormat.SHORTCUTS) || []).map((s) => ({ label: s.label, keys: s.keys, hint: s.hint || "" }))
        : g.rows.slice(),
    }));
    extra.forEach((x) => {
      const g = groups.find((y) => y.title === x.title);
      if (g) g.rows.push(...x.rows); else groups.push({ title: x.title, rows: x.rows.slice() });
    });
    return groups.filter((g) => g.rows.length);
  }

  function keysEl(keys) {
    const f = document.createElement("span");
    f.className = "ks-keys";
    const sep = (t) => { const s = document.createElement("span"); s.className = "ks-sep"; s.textContent = t; f.appendChild(s); };
    disp(keys).split(" or ").forEach((alt, ai) => {
      if (ai) sep("or");
      alt.split(" then ").forEach((seq, si) => {
        if (si) sep("then");
        seq.split("+").forEach((part) => {
          if (!part) return;
          const k = document.createElement("kbd");
          k.className = "ks-key";
          k.textContent = part;
          f.appendChild(k);
        });
      });
    });
    return f;
  }

  /* ---------- cheat sheet modal ---------- */
  let sheet = null; // { wrap, prev }

  function closeSheet() {
    if (!sheet) return;
    const { wrap, prev } = sheet;
    sheet = null;
    wrap.remove();
    if (prev && prev.isConnected && prev.focus) prev.focus();
  }

  function openSheet() {
    if (sheet || otherModal()) return;
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.id = "ks-modal";
    wrap.innerHTML = `
      <div class="modal ks-modal" role="dialog" aria-modal="true" aria-labelledby="ks-title">
        <div class="ks-head"><h2 id="ks-title">Keyboard shortcuts</h2><button type="button" class="btn" data-ks-close>Close</button></div>
        <input type="search" class="ks-search" placeholder="Search shortcuts…" aria-label="Search shortcuts" autocomplete="off" spellcheck="false" />
        <div class="ks-body"></div>
      </div>`;
    const body = wrap.querySelector(".ks-body");
    const input = wrap.querySelector(".ks-search");
    const groups = [];
    collect().forEach((g) => {
      const sec = document.createElement("section");
      sec.className = "ks-group";
      const h = document.createElement("h3");
      h.textContent = g.title;
      sec.appendChild(h);
      const rows = g.rows.map((r) => {
        const row = document.createElement("div");
        row.className = "ks-row";
        const lab = document.createElement("div");
        lab.className = "ks-label";
        lab.textContent = r.label;
        if (r.hint) { const s = document.createElement("span"); s.className = "ks-hint"; s.textContent = r.hint; lab.appendChild(s); }
        row.append(lab, keysEl(r.keys));
        row.dataset.s = `${r.label} ${disp(r.keys)} ${r.hint || ""}`.toLowerCase();
        sec.appendChild(row);
        return row;
      });
      body.appendChild(sec);
      groups.push({ sec, rows });
    });
    const none = document.createElement("div");
    none.className = "ks-empty";
    none.textContent = "No shortcut matches";
    none.hidden = true;
    body.appendChild(none);

    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      let any = false;
      groups.forEach((g) => {
        let n = 0;
        g.rows.forEach((r) => { const on = !q || r.dataset.s.includes(q); r.hidden = !on; if (on) n++; });
        g.sec.hidden = n === 0;
        if (n) any = true;
      });
      none.hidden = any;
    });
    wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) closeSheet(); });
    wrap.addEventListener("click", (e) => { if (e.target.closest("[data-ks-close]")) closeSheet(); });

    sheet = { wrap, prev: document.activeElement };
    document.body.appendChild(wrap);
    input.focus();
  }

  const toggleSheet = () => { if (sheet) closeSheet(); else openSheet(); };

  /* ---------- Save / Edit-Done ---------- */
  let saving = false;

  async function pressDone() { // true when the editor is closed afterwards
    const d = document.querySelector('[data-ed="done"]');
    if (!d || d.disabled) return false;
    d.click();
    return waitFor(() => !editorOpen(), 3000);
  }

  async function save() {
    if (saving) return;
    saving = true;
    try {
      let staged = false;
      if (editorOpen()) {
        staged = !!(global.NotesEditor.isDirty && global.NotesEditor.isDirty());
        if (!(await pressDone())) return; // still open: the edit failed or is busy, stop here
      }
      const pending = () => { const d = document.querySelector(".dock.has-pending"); const b = byId("sb-save"); return d && b && !b.disabled ? b : null; };
      if (staged) await waitFor(pending, 1000);
      const b = pending();
      if (b) { b.click(); return; }
      if (!staged) say("Nothing to save");
    } finally { saving = false; }
  }

  function editOrDone() {
    if (editorOpen()) { pressDone(); return true; }
    const b = byId("edit-note");
    if (visible(b) && !b.disabled) { b.click(); return true; }
    return false;
  }

  /* ---------- keys ---------- */
  const editable = (t) => !!(t && (t.isContentEditable || (t.closest && t.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']"))));

  document.addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    const sheetOpen = !!sheet;

    if (sheetOpen) { // own Escape and focus trap
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeSheet(); return; }
      if (e.key === "Tab") {
        const f = [...sheet.wrap.querySelectorAll("button, input")].filter((x) => !x.disabled);
        if (f.length) {
          const i = f.indexOf(document.activeElement);
          const to = e.shiftKey ? f[(i - 1 + f.length) % f.length] : f[(i + 1) % f.length];
          e.preventDefault();
          to.focus();
        }
        return;
      }
    }

    const mod = isMac ? e.metaKey : e.ctrlKey;
    const k = (e.key || "").toLowerCase();

    if (mod && !e.altKey && (e.key === "/" || e.code === "Slash")) { // cheat sheet, also from inside a textarea
      if (otherModal()) return;
      e.preventDefault();
      toggleSheet();
      return;
    }
    if (e.key === "?" && !mod && !e.altKey) {
      if (sheetOpen) { if (!editable(e.target)) { e.preventDefault(); closeSheet(); } return; }
      if (editable(e.target) || anyModal()) return;
      e.preventDefault();
      openSheet();
      return;
    }

    if (!mod || e.altKey || e.shiftKey || anyModal() || !isWrite()) return;
    if (k === "s") { e.preventDefault(); save(); }
    else if (k === "e") { if (editOrDone()) e.preventDefault(); }
  }, true);

  /* ---------- tooltips (no change to app.js) ---------- */
  const TIPS = [["#sb-save", "Save (Mod+S)"], ["#edit-note", "Edit (Mod+E)"], ['[data-ed="done"]', "Done (Mod+E)"]];
  function tip(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    for (const [sel, text] of TIPS) {
      const el = t.closest(sel);
      if (el && !el.getAttribute("title")) { el.setAttribute("title", disp(text)); return; }
    }
    const el = t.closest("[data-shortcut-title]");
    if (el && !el.getAttribute("title")) el.setAttribute("title", disp(el.getAttribute("data-shortcut-title")));
  }
  document.addEventListener("pointerover", tip);
  document.addEventListener("focusin", tip);

  global.NotesShortcuts = { register, open: openSheet, close: closeSheet, toggle: toggleSheet };
})(window);
