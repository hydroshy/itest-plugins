import { IPluginLifecycle, IPluginContext } from '@iot-platform/plugin-sdk';

export interface WebhookAdminConfig {
  enabled: boolean;
  options?: Record<string, any>;
}

export class WebhookAdminService {
  private config: WebhookAdminConfig = { enabled: true };

  configure(cfg: Partial<WebhookAdminConfig>): void {
    this.config = { ...this.config, ...cfg };
  }

  getStatus(): { plugin: string; name: string; enabled: boolean; timestamp: string } {
    return {
      plugin: 'webhook-admin',
      name: 'Webhook & Outbound Integration',
      enabled: this.config.enabled,
      timestamp: new Date().toISOString()
    };
  }
}

export default class WebhookAdminPlugin implements IPluginLifecycle {
  private context?: IPluginContext;
  public readonly service = new WebhookAdminService();

  async init(context: IPluginContext): Promise<void> {
    this.context = context;
    context.logger.info(`[${context.manifest.name}] Initialized`);
  }

  async start(): Promise<void> {
    this.context?.logger.info(`[${this.context?.manifest.name}] Started`);
  }

  async stop(): Promise<void> {
    this.context?.logger.info(`[${this.context?.manifest.name}] Stopped`);
  }

  async destroy(): Promise<void> {
    this.context?.logger.info(`[${this.context?.manifest.name}] Destroyed`);
  }
}
