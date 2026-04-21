import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet } from "@codemirror/view";
import { EditorState, Extension, RangeSetBuilder } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { keymap, highlightSpecialChars, drawSelection, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting, bracketMatching } from "@codemirror/language";
import { tags } from "@lezer/highlight";

// Wikilink decoration — highlights [[text]] in the editor
const wikilinkMark = Decoration.mark({ class: "cm-wikilink" });
const wikilinkRe = /\[\[([^\]]+)\]\]/g;

const wikilinkPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    let m: RegExpExecArray | null;
    wikilinkRe.lastIndex = 0;
    while ((m = wikilinkRe.exec(text)) !== null) {
      builder.add(from + m.index, from + m.index + m[0].length, wikilinkMark);
    }
  }
  return builder.finish();
}

// Editor chrome — all values reference CSS variables so theme switching is instant
const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "14px",
    backgroundColor: "var(--ob-bg)",
    color: "var(--ob-text)",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "'Geist Mono', 'JetBrains Mono', 'Fira Code', monospace",
  },
  ".cm-content": {
    caretColor: "var(--ob-accent)",
    padding: "4px 0",
  },
  ".cm-line": {
    padding: "0 14px",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--ob-accent)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--ob-accent) 22%, transparent) !important",
  },
  ".cm-content ::selection": {
    backgroundColor: "color-mix(in srgb, var(--ob-accent) 30%, transparent) !important",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--ob-surface) 40%, transparent)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--ob-surface)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--ob-bg2)",
    color: "var(--ob-muted)",
    border: "none",
    borderRight: "1px solid var(--ob-border)",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 10px 0 6px",
    minWidth: "36px",
  },
  ".cm-matchingBracket": {
    backgroundColor: "color-mix(in srgb, var(--ob-accent) 20%, transparent)",
    outline: "1px solid var(--ob-accent)",
  },
  ".cm-nonmatchingBracket": {
    backgroundColor: "color-mix(in srgb, var(--ob-red) 20%, transparent)",
  },
  ".cm-searchMatch": {
    backgroundColor: "color-mix(in srgb, var(--ob-yellow) 30%, transparent)",
    outline: "1px solid var(--ob-yellow)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "color-mix(in srgb, var(--ob-accent) 40%, transparent)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--ob-bg2)",
    border: "1px solid var(--ob-border)",
    color: "var(--ob-text)",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
  },
  ".cm-completionMatchedText": {
    textDecoration: "none",
    color: "var(--ob-accent)",
    fontWeight: "bold",
  },
  ".cm-completionDetail": {
    marginLeft: "8px",
    color: "var(--ob-muted)",
    fontStyle: "italic",
  },
  ".cm-panels": {
    backgroundColor: "var(--ob-bg2)",
    color: "var(--ob-text)",
  },
  ".cm-panels.cm-panels-top": {
    borderBottom: "1px solid var(--ob-border)",
  },
  ".cm-panels.cm-panels-bottom": {
    borderTop: "1px solid var(--ob-border)",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--ob-surface)",
    border: "1px solid var(--ob-border)",
    color: "var(--ob-muted)",
  },
});

// Syntax highlight style — uses CSS vars so it updates with theme changes
const markdownHighlight = HighlightStyle.define([
  { tag: [tags.heading1, tags.heading2, tags.heading3], fontWeight: "bold", color: "var(--ob-text)" },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: "bold", color: "var(--ob-muted)" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through", color: "var(--ob-muted)" },
  { tag: [tags.link, tags.url], color: "var(--ob-accent)", textDecoration: "underline" },
  { tag: tags.monospace, color: "var(--ob-green)" },
  { tag: tags.meta, color: "var(--ob-muted)" },
  { tag: tags.comment, color: "var(--ob-muted)", fontStyle: "italic" },
  { tag: tags.keyword, color: "var(--ob-accent2)", fontWeight: "bold" },
  { tag: [tags.atom, tags.bool], color: "var(--ob-accent)" },
  { tag: tags.number, color: "var(--ob-yellow)" },
  { tag: tags.string, color: "var(--ob-green)" },
  { tag: tags.operator, color: "var(--ob-muted)" },
  { tag: tags.tagName, color: "var(--ob-red)" },
  { tag: tags.attributeName, color: "var(--ob-yellow)" },
  { tag: tags.attributeValue, color: "var(--ob-green)" },
  { tag: tags.invalid, color: "var(--ob-red)", textDecoration: "underline wavy" },
  { tag: tags.processingInstruction, color: "var(--ob-muted)" },
  { tag: tags.contentSeparator, color: "var(--ob-border)" },
]);

function baseExtensions(onChange: (doc: string) => void, onSave: () => void): Extension[] {
  return [
    highlightSpecialChars(),
    history(),
    drawSelection(),
    highlightActiveLine(),
    bracketMatching(),
    syntaxHighlighting(markdownHighlight),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    wikilinkPlugin,
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab,
      {
        key: "Mod-s",
        run() {
          onSave();
          return true;
        },
      },
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString());
    }),
    editorTheme,
  ];
}

export function createEditor(
  parent: HTMLElement,
  initialDoc: string,
  onChange: (doc: string) => void,
  onSave: () => void
): EditorView {
  return new EditorView({
    state: EditorState.create({
      doc: initialDoc,
      extensions: baseExtensions(onChange, onSave),
    }),
    parent,
  });
}

export function setEditorContent(view: EditorView, content: string): void {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: content },
  });
}

export function getEditorContent(view: EditorView): string {
  return view.state.doc.toString();
}
