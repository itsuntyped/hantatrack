import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import App from "./App";
import { SSRDataProvider, type SSRData } from "./lib/ssr-context";

// SSR entry point. Loaded by Express via Vite's ssrLoadModule and called once
// per request. Keep this file thin — heavy logic belongs in services, not here.

// Shape returned to the caller (Express). Wraps the rendered HTML string so we
// can extend later (e.g. with `head`, `state`) without breaking the call site.
export interface RenderResult {
  html: string;
}

// Render the React tree to an HTML string for the requested URL.
// `_url` is unused today but kept on the signature so we can add route-aware
// rendering later without changing every caller. SSR payload is passed in
// explicitly rather than fetched here so the server controls data freshness.
export function render(_url: string, ssrData: SSRData): RenderResult {
  const html = renderToString(
    // StrictMode mirrors the client wrapper so dev-time invariants match.
    <StrictMode>
      <SSRDataProvider value={ssrData}>
        <App />
      </SSRDataProvider>
    </StrictMode>,
  );
  return { html };
}
