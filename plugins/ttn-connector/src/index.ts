import {
  IPluginLifecycle,
  IPluginContext,
  UnifiedTelemetry,
  TelemetryNormalizer,
} from '@iot-platform/plugin-sdk';

export interface TTNUplinkMessage {
  end_device_ids?: {
    device_id?: string;
    dev_eui?: string;
    join_eui?: string;
    dev_addr?: string;
    application_ids?: { application_id?: string };
  };
  received_at?: string;
  uplink_message?: {
    f_port?: number;
    f_cnt?: number;
    frm_payload?: string;
    decoded_payload?: Record<string, any>;
    rx_metadata?: Array<{
      gateway_ids?: { gateway_id?: string };
      rssi?: number;
      snr?: number;
      channel_rssi?: number;
    }>;
    settings?: {
      data_rate?: { lora?: { spreading_factor?: number; bandwidth?: number } };
      frequency?: string;
    };
  };
  [key: string]: any;
}

export class TTNNormalizer implements TelemetryNormalizer {
  protocolType = 'lorawan-ttn';

  normalize(raw: TTNUplinkMessage): UnifiedTelemetry[] {
    const devEui = (
      raw.end_device_ids?.dev_eui ||
      raw.end_device_ids?.device_id ||
      'UNKNOWN'
    ).toUpperCase();
    const tenantId = raw.end_device_ids?.application_ids?.application_id || 'DEFAULT';
    const timestamp = raw.received_at ? new Date(raw.received_at) : new Date();

    const uplink = raw.uplink_message || {};
    const metrics: UnifiedTelemetry[] = [];

    const rx = uplink.rx_metadata?.[0];
    if (rx?.rssi != null) {
      metrics.push({
        deviceId: devEui,
        tenantId,
        timestamp,
        metricKey: 'rssi',
        value: rx.rssi,
        dataType: 'float',
        unit: 'dBm',
        quality: 'good',
        sourceProtocol: this.protocolType,
      });
    }

    if (rx?.snr != null) {
      metrics.push({
        deviceId: devEui,
        tenantId,
        timestamp,
        metricKey: 'snr',
        value: rx.snr,
        dataType: 'float',
        unit: 'dB',
        quality: 'good',
        sourceProtocol: this.protocolType,
      });
    }

    const sf = uplink.settings?.data_rate?.lora?.spreading_factor;
    if (sf != null) {
      metrics.push({
        deviceId: devEui,
        tenantId,
        timestamp,
        metricKey: 'spreading_factor',
        value: sf,
        dataType: 'int',
        quality: 'good',
        sourceProtocol: this.protocolType,
      });
    }

    if (uplink.frm_payload) {
      let hex = '';
      try {
        hex = Buffer.from(uplink.frm_payload, 'base64').toString('hex').toUpperCase();
      } catch (e) {
        hex = uplink.frm_payload;
      }
      metrics.push({
        deviceId: devEui,
        tenantId,
        timestamp,
        metricKey: 'payload_hex',
        value: hex,
        dataType: 'string',
        quality: 'good',
        sourceProtocol: this.protocolType,
        metadata: {
          fPort: uplink.f_port,
          fCnt: uplink.f_cnt,
        },
      });
    }

    if (uplink.decoded_payload) {
      for (const [key, val] of Object.entries(uplink.decoded_payload)) {
        metrics.push({
          deviceId: devEui,
          tenantId,
          timestamp,
          metricKey: key,
          value: typeof val === 'object' ? JSON.stringify(val) : (val as any),
          dataType: typeof val === 'number' ? (Number.isInteger(val) ? 'int' : 'float') : typeof val === 'boolean' ? 'boolean' : 'string',
          quality: 'good',
          sourceProtocol: this.protocolType,
        });
      }
    }

    return metrics;
  }
}

export default class TTNConnectorPlugin implements IPluginLifecycle {
  private context?: IPluginContext;
  private readonly normalizer = new TTNNormalizer();

  async init(context: IPluginContext): Promise<void> {
    this.context = context;
    context.logger.info(`Initialized ${context.manifest.name} (v${context.manifest.version})`);
  }

  async start(): Promise<void> {
    this.context?.logger.info('TTN Connector plugin started.');
  }

  async stop(): Promise<void> {
    this.context?.logger.info('TTN Connector plugin stopped.');
  }

  async destroy(): Promise<void> {
    this.context?.logger.info('TTN Connector plugin destroyed.');
  }

  parseAndNormalize(packet: TTNUplinkMessage): UnifiedTelemetry[] {
    return this.normalizer.normalize(packet);
  }
}
