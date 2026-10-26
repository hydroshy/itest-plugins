import { DecoderService } from './decoder.service';
import { DecoderController } from './decoder.controller';
import { DefaultMemmapBridge } from './decoder-memmap.bridge';

export * from './decoder.types';
export * from './lorawan-script-runner';
export * from './decoder-memmap.bridge';
export * from './decoder.service';
export * from './decoder.controller';

export class DecoderPlugin {
  private service: DecoderService;
  private controller: DecoderController;

  constructor() {
    this.service = new DecoderService(new DefaultMemmapBridge());
    this.controller = new DecoderController(this.service);
  }

  getService(): DecoderService {
    return this.service;
  }

  getController(): DecoderController {
    return this.controller;
  }
}

export default DecoderPlugin;
