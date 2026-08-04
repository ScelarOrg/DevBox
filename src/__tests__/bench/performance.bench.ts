import { bench, describe } from "vitest";
import { MemoryVolume } from "../../memory-volume";
import { VFSBridge } from "../../threading/vfs-bridge";
import { patchBuiltinImports } from "../../module-transformer";
import { containsJsx } from "../../threading/jsx-detection";
import { taskId } from "../../threading/offload";

// Keep large fixture benchmarks representative without making the whole
// benchmark command spend a full default second on each expensive case.
const oneIteration = { time: 100, iterations: 1 };

describe("VFS lookup performance", () => {
  let volume: MemoryVolume | undefined;
  const getVolume = () => {
    if (volume) return volume;
    volume = new MemoryVolume();
    volume.mkdirSync("/project", { recursive: true });
    for (let i = 0; i < 25000; i++) volume.writeFileSync(`/project/file-${i}.js`, "export const value = 1;");
    return volume;
  };

  bench("100,000 statSync calls", () => {
    const current = getVolume();
    for (let i = 0; i < 100000; i++) current.statSync(`/project/file-${(i * 97) % 25000}.js`);
  }, oneIteration);

  bench("100,000 existsSync calls", () => {
    const current = getVolume();
    for (let i = 0; i < 100000; i++) current.existsSync(`/project/file-${(i * 193) % 25000}.js`);
  }, oneIteration);
});

describe("lazy hardlink eviction", () => {
  let fixture: { source: MemoryVolume; snapshot: ReturnType<VFSBridge["createSnapshot"]> } | undefined;
  const getFixture = () => {
    if (fixture) return fixture;
    let source = new MemoryVolume();
    source.mkdirSync("/node_modules/pkg", { recursive: true });
    for (let i = 0; i < 200; i++) {
      source.writeFileSync(`/node_modules/pkg/file-${i}.bin`, new Uint8Array(4096).fill(i));
    }
    fixture = { source, snapshot: new VFSBridge(source).createSnapshot({ excludeDirNames: ["node_modules"] }) };
    return fixture;
  };

  bench("lazy reads with hardlink eviction", () => {
    const { source, snapshot } = getFixture();
    const volume = MemoryVolume.fromBinarySnapshot(snapshot);
    volume.setMissHandler({
      readFile: (path) => { try { return source.readFileSync(path); } catch { return null; } },
      readdir: (path) => source.readdirSync(path).map((name) => {
        const stat = source.statSync(path === "/" ? `/${name}` : `${path}/${name}`);
        return { name, isDirectory: stat.isDirectory(), size: stat.size };
      }),
      stat: (path) => {
        try {
          const stat = source.statSync(path);
          return { isFile: stat.isFile(), isDirectory: stat.isDirectory(), size: stat.size };
        } catch { return null; }
      },
    }, snapshot.lazyDirNames!);
    volume.readdirSync("/node_modules/pkg");
    volume.linkSync("/node_modules/pkg/file-0.bin", "/node_modules/pkg/local-link.bin");
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < 200; i++) volume.readFileSync(`/node_modules/pkg/file-${i}.bin`);
      volume.readFileSync("/node_modules/pkg/local-link.bin");
    }
  }, oneIteration);
});

describe("binary snapshot mounting", () => {
  let fixture: { snapshot10k: ReturnType<VFSBridge["createSnapshot"]>; snapshot50k: ReturnType<VFSBridge["createSnapshot"]> } | undefined;
  const getFixture = () => {
    if (fixture) return fixture;
    const make = (count: number) => {
      const volume = new MemoryVolume();
      volume.mkdirSync("/data", { recursive: true });
      for (let i = 0; i < count; i++) volume.writeFileSync(`/data/file-${i}.bin`, new Uint8Array([i & 255]));
      return new VFSBridge(volume).createSnapshot();
    };
    fixture = { snapshot10k: make(10000), snapshot50k: make(50000) };
    return fixture;
  };

  bench("mountBinarySnapshot - 10,000 entries", () => {
    MemoryVolume.fromBinarySnapshot(getFixture().snapshot10k);
  }, oneIteration);
  bench("mountBinarySnapshot - 50,000 entries", () => {
    MemoryVolume.fromBinarySnapshot(getFixture().snapshot50k);
  }, oneIteration);
});

describe("snapshot creation and transform helpers", () => {
  let volume: MemoryVolume | undefined;
  const getVolume = () => {
    if (volume) return volume;
    volume = new MemoryVolume();
    volume.mkdirSync("/data", { recursive: true });
    for (let i = 0; i < 10000; i++) volume.writeFileSync(`/data/file-${i}.bin`, new Uint8Array([i & 255]));
    return volume;
  };

  bench("snapshot creation - 10,000 entries", () => {
    new VFSBridge(getVolume()).createSnapshot();
  }, oneIteration);

  bench("builtin-import patching", () => {
    patchBuiltinImports('const x = import("fs"); const y = import("node:path");');
  }, oneIteration);

  bench("JSX detection", () => {
    containsJsx("const view = <Component prop={value} />;");
  }, oneIteration);

  bench("numeric task IDs", () => {
    for (let i = 0; i < 10000; i++) taskId();
  }, oneIteration);
});
