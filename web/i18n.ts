// Lightweight i18n for Obsidian Direct.
//
// Two locales are shipped today (English + Arabic). Translations are flat
// dotted keys (e.g. "topbar.search") with optional `{name}` placeholders.
// Locale + direction are persisted in localStorage and applied to the root
// `<html>` element so the UI flips between LTR and RTL.

export type Locale = "en" | "ar";

interface LocaleMeta {
  code: Locale;
  label: string;
  dir: "ltr" | "rtl";
  htmlLang: string;
}

export const LOCALES: LocaleMeta[] = [
  { code: "en", label: "English",   dir: "ltr", htmlLang: "en" },
  { code: "ar", label: "العربية",   dir: "rtl", htmlLang: "ar" },
];

const STORAGE_KEY = "obsidian-direct-locale";
const FALLBACK: Locale = "en";

type Dict = Record<string, string>;

const en: Dict = {
  // ── Top bar ──────────────────────────────────────────────────────────────
  "topbar.search":             "Search",
  "topbar.searchTitle":        "Search (Ctrl+K)",
  "topbar.commands":           "Commands",
  "topbar.commandsTitle":      "Command Palette (Ctrl+P)",
  "topbar.today":              "Today",
  "topbar.todayTitle":         "Open today's daily note",
  "topbar.toggleViewTitle":    "Toggle view (Ctrl+E)",
  "topbar.toggleRsbTitle":     "Toggle right sidebar",
  "topbar.themeTitle":         "Switch theme",
  "topbar.themeOf":            "Theme: {current} → {next}",
  "topbar.langTitle":          "Language",
  "topbar.logout":             "Logout",
  "topbar.untitled":           "—",

  // ── Sidebar ──────────────────────────────────────────────────────────────
  "sidebar.files":             "Files",
  "sidebar.newFileTitle":      "New file (Ctrl+N)",
  "sidebar.newFileAria":       "New file",
  "sidebar.newFolderTitle":    "New folder (Ctrl+Shift+N)",
  "sidebar.newFolderAria":     "New folder",

  // ── Save status / word count ─────────────────────────────────────────────
  "save.editing":              "editing…",
  "save.saving":               "saving…",
  "save.saved":                "saved ✓",
  "save.error":                "error",
  "save.loadFailed":           "Failed to load file",
  "save.saveFailed":           "Save failed",
  "stats.words":               "{words} words · {chars} chars",

  // ── Login ───────────────────────────────────────────────────────────────
  "login.title":               "Obsidian Direct",
  "login.password":            "Password",
  "login.passwordPlaceholder": "Enter your password",
  "login.signIn":              "Sign in",
  "login.signingIn":           "Signing in…",
  "login.failed":              "Login failed",

  // ── Search ──────────────────────────────────────────────────────────────
  "search.placeholder":        "Search notes… (min 2 chars)",
  "search.closeTitle":         "Close (Esc)",
  "search.searching":          "Searching…",
  "search.failed":             "Search failed",
  "search.empty":              "No results",

  // ── Command palette ─────────────────────────────────────────────────────
  "cmd.placeholder":           "Type a command…",
  "cmd.empty":                 "No matching commands",
  "cmd.movePlaceholder":       "Move \"{name}\" to directory…",
  "cmd.moveRoot":              "(root)",

  // Command entries
  "cmd.newFile.label":         "Create new file",
  "cmd.newFile.desc":          "Ctrl+N",
  "cmd.newBase.label":         "Create new base file",
  "cmd.newBase.desc":          "Create a .base query/table file",
  "cmd.newFolder.label":       "Create new folder",
  "cmd.newFolder.desc":        "Ctrl+Shift+N",
  "cmd.daily.label":           "Open today's daily note",
  "cmd.rename.label":          "Rename current file",
  "cmd.rename.descKey":        "F2 · {path}",
  "cmd.duplicate.label":       "Duplicate current file",
  "cmd.move.label":            "Move file to directory",
  "cmd.move.descCurrent":      "Current: {path}",
  "cmd.noFileOpen":            "No file open",
  "cmd.toggleView.label":      "Toggle editor / preview view",
  "cmd.toggleView.desc":       "Ctrl+E",
  "cmd.bold.label":            "Bold selection",
  "cmd.bold.desc":             "Ctrl+B",
  "cmd.italic.label":          "Italic selection",
  "cmd.italic.desc":           "Ctrl+I",
  "cmd.wikilink.label":        "Wrap selection as [[wikilink]]",
  "cmd.wikilink.desc":         "Ctrl+L",
  "cmd.search.label":          "Search files",
  "cmd.search.desc":           "Ctrl+K",
  "cmd.rsb.hide":              "Hide right sidebar",
  "cmd.rsb.show":              "Show right sidebar",
  "cmd.rsb.desc":              "Outline / Backlinks / Tags panel",
  "cmd.noFileAlert":           "No file is currently open.",

  // ── Tree (file list) ─────────────────────────────────────────────────────
  "tree.loading":              "Loading…",
  "tree.loadFailed":           "Failed to load files",
  "tree.menuRename":           "Rename…",
  "tree.menuDuplicate":        "Duplicate",
  "tree.menuMove":             "Move to…",
  "tree.menuDelete":           "Delete",
  "tree.menuNewFile":          "New file here",
  "tree.menuNewFolder":        "New folder here",
  "tree.deleteConfirm":        "Delete \"{name}\"? This cannot be undone.",
  "tree.deleteFailed":         "Delete failed",
  "tree.moveFailed":           "Move failed",

  // ── Right sidebar panels ─────────────────────────────────────────────────
  "panel.outline":             "Outline",
  "panel.outlineEmpty":        "No headings",
  "panel.outlineNoFile":       "No file open",
  "panel.outlineLineTitle":    "Line {line}",
  "panel.backlinks":           "Backlinks",
  "panel.backlinksLoading":    "Loading…",
  "panel.backlinksFailed":     "Failed to load",
  "panel.backlinksEmpty":      "No backlinks",
  "panel.backlinksNoFile":     "No file open",
  "panel.tags":                "Tags",
  "panel.tagsLoading":         "Loading…",
  "panel.tagsFailed":          "Failed to load",
  "panel.tagsEmpty":           "No tags found",

  // ── Prompts / alerts in main.ts ──────────────────────────────────────────
  "prompt.newFile":            "New file path (under vault root):",
  "prompt.newFileSuggest":     "untitled.md",
  "prompt.newBase":            "New base file path (under vault root):",
  "prompt.newBaseSuggest":     "untitled.base",
  "prompt.newFolder":          "New folder path:",
  "prompt.newFolderSuggest":   "new-folder",
  "prompt.rename":             "Rename to (new path):",
  "alert.createFailed":        "Create failed",
  "alert.createFolderFailed":  "Create folder failed",
  "alert.renameFailed":        "Rename failed",
  "alert.duplicateFailed":     "Duplicate failed",
  "alert.dailyFailed":         "Create daily note failed",

  // ── Base files (bases UI) ────────────────────────────────────────────────
  "base.addColumn":            "Add column",
  "base.addColumnTitle":       "Add a column to this view",
  "base.addView":              "Add view",
  "base.addViewTitle":         "Add a new view (table, list/cards, gallery)",
  "base.filter":               "Filter",
  "base.filterCount":          "Filter ({count})",
  "base.manageFilters":        "Manage filters",
  "base.baseFilters":          "Base filters",
  "base.viewFiltersOf":        "View filters ({name})",
  "base.noFilters":            "No filters",
  "base.addFilter":            "+ Add filter",
  "base.editFilter":           "Edit filter",
  "base.removeFilter":         "Remove filter",
  "base.source":               "Source",
  "base.sourceTitle":          "Edit source YAML (Ctrl+E)",
  "base.loading":              "Loading base…",
  "base.embeddedLoading":      "Loading embedded base…",
  "base.embedded":             "Embedded Base",
  "base.embeddedToggleSrc":    "Toggle source",
  "base.embeddedFailed":       "Failed to render embedded base: {error}",
  "base.failedToLoad":         "Failed to load base",
  "base.fileChangedExt":       "This base file changed externally. Reloading.",
  "base.fileModifiedExt":      "This file was modified externally. Please refresh.",
  "base.updateFailed":         "Failed to update base",
  "base.cellUpdateFailed":     "Update failed",
  "base.viewUnsupported":      "View type \"{type}\" is not yet supported",
  "base.viewUnsupportedHint":  "The view definition is preserved and will work when this view type is implemented.",
  "base.removeColConfirm":     "Remove column \"{column}\" from this view?",
  "base.deletePropConfirm":    "Delete property \"{column}\" from base definition? This will not modify any notes.",
  "base.columnOptions":        "Column options",
  "base.sortAsc":              "Sort ascending",
  "base.sortDesc":             "Sort descending",
  "base.clearSort":            "Clear sort",
  "base.editProperty":         "Edit property…",
  "base.setPropertyMeta":      "Set property metadata…",
  "base.removeFromView":       "Remove from view",
  "base.deleteProperty":       "Delete property (and column)",
  "base.cancel":               "Cancel",
  "base.add":                  "Add",
  "base.edit":                 "Edit",
  "base.save":                 "Save",
  "base.notesCount":           "{shown} of {total} notes",
  "base.noMatching":           "No matching notes",

  // Modals
  "base.modal.addView":            "Add view",
  "base.modal.viewName":           "Name",
  "base.modal.viewNamePh":         "e.g. Cards, Backlog",
  "base.modal.viewNameDefault":    "New view",
  "base.modal.viewType":           "View type",
  "base.modal.viewTypeTable":      "Table",
  "base.modal.viewTypeList":       "Card list",
  "base.modal.viewTypeGallery":    "Gallery",
  "base.modal.viewTypeHint":       "Card list and gallery render each note as a card. You can switch the type later by editing source.",

  "base.modal.addColumn":          "Add column",
  "base.modal.propertyName":       "Property name",
  "base.modal.propertyNamePh":     "e.g. status, due, file.mtime",
  "base.modal.columnHint":         "Use {file} for file metadata, {formula} for formulas, or any frontmatter key.",

  "base.modal.addPropTitle":       "Add property: {name}",
  "base.modal.editPropTitle":      "Edit property: {name}",
  "base.modal.propLabel":          "Label (optional)",
  "base.modal.propType":           "Type (optional)",
  "base.modal.propTypePh":         "text, number, date, list, …",
  "base.modal.propWidth":          "Width (px, optional)",
  "base.modal.propHidden":         "Hidden by default",

  "base.modal.addFilterTitle":     "Add filter",
  "base.modal.editFilterTitle":    "Edit filter",
  "base.modal.filterProperty":     "Property",
  "base.modal.filterPropertyPh":   "e.g. status, file.inFolder(\"Folder\"), file.hasTag(\"tag\")",
  "base.modal.filterOperator":     "Operator",
  "base.modal.filterValue":        "Value",
  "base.modal.filterValuePh":      "Filter value",
  "base.modal.filterHint":         "Use {inFolder}, {hasTag}, or any frontmatter property.",
};

const ar: Dict = {
  // ── Top bar ──────────────────────────────────────────────────────────────
  "topbar.search":             "بحث",
  "topbar.searchTitle":        "بحث (Ctrl+K)",
  "topbar.commands":           "الأوامر",
  "topbar.commandsTitle":      "لوحة الأوامر (Ctrl+P)",
  "topbar.today":              "اليوم",
  "topbar.todayTitle":         "فتح ملاحظة اليوم",
  "topbar.toggleViewTitle":    "تبديل العرض (Ctrl+E)",
  "topbar.toggleRsbTitle":     "تبديل الشريط الجانبي الأيمن",
  "topbar.themeTitle":         "تبديل السمة",
  "topbar.themeOf":            "السمة: {current} ← {next}",
  "topbar.langTitle":          "اللغة",
  "topbar.logout":             "تسجيل الخروج",
  "topbar.untitled":           "—",

  // ── Sidebar ──────────────────────────────────────────────────────────────
  "sidebar.files":             "الملفات",
  "sidebar.newFileTitle":      "ملف جديد (Ctrl+N)",
  "sidebar.newFileAria":       "ملف جديد",
  "sidebar.newFolderTitle":    "مجلد جديد (Ctrl+Shift+N)",
  "sidebar.newFolderAria":     "مجلد جديد",

  // ── Save status / word count ─────────────────────────────────────────────
  "save.editing":              "جارٍ التحرير…",
  "save.saving":               "جارٍ الحفظ…",
  "save.saved":                "تم الحفظ ✓",
  "save.error":                "خطأ",
  "save.loadFailed":           "تعذر تحميل الملف",
  "save.saveFailed":           "فشل الحفظ",
  "stats.words":               "{words} كلمة · {chars} حرف",

  // ── Login ───────────────────────────────────────────────────────────────
  "login.title":               "Obsidian Direct",
  "login.password":            "كلمة المرور",
  "login.passwordPlaceholder": "أدخل كلمة المرور",
  "login.signIn":              "تسجيل الدخول",
  "login.signingIn":           "جارٍ تسجيل الدخول…",
  "login.failed":              "فشل تسجيل الدخول",

  // ── Search ──────────────────────────────────────────────────────────────
  "search.placeholder":        "ابحث في الملاحظات… (حرفان على الأقل)",
  "search.closeTitle":         "إغلاق (Esc)",
  "search.searching":          "جارٍ البحث…",
  "search.failed":             "فشل البحث",
  "search.empty":              "لا توجد نتائج",

  // ── Command palette ─────────────────────────────────────────────────────
  "cmd.placeholder":           "اكتب اسم أمر…",
  "cmd.empty":                 "لا توجد أوامر مطابقة",
  "cmd.movePlaceholder":       "نقل \"{name}\" إلى مجلد…",
  "cmd.moveRoot":              "(الجذر)",

  // Command entries
  "cmd.newFile.label":         "إنشاء ملف جديد",
  "cmd.newFile.desc":          "Ctrl+N",
  "cmd.newBase.label":         "إنشاء ملف base جديد",
  "cmd.newBase.desc":          "إنشاء ملف استعلام/جدول .base",
  "cmd.newFolder.label":       "إنشاء مجلد جديد",
  "cmd.newFolder.desc":        "Ctrl+Shift+N",
  "cmd.daily.label":           "فتح ملاحظة اليوم",
  "cmd.rename.label":          "إعادة تسمية الملف الحالي",
  "cmd.rename.descKey":        "F2 · {path}",
  "cmd.duplicate.label":       "تكرار الملف الحالي",
  "cmd.move.label":            "نقل الملف إلى مجلد",
  "cmd.move.descCurrent":      "الحالي: {path}",
  "cmd.noFileOpen":            "لا يوجد ملف مفتوح",
  "cmd.toggleView.label":      "تبديل عرض المحرر / المعاينة",
  "cmd.toggleView.desc":       "Ctrl+E",
  "cmd.bold.label":            "تحديد عريض",
  "cmd.bold.desc":             "Ctrl+B",
  "cmd.italic.label":          "تحديد مائل",
  "cmd.italic.desc":           "Ctrl+I",
  "cmd.wikilink.label":        "تغليف التحديد كـ [[رابط ويكي]]",
  "cmd.wikilink.desc":         "Ctrl+L",
  "cmd.search.label":          "بحث في الملفات",
  "cmd.search.desc":           "Ctrl+K",
  "cmd.rsb.hide":              "إخفاء الشريط الجانبي الأيمن",
  "cmd.rsb.show":              "إظهار الشريط الجانبي الأيمن",
  "cmd.rsb.desc":              "لوحة الفهرس / الإحالات الخلفية / الوسوم",
  "cmd.noFileAlert":           "لا يوجد ملف مفتوح حاليًا.",

  // ── Tree (file list) ─────────────────────────────────────────────────────
  "tree.loading":              "جارٍ التحميل…",
  "tree.loadFailed":           "تعذر تحميل الملفات",
  "tree.menuRename":           "إعادة تسمية…",
  "tree.menuDuplicate":        "تكرار",
  "tree.menuMove":             "نقل إلى…",
  "tree.menuDelete":           "حذف",
  "tree.menuNewFile":          "ملف جديد هنا",
  "tree.menuNewFolder":        "مجلد جديد هنا",
  "tree.deleteConfirm":        "حذف \"{name}\"؟ لا يمكن التراجع عن هذا الإجراء.",
  "tree.deleteFailed":         "فشل الحذف",
  "tree.moveFailed":           "فشل النقل",

  // ── Right sidebar panels ─────────────────────────────────────────────────
  "panel.outline":             "الفهرس",
  "panel.outlineEmpty":        "لا توجد عناوين",
  "panel.outlineNoFile":       "لا يوجد ملف مفتوح",
  "panel.outlineLineTitle":    "السطر {line}",
  "panel.backlinks":           "الإحالات الخلفية",
  "panel.backlinksLoading":    "جارٍ التحميل…",
  "panel.backlinksFailed":     "فشل التحميل",
  "panel.backlinksEmpty":      "لا توجد إحالات خلفية",
  "panel.backlinksNoFile":     "لا يوجد ملف مفتوح",
  "panel.tags":                "الوسوم",
  "panel.tagsLoading":         "جارٍ التحميل…",
  "panel.tagsFailed":          "فشل التحميل",
  "panel.tagsEmpty":           "لا توجد وسوم",

  // ── Prompts / alerts in main.ts ──────────────────────────────────────────
  "prompt.newFile":            "مسار الملف الجديد (داخل جذر القبو):",
  "prompt.newFileSuggest":     "untitled.md",
  "prompt.newBase":            "مسار ملف base الجديد (داخل جذر القبو):",
  "prompt.newBaseSuggest":     "untitled.base",
  "prompt.newFolder":          "مسار المجلد الجديد:",
  "prompt.newFolderSuggest":   "new-folder",
  "prompt.rename":             "إعادة التسمية إلى (مسار جديد):",
  "alert.createFailed":        "فشل الإنشاء",
  "alert.createFolderFailed":  "فشل إنشاء المجلد",
  "alert.renameFailed":        "فشل إعادة التسمية",
  "alert.duplicateFailed":     "فشل التكرار",
  "alert.dailyFailed":         "فشل إنشاء ملاحظة اليوم",

  // ── Base files (bases UI) ────────────────────────────────────────────────
  "base.addColumn":            "إضافة عمود",
  "base.addColumnTitle":       "إضافة عمود إلى هذا العرض",
  "base.addView":              "إضافة عرض",
  "base.addViewTitle":         "إضافة عرض جديد (جدول، قائمة/بطاقات، معرض)",
  "base.filter":               "تصفية",
  "base.filterCount":          "تصفية ({count})",
  "base.manageFilters":        "إدارة المصفّيات",
  "base.baseFilters":          "مصفّيات الـ base",
  "base.viewFiltersOf":        "مصفّيات العرض ({name})",
  "base.noFilters":            "لا توجد مصفّيات",
  "base.addFilter":            "+ إضافة مصفّي",
  "base.editFilter":           "تعديل المصفّي",
  "base.removeFilter":         "إزالة المصفّي",
  "base.source":               "المصدر",
  "base.sourceTitle":          "تعديل مصدر YAML (Ctrl+E)",
  "base.loading":              "جارٍ تحميل الـ base…",
  "base.embeddedLoading":      "جارٍ تحميل الـ base المضمَّن…",
  "base.embedded":             "Base مضمَّن",
  "base.embeddedToggleSrc":    "تبديل المصدر",
  "base.embeddedFailed":       "تعذر عرض الـ base المضمَّن: {error}",
  "base.failedToLoad":         "تعذر تحميل الـ base",
  "base.fileChangedExt":       "تم تعديل ملف الـ base من خارج التطبيق. سيتم إعادة التحميل.",
  "base.fileModifiedExt":      "تم تعديل هذا الملف من خارج التطبيق. الرجاء التحديث.",
  "base.updateFailed":         "فشل تحديث الـ base",
  "base.cellUpdateFailed":     "فشل التحديث",
  "base.viewUnsupported":      "نوع العرض \"{type}\" غير مدعوم بعد",
  "base.viewUnsupportedHint":  "تعريف العرض محفوظ وسيعمل عند توفر هذا النوع.",
  "base.removeColConfirm":     "إزالة العمود \"{column}\" من هذا العرض؟",
  "base.deletePropConfirm":    "حذف الخاصية \"{column}\" من تعريف الـ base؟ لن يؤثر هذا على أي ملاحظات.",
  "base.columnOptions":        "خيارات العمود",
  "base.sortAsc":              "ترتيب تصاعدي",
  "base.sortDesc":             "ترتيب تنازلي",
  "base.clearSort":            "مسح الترتيب",
  "base.editProperty":         "تعديل الخاصية…",
  "base.setPropertyMeta":      "تعيين بيانات الخاصية…",
  "base.removeFromView":       "إزالة من هذا العرض",
  "base.deleteProperty":       "حذف الخاصية (والعمود)",
  "base.cancel":               "إلغاء",
  "base.add":                  "إضافة",
  "base.edit":                 "تعديل",
  "base.save":                 "حفظ",
  "base.notesCount":           "{shown} من أصل {total} ملاحظة",
  "base.noMatching":           "لا توجد ملاحظات مطابقة",

  // Modals
  "base.modal.addView":            "إضافة عرض",
  "base.modal.viewName":           "الاسم",
  "base.modal.viewNamePh":         "مثال: بطاقات، قائمة المهام",
  "base.modal.viewNameDefault":    "عرض جديد",
  "base.modal.viewType":           "نوع العرض",
  "base.modal.viewTypeTable":      "جدول",
  "base.modal.viewTypeList":       "قائمة بطاقات",
  "base.modal.viewTypeGallery":    "معرض",
  "base.modal.viewTypeHint":       "تعرض قائمة البطاقات والمعرض كل ملاحظة كبطاقة. يمكنك تغيير النوع لاحقًا بتعديل المصدر.",

  "base.modal.addColumn":          "إضافة عمود",
  "base.modal.propertyName":       "اسم الخاصية",
  "base.modal.propertyNamePh":     "مثال: status، due، file.mtime",
  "base.modal.columnHint":         "استخدم {file} لبيانات الملف، أو {formula} للصيغ، أو أي مفتاح في الواجهة الأمامية.",

  "base.modal.addPropTitle":       "إضافة خاصية: {name}",
  "base.modal.editPropTitle":      "تعديل خاصية: {name}",
  "base.modal.propLabel":          "التسمية (اختياري)",
  "base.modal.propType":           "النوع (اختياري)",
  "base.modal.propTypePh":         "text، number، date، list، …",
  "base.modal.propWidth":          "العرض (بكسل، اختياري)",
  "base.modal.propHidden":         "مخفي افتراضيًا",

  "base.modal.addFilterTitle":     "إضافة مصفّي",
  "base.modal.editFilterTitle":    "تعديل مصفّي",
  "base.modal.filterProperty":     "الخاصية",
  "base.modal.filterPropertyPh":   "مثال: status، file.inFolder(\"Folder\")، file.hasTag(\"tag\")",
  "base.modal.filterOperator":     "العامل",
  "base.modal.filterValue":        "القيمة",
  "base.modal.filterValuePh":      "قيمة المصفّي",
  "base.modal.filterHint":         "استخدم {inFolder} أو {hasTag} أو أي خاصية من الواجهة الأمامية.",
};

const DICTS: Record<Locale, Dict> = { en, ar };

// ─── State + helpers ─────────────────────────────────────────────────────────

function readStoredLocale(): Locale {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "en" || raw === "ar") return raw;
  } catch {
    /* ignore (private mode etc.) */
  }
  return FALLBACK;
}

let current: Locale = readStoredLocale();

export function getLocale(): Locale {
  return current;
}

export function getLocaleMeta(locale: Locale = current): LocaleMeta {
  return LOCALES.find((l) => l.code === locale) ?? LOCALES[0]!;
}

export function setLocale(locale: Locale): void {
  current = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  applyDirectionToDocument();
}

/** Apply `lang` and `dir` to the root `<html>` element. Safe to call repeatedly. */
export function applyDirectionToDocument(): void {
  const meta = getLocaleMeta();
  const root = document.documentElement;
  root.lang = meta.htmlLang;
  root.dir = meta.dir;
}

/** Translate a key, interpolating `{placeholders}` from `params`. */
export function t(key: string, params?: Record<string, string | number>): string {
  const dict = DICTS[current] ?? DICTS[FALLBACK];
  const raw = dict[key] ?? DICTS[FALLBACK][key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_m, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`
  );
}
