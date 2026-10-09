/* Phase 9G: slash menu (window.NotesSlash). Typing "/" (plus optional letters) as the whole content of a block opens a
   filtered list of the NotesInsert registry; choosing an item puts its template into the block's textarea.
   blocks.js calls NotesSlash.attach(ta, { commit, insert: NotesInsert }) in startEdit, before the other listeners. */

(function (global) {
  const PATTERN = /^\/[\w+-]*$/;
  let cur = null; // { ta, api, el, list, idx, base, raf }
  let seq = 0;

  const isWrite = () => document.body.classList.contains("write");

  function score(it, q) {
    if (!q) return 5;
    const label = it.label.toLowerCase(), id = it.id.toLowerCase();
    const kws = (it.keywords || []).map((k) => String(k).toLowerCase());
    if (id === q || label.startsWith(q)) return 0;
    if (id.startsWith(q)) return 1;
    if (kws.some((k) => k.startsWith(q)) || label.split(/\s+/).some((w) => w.startsWith(q))) return 2;
    if (label.includes(q)) return 3;
    if (id.includes(q) || kws.some((k) => k.includes(q))) return 4;
    return -1;
  }

  function filter(api, q) {
    const items = api.insert && api.insert.items ? api.insert.items() : [];
    q = q.toLowerCase();
    return items.map((it, i) => ({ it, i, s: score(it, q) })).filter((x) => x.s >= 0)
      .sort((a, b) => a.s - b.s || a.i - b.i).map((x) => x.it);
  }

  function place() {
    const c = cur;
    if (!c) return;
    const r = c.ta.getBoundingClientRect();
    const m = 8, el = c.el;
    const lh = parseFloat(getComputedStyle(c.ta).lineHeight) || 22;
    const w = Math.min(320, window.innerWidth - 2 * m);
    el.style.width = `${w}px`;
    el.style.left = `${Math.max(m, Math.min(r.left + 12, window.innerWidth - w - m))}px`;
    const top = r.top + lh + 14;
    const below = window.innerHeight - top - m;
    const h = Math.min(el.scrollHeight + 2, 260);
    if (below < Math.min(h, 160) && r.top - m > below) { // not enough room below: flip above the block
      el.style.top = "auto";
      el.style.bottom = `${window.innerHeight - r.top + 4}px`;
      el.style.maxHeight = `${Math.max(100, Math.min(260, r.top - 2 * m))}px`;
    } else {
      el.style.bottom = "auto";
      el.style.top = `${top}px`;
      el.style.maxHeight = `${Math.max(100, Math.min(260, below))}px`;
    }
  }

  function setActive(i) {
    const c = cur;
    if (!c || !c.list.length) return;
    c.idx = i;
    [...c.el.children].forEach((b, k) => {
      const on = k === i;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", String(on));
      if (on) {
        c.ta.setAttribute("aria-activedescendant", b.id);
        if (b.offsetTop < c.el.scrollTop) c.el.scrollTop = b.offsetTop;
        else if (b.offsetTop + b.offsetHeight > c.el.scrollTop + c.el.clientHeight) c.el.scrollTop = b.offsetTop + b.offsetHeight - c.el.clientHeight;
      }
    });
  }

  function render() {
    const c = cur;
    c.el.replaceChildren();
    if (!c.list.length) {
      const d = document.createElement("div");
      d.className = "slash-empty";
      const ins = c.api.insert;
      d.textContent = ins && ins.items ? "No matches"
        : ins ? "Old insertmenu.js is still being served (clear the cache / service worker)"
        : "insertmenu.js did not load (see the browser console for an error)";
      c.el.appendChild(d);
      c.ta.removeAttribute("aria-activedescendant");
    } else {
      c.list.forEach((it, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.id = `${c.base}-${i}`;
        b.tabIndex = -1;
        b.setAttribute("role", "option");
        b.className = "ins-item slash-item";
        const l = document.createElement("span");
        l.textContent = it.label;
        b.appendChild(l);
        if (it.hint) { const h = document.createElement("span"); h.className = "ins-hint"; h.textContent = it.hint; b.appendChild(h); }
        c.el.appendChild(b);
      });
      setActive(Math.min(c.idx, c.list.length - 1));
    }
    place();
  }

  const onOutside = (e) => { if (cur && !cur.el.contains(e.target)) close(); };
  const onMove = () => place();

  function close() {
    const c = cur;
    if (!c) return;
    cur = null;
    cancelAnimationFrame(c.raf);
    c.el.remove();
    c.ta.removeAttribute("aria-activedescendant");
    c.ta.removeAttribute("aria-controls");
    c.ta.removeAttribute("aria-expanded");
    document.removeEventListener("pointerdown", onOutside, true);
    window.removeEventListener("resize", onMove);
    window.removeEventListener("scroll", onMove, true);
  }

  function choose(it) {
    const c = cur;
    if (!c || !it) return;
    const target = { ta: c.ta, commit: c.api.commit };
    const insert = c.api.insert;
    close();
    if (insert && insert.run) insert.run(it.id, target);
  }

  function show(ta, api, q) {
    if (!cur || cur.ta !== ta) {
      close();
      const el = document.createElement("div");
      el.className = "menu ins-menu slash-menu";
      el.setAttribute("role", "listbox");
      el.setAttribute("aria-label", "Insert");
      el.id = `slash-menu-${++seq}`;
      el.addEventListener("mousedown", (e) => e.preventDefault()); // the textarea keeps the focus
      el.addEventListener("click", (e) => {
        const b = e.target.closest(".slash-item");
        if (b && cur) choose(cur.list[[...cur.el.children].indexOf(b)]);
      });
      el.addEventListener("mouseover", (e) => {
        const b = e.target.closest(".slash-item");
        if (b && cur) setActive([...cur.el.children].indexOf(b));
      });
      document.body.appendChild(el);
      cur = { ta, api, el, list: [], idx: 0, base: `${el.id}-o`, raf: 0 };
      ta.setAttribute("aria-controls", el.id);
      ta.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", onOutside, true);
      window.addEventListener("resize", onMove);
      window.addEventListener("scroll", onMove, true);
      const watch = () => { if (!cur) return; if (!ta.isConnected) { close(); return; } cur.raf = requestAnimationFrame(watch); };
      cur.raf = requestAnimationFrame(watch);
    }
    const prev = cur.q;
    cur.q = q;
    cur.list = filter(api, q);
    if (prev !== q) cur.idx = 0;
    render();
  }

  function attach(ta, api) {
    const evaluate = () => {
      const v = ta.value;
      if (isWrite() && api && api.insert && PATTERN.test(v) && ta.selectionStart === v.length && ta.selectionEnd === v.length) show(ta, api, v.slice(1));
      else if (cur && cur.ta === ta) close();
    };
    ta.addEventListener("input", (e) => { if (!e.isComposing) evaluate(); });
    ta.addEventListener("compositionend", evaluate);
    ta.addEventListener("blur", () => { if (cur && cur.ta === ta) close(); });
    ta.addEventListener("keydown", (e) => {
      if (!cur || cur.ta !== ta || e.isComposing || e.keyCode === 229) return;
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (e.key === "Escape") { stop(); close(); return; } // closes the menu only, the block edit stays
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const n = cur.list.length;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!n) return;
        stop();
        setActive((cur.idx + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
      } else if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
        if (!n) { close(); return; } // no match: the text stays plain text
        stop();
        choose(cur.list[cur.idx]);
      }
    });
  }

  global.NotesSlash = { attach };
})(window);
