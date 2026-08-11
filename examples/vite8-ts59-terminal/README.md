# Vite 8 + TypeScript 5.9 terminal demo

This example mounts a complete Vite 8.2.0 and TypeScript 5.9.3 project at
`/project` inside Nodepod. It installs the project dependencies, creates an
interactive xterm.js terminal, types `pnpm run dev`, and opens the Vite preview
when port 5173 is ready.

From the repository root:

```bash
pnpm run build:publish
node examples/serve.js
```

Open <http://localhost:3333/examples/vite8-ts59-terminal/>.

After the automatic command starts Vite, the terminal remains interactive. Use
`Ctrl+C` before entering another command.

`pnpm run dev` is a long-running command, so it does not return to the prompt.
Use Nodepod's `onServerReady(port, url)` callback to detect the bound port and
point a preview iframe at `url`; waiting for the command to complete will wait
forever while the dev server is healthy.
