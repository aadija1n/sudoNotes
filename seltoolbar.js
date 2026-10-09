/* Phase 10: floating selection toolbar (window.NotesToolbar).
   Select text in a block textarea (.blk-ta) or in the Source textarea (.editor-ta) and a small bar shows the common
   formatting buttons. Everything goes through NotesFormat (format.js); this file only builds the UI.
   Focus rule: the block editor commits when its textarea blurs, so no control here may take focus. Every button and
   swatch cancels `mousedown` (the textarea keeps focus and selection) and acts on `click`. No text inputs, no native
   colour input: colours are preset swatches only. Listeners are delegated on `document` (capture), so no other file
   needs to change. */

(function (global) {
  const F = () => global.NotesFormat;
  const doc = document;

  const SWATCHES = [
    ["Red", "#ff6b6b"], ["Orange", "#ffa94d"], ["Yellow", "#ffd43b"], ["Green", "#69db7c"], ["Teal", "#38d9a9"],
    ["Cyan", "#66d9e8"], ["Blue", "#74c0fc"], ["Violet", "#b197fc"], ["Pink", "#f783ac"], ["Gray", "#adb5bd"],
  ];
  const ALIGN_HINT = "Alignment works on paragraphs and headings";

  /* ---------- small helpers ---------- */
  const svg = (inner) =>
    `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const ICONS = {
    highlight: svg('<path d="M9.5 3l3.5 3.5-5.5 5.5H4V8.5z"/><path d="M3 14.2h10"/>'),
    background: svg('<path d="M5 7.5L8 4.5l4 4-3 3z"/><path d="M13 11c.6.9 1 1.5 1 2.1a1 1 0 11-2 0c0-.6.4-1.2 1-2.1z"/><path d="M3 14h5"/>'),
    link: svg('<path d="M6.8 9.2l2.4-2.4"/><path d="M5.4 8L4.2 9.2a2.2 2.2 0 003.1 3.1L8.5 11"/><path d="M10.6 8l1.2-1.2a2.2 2.2 0 00-3.1-3.1L7.5 4.9"/>'),
    "align-left": svg('<path d="M3 4h10M3 8h6M3 12h8"/>'),
    "align-center": svg('<path d="M3 4h10M5 8h6M4 12h8"/>'),
    "align-right": svg('<path d="M3 4h10M7 8h6M5 12h8"/>'),
    "align-justify": svg('<path d="M3 4h10M3 8h10M3 12h10"/>'),
    none: svg('<circle cx="8" cy="8" r="5"/><path d="M4.5 11.5l7-7"/>'),
  };
  const CARET = '<span class="seltb-caret" aria-hidden="true">▾</span>';

  function tip(name, fallback) {
    const f = F();
    const sc = f && f.SHORTCUTS && f.SHORTCUTS.find((x) => x.name === name);
    return sc ? `${sc.label} (${sc.keys})` : fallback;
  }

  function visible(el) {
    if (!el || el.hidden || el.getAttribute("aria-hidden") === "true") return false;
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && el.getClientRects().length > 0;
  }

  /* ---------- state ---------- */
  let bar = null;            // the toolbar element (built lazily)
  let cur = null;            // the textarea the bar is showing for
  let pop = null;            // { el, anchor } open popover
  let timer = 0, raf = 0;
  let composing = false;     // IME composition in progress
  let dragging = false;      // mouse button held: the person is still selecting
  let dismissed = null;      // { ta, s, e }: Escape hid the bar; stay hidden until the selection changes
  const last = { color: null, background: null };
  const toggles = [];        // buttons with aria-pressed
  let alignBtn = null, colorInd = null, bgInd = null;

  /* ---------- building the bar ---------- */
  function mkBtn(opts) {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = "seltb-btn" + (opts.cls ? " " + opts.cls : "");
    b.tabIndex = -1; // never takes keyboard focus either
    b.dataset.act = opts.act;
    if (opts.name) b.dataset.name = opts.name;
    b.innerHTML = opts.html;
    const t = opts.title;
    b.title = t;
    b.setAttribute("aria-label", t);
    if (opts.toggle) { b.setAttribute("aria-pressed", "false"); toggles.push(b); }
    if (opts.menu) { b.setAttribute("aria-haspopup", "true"); b.setAttribute("aria-expanded", "false"); }
    return b;
  }
  const sep = () => { const s = doc.createElement("span"); s.className = "seltb-sep"; s.setAttribute("role", "separator"); return s; };

  function build() {
    if (bar) return bar;
    bar = doc.createElement("div");
    bar.className = "seltb";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Text formatting");
    bar.setAttribute("aria-hidden", "true");

    const fmt = (name, html, cls) => mkBtn({ act: "fmt", name, html, cls, toggle: true, title: tip(name, name) });
    const colorBtn = mkBtn({ act: "color", html: '<span class="seltb-A">A</span><span class="seltb-ind"></span>' + CARET, title: "Text colour", menu: true, cls: "seltb-wide" });
    const bgBtn = mkBtn({ act: "background", html: ICONS.background + '<span class="seltb-ind"></span>' + CARET, title: "Background colour", menu: true, cls: "seltb-wide" });
    alignBtn = mkBtn({ act: "align", html: ICONS["align-left"] + CARET, title: "Align", menu: true, cls: "seltb-wide" });
    colorInd = colorBtn.querySelector(".seltb-ind");
    bgInd = bgBtn.querySelector(".seltb-ind");

    bar.append(
      mkBtn({ act: "block", html: '<span class="seltb-aa">Aa</span>' + CARET, title: "Text style", menu: true, cls: "seltb-wide" }),
      sep(),
      fmt("bold", "<b>B</b>"),
      fmt("italic", "<i>I</i>"),
      fmt("underline", "<u>U</u>"),
      fmt("strike", "<s>S</s>"),
      fmt("code", '<span class="seltb-mono">&lt;/&gt;</span>'),
      fmt("highlight", ICONS.highlight),
      sep(),
      colorBtn,
      bgBtn,
      sep(),
      alignBtn,
      sep(),
      mkBtn({ act: "link", name: "link", html: ICONS.link, title: tip("link", "Link"), toggle: true }),
      mkBtn({ act: "more", html: '<span class="seltb-dots">⋯</span>' + CARET, title: "More", menu: true, cls: "seltb-wide" })
    );

    // never take focus from the textarea: it would commit the block
    const keepFocus = (e) => { if (!(e.target.closest && e.target.closest("input, textarea"))) e.preventDefault(); };
    bar.addEventListener("mousedown", keepFocus);
    bar.addEventListener("click", onBarClick);
    doc.body.appendChild(bar);
    return bar;
  }

  /* ---------- popovers (menus and the colour grid) ---------- */
  function closePop() {
    if (!pop) return;
    pop.el.remove();
    pop.anchor.setAttribute("aria-expanded", "false");
    pop = null;
  }

  function placePop(el, anchor) {
    const r = anchor.getBoundingClientRect();
    const vw = doc.documentElement.clientWidth, vh = doc.documentElement.clientHeight;
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = Math.max(8, Math.min(r.left, vw - w - 8));
    let top = r.bottom + 6;
    if (top + h > vh - 8) top = Math.max(8, r.top - h - 6);
    el.style.left = left + "px";
    el.style.top = top + "px";
  }

  function openPop(anchor, el, cls) {
    closePop();
    el.classList.add("seltb-pop", cls);
    el.addEventListener("mousedown", (e) => e.preventDefault());
    doc.body.appendChild(el);
    placePop(el, anchor);
    anchor.setAttribute("aria-expanded", "true");
    pop = { el, anchor };
  }

  function menuItem(it) {
    const b = doc.createElement("button");
    b.type = "button";
    b.tabIndex = -1;
    b.className = "seltb-item" + (it.on ? " on" : "");
    b.setAttribute("role", "menuitem");
    if (it.on != null) b.setAttribute("aria-checked", String(!!it.on));
    const ic = doc.createElement("span");
    ic.className = "seltb-item-ic";
    if (it.icon) ic.innerHTML = it.icon; else if (it.on) ic.textContent = "✓";
    const lb = doc.createElement("span");
    lb.className = "seltb-item-lb";
    lb.textContent = it.label;
    b.append(ic, lb);
    if (it.hint) { const h = doc.createElement("span"); h.className = "seltb-item-hint"; h.textContent = it.hint; b.appendChild(h); }
    b.addEventListener("click", () => { closePop(); run(it.action); });
    return b;
  }

  function openMenu(anchor, items) {
    const el = doc.createElement("div");
    el.setAttribute("role", "menu");
    items.forEach((it) => el.appendChild(menuItem(it)));
    openPop(anchor, el, "seltb-menu");
  }

  function openColors(anchor, kind) {
    const el = doc.createElement("div");
    el.setAttribute("role", "group");
    el.setAttribute("aria-label", kind === "color" ? "Text colour" : "Background colour");
    const grid = doc.createElement("div");
    grid.className = "seltb-grid";
    for (const [name, hex] of SWATCHES) {
      const b = doc.createElement("button");
      b.type = "button";
      b.tabIndex = -1;
      b.className = "seltb-sw" + (last[kind] === hex ? " on" : "");
      b.style.background = hex;
      b.title = name;
      b.setAttribute("aria-label", (kind === "color" ? "Text colour " : "Background ") + name.toLowerCase());
      b.addEventListener("click", () => { last[kind] = hex; closePop(); run((ta) => F().setColor(ta, kind, hex)); });
      grid.appendChild(b);
    }
    const none = doc.createElement("button");
    none.type = "button";
    none.tabIndex = -1;
    none.className = "seltb-none";
    none.innerHTML = ICONS.none + "<span>None</span>";
    none.title = kind === "color" ? "Remove text colour" : "Remove background colour";
    none.addEventListener("click", () => { last[kind] = null; closePop(); run((ta) => F().setColor(ta, kind, null)); });
    el.append(grid, none);
    openPop(anchor, el, "seltb-colors");
  }

  /* ---------- actions ---------- */
  /* runs a NotesFormat action on the current textarea; focus and selection stay where they are */
  function run(fn) {
    const ta = cur;
    if (!ta || !ta.isConnected || ta.readOnly || !F()) return;
    if (doc.activeElement !== ta) ta.focus();
    try { fn(ta); } catch (err) { console.warn("NotesToolbar action failed", err); }
    schedule(0);
  }

  function headingLevel(ta) {
    const v = ta.value, ls = v.lastIndexOf("\n", ta.selectionStart - 1) + 1;
    const m = /^(#{1,6})[ \t]/.exec(v.slice(ls, ls + 8));
    return m ? m[1].length : 0;
  }

  function onBarClick(e) {
    const b = e.target.closest && e.target.closest("button[data-act]");
    if (!b || !cur) return;
    const act = b.dataset.act;
    if (b.getAttribute("aria-disabled") === "true") return;
    if (b.getAttribute("aria-haspopup") && pop && pop.anchor === b) { closePop(); return; } // second click closes
    const ta = cur;
    if (act === "fmt") { closePop(); run((t) => F().apply(t, b.dataset.name)); }
    else if (act === "link") { closePop(); run((t) => F().apply(t, "link")); }
    else if (act === "color" || act === "background") openColors(b, act);
    else if (act === "block") {
      const lv = headingLevel(ta);
      const items = [{ label: "Paragraph", hint: tip("paragraph", "").replace(/^.*\(|\)$/g, ""), on: lv === 0, action: (t) => F().apply(t, "paragraph") }];
      for (let i = 1; i <= 6; i++) items.push({ label: "Heading " + i, hint: tip("h" + i, "").replace(/^.*\(|\)$/g, ""), on: lv === i, action: (t) => F().apply(t, "h" + i) });
      openMenu(b, items);
    } else if (act === "align") {
      const items = ["left", "center", "right", "justify"].map((d) => ({
        label: d[0].toUpperCase() + d.slice(1), icon: ICONS["align-" + d], action: (t) => F().setAlign(t, d),
      }));
      openMenu(b, items);
    } else if (act === "more") {
      openMenu(b, [
        { label: "Superscript", hint: tip("sup", "").replace(/^.*\(|\)$/g, ""), on: F().isActive(ta, "sup"), action: (t) => F().apply(t, "sup") },
        { label: "Subscript", hint: tip("sub", "").replace(/^.*\(|\)$/g, ""), on: F().isActive(ta, "sub"), action: (t) => F().apply(t, "sub") },
        { label: "Clear formatting", icon: ICONS.none, action: (t) => F().clearFormat(t) },
      ]);
    }
  }

  /* ---------- when to show ---------- */
  function eligible() {
    if (!doc.body.classList.contains("write")) return null;
    const ta = doc.activeElement;
    if (!ta || ta.tagName !== "TEXTAREA" || !(ta.classList.contains("blk-ta") || ta.classList.contains("editor-ta"))) return null;
    if (!ta.isConnected || ta.readOnly || ta.disabled || ta.closest(".locked")) return null;
    if (ta.selectionStart === ta.selectionEnd) return null;
    if (composing || dragging) return null;
    if (dismissed && dismissed.ta === ta && dismissed.s === ta.selectionStart && dismissed.e === ta.selectionEnd) return null;
    if (visible(doc.querySelector(".slash-menu"))) return null;
    for (const id of ["modal", "ins-modal", "ks-modal", "math-popover", "table-modal", "img-modal", "fn-modal", "qa-modal"]) {
      if (visible(doc.getElementById(id))) return null;
    }
    return ta;
  }

  function refresh() {
    const f = F();
    if (!bar || !cur || !f) return;
    for (const b of toggles) b.setAttribute("aria-pressed", String(!!f.isActive(cur, b.dataset.name)));
    const can = f.canAlign(cur);
    alignBtn.setAttribute("aria-disabled", String(!can));
    alignBtn.classList.toggle("is-disabled", !can);
    alignBtn.title = can ? "Align" : ALIGN_HINT;
    alignBtn.setAttribute("aria-label", can ? "Align" : ALIGN_HINT);
    colorInd.style.background = last.color || "";
    bgInd.style.background = last.background || "";
    colorInd.classList.toggle("set", !!last.color);
    bgInd.classList.toggle("set", !!last.background);
  }

  /* ---------- position ---------- */
  const MIRROR_PROPS = [
    "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontVariant", "fontStretch", "lineHeight", "letterSpacing",
    "wordSpacing", "textTransform", "textIndent", "tabSize", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "borderStyle", "wordBreak", "overflowWrap", "textAlign", "direction",
  ];

  /* viewport point (left / top / line height) of character `index` in the textarea, via a hidden mirror div */
  function pointAt(ta, index, cs, taRect) {
    const div = doc.createElement("div");
    const st = div.style;
    for (const p of MIRROR_PROPS) st[p] = cs[p];
    st.boxSizing = "border-box";
    st.width = ta.clientWidth + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0) + "px";
    st.position = "fixed";
    st.left = "-9999px";
    st.top = "0";
    st.visibility = "hidden";
    st.whiteSpace = "pre-wrap";
    st.wordWrap = "break-word";
    st.overflow = "hidden";
    st.height = "auto";
    div.textContent = ta.value.slice(0, index);
    const mark = doc.createElement("span");
    mark.textContent = ta.value.slice(index, index + 1) || "​";
    div.appendChild(mark);
    doc.body.appendChild(div);
    try {
      const dr = div.getBoundingClientRect(), mr = mark.getBoundingClientRect();
      const lh = parseFloat(cs.lineHeight) || mr.height || 18;
      return { left: taRect.left + (mr.left - dr.left) - ta.scrollLeft, top: taRect.top + (mr.top - dr.top) - ta.scrollTop, lh };
    } finally { div.remove(); }
  }

  function place() {
    if (!bar || !cur) return;
    const ta = cur;
    const vv = global.visualViewport;
    const minX = (vv ? vv.offsetLeft : 0) + 8, maxX = (vv ? vv.offsetLeft + vv.width : doc.documentElement.clientWidth) - 8;
    const minY = (vv ? vv.offsetTop : 0) + 8, maxY = (vv ? vv.offsetTop + vv.height : doc.documentElement.clientHeight) - 8;
    bar.style.maxWidth = Math.max(160, maxX - minX) + "px";
    const w = bar.offsetWidth, h = bar.offsetHeight;
    const touch = !!(global.matchMedia && global.matchMedia("(pointer: coarse)").matches);
    const taRect = ta.getBoundingClientRect();
    let left, top, hiddenOff = false;
    try {
      const cs = getComputedStyle(ta), v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
      const a = pointAt(ta, s, cs, taRect);
      const z = pointAt(ta, v[e - 1] === "\n" && e - 1 > s ? e - 1 : e, cs, taRect);
      left = a.left - w / 2;
      top = a.top - h - 8;
      if (touch || top < minY) top = z.top + z.lh + 8; // below the last selected line
      hiddenOff = z.top + z.lh < 0 || a.top > (vv ? vv.offsetTop + vv.height : doc.documentElement.clientHeight);
    } catch (_) {
      left = taRect.left;
      top = taRect.top - h - 8;
    }
    left = Math.max(minX, Math.min(left, maxX - w));
    top = Math.max(minY, Math.min(top, maxY - h));
    bar.style.left = Math.round(left) + "px";
    bar.style.top = Math.round(top) + "px";
    bar.classList.toggle("is-offscreen", hiddenOff);
    if (pop) placePop(pop.el, pop.anchor);
  }

  /* ---------- show / hide ---------- */
  function hide() {
    closePop();
    cur = null;
    if (!bar) return;
    bar.classList.remove("is-open", "is-offscreen");
    bar.setAttribute("aria-hidden", "true");
  }

  function update() {
    timer = 0;
    const ta = eligible();
    if (!ta || !F()) { hide(); return; }
    build();
    if (cur && cur !== ta) closePop();
    cur = ta;
    refresh();
    place();
    bar.classList.add("is-open");
    bar.removeAttribute("aria-hidden");
  }

  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(update, delay == null ? 50 : delay);
  }

  function reposition() {
    if (raf || !bar || !cur || !bar.classList.contains("is-open")) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!cur || !cur.isConnected) { hide(); return; }
      place();
    });
  }

  /* ---------- delegated listeners ---------- */
  const inUi = (t) => !!(t && t.closest && (t.closest(".seltb") || t.closest(".seltb-pop")));

  ["select", "mouseup", "keyup", "pointerup", "touchend", "input", "selectionchange", "focusin", "focusout"].forEach((type) => {
    doc.addEventListener(type, (e) => {
      if (type === "mouseup" || type === "pointerup") dragging = false;
      if (e && e.target && inUi(e.target) && type !== "selectionchange") return;
      if (type === "input" && e.isComposing) return;
      schedule(type === "selectionchange" || type === "keyup" ? 60 : 30);
    }, true);
  });

  doc.addEventListener("mousedown", (e) => {
    if (e.button === 0 && !inUi(e.target)) dragging = true;
  }, true);
  global.addEventListener("blur", () => { dragging = false; schedule(0); });
  doc.addEventListener("compositionstart", () => { composing = true; schedule(0); }, true);
  doc.addEventListener("compositionend", () => { composing = false; schedule(30); }, true);

  doc.addEventListener("pointerdown", (e) => { // outside press closes the popover
    if (pop && !pop.el.contains(e.target) && !(bar && bar.contains(e.target))) closePop();
  }, true);

  doc.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (pop) { e.preventDefault(); e.stopPropagation(); closePop(); return; } // only the popover, first
    if (cur && bar && bar.classList.contains("is-open")) { // the key goes on to its normal handler
      dismissed = { ta: cur, s: cur.selectionStart, e: cur.selectionEnd };
      hide();
      schedule(60);
    }
  }, true);

  doc.addEventListener("scroll", (e) => { if (!inUi(e.target)) reposition(); }, true);
  global.addEventListener("resize", () => { reposition(); });
  if (global.visualViewport) {
    global.visualViewport.addEventListener("resize", reposition);
    global.visualViewport.addEventListener("scroll", reposition);
  }
  global.addEventListener("hashchange", hide);
  global.addEventListener("popstate", hide);

  global.NotesToolbar = {
    hide,
    refresh() { schedule(0); },
    isOpen() { return !!(bar && bar.classList.contains("is-open")); },
  };

  /* cheat sheet row (shortcuts.js loads later, so wait for it if needed) */
  function reg() {
    if (global.NotesShortcuts && typeof global.NotesShortcuts.register === "function") {
      global.NotesShortcuts.register("Selection toolbar", [
        { label: "Formatting toolbar", keys: "Select text", hint: "Colours, alignment, headings, clear formatting" },
      ]);
    }
  }
  if (global.NotesShortcuts) reg();
  else if (doc.readyState === "complete") reg();
  else doc.addEventListener("DOMContentLoaded", reg, { once: true });
})(window);
