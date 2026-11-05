export type Scheme = "light" | "dark";

let probe: CanvasRenderingContext2D | null | undefined;

function schemeOf(color: string): Scheme | null {
  if (probe === undefined) probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!probe) return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "rgba(0,0,0,0)";
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data as unknown as number[];
  if (a! < 128) return null;
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! < 128 ? "dark" : "light";
}

export function pageScheme(host: Element): Scheme {
  const wide = document
    .elementsFromPoint(innerWidth / 2, innerHeight / 2)
    .filter((el) => {
      if (el === host || host.contains(el)) return false;
      const r = el.getBoundingClientRect();
      return r.width >= innerWidth / 2 && r.height >= innerHeight / 2;
    });
  for (const el of [...wide, document.body, document.documentElement]) {
    if (!el) continue;
    const found = schemeOf(getComputedStyle(el).backgroundColor);
    if (found) return found;
  }
  const declared = getComputedStyle(document.documentElement).colorScheme;
  if (declared.includes("dark") && !declared.includes("light")) return "dark";
  if (declared.includes("light") && !declared.includes("dark")) return "light";
  return matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light";
}
