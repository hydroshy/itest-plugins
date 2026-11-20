/**
 * Preconfiguration Read-Back Verification Engine
 * Strictly verifies whether written register values match the device's actual values read back over Modbus.
 */

export interface VerificationTarget {
  address: number;
  count: number;
  expectedValues: number[]; // 16-bit unsigned integers
  description?: string;
  format?: string;
}

export interface VerificationMismatch {
  address: number;
  expected: number;
  actual: number | undefined;
  expectedHex: string;
  actualHex: string;
  description?: string;
}

export interface VerificationResult {
  pass: boolean;
  totalRegisters: number;
  matchedCount: number;
  mismatches: VerificationMismatch[];
  summaryMessage: string;
}

/**
 * Perform fail-closed read-back verification against the read memory.
 * actualMemory can be either:
 * - Map<number, number> (address -> 16-bit word)
 * - Map<number, [number, number]> (address -> [hiByte, loByte])
 */
export function verifyReadBackValues(
  targets: VerificationTarget[],
  actualMemory: Map<number, number | [number, number]>,
): VerificationResult {
  const mismatches: VerificationMismatch[] = [];
  let totalWords = 0;
  let matchedWords = 0;

  for (const target of targets) {
    const count = target.count || target.expectedValues.length || 1;
    for (let offset = 0; offset < count; offset++) {
      totalWords++;
      const addr = target.address + offset;
      const expected = (target.expectedValues[offset] ?? 0) & 0xffff;

      let actual: number | undefined;
      const memVal = actualMemory.get(addr);
      if (memVal !== undefined) {
        if (Array.isArray(memVal)) {
          actual = ((memVal[0] & 0xff) << 8) | (memVal[1] & 0xff);
        } else {
          actual = memVal & 0xffff;
        }
      }

      if (actual === undefined || actual !== expected) {
        mismatches.push({
          address: addr,
          expected,
          actual,
          expectedHex: `0x${expected.toString(16).padStart(4, '0').toUpperCase()}`,
          actualHex: actual !== undefined ? `0x${actual.toString(16).padStart(4, '0').toUpperCase()}` : 'MISSING',
          description: target.description,
        });
      } else {
        matchedWords++;
      }
    }
  }

  const pass = mismatches.length === 0 && totalWords > 0;
  const summaryMessage = pass
    ? `Xác thực thành công 100% (${matchedWords}/${totalWords} thanh ghi khớp hoàn toàn).`
    : `Xác thực thất bại: ${mismatches.length}/${totalWords} thanh ghi không khớp hoặc không đọc được.`;

  return {
    pass,
    totalRegisters: totalWords,
    matchedCount: matchedWords,
    mismatches,
    summaryMessage,
  };
}
