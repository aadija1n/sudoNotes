/* Phase 3: markdown rendering. GitHub-flavored markdown via marked, sanitized with
   DOMPurify, code highlighted with highlight.js, diagrams by Mermaid (loaded only
   when a note actually contains one). */

(function (global) {
  const MERMAID_URL = "lib/mermaid.min.js"; // bundled, loaded only when a note has a diagram
  let ready = false;
  let mermaidPromise = null;
  let mermaidCount = 0;

  function init() {
    if (ready) return;
    if (!global.marked || !global.DOMPurify) {
      const e = new Error("The rendering libraries could not be loaded. Check your internet connection and reload.");
      e.code = "libs";
      throw e;
    }
    const footnote = typeof global.markedFootnote === "function" ? global.markedFootnote : global.markedFootnote && global.markedFootnote.default;
    if (footnote) global.marked.use(footnote());
    global.marked.setOptions({ gfm: true });
    ready = true;
  }

  function loadMermaid() {
    if (global.mermaid) return Promise.resolve(global.mermaid);
    if (!mermaidPromise) {
      mermaidPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = MERMAID_URL;
        s.onload = () => {
          global.mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict", fontFamily: "Inter, system-ui, sans-serif" });
          resolve(global.mermaid);
        };
        s.onerror = () => { mermaidPromise = null; reject(new Error("Mermaid could not be loaded.")); };
        document.head.appendChild(s);
      });
    }
    return mermaidPromise;
  }

  const slugify = (t) => t.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-") || "section";

  function addHeadingIds(el) {
    const used = new Set();
    const heads = [...el.querySelectorAll("h1, h2, h3, h4")];
    heads.forEach((h) => {
      let id = slugify(h.textContent);
      let n = 2;
      const base = id;
      while (used.has(id)) id = `${base}-${n++}`;
      used.add(id);
      h.id = id;
    });
    return heads;
  }

  function buildToc(heads) {
    const items = heads.filter((h) => h.tagName === "H2" || h.tagName === "H3");
    if (items.length < 4) return null;
    const toc = document.createElement("details");
    toc.className = "toc";
    const summary = document.createElement("summary");
    summary.textContent = "On this page";
    const ul = document.createElement("ul");
    items.forEach((h) => {
      const li = document.createElement("li");
      if (h.tagName === "H3") li.className = "sub";
      const a = document.createElement("a");
      a.href = `#${h.id}`;
      a.textContent = h.textContent;
      li.appendChild(a);
      ul.appendChild(li);
    });
    toc.append(summary, ul);
    return toc;
  }

  function resolveSrc(src, dir) {
    if (!src || /^([a-z]+:|\/\/|\/|#|data:)/i.test(src)) return src;
    const path = `${dir}/${src}`.split("/").map((seg, i) => (i === 0 ? seg : encodeURI(decodeURI(seg)))).join("/");
    // Phase 5R: notes no longer sit next to the page, so images load from the notes repository
    const abs = global.NotesData && global.NotesData.assetUrl ? global.NotesData.assetUrl(path) : null;
    return abs || path;
  }

  async function renderMermaid(box, code) {
    try {
      const mermaid = await loadMermaid();
      const id = `mmd-${++mermaidCount}`;
      const { svg } = await mermaid.render(id, code);
      box.innerHTML = svg;
      box.classList.add("done");
    } catch (err) {
      const stray = document.getElementById(`dmmd-${mermaidCount}`);
      if (stray) stray.remove();
      box.classList.add("error");
      box.textContent = "";
      const msg = document.createElement("div");
      msg.className = "mermaid-error";
      msg.textContent = "This diagram could not be drawn. Check its syntax.";
      const pre = document.createElement("pre");
      pre.textContent = code;
      box.append(msg, pre);
    }
  }

  function enhanceCode(el) {
    el.querySelectorAll("pre > code").forEach((code) => {
      const pre = code.parentElement;
      const lang = ((code.className.match(/language-([\w+-]+)/) || [])[1] || "").toLowerCase();

      if (lang === "mermaid") {
        const box = document.createElement("div");
        box.className = "mermaid-box";
        box.textContent = "Drawing diagram…";
        pre.replaceWith(box);
        renderMermaid(box, code.textContent);
        return;
      }

      if (lang && global.hljs && global.hljs.getLanguage(lang)) global.hljs.highlightElement(code);
      if (lang) pre.dataset.lang = lang;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy-btn";
      btn.textContent = "Copy";
      btn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(code.textContent);
          btn.textContent = "Copied";
        } catch {
          btn.textContent = "Press Ctrl+C";
        }
        setTimeout(() => { btn.textContent = "Copy"; }, 1500);
      });
      pre.appendChild(btn);
    });
  }

  /* Turns markdown text into a ready-to-insert element. `dir` is the repo folder
     of the note, used to resolve relative image paths. */
  function toElement(markdown, dir) {
    init();
    const html = global.DOMPurify.sanitize(global.marked.parse(markdown || ""), { ADD_ATTR: ["target"] });
    const el = document.createElement("div");
    el.className = "md";
    el.innerHTML = html;

    const heads = addHeadingIds(el);
    const toc = buildToc(heads);
    if (toc) el.prepend(toc);

    el.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href");
      if (/^https?:/i.test(href)) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    });
    el.querySelectorAll("img").forEach((img) => {
      img.loading = "lazy";
      img.setAttribute("src", resolveSrc(img.getAttribute("src"), dir));
    });

    enhanceCode(el);
    return el;
  }

  global.NotesRender = { toElement };
})(window);
