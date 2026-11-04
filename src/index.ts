import { Annotator, type Options } from "./annotator.js";
import { LOCAL_HOST } from "./local.js";

export type { Options } from "./annotator.js";
export type { Transport, PageInfo } from "./transport.js";
export type { Note, Submission, Status, Kind, FeedbackState, SubmitResult, Target } from "./types.js";
export { http, clipboard, local, markdown } from "./transport.js";

export interface AnnotateOptions extends Options {
  enabled?: boolean;
}

export interface Handle {
  open(opts?: { mode?: "pin" | "element" | "area"; intro?: string }): void;
  close(): void;
  addControl(el: HTMLElement): void;
  setTheme(theme: Record<string, string>): void;
  destroy(): void;
}

let current: { annotator: Annotator | null; handle: Handle } | null = null;

export function annotate(options: AnnotateOptions = {}): Handle {
  if (current) return current.handle;
  const allowed = options.enabled ?? LOCAL_HOST.test(location.hostname);
  const noop: Handle = { open() {}, close() {}, addControl() {}, setTheme() {}, destroy() {} };
  if (!allowed) {
    console.info("annotate-anything: not starting outside local development. Pass { enabled: true } to turn it on here.");
    return noop;
  }
  const state: { annotator: Annotator | null; handle: Handle } = { annotator: null, handle: noop };
  const queue: HTMLElement[] = [];
  let pendingOpen: Parameters<Handle["open"]>[0] | undefined;
  state.handle = {
    open: (o) => (state.annotator ? state.annotator.openTool(o) : (pendingOpen = o ?? {})),
    close: () => state.annotator?.close(),
    addControl: (el) => (state.annotator ? state.annotator.addControl(el) : queue.push(el)),
    setTheme: (t) => (state.annotator ? state.annotator.setTheme(t) : (options.theme = t)),
    destroy: () => {
      state.annotator?.destroy();
      current = null;
    },
  };
  const boot = () => {
    if (current !== state) return;
    state.annotator = new Annotator({ ...options, controls: [...(options.controls ?? []), ...queue] });
    if (pendingOpen) state.annotator.openTool(pendingOpen);
  };
  current = state;
  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot, { once: true });
  return state.handle;
}
