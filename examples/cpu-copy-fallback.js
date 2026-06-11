'use strict';

const { make_pattern, validate_cpu_frame } = require('../app/patterns');

function make_renderer_cpu_payload(width, height) {
  const frame = make_pattern(width, height);
  return {
    direction: 'electron_renderer_content_to_native_cpu_copy_payload',
    copyCost: 'CPU copy: renderer pixels must be serialized or copied into native memory before any nozzle CPU publish API could consume them',
    ...validate_cpu_frame(frame)
  };
}

if (require.main === module) {
  console.log(JSON.stringify([
    make_renderer_cpu_payload(320, 240),
    make_renderer_cpu_payload(641, 479)
  ], null, 2));
}

module.exports = { make_renderer_cpu_payload };
