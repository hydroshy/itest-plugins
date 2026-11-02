const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ChirpStackApiClient } = require('../backend/dist/chirpstack-api.client.js');

test('device profile mapper preserves capabilities independently of profile name', async () => {
  const originalFetch = global.fetch;
  const profiles = [
    { id: 'au915-c', name: 'Production', region: 'AU915', supportsClassB: false, supportsClassC: true, supportsOtaa: true },
    { id: 'au915-a', name: 'Class C in name only', region: 'AU915', supportsClassB: false, supportsClassC: false, supportsOtaa: false },
    { id: 'au915-unknown', name: 'Unknown support', region: 'AU915' },
  ];
  global.fetch = async (url) => {
    assert.equal(new URL(url).searchParams.get('tenantId'), 'tenant-au');
    return new Response(JSON.stringify({ result: profiles }), { status: 200 });
  };
  try {
    const result = await new ChirpStackApiClient().listDeviceProfiles({ apiUrl: 'https://example.invalid', apiToken: '', tenantId: 'tenant-au' });
    assert.equal(result.length, 3);
    for (let i = 0; i < profiles.length; i++) {
      for (const flag of ['supportsClassB', 'supportsClassC', 'supportsOtaa']) {
        assert.equal(result[i][flag], profiles[i][flag]);
      }
      assert.equal(result[i].region, 'AU915');
    }
    assert.equal(result[0].supportsClassC, true);
    assert.equal(result[1].supportsClassC, false);
    assert.equal(result[2].supportsClassC, undefined);
  } finally {
    global.fetch = originalFetch;
  }
});
