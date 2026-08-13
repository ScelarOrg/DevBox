(function () {
  "use strict";

  const params = new URLSearchParams(location.search);
  const mode = params.get("mode");

  function ensureStatusStyles() {
    if (document.getElementById("nodepod-status-styles")) return;
    const styles = document.createElement("style");
    styles.id = "nodepod-status-styles";
    styles.textContent = `
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body.nodepod-status-page {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background: #191a1e;
        color: #f5f5f6;
        font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      .nodepod-status-card {
        width: min(450px, 100%);
        overflow: hidden;
        padding: 0;
        border: 1px solid #303138;
        border-radius: 24px;
        background: #202126;
        box-shadow: 0 20px 55px rgba(0, 0, 0, .24);
      }
      .nodepod-status-panel {
        margin: 2px 2px 0;
        padding: 27px 26px 24px;
        border: 1px solid #34353c;
        border-radius: 22px;
        background: #28292e;
        box-shadow: inset 0 1px rgba(255, 255, 255, .018);
      }
      .nodepod-status-heading {
        margin: 0;
        color: #fafafa;
        font-size: 20px;
        font-weight: 650;
        letter-spacing: -.025em;
        line-height: 1.3;
      }
      .nodepod-status-message {
        max-width: 34em;
        margin: 8px 0 0;
        color: #a6a6af;
        font-size: 13px;
        line-height: 1.6;
      }
      .nodepod-status-state {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 19px;
        padding-top: 16px;
        border-top: 1px solid #37383f;
        color: #8f9099;
        font-size: 12px;
        line-height: 1;
      }
      .nodepod-status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #5ccf9c;
      }
      .nodepod-status-card[data-tone="busy"] .nodepod-status-dot {
        background: #9b8cff;
        animation: nodepod-status-pulse 1.6s ease-in-out infinite;
      }
      .nodepod-status-card[data-tone="error"] .nodepod-status-dot {
        background: #f07878;
      }
      .nodepod-status-actions {
        display: grid;
        grid-template-columns: 3fr 1fr;
        gap: 8px;
        padding: 8px;
      }
      .nodepod-status-action,
      .nodepod-status-back {
        min-width: 0;
        min-height: 46px;
        padding: 0 16px;
        border-radius: 16px;
        font: 600 13px/1 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer;
        transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
      }
      .nodepod-status-action {
        border: 1px solid #f2f2f3;
        background: #f2f2f3;
        color: #1e1f23;
      }
      .nodepod-status-action:hover {
        border-color: #ffffff;
        background: #ffffff;
      }
      .nodepod-status-action:active { background: #dedee1; }
      .nodepod-status-back {
        border: 1px solid #3a3b42;
        background: #27282d;
        color: #c2c2c8;
      }
      .nodepod-status-back:hover {
        border-color: #4b4c54;
        background: #2d2e34;
        color: #f3f3f4;
      }
      .nodepod-status-action:focus-visible,
      .nodepod-status-back:focus-visible {
        outline: 3px solid rgba(155, 140, 255, .28);
        outline-offset: 2px;
      }
      @keyframes nodepod-status-pulse {
        0%, 100% { opacity: .45; }
        50% { opacity: 1; }
      }
      @media (max-width: 340px) {
        .nodepod-status-actions { grid-template-columns: 1fr; }
      }
      @media (prefers-reduced-motion: reduce) {
        .nodepod-status-dot { animation: none !important; }
        .nodepod-status-action,
        .nodepod-status-back { transition: none; }
      }
    `;
    document.head.appendChild(styles);
  }

  function status(title, message, action) {
    ensureStatusStyles();
    document.body.innerHTML = "";
    document.body.className = "nodepod-status-page";
    document.body.removeAttribute("style");
    const tone = /unavailable|error/i.test(title)
      ? "error"
      : /connecting|preparing/i.test(title)
        ? "busy"
        : "ready";
    const card = document.createElement("main");
    card.className = "nodepod-status-card";
    card.dataset.tone = tone;

    const state = document.createElement("div");
    state.className = "nodepod-status-state";
    const dot = document.createElement("span");
    dot.className = "nodepod-status-dot";
    dot.setAttribute("aria-hidden", "true");
    const stateLabel = document.createElement("span");
    stateLabel.textContent = tone === "busy"
      ? "Connecting"
      : tone === "error"
        ? "Needs attention"
        : "Ready to connect";
    state.append(dot, stateLabel);

    const panel = document.createElement("section");
    panel.className = "nodepod-status-panel";
    const heading = document.createElement("h1");
    heading.textContent = title;
    heading.className = "nodepod-status-heading";
    const text = document.createElement("p");
    text.textContent = message;
    text.className = "nodepod-status-message";
    panel.append(heading, text, state);
    card.append(panel);
    if (action) {
      const actions = document.createElement("div");
      actions.className = "nodepod-status-actions";
      actions.append(action, makeBackButton());
      card.append(actions);
    }
    document.body.append(card);
  }

  function makeButton(label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.className = "nodepod-status-action";
    button.addEventListener("click", onClick);
    return button;
  }

  function makeBackButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Go back";
    button.className = "nodepod-status-back";
    button.addEventListener("click", () => {
      const config = readTopLevelConfig();
      if (config) {
        let target = config.parentOrigin;
        try {
          const referrer = new URL(document.referrer);
          if (referrer.origin === config.parentOrigin) target = referrer.href;
        } catch {}
        location.assign(target);
      } else if (history.length > 1) {
        history.back();
      } else {
        window.close();
      }
    });
    return button;
  }

  function stage(type, bridgeId, parentOrigin, value) {
    if (!bridgeId || !parentOrigin || window.parent === window) return;
    window.parent.postMessage(
      { type, bridgeId, stage: value },
      parentOrigin,
    );
  }

  async function registerWorker(swUrl) {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service workers are not supported on the preview origin");
    }
    const registration = await navigator.serviceWorker.register(swUrl, {
      scope: "/",
      updateViaCache: "none",
    });
    await navigator.serviceWorker.ready;
    const worker = registration.active || navigator.serviceWorker.controller;
    if (!worker) throw new Error("Preview service worker has no active worker");
    return { registration, worker };
  }

  async function bootEmbedded() {
    const parentOrigin = params.get("parentOrigin");
    const bridgeId = params.get("bridgeId");
    const swUrl = params.get("swUrl") || "/__sw__.js";
    if (!parentOrigin || !bridgeId) {
      throw new Error("Invalid embedded Nodepod preview bridge request");
    }

    const post = (type, extra) => {
      window.parent.postMessage(
        Object.assign({ type, bridgeId }, extra || {}),
        parentOrigin,
      );
    };
    let relayPort = null;
    let wsChannel = null;
    const connectRelay = (port) => {
      try { relayPort && relayPort.close(); } catch {}
      try { wsChannel && wsChannel.close(); } catch {}
      relayPort = port;
      wsChannel = new BroadcastChannel("nodepod-ws");
      relayPort.onmessage = (event) => wsChannel.postMessage(event.data);
      wsChannel.onmessage = (event) => relayPort.postMessage(event.data);
      relayPort.start && relayPort.start();
    };
    stage("nodepod-bridge-stage", bridgeId, parentOrigin, "script-started");
    stage("nodepod-bridge-stage", bridgeId, parentOrigin, "registering-service-worker");
    const { registration } = await registerWorker(swUrl);
    stage(
      "nodepod-bridge-stage",
      bridgeId,
      parentOrigin,
      `service-worker-ready:${registration.active?.scriptURL || "unknown"}`,
    );

    window.addEventListener("message", (event) => {
      const data = event.data;
      if (
        event.source !== window.parent ||
        event.origin !== parentOrigin ||
        !data ||
        data.type !== "nodepod-bridge-connect" ||
        data.bridgeId !== bridgeId ||
        !data.requestPort ||
        !data.relayPort
      ) {
        return;
      }
      const worker = registration.active || navigator.serviceWorker.controller;
      if (!worker) {
        post("nodepod-bridge-error", {
          message: "Preview service worker has no active worker",
        });
        return;
      }
      connectRelay(data.relayPort);
      worker.postMessage(
        {
          type: "init",
          port: data.requestPort,
          token: data.token,
        },
        [data.requestPort],
      );
      stage(
        "nodepod-bridge-stage",
        bridgeId,
        parentOrigin,
        `init-message-sent:${registration.active?.scriptURL || "unknown"}`,
      );
      post("nodepod-bridge-connected");
    });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      post("nodepod-bridge-controllerchange");
    });
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data && event.data.type === "sw-needs-init") {
        post("nodepod-bridge-reconnect");
      }
    });
    stage("nodepod-bridge-stage", bridgeId, parentOrigin, "message-listener-ready");
    post("nodepod-bridge-ready");
  }

  function readTopLevelConfig() {
    let instanceId = params.get("instanceId");
    let serverPort = Number(params.get("port"));
    let parentOrigin = params.get("parentOrigin");
    const localMatch = location.hostname.match(/^(.+)-(\d+)\.localhost$/i);
    const productionMatch = location.hostname.match(
      /^(.+)-(\d+)\.preview\.(.+)$/i,
    );
    const hostnameMatch = localMatch || productionMatch;
    if ((!instanceId || !Number.isFinite(serverPort)) && hostnameMatch) {
      instanceId = hostnameMatch[1];
      serverPort = Number(hostnameMatch[2]);
    }
    if (!parentOrigin && localMatch) {
      parentOrigin = `${location.protocol}//localhost${location.port ? `:${location.port}` : ""}`;
    }
    if (!parentOrigin && productionMatch) {
      parentOrigin = `${location.protocol}//${productionMatch[3]}`;
    }
    if (
      !instanceId ||
      !Number.isInteger(serverPort) ||
      serverPort <= 0 ||
      serverPort > 65535 ||
      !parentOrigin
    ) {
      return null;
    }
    try {
      const parent = new URL(parentOrigin);
      if (parent.protocol !== "http:" && parent.protocol !== "https:") return null;
      parentOrigin = parent.origin;
    } catch {
      return null;
    }
    const sw = new URL(params.get("swUrl") || "/__sw__.js", location.origin);
    sw.searchParams.set("nodepodInstanceId", instanceId);
    sw.searchParams.set("nodepodPort", String(serverPort));
    sw.searchParams.set("nodepodParentOrigin", parentOrigin);
    return { instanceId, serverPort, parentOrigin, swUrl: sw.pathname + sw.search };
  }

  async function bootTopLevel() {
    const config = readTopLevelConfig();
    if (!config) {
      status(
        "Preview unavailable",
        "This hostname is not configured as a Nodepod preview origin.",
      );
      return;
    }
    let completed = false;
    let connectionInFlight = false;
    let cancelConnection = null;
    let registrationPromise = null;

    const getRegistration = () => {
      if (!registrationPromise) {
        registrationPromise = registerWorker(config.swUrl).catch((error) => {
          registrationPromise = null;
          throw error;
        });
      }
      return registrationPromise;
    };

    navigator.serviceWorker.addEventListener("message", (event) => {
      const data = event.data;
      if (
        data &&
        data.type === "nodepod-origin-bound" &&
        data.instanceId === config.instanceId &&
        data.port === config.serverPort &&
        !completed
      ) {
        completed = true;
        cancelConnection?.();
        // Reload the URL the user actually opened. This preserves first-visit
        // client-router deep links instead of collapsing every preview to `/`.
        location.reload();
      }
    });

    const connect = () => {
      if (completed || connectionInFlight) return;
      const popupUrl = new URL("/__nodepod_bridge__.html", config.parentOrigin);
      popupUrl.searchParams.set("mode", "parent");
      popupUrl.searchParams.set("previewOrigin", location.origin);
      popupUrl.searchParams.set("instanceId", config.instanceId);
      popupUrl.searchParams.set("port", String(config.serverPort));
      const popup = window.open(
        popupUrl.href,
        `nodepod-connect-${config.instanceId}-${config.serverPort}-${Date.now()}`,
      );
      if (!popup) {
        status(
          "Connect this preview",
          "Your browser needs permission to open the temporary connection tab.",
          makeButton("Continue", connect),
        );
        return;
      }
      connectionInFlight = true;
      status("Connecting to Nodepod…", "This usually takes less than a second.");
      let popupReady = false;
      let attached = false;
      let popupReadyTimer = null;
      let statusPort = null;
      const attemptPorts = [];
      let active = true;

      const cleanup = ({ closePopup = true } = {}) => {
        if (!active) return;
        active = false;
        if (popupReadyTimer !== null) clearTimeout(popupReadyTimer);
        popupReadyTimer = null;
        window.removeEventListener("message", onMessage);
        for (const port of attemptPorts.splice(0)) {
          try { port.close(); } catch {}
        }
        try { statusPort?.close(); } catch {}
        statusPort = null;
        if (closePopup) {
          try { popup.close(); } catch {}
        }
        connectionInFlight = false;
        if (cancelConnection === cleanup) cancelConnection = null;
      };

      const showRetry = (title, message) => {
        cleanup();
        status(title, message, makeButton("Try again", connect));
      };

      const onMessage = (event) => {
        if (!active) return;
        if (event.source !== popup || event.origin !== config.parentOrigin) return;
        const data = event.data;
        if (data?.type === "nodepod-parent-bridge-started") {
          status("Connecting to Nodepod…", "Finding the running pod.");
          return;
        }
        if (data?.type === "nodepod-parent-bridge-ready" && !attached) {
          attached = true;
          popupReady = true;
          if (popupReadyTimer !== null) clearTimeout(popupReadyTimer);
          popupReadyTimer = null;
          status("Connecting to Nodepod…", "Finishing the secure preview connection.");
          void getRegistration().then(({ registration }) => {
            if (!active || completed) return;
            const requests = new MessageChannel();
            const relay = new MessageChannel();
            const statusChannel = new MessageChannel();
            attemptPorts.push(
              requests.port1,
              requests.port2,
              relay.port1,
              relay.port2,
              statusChannel.port1,
              statusChannel.port2,
            );
            statusPort = statusChannel.port1;
            const worker = registration.active || navigator.serviceWorker.controller;
            if (!worker) throw new Error("Preview service worker is unavailable");
            statusChannel.port1.onmessage = (statusEvent) => {
              const statusData = statusEvent.data;
              if (statusData?.type === "nodepod-bridge-attached") {
                status("Connecting to Nodepod…", "Opening the preview.");
              } else if (
                statusData?.type === "nodepod-origin-bound" &&
                statusData.instanceId === config.instanceId &&
                statusData.port === config.serverPort &&
                !completed
              ) {
                completed = true;
                cleanup();
                location.reload();
              } else if (statusData?.type === "nodepod-origin-bind-error") {
                showRetry(
                  "Nodepod preview unavailable",
                  statusData.message || "The preview could not be connected.",
                );
              }
            };
            statusChannel.port1.start && statusChannel.port1.start();
            worker.postMessage(
              {
                type: "init",
                port: requests.port1,
                relayPort: relay.port1,
                token: crypto.randomUUID(),
              },
              [requests.port1, relay.port1],
            );
            popup.postMessage(
              {
                type: "nodepod-preview-attach",
                instanceId: config.instanceId,
                serverPort: config.serverPort,
                origin: location.origin,
                requestPort: requests.port2,
                relayPort: relay.port2,
                statusPort: statusChannel.port2,
              },
              config.parentOrigin,
              [requests.port2, relay.port2, statusChannel.port2],
            );
          }).catch((error) => {
            if (!active) return;
            showRetry(
              "Nodepod preview unavailable",
              error instanceof Error ? error.message : "The preview could not be prepared.",
            );
          });
          return;
        }
        if (data?.type === "nodepod-parent-bridge-accepted") {
          status("Connecting to Nodepod…", "Transport attached; binding the preview route.");
        } else if (data?.type === "nodepod-parent-bridge-error") {
          showRetry(
            "Nodepod tab unavailable",
            data.message || "Keep the page running Nodepod open, then reconnect.",
          );
        }
      };
      window.addEventListener("message", onMessage);
      cancelConnection = cleanup;
      popupReadyTimer = setTimeout(() => {
        if (popupReady || completed) return;
        cleanup();
        status(
          "Connect this preview",
          "The browser needs a click to open the one-time connection tab.",
          makeButton("Continue", connect),
        );
      }, 5_000);
    };

    // Make the page actionable immediately while worker setup and the
    // automatic popup handoff run in parallel. If automatic popup permission
    // is unavailable, Continue supplies the required user gesture without a
    // multi-second blank wait first.
    status(
      "Connect this preview",
      "Continue to securely connect this tab to the running pod.",
      makeButton("Continue", connect),
    );
    void getRegistration().catch((error) => {
      if (completed || connectionInFlight) return;
      status(
        "Nodepod preview unavailable",
        error instanceof Error ? error.message : "The preview could not be prepared.",
        makeButton("Try again", connect),
      );
    });
    connect();
  }

  async function bootParentPopup() {
    const previewOrigin = params.get("previewOrigin");
    const instanceId = params.get("instanceId");
    const serverPort = Number(params.get("port"));
    const peer = window.opener;
    if (previewOrigin && peer) {
      try {
        peer.postMessage(
          { type: "nodepod-parent-bridge-started" },
          new URL(previewOrigin).origin,
        );
      } catch {}
    }
    if (!previewOrigin || !instanceId || !Number.isFinite(serverPort) || !peer) {
      throw new Error("Invalid Nodepod parent bridge request");
    }
    let expectedPreviewOrigin;
    try {
      expectedPreviewOrigin = new URL(previewOrigin).origin;
    } catch {
      throw new Error("Invalid Nodepod preview origin");
    }
    status("Connecting preview…", "Locating the running pod transport.");
    if (!("serviceWorker" in navigator)) {
      throw new Error("Service workers are unavailable on the Nodepod host");
    }
    const registration = await navigator.serviceWorker.ready;
    const worker = navigator.serviceWorker.controller || registration.active;
    if (!worker) throw new Error("The Nodepod host worker is unavailable");

    navigator.serviceWorker.addEventListener("message", (event) => {
      const data = event.data;
      if (data?.type === "nodepod-parent-bridge-accepted") {
        peer.postMessage(data, expectedPreviewOrigin);
        window.close();
      } else if (data?.type === "nodepod-parent-bridge-error") {
        peer.postMessage(data, expectedPreviewOrigin);
      }
    });

    window.addEventListener("message", (event) => {
      const data = event.data;
      if (
        event.source !== peer ||
        event.origin !== expectedPreviewOrigin ||
        !data ||
        data.type !== "nodepod-preview-attach" ||
        data.instanceId !== instanceId ||
        data.serverPort !== serverPort ||
        !data.requestPort ||
        !data.relayPort ||
        !data.statusPort
      ) {
        return;
      }
      worker.postMessage(
        {
          type: "attach-preview-bridge",
          instanceId,
          serverPort,
          origin: expectedPreviewOrigin,
          requestPort: data.requestPort,
          relayPort: data.relayPort,
          statusPort: data.statusPort,
        },
        [data.requestPort, data.relayPort, data.statusPort],
      );
    });
    peer.postMessage({ type: "nodepod-parent-bridge-ready" }, expectedPreviewOrigin);
  }

  const task = mode === "parent"
    ? bootParentPopup()
    : window.parent === window
      ? bootTopLevel()
      : bootEmbedded();
  task.catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (window.parent !== window) {
      const parentOrigin = params.get("parentOrigin");
      const bridgeId = params.get("bridgeId");
      if (parentOrigin && bridgeId) {
        window.parent.postMessage(
          { type: "nodepod-bridge-error", bridgeId, message },
          parentOrigin,
        );
      }
      return;
    }
    status("Nodepod preview error", message);
  });
})();
