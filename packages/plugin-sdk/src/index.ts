/**
 * Universal Industrial IoT - Plugin SDK Core Contracts
 * Platform Architecture Standard Specification
 */

// ==========================================
// 1. PLUGIN MANIFEST, DEFINITION & LIFECYCLE
// ==========================================

export type PluginType = 'protocol' | 'transport' | 'connector' | 'application' | 'data-processing';

export type PluginLifecycleState =
  | 'DISCOVERED'
  | 'VALIDATED'
  | 'RESOLVED'
  | 'LOADED'
  | 'INITIALIZED'
  | 'STARTED'
  | 'READY'
  | 'STOPPED'
  | 'DISABLED'
  | 'FAILED'
  | 'INCOMPATIBLE'
  | 'QUARANTINED';

export interface PluginDependency {
  id: string;
  version: string; // SemVer range (e.g., "^1.0.0", ">=1.2.0")
  optional?: boolean;
}

export interface PluginCapability {
  name: string;
  version?: string;
  description?: string;
  parametersSchema?: Record<string, any>;
}

export interface PluginConfigProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  default?: any;
  description?: string;
  enum?: (string | number)[];
}

export interface PluginConfigSchema {
  type: 'object';
  properties: Record<string, PluginConfigProperty>;
  required?: string[];
}

export interface PluginUIExtension {
  slot: 'dashboard-widget' | 'device-detail-tab' | 'navigation-item' | 'settings-panel' | 'standalone-page' | string;
  title: string;
  icon?: string;
  componentPath?: string;
  component?: string;
  order?: number;
  permissions?: string[];
}

export interface PluginManifest {
  id: string; // e.g. 'modbus-rtu', 'mqtt-connector', 'chirpstack-connector'
  name: string;
  version: string;
  type: PluginType;
  entry: string;
  capabilities: (string | PluginCapability)[];
  permissions: (string | DeclaredPermission)[];
  dependencies?: PluginDependency[];
  author?: string;
  description?: string;
  license?: string;
  minCoreVersion?: string;
  maxCoreVersion?: string;
  configSchema?: PluginConfigSchema;
  healthCheck?: {
    intervalMs?: number;
    timeoutMs?: number;
  };
  ui?: PluginUIExtension | {
    component?: string;
    slot?: string;
  };
}

export interface IPluginLifecycle {
  init(context: IPluginContext): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
}

export interface PluginDefinition {
  manifest: PluginManifest;
  createInstance: () => IPluginLifecycle;
}

// ==========================================
// 2. PLUGIN HEALTH & LOGGING
// ==========================================

export type PluginHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface PluginHealthResult {
  status: PluginHealthStatus;
  details?: Record<string, any>;
  message?: string;
  timestamp: Date;
}

export interface PluginHealthCheck {
  checkHealth(): Promise<PluginHealthResult>;
}

export interface PluginLogger {
  info(msg: string, ...args: any[]): void;
  warn(msg: string, ...args: any[]): void;
  error(msg: string, ...args: any[]): void;
  debug(msg: string, ...args: any[]): void;
}

// ==========================================
// 3. SERVICE & PERMISSION REGISTRIES
// ==========================================

export interface PluginServiceRegistry {
  registerService<T = any>(serviceName: string, serviceInstance: T, metadata?: Record<string, any>): void;
  getService<T = any>(serviceName: string): T | undefined;
  hasService(serviceName: string): boolean;
  listServices(): Array<{ name: string; metadata?: Record<string, any> }>;
  unregisterService(serviceName: string): boolean;
}

export interface DeclaredPermission {
  namespace: string; // e.g. 'core', 'modbus', 'lorawan', 'mqtt'
  resource: string;  // e.g. 'device', 'register', 'packet', 'gateway'
  action: string;    // e.g. 'read', 'write', 'execute', 'provision', 'delete'
  description?: string;
}

export interface PluginPermissionRegistry {
  registerPermission(permission: DeclaredPermission): void;
  registerPermissions(permissions: DeclaredPermission[]): void;
  getPermissions(): DeclaredPermission[];
}

// ==========================================
// 4. DATABASE CONTEXT & EVENT BUS
// ==========================================

export interface PluginDatabaseContext {
  schemaName: string;
  query<T = any>(sql: string, parameters?: any[]): Promise<T>;
  transaction<T = any>(runInTransaction: (queryRunner: any) => Promise<T>): Promise<T>;
}

export interface EventEnvelope<T = any> {
  id: string;
  topic: string;
  payload: T;
  source: string;
  timestamp: string; // ISO 8601
  tenantId?: string;
  correlationId?: string;
  causationId?: string;
  version?: string;
}

export type EventSubscriptionHandler<T = any> = (envelope: EventEnvelope<T>) => void | Promise<void>;

export interface PluginEventBus {
  publish<T = any>(topic: string, payload: T, metadata?: Partial<EventEnvelope<T>>): Promise<void>;
  subscribe<T = any>(topicPattern: string, handler: EventSubscriptionHandler<T>): () => void;
  unsubscribe?(topicPattern: string, handler: EventSubscriptionHandler<any>): void;
}

export interface IPluginContext {
  manifest: PluginManifest;
  config: Record<string, any>;
  logger: PluginLogger;
  eventBus: PluginEventBus & {
    emit(event: string, payload: any): void;
    on(event: string, handler: (payload: any) => void): void;
    off(event: string, handler: (payload: any) => void): void;
  };
  services: PluginServiceRegistry;
  permissions: PluginPermissionRegistry;
  database?: PluginDatabaseContext;
  health?: PluginHealthCheck;
}

// ==========================================
// 5. PROTOCOL & TRANSPORT ABSTRACTIONS
// ==========================================

export interface TransportAdapter {
  id: string;
  type: 'serial' | 'tcp' | 'websocket' | 'tls' | 'custom';
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  send(data: Buffer | Uint8Array | string): Promise<boolean>;
  onData(handler: (data: Buffer | Uint8Array) => void): void;
  onError(handler: (err: Error) => void): void;
}

export interface ProtocolCapability {
  name: string;
  description?: string;
  supportedDataTypes: string[];
  supportsRead: boolean;
  supportsWrite: boolean;
  supportsPolling: boolean;
  supportsPush: boolean;
  supportsDownlink?: boolean;
}

export interface ProtocolAdapter {
  id: string;
  name: string;
  capabilities: ProtocolCapability;
  transport?: TransportAdapter;
  init(config: Record<string, any>): Promise<void>;
  read(target: Record<string, any>): Promise<any>;
  write(target: Record<string, any>, value: any): Promise<any>;
}

export interface ConnectionManager<T = any> {
  getConnection(connectionId: string): Promise<T>;
  releaseConnection(connectionId: string): Promise<void>;
  healthCheck(connectionId: string): Promise<{ isHealthy: boolean; latencyMs?: number }>;
  closeAll(): Promise<void>;
}

export type ProtocolErrorCode =
  | 'TIMEOUT'
  | 'CONNECTION_FAILED'
  | 'CRC_ERROR'
  | 'FRAME_ERROR'
  | 'UNSUPPORTED_FUNCTION'
  | 'DEVICE_BUSY'
  | 'AUTHENTICATION_FAILED'
  | 'DEVICE_NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'INTERNAL_ERROR';

export class ProtocolError extends Error {
  public readonly timestamp: Date;

  constructor(
    public readonly code: ProtocolErrorCode,
    message: string,
    public readonly protocol: string,
    public readonly target?: string,
    public readonly isRetryable: boolean = false,
    public readonly raw?: Buffer | Uint8Array | string,
  ) {
    super(`[${protocol}] ${code}: ${message}`);
    this.name = 'ProtocolError';
    this.timestamp = new Date();
  }
}

export interface ProtocolMessage<T = any> {
  protocol: string;
  endpoint: string;
  timestamp: Date;
  data: T;
  raw?: Buffer | Uint8Array;
}

// ==========================================
// 6. UNIFIED DEVICE REGISTRY ENTITIES & INTERFACES
// ==========================================

export type UnifiedDeviceStatus = 'online' | 'offline' | 'error' | 'maintenance' | 'unprovisioned';

export interface DeviceIdentity {
  type: string; // 'deveui' | 'modbus_unit' | 'mqtt_client_id' | 'serial_port' | 'custom'
  namespace: string; // e.g. 'lorawan:chirpstack', 'modbus:rs485', 'mqtt:broker'
  value: string;
  metadata?: Record<string, any>;
}

export interface DeviceCapabilityItem {
  name: string;
  type: 'telemetry' | 'command' | 'configuration' | 'firmware_update';
  description?: string;
  schema?: Record<string, any>;
}

export interface DeviceProfile {
  id: string;
  name: string;
  tenantId: string;
  manufacturer?: string;
  model?: string;
  protocolType: string;
  driverId?: string;
  capabilities?: DeviceCapabilityItem[];
  telemetrySchema?: Record<string, any>;
  commandSchema?: Record<string, any>;
  configurationSchema?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface DeviceConnection {
  connectionId: string;
  protocolType: string;
  endpoint: string;
  state: 'connected' | 'disconnected' | 'connecting' | 'error';
  lastActivityAt?: Date;
  config?: Record<string, any>;
}

export interface DeviceOwnership {
  tenantId: string;
  organizationId?: string;
  ownerUserId?: string;
  groupIds?: string[];
}

export interface DeviceGroup {
  id: string;
  name: string;
  tenantId: string;
  description?: string;
  parentGroupId?: string;
}

export interface UnifiedDevice {
  id: string;
  tenantId: string;
  name: string;
  identities?: DeviceIdentity[];
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  deviceProfileId?: string;
  profile?: DeviceProfile;
  protocolType: string; // 'modbus-rtu' | 'modbus-tcp' | 'mqtt' | 'lorawan'
  connectionConfig: Record<string, any>;
  connections?: DeviceConnection[];
  ownership?: DeviceOwnership;
  status: UnifiedDeviceStatus;
  lastSeen?: Date;
  metadata?: Record<string, any>;
}

export interface RawDevicePayload {
  deviceId: string;
  timestamp: Date;
  sourceProtocol: string;
  rawBytes?: Buffer;
  rawJson?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface DeviceDriver {
  driverId: string;
  protocolType: string;
  supportedModels: string[];
  readData(device: UnifiedDevice, command?: any): Promise<RawDevicePayload>;
  decodeData(raw: RawDevicePayload): Promise<NormalizedMetric[]>;
  writeConfiguration?(device: UnifiedDevice, params: Record<string, any>): Promise<boolean>;
}

// ==========================================
// 7. UNIFIED TELEMETRY ENGINE
// ==========================================

export type MetricQuality = 'good' | 'uncertain' | 'bad' | 'stale' | 'GOOD' | 'UNCERTAIN' | 'BAD' | 'STALE';

export interface NormalizedMetric {
  metricKey: string;
  value: number | string | boolean | Record<string, any>;
  dataType: 'boolean' | 'int' | 'float' | 'string' | 'json';
  unit?: string;
  quality: MetricQuality;
  metadata?: Record<string, any>;
}

export interface UnifiedTelemetry {
  deviceId: string;
  tenantId: string;
  timestamp: Date;
  metricKey: string;
  value: number | string | boolean | Record<string, any>;
  dataType: string;
  unit?: string;
  quality: MetricQuality;
  sourceProtocol: string;
  sourceConnection?: string;
  metadata?: Record<string, any>;
}

export interface TelemetryNormalizer {
  normalize(raw: any): Promise<UnifiedTelemetry[]> | UnifiedTelemetry[];
}

// ==========================================
// 8. COMMAND DISPATCHER & SAFETY
// ==========================================

export interface DeviceCommand {
  commandId: string;
  deviceId: string;
  action: string;
  parameters: Record<string, any>;
  requestedBy: string;
  timestamp: Date;
  timeoutMs?: number;
}

export interface CommandDispatcher {
  dispatch(command: DeviceCommand): Promise<{ success: boolean; result?: any; error?: string }>;
}

// ==========================================
// 9. MODBUS SHARED CODECS & HELPERS
// ==========================================
export * from './modbus-codec';

// ==========================================
// 10. REMOTE PLUGIN LOADING & SECURITY SANDBOX
// ==========================================

export type RemotePluginFormat = 'esm' | 'umd' | 'cjs';

export type PluginIsolationLevel = 'process' | 'worker_thread' | 'in_process_vm' | 'direct';

export interface PluginSandboxPolicy {
  isolationLevel: PluginIsolationLevel;
  maxMemoryMb?: number;
  cpuTimeoutMs?: number;
  allowedNetworkHosts?: string[];
  allowOutboundNetwork?: boolean;
  storageQuotaMb?: number;
  restrictedGlobals?: string[];
}

export type UIExtensionSlot = 'route' | 'nav-item' | 'dashboard-widget' | 'device-detail-tab' | 'settings-panel';

export interface RemoteUIExtension {
  slot: UIExtensionSlot;
  title: string;
  path?: string;
  icon?: string;
  order?: number;
  componentExport?: string;
  requiredPermissions?: string[];
  props?: Record<string, any>;
}

export interface RemotePluginManifest extends PluginManifest {
  remoteEntry?: string;
  format?: RemotePluginFormat;
  integrity?: string;
  repository?: {
    type: 'git';
    url: string;
    branch?: string;
    releaseTag?: string;
  };
  uiExtensions?: RemoteUIExtension[];
  backendEntry?: string;
  sandboxPolicy?: PluginSandboxPolicy;
}

export interface RemotePluginRecord {
  id: string;
  manifest: RemotePluginManifest;
  status: PluginLifecycleState;
  installedAt: Date;
  updatedAt: Date;
  loadedFrom: 'local_disk' | 'github_release' | 'npm_registry' | 'remote_url';
  quarantineReason?: string;
  runtimeMetrics?: {
    memoryUsageMb: number;
    uptimeSeconds: number;
    errorCount: number;
  };
}

export interface DynamicPluginRegistry {
  registerRemotePlugin(manifest: RemotePluginManifest, options?: { autoStart?: boolean }): Promise<RemotePluginRecord>;
  unregisterPlugin(id: string): Promise<boolean>;
  getPlugin(id: string): RemotePluginRecord | undefined;
  listPlugins(filter?: { type?: PluginType; status?: PluginLifecycleState }): RemotePluginRecord[];
  transitionState(id: string, targetState: PluginLifecycleState, reason?: string): Promise<boolean>;
}

export interface DynamicPluginLoader {
  loadRemoteManifest(manifestUrl: string): Promise<RemotePluginManifest>;
  loadFromUrl(bundleUrl: string, checksum?: string): Promise<RemotePluginRecord>;
  unload(pluginId: string): Promise<void>;
  reload(pluginId: string): Promise<RemotePluginRecord>;
}

export * from './dynamic-loader';

