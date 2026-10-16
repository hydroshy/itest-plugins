import {
  IPluginLifecycle,
  IPluginContext,
} from '@iot-platform/plugin-sdk';

export interface DashboardWidget {
  id: string;
  type: 'gauge' | 'timeseries-chart' | 'numeric-badge' | 'status-indicator' | 'hmi-element';
  title: string;
  deviceId: string;
  metricKey: string;
  config: {
    min?: number;
    max?: number;
    unit?: string;
    thresholds?: Array<{ value: number; color: string; label?: string }>;
  };
  layout: { x: number; y: number; w: number; h: number };
}

export class TelemetryDashboardService {
  private readonly widgets = new Map<string, DashboardWidget>();

  registerWidget(widget: DashboardWidget): void {
    this.widgets.set(widget.id, widget);
  }

  getWidget(id: string): DashboardWidget | undefined {
    return this.widgets.get(id);
  }

  listWidgets(): DashboardWidget[] {
    return Array.from(this.widgets.values());
  }

  deleteWidget(id: string): boolean {
    return this.widgets.delete(id);
  }
}

export default class TelemetryDashboardPlugin implements IPluginLifecycle {
  private context?: IPluginContext;
  public readonly service = new TelemetryDashboardService();

  async init(context: IPluginContext): Promise<void> {
    this.context = context;
    context.logger.info(`Initialized ${context.manifest.name}`);
  }

  async start(): Promise<void> {
    this.context?.logger.info('Telemetry Dashboard Application Plugin started.');
  }

  async stop(): Promise<void> {
    this.context?.logger.info('Telemetry Dashboard Application Plugin stopped.');
  }

  async destroy(): Promise<void> {
    this.context?.logger.info('Telemetry Dashboard Application Plugin destroyed.');
  }
}
