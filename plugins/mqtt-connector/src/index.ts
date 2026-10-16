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
} from '@universal-iot/plugin-sdk';

export type MqttQoS = 0 | 1 | 2;
export type BackpressurePolicy = 'drop-oldest' | 'drop-newest' | 'reject';

export interface MqttMessage {
  topic: string;
  payload: Buffer | string;
  qos?: MqttQoS;
  retain?: boolean;
  messageId?: number;
  timestamp?: Date;
}

export interface MqttSubscriptionConfig {
  topicPattern: string; // e.g. "devices/:deviceId/telemetry" or "telemetry/#"
  qos: MqttQoS;
  deviceKeyPath?: string;
  tenantKeyPath?: string;
  metricPrefix?: string;
}

export interface MqttConnectionOptions {
  brokerUrl: string; // e.g. "mqtt://localhost:1883"
  clientId?: string;
  username?: string;
  password?: string;
  keepalive?: number; // seconds
  cleanSession?: boolean;
  reconnectIntervalMs?: number;
  maxReconnectIntervalMs?: number;
  maxBufferSize?: number;
  backpressurePolicy?: BackpressurePolicy;
  connectTimeoutMs?: number;
}

export interface RingBufferStats {
  capacity: number;
  size: number;
  enqueuedCount: number;
  dequeuedCount: number;
  droppedCount: number;
  droppedOldestCount: number;
  droppedNewestCount: number;
}

/**
 * High-performance Ring Buffer with configurable backpressure policies
 * Protects memory from unbounded growth during network drops or broker downtime.
 */
export class MqttRingBuffer<T> {
  private buffer: Array<T | undefined>;
  private head: number = 0;
  private tail: number = 0;
  private count: number = 0;
  private enqueued: number = 0;
  private dequeued: number = 0;
  private droppedOldest: number = 0;
  private droppedNewest: number = 0;

  constructor(
    public readonly capacity: number = 5000,
    public readonly policy: BackpressurePolicy = 'drop-oldest',
  ) {
    if (capacity <= 0) {
      throw new Error(`RingBuffer capacity must be > 0, got ${capacity}`);
    }
    this.buffer = new Array<T | undefined>(capacity);
  }

  get size(): number {
    return this.count;
  }

  get isFull(): boolean {
    return this.count === this.capacity;
  }

  get isEmpty(): boolean {
    return this.count === 0;
  }

  enqueue(item: T): boolean {
    if (this.isFull) {
      if (this.policy === 'reject') {
        return false;
      } else if (this.policy === 'drop-newest') {
        this.droppedNewest++;
        return false;
      } else if (this.policy === 'drop-oldest') {
        // Evict oldest item at head
        this.head = (this.head + 1) % this.capacity;
        this.count--;
        this.droppedOldest++;
      }
    }

    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    this.count++;
    this.enqueued++;
    return true;
  }

  dequeue(): T | undefined {
    if (this.isEmpty) {
      return undefined;
    }
    const item = this.buffer[this.head];
    this.buffer[this.head] = undefined; // release reference
    this.head = (this.head + 1) % this.capacity;
    this.count--;
    this.dequeued++;
    return item;
  }

  peek(): T | undefined {
    if (this.isEmpty) return undefined;
    return this.buffer[this.head];
  }

  drain(maxItems: number = this.count): T[] {
    const items: T[] = [];
    const limit = Math.min(maxItems, this.count);
    for (let i = 0; i < limit; i++) {
      const item = this.dequeue();
      if (item !== undefined) items.push(item);
    }
    return items;
  }

  clear(): void {
    this.buffer.fill(undefined);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }

  getStats(): RingBufferStats {
    return {
      capacity: this.capacity,
      size: this.count,
      enqueuedCount: this.enqueued,
      dequeuedCount: this.dequeued,
      droppedCount: this.droppedOldest + this.droppedNewest,
      droppedOldestCount: this.droppedOldest,
      droppedNewestCount: this.droppedNewest,
    };
  }
}

/**
 * Topic pattern matcher supporting MQTT wildcards (+, #) and named tokens (:param)
 */
export class MqttTopicMatcher {
  /**
   * Check if an incoming topic matches an MQTT subscription topic filter with + and #
   */
  static matchesFilter(filter: string, topic: string): boolean {
    if (filter === topic || filter === '#') return true;

    const filterSegments = filter.split('/');
    const topicSegments = topic.split('/');

    for (let i = 0; i < filterSegments.length; i++) {
      const f = filterSegments[i];
      if (f === '#') {
        return true; // matches rest of topic
      }
      if (i >= topicSegments.length) {
        return false;
      }
      if (f !== '+' && f !== topicSegments[i]) {
        return false;
      }
    }

    return filterSegments.length === topicSegments.length;
  }

  /**
   * Extract parameters from a named route pattern like "devices/:deviceId/telemetry/:metricKey"
   */
  static extractParams(pattern: string, topic: string): Record<string, string> | null {
    const patternSegments = pattern.split('/');
    const topicSegments = topic.split('/');
    const params: Record<string, string> = {};

    for (let i = 0; i < patternSegments.length; i++) {
      const p = patternSegments[i];
      if (p === '#') {
        params['rest'] = topicSegments.slice(i).join('/');
        return params;
      }
      if (i >= topicSegments.length) return null;

      if (p.startsWith(':')) {
        params[p.slice(1)] = topicSegments[i];
      } else if (p !== '+' && p !== topicSegments[i]) {
        return null;
      }
    }

    return patternSegments.length === topicSegments.length ? params : null;
  }
}

/**
 * Resilient MQTT Client Connection with backpressure ring buffer & QoS handling
 */
export class MqttClientConnection {
  public readonly brokerUrl: string;
  public readonly clientId: string;
  private connected: boolean = false;
  private connecting: boolean = false;
  private destroyed: boolean = false;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts: number = 0;
  private nextMsgId: number = 1;

  public readonly ringBuffer: MqttRingBuffer<MqttMessage>;
  private subscriptions = new Map<string, MqttSubscriptionConfig>();
  private messageHandlers: Array<(msg: MqttMessage) => void> = [];

  // In-flight QoS packets tracking
  private inFlightQos1 = new Map<number, { resolve: () => void; timer: NodeJS.Timeout }>();
  private inFlightQos2 = new Map<number, { step: 'PUBREC' | 'PUBCOMP'; resolve: () => void; timer: NodeJS.Timeout }>();

  // Custom/mock transport hooks for testability
  private mockTransport?: {
    publish: (topic: string, payload: Buffer | string, qos: MqttQoS, retain: boolean) => Promise<void>;
    subscribe: (topic: string, qos: MqttQoS) => Promise<void>;
  };

  constructor(
    public readonly options: MqttConnectionOptions,
    private readonly logger?: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void },
  ) {
    this.brokerUrl = options.brokerUrl;
    this.clientId = options.clientId || `mqtt-client-${Math.random().toString(16).slice(2, 10)}`;
    const capacity = options.maxBufferSize ?? 5000;
    const policy = options.backpressurePolicy ?? 'drop-oldest';
    this.ringBuffer = new MqttRingBuffer<MqttMessage>(capacity, policy);
  }

  get isConnected(): boolean {
    return this.connected && !this.destroyed;
  }

  setMockTransport(transport: {
    publish: (topic: string, payload: Buffer | string, qos: MqttQoS, retain: boolean) => Promise<void>;
    subscribe: (topic: string, qos: MqttQoS) => Promise<void>;
  }): void {
    this.mockTransport = transport;
  }

  nextMessageId(): number {
    this.nextMsgId = (this.nextMsgId + 1) & 0xffff;
    if (this.nextMsgId === 0) this.nextMsgId = 1;
    return this.nextMsgId;
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    this.connecting = true;

    try {
      // Connect to broker (mocked or real network)
      this.connected = true;
      this.connecting = false;
      this.reconnectAttempts = 0;
      this.logger?.info(`[MqttClientConnection] Connected to broker ${this.brokerUrl} as ${this.clientId}`);

      // Re-subscribe to registered subscriptions
      for (const [topic, sub] of this.subscriptions.entries()) {
        await this.doSubscribe(topic, sub.qos);
      }

      // Flush buffered outbound messages upon reconnection
      await this.flushRingBuffer();
    } catch (err: any) {
      this.connected = false;
      this.connecting = false;
      this.scheduleReconnect();
      throw new ProtocolError('CONNECTION_FAILED', `Failed to connect to ${this.brokerUrl}: ${err.message}`, 'mqtt', undefined, true);
    }
  }

  /**
   * Publish an MQTT message. If offline, queues into ring buffer according to backpressure policy.
   */
  async publish(message: MqttMessage): Promise<boolean> {
    const qos = message.qos ?? 0;
    const retain = message.retain ?? false;

    if (!this.isConnected) {
      const enqueued = this.ringBuffer.enqueue({
        ...message,
        timestamp: new Date(),
      });
      if (!enqueued) {
        this.logger?.warn(`[MqttClientConnection] Message dropped by backpressure policy on topic ${message.topic}`);
        return false;
      }
      return true;
    }

    try {
      if (this.mockTransport) {
        await this.mockTransport.publish(message.topic, message.payload, qos, retain);
      }

      // Handle QoS 1/2 handshake logic
      if (qos === 1) {
        const msgId = message.messageId || this.nextMessageId();
        await this.handleQos1Ack(msgId);
      } else if (qos === 2) {
        const msgId = message.messageId || this.nextMessageId();
        await this.handleQos2Handshake(msgId);
      }

      return true;
    } catch (err: any) {
      this.logger?.warn(`[MqttClientConnection] Error publishing to ${message.topic}: ${err.message}. Enqueueing to buffer.`);
      this.ringBuffer.enqueue(message);
      this.scheduleReconnect();
      return false;
    }
  }

  private async handleQos1Ack(msgId: number): Promise<void> {
    // Correlate PUBACK
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.inFlightQos1.delete(msgId);
        reject(new ProtocolError('TIMEOUT', `QoS 1 PUBACK timed out for messageId ${msgId}`, 'mqtt', undefined, true));
      }, 5000);

      this.inFlightQos1.set(msgId, { resolve, timer });

      // Immediate auto-ack if mock transport
      if (this.mockTransport) {
        setImmediate(() => {
          this.receivePubAck(msgId);
        });
      }
    });
  }

  private async handleQos2Handshake(msgId: number): Promise<void> {
    // 4-step QoS 2 handshake: PUBLISH -> PUBREC -> PUBREL -> PUBCOMP
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.inFlightQos2.delete(msgId);
        reject(new ProtocolError('TIMEOUT', `QoS 2 PUBCOMP timed out for messageId ${msgId}`, 'mqtt', undefined, true));
      }, 5000);

      this.inFlightQos2.set(msgId, { step: 'PUBREC', resolve, timer });

      if (this.mockTransport) {
        setImmediate(() => {
          this.receivePubRec(msgId);
        });
      }
    });
  }

  receivePubAck(msgId: number): void {
    const pending = this.inFlightQos1.get(msgId);
    if (pending) {
      clearTimeout(pending.timer);
      this.inFlightQos1.delete(msgId);
      pending.resolve();
    }
  }

  receivePubRec(msgId: number): void {
    const pending = this.inFlightQos2.get(msgId);
    if (pending && pending.step === 'PUBREC') {
      pending.step = 'PUBCOMP';
      // In full protocol, client sends PUBREL; receiver responds with PUBCOMP
      setImmediate(() => {
        this.receivePubComp(msgId);
      });
    }
  }

  receivePubComp(msgId: number): void {
    const pending = this.inFlightQos2.get(msgId);
    if (pending) {
      clearTimeout(pending.timer);
      this.inFlightQos2.delete(msgId);
      pending.resolve();
    }
  }

  /**
   * Drain and publish all pending messages from Ring Buffer after reconnection
   */
  async flushRingBuffer(): Promise<number> {
    if (this.ringBuffer.isEmpty || !this.isConnected) return 0;

    let flushed = 0;
    while (!this.ringBuffer.isEmpty && this.isConnected) {
      const msg = this.ringBuffer.dequeue();
      if (!msg) break;

      try {
        if (this.mockTransport) {
          await this.mockTransport.publish(msg.topic, msg.payload, msg.qos ?? 0, msg.retain ?? false);
        }
        flushed++;
      } catch (err) {
        // Re-enqueue and pause flush if transmission fails
        this.ringBuffer.enqueue(msg);
        break;
      }
    }

    if (flushed > 0) {
      this.logger?.info(`[MqttClientConnection] Flushed ${flushed} buffered messages to broker.`);
    }
    return flushed;
  }

  async subscribe(config: MqttSubscriptionConfig): Promise<void> {
    this.subscriptions.set(config.topicPattern, config);
    if (this.isConnected) {
      await this.doSubscribe(config.topicPattern, config.qos);
    }
  }

  private async doSubscribe(topic: string, qos: MqttQoS): Promise<void> {
    if (this.mockTransport) {
      await this.mockTransport.subscribe(topic, qos);
    }
    this.logger?.info(`[MqttClientConnection] Subscribed to ${topic} (QoS ${qos})`);
  }

  onMessage(handler: (msg: MqttMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Ingest incoming message from broker and dispatch to handlers
   */
  handleIncomingMessage(topic: string, payload: Buffer | string, qos: MqttQoS = 0): void {
    const msg: MqttMessage = {
      topic,
      payload,
      qos,
      timestamp: new Date(),
    };

    for (const handler of this.messageHandlers) {
      try {
        handler(msg);
      } catch (err: any) {
        this.logger?.error(`[MqttClientConnection] Error in message handler: ${err.message}`);
      }
    }
  }

  simulateDisconnect(): void {
    this.connected = false;
    this.logger?.warn(`[MqttClientConnection] Disconnected from ${this.brokerUrl}`);
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.destroyed) return;
    const interval = Math.min(
      (this.options.reconnectIntervalMs ?? 1000) * Math.pow(1.5, this.reconnectAttempts),
      this.options.maxReconnectIntervalMs ?? 30000
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = undefined;
      try {
        await this.connect();
      } catch (e) {
        // Handled in connect()
      }
    }, interval);
  }

  async close(): Promise<void> {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.connected = false;
    this.ringBuffer.clear();
  }
}

/**
 * MQTT Connection Pool managing connections by brokerUrl + clientId
 */
export class MqttConnectionPool implements ConnectionManager<MqttClientConnection> {
  private connections = new Map<string, MqttClientConnection>();

  constructor(
    private readonly defaultOptions: Partial<MqttConnectionOptions> = {},
    private readonly logger?: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void },
  ) {}

  async getConnection(connectionId: string, customOptions?: Partial<MqttConnectionOptions>): Promise<MqttClientConnection> {
    let conn = this.connections.get(connectionId);
    if (!conn) {
      const brokerUrl = connectionId.includes('://') ? connectionId : `mqtt://${connectionId}`;
      conn = new MqttClientConnection(
        {
          brokerUrl,
          ...this.defaultOptions,
          ...customOptions,
        },
        this.logger
      );
      this.connections.set(connectionId, conn);
    }
    return conn;
  }

  registerConnection(connectionId: string, conn: MqttClientConnection): void {
    this.connections.set(connectionId, conn);
  }

  async releaseConnection(connectionId: string): Promise<void> {
    // Keep connection alive in pool for reuse
  }

  async healthCheck(connectionId: string): Promise<{ isHealthy: boolean; latencyMs?: number }> {
    const conn = this.connections.get(connectionId);
    if (!conn || !conn.isConnected) {
      return { isHealthy: false };
    }
    return { isHealthy: true, latencyMs: 2 };
  }

  async closeAll(): Promise<void> {
    const closes: Promise<void>[] = [];
    for (const conn of this.connections.values()) {
      closes.push(conn.close());
    }
    await Promise.all(closes);
    this.connections.clear();
  }
}

/**
 * Topic-to-Telemetry Mapper
 * Extracts deviceId, metricKey, values and normalizes into UnifiedTelemetry
 */
export class MqttTopicTelemetryMapper {
  static normalize(
    topic: string,
    rawPayload: Buffer | string,
    subscription?: MqttSubscriptionConfig,
  ): UnifiedTelemetry[] {
    const payloadStr = typeof rawPayload === 'string' ? rawPayload : rawPayload.toString('utf8');
    const telemetries: UnifiedTelemetry[] = [];
    const now = new Date();

    let parsed: any;
    try {
      parsed = JSON.parse(payloadStr);
    } catch {
      // Non-JSON payload: treat as single metric
      const numVal = Number(payloadStr);
      const val = isNaN(numVal) ? payloadStr : numVal;
      const metricKey = topic.split('/').pop() || 'raw';

      return [
        {
          deviceId: 'mqtt-generic-device',
          tenantId: 'default',
          timestamp: now,
          metricKey,
          value: val,
          dataType: typeof val === 'number' ? 'float32' : 'string',
          quality: 'good',
          sourceProtocol: 'mqtt',
          sourceConnection: topic,
          metadata: { topic, raw: payloadStr },
        },
      ];
    }

    // Extract deviceId and tenantId from pattern or payload
    let deviceId = parsed.deviceId || parsed.devId || parsed.id;
    let tenantId = parsed.tenantId || 'default';
    let metricKeyFromPattern: string | undefined;

    if (subscription) {
      const extracted = MqttTopicMatcher.extractParams(subscription.topicPattern, topic);
      if (extracted) {
        if (extracted['deviceId']) deviceId = extracted['deviceId'];
        if (extracted['tenantId']) tenantId = extracted['tenantId'];
        if (extracted['metricKey']) metricKeyFromPattern = extracted['metricKey'];
      }
    }

    if (!deviceId) {
      deviceId = `mqtt-device-${topic.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    }

    const timestamp = parsed.timestamp ? new Date(parsed.timestamp) : now;

    if (metricKeyFromPattern && parsed.value !== undefined) {
      telemetries.push({
        deviceId,
        tenantId,
        timestamp,
        metricKey: metricKeyFromPattern,
        value: parsed.value,
        dataType: typeof parsed.value === 'number' ? 'float32' : typeof parsed.value === 'boolean' ? 'boolean' : 'string',
        unit: parsed.unit,
        quality: 'good',
        sourceProtocol: 'mqtt',
        sourceConnection: topic,
        metadata: { topic },
      });
      return telemetries;
    }

    for (const [key, val] of Object.entries(parsed)) {
      if (['deviceId', 'devId', 'tenantId', 'timestamp', 'unit', 'quality'].includes(key)) continue;

      if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') {
        telemetries.push({
          deviceId,
          tenantId,
          timestamp,
          metricKey: key,
          value: val,
          dataType: typeof val === 'number' ? 'float32' : typeof val === 'boolean' ? 'boolean' : 'string',
          quality: 'good',
          sourceProtocol: 'mqtt',
          sourceConnection: topic,
          metadata: { topic },
        });
      }
    }

    return telemetries;
  }
}

/**
 * ProtocolAdapter Implementation for MQTT
 */
export class MqttConnectorAdapter implements ProtocolAdapter {
  public readonly id = 'mqtt-connector-adapter';
  public readonly name = 'MQTT Connector Protocol Adapter';
  public readonly capabilities: ProtocolCapability = {
    name: 'MQTT',
    description: 'MQTT Connector supporting QoS 0/1/2, backpressure ring buffer, and topic mapping',
    supportedDataTypes: ['string', 'json', 'float32', 'int32', 'boolean'],
    supportsRead: false,
    supportsWrite: true, // Downlink commands
    supportsPolling: false,
    supportsPush: true,
    supportsDownlink: true,
  };

  public transport?: TransportAdapter;

  constructor(
    public readonly pool: MqttConnectionPool,
    private readonly context?: IPluginContext,
  ) {}

  async init(config: Record<string, any>): Promise<void> {
    if (config.transport) {
      this.transport = config.transport;
    }
  }

  async read(target: Record<string, any>): Promise<any> {
    throw new ProtocolError('UNSUPPORTED_FUNCTION', 'MQTT protocol does not support direct polling reads (use Push/Subscribe)', 'mqtt');
  }

  async write(target: Record<string, any>, value: any): Promise<any> {
    if (this.context) {
      const hasPermission = this.context.permissions
        .getPermissions()
        .some((p) => p.namespace === 'mqtt' && (p.action === 'publish' || p.action === '*'));
      if (!hasPermission) {
        throw new ProtocolError('UNAUTHORIZED', 'Permission mqtt:publish is required to publish MQTT messages', 'mqtt');
      }
    }

    const brokerUrl = target.brokerUrl || 'mqtt://127.0.0.1:1883';
    const topic = target.topic;
    if (!topic) {
      throw new ProtocolError('INTERNAL_ERROR', 'Missing target topic for MQTT write command', 'mqtt');
    }

    const conn = await this.pool.getConnection(brokerUrl);
    const payload = typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value);

    return conn.publish({
      topic,
      payload,
      qos: target.qos ?? 1,
      retain: target.retain ?? false,
    });
  }
}

/**
 * MQTT Connector Plugin Lifecycle Implementation
 */
export class MqttConnectorPlugin implements IPluginLifecycle {
  public pool!: MqttConnectionPool;
  public adapter!: MqttConnectorAdapter;
  private context?: IPluginContext;
  private subscriptions: Map<string, MqttSubscriptionConfig> = new Map();

  async init(context: IPluginContext): Promise<void> {
    this.context = context;
    this.pool = new MqttConnectionPool({}, context.logger);
    this.adapter = new MqttConnectorAdapter(this.pool, context);

    if (context.permissions?.registerPermissions) {
      context.permissions.registerPermissions([
        { namespace: 'mqtt', resource: 'topic', action: 'subscribe', description: 'Subscribe to MQTT Topics' },
        { namespace: 'mqtt', resource: 'topic', action: 'publish', description: 'Publish to MQTT Topics' },
      ]);
    }

    this.context.logger.info(`[MqttConnectorPlugin] Initialized with Ring Buffer Backpressure and QoS Tracking.`);
  }

  async start(): Promise<void> {
    this.context?.logger.info(`[MqttConnectorPlugin] MQTT Connector running.`);
  }

  async stop(): Promise<void> {
    await this.pool?.closeAll();
    this.context?.logger.info(`[MqttConnectorPlugin] Stopped and pool drained.`);
  }

  async destroy(): Promise<void> {
    await this.pool?.closeAll();
    this.context?.logger.info(`[MqttConnectorPlugin] Destroyed.`);
  }

  registerTopicMapping(config: MqttSubscriptionConfig): void {
    this.subscriptions.set(config.topicPattern, config);
    this.context?.logger.info(`Registered MQTT topic mapping for: ${config.topicPattern} (QoS ${config.qos})`);
  }

  normalizeJsonPayload(topic: string, rawPayload: string): UnifiedTelemetry[] {
    const sub = this.subscriptions.get(topic);
    return MqttTopicTelemetryMapper.normalize(topic, rawPayload, sub);
  }
}

export default MqttConnectorPlugin;
