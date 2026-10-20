/* Phase 12: Image insertion dialog and live size/alignment tools in write mode.
   window.NotesImage */

(function (global) {
  async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = reader.result;
        const base64 = typeof res === "string" ? res.split(",")[1] || "" : "";
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function sanitizeFilename(name) {
    const clean = name.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
    return clean || "image.png";
  }

  async function openImageDialog(target) {
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.id = "img-modal";

    const preferredFolder = global.NotesData && global.NotesData.getPreferredAssetFolder ? global.NotesData.getPreferredAssetFolder() : ".assets";

    wrap.innerHTML = `
      <div class="modal wide" role="dialog" aria-modal="true" aria-labelledby="img-title" style="max-width:760px;width:95vw;max-height:88vh;display:flex;flex-direction:column;padding:0;overflow:hidden;background:#101016;border:1px solid rgba(255,255,255,0.2);border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,0.85);">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:#161622;border-bottom:1px solid rgba(255,255,255,0.1);">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:18px;">🖼️</span>
            <div>
              <h2 id="img-title" style="margin:0;font-size:16px;font-weight:650;letter-spacing:-0.01em;">Insert Image & Asset Manager</h2>
              <p style="margin:0;font-size:11.5px;color:var(--text-muted);">Manage note media in hidden <code>${preferredFolder}/</code> folder or use web images</p>
            </div>
          </div>
          <button type="button" class="btn" id="img-close-x" style="padding:4px 10px;font-size:14px;">✕</button>
        </div>

        <!-- Mode Tabs -->
        <div style="display:flex;gap:4px;padding:8px 18px;background:#14141c;border-bottom:1px solid rgba(255,255,255,0.1);">
          <button type="button" class="btn primary" id="img-tab-gallery" style="font-size:12.5px;padding:6px 14px;">📁 Asset Gallery (${preferredFolder})</button>
          <button type="button" class="btn" id="img-tab-upload" style="font-size:12.5px;padding:6px 14px;">⬆️ Upload to ${preferredFolder}</button>
          <button type="button" class="btn" id="img-tab-url" style="font-size:12.5px;padding:6px 14px;">🔗 External URL / Path</button>
        </div>

        <!-- Body / Content Panels -->
        <div style="flex:1;overflow-y:auto;padding:16px 18px;display:flex;flex-direction:column;gap:14px;">
          <!-- Tab 1: Visual Asset Gallery -->
          <div id="img-panel-gallery" style="display:flex;flex-direction:column;gap:12px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
              <input type="search" id="img-asset-search" placeholder="Search assets in ${preferredFolder}…" style="flex:1;padding:7px 12px;background:#09090d;border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#f1f5f9;font-size:12.5px;" />
              <button type="button" class="btn" id="img-asset-refresh" style="padding:7px 12px;font-size:12px;" title="Refresh asset list">↻ Refresh</button>
            </div>
            <div id="img-asset-grid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(130px, 1fr));gap:10px;max-height:260px;overflow-y:auto;padding:4px 2px;">
              <div style="padding:24px;text-align:center;color:var(--text-muted);font-size:12.5px;grid-column:1/-1;">Loading assets from repository…</div>
            </div>
          </div>

          <!-- Tab 2: Upload Zone -->
          <div id="img-panel-upload" style="display:none;flex-direction:column;gap:12px;">
            <div id="img-dropzone" style="border:2px dashed rgba(56,189,248,0.4);background:rgba(56,189,248,0.03);border-radius:10px;padding:28px 16px;text-align:center;cursor:pointer;transition:all 0.15s ease;">
              <div style="font-size:32px;margin-bottom:8px;">📤</div>
              <div style="font-size:13.5px;font-weight:600;color:#f1f5f9;margin-bottom:4px;">Drag & drop image files here, or click to browse</div>
              <div style="font-size:11.5px;color:var(--text-muted);">Supports PNG, JPG, WebP, GIF, SVG. Automatically stored into <code>${preferredFolder}/</code></div>
              <input type="file" id="img-file-input" accept="image/*" style="display:none;" />
              <button type="button" class="btn" id="img-browse-btn" style="margin-top:12px;padding:6px 16px;font-size:12.5px;background:rgba(56,189,248,0.15);border-color:#38bdf8;color:#38bdf8;font-weight:600;">Browse Images</button>
            </div>
            <div id="img-upload-status" style="font-size:12px;display:none;padding:8px 12px;border-radius:6px;"></div>
          </div>

          <!-- Tab 3: External URL / Path -->
          <div id="img-panel-url" style="display:none;flex-direction:column;gap:10px;">
            <label style="display:flex;flex-direction:column;gap:4px;">
              <span style="font-size:12px;color:var(--text-muted);font-weight:600;">Image URL or Relative Path:</span>
              <input id="img-url-input" placeholder="https://example.com/image.png or ${preferredFolder}/sample.png" style="padding:8px 12px;background:#09090d;border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#f1f5f9;font-size:13px;" />
            </label>
          </div>

          <!-- Selected Image Preview & Format Settings -->
          <div style="padding:12px;background:#151520;border:1px solid rgba(255,255,255,0.1);border-radius:10px;display:flex;gap:14px;align-items:center;">
            <div id="img-selected-preview" style="width:72px;height:72px;background:#09090d;border:1px solid rgba(255,255,255,0.15);border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
              <span style="font-size:11px;color:var(--text-muted);text-align:center;">No image</span>
            </div>
            <div style="flex:1;display:flex;flex-direction:column;gap:6px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;">Selected:</span>
                <span id="img-selected-path" style="font-size:12.5px;color:#38bdf8;font-family:var(--font-mono);word-break:break-all;">None</span>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                <input id="img-alt-input" placeholder="Alt text / description (optional)" style="padding:6px 10px;background:#09090d;border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:var(--text);font-size:12px;" />
                <div style="display:flex;gap:6px;">
                  <select id="img-align-select" style="flex:1;padding:6px 8px;background:#09090d;border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:var(--text);font-size:12px;">
                    <option value="center" selected>Align: Center</option>
                    <option value="left">Align: Left</option>
                    <option value="right">Align: Right</option>
                  </select>
                  <select id="img-size-select" style="flex:1;padding:6px 8px;background:#09090d;border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:var(--text);font-size:12px;">
                    <option value="100%" selected>Size: 100%</option>
                    <option value="75%">Size: 75%</option>
                    <option value="50%">Size: 50%</option>
                    <option value="35%">Size: 35%</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div style="display:flex;justify-content:flex-end;align-items:center;gap:10px;padding:12px 18px;background:#161622;border-top:1px solid rgba(255,255,255,0.1);">
          <button type="button" class="btn" id="img-cancel" style="padding:6px 14px;font-size:13px;">Cancel</button>
          <button type="button" class="btn primary" id="img-submit" style="padding:6px 18px;font-size:13px;font-weight:600;">Insert Image</button>
        </div>
      </div>
    `;

    // State
    let activeTab = "gallery";
    let selectedAsset = null;
    let allAssets = [];

    const tabGallery = wrap.querySelector("#img-tab-gallery");
    const tabUpload = wrap.querySelector("#img-tab-upload");
    const tabUrl = wrap.querySelector("#img-tab-url");
    const panelGallery = wrap.querySelector("#img-panel-gallery");
    const panelUpload = wrap.querySelector("#img-panel-upload");
    const panelUrl = wrap.querySelector("#img-panel-url");

    const assetGrid = wrap.querySelector("#img-asset-grid");
    const assetSearch = wrap.querySelector("#img-asset-search");
    const refreshBtn = wrap.querySelector("#img-asset-refresh");
    const urlInput = wrap.querySelector("#img-url-input");
    const altInput = wrap.querySelector("#img-alt-input");
    const alignSelect = wrap.querySelector("#img-align-select");
    const sizeSelect = wrap.querySelector("#img-size-select");

    const selectedPreview = wrap.querySelector("#img-selected-preview");
    const selectedPathEl = wrap.querySelector("#img-selected-path");

    const dropzone = wrap.querySelector("#img-dropzone");
    const fileInput = wrap.querySelector("#img-file-input");
    const browseBtn = wrap.querySelector("#img-browse-btn");
    const uploadStatus = wrap.querySelector("#img-upload-status");

    function setTab(tab) {
      activeTab = tab;
      tabGallery.className = tab === "gallery" ? "btn primary" : "btn";
      tabUpload.className = tab === "upload" ? "btn primary" : "btn";
      tabUrl.className = tab === "url" ? "btn primary" : "btn";

      panelGallery.style.display = tab === "gallery" ? "flex" : "none";
      panelUpload.style.display = tab === "upload" ? "flex" : "none";
      panelUrl.style.display = tab === "url" ? "flex" : "none";
    }

    tabGallery.addEventListener("click", () => setTab("gallery"));
    tabUpload.addEventListener("click", () => setTab("upload"));
    tabUrl.addEventListener("click", () => setTab("url"));

    function selectPath(path, previewUrl = null, name = "") {
      selectedAsset = { path, url: previewUrl || path, name: name || path.split("/").pop() };
      selectedPathEl.textContent = path;
      urlInput.value = path;
      if (!altInput.value && selectedAsset.name) {
        altInput.value = selectedAsset.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
      }
      const resolved = (global.NotesData && global.NotesData.resolveAssetUrl ? global.NotesData.resolveAssetUrl(path) : null) || previewUrl || path;
      selectedPreview.innerHTML = `<img src="${resolved}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='';this.alt='preview err';" />`;
    }

    async function loadAssets() {
      assetGrid.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:12.5px;grid-column:1/-1;">Scanning ${preferredFolder}/ folder…</div>`;
      try {
        allAssets = global.NotesData && global.NotesData.listAssets ? await global.NotesData.listAssets() : [];
      } catch (_) {
        allAssets = [];
      }
      renderGallery();
    }

    function renderGallery() {
      const q = assetSearch.value.trim().toLowerCase();
      const filtered = allAssets.filter((a) => !q || a.name.toLowerCase().includes(q) || (a.relPath && a.relPath.toLowerCase().includes(q)));

      if (!filtered.length) {
        assetGrid.innerHTML = `
          <div style="padding:28px 16px;text-align:center;color:var(--text-muted);font-size:12.5px;grid-column:1/-1;background:#09090d;border-radius:8px;">
            ${q ? `No assets matching "${q}"` : `No images found in <code>${preferredFolder}/</code> folder yet.<br /><span style="font-size:11.5px;margin-top:6px;display:inline-block;">Switch to the <b>Upload</b> tab to add images!</span>`}
          </div>
        `;
        return;
      }

      assetGrid.replaceChildren();
      filtered.forEach((asset) => {
        const card = document.createElement("div");
        card.style.cssText = "display:flex;flex-direction:column;background:#151520;border:1px solid rgba(255,255,255,0.12);border-radius:8px;overflow:hidden;cursor:pointer;transition:all 0.12s ease;padding:6px;";
        const cardPath = asset.relPath || `${preferredFolder}/${asset.name}`;
        const isSelected = selectedAsset && selectedAsset.path === cardPath;
        if (isSelected) card.style.borderColor = "#38bdf8";

        const resolvedUrl = (global.NotesData && global.NotesData.resolveAssetUrl ? global.NotesData.resolveAssetUrl(cardPath) : null) || asset.url;

        card.innerHTML = `
          <div style="height:80px;background:#09090d;border-radius:6px;overflow:hidden;display:flex;align-items:center;justify-content:center;">
            <img src="${resolvedUrl}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';" />
          </div>
          <div style="margin-top:6px;font-size:11.5px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${asset.name}">${asset.name}</div>
          <div style="font-size:10.5px;color:var(--text-muted);display:flex;justify-content:space-between;align-items:center;margin-top:2px;">
            <span>${cardPath.startsWith(".asset/") ? ".asset" : ".assets"}</span>
            ${asset.isStaged ? `<span style="color:#4ade80;font-weight:600;">Staged</span>` : ""}
          </div>
        `;

        card.addEventListener("click", () => {
          assetGrid.querySelectorAll("div").forEach((d) => (d.style.borderColor = "rgba(255,255,255,0.12)"));
          card.style.borderColor = "#38bdf8";
          selectPath(cardPath, asset.url, asset.name);
        });

        assetGrid.appendChild(card);
      });
    }

    assetSearch.addEventListener("input", renderGallery);
    refreshBtn.addEventListener("click", loadAssets);

    urlInput.addEventListener("input", () => {
      selectPath(urlInput.value.trim());
    });

    // File Upload handlers
    browseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      fileInput.click();
    });
    dropzone.addEventListener("click", () => fileInput.click());

    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.style.borderColor = "#38bdf8";
      dropzone.style.background = "rgba(56,189,248,0.08)";
    });
    dropzone.addEventListener("dragleave", () => {
      dropzone.style.borderColor = "rgba(56,189,248,0.4)";
      dropzone.style.background = "rgba(56,189,248,0.03)";
    });
    dropzone.addEventListener("drop", async (e) => {
      e.preventDefault();
      dropzone.style.borderColor = "rgba(56,189,248,0.4)";
      dropzone.style.background = "rgba(56,189,248,0.03)";
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        await processUpload(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener("change", async () => {
      if (fileInput.files && fileInput.files.length) {
        await processUpload(fileInput.files[0]);
      }
    });

    async function processUpload(file) {
      if (!file || !file.type.startsWith("image/")) {
        uploadStatus.style.display = "block";
        uploadStatus.style.background = "rgba(248,113,113,0.15)";
        uploadStatus.style.color = "#f87171";
        uploadStatus.textContent = "Please select a valid image file (PNG, JPG, SVG, WebP, GIF).";
        return;
      }

      const cleanName = sanitizeFilename(file.name);
      const folder = preferredFolder;
      const relPath = `${folder}/${cleanName}`;
      const fullPath = global.NotesData && global.NotesData.root ? `${global.NotesData.root}/${relPath}` : relPath;

      uploadStatus.style.display = "block";
      uploadStatus.style.background = "rgba(56,189,248,0.15)";
      uploadStatus.style.color = "#38bdf8";
      uploadStatus.textContent = `Storing ${cleanName} in ${folder}…`;

      try {
        if (global.NotesData && global.NotesData.source && global.NotesData.source() === "local" && global.NotesLocal && global.NotesLocal.writeAsset) {
          await global.NotesLocal.writeAsset(cleanName, file);
        } else if (global.NotesWrite && typeof global.NotesWrite.run === "function") {
          const base64 = await fileToBase64(file);
          await global.NotesWrite.run("addAsset", {
            path: fullPath,
            relPath,
            content: base64,
            base64: true,
          });
        }

        if (global.NotesData && global.NotesData.registerInMemoryAsset) {
          global.NotesData.registerInMemoryAsset(relPath, file, { size: file.size });
        }

        uploadStatus.style.background = "rgba(74,222,128,0.15)";
        uploadStatus.style.color = "#4ade80";
        uploadStatus.textContent = `✓ ${cleanName} stored in ${folder} and ready to insert!`;

        selectPath(relPath, URL.createObjectURL(file), cleanName);
        await loadAssets();
        setTimeout(() => setTab("gallery"), 600);
      } catch (err) {
        uploadStatus.style.background = "rgba(248,113,113,0.15)";
        uploadStatus.style.color = "#f87171";
        uploadStatus.textContent = `Upload error: ${(err && err.message) || "Could not save asset"}`;
      }
    }

    const close = () => wrap.remove();
    wrap.querySelector("#img-close-x").addEventListener("click", close);
    wrap.querySelector("#img-cancel").addEventListener("click", close);

    wrap.querySelector("#img-submit").addEventListener("click", () => {
      const url = urlInput.value.trim();
      if (!url) {
        alert("Please select or specify an image URL/path.");
        return;
      }
      const alt = altInput.value.trim() || (selectedAsset && selectedAsset.name ? selectedAsset.name.replace(/\.[^.]+$/, "") : "image");
      const align = alignSelect.value;
      const size = sizeSelect.value;

      let tag;
      if (align === "center") {
        tag = `<p align="center"><img src="${url}" alt="${alt}" style="max-width:${size};border-radius:8px;" /></p>`;
      } else {
        tag = `<img src="${url}" alt="${alt}" align="${align}" style="max-width:${size};border-radius:8px;" />`;
      }

      close();
      if (global.NotesInsert) {
        global.NotesInsert.put(tag, {}, target);
      }
    });

    document.body.appendChild(wrap);
    await loadAssets();
    if (allAssets.length > 0) {
      selectPath(allAssets[0].relPath || `${preferredFolder}/${allAssets[0].name}`, allAssets[0].url, allAssets[0].name);
    }
  }

  /* Live image controls (+ / - / align) on rendered images in write mode */
  function decorateImages(root) {
    if (!document.body.classList.contains("write")) return;
    const imgs = root.querySelectorAll(".md img:not([data-img-ctrl])");
    imgs.forEach((img) => {
      img.dataset.imgCtrl = "1";
      if (img.closest(".image-cell-wrap")) return;

      const wrap = document.createElement("div");
      wrap.className = "cell-action-wrap image-cell-wrap";
      wrap.style.cssText = "position:relative;display:inline-block;max-width:100%;";
      img.parentNode.insertBefore(wrap, img);
      wrap.appendChild(img);

      const dotsBtn = document.createElement("button");
      dotsBtn.type = "button";
      dotsBtn.className = "cell-dots-btn w-only";
      dotsBtn.innerHTML = "&#8942;";
      dotsBtn.title = "Image options";
      dotsBtn.setAttribute("aria-label", "Image options");

      const popover = document.createElement("div");
      popover.className = "cell-popover-menu";
      popover.innerHTML = `
        <button type="button" data-act="zoom-in"><span style="margin-right:6px">➕</span>Zoom In (+10%)</button>
        <button type="button" data-act="zoom-out"><span style="margin-right:6px">➖</span>Zoom Out (-10%)</button>
        <button type="button" data-act="align-left"><span style="margin-right:6px">⬅</span>Align Left</button>
        <button type="button" data-act="align-center"><span style="margin-right:6px">⏺</span>Align Center</button>
        <button type="button" data-act="align-right"><span style="margin-right:6px">➡</span>Align Right</button>
      `;

      wrap.appendChild(dotsBtn);
      wrap.appendChild(popover);

      const closeMenu = () => {
        popover.classList.remove("open");
        dotsBtn.classList.remove("active");
      };

      dotsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        const willOpen = !popover.classList.contains("open");
        document.querySelectorAll(".cell-popover-menu.open").forEach((p) => {
          p.classList.remove("open");
          const b = p.closest(".cell-action-wrap")?.querySelector(".cell-dots-btn");
          if (b) b.classList.remove("active");
        });
        if (willOpen) {
          popover.classList.add("open");
          dotsBtn.classList.add("active");
        }
      });

      wrap.addEventListener("mouseleave", () => {
        closeMenu();
      });
      wrap.addEventListener("focusout", (e) => {
        if (!wrap.contains(e.relatedTarget)) {
          closeMenu();
        }
      });

      popover.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        e.stopPropagation();
        e.preventDefault();
        const act = btn.dataset.act;
        closeMenu();

        const currentWidth = img.style.width ? parseInt(img.style.width, 10) : 100;
        if (act === "zoom-in") {
          img.style.width = `${Math.min(100, currentWidth + 10)}%`;
        } else if (act === "zoom-out") {
          img.style.width = `${Math.max(20, currentWidth - 10)}%`;
        } else if (act === "align-left") {
          wrap.style.display = "inline-block";
          wrap.style.margin = "0 1em 1em 0";
          wrap.style.float = "left";
          img.style.display = "inline";
          img.style.margin = "0";
          img.style.float = "none";
        } else if (act === "align-center") {
          wrap.style.display = "block";
          wrap.style.margin = "1em auto";
          wrap.style.float = "none";
          img.style.display = "block";
          img.style.margin = "0 auto";
          img.style.float = "none";
        } else if (act === "align-right") {
          wrap.style.display = "inline-block";
          wrap.style.margin = "0 0 1em 1em";
          wrap.style.float = "right";
          img.style.display = "inline";
          img.style.margin = "0";
          img.style.float = "none";
        }
      });
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
