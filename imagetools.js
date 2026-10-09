/* Phase 12: Image insertion dialog and live size/alignment tools in write mode.
   window.NotesImage */

(function (global) {
  function openImageDialog(target) {
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.id = "img-modal";
    wrap.innerHTML = `
      <form class="modal" role="dialog" aria-modal="true" aria-labelledby="img-title" autocomplete="off">
        <h2 id="img-title">Insert Image</h2>
        <label class="field"><span>Image URL or file path</span>
          <input name="url" placeholder="https://… or image.png" spellcheck="false" required /></label>
        <label class="field"><span>Alt text / caption (optional)</span>
          <input name="alt" placeholder="Description of image" spellcheck="false" /></label>
        <label class="field"><span>Alignment</span>
          <select name="align" style="width:100%;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font:inherit;">
            <option value="center">Center</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </label>
        <p class="form-error" role="alert"></p>
        <div class="modal-actions">
          <button type="button" class="btn" id="img-cancel">Cancel</button>
          <button type="submit" class="btn primary">Insert Image</button>
        </div>
      </form>
    `;

    const form = wrap.querySelector("form");
    wrap.querySelector("#img-cancel").addEventListener("click", () => wrap.remove());
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const url = form.elements.url.value.trim();
      if (!url) return;
      const alt = form.elements.alt.value.trim();
      const align = form.elements.align.value;

      let tag;
      if (align === "center") {
        tag = `<p align="center"><img src="${url}" alt="${alt}" style="max-width:100%;border-radius:8px;" /></p>`;
      } else {
        tag = `<img src="${url}" alt="${alt}" align="${align}" style="max-width:100%;border-radius:8px;" />`;
      }

      wrap.remove();
      if (global.NotesInsert) {
        global.NotesInsert.put(tag, {}, target);
      }
    });

    document.body.appendChild(wrap);
    form.elements.url.focus();
  }

  /* Live image controls (+ / - / align) on rendered images in write mode */
  function decorateImages(root) {
    if (!document.body.classList.contains("write")) return;
    const imgs = root.querySelectorAll(".md img:not([data-img-ctrl])");
    imgs.forEach((img) => {
      img.dataset.imgCtrl = "1";
      const bar = document.createElement("div");
      bar.className = "img-ctrl-bar w-only";
      bar.innerHTML = `
        <button type="button" class="img-btn" data-act="zoom-out" title="Decrease size">−</button>
        <button type="button" class="img-btn" data-act="zoom-in" title="Increase size">+</button>
        <button type="button" class="img-btn" data-act="align-left" title="Align Left">Left</button>
        <button type="button" class="img-btn" data-act="align-center" title="Align Center">Center</button>
        <button type="button" class="img-btn" data-act="align-right" title="Align Right">Right</button>
      `;

      bar.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        const currentWidth = img.style.width ? parseInt(img.style.width, 10) : 100;

        if (act === "zoom-in") {
          img.style.width = `${Math.min(100, currentWidth + 10)}%`;
        } else if (act === "zoom-out") {
          img.style.width = `${Math.max(20, currentWidth - 10)}%`;
        } else if (act === "align-left") {
          img.style.display = "inline";
          img.style.margin = "0 1em 1em 0";
          img.style.float = "left";
        } else if (act === "align-center") {
          img.style.display = "block";
          img.style.margin = "1em auto";
          img.style.float = "none";
        } else if (act === "align-right") {
          img.style.display = "inline";
          img.style.margin = "0 0 1em 1em";
          img.style.float = "right";
        }
      });

      if (img.parentNode) {
        img.parentNode.insertBefore(bar, img.nextSibling);
      }
    });
  }

  function init() {
    if (global.NotesInsert) {
      global.NotesInsert.register({
        id: "image",
        label: "Image…",
        hint: "<img />",
        group: "Blocks",
        keywords: ["image", "picture", "photo", "img"],
        run: (t) => openImageDialog(t),
      });
    }

    // Decorate on render
    const origToElement = global.NotesRender ? global.NotesRender.toElement : null;
    if (origToElement) {
      global.NotesRender.toElement = function (md, dir) {
        const el = origToElement(md, dir);
        decorateImages(el);
        return el;
      };
    }
  }

  if (document.readyState === "complete") init();
  else document.addEventListener("DOMContentLoaded", init);

  global.NotesImage = {
    openDialog: openImageDialog,
    decorateImages,
  };
})(window);
