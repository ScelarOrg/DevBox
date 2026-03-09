/**
 * Nodepod Service Worker — proxies requests to virtual servers.
 * Version: 2 (cross-origin passthrough + prefix stripping)
 *
 * Intercepts:
 *   /__virtual__/{port}/{path}  — virtual server API
 *   /__preview__/{port}/{path}  — preview iframe navigation
 *   Any request from a client loaded via /__preview__/ — module imports etc.
 *
 * When an iframe navigates to /__preview__/{port}/, the SW records the
 * resulting clientId. All subsequent requests from that client (including
 * ES module imports like /@react-refresh) are intercepted and routed
 * through the virtual server.
 */

const SW_VERSION = 4;

let port = null;
let nextId = 1;
const pending = new Map();

// Maps clientId -> serverPort for preview iframes
const previewClients = new Map();

// User-injected script that runs before any page content in preview iframes.
// Set via postMessage({ type: "set-preview-script", script: "..." }) from main thread.
let previewScript = null;

// Watermark badge shown in preview iframes. On by default.
let watermarkEnabled = true;

// auth token from init, checked on control messages
let authToken = null;

// ws bridge token, gets baked into the shim script
let wsToken = null;

// Standard MIME types by file extension — used as a safety net when
// the virtual server returns text/html (SPA fallback) or omits Content-Type
// for paths that are clearly not HTML.
const MIME_TYPES = {
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".cjs": "application/javascript",
  ".ts": "application/javascript",
  ".tsx": "application/javascript",
  ".jsx": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".wasm": "application/wasm",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".md": "text/markdown",
};

/**
 * Infer correct MIME type for a response based on the request path.
 * When a server's SPA fallback serves index.html (text/html) for paths that
 * are clearly not HTML (e.g. .js, .css, .json files), the Content-Type is
 * wrong. This corrects it based purely on the file extension in the URL.
 */
function inferMimeType(path, responseHeaders) {
  const ct =
    responseHeaders["content-type"] || responseHeaders["Content-Type"] || "";

  // If the server already set a non-HTML Content-Type, trust it
  if (ct && !ct.includes("text/html")) {
    return null; // no override needed
  }

  // Strip query string and hash for extension detection
  const cleanPath = path.split("?")[0].split("#")[0];
  const lastDot = cleanPath.lastIndexOf(".");
  const ext = lastDot >= 0 ? cleanPath.slice(lastDot).toLowerCase() : "";

  // Only override if the path has a known non-HTML extension
  if (ext && MIME_TYPES[ext]) {
    return MIME_TYPES[ext];
  }

  return null; // no override
}

// ── Lifecycle ──

self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// ── Message handling ──

self.addEventListener("message", (event) => {
  const data = event.data;

  // init sets up the port + grabs the auth token
  if (data?.type === "init" && data.port) {
    port = data.port;
    port.onmessage = onPortMessage;
    if (data.token) {
      authToken = data.token;
    }
    return;
  }

  // everything else needs the right token
  if (authToken && data?.token !== authToken) return;

  // Allow main thread to register/unregister preview clients
  if (data?.type === "register-preview") {
    previewClients.set(data.clientId, data.serverPort);
  }
  if (data?.type === "unregister-preview") {
    previewClients.delete(data.clientId);
  }
  if (data?.type === "set-preview-script") {
    previewScript = data.script ?? null;
  }
  if (data?.type === "set-watermark") {
    watermarkEnabled = !!data.enabled;
  }
  if (data?.type === "set-ws-token") {
    wsToken = data.wsToken ?? null;
  }
});

function onPortMessage(event) {
  const msg = event.data;
  if (msg.type === "response" && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error));
    else resolve(msg.data);
  }
}

// ── Fetch interception ──

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. Explicit /__virtual__/{port}/{path}
  const virtualMatch = url.pathname.match(/^\/__virtual__\/(\d+)(\/.*)?$/);
  if (virtualMatch) {
    const serverPort = parseInt(virtualMatch[1], 10);
    const path = (virtualMatch[2] || "/") + url.search;
    event.respondWith(proxyToVirtualServer(event.request, serverPort, path));
    return;
  }

  // 2. Explicit /__preview__/{port}/{path} — navigation or subresource
  const previewMatch = url.pathname.match(/^\/__preview__\/(\d+)(\/.*)?$/);
  if (previewMatch) {
    const serverPort = parseInt(previewMatch[1], 10);
    const path = (previewMatch[2] || "/") + url.search;

    // Track the resulting client (for navigation requests) or current client
    if (event.request.mode === "navigate") {
      event.respondWith(
        (async () => {
          // resultingClientId is the client that will be created by this navigation
          if (event.resultingClientId) {
            previewClients.set(event.resultingClientId, serverPort);
          }
          return proxyToVirtualServer(event.request, serverPort, path);
        })(),
      );
    } else {
      event.respondWith(proxyToVirtualServer(event.request, serverPort, path));
    }
    return;
  }

  // 3. Request from a tracked preview client — route through virtual server.
  //    This catches module imports like /@react-refresh, /src/main.tsx, etc.
  //    Only intercept same-origin requests; let cross-origin requests
  //    (e.g. Google Fonts, external CDNs) pass through to the real server.
  const clientId = event.clientId;
  if (clientId && previewClients.has(clientId)) {
    const host = url.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === self.location.hostname) {
      const serverPort = previewClients.get(clientId);
      // Strip /__preview__/{port} prefix if the browser resolved a relative URL
      // against the preview page's location (e.g. /__preview__/3001.rsc → /.rsc,
      // /__preview__/3001/foo → /foo)
      let path = url.pathname;
      const ppMatch = path.match(/^\/__preview__\/\d+(.*)?$/);
      if (ppMatch) {
        path = ppMatch[1] || "/";
        if (path[0] !== "/") path = "/" + path;
      }
      path += url.search;
      event.respondWith(proxyToVirtualServer(event.request, serverPort, path, event.request));
      return;
    }
  }

  // 4. Fallback: check Referer header for /__preview__/ prefix.
  //    Handles edge cases where clientId might not be set.
  //    Only intercept same-origin requests (not cross-origin like Google Fonts).
  const referer = event.request.referrer;
  if (referer) {
    try {
      const refUrl = new URL(referer);
      const refMatch = refUrl.pathname.match(/^\/__preview__\/(\d+)/);
      if (refMatch) {
        const host = url.hostname;
        if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === self.location.hostname) {
          const serverPort = parseInt(refMatch[1], 10);
          // Strip /__preview__/{port} prefix if present
          let path = url.pathname;
          const ppMatch2 = path.match(/^\/__preview__\/\d+(.*)?$/);
          if (ppMatch2) {
            path = ppMatch2[1] || "/";
            if (path[0] !== "/") path = "/" + path;
          }
          path += url.search;
          // Also register this client for future requests
          if (clientId) {
            previewClients.set(clientId, serverPort);
          }
          event.respondWith(
            proxyToVirtualServer(event.request, serverPort, path, event.request),
          );
          return;
        }
      }
    } catch {
      // Invalid referer URL, ignore
    }
  }

  // If nothing matched, let the browser handle it normally
});

// ── WebSocket shim for preview iframes ──
//
// Injected into HTML responses to override the browser's WebSocket constructor.
// Routes localhost WebSocket connections through BroadcastChannel "nodepod-ws"
// to the main thread's request-proxy, which dispatches upgrade events on the
// virtual HTTP server. Works with any framework/library, not specific to Vite.

function getWsShimScript() {
  const tokenStr = wsToken ? JSON.stringify(wsToken) : "null";
  return `<script>
(function() {
  if (window.__nodepodWsShim) return;
  window.__nodepodWsShim = true;
  var NativeWS = window.WebSocket;
  var bc = new BroadcastChannel("nodepod-ws");
  var _wsToken = ${tokenStr};
  var nextId = 0;
  var active = {};

  // Detect the virtual server port from the page URL.
  // When loaded via /__preview__/{port}/, use that port for WS connections
  // instead of the literal port from the WS URL (which is the host page's port).
  var _previewPort = 0;
  try {
    var _m = location.pathname.match(/^\\/__preview__\\/(\\d+)/);
    if (_m) _previewPort = parseInt(_m[1], 10);
  } catch(e) {}

  function NodepodWS(url, protocols) {
    var parsed;
    try { parsed = new URL(url, location.href); } catch(e) {
      return new NativeWS(url, protocols);
    }
    // Only intercept localhost connections
    var host = parsed.hostname;
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "0.0.0.0") {
      return new NativeWS(url, protocols);
    }
    var self = this;
    var uid = "ws-iframe-" + (++nextId) + "-" + Math.random().toString(36).slice(2,8);
    // Use the preview port (from /__preview__/{port}/) if available,
    // otherwise fall back to the port from the WebSocket URL.
    var port = _previewPort || parseInt(parsed.port) || (parsed.protocol === "wss:" ? 443 : 80);
    var path = parsed.pathname + parsed.search;

    self.url = url;
    self.readyState = 0; // CONNECTING
    self.protocol = "";
    self.extensions = "";
    self.bufferedAmount = 0;
    self.binaryType = "blob";
    self.onopen = null;
    self.onclose = null;
    self.onerror = null;
    self.onmessage = null;
    self._uid = uid;
    self._listeners = {};

    active[uid] = self;

    bc.postMessage({
      kind: "ws-connect",
      uid: uid,
      port: port,
      path: path,
      protocols: Array.isArray(protocols) ? protocols.join(",") : (protocols || ""),
      token: _wsToken
    });

    // Timeout: if no ws-open within 5s, fire error
    self._connectTimer = setTimeout(function() {
      if (self.readyState === 0) {
        self.readyState = 3;
        var e = new Event("error");
        self.onerror && self.onerror(e);
        _emit(self, "error", e);
        delete active[uid];
      }
    }, 5000);
  }

  function _emit(ws, evt, arg) {
    var list = ws._listeners[evt];
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      try { list[i].call(ws, arg); } catch(e) { /* ignore */ }
    }
  }

  NodepodWS.prototype.addEventListener = function(evt, fn) {
    if (!this._listeners[evt]) this._listeners[evt] = [];
    this._listeners[evt].push(fn);
  };
  NodepodWS.prototype.removeEventListener = function(evt, fn) {
    var list = this._listeners[evt];
    if (!list) return;
    this._listeners[evt] = list.filter(function(f) { return f !== fn; });
  };
  NodepodWS.prototype.dispatchEvent = function(evt) {
    _emit(this, evt.type, evt);
    return true;
  };
  NodepodWS.prototype.send = function(data) {
    if (this.readyState !== 1) throw new Error("WebSocket is not open");
    var type = "text";
    var payload = data;
    if (data instanceof ArrayBuffer) {
      type = "binary";
      payload = Array.from(new Uint8Array(data));
    } else if (data instanceof Uint8Array) {
      type = "binary";
      payload = Array.from(data);
    }
    bc.postMessage({ kind: "ws-send", uid: this._uid, data: payload, type: type, token: _wsToken });
  };
  NodepodWS.prototype.close = function(code, reason) {
    if (this.readyState >= 2) return;
    this.readyState = 2;
    bc.postMessage({ kind: "ws-close", uid: this._uid, code: code || 1000, reason: reason || "", token: _wsToken });
    var self = this;
    setTimeout(function() {
      self.readyState = 3;
      var e = new CloseEvent("close", { code: code || 1000, reason: reason || "", wasClean: true });
      self.onclose && self.onclose(e);
      _emit(self, "close", e);
      delete active[self._uid];
    }, 0);
  };

  NodepodWS.CONNECTING = 0;
  NodepodWS.OPEN = 1;
  NodepodWS.CLOSING = 2;
  NodepodWS.CLOSED = 3;
  NodepodWS.prototype.CONNECTING = 0;
  NodepodWS.prototype.OPEN = 1;
  NodepodWS.prototype.CLOSING = 2;
  NodepodWS.prototype.CLOSED = 3;

  bc.onmessage = function(ev) {
    var d = ev.data;
    if (!d || !d.uid) return;
    // check bridge token
    if (_wsToken && d.token !== _wsToken) return;
    var ws = active[d.uid];
    if (!ws) return;

    if (d.kind === "ws-open") {
      clearTimeout(ws._connectTimer);
      ws.readyState = 1;
      var e = new Event("open");
      ws.onopen && ws.onopen(e);
      _emit(ws, "open", e);
    } else if (d.kind === "ws-message") {
      var msgData;
      if (d.type === "binary") {
        msgData = new Uint8Array(d.data).buffer;
      } else {
        msgData = d.data;
      }
      var me = new MessageEvent("message", { data: msgData });
      ws.onmessage && ws.onmessage(me);
      _emit(ws, "message", me);
    } else if (d.kind === "ws-closed") {
      ws.readyState = 3;
      clearTimeout(ws._connectTimer);
      var ce = new CloseEvent("close", { code: d.code || 1000, reason: "", wasClean: true });
      ws.onclose && ws.onclose(ce);
      _emit(ws, "close", ce);
      delete active[d.uid];
    } else if (d.kind === "ws-error") {
      ws.readyState = 3;
      clearTimeout(ws._connectTimer);
      var ee = new Event("error");
      ws.onerror && ws.onerror(ee);
      _emit(ws, "error", ee);
      delete active[d.uid];
    }
  };

  window.WebSocket = NodepodWS;
})();
</script>`;
}

// Small "nodepod" badge in the bottom-right corner of preview iframes.
const WATERMARK_SCRIPT = `<script>
(function() {
  if (window.__nodepodWatermark) return;
  window.__nodepodWatermark = true;
  document.addEventListener("DOMContentLoaded", function() {
    var a = document.createElement("a");
    a.href = "https://github.com/ScelarOrg/Nodepod";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "nodepod";
    a.style.cssText = "position:fixed;bottom:6px;right:8px;z-index:2147483647;"
      + "font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;"
      + "color:rgba(255,255,255,0.45);background:rgba(0,0,0,0.25);padding:2px 6px;"
      + "border-radius:4px;text-decoration:none;pointer-events:auto;transition:color .15s;";
    a.onmouseenter = function() { a.style.color = "rgba(255,255,255,0.85)"; };
    a.onmouseleave = function() { a.style.color = "rgba(255,255,255,0.45)"; };
    document.body.appendChild(a);
  });
})();
</script>`;

// ── Error page generator ──

function errorPage(status, title, message) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${status} - ${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0a0a0a; color: #e0e0e0;
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; padding: 2rem;
  }
  .container { max-width: 480px; text-align: center; }
  .status { font-size: 5rem; font-weight: 700; color: #555; line-height: 1; }
  .title { font-size: 1.25rem; margin-top: 0.75rem; color: #ccc; }
  .message { font-size: 0.875rem; margin-top: 1rem; color: #888; line-height: 1.5; }
  .hint { font-size: 0.8rem; margin-top: 1.5rem; color: #555; }
</style>
</head>
<body>
<div class="container">
  <div class="status">${status}</div>
  <div class="title">${title}</div>
  <div class="message">${message}</div>
  <div class="hint">Powered by Nodepod</div>
</div>
</body>
</html>`;
  return new Response(html, {
    status,
    statusText: title,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  });
}

// ── Virtual server proxy ──

async function proxyToVirtualServer(request, serverPort, path, originalRequest) {
  if (!port) {
    const clients = await self.clients.matchAll();
    for (const client of clients) {
      client.postMessage({ type: "sw-needs-init" });
    }
    await new Promise((r) => setTimeout(r, 200));
    if (!port) {
      return errorPage(503, "Service Unavailable", "The Nodepod service worker is still initializing. Please refresh the page.");
    }
  }

  // Clone the original request before consuming the body, so we can use it
  // for the 404 fallback fetch later if needed.
  const fallbackRequest = originalRequest ? originalRequest.clone() : null;

  const headers = {};
  request.headers.forEach((v, k) => {
    headers[k] = v;
  });
  headers["host"] = `localhost:${serverPort}`;

  let body = undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      body = await request.arrayBuffer();
    } catch {
      // body not available
    }
  }

  const id = nextId++;
  const promise = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error("Request timeout: " + path));
      }
    }, 30000);
  });

  port.postMessage({
    type: "request",
    id,
    data: {
      port: serverPort,
      method: request.method,
      url: path,
      headers,
      body,
      // Pass the full original URL so the main thread can do a fallback
      // network fetch if the virtual server returns 404. This handles
      // cross-origin resources (fonts, CDN assets) that the preview app
      // references but the virtual server doesn't serve.
      originalUrl: request.url,
    },
  });

  try {
    const data = await promise;
    let responseBody = null;
    if (data.bodyBase64) {
      const binary = atob(data.bodyBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      responseBody = bytes;
    }
    const respHeaders = Object.assign({}, data.headers || {});

    // Fix MIME type: SPA fallback middleware may serve index.html (text/html)
    // for non-HTML paths. Correct the Content-Type based on file extension.
    const overrideMime = inferMimeType(path, respHeaders);
    if (overrideMime) {
      // Replace Content-Type regardless of casing in original headers
      for (const k of Object.keys(respHeaders)) {
        if (k.toLowerCase() === "content-type") delete respHeaders[k];
      }
      respHeaders["content-type"] = overrideMime;
    }

    // Inject WebSocket shim + preview script into HTML responses so that
    // browser-side WebSocket connections are routed through nodepod, and
    // user-provided preview scripts run before any page content.
    let finalBody = responseBody;
    const ct = respHeaders["content-type"] || respHeaders["Content-Type"] || "";
    if (ct.includes("text/html") && responseBody) {
      let injection = getWsShimScript();
      if (previewScript) {
        injection += `<script>${previewScript}<` + `/script>`;
      }
      if (watermarkEnabled) {
        injection += WATERMARK_SCRIPT;
      }
      const html = new TextDecoder().decode(responseBody);
      // Inject before <head> or at the start of the document
      const headIdx = html.indexOf("<head");
      if (headIdx >= 0) {
        const closeAngle = html.indexOf(">", headIdx);
        if (closeAngle >= 0) {
          const injected = html.slice(0, closeAngle + 1) + injection + html.slice(closeAngle + 1);
          finalBody = new TextEncoder().encode(injected);
        }
      } else {
        // No <head> tag — prepend the shim
        finalBody = new TextEncoder().encode(injection + html);
      }
      // Update content-length if present
      for (const k of Object.keys(respHeaders)) {
        if (k.toLowerCase() === "content-length") {
          respHeaders[k] = String(finalBody.byteLength);
        }
      }
    }

    // Ensure COEP compatibility: the parent page sets
    // Cross-Origin-Embedder-Policy: credentialless, so all sub-resources
    // (including iframe content served by this SW) need CORP headers.
    // Additionally, iframe HTML documents need their own COEP/COOP headers
    // so that subresources loaded by the iframe are also allowed.
    if (!respHeaders["cross-origin-resource-policy"] && !respHeaders["Cross-Origin-Resource-Policy"]) {
      respHeaders["Cross-Origin-Resource-Policy"] = "cross-origin";
    }
    if (!respHeaders["cross-origin-embedder-policy"] && !respHeaders["Cross-Origin-Embedder-Policy"]) {
      respHeaders["Cross-Origin-Embedder-Policy"] = "credentialless";
    }
    if (!respHeaders["cross-origin-opener-policy"] && !respHeaders["Cross-Origin-Opener-Policy"]) {
      respHeaders["Cross-Origin-Opener-Policy"] = "same-origin";
    }

    // If the virtual server returned 404 and we have the original request,
    // fall back to a real network fetch. This handles cases where the preview
    // app generates relative URLs for external resources (e.g. fonts, CDN assets)
    // that the virtual server doesn't serve.
    if ((data.statusCode === 404) && fallbackRequest) {
      try {
        return await fetch(fallbackRequest);
      } catch (fetchErr) {
        // Fall through to return the original 404
      }
    }

    return new Response(finalBody, {
      status: data.statusCode || 200,
      statusText: data.statusMessage || "OK",
      headers: respHeaders,
    });
  } catch (err) {
    const msg = err.message || "Proxy error";
    // If the error is a timeout, it likely means no server is listening
    if (msg.includes("timeout")) {
      return errorPage(504, "Gateway Timeout", "No server responded on port " + serverPort + ". Make sure your dev server is running.");
    }
    return errorPage(502, "Bad Gateway", msg);
  }
}
