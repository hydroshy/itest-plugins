/**
 * Universal Industrial IoT Platform - Frontend Plugin SDK Contracts
 * Defines standard interfaces for modular Vue 3 plugin UI extensions
 */

export type ComponentType = any; // Vue Component or () => Promise<Component>

export interface FrontendPermissionRequirement {
  permissions: string[];
  matchMode?: 'all' | 'any';
  roles?: string[];
}

export interface FrontendRouteDefinition {
  name: string;
  path: string;
  component: ComponentType;
  meta?: {
    title?: string;
    icon?: string;
    requiresAuth?: boolean;
    permissions?: string[];
    roles?: string[];
    breadcrumb?: string[];
    layout?: 'default' | 'blank' | 'fullscreen';
    hidden?: boolean;
    order?: number;
    pluginId?: string;
  };
  children?: FrontendRouteDefinition[];
}

export interface FrontendMenuDefinition {
  id: string;
  parentId?: string;
  label: string;
  icon?: string;
  route?: string; // target route name or path
  order?: number;
  permissions?: string[];
  permission?: string;
  capabilities?: string[];
  badge?: string | number;
  pluginId?: string;
  children?: FrontendMenuDefinition[];
}

export interface FrontendWidgetDefinition {
  id: string;
  title: string;
  description?: string;
  component: ComponentType;
  category?: 'telemetry' | 'status' | 'analytics' | 'control' | 'custom';
  defaultSize?: {
    w: number;
    h: number;
    minW?: number;
    minH?: number;
  };
  cols?: number;
  permissions?: string[];
  permission?: string;
  configSchema?: Record<string, any>;
  pluginId?: string;
}

export interface FrontendExtensionPoint {
  id: string;
  slot: string; // e.g. 'device-detail-tab', 'top-bar-action', 'settings-panel', 'dashboard-widget'
  component: ComponentType;
  order?: number;
  permissions?: string[];
  permission?: string;
  pluginId?: string;
}

export interface FrontendPluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  minSdkVersion?: string;
  dependencies?: Record<string, string>;
  capabilities?: string[];
  permissions?: string[];
  routes?: FrontendRouteDefinition[];
  menus?: FrontendMenuDefinition[];
  widgets?: FrontendWidgetDefinition[];
  extensionPoints?: FrontendExtensionPoint[];
  extensions?: FrontendExtensionPoint[];
}

export interface FrontendLogger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

export interface FrontendEventBus {
  emit(event: string, payload?: any): void;
  on(event: string, handler: (payload: any) => void): () => void;
  off(event: string, handler: (payload: any) => void): void;
}

export interface FrontendApiClient {
  get<T = any>(url: string, config?: any): Promise<T>;
  post<T = any>(url: string, data?: any, config?: any): Promise<T>;
  put<T = any>(url: string, data?: any, config?: any): Promise<T>;
  delete<T = any>(url: string, config?: any): Promise<T>;
}

export interface FrontendPluginContext {
  manifest: FrontendPluginManifest;
  logger: FrontendLogger;
  eventBus: FrontendEventBus;
  api: FrontendApiClient;
  registerRoute(route: FrontendRouteDefinition): void;
  registerMenu(menu: FrontendMenuDefinition): void;
  registerWidget(widget: FrontendWidgetDefinition): void;
  registerExtension(extension: FrontendExtensionPoint): void;
  hasPermission(permission: string | string[], matchMode?: 'all' | 'any'): boolean;
}

export interface FrontendPluginLifecycle {
  install?(context: FrontendPluginContext): Promise<void> | void;
  activate?(context: FrontendPluginContext): Promise<void> | void;
  deactivate?(context: FrontendPluginContext): Promise<void> | void;
  uninstall?(context: FrontendPluginContext): Promise<void> | void;
}

export interface FrontendPluginDefinition {
  manifest: FrontendPluginManifest;
  lifecycle?: FrontendPluginLifecycle;
  setup?: (context: FrontendPluginContext) => Promise<void> | void;
  teardown?: (context: FrontendPluginContext) => Promise<void> | void;
}

export interface FrontendPluginInstance {
  manifest: FrontendPluginManifest;
  lifecycle: FrontendPluginLifecycle;
  enabled: boolean;
  status: 'active' | 'inactive' | 'error';
  installedAt: Date;
  error?: Error | string;
}
