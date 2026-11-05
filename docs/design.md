# annotate-anything design

Status: first version built 2026-10-28 (core UI, anchoring, Vite plugin, Node
middleware, script tag, CLI watcher, clipboard mode).
Since added: MCP server, `init`, live agent progress (picked up / working
update / finished), a generic `onSubmit` server hook, Vercel palette as the only theme. Verified end to end with
Claude Code (CLI watcher) and Codex 0.164 (MCP). Since then: shadow DOM and same-origin
iframe anchoring, a shared request core with Node, fetch (Next.js) and standalone
adapters, `serve` with a script tag and bookmarklet for any backend, HTML
injection for server-rendered Vite frameworks, Next.js route + client component,
React component. Verified with real Next.js 16.4 and Astro 7.4 dev servers.
Not built yet: npm publish.

## Shape

One vanilla TypeScript core with no framework dependency, built as an ESM module
and a `<script>` bundle. Everything the user sees renders inside a shadow root
on one host element, so host CSS can't reach in and ours can't leak out.
Nothing is added at import time. Global listeners exist only while the tool is
open or a mark is showing.

```
src/
  core/        store, note model, routing, numbering
  anchor/      selector capture, re-find, placement, reposition loop
  ui/          launcher, toolbar, capture layer, marks, panel, list (typed DOM, no HTML strings)
  transports/  http (dev server), clipboard (opt-in)
  server/      Node middleware + Vite plugin: file store, merge, guards
  mcp/         MCP server over the same file store
agent/         instructions/skill for agents, watcher CLI
fixture/       test app: router, nested scroll, native <dialog>, Headless UI, Radix
tests/         Playwright at 1440x900 and 390x844
```

## Public API

```ts
annotate({
  transport: "http" | "clipboard" | Transport,
  endpoint?: string,
  context?: () => Record<string, unknown>,
  navigate?: (route: string) => void | Promise<void>,
  slots?: { toolbar?: (el: HTMLElement) => void },
  stableAttributes?: string[],      // default ["data-testid", "data-test", "data-qa"]
  enabled?: boolean,                // required to run in production builds
})
.open({ mode, intro })
.destroy()
```

Theming is CSS custom properties on the host element (`--aa-accent`,
`--aa-unsent`, `--aa-sent`, `--aa-working`, `--aa-resolved`, surface/text
tokens), so each app can match its own look.

## Decisions already settled by Dylan's preferences

- Save closes the panel and keeps the mode on (supersedes the earlier
  keep-open behaviour).
- Esc on unsaved text saves it; Esc on an empty new note discards it.
- Copy-to-clipboard is an explicit opt-in mode, never a silent fallback, and
  never reports notes as "sent".
- Note numbers are stable (`n = max + 1`), never list indexes.
- `resolved` means implemented, not accepted.

## Anchoring

Capture: short stable CSS path (skip generated ids and state classes,
`nth-of-type` only when needed, stop once unique), configured stable
attributes, tag, collapsed text (180 chars), document-space bounds, click
point as a fraction of the element, scroll, viewport, area offset, and the
dialog the element was in.

Re-find in order: selector (only if it agrees with the saved test id and
text), stable attribute, same tag with matching text (nearest wins), the
selector hit even if its text changed, then the nearest same-tag element within
80px. Otherwise detached. A zero-size
element counts as missing. The nearest-tag fallback never crosses a dialog
boundary.

While a modal is open, page marks are hidden and only that dialog's marks
show. Dialog notes stay hidden while their dialog is closed.

One reposition loop: a single coalesced rAF, triggered by resize, a
capture-phase scroll listener (catches nested containers) and a
MutationObserver on the body. Off while the tool is closed and no marks show.

## Coexisting with dialogs (spike first)

The host is always shown in the top layer with `popover`. When a dialog is
open (native `dialog[open]`, any `[role=dialog]`/`[role=alertdialog]`), the
host moves inside the topmost one, except Headless UI dialogs, where it stays
a direct child of `<body>`: Headless UI counts body children as inside but
not its own wrapper element. Verified against Headless UI 2.2, Radix Dialog 1.3
and native `<dialog>`. This keeps clicks "inside" for
outside-click handlers and keeps the textarea inside focus traps. Test
Headless UI, Radix and native `<dialog>`; assert the dialog count never drops.

No `<form>` or submit buttons in the tool, since host selectors like
`dialog form` can catch them.

## Data

Note: `id (uuid), n, kind (pin|element|area), route, comment, createdAt,
updatedAt, sentAt?, pickedUpAt?, status (open|sent|working|resolved), reply?, resolvedAt?, agent?,
selector, testId?, tag, targetText, x, y, bounds, offset?, scroll, viewport,
inDialog, context`. See `src/types.ts`.

Submission: `id, submittedAt, route, noteIds, excerpts`.

Browser localStorage is the working copy. The server copy is merged per id
(`{...stored, ...incoming}`); the browser never sets `status`, `reply` or `agent`, so
a sync can't overwrite the agent. Deletes and clears are tombstones, fetched
before cached notes render so deleted marks don't flash back.

## Transports

1. **http**: `annotate-anything/vite` plugin and a plain Node middleware.
   `.annotations/feedback.json` and `submissions.jsonl`. `GET /feedback`,
   `POST /feedback` (sync), `POST /feedback/submit`, `POST /feedback/status`.
   Exact-origin check, size caps, atomic temp-file writes on one queue.
   Send = sync, submit, then stamp `sentAt`; on failure notes stay unsent.
2. **onSubmit**: a server-side hook that gets each sent batch and pushes it
   anywhere. It returns where the notes went; the page shows that, and errors
   are reported rather than thrown. Status and replies still flow through the
   store.
3. **mcp**: list, get, set status, reply, and a blocking `watch` tool, over the
   same file store.
4. **clipboard**: opt-in; Markdown prompt with the notes.

The UI always says which mode is active and whether a watcher is alive.

## Agent loop

`npx annotate-anything watch` tails `submissions.jsonl` with a byte cursor,
a heartbeat file and a lock (only one watcher). The agent instructions file
covers: read the submission, set `working`, fix, set `resolved` with a 1-3
sentence reply; never resolve without a change.

## Milestones

1. Dialog spike + fixture app.
2. Core UI and anchoring with localStorage only; Playwright acceptance list.
3. http transport, watcher, agent instructions, status/reply loop.
4. MCP server, `onSubmit` hook, clipboard mode.
5. Packaging, docs, framework wrappers, publish.
