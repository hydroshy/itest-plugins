import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import {
  ModbusTcpConnection,
  ModbusTcpConnectionPool,
  ModbusTcpAdapter,
  ModbusTcpPlugin,
} from '../dist/index.js';
import {
  ModbusFunctionCode,
  buildModbusReadRequest,
  buildModbusWriteSingleRegisterRequest,
  encodeModbusValue,
} from '../../../packages/plugin-sdk/dist/index.js';

class MockSocket extends EventEmitter {
  constructor() {
    super();
    this.written = [];
    this.destroyed = false;
  }
  write(chunk) {
    this.written.push(Buffer.from(chunk));
    return true;
  }
  destroy() {
    this.destroyed = true;
    this.emit('close');
  }
}

describe('Modbus TCP Protocol Engine & Adapter Tests', () => {
  it('1. Should handle MBAP transaction correlation and fragmented TCP streams', async () => {
    const conn = new ModbusTcpConnection({ host: '192.168.1.100', port: 502 });
    const mockSocket = new MockSocket();
    conn.attachCustomSocket(mockSocket);

    // Prepare read request frame
    const txId = conn.nextTransactionId();
    const requestFrame = buildModbusReadRequest(1, ModbusFunctionCode.READ_HOLDING_REGISTERS, 0, 2, true, txId);

    // Send request in background
    const reqPromise = conn.request(requestFrame, 1000);

    assert.strictEqual(mockSocket.written.length, 1);
    const sentTxId = mockSocket.written[0].readUInt16BE(0);
    assert.strictEqual(sentTxId, txId);

    // Mock response: MBAP Header (7 bytes) + PDU (1 byte FC + 1 byte len + 4 bytes data) = 13 bytes
    // Let's fragment this response into two chunks: 4 bytes then 9 bytes
    const fullResponse = Buffer.alloc(13);
    fullResponse.writeUInt16BE(txId, 0); // TxId
    fullResponse.writeUInt16BE(0, 2);    // Protocol ID (0 = Modbus)
    fullResponse.writeUInt16BE(7, 4);    // Length (UnitId + FC + byteCount + data = 1 + 1 + 1 + 4 = 7)
    fullResponse.writeUInt8(1, 6);       // Unit ID
    fullResponse.writeUInt8(0x03, 7);    // Function code
    fullResponse.writeUInt8(4, 8);       // Byte count
    fullResponse.writeUInt16BE(1234, 9); // Register 0
    fullResponse.writeUInt16BE(5678, 11); // Register 1

    // Send first fragment
    conn.handleData(fullResponse.subarray(0, 4));

    // Send second fragment
    conn.handleData(fullResponse.subarray(4));

    const response = await reqPromise;
    assert.ok(response);
    assert.strictEqual(response.readUInt16BE(0), txId);
    assert.strictEqual(response.readUInt8(7), 0x03);
    assert.strictEqual(response.readUInt16BE(9), 1234);
    assert.strictEqual(response.readUInt16BE(11), 5678);
  });

  it('2. Connection Pool should manage connection instances and perform health checks', async () => {
    const pool = new ModbusTcpConnectionPool();
    const conn1 = await pool.getConnection('192.168.1.50:502');
    const conn2 = await pool.getConnection('192.168.1.50:502');

    assert.strictEqual(conn1, conn2, 'Pool should return the same connection instance for identical host:port');

    const mockSocket = new MockSocket();
    conn1.attachCustomSocket(mockSocket);

    const health = await pool.healthCheck('192.168.1.50:502');
    assert.strictEqual(health.isHealthy, true);

    await pool.closeAll();
    assert.strictEqual(conn1.isConnected, false);
  });

  it('3. ModbusTcpAdapter should read register and publish normalized telemetry', async () => {
    const pool = new ModbusTcpConnectionPool();
    const publishedEvents = [];

    const mockContext = {
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      eventBus: {
        publish: async (topic, payload) => {
          publishedEvents.push({ topic, payload });
        },
      },
      permissions: {
        getPermissions: () => [{ namespace: 'modbus', resource: 'register', action: 'read' }],
      },
    };

    const adapter = new ModbusTcpAdapter(pool, mockContext);
    const conn = await pool.getConnection('127.0.0.1:502');
    const mockSocket = new MockSocket();
    conn.attachCustomSocket(mockSocket);

    // Auto-respond when socket receives data
    mockSocket.write = function (chunk) {
      const tx = chunk.readUInt16BE(0);
      const unit = chunk.readUInt8(6);
      const fc = chunk.readUInt8(7);

      // Value = 25.5 float32 (0x41CC0000)
      const dataBuf = Buffer.alloc(4);
      dataBuf.writeFloatBE(25.5, 0);

      const resp = Buffer.alloc(7 + 2 + 4);
      resp.writeUInt16BE(tx, 0);
      resp.writeUInt16BE(0, 2);
      resp.writeUInt16BE(7, 4); // unit(1) + fc(1) + len(1) + 4
      resp.writeUInt8(unit, 6);
      resp.writeUInt8(fc, 7);
      resp.writeUInt8(4, 8); // 4 bytes
      dataBuf.copy(resp, 9);

      setImmediate(() => {
        conn.handleData(resp);
      });
      return true;
    };

    const result = await adapter.read({
      host: '127.0.0.1',
      port: 502,
      unitId: 1,
      address: 40001,
      dataType: 'float32',
      metricKey: 'temperature',
      deviceId: 'chiller-01',
    });

    assert.ok(Math.abs(result - 25.5) < 0.001);
    assert.strictEqual(publishedEvents.length, 1);
    assert.strictEqual(publishedEvents[0].topic, 'telemetry.normalized');
    assert.strictEqual(publishedEvents[0].payload.metricKey, 'temperature');
    assert.strictEqual(publishedEvents[0].payload.quality, 'good');
    assert.strictEqual(publishedEvents[0].payload.sourceProtocol, 'modbus-tcp');
  });

  it('4. ModbusTcpAdapter should enforce modbus:write permission guard', async () => {
    const pool = new ModbusTcpConnectionPool();

    // Context without write permission
    const readOnlyContext = {
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      eventBus: { publish: async () => {} },
      permissions: {
        getPermissions: () => [{ namespace: 'modbus', resource: 'register', action: 'read' }],
      },
    };

    const adapter = new ModbusTcpAdapter(pool, readOnlyContext);

    await assert.rejects(
      async () => {
        await adapter.write({ host: '127.0.0.1', port: 502, unitId: 1, address: 40010 }, 100);
      },
      (err) => {
        assert.strictEqual(err.code, 'UNAUTHORIZED');
        assert.ok(err.message.includes('Permission modbus:write is required'));
        return true;
      }
    );

    // Context with write permission
    const writeContext = {
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      eventBus: { publish: async () => {} },
      permissions: {
        getPermissions: () => [
          { namespace: 'modbus', resource: 'register', action: 'read' },
          { namespace: 'modbus', resource: 'register', action: 'write' },
        ],
      },
    };

    const writeAdapter = new ModbusTcpAdapter(pool, writeContext);
    const conn = await pool.getConnection('127.0.0.1:502');
    const mockSocket = new MockSocket();
    conn.attachCustomSocket(mockSocket);

    mockSocket.write = function (chunk) {
      const tx = chunk.readUInt16BE(0);
      // Echo write single register response
      const resp = Buffer.alloc(12);
      chunk.copy(resp, 0, 0, 12);
      setImmediate(() => {
        conn.handleData(resp);
      });
      return true;
    };

    const writeResult = await writeAdapter.write(
      { host: '127.0.0.1', port: 502, unitId: 1, address: 40010, dataType: 'uint16' },
      100
    );
    assert.strictEqual(writeResult, true);
  });
});
