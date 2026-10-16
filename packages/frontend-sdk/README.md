# @platform/frontend-sdk

Universal Industrial IoT - Frontend Plugin SDK & Core UI Contracts.

## Overview

The Frontend Plugin SDK enables dynamic UI extensibility in the Universal IoT Platform. Plugins can register:
- **Dynamic Routes**: Top-level and nested views mounted directly into Vue Router.
- **Navigation Menus**: Collapsible sidebar menu items with RBAC filtering.
- **Dashboard Widgets**: Industrial monitoring cards, trend charts, and control widgets.
- **UI Extension Slots**: Inject custom panels and buttons into platform views (e.g., Device Inspector).
- **Inter-Plugin Events**: Lightweight typed event bus for cross-plugin messaging.

## Installation

```bash
pnpm add @platform/frontend-sdk
```

## Plugin Manifest & Lifecycle

```typescript
import {
  FrontendPluginDefinition,
  FrontendPluginContext,
} from '@platform/frontend-sdk';
import CustomView from './CustomView.vue';
import CustomWidget from './CustomWidget.vue';

export const myPlugin: FrontendPluginDefinition = {
  manifest: {
    id: 'plugin-my-extension',
    name: 'My IoT Extension',
    version: '1.0.0',
    description: 'Custom IoT dashboard widgets and controls',
    author: 'Platform Engineering',
    minSdkVersion: '1.0.0',
    permissions: ['device:read', 'telemetry:view'],
    routes: [
      {
        path: '/my-extension',
        name: 'my-extension-page',
        component: CustomView,
        meta: { title: 'Extension', icon: 'Platform', requiresAuth: true }
      }
    ],
    menus: [
      {
        id: 'menu-my-extension',
        title: 'Custom Extension',
        path: '/my-extension',
        icon: 'Platform',
        order: 40,
        permissions: ['telemetry:view']
      }
    ],
    widgets: [
      {
        id: 'widget-custom-metric',
        title: 'Live Metrics',
        component: CustomWidget,
        width: 12,
        height: 300,
        order: 10
      }
    ],
    extensions: [
      {
        id: 'ext-device-action',
        slot: 'device-actions',
        component: CustomWidget,
        order: 10
      }
    ]
  },

  async activate(ctx: FrontendPluginContext) {
    ctx.logger.info('Plugin activated');
    ctx.events.on('device:selected', (deviceId) => {
      ctx.logger.info(`Device selected: ${deviceId}`);
    });
  },

  async deactivate(ctx: FrontendPluginContext) {
    ctx.logger.info('Plugin deactivated');
  }
};
```

## Core Modules

- `FrontendPluginRegistry`: Manages plugin lifecycle, dynamic routing, and capability aggregation.
- `DefaultPluginContext`: Provides scoped logger, event bus, config access, and registration APIs to plugins.
- `PermissionHelper`: Evaluates wildcard, granular, and role-based permissions (`device:*`, `device:write`, `admin`).
- `SimpleEventBus`: Scoped and global event emission and unsubscription.
