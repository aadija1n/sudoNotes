/* Phase 9F: smart typing (window.NotesSmart).
   Lists, quotes, code fences, Tab, auto-pair, block navigation and smart paste on a <textarea>.
   ctx (optional, from blocks.js): { nav(dir) -> bool, newBlockBelow() }. Without ctx only the text rules work. */

(function (global) {
  /* ---------- editing (keeps native undo, fires `input` once) ---------- */
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
      if (ta.value !== expected) ta.value = expected;
      if (n === 0 && ta.value !== before) ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  const lineStart = (v, p) => v.lastIndexOf("\n", p - 1) + 1;
  const lineEnd = (v, p) => { const i = v.indexOf("\n", p); return i === -1 ? v.length : i; };

  const LIST = /^(\s*)([-*+]|\d+[.)])([ \t]+)(\[[ xX]\][ \t]+)?/;
  const QUOTE = /^(\s*(?:>[ \t]?)+)/;
  const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})(.*)$/;
  const FENCE_CLOSE = /^\s*(`{3,}|~{3,})\s*$/;
  const URL_RE = /^(?:https?:\/\/|mailto:)\S+$/i;

  /* Which fence (if any) is open after the text v.slice(0, upto)? */
  function fenceAfter(v, upto) {
    let st = null;
    for (const line of v.slice(0, upto).split("\n")) {
      if (st) {
        const c = FENCE_CLOSE.exec(line);
        if (c && c[1][0] === st.ch && c[1].length >= st.len) st = null;
      } else {
        const o = FENCE_OPEN.exec(line);
        if (o && !(o[2][0] === "`" && o[3].includes("`"))) st = { ch: o[2][0], len: o[2].length };
      }
    }
    return st;
  }
  const inFenceAt = (v, p) => !!fenceAfter(v, lineEnd(v, p));

  /* ---------- 1, 2, 3: Enter ---------- */
  function finishBlock(ta, keepUpTo, ctx) { // trims trailing blank lines (from keepUpTo on) and opens the next block
    const v = ta.value;
    const kept = v.slice(0, keepUpTo).replace(/\s+$/, "");
    if (kept.length < v.length) replace(ta, kept.length, v.length, "");
    ctx.newBlockBelow();
  }

  function enter(ta, ctx) {
    const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    const ls = lineStart(v, s), le = lineEnd(v, s);
    const line = v.slice(ls, le);
    const fence = fenceAfter(v, le);

    if (s === e) {
      // 3a: a fresh ```lang line with no closing fence anywhere: add the closing one
      const o = FENCE_OPEN.exec(line);
      if (o && s === le && !(o[2][0] === "`" && o[3].includes("`")) &&
          fenceAfter(v, ls > 0 ? ls - 1 : 0) === null && fenceAfter(v, v.length) !== null) {
        const ind = o[1];
        replace(ta, s, s, "\n" + ind + "\n" + ind + o[2]);
        const p = s + 1 + ind.length;
        ta.setSelectionRange(p, p);
        return true;
      }
    }
    if (fence) { // 3b: inside an open fence: plain newline that keeps the indent
      const lead = /^[ \t]*/.exec(line)[0].slice(0, Math.max(0, s - ls));
      replace(ta, s, e, "\n" + lead);
      const p = s + 1 + lead.length;
      ta.setSelectionRange(p, p);
      return true;
    }
    if (s !== e) return false;

    const lm = LIST.exec(line);
    const qm = lm ? null : QUOTE.exec(line);
    const m = lm || qm;
    if (m && s >= ls + m[0].length) {
      const rest = line.slice(m[0].length);
      const empty = rest.trim() === "" && s === le;
      if (empty) {
        if (lm) {
          const numbered = /^\d/.test(lm[2]);
          const removed = Math.min(lm[1].length, numbered ? 3 : 2);
          if (removed > 0) { // nested item: one level out
            replace(ta, ls, ls + removed, "");
            const p = s - removed;
            ta.setSelectionRange(p, p);
            return true;
          }
        } else if ((qm[1].match(/>/g) || []).length > 1) { // nested quote: one level out
          const np = qm[1].replace(/>[ \t]?$/, "");
          replace(ta, ls + np.length, ls + qm[1].length, "");
          const p = ls + np.length;
          ta.setSelectionRange(p, p);
          return true;
        }
        if (ctx && le === v.length) { // end of the list at the end of the block: next block
          replace(ta, ls, v.length, "");
          finishBlock(ta, ls, ctx);
          return true;
        }
        replace(ta, ls, le, "");
        ta.setSelectionRange(ls, ls);
        return true;
      }
      let prefix;
      if (lm) {
        const num = /^(\d+)([.)])$/.exec(lm[2]);
        const marker = num ? `${parseInt(num[1], 10) + 1}${num[2]}` : lm[2];
        prefix = lm[1] + marker + lm[3] + (lm[4] ? "[ ] " : "");
      } else prefix = qm[1].replace(/>$/, "> ").replace(/[ \t]+$/, " ");
      replace(ta, s, s, "\n" + prefix);
      const p = s + 1 + prefix.length;
      ta.setSelectionRange(p, p);
      return true;
    }

    // 2: empty last line after some text: start the next block
    if (ctx && s === v.length && line.trim() === "" && v.slice(0, ls).trim() !== "") {
      finishBlock(ta, ls, ctx);
      return true;
    }
    return false;
  }

  /* ---------- 4: Tab / Shift+Tab ---------- */
  function tab(ta, shift) {
    const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    const fence = inFenceAt(v, s);
    if (fence && !shift && s === e) { replace(ta, s, s, "  "); ta.setSelectionRange(s + 2, s + 2); return true; }
    const ls0 = lineStart(v, s);
    const endPos = e > s && v[e - 1] === "\n" ? e - 1 : e;
    const le0 = lineEnd(v, endPos);
    const lines = v.slice(ls0, le0).split("\n");
    const deltas = [];
    let any = false;
    const out = lines.map((line) => {
      let st = 0;
      if (fence) st = 2;
      else { const m = LIST.exec(line); if (m) st = /^\d/.test(m[2]) ? 3 : 2; }
      if (!st) { deltas.push(0); return line; }
      if (!shift) {
        if (fence && line === "") { deltas.push(0); return line; }
        any = true; deltas.push(st);
        return " ".repeat(st) + line;
      }
      const lead = /^ */.exec(line)[0].length;
      let n = Math.min(st, lead);
      if (n === 0 && line[0] === "\t") n = 1;
      if (n > 0) any = true;
      deltas.push(-n);
      return line.slice(n);
    });
    if (!any) return false;
    replace(ta, ls0, le0, out.join("\n"));
    const sum = deltas.reduce((a, b) => a + b, 0);
    const ns = Math.max(ls0, s + deltas[0]);
    ta.setSelectionRange(ns, s === e ? ns : Math.max(ns, e + sum));
    return true;
  }

  /* ---------- 5: auto-pair ---------- */
  const PAIRS = { "(": ")", "[": "]", "{": "}", '"': '"', "`": "`" };
  const CLOSERS = new Set([")", "]", "}", '"', "`"]);
  const ALNUM = /[\p{L}\p{N}]/u;

  function autoPair(ta, k) {
    const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    const isOpen = Object.prototype.hasOwnProperty.call(PAIRS, k);
    if (!isOpen && !CLOSERS.has(k)) return false;
    if (inFenceAt(v, s)) return false;
    if (s === e && CLOSERS.has(k) && v[s] === k) { ta.setSelectionRange(s + 1, s + 1); return true; } // skip over
    if (!isOpen) return false;
    const close = PAIRS[k];
    if (s !== e) {
      replace(ta, s, e, k + v.slice(s, e) + close);
      ta.setSelectionRange(s + 1, e + 1);
      return true;
    }
    const next = v[s], prev = v[s - 1];
    if (!(next === undefined || /\s/.test(next) || ")]}\"'".includes(next))) return false;
    if (k === '"' || k === "`") {
      if (prev && ALNUM.test(prev)) return false;
      if (k === "`" && prev === "`") return false;
    }
    replace(ta, s, s, k + close);
    ta.setSelectionRange(s + 1, s + 1);
    return true;
  }

  function backspacePair(ta) {
    const v = ta.value, s = ta.selectionStart;
    if (s !== ta.selectionEnd || s === 0) return false;
    const a = v[s - 1], b = v[s];
    if (!Object.prototype.hasOwnProperty.call(PAIRS, a) || PAIRS[a] !== b) return false;
    if (inFenceAt(v, s)) return false;
    replace(ta, s - 1, s + 1, "");
    return true;
  }

  /* ---------- key entry point ---------- */
  let plainPasteAt = 0; // Ctrl/Cmd+Shift+V seen: the next paste stays plain

  function handleKey(e, ta, ctx) {
    if (!e || !ta) return false;
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key || "").toLowerCase() === "v") plainPasteAt = Date.now();
    if (e.isComposing || e.keyCode === 229) return false;
    if (ta.readOnly || ta.disabled) return false;
    if (e.altKey || e.ctrlKey || e.metaKey || (e.getModifierState && e.getModifierState("AltGraph"))) return false;
    const k = e.key;
    let done = false;
    if (k === "Enter") { if (!e.shiftKey) done = enter(ta, ctx); }
    else if (k === "Tab") done = tab(ta, e.shiftKey);
    else if (k === "ArrowUp" || k === "ArrowDown") {
      if (!e.shiftKey && ctx && ctx.nav && ta.selectionStart === ta.selectionEnd) {
        const p = ta.selectionStart;
        if (k === "ArrowUp" && p === 0) done = ctx.nav(-1) !== false;
        else if (k === "ArrowDown" && p === ta.value.length) done = ctx.nav(1) !== false;
      }
    } else if (k === "Backspace") { if (!e.shiftKey) done = backspacePair(ta); }
    else if (k && k.length === 1) done = autoPair(ta, k);
    if (done) e.preventDefault();
    return done;
  }

  /* ---------- 7: paste ---------- */
  const STRUCTURE = /<(strong|b|em|i|a|h[1-6]|ul|ol|li|pre|code)[\s>]/i;

  function htmlToMarkdown(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const SKIP = new Set(["SCRIPT", "STYLE", "HEAD", "META", "TITLE", "NOSCRIPT", "TEMPLATE", "IMG", "SVG", "VIDEO", "AUDIO", "IFRAME", "CANVAS"]);
    const BLOCK = new Set(["P", "DIV", "SECTION", "ARTICLE", "BLOCKQUOTE", "MAIN", "HEADER", "FOOTER", "FIGURE", "FIGCAPTION", "TABLE", "UL", "OL"]);
    const kids = (n) => Array.from(n.childNodes).map(conv).join("");
    const wrap = (inner, mark) => {
      const core = inner.trim();
      if (!core) return inner;
      return (/^\s/.test(inner) ? " " : "") + mark + core + mark + (/\s$/.test(inner) ? " " : "");
    };
    function list(n) {
      const ordered = n.tagName === "OL";
      let i = parseInt(n.getAttribute("start"), 10); if (!(i > 0)) i = 1;
      const items = [];
      for (const li of Array.from(n.children)) {
        if (li.tagName !== "LI") continue;
        const pre = ordered ? `${i++}. ` : "- ";
        let text = "", nested = "";
        for (const c of Array.from(li.childNodes)) {
          if (c.nodeType === 1 && (c.tagName === "UL" || c.tagName === "OL")) nested += "\n" + list(c);
          else text += conv(c);
        }
        let item = pre + text.trim().replace(/\s*\n\s*/g, " ");
        const nl = nested.trim();
        if (nl) item += "\n" + nl.split("\n").map((l) => " ".repeat(pre.length) + l).join("\n");
        items.push(item);
      }
      return items.join("\n");
    }
    function conv(n) {
      if (n.nodeType === 3) return n.nodeValue.replace(/\s+/g, " ");
      if (n.nodeType !== 1) return "";
      const t = n.tagName;
      if (SKIP.has(t)) return "";
      if (t === "STRONG" || (t === "B" && !/font-weight:\s*normal/i.test(n.getAttribute("style") || ""))) return wrap(kids(n), "**");
      if (t === "EM" || t === "I") return wrap(kids(n), "*");
      if (t === "BR") return "\n";
      if (t === "CODE") { const x = n.textContent; return x.trim() ? (x.includes("`") ? "`` " + x + " ``" : "`" + x + "`") : ""; }
      if (t === "PRE") {
        const x = n.textContent.replace(/\n+$/, "");
        const c = n.querySelector("code");
        const lang = ((c && c.className) || n.className || "").match(/(?:language|lang)-([\w+-]+)/);
        return x.trim() ? "\n\n```" + (lang ? lang[1] : "") + "\n" + x + "\n```\n\n" : "";
      }
      if (t === "A") {
        const href = (n.getAttribute("href") || "").trim();
        const text = kids(n);
        if (!/^(https?:|mailto:)/i.test(href) || !text.trim()) return text;
        return `[${text.trim()}](${href.replace(/ /g, "%20").replace(/\)/g, "%29")})`;
      }
      if (/^H[1-6]$/.test(t)) { const x = kids(n).trim().replace(/\s*\n\s*/g, " "); return x ? `\n\n${"#".repeat(+t[1])} ${x}\n\n` : ""; }
      if (t === "UL" || t === "OL") return "\n\n" + list(n) + "\n\n";
      if (t === "LI") return "\n\n- " + kids(n).trim() + "\n\n";
      if (t === "TR") return "\n" + kids(n);
      if (t === "TD" || t === "TH") return kids(n) + " ";
      if (BLOCK.has(t)) return "\n\n" + kids(n) + "\n\n";
      return kids(n);
    }
    return conv(doc.body)
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n").trim();
  }

  function handlePaste(e, ta) {
    if (!e || !ta || ta.readOnly || ta.disabled) return false;
    const cd = e.clipboardData;
    if (!cd) return false;
    const v = ta.value, s = ta.selectionStart, en = ta.selectionEnd;
    if (inFenceAt(v, s)) return false;
    const text = cd.getData("text/plain") || "";
    const trimmed = text.trim();
    if (URL_RE.test(trimmed)) {
      if (s === en && !v.slice(s, en).includes("\n")) return false; // bare URL: plain paste
      const sel = v.slice(s, en);
      if (sel.includes("\n") || !sel.trim()) return false;
      e.preventDefault();
      const out = `[${sel.replace(/[\[\]]/g, "\\$&")}](${trimmed})`;
      replace(ta, s, en, out);
      ta.setSelectionRange(s + out.length, s + out.length);
      return true;
    }
    if (Date.now() - plainPasteAt < 1500) return false; // Ctrl/Cmd+Shift+V: plain
    const html = cd.getData("text/html");
    if (!html || !STRUCTURE.test(html)) return false;
    let md = "";
    try { md = htmlToMarkdown(html); } catch (_) { return false; }
    if (!md) return false;
    if (md.replace(/\s+/g, " ") === trimmed.replace(/\s+/g, " ")) return false; // nothing gained
    e.preventDefault();
    replace(ta, s, en, md);
    ta.setSelectionRange(s + md.length, s + md.length);
    return true;
  }

  global.NotesSmart = { handleKey, handlePaste };
})(window);
