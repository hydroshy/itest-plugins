import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  DecoderService,
  DecoderController,
  LoRaWANScriptRunner,
  DefaultMemmapBridge,
} from '../dist/index.js';

describe('LoRaWAN & IoT Payload Decoder Plugin Test Suite', () => {
  const sampleChirpstackV4Script = `
    function decodeUplink(input) {
      var bytes = input.bytes;
      var fPort = input.fPort;
      var data = {};
      var errors = [];
      
      if (!bytes || bytes.length === 0) {
        errors.push("Empty payload");
        return { data: data, errors: errors };
      }
      
      data.port = fPort;
      data.battery = bytes[0];
      if (bytes.length >= 3) {
        data.temperature = ((bytes[1] << 8) | bytes[2]) / 100.0;
      }
      return { data: data, errors: errors };
    }
  `;

  const sampleTTNV3Script = `
    function Decode(fPort, bytes) {
      return {
        fPort: fPort,
        counter: (bytes[0] << 8) | bytes[1],
        status: bytes[2] === 1 ? 'OK' : 'ALARM'
      };
    }
  `;

  describe('1. LoRaWANScriptRunner Sandbox Engine', () => {
    it('should decode ChirpStack v4 payload correctly with Hex input', () => {
      // Hex: 64 (100% battery), 09C4 (2500 -> 25.0 C)
      const res = LoRaWANScriptRunner.execute(sampleChirpstackV4Script, '6409C4', {
        fPort: 2,
      });

      assert.strictEqual(res.success, true);
      assert.deepStrictEqual(res.data, {
        port: 2,
        battery: 100,
        temperature: 25.0,
      });
      assert(res.executionTimeMs >= 0);
    });

    it('should decode with Base64 input', () => {
      // 0x64, 0x09, 0xC4 in Base64 is ZAzE
      const buf = Buffer.from('6409C4', 'hex');
      const b64 = buf.toString('base64');

      const res = LoRaWANScriptRunner.execute(sampleChirpstackV4Script, b64, {
        fPort: 10,
        inputFormat: 'base64',
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.battery, 100);
      assert.strictEqual(res.data.temperature, 25.0);
    });

    it('should support TTN / ChirpStack v3 Decode(fPort, bytes)', () => {
      // Hex: 002A (42), 01 (OK)
      const res = LoRaWANScriptRunner.execute(sampleTTNV3Script, '002A01', {
        fPort: 5,
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.fPort, 5);
      assert.strictEqual(res.data.counter, 42);
      assert.strictEqual(res.data.status, 'OK');
    });

    it('should protect sandbox from infinite loop (timeout enforcement)', () => {
      const infiniteLoopScript = `
        function decodeUplink(input) {
          while(true) {}
        }
      `;
      const res = LoRaWANScriptRunner.execute(infiniteLoopScript, '010203', {
        timeoutMs: 150,
      });

      assert.strictEqual(res.success, false);
      assert(res.errors && res.errors[0].includes('timed out'));
    });

    it('should fail gracefully if script lacks entrypoint', () => {
      const invalidScript = `
        var a = 123;
      `;
      const res = LoRaWANScriptRunner.execute(invalidScript, '010203');
      assert.strictEqual(res.success, false);
      assert(res.errors[0].includes('No valid decoder entrypoint found'));
    });

    it('should isolate sandbox environment (no process / require access)', () => {
      const exploitScript = `
        function decodeUplink(input) {
          var hasProcess = typeof process !== 'undefined';
          var hasRequire = typeof require !== 'undefined';
          return { data: { hasProcess: hasProcess, hasRequire: hasRequire } };
        }
      `;
      const res = LoRaWANScriptRunner.execute(exploitScript, '01');
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data.hasProcess, false);
      assert.strictEqual(res.data.hasRequire, false);
    });
  });

  describe('2. DecoderService (SKU & LONG_FW Recognition)', () => {
    let service;
    let memmapBridge;

    beforeEach(() => {
      memmapBridge = new DefaultMemmapBridge([
        {
          id: 'memmap-1',
          name: 'Water Meter LoRaWAN Profile',
          sku: 'WM-LORA-01',
          long_fw: '0F0001',
        },
        {
          id: 'memmap-2',
          name: 'Temperature Sensor Profile',
          sku: 'TEMP-TH-02',
          long_fw: '1F0002',
        },
      ]);
      service = new DecoderService(memmapBridge);
    });

    it('should register a decoder script mapped to SKU and LONG_FW', async () => {
      const script = await service.registerScript({
        name: 'Water Meter Decoder v1',
        sku: 'WM-LORA-01',
        long_fw: '0F0001',
        script: sampleChirpstackV4Script,
        sample_payload: '6409C4',
        sample_fport: 2,
      });

      assert(script.id);
      assert.strictEqual(script.sku, 'WM-LORA-01');
      assert.strictEqual(script.long_fw, '0F0001');
      assert.strictEqual(script.is_active, true);
    });

    it('should reject duplicate (sku, long_fw) registrations', async () => {
      await service.registerScript({
        name: 'First Script',
        sku: 'WM-LORA-01',
        long_fw: '0F0001',
        script: sampleChirpstackV4Script,
      });

      await assert.rejects(
        () =>
          service.registerScript({
            name: 'Duplicate Script',
            sku: 'WM-LORA-01',
            long_fw: '0F0001',
            script: sampleChirpstackV4Script,
          }),
        /Decoder script already exists for SKU "WM-LORA-01"/
      );
    });

    it('should recognize decoder and decode payload by SKU and LONG_FW', async () => {
      await service.registerScript({
        name: 'Water Meter Decoder',
        sku: 'WM-LORA-01',
        long_fw: '0F0001',
        script: sampleChirpstackV4Script,
      });

      const decodeRes = await service.decodePayload({
        sku: 'WM-LORA-01',
        long_fw: '0F0001',
        payload: '6409C4',
        fPort: 2,
      });

      assert.strictEqual(decodeRes.matched, true);
      assert.strictEqual(decodeRes.success, true);
      assert.strictEqual(decodeRes.data.battery, 100);
      assert.strictEqual(decodeRes.data.temperature, 25.0);
    });

    it('should return unmatched if no script registered for SKU & LONG_FW', async () => {
      const decodeRes = await service.decodePayload({
        sku: 'UNKNOWN-SKU',
        long_fw: '9F9999',
        payload: '6409C4',
      });

      assert.strictEqual(decodeRes.matched, false);
      assert.strictEqual(decodeRes.success, false);
      assert(decodeRes.errors[0].includes('No decoder script registered'));
    });

    it('should handle inactive script gracefully', async () => {
      const script = await service.registerScript({
        name: 'Temp Decoder',
        sku: 'TEMP-TH-02',
        long_fw: '1F0002',
        script: sampleTTNV3Script,
        is_active: false,
      });

      const decodeRes = await service.decodePayload({
        sku: 'TEMP-TH-02',
        long_fw: '1F0002',
        payload: '002A01',
      });

      assert.strictEqual(decodeRes.matched, true);
      assert.strictEqual(decodeRes.success, false);
      assert(decodeRes.errors[0].includes('currently inactive'));
    });
  });

  describe('3. Controller & Memmap Bridge Integration', () => {
    it('should list available memmaps with decoder binding status', async () => {
      const memmapBridge = new DefaultMemmapBridge([
        {
          id: 'm1',
          name: 'Pressure Meter',
          sku: 'PRES-01',
          long_fw: '2F0003',
        },
        {
          id: 'm2',
          name: 'Gas Meter',
          sku: 'GAS-02',
          long_fw: '3F0004',
        },
      ]);
      const service = new DecoderService(memmapBridge);
      const controller = new DecoderController(service);

      // Register decoder for PRES-01 only
      await controller.createScript({
        name: 'Pressure Decoder',
        sku: 'PRES-01',
        long_fw: '2F0003',
        script: sampleTTNV3Script,
      });

      const res = await controller.listMemmaps();
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.count, 2);

      const presMemmap = res.data.find(m => m.sku === 'PRES-01');
      assert.strictEqual(presMemmap.has_decoder, true);
      assert(presMemmap.decoder_id);

      const gasMemmap = res.data.find(m => m.sku === 'GAS-02');
      assert.strictEqual(gasMemmap.has_decoder, false);
      assert.strictEqual(gasMemmap.decoder_id, undefined);
    });

    it('should provide default template script', () => {
      const service = new DecoderService();
      const controller = new DecoderController(service);
      const res = controller.getTemplateScript();

      assert.strictEqual(res.success, true);
      assert(res.data.template.includes('decodeUplink'));
    });
  });
});
