import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { ViteDevServer } from "vite";
import { apiConfig } from "./config";
import { requestId } from "./middleware/request-id";
import { cspNonce, helmetMiddleware, siteCors } from "./middleware/security";
import { apiRateLimit } from "./middleware/rate-limit";
import { errorHandler, notFound } from "./middleware/error";
import { v1Router } from "./routes/v1";
import { loadHomeSSRData } from "./services/page-data";
import { SSR_DATA_GLOBAL, type SSRData } from "../../lib/ssr-context";

// Express application factory.
// Builds the full middleware stack, mounts the API router, and wires up
// SSR for both development (Vite middleware mode) and production (prebuilt bundles).

// Resolve the project root from the compiled file location so it works in
// both dev (tsx) and prod (built dist/server).
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../../..");
const clientDistDir = resolve(projectRoot, "dist/client");
const serverDistDir = resolve(projectRoot, "dist/server");

// Minimal interface describing the SSR entry module — keeps app.ts decoupled
// from the renderer implementation.
interface SSRRenderer {
  render(url: string, ssrData: SSRData): { html: string } | Promise<{ html: string }>;
}

export async function buildApp(): Promise<Express> {
  const app = express();

  // Behind a reverse proxy we need this so req.ip and rate-limit keying work.
  if (apiConfig.TRUST_PROXY) app.set("trust proxy", 1);
  // Hide Express fingerprinting.
  app.disable("x-powered-by");

  // Middleware order matters here:
  // 1. requestId — every later middleware can correlate logs by req.id
  // 2. cspNonce — set before helmet so the CSP directive can read it
  // 3. helmet — security headers including CSP
  // 4. json body parser — bounded size since the API is read-only
  app.use(requestId);
  app.use(cspNonce);
  app.use(helmetMiddleware());
  app.use(express.json({ limit: "16kb" }));

  // Public API: locked-down CORS + rate limiting + read-only routes.
  app.use("/api/v1", siteCors(), apiRateLimit(), v1Router());
  // 404 for anything else under /api (other API versions etc.).
  app.use("/api", notFound);

  // SSR + static serving differs between dev and prod — split below.
  if (apiConfig.NODE_ENV === "production") {
    await mountProduction(app);
  } else {
    await mountDevelopment(app);
  }

  // Error handler must be the last middleware so it catches everything above.
  app.use(errorHandler);
  return app;
}

// Development SSR path: spin up Vite in middleware mode so we get HMR and
// on-the-fly TS compilation for the React tree.
async function mountDevelopment(app: Express): Promise<void> {
  const { createServer } = await import("vite");
  const vite: ViteDevServer = await createServer({
    root: projectRoot,
    server: { middlewareMode: true },
    appType: "custom",
  });

  // Vite handles all client asset requests (transforming TS, serving HMR).
  app.use(vite.middlewares);

  // Catch-all that excludes /api/* — every page route renders the SSR shell.
  app.get(/^\/(?!api\/).*/, async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Read the HTML template fresh on each request so edits show up.
      const templatePath = resolve(projectRoot, "index.html");
      const raw = await readFile(templatePath, "utf-8");
      const template = await vite.transformIndexHtml(req.originalUrl, raw);

      // Load the SSR entry through Vite so it gets the same TS/JSX treatment.
      const mod = (await vite.ssrLoadModule("/src/entry-server.tsx")) as SSRRenderer;
      const ssrData = await loadHomeSSRData();
      const { html: appHtml } = await mod.render(req.originalUrl, ssrData);

      res
        .status(200)
        .set({ "Content-Type": "text/html; charset=utf-8" })
        .end(injectSSR(template, appHtml, ssrData, res.locals.cspNonce ?? ""));
    } catch (err) {
      // Source-map dev stack traces back to the original TS files.
      vite.ssrFixStacktrace(err instanceof Error ? err : new Error(String(err)));
      next(err);
    }
  });
}

// Production SSR path: use the prebuilt client+server bundles.
async function mountProduction(app: Express): Promise<void> {
  // Hard failure with a clear message if `npm run build` hasn't been run.
  if (!existsSync(clientDistDir) || !existsSync(serverDistDir)) {
    throw new Error(
      `SSR bundles not found at ${clientDistDir} and ${serverDistDir}. Run "npm run build" before starting the server in production.`,
    );
  }

  // Long-cache hashed asset files; only the HTML shell is no-cache.
  app.use(
    express.static(clientDistDir, {
      index: false,
      maxAge: "1y",
      immutable: true,
      setHeaders(res, p) {
        // HTML must not be immutable — it embeds per-request SSR data + nonce.
        if (p.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
      },
    }),
  );

  // Read the template once at startup — it never changes in production.
  const template = await readFile(resolve(clientDistDir, "index.html"), "utf-8");
  const entry = (await import(toFileUrl(resolve(serverDistDir, "entry-server.js")))) as SSRRenderer;

  app.get(/^\/(?!api\/).*/, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ssrData = await loadHomeSSRData();
      const { html: appHtml } = await entry.render(req.originalUrl, ssrData);
      res
        .status(200)
        .set({
          "Content-Type": "text/html; charset=utf-8",
          // Allow a 60s shared cache + 5min stale-while-revalidate so CDNs
          // can absorb traffic without serving stale pages forever.
          "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
        })
        .end(injectSSR(template, appHtml, ssrData, res.locals.cspNonce ?? ""));
    } catch (err) {
      next(err);
    }
  });
}

// Stitch the rendered app HTML and SSR data payload into the template.
// The data payload goes in a nonce-gated <script> tag — the CSP allows
// inline scripts only via this nonce.
function injectSSR(template: string, appHtml: string, data: SSRData, nonce: string): string {
  const serialized = serializeForScriptTag(data);
  const dataTag = `<script${nonce ? ` nonce="${nonce}"` : ""}>window.${SSR_DATA_GLOBAL} = ${serialized};</script>`;
  return template
    .replace("<!--ssr-outlet-->", appHtml)
    .replace("<!--ssr-data-->", dataTag);
}

// JSON serialization is not script-safe by itself — `</script>` inside a
// string would close the inline tag. Escape the few characters that matter,
// including the JS-only line separators U+2028 / U+2029 which JSON allows
// raw but break JS parsing in older browsers.
const LINE_SEP = String.fromCharCode(0x2028);
const PARA_SEP = String.fromCharCode(0x2029);

function serializeForScriptTag(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replaceAll(LINE_SEP, "\\u2028")
    .replaceAll(PARA_SEP, "\\u2029");
}

// Convert a Windows or POSIX absolute path to a file:// URL for dynamic import.
// Required because Node's import() expects URLs, not raw paths, on Windows.
function toFileUrl(absPath: string): string {
  const normalized = absPath.replace(/\\/g, "/");
  return normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`;
}
