import test from 'node:test';
import assert from 'node:assert/strict';
import { SandboxedPayloadDecoder, MemoryMapDecoder } from '../dist/index.js';

test('SandboxedPayloadDecoder executes standard decodeUplink correctly', () => {
  const script = `
    function decodeUplink(input) {
      const bytes = input.bytes;
      const tempRaw = (bytes[0] << 8) | bytes[1];
      const humidityRaw = bytes[2];
      return {
        data: {
          temperature: tempRaw / 10,
          humidity: humidityRaw,
          fPort: input.fPort
        }
      };
    }
  `;

  // Payload: temp = 25.5 (0x00FF = 255), humidity = 60 (0x3C)
  const hex = '00FF3C';
  const res = SandboxedPayloadDecoder.execute(script, hex, { fPort: 2 });

  assert.equal(res.success, true);
  assert.equal(res.data?.temperature, 25.5);
  assert.equal(res.data?.humidity, 60);
  assert.equal(res.data?.fPort, 2);
  assert.ok(res.executionTimeMs >= 0);
});

test('SandboxedPayloadDecoder executes legacy Decoder function', () => {
  const script = `
    function Decoder(bytes, port) {
      return {
        battery: bytes[0] * 0.1,
        status: bytes[1] === 1 ? 'ACTIVE' : 'IDLE'
      };
    }
  `;

  const bytes = [36, 1]; // 3.6V, ACTIVE
  const res = SandboxedPayloadDecoder.execute(script, bytes, { fPort: 1 });

  assert.equal(res.success, true);
  assert.equal(Math.round(res.data?.battery * 10) / 10, 3.6);
  assert.equal(res.data?.status, 'ACTIVE');
});

test('SandboxedPayloadDecoder enforces timeout and isolates malicious code', () => {
  const infiniteLoopScript = `
    function decodeUplink() {
      while(true) {}
    }
  `;

  const res = SandboxedPayloadDecoder.execute(infiniteLoopScript, '0102', { timeoutMs: 100 });
  assert.equal(res.success, false);
  assert.ok(res.errors && res.errors[0].includes('timed out'));

  const sandboxEscapeScript = `
    function decodeUplink() {
      return { data: { proc: typeof process, req: typeof require } };
    }
  `;
  const escapeRes = SandboxedPayloadDecoder.execute(sandboxEscapeScript, '0102');
  assert.equal(escapeRes.success, true);
  assert.equal(escapeRes.data?.proc, 'undefined');
  assert.equal(escapeRes.data?.req, 'undefined');
});

test('MemoryMapDecoder decodes multi-format registers with scaling & endianness', () => {
  // Buffer with:
  // Word 0 (uint16): 1234 -> 0x04D2
  // Word 1-2 (float32 mid-big-endian): 25.5 -> BE is 0x41CC0000, mid-big swap CD AB is 0x000041CC
  const buf = Buffer.alloc(8);
  buf.writeUInt16BE(1234, 0); // Word 0
  // write mid-big endian float 25.5: word1 = 0x0000, word2 = 0x41CC
  buf.writeUInt16BE(0x0000, 2);
  buf.writeUInt16BE(0x41CC, 4);

  const registers = [
    {
      address: 1, // 1-based address = word 0
      parameterName: 'voltage',
      format: 'uint16',
      scale: 0.1,
      offset: 0,
    },
    {
      address: 2, // word 1
      parameterName: 'temperature',
      format: 'float32',
      endianness: 'mid-big-endian',
    },
  ];

  const results = MemoryMapDecoder.decodeRegisters(buf, registers, -1);
  assert.equal(Math.round(results.voltage * 10) / 10, 123.4);
  assert.equal(results.temperature, 25.5);
});
