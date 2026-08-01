import { describe, bench } from "vitest";
import { esmToCjs, hasTopLevelAwait, stripTopLevelAwait } from "../../syntax-transforms";

const SIMPLE_ESM = `
import { readFileSync } from 'fs';
import path from 'path';
export const data = readFileSync(path.join(__dirname, 'data.json'), 'utf8');
export default data;
`;

const COMPLEX_ESM = `
import express from 'express';
import { Router } from 'express';
import * as http from 'http';
import path, { join, resolve, dirname } from 'path';
import { readFileSync, writeFileSync } from 'fs';

export const app = express();
const router = Router();

router.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', router);

export function startServer(port) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(port, () => resolve(server));
  });
}

export default app;
`;

const LARGE_ESM =
  Array.from(
    { length: 20 },
    (_, i) => `import mod${i} from './mod${i}';\nexport const val${i} = mod${i}.process();`,
  ).join("\n") + "\nexport default { total: 20 };";

const TLA_SOURCE = `
import fs from 'fs';
const data = await fetch('/api');
const json = await data.json();
export default json;
`;

const PLAIN_CJS = 'const x = require("fs"); module.exports = x;';

describe("esmToCjs", () => {
  bench("simple ESM (2 imports, 2 exports)", () => {
    esmToCjs(SIMPLE_ESM);
  });

  bench("complex ESM (5 imports, mixed exports)", () => {
    esmToCjs(COMPLEX_ESM);
  });

  bench("large ESM (20 imports, 20 exports)", () => {
    esmToCjs(LARGE_ESM);
  });

  bench("passthrough - plain CJS", () => {
    esmToCjs(PLAIN_CJS);
  });
});

describe("Top-level await", () => {
  bench("hasTopLevelAwait - with TLA", () => {
    hasTopLevelAwait(TLA_SOURCE);
  });

  bench("hasTopLevelAwait - without TLA", () => {
    hasTopLevelAwait(COMPLEX_ESM);
  });

  bench("stripTopLevelAwait", () => {
    stripTopLevelAwait(TLA_SOURCE);
  });
});
