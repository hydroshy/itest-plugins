import {
  IPluginLifecycle,
  IPluginContext,
} from '@iot-platform/plugin-sdk';

export interface FinalConfigSchema {
  version: string;
  systemName: string;
  protocols: {
    mqttEnabled: boolean;
    modbusEnabled: boolean;
    lorawanEnabled: boolean;
    opcuaEnabled: boolean;
  };
  storage: {
    telemetryRetentionDays: number;
    auditRetentionDays: number;
  };
  customParameters: Record<string, any>;
}

export class FinalConfigManagerService {
  private currentConfig: FinalConfigSchema = {
    version: '1.0.0',
    systemName: 'DVT Universal IoT Platform',
    protocols: {
      mqttEnabled: true,
      modbusEnabled: true,
      lorawanEnabled: true,
      opcuaEnabled: true,
    },
    storage: {
      telemetryRetentionDays: 90,
      auditRetentionDays: 365,
    },
    customParameters: {},
  };

  getConfig(): FinalConfigSchema {
    return { ...this.currentConfig };
  }

  updateConfig(updates: Partial<FinalConfigSchema>): FinalConfigSchema {
    this.currentConfig = {
      ...this.currentConfig,
      ...updates,
      protocols: {
        ...this.currentConfig.protocols,
        ...(updates.protocols || {}),
      },
      storage: {
        ...this.currentConfig.storage,
        ...(updates.storage || {}),
      },
      customParameters: {
        ...this.currentConfig.customParameters,
        ...(updates.customParameters || {}),
      },
    };
    return this.currentConfig;
  }
}

export default class FinalConfigManagerPlugin implements IPluginLifecycle {
  private context?: IPluginContext;
  public readonly service = new FinalConfigManagerService();

  async init(context: IPluginContext): Promise<void> {
    this.context = context;
    context.logger.info(`Initialized ${context.manifest.name}`);
  }

  async start(): Promise<void> {
    this.context?.logger.info('Final Config Manager Application Plugin started.');
  }

  async stop(): Promise<void> {
    this.context?.logger.info('Final Config Manager Application Plugin stopped.');
  }

  async destroy(): Promise<void> {
    this.context?.logger.info('Final Config Manager Application Plugin destroyed.');
  }
}
