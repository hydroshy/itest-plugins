import { IPluginLifecycle, IPluginContext, UnifiedTelemetry } from '@universal-iot/plugin-sdk';

export interface GlobiotsConnectorConfig {
  uplinkEndpoint: string; // "https://resources.globiots.com/rest/api/v1/lora-service/uplink-message"
  apiKey?: string;
  bearerToken?: string;
  autoForwardUplinks?: boolean;
  timeoutMs?: number;
}

export interface GlobiotsUplinkPayload {
  devEUI: string;
  fPort: number;
  fCnt: number;
  payloadHex?: string;
  data?: string; // base64
  time?: string;
  rssi?: number;
  snr?: number;
  frequency?: number;
  gatewayId?: string;
  deviceType?: string;
  customerCode?: string;
}

export class GlobiotsConnectorPlugin implements IPluginLifecycle {
  private context?: IPluginContext;
  private config: GlobiotsConnectorConfig = {
    uplinkEndpoint: 'https://resources.globiots.com/rest/api/v1/lora-service/uplink-message',
    timeoutMs: 10000,
    autoForwardUplinks: false,
  };

  async init(context: IPluginContext): Promise<void> {
    this.context = context;
    if (context.config) {
      this.config = { ...this.config, ...context.config };
    }
    this.context.logger.info(`[GlobiotsConnectorPlugin] Initialized with Uplink Endpoint: ${this.config.uplinkEndpoint}`);
  }

  async start(): Promise<void> {
    this.context?.logger.info('[GlobiotsConnectorPlugin] Started.');
  }

  async stop(): Promise<void> {
    this.context?.logger.info('[GlobiotsConnectorPlugin] Stopped.');
  }

  async destroy(): Promise<void> {
    this.context?.logger.info('[GlobiotsConnectorPlugin] Destroyed.');
  }

  /**
   * Forward Uplink Message to Globiots Cloud LoRa Service
   * Target: POST https://resources.globiots.com/rest/api/v1/lora-service/uplink-message
   */
  async forwardUplinkToGlobiots(payload: GlobiotsUplinkPayload): Promise<{ success: boolean; status: number; error?: string }> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Universal-IoT-GlobiotsConnector/1.0',
      };

      if (this.config.bearerToken) {
        headers['Authorization'] = `Bearer ${this.config.bearerToken.trim()}`;
      } else if (this.config.apiKey) {
        headers['X-API-Key'] = this.config.apiKey.trim();
      }

      const response = await fetch(this.config.uplinkEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.config.timeoutMs || 10000),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        this.context?.logger.warn(`Globiots Uplink forwarding returned HTTP ${response.status}: ${errText.slice(0, 100)}`);
        return { success: false, status: response.status, error: errText };
      }

      return { success: true, status: response.status };
    } catch (err: any) {
      this.context?.logger.error(`Failed forwarding uplink to Globiots: ${err.message}`);
      return { success: false, status: 0, error: err.message };
    }
  }

  /**
   * Ingest and normalize Globiots uplink format into UnifiedTelemetry[]
   */
  normalizeGlobiotsUplink(body: GlobiotsUplinkPayload, tenantId: string = 'default'): UnifiedTelemetry[] {
    const effectiveTenantId = body.customerCode || tenantId;
    const telemetries: UnifiedTelemetry[] = [];
    try {
      const devEUI = (body.devEUI || '').trim().toUpperCase();
      if (!devEUI) return [];

      const timestamp = body.time ? new Date(body.time) : new Date();
      let hex = body.payloadHex || '';
      if (!hex && body.data) {
        try {
          hex = Buffer.from(body.data, 'base64').toString('hex');
        } catch {}
      }

      telemetries.push({
        deviceId: devEUI,
        tenantId: effectiveTenantId,
        timestamp,
        metricKey: 'raw_payload',
        value: hex.toUpperCase(),
        dataType: 'string',
        sourceProtocol: 'globiots-lora',
        sourceConnection: this.config.uplinkEndpoint,
        quality: 'GOOD',
        metadata: {
          fPort: body.fPort,
          fCnt: body.fCnt,
          rssi: body.rssi,
          snr: body.snr,
          frequency: body.frequency,
          gatewayId: body.gatewayId,
          customerCode: body.customerCode,
        },
      });

      if (body.rssi !== undefined) {
        telemetries.push({
          deviceId: devEUI,
          tenantId: effectiveTenantId,
          timestamp,
          metricKey: 'rssi',
          value: Number(body.rssi),
          dataType: 'int32',
          sourceProtocol: 'globiots-lora',
          sourceConnection: this.config.uplinkEndpoint,
          quality: 'GOOD',
        });
      }

      if (body.snr !== undefined) {
        telemetries.push({
          deviceId: devEUI,
          tenantId: effectiveTenantId,
          timestamp,
          metricKey: 'snr',
          value: Number(body.snr),
          dataType: 'float32',
          sourceProtocol: 'globiots-lora',
          sourceConnection: this.config.uplinkEndpoint,
          quality: 'GOOD',
        });
      }

      return telemetries;
    } catch (e: any) {
      this.context?.logger.error(`Error normalizing Globiots uplink: ${e.message}`);
      return [];
    }
  }
}

export default GlobiotsConnectorPlugin;
