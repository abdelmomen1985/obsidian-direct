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
import { LOCALES, applyDirectionToDocument, getLocale, setLocale, t, type Locale } from "./i18n.ts";

applyDirectionToDocument();

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
function ensureBaseExt(path: string): string {
  return /\.base$/i.test(path) ? path : `${path}.base`;
}

// For "new file" / "rename" prompts: leave any editable extension alone
// (.md or .base), and only default to .md when the user provided no
// recognized extension. Without this, typing `foo.base` gets turned into
// `foo.base.md` and is no longer recognized as a base file.
function ensureNoteExt(path: string): string {
  return /\.(md|base)$/i.test(path) ? path : `${path}.md`;
}

function isBasePath(path: string | null | undefined): path is string {
  return !!path && /\.base$/i.test(path);
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
  const curLocale = getLocale();
  app.innerHTML = `
    <div class="layout">
      <header class="topbar">
        <div class="topbar-left">
          <button id="search-btn" title="${t("topbar.searchTitle")}" class="icon-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            ${t("topbar.search")}
          </button>
          <button id="cmd-btn" title="${t("topbar.commandsTitle")}" class="icon-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 6 10 12 4 18"/><line x1="12" y1="18" x2="20" y2="18"/>
            </svg>
            ${t("topbar.commands")}
          </button>
          <button id="daily-btn" title="${t("topbar.todayTitle")}" class="icon-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            ${t("topbar.today")}
          </button>
        </div>
        <div class="topbar-center">
          <span id="current-title" class="current-title">${t("topbar.untitled")}</span>
        </div>
        <div class="topbar-right">
          <span id="word-count" class="word-count"></span>
          <span id="save-status" class="save-status"></span>
          <button id="view-btn" class="icon-btn" title="${t("topbar.toggleViewTitle")}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="16" rx="1"/><line x1="12" y1="4" x2="12" y2="20"/>
            </svg>
          </button>
          <button id="rsb-toggle-top" class="icon-btn" title="${t("topbar.toggleRsbTitle")}" aria-label="${t("topbar.toggleRsbTitle")}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/>
            </svg>
          </button>
          <button id="theme-btn" class="icon-btn" title="${t("topbar.themeTitle")}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
          </button>
          <div class="lang-switcher">
            <button id="lang-btn" class="icon-btn" title="${t("topbar.langTitle")}" aria-haspopup="true" aria-expanded="false">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"/>
              </svg>
              <span id="lang-btn-label">${curLocale.toUpperCase()}</span>
            </button>
            <div id="lang-menu" class="lang-menu hidden" role="menu">
              ${LOCALES.map((l) => `
                <button type="button" class="lang-menu-item${l.code === curLocale ? " active" : ""}" data-lang="${l.code}" role="menuitemradio" aria-checked="${l.code === curLocale}">${l.label}</button>
              `).join("")}
            </div>
          </div>
          <button id="logout-btn" class="icon-btn">${t("topbar.logout")}</button>
        </div>
      </header>

      <div class="main-area">
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-header">
            <span>${t("sidebar.files")}</span>
            <div class="sidebar-actions">
              <button id="new-file-btn" title="${t("sidebar.newFileTitle")}" class="sidebar-icon-btn" aria-label="${t("sidebar.newFileAria")}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="12" x2="12" y2="18"/><line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
              </button>
              <button id="new-folder-btn" title="${t("sidebar.newFolderTitle")}" class="sidebar-icon-btn" aria-label="${t("sidebar.newFolderAria")}">
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
            <button class="rsb-tab active" data-tab="outline" title="${t("panel.outline")}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/>
              </svg>
            </button>
            <button class="rsb-tab" data-tab="backlinks" title="${t("panel.backlinks")}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </button>
            <button class="rsb-tab" data-tab="tags" title="${t("panel.tags")}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                <line x1="7" y1="7" x2="7.01" y2="7"/>
              </svg>
            </button>
            <button id="rsb-toggle" class="rsb-toggle" title="${t("topbar.toggleRsbTitle")}">
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

  // Toggle right sidebar visibility — invokable from inside the sidebar,
  // from a persistent button in the topbar (so it stays reachable when the
  // sidebar is collapsed to 0 width), and from the command palette.
  let rsbVisible = true;
  function toggleRightSidebar(): void {
    rsbVisible = !rsbVisible;
    rightSidebar.classList.toggle("collapsed", !rsbVisible);
  }
  document.getElementById("rsb-toggle")!.addEventListener("click", toggleRightSidebar);
  document.getElementById("rsb-toggle-top")!.addEventListener("click", toggleRightSidebar);

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
        titleEl.textContent = t("topbar.untitled");
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
        label: t("cmd.newFile.label"),
        description: t("cmd.newFile.desc"),
        action: () => void newFilePrompt(""),
      },
      {
        id: "new-base",
        label: t("cmd.newBase.label"),
        description: t("cmd.newBase.desc"),
        action: () => void newBaseFilePrompt(""),
      },
      {
        id: "new-folder",
        label: t("cmd.newFolder.label"),
        description: t("cmd.newFolder.desc"),
        action: () => void newFolderPrompt(""),
      },
      {
        id: "daily-note",
        label: t("cmd.daily.label"),
        description: `Daily/${todayIso()}.md`,
        action: () => void openDailyNote(),
      },
      {
        id: "rename-file",
        label: t("cmd.rename.label"),
        description: currentPath ? t("cmd.rename.descKey", { path: currentPath }) : t("cmd.noFileOpen"),
        action: () => {
          if (!currentPath) { alert(t("cmd.noFileAlert")); return; }
          void renameFilePrompt(currentPath);
        },
      },
      {
        id: "duplicate-file",
        label: t("cmd.duplicate.label"),
        description: currentPath ? currentPath : t("cmd.noFileOpen"),
        action: () => {
          if (!currentPath) { alert(t("cmd.noFileAlert")); return; }
          void duplicateFile(currentPath);
        },
      },
      {
        id: "move-file",
        label: t("cmd.move.label"),
        description: currentPath ? t("cmd.move.descCurrent", { path: currentPath }) : t("cmd.noFileOpen"),
        action: () => {
          if (!currentPath) { alert(t("cmd.noFileAlert")); return; }
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
        label: t("cmd.toggleView.label"),
        description: t("cmd.toggleView.desc"),
        action: () => cycleViewMode(),
      },
      {
        id: "bold",
        label: t("cmd.bold.label"),
        description: t("cmd.bold.desc"),
        action: () => { if (editorView) boldSelection(editorView); },
      },
      {
        id: "italic",
        label: t("cmd.italic.label"),
        description: t("cmd.italic.desc"),
        action: () => { if (editorView) italicSelection(editorView); },
      },
      {
        id: "wikilink",
        label: t("cmd.wikilink.label"),
        description: t("cmd.wikilink.desc"),
        action: () => { if (editorView) wikilinkSelection(editorView); },
      },
      {
        id: "search",
        label: t("cmd.search.label"),
        description: t("cmd.search.desc"),
        action: () => openSearch(),
      },
      {
        id: "toggle-right-sidebar",
        label: rsbVisible ? t("cmd.rsb.hide") : t("cmd.rsb.show"),
        description: t("cmd.rsb.desc"),
        action: () => toggleRightSidebar(),
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
    const idx = all.findIndex((th) => th.name === themeManager.getCurrent());
    const next = all[(idx + 1) % all.length]!;
    const cur = all.find((th) => th.name === themeManager.getCurrent())?.label ?? "";
    themeBtn.title = t("topbar.themeOf", { current: cur, next: next.label });
  };
  updateThemeTitle();
  themeBtn.addEventListener("click", () => {
    const all = themeManager.getThemes();
    const idx = all.findIndex((th) => th.name === themeManager.getCurrent());
    const next = all[(idx + 1) % all.length]!;
    themeManager.apply(next.name);
    updateThemeTitle();
  });

  // ── Language switcher ─────────────────────────────────────────────────────
  const langBtn = document.getElementById("lang-btn")!;
  const langMenu = document.getElementById("lang-menu")!;
  const closeLangMenu = () => {
    langMenu.classList.add("hidden");
    langBtn.setAttribute("aria-expanded", "false");
  };
  langBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = langMenu.classList.toggle("hidden");
    langBtn.setAttribute("aria-expanded", String(!open));
  });
  langMenu.querySelectorAll<HTMLButtonElement>("[data-lang]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.dataset["lang"] as Locale | undefined;
      if (!code) return;
      if (code === getLocale()) { closeLangMenu(); return; }
      setLocale(code);
      // Re-render the entire app so all text reflects the new locale.
      showApp();
    });
  });
  document.addEventListener("click", (e) => {
    if (!langMenu.contains(e.target as Node) && !langBtn.contains(e.target as Node)) {
      closeLangMenu();
    }
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
      editing: t("save.editing"),
      saving: t("save.saving"),
      saved: t("save.saved"),
      error: msg ?? t("save.error"),
    };
    saveStatusEl.textContent = labels[status];
    saveStatusEl.className = `save-status status-${status}`;
  }

  function updateWordCount(text: string): void {
    const words = countWords(text);
    const chars = text.length;
    wordCountEl.textContent = currentPath ? t("stats.words", { words, chars }) : "";
  }

  function displayName(path: string): string {
    return path.split("/").pop()?.replace(/\.(md|base)$/i, "") ?? path;
  }

  function cycleViewMode(): void {
    if (isBasePath(currentPath)) {
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
    const path = currentPath;
    if (!isBasePath(path)) return;
    try {
      const content = await getFile(path);
      if (editorView) {
        setEditorContent(editorView, content);
        isDirty = false;
        updateWordCount(content);
      }
    } catch {
      setStatus("error", t("save.loadFailed"));
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
    if (isBasePath(currentPath)) return;
    const pathAtSchedule = currentPath;
    previewDebounce = setTimeout(() => {
      // If the user switched to a different (or .base) file during the debounce,
      // skip the render so we don't clobber the other file's pane contents.
      if (currentPath !== pathAtSchedule || isBasePath(currentPath)) return;
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
      setStatus("error", err instanceof Error ? err.message : t("save.saveFailed"));
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
    if (isBasePath(path)) {
      // Swap the layout to "base view" up front so any in-flight markdown
      // preview timers from the previously-open note don't race with this
      // file's table rendering.
      if (previewDebounce) {
        clearTimeout(previewDebounce);
        previewDebounce = null;
      }
      editorPaneEl.classList.add("hidden");
      editorPaneEl.classList.remove("full-width");
      previewPaneEl.classList.remove("hidden");
      previewPaneEl.classList.add("full-width");
      previewEl.innerHTML = "";

      // Load YAML into editor so source mode is ready immediately
      try {
        const content = await getFile(path);
        if (editorView) {
          setEditorContent(editorView, content);
          isDirty = false;
        }
      } catch {
        setStatus("error", t("save.loadFailed"));
        return;
      }

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
      setStatus("error", t("save.loadFailed"));
    }

    // Update backlinks for newly opened file
    void backlinksPanel.update(path);
  }

  // ── File operations ─────────────────────────────────────────────────────
  async function newFilePrompt(dirPath: string): Promise<void> {
    const suggested = dirPath ? `${dirPath}/untitled.md` : "untitled.md";
    const input = prompt(t("prompt.newFile"), suggested);
    if (input === null) return;
    const trimmed = input.trim();
    if (!trimmed) return;
    const fullPath = ensureNoteExt(trimmed);
    try {
      const created = await createFile(fullPath, "");
      renderTree(treeEl, openFile, activePathRef);
      await openFile(created);
    } catch (err) {
      alert(err instanceof Error ? err.message : t("alert.createFailed"));
    }
  }

  async function newBaseFilePrompt(dirPath: string): Promise<void> {
    const suggested = dirPath ? `${dirPath}/untitled.base` : "untitled.base";
    const rawInput = prompt(t("prompt.newBase"), suggested);
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
      alert(err instanceof Error ? err.message : t("alert.createFailed"));
    }
  }

  async function newFolderPrompt(parent: string): Promise<void> {
    const suggested = parent ? `${parent}/new-folder` : "new-folder";
    const input = prompt(t("prompt.newFolder"), suggested);
    if (input === null) return;
    const trimmed = input.trim();
    if (!trimmed) return;
    try {
      await createFolder(trimmed);
      renderTree(treeEl, openFile, activePathRef);
    } catch (err) {
      alert(err instanceof Error ? err.message : t("alert.createFolderFailed"));
    }
  }

  async function renameFilePrompt(oldPath: string): Promise<void> {
    const input = prompt(t("prompt.rename"), oldPath);
    if (input === null) return;
    const trimmed = input.trim();
    if (!trimmed || trimmed === oldPath) return;
    const newPath = ensureNoteExt(trimmed);
    try {
      const resolved = await renameFile(oldPath, newPath);
      const wasActive = currentPath === oldPath;
      if (wasActive) {
        // Flush unsaved edits to the new path BEFORE we null currentPath.
        // openFile's dirty-save guard (`if (currentPath && isDirty …)`) would
        // otherwise skip the save and the upcoming reload-from-disk inside
        // openFile would silently clobber the user's in-flight changes.
        if (isDirty && editorView) {
          currentPath = resolved;
          await doSave();
        }
        // Reset currentPath so openFile's "same path" guard doesn't skip the
        // reload — needed because .md→.base (or vice versa) switches view
        // modes and the old editor/preview content would otherwise linger.
        currentPath = null;
        activePathRef.current = resolved;
      }
      renderTree(treeEl, openFile, activePathRef);
      if (wasActive) await openFile(resolved);
    } catch (err) {
      alert(err instanceof Error ? err.message : t("alert.renameFailed"));
    }
  }

  async function duplicateFile(srcPath: string): Promise<void> {
    try {
      const newPath = await copyFile(srcPath);
      renameFileFollowup(newPath);
    } catch (err) {
      alert(err instanceof Error ? err.message : t("alert.duplicateFailed"));
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
        alert(err instanceof Error ? err.message : t("alert.dailyFailed"));
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
