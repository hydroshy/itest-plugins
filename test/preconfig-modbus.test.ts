import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
  createContiguousChunks,
  calculateModbusCrc16,
  verifyReadBackValues,
  PreconfigManagerService,
} from '../plugins/preconfig-manager/src/index.ts';

describe('Preconfig Modbus Chunking & Verification Engine', () => {
  it('calculates standard Modbus CRC16 correctly', () => {
    // Standard test vector: [0x01, 0x03, 0x00, 0x00, 0x00, 0x0A] -> CRC should be 0xC5CD (Lo=0xC5, Hi=0xCD)
    const [crcLo, crcHi] = calculateModbusCrc16([0x01, 0x03, 0x00, 0x00, 0x00, 0x0a]);
    assert.strictEqual(crcLo, 0xc5);
    assert.strictEqual(crcHi, 0xcd);
  });

  it('groups contiguous registers into a single Modbus FC 16 chunk', () => {
    const regs = [
      { address: 10, count: 1, values: [0x1234] },
      { address: 11, count: 2, values: [0x5678, 0x9abc] },
      { address: 13, count: 1, values: [0x0001] },
    ];

    const chunks = createContiguousChunks(regs, 32);
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].startAddress, 10);
    assert.strictEqual(chunks[0].registerCount, 4);
    assert.strictEqual(chunks[0].byteCount, 8);
    assert.deepStrictEqual(chunks[0].values, [0x1234, 0x5678, 0x9abc, 0x0001]);

    const frame = chunks[0].buildFrame(1);
    assert.strictEqual(frame[0], 1); // Slave ID
    assert.strictEqual(frame[1], 0x10); // FC 16
    assert.strictEqual(frame[2], 0); // Addr Hi
    assert.strictEqual(frame[3], 10); // Addr Lo
    assert.strictEqual(frame[4], 0); // Qty Hi
    assert.strictEqual(frame[5], 4); // Qty Lo
    assert.strictEqual(frame[6], 8); // Byte count
    // Data check
    assert.strictEqual(frame[7], 0x12);
    assert.strictEqual(frame[8], 0x34);
    assert.strictEqual(frame[9], 0x56);
    assert.strictEqual(frame[10], 0x78);
  });

  it('splits chunks when address gap occurs', () => {
    const regs = [
      { address: 0, count: 2, values: [100, 200] },
      { address: 2, count: 1, values: [300] },
      // Gap here (addr 3 missing, next is 10)
      { address: 10, count: 2, values: [400, 500] },
    ];

    const chunks = createContiguousChunks(regs, 32);
    assert.strictEqual(chunks.length, 2);
    assert.strictEqual(chunks[0].startAddress, 0);
    assert.strictEqual(chunks[0].registerCount, 3);
    assert.strictEqual(chunks[1].startAddress, 10);
    assert.strictEqual(chunks[1].registerCount, 2);
  });

  it('splits chunks when maxRegistersPerChunk is exceeded', () => {
    const regs = [
      { address: 0, count: 2, values: [1, 2] },
      { address: 2, count: 2, values: [3, 4] },
      { address: 4, count: 2, values: [5, 6] },
    ];

    // Limit to 4 registers max per chunk
    const chunks = createContiguousChunks(regs, 4);
    assert.strictEqual(chunks.length, 2);
    assert.strictEqual(chunks[0].startAddress, 0);
    assert.strictEqual(chunks[0].registerCount, 4);
    assert.strictEqual(chunks[1].startAddress, 4);
    assert.strictEqual(chunks[1].registerCount, 2);
  });

  it('performs 100% read-back verification successfully', () => {
    const targets = [
      { address: 10, count: 1, expectedValues: [0x1234], description: 'Config 1' },
      { address: 11, count: 2, expectedValues: [0x5678, 0x9abc], description: 'Config 2' },
    ];

    const actualMemory = new Map<number, [number, number]>();
    actualMemory.set(10, [0x12, 0x34]);
    actualMemory.set(11, [0x56, 0x78]);
    actualMemory.set(12, [0x9a, 0xbc]);

    const result = verifyReadBackValues(targets, actualMemory);
    assert.strictEqual(result.pass, true);
    assert.strictEqual(result.totalRegisters, 3);
    assert.strictEqual(result.matchedCount, 3);
    assert.strictEqual(result.mismatches.length, 0);
  });

  it('detects mismatch in read-back verification and fails closed', () => {
    const targets = [
      { address: 10, count: 1, expectedValues: [0x1234], description: 'Config 1' },
      { address: 11, count: 1, expectedValues: [0x5678], description: 'Config 2' },
    ];

    const actualMemory = new Map<number, [number, number]>();
    actualMemory.set(10, [0x12, 0x34]);
    actualMemory.set(11, [0x56, 0x99]); // Mismatch on reg 11!

    const result = verifyReadBackValues(targets, actualMemory);
    assert.strictEqual(result.pass, false);
    assert.strictEqual(result.totalRegisters, 2);
    assert.strictEqual(result.matchedCount, 1);
    assert.strictEqual(result.mismatches.length, 1);
    assert.strictEqual(result.mismatches[0].address, 11);
    assert.strictEqual(result.mismatches[0].expectedHex, '0x5678');
    assert.strictEqual(result.mismatches[0].actualHex, '0x5699');
  });

  it('integrates with PreconfigManagerService properly', () => {
    const service = new PreconfigManagerService();
    assert.strictEqual(service.getConfig().maxRegistersPerChunk, 32);

    const chunks = service.prepareWriteChunks([
      { address: 100, count: 1, values: [0x0001] },
      { address: 101, count: 1, values: [0x0002] },
    ]);
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].registerCount, 2);
  });
});
