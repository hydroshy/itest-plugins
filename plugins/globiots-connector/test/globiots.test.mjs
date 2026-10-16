import test from 'node:test';
import assert from 'node:assert/strict';
import { GlobiotsConnectorPlugin } from '../dist/index.js';

test('GlobiotsConnectorPlugin normalizes Globiots uplink message', () => {
  const plugin = new GlobiotsConnectorPlugin();
  plugin.init({
    manifest: { id: 'globiots-test', name: 'globiots', version: '1.0.0' },
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
  });

  const uplink = {
    devEUI: '0004A30B001C8888',
    customerCode: 'CUST-VN-01',
    fPort: 1,
    fCnt: 50,
    time: '2026-10-15T15:00:00Z',
    payloadHex: 'AABBCCDDEEFF',
    rssi: -80,
    snr: 6.2,
    frequency: 923400000,
    gatewayId: 'GW-HCMC-01'
  };

  const telemetries = plugin.normalizeGlobiotsUplink(uplink);

  assert.ok(telemetries.length >= 3);
  const rawPayload = telemetries.find(t => t.metricKey === 'raw_payload');
  assert.ok(rawPayload);
  assert.equal(rawPayload.deviceId, '0004A30B001C8888');
  assert.equal(rawPayload.tenantId, 'CUST-VN-01');
  assert.equal(rawPayload.value, 'AABBCCDDEEFF');
  assert.equal(rawPayload.metadata?.fPort, 1);
  assert.equal(rawPayload.metadata?.gatewayId, 'GW-HCMC-01');

  const rssi = telemetries.find(t => t.metricKey === 'rssi');
  assert.equal(rssi?.value, -80);

  const snr = telemetries.find(t => t.metricKey === 'snr');
  assert.equal(snr?.value, 6.2);
});
