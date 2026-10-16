import {
  IPluginLifecycle,
  IPluginContext,
  PluginManifest,
  UnifiedTelemetry,
  NormalizedMetric,
  TelemetryNormalizer,
} from '@iot-platform/plugin-sdk';

export interface ThingParkUplinkPacket {
  DevEUI_uplink?: {
    Time?: string;
    DevEUI: string;
    FPort?: number;
    FCntUp?: number;
    payload_hex?: string;
    payload?: string;
    CustomerID?: string;
    LrrRSSI?: number;
    LrrSNR?: number;
    Frequency?: number;
    SpFact?: number;
    DevAddr?: string;
  };
  [key: string]: any;
}

export class ThingParkNormalizer implements TelemetryNormalizer {
  protocolType = 'lorawan-thingpark';

  normalize(raw: ThingParkUplinkPacket): UnifiedTelemetry[] {
    const uplink = raw.DevEUI_uplink || raw;
    const uplinkAny = uplink as any;
    const deviceId = (uplinkAny.DevEUI || uplinkAny.devEUI || 'UNKNOWN').toUpperCase();
    const tenantId = uplink.CustomerID || 'DEFAULT';
    const timestamp = uplink.Time ? new Date(uplink.Time) : new Date();

    const metrics: UnifiedTelemetry[] = [];

    if (uplink.LrrRSSI != null) {
      metrics.push({
        deviceId,
        tenantId,
        timestamp,
        metricKey: 'rssi',
        value: Number(uplink.LrrRSSI),
        dataType: 'float',
        unit: 'dBm',
        quality: 'good',
        sourceProtocol: this.protocolType,
      });
    }

    if (uplink.LrrSNR != null) {
      metrics.push({
        deviceId,
        tenantId,
        timestamp,
        metricKey: 'snr',
        value: Number(uplink.LrrSNR),
        dataType: 'float',
        unit: 'dB',
        quality: 'good',
        sourceProtocol: this.protocolType,
      });
    }

    if (uplink.SpFact != null) {
      metrics.push({
        deviceId,
        tenantId,
        timestamp,
        metricKey: 'spreading_factor',
        value: Number(uplink.SpFact),
        dataType: 'int',
        quality: 'good',
        sourceProtocol: this.protocolType,
      });
    }

    if (uplink.payload_hex) {
      metrics.push({
        deviceId,
        tenantId,
        timestamp,
        metricKey: 'payload_hex',
        value: uplink.payload_hex,
        dataType: 'string',
        quality: 'good',
        sourceProtocol: this.protocolType,
        metadata: {
          fPort: uplink.FPort,
          fCnt: uplink.FCntUp,
        },
      });
    }

    return metrics;
  }
}

export default class ThingParkConnectorPlugin implements IPluginLifecycle {
  private context?: IPluginContext;
  private readonly normalizer = new ThingParkNormalizer();

  async init(context: IPluginContext): Promise<void> {
    this.context = context;
    context.logger.info(`Initialized ${context.manifest.name} (v${context.manifest.version})`);
  }

  async start(): Promise<void> {
    this.context?.logger.info('ThingPark Connector plugin started.');
  }

  async stop(): Promise<void> {
    this.context?.logger.info('ThingPark Connector plugin stopped.');
  }

  async destroy(): Promise<void> {
    this.context?.logger.info('ThingPark Connector plugin destroyed.');
  }

  parseAndNormalize(packet: ThingParkUplinkPacket): UnifiedTelemetry[] {
    return this.normalizer.normalize(packet);
  }
}
