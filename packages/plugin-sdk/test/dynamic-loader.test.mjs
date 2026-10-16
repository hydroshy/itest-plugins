import { test } from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import {
  DynamicPluginLoaderService,
  PluginSecuritySandbox,
  SandboxSecurityViolationError,
} from '../dist/index.js';

test('DynamicPluginLoader - Manifest validation and registration', async () => {
  const loader = new DynamicPluginLoaderService();

  const manifest = {
    id: 'plugin-modbus-remote',
    name: 'Remote Modbus Master Plugin',
    version: '1.2.0',
    type: 'PROTOCOL_DRIVER',
    description: 'Standalone remote Modbus RTU/TCP driver',
    author: 'Protocol Engineer',
    entryPoint: 'dist/index.js',
    remoteEntry: 'https://cdn.iot-platform.internal/plugins/modbus-v1.2.0.esm.js',
    format: 'esm',
    capabilities: [{ type: 'COMMUNICATION', name: 'modbus-rtu' }],
    uiExtensions: [
      {
        slot: 'route',
        title: 'Modbus Explorer',
        path: '/devices/modbus',
        componentExport: 'ModbusExplorer',
      },
      {
        slot: 'nav-item',
        title: 'Modbus Network',
        icon: 'network-wired',
        order: 10,
      },
    ],
  };

  const record = await loader.registerRemotePlugin(manifest);
  assert.strictEqual(record.id, 'plugin-modbus-remote');
  assert.strictEqual(record.status, 'VALIDATED');
  assert.strictEqual(record.loadedFrom, 'remote_url');

  // Verify route ingestion
  const routes = loader.getInjectedRoutes('plugin-modbus-remote');
  assert.strictEqual(routes.length, 2);
  assert.strictEqual(routes[0].path, '/devices/modbus');
  assert.strictEqual(routes[1].icon, 'network-wired');
});

test('DynamicPluginLoader - Auto-start FSM transitions to READY', async () => {
  const loader = new DynamicPluginLoaderService();

  const manifest = {
    id: 'plugin-mqtt-broker',
    name: 'MQTT Broker Integration',
    version: '2.0.1',
    type: 'INTEGRATION',
    description: 'Remote MQTT broker gateway',
    author: 'Backend Team',
    entryPoint: 'dist/index.js',
    capabilities: [{ type: 'COMMUNICATION', name: 'mqtt' }],
  };

  const record = await loader.registerRemotePlugin(manifest, { autoStart: true });
  assert.strictEqual(record.status, 'READY');

  // Stopping
  await loader.transitionState(record.id, 'STOPPED', 'Maintenance mode');
  assert.strictEqual(loader.getPlugin(record.id)?.status, 'STOPPED');

  // Restarting
  await loader.transitionState(record.id, 'STARTED');
  await loader.transitionState(record.id, 'READY');
  assert.strictEqual(loader.getPlugin(record.id)?.status, 'READY');
});

test('DynamicPluginLoader - Invalid FSM state transition throws', async () => {
  const loader = new DynamicPluginLoaderService();

  const manifest = {
    id: 'test-fsm-invalid',
    name: 'FSM Test',
    version: '1.0.0',
    type: 'EXTENSION',
    description: 'Test',
    author: 'Test',
    entryPoint: 'index.js',
    capabilities: [],
  };

  const record = await loader.registerRemotePlugin(manifest);
  assert.strictEqual(record.status, 'VALIDATED');

  // VALIDATED cannot jump directly to READY
  await assert.rejects(
    async () => {
      await loader.transitionState(record.id, 'READY');
    },
    /Invalid state transition/
  );
});

test('PluginSecuritySandbox - Network host whitelist enforcement', () => {
  const sandbox = new PluginSecuritySandbox();

  const manifest = {
    id: 'plugin-secure-api',
    name: 'Secure API Plugin',
    version: '1.0.0',
    type: 'EXTENSION',
    description: 'Network-restricted plugin',
    author: 'Security Architect',
    entryPoint: 'index.js',
    capabilities: [],
    sandboxPolicy: {
      isolationLevel: 'in_process_vm',
      allowOutboundNetwork: true,
      allowedNetworkHosts: ['api.industrial-cloud.io', '*.local.lan'],
    },
  };

  // Allowed exact host
  assert.doesNotThrow(() => {
    sandbox.checkNetworkPermission(manifest, 'api.industrial-cloud.io');
  });

  // Allowed wildcard domain
  assert.doesNotThrow(() => {
    sandbox.checkNetworkPermission(manifest, 'plc1.local.lan');
  });

  // Disallowed external host
  assert.throws(
    () => {
      sandbox.checkNetworkPermission(manifest, 'evil-exfiltration.com');
    },
    (err) => err instanceof SandboxSecurityViolationError && err.violation.includes('rejected')
  );
});

test('PluginSecuritySandbox - Outbound network disabled by policy', () => {
  const sandbox = new PluginSecuritySandbox();

  const manifest = {
    id: 'plugin-offline-calc',
    name: 'Offline Math Engine',
    version: '1.0.0',
    type: 'EXTENSION',
    description: 'Air-gapped calculation plugin',
    author: 'Security Architect',
    entryPoint: 'index.js',
    capabilities: [],
    sandboxPolicy: {
      isolationLevel: 'in_process_vm',
      allowOutboundNetwork: false,
    },
  };

  assert.throws(
    () => {
      sandbox.checkNetworkPermission(manifest, 'anywhere.com');
    },
    (err) => err instanceof SandboxSecurityViolationError && err.violation.includes('disabled by policy')
  );
});

test('PluginSecuritySandbox - Subresource Integrity (SRI) Checksum verification', () => {
  const sandbox = new PluginSecuritySandbox();
  const bundleCode = 'console.log("Universal IoT Remote Plugin Bundle V1");';
  const sha256Hex = crypto.createHash('sha256').update(bundleCode).digest('hex');

  // Matching hex
  assert.strictEqual(sandbox.verifyIntegrity(bundleCode, `sha256-${sha256Hex}`), true);

  // Tampered content throws
  const tamperedCode = 'console.log("Malicious injection!");';
  assert.throws(
    () => {
      sandbox.verifyIntegrity(tamperedCode, `sha256-${sha256Hex}`);
    },
    /Integrity check failed/
  );
});

test('DynamicPluginLoader - Graceful unload and route cleanup', async () => {
  const loader = new DynamicPluginLoaderService();

  const manifest = {
    id: 'plugin-cleanup-test',
    name: 'Temporary Plugin',
    version: '1.0.0',
    type: 'EXTENSION',
    description: 'Temporary',
    author: 'Tester',
    entryPoint: 'index.js',
    capabilities: [],
    uiExtensions: [
      {
        slot: 'route',
        title: 'Temp Route',
        path: '/temp-feature',
      },
    ],
  };

  await loader.registerRemotePlugin(manifest);
  assert.strictEqual(loader.getInjectedRoutes('plugin-cleanup-test').length, 1);

  await loader.unload('plugin-cleanup-test');
  assert.strictEqual(loader.getPlugin('plugin-cleanup-test'), undefined);
  assert.strictEqual(loader.getInjectedRoutes('plugin-cleanup-test').length, 0);
});
