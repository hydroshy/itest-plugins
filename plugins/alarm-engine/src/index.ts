import {
  IPluginLifecycle,
  IPluginContext,
  UnifiedTelemetry,
} from '@iot-platform/plugin-sdk';

export type AlarmSeverity = 'info' | 'warning' | 'critical';

export interface AlarmRule {
  id: string;
  name: string;
  metricKey: string;
  condition: '>' | '<' | '>=' | '<=' | '==' | '!=';
  threshold: number | string | boolean;
  severity: AlarmSeverity;
  enabled: boolean;
}

export interface ActiveAlarm {
  id: string;
  ruleId: string;
  deviceId: string;
  tenantId: string;
  severity: AlarmSeverity;
  metricKey: string;
  triggeredValue: any;
  triggeredAt: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
}

export class AlarmEngineService {
  private readonly rules = new Map<string, AlarmRule>();
  private readonly activeAlarms: ActiveAlarm[] = [];

  addRule(rule: AlarmRule): void {
    this.rules.set(rule.id, rule);
  }

  evaluate(telemetry: UnifiedTelemetry): ActiveAlarm | null {
    for (const rule of this.rules.values()) {
      if (!rule.enabled || rule.metricKey !== telemetry.metricKey) continue;

      let triggered = false;
      const val = telemetry.value;
      const thresh = rule.threshold;

      if (typeof val === 'number' && typeof thresh === 'number') {
        if (rule.condition === '>' && val > thresh) triggered = true;
        if (rule.condition === '>=' && val >= thresh) triggered = true;
        if (rule.condition === '<' && val < thresh) triggered = true;
        if (rule.condition === '<=' && val <= thresh) triggered = true;
        if (rule.condition === '==' && val === thresh) triggered = true;
        if (rule.condition === '!=' && val !== thresh) triggered = true;
      } else if (rule.condition === '==' && val === thresh) {
        triggered = true;
      }

      if (triggered) {
        const alarm: ActiveAlarm = {
          id: `alarm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          ruleId: rule.id,
          deviceId: telemetry.deviceId,
          tenantId: telemetry.tenantId,
          severity: rule.severity,
          metricKey: telemetry.metricKey,
          triggeredValue: val,
          triggeredAt: new Date(),
          acknowledged: false,
        };
        this.activeAlarms.unshift(alarm);
        return alarm;
      }
    }
    return null;
  }

  acknowledge(alarmId: string, user: string): boolean {
    const alarm = this.activeAlarms.find((a) => a.id === alarmId);
    if (!alarm) return false;
    alarm.acknowledged = true;
    alarm.acknowledgedBy = user;
    return true;
  }

  getActiveAlarms(tenantId?: string): ActiveAlarm[] {
    if (!tenantId) return this.activeAlarms;
    return this.activeAlarms.filter((a) => a.tenantId === tenantId);
  }
}

export default class AlarmEnginePlugin implements IPluginLifecycle {
  private context?: IPluginContext;
  public readonly service = new AlarmEngineService();

  async init(context: IPluginContext): Promise<void> {
    this.context = context;
    context.logger.info(`Initialized ${context.manifest.name}`);
  }

  async start(): Promise<void> {
    this.context?.logger.info('Alarm Engine Application Plugin started.');
  }

  async stop(): Promise<void> {
    this.context?.logger.info('Alarm Engine Application Plugin stopped.');
  }

  async destroy(): Promise<void> {
    this.context?.logger.info('Alarm Engine Application Plugin destroyed.');
  }
}
