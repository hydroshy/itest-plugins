import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ModbusRtuPlugin,
  ModbusRtuAdapter,
  HalfDuplexBusLock,
} from '../dist/index.js';
import {
  appendModbusCRC16,
  calculateModbusCRC16,
} from '@universal-iot/plugin-sdk';

class MockTransport {
  constructor() {
    this.id = 'mock-serial';
    this.type = 'serial';
    this.connected = true;
    this.sentData = [];
    this.dataHandlers = [];
    this.errorHandlers = [];
  }

  async connect() {
    this.connected = true;
  }

  async disconnect() {
    this.connected = false;
  }

  isConnected() {
    return this.connected;
  }

  async send(data) {
    this.sentData.push(Buffer.from(data));
    return true;
  }

  onData(handler) {
    this.dataHandlers.push(handler);
  }

  onError(handler) {
    this.errorHandlers.push(handler);
  }

  simulateReceive(data) {
    for (const h of this.dataHandlers) {
      h(Buffer.from(data));
    }
  }
}

class MockPluginContext {
  constructor() {
    this.events = [];
    this.permissions = [];
    this.logger = {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    };
    this.eventBus = {
      publish: async (topic, payload) => {
        this.events.push({ topic, payload });
      },
    };
    this.permissions = {
      registered: [],
      registerPermissions: (perms) => {
        this.permissions.registered.push(...perms);
      },
      getPermissions: () => this.permissions.registered,
    };
  }
}

test('HalfDuplexBusLock serializes concurrent requests with t3.5 delay', async () => {
  const busLock = new HalfDuplexBusLock(5); // 5ms delay
  const order = [];

  const task1 = async () => {
    const release = await busLock.acquire(1000);
    order.push('start1');
    await new Promise((r) => setTimeout(r, 20));
    order.push('end1');
    release();
  };

  const task2 = async () => {
    const release = await busLock.acquire(1000);
    order.push('start2');
    await new Promise((r) => setTimeout(r, 10));
    order.push('end2');
    release();
  };

  await Promise.all([task1(), task2()]);

  assert.deepEqual(order, ['start1', 'end1', 'start2', 'end2']);
});

test('ModbusRtuAdapter reads register successfully over mock transport', async () => {
  const transport = new MockTransport();
  const adapter = new ModbusRtuAdapter();
  adapter.attachTransport(transport);

  // When request is sent, simulate immediate response from Slave (Unit 1, FC 03, ByteCount 2, Val 1234 = 0x04D2)
  setTimeout(() => {
    const respPayload = Buffer.from([0x01, 0x03, 0x02, 0x04, 0xd2]);
    transport.simulateReceive(appendModbusCRC16(respPayload));
  }, 20);

  const value = await adapter.read({
    unitId: 1,
    address: 40001, // Holding reg 0
    dataType: 'uint16',
  });

  assert.equal(value, 1234);
  assert.equal(transport.sentData.length, 1);
});

test('ModbusRtuAdapter write enforces modbus:write permission', async () => {
  const context = new MockPluginContext();
  const transport = new MockTransport();
  const adapter = new ModbusRtuAdapter(context);
  adapter.attachTransport(transport);

  // Without permission
  await assert.rejects(
    async () => {
      await adapter.write({ unitId: 1, address: 40001 }, 100);
    },
    (err) => {
      assert.equal(err.code, 'UNAUTHORIZED');
      return true;
    },
  );

  // Grant permission
  context.permissions.registerPermissions([{ namespace: 'modbus', resource: 'register', action: 'write' }]);

  // Simulate slave ack
  setTimeout(() => {
    const respPayload = Buffer.from([0x01, 0x06, 0x00, 0x00, 0x00, 0x64]);
    transport.simulateReceive(appendModbusCRC16(respPayload));
  }, 20);

  const res = await adapter.write({ unitId: 1, address: 40001 }, 100);
  assert.equal(res.success, true);
});

test('ModbusRtuPlugin pollDevice normalizes metrics and publishes to EventBus', async () => {
  const context = new MockPluginContext();
  const plugin = new ModbusRtuPlugin();
  await plugin.init(context);

  const transport = new MockTransport();
  plugin.adapter.attachTransport(transport);

  // Mock response for temperature register: 256 -> with scale 0.1 => 25.6 °C
  setTimeout(() => {
    const respPayload = Buffer.from([0x01, 0x03, 0x02, 0x01, 0x00]); // 256
    transport.simulateReceive(appendModbusCRC16(respPayload));
  }, 20);

  const metrics = await plugin.pollDevice('device-sensor-01', 1, [
    {
      address: 40001,
      parameterName: 'temperature',
      dataType: 'uint16',
      scale: 0.1,
      unit: '°C',
    },
  ]);

  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].metricKey, 'temperature');
  assert.equal(metrics[0].value, 25.6);
  assert.equal(metrics[0].quality, 'good');

  assert.equal(context.events.length, 1);
  assert.equal(context.events[0].topic, 'telemetry.normalized');
  assert.equal(context.events[0].payload.deviceId, 'device-sensor-01');
});
