import * as net from 'net';
import {
  IPluginLifecycle,
  IPluginContext,
  TransportAdapter,
  ProtocolAdapter,
  ConnectionManager,
  ProtocolCapability,
  ProtocolError,
  UnifiedTelemetry,
  MetricQuality,
  ModbusFunctionCode,
  ModbusExceptionCode,
  ModbusDataType,
  ModbusEndianness,
  ModbusRegisterConfig,
  buildModbusReadRequest,
  buildModbusWriteSingleRegisterRequest,
  buildModbusWriteMultipleRegistersRequest,
  parseModbusResponse,
  decodeModbusValue,
  encodeModbusValue,
  normalizeModbusAddress,
  parseMbapHeader,
  buildMbapHeader,
} from '@universal-iot/plugin-sdk';

export interface ModbusTcpConnectionOptions {
  host: string;
  port?: number;
  timeoutMs?: number;
  connectTimeoutMs?: number;
  autoReconnect?: boolean;
  maxRetries?: number;
}

export interface InFlightTransaction {
  transactionId: number;
  resolve: (frame: Buffer) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  startTime: number;
}

export interface ModbusTcpTarget {
  host?: string;
  port?: number;
  unitId: number;
  address: number;
  functionCode?: ModbusFunctionCode;
  count?: number;
  dataType?: ModbusDataType;
  endianness?: ModbusEndianness;
  scale?: number;
  offset?: number;
  metricKey?: string;
  deviceId?: string;
  tenantId?: string;
  timeoutMs?: number;
  registers?: ModbusRegisterConfig[];
  multiple?: boolean;
}

/**
 * Robust Modbus TCP Client Connection with MBAP Transaction Correlation
 * Handles stream fragmentation, transaction demultiplexing, and reconnect backoff.
 */
export class ModbusTcpConnection {
  public readonly host: string;
  public readonly port: number;
  private socket?: net.Socket;
  private connected: boolean = false;
  private connecting: boolean = false;
  private currentTxId: number = 0;
  private inFlight = new Map<number, InFlightTransaction>();
  private receiveBuffer: Buffer = Buffer.alloc(0);
  private reconnectAttempts: number = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private destroyed: boolean = false;

  constructor(
    public readonly options: ModbusTcpConnectionOptions,
    private readonly logger?: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void },
  ) {
    this.host = options.host;
    this.port = options.port ?? 502;
  }

  get isConnected(): boolean {
    return this.connected && this.socket !== undefined && !this.socket.destroyed;
  }

  nextTransactionId(): number {
    this.currentTxId = (this.currentTxId + 1) & 0xffff;
    if (this.currentTxId === 0) this.currentTxId = 1;
    return this.currentTxId;
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    if (this.connecting) {
      return new Promise((resolve, reject) => {
        const check = setInterval(() => {
          if (this.isConnected) {
            clearInterval(check);
            resolve();
          } else if (!this.connecting) {
            clearInterval(check);
            reject(new ProtocolError('CONNECTION_FAILED', `Failed to connect to ${this.host}:${this.port}`, 'modbus-tcp', undefined, true));
          }
        }, 50);
      });
    }

    this.connecting = true;
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const connectTimeout = this.options.connectTimeoutMs ?? 5000;

      const connTimer = setTimeout(() => {
        socket.destroy();
        this.connecting = false;
        reject(new ProtocolError('TIMEOUT', `Connection timeout to ${this.host}:${this.port} after ${connectTimeout}ms`, 'modbus-tcp', undefined, true));
      }, connectTimeout);

      socket.connect(this.port, this.host, () => {
        clearTimeout(connTimer);
        this.socket = socket;
        this.connected = true;
        this.connecting = false;
        this.reconnectAttempts = 0;
        this.logger?.info(`[ModbusTcpConnection] Connected to ${this.host}:${this.port}`);
        resolve();
      });

      socket.on('data', (chunk: Buffer) => {
        this.handleData(chunk);
      });

      socket.on('error', (err: Error) => {
        this.logger?.warn(`[ModbusTcpConnection] Socket error on ${this.host}:${this.port} - ${err.message}`);
        this.handleCloseOrError(err);
      });

      socket.on('close', () => {
        this.logger?.info(`[ModbusTcpConnection] Socket closed on ${this.host}:${this.port}`);
        this.handleCloseOrError();
      });
    });
  }

  attachCustomSocket(socket: any): void {
    this.socket = socket;
    this.connected = true;
    this.connecting = false;

    socket.on('data', (chunk: Buffer) => {
      this.handleData(chunk);
    });
    socket.on('close', () => {
      this.handleCloseOrError();
    });
    socket.on('error', (err: Error) => {
      this.handleCloseOrError(err);
    });
  }

  public handleData(chunk: Buffer): void {
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, chunk]);

    while (this.receiveBuffer.length >= 7) {
      const lengthField = this.receiveBuffer.readUInt16BE(4);
      const totalExpectedFrameLen = 6 + lengthField;

      if (this.receiveBuffer.length < totalExpectedFrameLen) {
        break;
      }

      const frame = Buffer.from(this.receiveBuffer.subarray(0, totalExpectedFrameLen));
      this.receiveBuffer = this.receiveBuffer.subarray(totalExpectedFrameLen);

      const txId = frame.readUInt16BE(0);
      const pending = this.inFlight.get(txId);
      if (pending) {
        clearTimeout(pending.timer);
        this.inFlight.delete(txId);
        pending.resolve(frame);
      } else {
        this.logger?.warn(`[ModbusTcpConnection] Received response for unknown or timed out txId: ${txId}`);
      }
    }
  }

  private handleCloseOrError(err?: Error): void {
    this.connected = false;
    this.connecting = false;

    for (const [txId, pending] of this.inFlight.entries()) {
      clearTimeout(pending.timer);
      pending.reject(
        new ProtocolError('CONNECTION_FAILED', `Connection closed while request was in-flight (txId: ${txId}): ${err?.message || 'closed'}`, 'modbus-tcp', undefined, true)
      );
    }
    this.inFlight.clear();

    if (!this.destroyed && this.options.autoReconnect !== false) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const maxRetries = this.options.maxRetries ?? 10;
    if (this.reconnectAttempts >= maxRetries) {
      this.logger?.error(`[ModbusTcpConnection] Exceeded max reconnect attempts (${maxRetries}) to ${this.host}:${this.port}`);
      return;
    }

    const backoffMs = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    this.logger?.info(`[ModbusTcpConnection] Scheduling reconnect #${this.reconnectAttempts} to ${this.host}:${this.port} in ${backoffMs}ms`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = undefined;
      try {
        await this.connect();
      } catch (err) {
        // Will be rescheduled if needed
      }
    }, backoffMs);
  }

  async request(frame: Buffer, timeoutMs?: number): Promise<Buffer> {
    if (!this.isConnected) {
      await this.connect();
    }

    const txId = frame.readUInt16BE(0);
    const timeout = timeoutMs ?? this.options.timeoutMs ?? 5000;

    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.inFlight.delete(txId);
        reject(new ProtocolError('TIMEOUT', `Modbus TCP transaction ${txId} timed out after ${timeout}ms`, 'modbus-tcp', undefined, true));
      }, timeout);

      this.inFlight.set(txId, {
        transactionId: txId,
        resolve,
        reject,
        timer,
        startTime: Date.now(),
      });

      try {
        this.socket?.write(frame);
      } catch (err: any) {
        clearTimeout(timer);
        this.inFlight.delete(txId);
        reject(new ProtocolError('INTERNAL_ERROR', `Failed to write frame to socket: ${err.message}`, 'modbus-tcp', undefined, true));
      }
    });
  }

  async close(): Promise<void> {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.socket && !this.socket.destroyed) {
      this.socket.destroy();
    }
    this.connected = false;
  }
}

/**
 * Modbus TCP Connection Pool implementing ConnectionManager
 */
export class ModbusTcpConnectionPool implements ConnectionManager<ModbusTcpConnection> {
  private pool = new Map<string, ModbusTcpConnection>();

  constructor(
    private readonly defaultOptions: Partial<ModbusTcpConnectionOptions> = {},
    private readonly logger?: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void },
  ) {}

  async getConnection(connectionId: string, customOptions?: Partial<ModbusTcpConnectionOptions>): Promise<ModbusTcpConnection> {
    let conn = this.pool.get(connectionId);
    if (!conn) {
      const parts = connectionId.split(':');
      const host = parts[0] || '127.0.0.1';
      const port = parts[1] ? parseInt(parts[1], 10) : 502;

      conn = new ModbusTcpConnection(
        {
          host,
          port,
          timeoutMs: 5000,
          autoReconnect: true,
          ...this.defaultOptions,
          ...customOptions,
        },
        this.logger
      );
      this.pool.set(connectionId, conn);
    }
    return conn;
  }

  getExisting(connectionId: string): ModbusTcpConnection | undefined {
    return this.pool.get(connectionId);
  }

  registerConnection(connectionId: string, conn: ModbusTcpConnection): void {
    this.pool.set(connectionId, conn);
  }

  async releaseConnection(connectionId: string): Promise<void> {
    // Keep connection in pool for reuse unless explicit close is requested
  }

  async healthCheck(connectionId: string): Promise<{ isHealthy: boolean; latencyMs?: number }> {
    const conn = this.pool.get(connectionId);
    if (!conn || !conn.isConnected) {
      return { isHealthy: false };
    }
    return { isHealthy: true, latencyMs: 5 };
  }

  async closeAll(): Promise<void> {
    const closes: Promise<void>[] = [];
    for (const conn of this.pool.values()) {
      closes.push(conn.close());
    }
    await Promise.all(closes);
    this.pool.clear();
  }
}

/**
 * Modbus TCP Master Protocol Adapter
 */
export class ModbusTcpAdapter implements ProtocolAdapter {
  public readonly id = 'modbus-tcp-adapter';
  public readonly name = 'Modbus TCP Master Protocol Adapter';
  public readonly capabilities: ProtocolCapability = {
    name: 'Modbus TCP',
    description: 'Modbus TCP master supporting MBAP transaction correlation, connection pooling, and multi-endian register decoding',
    supportedDataTypes: ['boolean', 'int16', 'uint16', 'int32', 'uint32', 'float32', 'float64', 'string', 'bitfield'],
    supportsRead: true,
    supportsWrite: true,
    supportsPolling: true,
    supportsPush: false,
    supportsDownlink: false,
  };

  public transport?: TransportAdapter;

  constructor(
    public readonly connectionPool: ModbusTcpConnectionPool,
    private readonly context?: IPluginContext,
  ) {}

  async init(config: Record<string, any>): Promise<void> {
    if (config.transport) {
      this.transport = config.transport;
    }
  }

  /**
   * Read Modbus register(s) via Modbus TCP
   */
  async read(target: Record<string, any>): Promise<any> {
    const host = target.host || '127.0.0.1';
    const port = target.port || 502;
    const unitId = target.unitId ?? 1;
    const timeoutMs = target.timeoutMs ?? 5000;
    const connectionKey = `${host}:${port}`;

    const conn = await this.connectionPool.getConnection(connectionKey);

    // If target.registers array is provided (batch read)
    if (Array.isArray(target.registers)) {
      return this.readBatchRegisters(conn, target as ModbusTcpTarget, timeoutMs);
    }

    // Single register read
    const { offset, inferredFunction } = normalizeModbusAddress(target.address);
    const functionCode: ModbusFunctionCode = target.functionCode || inferredFunction || ModbusFunctionCode.READ_HOLDING_REGISTERS;
    const dataType: ModbusDataType = target.dataType || 'uint16';
    const endianness: ModbusEndianness = target.endianness || 'BIG_ENDIAN';
    const count = target.count || (['int32', 'uint32', 'float32'].includes(dataType) ? 2 : dataType === 'float64' ? 4 : 1);

    const txId = conn.nextTransactionId();
    const requestFrame = buildModbusReadRequest(unitId, functionCode, offset, count, true, txId);

    const responseFrame = await conn.request(requestFrame, timeoutMs);
    const parsed = parseModbusResponse(responseFrame, true);

    if (parsed.isError) {
      throw new ProtocolError(
        'UNSUPPORTED_FUNCTION',
        `Modbus Exception received: 0x${(parsed.exceptionCode || 0).toString(16).padStart(2, '0')}`,
        'modbus-tcp',
        `Unit ${unitId}`,
        false,
        responseFrame
      );
    }

    const value = decodeModbusValue(
      parsed.data,
      1, // skip byte count byte
      dataType,
      endianness,
      target.scale || 1,
      target.offset || 0
    );

    // Normalize and publish if context is present
    if (this.context && target.metricKey) {
      const telemetry: UnifiedTelemetry = {
        deviceId: target.deviceId || `modbus-tcp-${host}-${unitId}`,
        tenantId: target.tenantId || 'default',
        timestamp: new Date(),
        metricKey: target.metricKey,
        value,
        dataType: ['boolean', 'string'].includes(dataType) ? (dataType as any) : 'float',
        quality: 'good',
        sourceProtocol: 'modbus-tcp',
        metadata: {
          protocol: 'modbus-tcp',
          host,
          port,
          unitId,
          address: target.address,
          functionCode,
          transactionId: parsed.transactionId,
        },
      };

      await this.context.eventBus.publish('telemetry.normalized', telemetry);
    }

    return value;
  }

  private async readBatchRegisters(
    conn: ModbusTcpConnection,
    target: ModbusTcpTarget,
    timeoutMs: number
  ): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    const telemetries: UnifiedTelemetry[] = [];
    const now = new Date();
    const unitId = target.unitId ?? 1;
    const registers = target.registers || [];

    for (const reg of registers) {
      const { offset, inferredFunction } = normalizeModbusAddress(reg.address);
      const fn = inferredFunction || ModbusFunctionCode.READ_HOLDING_REGISTERS;
      const dataType = reg.dataType || 'uint16';
      const endianness = reg.endianness || 'BIG_ENDIAN';
      const count = ['int32', 'uint32', 'float32'].includes(dataType) ? 2 : dataType === 'float64' ? 4 : 1;
      const metricKey = reg.metricKey || reg.parameterName || `register_${reg.address}`;

      const txId = conn.nextTransactionId();
      const requestFrame = buildModbusReadRequest(unitId, fn, offset, count, true, txId);
      const responseFrame = await conn.request(requestFrame, timeoutMs);
      const parsed = parseModbusResponse(responseFrame, true);

      if (parsed.isError) {
        throw new ProtocolError(
          'UNSUPPORTED_FUNCTION',
          `Modbus Exception 0x${(parsed.exceptionCode || 0).toString(16)} reading ${metricKey}`,
          'modbus-tcp',
          `Unit ${unitId}`,
          false,
          responseFrame
        );
      }

      let value = decodeModbusValue(
        parsed.data,
        1,
        dataType,
        endianness,
        reg.scale || 1,
        reg.offset || 0
      );

      results[metricKey] = value;

      if (this.context) {
        telemetries.push({
          deviceId: target.deviceId || `modbus-tcp-${conn.host}-${unitId}`,
          tenantId: target.tenantId || 'default',
          timestamp: now,
          metricKey,
          value,
          unit: reg.unit,
          dataType: ['boolean', 'string'].includes(dataType) ? (dataType as any) : 'float',
          quality: 'good',
          sourceProtocol: 'modbus-tcp',
          metadata: {
            unitId,
            address: reg.address,
            transactionId: parsed.transactionId,
          },
        });
      }
    }

    if (this.context && telemetries.length > 0) {
      for (const t of telemetries) {
        await this.context.eventBus.publish('telemetry.normalized', t);
      }
    }

    return results;
  }

  /**
   * Write Modbus register(s) via Modbus TCP with Permission Enforcement Guard
   */
  async write(target: Record<string, any>, value: any): Promise<any> {
    // 1. Permission Guard Verification
    if (this.context) {
      const hasPermission = this.context.permissions
        .getPermissions()
        .some((p) => p.namespace === 'modbus' && (p.action === 'write' || p.action === '*'));
      if (!hasPermission) {
        throw new ProtocolError('UNAUTHORIZED', 'Permission modbus:write is required to issue Modbus write commands', 'modbus-tcp');
      }
    }

    const host = target.host || '127.0.0.1';
    const port = target.port || 502;
    const unitId = target.unitId ?? 1;
    const timeoutMs = target.timeoutMs ?? 5000;
    const connectionKey = `${host}:${port}`;
    const conn = await this.connectionPool.getConnection(connectionKey);

    const { offset } = normalizeModbusAddress(target.address);
    const dataType: ModbusDataType = target.dataType || 'uint16';
    const endianness: ModbusEndianness = target.endianness || 'BIG_ENDIAN';
    const txId = conn.nextTransactionId();

    let requestFrame: Buffer;

    if (Array.isArray(value)) {
      requestFrame = buildModbusWriteMultipleRegistersRequest(unitId, offset, value, true, txId);
    } else {
      let regValue = value;
      if (dataType && dataType !== 'uint16') {
        const encoded = encodeModbusValue(value, dataType, endianness, target.scale, target.offset);
        if (encoded.length > 2) {
          const words: number[] = [];
          for (let i = 0; i < encoded.length; i += 2) {
            words.push(encoded.readUInt16BE(i));
          }
          requestFrame = buildModbusWriteMultipleRegistersRequest(unitId, offset, words, true, txId);
        } else {
          regValue = encoded.readUInt16BE(0);
          requestFrame = buildModbusWriteSingleRegisterRequest(unitId, offset, regValue, true, txId);
        }
      } else {
        requestFrame = buildModbusWriteSingleRegisterRequest(unitId, offset, Number(regValue), true, txId);
      }
    }

    const responseFrame = await conn.request(requestFrame, timeoutMs);
    const parsed = parseModbusResponse(responseFrame, true);

    if (parsed.isError) {
      throw new ProtocolError(
        'UNSUPPORTED_FUNCTION',
        `Modbus Exception received on write: 0x${(parsed.exceptionCode || 0).toString(16).padStart(2, '0')}`,
        'modbus-tcp',
        `Unit ${unitId}`,
        false,
        responseFrame
      );
    }

    return true;
  }
}

/**
 * Modbus TCP Plugin Lifecycle Implementation
 */
export class ModbusTcpPlugin implements IPluginLifecycle {
  public connectionPool!: ModbusTcpConnectionPool;
  public adapter!: ModbusTcpAdapter;
  private context?: IPluginContext;

  async init(context: IPluginContext): Promise<void> {
    this.context = context;
    this.connectionPool = new ModbusTcpConnectionPool({}, context.logger);
    this.adapter = new ModbusTcpAdapter(this.connectionPool, context);

    if (context.permissions?.registerPermissions) {
      context.permissions.registerPermissions([
        { namespace: 'modbus', resource: 'register', action: 'read', description: 'Read Modbus TCP Registers and Coils' },
        { namespace: 'modbus', resource: 'register', action: 'write', description: 'Write Modbus TCP Registers and Coils' },
      ]);
    }

    this.context.logger.info(`[ModbusTcpPlugin] Initialized with Connection Pooling and Transaction Correlation.`);
  }

  async start(): Promise<void> {
    this.context?.logger.info(`[ModbusTcpPlugin] Modbus TCP Engine started.`);
  }

  async stop(): Promise<void> {
    await this.connectionPool?.closeAll();
    this.context?.logger.info(`[ModbusTcpPlugin] Modbus TCP Engine stopped and connections drained.`);
  }

  async destroy(): Promise<void> {
    await this.connectionPool?.closeAll();
    this.context?.logger.info(`[ModbusTcpPlugin] Destroyed.`);
  }
}

export default ModbusTcpPlugin;
