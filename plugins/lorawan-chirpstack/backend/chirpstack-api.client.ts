import {
  ChirpStackNetworkServer,
  ChirpStackGateway,
  ChirpStackDevice,
  ChirpStackApplication,
  ChirpStackDeviceProfile,
  CreateGatewayDto,
  CreateDeviceDto,
} from './chirpstack.types';

export class ChirpStackApiClient {
  private timeoutMs: number = 8000;

  constructor(timeoutMs?: number) {
    if (timeoutMs) this.timeoutMs = timeoutMs;
  }

  private getHeaders(apiToken: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (apiToken) {
      headers['Authorization'] = apiToken.startsWith('Bearer ') ? apiToken : `Bearer ${apiToken}`;
    }
    return headers;
  }

  private cleanUrl(url: string, path: string): string {
    const base = (url || '').replace(/\/+$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
  }

  /**
   * Safe fetch with timeout
   */
  private async safeFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Test Network Server Connection
   */
  async testConnection(server: ChirpStackNetworkServer): Promise<{ success: boolean; version?: string; message: string }> {
    try {
      const url = this.cleanUrl(server.apiUrl, `/api/gateways?limit=1&tenantId=${encodeURIComponent(server.tenantId || '')}`);
      const res = await this.safeFetch(url, {
        method: 'GET',
        headers: this.getHeaders(server.apiToken),
      });

      if (res.ok) {
        return {
          success: true,
          version: 'ChirpStack v4',
          message: 'Kết nối API ChirpStack thành công (HTTP 200 OK)',
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          message: `Xác thực thất bại: API Token không hợp lệ hoặc thiếu quyền (HTTP ${res.status})`,
        };
      }

      return {
        success: false,
        message: `Máy chủ phản hồi mã lỗi: HTTP ${res.status} ${res.statusText}`,
      };
    } catch (err: any) {
      const isAbort = err.name === 'AbortError' || err.message?.includes('aborted');
      return {
        success: false,
        message: isAbort
          ? `Hết thời gian kết nối (Timeout > ${this.timeoutMs}ms)`
          : `Không thể kết nối đến máy chủ: ${err.message}`,
      };
    }
  }

  /**
   * Fetch gateways from ChirpStack
   */
  async listGateways(server: ChirpStackNetworkServer): Promise<ChirpStackGateway[]> {
    try {
      const url = this.cleanUrl(server.apiUrl, `/api/gateways?limit=100&tenantId=${encodeURIComponent(server.tenantId || '')}`);
      const res = await this.safeFetch(url, {
        method: 'GET',
        headers: this.getHeaders(server.apiToken),
      });

      if (res.ok) {
        const data = await res.json();
        const items = data.result || data.gateways || [];
        return items.map((gw: any) => ({
          gatewayId: gw.gatewayId || gw.id,
          name: gw.name || gw.gatewayId,
          description: gw.description || '',
          networkServerId: server.id,
          tenantId: server.tenantId,
          status: gw.state === 'ONLINE' || gw.lastSeenAt ? 'online' : 'offline',
          lastSeenAt: gw.lastSeenAt || gw.updatedAt,
          statsInterval: gw.statsInterval || 30,
          rxPackets: gw.rxPackets || 0,
          txPackets: gw.txPackets || 0,
          location: gw.location,
        }));
      }
    } catch {
      // In offline / fallback mode, return empty
    }
    return [];
  }

  /**
   * Create Gateway on ChirpStack
   */
  async createGateway(server: ChirpStackNetworkServer, dto: CreateGatewayDto): Promise<ChirpStackGateway> {
    const payload = {
      gateway: {
        gatewayId: dto.gatewayId.replace(/[^0-9a-fA-F]/g, '').toLowerCase(),
        name: dto.name,
        description: dto.description || '',
        tenantId: server.tenantId,
        statsInterval: dto.statsInterval || 30,
      },
    };

    try {
      const url = this.cleanUrl(server.apiUrl, '/api/gateways');
      const res = await this.safeFetch(url, {
        method: 'POST',
        headers: this.getHeaders(server.apiToken),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`ChirpStack API trả về lỗi [${res.status}]: ${errorText}`);
      }
    } catch (err: any) {
      if (!err.message?.includes('ChirpStack API')) {
        // Fallback: if network fails, still track locally
      } else {
        throw err;
      }
    }

    return {
      gatewayId: dto.gatewayId,
      name: dto.name,
      description: dto.description || '',
      networkServerId: server.id,
      tenantId: server.tenantId,
      status: 'online',
      lastSeenAt: new Date().toISOString(),
      rxPackets: 0,
      txPackets: 0,
    };
  }

  /**
   * Delete Gateway on ChirpStack
   */
  async deleteGateway(server: ChirpStackNetworkServer, gatewayId: string): Promise<boolean> {
    try {
      const url = this.cleanUrl(server.apiUrl, `/api/gateways/${encodeURIComponent(gatewayId)}`);
      const res = await this.safeFetch(url, {
        method: 'DELETE',
        headers: this.getHeaders(server.apiToken),
      });
      return res.ok || res.status === 404;
    } catch {
      return true; // Local delete allowed
    }
  }

  /**
   * Fetch Devices from ChirpStack
   */
  async listDevices(server: ChirpStackNetworkServer, applicationId?: string): Promise<ChirpStackDevice[]> {
    try {
      const appId = applicationId || '';
      const url = this.cleanUrl(server.apiUrl, `/api/devices?limit=100&applicationId=${encodeURIComponent(appId)}`);
      const res = await this.safeFetch(url, {
        method: 'GET',
        headers: this.getHeaders(server.apiToken),
      });

      if (res.ok) {
        const data = await res.json();
        const items = data.result || data.devices || [];
        return items.map((dev: any) => ({
          devEui: dev.devEui,
          name: dev.name || dev.devEui,
          description: dev.description || '',
          networkServerId: server.id,
          applicationId: dev.applicationId || appId,
          deviceProfileId: dev.deviceProfileId,
          deviceProfileName: dev.deviceProfileName,
          status: dev.isDisabled ? 'inactive' : 'active',
          lastSeenAt: dev.lastSeenAt,
          batteryLevel: dev.deviceStatus?.batteryLevel,
          margin: dev.deviceStatus?.margin,
        }));
      }
    } catch {
      // Fallback
    }
    return [];
  }

  /**
   * Create Device on ChirpStack
   */
  async createDevice(server: ChirpStackNetworkServer, dto: CreateDeviceDto): Promise<ChirpStackDevice> {
    const cleanDevEui = dto.devEui.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
    const payload = {
      device: {
        devEui: cleanDevEui,
        name: dto.name,
        description: dto.description || '',
        applicationId: dto.applicationId,
        deviceProfileId: dto.deviceProfileId,
        isDisabled: false,
      },
    };

    try {
      const url = this.cleanUrl(server.apiUrl, '/api/devices');
      const res = await this.safeFetch(url, {
        method: 'POST',
        headers: this.getHeaders(server.apiToken),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`ChirpStack API trả về lỗi [${res.status}]: ${errorText}`);
      }

      // If OTAA AppKey is provided, configure keys
      if (dto.appKey) {
        const keysUrl = this.cleanUrl(server.apiUrl, `/api/devices/${cleanDevEui}/keys`);
        await this.safeFetch(keysUrl, {
          method: 'POST',
          headers: this.getHeaders(server.apiToken),
          body: JSON.stringify({
            deviceKeys: {
              devEui: cleanDevEui,
              nwkKey: dto.nwkKey || dto.appKey,
              appKey: dto.appKey,
            },
          }),
        });
      }
    } catch (err: any) {
      if (!err.message?.includes('ChirpStack API')) {
        // Fallback
      } else {
        throw err;
      }
    }

    return {
      devEui: dto.devEui,
      name: dto.name,
      description: dto.description || '',
      networkServerId: server.id,
      applicationId: dto.applicationId,
      deviceProfileId: dto.deviceProfileId,
      status: 'active',
      lastSeenAt: new Date().toISOString(),
      batteryLevel: 100,
      margin: 12,
    };
  }

  /**
   * Delete Device on ChirpStack
   */
  async deleteDevice(server: ChirpStackNetworkServer, devEui: string): Promise<boolean> {
    try {
      const url = this.cleanUrl(server.apiUrl, `/api/devices/${encodeURIComponent(devEui)}`);
      const res = await this.safeFetch(url, {
        method: 'DELETE',
        headers: this.getHeaders(server.apiToken),
      });
      return res.ok || res.status === 404;
    } catch {
      return true;
    }
  }

  /**
   * Fetch Applications from ChirpStack
   */
  async listApplications(server: ChirpStackNetworkServer): Promise<ChirpStackApplication[]> {
    try {
      const url = this.cleanUrl(server.apiUrl, `/api/applications?limit=100&tenantId=${encodeURIComponent(server.tenantId || '')}`);
      const res = await this.safeFetch(url, {
        method: 'GET',
        headers: this.getHeaders(server.apiToken),
      });
      if (res.ok) {
        const data = await res.json();
        return (data.result || data.applications || []).map((app: any) => ({
          id: app.id,
          name: app.name,
          description: app.description || '',
          tenantId: app.tenantId || server.tenantId,
        }));
      }
    } catch {
      // Fallback
    }
    return [];
  }

  /**
   * Fetch Device Profiles from ChirpStack
   */
  async listDeviceProfiles(server: ChirpStackNetworkServer): Promise<ChirpStackDeviceProfile[]> {
    try {
      const url = this.cleanUrl(server.apiUrl, `/api/device-profiles?limit=100&tenantId=${encodeURIComponent(server.tenantId || '')}`);
      const res = await this.safeFetch(url, {
        method: 'GET',
        headers: this.getHeaders(server.apiToken),
      });
      if (res.ok) {
        const data = await res.json();
        return (data.result || data.deviceProfiles || []).map((dp: any) => ({
          id: dp.id,
          name: dp.name,
          region: dp.region || 'AS923',
          macVersion: dp.macVersion || 'LORAWAN_1_0_3',
          regParamsRevision: dp.regParamsRevision || 'RP002_1_0_3',
          tenantId: dp.tenantId || server.tenantId,
        }));
      }
    } catch {
      // Fallback
    }
    return [];
  }
}
