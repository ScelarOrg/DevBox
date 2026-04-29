/**
 * Mock GitHub API server for testing git clone in API mode.
 * Serves fake repo metadata, tree, and file contents.
 */
import http from 'node:http';

const MOCK_OWNER = 'test-org';
const MOCK_REPO = 'test-repo';

const files: Record<string, string> = {
  'package.json': JSON.stringify({ name: 'test-repo', version: '1.0.0', private: true }, null, 2),
  'README.md': '# Test Repo\n\nThis is a mock repository for testing git clone API mode.',
  'src/index.ts': 'export const hello = "world";\n',
};

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url || '';

  // GET /api/repos/:owner/:repo
  if (url === `/api/repos/${MOCK_OWNER}/${MOCK_REPO}`) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      default_branch: 'main',
      name: MOCK_REPO,
      full_name: `${MOCK_OWNER}/${MOCK_REPO}`,
    }));
    return;
  }

  // GET /api/repos/:owner/:repo/git/trees/main?recursive=1
  if (url.startsWith(`/api/repos/${MOCK_OWNER}/${MOCK_REPO}/git/trees/`)) {
    const tree = Object.keys(files).map(path => ({
      path,
      type: 'blob',
      sha: 'abc123',
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tree }));
    return;
  }

  // GET /raw/:owner/:repo/:branch/:path — raw file content
  const rawMatch = url.match(/^\/raw\/[^/]+\/[^/]+\/[^/]+\/(.+)$/);
  if (rawMatch) {
    const filePath = rawMatch[1];
    if (files[filePath]) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(files[filePath]);
      return;
    }
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Not Found' }));
}

export function startMockGithub(port: number): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer(handleRequest);
    server.listen(port, () => resolve(server));
  });
}