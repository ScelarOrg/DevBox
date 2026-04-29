import { Nodepod } from '@scelar/nodepod';
import { createTestApi } from '../utils/test-api';

const output = document.getElementById('output')!;
const log = (msg: string) => { output.textContent += msg + '\n'; console.log(msg); };

(window as any).__nodepodTest = createTestApi(
  () => Nodepod.boot({
    workdir: '/workspace',
    git: 'api',
    gitApiBase: 'http://localhost:4569/api',
    gitRawBase: 'http://localhost:4569/raw',
    serviceWorker: false,
    watermark: false,
  }),
  log,
);

log('[test] fixture loaded (API mode)');