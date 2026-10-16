import * as crypto from 'crypto';
import {
  RemotePluginManifest,
  RemotePluginRecord,
  DynamicPluginRegistry,
  DynamicPluginLoader,
  PluginLifecycleState,
  PluginSandboxPolicy,
  RemoteUIExtension,
  PluginType,
} from './index';

export class SandboxSecurityViolationError extends Error {
  constructor(public readonly pluginId: string, public readonly violation: string) {
    super(`[SecuritySandbox] Plugin '${pluginId}' violated security policy: ${violation}`);
    this.name = 'SandboxSecurityViolationError';
  }
}

export class PluginSecuritySandbox {
  private activeTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(private readonly defaultPolicy: PluginSandboxPolicy = {
    isolationLevel: 'in_process_vm',
    maxMemoryMb: 256,
    cpuTimeoutMs: 5000,
    allowOutboundNetwork: true,
  }) {}

  public validatePolicy(manifest: RemotePluginManifest): void {
    const policy = manifest.sandboxPolicy || this.defaultPolicy;
    if (policy.maxMemoryMb && policy.maxMemoryMb < 16) {
      throw new SandboxSecurityViolationError(manifest.id, 'Memory allocation cannot be less than 16MB');
    }
  }

  public checkNetworkPermission(manifest: RemotePluginManifest, targetHost: string): boolean {
    const policy = manifest.sandboxPolicy || this.defaultPolicy;
    if (policy.allowOutboundNetwork === false) {
      throw new SandboxSecurityViolationError(manifest.id, `Outbound network access is disabled by policy`);
    }

    if (policy.allowedNetworkHosts && policy.allowedNetworkHosts.length > 0) {
      const allowed = policy.allowedNetworkHosts.some(allowedPattern => {
        if (allowedPattern === '*') return true;
        if (allowedPattern.startsWith('*.')) {
          const suffix = allowedPattern.slice(2);
          return targetHost.endsWith(suffix) || targetHost === suffix;
        }
        return targetHost === allowedPattern;
      });

      if (!allowed) {
        throw new SandboxSecurityViolationError(
          manifest.id,
          `Connection to host '${targetHost}' rejected. Not in allowedNetworkHosts: [${policy.allowedNetworkHosts.join(', ')}]`
        );
      }
    }

    return true;
  }

  public verifyIntegrity(bundleContent: Buffer | string, expectedChecksum?: string): boolean {
    if (!expectedChecksum) return true;

    let algorithm = 'sha256';
    let expectedHash = expectedChecksum;

    if (expectedChecksum.includes('-')) {
      const parts = expectedChecksum.split('-');
      algorithm = parts[0];
      expectedHash = parts[1];
    }

    const hash = crypto.createHash(algorithm).update(bundleContent).digest('hex');
    const base64Hash = crypto.createHash(algorithm).update(bundleContent).digest('base64');

    if (hash === expectedHash || base64Hash === expectedHash) {
      return true;
    }

    throw new Error(`Integrity check failed. Expected: ${expectedChecksum}, Calculated: ${algorithm}-${hash}`);
  }
}

export class DynamicPluginLoaderService implements DynamicPluginRegistry, DynamicPluginLoader {
  private readonly plugins: Map<string, RemotePluginRecord> = new Map();
  private readonly sandbox: PluginSecuritySandbox;
  private readonly injectedRoutes: Map<string, RemoteUIExtension[]> = new Map();

  constructor(sandboxPolicy?: PluginSandboxPolicy) {
    this.sandbox = new PluginSecuritySandbox(sandboxPolicy);
  }

  public async registerRemotePlugin(
    manifest: RemotePluginManifest,
    options: { autoStart?: boolean } = {}
  ): Promise<RemotePluginRecord> {
    if (!manifest.id || !manifest.name || !manifest.version) {
      throw new Error(`Invalid plugin manifest: missing id, name or version`);
    }

    // Validate sandbox policy
    this.sandbox.validatePolicy(manifest);

    const record: RemotePluginRecord = {
      id: manifest.id,
      manifest,
      status: 'DISCOVERED',
      installedAt: new Date(),
      updatedAt: new Date(),
      loadedFrom: manifest.repository ? 'github_release' : manifest.remoteEntry ? 'remote_url' : 'local_disk',
      runtimeMetrics: {
        memoryUsageMb: 0,
        uptimeSeconds: 0,
        errorCount: 0,
      },
    };

    this.plugins.set(manifest.id, record);

    // Transition DISCOVERED -> VALIDATED
    await this.transitionState(manifest.id, 'VALIDATED', 'Manifest and security policies verified');

    // Register Dynamic Routes & UI extensions if present
    if (manifest.uiExtensions && manifest.uiExtensions.length > 0) {
      this.injectedRoutes.set(manifest.id, manifest.uiExtensions);
    }

    if (options.autoStart) {
      await this.transitionState(manifest.id, 'RESOLVED');
      await this.transitionState(manifest.id, 'LOADED');
      await this.transitionState(manifest.id, 'INITIALIZED');
      await this.transitionState(manifest.id, 'STARTED');
      await this.transitionState(manifest.id, 'READY');
    }

    return record;
  }

  public async unregisterPlugin(id: string): Promise<boolean> {
    const record = this.plugins.get(id);
    if (!record) return false;

    // Graceful stop if running
    if (['STARTED', 'READY', 'RUNNING'].includes(record.status)) {
      await this.transitionState(id, 'STOPPED', 'Unregistering plugin');
    }

    // Clean up injected UI routes
    this.injectedRoutes.delete(id);
    this.plugins.delete(id);
    return true;
  }

  public getPlugin(id: string): RemotePluginRecord | undefined {
    return this.plugins.get(id);
  }

  public listPlugins(filter?: { type?: PluginType; status?: PluginLifecycleState }): RemotePluginRecord[] {
    let result = Array.from(this.plugins.values());
    if (filter) {
      if (filter.type) {
        result = result.filter(p => p.manifest.type === filter.type);
      }
      if (filter.status) {
        result = result.filter(p => p.status === filter.status);
      }
    }
    return result;
  }

  public getInjectedRoutes(pluginId?: string): RemoteUIExtension[] {
    if (pluginId) {
      return this.injectedRoutes.get(pluginId) || [];
    }
    const allRoutes: RemoteUIExtension[] = [];
    for (const routes of this.injectedRoutes.values()) {
      allRoutes.push(...routes);
    }
    return allRoutes;
  }

  public async transitionState(
    id: string,
    targetState: PluginLifecycleState,
    reason?: string
  ): Promise<boolean> {
    const record = this.plugins.get(id);
    if (!record) {
      throw new Error(`Cannot transition state for non-existent plugin '${id}'`);
    }

    // FSM State transitions validation
    const validTransitions: Record<PluginLifecycleState, PluginLifecycleState[]> = {
      DISCOVERED: ['VALIDATED', 'INCOMPATIBLE', 'FAILED', 'QUARANTINED'],
      VALIDATED: ['RESOLVED', 'FAILED', 'QUARANTINED'],
      RESOLVED: ['LOADED', 'FAILED', 'QUARANTINED'],
      LOADED: ['INITIALIZED', 'FAILED', 'QUARANTINED'],
      INITIALIZED: ['STARTED', 'FAILED', 'QUARANTINED'],
      STARTED: ['READY', 'FAILED', 'QUARANTINED', 'STOPPED'],
      READY: ['STOPPED', 'DISABLED', 'FAILED', 'QUARANTINED'],
      STOPPED: ['STARTED', 'READY', 'INITIALIZED', 'DISABLED'],
      DISABLED: ['INITIALIZED', 'READY', 'STOPPED'],
      FAILED: ['QUARANTINED', 'INITIALIZED'],
      INCOMPATIBLE: ['QUARANTINED', 'VALIDATED'],
      QUARANTINED: ['DISCOVERED', 'VALIDATED'],
    };

    const allowed = validTransitions[record.status] || [];
    if (!allowed.includes(targetState) && targetState !== 'QUARANTINED') {
      throw new Error(
        `Invalid state transition for plugin '${id}' from '${record.status}' to '${targetState}'`
      );
    }

    record.status = targetState;
    record.updatedAt = new Date();
    if (targetState === 'QUARANTINED') {
      record.quarantineReason = reason || 'Quarantined due to unexpected error or security violation';
    }

    return true;
  }

  public async loadRemoteManifest(manifestUrl: string): Promise<RemotePluginManifest> {
    // Protocol simulation for remote manifest fetching
    if (!manifestUrl.startsWith('http://') && !manifestUrl.startsWith('https://')) {
      throw new Error(`Manifest URL must be HTTP or HTTPS: ${manifestUrl}`);
    }
    throw new Error(`Direct network fetch requires active runtime context`);
  }

  public async loadFromUrl(bundleUrl: string, checksum?: string): Promise<RemotePluginRecord> {
    if (!bundleUrl) throw new Error(`bundleUrl is required`);
    throw new Error(`loadFromUrl requires active backend runtime`);
  }

  public async unload(pluginId: string): Promise<void> {
    await this.unregisterPlugin(pluginId);
  }

  public async reload(pluginId: string): Promise<RemotePluginRecord> {
    const existing = this.plugins.get(pluginId);
    if (!existing) {
      throw new Error(`Cannot reload non-existent plugin '${pluginId}'`);
    }

    const manifest = existing.manifest;
    await this.unregisterPlugin(pluginId);
    return await this.registerRemotePlugin(manifest, { autoStart: true });
  }

  public getSandbox(): PluginSecuritySandbox {
    return this.sandbox;
  }
}
