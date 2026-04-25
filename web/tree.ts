import { TreeNode, getTree, deleteFile, moveFile } from "./api.ts";

let lastTreeJson = "";
let refreshTimer: ReturnType<typeof setInterval> | null = null;

// Callbacks set by main.ts so tree can notify the app of file operations
interface TreeCallbacks {
  onDelete?: (path: string) => void;
  onMove?: (oldPath: string, newPath: string) => void;
  onRename?: (path: string) => void;
  onDuplicate?: (path: string) => void;
  onMovePrompt?: (path: string) => void;
  onNewFileHere?: (dirPath: string) => void;
  onNewFolderHere?: (dirPath: string) => void;
}

const callbacks: TreeCallbacks = {};

export function setTreeCallbacks(cbs: TreeCallbacks): void {
  Object.assign(callbacks, cbs);
}

export function renderTree(
  container: HTMLElement,
  onSelect: (path: string) => void,
  activePathRef: { current: string }
): void {
  // Capture open-dir state from the existing DOM before any mutation, so we
  // can restore it after the rebuild. On first render the tree is empty and
  // this is just an empty set.
  const openPaths = getOpenDirPaths(container);
  const isEmpty = container.children.length === 0;
  if (isEmpty) {
    container.innerHTML = '<div class="tree-loading">Loading…</div>';
  }

  getTree()
    .then((nodes) => {
      container.innerHTML = "";
      container.appendChild(buildTreeEl(nodes, onSelect, activePathRef));
      restoreOpenDirPaths(container, openPaths);
      setActiveInTree(activePathRef.current);
      lastTreeJson = JSON.stringify(nodes);
    })
    .catch(() => {
      if (isEmpty) {
        container.innerHTML = '<div class="tree-error">Failed to load files</div>';
      }
    });
}

function getOpenDirPaths(container: HTMLElement): Set<string> {
  const open = new Set<string>();
  container.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((el) => {
    if (el.dataset["path"]) open.add(el.dataset["path"]);
  });
  return open;
}

function restoreOpenDirPaths(container: HTMLElement, paths: Set<string>): void {
  container.querySelectorAll<HTMLDetailsElement>("details[data-path]").forEach((el) => {
    if (el.dataset["path"] && paths.has(el.dataset["path"])) el.open = true;
  });
}

export function startTreeAutoRefresh(
  container: HTMLElement,
  onSelect: (path: string) => void,
  activePathRef: { current: string },
  intervalMs = 5000
): void {
  if (refreshTimer !== null) clearInterval(refreshTimer);
  refreshTimer = setInterval(async () => {
    if (document.visibilityState === "hidden") return;
    let nodes: TreeNode[];
    try { nodes = await getTree(); } catch { return; }
    const newJson = JSON.stringify(nodes);
    if (newJson === lastTreeJson) return;
    lastTreeJson = newJson;
    const openPaths = getOpenDirPaths(container);
    container.innerHTML = "";
    container.appendChild(buildTreeEl(nodes, onSelect, activePathRef));
    restoreOpenDirPaths(container, openPaths);
    setActiveInTree(activePathRef.current);
  }, intervalMs);
}

// ── Context menu ─────────────────────────────────────────────────────────────

let activeContextMenu: HTMLElement | null = null;

function removeContextMenu(): void {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
}

interface MenuItem {
  label: string;
  action: () => void | Promise<void>;
  danger?: boolean;
}

function showMenu(x: number, y: number, items: MenuItem[]): void {
  removeContextMenu();

  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  for (const it of items) {
    const btn = document.createElement("button");
    btn.className = "context-menu-item" + (it.danger ? " context-menu-item--danger" : "");
    btn.textContent = it.label;
    btn.addEventListener("click", () => {
      removeContextMenu();
      void it.action();
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  activeContextMenu = menu;

  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = `${x - rect.width}px`;
  if (rect.bottom > window.innerHeight) menu.style.top = `${y - rect.height}px`;
}

function showFileContextMenu(x: number, y: number, filePath: string): void {
  showMenu(x, y, [
    { label: "Rename…", action: () => callbacks.onRename?.(filePath) },
    { label: "Duplicate", action: () => callbacks.onDuplicate?.(filePath) },
    { label: "Move to…", action: () => callbacks.onMovePrompt?.(filePath) },
    {
      label: "Delete",
      danger: true,
      action: async () => {
        const name = filePath.split("/").pop() ?? filePath;
        if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
        try {
          await deleteFile(filePath);
          callbacks.onDelete?.(filePath);
        } catch (err) {
          alert(err instanceof Error ? err.message : "Delete failed");
        }
      },
    },
  ]);
}

function showFolderContextMenu(x: number, y: number, dirPath: string): void {
  showMenu(x, y, [
    { label: "New file here", action: () => callbacks.onNewFileHere?.(dirPath) },
    { label: "New folder here", action: () => callbacks.onNewFolderHere?.(dirPath) },
  ]);
}

document.addEventListener("click", removeContextMenu);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") removeContextMenu(); });

// ── Drag state ───────────────────────────────────────────────────────────────

let dragPath: string | null = null;

// ── Tree builder ─────────────────────────────────────────────────────────────

function buildTreeEl(
  nodes: TreeNode[],
  onSelect: (path: string) => void,
  activePathRef: { current: string }
): HTMLElement {
  const ul = document.createElement("ul");
  ul.className = "tree-list";

  for (const node of nodes) {
    const li = document.createElement("li");
    li.className = "tree-item";

    if (node.type === "directory") {
      const details = document.createElement("details");
      details.open = false;
      details.dataset["path"] = node.path;
      const summary = document.createElement("summary");
      summary.className = "tree-dir";
      summary.textContent = node.name;
      summary.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showFolderContextMenu(e.clientX, e.clientY, node.path);
      });
      details.appendChild(summary);

      if (node.children && node.children.length > 0) {
        details.appendChild(buildTreeEl(node.children, onSelect, activePathRef));
      }

      // Drop target
      details.addEventListener("dragover", (e) => {
        if (!dragPath) return;
        e.preventDefault();
        e.stopPropagation();
        details.classList.add("drag-over");
      });
      details.addEventListener("dragleave", (e) => {
        if (!details.contains(e.relatedTarget as Node)) {
          details.classList.remove("drag-over");
        }
      });
      details.addEventListener("drop", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        details.classList.remove("drag-over");
        if (!dragPath) return;
        const src = dragPath;
        dragPath = null;
        try {
          const newPath = await moveFile(src, node.path);
          callbacks.onMove?.(src, newPath);
        } catch (err) {
          alert(err instanceof Error ? err.message : "Move failed");
        }
      });

      li.appendChild(details);
    } else {
      const btn = document.createElement("button");
      btn.className = "tree-file";
      btn.dataset["path"] = node.path;
      btn.textContent = node.name.replace(/\.md$/, "");
      btn.title = node.path;
      btn.draggable = true;

      if (activePathRef.current === node.path) {
        btn.classList.add("active");
      }

      btn.addEventListener("click", () => {
        document
          .querySelectorAll(".tree-file.active")
          .forEach((el) => el.classList.remove("active"));
        btn.classList.add("active");
        activePathRef.current = node.path;
        onSelect(node.path);
      });

      btn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        showFileContextMenu(e.clientX, e.clientY, node.path);
      });

      btn.addEventListener("dragstart", (e) => {
        dragPath = node.path;
        e.dataTransfer!.effectAllowed = "move";
        btn.classList.add("dragging");
      });
      btn.addEventListener("dragend", () => {
        dragPath = null;
        btn.classList.remove("dragging");
        document.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
      });

      li.appendChild(btn);
    }

    ul.appendChild(li);
  }

  return ul;
}

export function setActiveInTree(path: string): void {
  document.querySelectorAll(".tree-file").forEach((el) => {
    const btn = el as HTMLButtonElement;
    btn.classList.toggle("active", btn.dataset["path"] === path);
  });

  // Auto-expand parent directories
  const activeBtns = document.querySelectorAll<HTMLButtonElement>(
    `.tree-file[data-path="${CSS.escape(path)}"]`
  );
  activeBtns.forEach((btn) => {
    let parent = btn.parentElement;
    while (parent) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      parent = parent.parentElement;
    }
  });
}

// Collect all directory paths from the tree for the command palette
export function getAllDirPaths(): string[] {
  const dirs: string[] = [""];  // root (empty string)
  document.querySelectorAll<HTMLDetailsElement>("details[data-path]").forEach((el) => {
    if (el.dataset["path"]) dirs.push(el.dataset["path"]);
  });
  return dirs;
}
