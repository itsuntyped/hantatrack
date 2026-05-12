import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
// Tailwind is loaded via a blocking <link> in index.html so the SSR HTML
// paints fully-styled on first frame — importing it here would push the CSS
// behind the JS bundle and cause a FOUC.
import App from "./App";
import { SSRDataProvider, readSSRDataFromWindow } from "./lib/ssr-context";

// Client entry point. The server injects the data payload as
// `window.__HANTA_SSR__` before this script runs; we read it here so the
// hydrated tree starts with the same data the server rendered.
const ssrData = readSSRDataFromWindow();

// The SSR template guarantees `<div id="root">` exists — throwing here would
// only fire if the HTML shell were modified incorrectly.
const root = document.getElementById("root");
if (!root) throw new Error("Root container #root not found");

// Hydrate the server-rendered DOM in place. Must mirror entry-server.tsx
// exactly (providers, StrictMode, props) or React reports a mismatch.
hydrateRoot(
  root,
  <StrictMode>
    <SSRDataProvider value={ssrData}>
      <App />
    </SSRDataProvider>
  </StrictMode>,
);
