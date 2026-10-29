import { containing, cssPath, elementAt, find, inDialog, labelFor, place, rectOf, rootsOf, scrollableAt, stableAttr, textOf, topLayer, within, type Placed } from "./anchor";
import { ICON } from "./icons";
import { css } from "./styles";
import { clipboard, http, local, type PageInfo, type Transport } from "./transport";
import type { Box, FeedbackState, Kind, Mode, Note, Status, Target } from "./types";

export interface Options {
  transport?: "http" | "clipboard" | "local" | Transport;
  endpoint?: string;
  headers?: Record<string, string>;
  scope?: string;
  agentName?: string;
  watchCommand?: string;
  stableAttributes?: string[];
  context?: () => Record<string, unknown>;
  route?: () => string;
  navigate?: (route: string) => void | Promise<void>;
  controls?: HTMLElement[];
  theme?: Record<string, string>;
}

interface Panel {
  note: Note;
  isNew: boolean;
}

const PANEL_W = 300;
const KIND_LABEL: Record<Kind, string> = { pin: "Pin", element: "Element", area: "Area" };
const HINT: Record<Mode, string> = {
  pin: "Click an exact spot to pin a note · Esc to stop",
  element: "Click an element to note it · Esc to stop",
  area: "Drag a box over an area · Esc to stop",
};
const TOOL_TITLE: Record<Mode, string> = {
  pin: "Drop a pin on an exact spot",
  element: "Select a whole element",
  area: "Drag a box over an area",
};
const LAYOUT_ATTRS = ["class", "style", "hidden", "open", "aria-hidden", "aria-expanded", "aria-current", "data-state"];

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const now = () => new Date().toISOString();
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const clock = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export class Annotator {
  readonly host: HTMLElement;
  private shadow: ShadowRoot;
  private q: <T extends Element = HTMLElement>(s: string) => T;
  private layer: HTMLElement;
  private hoverBox: HTMLElement;
  private drawBox: HTMLElement;
  private marks: HTMLElement;
  private panelEl: HTMLElement;
  private bar: HTMLElement;
  private launcher: HTMLElement;
  private transport: Transport;
  private attrs: string[];
  private keys: { notes: string; pos: string; marks: string; target: string };

  private notes: Note[] = [];
  private deleted: string[] = [];
  private pending = new Map<string, { status: Status; at: number }>();
  private watching = false;
  private agentFromServer: string | undefined;
  private connected = true;
  private ready = false;
  private open = false;
  private mode: Mode | null = null;
  private listOpen = false;
  private confirming = false;
  private picking: Target[] | null = null;
  private offers = false;
  private panel: Panel | null = null;
  private drawing: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private msg: string | null = null;
  private intro: string | null = null;
  private busy = false;
  private lastSent: string | undefined;
  private delivered = false;
  private showMarks: boolean;
  private route: string;
  private found = new Map<string, Element | null>();
  private dirtyAnchors = true;
  private modal: Element | null = null;
  private roots = new Set<Document | ShadowRoot>();
  private dialog: Element | null = null;

  private active = false;
  private keysOn = false;
  private raf = 0;
  private attachRaf = 0;
  private msgTimer = 0;
  private nudgeTimer = 0;
  private pushTimer = 0;
  private pollTimer = 0;
  private pushing: Promise<void> | null = null;
  private modalObserver: MutationObserver;
  private layoutObserver: MutationObserver;
  private drag: { sx: number; sy: number; bx: number; by: number; moved: boolean } | null = null;
  private destroyed = false;

  constructor(private options: Options = {}) {
    const scope = options.scope ?? "default";
    this.keys = { notes: `annotate-anything:${scope}:notes`, pos: "annotate-anything:launcher", marks: "annotate-anything:marks", target: `annotate-anything:${scope}:target` };
    this.attrs = options.stableAttributes ?? ["data-testid", "data-test", "data-qa", "data-cy"];
    const t = options.transport ?? (options.endpoint ? "http" : "local");
    this.transport = typeof t === "object" ? t : t === "http" ? http(options.endpoint ?? "/__annotate", options.headers) : t === "clipboard" ? clipboard() : local();
    const saved = read<{ notes?: Note[]; deleted?: string[] }>(this.keys.notes, {});
    this.notes = Array.isArray(saved.notes) ? saved.notes : [];
    this.deleted = Array.isArray(saved.deleted) ? saved.deleted : [];
    this.ready = this.transport.kind !== "http";
    this.showMarks = read(this.keys.marks, true);
    this.route = this.routeOf();

    this.host = document.createElement("annotate-anything");
    const hs = this.host.style;
    for (const [k, v] of Object.entries({
      position: "fixed", inset: "0", width: "100vw", height: "100vh", margin: "0", padding: "0", border: "0",
      background: "transparent", overflow: "visible", "pointer-events": "none", "z-index": "2147483000",
      display: "block", "max-width": "none", "max-height": "none", transform: "none", filter: "none", contain: "none",
    }))
      hs.setProperty(k, v, "important");
    this.setTheme(options.theme);
    if ("showPopover" in this.host) this.host.setAttribute("popover", "manual");
    this.shadow = this.host.attachShadow({ mode: "open" });
    this.shadow.innerHTML = `<style>${css}</style><div class="root" part="root">
      <div class="capture" hidden></div>
      <div class="hover" hidden><span></span></div>
      <div class="area drawing" hidden></div>
      <div class="marks"></div>
      <div class="toolbar" role="toolbar" aria-label="Annotate this page" hidden></div>
      <div class="panel" role="dialog" aria-label="Note" hidden></div>
      <button class="launcher" type="button" aria-label="Annotate this page" aria-expanded="false" title="Annotate the UI (drag to move · double-click to reset)">${ICON.pencil}<span class="badge" hidden></span></button>
    </div>`;
    this.q = <T extends Element = HTMLElement>(s: string) => this.shadow.querySelector(s) as T;
    this.layer = this.q(".capture");
    this.hoverBox = this.q(".hover");
    this.drawBox = this.q(".drawing");
    this.marks = this.q(".marks");
    this.panelEl = this.q(".panel");
    this.bar = this.q(".toolbar");
    this.launcher = this.q(".launcher");
    for (const el of options.controls ?? []) this.addControl(el);

    this.modalObserver = new MutationObserver((records) => this.onModalMutation(records));
    this.layoutObserver = new MutationObserver(() => {
      this.dirtyAnchors = true;
      this.schedule();
    });
    this.wire();
    this.placeLauncher();
    this.attach();
    this.modalObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open", "aria-modal", "role"] });
    this.render();
    void this.start();
  }

  addControl(el: HTMLElement) {
    el.slot = "controls";
    this.host.appendChild(el);
    this.renderBar();
  }

  setTheme(theme: Record<string, string> | undefined) {
    for (const [k, v] of Object.entries(theme ?? {})) this.host.style.setProperty(k.startsWith("--") ? k : `--aa-${k}`, v);
  }

  openTool(opts: { mode?: Mode; intro?: string } = {}) {
    if (!this.open) this.toggleOpen();
    if (opts.mode && this.mode !== opts.mode) this.setMode(opts.mode);
    this.intro = opts.intro ?? null;
    this.renderBar();
  }

  close() {
    if (this.open) this.toggleOpen();
  }

  destroy() {
    this.destroyed = true;
    this.setActive(false);
    this.modalObserver.disconnect();
    clearTimeout(this.pushTimer);
    clearTimeout(this.pollTimer);
    this.host.remove();
  }

  // ---------- data ----------

  private routeOf(): string {
    if (this.options.route) return this.options.route();
    return location.pathname + (location.hash.startsWith("#/") ? location.hash : "");
  }

  private page(): PageInfo {
    return { route: this.route, url: location.href, title: document.title, viewport: { width: innerWidth, height: innerHeight } };
  }

  private save() {
    write(this.keys.notes, { notes: this.notes, deleted: this.deleted.slice(-2000) });
  }

  private changed() {
    this.save();
    this.schedulePush();
    this.render();
  }

  private unsent = () => this.notes.filter((n) => n.status === "open");
  private done = () => this.notes.filter((n) => n.status === "resolved");
  private waiting = () => this.notes.filter((n) => n.status === "sent" || n.status === "working");

  private async start() {
    if (this.transport.kind !== "http") return;
    await this.pull();
    if (this.ready) this.schedulePush(0);
    this.poll();
  }

  private merge(state: FeedbackState) {
    const deleted = new Set([...state.deleted, ...this.deleted]);
    const server = new Map(state.notes.map((n) => [n.id, n]));
    const out: Note[] = [];
    const t = Date.now();
    for (const mine of this.notes) {
      if (deleted.has(mine.id)) continue;
      const theirs = server.get(mine.id);
      server.delete(mine.id);
      if (!theirs) {
        out.push(mine);
        continue;
      }
      const p = this.pending.get(mine.id);
      if (p && theirs.status === p.status) this.pending.delete(mine.id);
      if (p && theirs.status !== p.status && t - p.at < 15000) {
        out.push(mine);
        continue;
      }
      out.push({ ...mine, status: theirs.status, sentAt: theirs.sentAt, pickedUpAt: theirs.pickedUpAt, reply: theirs.reply, resolvedAt: theirs.resolvedAt });
    }
    for (const theirs of server.values()) if (!deleted.has(theirs.id)) out.push(theirs);
    this.notes = out;
    this.deleted = [...deleted];
    this.watching = !!state.watching;
    this.agentFromServer = state.agent;
    this.save();
  }

  private apply(state: FeedbackState) {
    const before = this.panel && !this.panel.isNew ? this.notes.find((n) => n.id === this.panel!.note.id) : undefined;
    const was = new Map(this.notes.map((n) => [n.id, n.status]));
    this.merge(state);
    const finished = this.notes.filter((n) => n.status === "resolved" && (was.get(n.id) === "sent" || was.get(n.id) === "working"));
    if (finished.length)
      this.flash(`${this.who(true)} finished ${finished.length === 1 ? `note ${finished[0]!.n}` : `notes ${finished.map((n) => n.n).join(", ")}`}.`);
    this.connected = true;
    this.ready = true;
    if (this.panel && !this.panel.isNew) {
      const fresh = this.notes.find((n) => n.id === this.panel!.note.id);
      if (!fresh) this.closePanel();
      else if (before && (fresh.status !== before.status || fresh.reply !== before.reply || fresh.pickedUpAt !== before.pickedUpAt) && !this.isDirty()) this.openPanel(fresh, false);
      else this.panel.note = fresh;
    }
    this.render();
  }

  private async pull() {
    try {
      this.apply(await this.transport.pull());
    } catch {
      this.connected = false;
      this.ready = true;
      this.render();
    }
  }

  private schedulePush(delay = 300) {
    if (this.transport.kind !== "http") return;
    clearTimeout(this.pushTimer);
    this.pushTimer = window.setTimeout(() => void this.flush(), delay);
  }

  private async flush() {
    if (this.transport.kind !== "http") return;
    clearTimeout(this.pushTimer);
    while (this.pushing) await this.pushing;
    this.pushing = (async () => {
      try {
        this.apply(await this.transport.push(this.notes, this.deleted));
      } catch {
        this.connected = false;
        this.renderBar();
        this.schedulePush(15000);
      }
    })();
    await this.pushing;
    this.pushing = null;
  }

  private poll() {
    clearTimeout(this.pollTimer);
    if (this.destroyed || this.transport.kind !== "http") return;
    const waiting = this.waiting().length > 0;
    const need = this.open || waiting || !this.connected;
    this.pollTimer = window.setTimeout(
      async () => {
        if (need && !document.hidden) await this.pull();
        this.poll();
      },
      waiting ? 2000 : need ? 5000 : 15000,
    );
  }

  private setStatus(note: Note, status: Status) {
    note.status = status;
    note.updatedAt = now();
    if (status === "open") delete note.sentAt;
    if (status === "resolved") note.resolvedAt = now();
    this.pending.set(note.id, { status, at: Date.now() });
    this.changed();
    this.transport.status([note.id], status).catch(() => {});
  }

  private remove(ids: string[]) {
    const gone = new Set(ids);
    this.notes = this.notes.filter((n) => !gone.has(n.id));
    this.deleted.push(...ids);
    for (const id of ids) this.found.delete(id);
    this.changed();
  }

  // ---------- lifecycle: listeners only while there is something to track ----------

  private onModalMutation(records: MutationRecord[]) {
    if (!this.host.isConnected) return this.attach();
    if (this.attachRaf || !records.some((r) => r.type === "attributes" || r.addedNodes.length || r.removedNodes.length)) return;
    this.attachRaf = requestAnimationFrame(() => {
      this.attachRaf = 0;
      this.attach();
    });
  }

  private attach() {
    if (this.destroyed || !document.body) return;
    const { parent, dialog, modal } = topLayer(this.host);
    const top = modal ? dialog : null;
    const moved = this.host.parentElement !== parent;
    if (moved) {
      if (this.popoverOpen()) this.host.hidePopover();
      parent.appendChild(this.host);
    }
    if (this.host.hasAttribute("popover") && (moved || dialog !== this.dialog || !this.popoverOpen())) {
      try {
        if (this.popoverOpen()) this.host.hidePopover();
        this.host.showPopover();
      } catch {}
    }
    this.dialog = dialog;
    if (top !== this.modal) {
      this.modal = top;
      this.dirtyAnchors = true;
      this.schedule();
    }
  }

  private popoverOpen(): boolean {
    try {
      return this.host.matches(":popover-open");
    } catch {
      return false;
    }
  }

  private setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    const f = on ? "addEventListener" : "removeEventListener";
    window[f]("resize", this.onResize);
    document[f]("scroll", this.onScroll, { capture: true });
    window[f]("popstate", this.onRoute);
    window[f]("hashchange", this.onRoute);
    window[f]("annotate-anything:route", this.onRoute);
    document[f]("visibilitychange", this.onVisible);
    if (on) {
      patchHistory();
      this.layoutObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: LAYOUT_ATTRS });
    } else {
      this.layoutObserver.disconnect();
      for (const root of this.roots)
        if (root.nodeType === 9) {
          root.removeEventListener("scroll", this.onScroll, { capture: true });
          (root as Document).defaultView?.removeEventListener("resize", this.onScroll);
        }
      this.roots.clear();
    }
  }

  private setKeys(on: boolean) {
    if (on === this.keysOn) return;
    this.keysOn = on;
    if (on) window.addEventListener("keydown", this.onKey, true);
    else window.removeEventListener("keydown", this.onKey, true);
  }

  private onResize = () => {
    this.schedule();
    if (this.open) this.placeBar();
  };
  private onScroll = () => this.schedule();
  private onVisible = () => {
    if (!document.hidden && this.transport.kind === "http") void this.pull();
  };
  private onRoute = () => {
    const r = this.routeOf();
    if (r === this.route) return;
    this.route = r;
    this.dirtyAnchors = true;
    this.render();
  };
  private onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !(this.open || this.panel)) return;
    e.preventDefault();
    e.stopPropagation();
    if (this.panel) this.dismissPanel();
    else if (this.picking) {
      this.picking = null;
      this.renderBar();
    } else if (this.confirming) {
      this.confirming = false;
      this.renderBar();
    } else if (this.listOpen) {
      this.listOpen = false;
      this.renderBar();
    } else if (this.mode) this.setMode(this.mode);
    else this.toggleOpen();
  };

  // ---------- rendering ----------

  private render() {
    this.setActive(this.open || this.notes.length > 0);
    this.setKeys(this.open || !!this.panel);
    this.renderMarks();
    this.renderBar();
    this.renderLauncher();
    this.renderLayer();
  }

  private schedule() {
    if (!this.raf) this.raf = requestAnimationFrame(() => this.frame());
  }

  private frame() {
    this.raf = 0;
    if (this.dirtyAnchors) {
      this.dirtyAnchors = false;
      this.found.clear();
    }
    this.position();
  }

  private elementFor(note: Note): Element | null {
    let el = this.found.get(note.id);
    if (el === undefined || (el && !el.isConnected)) {
      el = find(note, this.host, this.attrs);
      this.found.set(note.id, el);
      if (el) this.watchRoots(el);
    }
    return el;
  }

  private watchRoots(el: Element) {
    if (!this.active) return;
    for (const root of rootsOf(el)) {
      if (this.roots.has(root)) continue;
      this.roots.add(root);
      this.layoutObserver.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: LAYOUT_ATTRS });
      if (root.nodeType === 9) {
        root.addEventListener("scroll", this.onScroll, { capture: true, passive: true });
        (root as Document).defaultView?.addEventListener("resize", this.onScroll);
      }
    }
  }

  private placed(note: Note): Placed {
    const el = this.elementFor(note);
    const p = place(note, el);
    if (this.modal && !(el && within(this.modal, el))) p.hidden = true;
    return p;
  }

  private visibleNotes(): Note[] {
    if (!this.showMarks || !this.ready) return [];
    return this.notes.filter((n) => n.route === this.route);
  }

  private renderMarks() {
    const shown = this.visibleNotes();
    const p = this.panel;
    let html = shown
      .sort((a, b) => a.n - b.n)
      .map(
        (n) =>
          (n.kind !== "pin" ? `<div class="area ${n.status}" data-area="${esc(n.id)}"></div>` : "") +
          `<button type="button" class="mark k-${n.kind} ${n.status}" data-id="${esc(n.id)}" title="${esc(n.comment)}" aria-label="Note ${n.n}"><span>${n.status === "resolved" ? "✓" : n.n}</span></button>`,
      )
      .join("");
    if (p?.isNew)
      html +=
        (p.note.kind !== "pin" ? '<div class="area" data-area="new"></div>' : "") +
        `<button type="button" class="mark k-${p.note.kind} current" data-id="new" aria-label="New note"><span>${p.note.n}</span></button>`;
    this.marks.innerHTML = html;
    this.position();
  }

  private position() {
    for (const m of this.marks.querySelectorAll<HTMLElement>("[data-id]")) {
      const id = m.dataset.id!;
      const n = id === "new" ? this.panel?.note : this.notes.find((x) => x.id === id);
      if (!n) continue;
      const r = id === "new" ? this.newRect(n) : this.placed(n);
      const area = this.marks.querySelector<HTMLElement>(`[data-area="${CSS.escape(id)}"]`);
      m.hidden = r.hidden;
      m.style.left = r.x + "px";
      m.style.top = r.y + "px";
      m.classList.toggle("detached", !r.ok);
      m.classList.toggle("current", !!this.panel && (id === "new" || this.panel.note.id === n.id));
      if (area) {
        area.hidden = r.hidden;
        Object.assign(area.style, { left: r.x + "px", top: r.y + "px", width: r.width + "px", height: r.height + "px" });
        area.classList.toggle("detached", !r.ok);
      }
    }
    if (this.panel) this.placePanel();
  }

  private newRect(n: Note): Placed {
    const el = this.found.get(n.id) ?? null;
    return place(n, el && el.isConnected ? el : null);
  }

  private placePanel() {
    const p = this.panel!;
    const r = p.isNew ? this.newRect(p.note) : this.placed(p.note);
    const w = Math.min(PANEL_W, innerWidth - 16);
    const h = this.panelEl.offsetHeight;
    let left = r.x + r.width + 14;
    if (left + w > innerWidth - 8) left = r.x - w - 14;
    if (left < 8) left = Math.min(Math.max(8, r.x), innerWidth - w - 8);
    let top = Math.min(Math.max(8, r.y - 8), innerHeight - h - 8);
    if (r.hidden) top = innerHeight / 3;
    Object.assign(this.panelEl.style, { left: left + "px", top: Math.max(8, top) + "px", width: w + "px" });
  }

  private statusText(): string {
    if (this.msg) return this.msg;
    if (this.intro) return this.intro;
    if (this.mode) return HINT[this.mode];
    const u = this.unsent().length;
    const t = this.transport.kind;
    if (t === "http" && !this.connected) return "Saved in this browser · server unreachable, retrying";
    if (u && t === "clipboard") return `${plural(u, "note")} ready · Copy puts them on your clipboard`;
    if (u && t === "local") return `${plural(u, "note")} saved in this browser · no agent connection`;
    if (u) return `${plural(u, "note")} waiting · press Send`;
    if (t === "local") return "No agent connection · notes stay in this browser";
    if (t === "clipboard") return "Copy mode · Copy puts your notes on the clipboard to paste into your agent";
    if (this.lastSent) return `Sent at ${clock(this.lastSent)}`;
    if (this.watching) return `Connected · ${this.who()} is listening`;
    return this.offers ? "Connected · Send lets you pick an agent" : `Connected · no agent attached yet · ask yours to run ${this.watchCmd()}`;
  }

  // Sent, but no agent was listening and none was picked.
  private unheard(n: Note) {
    return n.status === "sent" && !n.pickedUpAt && this.transport.kind === "http" && !this.watching && !this.delivered;
  }

  private noAgent() {
    return this.offers ? "no agent has it · open the note to send it to one" : `no agent attached · ask yours to run ${this.watchCmd()}`;
  }

  private watchCmd() {
    return this.options.watchCommand ?? "npx annotate-anything attach";
  }

  private busyText(): string {
    if (this.busy) return this.transport.kind === "clipboard" ? "Copying…" : `Sending to ${this.who()}…`;
    const working = this.notes.filter((n) => n.status === "working");
    if (working.length) {
      const latest = working.filter((n) => n.reply).sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1))[0];
      return `${this.who(true)} is working on ${plural(working.length, "note")}` + (latest?.reply ? ` · ${latest.reply}` : "");
    }
    const sent = this.notes.filter((n) => n.status === "sent");
    if (!sent.length) return "";
    const picked = sent.filter((n) => n.pickedUpAt);
    if (picked.length) return `${this.who(true)} picked up ${plural(picked.length, "note")} at ${clock(picked.map((n) => n.pickedUpAt!).sort().at(-1))} · starting soon`;
    const at = sent.map((n) => n.sentAt ?? "").sort().at(-1);
    return this.watching || this.delivered
      ? `Sent to ${this.who()} at ${clock(at)} · waiting for ${this.who()} to pick it up`
      : `Sent at ${clock(at)} · ${this.noAgent()}`;
  }

  private agentName(): string | undefined {
    return this.options.agentName ?? this.agentFromServer;
  }

  private who(start = false): string {
    return this.agentName() ?? (start ? "Your agent" : "your agent");
  }

  private stateLabel(n: Note): string {
    if (n.status === "open") return "not sent";
    if (n.status === "resolved") return "done";
    if (n.status === "working") return `${this.who()} working`;
    return n.pickedUpAt ? "picked up" : "sent";
  }

  private renderBar() {
    this.bar.hidden = !this.open;
    if (!this.open) return;
    const u = this.unsent().length;
    const d = this.done().length;
    const copy = this.transport.kind === "clipboard";
    const canSend = u > 0 && !this.busy && (this.transport.sends || copy) && (this.transport.kind !== "http" || this.ready);
    const tool = (k: Mode) =>
      `<button type="button" class="tool${this.mode === k ? " on" : ""}" data-mode="${k}" aria-pressed="${this.mode === k}" title="${TOOL_TITLE[k]}">${ICON[k]}${KIND_LABEL[k]}</button>`;
    const sorted = [...this.notes].sort((a, b) => a.n - b.n);
    const picker = this.picking
      ? `<div class="phead">Send to</div><ul class="list pick" aria-label="Send to">${
          this.picking.length
            ? this.picking
                .map(
                  (t) =>
                    `<li data-target="${esc(t.id)}" tabindex="0"><span class="ltext">${esc(t.label)}</span>${t.detail ? `<span class="lstate">${esc(t.detail)}</span>` : ""}</li>`,
                )
                .join("")
            : '<li class="empty">Loading agents…</li>'
        }</ul>`
      : "";
    const list = picker
      ? picker
      : this.listOpen
      ? `<ul class="list" aria-label="Notes">${
          sorted.length
            ? sorted
                .map(
                  (n) =>
                    `<li data-note="${esc(n.id)}" tabindex="0"><span class="dot ${n.status}">${n.status === "resolved" ? "✓" : n.n}</span><span class="ltext">${esc(n.comment)}</span><span class="lstate">${n.route !== this.route ? esc(n.route) + " · " : ""}${esc(this.stateLabel(n))}</span></li>`,
                )
                .join("")
            : '<li class="empty">No notes yet. Pick Pin, Element or Area.</li>'
        }</ul>` +
        (sorted.length
          ? this.confirming
            ? `<div class="confirm" role="alertdialog" aria-label="Clear all notes"><p>Delete all ${plural(sorted.length, "note")}? This can't be undone.</p><button type="button" class="btn" data-act="keep">Keep</button><button type="button" class="btn primary" data-act="clear-all">Clear all</button></div>`
            : '<div class="lfoot"><button type="button" class="btn ghost danger" data-act="confirm-clear">Clear all…</button></div>'
          : "")
      : "";
    const busy = this.busyText();
    this.bar.innerHTML =
      `<div class="tools">${tool("pin")}${tool("element")}${tool("area")}<span class="sep"></span>` +
      `<button type="button" class="tool${this.listOpen ? " on" : ""}" data-act="list" aria-pressed="${this.listOpen}" title="All notes" aria-label="All notes">${ICON.list}${this.notes.length}</button>` +
      `<button type="button" class="tool icon${this.showMarks ? "" : " on"}" data-act="marks" title="${this.showMarks ? "Hide marks" : "Show marks"}" aria-label="${this.showMarks ? "Hide marks" : "Show marks"}">${this.showMarks ? ICON.eye : ICON.eyeOff}</button><span class="sep"></span>` +
      `<button type="button" class="tool" data-act="clear-done" ${d ? "" : "disabled"} title="Remove notes that are done">Clear done${d ? `<span class="count">${d}</span>` : ""}</button>` +
      `<button type="button" class="send" data-act="send" ${canSend ? "" : "disabled"} title="${copy ? "Copy unsent notes to the clipboard" : this.transport.sends ? "Send unsent notes to your agent" : "No agent connection"}">${this.busy ? (copy ? "Copying…" : "Sending…") : copy ? "Copy" : "Send"}${u ? `<span class="count">${u}</span>` : ""}</button>` +
      `<span class="slot"><slot name="controls"></slot></span></div>` +
      (busy ? `<div class="busy" role="status"><i class="spinner"></i><span>${esc(busy)}</span></div>` : "") +
      `<div class="status" role="status">${esc(this.statusText())}</div>` +
      list;
    this.placeBar();
  }

  private launcherXY() {
    const r = this.launcher.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width || 44, h: r.height || 44 };
  }

  private placeBar() {
    const { x, y, w, h } = this.launcherXY();
    const s = this.bar.style;
    s.top = s.bottom = s.left = s.right = "";
    if (y < innerHeight / 2) s.top = y + h + 10 + "px";
    else s.bottom = innerHeight - y + 10 + "px";
    if (x > innerWidth / 2) s.right = Math.max(8, innerWidth - x - w) + "px";
    else s.left = Math.max(8, x) + "px";
  }

  private placeLauncher() {
    const pos = read<{ fx: number; fy: number } | null>(this.keys.pos, null);
    this.launcher.classList.toggle("placed", !!pos);
    if (pos) {
      this.launcher.style.setProperty("--fx", String(pos.fx));
      this.launcher.style.setProperty("--fy", String(pos.fy));
    } else {
      this.launcher.style.removeProperty("--fx");
      this.launcher.style.removeProperty("--fy");
    }
  }

  private renderLauncher() {
    const u = this.unsent().length;
    const badge = this.launcher.querySelector<HTMLElement>(".badge")!;
    badge.hidden = !(u && !this.open);
    badge.textContent = String(u);
    const busy = this.busyText();
    this.launcher.classList.toggle("on", this.open);
    this.launcher.classList.toggle("busy", !!busy);
    this.launcher.setAttribute("aria-expanded", String(this.open));
    this.launcher.title = (busy ? busy + " · " : "") + "Annotate the UI (drag to move · double-click to reset)";
  }

  private renderLayer() {
    const on = this.open && (!!this.mode || !!this.panel);
    this.layer.hidden = !on;
    if (!on || this.panel) this.hoverBox.hidden = true;
  }

  private flash(m: string) {
    this.msg = m;
    clearTimeout(this.msgTimer);
    this.msgTimer = window.setTimeout(() => {
      this.msg = null;
      this.renderBar();
    }, 6000);
    this.renderBar();
  }

  // ---------- actions ----------

  private setMode(m: Mode) {
    this.mode = this.mode === m ? null : m;
    this.intro = null;
    this.listOpen = false;
    this.confirming = false;
    this.hoverBox.hidden = true;
    this.render();
  }

  private toggleOpen() {
    if (this.panel && this.isDirty()) return this.nudge();
    this.open = !this.open;
    if (this.open && this.transport.targets)
      this.transport
        .targets()
        .then((t) => {
          this.offers = t.length > 0;
          this.renderBar();
        })
        .catch(() => {});
    if (!this.open) {
      this.mode = null;
      this.listOpen = false;
      this.confirming = false;
      this.intro = null;
      if (this.panel) this.closePanel();
    }
    this.render();
    this.poll();
  }

  private newNote(kind: Kind, el: Element, x: number, y: number, area?: Box): Note {
    const r = rectOf(el);
    const bounds = { x: r.left, y: r.top, width: r.width, height: r.height };
    const n = Math.max(0, ...this.notes.map((n) => n.n)) + 1;
    const t = now();
    let context: Record<string, unknown> = {};
    try {
      context = this.options.context?.() ?? {};
    } catch {}
    return {
      id: uuid(),
      n,
      kind,
      route: this.route,
      comment: "",
      createdAt: t,
      updatedAt: t,
      status: "open",
      selector: cssPath(el),
      testId: stableAttr(el, this.attrs),
      tag: el.tagName.toLowerCase(),
      targetText: textOf(el),
      x,
      y,
      bounds,
      offset: area ? { x: area.x - r.left, y: area.y - r.top, width: area.width, height: area.height } : undefined,
      scroll: { x: scrollX, y: scrollY },
      viewport: { width: innerWidth, height: innerHeight },
      inDialog: inDialog(el),
      context,
    };
  }

  private openPanel(note: Note, isNew: boolean, el?: Element) {
    this.listOpen = false;
    this.confirming = false;
    this.hoverBox.hidden = true;
    this.panel = { note, isNew };
    if (el) {
      this.found.set(note.id, el);
      this.watchRoots(el);
    }
    const n = note;
    const head = `<div class="head"><span class="chip ${n.status}">#${n.n} · ${KIND_LABEL[n.kind]}</span><span class="target" title="${esc(n.selector)}">${esc(n.tag || "page")}${n.targetText ? " · “" + esc(n.targetText.slice(0, 60)) + "”" : ""}</span><button type="button" class="x" data-act="close" aria-label="Close">×</button></div>`;
    if (n.status === "open")
      this.panelEl.innerHTML =
        head +
        `<textarea class="input" rows="4" placeholder="What should change here?" aria-label="Note">${esc(n.comment)}</textarea><div class="foot">${isNew ? "" : '<button type="button" class="btn ghost danger" data-act="delete">Delete</button>'}<span class="hint">⌘↵ to save</span><button type="button" class="btn primary" data-act="save">Save</button></div>`;
    else {
      const progress =
        n.status === "working"
          ? n.reply || `${this.who(true)} is working on this.`
          : n.status === "sent"
            ? n.pickedUpAt
              ? `${this.who(true)} picked this up at ${clock(n.pickedUpAt)}.`
              : this.unheard(n)
                ? this.offers
                  ? `Sent at ${clock(n.sentAt)}. No agent has it yet.`
                  : `Sent at ${clock(n.sentAt)}. No agent is attached yet; ask yours to run ${this.watchCmd()}`
                : `Sent to ${this.who()} at ${clock(n.sentAt)}, waiting for ${this.who()} to pick it up.`
            : "";
      this.panelEl.innerHTML =
        head +
        `<p class="comment">${esc(n.comment)}</p>` +
        (n.reply && n.status === "resolved" ? `<div class="reply"><b>${esc(this.agentName() ?? "Agent")}</b>${esc(n.reply)}</div>` : "") +
        (progress ? `<p class="waiting" role="status"><i class="spinner"></i><span>${esc(progress)}</span></p>` : "") +
        `<div class="foot"><button type="button" class="btn ghost danger" data-act="delete">Delete</button><span class="hint"></span>${
          n.status === "resolved"
            ? '<button type="button" class="btn" data-act="reopen">Reopen</button>'
            : this.offers && this.unheard(n)
              ? '<button type="button" class="btn primary" data-act="resend">Send to an agent</button>'
              : '<button type="button" class="btn" data-act="done">Mark done</button>'
        }</div>`;
    }
    this.panelEl.hidden = false;
    this.syncSave();
    this.render();
    const ta = this.panelEl.querySelector("textarea");
    if (ta) {
      const f = () => {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      };
      f();
      setTimeout(f, 0);
    }
  }

  private closePanel() {
    if (this.panel?.isNew) this.found.delete(this.panel.note.id);
    this.panel = null;
    this.panelEl.hidden = true;
    this.panelEl.innerHTML = "";
    this.render();
  }

  private panelText() {
    return this.panelEl.querySelector("textarea")?.value.trim() ?? "";
  }

  private isDirty() {
    const p = this.panel;
    return !!p && p.note.status === "open" && this.panelText() !== "" && this.panelText() !== p.note.comment;
  }

  private syncSave() {
    const b = this.panelEl.querySelector<HTMLButtonElement>('[data-act="save"]');
    if (b) b.disabled = !this.panelText();
  }

  private commitPanel() {
    const p = this.panel;
    if (!p) return;
    const text = this.panelText();
    if (!text) return this.closePanel();
    if (p.isNew) {
      const el = this.found.get(p.note.id);
      this.notes.push({ ...p.note, comment: text, updatedAt: now() });
      this.panel = null;
      if (el) this.found.set(p.note.id, el);
      this.flash(`Note ${p.note.n} saved. ${this.transport.kind === "clipboard" ? "Copy" : "Send"} when you're done.`);
    } else if (text !== p.note.comment) {
      const n = this.notes.find((x) => x.id === p.note.id);
      if (n) {
        n.comment = text;
        n.updatedAt = now();
      }
    }
    this.panel = null;
    this.panelEl.hidden = true;
    this.panelEl.innerHTML = "";
    this.changed();
  }

  private dismissPanel() {
    if (this.isDirty()) this.commitPanel();
    else this.closePanel();
  }

  private nudge() {
    const h = this.panelEl.querySelector<HTMLElement>(".hint");
    if (h) {
      h.textContent = "Save or press Esc first";
      h.classList.add("nudge");
      clearTimeout(this.nudgeTimer);
      this.nudgeTimer = window.setTimeout(() => {
        h.textContent = "⌘↵ to save";
        h.classList.remove("nudge");
      }, 1600);
    }
    this.panelEl.querySelector("textarea")?.focus();
  }

  private panelAction(a: string) {
    const p = this.panel;
    if (a === "close") return this.dismissPanel();
    if (a === "save") return this.commitPanel();
    if (!p) return;
    const note = this.notes.find((n) => n.id === p.note.id);
    if (a === "delete") {
      this.closePanel();
      if (!p.isNew) this.remove([p.note.id]);
      return;
    }
    if (!note) return;
    if (a === "resend") {
      this.closePanel();
      this.setStatus(note, "open");
      void this.pick();
      return;
    }
    if (a === "done" || a === "reopen") {
      this.setStatus(note, a === "done" ? "resolved" : "open");
      if (a === "reopen") this.openPanel(note, false);
      else this.closePanel();
    }
  }

  private async focusNote(n: Note) {
    if (n.route !== this.route) {
      const go = this.options.navigate ?? defaultNavigate;
      await go(n.route);
      this.onRoute();
      await new Promise((r) => setTimeout(r, 400));
    }
    this.found.delete(n.id);
    const el = this.elementFor(n);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => this.openPanel(n, false), el ? 350 : 0);
  }

  // Hosts that run several agents list them; the person picks one, as in a chat app's share sheet.
  private async pick() {
    if (this.picking) {
      this.picking = null;
      return this.renderBar();
    }
    if (!this.transport.targets) return this.send();
    this.listOpen = this.confirming = false;
    this.picking = [];
    this.renderBar();
    let targets: Target[] = [];
    try {
      targets = await this.transport.targets();
    } catch {}
    if (!this.picking) return;
    this.offers = targets.length > 0;
    if (!targets.length) {
      this.picking = null;
      return this.send();
    }
    const last = read<string>(this.keys.target, "");
    this.picking = [...targets].sort((a, b) => Number(b.id === last) - Number(a.id === last));
    this.renderBar();
    this.bar.querySelector<HTMLElement>("li[data-target]")?.focus();
  }

  private async send(target?: Target) {
    if (this.isDirty()) this.commitPanel();
    const notes = this.unsent();
    if (!notes.length || this.busy) return;
    this.busy = true;
    this.render();
    try {
      if (this.transport.kind === "http") await this.flush();
      const res = await this.transport.submit(notes, this.page(), target);
      this.busy = false;
      if (this.transport.kind === "clipboard") {
        this.flash(`Copied ${plural(notes.length, "note")} to the clipboard. Paste them into your agent.`);
      } else {
        const t = res.submission?.submittedAt ?? now();
        const ids = new Set(res.submission?.noteIds ?? notes.map((n) => n.id));
        for (const n of this.notes)
          if (ids.has(n.id) && n.status === "open") {
            n.status = "sent";
            n.sentAt = t;
          }
        this.lastSent = t;
        this.watching = res.watching;
        this.delivered = !!res.delivery?.ok;
        if (res.agent) this.agentFromServer = res.agent;
        this.save();
        const d = res.delivery;
        const via = d ? (d.ok ? ` to ${d.to}${d.detail ? ` (${d.detail})` : ""}` : `. ${d.to} didn't take it: ${d.detail ?? "unknown error"}`) : "";
        this.flash(
          res.delivery?.ok || res.watching
            ? `Sent ${plural(res.sent, "note")}${via || ` to ${this.who()}`}.`
            : `Sent ${plural(res.sent, "note")}${via}. No agent is attached yet; ask yours to run ${this.watchCmd()}`,
        );
      }
    } catch (e) {
      this.busy = false;
      this.flash(`${this.transport.kind === "clipboard" ? "Copy" : "Send"} failed: ${(e as Error).message}. Your notes are still here.`);
    }
    this.render();
    this.poll();
  }

  // ---------- events ----------

  private wire() {
    const layer = this.layer;
    layer.addEventListener("mousedown", (e) => e.preventDefault());
    layer.addEventListener("pointermove", (e) => {
      if (this.panel) return;
      if (this.drawing) {
        this.drawing.x1 = e.clientX;
        this.drawing.y1 = e.clientY;
        const r = this.drawRect();
        Object.assign(this.drawBox.style, { left: r.x + "px", top: r.y + "px", width: r.width + "px", height: r.height + "px" });
        this.drawBox.hidden = false;
        return;
      }
      if (this.mode === "area" || e.pointerType === "touch") {
        this.hoverBox.hidden = true;
        return;
      }
      const el = elementAt(e.clientX, e.clientY, this.host);
      if (!el) {
        this.hoverBox.hidden = true;
        return;
      }
      const r = rectOf(el);
      Object.assign(this.hoverBox.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
      this.hoverBox.classList.toggle("el", this.mode === "element");
      this.hoverBox.firstElementChild!.textContent = labelFor(el, this.attrs);
      this.hoverBox.hidden = false;
    });
    layer.addEventListener("pointerleave", () => (this.hoverBox.hidden = true));
    layer.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      if (this.panel) {
        if (this.isDirty()) this.nudge();
        else this.closePanel();
        return;
      }
      if (this.mode === "area") {
        this.drawing = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
        layer.setPointerCapture(e.pointerId);
        return;
      }
      const el = elementAt(e.clientX, e.clientY, this.host);
      if (!el) return;
      const r = rectOf(el);
      if (this.mode === "pin") this.openPanel(this.newNote("pin", el, e.clientX, e.clientY), true, el);
      else if (this.mode === "element") this.openPanel(this.newNote("element", el, r.left, r.top), true, el);
    });
    layer.addEventListener("pointerup", () => {
      if (!this.drawing) return;
      const rect = this.drawRect();
      this.drawing = null;
      this.drawBox.hidden = true;
      if (rect.width < 12 || rect.height < 12) return;
      const el = containing(elementAt(rect.x + rect.width / 2, rect.y + rect.height / 2, this.host), rect);
      if (!el) return;
      this.openPanel(this.newNote("area", el, rect.x, rect.y, rect), true, el);
    });
    layer.addEventListener(
      "wheel",
      (e) => {
        const target = scrollableAt(elementAt(e.clientX, e.clientY, this.host));
        if (target) target.scrollBy(e.deltaX, e.deltaY);
        else scrollBy(e.deltaX, e.deltaY);
      },
      { passive: true },
    );

    this.marks.addEventListener("click", (e) => {
      const m = (e.target as Element).closest<HTMLElement>("[data-id]");
      if (!m || m.dataset.id === "new") return;
      const n = this.notes.find((x) => x.id === m.dataset.id);
      if (!n) return;
      if (this.panel && this.isDirty()) return this.nudge();
      if (!this.open) this.toggleOpen();
      this.openPanel(n, false);
    });

    this.bar.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLElement>("button,li[data-note],li[data-target]");
      if (!b || (b as HTMLButtonElement).disabled || !this.bar.contains(b)) return;
      if (b.dataset.mode) return this.setMode(b.dataset.mode as Mode);
      if (b.dataset.note) {
        const n = this.notes.find((x) => x.id === b.dataset.note);
        if (n) void this.focusNote(n);
        return;
      }
      if (b.dataset.target !== undefined) {
        const t = this.picking?.find((x) => x.id === b.dataset.target);
        this.picking = null;
        if (t) {
          write(this.keys.target, t.id);
          void this.send(t);
        } else this.renderBar();
        return;
      }
      const a = b.dataset.act;
      if (a === "list") {
        this.listOpen = !this.listOpen;
        this.confirming = false;
        this.renderBar();
      } else if (a === "marks") {
        this.showMarks = !this.showMarks;
        write(this.keys.marks, this.showMarks);
        this.render();
      } else if (a === "clear-done") {
        const d = this.done();
        if (d.length) {
          this.remove(d.map((n) => n.id));
          this.flash(`Cleared ${plural(d.length, "finished note")}.`);
        }
      } else if (a === "confirm-clear") {
        this.confirming = true;
        this.renderBar();
      } else if (a === "keep") {
        this.confirming = false;
        this.renderBar();
      } else if (a === "clear-all") {
        const all = this.notes.map((n) => n.id);
        this.confirming = false;
        if (this.panel) this.closePanel();
        this.remove(all);
        this.flash(`Cleared ${plural(all.length, "note")}.`);
      } else if (a === "send") void this.pick();
    });
    this.bar.addEventListener("keydown", (e) => {
      const li = (e.target as Element).closest<HTMLElement>("li[data-note],li[data-target]");
      if (li && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        li.click();
      }
    });

    this.panelEl.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>("[data-act]");
      if (b && !b.disabled) this.panelAction(b.dataset.act!);
    });
    this.panelEl.addEventListener("input", () => this.syncSave());

    const root = this.q(".root");
    const fromControls = (e: Event) => e.composedPath().some((t) => t instanceof HTMLSlotElement);
    root.addEventListener("keydown", (e) => {
      if (fromControls(e)) return;
      const k = e as KeyboardEvent;
      if (k.key === "Enter" && (k.metaKey || k.ctrlKey) && (k.target as Element).tagName === "TEXTAREA") {
        k.preventDefault();
        this.commitPanel();
      }
      if (k.key !== "Escape") e.stopPropagation();
    });
    for (const t of ["click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup", "contextmenu", "keyup", "keypress", "input", "focusin", "focusout"])
      root.addEventListener(t, (e) => {
        if (!fromControls(e)) e.stopPropagation();
      });

    const launcher = this.launcher;
    launcher.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const { x, y } = this.launcherXY();
      this.drag = { sx: e.clientX, sy: e.clientY, bx: x, by: y, moved: false };
      launcher.setPointerCapture(e.pointerId);
    });
    launcher.addEventListener("pointermove", (e) => {
      const d = this.drag;
      if (!d) return;
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      launcher.classList.add("placed");
      launcher.style.setProperty("--fx", String((d.bx + dx) / innerWidth));
      launcher.style.setProperty("--fy", String((d.by + dy) / innerHeight));
      if (this.open) this.placeBar();
    });
    launcher.addEventListener("pointerup", () => {
      const d = this.drag;
      if (!d) return;
      this.drag = null;
      if (d.moved) {
        const { x, y } = this.launcherXY();
        write(this.keys.pos, { fx: x / innerWidth, fy: y / innerHeight });
        this.placeLauncher();
      } else this.toggleOpen();
    });
    launcher.addEventListener("pointercancel", () => (this.drag = null));
    launcher.addEventListener("dblclick", () => {
      write(this.keys.pos, null);
      this.placeLauncher();
      if (this.open) this.placeBar();
    });
  }

  private drawRect(): Box {
    const d = this.drawing!;
    return { x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), width: Math.abs(d.x1 - d.x0), height: Math.abs(d.y1 - d.y0) };
  }
}

function defaultNavigate(route: string) {
  history.pushState(null, "", route);
  dispatchEvent(new PopStateEvent("popstate", { state: null }));
}

let patched = false;
function patchHistory() {
  if (patched) return;
  patched = true;
  for (const name of ["pushState", "replaceState"] as const) {
    const original = history[name];
    history[name] = function (this: History, ...args: Parameters<History["pushState"]>) {
      const result = original.apply(this, args);
      dispatchEvent(new Event("annotate-anything:route"));
      return result;
    };
  }
}
