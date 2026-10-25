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
  'hex',
] as const;

export type MemmapDataType = (typeof MEMMAP_DATA_TYPES)[number];
export type MemmapAccessMode = 'read' | 'write' | 'readwrite';
export type MemmapSourceFormat = 'json' | 'csv';

export interface MemmapRegister {
  /** Normalized fields retained for existing host integrations. */
  name: string;
  address: number;
  dataType: MemmapDataType;
  accessMode: MemmapAccessMode;
  description?: string;
  scale?: number;
  offset?: number;
  unit?: string;
  defaultValue?: string;
  /** Every IEC485 column is exposed separately for row-oriented persistence/UI. */
  rowNumber?: number;
  modbusRegisterDecimal?: number;
  modbusRegisterHex?: string;
  functionCodeRead?: string;
  functionCodeWrite?: string;
  registerCount?: number;
  range?: string;
  endUserDefault?: string;
  format?: string;
  downlink5?: string;
  inRd1Template?: string;
  comment?: string;
  inEngineeringTemplate?: string;
  inEndUserTemplate?: string;
  inFullTemplate?: string;
  /** Continuity result against the previous imported IEC485 row; undefined for row 1. */
  decimalValid?: boolean;
  hexValid?: boolean;
  decimalValidationMessage?: string;
  hexValidationMessage?: string;
  rawRegister?: Record<string, string>;
}

export interface MemmapProfileInput {
  id?: string;
  name: string;
  description?: string;
  sku?: string;
  longFw?: string;
  shortFw?: string;
  decimalCheck?: boolean;
  hexCheck?: boolean;
  dateCreate?: string;
  createdBy?: string;
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
        sku: this.asString(source.sku),
        longFw: this.asString(source.longFw),
        shortFw: this.asString(source.shortFw),
        decimalCheck: this.asOptionalBoolean(source.decimalCheck) ?? registers.every((register) => register.decimalValid !== false),
        hexCheck: this.asOptionalBoolean(source.hexCheck) ?? registers.every((register) => register.hexValid !== false),
        dateCreate: this.asString(source.dateCreate),
        createdBy: this.asString(source.createdBy),
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
    const dataType = this.asString(source.dataType) ?? this.asString(source.format)?.toLowerCase();
    const accessMode = this.asString(source.accessMode) ?? 'read';
    const scale = this.asOptionalFiniteNumber(source.scale);
    const offset = this.asOptionalFiniteNumber(source.offset);
    const unit = this.asString(source.unit);
    const description = this.asString(source.description);
    const defaultValue = this.asString(source.defaultValue);
    const rawRegister = this.asStringRecord(source.rawRegister);
    const rowNumber = this.asOptionalFiniteNumber(source.rowNumber);
    const modbusRegisterDecimal = this.asOptionalFiniteNumber(source.modbusRegisterDecimal);
    const modbusRegisterHex = this.asString(source.modbusRegisterHex);
    const functionCodeRead = this.asString(source.functionCodeRead);
    const functionCodeWrite = this.asString(source.functionCodeWrite);
    const registerCount = this.asOptionalFiniteNumber(source.registerCount);
    const range = this.asString(source.range);
    const endUserDefault = this.asString(source.endUserDefault);
    const format = this.asString(source.format);
    const downlink5 = this.asString(source.downlink5);
    const inRd1Template = this.asString(source.inRd1Template);
    const comment = this.asString(source.comment);
    const inEngineeringTemplate = this.asString(source.inEngineeringTemplate);
    const inEndUserTemplate = this.asString(source.inEndUserTemplate);
    const inFullTemplate = this.asString(source.inFullTemplate);
    const decimalValid = this.asOptionalBoolean(source.decimalValid);
    const hexValid = this.asOptionalBoolean(source.hexValid);
    const decimalValidationMessage = this.asString(source.decimalValidationMessage);
    const hexValidationMessage = this.asString(source.hexValidationMessage);

    if (decimalValid === false) {
      errors.push({
        row,
        field: 'modbusRegisterDecimal',
        message: decimalValidationMessage || `Row ${row}: Modbus Register Decimal validation failed`,
      });
    }
    if (hexValid === false) {
      errors.push({
        row,
        field: 'modbusRegisterHex',
        message: hexValidationMessage || `Row ${row}: Modbus Register Hex validation failed`,
      });
    }

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
    if (source.offset !== undefined && offset === undefined) {
      errors.push({ row, field: 'offset', message: 'Offset must be a finite number' });
    }

    if (!name || address === undefined || !Number.isInteger(address) || address < 0 || !dataType ||
      !MEMMAP_DATA_TYPES.includes(dataType as MemmapDataType) ||
      (accessMode !== 'read' && accessMode !== 'write' && accessMode !== 'readwrite') ||
      (source.scale !== undefined && scale === undefined) ||
      (source.offset !== undefined && offset === undefined)) return undefined;

    return {
      name,
      description,
      address,
      dataType: dataType as MemmapDataType,
      scale,
      offset,
      unit,
      defaultValue,
      accessMode,
      rowNumber,
      modbusRegisterDecimal,
      modbusRegisterHex,
      functionCodeRead,
      functionCodeWrite,
      registerCount,
      range,
      endUserDefault,
      format,
      downlink5,
      inRd1Template,
      comment,
      inEngineeringTemplate,
      inEndUserTemplate,
      inFullTemplate,
      decimalValid,
      hexValid,
      decimalValidationMessage,
      hexValidationMessage,
      rawRegister,
    };
  }

  private parseCsv(content: string): unknown {
    const rows = this.parseCsvRecords(content.replace(/^\uFEFF/, '')).filter((row) => row.some((value) => value.trim()));
    if (rows.length < 2) throw new Error('CSV import must include a header and at least one register row');

    const headers = rows[0].map((header) => header.trim());
    const mappedRows = rows.slice(1).map((values, rowIndex) => {
      if (values.length !== headers.length) {
        throw new Error(`CSV row ${rowIndex + 2} has ${values.length} columns; expected ${headers.length}`);
      }
      return headers.reduce<Record<string, string>>((result, header, index) => {
        result[header] = values[index].trim();
        return result;
      }, {});
    });

    if (headers.includes('Modbus Register (Decimal)') && headers.includes('Description') && headers.includes('Format')) {
      const registers = mappedRows.map((row, index) => this.mapLegacyIec485Register(row, mappedRows[index - 1]));
      return { name: 'Imported MemMap', sourceFormat: 'csv', registers };
    }

    const allowed = new Set(['profileName', 'name', 'description', 'address', 'dataType', 'format', 'scale', 'offset', 'unit', 'defaultValue', 'accessMode']);
    if (!headers.includes('name') || !headers.includes('address') || !(headers.includes('dataType') || headers.includes('format')) || !headers.every((header) => allowed.has(header))) {
      throw new Error('CSV header must include compact MemMap columns or IEC485 Modbus columns');
    }
    const profileName = mappedRows[0]?.profileName?.trim() || 'Imported MemMap';
    const description = mappedRows[0]?.description?.trim() || undefined;
    return { name: profileName, description, registers: mappedRows };
  }

  private mapLegacyIec485Register(row: Record<string, string>, previous?: Record<string, string>): Record<string, unknown> {
    const readFunction = row['Function Code (Read)']?.trim().toLowerCase();
    const writeFunction = row['Function Code (Write)']?.trim().toLowerCase();
    const hasRead = Boolean(readFunction && readFunction !== 'none' && readFunction !== 'n/a');
    const hasWrite = Boolean(writeFunction && writeFunction !== 'none' && writeFunction !== 'n/a');
    const decimal = this.asOptionalFiniteNumber(row['Modbus Register (Decimal)']);
    const hex = this.asString(row['Modbus Register (Hex)']);
    const previousDecimal = previous && this.asOptionalFiniteNumber(previous['Modbus Register (Decimal)']);
    const previousHex = previous && this.parseHex(previous['Modbus Register (Hex)']);
    const previousCount = previous && this.asOptionalFiniteNumber(previous['# of Registers']);
    const expectedDecimal = previousDecimal !== undefined && previousCount !== undefined ? previousDecimal + previousCount : undefined;
    const expectedHex = previousHex !== undefined && previousCount !== undefined ? previousHex + previousCount : undefined;
    const decimalValid = expectedDecimal === undefined ? undefined : decimal === expectedDecimal;
    const hexValid = expectedHex === undefined ? undefined : this.parseHex(hex) === expectedHex;
    return {
      name: row.Description,
      description: row.Comment || row.Description,
      address: row['Modbus Register (Decimal)'],
      dataType: row.Format?.toLowerCase(),
      defaultValue: row['End-user Default'],
      accessMode: hasRead && hasWrite ? 'readwrite' : hasWrite ? 'write' : 'read',
      rowNumber: this.asOptionalFiniteNumber(row['No.']),
      modbusRegisterDecimal: decimal,
      modbusRegisterHex: hex,
      functionCodeRead: this.asString(row['Function Code (Read)']),
      functionCodeWrite: this.asString(row['Function Code (Write)']),
      registerCount: this.asOptionalFiniteNumber(row['# of Registers']),
      range: this.asString(row.Range),
      endUserDefault: this.asString(row['End-user Default']),
      format: this.asString(row.Format),
      downlink5: this.asString(row['Downlink 5']),
      inRd1Template: this.asString(row['In RD1 Template']),
      comment: this.asString(row.Comment),
      inEngineeringTemplate: this.asString(row['In Engineering Template']),
      inEndUserTemplate: this.asString(row['In End-user Template']),
      inFullTemplate: this.asString(row['In Full Template']),
      decimalValid,
      hexValid,
      ...(decimalValid === false ? { decimalValidationMessage: `Expected decimal ${expectedDecimal} from previous address ${previousDecimal} + register count ${previousCount}` } : {}),
      ...(hexValid === false ? { hexValidationMessage: `Expected hex ${expectedHex!.toString(16).toUpperCase()} from previous hex ${previous!['Modbus Register (Hex)']} + register count ${previousCount}` } : {}),
      rawRegister: row,
    };
  }

  /** RFC 4180 parser: commas, escaped quotes, CRLF and quoted multi-line cells. */
  private parseCsvRecords(content: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    for (let index = 0; index < content.length; index += 1) {
      const char = content[index];
      if (char === '"') {
        if (quoted && content[index + 1] === '"') { cell += '"'; index += 1; } else quoted = !quoted;
      } else if (char === ',' && !quoted) {
        row.push(cell); cell = '';
      } else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && content[index + 1] === '\n') index += 1;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else {
        cell += char;
      }
    }
    if (quoted) throw new Error('CSV contains an unclosed quoted value');
    if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
    return rows;
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
  private asStringRecord(value: unknown): Record<string, string> | undefined {
    const source = this.asRecord(value);
    if (!source) return undefined;
    return Object.entries(source).reduce<Record<string, string>>((result, [key, entry]) => {
      if (typeof entry === 'string') result[key] = entry;
      return result;
    }, {});
  }
  private asFiniteNumber(value: unknown): number | undefined { const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN; return Number.isFinite(number) ? number : undefined; }
  private asOptionalFiniteNumber(value: unknown): number | undefined { return value === undefined || value === '' ? undefined : this.asFiniteNumber(value); }
  private asOptionalBoolean(value: unknown): boolean | undefined { return typeof value === 'boolean' ? value : undefined; }
  private parseHex(value: unknown): number | undefined {
    const text = this.asString(value);
    if (!text || !/^(?:0x)?[0-9a-f]+$/i.test(text)) return undefined;
    const parsed = Number.parseInt(text.replace(/^0x/i, ''), 16);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
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
