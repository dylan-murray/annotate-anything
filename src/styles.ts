const LIGHT: Record<string, string> = {
  ink: "#ffffff", "ink-2": "#f1f6fb", "ink-hover": "#e3edf6", text: "#0b1a28", muted: "#556575",
  line: "#d8e4ef", edge: "rgba(11,26,40,.09)", divider: "#e8eff6", hover: "#eef4f9",
  accent: "#0369a1", "accent-2": "#4f46e5", "on-accent": "#fff",
  sent: "#7c3aed", working: "#d97706", resolved: "#059669", danger: "#be123c",
  "accent-soft": "rgba(3,105,161,.13)", "accent-soft-hover": "rgba(3,105,161,.2)",
  shadow: "0 18px 46px rgba(20,30,50,.15)", launcher: "#e3edf6", "launcher-ring": "rgba(11,26,40,.14)", "mark-edge": "#fff",
  radius: "16px", font: '13px/1.4 Geist,"Geist Sans",Inter,system-ui,-apple-system,sans-serif',
};

const DARK: Record<string, string> = {
  ink: "#1d2630", "ink-2": "#27323e", "ink-hover": "#323e4c", text: "#f1f6fb", muted: "#aebbc9",
  line: "#384553", edge: "rgba(241,246,251,.09)", divider: "#2b3643", hover: "#28333f",
  accent: "#7dd3fc", "accent-2": "#a5b4fc", "on-accent": "#06263a",
  sent: "#b794ff", working: "#fbbf24", resolved: "#34d399", danger: "#fb7185",
  "accent-soft": "rgba(125,211,252,.17)", "accent-soft-hover": "rgba(125,211,252,.28)",
  shadow: "0 20px 50px rgba(0,0,0,.5)", launcher: "#1d2630", "launcher-ring": "rgba(241,246,251,.14)", "mark-edge": "#1d2630",
};

const tokens = (t: Record<string, string>) => Object.entries(t).map(([k, v]) => `--aa-${k}:${v}`).join(";");
const themes = `:host{${tokens(LIGHT)}}:host([data-scheme=dark]){${tokens(DARK)}}`;
const GRADIENT = "linear-gradient(135deg,var(--aa-accent),var(--aa-accent-2))";

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
.hover.el{border:0;border-radius:6px;background:linear-gradient(var(--aa-accent),var(--aa-accent)) 0 0/14px 2px no-repeat,linear-gradient(var(--aa-accent),var(--aa-accent)) 0 0/2px 14px no-repeat,linear-gradient(var(--aa-accent),var(--aa-accent)) 100% 0/14px 2px no-repeat,linear-gradient(var(--aa-accent),var(--aa-accent)) 100% 0/2px 14px no-repeat,linear-gradient(var(--aa-accent),var(--aa-accent)) 0 100%/14px 2px no-repeat,linear-gradient(var(--aa-accent),var(--aa-accent)) 0 100%/2px 14px no-repeat,linear-gradient(var(--aa-accent),var(--aa-accent)) 100% 100%/14px 2px no-repeat,linear-gradient(var(--aa-accent),var(--aa-accent)) 100% 100%/2px 14px no-repeat,color-mix(in srgb,var(--aa-accent) 7%,transparent);transition:left .12s cubic-bezier(.2,.9,.3,1),top .12s cubic-bezier(.2,.9,.3,1),width .12s cubic-bezier(.2,.9,.3,1),height .12s cubic-bezier(.2,.9,.3,1)}
.hover.el span{left:16px;border-radius:6px;background:${GRADIENT}}
.hover span{position:absolute;left:-1px;bottom:100%;margin-bottom:3px;padding:2px 6px;font-size:10.5px;font-weight:600;white-space:nowrap;color:var(--aa-on-accent);background:var(--aa-accent);border-radius:4px}
.area{position:fixed;pointer-events:none;border:1.5px solid var(--aa-accent);background:color-mix(in srgb,var(--aa-accent) 7%,transparent);border-radius:4px}
.area.drawing{border-style:dashed}
.area.sent,.area.working{border-color:var(--aa-sent);background:color-mix(in srgb,var(--aa-sent) 6%,transparent)}
.area.resolved{border-color:color-mix(in srgb,var(--aa-resolved) 55%,transparent);border-style:dashed;background:transparent}
.area.detached{opacity:.45;border-style:dashed}
.mark{position:fixed;width:22px;height:22px;padding:0;border:2px solid var(--aa-mark-edge);border-radius:50%;background:${GRADIENT};color:var(--aa-on-accent);font-size:11px;font-weight:700;line-height:18px;text-align:center;box-shadow:0 1px 5px rgba(0,0,0,.22);transform:translate(-50%,-50%);transition:transform .16s cubic-bezier(.2,1.4,.4,1);pointer-events:auto}
.mark:hover,.mark.current{transform:translate(-50%,-50%) scale(1.12)}
.mark.current{box-shadow:0 0 0 3px color-mix(in srgb,var(--aa-accent) 28%,transparent),0 1px 5px rgba(0,0,0,.22)}
.mark.current{color:var(--aa-on-accent)}
.mark.d3,.dot.d3{font-size:8.5px}
.mark.d4,.dot.d4{font-size:6.5px}
.mark.sent{background:linear-gradient(135deg,#7c3aed,#a78bfa);color:#fff}
.mark.working{background:linear-gradient(135deg,#d97706,#fbbf24);color:#fff}
.mark.resolved{background:linear-gradient(135deg,#059669,#34d399);color:#fff}
.mark.detached{opacity:.5;border-style:dashed}
.mark.sent::after,.mark.working::after{content:"";position:absolute;inset:-5px;border-radius:50%;background:conic-gradient(currentColor,transparent 70%);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 2px),#000 calc(100% - 1.5px));mask:radial-gradient(farthest-side,transparent calc(100% - 2px),#000 calc(100% - 1.5px));animation:aa-spin 1.1s linear infinite;pointer-events:none}
.mark.sent::after{color:var(--aa-sent)}
.mark.working::after{color:var(--aa-working)}
.burst{position:fixed;width:22px;height:22px;pointer-events:none}
.burst::before{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid var(--aa-resolved);animation:aa-ring .75s cubic-bezier(.1,.7,.3,1) forwards}
.burst::after{content:"";position:absolute;left:10px;top:10px;width:2.5px;height:2.5px;border-radius:50%;animation:aa-sparks .7s cubic-bezier(.1,.7,.3,1) forwards}
@keyframes aa-ring{from{transform:scale(.7);opacity:1}to{transform:scale(2.5);opacity:0}}
@keyframes aa-sparks{from{box-shadow:0 -8px var(--aa-resolved),5.6px -5.6px var(--aa-accent),8px 0 var(--aa-resolved),5.6px 5.6px var(--aa-accent),0 8px var(--aa-resolved),-5.6px 5.6px var(--aa-accent),-8px 0 var(--aa-resolved),-5.6px -5.6px var(--aa-accent);opacity:1}to{box-shadow:0 -30px var(--aa-resolved),21px -21px var(--aa-accent),30px 0 var(--aa-resolved),21px 21px var(--aa-accent),0 30px var(--aa-resolved),-21px 21px var(--aa-accent),-30px 0 var(--aa-resolved),-21px -21px var(--aa-accent);opacity:0}}
@keyframes aa-spin{to{rotate:360deg}}
@keyframes aa-pop{from{opacity:0;transform:translateY(6px) scale(.97)}}
.panel,.toolbar{position:fixed;background:var(--aa-ink);border:1px solid var(--aa-edge);border-radius:var(--aa-radius);box-shadow:var(--aa-shadow);pointer-events:auto}
.panel:not([hidden]),.toolbar:not([hidden]){animation:aa-pop .2s cubic-bezier(.2,1.2,.4,1)}
.panel{z-index:3;padding:10px}
.head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.chip{flex:none;padding:2px 7px;font-size:11px;font-weight:700;color:var(--aa-on-accent);background:${GRADIENT};border-radius:6px}
.chip.sent,.dot.sent{background:linear-gradient(120deg,#7c3aed,#9f67ff);color:#fff}
.chip.working,.dot.working{background:linear-gradient(120deg,#b45309,#d97706);color:#fff}
.chip.resolved,.dot.resolved{background:linear-gradient(120deg,#059669,#10b981);color:#fff}
.target{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--aa-muted)}
.x{color:var(--aa-muted);font-size:18px;line-height:1;padding:0 2px}
.x:hover{color:var(--aa-text)}
textarea.input{display:block;width:100%;min-height:84px;resize:vertical;padding:8px 9px;font-size:13px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--aa-text);background:var(--aa-ink-2);border:1px solid var(--aa-line);border-radius:11px;cursor:text}
textarea.input:focus{border-color:var(--aa-accent);box-shadow:0 0 0 3px var(--aa-accent-soft)}
textarea.input::placeholder{color:var(--aa-muted)}
.comment{margin:0 0 8px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}
.reply{margin-bottom:8px;padding:8px 9px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere;background:color-mix(in srgb,var(--aa-resolved) 9%,var(--aa-ink));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--aa-resolved) 35%,transparent);border-radius:10px}
.reply.progress{background:color-mix(in srgb,var(--aa-working) 9%,var(--aa-ink));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--aa-working) 35%,transparent)}
.reply b{display:block;margin-bottom:2px;font-size:10.5px;font-weight:700;color:var(--aa-muted);text-transform:uppercase;letter-spacing:.04em}
.waiting{display:flex;align-items:flex-start;gap:8px;margin:0 0 8px;padding:8px 9px;font-size:12px;line-height:1.45;color:var(--aa-text);background:var(--aa-ink-2);border-radius:6px;overflow-wrap:anywhere}
.waiting .spinner{margin-top:2px}
.waiting span{flex:1;min-width:0}
.status{display:flex;align-items:center;gap:8px}
.status>span{flex:1;min-width:0}
.copy{flex:none;display:inline-flex;align-items:center;gap:4px;margin:-2px 0;padding:3px 7px 3px 6px;font-size:11px;font-weight:600;color:var(--aa-accent);background:var(--aa-accent-soft);border-radius:6px;white-space:nowrap}
.copy:hover{background:var(--aa-accent-soft-hover)}
.copy.copied{color:var(--aa-resolved);background:color-mix(in srgb,var(--aa-resolved) 14%,transparent)}
.copy svg{width:12px;height:12px}
.foot{display:flex;align-items:center;gap:6px;margin-top:8px}
.hint{flex:1;font-size:11px;color:var(--aa-muted);text-align:right}
.hint.nudge{color:var(--aa-accent);font-weight:600}
.btn{height:30px;padding:0 12px;font-size:12px;font-weight:600;line-height:30px;color:var(--aa-text);background:color-mix(in srgb,var(--aa-text) 9%,transparent);border-radius:9px}
.btn:hover:not(:disabled){background:color-mix(in srgb,var(--aa-text) 15%,transparent)}
.panel .btn:not(.primary,.danger){color:var(--aa-accent);background:var(--aa-accent-soft)}
.panel .btn:not(.primary,.danger):hover:not(:disabled){background:var(--aa-accent-soft-hover)}
.btn:disabled{opacity:.4;cursor:default}
.panel .btn.primary,.btn.primary{background:var(--aa-accent);color:var(--aa-on-accent)}
.panel .btn.primary:hover:not(:disabled),.btn.primary:hover:not(:disabled){background:var(--aa-accent);filter:brightness(1.08)}
.btn.danger{color:var(--aa-danger);background:color-mix(in srgb,var(--aa-danger) 13%,var(--aa-ink))}
.btn.danger:hover:not(:disabled){background:color-mix(in srgb,var(--aa-danger) 21%,var(--aa-ink))}
.btn.trash{display:grid;place-items:center;width:30px;padding:0;color:var(--aa-muted);background:color-mix(in srgb,var(--aa-text) 9%,transparent)}
.btn.trash svg{width:16px;height:16px}
.btn.trash:hover:not(:disabled){color:var(--aa-danger);background:color-mix(in srgb,var(--aa-danger) 15%,var(--aa-ink))}
.toolbar{max-width:calc(100vw - 16px)}
.tools{display:flex;align-items:center;gap:2px;padding:5px;flex-wrap:wrap}
.tool{position:relative;display:inline-flex;align-items:center;gap:5px;padding:6px 9px;font-size:12px;font-weight:600;border-radius:8px;white-space:nowrap}
.tool:hover:not(:disabled){background:var(--aa-hover)}
.tool.on{color:var(--aa-text);background:linear-gradient(110deg,color-mix(in srgb,var(--aa-accent) 20%,transparent),color-mix(in srgb,var(--aa-accent-2) 20%,transparent))}
.tool[data-mode].on{background:none}
.tool[data-mode].on::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;background:linear-gradient(110deg,color-mix(in srgb,var(--aa-accent) 24%,transparent),color-mix(in srgb,var(--aa-accent-2) 24%,transparent))}
.toolbar.opening .tools>*{animation:aa-rise .34s cubic-bezier(.2,1.3,.4,1) backwards}
.toolbar.opening .tools>*:nth-child(2){animation-delay:.03s}
.toolbar.opening .tools>*:nth-child(3){animation-delay:.06s}
.toolbar.opening .tools>*:nth-child(4){animation-delay:.09s}
.toolbar.opening .tools>*:nth-child(5){animation-delay:.12s}
.toolbar.opening .tools>*:nth-child(6){animation-delay:.15s}
.toolbar.opening .tools>*:nth-child(7){animation-delay:.18s}
.toolbar.opening .tools>*:nth-child(8){animation-delay:.21s}
@keyframes aa-rise{from{opacity:0;transform:translateY(7px)}}
.tool:disabled{opacity:.4;cursor:default}
.tool.icon{padding:6px 7px}
.sep{width:1px;height:18px;margin:0 3px;background:var(--aa-line)}
.send{position:relative;overflow:hidden;display:inline-flex;align-items:center;gap:6px;margin-left:2px;padding:6px 11px;font-size:12px;font-weight:700;color:var(--aa-accent);background:var(--aa-accent-soft);border-radius:8px;white-space:nowrap}
.send:not(:disabled)::after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%,color-mix(in srgb,var(--aa-accent) 38%,transparent) 50%,transparent 65%);transform:translateX(-120%);animation:aa-sheen 4.5s ease-in-out infinite;pointer-events:none}
@keyframes aa-sheen{0%,62%{transform:translateX(-120%)}86%,100%{transform:translateX(120%)}}
.send:not(:disabled) .count{color:var(--aa-on-accent);background:${GRADIENT};animation:aa-count 2.25s ease-in-out infinite}
@keyframes aa-count{50%{box-shadow:0 0 0 3px var(--aa-accent-soft)}}
.send:hover:not(:disabled){background:var(--aa-accent-soft-hover)}
.send:disabled{opacity:.45;cursor:default}
.split{display:inline-flex;min-width:0;margin-left:2px}
.split .send{margin-left:0}
.split .send:has(+ .more){border-radius:8px 0 0 8px;min-width:0}
.send.more{padding:6px 7px;border-radius:0 8px 8px 0;border-left:1px solid color-mix(in srgb,var(--aa-accent) 30%,transparent)}
.send.more svg{width:13px;height:13px}
.send .to{max-width:160px;overflow:hidden;text-overflow:ellipsis}
.current{flex:none;color:var(--aa-accent)}
.current svg{width:14px;height:14px}
.count{font-variant-numeric:tabular-nums;min-width:17px;padding:0 5px;font-size:10.5px;line-height:17px;text-align:center;color:var(--aa-ink);background:var(--aa-text);border-radius:9px}
.slot{display:contents}
.rows{width:0;min-width:100%}
.toolbar.up:not([hidden]){display:flex;flex-direction:column-reverse}
.toolbar.up .rows{border-bottom:1px solid var(--aa-divider)}
.toolbar.up .rows>:first-child{border-top:0}
.status,.rows>.busy{padding:6px 12px 8px;font-size:11.5px;color:var(--aa-muted);border-top:1px solid var(--aa-divider);overflow-wrap:anywhere}
.rows>.busy{display:flex;align-items:center;gap:7px}
.rows>.busy span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.spinner{flex:none;width:11px;height:11px;border-radius:50%;border:2px solid color-mix(in srgb,var(--aa-muted) 35%,transparent);border-top-color:var(--aa-text);animation:aa-spin .9s linear infinite}
.list{list-style:none;padding:4px;max-height:260px;overflow-y:auto;border-top:1px solid var(--aa-divider)}
.list li{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:7px;cursor:pointer}
.list li:hover{background:var(--aa-hover)}
.list li:focus-visible{outline:2px solid var(--aa-accent);outline-offset:-2px}
.phead{padding:8px 12px 2px;font-size:11px;font-weight:600;color:var(--aa-muted);border-top:1px solid var(--aa-divider)}
.pick{border-top:0}
.list li.empty{color:var(--aa-muted);cursor:default}
.list li.empty:hover{background:none}
.dot{flex:none;width:20px;height:20px;padding:0;font-size:10.5px;font-weight:700;line-height:20px;text-align:center;color:var(--aa-on-accent);background:${GRADIENT};border-radius:50%}
.ltext{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lstate{flex:none;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--aa-muted)}
.lfoot{display:flex;align-items:center;justify-content:flex-end;gap:6px;padding:6px 8px;border-top:1px solid var(--aa-divider)}
.confirm{display:flex;align-items:center;gap:6px;padding:8px;border-top:1px solid var(--aa-divider)}
.confirm p{flex:1;font-size:11.5px;color:var(--aa-muted)}
.launcher{position:fixed;transition:transform .22s cubic-bezier(.2,1.5,.4,1),background .15s,color .15s;left:clamp(8px,calc(var(--fx,1) * 100vw - 64px),calc(100vw - 52px));top:clamp(8px,calc(var(--fy,1) * 100vh - 140px),calc(100vh - 52px));width:44px;height:44px;display:grid;place-items:center;color:var(--aa-text);background:var(--aa-launcher);border:1.5px solid var(--aa-launcher-ring);border-radius:50%;box-shadow:0 6px 18px rgba(0,0,0,.3);cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;pointer-events:auto}
.launcher.placed{left:clamp(8px,calc(var(--fx) * 100vw),calc(100vw - 52px));top:clamp(8px,calc(var(--fy) * 100vh),calc(100vh - 52px))}
.launcher svg{width:19px;height:19px}
.launcher:hover{transform:scale(1.08);background:color-mix(in srgb,var(--aa-text) 12%,var(--aa-launcher))}
.launcher.on:hover{background:${GRADIENT}}
.launcher:active{transform:scale(.93)}
.launcher:hover svg{animation:aa-wiggle .55s ease-in-out}
@keyframes aa-wiggle{20%{transform:rotate(-14deg)}50%{transform:rotate(10deg)}75%{transform:rotate(-5deg)}}
.launcher.on{background:${GRADIENT};border-color:transparent;color:var(--aa-on-accent)}
.launcher.busy::after{content:"";position:absolute;inset:-5px;border-radius:50%;border:2px solid transparent;border-top-color:var(--aa-accent);animation:aa-spin 1.1s linear infinite}
.launcher.on.busy::after{border-top-color:var(--aa-accent-2)}
.badge{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 4px;font-size:10.5px;font-weight:700;line-height:14px;text-align:center;color:var(--aa-on-accent);background:var(--aa-accent);border:2px solid var(--aa-mark-edge);border-radius:9px}
@media (prefers-reduced-motion:reduce){.mark::after,.launcher.busy::after,.spinner,.send::after,.send .count,.panel,.toolbar,.toolbar *,.launcher svg{animation:none!important}.burst{display:none}.mark,.launcher,.hover{transition:none!important}}
@media print{.root{display:none!important}}
`;
