const THEME: Record<string, string> = {
  ink: "#0a0a0a", "ink-2": "#141414", "ink-hover": "#1f1f1f", text: "#ededed", muted: "#a1a1a1",
  line: "#2e2e2e", edge: "#2e2e2e", divider: "#1f1f1f", hover: "#1a1a1a",
  accent: "#0070f3", "accent-hover": "#2b87f7", "on-accent": "#fff",
  sent: "#a259ff", working: "#f5a623", resolved: "#45a557", danger: "#ff6166",
  shadow: "0 12px 32px rgba(0,0,0,.5)", "launcher-ring": "#3a3a3a",
  radius: "8px", font: '13px/1.4 Geist,"Geist Sans",Inter,system-ui,-apple-system,sans-serif',
};

const themes = `:host{${Object.entries(THEME).map(([k, v]) => `--aa-${k}:${v}`).join(";")}}`;

export const css = `
${themes}
.root{all:initial;font:var(--aa-font);color:var(--aa-text);pointer-events:none}
.root *{box-sizing:border-box;margin:0;padding:0;font:inherit;color:inherit;letter-spacing:normal;text-transform:none;text-align:left;line-height:inherit}
button,textarea{all:unset;box-sizing:border-box;font:inherit;color:inherit}
button{cursor:pointer}
button:focus-visible{outline:2px solid var(--aa-accent);outline-offset:1px}
[hidden]{display:none!important}
svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;display:block;flex:none}
.capture{position:fixed;inset:0;cursor:crosshair;background:transparent;touch-action:none;pointer-events:auto}
.hover{position:fixed;pointer-events:none;border:1px dashed color-mix(in srgb,var(--aa-accent) 70%,transparent);border-radius:3px}
.hover.el{border:2px solid var(--aa-accent);background:color-mix(in srgb,var(--aa-accent) 8%,transparent)}
.hover span{position:absolute;left:-1px;bottom:100%;margin-bottom:3px;padding:2px 6px;font-size:10.5px;font-weight:600;white-space:nowrap;color:var(--aa-on-accent);background:var(--aa-accent);border-radius:4px}
.area{position:fixed;pointer-events:none;border:1.5px solid var(--aa-accent);background:color-mix(in srgb,var(--aa-accent) 7%,transparent);border-radius:4px}
.area.drawing{border-style:dashed}
.area.sent,.area.working{border-color:var(--aa-sent);background:color-mix(in srgb,var(--aa-sent) 6%,transparent)}
.area.resolved{border-color:color-mix(in srgb,var(--aa-resolved) 55%,transparent);border-style:dashed;background:transparent}
.area.detached{opacity:.45;border-style:dashed}
.mark{position:fixed;min-width:22px;height:22px;padding:0 6px;border:2px solid #fff;border-radius:11px;background:var(--aa-accent);color:var(--aa-on-accent);font-size:11px;font-weight:700;line-height:18px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.28);transform:translate(-6px,-11px);transition:transform .12s ease;pointer-events:auto}
.mark.k-pin{width:24px;height:24px;min-width:0;padding:0;border-radius:50% 50% 50% 0;transform:translate(0,-100%) rotate(-45deg);transform-origin:0 100%}
.mark.k-pin span{display:block;transform:rotate(45deg);text-align:center;line-height:20px}
.mark:hover,.mark.current{transform:translate(-6px,-11px) scale(1.12)}
.mark.k-pin:hover,.mark.k-pin.current{transform:translate(0,-100%) rotate(-45deg) scale(1.12)}
.mark.current{box-shadow:0 0 0 3px color-mix(in srgb,var(--aa-accent) 45%,transparent),0 2px 6px rgba(0,0,0,.28)}
.mark.sent{background:var(--aa-sent)}
.mark.working{background:var(--aa-working)}
.mark.resolved{background:var(--aa-resolved);opacity:.8}
.mark.detached{opacity:.5;border-style:dashed}
.mark.sent::after,.mark.working::after{content:"";position:absolute;inset:-6px;border-radius:50%;border:2px solid transparent;border-top-color:currentColor;opacity:.7;animation:aa-spin 1.1s linear infinite;pointer-events:none}
.mark.sent::after{color:var(--aa-sent)}
.mark.working::after{color:var(--aa-working)}
@keyframes aa-spin{to{rotate:360deg}}
.panel,.toolbar{position:fixed;background:var(--aa-ink);border:1px solid var(--aa-edge);border-radius:var(--aa-radius);box-shadow:var(--aa-shadow);pointer-events:auto}
.panel{padding:10px}
.head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.chip{flex:none;padding:2px 7px;font-size:11px;font-weight:700;color:var(--aa-on-accent);background:var(--aa-accent);border-radius:6px}
.chip.sent,.dot.sent{background:var(--aa-sent)}
.chip.working,.dot.working{background:var(--aa-working)}
.chip.resolved,.dot.resolved{background:var(--aa-resolved)}
.target{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--aa-muted)}
.x{color:var(--aa-muted);font-size:18px;line-height:1;padding:0 2px}
.x:hover{color:var(--aa-text)}
textarea.input{display:block;width:100%;min-height:84px;resize:vertical;padding:8px 9px;font-size:13px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--aa-text);background:var(--aa-ink-2);border:1px solid var(--aa-line);border-radius:8px;cursor:text}
textarea.input:focus{border-color:var(--aa-accent)}
textarea.input::placeholder{color:var(--aa-muted)}
.comment{margin:0 0 8px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}
.reply{margin-bottom:8px;padding:8px 9px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--aa-ink-2);border-left:2px solid var(--aa-resolved);border-radius:6px}
.reply.progress{border-left-color:var(--aa-working)}
.reply b{display:block;margin-bottom:2px;font-size:10.5px;font-weight:700;color:var(--aa-muted);text-transform:uppercase;letter-spacing:.04em}
.waiting{display:flex;align-items:flex-start;gap:8px;margin:0 0 8px;padding:8px 9px;font-size:12px;line-height:1.45;color:var(--aa-text);background:var(--aa-ink-2);border-radius:6px;overflow-wrap:anywhere}
.waiting .spinner{margin-top:2px}
.foot{display:flex;align-items:center;gap:6px;margin-top:8px}
.hint{flex:1;font-size:11px;color:var(--aa-muted);text-align:right}
.hint.nudge{color:var(--aa-accent);font-weight:600}
.btn{padding:5px 11px;font-size:12px;font-weight:600;color:var(--aa-text);background:var(--aa-ink-2);border:1px solid var(--aa-line);border-radius:7px}
.btn:hover:not(:disabled){background:var(--aa-ink-hover)}
.btn:disabled{opacity:.4;cursor:default}
.btn.primary{background:var(--aa-accent);border-color:var(--aa-accent);color:var(--aa-on-accent)}
.btn.primary:hover:not(:disabled){background:var(--aa-accent-hover)}
.btn.ghost{background:none;border-color:transparent}
.btn.danger{color:var(--aa-danger)}
.toolbar{max-width:calc(100vw - 16px)}
.tools{display:flex;align-items:center;gap:2px;padding:5px;flex-wrap:wrap}
.tool{display:inline-flex;align-items:center;gap:5px;padding:6px 9px;font-size:12px;font-weight:600;border-radius:8px;white-space:nowrap}
.tool:hover:not(:disabled){background:var(--aa-hover)}
.tool.on{color:var(--aa-text);background:color-mix(in srgb,var(--aa-accent) 24%,transparent)}
.tool:disabled{opacity:.4;cursor:default}
.tool.icon{padding:6px 7px}
.sep{width:1px;height:18px;margin:0 3px;background:var(--aa-line)}
.send{display:inline-flex;align-items:center;gap:6px;margin-left:2px;padding:6px 11px;font-size:12px;font-weight:700;color:var(--aa-on-accent);background:var(--aa-accent);border-radius:8px;white-space:nowrap}
.send:hover:not(:disabled){background:var(--aa-accent-hover)}
.send:disabled{opacity:.45;cursor:default}
.split{display:inline-flex;min-width:0;margin-left:2px}
.split .send{margin-left:0}
.split .send:has(+ .more){border-radius:8px 0 0 8px;min-width:0}
.send.more{padding:6px 7px;border-radius:0 8px 8px 0;border-left:1px solid color-mix(in srgb,var(--aa-on-accent) 25%,transparent)}
.send.more svg{width:13px;height:13px}
.send .to{max-width:160px;overflow:hidden;text-overflow:ellipsis}
.current{flex:none;color:var(--aa-accent)}
.current svg{width:14px;height:14px}
.count{min-width:17px;padding:0 5px;font-size:10.5px;line-height:17px;text-align:center;color:var(--aa-ink);background:var(--aa-text);border-radius:9px}
.slot{display:contents}
.status,.busy{padding:6px 12px 8px;font-size:11.5px;color:var(--aa-muted);border-top:1px solid var(--aa-divider);overflow-wrap:anywhere}
.busy{display:flex;align-items:center;gap:7px}
.busy span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.spinner{flex:none;width:11px;height:11px;border-radius:50%;border:2px solid color-mix(in srgb,var(--aa-muted) 35%,transparent);border-top-color:var(--aa-text);animation:aa-spin .9s linear infinite}
.list{list-style:none;padding:4px;max-height:260px;overflow-y:auto;border-top:1px solid var(--aa-divider)}
.list li{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:7px;cursor:pointer}
.list li:hover{background:var(--aa-hover)}
.list li:focus-visible{outline:2px solid var(--aa-accent);outline-offset:-2px}
.phead{padding:8px 12px 2px;font-size:11px;font-weight:600;color:var(--aa-muted);border-top:1px solid var(--aa-divider)}
.pick{border-top:0}
.list li.empty{color:var(--aa-muted);cursor:default}
.list li.empty:hover{background:none}
.dot{flex:none;min-width:20px;height:20px;padding:0 5px;font-size:10.5px;font-weight:700;line-height:20px;text-align:center;color:var(--aa-on-accent);background:var(--aa-accent);border-radius:10px}
.ltext{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lstate{flex:none;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--aa-muted)}
.lfoot{display:flex;align-items:center;justify-content:flex-end;gap:6px;padding:6px 8px;border-top:1px solid var(--aa-divider)}
.confirm{display:flex;align-items:center;gap:6px;padding:8px;border-top:1px solid var(--aa-divider)}
.confirm p{flex:1;font-size:11.5px;color:var(--aa-muted)}
.launcher{position:fixed;transition:background .15s,color .15s;left:clamp(8px,calc(var(--fx,1) * 100vw - 64px),calc(100vw - 52px));top:clamp(8px,calc(var(--fy,1) * 100vh - 140px),calc(100vh - 52px));width:44px;height:44px;display:grid;place-items:center;color:var(--aa-text);background:var(--aa-ink);border:1.5px solid var(--aa-launcher-ring);border-radius:50%;box-shadow:0 6px 18px rgba(0,0,0,.3);cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;pointer-events:auto}
.launcher.placed{left:clamp(8px,calc(var(--fx) * 100vw),calc(100vw - 52px));top:clamp(8px,calc(var(--fy) * 100vh),calc(100vh - 52px))}
.launcher svg{width:19px;height:19px}
.launcher:hover{background:var(--aa-ink-hover)}
.launcher.on{background:var(--aa-accent);border-color:var(--aa-accent);color:var(--aa-on-accent)}
.launcher.busy::after{content:"";position:absolute;inset:-5px;border-radius:50%;border:2px solid transparent;border-top-color:var(--aa-working);animation:aa-spin 1.1s linear infinite}
.badge{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 4px;font-size:10.5px;font-weight:700;line-height:14px;text-align:center;color:var(--aa-on-accent);background:var(--aa-accent);border:2px solid #fff;border-radius:9px}
@media (prefers-reduced-motion:reduce){.mark::after,.launcher.busy::after,.spinner{animation:none}}
@media print{.root{display:none!important}}
`;
