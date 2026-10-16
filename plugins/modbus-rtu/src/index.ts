import {
  IPluginLifecycle,
  IPluginContext,
  TransportAdapter,
  ProtocolAdapter,
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
  verifyModbusCRC16,
} from '@universal-iot/plugin-sdk';

/**
 * Half-Duplex Bus Arbiter for RS485 Shared Bus.
 * Ensures strict serialized request-response cycles with configurable
 * inter-frame turnaround silence (t3.5 time) to prevent bus collision.
 */
export class HalfDuplexBusLock {
  private locked: boolean = false;
  private queue: Array<{ resolve: (release: () => void) => void; reject: (err: Error) => void }> = [];

  constructor(private readonly interFrameDelayMs: number = 10) {}

  async acquire(timeoutMs: number = 5000): Promise<() => void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.queue.findIndex((item) => item.resolve === resolve);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
          reject(new ProtocolError('TIMEOUT', `Bus lock acquisition timed out after ${timeoutMs}ms`, 'modbus-rtu', undefined, true));
        }
      }, timeoutMs);

      const release = () => {
        clearTimeout(timer);
        // Enforce RS485 t3.5 turnaround delay before releasing to next queued requester
        setTimeout(() => {
          if (this.queue.length > 0) {
            const next = this.queue.shift();
            if (next) next.resolve(release);
          } else {
            this.locked = false;
          }
        }, this.interFrameDelayMs);
      };

      if (!this.locked) {
        this.locked = true;
        clearTimeout(timer);
        resolve(release);
      } else {
        this.queue.push({ resolve, reject });
      }
    });
  }
}

export interface ModbusRtuDeviceTarget {
  unitId: number;
  functionCode?: ModbusFunctionCode;
  address: number;
  quantity?: number;
  dataType?: ModbusDataType;
  endianness?: ModbusEndianness;
  scale?: number;
  offset?: number;
}

export interface PollingScheduleItem {
  id: string;
  deviceId: string;
  tenantId?: string;
  unitId: number;
  registers: ModbusRegisterConfig[];
  intervalMs: number;
  timer?: NodeJS.Timeout;
}

export class ModbusRtuAdapter implements ProtocolAdapter {
  public readonly id = 'modbus-rtu-adapter';
  public readonly name = 'Modbus RTU Master Protocol Adapter';
  public readonly capabilities: ProtocolCapability = {
    name: 'Modbus RTU / RS485',
    description: 'Modbus RTU master supporting FC01..FC06, FC15, FC16, CRC16 and multi-endian register decoding',
    supportedDataTypes: ['boolean', 'int16', 'uint16', 'int32', 'uint32', 'float32', 'float64', 'string', 'bitfield'],
    supportsRead: true,
    supportsWrite: true,
    supportsPolling: true,
    supportsPush: false,
    supportsDownlink: false,
  };

  public transport?: TransportAdapter;
  private busLock: HalfDuplexBusLock;
  private responseResolver?: {
    resolve: (data: Buffer) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  };

  constructor(
    private readonly context?: IPluginContext,
    interFrameDelayMs: number = 10,
  ) {
    this.busLock = new HalfDuplexBusLock(interFrameDelayMs);
  }

  async init(config: Record<string, any>): Promise<void> {
    if (config.transport) {
      this.attachTransport(config.transport);
    }
  }

  attachTransport(transport: TransportAdapter): void {
    this.transport = transport;
    this.transport.onData((data) => {
      this.handleIncomingData(Buffer.isBuffer(data) ? data : Buffer.from(data));
    });
    this.transport.onError((err) => {
      this.context?.logger.error(`[ModbusRtuAdapter] Transport error: ${err.message}`);
      if (this.responseResolver) {
        this.responseResolver.reject(new ProtocolError('FRAME_ERROR', err.message, 'modbus-rtu', undefined, true));
        clearTimeout(this.responseResolver.timer);
        this.responseResolver = undefined;
      }
    });
  }

  private handleIncomingData(buffer: Buffer): void {
    if (!this.responseResolver) return;

    if (!verifyModbusCRC16(buffer)) {
      this.context?.logger.warn(`[ModbusRtuAdapter] Incomplete or corrupt frame received (${buffer.length} bytes), awaiting or rejecting.`);
      return;
    }

    const resolver = this.responseResolver;
    this.responseResolver = undefined;
    clearTimeout(resolver.timer);
    resolver.resolve(buffer);
  }

  /**
   * Send frame and await response under half-duplex bus lock
   */
  async executeTransaction(requestFrame: Buffer, timeoutMs: number = 2000): Promise<Buffer> {
    if (!this.transport || !this.transport.isConnected()) {
      throw new ProtocolError('CONNECTION_FAILED', 'Serial/RS485 transport is not connected', 'modbus-rtu', undefined, true);
    }

    const releaseLock = await this.busLock.acquire(5000);

    try {
      const responsePromise = new Promise<Buffer>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (this.responseResolver) {
            this.responseResolver = undefined;
            reject(new ProtocolError('TIMEOUT', `Slave did not respond within ${timeoutMs}ms`, 'modbus-rtu', undefined, true, requestFrame));
          }
        }, timeoutMs);

        this.responseResolver = { resolve, reject, timer };
      });

      const sent = await this.transport.send(requestFrame);
      if (!sent) {
        throw new ProtocolError('FRAME_ERROR', 'Failed to transmit request frame to transport', 'modbus-rtu');
      }

      return await responsePromise;
    } finally {
      releaseLock();
    }
  }

  /**
   * Read Modbus registers or coils
   */
  async read(target: ModbusRtuDeviceTarget): Promise<any> {
    const { offset, inferredFunction } = normalizeModbusAddress(target.address);
    const fn = target.functionCode || inferredFunction || ModbusFunctionCode.READ_HOLDING_REGISTERS;
    const quantity = target.quantity || 1;

    const requestFrame = buildModbusReadRequest(target.unitId, fn, offset, quantity, false);
    const responseFrame = await this.executeTransaction(requestFrame);

    const parsed = parseModbusResponse(responseFrame, false);
    if (parsed.isError) {
      throw new ProtocolError(
        'UNSUPPORTED_FUNCTION',
        `Modbus Exception: Code 0x${(parsed.exceptionCode || 0).toString(16)} on function 0x${fn.toString(16)}`,
        'modbus-rtu',
        `Unit ${target.unitId}`,
        false,
        responseFrame,
      );
    }

    if (target.dataType) {
      return decodeModbusValue(
        parsed.data,
        1, // Skip byte count byte
        target.dataType,
        target.endianness || 'BIG_ENDIAN',
        target.scale || 1,
        target.offset || 0,
      );
    }

    return parsed.data.subarray(1); // Return raw register data (excluding byte count)
  }

  /**
   * Write Modbus register or coil with permission & safety check
   */
  async write(target: ModbusRtuDeviceTarget, value: any): Promise<any> {
    if (this.context) {
      const hasPermission = this.context.permissions
        .getPermissions()
        .some((p) => p.namespace === 'modbus' && (p.action === 'write' || p.action === '*'));
      if (!hasPermission) {
        throw new ProtocolError('UNAUTHORIZED', 'Permission modbus:write is required to issue Modbus write commands', 'modbus-rtu');
      }
    }

    const { offset } = normalizeModbusAddress(target.address);
    let requestFrame: Buffer;

    if (Array.isArray(value)) {
      requestFrame = buildModbusWriteMultipleRegistersRequest(target.unitId, offset, value, false);
    } else {
      let regValue = value;
      if (target.dataType && target.dataType !== 'uint16') {
        const encoded = encodeModbusValue(value, target.dataType, target.endianness, target.scale, target.offset);
        regValue = encoded.readUInt16BE(0);
      }
      requestFrame = buildModbusWriteSingleRegisterRequest(target.unitId, offset, regValue, false);
    }

    this.context?.logger.info(`[ModbusRtuAdapter] Audited write to Unit ${target.unitId}, Addr ${offset}, Value ${JSON.stringify(value)}`);
    const responseFrame = await this.executeTransaction(requestFrame);
    const parsed = parseModbusResponse(responseFrame, false);

    if (parsed.isError) {
      throw new ProtocolError(
        'UNSUPPORTED_FUNCTION',
        `Modbus Exception on write: Code 0x${(parsed.exceptionCode || 0).toString(16)}`,
        'modbus-rtu',
        `Unit ${target.unitId}`,
        false,
        responseFrame,
      );
    }

    return { success: true, unitId: parsed.unitId };
  }
}

/**
 * Modbus RTU / RS485 Protocol Plugin Implementation
 */
export class ModbusRtuPlugin implements IPluginLifecycle {
  public adapter: ModbusRtuAdapter;
  private context?: IPluginContext;
  private pollingSchedules: Map<string, PollingScheduleItem> = new Map();

  constructor() {
    this.adapter = new ModbusRtuAdapter();
  }

  async init(context: IPluginContext): Promise<void> {
    this.context = context;
    this.adapter = new ModbusRtuAdapter(context);

    // Register permissions
    this.context.permissions.registerPermissions([
      { namespace: 'modbus', resource: 'register', action: 'read', description: 'Read Modbus registers' },
      { namespace: 'modbus', resource: 'register', action: 'write', description: 'Write Modbus registers' },
    ]);

    this.context.logger.info(`[ModbusRtuPlugin] Initialized with unified Plugin SDK.`);
  }

  async start(): Promise<void> {
    this.context?.logger.info(`[ModbusRtuPlugin] Modbus RTU / RS485 protocol engine started.`);
  }

  async stop(): Promise<void> {
    for (const item of this.pollingSchedules.values()) {
      if (item.timer) clearInterval(item.timer);
    }
    this.pollingSchedules.clear();
    this.context?.logger.info(`[ModbusRtuPlugin] All polling schedules cleared and engine stopped.`);
  }

  async destroy(): Promise<void> {
    await this.stop();
    this.context?.logger.info(`[ModbusRtuPlugin] Destroyed.`);
  }

  /**
   * Register a polling schedule for an industrial Modbus device
   */
  schedulePolling(schedule: Omit<PollingScheduleItem, 'timer'>): void {
    if (this.pollingSchedules.has(schedule.id)) {
      const existing = this.pollingSchedules.get(schedule.id);
      if (existing?.timer) clearInterval(existing.timer);
    }

    const timer = setInterval(async () => {
      try {
        await this.pollDevice(schedule.deviceId, schedule.unitId, schedule.registers, schedule.tenantId);
      } catch (err: any) {
        this.context?.logger.error(`[ModbusRtuPlugin] Polling failed for device ${schedule.deviceId}: ${err.message}`);
      }
    }, schedule.intervalMs);

    this.pollingSchedules.set(schedule.id, { ...schedule, timer });
    this.context?.logger.info(`[ModbusRtuPlugin] Scheduled polling for device ${schedule.deviceId} every ${schedule.intervalMs}ms`);
  }

  /**
   * Polls configured registers and publishes normalized telemetry to Event Bus
   */
  async pollDevice(
    deviceId: string,
    unitId: number,
    registers: ModbusRegisterConfig[],
    tenantId: string = 'default-tenant',
  ): Promise<UnifiedTelemetry[]> {
    const telemetries: UnifiedTelemetry[] = [];
    const timestamp = new Date();

    for (const reg of registers) {
      const { offset, inferredFunction } = normalizeModbusAddress(reg.address);
      const fn = inferredFunction || ModbusFunctionCode.READ_HOLDING_REGISTERS;
      const quantity =
        reg.dataType === 'float32' || reg.dataType === 'uint32' || reg.dataType === 'int32'
          ? 2
          : reg.dataType === 'float64' || reg.dataType === 'uint64'
            ? 4
            : 1;

      try {
        const val = await this.adapter.read({
          unitId,
          functionCode: fn,
          address: offset,
          quantity,
          dataType: reg.dataType,
          endianness: reg.endianness,
          scale: reg.scale,
          offset: reg.offset,
        });

        telemetries.push({
          deviceId,
          tenantId,
          metricKey: reg.parameterName || `register_${reg.offset}`,
          value: val,
          dataType: reg.dataType,
          unit: reg.unit,
          quality: 'good',
          sourceProtocol: 'modbus-rtu',
          timestamp,
        });
      } catch (err: any) {
        telemetries.push({
          deviceId,
          tenantId,
          metricKey: reg.parameterName || `register_${reg.offset}`,
          value: 0,
          dataType: reg.dataType,
          unit: reg.unit,
          quality: 'bad',
          sourceProtocol: 'modbus-rtu',
          metadata: { error: err.message },
          timestamp,
        });
      }
    }

    // Publish normalized telemetry batch to the Event Bus
    if (this.context && telemetries.length > 0) {
      await this.context.eventBus.publish('telemetry.normalized', { deviceId, metrics: telemetries });
    }

    return telemetries;
  }
}
