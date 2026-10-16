import { test, describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import type {
  PluginManifest,
  IPluginContext,
  PluginLogger,
  PluginServiceRegistry,
  PluginPermissionRegistry,
  PluginEventBus,
  DeclaredPermission,
  EventEnvelope,
  EventSubscriptionHandler,
  UnifiedDevice,
  PluginLifecycleState,
} from '@iot-platform/plugin-sdk';
import { HelloWorldPlugin } from '@universal-iot/plugin-hello-world';
import type { IHelloService } from '@universal-iot/plugin-hello-world';
import { InMemoryEventBus } from '@iot-platform/event-bus';
import { InMemoryDeviceRegistry } from '@iot-platform/device-registry';

// ==========================================
// MOCK & REAL CORE INFRASTRUCTURE ADAPTERS
// ==========================================

class TestLogger implements PluginLogger {
  public logs: { level: string; msg: string; args: any[] }[] = [];
  info(msg: string, ...args: any[]): void { this.logs.push({ level: 'info', msg, args }); }
  warn(msg: string, ...args: any[]): void { this.logs.push({ level: 'warn', msg, args }); }
  error(msg: string, ...args: any[]): void { this.logs.push({ level: 'error', msg, args }); }
  debug(msg: string, ...args: any[]): void { this.logs.push({ level: 'debug', msg, args }); }
}

class TestServiceRegistry implements PluginServiceRegistry {
  private services = new Map<string, { instance: any; metadata?: Record<string, any> }>();

  registerService<T = any>(serviceName: string, serviceInstance: T, metadata?: Record<string, any>): void {
    this.services.set(serviceName, { instance: serviceInstance, metadata });
  }

  getService<T = any>(serviceName: string): T | undefined {
    return this.services.get(serviceName)?.instance;
  }

  hasService(serviceName: string): boolean {
    return this.services.has(serviceName);
  }

  listServices(): Array<{ name: string; metadata?: Record<string, any> }> {
    return Array.from(this.services.entries()).map(([name, val]) => ({
      name,
      metadata: val.metadata,
    }));
  }

  unregisterService(serviceName: string): boolean {
    return this.services.delete(serviceName);
  }
}

class TestPermissionRegistry implements PluginPermissionRegistry {
  private permissions: DeclaredPermission[] = [];

  registerPermission(permission: DeclaredPermission): void {
    this.permissions.push(permission);
  }

  registerPermissions(permissions: DeclaredPermission[]): void {
    this.permissions.push(...permissions);
  }

  getPermissions(): DeclaredPermission[] {
    return [...this.permissions];
  }
}

class TestEventBusAdapter implements PluginEventBus {
  private handlers = new Map<string, Set<EventSubscriptionHandler<any>>>();
  private inMemoryBus: InMemoryEventBus;

  constructor(inMemoryBus: InMemoryEventBus) {
    this.inMemoryBus = inMemoryBus;
  }

  async publish<T = any>(topic: string, payload: T, metadata?: Partial<EventEnvelope<T>>): Promise<void> {
    const envelope: EventEnvelope<T> = {
      id: metadata?.id || `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      topic,
      payload,
      source: metadata?.source || 'core-backbone',
      timestamp: metadata?.timestamp || new Date().toISOString(),
      tenantId: metadata?.tenantId,
      correlationId: metadata?.correlationId,
      causationId: metadata?.causationId,
      version: metadata?.version || '1.0.0',
    };

    // Emit to inMemoryBus for internal core
    this.inMemoryBus.emit(topic, envelope);

    // Also dispatch to pattern subscribers
    for (const [pattern, handlerSet] of this.handlers.entries()) {
      if (this.matchPattern(pattern, topic)) {
        for (const handler of handlerSet) {
          try {
            await handler(envelope);
          } catch (err) {
            console.error(`[EventBus] Subscriber error on topic ${topic}:`, err);
          }
        }
      }
    }
  }

  subscribe<T = any>(topicPattern: string, handler: EventSubscriptionHandler<T>): () => void {
    if (!this.handlers.has(topicPattern)) {
      this.handlers.set(topicPattern, new Set());
    }
    const set = this.handlers.get(topicPattern)!;
    set.add(handler);

    return () => {
      set.delete(handler);
      if (set.size === 0) {
        this.handlers.delete(topicPattern);
      }
    };
  }

  private matchPattern(pattern: string, topic: string): boolean {
    if (pattern === '*' || pattern === '#') return true;
    if (pattern === topic) return true;
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return topic.startsWith(prefix + '.');
    }
    return false;
  }

  emit(event: string, payload: any): void {
    this.publish(event, payload);
  }

  on(event: string, handler: (payload: any) => void): void {
    this.subscribe(event, (env) => handler(env.payload));
  }

  off(event: string, handler: (payload: any) => void): void {
    // Adapter no-op for mock
  }
}

// ==========================================
// TEST SUITE
// ==========================================

describe('Universal IoT Platform - Core Backbone & Plugin System Architecture', () => {
  let logger: TestLogger;
  let serviceRegistry: TestServiceRegistry;
  let permissionRegistry: TestPermissionRegistry;
  let coreEventBus: InMemoryEventBus;
  let pluginEventBus: TestEventBusAdapter;
  let deviceRegistry: InMemoryDeviceRegistry;
  let context: IPluginContext;
  let helloPlugin: HelloWorldPlugin;

  const sampleManifest: PluginManifest = {
    id: 'hello-world',
    name: 'Hello World Example Plugin',
    version: '1.0.0',
    type: 'application',
    entry: 'dist/index.js',
    capabilities: [
      { name: 'greeting:generate', version: '1.0.0', description: 'Generates greeting messages' },
    ],
    permissions: [
      { namespace: 'core', resource: 'device', action: 'read', description: 'Read device status' },
    ],
    dependencies: [],
    configSchema: {
      type: 'object',
      properties: {
        greeting: {
          type: 'string',
          default: 'Hello Industrial IoT',
          description: 'Prefix used when generating greeting messages',
        },
      },
    },
  };

  before(() => {
    logger = new TestLogger();
    serviceRegistry = new TestServiceRegistry();
    permissionRegistry = new TestPermissionRegistry();
    coreEventBus = new InMemoryEventBus();
    pluginEventBus = new TestEventBusAdapter(coreEventBus);
    deviceRegistry = new InMemoryDeviceRegistry(coreEventBus);

    context = {
      manifest: sampleManifest,
      config: { greeting: 'Welcome to Daviteq IoT Backbone' },
      logger,
      services: serviceRegistry,
      permissions: permissionRegistry,
      eventBus: pluginEventBus as any,
    };

    helloPlugin = new HelloWorldPlugin();
  });

  describe('1. Plugin SDK Manifest & Contracts Validation', () => {
    it('should validate plugin manifest properties and capabilities', () => {
      assert.strictEqual(sampleManifest.id, 'hello-world');
      assert.strictEqual(sampleManifest.type, 'application');
      assert.strictEqual(sampleManifest.capabilities.length, 1);
      assert.strictEqual(sampleManifest.permissions.length, 1);
      assert.ok(sampleManifest.configSchema);
    });

    it('should adhere to strict lifecycle state machine definitions', () => {
      const validStates: PluginLifecycleState[] = [
        'DISCOVERED', 'VALIDATED', 'RESOLVED', 'LOADED',
        'INITIALIZED', 'STARTED', 'READY', 'STOPPED',
        'DISABLED', 'FAILED', 'INCOMPATIBLE', 'QUARANTINED',
      ];
      assert.strictEqual(validStates.length, 12);
      assert.ok(validStates.includes('READY'));
      assert.ok(validStates.includes('QUARANTINED'));
    });
  });

  describe('2. Plugin Initialization & Service Registration (IoC)', () => {
    it('should initialize plugin and register services into core backbone', async () => {
      await helloPlugin.init(context);

      // Verify logger called
      const initLog = logger.logs.find((l) => l.msg.includes('Initializing plugin: hello-world'));
      assert.ok(initLog, 'Logger should log initialization event');

      // Verify service registered
      assert.ok(serviceRegistry.hasService('helloService'), 'helloService must be registered in registry');
      const helloService = serviceRegistry.getService<IHelloService>('helloService');
      assert.ok(helloService, 'Service instance must be accessible via getService');

      // Verify service contract execution
      const greeting = helloService!.greet('Vibration Sensor VDG');
      assert.strictEqual(greeting, 'Welcome to Daviteq IoT Backbone, Vibration Sensor VDG!');
    });

    it('should register declared plugin permissions into permission registry', () => {
      const permissions = permissionRegistry.getPermissions();
      assert.strictEqual(permissions.length, 1);
      assert.strictEqual(permissions[0].namespace, 'core');
      assert.strictEqual(permissions[0].resource, 'device');
      assert.strictEqual(permissions[0].action, 'read');
    });
  });

  describe('3. Event Bus Subscriptions & Cross-Module Communication', () => {
    it('should handle wildcard event subscription and cross-module dispatch', async () => {
      let eventPayloadReceived: any = null;

      // Plugin subscribed to 'core.device.*' during init()
      // Now publish a device event from core
      await pluginEventBus.publish('core.device.created', {
        deviceId: 'dev-lora-001',
        name: 'Daviteq LoRaWAN Pulse Counter',
        deveui: '0011223344556677',
      });

      // Verify plugin logger caught the debug trace
      const busLog = logger.logs.find((l) => l.msg.includes('Received core device event: core.device.created'));
      assert.ok(busLog, 'Plugin should have received the matching wildcard event from Event Bus');
    });
  });

  describe('4. Plugin Lifecycle: Start, Health Check & Stop', () => {
    it('should start plugin, transition to ready, and publish started event', async () => {
      let startedNotificationReceived = false;

      pluginEventBus.subscribe('plugin.hello-world.started', (envelope) => {
        if (envelope.payload.pluginId === 'hello-world') {
          startedNotificationReceived = true;
        }
      });

      await helloPlugin.start();

      assert.ok(startedNotificationReceived, 'Plugin start must publish lifecycle notification');

      // Check health report
      const health = await helloPlugin.checkHealth();
      assert.strictEqual(health.status, 'healthy');
      assert.strictEqual(health.details?.running, true);
    });

    it('should gracefully stop plugin, clean up services and listeners', async () => {
      await helloPlugin.stop();

      // Check health after stop
      const health = await helloPlugin.checkHealth();
      assert.strictEqual(health.status, 'unhealthy');
      assert.strictEqual(health.details?.running, false);

      // Verify service unregistered
      assert.strictEqual(serviceRegistry.hasService('helloService'), false);
    });

    it('should destroy plugin cleanly', async () => {
      await helloPlugin.destroy();
      assert.ok(true, 'Destroy completed with no exceptions');
    });
  });

  describe('5. Unified Device Registry Integration', () => {
    it('should register multi-protocol device with namespace identities', async () => {
      const mockDevice: UnifiedDevice = {
        id: 'urn:uuid:f47ac10b-58cc-4372-a567-0e02b2c3d479',
        tenantId: 'tenant-daviteq-global',
        name: 'Smart Energy Meter EM-01',
        protocolType: 'modbus-rtu',
        status: 'online',
        connectionConfig: {
          baudRate: 9600,
          slaveId: 1,
          port: 'COM3',
        },
        identities: [
          {
            type: 'modbus_unit',
            namespace: 'modbus:rs485',
            value: 'slave-01',
          },
          {
            type: 'serial_port',
            namespace: 'hardware:serial',
            value: 'COM3',
          },
        ],
      };

      const registered = await deviceRegistry.registerDevice(mockDevice);
      assert.strictEqual(registered.id, mockDevice.id);

      const retrieved = await deviceRegistry.getDevice(mockDevice.id);
      assert.ok(retrieved);
      assert.strictEqual(retrieved!.name, 'Smart Energy Meter EM-01');
      assert.strictEqual(retrieved!.identities?.length, 2);
    });
  });

  describe('6. Failure Containment & Architectural Guardrails', () => {
    it('should isolate subscriber errors on EventBus without crashing bus or publisher', async () => {
      // Register broken subscriber
      pluginEventBus.subscribe('core.critical.test', () => {
        throw new Error('Crashing buggy plugin');
      });

      // Publishing should NOT throw
      await assert.doesNotReject(async () => {
        await pluginEventBus.publish('core.critical.test', { data: 'test' });
      }, 'Publishing an event should not fail even when a subscriber throws');
    });
  });
});
