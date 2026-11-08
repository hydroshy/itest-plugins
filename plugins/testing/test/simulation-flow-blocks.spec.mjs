import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateFlowDurationSeconds,
  flowRequiresReferenceDevice,
  validateSimulationFlowBlocks,
} from '../dist/index.js';

describe('Simulation Flow 3 Standard Blocks (Downlink, Clear Downlink, Delay)', () => {
  describe('1. Block Validation Rules', () => {
    it('should validate a valid flow containing all 3 standard blocks', () => {
      const blocks = [
        {
          id: 'b1',
          functionType: 'downlink',
          targetDevice: 'DUT',
          fPort: 1,
          payloadHex: '01020304',
          isConfirmed: false,
        },
        {
          id: 'b2',
          functionType: 'delay',
          delaySeconds: 15,
        },
        {
          id: 'b3',
          functionType: 'clear_downlink',
          targetDevice: 'REF',
        },
      ];

      const res = validateSimulationFlowBlocks(blocks);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.errors.length, 0);
    });

    it('should reject obsolete function types like trigger_buzzer or reboot_cmd', () => {
      const blocks = [
        { functionType: 'trigger_buzzer', targetDevice: 'DUT' },
        { functionType: 'reboot_cmd', targetDevice: 'DUT' },
      ];

      const res = validateSimulationFlowBlocks(blocks);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.errors.length, 2);
      assert.match(res.errors[0], /trigger_buzzer/);
      assert.match(res.errors[1], /reboot_cmd/);
    });

    it('should reject downlink or clear_downlink targeting invalid devices (only DUT or REF allowed)', () => {
      const blocks = [
        {
          functionType: 'downlink',
          targetDevice: 'SIMU-NODE-01',
          fPort: 1,
          payloadHex: 'AABB',
        },
        {
          functionType: 'clear_downlink',
          targetDevice: 'UNKNOWN_TARGET',
        },
      ];

      const res = validateSimulationFlowBlocks(blocks);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.errors.length, 2);
      assert.match(res.errors[0], /DUT.*REF/);
      assert.match(res.errors[1], /DUT.*REF/);
    });

    it('should validate downlink fPort range 1..223 and valid hex payload', () => {
      const invalidBlocks = [
        {
          functionType: 'downlink',
          targetDevice: 'DUT',
          fPort: 0,
          payloadHex: '123', // Odd length
        },
        {
          functionType: 'downlink',
          targetDevice: 'DUT',
          fPort: 250, // Port > 223
          payloadHex: 'ZZZZ', // Non hex
        },
      ];

      const res = validateSimulationFlowBlocks(invalidBlocks);
      assert.strictEqual(res.valid, false);
      assert.ok(res.errors.some((e) => e.includes('fPort')));
      assert.ok(res.errors.some((e) => e.includes('hex')));
    });

    it('should reject delay block when delaySeconds is zero or negative', () => {
      const blocks = [
        { functionType: 'delay', delaySeconds: 0 },
        { functionType: 'delay', delaySeconds: -5 },
      ];

      const res = validateSimulationFlowBlocks(blocks);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.errors.length, 2);
      assert.match(res.errors[0], /lớn hơn 0 giây/);
    });
  });

  describe('2. Flow Duration Calculation (Delay Only, Downlink/Clear = 0s)', () => {
    it('should sum only delay blocks for total flow duration', () => {
      const blocks = [
        { functionType: 'downlink', targetDevice: 'DUT', fPort: 1, payloadHex: '01' },
        { functionType: 'delay', delaySeconds: 60 },
        { functionType: 'clear_downlink', targetDevice: 'DUT' },
        { functionType: 'delay', delaySeconds: 120 },
        { functionType: 'downlink', targetDevice: 'REF', fPort: 1, payloadHex: '02' },
      ];

      const totalSec = calculateFlowDurationSeconds(blocks);
      assert.strictEqual(totalSec, 180);
    });

    it('should return 0 duration when flow has no delay blocks', () => {
      const blocks = [
        { functionType: 'downlink', targetDevice: 'DUT', fPort: 1, payloadHex: 'A1B2' },
        { functionType: 'clear_downlink', targetDevice: 'DUT' },
      ];

      assert.strictEqual(calculateFlowDurationSeconds(blocks), 0);
    });
  });

  describe('3. Reference Device Requirement for Test Batch (flowRequiresReferenceDevice)', () => {
    it('should return false when all functions target only DUT', () => {
      const blocks = [
        { functionType: 'downlink', targetDevice: 'DUT', fPort: 1, payloadHex: '01' },
        { functionType: 'delay', delaySeconds: 30 },
        { functionType: 'clear_downlink', targetDevice: 'DUT' },
      ];

      assert.strictEqual(flowRequiresReferenceDevice(blocks), false);
    });

    it('should return true when a downlink function targets REF', () => {
      const blocks = [
        { functionType: 'downlink', targetDevice: 'REF', fPort: 1, payloadHex: '01' },
        { functionType: 'delay', delaySeconds: 30 },
      ];

      assert.strictEqual(flowRequiresReferenceDevice(blocks), true);
    });

    it('should return true when a clear_downlink function targets REF', () => {
      const blocks = [
        { functionType: 'downlink', targetDevice: 'DUT', fPort: 1, payloadHex: '01' },
        { functionType: 'clear_downlink', targetDevice: 'REF' },
      ];

      assert.strictEqual(flowRequiresReferenceDevice(blocks), true);
    });
  });
});
