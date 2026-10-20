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
  let activeTheme = "dark";
  let activeZoom = 1;

  async function ensureMermaidInitialized(theme = "dark") {
    if (!global.mermaid) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "lib/mermaid.min.js";
        s.onload = () => resolve();
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    const themeVars = {
      dark: {
        darkMode: true,
        background: "#0d1117",
        primaryColor: "#1e293b",
        primaryTextColor: "#f1f5f9",
        primaryBorderColor: "#38bdf8",
        lineColor: "#38bdf8",
        textColor: "#f1f5f9",
        mainBkg: "#1e293b",
        nodeBorder: "#38bdf8",
        clusterBkg: "#0f172a",
        clusterBorder: "#334155",
        defaultLinkColor: "#38bdf8",
        titleColor: "#f1f5f9",
        edgeLabelBackground: "#0d1117",
        actorBorder: "#38bdf8",
        actorBkg: "#1e293b",
        actorTextColor: "#f1f5f9",
        actorLineColor: "#38bdf8",
        signalColor: "#38bdf8",
        signalTextColor: "#f1f5f9",
        labelBoxBkgColor: "#1e293b",
        labelBoxBorderColor: "#38bdf8",
        labelTextColor: "#f1f5f9",
        loopTextColor: "#f1f5f9",
        noteBorderColor: "#f59e0b",
        noteBkgColor: "#291e0a",
        noteTextColor: "#fef3c7",
      },
      slate: {
        darkMode: true,
        background: "#181824",
        primaryColor: "#2d2d3f",
        primaryTextColor: "#ffffff",
        primaryBorderColor: "#818cf8",
        lineColor: "#a5b4fc",
        textColor: "#ffffff",
        mainBkg: "#262636",
        nodeBorder: "#818cf8",
      },
      forest: {
        darkMode: true,
        background: "#0c1a14",
        primaryColor: "#18382b",
        primaryTextColor: "#e6fffa",
        primaryBorderColor: "#34d399",
        lineColor: "#34d399",
        textColor: "#e6fffa",
        mainBkg: "#132d22",
        nodeBorder: "#34d399",
      },
      paper: {
        darkMode: false,
        background: "#ffffff",
        primaryColor: "#f1f5f9",
        primaryTextColor: "#0f172a",
        primaryBorderColor: "#0284c7",
        lineColor: "#0284c7",
        textColor: "#0f172a",
        mainBkg: "#ffffff",
        nodeBorder: "#0284c7",
      },
    };

    try {
      global.mermaid.initialize({
        startOnLoad: false,
        theme: theme === "paper" ? "neutral" : "dark",
        securityLevel: "loose",
        fontFamily: "'JetBrains Mono', 'Fira Code', Inter, system-ui, sans-serif",
        themeVariables: themeVars[theme] || themeVars.dark,
      });
    } catch (_) {}
  }

  let renderDebounceTimer = null;
  async function renderDiagramPreview(container, codeString, theme = "dark", statusBadge = null) {
    if (!container) return;
    const cleanCode = codeString.replace(/^```mermaid\s*/i, "").replace(/```\s*$/, "").trim();
    if (!cleanCode) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:32px;text-align:center;">Add steps or write Mermaid code to render preview</div>';
      if (statusBadge) statusBadge.textContent = "Waiting for input";
      return;
    }

    await ensureMermaidInitialized(theme);

    const id = `mmd-studio-${++previewCounter}`;
    try {
      const { svg } = await global.mermaid.render(id, cleanCode);
      container.innerHTML = svg;
      const svgEl = container.querySelector("svg");
      if (svgEl) {
        svgEl.style.maxWidth = "100%";
        svgEl.style.height = "auto";
        svgEl.style.display = "block";
        svgEl.style.margin = "auto";
        svgEl.style.transform = `scale(${activeZoom})`;
        svgEl.style.transformOrigin = "center center";
        svgEl.style.transition = "transform 0.15s ease-out";
      }
      if (statusBadge) {
        statusBadge.textContent = "● Rendered Successfully";
        statusBadge.style.color = "#4ade80";
      }
      // Remove any stray error elements mermaid might have added to body
      const stray = document.getElementById(`d${id}`);
      if (stray) stray.remove();
    } catch (err) {
      const stray = document.getElementById(`d${id}`);
      if (stray) stray.remove();
      const existingSvg = container.querySelector("svg");
      if (statusBadge) {
        statusBadge.textContent = "⚠️ Syntax Parsing…";
        statusBadge.style.color = "#fbbf24";
      }
      // If no diagram was previously visible, show helpful code view
      if (!existingSvg) {
        container.innerHTML = `
          <div style="padding:20px;text-align:center;">
            <div style="color:#f87171;font-size:13px;font-weight:600;margin-bottom:8px;">Diagram Syntax Notice</div>
            <pre style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);background:#111116;padding:12px;border-radius:8px;max-width:90%;overflow:auto;margin:auto;text-align:left;">${cleanCode}</pre>
          </div>
        `;
      }
    }
  }

  /* ---------- Visual Diagram Studio & Flowchart Builder Dialog ---------- */
  function openMermaidDialog(target, initialCode = "") {
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.id = "mermaid-modal";
    wrap.innerHTML = `
      <div class="modal wide" role="dialog" aria-modal="true" aria-labelledby="mmd-title" style="max-width:1160px;width:96vw;height:88vh;max-height:860px;display:flex;flex-direction:column;padding:0;overflow:hidden;background:#0d0d12;border:1px solid rgba(255,255,255,0.2);box-shadow:0 24px 64px rgba(0,0,0,0.85);border-radius:14px;">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 18px;background:#14141c;border-bottom:1px solid rgba(255,255,255,0.1);">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:18px;">📊</span>
            <div>
              <h2 id="mmd-title" style="margin:0;font-size:16px;font-weight:650;letter-spacing:-0.01em;">Mermaid Diagram Studio & Live Visualizer</h2>
              <p style="margin:0;font-size:11.5px;color:var(--text-muted);">Interactive flowchart builder, diagram gallery, and real-time canvas</p>
            </div>
          </div>
          <button type="button" class="btn" id="mmd-close-x" style="padding:4px 10px;font-size:14px;" title="Close (Esc)">✕</button>
        </div>

        <!-- Split Workspace (Controls Left, Live Canvas Right) -->
        <div style="display:flex;flex:1;min-height:0;overflow:hidden;">
          <!-- Left Column: Studio Controls -->
          <div style="flex:1;min-width:360px;max-width:460px;display:flex;flex-direction:column;border-right:1px solid rgba(255,255,255,0.1);background:#101017;">
            <!-- Mode Tabs -->
            <div style="display:flex;gap:4px;padding:8px 12px;background:#14141c;border-bottom:1px solid rgba(255,255,255,0.1);">
              <button type="button" class="btn primary" id="tab-visual" style="flex:1;font-size:12px;padding:6px 8px;">Flowchart</button>
              <button type="button" class="btn" id="tab-templates" style="flex:1;font-size:12px;padding:6px 8px;">Templates</button>
              <button type="button" class="btn" id="tab-code" style="flex:1;font-size:12px;padding:6px 8px;">Code View</button>
            </div>

            <!-- Tab 1: Flowchart Builder Panel -->
            <div id="panel-visual" style="display:flex;flex-direction:column;gap:10px;flex:1;overflow:hidden;padding:12px;">
              <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#161622;border:1px solid rgba(255,255,255,0.1);border-radius:8px;">
                <span style="font-size:12px;color:var(--text-muted);">Direction:</span>
                <select id="mmd-dir" style="padding:4px 8px;background:#0a0a0f;border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:var(--text);font:inherit;font-size:12px;">
                  <option value="TD">Top to Bottom (TD)</option>
                  <option value="LR">Left to Right (LR)</option>
                  <option value="BT">Bottom to Top (BT)</option>
                  <option value="RL">Right to Left (RL)</option>
                </select>
                <button type="button" class="btn" id="mmd-add-node" style="margin-left:auto;padding:4px 10px;font-size:12px;background:rgba(56,189,248,0.15);border-color:#38bdf8;color:#38bdf8;font-weight:600;">+ Add Step</button>
              </div>

              <div style="font-size:11.5px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">Flowchart Steps:</div>
              <div id="mmd-nodes-list" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding:4px 2px;"></div>
            </div>

            <!-- Tab 2: Diagram Templates Gallery -->
            <div id="panel-templates" style="display:none;flex-direction:column;gap:8px;flex:1;overflow-y:auto;padding:12px;">
              <div style="font-size:11.5px;color:var(--text-muted);margin-bottom:2px;">Select a diagram template to load into the visual studio:</div>
              ${MERMAID_TEMPLATES.map((t, i) => `
                <button type="button" class="btn mmd-tmpl-btn" data-idx="${i}" style="text-align:left;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;background:#161622;border:1px solid rgba(255,255,255,0.1);border-radius:8px;cursor:pointer;transition:all 0.12s ease;">
                  <div>
                    <b style="color:var(--text);font-size:13px;display:block;">${t.name}</b>
                    <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px;">${t.desc}</div>
                  </div>
                  <span style="font-size:11.5px;color:#38bdf8;font-weight:600;background:rgba(56,189,248,0.1);padding:3px 8px;border-radius:4px;flex-shrink:0;margin-left:8px;">Load</span>
                </button>
              `).join("")}
            </div>

            <!-- Tab 3: Code View Panel -->
            <div id="panel-code" style="display:none;flex-direction:column;gap:8px;flex:1;overflow:hidden;padding:12px;">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <span style="font-size:11.5px;color:var(--text-muted);">Snippets:</span>
                <button type="button" class="btn mmd-snip" data-snip="    A[Node] --> B[Target]" style="padding:2px 6px;font-size:11px;">+ Arrow</button>
                <button type="button" class="btn mmd-snip" data-snip="    C{Decision} -- Yes --> D[Step]" style="padding:2px 6px;font-size:11px;">+ Decision</button>
                <button type="button" class="btn mmd-snip" data-snip="    subgraph GroupName\n        E[Item 1]\n    end" style="padding:2px 6px;font-size:11px;">+ Subgraph</button>
              </div>
              <textarea id="mmd-raw-code" spellcheck="false" style="flex:1;width:100%;font-family:var(--font-mono);font-size:12.5px;line-height:1.5;padding:12px;background:#09090d;border:1px solid rgba(255,255,255,0.14);border-radius:8px;color:#f1f5f9;resize:none;outline:none;tab-size:4;"></textarea>
            </div>
          </div>

          <!-- Right Column: Live Render Canvas & Toolbar -->
          <div style="flex:1.4;display:flex;flex-direction:column;min-width:0;background:#08080c;overflow:hidden;">
            <!-- Canvas Toolbar -->
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:#12121a;border-bottom:1px solid rgba(255,255,255,0.1);gap:8px;flex-wrap:wrap;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:12px;font-weight:600;color:var(--text);">Live Render Window</span>
                <span id="mmd-status-badge" style="font-size:11px;color:#4ade80;font-weight:600;background:rgba(255,255,255,0.05);padding:2px 8px;border-radius:999px;">● Ready</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <!-- Theme Selector -->
                <select id="mmd-theme" style="padding:3px 6px;background:#181822;border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:var(--text);font-size:11.5px;">
                  <option value="dark" selected>Theme: Dark</option>
                  <option value="slate">Theme: Slate</option>
                  <option value="forest">Theme: Forest</option>
                  <option value="paper">Theme: Paper (Light)</option>
                </select>
                <!-- Zoom Controls -->
                <button type="button" class="btn" id="mmd-zoom-out" style="padding:2px 8px;font-size:12px;" title="Zoom Out">−</button>
                <button type="button" class="btn" id="mmd-zoom-reset" style="padding:2px 8px;font-size:11.5px;" title="Reset Zoom">100%</button>
                <button type="button" class="btn" id="mmd-zoom-in" style="padding:2px 8px;font-size:12px;" title="Zoom In">+</button>
                <!-- Copy actions -->
                <button type="button" class="btn" id="mmd-copy-svg" style="padding:2px 8px;font-size:11.5px;" title="Copy SVG code">SVG</button>
                <button type="button" class="btn" id="mmd-copy-code" style="padding:2px 8px;font-size:11.5px;" title="Copy Mermaid code">Code</button>
              </div>
            </div>

            <!-- Canvas Viewport -->
            <div id="mmd-canvas-wrap" style="flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;padding:24px;position:relative;background-color:#08080c;background-image:radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px);background-size:20px 20px;">
              <div id="mmd-preview-area" style="max-width:100%;max-height:100%;display:flex;align-items:center;justify-content:center;"></div>
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div style="display:flex;justify-content:flex-end;align-items:center;gap:10px;padding:12px 18px;background:#14141c;border-top:1px solid rgba(255,255,255,0.1);">
          <button type="button" class="btn" id="mmd-cancel" style="padding:6px 14px;font-size:13px;">Cancel</button>
          <button type="button" class="btn primary" id="mmd-insert" style="padding:6px 18px;font-size:13px;font-weight:600;">Insert Diagram into Note</button>
        </div>
      </div>
    `;

    // State
    let activeTab = "visual"; // "visual" | "templates" | "code"
    let currentCode = initialCode && initialCode.trim() ? initialCode : MERMAID_TEMPLATES[0].code;
    let flowDir = "TD";
    activeZoom = 1;
    activeTheme = "dark";

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
    const themeSelect = wrap.querySelector("#mmd-theme");
    const statusBadge = wrap.querySelector("#mmd-status-badge");
    const zoomResetBtn = wrap.querySelector("#mmd-zoom-reset");

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
        if (shape === "cylinder") return `${id}[(${label})]`;
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

    function applyZoom() {
      const svg = previewArea.querySelector("svg");
      if (svg) {
        svg.style.transform = `scale(${activeZoom})`;
      }
      zoomResetBtn.textContent = `${Math.round(activeZoom * 100)}%`;
    }

    function updatePreview() {
      clearTimeout(renderDebounceTimer);
      renderDebounceTimer = setTimeout(() => {
        if (activeTab === "visual") {
          currentCode = generateCodeFromNodes();
        } else if (activeTab === "code") {
          currentCode = rawCodeTextarea.value;
        }
        renderDiagramPreview(previewArea, currentCode, activeTheme, statusBadge);
      }, 100);
    }

    // Zoom and Theme handlers
    wrap.querySelector("#mmd-zoom-in").addEventListener("click", () => {
      activeZoom = Math.min(2.5, activeZoom + 0.15);
      applyZoom();
    });
    wrap.querySelector("#mmd-zoom-out").addEventListener("click", () => {
      activeZoom = Math.max(0.4, activeZoom - 0.15);
      applyZoom();
    });
    zoomResetBtn.addEventListener("click", () => {
      activeZoom = 1;
      applyZoom();
    });

    themeSelect.addEventListener("change", (e) => {
      activeTheme = e.target.value;
      const canvasWrap = wrap.querySelector("#mmd-canvas-wrap");
      if (activeTheme === "paper") {
        canvasWrap.style.backgroundColor = "#ffffff";
        canvasWrap.style.backgroundImage = "radial-gradient(rgba(0,0,0,0.1) 1px, transparent 1px)";
      } else if (activeTheme === "forest") {
        canvasWrap.style.backgroundColor = "#09140f";
        canvasWrap.style.backgroundImage = "radial-gradient(rgba(52,211,153,0.1) 1px, transparent 1px)";
      } else if (activeTheme === "slate") {
        canvasWrap.style.backgroundColor = "#12121a";
        canvasWrap.style.backgroundImage = "radial-gradient(rgba(129,140,248,0.1) 1px, transparent 1px)";
      } else {
        canvasWrap.style.backgroundColor = "#08080c";
        canvasWrap.style.backgroundImage = "radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)";
      }
      updatePreview();
    });

    // Copy actions
    wrap.querySelector("#mmd-copy-svg").addEventListener("click", async () => {
      const svg = previewArea.querySelector("svg");
      if (svg) {
        try {
          await navigator.clipboard.writeText(svg.outerHTML);
          statusBadge.textContent = "✓ SVG Copied to Clipboard";
          statusBadge.style.color = "#4ade80";
        } catch (_) {}
      }
    });

    wrap.querySelector("#mmd-copy-code").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(currentCode);
        statusBadge.textContent = "✓ Code Copied to Clipboard";
        statusBadge.style.color = "#4ade80";
      } catch (_) {}
    });

    // Code snippets
    wrap.querySelectorAll(".mmd-snip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const snip = btn.dataset.snip;
        const val = rawCodeTextarea.value;
        const pos = rawCodeTextarea.selectionStart;
        rawCodeTextarea.value = val.slice(0, pos) + "\n" + snip + "\n" + val.slice(pos);
        rawCodeTextarea.focus();
        currentCode = rawCodeTextarea.value;
        updatePreview();
      });
    });

    function renderNodesDom() {
      nodesList.replaceChildren();
      nodes.forEach((node, idx) => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:6px;padding:6px 8px;background:#151520;border:1px solid rgba(255,255,255,0.1);border-radius:6px;";
        row.innerHTML = `
          <input type="text" value="${node.id}" style="width:34px;text-align:center;padding:2px;background:#09090d;border:1px solid rgba(255,255,255,0.15);border-radius:4px;color:#38bdf8;font-weight:bold;font-size:12px;" title="Step ID" />
          <input type="text" value="${node.label}" placeholder="Step Label" style="flex:1;min-width:90px;padding:3px 6px;background:#09090d;border:1px solid rgba(255,255,255,0.15);border-radius:4px;color:var(--text);font:inherit;font-size:12px;" />
          <select style="padding:3px 4px;background:#09090d;border:1px solid rgba(255,255,255,0.15);border-radius:4px;color:var(--text);font-size:11.5px;">
            <option value="rect" ${node.shape === "rect" ? "selected" : ""}>[ ] Box</option>
            <option value="round" ${node.shape === "round" ? "selected" : ""}>([ ]) Round</option>
            <option value="diamond" ${node.shape === "diamond" ? "selected" : ""}>{ } Decision</option>
            <option value="circle" ${node.shape === "circle" ? "selected" : ""}>(( )) Circle</option>
            <option value="cylinder" ${node.shape === "cylinder" ? "selected" : ""}>[( )] DB</option>
          </select>
          <span style="font-size:12px;color:var(--text-muted)">→</span>
          <input type="text" value="${node.linkTo}" placeholder="Target" style="width:50px;padding:3px 4px;background:#09090d;border:1px solid rgba(255,255,255,0.15);border-radius:4px;color:var(--text);font-size:12px;" title="Connects to step ID" />
          <input type="text" value="${node.linkText || ""}" placeholder="Label" style="width:50px;padding:3px 4px;background:#09090d;border:1px solid rgba(255,255,255,0.15);border-radius:4px;color:var(--text);font-size:12px;" title="Arrow label (optional)" />
          <button type="button" class="btn" style="padding:2px 6px;min-height:22px;font-size:11px;color:#f87171;" title="Remove step">✕</button>
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
          wrap.querySelectorAll(".mmd-tmpl-btn").forEach((b) => (b.style.borderColor = "rgba(255,255,255,0.1)"));
          btn.style.borderColor = "#38bdf8";
        }
      });
    });

    rawCodeTextarea.addEventListener("input", () => {
      currentCode = rawCodeTextarea.value;
      updatePreview();
    });

    const close = () => {
      clearTimeout(renderDebounceTimer);
      wrap.remove();
    };
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
      if (!box || box.querySelector(".cell-dots-btn")) return;

      box.classList.add("cell-action-wrap");

      const dotsBtn = document.createElement("button");
      dotsBtn.type = "button";
      dotsBtn.className = "cell-dots-btn w-only";
      dotsBtn.innerHTML = "&#8942;";
      dotsBtn.title = "Diagram options";
      dotsBtn.setAttribute("aria-label", "Diagram options");

      const popover = document.createElement("div");
      popover.className = "cell-popover-menu";
      popover.innerHTML = `
        <button type="button" data-act="visual"><span style="margin-right:6px">📊</span>Visual Studio / Edit</button>
        <button type="button" data-act="copy-svg"><span style="margin-right:6px">📋</span>Copy SVG</button>
        <button type="button" data-act="copy-code"><span style="margin-right:6px">📋</span>Copy Code</button>
      `;

      box.appendChild(dotsBtn);
      box.appendChild(popover);

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

      box.addEventListener("mouseleave", () => {
        closeMenu();
      });
      box.addEventListener("focusout", (e) => {
        if (!box.contains(e.relatedTarget)) {
          closeMenu();
        }
      });

      popover.addEventListener("click", async (e) => {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        e.stopPropagation();
        e.preventDefault();
        const act = btn.dataset.act;
        closeMenu();

        const currentText = getBlockText(blkWrap);
        if (act === "visual") {
          openMermaidDialog((newText) => {
            updateBlockText(blkWrap, newText);
          }, currentText);
        } else if (act === "copy-svg") {
          const svg = box.querySelector("svg");
          if (svg) {
            try {
              await navigator.clipboard.writeText(svg.outerHTML);
              if (global.toast) global.toast("SVG copied to clipboard");
            } catch {
              if (global.toast) global.toast("Could not copy SVG");
            }
          }
        } else if (act === "copy-code") {
          try {
            await navigator.clipboard.writeText(currentText);
            if (global.toast) global.toast("Diagram code copied to clipboard");
          } catch {
            if (global.toast) global.toast("Could not copy code");
          }
        }
      });
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
