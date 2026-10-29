import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Dialog as HDialog, DialogPanel, DialogTitle } from "@headlessui/react";
import * as Radix from "@radix-ui/react-dialog";

function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    addEventListener("popstate", on);
    return () => removeEventListener("popstate", on);
  }, []);
  const go = (to: string) => {
    history.pushState(null, "", to);
    setPath(to);
  };
  return [path, go] as const;
}

const CARDS = ["Pricing", "Usage", "Billing", "Team", "Security", "Exports"];

function Home() {
  const [order, setOrder] = useState(CARDS);
  const [epoch, setEpoch] = useState(0);
  const [hui, setHui] = useState(false);
  const [radix, setRadix] = useState(false);
  const native = useRef<HTMLDialogElement>(null);
  return (
    <>
      <section className="hero">
        <h1 data-testid="hero-title">Quarterly overview</h1>
        <p className="lede">Everything your team shipped this quarter, in one place.</p>
      </section>
      <div className="actions">
        <button onClick={() => setHui(true)}>Open drawer</button>
        <button onClick={() => setRadix(true)}>Open Radix dialog</button>
        <button onClick={() => native.current?.showModal()}>Open native dialog</button>
        <button
          data-testid="rerender"
          onClick={() => {
            setOrder((o) => [...o.slice(1), o[0]!]);
            setEpoch((e) => e + 1);
          }}
        >
          Re-render cards
        </button>
      </div>
      <div className="cards">
        {order.map((name) => (
          <div className="card" key={`${name}-${epoch}`} data-testid={`card-${name.toLowerCase()}`}>
            <h3 className={name === "Billing" ? "billing-title" : undefined}>{name}</h3>
            <p>{name} details for this quarter.</p>
          </div>
        ))}
      </div>
      <h2>Activity</h2>
      <div className="scroller" data-testid="scroller">
        {Array.from({ length: 30 }, (_, i) => (
          <div className="row" key={i}>
            Activity row {i + 1}
          </div>
        ))}
      </div>

      <HDialog open={hui} onClose={() => setHui(false)}>
        <div className="overlay" aria-hidden="true" />
        <DialogPanel className="drawer" data-testid="hui-drawer">
          <DialogTitle>Drawer settings</DialogTitle>
          <p className="drawer-copy">Adjust how this report is shared with your team.</p>
          <button data-testid="drawer-save">Save drawer</button>
          <button onClick={() => setHui(false)}>Close drawer</button>
        </DialogPanel>
      </HDialog>

      <Radix.Root open={radix} onOpenChange={setRadix}>
        <Radix.Portal>
          <Radix.Overlay className="overlay" />
          <Radix.Content className="radix-content" data-testid="radix-dialog" aria-describedby={undefined}>
            <Radix.Title>Share report</Radix.Title>
            <p className="radix-copy">Anyone with the link can view this report.</p>
            <Radix.Close asChild>
              <button>Close Radix</button>
            </Radix.Close>
          </Radix.Content>
        </Radix.Portal>
      </Radix.Root>

      <dialog className="native" ref={native} data-testid="native-dialog">
        <h2>Native dialog</h2>
        <p className="native-copy">A plain dialog opened with showModal.</p>
        <button onClick={() => native.current?.close()}>Close native</button>
      </dialog>
    </>
  );
}

class FixtureCard extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    this.attachShadow({ mode: "open" }).innerHTML = `<style>
      :host { display: block; padding: 16px; border: 1px solid #c9c3b6; border-radius: 10px; background: #fff; }
      h3 { margin: 0 0 6px; font-size: 18px; } p { margin: 0 0 10px; }
    </style><h3 class="title">Shadow card</h3><p class="body">This text lives inside a shadow root.</p><button class="act">Shadow action</button>`;
  }
}
if (!customElements.get("fixture-card")) customElements.define("fixture-card", FixtureCard);

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "fixture-card": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

function Widgets() {
  return (
    <>
      <h1>Widgets</h1>
      <fixture-card data-testid="shadow-card"></fixture-card>
      <h2>Embedded</h2>
      <iframe src="/frame.html" title="Framed widget" data-testid="frame" style={{ width: "100%", height: 240, border: "1px solid #c9c3b6", borderRadius: 10, background: "#fff" }} />
    </>
  );
}

function Settings() {
  return (
    <>
      <h1>Settings</h1>
      <form onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="name">Workspace name</label>
        <input id="name" data-testid="workspace-name" defaultValue="Acme" />
        <label htmlFor="email">Billing email</label>
        <input id="email" defaultValue="billing@example.com" />
      </form>
    </>
  );
}

function App() {
  const [path, go] = usePath();
  const link = (to: string, label: string) => (
    <a
      href={to}
      className={path === to ? "active" : ""}
      onClick={(e) => {
        e.preventDefault();
        go(to);
      }}
    >
      {label}
    </a>
  );
  return (
    <>
      <header>
        <strong>Fixture</strong>
        <nav>
          {link("/", "Home")}
          {link("/settings", "Settings")}
          {link("/widgets", "Widgets")}
        </nav>
      </header>
      <main>{path === "/settings" ? <Settings /> : path === "/widgets" ? <Widgets /> : <Home />}</main>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
