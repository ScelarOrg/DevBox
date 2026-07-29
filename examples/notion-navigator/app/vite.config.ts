// DO NOT EDIT for new APIs or tables.
// Add routes under /server/api/*.ts — register-api auto-mounts them.
// Add tables in /server/schema.ts + /server/ensure-schema.ts.
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function authServerPlugin(): Plugin {
  return {
    name: "scelar-better-auth",
    async configureServer(server) {
      // Use ssrLoadModule — not relative import("./server/...").
      // Vite 6 runs the bundled config from node_modules/.vite-temp, so relative
      // imports resolve there and fail. ssrLoadModule uses config.root + aliases.
      // Always log + exit(1) on failure so Nodepod never "silently" returns to $.
      const root = server.config.root || __dirname;
      const mod = (rel: string) =>
        server.ssrLoadModule(path.resolve(root, rel));

      try {
        console.log("[scelar-auth] loading ensure-schema…");
        const { ensureSchema } = await mod("server/ensure-schema.ts");
        ensureSchema();

        console.log("[scelar-auth] loading auth…");
        const { ensureAuthReady } = await mod("server/auth.ts");
        const auth = ensureAuthReady();

        // Prefer better-call's getRequest + explicit getSetCookie bridging.
        // better-call's default setResponse iterates Headers in a way that
        // drops Set-Cookie inside browser workers (Nodepod), so sessions
        // appear to "succeed" (JSON token) while no cookie is stored.
        const { getRequest } = await import("better-call/node");
        const authFetch = "handler" in auth ? auth.handler : auth;
        server.middlewares.use(async (req, res, next) => {
          const url = req.url || "";
          if (url !== "/api/auth" && !url.startsWith("/api/auth/")) {
            next();
            return;
          }
          try {
            const host = String(req.headers.host || "localhost:5173");
            const request = getRequest({
              base: `http://${host}`,
              request: req,
            });
            const response = await authFetch(request);
            const cookies =
              typeof response.headers.getSetCookie === "function"
                ? response.headers.getSetCookie()
                : [];
            if (cookies.length > 0) {
              res.setHeader("set-cookie", cookies);
            }
            response.headers.forEach((value, key) => {
              if (key.toLowerCase() === "set-cookie") return;
              res.setHeader(key, value);
            });
            res.statusCode = response.status;
            const body = Buffer.from(await response.arrayBuffer());
            res.end(body);
          } catch (err) {
            const msg = err instanceof Error ? err.stack || err.message : String(err);
            console.error("[scelar-auth] request failed:\n" + msg);
            res.statusCode = 500;
            res.end(msg);
          }
        });

        console.log("[scelar-auth] loading register-api…");
        const { registerApiRoutes } = await mod("server/register-api.ts");
        await registerApiRoutes(server.middlewares, auth);
        console.log("[scelar-auth] ready");
      } catch (err) {
        const msg = err instanceof Error ? err.stack || err.message : String(err);
        console.error("\n[scelar-auth] FAILED to start auth/API layer:\n" + msg + "\n");
        try {
          server.config.logger.error("[scelar-auth] " + msg);
        } catch {
          /* logger may be unavailable */
        }
        // Non-zero exit so the shell shows failure instead of a quiet return to $.
        process.exit(1);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), authServerPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@server": path.resolve(__dirname, "server"),
    },
  },
});
