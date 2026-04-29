import type { Nodepod } from '@scelar/nodepod';

type NodepodInstance = Awaited<ReturnType<typeof Nodepod.boot>>;

export interface TestApi {
  ready: boolean;
  pod: NodepodInstance | null;
  boot(): Promise<boolean>;
  gitClone(url: string, dir?: string): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  listFiles(dir: string): Promise<string[]>;
  readFile(path: string): Promise<string | null>;
  fileExists(path: string): Promise<boolean>;
}

export function createTestApi(
  bootFn: () => Promise<NodepodInstance>,
  log: (msg: string) => void,
): TestApi {
  const api: TestApi = {
    ready: false,
    pod: null,

    async boot() {
      log('[test] Booting Nodepod...');
      api.pod = await bootFn();
      api.ready = true;
      log('[test] Nodepod ready');
      return true;
    },

    async gitClone(url: string, dir?: string) {
      if (!api.pod) throw new Error('Nodepod not booted');

      const targetDir = dir || '/workspace/' + (url.split('/').pop()?.replace('.git', '') || 'repo');
      log(`[test] git clone ${url} → ${targetDir}`);

      const proc = await api.pod.spawn('git', ['clone', url, targetDir]);

      let stdout = '';
      let stderr = '';
      proc.on('output', (text: string) => { stdout += text; log('[stdout] ' + text); });
      proc.on('error', (text: string) => { stderr += text; log('[stderr] ' + text); });

      const result = await proc.completion;
      log(`[test] clone exit code: ${result.exitCode}`);
      return { exitCode: result.exitCode, stdout: result.stdout || stdout, stderr: result.stderr || stderr };
    },

    async listFiles(dir: string) {
      if (!api.pod) throw new Error('Nodepod not booted');
      try { return await api.pod.fs.readdir(dir) as string[]; } catch { return []; }
    },

    async readFile(path: string) {
      if (!api.pod) throw new Error('Nodepod not booted');
      try { return await api.pod.fs.readFile(path, 'utf8') as string; } catch { return null; }
    },

    async fileExists(path: string) {
      if (!api.pod) throw new Error('Nodepod not booted');
      try { await api.pod.fs.stat(path); return true; } catch { return false; }
    },
  };

  return api;
}