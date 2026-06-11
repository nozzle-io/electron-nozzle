'use strict';

function make_pattern(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('width and height must be positive integers');
  }

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
  return { width, height, data };
}

function checksum_rgba(data) {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < data.length; i += 1) {
    hash ^= data[i];
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function pixel_at(data, width, x, y) {
  const i = (y * width + x) * 4;
  return Array.from(data.slice(i, i + 4));
}

function sentinel_points(width, height) {
  return [
    { name: 'top_left_alpha_zero', x: 0, y: 0 },
    { name: 'top_right', x: width - 1, y: 0 },
    { name: 'bottom_left', x: 0, y: height - 1 },
    { name: 'bottom_right_alpha_255', x: width - 1, y: height - 1 },
    { name: 'rb_swap_sentinel_alpha_191', x: Math.min(17, width - 1), y: Math.min(31, height - 1) }
  ];
}

function expected_pixels(width, height) {
  const pattern = make_pattern(width, height).data;
  const pixels = {};
  for (const point of sentinel_points(width, height)) {
    pixels[point.name] = pixel_at(pattern, width, point.x, point.y);
  }
  return pixels;
}

function actual_pixels(frame) {
  const pixels = {};
  for (const point of sentinel_points(frame.width, frame.height)) {
    pixels[point.name] = pixel_at(frame.data, frame.width, point.x, point.y);
  }
  return pixels;
}

function assert_expected_pixels(frame) {
  const expected = expected_pixels(frame.width, frame.height);
  const actual = actual_pixels(frame);
  for (const [name, expected_pixel] of Object.entries(expected)) {
    const actual_pixel = actual[name];
    if (actual_pixel.length !== expected_pixel.length || actual_pixel.some((value, index) => value !== expected_pixel[index])) {
      throw new Error(`${name} pixel mismatch: got [${actual_pixel.join(',')}], expected [${expected_pixel.join(',')}]`);
    }
  }
  return { expected, actual };
}

function validate_cpu_frame(frame) {
  if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height)) {
    throw new Error('frame must include integer width and height');
  }
  if (!(frame.data instanceof Uint8ClampedArray) && !(frame.data instanceof Uint8Array)) {
    throw new Error('frame data must be Uint8Array-compatible RGBA bytes');
  }
  const expected_length = frame.width * frame.height * 4;
  if (frame.data.length !== expected_length) {
    throw new Error(`RGBA byte length mismatch: got ${frame.data.length}, expected ${expected_length}`);
  }
  const pixels = assert_expected_pixels(frame);
  return {
    width: frame.width,
    height: frame.height,
    format: 'rgba8_unorm',
    bytes: expected_length,
    checksum: checksum_rgba(frame.data),
    pixels: pixels.actual,
    expectedPixels: pixels.expected
  };
}

module.exports = {
  make_pattern,
  checksum_rgba,
  expected_pixels,
  actual_pixels,
  assert_expected_pixels,
  validate_cpu_frame
};
