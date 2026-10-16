import test from 'node:test';
import assert from 'node:assert/strict';
import { ThingParkNormalizer } from '../dist/index.js';

test('ThingParkNormalizer: normalize Actility DevEUI_uplink packet', () => {
  const normalizer = new ThingParkNormalizer();
  const rawPacket = {
    DevEUI_uplink: {
      Time: '2026-10-15T12:30:00.000Z',
      DevEUI: '20635F0123456789',
      FPort: 10,
      FCntUp: 55,
      payload_hex: '01020304',
      CustomerID: 'enterprise-client-01',
      LrrRSSI: -82.0,
      LrrSNR: 7.5,
      SpFact: 8
    }
  };

  const telemetries = normalizer.normalize(rawPacket);
  assert.ok(telemetries.length >= 3);

  const rssi = telemetries.find(t => t.metricKey === 'rssi');
  assert.ok(rssi);
  assert.equal(rssi.value, -82.0);
  assert.equal(rssi.deviceId, '20635F0123456789');

  const snr = telemetries.find(t => t.metricKey === 'snr');
  assert.ok(snr);
  assert.equal(snr.value, 7.5);

  const sf = telemetries.find(t => t.metricKey === 'spreading_factor');
  assert.ok(sf);
  assert.equal(sf.value, 8);

  const raw = telemetries.find(t => t.metricKey === 'payload_hex');
  assert.ok(raw);
  assert.equal(raw.value, '01020304');
});
