import { annotate, type AnnotateOptions } from "./index.js";

type Win = { AnnotateAnything?: unknown; annotateAnything?: ReturnType<typeof annotate>; __ANNOTATE_ANYTHING__?: AnnotateOptions };
const w = window as unknown as Win;
const script = document.currentScript as HTMLScriptElement | null;
const d = script?.dataset ?? {};
const options: AnnotateOptions = { ...w.__ANNOTATE_ANYTHING__ };
if (!options.endpoint && script?.src && /\/client\.js(\?|$)/.test(script.src)) options.endpoint = new URL(".", script.src).href.replace(/\/$/, "");
if (d.endpoint) options.endpoint = d.endpoint;
if (d.transport) options.transport = d.transport as AnnotateOptions["transport"];
if (d.scope) options.scope = d.scope;
if (d.agent) options.agentName = d.agent;
if (d.enabled) options.enabled = d.enabled !== "false";
w.AnnotateAnything = { annotate };
if (w.annotateAnything) w.annotateAnything.open();
else if (d.manual === undefined) w.annotateAnything = annotate(options);
