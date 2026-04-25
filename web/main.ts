import {
  getFile,
  saveFile,
  logout,
  createFile,
  copyFile,
  renameFile,
  createFolder,
} from "./api.ts";
import { renderLogin } from "./login.ts";
import { renderTree, setActiveInTree, startTreeAutoRefresh, setTreeCallbacks } from "./tree.ts";
import {
  createEditor,
  setEditorContent,
  getEditorContent,
  boldSelection,
  italicSelection,
  wikilinkSelection,
} from "./editor.ts";
import { renderMarkdown, attachWikilinkHandlers, renderMermaidBlocks, attachCheckboxHandlers } from "./preview.ts";
import { createSearchPanel } from "./search.ts";
import { createCommandPalette, openMoveFilePalette } from "./command-palette.ts";
import { themeManager } from "./themes.ts";
import { EditorView } from "@codemirror/view";
import { createBaseTableView } from "./bases/base-table.ts";
import { processEmbeddedBases } from "./bases/base-embedded.ts";
import { createBacklinksPanel } from "./backlinks.ts";
import { createOutlinePanel } from "./outline.ts";
import { createTagsPane } from "./tags.ts";

const app = document.getElementById("app")!;

// ─── State ──────────────────────────────────────────────────────────────────
let editorView: EditorView | null = null;
let currentPath: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let isDirty = false;
const activePathRef = { current: "" };
let baseTableRefresh: (() => Promise<void>) | null = null;

type SaveStatus = "idle" | "editing" | "saving" | "saved" | "error";
type ViewMode = "split" | "editor" | "preview";
let viewMode: ViewMode = "split";

// ─── Login screen ───────────────────────────────────────────────────────────
function showLogin(): void {
  app.innerHTML = "";
  app.appendChild(renderLogin(showApp));
}

window.addEventListener("auth:expired", () => showLogin());

// ─── Utilities ──────────────────────────────────────────────────────────────
function ensureMdExt(path: string): string {
  return /\.md$/i.test(path) ? path : `${path}.md`;
}

function ensureBaseExt(path: string): string {
  return /\.base$/i.test(path) ? path : `${path}.base`;
}

function joinPath(dir: string, name: string): string {
  if (!dir) return name;
  return `${dir.replace(/\/$/, "")}/${name}`;
}

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

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
          <button id="daily-btn" title="Open today's daily note" class="icon-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Today
          </button>
        </div>
        <div class="topbar-center">
          <span id="current-title" class="current-title">—</span>
        </div>
        <div class="topbar-right">
          <span id="word-count" class="word-count"></span>
          <span id="save-status" class="save-status"></span>
          <button id="view-btn" class="icon-btn" title="Toggle view (Ctrl+E)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="16" rx="1"/><line x1="12" y1="4" x2="12" y2="20"/>
            </svg>
          </button>
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
          <div class="sidebar-header">
            <span>Files</span>
            <div class="sidebar-actions">
              <button id="new-file-btn" title="New file (Ctrl+N)" class="sidebar-icon-btn" aria-label="New file">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="12" x2="12" y2="18"/><line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
              </button>
              <button id="new-folder-btn" title="New folder (Ctrl+Shift+N)" class="sidebar-icon-btn" aria-label="New folder">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  <line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
                </svg>
              </button>
            </div>
          </div>
          <div id="file-tree" class="file-tree"></div>
        </aside>

        <div class="editor-pane" id="editor-pane"></div>

        <div class="preview-pane" id="preview-pane">
          <div id="preview-content" class="preview-content markdown-body"></div>
        </div>

        <aside class="right-sidebar" id="right-sidebar">
          <div class="right-sidebar-tabs">
            <button class="rsb-tab active" data-tab="outline" title="Outline">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/>
              </svg>
            </button>
            <button class="rsb-tab" data-tab="backlinks" title="Backlinks">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </button>
            <button class="rsb-tab" data-tab="tags" title="Tags">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                <line x1="7" y1="7" x2="7.01" y2="7"/>
              </svg>
            </button>
            <button id="rsb-toggle" class="rsb-toggle" title="Toggle right sidebar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/>
              </svg>
            </button>
          </div>
          <div class="right-sidebar-content" id="rsb-content"></div>
        </aside>
      </div>
    </div>
    <div id="search-overlay"></div>
    <div id="cmd-overlay-container"></div>
  `;

  const treeEl = document.getElementById("file-tree")!;
  const editorPaneEl = document.getElementById("editor-pane") as HTMLElement;
  const previewPaneEl = document.getElementById("preview-pane") as HTMLElement;
  const previewEl = document.getElementById("preview-content")!;
  const saveStatusEl = document.getElementById("save-status")!;
  const wordCountEl = document.getElementById("word-count")!;
  const titleEl = document.getElementById("current-title")!;
  const searchOverlay = document.getElementById("search-overlay")!;
  const cmdOverlayEl = document.getElementById("cmd-overlay-container")!;
  const rsbContent = document.getElementById("rsb-content")!;
  const rightSidebar = document.getElementById("right-sidebar")!;

  // ── Right sidebar panels ──────────────────────────────────────────────────
  const outlinePanel = createOutlinePanel((line) => {
    if (!editorView) return;
    const pos = editorView.state.doc.line(Math.min(line, editorView.state.doc.lines)).from;
    editorView.dispatch({
      selection: { anchor: pos },
      scrollIntoView: true,
    });
    editorView.focus();
  });

  const backlinksPanel = createBacklinksPanel((path) => void openFile(path));
  const tagsPane = createTagsPane((path) => void openFile(path));

  const panels: Record<string, HTMLElement> = {
    outline: outlinePanel.el,
    backlinks: backlinksPanel.el,
    tags: tagsPane.el,
  };
  let activeTab = "outline";
  rsbContent.appendChild(outlinePanel.el);

  // Tab switching
  rightSidebar.querySelectorAll<HTMLElement>(".rsb-tab[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabName = tab.dataset["tab"] ?? "";
      if (!tabName || tabName === activeTab) return;
      rightSidebar.querySelectorAll(".rsb-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      rsbContent.innerHTML = "";
      const panel = panels[tabName];
      if (panel) rsbContent.appendChild(panel);
      activeTab = tabName;
      if (tabName === "tags") void tagsPane.refresh();
    });
  });

  // Toggle right sidebar visibility
  let rsbVisible = true;
  document.getElementById("rsb-toggle")!.addEventListener("click", () => {
    rsbVisible = !rsbVisible;
    rightSidebar.classList.toggle("collapsed", !rsbVisible);
  });

  // ── Editor ──────────────────────────────────────────────────────────────
  editorView = createEditor(
    editorPaneEl,
    "",
    (doc) => {
      isDirty = true;
      setStatus("editing");
      updatePreview(doc);
      updateWordCount(doc);
      scheduleSave();
    },
    () => {
      if (currentPath) doSave();
    }
  );

  attachWikilinkHandlers(previewEl, openFile);
  attachCheckboxHandlers(previewEl, (lineIndex, checked) => {
    if (!editorView || !currentPath) return;
    const doc = getEditorContent(editorView);
    const lines = doc.split("\n");
    if (lineIndex < 0 || lineIndex >= lines.length) return;
    const line = lines[lineIndex] ?? "";
    const updated = checked
      ? line.replace(/- \[ \]/, "- [x]")
      : line.replace(/- \[x\]/i, "- [ ]");
    if (updated !== line) {
      lines[lineIndex] = updated;
      const newDoc = lines.join("\n");
      setEditorContent(editorView, newDoc);
      isDirty = true;
      scheduleSave();
    }
  });

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
        updateWordCount("");
      }
      renderTree(treeEl, openFile, activePathRef);
    },
    onMove: (oldPath, newPath) => {
      if (currentPath === oldPath) {
        currentPath = newPath;
        activePathRef.current = newPath;
        titleEl.textContent = displayName(newPath);
      }
      renderTree(treeEl, openFile, activePathRef);
    },
    onRename: (path) => void renameFilePrompt(path),
    onDuplicate: (path) => void duplicateFile(path),
    onMovePrompt: (path) =>
      openMoveFilePalette(path, (oldPath, newPath) => {
        if (currentPath === oldPath) {
          currentPath = newPath;
          activePathRef.current = newPath;
          titleEl.textContent = displayName(newPath);
        }
        renderTree(treeEl, openFile, activePathRef);
      }),
    onNewFileHere: (dirPath) => void newFilePrompt(dirPath),
    onNewFolderHere: (dirPath) => void newFolderPrompt(dirPath),
  });
  renderTree(treeEl, openFile, activePathRef);
  startTreeAutoRefresh(treeEl, openFile, activePathRef, 5000);

  // ── Search panel ─────────────────────────────────────────────────────────
  const { el: searchEl, open: openSearch } = createSearchPanel(
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
        id: "new-file",
        label: "Create new file",
        description: "Ctrl+N",
        action: () => void newFilePrompt(""),
      },
      {
        id: "new-base",
        label: "Create new base file",
        description: "Create a .base query/table file",
        action: () => void newBaseFilePrompt(""),
      },
      {
        id: "new-folder",
        label: "Create new folder",
        description: "Ctrl+Shift+N",
        action: () => void newFolderPrompt(""),
      },
      {
        id: "daily-note",
        label: "Open today's daily note",
        description: `Daily/${todayIso()}.md`,
        action: () => void openDailyNote(),
      },
      {
        id: "rename-file",
        label: "Rename current file",
        description: currentPath ? `F2 · ${currentPath}` : "No file open",
        action: () => {
          if (!currentPath) { alert("No file is currently open."); return; }
          void renameFilePrompt(currentPath);
        },
      },
      {
        id: "duplicate-file",
        label: "Duplicate current file",
        description: currentPath ? currentPath : "No file open",
        action: () => {
          if (!currentPath) { alert("No file is currently open."); return; }
          void duplicateFile(currentPath);
        },
      },
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
              titleEl.textContent = displayName(newPath);
            }
            renderTree(treeEl, openFile, activePathRef);
          });
        },
      },
      {
        id: "toggle-view",
        label: "Toggle editor / preview view",
        description: "Ctrl+E",
        action: () => cycleViewMode(),
      },
      {
        id: "bold",
        label: "Bold selection",
        description: "Ctrl+B",
        action: () => { if (editorView) boldSelection(editorView); },
      },
      {
        id: "italic",
        label: "Italic selection",
        description: "Ctrl+I",
        action: () => { if (editorView) italicSelection(editorView); },
      },
      {
        id: "wikilink",
        label: "Wrap selection as [[wikilink]]",
        description: "Ctrl+L",
        action: () => { if (editorView) wikilinkSelection(editorView); },
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
  document.getElementById("daily-btn")!.addEventListener("click", () => void openDailyNote());
  document.getElementById("new-file-btn")!.addEventListener("click", () => void newFilePrompt(""));
  document.getElementById("new-folder-btn")!.addEventListener("click", () => void newFolderPrompt(""));
  document.getElementById("view-btn")!.addEventListener("click", () => cycleViewMode());

  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const typingInField = isTypingInField(e.target);

    if (mod && e.key === "k") {
      e.preventDefault();
      openSearch();
    } else if (mod && e.key === "p") {
      e.preventDefault();
      openCmdPalette();
    } else if (mod && e.shiftKey && (e.key === "N" || e.key === "n")) {
      e.preventDefault();
      void newFolderPrompt("");
    } else if (mod && (e.key === "n" || e.key === "N") && !e.shiftKey) {
      e.preventDefault();
      void newFilePrompt("");
    } else if (mod && (e.key === "e" || e.key === "E")) {
      e.preventDefault();
      cycleViewMode();
    } else if (e.key === "F2" && !typingInField && currentPath) {
      e.preventDefault();
      void renameFilePrompt(currentPath);
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

  // ── Status / word count helpers ───────────────────────────────────────────
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

  function updateWordCount(text: string): void {
    const words = countWords(text);
    const chars = text.length;
    wordCountEl.textContent = currentPath ? `${words} words · ${chars} chars` : "";
  }

  function displayName(path: string): string {
    return path.split("/").pop()?.replace(/\.(md|base)$/, "") ?? path;
  }

  function cycleViewMode(): void {
    if (currentPath?.endsWith(".base")) {
      const inSourceMode = !editorPaneEl.classList.contains("hidden");
      if (inSourceMode) {
        // Switch back to table view, saving first if needed
        editorPaneEl.classList.add("hidden");
        editorPaneEl.classList.remove("full-width");
        previewPaneEl.classList.remove("hidden");
        previewPaneEl.classList.add("full-width");
        const doRefresh = () => { if (baseTableRefresh) void baseTableRefresh(); };
        if (isDirty && currentPath) {
          void doSave().then(doRefresh);
        } else {
          doRefresh();
        }
      } else {
        void switchToBaseSource();
      }
      return;
    }
    const next: Record<ViewMode, ViewMode> = {
      split: "editor",
      editor: "preview",
      preview: "split",
    };
    viewMode = next[viewMode];
    applyViewMode();
  }

  function applyViewMode(): void {
    editorPaneEl.classList.toggle("hidden", viewMode === "preview");
    previewPaneEl.classList.toggle("hidden", viewMode === "editor");
    editorPaneEl.classList.toggle("full-width", viewMode === "editor");
    previewPaneEl.classList.toggle("full-width", viewMode === "preview");
  }
  applyViewMode();

  async function switchToBaseSource(): Promise<void> {
    if (!currentPath?.endsWith(".base")) return;
    try {
      const content = await getFile(currentPath);
      if (editorView) {
        setEditorContent(editorView, content);
        isDirty = false;
        updateWordCount(content);
      }
    } catch {
      setStatus("error", "Failed to load file");
      return;
    }
    editorPaneEl.classList.remove("hidden");
    editorPaneEl.classList.add("full-width");
    previewPaneEl.classList.add("hidden");
    previewPaneEl.classList.remove("full-width");
  }

  // ── Preview ────────────────────────────────────────────────────────────
  let previewDebounce: ReturnType<typeof setTimeout> | null = null;
  function updatePreview(doc: string): void {
    if (previewDebounce) clearTimeout(previewDebounce);
    previewDebounce = null;
    // .base files render the structured view in the preview pane; never let
    // the markdown preview overwrite it.
    if (currentPath?.endsWith(".base")) return;
    previewDebounce = setTimeout(() => {
      const { html, isRtl } = renderMarkdown(doc);
      previewEl.innerHTML = html;
      previewEl.setAttribute("dir", isRtl ? "rtl" : "ltr");
      editorPaneEl.setAttribute("dir", isRtl ? "rtl" : "ltr");
      processEmbeddedBases(previewEl, {
        onOpenNote: openFile,
        onRefresh: () => {},
      });
      void renderMermaidBlocks(previewEl);
      outlinePanel.update(doc);
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

    if (currentPath && isDirty && editorView) {
      await doSave();
    }

    currentPath = path;
    activePathRef.current = path;
    setActiveInTree(path);
    titleEl.textContent = displayName(path);
    setStatus("idle");

    // .base files open in table view with optional source editing
    if (path.endsWith(".base")) {
      // Load YAML into editor so source mode is ready immediately
      try {
        const content = await getFile(path);
        if (editorView) {
          setEditorContent(editorView, content);
          isDirty = false;
        }
      } catch {
        setStatus("error", "Failed to load file");
        return;
      }

      editorPaneEl.classList.add("hidden");
      editorPaneEl.classList.remove("full-width");
      previewPaneEl.classList.remove("hidden");
      previewPaneEl.classList.add("full-width");
      previewEl.innerHTML = "";

      const { el, refresh: refreshTable } = createBaseTableView(path, {
        onOpenNote: (notePath) => void openFile(notePath),
        onRefresh: () => {},
        onToggleSource: () => void switchToBaseSource(),
      });
      previewEl.appendChild(el);
      baseTableRefresh = refreshTable;
      updateWordCount("");
      return;
    }

    // restore normal view mode for .md files
    baseTableRefresh = null;
    applyViewMode();

    try {
      const content = await getFile(path);
      if (editorView) {
        setEditorContent(editorView, content);
        isDirty = false;
        updatePreview(content);
        updateWordCount(content);
        outlinePanel.update(content);
      }
    } catch {
      setStatus("error", "Failed to load file");
    }

    // Update backlinks for newly opened file
    void backlinksPanel.update(path);
  }

  // ── File operations ─────────────────────────────────────────────────────
  async function newFilePrompt(dirPath: string): Promise<void> {
    const suggested = dirPath ? `${dirPath}/untitled.md` : "untitled.md";
    const input = prompt("New file path (under vault root):", suggested);
    if (input === null) return;
    const trimmed = input.trim();
    if (!trimmed) return;
    const fullPath = ensureMdExt(trimmed);
    try {
      const created = await createFile(fullPath, "");
      renderTree(treeEl, openFile, activePathRef);
      await openFile(created);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function newBaseFilePrompt(dirPath: string): Promise<void> {
    const suggested = dirPath ? `${dirPath}/untitled.base` : "untitled.base";
    const rawInput = prompt("New base file path (under vault root):", suggested);
    if (rawInput === null) return;
    const trimmed = rawInput.trim();
    if (!trimmed) return;
    const fullPath = ensureBaseExt(trimmed);
    // Default template: works out-of-the-box because columns reference
    // built-in file.* fields. Includes both a Table and a Cards view so
    // users can see card-list rendering immediately.
    const template =
      "views:\n" +
      "  - name: Table\n" +
      "    type: table\n" +
      "    columns: [file.name, file.folder, file.mtime]\n" +
      "  - name: Cards\n" +
      "    type: list\n" +
      "    columns: [file.name, file.folder]\n";
    try {
      const created = await createFile(fullPath, template);
      renderTree(treeEl, openFile, activePathRef);
      await openFile(created);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function newFolderPrompt(parent: string): Promise<void> {
    const suggested = parent ? `${parent}/new-folder` : "new-folder";
    const input = prompt("New folder path:", suggested);
    if (input === null) return;
    const trimmed = input.trim();
    if (!trimmed) return;
    try {
      await createFolder(trimmed);
      renderTree(treeEl, openFile, activePathRef);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Create folder failed");
    }
  }

  async function renameFilePrompt(oldPath: string): Promise<void> {
    const input = prompt("Rename to (new path):", oldPath);
    if (input === null) return;
    const trimmed = input.trim();
    if (!trimmed || trimmed === oldPath) return;
    const newPath = ensureMdExt(trimmed);
    try {
      const resolved = await renameFile(oldPath, newPath);
      if (currentPath === oldPath) {
        currentPath = resolved;
        activePathRef.current = resolved;
        titleEl.textContent = displayName(resolved);
      }
      renderTree(treeEl, openFile, activePathRef);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Rename failed");
    }
  }

  async function duplicateFile(srcPath: string): Promise<void> {
    try {
      const newPath = await copyFile(srcPath);
      renameFileFollowup(newPath);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Duplicate failed");
    }
  }

  function renameFileFollowup(newPath: string): void {
    renderTree(treeEl, openFile, activePathRef);
    void openFile(newPath);
  }

  async function openDailyNote(): Promise<void> {
    const path = joinPath("Daily", `${todayIso()}.md`);
    try {
      // Try to open; if not found, create.
      await getFile(path);
      await openFile(path);
    } catch {
      try {
        const created = await createFile(path, `# ${todayIso()}\n\n`);
        renderTree(treeEl, openFile, activePathRef);
        await openFile(created);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Create daily note failed");
      }
    }
  }
}

function isTypingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if (target.isContentEditable) return true;
  // CodeMirror editor content is contenteditable, so typing inside editor
  // is covered by isContentEditable. F2 still should work when cursor is in
  // the editor — but renaming via F2 while editing is awkward; keep guarded.
  return false;
}

// ─── Init ────────────────────────────────────────────────────────────────────
async function init(): Promise<void> {
  const res = await fetch("/api/tree");
  if (res.status === 401) {
    showLogin();
  } else {
    showApp();
  }
}

init();
