import { LoRaWanChirpStackService } from './lorawan-chirpstack.service';
import {
  CreateNetworkServerDto,
  CreateGatewayDto,
  CreateDeviceDto,
  DecodePayloadDto,
} from './chirpstack.types';

export class LoRaWanChirpStackController {
  constructor(private readonly service: LoRaWanChirpStackService) {}

  async getServers() {
    return this.service.getNetworkServers();
  }

  async addServer(dto: CreateNetworkServerDto) {
    return this.service.addNetworkServer(dto);
  }

  async deleteServer(id: string) {
    return this.service.deleteNetworkServer(id);
  }

  async testServer(id: string) {
    return this.service.testServerConnection(id);
  }

  async getGateways(serverId?: string) {
    return this.service.listGateways(serverId);
  }

  async addGateway(dto: CreateGatewayDto) {
    return this.service.createGateway(dto);
  }

  async deleteGateway(id: string, serverId?: string) {
    return this.service.deleteGateway(id, serverId);
  }

  async getDevices(serverId?: string, applicationId?: string) {
    return this.service.listDevices(serverId, applicationId);
  }

  async addDevice(dto: CreateDeviceDto) {
    return this.service.createDevice(dto);
  }

  async deleteDevice(id: string, serverId?: string) {
    return this.service.deleteDevice(id, serverId);
  }

  async getApplications(serverId?: string) {
    return this.service.listApplications(serverId);
  }

  async getDeviceProfiles(serverId?: string) {
    return this.service.listDeviceProfiles(serverId);
  }

  async handleUplink(body: any) {
    return this.service.handleUplinkWebhook(body);
  }

  async getUplinks(limit?: number, devEui?: string) {
    return this.service.getUplinkLogs(limit, devEui);
  }

  async decodePayload(dto: DecodePayloadDto) {
    return this.service.decodePayload(dto);
  }
}
