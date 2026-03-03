import { describe, bench, beforeEach } from "vitest";
import { MemoryVolume } from "../../memory-volume";

function populatedVolume(fileCount: number, fileSize: number): MemoryVolume {
  const vol = new MemoryVolume();
  vol.mkdirSync("/project", { recursive: true });
  const content = "x".repeat(fileSize);
  for (let i = 0; i < fileCount; i++) {
    vol.writeFileSync(`/project/file-${i}.txt`, content);
  }
  return vol;
}

describe("MemoryVolume - write", () => {
  let vol: MemoryVolume;
  beforeEach(() => { vol = new MemoryVolume(); });

  bench("writeFileSync - 100 bytes", () => {
    vol.writeFileSync("/test.txt", "a".repeat(100));
  });

  bench("writeFileSync - 10KB", () => {
    vol.writeFileSync("/test.txt", "a".repeat(10_000));
  });

  bench("writeFileSync - 1MB", () => {
    vol.writeFileSync("/test.txt", "a".repeat(1_000_000));
  });

  bench("writeFileSync - binary Uint8Array 10KB", () => {
    vol.writeFileSync("/test.bin", new Uint8Array(10_000));
  });

  bench("writeFileSync - deep path (6 levels)", () => {
    vol.writeFileSync("/a/b/c/d/e/f/file.txt", "data");
  });
});

describe("MemoryVolume - read", () => {
  let vol: MemoryVolume;
  beforeEach(() => { vol = populatedVolume(100, 1000); });

  bench("readFileSync - utf8", () => {
    vol.readFileSync("/project/file-50.txt", "utf8");
  });

  bench("readFileSync - binary", () => {
    vol.readFileSync("/project/file-50.txt");
  });

  bench("existsSync - hit", () => {
    vol.existsSync("/project/file-50.txt");
  });

  bench("existsSync - miss", () => {
    vol.existsSync("/project/nonexistent.txt");
  });

  bench("statSync", () => {
    vol.statSync("/project/file-50.txt");
  });
});

describe("MemoryVolume - directories", () => {
  let vol: MemoryVolume;
  beforeEach(() => { vol = populatedVolume(200, 100); });

  bench("readdirSync - 200 entries", () => {
    vol.readdirSync("/project");
  });

  bench("mkdirSync recursive - 5 levels", () => {
    vol.mkdirSync("/new/a/b/c/d", { recursive: true });
  });
});

describe("MemoryVolume - snapshot", () => {
  bench("toSnapshot - 100 files", () => {
    const vol = populatedVolume(100, 500);
    vol.toSnapshot();
  });

  bench("fromSnapshot - 100 files", () => {
    const vol = populatedVolume(100, 500);
    const snap = vol.toSnapshot();
    MemoryVolume.fromSnapshot(snap);
  });

  bench("toSnapshot - 500 files", () => {
    const vol = populatedVolume(500, 200);
    vol.toSnapshot();
  });

  bench("fromSnapshot - 500 files", () => {
    const vol = populatedVolume(500, 200);
    const snap = vol.toSnapshot();
    MemoryVolume.fromSnapshot(snap);
  });
});

describe("MemoryVolume - mixed workload", () => {
  bench("create 50 files + read all + delete all", () => {
    const vol = new MemoryVolume();
    vol.mkdirSync("/work", { recursive: true });
    for (let i = 0; i < 50; i++) {
      vol.writeFileSync(`/work/f${i}.js`, `const x = ${i};`);
    }
    for (let i = 0; i < 50; i++) {
      vol.readFileSync(`/work/f${i}.js`, "utf8");
    }
    for (let i = 0; i < 50; i++) {
      vol.unlinkSync(`/work/f${i}.js`);
    }
  });
});
