# electron-nozzle

Electron/nozzle texture integration feasibility spike.

This repository is deliberately separate from `node-nozzle`. `node-nozzle` is a helper/control package; this repo tests Electron renderer texture constraints.

## Pinned versions

| Component | Version / SHA |
| --- | --- |
| Electron | `42.4.0` |
| Node for CI/package checks | `22.13.1` |
| nozzle | not vendored in this spike; #164 `node-nozzle` used nozzle `a8efca3c847c39b76057a8e77f94b34146cc9125` |

## What this proves

- A minimal Electron app can create deterministic non-square renderer patterns (`320x240`, `641x479`).
- Renderer WebGL texture contents can be validated only through CPU readback (`gl.readPixels`) in this public-API sample.
- Node-level and renderer-level CPU-copy fallback samples validate explicit `rgba8_unorm` byte payloads, dimensions, no y-flip sentinel semantics, R/G/B byte order, and alpha behavior. Canvas2D is not used as the straight-RGBA oracle because it may premultiply alpha. Renderer reload and app quit cleanup are only proven when `npm run smoke:electron` reaches the renderer and exits cleanly.

## Hard boundaries

- No npm package has been published.
- No zero-copy/GPU interop support is claimed.
- No private Chromium/Electron hook is used as support evidence.
- The CPU-copy fallback sample is explicitly not a real nozzle frame sender/receiver because #164 `node-nozzle` does not expose CPU frame read/write APIs.

## Support / result table

| Direction | Result | Cost class | Evidence |
| --- | --- | --- | --- |
| Electron renderer texture -> nozzle GPU direct | `FAIL_BLOCKED_PUBLIC_API_NO_TEXTURE_HANDLE` | unsupported | `app/renderer.js` WebGLTexture probe + `docs/gpu-public-api-blockers.md` |
| nozzle -> Electron renderer GPU direct | `FAIL_BLOCKED_PUBLIC_API_NO_TEXTURE_IMPORT_HANDLE` | unsupported | `docs/gpu-public-api-blockers.md` |
| Electron renderer content -> CPU payload sample | `PASS` in Node deterministic tests and local runtime smoke | CPU-copy | `examples/cpu-copy-fallback.js`, `npm test`, `npm run smoke:electron` |
| real nozzle CPU frame -> Electron renderer | `MISSING_NODE_FRAME_API` | unknown / future CPU-copy | blocked until a Node/nozzle CPU frame API exists |

## Commands

```bash
npm install
npm test
npm run smoke:electron
npm run check:package
```

CI intentionally runs deterministic Node/package checks only. `npm run smoke:electron` remains a runtime probe because headless Electron availability is host-dependent and a timeout must not be hidden as green CI evidence.

## Smoke behavior

`npm run smoke:electron` is intended to print one `ELECTRON_NOZZLE_SMOKE_RESULT=...` JSON line. On the current local macOS host the runtime smoke reaches the renderer twice, proves reload/app quit cleanup, and exits with `status":"pass"`.

- Electron/Node/Chrome versions;
- platform/arch;
- `app.getGPUFeatureStatus()` when Electron reaches app readiness;
- two renderer reports before and after reload when the Electron runtime reaches the renderer;
- PASS/FAIL/MISSING labels for both directions.
