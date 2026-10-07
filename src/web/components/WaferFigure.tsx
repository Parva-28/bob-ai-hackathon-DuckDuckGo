"use client";

import { useEffect, useRef, useState } from "react";

// A Hairline figure (public/hairline/wafer.js) on the Hairline kernel
// (public/hairline/kernel.js, unchanged). The figure declares itself by calling
// window.hairline({...}); we catch that declaration and mount it ourselves,
// coloured with the app's palette instead of the kernel's greys.

type Figure = {
  name: string;
  means: string;
  range: [number, number, number];
  mount: (ctx: { stage: HTMLElement; svg: SVGSVGElement; read: { textContent: string | null } }, value: number)
    => { set: (v: number) => void; destroy: () => void };
};

declare global {
  interface Window {
    HL?: {
      inject: (root: Document) => void;
      mk: (tag: string, attrs: Record<string, string>, parent: Element) => SVGSVGElement;
    };
    hairline?: (f: Figure) => void;
  }
}

let ready: Promise<Figure | null> | null = null;

const load = (src: string, module = false) =>
  new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    if (module) s.type = "module";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });

function loadWafer() {
  ready ??= (async () => {
    let figure: Figure | null = null;
    window.hairline = (f) => { figure = f; };
    if (!window.HL) await load("/hairline/kernel.js");
    await load("/hairline/wafer.js", true);
    return figure;
  })();
  return ready;
}

const PALETTE = {
  "--hairline-plate": "#ffffff",
  "--hairline-hi": "#274c6b",
  "--hairline-edge": "#9aabb8",
  "--hairline-mid": "#c6d1d9",
  "--hairline-lo": "#e3e8ec",
} as React.CSSProperties;

export default function WaferFigure() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [read, setRead] = useState("rest");

  useEffect(() => {
    let cancelled = false;
    let handle: ReturnType<Figure["mount"]> | null = null;
    let svg: SVGSVGElement | null = null;

    loadWafer().then((figure) => {
      const stage = stageRef.current;
      if (cancelled || !stage || !figure || !window.HL) return;
      const HL = window.HL;
      HL.inject(document);
      stage.setAttribute("aria-label", figure.means);
      svg = HL.mk("svg", { viewBox: "0 0 400 320", "aria-hidden": "true" }, stage);
      let text: string | null = null;
      const readOut = {
        get textContent() { return text; },
        set textContent(v: string | null) { text = v == null ? "" : String(v); setRead(text); },
      };
      handle = figure.mount({ stage, svg, read: readOut }, figure.range[1]);
      if (text === null) readOut.textContent = "rest";
    }).catch(() => { /* the card stays empty; the page itself is unaffected */ });

    return () => { cancelled = true; handle?.destroy(); svg?.remove(); };
  }, []);

  return (
    <div className="wafer-hero">
      <div className="wafer-hero-top">
        <span>WM-811K PATTERNS</span>
        <span className="wafer-hero-read">{read === "rest" ? "Edge-Ring" : read}</span>
      </div>
      <div ref={stageRef} data-hairline="wafer" role="img" style={PALETTE} />
      <div className="wafer-hero-hint">
        {read === "rest" ? "Hover the wafer to drop a defect cluster" : "Where the cluster lands decides its class"}
      </div>
    </div>
  );
}
