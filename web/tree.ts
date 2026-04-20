import { TreeNode, getTree } from "./api.ts";

export function renderTree(
  container: HTMLElement,
  onSelect: (path: string) => void,
  activePathRef: { current: string }
): void {
  container.innerHTML = '<div class="tree-loading">Loading…</div>';

  getTree()
    .then((nodes) => {
      container.innerHTML = "";
      container.appendChild(buildTreeEl(nodes, onSelect, activePathRef));
    })
    .catch(() => {
      container.innerHTML = '<div class="tree-error">Failed to load files</div>';
    });
}

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
      const summary = document.createElement("summary");
      summary.className = "tree-dir";
      summary.textContent = node.name;
      details.appendChild(summary);

      if (node.children && node.children.length > 0) {
        details.appendChild(buildTreeEl(node.children, onSelect, activePathRef));
      }
      li.appendChild(details);
    } else {
      const btn = document.createElement("button");
      btn.className = "tree-file";
      btn.dataset["path"] = node.path;
      btn.textContent = node.name.replace(/\.md$/, "");
      btn.title = node.path;

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
