import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MqttRingBuffer,
  MqttTopicMatcher,
  MqttClientConnection,
  MqttConnectionPool,
  MqttTopicTelemetryMapper,
  MqttConnectorPlugin,
  MqttConnectorAdapter,
} from '../dist/index.js';

describe('MQTT Connector Plugin Test Suite', () => {
  it('1. RingBuffer handles drop-oldest, drop-newest, and reject backpressure', () => {
    // Test drop-oldest
    const rbDropOldest = new MqttRingBuffer(3, 'drop-oldest');
    assert.equal(rbDropOldest.capacity, 3);
    assert.equal(rbDropOldest.size, 0);

    assert.ok(rbDropOldest.enqueue({ topic: 't1', payload: 'p1' }));
    assert.ok(rbDropOldest.enqueue({ topic: 't2', payload: 'p2' }));
    assert.ok(rbDropOldest.enqueue({ topic: 't3', payload: 'p3' }));
    assert.equal(rbDropOldest.isFull, true);

    // 4th item evicts oldest (t1)
    assert.ok(rbDropOldest.enqueue({ topic: 't4', payload: 'p4' }));
    assert.equal(rbDropOldest.size, 3);
    const stats = rbDropOldest.getStats();
    assert.equal(stats.droppedOldestCount, 1);
    assert.equal(stats.droppedCount, 1);

    const first = rbDropOldest.dequeue();
    assert.equal(first.topic, 't2'); // t1 was evicted

    // Test drop-newest
    const rbDropNewest = new MqttRingBuffer(2, 'drop-newest');
    rbDropNewest.enqueue({ topic: 't1', payload: 'p1' });
    rbDropNewest.enqueue({ topic: 't2', payload: 'p2' });
    const enq3 = rbDropNewest.enqueue({ topic: 't3', payload: 'p3' });
    assert.equal(enq3, false);
    assert.equal(rbDropNewest.getStats().droppedNewestCount, 1);
    assert.equal(rbDropNewest.dequeue().topic, 't1');
    assert.equal(rbDropNewest.dequeue().topic, 't2');

    // Test reject
    const rbReject = new MqttRingBuffer(1, 'reject');
    assert.ok(rbReject.enqueue({ topic: 't1', payload: 'p1' }));
    assert.equal(rbReject.enqueue({ topic: 't2', payload: 'p2' }), false);
  });

  it('2. MqttTopicMatcher handles wildcards (+, #) and named tokens (:param)', () => {
    assert.ok(MqttTopicMatcher.matchesFilter('devices/+/telemetry', 'devices/dev-100/telemetry'));
    assert.ok(MqttTopicMatcher.matchesFilter('devices/#', 'devices/dev-100/sensors/temperature'));
    assert.ok(!MqttTopicMatcher.matchesFilter('devices/+/telemetry', 'devices/dev-100/state/voltage'));

    const params = MqttTopicMatcher.extractParams(
      'v1/:tenantId/devices/:deviceId/telemetry/:metricKey',
      'v1/tenant-abc/devices/sensor-01/telemetry/voltage'
    );
    assert.deepEqual(params, {
      tenantId: 'tenant-abc',
      deviceId: 'sensor-01',
      metricKey: 'voltage',
    });
  });

  it('3. MqttClientConnection buffers messages during disconnection and flushes on reconnect', async () => {
    let publishedPackets = [];
    const conn = new MqttClientConnection({
      brokerUrl: 'mqtt://broker.iot.internal:1883',
      maxBufferSize: 100,
      backpressurePolicy: 'drop-oldest',
    });

    conn.setMockTransport({
      publish: async (topic, payload, qos, retain) => {
        publishedPackets.push({ topic, payload, qos, retain });
      },
      subscribe: async (topic, qos) => {},
    });

    // 1. Connection initially offline: publish goes to ring buffer
    assert.equal(conn.isConnected, false);
    await conn.publish({ topic: 'devices/dev-1/telemetry', payload: '{"temp":25.5}', qos: 0 });
    await conn.publish({ topic: 'devices/dev-2/telemetry', payload: '{"humidity":60}', qos: 0 });

    assert.equal(conn.ringBuffer.size, 2);
    assert.equal(publishedPackets.length, 0);

    // 2. Connect to broker: ring buffer automatically flushes
    await conn.connect();
    assert.equal(conn.isConnected, true);
    assert.equal(conn.ringBuffer.size, 0);
    assert.equal(publishedPackets.length, 2);
    assert.equal(publishedPackets[0].topic, 'devices/dev-1/telemetry');

    // 3. Online publish sends directly
    await conn.publish({ topic: 'devices/dev-3/telemetry', payload: '{"pressure":1013}', qos: 0 });
    assert.equal(publishedPackets.length, 3);

    // 4. Test QoS 1 handshake
    await conn.publish({ topic: 'devices/dev-1/cmd', payload: '{"action":"reset"}', qos: 1 });
    assert.equal(publishedPackets.length, 4);

    await conn.close();
  });

  it('4. MqttTopicTelemetryMapper normalizes JSON payloads and parameter routes', () => {
    const rawJson = JSON.stringify({
      temperature: 24.5,
      humidity: 55.2,
      active: true,
      status: 'nominal',
    });

    const mapped = MqttTopicTelemetryMapper.normalize(
      'v1/tenant-xyz/devices/dev-999/telemetry',
      rawJson,
      {
        topicPattern: 'v1/:tenantId/devices/:deviceId/telemetry',
        qos: 1,
      }
    );

    assert.equal(mapped.length, 4);
    const tempMetric = mapped.find((m) => m.metricKey === 'temperature');
    assert.ok(tempMetric);
    assert.equal(tempMetric.deviceId, 'dev-999');
    assert.equal(tempMetric.tenantId, 'tenant-xyz');
    assert.equal(tempMetric.value, 24.5);
    assert.equal(tempMetric.dataType, 'float32');
    assert.equal(tempMetric.quality, 'good');

    const statusMetric = mapped.find((m) => m.metricKey === 'status');
    assert.ok(statusMetric);
    assert.equal(statusMetric.value, 'nominal');
    assert.equal(statusMetric.dataType, 'string');
  });

  it('5. MqttConnectorAdapter enforces mqtt:publish permission', async () => {
    const pool = new MqttConnectionPool();
    const conn = new MqttClientConnection({ brokerUrl: 'mqtt://127.0.0.1:1883' });
    let publishedTopic = '';
    conn.setMockTransport({
      publish: async (topic) => { publishedTopic = topic; },
      subscribe: async () => {},
    });
    await conn.connect();
    pool.registerConnection('mqtt://127.0.0.1:1883', conn);

    // Denied context (no mqtt:publish)
    const deniedContext = {
      permissions: {
        getPermissions: () => [{ namespace: 'mqtt', resource: 'topic', action: 'subscribe' }],
      },
    };
    const deniedAdapter = new MqttConnectorAdapter(pool, deniedContext);
    await assert.rejects(
      async () => {
        await deniedAdapter.write({ topic: 'cmd/test' }, { command: 'reboot' });
      },
      /Permission mqtt:publish is required/
    );

    // Granted context
    const grantedContext = {
      permissions: {
        getPermissions: () => [{ namespace: 'mqtt', resource: 'topic', action: 'publish' }],
      },
    };
    const grantedAdapter = new MqttConnectorAdapter(pool, grantedContext);
    const res = await grantedAdapter.write({ topic: 'cmd/test' }, { command: 'reboot' });
    assert.equal(res, true);
    assert.equal(publishedTopic, 'cmd/test');

    await pool.closeAll();
  });
});
