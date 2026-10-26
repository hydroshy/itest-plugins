import { DecoderService } from './decoder.service';
import { LoRaWANScriptRunner } from './lorawan-script-runner';
import {
  CreateDecoderScriptDto,
  DecodeExecuteRequest,
  DecoderQueryFilter,
  DecodeTestRequest,
  UpdateDecoderScriptDto,
} from './decoder.types';

export class DecoderController {
  constructor(private service: DecoderService) {}

  async listScripts(filter?: DecoderQueryFilter) {
    const scripts = await this.service.listScripts(filter);
    return { success: true, count: scripts.length, data: scripts };
  }

  async getScriptById(id: string) {
    const script = await this.service.getScriptById(id);
    if (!script) {
      return { success: false, error: `Decoder script with id ${id} not found`, statusCode: 404 };
    }
    return { success: true, data: script };
  }

  async getScriptBySkuAndFw(sku: string, longFw: string) {
    const script = await this.service.getScriptBySkuAndFw(sku, longFw);
    if (!script) {
      return {
        success: false,
        error: `Decoder script for SKU ${sku} and LONG_FW ${longFw} not found`,
        statusCode: 404,
      };
    }
    return { success: true, data: script };
  }

  async createScript(dto: CreateDecoderScriptDto) {
    try {
      const created = await this.service.registerScript(dto);
      return { success: true, data: created, statusCode: 201 };
    } catch (err: any) {
      return { success: false, error: err.message, statusCode: 400 };
    }
  }

  async updateScript(id: string, dto: UpdateDecoderScriptDto) {
    try {
      const updated = await this.service.updateScript(id, dto);
      return { success: true, data: updated };
    } catch (err: any) {
      return { success: false, error: err.message, statusCode: 400 };
    }
  }

  async deleteScript(id: string) {
    const deleted = await this.service.deleteScript(id);
    return { success: deleted, deleted };
  }

  async testDecode(req: DecodeTestRequest) {
    try {
      const res = await this.service.testScript(req);
      return { success: true, data: res };
    } catch (err: any) {
      return { success: false, error: err.message, statusCode: 400 };
    }
  }

  async decodePayload(req: DecodeExecuteRequest) {
    try {
      const res = await this.service.decodePayload(req);
      return { success: res.success, data: res };
    } catch (err: any) {
      return { success: false, error: err.message, statusCode: 400 };
    }
  }

  async listMemmaps() {
    try {
      const list = await this.service.listMemmapsWithDecoderStatus();
      return { success: true, count: list.length, data: list };
    } catch (err: any) {
      return { success: false, error: err.message, statusCode: 500 };
    }
  }

  getTemplateScript() {
    return {
      success: true,
      data: {
        template: LoRaWANScriptRunner.getDefaultTemplate(),
        protocol: 'lorawan',
        format: 'chirpstack_v4',
      },
    };
  }
}
