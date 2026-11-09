import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateFlowDurationSeconds,
  flowRequiresReferenceDevice,
  validateSimulationFlowBlocks,
  calculateLinearCoefficients,
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

  describe('4. Two-Point Calibration Function Blocks & Calculations', () => {
    it('should validate full calibration flow blocks without errors', () => {
      const calibBlocks = [
        { functionType: 'downlink', targetDevice: 'SIMULATOR', fPort: 1, payloadHex: '00' },
        { functionType: 'delay', delaySeconds: 120 },
        { functionType: 'start_measurement', windowId: 'win_0ppm', targetDevice: 'DUT' },
        { functionType: 'delay', delaySeconds: 480 },
        { functionType: 'stop_measurement', windowId: 'win_0ppm' },
        { functionType: 'average', windowId: 'win_0ppm', targetDevice: 'DUT', metric: 'raw_val', outputVar: 'x1' },
        { functionType: 'downlink', targetDevice: 'SIMULATOR', fPort: 1, payloadHex: '14' },
        { functionType: 'delay', delaySeconds: 120 },
        { functionType: 'start_measurement', windowId: 'win_20ppm', targetDevice: 'DUT' },
        { functionType: 'delay', delaySeconds: 480 },
        { functionType: 'stop_measurement', windowId: 'win_20ppm' },
        { functionType: 'average', windowId: 'win_20ppm', targetDevice: 'DUT', metric: 'raw_val', outputVar: 'x2' },
        {
          functionType: 'calculate_linear',
          point1: { x: '{{x1}}', y: 0 },
          point2: { x: '{{x2}}', y: 20 },
        },
        { functionType: 'downlink', targetDevice: 'DUT', fPort: 2, payloadHex: '{{calib_payload_hex}}' },
        { functionType: 'device_auto_check' },
      ];

      const res = validateSimulationFlowBlocks(calibBlocks);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.errors.length, 0);

      // Duration: 120 + 480 + 120 + 480 = 1200s (20 minutes)
      const duration = calculateFlowDurationSeconds(calibBlocks);
      assert.strictEqual(duration, 1200);
    });

    it('should correctly calculate linear coefficients y = a*x + b and encode IEEE-754 hex', () => {
      // Point 1: raw x1 = 100, standard y1 = 0 ppm
      // Point 2: raw x2 = 500, standard y2 = 20 ppm
      // a = (20 - 0) / (500 - 100) = 20 / 400 = 0.05
      // b = 0 - 0.05 * 100 = -5.0
      const res = calculateLinearCoefficients({ x: 100, y: 0 }, { x: 500, y: 20 });
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.a, 0.05);
      assert.strictEqual(res.b, -5);
      assert.strictEqual(res.aHex.length, 8);
      assert.strictEqual(res.bHex.length, 8);

      // Point with deltaX near zero should be rejected safely
      const failRes = calculateLinearCoefficients({ x: 100, y: 0 }, { x: 100.00001, y: 20 });
      assert.strictEqual(failRes.valid, false);
      assert.ok(failRes.error);
    });
  });
});
