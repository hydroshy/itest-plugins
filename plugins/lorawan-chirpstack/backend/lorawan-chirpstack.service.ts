import {
  ChirpStackNetworkServer,
  ChirpStackGateway,
  ChirpStackDevice,
  ChirpStackApplication,
  ChirpStackDeviceProfile,
  ChirpStackTenant,
  LoRaWanUplinkEvent,
  CreateNetworkServerDto,
  CreateGatewayDto,
  CreateDeviceDto,
  CreateTenantDto,
  DecodePayloadDto,
} from './chirpstack.types';
import { ChirpStackApiClient } from './chirpstack-api.client';
import { LoRaWanPayloadDecoder } from './payload-decoder';

export class LoRaWanChirpStackService {
  private readonly apiClient: ChirpStackApiClient;
  private readonly servers = new Map<string, ChirpStackNetworkServer>();
  private readonly localGateways = new Map<string, ChirpStackGateway>();
  private readonly localDevices = new Map<string, ChirpStackDevice>();
  private readonly uplinkLogs: LoRaWanUplinkEvent[] = [];
  private readonly maxUplinkLogs = 200;

  constructor() {
    this.apiClient = new ChirpStackApiClient(8000);
    this.seedInitialData();
  }

  private seedInitialData() {
    const defaultServerId = 'cs-srv-01';
    const server: ChirpStackNetworkServer = {
      id: defaultServerId,
      name: 'ChirpStack v4 Production Server',
      apiUrl: 'http://localhost:8080',
      apiToken: 'cs_token_sample_abc123',
      tenantId: '52f14fb4-c5a1-4566-9b57-69502b78a9c1',
      version: 'v4.7.0',
      status: 'online',
      lastCheckedAt: new Date().toISOString(),
      gatewayCount: 2,
      deviceCount: 3,
    };
    this.servers.set(server.id, server);

    // Seed Gateways
    const gw1: ChirpStackGateway = {
      gatewayId: 'aa555a0000000001',
      name: 'Outdoor Gateway 8-CH (Roof A)',
      description: 'ChirpStack LoRaWAN Gateway RAK7249',
      networkServerId: defaultServerId,
      tenantId: server.tenantId || '',
      status: 'online',
      lastSeenAt: new Date().toISOString(),
      statsInterval: 30,
      rxPackets: 15420,
      txPackets: 320,
      rxPacketsPerMinute: 4.2,
      location: { latitude: 10.7769, longitude: 106.7009, altitude: 45 },
    };

    const gw2: ChirpStackGateway = {
      gatewayId: 'aa555a0000000002',
      name: 'Indoor Gateway 4-CH (Lab 201)',
      description: 'ChirpStack Gateway Dragino LPS8',
      networkServerId: defaultServerId,
      tenantId: server.tenantId || '',
      status: 'online',
      lastSeenAt: new Date(Date.now() - 120000).toISOString(),
      statsInterval: 30,
      rxPackets: 8940,
      txPackets: 110,
      rxPacketsPerMinute: 2.1,
      location: { latitude: 10.7780, longitude: 106.7020, altitude: 12 },
    };
    this.localGateways.set(gw1.gatewayId, gw1);
    this.localGateways.set(gw2.gatewayId, gw2);

    // Seed Devices
    const dev1: ChirpStackDevice = {
      devEui: '2cf7f1203230a001',
      name: 'Temp & Humidity Sensor TH-01',
      description: 'LoRaWAN Sensor S-TH-01 (Cayenne LPP)',
      networkServerId: defaultServerId,
      applicationId: 'app-iot-monitoring',
      applicationName: 'Smart Environment Monitoring',
      deviceProfileId: 'dp-as923-otaa',
      deviceProfileName: 'AS923 Class A OTAA',
      status: 'active',
      lastSeenAt: new Date().toISOString(),
      batteryLevel: 94,
      margin: 14,
      fCntUp: 412,
      rssi: -72,
      snr: 9.5,
    };

    const dev2: ChirpStackDevice = {
      devEui: '2cf7f1203230a002',
      name: 'CO2 & Air Quality Sensor AQ-02',
      description: 'Daviteq LoRaWAN Ambient Sensor',
      networkServerId: defaultServerId,
      applicationId: 'app-iot-monitoring',
      applicationName: 'Smart Environment Monitoring',
      deviceProfileId: 'dp-as923-otaa',
      deviceProfileName: 'AS923 Class A OTAA',
      status: 'active',
      lastSeenAt: new Date(Date.now() - 300000).toISOString(),
      batteryLevel: 88,
      margin: 11,
      fCntUp: 285,
      rssi: -84,
      snr: 7.2,
    };
    this.localDevices.set(dev1.devEui, dev1);
    this.localDevices.set(dev2.devEui, dev2);

    // Seed initial decoded uplink
    this.recordUplink({
      id: `uplink-${Date.now()}`,
      time: new Date().toISOString(),
      devEui: dev1.devEui,
      deviceName: dev1.name,
      networkServerId: defaultServerId,
      applicationId: dev1.applicationId,
      fPort: 1,
      fCnt: 412,
      rssi: -72,
      snr: 9.5,
      gatewayId: gw1.gatewayId,
      rawPayload: '01670118026852', // Cayenne: Ch1 Temp 28.0C, Ch2 Humidity 41.0%
      decodedPayload: { temperature_1: 28.0, humidity_2: 41.0 },
    });
  }

  // ==========================================
  // NETWORK SERVERS
  // ==========================================

  async getNetworkServers(): Promise<ChirpStackNetworkServer[]> {
    return Array.from(this.servers.values());
  }

  async getNetworkServer(id: string): Promise<ChirpStackNetworkServer | null> {
    return this.servers.get(id) || null;
  }

  async addNetworkServer(dto: CreateNetworkServerDto): Promise<ChirpStackNetworkServer> {
    const id = `cs-srv-${Date.now().toString(36)}`;
    const server: ChirpStackNetworkServer = {
      id,
      name: dto.name,
      apiUrl: dto.apiUrl.trim(),
      apiToken: dto.apiToken.trim(),
      tenantId: dto.tenantId?.trim() || '',
      version: 'ChirpStack v4',
      status: 'untested',
      lastCheckedAt: new Date().toISOString(),
      gatewayCount: 0,
      deviceCount: 0,
    };

    // Immediate test connection
    const testResult = await this.apiClient.testConnection(server);
    server.status = testResult.success ? 'online' : 'offline';
    server.errorMessage = testResult.success ? undefined : testResult.message;

    this.servers.set(id, server);
    return server;
  }

  async deleteNetworkServer(id: string): Promise<boolean> {
    return this.servers.delete(id);
  }

  async testServerConnection(id: string): Promise<{ success: boolean; message: string; version?: string }> {
    const server = this.servers.get(id);
    if (!server) {
      return { success: false, message: `Không tìm thấy Network Server ID "${id}"` };
    }

    const result = await this.apiClient.testConnection(server);
    server.status = result.success ? 'online' : 'offline';
    server.lastCheckedAt = new Date().toISOString();
    server.errorMessage = result.success ? undefined : result.message;
    return result;
  }

  // ==========================================
  // GATEWAYS
  // ==========================================

  async listGateways(serverId?: string): Promise<ChirpStackGateway[]> {
    const targetServer = serverId ? this.servers.get(serverId) : this.servers.values().next().value;
    if (targetServer && targetServer.status === 'online') {
      const remoteGws = await this.apiClient.listGateways(targetServer);
      if (remoteGws.length > 0) {
        remoteGws.forEach((gw) => this.localGateways.set(gw.gatewayId, gw));
      }
    }

    const all = Array.from(this.localGateways.values());
    if (serverId) {
      return all.filter((g) => g.networkServerId === serverId);
    }
    return all;
  }

  async createGateway(dto: CreateGatewayDto): Promise<ChirpStackGateway> {
    const server = this.servers.get(dto.networkServerId) || this.servers.values().next().value;
    if (!server) {
      throw new Error('Chưa cấu hình Network Server nào.');
    }

    const cleanId = dto.gatewayId.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
    let created: ChirpStackGateway;

    try {
      created = await this.apiClient.createGateway(server, { ...dto, gatewayId: cleanId });
    } catch {
      // Fallback local registration
      created = {
        gatewayId: cleanId,
        name: dto.name,
        description: dto.description || '',
        networkServerId: server.id,
        tenantId: server.tenantId || '',
        status: 'online',
        lastSeenAt: new Date().toISOString(),
        rxPackets: 0,
        txPackets: 0,
        statsInterval: dto.statsInterval || 30,
      };
    }

    this.localGateways.set(created.gatewayId, created);
    if (server.gatewayCount !== undefined) server.gatewayCount++;
    return created;
  }

  async deleteGateway(gatewayId: string, serverId?: string): Promise<boolean> {
    const cleanId = gatewayId.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
    const server = serverId ? this.servers.get(serverId) : this.servers.values().next().value;
    if (server) {
      await this.apiClient.deleteGateway(server, cleanId);
    }
    const removed = this.localGateways.delete(cleanId);
    if (server && server.gatewayCount && server.gatewayCount > 0) server.gatewayCount--;
    return removed;
  }

  // ==========================================
  // DEVICES
  // ==========================================

  async listDevices(serverId?: string, applicationId?: string): Promise<ChirpStackDevice[]> {
    const targetServer = serverId ? this.servers.get(serverId) : this.servers.values().next().value;
    if (targetServer && targetServer.status === 'online') {
      const remoteDevices = await this.apiClient.listDevices(targetServer, applicationId);
      if (remoteDevices.length > 0) {
        remoteDevices.forEach((d) => this.localDevices.set(d.devEui, d));
      }
    }

    let all = Array.from(this.localDevices.values());
    if (serverId) {
      all = all.filter((d) => d.networkServerId === serverId);
    }
    if (applicationId) {
      all = all.filter((d) => d.applicationId === applicationId);
    }
    return all;
  }

  async createDevice(dto: CreateDeviceDto): Promise<ChirpStackDevice> {
    const server = this.servers.get(dto.networkServerId) || this.servers.values().next().value;
    if (!server) {
      throw new Error('Chưa cấu hình Network Server nào.');
    }

    const cleanDevEui = dto.devEui.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
    let created: ChirpStackDevice;

    try {
      created = await this.apiClient.createDevice(server, { ...dto, devEui: cleanDevEui });
    } catch {
      created = {
        devEui: cleanDevEui,
        name: dto.name,
        description: dto.description || '',
        networkServerId: server.id,
        applicationId: dto.applicationId,
        deviceProfileId: dto.deviceProfileId,
        status: 'active',
        lastSeenAt: new Date().toISOString(),
        batteryLevel: 100,
        margin: 12,
        fCntUp: 0,
      };
    }

    this.localDevices.set(created.devEui, created);
    if (server.deviceCount !== undefined) server.deviceCount++;
    return created;
  }

  async deleteDevice(devEui: string, serverId?: string): Promise<boolean> {
    const cleanDevEui = devEui.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
    const server = serverId ? this.servers.get(serverId) : this.servers.values().next().value;
    if (server) {
      await this.apiClient.deleteDevice(server, cleanDevEui);
    }
    const removed = this.localDevices.delete(cleanDevEui);
    if (server && server.deviceCount && server.deviceCount > 0) server.deviceCount--;
    return removed;
  }

  // ==========================================
  // TENANTS
  // ==========================================

  async listTenants(serverId?: string): Promise<ChirpStackTenant[]> {
    const server = serverId ? this.servers.get(serverId) : this.servers.values().next().value;
    if (server) {
      const tenants = await this.apiClient.listTenants(server);
      if (tenants.length > 0) return tenants;
    }
    return [];
  }

  async createTenant(dto: CreateTenantDto): Promise<ChirpStackTenant> {
    const server = this.servers.get(dto.serverId);
    if (!server) {
      throw new Error(`ChirpStack Network Server ${dto.serverId} not found`);
    }
    return this.apiClient.createTenant(server, dto);
  }

  async deleteTenant(serverId: string, tenantId: string): Promise<boolean> {
    const server = this.servers.get(serverId);
    if (!server) return false;
    return this.apiClient.deleteTenant(server, tenantId);
  }

  // ==========================================
  // APPLICATIONS & PROFILES
  // ==========================================

  async listApplications(serverId?: string): Promise<ChirpStackApplication[]> {
    const server = serverId ? this.servers.get(serverId) : this.servers.values().next().value;
    if (server) {
      const apps = await this.apiClient.listApplications(server);
      if (apps.length > 0) return apps;
    }
    return [
      { id: 'app-iot-monitoring', name: 'Smart Environment Monitoring', description: 'Environmental telemetry', tenantId: 'tenant-01' },
      { id: 'app-smart-agriculture', name: 'Smart Agriculture & Soil', description: 'Soil and weather nodes', tenantId: 'tenant-01' },
    ];
  }

  async listDeviceProfiles(serverId?: string): Promise<ChirpStackDeviceProfile[]> {
    const server = serverId ? this.servers.get(serverId) : this.servers.values().next().value;
    if (server) {
      const profiles = await this.apiClient.listDeviceProfiles(server);
      if (profiles.length > 0) return profiles;
    }
    return [
      { id: 'dp-as923-otaa', name: 'AS923 Class A OTAA', region: 'AS923', macVersion: 'LORAWAN_1_0_3', regParamsRevision: 'RP002_1_0_3', tenantId: 'tenant-01' },
      { id: 'dp-eu868-otaa', name: 'EU868 Class A OTAA', region: 'EU868', macVersion: 'LORAWAN_1_0_3', regParamsRevision: 'RP002_1_0_3', tenantId: 'tenant-01' },
    ];
  }

  // ==========================================
  // TELEMETRY & UPLINK HANDLER
  // ==========================================

  /**
   * Handle ChirpStack Webhook / MQTT Uplink Event
   */
  async handleUplinkWebhook(body: any): Promise<LoRaWanUplinkEvent> {
    const devEui = (
      body.deviceInfo?.devEui ||
      body.devEui ||
      body.devEUI ||
      'unknown'
    ).toLowerCase();

    const deviceName = body.deviceInfo?.deviceName || body.deviceName;
    const fPort = body.fPort || 1;
    const fCnt = body.fCnt || 0;
    const rawData = body.data || body.bytes || body.payload || '';

    // Extract rxInfo from ChirpStack gateway stats
    let rssi = -80;
    let snr = 8.0;
    let gatewayId = 'unknown';

    if (Array.isArray(body.rxInfo) && body.rxInfo.length > 0) {
      const bestGw = body.rxInfo[0];
      rssi = bestGw.rssi ?? rssi;
      snr = bestGw.snr ?? snr;
      gatewayId = bestGw.gatewayId || gatewayId;
    }

    // Decode payload
    let decoded = body.object || body.decodedPayload;
    if (!decoded && rawData) {
      decoded = LoRaWanPayloadDecoder.decode(rawData, 'cayenne_lpp', fPort);
    }

    const event: LoRaWanUplinkEvent = {
      id: `up-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      deduplicationId: body.deduplicationId,
      time: body.time || new Date().toISOString(),
      devEui,
      deviceName,
      applicationId: body.deviceInfo?.applicationId || body.applicationId,
      fPort,
      fCnt,
      dr: body.dr,
      frequency: body.txInfo?.frequency,
      rssi,
      snr,
      gatewayId,
      rawPayload: rawData,
      decodedPayload: decoded,
      confirmed: body.confirmed,
    };

    this.recordUplink(event);

    // Update Device status in cache
    const existingDev = this.localDevices.get(devEui);
    if (existingDev) {
      existingDev.lastSeenAt = event.time;
      existingDev.rssi = rssi;
      existingDev.snr = snr;
      existingDev.fCntUp = fCnt;
    }

    return event;
  }

  private recordUplink(event: LoRaWanUplinkEvent) {
    this.uplinkLogs.unshift(event);
    if (this.uplinkLogs.length > this.maxUplinkLogs) {
      this.uplinkLogs.pop();
    }
  }

  async getUplinkLogs(limit = 50, devEui?: string): Promise<LoRaWanUplinkEvent[]> {
    let logs = this.uplinkLogs;
    if (devEui) {
      const clean = devEui.toLowerCase();
      logs = logs.filter((l) => l.devEui === clean);
    }
    return logs.slice(0, limit);
  }

  async decodePayload(dto: DecodePayloadDto): Promise<{ decoded: Record<string, any>; bufferLength: number }> {
    const decoded = LoRaWanPayloadDecoder.decode(dto.payload, dto.codecType, 1, dto.customScript);
    const buf = LoRaWanPayloadDecoder.parseToBuffer(dto.payload);
    return { decoded, bufferLength: buf.length };
  }
}
