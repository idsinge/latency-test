# Build Output

`npm run build:component` produces these files in `dist/`:

| File | Purpose |
|------|---------|
| `latency-test.esm.js` | ESM module — use with `<script type="module">` or `import` in bundlers |
| `latency-test.iife.js` | IIFE bundle — use with plain `<script>` tag (no module support needed) |
| `index.d.ts` | TypeScript declarations — types for `LatencyTestElement`, events, and payloads |
| `*.map` | Source maps — automatically loaded by browser devtools |

Both files are **minified by default**. For development (unminified, easier debugging):

```bash
npm run build:component:dev
```

Stale files from previous build tools (e.g. Parcel leftovers) are cleaned automatically on every build.
