import { MemmapProfileSummary } from './decoder.types';

export interface IMemmapBridge {
  listProfiles(): Promise<MemmapProfileSummary[]>;
  getProfile(sku: string, longFw: string): Promise<MemmapProfileSummary | null>;
  listAvailableSkuAndFw(): Promise<Array<{ sku: string; long_fw: string; name: string }>>;
  registerProfiles(profiles: MemmapProfileSummary[]): void;
}

export class DefaultMemmapBridge implements IMemmapBridge {
  private profiles: Map<string, MemmapProfileSummary> = new Map();

  constructor(initialProfiles: MemmapProfileSummary[] = []) {
    this.registerProfiles(initialProfiles);
  }

  private getKey(sku: string, longFw: string): string {
    return `${sku.trim().toUpperCase()}::${longFw.trim().toUpperCase()}`;
  }

  registerProfiles(profiles: MemmapProfileSummary[]): void {
    for (const p of profiles) {
      if (p.sku && p.long_fw) {
        this.profiles.set(this.getKey(p.sku, p.long_fw), { ...p });
      }
    }
  }

  async listProfiles(): Promise<MemmapProfileSummary[]> {
    return Array.from(this.profiles.values());
  }

  async getProfile(sku: string, longFw: string): Promise<MemmapProfileSummary | null> {
    if (!sku || !longFw) return null;
    return this.profiles.get(this.getKey(sku, longFw)) || null;
  }

  async listAvailableSkuAndFw(): Promise<Array<{ sku: string; long_fw: string; name: string }>> {
    return Array.from(this.profiles.values()).map(p => ({
      sku: p.sku,
      long_fw: p.long_fw,
      name: p.name,
    }));
  }
}
