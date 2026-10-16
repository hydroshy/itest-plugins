import { IPluginLifecycle, IPluginContext, UnifiedTelemetry } from '@universal-iot/plugin-sdk';

export interface ChirpstackConnectorConfig {
  gatewayEndpoint: string; // e.g. "https://iengineering.daviteq.com/chirpstack/gateway"
  forwardGatewayStats?: boolean;
  timeoutMs?: number;
}

export class ChirpstackConnectorPlugin implements IPluginLifecycle {
  private context?: IPluginContext;
  private config: ChirpstackConnectorConfig = {
    gatewayEndpoint: 'https://iengineering.daviteq.com/chirpstack/gateway',
    forwardGatewayStats: true,
    timeoutMs: 8000,
  };

  async init(context: IPluginContext): Promise<void> {
    this.context = context;
    if (context.config) {
      this.config = { ...this.config, ...context.config };
    }
    this.context.logger.info(`[ChirpstackConnectorPlugin] Initialized with Gateway Endpoint: ${this.config.gatewayEndpoint}`);
  }

  async start(): Promise<void> {
    this.context?.logger.info('[ChirpstackConnectorPlugin] Started.');
  }

  async stop(): Promise<void> {
    this.context?.logger.info('[ChirpstackConnectorPlugin] Stopped.');
  }

  async destroy(): Promise<void> {
    this.context?.logger.info('[ChirpstackConnectorPlugin] Destroyed.');
  }

  /**
   * Parse ChirpStack v3/v4 Uplink JSON into standard UnifiedTelemetry[]
   */
  normalizeChirpstackUplink(body: any): UnifiedTelemetry[] {
    const telemetries: UnifiedTelemetry[] = [];
    try {
      const devEUI = (
        body.deviceInfo?.devEui ||
        body.devEUI ||
        body.devEui ||
        body.deviceInfo?.devEUI ||
        body.devAddr ||
        'UNKNOWN_DEVICE'
      ).trim().toUpperCase();

      const tenantId = body.deviceInfo?.tenantId || 'default';
      const timestamp = body.time ? new Date(body.time) : new Date();
      const fPort = Number(body.fPort ?? body.f_port ?? 1);
      const fCnt = Number(body.fCnt ?? body.f_cnt ?? 0);

      let payloadHex = '';
      if (body.data) {
        payloadHex = Buffer.from(body.data, 'base64').toString('hex');
      } else if (body.payloadHex) {
        payloadHex = body.payloadHex;
      }

      // Best Gateway RF metrics
      let bestRssi: number | undefined;
      let bestSnr: number | undefined;
      let bestGatewayId: string | undefined;

      if (Array.isArray(body.rxInfo) && body.rxInfo.length > 0) {
        let maxRssi = -999;
        for (const rx of body.rxInfo) {
          const rssi = rx.rssi != null ? Number(rx.rssi) : -999;
          if (rssi > maxRssi) {
            maxRssi = rssi;
            bestRssi = rssi;
            bestSnr = rx.snr != null ? Number(rx.snr) : (rx.loraSNR != null ? Number(rx.loraSNR) : undefined);
            bestGatewayId = rx.gatewayId || rx.gatewayID || rx.mac || undefined;
          }
        }
      }

      const frequency = body.txInfo?.frequency ? Number(body.txInfo.frequency) : undefined;
      const spreadingFactor = body.txInfo?.modulation?.lora?.spreadingFactor != null
        ? Number(body.txInfo.modulation.lora.spreadingFactor)
        : undefined;

      // Base raw payload metric
      telemetries.push({
        deviceId: devEUI,
        tenantId,
        timestamp,
        metricKey: 'raw_payload',
        value: payloadHex,
        dataType: 'string',
        sourceProtocol: 'chirpstack',
        sourceConnection: this.config.gatewayEndpoint,
        quality: 'GOOD',
        metadata: {
          fPort,
          fCnt,
          rssi: bestRssi,
          snr: bestSnr,
          gatewayId: bestGatewayId,
          frequency,
          spreadingFactor,
        },
      });

      if (bestRssi !== undefined) {
        telemetries.push({
          deviceId: devEUI,
          tenantId,
          timestamp,
          metricKey: 'rssi',
          value: bestRssi,
          dataType: 'int32',
          sourceProtocol: 'chirpstack',
          sourceConnection: this.config.gatewayEndpoint,
          quality: 'GOOD',
        });
      }

      if (bestSnr !== undefined) {
        telemetries.push({
          deviceId: devEUI,
          tenantId,
          timestamp,
          metricKey: 'snr',
          value: bestSnr,
          dataType: 'float32',
          sourceProtocol: 'chirpstack',
          sourceConnection: this.config.gatewayEndpoint,
          quality: 'GOOD',
        });
      }

      // Forward to Daviteq Gateway if enabled
      if (this.config.forwardGatewayStats) {
        this.forwardToDaviteqGateway({
          event: 'up',
          devEUI,
          fPort,
          fCnt,
          payloadHex,
          gatewayId: bestGatewayId,
          rssi: bestRssi,
          snr: bestSnr,
          timestamp: timestamp.toISOString(),
        }).catch((err) => {
          this.context?.logger.warn(`Forward to Daviteq Gateway failed: ${err.message}`);
        });
      }

      return telemetries;
    } catch (e: any) {
      this.context?.logger.error(`Error parsing ChirpStack uplink: ${e.message}`);
      return [];
    }
  }

  /**
   * Forward packet or gateway statistics to Daviteq Gateway receiver
   * Target: https://iengineering.daviteq.com/chirpstack/gateway
   */
  async forwardToDaviteqGateway(data: any): Promise<boolean> {
    try {
      const response = await fetch(this.config.gatewayEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Universal-IoT-ChirpstackConnector/1.0',
        },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(this.config.timeoutMs || 8000),
      });

      return response.ok;
    } catch (err: any) {
      this.context?.logger.warn(`Failed forwarding to ${this.config.gatewayEndpoint}: ${err.message}`);
      return false;
    }
  }
}

export default ChirpstackConnectorPlugin;
