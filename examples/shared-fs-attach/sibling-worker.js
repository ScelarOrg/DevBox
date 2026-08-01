// sibling worker for the attach example. not spawned by nodepod, just a
// plain new Worker() on the page. it uses Nodepod.attachFS(sab) to read
// straight from the same SharedArrayBuffer the main thread's nodepod owns.

import { Nodepod } from "/dist/index.mjs";

let fs = null;

function send(text, cls) {
  self.postMessage({ type: "log", text, cls });
}

// silent promise rejections make attach failures look like the worker
// just went quiet, surface them instead
self.addEventListener("unhandledrejection", (ev) => {
  send("unhandledrejection: " + (ev.reason?.stack || ev.reason), "fail");
});

self.addEventListener("message", async (ev) => {
  const msg = ev.data;
  try {
    if (msg.type === "attach") {
      send("received SharedArrayBuffer, calling Nodepod.attachFS()");
      fs = Nodepod.attachFS(msg.buffer);
      send("attached. version=" + fs.version);

      send("fs.exists('/hello.txt') => " + (await fs.exists("/hello.txt")));

      const greeting = await fs.readFile("/hello.txt", "utf8");
      send("fs.readFile('/hello.txt', 'utf8') => " + JSON.stringify(greeting));

      const bytes = await fs.readFile("/proj/src/index.js");
      send("fs.readFile('/proj/src/index.js') => Uint8Array(" + bytes.byteLength + ")");

      const stat = await fs.stat("/proj/package.json");
      send("fs.stat('/proj/package.json') => " + JSON.stringify(stat));

      const entries = await fs.readdir("/proj/src");
      send("fs.readdir('/proj/src') => " + JSON.stringify(entries.sort()));

      try {
        await fs.readFile("/nope.txt");
      } catch (e) {
        send("readFile missing => " + e.code + ": " + e.message, "dim");
      }

      send("current version (pre-write) = " + fs.version);
    }

    if (msg.type === "reread") {
      const v = fs.version;
      const exists = await fs.exists(msg.path);
      if (exists) {
        const text = await fs.readFile(msg.path, "utf8");
        send("after main wrote " + msg.path + " (version=" + v + "): " + JSON.stringify(text), "pass");
      } else {
        send("expected to see " + msg.path + " but it was missing", "fail");
      }
    }

    if (msg.type === "try-write") {
      try {
        await fs.writeFile("/attempt.txt", "nope");
        send("writeFile returned without throwing, UNEXPECTED", "fail");
      } catch (e) {
        send(
          "fs.writeFile threw " + e.code + " as expected (client is read-only)",
          "pass",
        );
      }
    }
  } catch (e) {
    send("handler error: " + (e?.stack || e), "fail");
  }
});
