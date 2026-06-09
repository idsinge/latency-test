# Build Output

`npm run build:component` produces the modern build in `dist/`:

| File | Purpose |
|------|---------|
| `latency-test.esm.js` | ESM module — use with `<script type="module">` or `import` in bundlers |
| `latency-test.iife.js` | IIFE bundle — use with plain `<script>` tag (no module support needed) |
| `index.d.ts` | TypeScript declarations — types for `LatencyTestElement`, events, and payloads |
| `*.map` | Source maps — automatically loaded by browser devtools |

`npm run build:component:legacy` produces a transpiled build for older browsers (Safari 14 / Chrome 78 — any browser with MediaRecorder support):

| File | Purpose |
|------|---------|
| `latency-test.legacy.esm.js` | Legacy ESM — private fields, optional chaining, and nullish coalescing lowered |
| `latency-test.legacy.iife.js` | Legacy IIFE — same lowering; used by the demo page |

`npm run build:component:all` runs both builds in sequence and is used by CI and `prepublishOnly`.

All files are **minified by default**. For development (unminified, easier debugging):

```bash
npm run build:component:dev
```

Stale files from previous build tools (e.g. Parcel leftovers) are cleaned automatically on every build.
