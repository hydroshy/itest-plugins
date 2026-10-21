import type { FrontendPluginDefinition } from '@itest/frontend-sdk';
import LoRaWanChirpStackView from './views/LoRaWanChirpStackView.vue';
import ChirpStackFleetWidget from './widgets/ChirpStackFleetWidget.vue';
import ChirpStackHeaderBadge from './components/ChirpStackHeaderBadge.vue';

export const lorawanChirpStackPlugin: FrontendPluginDefinition = {
  manifest: {
    id: 'lorawan-chirpstack',
    name: 'LoRaWAN ChirpStack Network Manager',
    version: '1.0.0',
    sdkVersion: '^1.0.0',
    description: 'Quản lý ChirpStack Network Server, Gateway, Device và LoRaWAN telemetry.',
    author: 'ITEST IoT Platform Team',
  },

  async setup(context) {
    context.logger.info('Initializing ChirpStack LoRaWAN frontend plugin');

    context.registerRoute({
      path: '/plugins/lorawan-chirpstack',
      name: 'LoRaWanChirpStack',
      component: LoRaWanChirpStackView,
      meta: {
        title: 'ChirpStack LoRaWAN',
        icon: 'Connection',
        requiresAuth: true,
      },
    });

    context.registerMenu({
      id: 'menu-lorawan-chirpstack',
      title: 'ChirpStack LoRaWAN',
      path: '/plugins/lorawan-chirpstack',
      icon: 'Connection',
      order: 21,
    });

    context.registerWidget({
      id: 'widget-chirpstack-fleet',
      title: 'ChirpStack LoRaWAN Fleet',
      component: ChirpStackFleetWidget,
      width: 'full',
      order: 11,
    });

    context.registerExtension({
      id: 'ext-chirpstack-header-badge',
      slot: 'header-right',
      component: ChirpStackHeaderBadge,
      order: 6,
    });

    context.logger.info('ChirpStack LoRaWAN frontend plugin initialized');
  },
};

export default lorawanChirpStackPlugin;
