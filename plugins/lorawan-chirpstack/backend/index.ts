import { LoRaWanChirpStackService } from './lorawan-chirpstack.service';
import { LoRaWanChirpStackController } from './lorawan-chirpstack.controller';
import { ChirpStackApiClient } from './chirpstack-api.client';
import { LoRaWanPayloadDecoder } from './payload-decoder';

export * from './chirpstack.types';
export * from './chirpstack-api.client';
export * from './payload-decoder';
export * from './lorawan-chirpstack.service';
export * from './lorawan-chirpstack.controller';

export class ChirpStackPlugin {
  private service: LoRaWanChirpStackService;
  private controller: LoRaWanChirpStackController;

  constructor() {
    this.service = new LoRaWanChirpStackService();
    this.controller = new LoRaWanChirpStackController(this.service);
  }

  getService(): LoRaWanChirpStackService {
    return this.service;
  }

  getController(): LoRaWanChirpStackController {
    return this.controller;
  }
}

export default ChirpStackPlugin;
