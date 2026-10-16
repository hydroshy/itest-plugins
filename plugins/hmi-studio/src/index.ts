import { IPluginLifecycle, IPluginContext } from '@iot-platform/plugin-sdk';

export interface HmiStudioConfig {
  enabled: boolean;
  options?: Record<string, any>;
}

export class HmiStudioService {
  private config: HmiStudioConfig = { enabled: true };

  configure(cfg: Partial<HmiStudioConfig>): void {
    this.config = { ...this.config, ...cfg };
  }

  getStatus(): { plugin: string; name: string; enabled: boolean; timestamp: string } {
    return {
      plugin: 'hmi-studio',
      name: 'HMI Screen Studio',
      enabled: this.config.enabled,
      timestamp: new Date().toISOString()
    };
  }
}

export default class HmiStudioPlugin implements IPluginLifecycle {
  private context?: IPluginContext;
  public readonly service = new HmiStudioService();

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
