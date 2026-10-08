"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";

// Auto-play demo for recording the pitch: open any page with ?demo=1, or press
// D on the landing page. It flies the landing scene through its stops, has the
// model classify a wafer live, enters the console and walks L-4471's
// investigation to the evidence graph, with captions. Esc, or any real click,
// wheel or touch, hands control back. Mounted once in the root layout so it
// survives navigation; pages are driven by window events and data-demo hooks.

const KEY = "yg-demo";
const CHANGE = "yg-demo-change";

// The on/off flag lives outside React: ?demo=1 in the URL, kept in
// sessionStorage so it survives navigating into the console.
const readActive = () => {
  if (new URLSearchParams(window.location.search).get("demo") === "1") return true;
  try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; }
};
const setStored = (on: boolean) => {
  try { if (on) sessionStorage.setItem(KEY, "1"); else sessionStorage.removeItem(KEY); } catch { /* blocked */ }
  if (!on && new URLSearchParams(window.location.search).has("demo")) {
    const url = new URL(window.location.href);
    url.searchParams.delete("demo");
    window.history.replaceState(window.history.state, "", url);
  }
  window.dispatchEvent(new Event(CHANGE));
};
const subscribe = (cb: () => void) => {
  window.addEventListener(CHANGE, cb);
  return () => window.removeEventListener(CHANGE, cb);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Ctx = { alive: () => boolean; say: (t: string) => void; push: (href: string) => void };
type Step = (c: Ctx) => Promise<void>;

const emit = (name: string, detail?: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));

/** Wait for a selector to exist (pages load data first), up to `ms`. */
async function find(sel: string, c: Ctx, ms = 8000): Promise<HTMLElement | null> {
  const t0 = performance.now();
  while (c.alive() && performance.now() - t0 < ms) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
    await sleep(150);
  }
  return null;
}
const focus = async (sel: string, c: Ctx) => {
  const el = await find(sel, c);
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
  return el;
};

const SCRIPT: Record<string, Step[]> = {
  "/": [
    async (c) => { emit("yg-demo-goto", 0); c.say("YieldGuard: every failed die, explained."); await sleep(4000); },
    async (c) => { emit("yg-demo-goto", 1); c.say("Lot L-4471 leaves etch and heads into wafer sort."); await sleep(4500); },
    async (c) => { emit("yg-demo-goto", 2); c.say("The probe tester marks every die: green passed, red failed."); await sleep(4000); },
    async (c) => {
      emit("yg-demo-pick");
      c.say("Any tested wafer can be classified live by WaferCNN, with where the model looked.");
      await sleep(6000);
      emit("yg-demo-release");
      await sleep(1300);
    },
    async (c) => { emit("yg-demo-goto", 3); c.say("On the engineer's laptop: the pattern, and the etch-tool trace behind it."); await sleep(4500); },
    async (c) => { emit("yg-demo-goto", 4); c.say("YieldGuard explains the failure, and checks every citation."); await sleep(4500); },
    async (c) => { c.say("Into the console."); await sleep(600); (await find('a[href="/overview"]', c))?.click(); },
  ],
  "/overview": [
    async (c) => { c.say("The command center: fleet yield, live excursions, every tool backed by a model."); await sleep(4500); },
    async (c) => { c.say("Open the lowest-yield investigation."); await sleep(800); c.push("/investigation"); },
  ],
  "/investigation": [
    async (c) => {
      c.say("Root-cause investigation for L-4471.");
      if (!document.querySelector('[data-demo="lot-L-4471"].selected')) {
        (await find('[data-demo="change-lot"]', c))?.click();
        (await find('[data-demo="lot-L-4471"]', c))?.click();
      }
      await sleep(2000);
    },
    async (c) => {
      await focus(".wafer-panel", c);
      await sleep(900);
      const t = await find('[data-demo="attention"]', c);
      if (t && t.getAttribute("aria-pressed") !== "true") t.click();
      c.say("Where the model looked: the dies that drove the Edge-Ring call.");
      await sleep(4200);
    },
    async (c) => {
      await focus("#historical-evidence", c);
      (await find('[data-demo="tab-Evidence chain"]', c))?.click();
      c.say("Every sensor, value and past case a hypothesis cites is checked against the tools' own outputs.");
      await sleep(4800);
    },
    async (c) => {
      (await find('[data-demo="hyp-1"]', c))?.click();
      c.say("Hypothesis 02: the same check, on different evidence.");
      await sleep(3800);
    },
    async (c) => { c.say("YieldGuard · every claim checked against the models' own outputs."); await sleep(6000); },
  ],
};

export default function DemoDirector() {
  const pathname = usePathname();
  const router = useRouter();
  const [caption, setCaption] = useState<string | null>(null);
  const active = useSyncExternalStore(subscribe, readActive, () => false);
  const run = useRef(0);                       // bumps to cancel a running script

  const stop = () => {
    run.current++;
    setCaption(null);
    setStored(false);
  };

  // A demo started from ?demo=1 must outlive the URL once it navigates.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("demo") === "1") {
      try { sessionStorage.setItem(KEY, "1"); } catch { /* blocked */ }
    }
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && active) stop();
      if ((e.key === "d" || e.key === "D") && !active && pathname === "/" && !(e.target instanceof HTMLInputElement)) {
        setStored(true);
      }
    };
    // A real person taking over ends the demo; the script's own clicks are untrusted.
    const onUser = (e: Event) => { if (active && e.isTrusted) stop(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onUser, { passive: true });
    window.addEventListener("mousedown", onUser);
    window.addEventListener("touchstart", onUser, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onUser);
      window.removeEventListener("mousedown", onUser);
      window.removeEventListener("touchstart", onUser);
    };
  }, [active, pathname]);

  // Run this route's script; a new route or stop() cancels the old one.
  useEffect(() => {
    if (!active) return;
    const steps = SCRIPT[pathname];
    const id = ++run.current;
    const c: Ctx = {
      alive: () => run.current === id,
      say: (t) => { if (run.current === id) setCaption(t); },
      push: (href) => { if (run.current === id) router.push(href); },
    };
    (async () => {
      if (!steps) return;
      await sleep(pathname === "/" ? 3500 : 1800);       // let the page and its data arrive
      for (const step of steps) {
        if (!c.alive()) return;
        await step(c);
      }
      if (c.alive() && pathname === "/investigation") stop();
    })();
    return () => { run.current++; };
  }, [active, pathname, router]);

  if (!active || !caption) return null;
  return (
    <div className="demo-caption" role="status" aria-live="polite">
      <span className="demo-caption-text">{caption}</span>
      <span className="demo-caption-hint">DEMO · ESC TO EXIT</span>
    </div>
  );
}
