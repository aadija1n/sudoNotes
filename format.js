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

  /* ================= Phase 10: helpers for the selection toolbar ================= */

  /* trimmed text ranges of the selection (one per non-empty line); a caret gives the word under it */
  function segments(v, s, e) {
    if (s === e) { const w = wordAt(v, s); return w ? [{ a: w[0], b: w[1] }] : []; }
    const segs = [];
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
    return segs;
  }

  /* ---------- isActive: is the selection already wrapped with this markup? ---------- */
  function isActive(ta, name) {
    if (!ta) return false;
    const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    if (name === "link") {
      const ls = lineStart(v, s), le = lineEnd(v, s);
      const re = /\[([^\]\n]*)\]\(([^)\n]*)\)/g;
      const line = v.slice(ls, le);
      let m;
      while ((m = re.exec(line))) {
        const ms = ls + m.index, me = ms + m[0].length;
        if (v[ms - 1] === "!") continue;
        if (s >= ms && e <= me) return true;
      }
      return false;
    }
    if (!INLINE[name]) return false;
    const segs = segments(v, s, e);
    if (!segs.length) return s === e ? !!detect(v, s, s, name) : false;
    return segs.every((g) => !!detect(v, g.a, g.b, name));
  }

  /* ---------- colour: <span style="color:#hex;background-color:#hex"> ---------- */
  const HEX_RE = /^#[0-9a-fA-F]{6}$/;
  /* style text -> { color, "background-color" }, or null when it holds anything else (then it is not ours) */
  function parseStyle(str) {
    const props = {};
    for (const part of str.split(";")) {
      if (!part.trim()) continue;
      const i = part.indexOf(":");
      if (i < 0) return null;
      const k = part.slice(0, i).trim().toLowerCase(), val = part.slice(i + 1).trim();
      if ((k !== "color" && k !== "background-color") || !val) return null;
      props[k] = val;
    }
    return props;
  }
  function spanOpen(p) {
    const st = [p.color && "color:" + p.color, p["background-color"] && "background-color:" + p["background-color"]].filter(Boolean).join(";");
    return st ? `<span style="${st}">` : "";
  }
  const SPAN_CLOSE = "</span>";

  /* One of our spans exactly around v[a,b): markers inside the selection, or right around it
     (also through **, *, ~~, <u>, <mark>, <sup>, <sub> that sit between the span and the text). */
  function findSpan(v, a, b) {
    const t = v.slice(a, b);
    const m = /^<span style="([^"]*)">/.exec(t);
    if (m && t.endsWith(SPAN_CLOSE) && t.length >= m[0].length + SPAN_CLOSE.length) {
      const inner = t.slice(m[0].length, t.length - SPAN_CLOSE.length);
      const props = parseStyle(m[1]);
      if (props && !/<\/?span\b/i.test(inner)) return { os: a, oe: a + m[0].length, cs: b - SPAN_CLOSE.length, ce: b, props, inside: true };
    }
    let x = a, y = b;
    for (let i = 0; i < 8; i++) {
      const mm = /<span style="([^"]*)">$/.exec(v.slice(Math.max(0, x - 300), x));
      if (mm && v.startsWith(SPAN_CLOSE, y)) {
        const props = parseStyle(mm[1]);
        if (props) return { os: x - mm[0].length, oe: x, cs: y, ce: y + SPAN_CLOSE.length, props, inside: false };
      }
      let hit = false;
      for (const k of ["bold", "strike", "underline", "highlight", "sup", "sub", "italic"]) {
        const [o, c] = INLINE[k];
        if (x >= o.length && v.slice(x - o.length, x) === o && v.startsWith(c, y)) { x -= o.length; y += c.length; hit = true; break; }
      }
      if (!hit) break;
    }
    return null;
  }

  function setColor(ta, kind, hex) {
    if (!ta || ta.readOnly || ta.disabled) return false;
    if (kind !== "color" && kind !== "background") return false;
    if (hex !== null && !(typeof hex === "string" && HEX_RE.test(hex))) return false;
    const prop = kind === "color" ? "color" : "background-color";
    const v = ta.value;
    const segs = segments(v, ta.selectionStart, ta.selectionEnd);
    if (!segs.length) return false;
    const parts = [];
    let changed = false;
    for (const g of segs) {
      const sp = findSpan(v, g.a, g.b);
      if (sp) {
        const props = Object.assign({}, sp.props);
        if (hex === null) delete props[prop]; else props[prop] = hex;
        const open = spanOpen(props);
        const inner = v.slice(sp.oe, sp.cs);
        const out = open ? open + inner + SPAN_CLOSE : inner;
        if (out !== v.slice(sp.os, sp.ce)) changed = true;
        parts.push({
          ra: sp.os, rb: sp.ce, out,
          off: sp.inside ? open.length : open.length + (g.a - sp.oe),
          len: sp.inside ? inner.length : g.b - g.a,
        });
      } else if (hex === null) {
        parts.push({ ra: g.a, rb: g.b, out: v.slice(g.a, g.b), off: 0, len: g.b - g.a });
      } else {
        const open = `<span style="${prop}:${hex}">`;
        parts.push({ ra: g.a, rb: g.b, out: open + v.slice(g.a, g.b) + SPAN_CLOSE, off: open.length, len: g.b - g.a });
        changed = true;
      }
    }
    if (!changed) return false;
    for (let k = 1; k < parts.length; k++) if (parts[k].ra < parts[k - 1].rb) return false;
    const r0 = parts[0].ra, r1 = parts[parts.length - 1].rb;
    let out = "", cur = r0, selS = 0, selE = 0;
    parts.forEach((p, k) => {
      out += v.slice(cur, p.ra);
      const at = r0 + out.length;
      out += p.out;
      cur = p.rb;
      if (k === 0) selS = at + p.off;
      if (k === parts.length - 1) selE = at + p.off + p.len;
    });
    replace(ta, r0, r1, out);
    ta.setSelectionRange(selS, selE);
    return true;
  }

  /* ---------- alignment of the paragraph / heading at the caret ---------- */
  const ALIGNS = ["left", "center", "right", "justify"];
  const INLINE_TAG_START = /^<(?:u|mark|sup|sub|span|a|b|i|em|strong|code|kbd|s|del|ins|small|abbr|br|img)[\s>/]/i;

  /* what is at the caret? -> { ps, pe, kind: "wrapped"|"heading"|"para", ... } or null (not offered) */
  function alignInfo(v, s, e) {
    const ls = lineStart(v, s), le = lineEnd(v, s);
    if (/^\s*$/.test(v.slice(ls, le))) return null;
    let ps = ls;
    while (ps > 1) {
      const p2 = lineStart(v, ps - 1);
      if (/^\s*$/.test(v.slice(p2, ps - 1))) break;
      ps = p2;
    }
    let pe = le;
    while (pe < v.length) {
      const nl = lineEnd(v, pe + 1);
      if (/^\s*$/.test(v.slice(pe + 1, nl))) break;
      pe = nl;
    }
    if (e > pe) return null; // the selection spans several paragraphs
    const text = v.slice(ps, pe);

    const wm = /^<(p|h[1-6])\s+align="(left|center|right|justify)"\s*>([\s\S]*)<\/\1>\s*$/i.exec(text);
    if (wm) {
      if (new RegExp("</?" + wm[1] + "[\\s>]", "i").test(wm[3])) return null;
      return { ps, pe, kind: "wrapped", tag: wm[1].toLowerCase(), align: wm[2].toLowerCase(), inner: wm[3] };
    }
    const lines = text.split("\n");
    const first = lines[0].trim();
    if (/^( {4}|\t)/.test(lines[0])) return null; // indented code
    if (/^<\/?[a-zA-Z!]/.test(first) && !INLINE_TAG_START.test(first)) return null; // raw HTML block
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (/^\s*(?:[-*+]|\d+[.)])(?:\s|$)/.test(L) || /^\s*>/.test(L) || /^\s*(?:`{3,}|~{3,})/.test(L)) return null; // list, quote, fence
      if (/^\s*\$\$/.test(L) || /^\s{0,3}\[[^\]]+\]:\s/.test(L)) return null; // math block, reference definition
      if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(L)) return null; // horizontal rule
      if (i > 0 && /^\s{0,3}(?:=+|-+)\s*$/.test(L)) return null; // setext heading
    }
    if (text.includes("|") && lines.some((L, i) => i > 0 && /^[\s|:-]+$/.test(L) && L.includes("-") && L.includes("|"))) return null; // table
    if (lines.length === 1) {
      const hm = /^\s{0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(lines[0]);
      if (hm) return { ps, pe, kind: "heading", level: hm[1].length, md: hm[2] };
    }
    if (/^\s{0,3}#{1,6}(?:\s|$)/.test(lines[0])) return null; // heading followed by more lines, or an empty heading
    return { ps, pe, kind: "para", md: lines.map((l) => l.replace(/^\s+/, "")).join("\n").replace(/\s+$/, "") };
  }

  function canAlign(ta) {
    if (!ta || ta.readOnly || ta.disabled) return false;
    return !!alignInfo(ta.value, ta.selectionStart, ta.selectionEnd);
  }

  function inlineHtml(md) {
    try {
      if (!global.marked || typeof global.marked.parseInline !== "function") return null;
      const h = global.marked.parseInline(md);
      return typeof h === "string" ? h.trim() : null;
    } catch (_) { return null; }
  }

  function setAlign(ta, dir) {
    if (!ta || ta.readOnly || ta.disabled || !ALIGNS.includes(dir)) return false;
    const info = alignInfo(ta.value, ta.selectionStart, ta.selectionEnd);
    if (!info) return false;
    let out, selA, selB;
    if (info.kind === "wrapped") {
      if (dir === info.align && dir !== "left") return true; // already like that
      if (dir === "left") { // drop the wrapper; the inner HTML renders the same
        if (info.tag === "p") { out = info.inner.trim(); selA = 0; selB = out.length; }
        else {
          const pre = "#".repeat(+info.tag[1]) + " "; // a heading stays a heading
          out = pre + info.inner.trim().replace(/\s*\n\s*/g, " ");
          selA = pre.length; selB = out.length;
        }
      } else {
        const open = `<${info.tag} align="${dir}">`;
        out = open + info.inner + `</${info.tag}>`;
        selA = open.length; selB = open.length + info.inner.length;
      }
    } else {
      if (dir === "left") return true; // nothing to remove
      const html = inlineHtml(info.md);
      if (html === null || /\n[ \t]*\n/.test(html)) return false;
      const tag = info.kind === "heading" ? "h" + info.level : "p";
      const open = `<${tag} align="${dir}">`;
      out = open + html + `</${tag}>`;
      selA = open.length; selB = open.length + html.length;
    }
    replace(ta, info.ps, info.pe, out);
    ta.setSelectionRange(info.ps + selA, info.ps + selB); // the content inside the element stays selected
    return true;
  }

  /* ---------- clear formatting ---------- */
  function stripFormat(t) {
    for (let i = 0; i < 4; i++) {
      const prev = t;
      t = t
        .replace(/<\/?(?:u|mark|sup|sub)>/gi, "")
        .replace(/<span style="([^"]*)">([\s\S]*?)<\/span>/gi, (m, st, inner) => (parseStyle(st) ? inner : m))
        .replace(/(!?)\[([^\]\n]*)\]\([^)\n]*\)/g, (m, bang, txt) => (bang ? m : txt))
        .replace(/(\*{1,3})(?=\S)([\s\S]*?\S)\1(?!\*)/g, "$2")
        .replace(/~~([\s\S]*?)~~/g, "$1")
        .replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (m, f, c) => (/^ [\s\S]*[^ ][\s\S]* $/.test(c) ? c.slice(1, -1) : c));
      if (t === prev) break;
    }
    return t;
  }

  function clearFormat(ta) {
    if (!ta || ta.readOnly || ta.disabled) return false;
    const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    let a = s, b = e;
    if (s === e) {
      const w = wordAt(v, s);
      if (!w) return false;
      a = w[0]; b = w[1];
    } else {
      while (a < b && /\s/.test(v[a])) a++;
      while (b > a && /\s/.test(v[b - 1])) b--;
      if (a >= b) return false;
    }
    // widen over wrappers that sit exactly around the text
    const PAIRS = [["**", "**"], ["~~", "~~"], ["<u>", "</u>"], ["<mark>", "</mark>"], ["<sup>", "</sup>"], ["<sub>", "</sub>"], ["*", "*"], ["`", "`"]];
    let x = a, y = b;
    for (let i = 0; i < 12; i++) {
      let hit = false;
      const sm = /<span style="([^"]*)">$/.exec(v.slice(Math.max(0, x - 300), x));
      if (sm && v.startsWith(SPAN_CLOSE, y) && parseStyle(sm[1])) { x -= sm[0].length; y += SPAN_CLOSE.length; hit = true; }
      if (!hit && v[x - 1] === "[" && v[x - 2] !== "!") {
        const lm = /^\]\([^)\n]*\)/.exec(v.slice(y, y + 2000));
        if (lm) { x -= 1; y += lm[0].length; hit = true; }
      }
      if (!hit) {
        for (const [o, c] of PAIRS) {
          if (x < o.length || v.slice(x - o.length, x) !== o || !v.startsWith(c, y)) continue;
          if (o.length === 1 && (v[x - 2] === o || v[y + 1] === o)) continue; // part of a longer run
          x -= o.length; y += c.length; hit = true; break;
        }
      }
      if (!hit) break;
    }
    const inner = v.slice(a, b);
    const cleaned = stripFormat(inner);
    if (cleaned === inner && x === a && y === b) return false;
    replace(ta, x, y, cleaned);
    ta.setSelectionRange(x, x + cleaned.length);
    return true;
  }

  /* ---------- public API ---------- */
  function apply(ta, name) {
    if (!ta || ta.readOnly || ta.disabled) return false;
    if (name === "clear") return clearFormat(ta);
    const al = /^align-(left|center|right|justify)$/.exec(name);
    if (al) return setAlign(ta, al[1]);
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

  global.NotesFormat = { apply, handleKey, SHORTCUTS, isActive, setColor, setAlign, canAlign, clearFormat, replace };
})(window);
