/* Phase 9E: inline formatting shortcuts, shared helper (window.NotesFormat).
   Pure text logic on a <textarea>: no DOM building, no dialogs. Reused by 9G, Phase 10 and 10B. */

(function (global) {
  const isMac = /Mac|iPhone|iPad/i.test((navigator && navigator.platform) || "");
  const disp = (k) => (isMac ? k.replace(/Ctrl/g, "Cmd") : k);

  const INLINE = {
    bold: ["**", "**"],
    italic: ["*", "*"],
    underline: ["<u>", "</u>"],
    strike: ["~~", "~~"],
    code: ["`", "`"],
    highlight: ["<mark>", "</mark>"],
    sup: ["<sup>", "</sup>"],
    sub: ["<sub>", "</sub>"],
  };

  const SHORTCUTS = [
    { name: "bold", label: "Bold", keys: disp("Ctrl+B"), hint: "**text**" },
    { name: "italic", label: "Italic", keys: disp("Ctrl+I"), hint: "*text*" },
    { name: "underline", label: "Underline", keys: disp("Ctrl+U"), hint: "<u>text</u>" },
    { name: "strike", label: "Strikethrough", keys: disp("Ctrl+Shift+X"), hint: "~~text~~" },
    { name: "code", label: "Inline code", keys: disp("Ctrl+`"), hint: "`text`" },
    { name: "highlight", label: "Highlight", keys: disp("Ctrl+Shift+H"), hint: "<mark>text</mark>" },
    { name: "sup", label: "Superscript", keys: disp("Ctrl+Shift+."), hint: "<sup>text</sup>" },
    { name: "sub", label: "Subscript", keys: disp("Ctrl+Shift+,"), hint: "<sub>text</sub>" },
    { name: "link", label: "Link", keys: disp("Ctrl+K"), hint: "[text](url)" },
    { name: "h1", label: "Heading 1", keys: disp("Ctrl+Alt+1"), hint: "# " },
    { name: "h2", label: "Heading 2", keys: disp("Ctrl+Alt+2"), hint: "## " },
    { name: "h3", label: "Heading 3", keys: disp("Ctrl+Alt+3"), hint: "### " },
    { name: "h4", label: "Heading 4", keys: disp("Ctrl+Alt+4"), hint: "#### " },
    { name: "h5", label: "Heading 5", keys: disp("Ctrl+Alt+5"), hint: "##### " },
    { name: "h6", label: "Heading 6", keys: disp("Ctrl+Alt+6"), hint: "###### " },
    { name: "paragraph", label: "Normal text", keys: disp("Ctrl+Alt+0"), hint: "removes the # prefix" },
  ];

  /* ---------- text replacement (keeps native undo, fires `input` once) ---------- */
  function replace(ta, start, end, text) {
    const before = ta.value;
    const expected = before.slice(0, start) + text + before.slice(end);
    if (document.activeElement !== ta) ta.focus();
    ta.setSelectionRange(start, end);
    let n = 0;
    const count = () => { n++; };
    ta.addEventListener("input", count);
    let ok = false;
    try {
      if (text === "") ok = start === end ? true : document.execCommand("delete");
      else ok = document.execCommand("insertText", false, text);
    } catch (_) { ok = false; }
    ta.removeEventListener("input", count);
    if (!ok) {
      ta.setRangeText(text, start, end, "end");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      if (ta.value !== expected) ta.value = expected; // the browser did something else: force the intended text
      if (n === 0 && ta.value !== before) ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  /* ---------- helpers ---------- */
  const WORD = /[\p{L}\p{N}\p{M}_]/u;
  function wordAt(v, p) {
    let a = p, b = p;
    while (a > 0 && WORD.test(v[a - 1])) a--;
    while (b < v.length && WORD.test(v[b])) b++;
    return a === b ? null : [a, b];
  }
  const lineStart = (v, p) => v.lastIndexOf("\n", p - 1) + 1;
  const lineEnd = (v, p) => { const i = v.indexOf("\n", p); return i === -1 ? v.length : i; };

  /* count of `ch` starting at `from`, going dir (+1 / -1), staying inside [lo, hi) */
  function run(v, ch, from, dir, lo, hi) {
    let n = 0, i = dir > 0 ? from : from - 1;
    while (i >= lo && i < hi && v[i] === ch) { n++; i += dir; }
    return n;
  }

  /* Is v[a,b) already wrapped? -> { mode: "inside"|"around", o, c } or null.
     Italic counts only 1 or 3 asterisks (so ** of bold is not italic); code counts 1 or 2 backticks. */
  function detect(v, a, b, name) {
    const m = INLINE[name];
    if (name === "italic" || name === "code") {
      const ch = name === "italic" ? "*" : "`";
      const okLen = (n) => (name === "italic" ? n === 1 || n === 3 : n === 1 || n === 2);
      if (b > a) {
        const l = run(v, ch, a, 1, a, b), r = run(v, ch, b, -1, a, b);
        if (l && l === r && l + r <= b - a && okLen(l)) return { mode: "inside", o: l, c: r };
      }
      const l2 = run(v, ch, a, -1, 0, v.length), r2 = run(v, ch, b, 1, 0, v.length);
      if (l2 && l2 === r2 && okLen(l2)) return { mode: "around", o: l2, c: r2 };
      return null;
    }
    const o = m[0].length, c = m[1].length;
    if (b - a >= o + c && v.startsWith(m[0], a) && v.slice(b - c, b) === m[1]) return { mode: "inside", o, c };
    if (a >= o && v.slice(a - o, a) === m[0] && v.slice(b, b + c) === m[1]) return { mode: "around", o, c };
    return null;
  }

  function markersFor(name, text) {
    if (name === "code" && text.includes("`")) {
      const pad = text[0] === "`" || text[text.length - 1] === "`" ? " " : "";
      return ["``" + pad, pad + "``"];
    }
    return INLINE[name];
  }

  /* ---------- inline wrap / unwrap ---------- */
  function inline(ta, name) {
    const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    let segs = []; // trimmed text ranges [{a, b}]
    let caretMode = false;

    if (s === e) {
      const w = wordAt(v, s);
      if (!w) {
        const det = detect(v, s, s, name);
        if (det) { // caret sits between empty markers: remove them
          replace(ta, s - det.o, s + det.c, "");
          ta.setSelectionRange(s - det.o, s - det.o);
        } else {
          const m = markersFor(name, "");
          replace(ta, s, s, m[0] + m[1]);
          ta.setSelectionRange(s + m[0].length, s + m[0].length);
        }
        return true;
      }
      segs = [{ a: w[0], b: w[1] }];
      caretMode = true;
    } else {
      const multi = v.slice(s, e).includes("\n");
      let pos = s;
      for (;;) {
        const i = v.indexOf("\n", pos);
        const le = i === -1 || i >= e ? e : i;
        let a = pos, b = le;
        while (a < b && /[ \t]/.test(v[a])) a++;
        while (b > a && /[ \t\r]/.test(v[b - 1])) b--;
        if (multi && (pos === 0 || v[pos - 1] === "\n")) { // keep list / quote / heading markers outside
          const pm = /^(?:[-*+] +(?:\[[ xX]\] +)?|\d+[.)] +|>+ *|#{1,6} +)/.exec(v.slice(a, b));
          if (pm && pm[0].length < b - a) a += pm[0].length;
        }
        if (b > a) segs.push({ a, b });
        if (le >= e) break;
        pos = le + 1;
      }
      if (!segs.length) return false;
    }

    const dets = segs.map((g) => detect(v, g.a, g.b, name));
    const allWrapped = dets.every(Boolean);
    const edits = [];
    let d = 0, selS = 0, selE = 0, shiftFirst = 0;
    segs.forEach((g, k) => {
      const det = dets[k];
      let ns, ne, sh = 0;
      if (allWrapped) {
        if (det.mode === "inside") {
          edits.push({ pos: g.a, del: det.o, ins: "" }, { pos: g.b - det.c, del: det.c, ins: "" });
          ns = g.a + d; ne = g.b - det.o - det.c + d; sh = 0;
        } else {
          edits.push({ pos: g.a - det.o, del: det.o, ins: "" }, { pos: g.b, del: det.c, ins: "" });
          ns = g.a - det.o + d; ne = g.b - det.o + d; sh = -det.o;
        }
        d -= det.o + det.c;
      } else if (!det) {
        const m = markersFor(name, v.slice(g.a, g.b));
        edits.push({ pos: g.a, del: 0, ins: m[0] }, { pos: g.b, del: 0, ins: m[1] });
        ns = g.a + m[0].length + d; ne = g.b + m[0].length + d; sh = m[0].length;
        d += m[0].length + m[1].length;
      } else { ns = g.a + d; ne = g.b + d; }
      if (k === 0) { selS = ns; shiftFirst = sh; }
      if (k === segs.length - 1) selE = ne;
    });

    const r0 = edits[0].pos, last = edits[edits.length - 1], r1 = last.pos + last.del;
    let out = "", cur = r0;
    for (const ed of edits) { out += v.slice(cur, ed.pos) + ed.ins; cur = ed.pos + ed.del; }
    out += v.slice(cur, r1);
    replace(ta, r0, r1, out);
    if (caretMode) {
      const p = Math.max(0, Math.min(ta.value.length, s + shiftFirst));
      ta.setSelectionRange(p, p); // the caret stays on the same letter
    } else ta.setSelectionRange(selS, selE); // the same text stays selected, so pressing again toggles
    return true;
  }

  /* ---------- link ---------- */
  const URL_RE = /^(?:https?:\/\/|mailto:)\S+$/i;
  function link(ta) {
    const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    if (v.slice(s, e).includes("\n")) return false;
    // inside an existing [text](url): drop the link, keep the text
    const ls = lineStart(v, s), le = lineEnd(v, s);
    const re = /\[([^\]\n]*)\]\(([^)\n]*)\)/g;
    const line = v.slice(ls, le);
    let m;
    while ((m = re.exec(line))) {
      const ms = ls + m.index, me = ms + m[0].length;
      if (v[ms - 1] === "!") continue; // an image, not a link
      if (s >= ms && e <= me) {
        replace(ta, ms, me, m[1]);
        ta.setSelectionRange(ms, ms + m[1].length);
        return true;
      }
    }
    let a = s, b = e;
    if (s === e) {
      const w = wordAt(v, s);
      if (!w) { replace(ta, s, s, "[](url)"); ta.setSelectionRange(s + 1, s + 1); return true; }
      a = w[0]; b = w[1];
    } else {
      while (a < b && /[ \t]/.test(v[a])) a++;
      while (b > a && /[ \t\r]/.test(v[b - 1])) b--;
      if (a >= b) return false;
    }
    const text = v.slice(a, b);
    if (URL_RE.test(text)) {
      replace(ta, a, b, `[](${text})`);
      ta.setSelectionRange(a + 1, a + 1);
    } else {
      replace(ta, a, b, `[${text}](url)`);
      const u = a + 1 + text.length + 2;
      ta.setSelectionRange(u, u + 3); // "url" selected: typing replaces it
    }
    return true;
  }

  /* ---------- headings (line containing the caret) ---------- */
  function heading(ta, level) {
    const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    const ls = lineStart(v, s), le = lineEnd(v, s);
    const line = v.slice(ls, le);
    if (/^\s*(?:[-*+]|\d+[.)])\s/.test(line) || /^\s*>/.test(line)) return false; // list / quote: leave alone
    const pm = /^(#{1,6})[ \t]+/.exec(line);
    const cur = pm ? pm[1].length : 0;
    const oldLen = pm ? pm[0].length : 0;
    const newPrefix = level === 0 || level === cur ? "" : "#".repeat(level) + " ";
    if (oldLen === 0 && newPrefix === "") return false;
    const delta = newPrefix.length - oldLen;
    const map = (p) => (p < ls + oldLen ? ls + newPrefix.length : p + delta);
    replace(ta, ls, ls + oldLen, newPrefix);
    ta.setSelectionRange(map(s), map(e));
    return true;
  }

  /* ---------- public API ---------- */
  function apply(ta, name) {
    if (!ta || ta.readOnly || ta.disabled) return false;
    if (name === "link") return link(ta);
    if (name === "paragraph") return heading(ta, 0);
    const h = /^h([1-6])$/.exec(name);
    if (h) return heading(ta, +h[1]);
    if (INLINE[name]) return inline(ta, name);
    return false;
  }

  function nameFor(e) {
    if (e.altKey) { // Ctrl+Alt+0..6: match the physical key, Alt changes e.key on Mac
      if (e.shiftKey) return null;
      const m = /^(?:Digit|Numpad)([0-6])$/.exec(e.code || "");
      return m ? (m[1] === "0" ? "paragraph" : "h" + m[1]) : null;
    }
    let k = (e.key || "").toLowerCase();
    if (!/^[a-z]$/.test(k)) { const m = /^Key([A-Z])$/.exec(e.code || ""); k = m ? m[1].toLowerCase() : ""; } // non-Latin layouts
    if (!e.shiftKey) {
      if (k === "b") return "bold";
      if (k === "i") return "italic";
      if (k === "u") return "underline";
      if (k === "k") return "link";
      if (e.code === "Backquote" || e.key === "`") return "code";
    } else {
      if (k === "x") return "strike";
      if (k === "h") return "highlight";
      if (e.code === "Period") return "sup";
      if (e.code === "Comma") return "sub";
    }
    return null;
  }

  function handleKey(e, ta) {
    if (!e || !ta || e.isComposing) return false;
    if (!(e.ctrlKey || e.metaKey)) return false;
    if (e.getModifierState && e.getModifierState("AltGraph")) return false;
    if (ta.readOnly || ta.disabled || document.activeElement !== ta) return false;
    const name = nameFor(e);
    if (!name) return false;
    e.preventDefault();
    e.stopPropagation();
    apply(ta, name);
    return true;
  }

  global.NotesFormat = { apply, handleKey, SHORTCUTS };
})(window);
