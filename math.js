/* Phase 10B: math (window.NotesMath).
   Stored GitHub-style: inline $x^2$, display $$ ... $$, and ```math fences; chemistry via mhchem (\ce{H2O}).
   1) At load time (before render.js) two marked extensions are registered, so the lexer used by the block editor
      and the parser both know them. They output sanitizer-safe placeholders holding the TeX as escaped text:
        <span class="math math-inline">TEX</span>   <div class="math math-display">TEX</div>
   2) After DOMPurify, NotesMath.render(root) turns the placeholders into KaTeX output (KaTeX is loaded lazily from
      lib/katex/, like Mermaid). A broken formula shows its TeX in a small error box and never throws. */

(function (global) {
  const KATEX_JS = "lib/katex/katex.min.js";
  const MHCHEM_JS = "lib/katex/mhchem.min.js";

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /* ================= marked extensions ================= */
  let registered = false;

  /* Display block: `$$` at a line start (up to 3 spaces), content over any number of lines (blank lines allowed),
     closed by the first following `$$`, which must end its line. Returns { raw, text } or null. */
  function matchBlock(src) {
    const open = /^ {0,3}\$\$/.exec(src);
    if (!open) return null;
    const from = open[0].length;
    let j = from;
    for (;;) {
      const k = src.indexOf("$$", j);
      if (k === -1) return null; // never closed: not math, nothing is swallowed
      let bs = 0;
      for (let q = k - 1; q >= from && src[q] === "\\"; q--) bs++;
      if (bs % 2 === 1) { j = k + 1; continue; } // \$ is a literal dollar
      const tail = /[ \t]*(?:\n|$)/y;
      tail.lastIndex = k + 2;
      const m = tail.exec(src);
      if (!m) return null; // the first closing `$$` is followed by text: this is inline display math, not a block
      const end = k + 2 + m[0].replace(/\n$/, "").length;
      return { raw: src.slice(0, end), text: src.slice(from, k) };
    }
  }

  function register() {
    if (registered) return;
    if (!global.marked || typeof global.marked.use !== "function") {
      if (document.readyState !== "complete" && !register.retry) {
        register.retry = true;
        document.addEventListener("DOMContentLoaded", register, { once: true });
      }
      return;
    }
    registered = true;
    global.marked.use({
      extensions: [
        {
          name: "mathBlock",
          level: "block",
          start(src) { // where a block could begin: lets it interrupt a paragraph, only when it really is a block
            const re = /(^|\n) {0,3}\$\$/g;
            let m;
            while ((m = re.exec(src))) {
              const at = m.index + m[1].length;
              if (matchBlock(src.slice(at))) return at;
            }
            return undefined;
          },
          tokenizer(src) {
            const m = matchBlock(src);
            if (m) return { type: "mathBlock", raw: m.raw, text: m.text.trim() };
            return undefined;
          },
          renderer(token) { return `<div class="math math-display">${esc(token.text)}</div>\n`; },
        },
        {
          name: "mathInline",
          level: "inline",
          start(src) {
            let i = src.indexOf("$");
            while (i !== -1) {
              let bs = 0;
              for (let k = i - 1; k >= 0 && src[k] === "\\"; k--) bs++;
              if (bs % 2 === 0) return i;
              i = src.indexOf("$", i + 1);
            }
            return undefined;
          },
          tokenizer(src) {
            if (src.charCodeAt(0) !== 36) return undefined; // "$"
            if (src[1] === "$") { // $$ ... $$ inside a paragraph: display math in place
              const m = /^\$\$([\s\S]+?)\$\$/.exec(src);
              if (m && m[1].trim() && !/\n[ \t]*\n/.test(m[1])) return { type: "mathInline", raw: m[0], text: m[1].trim(), display: true };
              return { type: "mathText", raw: "$$", text: "$$" }; // not closed: keep both dollars as text
            }
            if (src.length < 3 || /\s/.test(src[1])) return undefined; // "$ " cannot open
            let i = 1;
            while (i < src.length) {
              const ch = src[i];
              if (ch === "\\") { i += 2; continue; }
              if (ch === "`") return undefined; // never reach into a code span
              if (ch === "$") break;
              i++;
            }
            if (i >= src.length || src[i] !== "$") return undefined; // no closing dollar
            if (/\s/.test(src[i - 1])) return undefined; // closing `$` must follow a non-space ("$5 and $10")
            if (/\d/.test(src[i + 1] || "")) return undefined; // and must not be followed by a digit ("$5$10")
            return { type: "mathInline", raw: src.slice(0, i + 1), text: src.slice(1, i), display: false };
          },
          renderer(token) {
            return `<span class="math ${token.display ? "math-display" : "math-inline"}">${esc(token.text)}</span>`;
          },
        },
        {
          name: "mathText", // a literal "$$" that opened nothing
          level: "inline",
          renderer(token) { return esc(token.text); },
        },
      ],
    });
  }
  register();

  /* ================= loading KaTeX ================= */
  let loadPromise = null;
  let ready = false;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => { s.remove(); reject(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
  }

  function loadKatex() {
    if (ready && global.katex) return Promise.resolve(global.katex);
    if (!loadPromise) {
      loadPromise = (global.katex ? Promise.resolve() : loadScript(KATEX_JS))
        .then(() => {
          if (!global.katex) throw new Error("KaTeX is missing.");
          return loadScript(MHCHEM_JS).catch(() => { /* chemistry is optional: \ce then reports its own error */ });
        })
        .then(() => { ready = true; return global.katex; })
        .catch((err) => { loadPromise = null; throw err; }); // a later render() retries
    }
    return loadPromise;
  }

  /* ================= rendering ================= */
  const OPTS = { throwOnError: true, strict: "ignore", trust: false, maxExpand: 1000, maxSize: 50, output: "htmlAndMathml" };

  function shortMsg(err) {
    let m = String((err && err.message) || err || "Invalid formula");
    m = m.replace(/^KaTeX parse error:\s*/i, "").replace(/[̲̳]/g, "").split("\n")[0].replace(/\s+/g, " ").trim();
    if (m.length > 100) m = m.slice(0, 99).trimEnd() + "…";
    return m || "Invalid formula";
  }

  function texOf(el) {
    if (el.dataset.tex == null) el.dataset.tex = el.textContent;
    return el.dataset.tex;
  }

  function showError(el, tex, err) {
    el.classList.remove("math-pending");
    el.classList.add("math-error");
    el.textContent = "";
    const code = document.createElement("code");
    code.className = "math-src";
    code.textContent = tex;
    const msg = document.createElement("span");
    msg.className = "math-msg";
    msg.textContent = shortMsg(err);
    el.append(code, msg);
    el.dataset.done = "1";
  }

  function renderOne(el) {
    if (el.dataset.done) return;
    const tex = texOf(el);
    const display = el.classList.contains("math-display");
    if (!tex.trim()) { // empty formula: show the source dimmed, never nothing
      el.classList.add("math-pending", "math-empty");
      el.textContent = display ? "$$ $$" : "$ $";
      el.dataset.done = "1";
      return;
    }
    try {
      global.katex.render(tex, el, Object.assign({ displayMode: display }, OPTS));
      el.classList.remove("math-pending", "math-failed");
      el.dataset.done = "1";
    } catch (err) {
      try { showError(el, tex, err); } catch (_) { /* never let one formula stop the others */ }
    }
  }

  function markPending(el) {
    if (el.dataset.done) return;
    texOf(el);
    el.classList.add("math-pending");
  }

  function markFailed(el) { // the library could not be loaded: keep the raw TeX, add a small note, allow a retry
    if (el.dataset.done) return;
    el.classList.add("math-pending", "math-failed");
    el.title = "Math could not be shown: lib/katex/ is missing or failed to load";
  }

  function render(root) {
    if (!root || !root.querySelectorAll) return;
    const els = [...root.querySelectorAll(".math:not([data-done])")];
    if (!els.length) return;
    if (ready && global.katex) { els.forEach(renderOne); return; } // synchronous once loaded
    els.forEach(markPending);
    loadKatex().then(() => els.forEach(renderOne)).catch(() => els.forEach(markFailed));
  }

  /* ```math fence: the <pre> becomes a display placeholder (render() picks it up right after) */
  function fence(pre, code) {
    const box = document.createElement("div");
    box.className = "math math-display";
    box.textContent = code.textContent.replace(/\n+$/, "");
    pre.replaceWith(box);
    return box;
  }

  global.NotesMath = { render, fence, register, ready: () => loadKatex().then(() => true).catch(() => false) };
})(window);
