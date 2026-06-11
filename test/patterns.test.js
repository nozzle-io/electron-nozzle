'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { make_pattern, validate_cpu_frame } = require('../app/patterns');
const { make_renderer_cpu_payload } = require('../examples/cpu-copy-fallback');

function clone_frame(frame) {
  return { width: frame.width, height: frame.height, data: new Uint8ClampedArray(frame.data) };
}

function y_flip(frame) {
  const out = clone_frame(frame);
  const stride = frame.width * 4;
  for (let y = 0; y < frame.height; y += 1) {
    const src = (frame.height - 1 - y) * stride;
    const dst = y * stride;
    out.data.set(frame.data.slice(src, src + stride), dst);
  }
  return out;
}

function swap_rb(frame) {
  const out = clone_frame(frame);
  for (let i = 0; i < out.data.length; i += 4) {
    const r = out.data[i];
    out.data[i] = out.data[i + 2];
    out.data[i + 2] = r;
  }
  return out;
}

function premultiply_alpha(frame) {
  const out = clone_frame(frame);
  for (let i = 0; i < out.data.length; i += 4) {
    const a = out.data[i + 3] / 255;
    out.data[i] = Math.round(out.data[i] * a);
    out.data[i + 1] = Math.round(out.data[i + 1] * a);
    out.data[i + 2] = Math.round(out.data[i + 2] * a);
  }
  return out;
}

test('deterministic non-square CPU patterns preserve dimensions, sentinel pixels, and alpha', () => {
  for (const [width, height] of [[320, 240], [641, 479]]) {
    const frame = make_pattern(width, height);
    const summary = validate_cpu_frame(frame);
    assert.equal(summary.width, width);
    assert.equal(summary.height, height);
    assert.equal(summary.format, 'rgba8_unorm');
    assert.deepEqual(summary.pixels.top_left_alpha_zero, [0, 0, 0, 0]);
    assert.equal(summary.pixels.bottom_right_alpha_255[3], 255);
    assert.equal(summary.pixels.rb_swap_sentinel_alpha_191[3], 191);
    assert.notEqual(summary.pixels.rb_swap_sentinel_alpha_191[0], summary.pixels.rb_swap_sentinel_alpha_191[2]);
  }
});

test('validation rejects y-flip, R/B swap, and premultiplied-alpha corruption', () => {
  const frame = make_pattern(641, 479);
  assert.throws(() => validate_cpu_frame(y_flip(frame)), /pixel mismatch/);
  assert.throws(() => validate_cpu_frame(swap_rb(frame)), /pixel mismatch/);
  assert.throws(() => validate_cpu_frame(premultiply_alpha(frame)), /pixel mismatch/);
});

test('CPU-copy fallback payload is explicitly labeled and deterministic', () => {
  const a = make_renderer_cpu_payload(641, 479);
  const b = make_renderer_cpu_payload(641, 479);
  assert.equal(a.copyCost.includes('CPU copy'), true);
  assert.equal(a.checksum, b.checksum);
  assert.equal(a.bytes, 641 * 479 * 4);
});
