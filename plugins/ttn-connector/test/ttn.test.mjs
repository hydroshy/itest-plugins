import test from 'node:test';
import assert from 'node:assert/strict';
import { TTNNormalizer } from '../dist/index.js';

test('TTNNormalizer: normalize TTN v3 uplink JSON', () => {
  const normalizer = new TTNNormalizer();
  const rawMsg = {
    end_device_ids: {
      device_id: 'eui-0080e11505012345',
      dev_eui: '0080E11505012345',
      application_ids: { application_id: 'app-smart-agriculture' }
    },
    received_at: '2026-10-15T12:00:00Z',
    uplink_message: {
      f_port: 1,
      f_cnt: 89,
      frm_payload: 'AQID',
      rx_metadata: [
        {
          gateway_ids: { gateway_id: 'gtw-daviteq-01' },
          rssi: -68,
          snr: 9.2
        }
      ],
      settings: {
        data_rate: { lora: { spreading_factor: 7 } }
      },
      decoded_payload: {
        soil_moisture: 45.2,
        battery_level: 98
      }
    }
  };

  const telemetries = normalizer.normalize(rawMsg);
  assert.ok(telemetries.length >= 4);

  const rssi = telemetries.find(t => t.metricKey === 'rssi');
  assert.ok(rssi);
  assert.equal(rssi.value, -68);
  assert.equal(rssi.deviceId, '0080E11505012345');

  const soil = telemetries.find(t => t.metricKey === 'soil_moisture');
  assert.ok(soil);
  assert.equal(soil.value, 45.2);

  const raw = telemetries.find(t => t.metricKey === 'payload_hex');
  assert.ok(raw);
  assert.equal(raw.value, '010203');
});
