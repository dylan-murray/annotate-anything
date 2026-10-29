# annotate-anything

Click on any running web app, write what should change, and send the notes
straight to the coding agent working on it. The agent replies on each note,
and you see the reply where you left the note.

It works with any framework through one Vite plugin, one Node middleware or one
script tag, and it starts only in local development unless you turn it on
elsewhere.

Early days: not published to npm yet.

## Try it in a Vite app

```sh
npm i -D ~/personal/annotate-anything
```

```js
// vite.config.js
import annotateAnything from "annotate-anything/vite";

export default defineConfig({
  plugins: [annotateAnything()],
});
```

Start the dev server and a pencil button appears in the bottom-right corner.
Notes are kept in `.annotations/` (it ignores itself in git).

Then run `npx annotate-anything init`, which adds a short section to your
`AGENTS.md` / `CLAUDE.md` so every agent in the project knows the loop.

## Any coding agent

Tell any agent with a shell to run:

```sh
npx annotate-anything attach
```

It finds the project's notes, explains the loop, works out which agent it is,
and waits for your next Send. The agent then reports back on each note:

```sh
npx annotate-anything status 3 working --reply "Shrinking the heading"
npx annotate-anything status 3 resolved --reply "Dropped the h1 to 26px."
```

Agents that prefer tools use the MCP server (`wait_for_notes`, `list_notes`,
`update_notes`):

```sh
claude mcp add annotate-anything -- npx annotate-anything mcp
codex mcp add annotate-anything -- npx annotate-anything mcp
grok mcp add annotate-anything -s project -- npx annotate-anything mcp
```

Cursor and Gemini CLI take the same command in their `mcpServers` config.

Either way, the browser shows each step on the note: sent, picked up,
"Codex is working on it · <latest update>", then the agent's reply.

## Using it

- **Pin** marks an exact spot, **Element** a whole element, **Area** a box you
  drag.
- ⌘↵ saves a note. Esc steps back one level: the note, the list, the mode,
  then the toolbar.
- **Send** delivers every unsent note. Marks turn purple when sent, amber while
  the agent works and green with a check when it's done, with its reply on the
  note.
- Drag the pencil anywhere; double-click it to put it back.

## Setup by stack

| Stack | Setup |
| --- | --- |
| Vite apps (React, Vue, Svelte, Solid, Preact) | `plugins: [annotateAnything()]` from `annotate-anything/vite` |
| Server-rendered Vite frameworks (Astro, SvelteKit, React Router/Remix) | the same plugin; it adds itself to server-rendered pages too (tested with Astro). Astro: `vite: { plugins: [annotateAnything()] }` |
| Next.js App Router | a route and a component, below |
| Express, webpack-dev-server, any Node server | `app.use(createMiddleware())` from `annotate-anything/middleware`, plus `<script src="/__annotate/client.js"></script>` |
| Anything else: Rails, Django, Phoenix, Laravel, Go, Nuxt, static sites | `npx annotate-anything serve`, then its script tag or bookmarklet |

`npx annotate-anything init` looks at the project and prints the steps for it.

### Next.js

```ts
// app/api/annotate/[...path]/route.ts
import { annotateRoute } from "annotate-anything/next";
export const { GET, POST, OPTIONS } = annotateRoute();
```

```tsx
// app/layout.tsx, inside <body>
import { Annotate } from "annotate-anything/next/client";
<Annotate />
```

The route answers 404 in production builds and the component does nothing
there. Pages Router: `export default annotatePagesRoute()` in
`pages/api/annotate/[...path].ts`, with `export const config = { api: { bodyParser: false } }`.

### Any backend, or no code changes at all

```sh
npx annotate-anything serve
```

This runs a small notes server on `localhost:4319` that any page on your
machine can use. Either add `<script src="http://localhost:4319/__annotate/client.js"></script>`
to the app's dev layout, or open `http://localhost:4319` and drag the
**Annotate** bookmarklet to your bookmarks bar, then click it on any local page
without changing its code. Pages on custom local domains need
`--origin http://app.mycompany.test:3000`.

### In code

```js
import { annotate } from "annotate-anything";
const tool = annotate({ endpoint: "/__annotate", context: () => ({ variant: "redesign" }) });
tool.addControl(myToggleButton);
```

React without Next: `import { Annotate } from "annotate-anything/react"`.

Push each sent batch somewhere else (a webhook, a chat, your own agent runner)
with `onSubmit` on the Vite plugin, middleware or Next route. Return where it
went and the page says so; `ok: true` marks the notes picked up:

```js
annotateAnything({
  onSubmit: async ({ notes, submission }) => {
    const res = await fetch("http://localhost:9000/hook", { method: "POST", body: JSON.stringify({ notes, submission }) });
    return { to: "the review bot", ok: res.ok };
  },
})
```

No server at all: `annotate({ transport: "clipboard" })` turns Send into Copy,
which puts the notes on your clipboard as a prompt.

### Where notes work

Anywhere in the page, including inside open shadow roots (web components) and
same-origin iframes. Cross-origin iframes and closed shadow roots can't be
reached from the page; pins still mark the spot.

## Theming

Set CSS custom properties on the `annotate-anything` element, or pass
`client.theme` to the plugin:

```css
annotate-anything { --aa-accent: #2f6b4f; --aa-ink: #1f2a24; --aa-font: 13px/1.4 "Inter", sans-serif; }
```

## Development

```sh
npm install
npm run dev        # fixture app with Headless UI, Radix and native dialogs
npm test           # builds, then runs the Playwright checks at 1440 and 390 wide
npm run typecheck
```
