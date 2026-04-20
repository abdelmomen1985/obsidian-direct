import { getFile, saveFile, logout } from "./api.ts";
import { renderLogin } from "./login.ts";
import { renderTree, setActiveInTree } from "./tree.ts";
import { createEditor, setEditorContent, getEditorContent } from "./editor.ts";
import { renderMarkdown, attachWikilinkHandlers } from "./preview.ts";
import { createSearchPanel } from "./search.ts";
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
        </div>
        <div class="topbar-center">
          <span id="current-title" class="current-title">—</span>
        </div>
        <div class="topbar-right">
          <span id="save-status" class="save-status"></span>
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
  `;

  const treeEl = document.getElementById("file-tree")!;
  const editorPaneEl = document.getElementById("editor-pane")!;
  const previewEl = document.getElementById("preview-content")!;
  const saveStatusEl = document.getElementById("save-status")!;
  const titleEl = document.getElementById("current-title")!;
  const searchOverlay = document.getElementById("search-overlay")!;

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
  renderTree(treeEl, openFile, activePathRef);

  // ── Search panel ─────────────────────────────────────────────────────────
  const { el: searchEl, open: openSearch, close: closeSearch } = createSearchPanel(
    (path) => openFile(path)
  );
  searchOverlay.appendChild(searchEl);

  document.getElementById("search-btn")!.addEventListener("click", openSearch);

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      openSearch();
    }
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
      previewEl.innerHTML = renderMarkdown(doc);
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
