# Folio

Obsidian-style markdown notes for the desktop. One live preview: click a line to edit the source, and everything else stays rendered. Neutralino.js supplies the native open and save dialogs.

## Run it

Install the CLI once, then from this folder:

```
npm install -g @neutralinojs/neu
neu update
neu run
```

`neu build` produces the desktop binaries.

Open and Save use native dialogs and can read or write files inside your home directory (`filesystemScopes` in `neutralino.config.json`). Widen that map if you need other folders.

In a plain browser, without the Neutralino runtime, Open imports a file and Save downloads `.md`. Notes otherwise stay in `localStorage`.

## Files

- `neutralino.config.json` — window size, permissions, CLI versions
- `resources/index.html` — the editor page
- `resources/styles.css` — Obsidian-style dark theme
- `resources/js/main.js` — notes, live preview, native files
- `resources/js/neutralino.js` — client library 6.10.0
- `resources/js/marked.umd.js` — markdown parser
