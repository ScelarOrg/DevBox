// tests for RequestProxy multi-tenant behavior: N Nodepods sharing one proxy
// (and one browser SW) without clobbering each other.
//
// these run in Node so there's no real SW. focus is on the main-thread
// state machine: attach/detach, per-instance isolation, routing by
// instanceId, URL shape, legacy single-tenant back-compat

import { describe, it, expect, beforeEach } from "vitest";
import { EventEmitter } from "events";
import {
  RequestProxy,
  DEFAULT_INSTANCE,
  type IVirtualServer,
} from "../../request-proxy";

// fake process manager, just enough for attach() and the _handleWs* paths to
// not blow up. lets us assert without a real worker pool
class FakeProcessManager extends EventEmitter {
  public wsUpgrades: Array<[number, string, string, any]> = [];
  public wsData: Array<[number, string, number[]]> = [];
  public wsCloses: Array<[number, string, number]> = [];
  dispatchWsUpgrade(port: number, uid: string, path: string, headers: any): number {
    this.wsUpgrades.push([port, uid, path, headers]);
    return 42; // pretend a worker pid accepted it
  }
  dispatchWsData(pid: number, uid: string, frame: number[]): void {
    this.wsData.push([pid, uid, frame]);
  }
  dispatchWsClose(pid: number, uid: string, code: number): void {
    this.wsCloses.push([pid, uid, code]);
  }
}

// minimal virtual server that echoes the request. used to prove the proxy
// picked the right instance's server by checking the label in the response
function makeServer(label: string): IVirtualServer {
  return {
    listening: true,
    address: () => ({ port: 0, address: "0.0.0.0", family: "IPv4" }),
    async dispatchRequest(method, url) {
      return {
        statusCode: 200,
        statusMessage: "OK",
        headers: { "content-type": "text/plain", "x-server": label },
        body: Buffer.from(`${label}:${method} ${url}`),
      };
    },
  };
}

describe("RequestProxy multi-instance", () => {
  let proxy: RequestProxy;

  beforeEach(() => {
    proxy = new RequestProxy({ baseUrl: "http://test.local" });
  });

  describe("attach / detach", () => {
    it("attaches two instances independently", () => {
      const pm1 = new FakeProcessManager();
      const pm2 = new FakeProcessManager();
      proxy.attach("pod-aaa", pm1);
      proxy.attach("pod-bbb", pm2);
      // Both should accept registrations without clobbering each other
      proxy.register("pod-aaa", makeServer("A"), 3000);
      proxy.register("pod-bbb", makeServer("B"), 3000);
      expect(proxy.activePorts("pod-aaa")).toEqual([3000]);
      expect(proxy.activePorts("pod-bbb")).toEqual([3000]);
    });

    it("detach() releases an instance's ports without touching siblings", () => {
      const pm1 = new FakeProcessManager();
      const pm2 = new FakeProcessManager();
      proxy.attach("pod-aaa", pm1);
      proxy.attach("pod-bbb", pm2);
      proxy.register("pod-aaa", makeServer("A"), 3000);
      proxy.register("pod-bbb", makeServer("B"), 3000);

      proxy.detach("pod-aaa");
      expect(proxy.activePorts("pod-aaa")).toEqual([]);
      expect(proxy.activePorts("pod-bbb")).toEqual([3000]);
    });

    it("detach() is safe to call on an unknown instance", () => {
      expect(() => proxy.detach("nonexistent")).not.toThrow();
    });

    it("rejects invalid instanceIds", () => {
      const pm = new FakeProcessManager();
      // all-digits would collide with port in URL parsing
      expect(() => proxy.attach("12345", pm)).toThrow(/invalid instanceId/);
      // empty
      expect(() => proxy.attach("", pm)).toThrow(/invalid instanceId/);
      // has a slash
      expect(() => proxy.attach("bad/id", pm)).toThrow(/invalid instanceId/);
    });

    it("DEFAULT_INSTANCE is accepted even though it's a reserved short id", () => {
      const pm = new FakeProcessManager();
      expect(() => proxy.attach(DEFAULT_INSTANCE, pm)).not.toThrow();
    });

    it("re-attach rewires the process manager and removes the old ws-frame listener", () => {
      const pm1 = new FakeProcessManager();
      const pm2 = new FakeProcessManager();
      proxy.attach("pod-x", pm1);
      expect(pm1.listenerCount("ws-frame")).toBe(1);
      proxy.attach("pod-x", pm2);
      expect(pm1.listenerCount("ws-frame")).toBe(0);
      expect(pm2.listenerCount("ws-frame")).toBe(1);
    });
  });

  describe("server registry isolation", () => {
    it("two instances can bind the same port without collision", async () => {
      proxy.attach("pod-aaa", new FakeProcessManager());
      proxy.attach("pod-bbb", new FakeProcessManager());
      proxy.register("pod-aaa", makeServer("A"), 3000);
      proxy.register("pod-bbb", makeServer("B"), 3000);

      const respA = await proxy.handleRequest("pod-aaa", 3000, "GET", "/", {});
      const respB = await proxy.handleRequest("pod-bbb", 3000, "GET", "/", {});
      expect(respA.headers["x-server"]).toBe("A");
      expect(respB.headers["x-server"]).toBe("B");
    });

    it("handleRequest to an unknown instance returns 503", async () => {
      const resp = await proxy.handleRequest("pod-nope", 3000, "GET", "/", {});
      expect(resp.statusCode).toBe(503);
    });

    it("unregister on one instance doesn't remove the other's entry", () => {
      proxy.attach("pod-aaa", new FakeProcessManager());
      proxy.attach("pod-bbb", new FakeProcessManager());
      proxy.register("pod-aaa", makeServer("A"), 3000);
      proxy.register("pod-bbb", makeServer("B"), 3000);

      proxy.unregister("pod-aaa", 3000);
      expect(proxy.activePorts("pod-aaa")).toEqual([]);
      expect(proxy.activePorts("pod-bbb")).toEqual([3000]);
    });
  });

  describe("URL shape", () => {
    it("serverUrl includes the instanceId segment", () => {
      expect(proxy.serverUrl("pod-aaa", 3000)).toBe(
        "http://test.local/__virtual__/pod-aaa/3000",
      );
    });

    it("legacy serverUrl(port) routes to DEFAULT_INSTANCE", () => {
      expect(proxy.serverUrl(3000)).toBe(
        `http://test.local/__virtual__/${DEFAULT_INSTANCE}/3000`,
      );
    });
  });

  describe("createFetchHandler URL routing", () => {
    it("parses new-shape /__virtual__/{instanceId}/{port}/{path}", async () => {
      proxy.attach("pod-aaa", new FakeProcessManager());
      proxy.register("pod-aaa", makeServer("A"), 3000);
      const handler = proxy.createFetchHandler();
      const resp = await handler(
        new Request("http://test.local/__virtual__/pod-aaa/3000/foo"),
      );
      expect(resp.status).toBe(200);
      expect(resp.headers.get("x-server")).toBe("A");
      expect(await resp.text()).toBe("A:GET /foo");
    });

    it("parses legacy /__virtual__/{port}/{path} as DEFAULT_INSTANCE", async () => {
      proxy.attach(DEFAULT_INSTANCE, new FakeProcessManager());
      proxy.register(DEFAULT_INSTANCE, makeServer("D"), 3000);
      const handler = proxy.createFetchHandler();
      const resp = await handler(
        new Request("http://test.local/__virtual__/3000/foo"),
      );
      expect(resp.status).toBe(200);
      expect(resp.headers.get("x-server")).toBe("D");
    });
  });

  describe("legacy single-tenant API", () => {
    it("setProcessManager + register(server, port) routes to DEFAULT_INSTANCE", async () => {
      const pm = new FakeProcessManager();
      proxy.setProcessManager(pm);
      proxy.register(makeServer("L"), 4000);
      expect(proxy.activePorts(DEFAULT_INSTANCE)).toEqual([4000]);
      const resp = await proxy.handleRequest(4000, "GET", "/", {});
      expect(resp.statusCode).toBe(200);
      expect(resp.headers["x-server"]).toBe("L");
    });

    it("unregister(port) with no instanceId routes to DEFAULT_INSTANCE", () => {
      proxy.setProcessManager(new FakeProcessManager());
      proxy.register(makeServer("L"), 4000);
      proxy.unregister(4000);
      expect(proxy.activePorts(DEFAULT_INSTANCE)).toEqual([]);
    });

    it("activePorts() with no arg returns the union across all instances", () => {
      proxy.attach("pod-aaa", new FakeProcessManager());
      proxy.attach("pod-bbb", new FakeProcessManager());
      proxy.register("pod-aaa", makeServer("A"), 3000);
      proxy.register("pod-bbb", makeServer("B"), 4000);
      expect(proxy.activePorts().sort()).toEqual([3000, 4000]);
    });
  });

  describe("server-ready events", () => {
    it("emits the instance-scoped URL on server-ready", () => {
      proxy.attach("pod-aaa", new FakeProcessManager());
      const seen: Array<[number, string]> = [];
      proxy.on("server-ready", (port: number, url: string) => {
        seen.push([port, url]);
      });
      proxy.register("pod-aaa", makeServer("A"), 3000);
      expect(seen).toEqual([
        [3000, "http://test.local/__virtual__/pod-aaa/3000"],
      ]);
    });

    it("fires onServerReady callback with instance-scoped URL", () => {
      const seen: string[] = [];
      const p = new RequestProxy({
        baseUrl: "http://test.local",
        onServerReady: (_port, url) => seen.push(url),
      });
      p.attach("pod-aaa", new FakeProcessManager());
      p.register("pod-aaa", makeServer("A"), 3000);
      expect(seen).toEqual(["http://test.local/__virtual__/pod-aaa/3000"]);
    });
  });

  describe("initServiceWorker memoization", () => {
    it("concurrent callers share one in-flight promise", async () => {
      // fire 7 concurrent initServiceWorker() calls. the old bug was 6 of 7
      // getting stuck in Chromium's SW-registration queue because every boot
      // raced through getRegistrations/unregister/register with no guard.
      // fix memoizes the in-flight promise. in Node there's no
      // navigator.serviceWorker so the inner promise rejects, but before the
      // rejection propagates all 7 callers must see the same promise object
      const results = [
        proxy.initServiceWorker({ skipPreflight: true }),
        proxy.initServiceWorker({ skipPreflight: true }),
        proxy.initServiceWorker({ skipPreflight: true }),
        proxy.initServiceWorker({ skipPreflight: true }),
        proxy.initServiceWorker({ skipPreflight: true }),
        proxy.initServiceWorker({ skipPreflight: true }),
        proxy.initServiceWorker({ skipPreflight: true }),
      ];
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toBe(results[0]);
      }
      // swallow the expected rejection (no navigator.serviceWorker in Node)
      await results[0].catch(() => {});
    });

    it("allows retry after a failed init (promise is cleared on rejection)", async () => {
      const p1 = proxy.initServiceWorker({ skipPreflight: true });
      await p1.catch(() => {});
      // should get a fresh promise with a different identity
      const p2 = proxy.initServiceWorker({ skipPreflight: true });
      expect(p2).not.toBe(p1);
      await p2.catch(() => {});
    });
  });
});
