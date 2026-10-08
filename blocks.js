/* Phase 9B: block-level live editor for one note (write mode only).
   The note is split into top-level Markdown blocks (marked.lexer). Each block keeps its exact raw text; the join of
   all blocks must equal the original text byte for byte, otherwise block mode is refused. Editing a block changes only
   that block's body (its trailing blank-line gap is kept). Pure UI: the host (editor.js) owns staging and guards.
   NotesBlocks.mount(container, { text, dir, onChange(text) }) -> { getText, setText, commit, setLocked, destroy,
     insertAfterActive(text, { edit, caret }), activeIndex() } | null
   Phase 9C: the handle can insert a new block after the block last edited or focused (insertmenu.js drives it). */

(function (global) {
  /* Returns { lead, blocks: [{ body, gap }] } or null when the split is not byte-exact. */
  function splitLexer(text) {
    if (!global.marked || typeof global.marked.lexer !== "function") return null;
    let tokens;
    try { tokens = global.marked.lexer(text); } catch { return null; }
    let lead = "";
    const raws = [];
    for (const t of tokens) {
      const raw = typeof t.raw === "string" ? t.raw : "";
      if (!raw) continue; // helper tokens (e.g. a footnotes list) carry no source text
      if (t.type === "space") {
        if (raws.length) raws[raws.length - 1] += raw; else lead += raw;
      } else raws.push(raw);
    }
    if (lead + raws.join("") !== text) { console.warn("NotesBlocks: split is not byte-exact, using plain text"); return null; }
    const blocks = raws.map((raw) => {
      const body = raw.replace(/\s+$/, "");
      return { body, gap: raw.slice(body.length) };
    });
    if (blocks.some((b) => !b.body)) { console.warn("NotesBlocks: a block had no text, using plain text"); return null; }
    return { lead, blocks };
  }

  /* Fallback for notes the lexer cannot reproduce exactly: blocks are separated by blank lines
     (blank lines inside ``` / ~~~ fences do not separate). Byte-exact by construction. */
  function splitLines(text) {
    const lines = text.match(/[^\n]*\n|[^\n]+$/g) || [];
    let lead = "";
    const raws = [];
    let cur = null, inGap = false, fence = null;
    for (const line of lines) {
      if (fence) {
        cur += line;
        const m = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
        if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
        continue;
      }
      if (/^\s*$/.test(line)) {
        if (cur === null) lead += line; else { cur += line; inGap = true; }
        continue;
      }
      if (cur !== null && inGap) { raws.push(cur); cur = null; }
      if (cur === null) cur = "";
      inGap = false;
      cur += line;
      const f = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (f) fence = f[1];
    }
    if (cur !== null) raws.push(cur);
    if (lead + raws.join("") !== text) return null;
    return { lead, blocks: raws.map((raw) => { const body = raw.replace(/\s+$/, ""); return { body, gap: raw.slice(body.length) }; }) };
  }

  function split(text) {
    return splitLexer(text) || splitLines(text);
  }

  /* 9C: a block inserted from a template that was left as only its starting marker is dropped, not kept */
  const EMPTY_TEMPLATE = [
    /^#{1,6}$/, /^(?:[-*+](?: \[[ xX]\])?|\d+[.)]|>)$/,
    /^(`{3,}|~{3,})[^\n`]*\n(?:[ \t]*\n)*[ \t]*\1$/, /^<div>\s*<\/div>$/i,
  ];
  const isEmptyTemplate = (t) => EMPTY_TEMPLATE.some((re) => re.test(t));

  function mount(container, opts) {
    const parsed = split(opts.text || "");
    if (!parsed) return null;

    let lead = parsed.lead;
    let blocks = parsed.blocks; // { body, gap, wrap }
    let ed = null;              // { blk, wrap, ta, view, isNew }
    let locked = false;
    let ignoreClickUntil = 0;
    let active = null;          // 9C: the block most recently edited or focused (insert position)

    const root = document.createElement("div");
    root.className = "blocks";
    const addSlot = document.createElement("div");
    addSlot.className = "blk-add";
    addSlot.tabIndex = 0;
    addSlot.setAttribute("role", "button");
    addSlot.textContent = "Click to add text…";
    container.appendChild(root);

    const dirNow = () => (typeof opts.dir === "function" ? opts.dir() : opts.dir) || "";
    const getText = () => lead + blocks.map((b) => b.body + b.gap).join("");
    const changed = () => { if (opts.onChange) opts.onChange(getText()); };

    function renderBody(body) {
      try { return global.NotesRender.toElement(body, dirNow()); }
      catch {
        const pre = document.createElement("pre");
        pre.className = "blk-raw";
        pre.textContent = body;
        return pre;
      }
    }

    function makeWrap(blk) {
      const wrap = document.createElement("div");
      wrap.className = "blk";
      wrap.tabIndex = 0;
      wrap.title = "Click to edit";
      wrap.replaceChildren(renderBody(blk.body));
      blk.wrap = wrap;
      return wrap;
    }

    function build() {
      root.replaceChildren(...blocks.map(makeWrap), addSlot);
    }

    function grow(ta) {
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight + 2}px`;
    }

    /* ---- start / end of a block edit ---- */
    function startEdit(blk, wrap, isNew, init) {
      if (locked) return;
      const view = isNew ? null : wrap.firstChild;
      const ta = document.createElement("textarea");
      ta.className = "blk-ta";
      ta.spellcheck = false;
      ta.setAttribute("autocapitalize", "off");
      ta.setAttribute("aria-label", "Block text (Markdown)");
      ta.value = init && typeof init.text === "string" ? init.text : blk.body;
      ed = { blk, wrap, ta, view, isNew, before: init && init.before || null };
      if (!isNew) active = blk;
      wrap.classList.add("editing");
      wrap.removeAttribute("title");
      wrap.replaceChildren(ta);
      ta.addEventListener("input", () => grow(ta));
      ta.addEventListener("blur", () => commit());
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelEdit(); }
        else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitAndNext(); }
      });
      grow(ta);
      ta.focus();
      const c = init && Number.isInteger(init.caret) ? Math.max(0, Math.min(init.caret, ta.value.length)) : ta.value.length;
      ta.setSelectionRange(c, c);
    }

    /* init (9C): { text, caret, at } opens the new block at position `at` with a starting template */
    function newBlockEdit(init) {
      if (locked) return;
      const blk = { body: "", gap: "\n", wrap: null };
      const wrap = document.createElement("div");
      wrap.className = "blk";
      blk.wrap = wrap;
      const before = init && Number.isInteger(init.at) ? blocks[init.at] || null : null;
      root.insertBefore(wrap, before && before.wrap && before.wrap.parentNode === root ? before.wrap : addSlot);
      startEdit(blk, wrap, true, { text: init && init.text, caret: init && init.caret, before });
    }

    /* puts a finished block into the list at `at` with one blank line around it */
    function placeBlock(blk, at) {
      const prev = blocks[at - 1];
      if (prev && !/\n[ \t]*\n/.test(prev.gap)) prev.gap = "\n\n";
      if (at < blocks.length) blk.gap = "\n\n";
      blocks.splice(at, 0, blk);
    }

    function cancelEdit() {
      if (!ed) return;
      const e = ed; ed = null;
      if (e.isNew) { e.wrap.remove(); return; }
      e.wrap.classList.remove("editing");
      e.wrap.title = "Click to edit";
      e.wrap.replaceChildren(e.view);
    }

    /* Ctrl+Enter: commit this block and open the next one (after the last block: a new empty block) */
    function commitAndNext() {
      if (!ed) return;
      const next = ed.wrap.nextElementSibling;
      const wasEmptyNew = ed.isNew && !ed.ta.value.trim();
      commit();
      if (!next || !next.isConnected || wasEmptyNew) return;
      if (next === addSlot) newBlockEdit();
      else { const b = blkOf(next); if (b) startEdit(b, next, false); }
    }

    function commit() {
      if (!ed) return;
      const e = ed; ed = null; // cleared first: removing the focused textarea may fire blur again
      const text = e.ta.value.replace(/^\n+/, "").replace(/\s+$/, "");
      const blk = e.blk;
      const idx = blocks.indexOf(blk);

      if (e.isNew) {
        if (!text || isEmptyTemplate(text)) { e.wrap.remove(); return; }
        const ix = e.before ? blocks.indexOf(e.before) : -1;
        blk.body = text;
        placeBlock(blk, ix === -1 ? blocks.length : ix); // one blank line between blocks
        active = blk;
        finishChange(blk, e.wrap);
        return;
      }
      active = blk;
      if (text === blk.body) { // unchanged: put the old render back
        e.wrap.classList.remove("editing");
        e.wrap.title = "Click to edit";
        e.wrap.replaceChildren(e.view);
        return;
      }
      if (!text) { // emptied: remove the block (the last one hands its ending to the previous block)
        if (idx === blocks.length - 1 && idx > 0) blocks[idx - 1].gap = blk.gap;
        blocks.splice(idx, 1);
        active = blocks[idx - 1] || null;
        e.wrap.remove();
        changed();
        return;
      }
      blk.body = text;
      finishChange(blk, e.wrap);
    }

    /* the block's text changed: re-render it (splitting it if the user typed blank lines) */
    function finishChange(blk, wrap) {
      const idx = blocks.indexOf(blk);
      const sub = split(blk.body + blk.gap);
      if (sub && sub.lead === "" && sub.blocks.length > 1) {
        blocks.splice(idx, 1, ...sub.blocks);
        active = sub.blocks[sub.blocks.length - 1];
        const wraps = sub.blocks.map(makeWrap);
        wrap.replaceWith(...wraps);
      } else {
        wrap.className = "blk";
        wrap.title = "Click to edit";
        wrap.replaceChildren(renderBody(blk.body));
      }
      changed();
    }

    /* ---- pointer / keyboard ---- */
    const blkOf = (wrap) => blocks.find((b) => b.wrap === wrap);

    root.addEventListener("mousedown", (e) => {
      if (locked || !ed || e.button !== 0) return;
      const wrap = e.target.closest(".blk");
      const onSlot = e.target.closest(".blk-add");
      if (wrap && wrap === ed.wrap) return; // inside the textarea: normal behaviour
      if (onSlot && ed.isNew) { e.preventDefault(); ed.ta.focus(); return; }
      let target = null;
      if (wrap && !e.target.closest(".copy-btn")) target = blkOf(wrap);
      if (!target && !onSlot) return;
      e.preventDefault(); // keep control of focus; the layout may shift when the open block re-renders
      const targetWrap = target && target.wrap;
      commit();
      ignoreClickUntil = Date.now() + 400;
      if (onSlot) newBlockEdit();
      else if (target && blocks.includes(target) && targetWrap.isConnected) startEdit(target, targetWrap, false);
    });

    root.addEventListener("click", (e) => {
      const wrap = e.target.closest(".blk");
      const onSlot = e.target.closest(".blk-add");
      if (e.target.closest(".copy-btn")) return;
      if (wrap && !wrap.classList.contains("editing")) e.preventDefault(); // links/summaries must not act while editing
      if (locked || Date.now() < ignoreClickUntil) return;
      if (onSlot) { if (!ed) newBlockEdit(); return; }
      if (!wrap || wrap.classList.contains("editing") || ed) return;
      const sel = global.getSelection && global.getSelection();
      if (sel && !sel.isCollapsed && wrap.contains(sel.anchorNode)) return; // the person is selecting text
      const blk = blkOf(wrap);
      if (blk) startEdit(blk, wrap, false);
    });

    root.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.target.tagName === "TEXTAREA" || ed || locked) return;
      if (e.target.classList.contains("blk-add")) { e.preventDefault(); newBlockEdit(); }
      else if (e.target.classList.contains("blk")) { const b = blkOf(e.target); if (b) { e.preventDefault(); startEdit(b, e.target, false); } }
    });

    root.addEventListener("focusin", (e) => { // 9C: keyboard focus on a rendered block also sets the insert position
      const w = e.target.closest && e.target.closest(".blk");
      if (!w || (ed && w === ed.wrap)) return;
      const b = blkOf(w);
      if (b) active = b;
    });

    build();

    return {
      getText,
      commit,
      activeIndex() { return active ? blocks.indexOf(active) : -1; },
      /* 9C: inserts `text` as a new block after the active block (or at the end). edit:false adds it finished;
         otherwise it opens in the block editor with the caret at `caret` (default: the end). */
      insertAfterActive(text, o) {
        o = o || {};
        if (locked) return false;
        commit();
        const ai = active ? blocks.indexOf(active) : -1;
        const at = ai === -1 ? blocks.length : ai + 1;
        if (o.edit !== false) { newBlockEdit({ text: text || "", caret: o.caret, at }); return true; }
        const body = String(text || "").replace(/^\n+/, "").replace(/\s+$/, "");
        if (!body) return false;
        const blk = { body, gap: "\n", wrap: null };
        placeBlock(blk, at);
        const wrap = makeWrap(blk);
        const next = blocks[at + 1];
        root.insertBefore(wrap, next && next.wrap ? next.wrap : addSlot);
        active = blk;
        changed();
        if (wrap.scrollIntoView) wrap.scrollIntoView({ block: "nearest" });
        return true;
      },
      setLocked(on) { locked = !!on; root.classList.toggle("locked", locked); },
      /* replaces the whole text; false (nothing changed) if it cannot be split byte-exactly */
      setText(text) {
        const p = split(text);
        if (!p) return false;
        ed = null; active = null;
        lead = p.lead; blocks = p.blocks;
        build();
        return true;
      },
      destroy() { ed = null; root.remove(); },
    };
  }

  global.NotesBlocks = { mount, split: (t) => !!split(t) };
})(window);
