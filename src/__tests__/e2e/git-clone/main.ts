import { Nodepod } from '@scelar/nodepod';
import { createTestApi } from '../utils/test-api';

const output = document.getElementById('output')!;
const log = (msg: string) => { output.textContent += msg + '\n'; console.log(msg); };

(window as any).__nodepodTest = createTestApi(
  () => Nodepod.boot({
    workdir: '/workspace',
    git: 'native',
    gitCorsProxy: `${window.location.origin}/__nodepod_git_proxy__`,
    serviceWorker: false,
    watermark: false,
  }),
  log,
);

log('[test] fixture loaded (native mode)');