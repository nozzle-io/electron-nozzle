# Electron public GPU API blocker notes

This spike intentionally uses public Electron/Chromium renderer APIs only.

## Renderer texture -> nozzle

The sample creates WebGL textures in the renderer and verifies that the texture can be read back with `gl.readPixels`. The only stable data path exposed to JavaScript is pixel readback; the `WebGLTexture` object is opaque and does not expose an IOSurface ID, DMA-BUF file descriptor, D3D handle, Metal texture, GL name, or any other native share handle that nozzle could import.

Result: `FAIL_BLOCKED_PUBLIC_API_NO_TEXTURE_HANDLE` for GPU-direct Electron renderer texture -> nozzle.

## nozzle -> renderer texture

Stable renderer JavaScript APIs do not expose a way to import an external IOSurface, DMA-BUF, D3D shared handle, Metal texture, or GL texture name as a WebGL/WebGPU texture. A future implementation may require a Chromium/Electron native module, custom protocol, WebCodecs path, or private/experimental hooks, but those are not support claims in this issue.

Result: `FAIL_BLOCKED_PUBLIC_API_NO_TEXTURE_IMPORT_HANDLE` for GPU-direct nozzle -> Electron renderer.

## CPU-copy fallback

The runnable fallback sample produces deterministic `rgba8_unorm` CPU pixel payloads for `320x240` and `641x479`, validates no y-flip through sentinel checks, preserves R/G/B byte order, and covers alpha values. It intentionally avoids Canvas2D as the correctness oracle because Canvas2D can premultiply alpha and is not a straight-RGBA transport proof. It does not publish or receive real nozzle frames because the initial `node-nozzle` package from #164 does not expose CPU frame read/write APIs.

Result: renderer CPU payload sample is `PASS`; real nozzle CPU frame runtime path is `MISSING_NODE_FRAME_API`.
