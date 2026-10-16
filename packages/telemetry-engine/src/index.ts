import { UnifiedTelemetry, NormalizedMetric, MetricQuality } from '@iot-platform/plugin-sdk';
import { IEventBus, globalEventBus } from '@iot-platform/event-bus';

export interface TelemetryIngestInput {
  deviceId: string;
  tenantId: string;
  sourceProtocol: string;
  sourceConnection?: string;
  timestamp?: Date;
  metrics: NormalizedMetric[];
  metadata?: Record<string, any>;
}

export type TelemetrySink = (telemetry: UnifiedTelemetry[]) => Promise<void> | void;

export interface TelemetryEngineOptions {
  batchSize?: number;
  flushIntervalMs?: number;
  maxBufferSize?: number;
  eventBus?: IEventBus;
}

export interface TelemetryEngineStats {
  totalIngested: number;
  totalPersisted: number;
  totalBatches: number;
  totalDropped: number;
  currentBufferSize: number;
}

export class TelemetryEngine {
  private readonly sinks: TelemetrySink[] = [];
  private readonly eventBus: IEventBus;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxBufferSize: number;

  private buffer: UnifiedTelemetry[] = [];
  private flushTimer: any = null;
  private isFlushing = false;

  private stats: TelemetryEngineStats = {
    totalIngested: 0,
    totalPersisted: 0,
    totalBatches: 0,
    totalDropped: 0,
    currentBufferSize: 0,
  };

  constructor(options?: TelemetryEngineOptions | IEventBus) {
    if (options && 'emit' in options) {
      this.eventBus = options as IEventBus;
      this.batchSize = 100;
      this.flushIntervalMs = 100;
      this.maxBufferSize = 10000;
    } else {
      const opts = (options as TelemetryEngineOptions) || {};
      this.eventBus = opts.eventBus || globalEventBus;
      this.batchSize = opts.batchSize ?? 100;
      this.flushIntervalMs = opts.flushIntervalMs ?? 100;
      this.maxBufferSize = opts.maxBufferSize ?? 10000;
    }

    this.startFlushTimer();
  }

  private startFlushTimer(): void {
    if (this.flushIntervalMs > 0 && typeof setInterval !== 'undefined') {
      this.flushTimer = setInterval(() => {
        if (this.buffer.length > 0 && !this.isFlushing) {
          this.flush().catch((err) => {
            console.error(`[TelemetryEngine] Auto-flush error: ${err.message}`);
          });
        }
      }, this.flushIntervalMs);
      if (this.flushTimer.unref) {
        this.flushTimer.unref();
      }
    }
  }

  addSink(sink: TelemetrySink): void {
    this.sinks.push(sink);
  }

  async process(input: TelemetryIngestInput): Promise<UnifiedTelemetry[]> {
    const timestamp = input.timestamp || new Date();
    const batch: UnifiedTelemetry[] = input.metrics.map((m) => ({
      deviceId: input.deviceId,
      tenantId: input.tenantId,
      timestamp,
      metricKey: m.metricKey,
      value: m.value,
      dataType: m.dataType,
      unit: m.unit,
      quality: m.quality,
      sourceProtocol: input.sourceProtocol,
      sourceConnection: input.sourceConnection,
      metadata: { ...input.metadata, ...m.metadata },
    }));

    this.stats.totalIngested += batch.length;

    // 1. Emit events immediately for low-latency real-time consumers (WebSocket / SSE)
    for (const item of batch) {
      this.eventBus.emit('telemetry:metric', item);
    }
    this.eventBus.emit('telemetry:batch', batch);

    // 2. Buffer for high-throughput batch database insertion
    if (this.sinks.length > 0) {
      // Backpressure check
      if (this.buffer.length + batch.length > this.maxBufferSize) {
        const excess = this.buffer.length + batch.length - this.maxBufferSize;
        this.stats.totalDropped += excess;
        this.buffer.splice(0, excess);
        this.eventBus.emit('telemetry:backpressure', {
          dropped: excess,
          bufferSize: this.buffer.length,
          maxBufferSize: this.maxBufferSize,
        });
      }

      this.buffer.push(...batch);
      this.stats.currentBufferSize = this.buffer.length;

      // If buffer reached or exceeded batchSize, flush immediately
      if (this.buffer.length >= this.batchSize && !this.isFlushing) {
        await this.flush();
      }
    }

    return batch;
  }

  async flush(): Promise<void> {
    if (this.isFlushing || this.buffer.length === 0 || this.sinks.length === 0) {
      return;
    }

    this.isFlushing = true;
    const itemsToFlush = this.buffer.splice(0, this.batchSize);
    this.stats.currentBufferSize = this.buffer.length;

    try {
      for (const sink of this.sinks) {
        try {
          await sink(itemsToFlush);
        } catch (err: any) {
          console.error(`[TelemetryEngine] Sink error: ${err.message}`);
        }
      }
      this.stats.totalPersisted += itemsToFlush.length;
      this.stats.totalBatches += 1;
    } finally {
      this.isFlushing = false;
      // If there are still items left in the buffer exceeding batchSize, continue flushing
      if (this.buffer.length >= this.batchSize) {
        setImmediate(() => {
          this.flush().catch((err) => {
            console.error(`[TelemetryEngine] Follow-up flush error: ${err.message}`);
          });
        });
      }
    }
  }

  getStats(): TelemetryEngineStats {
    return {
      ...this.stats,
      currentBufferSize: this.buffer.length,
    };
  }

  async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // Drain remaining buffer items
    while (this.buffer.length > 0) {
      await this.flush();
    }
  }
}

export const globalTelemetryEngine = new TelemetryEngine();
