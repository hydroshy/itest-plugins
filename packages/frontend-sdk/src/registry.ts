import {
  FrontendPluginDefinition,
  FrontendPluginInstance,
  FrontendPluginLifecycle,
  FrontendRouteDefinition,
  FrontendMenuDefinition,
  FrontendWidgetDefinition,
  FrontendExtensionPoint,
  FrontendEventBus,
  FrontendApiClient,
} from './types.js';
import { DefaultPluginContext } from './context.js';
import { SimpleEventBus } from './events.js';
import { PermissionHelper } from './permissions.js';

export class FrontendPluginRegistry {
  private plugins = new Map<string, FrontendPluginInstance>();
  private contexts = new Map<string, DefaultPluginContext>();

  // Registered artifacts mapped by pluginId
  private pluginRoutes = new Map<string, FrontendRouteDefinition[]>();
  private pluginMenus = new Map<string, FrontendMenuDefinition[]>();
  private pluginWidgets = new Map<string, FrontendWidgetDefinition[]>();
  private pluginExtensions = new Map<string, FrontendExtensionPoint[]>();

  private userPermissionsProvider: () => { permissions: string[]; roles: string[] } = () => ({
    permissions: [],
    roles: [],
  });

  constructor(
    public readonly eventBus: FrontendEventBus = new SimpleEventBus(),
    public readonly api: FrontendApiClient = {
      get: async <T = any>() => ({} as T),
      post: async <T = any>() => ({} as T),
      put: async <T = any>() => ({} as T),
      delete: async <T = any>() => ({} as T),
    }
  ) {}

  setUserPermissionsProvider(provider: () => { permissions: string[]; roles: string[] }): void {
    this.userPermissionsProvider = provider;
  }

  // Internal calls from DefaultPluginContext
  internalRegisterRoute(pluginId: string, route: FrontendRouteDefinition): void {
    const list = this.pluginRoutes.get(pluginId) || [];
    // Prevent duplicate route paths or names within same plugin
    const exists = list.some((r) => r.path === route.path || r.name === route.name);
    if (!exists) {
      list.push(route);
      this.pluginRoutes.set(pluginId, list);
    }
  }

  internalRegisterMenu(pluginId: string, menu: FrontendMenuDefinition): void {
    const list = this.pluginMenus.get(pluginId) || [];
    const exists = list.some((m) => m.id === menu.id);
    if (!exists) {
      list.push(menu);
      this.pluginMenus.set(pluginId, list);
    }
  }

  internalRegisterWidget(pluginId: string, widget: FrontendWidgetDefinition): void {
    const list = this.pluginWidgets.get(pluginId) || [];
    const exists = list.some((w) => w.id === widget.id);
    if (!exists) {
      list.push(widget);
      this.pluginWidgets.set(pluginId, list);
    }
  }

  internalRegisterExtension(pluginId: string, extension: FrontendExtensionPoint): void {
    const list = this.pluginExtensions.get(pluginId) || [];
    const exists = list.some((e) => e.id === extension.id);
    if (!exists) {
      list.push(extension);
      this.pluginExtensions.set(pluginId, list);
    }
  }

  async register(definition: FrontendPluginDefinition): Promise<void> {
    const { manifest } = definition;
    if (this.plugins.has(manifest.id)) {
      throw new Error(`[PluginRegistry] Plugin "${manifest.id}" is already registered.`);
    }

    const normalizedLifecycle: FrontendPluginLifecycle = {
      install: definition.lifecycle?.install || definition.setup,
      activate: definition.lifecycle?.activate,
      deactivate: definition.lifecycle?.deactivate || definition.teardown,
      uninstall: definition.lifecycle?.uninstall,
    };

    const instance: FrontendPluginInstance = {
      manifest,
      lifecycle: normalizedLifecycle,
      enabled: false,
      status: 'inactive',
      installedAt: new Date(),
    };

    this.plugins.set(manifest.id, instance);
    this.pluginRoutes.set(manifest.id, []);
    this.pluginMenus.set(manifest.id, []);
    this.pluginWidgets.set(manifest.id, []);
    this.pluginExtensions.set(manifest.id, []);

    const ctx = new DefaultPluginContext(
      manifest,
      this,
      this.eventBus,
      this.api,
      this.userPermissionsProvider
    );
    this.contexts.set(manifest.id, ctx);

    // Register declaratively defined manifests items
    if (manifest.routes) {
      manifest.routes.forEach((r) => ctx.registerRoute(r));
    }
    if (manifest.menus) {
      manifest.menus.forEach((m) => ctx.registerMenu(m));
    }
    if (manifest.widgets) {
      manifest.widgets.forEach((w) => ctx.registerWidget(w));
    }
    const exts = manifest.extensionPoints || manifest.extensions;
    if (exts) {
      exts.forEach((e) => ctx.registerExtension(e));
    }

    // Run install lifecycle
    try {
      if (typeof normalizedLifecycle.install === 'function') {
        await normalizedLifecycle.install(ctx);
      }
      this.eventBus.emit('plugin:registered', { pluginId: manifest.id, manifest });
    } catch (err: any) {
      instance.status = 'error';
      instance.error = err;
      console.error(`[PluginRegistry] Failed to install plugin "${manifest.id}":`, err);
      throw err;
    }
  }

  async enable(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance) {
      throw new Error(`[PluginRegistry] Cannot enable unknown plugin: ${pluginId}`);
    }
    if (instance.enabled) return;

    const ctx = this.contexts.get(pluginId);
    if (!ctx) throw new Error(`[PluginRegistry] Missing context for plugin: ${pluginId}`);

    try {
      if (typeof instance.lifecycle.activate === 'function') {
        await instance.lifecycle.activate(ctx);
      }
      instance.enabled = true;
      instance.status = 'active';
      this.eventBus.emit('plugin:enabled', { pluginId, manifest: instance.manifest });
    } catch (err: any) {
      instance.status = 'error';
      instance.error = err;
      console.error(`[PluginRegistry] Failed to activate plugin "${pluginId}":`, err);
      throw err;
    }
  }

  async disable(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance) {
      throw new Error(`[PluginRegistry] Cannot disable unknown plugin: ${pluginId}`);
    }
    if (!instance.enabled) return;

    const ctx = this.contexts.get(pluginId);
    if (!ctx) throw new Error(`[PluginRegistry] Missing context for plugin: ${pluginId}`);

    try {
      if (typeof instance.lifecycle.deactivate === 'function') {
        await instance.lifecycle.deactivate(ctx);
      }
      instance.enabled = false;
      instance.status = 'inactive';
      this.eventBus.emit('plugin:disabled', { pluginId, manifest: instance.manifest });
    } catch (err: any) {
      instance.status = 'error';
      instance.error = err;
      console.error(`[PluginRegistry] Failed to deactivate plugin "${pluginId}":`, err);
      throw err;
    }
  }

  async unregister(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId);
    if (!instance) return;

    if (instance.enabled) {
      await this.disable(pluginId);
    }

    const ctx = this.contexts.get(pluginId);
    if (ctx && typeof instance.lifecycle.uninstall === 'function') {
      try {
        await instance.lifecycle.uninstall(ctx);
      } catch (err) {
        console.error(`[PluginRegistry] Error uninstalling plugin "${pluginId}":`, err);
      }
    }

    this.plugins.delete(pluginId);
    this.contexts.delete(pluginId);
    this.pluginRoutes.delete(pluginId);
    this.pluginMenus.delete(pluginId);
    this.pluginWidgets.delete(pluginId);
    this.pluginExtensions.delete(pluginId);

    this.eventBus.emit('plugin:unregistered', { pluginId });
  }

  getPlugin(pluginId: string): FrontendPluginInstance | undefined {
    return this.plugins.get(pluginId);
  }

  listPlugins(): FrontendPluginInstance[] {
    return Array.from(this.plugins.values());
  }

  isPluginEnabled(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    return plugin ? plugin.enabled : false;
  }

  /**
   * Get active routes filtered by enabled plugins and user permissions
   */
  getRoutes(): FrontendRouteDefinition[] {
    const { permissions, roles } = this.userPermissionsProvider();
    const activeRoutes: FrontendRouteDefinition[] = [];

    for (const [pluginId, routes] of this.pluginRoutes.entries()) {
      if (!this.isPluginEnabled(pluginId)) continue;
      for (const route of routes) {
        if (route.meta?.permissions || route.meta?.roles) {
          const allowed = PermissionHelper.checkPermissions(permissions, roles, {
            permissions: route.meta.permissions || [],
            roles: route.meta.roles || [],
          });
          if (!allowed) continue;
        }
        activeRoutes.push(route);
      }
    }

    return activeRoutes;
  }

  /**
   * Get active navigation menus sorted by display order
   */
  getMenus(): FrontendMenuDefinition[] {
    const { permissions, roles } = this.userPermissionsProvider();
    const activeMenus: FrontendMenuDefinition[] = [];

    for (const [pluginId, menus] of this.pluginMenus.entries()) {
      if (!this.isPluginEnabled(pluginId)) continue;
      for (const menu of menus) {
        const required = menu.permissions || (menu.permission ? [menu.permission] : []);
        if (required.length > 0) {
          const allowed = PermissionHelper.checkPermissions(permissions, roles, required);
          if (!allowed) continue;
        }
        activeMenus.push(menu);
      }
    }

    return activeMenus.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  }

  /**
   * Get active dashboard widgets
   */
  getWidgets(): FrontendWidgetDefinition[] {
    const { permissions, roles } = this.userPermissionsProvider();
    const activeWidgets: FrontendWidgetDefinition[] = [];

    for (const [pluginId, widgets] of this.pluginWidgets.entries()) {
      if (!this.isPluginEnabled(pluginId)) continue;
      for (const widget of widgets) {
        const required = widget.permissions || (widget.permission ? [widget.permission] : []);
        if (required.length > 0) {
          const allowed = PermissionHelper.checkPermissions(permissions, roles, required);
          if (!allowed) continue;
        }
        activeWidgets.push(widget);
      }
    }

    return activeWidgets;
  }

  /**
   * Get extensions for a given UI slot
   */
  getExtensions(slot: string): FrontendExtensionPoint[] {
    const { permissions, roles } = this.userPermissionsProvider();
    const activeExtensions: FrontendExtensionPoint[] = [];

    for (const [pluginId, extensions] of this.pluginExtensions.entries()) {
      if (!this.isPluginEnabled(pluginId)) continue;
      for (const ext of extensions) {
        if (ext.slot !== slot) continue;
        const required = ext.permissions || (ext.permission ? [ext.permission] : []);
        if (required.length > 0) {
          const allowed = PermissionHelper.checkPermissions(permissions, roles, required);
          if (!allowed) continue;
        }
        activeExtensions.push(ext);
      }
    }

    return activeExtensions.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  }
}
