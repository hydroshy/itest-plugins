import {
  IPluginLifecycle,
  IPluginContext,
} from '@iot-platform/plugin-sdk';

export interface AuditRecord {
  id: string;
  userId: string;
  action: string;
  targetResource: string;
  details: Record<string, any>;
  timestamp: Date;
  ipAddress?: string;
}

export class ReportingService {
  private readonly auditLogs: AuditRecord[] = [];

  logAudit(record: Omit<AuditRecord, 'id' | 'timestamp'>): AuditRecord {
    const fullRecord: AuditRecord = {
      ...record,
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date(),
    };
    this.auditLogs.unshift(fullRecord);
    return fullRecord;
  }

  getAuditLogs(limit = 100): AuditRecord[] {
    return this.auditLogs.slice(0, limit);
  }

  exportToCsv(data: Array<Record<string, any>>): string {
    if (data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map((row) =>
      headers.map((h) => JSON.stringify(row[h] ?? '')).join(',')
    );
    return [headers.join(','), ...rows].join('\n');
  }
}

export default class ReportingPlugin implements IPluginLifecycle {
  private context?: IPluginContext;
  public readonly service = new ReportingService();

  async init(context: IPluginContext): Promise<void> {
    this.context = context;
    context.logger.info(`Initialized ${context.manifest.name}`);
  }

  async start(): Promise<void> {
    this.context?.logger.info('Reporting & Audit Application Plugin started.');
  }

  async stop(): Promise<void> {
    this.context?.logger.info('Reporting & Audit Application Plugin stopped.');
  }

  async destroy(): Promise<void> {
    this.context?.logger.info('Reporting & Audit Application Plugin destroyed.');
  }
}
