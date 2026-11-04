<h4 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/wordmark-dark.svg">
    <img src="docs/images/wordmark-light.svg" alt="annotate-anything" width="300">
  </picture>
  <br>
  A visual engineering tool for leaving notes and sending them straight to your coding agent.
</h4>

<p align="center">
  <a href="https://github.com/dylan-murray/annotate-anything/actions/workflows/checks.yml"><img src="https://github.com/dylan-murray/annotate-anything/actions/workflows/checks.yml/badge.svg?branch=main" alt="Checks"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/node.js-22.12%2B-5fa04e?logo=nodedotjs&logoColor=white&style=flat-square&labelColor=24292f" alt="Node.js 22.12+"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-3da639?style=flat-square&labelColor=24292f" alt="License: MIT"></a>
</p>

<h2></h2>

Leave notes directly on your web app while you develop it. Each note records the
exact element and its coordinates, so your coding agent knows precisely what you
mean. Press Send, and the agent shows its progress and replies right on the note.

<img src="docs/images/annotate-anything-demo.webp" alt="annotate-anything demo in a browser with two tabs of fixture apps. On Nocturne, a music app, Element mode selects the album cover with a note asking for a full-screen now playing view, and Area mode boxes the player with a note to make the waveform huge. Send goes to the UI agent, the marks show each note's progress, and as the notes resolve the cover grows to fill the page and a large waveform rises across the bottom. The cursor then clicks the Atlas tab, a road trip planner. A note on the Big Sur stop asks to add a stop in Santa Barbara and an Area note on the map asks for a sunset glow. The route redraws through the new stop, the itinerary and mileage update, the route turns sunset colours, and the first note opens to show the agent's reply">

## ✨ What you get

- 📍 **Pin, Element and Area** notes: an exact spot, a whole element, or a box you drag
- 🤖 **Any coding agent** through a shell command or an MCP server: Claude Code, Codex, Grok, Cursor, Gemini CLI, or anything else with a shell
- 💬 **Status and replies on the note**: sent, picked up, working, then done with the agent's reply
- 🎯 **Send to a running agent**, picked from a list, when your app or desk runs several
- 🧱 **Any stack**: Vite, Next.js, any Node server, or a script tag and bookmarklet for everything else
- 🪟 **Works inside dialogs and web components**, including open shadow roots and same-origin iframes, without closing the app's modals
- 🔒 **Local only**: on in development, off in production builds, and it refuses requests from other machines

## 🚀 Quick start

```sh
npm i -D annotate-anything
```

In a Vite app (React, Vue, Svelte, Solid, Preact):

```js
// vite.config.js
import annotateAnything from "annotate-anything/vite";

export default defineConfig({
  plugins: [annotateAnything()],
});
```

Start the dev server and a pencil button appears in the bottom-right corner.
Notes are kept in `.annotations/`, which ignores itself in git. Other stacks are
[below](#-setup-by-stack).

Then point your agent at the notes. In a terminal or in your agent's session:

```sh
npx annotate-anything init     # adds a short section to AGENTS.md / CLAUDE.md
npx annotate-anything attach   # explains the loop and waits for your next Send
```

## 🖱️ Using it

- **Pin** marks an exact spot, **Element** a whole element, **Area** a box you drag.
- ⌘↵ saves a note. Esc steps back one level: the note, the list, the mode, then the toolbar.
- **Send** delivers every unsent note. Marks turn purple when sent, amber while
  the agent works, and green with a check when it's done, with its reply on the note.
- Drag the pencil anywhere; double-click it to put it back.

## 🤖 Connect an agent

Any agent with a shell can run `npx annotate-anything attach`. It finds the
project's notes, explains the loop, works out which agent it is, and waits for
your next Send. The agent then reports back on each note:

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

## 🧱 Setup by stack

| Stack | Setup |
| --- | --- |
| Vite apps (React, Vue, Svelte, Solid, Preact) | `plugins: [annotateAnything()]` from `annotate-anything/vite` |
| Server-rendered Vite frameworks (Astro, SvelteKit, React Router/Remix) | The same plugin. It adds itself to server-rendered pages too (tested with Astro). Astro: `vite: { plugins: [annotateAnything()] }` |
| Next.js App Router | A route and a component, [below](#nextjs) |
| Express, webpack-dev-server, any Node server | `app.use(createMiddleware())` from `annotate-anything/middleware`, plus `<script src="/__annotate/client.js"></script>` |
| Anything else: Rails, Django, Phoenix, Laravel, Go, Nuxt, static sites | `npx annotate-anything serve`, then its script tag or bookmarklet, [below](#any-backend-or-no-code-changes) |

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

The route answers 404 in production builds and the component renders nothing
there. Pages Router: `export default annotatePagesRoute()` in
`pages/api/annotate/[...path].ts`, with `export const config = { api: { bodyParser: false } }`.

### Any backend, or no code changes

```sh
npx annotate-anything serve
```

This runs a small notes server on `localhost:4319` that any page on your
machine can use. Either add
`<script src="http://localhost:4319/__annotate/client.js"></script>` to the
app's dev layout, or open `http://localhost:4319` and drag the **Annotate**
bookmarklet to your bookmarks bar, then click it on any local page without
changing its code. Pages that aren't on `localhost` need
`--origin http://app.example.test:3000`.

The server only listens on this machine (127.0.0.1 and ::1).

Every setup refuses requests from other machines and requests addressed to a host
name that isn't local (`localhost`, private addresses, `.test`, `.local`,
`.internal`, `.lan`), so a website can't reach your notes by pointing its own domain
at your machine. Testing on a phone, in a container or through a tunnel? Pass
`allowRemote: true` to the Vite plugin, middleware or Next route, and only on a
network you trust, since anyone who can reach it can send notes to your agent. Add
public dev domains with `allowedHosts: ["dev.example.com"]` on the middleware or
Next route; the Vite plugin follows Vite's `server.allowedHosts`.

The Next.js App Router can't see the caller's address directly, and `next dev`
listens on your whole network by default, so run `next dev -H 127.0.0.1`.

## 🛠️ Hooks and options

### Send notes somewhere else

Push each sent batch to a webhook, a chat, or your own agent runner with
`onSubmit` on the Vite plugin, middleware or Next route. Return where it went
and the page says so; `ok: true` marks the notes picked up:

```js
annotateAnything({
  onSubmit: async ({ notes, submission }) => {
    const res = await fetch("http://localhost:9000/hook", { method: "POST", body: JSON.stringify({ notes, submission }) });
    return { to: "the review bot", ok: res.ok };
  },
})
```

### Let people pick an agent

Apps that run several agents can let the person pick one. Return them from
`targets`, and Send opens a **Send to** list. After the first pick, Send goes
straight to that agent and the arrow beside it chooses another. The chosen id
reaches `onSubmit` as `batch.target`, with `batch.prompt` ready to hand over:
the notes, plus the commands that report progress back to this notes folder.

```js
annotateAnything({
  targets: () => mySessions().map((s) => ({ id: s.id, label: s.name, detail: s.repo })),
  onSubmit: ({ target, prompt }) => mySessions.send(target, prompt).then(() => ({ to: "your session", ok: true })),
})
```

A server in front of the notes server can do the same: answer
`GET <base>/targets` itself, and deliver the `handoff` that `/feedback/submit`
returns when the request names a target. Pass `headers` to `annotate()` if that
server wants an auth header.

### In code

```js
import { annotate } from "annotate-anything";
const tool = annotate({ endpoint: "/__annotate", context: () => ({ variant: "redesign" }) });
tool.addControl(myToggleButton);
```

React without Next: `import { Annotate } from "annotate-anything/react"`.

No server at all: `annotate({ transport: "clipboard" })` turns Send into Copy,
which puts the notes on your clipboard as a prompt.

### Where notes work

Anywhere in the page, including inside open shadow roots (web components) and
same-origin iframes. Cross-origin iframes and closed shadow roots can't be
reached from the page; pins still mark the spot.

## 🎨 Theming

Set CSS custom properties on the `annotate-anything` element, or pass
`client.theme` to the plugin:

```css
annotate-anything { --aa-accent: #2f6b4f; --aa-ink: #1f2a24; --aa-font: 13px/1.4 "Inter", sans-serif; }
```

The tokens are `ink`, `ink-2`, `ink-hover`, `text`, `muted`, `line`, `edge`,
`divider`, `hover`, `accent`, `accent-hover`, `on-accent`, `sent`, `working`,
`resolved`, `danger`, `shadow`, `launcher-ring`, `radius` and `font`, each as
`--aa-<name>`.

## 🧑‍💻 Development

```sh
npm install
npm run dev        # fixture app with Headless UI, Radix and native dialogs
npm test           # builds, then runs the Playwright checks at 1440 and 390 wide
npm run typecheck
```

See [docs/design.md](docs/design.md) for how it's put together.

## 📄 License

[MIT](LICENSE)
