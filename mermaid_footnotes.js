/* Phase 13: Interactive Mermaid Diagram Studio & Visual Builder + Footnotes Helper.
   window.NotesExtraBlocks */

(function (global) {
  const MERMAID_TEMPLATES = [
    {
      name: "Flowchart (Top to Bottom)",
      desc: "Step-by-step logic, decisions, and outcomes",
      code: "```mermaid\ngraph TD\n    A[Start] --> B{Is it valid?}\n    B -- Yes --> C[Process Step]\n    B -- No --> D[Show Error]\n    C --> E([Finish])\n```",
    },
    {
      name: "Flowchart (Left to Right)",
      desc: "Horizontal workflow and data pipelines",
      code: "```mermaid\ngraph LR\n    Input[Raw Data] --> Clean[Data Cleaning] --> Model[AI Model] --> Output[Prediction]\n```",
    },
    {
      name: "Sequence Diagram",
      desc: "Client-server API calls and messages",
      code: "```mermaid\nsequenceDiagram\n    autonumber\n    actor User\n    participant App as Frontend\n    participant API as Server API\n    participant DB as Database\n\n    User->>App: Click Submit\n    App->>API: POST /api/data\n    API->>DB: Query records\n    DB-->>API: Result set\n    API-->>App: 200 OK (JSON)\n    App-->>User: Success Message\n```",
    },
    {
      name: "Class Diagram",
      desc: "Object-oriented models, fields, and methods",
      code: "```mermaid\nclassDiagram\n    class User {\n        +String name\n        +String email\n        +login()\n    }\n    class Admin {\n        +List permissions\n        +banUser()\n    }\n    User <|-- Admin\n```",
    },
    {
      name: "State Diagram",
      desc: "State machine transitions and events",
      code: "```mermaid\nstateDiagram-v2\n    [*] --> Idle\n    Idle --> Processing: User Action\n    Processing --> Success: Resolved\n    Processing --> Failed: Error Occurred\n    Success --> [*]\n    Failed --> Idle: Retry\n```",
    },
    {
      name: "Git Branching Graph",
      desc: "Git workflow, feature branches, and merge commits",
      code: "```mermaid\ngitGraph\n    commit id: \"Initial\"\n    branch develop\n    checkout develop\n    commit id: \"Feature work\"\n    branch feature-login\n    checkout feature-login\n    commit id: \"Auth UI\"\n    commit id: \"Auth API\"\n    checkout develop\n    merge feature-login\n    checkout main\n    merge develop id: \"v1.0.0\"\n```",
    },
    {
      name: "Pie Chart",
      desc: "Visual data distribution and percentages",
      code: "```mermaid\npie title Project Time Allocation\n    \"Development\" : 45\n    \"Code Review & Testing\" : 25\n    \"Documentation\" : 15\n    \"Deployment & Ops\" : 15\n```",
    },
  ];

  let previewCounter = 0;

  async function renderDiagramPreview(container, codeString) {
    if (!container) return;
    const cleanCode = codeString.replace(/^```mermaid\s*/i, "").replace(/```\s*$/, "").trim();
    if (!cleanCode) {
      container.innerHTML = '<span style="color:var(--text-muted);font-size:12px;">Add steps to see live diagram preview</span>';
      return;
    }

    if (!global.mermaid) {
      // Load bundled mermaid if not yet loaded
      try {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "lib/mermaid.min.js";
          s.onload = () => {
            global.mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict", fontFamily: "Inter, system-ui, sans-serif" });
            resolve();
          };
          s.onerror = reject;
          document.head.appendChild(s);
        });
      } catch {
        container.innerHTML = `<pre style="font-family:var(--font-mono);font-size:12px;color:var(--text);margin:0;">${cleanCode}</pre>`;
        return;
      }
    }

    const id = `mmd-preview-${++previewCounter}`;
    try {
      const { svg } = await global.mermaid.render(id, cleanCode);
      container.innerHTML = svg;
    } catch {
      const stray = document.getElementById(`d${id}`);
      if (stray) stray.remove();
      container.innerHTML = `
        <div style="color:#ff8787;font-size:12px;margin-bottom:6px;">Diagram syntax preview:</div>
        <pre style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin:0;white-space:pre-wrap;">${cleanCode}</pre>
      `;
    }
  }

  /* ---------- Visual Diagram Studio & Flowchart Builder Dialog ---------- */
  function openMermaidDialog(target, initialCode = "") {
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.id = "mermaid-modal";
    wrap.innerHTML = `
      <div class="modal wide" role="dialog" aria-modal="true" aria-labelledby="mmd-title" style="max-width:800px;width:95vw;max-height:90vh;display:flex;flex-direction:column;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div>
            <h2 id="mmd-title" style="margin:0 0 4px;font-size:18px;">Visual Mermaid Diagram Studio</h2>
            <p style="margin:0;font-size:12px;color:var(--text-muted);">Build flowcharts visually or select from ready diagram templates</p>
          </div>
          <button type="button" class="btn" id="mmd-close-x" style="padding:4px 10px;">✕</button>
        </div>

        <!-- Mode Tabs -->
        <div style="display:flex;gap:6px;margin-bottom:12px;border-bottom:1px solid var(--border);padding-bottom:8px;">
          <button type="button" class="btn primary" id="tab-visual" style="font-size:13px;padding:6px 14px;">Interactive Flowchart Builder</button>
          <button type="button" class="btn" id="tab-templates" style="font-size:13px;padding:6px 14px;">Diagram Templates</button>
          <button type="button" class="btn" id="tab-code" style="font-size:13px;padding:6px 14px;">Code View</button>
        </div>

        <!-- Tab 1: Interactive Flowchart Builder -->
        <div id="panel-visual" style="display:flex;flex-direction:column;gap:12px;flex:1;overflow:hidden;">
          <div style="display:flex;align-items:center;gap:12px;padding:8px 12px;background:#15151a;border:1px solid var(--border);border-radius:8px;">
            <span style="font-size:12px;color:var(--text-muted);">Flow Direction:</span>
            <select id="mmd-dir" style="padding:4px 8px;background:#0a0a0d;border:1px solid var(--border);border-radius:4px;color:var(--text);font:inherit;font-size:12px;">
              <option value="TD">Top to Bottom (Vertical)</option>
              <option value="LR">Left to Right (Horizontal)</option>
              <option value="BT">Bottom to Top</option>
              <option value="RL">Right to Left</option>
            </select>
            <button type="button" class="btn" id="mmd-add-node" style="margin-left:auto;padding:4px 12px;font-size:12px;">+ Add Step</button>
          </div>

          <!-- Nodes Builder List -->
          <div id="mmd-nodes-list" style="max-height:160px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding:6px;background:#0d0d11;border:1px solid var(--border);border-radius:8px;"></div>
        </div>

        <!-- Tab 2: Diagram Templates Gallery -->
        <div id="panel-templates" style="display:none;flex-direction:column;gap:8px;max-height:220px;overflow-y:auto;padding:4px;">
          ${MERMAID_TEMPLATES.map((t, i) => `
            <button type="button" class="btn mmd-tmpl-btn" data-idx="${i}" style="text-align:left;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;background:#15151a;border:1px solid var(--border);border-radius:8px;">
              <div>
                <b style="color:var(--text);font-size:14px;">${t.name}</b>
                <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${t.desc}</div>
              </div>
              <span style="font-size:12px;color:var(--accent);font-weight:600;">Load</span>
            </button>
          `).join("")}
        </div>

        <!-- Tab 3: Code View -->
        <div id="panel-code" style="display:none;flex-direction:column;gap:8px;">
          <textarea id="mmd-raw-code" style="width:100%;height:180px;font-family:var(--font-mono);font-size:13px;padding:10px;background:#0a0a0d;border:1px solid var(--border);border-radius:8px;color:var(--text);resize:vertical;"></textarea>
        </div>

        <!-- Live Diagram Preview Box -->
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:4px;flex:1;min-height:160px;max-height:260px;">
          <div style="font-size:12px;font-weight:600;color:var(--text-muted);">Live Diagram Rendering:</div>
          <div id="mmd-preview-area" style="flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;padding:12px;background:#0b0b0e;border:1px solid var(--border);border-radius:8px;"></div>
        </div>

        <!-- Actions -->
        <div class="modal-actions" style="margin-top:14px;">
          <button type="button" class="btn" id="mmd-cancel">Cancel</button>
          <button type="button" class="btn primary" id="mmd-insert">Insert Diagram</button>
        </div>
      </div>
    `;

    // State
    let activeTab = "visual"; // "visual" | "templates" | "code"
    let currentCode = initialCode && initialCode.trim() ? initialCode : MERMAID_TEMPLATES[0].code;
    let flowDir = "TD";
    let nodes = [
      { id: "A", label: "Start", shape: "round", linkTo: "B", linkText: "" },
      { id: "B", label: "Check Condition", shape: "diamond", linkTo: "C", linkText: "Yes" },
      { id: "C", label: "Execute Process", shape: "rect", linkTo: "D", linkText: "" },
      { id: "D", label: "Success Finish", shape: "round", linkTo: "", linkText: "" },
    ];

    const panelVisual = wrap.querySelector("#panel-visual");
    const panelTemplates = wrap.querySelector("#panel-templates");
    const panelCode = wrap.querySelector("#panel-code");
    const tabVisual = wrap.querySelector("#tab-visual");
    const tabTemplates = wrap.querySelector("#tab-templates");
    const tabCode = wrap.querySelector("#tab-code");
    const previewArea = wrap.querySelector("#mmd-preview-area");
    const nodesList = wrap.querySelector("#mmd-nodes-list");
    const rawCodeTextarea = wrap.querySelector("#mmd-raw-code");
    const dirSelect = wrap.querySelector("#mmd-dir");

    function setTab(tab) {
      activeTab = tab;
      tabVisual.className = tab === "visual" ? "btn primary" : "btn";
      tabTemplates.className = tab === "templates" ? "btn primary" : "btn";
      tabCode.className = tab === "code" ? "btn primary" : "btn";

      panelVisual.style.display = tab === "visual" ? "flex" : "none";
      panelTemplates.style.display = tab === "templates" ? "flex" : "none";
      panelCode.style.display = tab === "code" ? "flex" : "none";

      if (tab === "code") {
        rawCodeTextarea.value = currentCode;
      }
      updatePreview();
    }

    tabVisual.addEventListener("click", () => setTab("visual"));
    tabTemplates.addEventListener("click", () => setTab("templates"));
    tabCode.addEventListener("click", () => setTab("code"));

    function generateCodeFromNodes() {
      const shapeCode = (id, label, shape) => {
        if (shape === "round") return `${id}([${label}])`;
        if (shape === "diamond") return `${id}{${label}}`;
        if (shape === "circle") return `${id}((${label}))`;
        return `${id}[${label}]`;
      };

      const lines = [`graph ${flowDir}`];
      nodes.forEach((n) => {
        const nodeStr = shapeCode(n.id, n.label || n.id, n.shape);
        if (n.linkTo && n.linkTo.trim()) {
          const arrow = n.linkText ? ` -- ${n.linkText} --> ` : " --> ";
          lines.push(`    ${nodeStr}${arrow}${n.linkTo.trim()}`);
        } else {
          lines.push(`    ${nodeStr}`);
        }
      });

      return "```mermaid\n" + lines.join("\n") + "\n```";
    }

    function updatePreview() {
      if (activeTab === "visual") {
        currentCode = generateCodeFromNodes();
      } else if (activeTab === "code") {
        currentCode = rawCodeTextarea.value;
      }
      renderDiagramPreview(previewArea, currentCode);
    }

    function renderNodesDom() {
      nodesList.replaceChildren();
      nodes.forEach((node, idx) => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:6px;padding:6px;background:#15151a;border:1px solid var(--border);border-radius:6px;";
        row.innerHTML = `
          <input type="text" value="${node.id}" style="width:36px;text-align:center;padding:2px;background:#0a0a0d;border:1px solid var(--border);border-radius:4px;color:var(--accent);font-weight:bold;font-size:12px;" title="Step ID" />
          <input type="text" value="${node.label}" placeholder="Step Label" style="flex:1;min-width:100px;padding:3px 6px;background:#0a0a0d;border:1px solid var(--border);border-radius:4px;color:var(--text);font:inherit;font-size:12px;" />
          <select style="padding:3px 6px;background:#0a0a0d;border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12px;">
            <option value="rect" ${node.shape === "rect" ? "selected" : ""}>Box [ ]</option>
            <option value="round" ${node.shape === "round" ? "selected" : ""}>Rounded ([ ])</option>
            <option value="diamond" ${node.shape === "diamond" ? "selected" : ""}>Decision { }</option>
            <option value="circle" ${node.shape === "circle" ? "selected" : ""}>Circle (( ))</option>
          </select>
          <span style="font-size:12px;color:var(--text-muted)">→</span>
          <input type="text" value="${node.linkTo}" placeholder="Target ID" style="width:58px;padding:3px 6px;background:#0a0a0d;border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12px;" title="Connects to step ID" />
          <input type="text" value="${node.linkText || ""}" placeholder="Label" style="width:58px;padding:3px 6px;background:#0a0a0d;border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:12px;" title="Arrow label (optional)" />
          <button type="button" class="btn" style="padding:2px 8px;min-height:24px;font-size:12px;" title="Remove step">✕</button>
        `;

        const [idIn, labelIn, shapeSel, toIn, textIn] = row.querySelectorAll("input, select");
        const delBtn = row.querySelector("button");

        idIn.addEventListener("input", (e) => { node.id = e.target.value.trim().toUpperCase() || node.id; updatePreview(); });
        labelIn.addEventListener("input", (e) => { node.label = e.target.value; updatePreview(); });
        shapeSel.addEventListener("change", (e) => { node.shape = e.target.value; updatePreview(); });
        toIn.addEventListener("input", (e) => { node.linkTo = e.target.value.trim().toUpperCase(); updatePreview(); });
        textIn.addEventListener("input", (e) => { node.linkText = e.target.value.trim(); updatePreview(); });
        delBtn.addEventListener("click", () => {
          if (nodes.length > 1) {
            nodes.splice(idx, 1);
            renderNodesDom();
            updatePreview();
          }
        });

        nodesList.appendChild(row);
      });
    }

    dirSelect.addEventListener("change", (e) => {
      flowDir = e.target.value;
      updatePreview();
    });

    wrap.querySelector("#mmd-add-node").addEventListener("click", () => {
      const nextId = String.fromCharCode(65 + (nodes.length % 26));
      const prev = nodes[nodes.length - 1];
      if (prev && !prev.linkTo) prev.linkTo = nextId;
      nodes.push({ id: nextId, label: `Step ${nodes.length + 1}`, shape: "rect", linkTo: "", linkText: "" });
      renderNodesDom();
      updatePreview();
    });

    wrap.querySelectorAll(".mmd-tmpl-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = +btn.dataset.idx;
        const t = MERMAID_TEMPLATES[idx];
        if (t) {
          currentCode = t.code;
          rawCodeTextarea.value = currentCode;
          updatePreview();
          wrap.querySelectorAll(".mmd-tmpl-btn").forEach((b) => (b.style.borderColor = "var(--border)"));
          btn.style.borderColor = "var(--accent)";
        }
      });
    });

    rawCodeTextarea.addEventListener("input", () => {
      currentCode = rawCodeTextarea.value;
      renderDiagramPreview(previewArea, currentCode);
    });

    const close = () => wrap.remove();
    wrap.querySelector("#mmd-close-x").addEventListener("click", close);
    wrap.querySelector("#mmd-cancel").addEventListener("click", close);

    wrap.querySelector("#mmd-insert").addEventListener("click", () => {
      if (activeTab === "visual") currentCode = generateCodeFromNodes();
      else if (activeTab === "code") currentCode = rawCodeTextarea.value;
      close();
      if (typeof target === "function") {
        target(currentCode);
      } else if (global.NotesInsert) {
        global.NotesInsert.put(currentCode, {}, target);
      }
    });

    renderNodesDom();
    document.body.appendChild(wrap);
    updatePreview();
  }

  /* ---------- In-Place Diagram Decoration in Write Mode ---------- */
  function decorateRenderedDiagrams(root, getBlockText, updateBlockText) {
    if (!root) return;
    root.querySelectorAll(".blk").forEach((blkWrap) => {
      const box = blkWrap.querySelector(".mermaid-box");
      if (!box || blkWrap.querySelector(".mermaid-action-strip")) return;

      const strip = document.createElement("div");
      strip.className = "mermaid-action-strip w-only";
      strip.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 8px;
        padding: 4px 8px;
        background: #15151a;
        border: 1px solid var(--border);
        border-radius: 6px;
        width: fit-content;
        font-size: 12px;
      `;
      strip.innerHTML = `
        <span style="font-weight:600;color:var(--accent);margin-right:4px;">📊 Diagram:</span>
        <button type="button" class="btn" data-act="visual" style="padding:2px 8px;font-size:12px;">Visual Studio / Edit</button>
      `;

      strip.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-act='visual']");
        if (!btn) return;
        e.stopPropagation();
        e.preventDefault();
        const currentText = getBlockText(blkWrap);
        openMermaidDialog((newText) => {
          updateBlockText(blkWrap, newText);
        }, currentText);
      });

      box.parentNode.insertBefore(strip, box);
    });
  }

  function insertFootnote(target) {
    const num = Math.floor(Math.random() * 90) + 1;
    const tag = `[^${num}]`;
    const def = `\n\n[^${num}]: Footnote text here.`;

    if (target && target.ta) {
      const s = target.ta.selectionStart;
      const val = target.ta.value;
      target.ta.value = val.slice(0, s) + tag + val.slice(s) + def;
      target.ta.setSelectionRange(s + tag.length, s + tag.length);
      target.ta.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (global.NotesInsert) {
      global.NotesInsert.put(`${tag}${def}`, {}, target);
    }
  }

  function init() {
    if (global.NotesInsert) {
      global.NotesInsert.register({
        id: "mermaid",
        label: "Mermaid diagram…",
        hint: "Flowcharts & charts",
        group: "Blocks",
        keywords: ["mermaid", "chart", "diagram", "graph", "flowchart"],
        run: (t) => openMermaidDialog(t),
      });

      global.NotesInsert.register({
        id: "footnote",
        label: "Footnote",
        hint: "[^1]",
        group: "Text",
        keywords: ["footnote", "note", "citation", "reference"],
        run: (t) => insertFootnote(t),
      });
    }
  }

  if (document.readyState === "complete") init();
  else document.addEventListener("DOMContentLoaded", init);

  global.NotesExtraBlocks = {
    openMermaidDialog,
    decorateRenderedDiagrams,
    insertFootnote,
  };
})(window);
