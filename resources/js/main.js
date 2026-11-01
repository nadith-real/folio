const STORAGE_KEY = "folio-notes-v1";

const WELCOME = {
  id: "welcome",
  title: "Welcome",
  body: `Click a line to edit it. Markdown stays visible on the line you are writing, and renders everywhere else.

## A short tour

Folio keeps one surface, the way a vault note does:

- **Bold**, *italic*, and ~~struck~~ text
- [Links](https://neutralino.js.org) that open in a new tab
- \`inline code\`, fenced blocks, and [[Scratch|wiki links]]

> The preview is the editor. There is no second pane.

### Try this

1. Click this sentence and keep typing.
2. Select a word and press Ctrl+B (Cmd+B on a Mac).
3. Check a task. The source mark flips with it.

### Tasks

- [x] Open the vault
- [ ] Write the next paragraph
- [ ] Save a markdown file

| Mark | Shortcut |
| --- | --- |
| Bold | Ctrl+B |
| Italic | Ctrl+I |
| Link | Ctrl+K |
| Code | Ctrl+E |

\`\`\`
function folio() {
  return "write simply";
}
\`\`\`

---

When you are ready, this note can go. Your words will not.
`,
  updatedAt: Date.now(),
  path: "",
};

const $ = (id) => document.getElementById(id);

let native = false;
let state = load();
let edit = null;
let navOffset = null;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { notes: [WELCOME], activeId: WELCOME.id, query: "" };
    const data = JSON.parse(raw);
    if (!Array.isArray(data.notes) || data.notes.length === 0) {
      return { notes: [WELCOME], activeId: WELCOME.id, query: "" };
    }
    return {
      notes: data.notes,
      activeId: data.notes.some((note) => note.id === data.activeId) ? data.activeId : data.notes[0].id,
      query: "",
    };
  } catch {
    return { notes: [WELCOME], activeId: WELCOME.id, query: "" };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ notes: state.notes, activeId: state.activeId }));
}

function active() {
  return state.notes.find((note) => note.id === state.activeId) || null;
}

function setMessage(text) {
  $("message").textContent = text;
}

function escapeAttr(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "\u0026amp;";
      case "<":
        return "\u0026lt;";
      case ">":
        return "\u0026gt;";
      case '"':
        return "\u0026quot;";
      default:
        return "\u0026#39;";
    }
  });
}

function safeUrl(href) {
  const trimmed = String(href || "").trim();
  if (/^(#|\/|\.\/|\.\.\/)/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") return url.href;
  } catch {
    return null;
  }
  return null;
}

function setupMarkdown() {
  const lib = globalThis.marked;
  if (!lib || typeof lib.use !== "function") return;
  lib.use({
    gfm: true,
    breaks: true,
    renderer: {
      html() {
        return "";
      },
      link(token) {
        const text = this.parser.parseInline(token.tokens);
        const href = safeUrl(token.href);
        if (!href) return text;
        const title = token.title ? ` title="${escapeAttr(token.title)}"` : "";
        return `<a href="${escapeAttr(href)}"${title} target="_blank" rel="noopener noreferrer">${text}</a>`;
      },
      image(token) {
        const href = safeUrl(token.href);
        if (!href) return "";
        return `<img src="${escapeAttr(href)}" alt="${escapeAttr(token.text)}" />`;
      },
    },
  });
}

function renderMarkdown(source) {
  const lib = globalThis.marked;
  if (!lib || typeof lib.parse !== "function") return "";
  const raw = lib.parse(source || "", { async: false });
  return String(raw)
    .replace(/<input\b([^>]*?)disabled(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, "<input$1")
    .replace(/\[\[([^\]\n|]+?)(?:\|([^\]\n]+))?\]\]/g, (_match, title, alias) => {
      const name = String(title).trim();
      const label = String(alias || title).trim();
      return `<button type="button" class="wiki" data-wiki="${escapeAttr(name)}">${escapeAttr(label)}</button>`;
    });
}

function slug(title) {
  const cleaned = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${cleaned || "note"}.md`;
}

function splitBlocks(source) {
  if (source === "") return [{ start: 0, end: 0, text: "" }];
  const lines = source.split("\n");
  const starts = [];
  let pos = 0;
  for (const line of lines) {
    starts.push(pos);
    pos += line.length + 1;
  }
  const fenceAt = (n) => lines[n]?.match(/^ {0,3}(`{3,}|~{3,})/)?.[1] ?? null;
  const blank = (n) => lines[n].trim() === "";
  const heading = (n) => /^ {0,3}#{1,6}(\s|$)/.test(lines[n]);
  const hr = (n) => /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(lines[n]);
  const quote = (n) => /^ {0,3}>/.test(lines[n]);
  const list = (n) => /^ {0,3}(?:[-*+]|\d+[.)])\s+/.test(lines[n]);
  const table = (n) => /^\s*\|/.test(lines[n]);
  const blocks = [];
  const push = (from, to) => {
    const last = to - 1;
    const start = starts[from];
    const end = starts[last] + lines[last].length;
    blocks.push({ start, end, text: source.slice(start, end) });
  };
  let i = 0;
  while (i < lines.length) {
    if (i === lines.length - 1 && lines[i] === "" && i > 0) break;
    const fence = fenceAt(i);
    if (fence) {
      const mark = fence[0];
      let j = i + 1;
      while (j < lines.length && !new RegExp(`^ {0,3}\\${mark}{3,}`).test(lines[j])) j += 1;
      if (j < lines.length) j += 1;
      push(i, j);
      i = j;
      continue;
    }
    if (blank(i)) {
      let j = i + 1;
      while (j < lines.length && blank(j) && !(j === lines.length - 1 && lines[j] === "")) j += 1;
      push(i, j);
      i = j;
      continue;
    }
    if (heading(i) || hr(i)) {
      push(i, i + 1);
      i += 1;
      continue;
    }
    if (quote(i)) {
      let j = i + 1;
      while (j < lines.length && quote(j)) j += 1;
      push(i, j);
      i = j;
      continue;
    }
    if (list(i)) {
      let j = i + 1;
      while (j < lines.length && !blank(j) && !heading(j) && !fenceAt(j) && !hr(j) && !quote(j)) j += 1;
      push(i, j);
      i = j;
      continue;
    }
    if (table(i)) {
      let j = i + 1;
      while (j < lines.length && table(j)) j += 1;
      push(i, j);
      i = j;
      continue;
    }
    let j = i + 1;
    while (j < lines.length && !blank(j) && !heading(j) && !fenceAt(j) && !hr(j) && !quote(j) && !list(j) && !table(j)) {
      j += 1;
    }
    push(i, j);
    i = j;
  }
  return blocks.length ? blocks : [{ start: 0, end: source.length, text: source }];
}

function blockIndexAt(blocks, caret) {
  for (let i = 0; i < blocks.length; i += 1) {
    if (caret < blocks[i].start) return Math.max(0, i - 1);
    if (caret <= blocks[i].end) return i;
  }
  return Math.max(0, blocks.length - 1);
}

function blockKind(text) {
  if (!text.trim()) return "blank";
  if (/^(```|~~~)/.test(text)) return "code";
  if (/^ {0,3}>/.test(text)) return "quote";
  const heading = text.match(/^ {0,3}(#{1,6})\s/);
  if (!heading) return "text";
  if (heading[1].length === 1) return "h1";
  if (heading[1].length === 2) return "h2";
  return "h3";
}

function wrap(value, start, end, before, after, placeholder) {
  if (start >= before.length && value.slice(start - before.length, start) === before && value.slice(end, end + after.length) === after) {
    const next = value.slice(0, start - before.length) + value.slice(start, end) + value.slice(end + after.length);
    const sel = start - before.length;
    return { value: next, start: sel, end: sel + (end - start) };
  }
  const selected = value.slice(start, end);
  const inner = selected || placeholder;
  const next = value.slice(0, start) + before + inner + after + value.slice(end);
  const innerStart = start + before.length;
  if (!selected) return { value: next, start: innerStart, end: innerStart + inner.length };
  const cursor = innerStart + inner.length + after.length;
  return { value: next, start: cursor, end: cursor };
}

function insertLink(value, start, end) {
  const label = value.slice(start, end) || "link text";
  const chunk = `[${label}](https://)`;
  const next = value.slice(0, start) + chunk + value.slice(end);
  const urlStart = start + label.length + 3;
  return { value: next, start: urlStart, end: urlStart + "https://".length };
}

function toggleTask(source, index) {
  let seen = 0;
  return source.replace(/^([ \t]*[-*+][ \t]+\[)( |x|X)(\])/gm, (full, open, mark, close) => {
    if (seen++ !== index) return full;
    return `${open}${mark === " " ? "x" : " "}${close}`;
  });
}

function fit(area) {
  area.style.height = "0px";
  area.style.height = `${area.scrollHeight}px`;
}

function openWiki(name) {
  const title = name.trim();
  if (!title) return;
  const found = state.notes.find((note) => note.title.toLowerCase() === title.toLowerCase());
  if (found) {
    state.activeId = found.id;
    edit = null;
    closeShelf();
    paint();
    return;
  }
  const note = { id: crypto.randomUUID(), title, body: "", updatedAt: Date.now(), path: "" };
  state.notes.unshift(note);
  state.activeId = note.id;
  edit = { start: 0, end: 0 };
  navOffset = 0;
  closeShelf();
  setMessage("Created " + title);
  paint();
}

function renderBlocks() {
  const note = active();
  const root = $("blocks");
  root.innerHTML = "";
  if (!note) return;
  const blocks = splitBlocks(note.body);
  const index = edit ? blockIndexAt(blocks, edit.start) : -1;
  blocks.forEach((block, blockIndex) => {
    const kind = blockKind(block.text);
    if (blockIndex === index) {
      const area = document.createElement("textarea");
      area.className = `live-src ${kind}`;
      area.setAttribute("aria-label", "Markdown");
      area.spellcheck = true;
      area.rows = 1;
      area.value = block.text;
      area.placeholder = note.body.trim() ? "" : "Start writing";
      area.addEventListener("input", () => {
        const caretLocal = area.selectionStart;
        const start = edit.start;
        const end = edit.end;
        note.body = note.body.slice(0, start) + area.value + note.body.slice(end);
        note.updatedAt = Date.now();
        edit = { start, end: start + area.value.length };
        navOffset = caretLocal;
        fit(area);
        saveState();
        paintChrome();
        setMessage(native && note.path ? "Edited — Save to write the file" : "Saved on this device");
      });
      area.addEventListener("keydown", (event) => onKeyDown(event, area));
      area.addEventListener("blur", () => {
        window.setTimeout(() => {
          if (!$("scroller").contains(document.activeElement)) {
            edit = null;
            renderBlocks();
          }
        }, 0);
      });
      root.appendChild(area);
      fit(area);
      area.focus();
      const local = Math.max(0, Math.min(area.value.length, navOffset ?? 0));
      area.setSelectionRange(local, local);
      navOffset = null;
      return;
    }
    if (kind === "blank") {
      const gap = document.createElement("button");
      gap.type = "button";
      gap.className = "gap";
      gap.setAttribute("aria-label", "Edit empty line");
      gap.addEventListener("click", () => activate(block.start));
      root.appendChild(gap);
      return;
    }
    const view = document.createElement("div");
    view.className = "prose";
    view.innerHTML = renderMarkdown(block.text);
    view.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const wiki = target.closest("[data-wiki]");
      if (wiki instanceof HTMLElement) {
        event.preventDefault();
        openWiki(wiki.dataset.wiki || "");
        return;
      }
      if (target instanceof HTMLInputElement && target.type === "checkbox") {
        const boxes = [...view.querySelectorAll('input[type="checkbox"]')];
        const boxIndex = boxes.indexOf(target);
        if (boxIndex < 0) return;
        const nextText = toggleTask(block.text, boxIndex);
        note.body = note.body.slice(0, block.start) + nextText + note.body.slice(block.end);
        note.updatedAt = Date.now();
        saveState();
        renderBlocks();
        paintChrome();
        return;
      }
      activate(block.start);
    });
    root.appendChild(view);
  });
}

function activate(caret) {
  const note = active();
  if (!note) return;
  const blocks = splitBlocks(note.body);
  const block = blocks[blockIndexAt(blocks, caret)];
  edit = { start: block.start, end: block.end };
  navOffset = Math.max(0, caret - block.start);
  renderBlocks();
}

function commitBlock(_block, nextValue, localCaret) {
  const note = active();
  if (!note || !edit) return;
  const start = edit.start;
  note.body = note.body.slice(0, start) + nextValue + note.body.slice(edit.end);
  note.updatedAt = Date.now();
  edit = { start: start + localCaret, end: start + localCaret };
  navOffset = localCaret;
  saveState();
  renderBlocks();
  paintChrome();
}

function onKeyDown(event, area) {
  const note = active();
  if (!note || !edit) return;
  const blocks = splitBlocks(note.body);
  const index = blockIndexAt(blocks, edit.start);
  const endIndex = blockIndexAt(blocks, Math.max(edit.start, edit.end - 1));
  const text = area.value;
  const meta = event.metaKey || event.ctrlKey;
  const collapsed = area.selectionStart === area.selectionEnd;
  if (event.key === "Tab") {
    event.preventDefault();
    const start = area.selectionStart;
    const next = text.slice(0, start) + "  " + text.slice(area.selectionEnd);
    commitBlock(null, next, start + 2);
    return;
  }
  if (meta) {
    const key = event.key.toLowerCase();
    const run =
      key === "b"
        ? wrap(text, area.selectionStart, area.selectionEnd, "**", "**", "bold")
        : key === "i"
          ? wrap(text, area.selectionStart, area.selectionEnd, "*", "*", "italic")
          : key === "e"
            ? wrap(text, area.selectionStart, area.selectionEnd, "`", "`", "code")
            : key === "k"
              ? insertLink(text, area.selectionStart, area.selectionEnd)
              : null;
    if (run) {
      event.preventDefault();
      commitBlock(null, run.value, run.start);
      return;
    }
    if (key === "s") {
      event.preventDefault();
      void saveFile();
    }
  }
  if (event.key === "ArrowUp" && collapsed && area.selectionStart === 0 && index > 0) {
    event.preventDefault();
    activate(blocks[index - 1].end);
  } else if (event.key === "ArrowDown" && collapsed && area.selectionStart === text.length && endIndex < blocks.length - 1) {
    event.preventDefault();
    activate(blocks[endIndex + 1].start);
  } else if (event.key === "Backspace" && collapsed && area.selectionStart === 0 && index > 0) {
    event.preventDefault();
    activate(blocks[index - 1].end);
  }
}

function paintList() {
  const needle = state.query.trim().toLowerCase();
  const notes = [...state.notes]
    .filter((note) => !needle || note.title.toLowerCase().includes(needle))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const list = $("list");
  list.innerHTML = "";
  if (!notes.length) {
    const empty = document.createElement("li");
    empty.className = "miss";
    empty.textContent = "No notes match.";
    list.appendChild(empty);
    return;
  }
  for (const note of notes) {
    const item = document.createElement("li");
    item.className = "note" + (note.id === state.activeId ? " active" : "");
    const open = document.createElement("button");
    open.type = "button";
    open.className = "open-note";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = note.title.trim() || "Untitled";
    open.appendChild(name);
    open.addEventListener("click", () => {
      state.activeId = note.id;
      edit = null;
      closeShelf();
      paint();
    });
    item.appendChild(open);
    if (note.id === state.activeId) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "del";
      del.textContent = "Del";
      del.setAttribute("aria-label", "Delete note");
      del.addEventListener("click", () => {
        if (del.dataset.armed !== "1") {
          del.dataset.armed = "1";
          del.textContent = "Yes";
          return;
        }
        state.notes = state.notes.filter((itemNote) => itemNote.id !== note.id);
        state.activeId = [...state.notes].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id || "";
        edit = null;
        saveState();
        setMessage("Note removed");
        paint();
      });
      item.appendChild(del);
    }
    list.appendChild(item);
  }
}

function paintChrome() {
  const note = active();
  const words = note?.body.trim() ? note.body.trim().split(/\s+/).length : 0;
  const minutes = words === 0 ? 0 : Math.max(1, Math.round(words / 220));
  $("stats").textContent = note
    ? `${words} ${words === 1 ? "word" : "words"} · ${note.body.length} chars${minutes ? ` · ${minutes} min read` : ""}`
    : "";
  $("tab-title").textContent = note?.title.trim() || "Untitled";
  paintList();
}

function paint() {
  const note = active();
  const empty = $("empty");
  const scroller = $("scroller");
  const titleInput = $("title");
  if (!note) {
    empty.hidden = false;
    scroller.hidden = true;
    titleInput.value = "";
    document.title = "Folio";
  } else {
    empty.hidden = true;
    scroller.hidden = false;
    if (document.activeElement !== titleInput) titleInput.value = note.title;
    document.title = `${note.title || "Untitled"} — Folio`;
    if (native && window.Neutralino?.window) {
      Neutralino.window.setTitle(`${note.title || "Untitled"} — Folio`).catch(() => {});
    }
    renderBlocks();
  }
  paintChrome();
  saveState();
}

function createNote() {
  const note = { id: crypto.randomUUID(), title: "Untitled", body: "", updatedAt: Date.now(), path: "" };
  state.notes.unshift(note);
  state.activeId = note.id;
  edit = { start: 0, end: 0 };
  navOffset = 0;
  closeShelf();
  paint();
}

function closeShelf() {
  $("shelf").classList.remove("open");
  $("backdrop").hidden = true;
}

async function openFile() {
  if (native) {
    try {
      const picked = await Neutralino.os.showOpenDialog("Open markdown", {
        filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
      });
      const path = Array.isArray(picked) ? picked[0] : picked;
      if (!path) return;
      const body = await Neutralino.filesystem.readFile(path);
      const base = path.split(/[\\/]/).pop() || "note";
      const note = {
        id: crypto.randomUUID(),
        title: base.replace(/\.(md|markdown|txt)$/i, ""),
        body,
        updatedAt: Date.now(),
        path,
      };
      state.notes.unshift(note);
      state.activeId = note.id;
      edit = null;
      setMessage("Opened " + base);
      paint();
    } catch (error) {
      setMessage(error?.message || "Could not open that file");
    }
    return;
  }
  $("file").click();
}

async function saveFile() {
  const note = active();
  if (!note) return;
  if (!native) {
    const blob = new Blob([note.body], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = slug(note.title);
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Downloaded markdown file");
    return;
  }
  try {
    let path = note.path;
    if (!path) {
      path = await Neutralino.os.showSaveDialog("Save markdown", {
        defaultPath: slug(note.title),
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
    }
    if (!path) return;
    await Neutralino.filesystem.writeFile(path, note.body);
    note.path = path;
    saveState();
    setMessage("Saved to " + path.split(/[\\/]/).pop());
  } catch (error) {
    setMessage(error?.message || "Could not save that file");
  }
}

function bind() {
  $("title").addEventListener("input", () => {
    const note = active();
    if (!note) return;
    note.title = $("title").value;
    note.updatedAt = Date.now();
    saveState();
    paintChrome();
    document.title = `${note.title || "Untitled"} — Folio`;
  });
  $("tail").addEventListener("click", () => {
    const note = active();
    if (note) activate(note.body.length);
  });
  $("new").addEventListener("click", createNote);
  $("empty-new").addEventListener("click", createNote);
  $("open").addEventListener("click", () => void openFile());
  $("save").addEventListener("click", () => void saveFile());
  $("find").addEventListener("input", (event) => {
    state.query = event.target.value;
    paintList();
  });
  $("file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const body = await file.text();
    const note = {
      id: crypto.randomUUID(),
      title: file.name.replace(/\.(md|markdown|txt)$/i, ""),
      body,
      updatedAt: Date.now(),
      path: "",
    };
    state.notes.unshift(note);
    state.activeId = note.id;
    edit = null;
    setMessage("Opened file");
    paint();
  });
  $("shelf-toggle").addEventListener("click", () => {
    $("shelf").classList.add("open");
    $("backdrop").hidden = false;
  });
  $("backdrop").addEventListener("click", closeShelf);
}

async function boot() {
  setupMarkdown();
  bind();
  paint();
  if (window.Neutralino && typeof Neutralino.init === "function") {
    try {
      await Neutralino.init();
      native = true;
      Neutralino.events.on("windowClose", () => {
        Neutralino.app.exit();
      });
    } catch {
      native = false;
    }
  }
}

boot();
