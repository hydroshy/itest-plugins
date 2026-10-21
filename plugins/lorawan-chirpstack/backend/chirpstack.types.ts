export interface ChirpStackNetworkServer {
  id: string;
  name: string;
  apiUrl: string;
  apiToken: string;
  /** Optional when registering the ChirpStack server; tenants are managed separately. */
  tenantId?: string;
  version: string;
  status: 'online' | 'offline' | 'untested';
  lastCheckedAt?: string;
  errorMessage?: string;
  gatewayCount?: number;
  deviceCount?: number;
}

export interface ChirpStackGateway {
  gatewayId: string; // EUI64 16 hex chars
  name: string;
  description: string;
  networkServerId: string;
  tenantId: string;
  status: 'online' | 'offline';
  lastSeenAt?: string;
  statsInterval?: number;
  rxPackets: number;
  txPackets: number;
  rxPacketsPerMinute?: number;
  location?: {
    latitude: number;
    longitude: number;
    altitude: number;
  };
}

export interface ChirpStackDevice {
  devEui: string; // EUI64 16 hex chars
  name: string;
  description: string;
  networkServerId: string;
  applicationId: string;
  applicationName?: string;
  deviceProfileId: string;
  deviceProfileName?: string;
  status: 'active' | 'inactive';
  lastSeenAt?: string;
  batteryLevel?: number; // 0 - 100 or margin
  margin?: number;
  fCntUp?: number;
  rssi?: number;
  snr?: number;
  deviceKeys?: {
    nwkKey?: string;
    appKey?: string;
  };
}

export interface ChirpStackApplication {
  id: string;
  name: string;
  description: string;
  tenantId: string;
}

export interface ChirpStackDeviceProfile {
  id: string;
  name: string;
  region: string;
  macVersion: string;
  regParamsRevision: string;
  tenantId: string;
}

export interface LoRaWanUplinkEvent {
  id: string;
  deduplicationId?: string;
  time: string;
  devEui: string;
  deviceName?: string;
  networkServerId?: string;
  applicationId?: string;
  fPort: number;
  fCnt: number;
  dr?: number;
  frequency?: number;
  rssi?: number;
  snr?: number;
  gatewayId?: string;
  rawPayload: string; // Base64 or Hex
  decodedPayload?: Record<string, any>;
  confirmed?: boolean;
}

export interface ChirpStackTenant {
  id: string;
  name: string;
  description?: string;
  canHaveGateways?: boolean;
  maxGatewayCount?: number;
  maxDeviceCount?: number;
}

export interface CreateTenantDto {
  serverId: string;
  name: string;
  description?: string;
  canHaveGateways?: boolean;
  maxGatewayCount?: number;
  maxDeviceCount?: number;
}

export interface CreateNetworkServerDto {
  name: string;
  apiUrl: string;
  apiToken: string;
  /** Tenant selection belongs to TenantService and is optional for server registration. */
  tenantId?: string;
}

export interface CreateGatewayDto {
  networkServerId: string;
  gatewayId: string;
  name: string;
  description?: string;
  statsInterval?: number;
}

export interface CreateDeviceDto {
  networkServerId: string;
  applicationId: string;
  deviceProfileId: string;
  devEui: string;
  name: string;
  description?: string;
  appKey?: string;
  nwkKey?: string;
}

export interface DecodePayloadDto {
  payload: string; // Hex or Base64
  codecType: 'cayenne_lpp' | 'raw_hex' | 'json' | 'custom_js';
  customScript?: string;
}
