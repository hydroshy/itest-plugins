import { randomUUID } from 'node:crypto';
import {
  CreateDecoderScriptDto,
  DecodeExecuteRequest,
  DecodeExecuteResult,
  DecoderQueryFilter,
  DecoderScript,
  DecodeTestRequest,
  DecodeTestResult,
  DeviceTestingResolution,
  MemmapProfileSummary,
  UpdateDecoderScriptDto,
} from './decoder.types';
import { LoRaWANScriptRunner } from './lorawan-script-runner';
import { DefaultMemmapBridge, IMemmapBridge } from './decoder-memmap.bridge';

export const FW_VERSION_REGEX = /^[0-9]F[0-9]{4}$/;

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
   * Register a new decoder script mapped to (sku, long_fw) and optional (item_code, fw_code)
   */
  async registerScript(dto: CreateDecoderScriptDto): Promise<DecoderScript> {
    const rawFwVer = (dto.fw_version || '').trim();
    if (rawFwVer && (rawFwVer.includes('F') || rawFwVer.length > 2)) {
      if (!FW_VERSION_REGEX.test(rawFwVer)) {
        throw new Error(`Định dạng FW_VERSION không hợp lệ: '${rawFwVer}'. Định dạng chuẩn là XFXXXX (X là số, ví dụ 0F0001).`);
      }
    }

    const itemCode = (dto.item_code || '').trim();
    const sku = (dto.sku || itemCode || dto.fw_code || '').trim();
    const longFw = (dto.long_fw || rawFwVer || dto.fw_code || '').trim();

    if (!sku) {
      throw new Error('ITEM_CODE (hoặc SKU / FW_CODE) là bắt buộc.');
    }
    if (!longFw) {
      throw new Error('FW_VERSION (hoặc LONG_FW) là bắt buộc.');
    }
    if (!dto.script || !dto.script.trim()) {
      throw new Error('Decoder script content is required.');
    }

    const key = this.normalizeKey(sku, longFw);
    if (this.skuFwIndex.has(key)) {
      throw new Error(`Decoder script already exists for SKU "${sku}" and LONG_FW "${longFw}".`);
    }

    // Syntax & entrypoint check with dummy payload
    const syntaxCheck = LoRaWANScriptRunner.execute(dto.script, '00', {
      timeoutMs: 1000,
      fPort: 1,
    });
    // Check if script had fatal syntax or entrypoint errors (allow logical warnings)
    if (
      syntaxCheck.errors &&
      syntaxCheck.errors.some(
        e => e.includes('No valid decoder entrypoint found') || e.includes('SyntaxError')
      )
    ) {
      throw new Error(`Invalid decoder script: ${syntaxCheck.errors.join('; ')}`);
    }

    const now = new Date().toISOString();
    const id = randomUUID();

    const record: DecoderScript = {
      id,
      name: dto.name || `Decoder for ${sku} ${longFw}`,
      sku,
      long_fw: longFw,
      item_code: dto.item_code?.trim() || undefined,
      fw_code: dto.fw_code?.trim() || undefined,
      fw_version: dto.fw_version?.trim() || longFw,
      script: dto.script,
      protocol: dto.protocol || 'lorawan',
      description: dto.description,
      input_format: dto.input_format || 'hex',
      sample_payload: dto.sample_payload,
      sample_fport: dto.sample_fport ?? 1,
      sample_decoded: dto.sample_decoded,
      is_active: dto.is_active !== undefined ? dto.is_active : true,
      metadata: dto.metadata || {},
      created_at: now,
      updated_at: now,
      created_by: dto.created_by,
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
      throw new Error(`Decoder script with id ${id} not found.`);
    }

    let targetSku = existing.sku;
    let targetLongFw = existing.long_fw;

    if (dto.sku || dto.long_fw || dto.fw_code || dto.fw_version || dto.item_code) {
      targetSku = (dto.sku || dto.fw_code || dto.item_code || existing.sku).trim().toUpperCase();
      targetLongFw = (dto.long_fw || dto.fw_version || existing.long_fw).trim().toUpperCase();
      const newKey = this.normalizeKey(targetSku, targetLongFw);
      const existingKeyOwner = this.skuFwIndex.get(newKey);
      if (existingKeyOwner && existingKeyOwner !== id) {
        throw new Error(
          `Another script already exists for SKU "${targetSku}" and LONG_FW "${targetLongFw}".`
        );
      }
      this.skuFwIndex.delete(this.normalizeKey(existing.sku, existing.long_fw));
      this.skuFwIndex.set(newKey, id);
    }

    if (dto.script && dto.script.trim()) {
      const syntaxCheck = LoRaWANScriptRunner.execute(dto.script, '00', {
        timeoutMs: 1000,
        fPort: 1,
      });
      if (
        syntaxCheck.errors &&
        syntaxCheck.errors.some(
          e => e.includes('No valid decoder entrypoint found') || e.includes('SyntaxError')
        )
      ) {
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
    if (dto.metadata !== undefined) existing.metadata = dto.metadata;
    if (dto.item_code !== undefined) existing.item_code = dto.item_code?.trim() || undefined;
    if (dto.fw_code !== undefined) existing.fw_code = dto.fw_code?.trim() || undefined;
    if (dto.fw_version !== undefined) existing.fw_version = dto.fw_version?.trim() || undefined;

    existing.sku = targetSku;
    existing.long_fw = targetLongFw;
    existing.updated_at = new Date().toISOString();

    return existing;
  }

  /**
   * Delete script by ID
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
   * Resolve decoder script for device testing via multi-tier matching:
   * Tier 1: exact_full: item_code + fw_code + (long_fw / fw_version)
   * Tier 2: fw_code_fw_ver: fw_code + (long_fw / fw_version)
   * Tier 3: item_code_fw_ver: item_code + (long_fw / fw_version)
   * Tier 4: sku_long_fw: sku + long_fw
   */
  async resolveDecoderForDevice(
    params: DeviceTestingResolution
  ): Promise<{
    script: DecoderScript;
    matchTier: 'exact_full' | 'fw_code_fw_ver' | 'item_code_fw_ver' | 'sku_long_fw';
  } | null> {
    const itemCode = params.item_code?.trim().toUpperCase();
    const fwCode = params.fw_code?.trim().toUpperCase();
    const fwVer = (params.long_fw || params.fw_version || '').trim().toUpperCase();
    const sku = (params.sku || fwCode || itemCode || '').trim().toUpperCase();

    const all = Array.from(this.scripts.values()).filter(s => s.is_active);

    // Tier 1: exact_full
    if (itemCode && fwCode && fwVer) {
      const match = all.find(
        s =>
          (s.item_code || '').trim().toUpperCase() === itemCode &&
          (s.fw_code || '').trim().toUpperCase() === fwCode &&
          ((s.long_fw || '').trim().toUpperCase() === fwVer ||
            (s.fw_version || '').trim().toUpperCase() === fwVer)
      );
      if (match) return { script: match, matchTier: 'exact_full' };
    }

    // Tier 2: fw_code + fwVer
    if (fwCode && fwVer) {
      const match = all.find(
        s =>
          ((s.fw_code || '').trim().toUpperCase() === fwCode ||
            (s.sku || '').trim().toUpperCase() === fwCode) &&
          ((s.long_fw || '').trim().toUpperCase() === fwVer ||
            (s.fw_version || '').trim().toUpperCase() === fwVer)
      );
      if (match) return { script: match, matchTier: 'fw_code_fw_ver' };
    }

    // Tier 3: item_code + fwVer
    if (itemCode && fwVer) {
      const match = all.find(
        s =>
          ((s.item_code || '').trim().toUpperCase() === itemCode || (s.sku || '').trim().toUpperCase() === itemCode) &&
          ((s.long_fw || '').trim().toUpperCase() === fwVer ||
            (s.fw_version || '').trim().toUpperCase() === fwVer)
      );
      if (match) return { script: match, matchTier: 'item_code_fw_ver' };
    }

    // Tier 4: sku + long_fw
    if (sku && fwVer) {
      const match = all.find(
        s =>
          (s.sku || '').trim().toUpperCase() === sku &&
          ((s.long_fw || '').trim().toUpperCase() === fwVer ||
            (s.fw_version || '').trim().toUpperCase() === fwVer)
      );
      if (match) return { script: match, matchTier: 'sku_long_fw' };
    }

    return null;
  }

  /**
   * List scripts with query filters
   */
  async listScripts(filter: DecoderQueryFilter = {}): Promise<DecoderScript[]> {
    let result = Array.from(this.scripts.values());

    if (filter.sku) {
      const matchSku = filter.sku.trim().toUpperCase();
      result = result.filter(s => s.sku.toUpperCase().includes(matchSku));
    }

    if (filter.long_fw) {
      const matchFw = filter.long_fw.trim().toUpperCase();
      result = result.filter(s => s.long_fw.toUpperCase().includes(matchFw));
    }

    if (filter.item_code) {
      const matchItem = filter.item_code.trim().toUpperCase();
      result = result.filter(s => (s.item_code || '').toUpperCase().includes(matchItem));
    }

    if (filter.fw_code) {
      const matchFwCode = filter.fw_code.trim().toUpperCase();
      result = result.filter(s => (s.fw_code || '').toUpperCase().includes(matchFwCode));
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
          (s.item_code || '').toLowerCase().includes(search) ||
          (s.fw_code || '').toLowerCase().includes(search) ||
          (s.description || '').toLowerCase().includes(search)
      );
    }

    return result;
  }

  /**
   * Execute ad-hoc test payload with sandbox runner
   */
  testScript(req: DecodeTestRequest): DecodeTestResult {
    return LoRaWANScriptRunner.execute(req.script, req.payload, {
      fPort: req.fPort,
      inputFormat: req.inputFormat,
      variables: req.variables,
      timeoutMs: req.timeoutMs,
      captureLogs: true,
    });
  }

  /**
   * Decode live payload automatically resolving script via (item_code, fw_code, long_fw) or (sku, long_fw)
   */
  async decodePayload(req: DecodeExecuteRequest): Promise<DecodeExecuteResult> {
    const startTime = performance.now();

    let script: DecoderScript | null = null;
    let matchTier: string | undefined = undefined;

    if (req.item_code || req.fw_code) {
      const resolved = await this.resolveDecoderForDevice({
        item_code: req.item_code,
        fw_code: req.fw_code,
        fw_version: req.fw_version,
        long_fw: req.long_fw,
        sku: req.sku,
      });
      if (resolved) {
        script = resolved.script;
        matchTier = resolved.matchTier;
      }
    }

    if (!script && req.sku && req.long_fw) {
      script = await this.getScriptBySkuAndFw(req.sku, req.long_fw);
      matchTier = 'sku_long_fw';
    }

    const targetSku = req.sku || req.fw_code || req.item_code || 'UNKNOWN';
    const targetFw = req.long_fw || req.fw_version || 'UNKNOWN';

    if (!script) {
      return {
        success: false,
        matched: false,
        sku: targetSku,
        long_fw: targetFw,
        item_code: req.item_code,
        fw_code: req.fw_code,
        errors: [
          `No decoder script registered matching SKU "${targetSku}", ITEM_CODE "${req.item_code || ''}", FW_CODE "${req.fw_code || ''}" and LONG_FW "${targetFw}".`,
        ],
        executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
      };
    }

    if (!script.is_active) {
      return {
        success: false,
        matched: true,
        sku: script.sku,
        long_fw: script.long_fw,
        item_code: script.item_code,
        fw_code: script.fw_code,
        scriptName: script.name,
        scriptId: script.id,
        errors: [`Decoder script for SKU "${script.sku}" and LONG_FW "${script.long_fw}" is currently inactive.`],
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
      sku: script.sku,
      long_fw: script.long_fw,
      item_code: script.item_code,
      fw_code: script.fw_code,
      scriptName: script.name,
      scriptId: script.id,
      matchTier,
      data: testRes.data,
      errors: testRes.errors,
      warnings: testRes.warnings,
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

  getDaviteqTemplate(): string {
    return LoRaWANScriptRunner.getDaviteqTemplate();
  }

  private getScriptBySkuAndFwSync(sku: string, longFw: string): DecoderScript | null {
    if (!sku || !longFw) return null;
    const key = this.normalizeKey(sku, longFw);
    const id = this.skuFwIndex.get(key);
    return id ? this.scripts.get(id) || null : null;
  }
}
