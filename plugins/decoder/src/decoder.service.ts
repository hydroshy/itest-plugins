import { randomUUID } from 'node:crypto';
import {
  CreateDecoderScriptDto,
  DecodeExecuteRequest,
  DecodeExecuteResult,
  DecoderQueryFilter,
  DecoderScript,
  DecodeTestRequest,
  DecodeTestResult,
  MemmapProfileSummary,
  UpdateDecoderScriptDto,
} from './decoder.types';
import { LoRaWANScriptRunner } from './lorawan-script-runner';
import { DefaultMemmapBridge, IMemmapBridge } from './decoder-memmap.bridge';

export class DecoderService {
  private scripts: Map<string, DecoderScript> = new Map();
  // Lookup index by SKU::LONG_FW
  private skuFwIndex: Map<string, string> = new Map();
  private memmapBridge: IMemmapBridge;

  constructor(memmapBridge?: IMemmapBridge) {
    this.memmapBridge = memmapBridge || new DefaultMemmapBridge();
  }

  private normalizeKey(sku: string, longFw: string): string {
    return `${sku.trim().toUpperCase()}::${longFw.trim().toUpperCase()}`;
  }

  getMemmapBridge(): IMemmapBridge {
    return this.memmapBridge;
  }

  /**
   * Register a new decoder script mapped to (sku, long_fw)
   */
  async registerScript(dto: CreateDecoderScriptDto): Promise<DecoderScript> {
    if (!dto.sku || !dto.sku.trim()) {
      throw new Error('SKU is required.');
    }
    if (!dto.long_fw || !dto.long_fw.trim()) {
      throw new Error('LONG_FW is required.');
    }
    if (!dto.script || !dto.script.trim()) {
      throw new Error('Decoder script content is required.');
    }

    const key = this.normalizeKey(dto.sku, dto.long_fw);
    if (this.skuFwIndex.has(key)) {
      throw new Error(`Decoder script already exists for SKU "${dto.sku}" and LONG_FW "${dto.long_fw}".`);
    }

    // Syntax & entrypoint check with dummy payload
    const syntaxCheck = LoRaWANScriptRunner.execute(dto.script, '00', {
      timeoutMs: 1000,
      fPort: 1,
    });
    // Check if script had fatal syntax or entrypoint errors (allow logical warnings)
    if (syntaxCheck.errors && syntaxCheck.errors.some(e => e.includes('No valid decoder entrypoint found') || e.includes('SyntaxError'))) {
      throw new Error(`Invalid decoder script: ${syntaxCheck.errors.join('; ')}`);
    }

    const now = new Date().toISOString();
    const id = randomUUID();

    const record: DecoderScript = {
      id,
      name: dto.name || `Decoder for ${dto.sku} ${dto.long_fw}`,
      sku: dto.sku.trim().toUpperCase(),
      long_fw: dto.long_fw.trim().toUpperCase(),
      script: dto.script,
      protocol: dto.protocol || 'lorawan',
      description: dto.description || '',
      input_format: dto.input_format || 'hex',
      sample_payload: dto.sample_payload,
      sample_fport: dto.sample_fport ?? 1,
      sample_decoded: dto.sample_decoded,
      is_active: dto.is_active !== undefined ? dto.is_active : true,
      metadata: dto.metadata || {},
      created_at: now,
      updated_at: now,
      created_by: dto.created_by || 'system',
    };

    this.scripts.set(id, record);
    this.skuFwIndex.set(key, id);

    return record;
  }

  /**
   * Update an existing decoder script
   */
  async updateScript(id: string, dto: UpdateDecoderScriptDto): Promise<DecoderScript> {
    const existing = this.scripts.get(id);
    if (!existing) {
      throw new Error(`Decoder script with id "${id}" not found.`);
    }

    let targetSku = existing.sku;
    let targetLongFw = existing.long_fw;

    if (dto.sku || dto.long_fw) {
      targetSku = (dto.sku || existing.sku).trim().toUpperCase();
      targetLongFw = (dto.long_fw || existing.long_fw).trim().toUpperCase();
      const newKey = this.normalizeKey(targetSku, targetLongFw);
      const existingKeyOwner = this.skuFwIndex.get(newKey);
      if (existingKeyOwner && existingKeyOwner !== id) {
        throw new Error(`Another script already exists for SKU "${targetSku}" and LONG_FW "${targetLongFw}".`);
      }
      this.skuFwIndex.delete(this.normalizeKey(existing.sku, existing.long_fw));
      this.skuFwIndex.set(newKey, id);
    }

    if (dto.script && dto.script.trim()) {
      const syntaxCheck = LoRaWANScriptRunner.execute(dto.script, '00', {
        timeoutMs: 1000,
        fPort: 1,
      });
      if (syntaxCheck.errors && syntaxCheck.errors.some(e => e.includes('No valid decoder entrypoint found') || e.includes('SyntaxError'))) {
        throw new Error(`Invalid decoder script: ${syntaxCheck.errors.join('; ')}`);
      }
      existing.script = dto.script;
    }

    if (dto.name !== undefined) existing.name = dto.name;
    if (dto.description !== undefined) existing.description = dto.description;
    if (dto.protocol !== undefined) existing.protocol = dto.protocol;
    if (dto.input_format !== undefined) existing.input_format = dto.input_format;
    if (dto.sample_payload !== undefined) existing.sample_payload = dto.sample_payload;
    if (dto.sample_fport !== undefined) existing.sample_fport = dto.sample_fport;
    if (dto.sample_decoded !== undefined) existing.sample_decoded = dto.sample_decoded;
    if (dto.is_active !== undefined) existing.is_active = dto.is_active;
    if (dto.metadata !== undefined) existing.metadata = { ...existing.metadata, ...dto.metadata };

    existing.sku = targetSku;
    existing.long_fw = targetLongFw;
    existing.updated_at = new Date().toISOString();

    this.scripts.set(id, existing);
    return existing;
  }

  /**
   * Delete a decoder script
   */
  async deleteScript(id: string): Promise<boolean> {
    const existing = this.scripts.get(id);
    if (!existing) return false;

    this.skuFwIndex.delete(this.normalizeKey(existing.sku, existing.long_fw));
    return this.scripts.delete(id);
  }

  /**
   * Get script by unique ID
   */
  async getScriptById(id: string): Promise<DecoderScript | null> {
    return this.scripts.get(id) || null;
  }

  /**
   * Recognize and fetch decoder script by (sku, long_fw)
   */
  async getScriptBySkuAndFw(sku: string, longFw: string): Promise<DecoderScript | null> {
    if (!sku || !longFw) return null;
    const key = this.normalizeKey(sku, longFw);
    const scriptId = this.skuFwIndex.get(key);
    if (!scriptId) return null;
    const script = this.scripts.get(scriptId);
    return script || null;
  }

  /**
   * List scripts with query filters
   */
  async listScripts(filter: DecoderQueryFilter = {}): Promise<DecoderScript[]> {
    let result = Array.from(this.scripts.values());

    if (filter.sku) {
      const matchSku = filter.sku.trim().toUpperCase();
      result = result.filter(s => s.sku.includes(matchSku));
    }

    if (filter.long_fw) {
      const matchFw = filter.long_fw.trim().toUpperCase();
      result = result.filter(s => s.long_fw.includes(matchFw));
    }

    if (filter.is_active !== undefined) {
      result = result.filter(s => s.is_active === filter.is_active);
    }

    if (filter.protocol) {
      result = result.filter(s => s.protocol === filter.protocol);
    }

    if (filter.search) {
      const search = filter.search.toLowerCase();
      result = result.filter(
        s =>
          s.name.toLowerCase().includes(search) ||
          s.sku.toLowerCase().includes(search) ||
          s.long_fw.toLowerCase().includes(search) ||
          (s.description && s.description.toLowerCase().includes(search))
      );
    }

    return result;
  }

  /**
   * Test execute a script against sample payload in isolated sandbox
   */
  async testScript(req: DecodeTestRequest): Promise<DecodeTestResult> {
    return LoRaWANScriptRunner.execute(req.script, req.payload, {
      timeoutMs: req.timeoutMs,
      fPort: req.fPort,
      inputFormat: req.inputFormat,
      variables: req.variables,
      captureLogs: true,
    });
  }

  /**
   * Decode payload automatically by recognizing SKU and LONG_FW
   */
  async decodePayload(req: DecodeExecuteRequest): Promise<DecodeExecuteResult> {
    const startTime = performance.now();
    const script = await this.getScriptBySkuAndFw(req.sku, req.long_fw);

    if (!script) {
      return {
        success: false,
        matched: false,
        sku: req.sku,
        long_fw: req.long_fw,
        errors: [`No decoder script registered for SKU "${req.sku}" and LONG_FW "${req.long_fw}".`],
        executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
      };
    }

    if (!script.is_active) {
      return {
        success: false,
        matched: true,
        sku: req.sku,
        long_fw: req.long_fw,
        scriptName: script.name,
        scriptId: script.id,
        errors: [`Decoder script for SKU "${req.sku}" and LONG_FW "${req.long_fw}" is currently inactive.`],
        executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
      };
    }

    const testRes = LoRaWANScriptRunner.execute(script.script, req.payload, {
      timeoutMs: req.timeoutMs,
      fPort: req.fPort,
      inputFormat: req.inputFormat || script.input_format,
      variables: req.variables,
      captureLogs: true,
    });

    return {
      success: testRes.success,
      matched: true,
      sku: req.sku,
      long_fw: req.long_fw,
      scriptName: script.name,
      scriptId: script.id,
      data: testRes.data,
      errors: testRes.errors,
      executionTimeMs: testRes.executionTimeMs,
      logs: testRes.logs,
    };
  }

  /**
   * List available memmaps enriched with decoder status
   */
  async listMemmapsWithDecoderStatus(): Promise<MemmapProfileSummary[]> {
    const memmaps = await this.memmapBridge.listProfiles();
    return memmaps.map(m => {
      const script = this.getScriptBySkuAndFwSync(m.sku, m.long_fw);
      return {
        ...m,
        has_decoder: !!script,
        decoder_id: script ? script.id : undefined,
        decoder_name: script ? script.name : undefined,
      };
    });
  }

  private getScriptBySkuAndFwSync(sku: string, longFw: string): DecoderScript | null {
    if (!sku || !longFw) return null;
    const key = this.normalizeKey(sku, longFw);
    const id = this.skuFwIndex.get(key);
    return id ? this.scripts.get(id) || null : null;
  }
}
