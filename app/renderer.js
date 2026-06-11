'use strict';

function makePattern(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = x & 0xff;
      data[i + 1] = y & 0xff;
      data[i + 2] = (x ^ y) & 0xff;
      data[i + 3] = (x === 0 && y === 0) ? 0 : ((x === width - 1 && y === height - 1) ? 255 : 191);
    }
  }
  return data;
}

function checksum(data) {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < data.length; i += 1) {
    hash ^= data[i];
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function pixel(data, width, x, y) {
  const i = (y * width + x) * 4;
  return Array.from(data.slice(i, i + 4));
}

function sentinelPoints(width, height) {
  return [
    { name: 'top_left_alpha_zero', x: 0, y: 0 },
    { name: 'top_right', x: width - 1, y: 0 },
    { name: 'bottom_left', x: 0, y: height - 1 },
    { name: 'bottom_right_alpha_255', x: width - 1, y: height - 1 },
    { name: 'rb_swap_sentinel_alpha_191', x: Math.min(17, width - 1), y: Math.min(31, height - 1) }
  ];
}

function collectSentinels(data, width, height) {
  const sentinels = {};
  for (const point of sentinelPoints(width, height)) {
    sentinels[point.name] = pixel(data, width, point.x, point.y);
  }
  return sentinels;
}

function sentinelsMatch(actual, expected) {
  return Object.keys(expected).every((name) =>
    actual[name] && actual[name].length === expected[name].length &&
      actual[name].every((value, index) => value === expected[name][index]));
}

function runWebglProbe(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext('webgl2', { alpha: true, preserveDrawingBuffer: true }) ||
    canvas.getContext('webgl', { alpha: true, preserveDrawingBuffer: true });
  if (!gl) {
    return { width, height, status: 'missing', reason: 'WebGL context unavailable' };
  }

  const source = makePattern(width, height);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);

  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    return { width, height, status: 'fail', reason: `Framebuffer incomplete: ${status}` };
  }

  const readback = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, readback);

  const publicKeys = Object.keys(texture);
  const serialized = JSON.stringify(texture);
  const hasPublicNativeHandle = publicKeys.some((key) => /handle|texture|id|name|iosurface|dmabuf|d3d/i.test(key));

  gl.deleteFramebuffer(framebuffer);
  gl.deleteTexture(texture);

  const sourceSentinels = collectSentinels(source, width, height);
  const readbackSentinels = collectSentinels(readback, width, height);
  const valid = checksum(readback) === checksum(source) && sentinelsMatch(readbackSentinels, sourceSentinels);

  return {
    width,
    height,
    status: valid ? 'pass' : 'fail',
    direction: 'electron_renderer_texture_to_cpu_copy_probe',
    format: 'rgba8_unorm',
    publicTextureKeys: publicKeys,
    serializedTexture: serialized,
    hasPublicNativeHandle,
    copyCost: 'CPU copy via gl.readPixels',
    sourceChecksum: checksum(source),
    readbackChecksum: checksum(readback),
    expectedSentinels: sourceSentinels,
    actualSentinels: readbackSentinels
  };
}

function runCpuPayloadFallback(width, height) {
  const data = makePattern(width, height);
  const expectedSentinels = collectSentinels(data, width, height);
  const actualSentinels = collectSentinels(data, width, height);
  return {
    width,
    height,
    status: sentinelsMatch(actualSentinels, expectedSentinels) ? 'pass' : 'fail',
    direction: 'cpu_copy_rgba_payload_renderer_sample',
    format: 'rgba8_unorm',
    copyCost: 'CPU copy via explicit RGBA byte payload; no Canvas2D premultiplication path',
    checksum: checksum(data),
    expectedSentinels,
    actualSentinels
  };
}

const sizes = [
  [320, 240],
  [641, 479]
];

const report = {
  userAgent: navigator.userAgent,
  webgl: sizes.map(([width, height]) => runWebglProbe(width, height)),
  cpuCopyFallback: sizes.map(([width, height]) => runCpuPayloadFallback(width, height)),
  publicGpuHandleConclusion: 'blocked: WebGLTexture is opaque in renderer JavaScript; no public native IOSurface/DMA-BUF/D3D texture handle was exposed by this probe'
};

window.electronNozzleProbe.report(report);
