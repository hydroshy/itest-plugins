import { IPluginLifecycle, IPluginContext } from '@iot-platform/plugin-sdk';

export const MEMMAP_DATA_TYPES = [
  'int16',
  'uint16',
  'int32',
  'uint32',
  'float32',
  'float64',
  'boolean',
  'string',
] as const;

export type MemmapDataType = (typeof MEMMAP_DATA_TYPES)[number];
export type MemmapAccessMode = 'read' | 'write' | 'readwrite';
export type MemmapSourceFormat = 'json' | 'csv';

export interface MemmapRegister {
  name: string;
  address: number;
  dataType: MemmapDataType;
  scale?: number;
  unit?: string;
  accessMode: MemmapAccessMode;
}

export interface MemmapProfileInput {
  id?: string;
  name: string;
  description?: string;
  sourceFormat: MemmapSourceFormat;
  registers: MemmapRegister[];
}

export interface MemmapImportError {
  row?: number;
  field?: string;
  message: string;
}

export interface MemmapPreviewResult {
  valid: boolean;
  profile?: MemmapProfileInput;
  registers: MemmapRegister[];
  errors: MemmapImportError[];
}

export interface MemmapManagerConfig {
  enabled: boolean;
  options?: Record<string, unknown>;
}

/**
 * Parses untrusted JSON/CSV payloads into a database-neutral MemMap contract.
 * Persistence and HTTP transport remain owned by the host system adapter.
 */
export class MemmapManagerService {
  private config: MemmapManagerConfig = { enabled: true };

  configure(cfg: Partial<MemmapManagerConfig>): void {
    this.config = { ...this.config, ...cfg };
  }

  previewImport(content: string, format?: string): MemmapPreviewResult {
    const sourceFormat = this.resolveFormat(content, format);
    if (!sourceFormat) {
      return this.invalid([{ field: 'format', message: 'Only JSON and CSV MemMap imports are supported' }]);
    }

    let candidate: unknown;
    try {
      candidate = sourceFormat === 'json' ? JSON.parse(content) : this.parseCsv(content);
    } catch (error) {
      return this.invalid([{ message: error instanceof Error ? error.message : 'Unable to parse import file' }]);
    }

    return this.validateProfile(candidate, sourceFormat);
  }

  getStatus(): { plugin: string; name: string; enabled: boolean; timestamp: string } {
    return {
      plugin: 'memmap-manager',
      name: 'Memory Map Manager & Upload',
      enabled: this.config.enabled,
      timestamp: new Date().toISOString(),
    };
  }

  private validateProfile(candidate: unknown, sourceFormat: MemmapSourceFormat): MemmapPreviewResult {
    const errors: MemmapImportError[] = [];
    const source = this.asRecord(candidate);
    const suppliedRegisters = Array.isArray(source?.registers)
      ? source.registers
      : Array.isArray(candidate)
        ? candidate
        : undefined;

    if (!source || !suppliedRegisters) {
      return this.invalid([{ message: 'Import must contain a profile object with a registers array' }]);
    }

    const name = this.asString(source.name);
    if (!name) errors.push({ field: 'name', message: 'Profile name is required' });

    const registers: MemmapRegister[] = [];
    const addresses = new Set<number>();
    suppliedRegisters.forEach((value, index) => {
      const register = this.validateRegister(value, index + 1, errors);
      if (!register) return;
      if (addresses.has(register.address)) {
        errors.push({ row: index + 1, field: 'address', message: 'Register address must be unique within a profile' });
        return;
      }
      addresses.add(register.address);
      registers.push(register);
    });

    if (suppliedRegisters.length === 0) errors.push({ field: 'registers', message: 'At least one register is required' });
    if (errors.length > 0 || !name) return { valid: false, registers, errors };

    return {
      valid: true,
      profile: {
        id: this.asString(source.id),
        name,
        description: this.asString(source.description),
        sourceFormat,
        registers,
      },
      registers,
      errors: [],
    };
  }

  private validateRegister(value: unknown, row: number, errors: MemmapImportError[]): MemmapRegister | undefined {
    const source = this.asRecord(value);
    if (!source) {
      errors.push({ row, message: 'Register must be an object' });
      return undefined;
    }

    const name = this.asString(source.name) ?? this.asString(source.parameterName);
    const address = this.asFiniteNumber(source.address);
    const dataType = this.asString(source.dataType) ?? this.asString(source.format);
    const accessMode = this.asString(source.accessMode) ?? 'read';
    const scale = this.asOptionalFiniteNumber(source.scale);
    const unit = this.asString(source.unit);

    if (!name) errors.push({ row, field: 'name', message: 'Register name is required' });
    if (address === undefined || !Number.isInteger(address) || address < 0) {
      errors.push({ row, field: 'address', message: 'Address must be a non-negative integer' });
    }
    if (!dataType || !MEMMAP_DATA_TYPES.includes(dataType as MemmapDataType)) {
      errors.push({ row, field: 'dataType', message: `Data type must be one of: ${MEMMAP_DATA_TYPES.join(', ')}` });
    }
    if (accessMode !== 'read' && accessMode !== 'write' && accessMode !== 'readwrite') {
      errors.push({ row, field: 'accessMode', message: 'Access mode must be read, write, or readwrite' });
    }
    if (source.scale !== undefined && scale === undefined) {
      errors.push({ row, field: 'scale', message: 'Scale must be a finite number' });
    }

    if (!name || address === undefined || !Number.isInteger(address) || address < 0 || !dataType ||
      !MEMMAP_DATA_TYPES.includes(dataType as MemmapDataType) ||
      (accessMode !== 'read' && accessMode !== 'write' && accessMode !== 'readwrite') ||
      (source.scale !== undefined && scale === undefined)) return undefined;

    return { name, address, dataType: dataType as MemmapDataType, scale, unit, accessMode };
  }

  private parseCsv(content: string): unknown {
    const rows = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
    if (rows.length < 2) throw new Error('CSV import must include a header and at least one register row');
    const headers = this.parseCsvLine(rows[0]).map((header) => header.trim());
    const allowed = new Set(['profileName', 'name', 'description', 'address', 'dataType', 'format', 'scale', 'unit', 'accessMode']);
    if (!headers.includes('name') || !headers.includes('address') || !(headers.includes('dataType') || headers.includes('format')) || !headers.every((header) => allowed.has(header))) {
      throw new Error('CSV header must include only supported columns, including name, address, and dataType (or format)');
    }
    const mappedRows = rows.slice(1).map((line) => {
      const values = this.parseCsvLine(line);
      return headers.reduce<Record<string, string>>((result, header, index) => {
        result[header] = values[index] ?? '';
        return result;
      }, {});
    });
    const profileName = mappedRows[0]?.profileName?.trim() || 'Imported MemMap';
    const description = mappedRows[0]?.description?.trim() || undefined;
    return { name: profileName, description, registers: mappedRows };
  }

  private parseCsvLine(line: string): string[] {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        if (quoted && line[index + 1] === '"') { current += '"'; index += 1; } else quoted = !quoted;
      } else if (char === ',' && !quoted) { cells.push(current.trim()); current = ''; } else current += char;
    }
    if (quoted) throw new Error('CSV contains an unclosed quoted value');
    cells.push(current.trim());
    return cells;
  }

  private resolveFormat(content: string, format?: string): MemmapSourceFormat | undefined {
    const normalized = format?.toLowerCase().replace(/^\./, '');
    if (normalized === 'json' || normalized === 'csv') return normalized;
    const trimmed = content.trim();
    return trimmed.startsWith('{') || trimmed.startsWith('[') ? 'json' : undefined;
  }

  private invalid(errors: MemmapImportError[]): MemmapPreviewResult { return { valid: false, registers: [], errors }; }
  private asRecord(value: unknown): Record<string, unknown> | undefined { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
  private asString(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
  private asFiniteNumber(value: unknown): number | undefined { const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN; return Number.isFinite(number) ? number : undefined; }
  private asOptionalFiniteNumber(value: unknown): number | undefined { return value === undefined || value === '' ? undefined : this.asFiniteNumber(value); }
}

export default class MemmapManagerPlugin implements IPluginLifecycle {
  private context?: IPluginContext;
  public readonly service = new MemmapManagerService();

  async init(context: IPluginContext): Promise<void> {
    this.context = context;
    context.logger.info(`[${context.manifest.name}] Initialized`);
  }

  async start(): Promise<void> { this.context?.logger.info(`[${this.context?.manifest.name}] Started`); }
  async stop(): Promise<void> { this.context?.logger.info(`[${this.context?.manifest.name}] Stopped`); }
  async destroy(): Promise<void> { this.context?.logger.info(`[${this.context?.manifest.name}] Destroyed`); }
}
