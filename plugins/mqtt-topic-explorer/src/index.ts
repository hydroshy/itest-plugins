import {
  IPluginLifecycle,
  IPluginContext,
} from '@iot-platform/plugin-sdk';

export interface InspectedMqttMessage {
  topic: string;
  payload: string;
  qos: 0 | 1 | 2;
  retained: boolean;
  receivedAt: Date;
  sizeBytes: number;
}

export class MqttTopicExplorerService {
  private readonly recentMessages: InspectedMqttMessage[] = [];
  private readonly maxHistory = 200;

  recordMessage(msg: InspectedMqttMessage): void {
    this.recentMessages.unshift(msg);
    if (this.recentMessages.length > this.maxHistory) {
      this.recentMessages.pop();
    }
  }

  getRecentMessages(filterTopic?: string): InspectedMqttMessage[] {
    if (!filterTopic) return this.recentMessages;
    return this.recentMessages.filter((m) => m.topic.includes(filterTopic));
  }

  buildTopicTree(): Record<string, any> {
    const root: Record<string, any> = {};
    for (const msg of this.recentMessages) {
      const parts = msg.topic.split('/');
      let current = root;
      for (const part of parts) {
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }
    }
    return root;
  }
}

export default class MqttTopicExplorerPlugin implements IPluginLifecycle {
  private context?: IPluginContext;
  public readonly service = new MqttTopicExplorerService();

  async init(context: IPluginContext): Promise<void> {
    this.context = context;
    context.logger.info(`Initialized ${context.manifest.name}`);
  }

  async start(): Promise<void> {
    this.context?.logger.info('MQTT Topic Explorer Plugin started.');
  }

  async stop(): Promise<void> {
    this.context?.logger.info('MQTT Topic Explorer Plugin stopped.');
  }

  async destroy(): Promise<void> {
    this.context?.logger.info('MQTT Topic Explorer Plugin destroyed.');
  }
}
