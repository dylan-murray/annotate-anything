import type { Box, Note } from "./types.js";

const STATE_CLASS = /^(on|off|open|closed|active|sel|selected|current|hover|hovered|focus|focused|flash|show|shown|hidden|visible|disabled|checked|expanded|collapsed|loading)$|^(is|has)-/;
const GENERATED_ID = /\d{4,}|[:«»]|^_r_|^radix-|^headlessui-|^react-aria|^mui-|^ember\d/;
const PLAIN_CLASS = /^[A-Za-z_-][\w-]*$/;
const DIALOG = "dialog,[role=dialog],[role=alertdialog]";
const OPEN_DIALOG = "dialog[open],[role=dialog],[role=alertdialog]";
// Joins the selector segments of an element inside open shadow roots or same-origin
// iframes: each segment is resolved inside the previous one's shadow root or document.
export const DEEP = " >>> ";
export const TEXT_LIMIT = 180;
const NEAR = 80;

type Root = Document | ShadowRoot;

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

function matches(el: Element, sel: string): boolean {
  try {
    return el.matches(sel);
  } catch {
    return false;
  }
}

const isShadow = (n: Node): n is ShadowRoot => n.nodeType === 11 && "host" in n;

function frameOf(doc: Document): HTMLIFrameElement | null {
  try {
    return (doc.defaultView?.frameElement as HTMLIFrameElement | null) ?? null;
  } catch {
    return null;
  }
}

function frameDoc(el: Element): Document | null {
  if (el.tagName !== "IFRAME" && el.tagName !== "FRAME") return null;
  try {
    return (el as HTMLIFrameElement).contentDocument;
  } catch {
    return null;
  }
}

function composedParent(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  if (isShadow(root)) return root.host;
  if (root.nodeType === 9 && el === (root as Document).documentElement) return frameOf(root as Document);
  return null;
}

export function within(container: Element, el: Element): boolean {
  for (let e: Element | null = el; e; e = composedParent(e)) if (e === container) return true;
  return false;
}

// The element's box in the top window's viewport, adding up iframe offsets.
export function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  let x = r.left;
  let y = r.top;
  for (let doc = el.ownerDocument, f = frameOf(doc); f && doc !== document; doc = f.ownerDocument, f = frameOf(doc)) {
    const fr = f.getBoundingClientRect();
    x += fr.left + f.clientLeft;
    y += fr.top + f.clientTop;
  }
  return { left: x, top: y, width: r.width, height: r.height, right: x + r.width, bottom: y + r.height };
}

// Shadow roots and iframe documents between the element and the top document,
// so the caller can watch them for scrolling and mutations.
export function rootsOf(el: Element): Root[] {
  const roots: Root[] = [];
  for (let e: Element | null = el; e; ) {
    const root = e.getRootNode() as Root;
    if (root === document) break;
    roots.push(root);
    e = isShadow(root) ? root.host : frameOf(root as Document);
  }
  return roots;
}

export function inDialog(el: Element): boolean {
  for (let e: Element | null = el; e; e = composedParent(e)) if (matches(e, DIALOG)) return true;
  return false;
}

export interface Layer {
  parent: Element;
  dialog: Element | null;
  modal: boolean;
}

// Where the tool's host element should live so the host app's dialog treats our clicks and
// focus as inside it. Headless UI counts any direct child of <body> as inside but not its own
// dialog wrapper; Radix, MUI and native modal dialogs only count their own content.
export function topLayer(host: Element): Layer {
  let open = [...document.querySelectorAll(OPEN_DIALOG)].filter((el) => el !== host && !host.contains(el) && visible(el));
  const modals = open.filter((el) => el.tagName === "DIALOG" && matches(el, ":modal"));
  const top = modals.at(-1);
  if (top) open = open.filter((el) => top.contains(el));
  const dialog = open.at(-1) ?? null;
  if (!dialog) return { parent: document.body, dialog: null, modal: false };
  const headless = dialog.hasAttribute("data-headlessui-state");
  const modal =
    matches(dialog, ":modal") || dialog.getAttribute("aria-modal") === "true" || headless || document.body.style.pointerEvents === "none";
  return { parent: headless ? document.body : dialog, dialog, modal };
}

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 || r.height > 0;
}

// The deepest element under the point, looking inside open shadow roots and same-origin iframes.
export function elementAt(x: number, y: number, host: Element): Element | null {
  let el: Element | null = null;
  for (const e of document.elementsFromPoint(x, y)) {
    if (e === host || e === document.documentElement || e === document.body) continue;
    el = e;
    break;
  }
  let ox = 0;
  let oy = 0;
  for (let depth = 0; el && depth < 10; depth++) {
    if (el.shadowRoot) {
      const root: ShadowRoot = el.shadowRoot;
      const inner = root.elementsFromPoint(x - ox, y - oy).find((e) => e.getRootNode() === root);
      if (!inner) break;
      el = inner;
      continue;
    }
    const doc = frameDoc(el);
    if (doc) {
      const fr = el.getBoundingClientRect();
      ox += fr.left + el.clientLeft;
      oy += fr.top + el.clientTop;
      const inner = doc.elementsFromPoint(x - ox, y - oy).find((e) => e !== doc.documentElement && e !== doc.body);
      if (!inner) break;
      el = inner;
      continue;
    }
    break;
  }
  return el;
}

function localPath(el: Element, root: Root): string {
  const parts: string[] = [];
  const doc = root.nodeType === 9 ? (root as Document) : null;
  let cur: Element | null = el;
  while (cur && cur !== doc?.body && cur !== doc?.documentElement && parts.length < 12) {
    const tag = cur.tagName.toLowerCase();
    if (cur.id && !GENERATED_ID.test(cur.id)) {
      parts.unshift(tag + "#" + CSS.escape(cur.id));
      break;
    }
    let part = tag;
    const cls = [...cur.classList]
      .filter((c) => PLAIN_CLASS.test(c) && !/\d{3,}/.test(c) && !STATE_CLASS.test(c))
      .slice(0, 2);
    if (cls.length) part += "." + cls.map((c) => CSS.escape(c)).join(".");
    const parent: Element | null = cur.parentElement;
    const siblings = parent ? [...parent.children] : [...root.children];
    const same = siblings.filter((c) => c.tagName === cur!.tagName);
    if (same.length > 1) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
    parts.unshift(part);
    try {
      const path = parts.join(" > ");
      if (parts.length >= 2 && root.querySelectorAll(path).length === 1 && root.querySelector(path) === el) break;
    } catch {}
    cur = parent;
  }
  return parts.join(" > ") || el.tagName.toLowerCase();
}

export function cssPath(el: Element): string {
  const segs: string[] = [];
  for (let cur: Element | null = el; cur; ) {
    const root = cur.getRootNode() as Root;
    segs.unshift(localPath(cur, root));
    cur = isShadow(root) ? root.host : root === document ? null : frameOf(root as Document);
  }
  return segs.join(DEEP);
}

export function textOf(el: Element): string {
  const h = el as HTMLElement;
  const raw = h.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || (el as HTMLImageElement).alt || el.textContent || "";
  return raw.trim().replace(/\s+/g, " ").slice(0, TEXT_LIMIT);
}

export function labelFor(el: Element, attrs: string[]): string {
  const tag = el.tagName.toLowerCase();
  for (const a of attrs) {
    const v = el.getAttribute(a);
    if (v) return `${tag}[${v}]`;
  }
  if (el.id) return tag + "#" + el.id;
  const c = [...el.classList].find((c) => PLAIN_CLASS.test(c));
  return c ? tag + "." + c : tag;
}

export function stableAttr(el: Element, attrs: string[]): string | undefined {
  for (const a of attrs) {
    const v = el.getAttribute(a);
    if (v) return v;
  }
  return undefined;
}

function sized(el: Element | null): el is Element {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 || r.height > 0;
}

function query(root: Root, sel: string, host: Element): Element | null {
  try {
    const el = root.querySelector(sel);
    return el && el !== host && !host.contains(el) ? el : null;
  } catch {
    return null;
  }
}

// Resolve every segment but the last, giving the shadow root or iframe document
// the element lives in.
function container(selector: string): { root: Root; last: string } | null {
  const segs = selector.split(DEEP);
  let root: Root = document;
  for (const seg of segs.slice(0, -1)) {
    let el: Element | null = null;
    try {
      el = root.querySelector(seg);
    } catch {}
    const next: Root | null = el ? (el.shadowRoot ?? frameDoc(el)) : null;
    if (!next) return null;
    root = next;
  }
  return { root, last: segs.at(-1)! };
}

export function find(note: Note, host: Element, attrs: string[]): Element | null {
  const c = container(note.selector || note.tag);
  if (!c) return null;
  const { root, last } = c;
  const bySelector = note.selector ? query(root, last, host) : null;
  const agrees = (el: Element) => (!note.testId || stableAttr(el, attrs) === note.testId) && (!note.targetText || textOf(el) === note.targetText);
  if (sized(bySelector) && agrees(bySelector)) return bySelector;
  if (note.testId) {
    for (const a of attrs) {
      const el = query(root, `[${a}="${CSS.escape(note.testId)}"]`, host);
      if (sized(el)) return el;
    }
  }
  if (!note.tag) return null;
  const cx = note.bounds.x + note.bounds.width / 2 + note.scroll.x;
  const cy = note.bounds.y + note.bounds.height / 2 + note.scroll.y;
  let byText: Element | null = null;
  let byTextDist = Infinity;
  let near: Element | null = null;
  let nearDist = NEAR;
  let candidates: Element[] = [];
  try {
    candidates = [...root.querySelectorAll(note.tag)];
  } catch {}
  for (const el of candidates) {
    if (host.contains(el) || inDialog(el) !== note.inDialog) continue;
    const r = rectOf(el);
    if (!r.width && !r.height) continue;
    const dist = Math.hypot(r.left + r.width / 2 + scrollX - cx, r.top + r.height / 2 + scrollY - cy);
    if (note.targetText && dist < byTextDist && textOf(el) === note.targetText) {
      byText = el;
      byTextDist = dist;
    }
    if (dist < nearDist) {
      near = el;
      nearDist = dist;
    }
  }
  if (byText) return byText;
  // A dialog's markup is often shared with others built the same way, so a note made in one only
  // returns to an element that still agrees with it, never to whatever now sits in the same spot.
  if (note.inDialog) return near && agrees(near) ? near : null;
  if (sized(bySelector)) return bySelector;
  return near;
}

export interface Placed extends Box {
  ok: boolean;
  hidden: boolean;
}

export function place(note: Note, el: Element | null): Placed {
  if (el) {
    const r = rectOf(el);
    if (note.kind === "element") return { x: r.left, y: r.top, width: r.width, height: r.height, ok: true, hidden: false };
    if (note.kind === "area" && note.offset)
      return { x: r.left + note.offset.x, y: r.top + note.offset.y, width: note.offset.width, height: note.offset.height, ok: true, hidden: false };
    const b = note.bounds;
    const fx = b.width ? clamp((note.x - b.x) / b.width, 0, 1) : 0;
    const fy = b.height ? clamp((note.y - b.y) / b.height, 0, 1) : 0;
    return { x: r.left + fx * r.width, y: r.top + fy * r.height, width: 0, height: 0, ok: true, hidden: false };
  }
  const dx = note.scroll.x - scrollX;
  const dy = note.scroll.y - scrollY;
  const hidden = note.inDialog;
  if (note.kind === "pin") return { x: note.x + dx, y: note.y + dy, width: 0, height: 0, ok: false, hidden };
  if (note.kind === "area" && note.offset)
    return { x: note.bounds.x + note.offset.x + dx, y: note.bounds.y + note.offset.y + dy, width: note.offset.width, height: note.offset.height, ok: false, hidden };
  return { x: note.bounds.x + dx, y: note.bounds.y + dy, width: note.bounds.width, height: note.bounds.height, ok: false, hidden };
}

// The nearest scrollable ancestor, crossing shadow roots and iframes; null means the top window.
export function scrollableAt(el: Element | null): Element | null {
  while (el && el !== document.body && el !== document.documentElement) {
    const doc = el.ownerDocument;
    if (doc !== document && (el === doc.body || el === doc.documentElement)) {
      const s = doc.scrollingElement;
      if (s && (s.scrollHeight > s.clientHeight || s.scrollWidth > s.clientWidth)) return s;
      el = frameOf(doc);
      continue;
    }
    const s = getComputedStyle(el);
    if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)) return el;
    el = composedParent(el);
  }
  return null;
}

export function containing(start: Element | null, rect: Box): Element | null {
  let el = start;
  while (el) {
    const parent = composedParent(el);
    if (!parent || parent === document.documentElement) break;
    const r = rectOf(el);
    if (r.left <= rect.x + 1 && r.top <= rect.y + 1 && r.right >= rect.x + rect.width - 1 && r.bottom >= rect.y + rect.height - 1) break;
    el = parent;
  }
  return el;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}
