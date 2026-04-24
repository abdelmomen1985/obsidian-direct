import { getFile, saveFile, logout } from "./api.ts";
import { renderLogin } from "./login.ts";
import { renderTree, setActiveInTree, startTreeAutoRefresh, setTreeCallbacks } from "./tree.ts";
import { createEditor, setEditorContent, getEditorContent } from "./editor.ts";
import { renderMarkdown, attachWikilinkHandlers } from "./preview.ts";
import { createSearchPanel } from "./search.ts";
import { createCommandPalette, openMoveFilePalette } from "./command-palette.ts";
import { themeManager } from "./themes.ts";
import { EditorView } from "@codemirror/view";

const app = document.getElementById("app")!;

// ─── State ──────────────────────────────────────────────────────────────────
let editorView: EditorView | null = null;
let currentPath: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let isDirty = false;
const activePathRef = { current: "" };

type SaveStatus = "idle" | "editing" | "saving" | "saved" | "error";

// ─── Login screen ───────────────────────────────────────────────────────────
function showLogin(): void {
  app.innerHTML = "";
  app.appendChild(renderLogin(showApp));
}

window.addEventListener("auth:expired", () => showLogin());

// ─── Main app ───────────────────────────────────────────────────────────────
function showApp(): void {
  app.innerHTML = `
    <div class="layout">
      <header class="topbar">
        <div class="topbar-left">
          <button id="search-btn" title="Search (Ctrl+K)" class="icon-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            Search
          </button>
          <button id="cmd-btn" title="Command Palette (Ctrl+P)" class="icon-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 6 10 12 4 18"/><line x1="12" y1="18" x2="20" y2="18"/>
            </svg>
            Commands
          </button>
        </div>
        <div class="topbar-center">
          <span id="current-title" class="current-title">—</span>
        </div>
        <div class="topbar-right">
          <span id="save-status" class="save-status"></span>
          <button id="theme-btn" class="icon-btn" title="Switch theme">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
          </button>
          <button id="logout-btn" class="icon-btn">Logout</button>
        </div>
      </header>

      <div class="main-area">
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-header">Files</div>
          <div id="file-tree" class="file-tree"></div>
        </aside>

        <div class="editor-pane" id="editor-pane"></div>

        <div class="preview-pane" id="preview-pane">
          <div id="preview-content" class="preview-content markdown-body"></div>
        </div>
      </div>
    </div>
    <div id="search-overlay"></div>
    <div id="cmd-overlay-container"></div>
  `;

  const treeEl = document.getElementById("file-tree")!;
  const editorPaneEl = document.getElementById("editor-pane")!;
  const previewEl = document.getElementById("preview-content")!;
  const saveStatusEl = document.getElementById("save-status")!;
  const titleEl = document.getElementById("current-title")!;
  const searchOverlay = document.getElementById("search-overlay")!;
  const cmdOverlayEl = document.getElementById("cmd-overlay-container")!;

  // ── Editor ──────────────────────────────────────────────────────────────
  editorView = createEditor(
    editorPaneEl,
    "",
    (doc) => {
      isDirty = true;
      setStatus("editing");
      updatePreview(doc);
      scheduleSave();
    },
    () => {
      if (currentPath) doSave();
    }
  );

  attachWikilinkHandlers(previewEl, openFile);

  // ── File tree ────────────────────────────────────────────────────────────
  setTreeCallbacks({
    onDelete: (path) => {
      if (currentPath === path) {
        currentPath = null;
        activePathRef.current = "";
        titleEl.textContent = "—";
        if (editorView) setEditorContent(editorView, "");
        previewEl.innerHTML = "";
        setStatus("idle");
      }
      renderTree(treeEl, openFile, activePathRef);
    },
    onMove: (oldPath, newPath) => {
      if (currentPath === oldPath) {
        currentPath = newPath;
        activePathRef.current = newPath;
        titleEl.textContent = newPath.split("/").pop()?.replace(/\.md$/, "") ?? newPath;
      }
      renderTree(treeEl, openFile, activePathRef);
    },
  });
  renderTree(treeEl, openFile, activePathRef);
  startTreeAutoRefresh(treeEl, openFile, activePathRef, 5000);

  // ── Search panel ─────────────────────────────────────────────────────────
  const { el: searchEl, open: openSearch, close: closeSearch } = createSearchPanel(
    (path) => openFile(path)
  );
  searchOverlay.appendChild(searchEl);

  document.getElementById("search-btn")!.addEventListener("click", openSearch);

  // ── Command palette ───────────────────────────────────────────────────────
  const cmdPalette = createCommandPalette();
  cmdOverlayEl.appendChild(cmdPalette.el);

  function buildCommands() {
    return [
      {
        id: "move-file",
        label: "Move file to directory",
        description: currentPath ? `Current: ${currentPath}` : "No file open",
        action: () => {
          if (!currentPath) { alert("No file is currently open."); return; }
          openMoveFilePalette(currentPath, (oldPath, newPath) => {
            if (currentPath === oldPath) {
              currentPath = newPath;
              activePathRef.current = newPath;
              titleEl.textContent = newPath.split("/").pop()?.replace(/\.md$/, "") ?? newPath;
            }
            renderTree(treeEl, openFile, activePathRef);
          });
        },
      },
      {
        id: "search",
        label: "Search files",
        description: "Ctrl+K",
        action: () => openSearch(),
      },
    ];
  }

  const openCmdPalette = () => cmdPalette.open(buildCommands());

  document.getElementById("cmd-btn")!.addEventListener("click", openCmdPalette);

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      openSearch();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "p") {
      e.preventDefault();
      openCmdPalette();
    }
  });

  // ── Theme switcher ────────────────────────────────────────────────────────
  const themeBtn = document.getElementById("theme-btn")!;
  const updateThemeTitle = () => {
    const all = themeManager.getThemes();
    const idx = all.findIndex((t) => t.name === themeManager.getCurrent());
    const next = all[(idx + 1) % all.length]!;
    themeBtn.title = `Theme: ${themeManager.getThemes().find((t) => t.name === themeManager.getCurrent())?.label ?? ""} → ${next.label}`;
  };
  updateThemeTitle();
  themeBtn.addEventListener("click", () => {
    const all = themeManager.getThemes();
    const idx = all.findIndex((t) => t.name === themeManager.getCurrent());
    const next = all[(idx + 1) % all.length]!;
    themeManager.apply(next.name);
    updateThemeTitle();
  });

  // ── Logout ────────────────────────────────────────────────────────────────
  document.getElementById("logout-btn")!.addEventListener("click", async () => {
    await logout();
    showLogin();
  });

  // ── Status helpers ─────────────────────────────────────────────────────
  function setStatus(status: SaveStatus, msg?: string): void {
    const labels: Record<SaveStatus, string> = {
      idle: "",
      editing: "editing…",
      saving: "saving…",
      saved: "saved ✓",
      error: msg ?? "error",
    };
    saveStatusEl.textContent = labels[status];
    saveStatusEl.className = `save-status status-${status}`;
  }

  // ── Preview ────────────────────────────────────────────────────────────
  let previewDebounce: ReturnType<typeof setTimeout> | null = null;
  function updatePreview(doc: string): void {
    if (previewDebounce) clearTimeout(previewDebounce);
    previewDebounce = setTimeout(() => {
      const { html, isRtl } = renderMarkdown(doc);
      previewEl.innerHTML = html;
      previewEl.setAttribute("dir", isRtl ? "rtl" : "ltr");
      editorPaneEl.setAttribute("dir", isRtl ? "rtl" : "ltr");
    }, 150);
  }

  // ── Auto-save ──────────────────────────────────────────────────────────
  function scheduleSave(): void {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (currentPath && isDirty) doSave();
    }, 800);
  }

  async function doSave(): Promise<void> {
    if (!currentPath || !editorView) return;
    if (saveTimer) clearTimeout(saveTimer);
    setStatus("saving");
    try {
      await saveFile(currentPath, getEditorContent(editorView));
      isDirty = false;
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (err) {
      setStatus("error", err instanceof Error ? err.message : "Save failed");
    }
  }

  // ── Open file ─────────────────────────────────────────────────────────
  async function openFile(path: string): Promise<void> {
    if (currentPath === path) return;

    // Save pending changes from previous file
    if (currentPath && isDirty && editorView) {
      await doSave();
    }

    currentPath = path;
    activePathRef.current = path;
    setActiveInTree(path);
    titleEl.textContent = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
    setStatus("idle");

    try {
      const content = await getFile(path);
      if (editorView) {
        setEditorContent(editorView, content);
        isDirty = false;
        updatePreview(content);
      }
    } catch {
      setStatus("error", "Failed to load file");
    }
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────
// Optimistically show app; session cookie handles auth; 401 will redirect to login
async function init(): Promise<void> {
  // Probe auth by calling a cheap API
  const res = await fetch("/api/tree");
  if (res.status === 401) {
    showLogin();
  } else {
    showApp();
  }
}

init();
