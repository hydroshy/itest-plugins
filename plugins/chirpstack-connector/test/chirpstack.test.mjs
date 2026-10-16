import test from 'node:test';
import assert from 'node:assert/strict';
import { ChirpstackConnectorPlugin } from '../dist/index.js';

test('ChirpstackConnectorPlugin: normalize v4 uplink', () => {
  const plugin = new ChirpstackConnectorPlugin();
  const v4Payload = {
    deviceInfo: {
      devEui: '0080E11505012345',
      deviceName: 'LoRa-Temp-Sensor',
      tenantId: 'tenant-demo'
    },
    fPort: 2,
    fCnt: 142,
    data: 'AQIDBA==',
    rxInfo: [
      {
        gatewayId: 'gateway-01',
        rssi: -75,
        snr: 8.5
      }
    ]
  };

  const telemetries = plugin.normalizeChirpstackUplink(v4Payload);
  assert.equal(telemetries.length, 3);
  
  const raw = telemetries.find(t => t.metricKey === 'raw_payload');
  assert.ok(raw);
  assert.equal(raw.deviceId, '0080E11505012345');
  assert.equal(raw.metadata?.fCnt, 142);

  const rssi = telemetries.find(t => t.metricKey === 'rssi');
  assert.ok(rssi);
  assert.equal(rssi.value, -75);

  const snr = telemetries.find(t => t.metricKey === 'snr');
  assert.ok(snr);
  assert.equal(snr.value, 8.5);
});
