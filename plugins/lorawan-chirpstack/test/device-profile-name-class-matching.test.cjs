const { test } = require('node:test');
const assert = require('node:assert/strict');

function matchDeviceProfile(rawRegion, rawClass, availableProfiles, tenantId) {
  const normalizeRegion = (val) => String(val || '').toUpperCase().replace(/[-_\s]/g, '');
  const region = normalizeRegion(rawRegion);
  const classCode = String(rawClass || 'A').toUpperCase().replace(/^CLASS[_\s-]?/, '').trim();
  const isClassB = ['B', '1'].includes(classCode);
  const isClassC = ['C', '2'].includes(classCode);
  const targetClass = isClassC ? 'C' : (isClassB ? 'B' : 'A');

  const baseRegionForName = rawRegion.trim().toUpperCase().replace(/[-_\s].*$/, '');
  const fullRegionForName = rawRegion.trim().toUpperCase();
  const nameTargets = Array.from(new Set([
    `${baseRegionForName}_${targetClass}`,
    `${fullRegionForName}_${targetClass}`,
    `${baseRegionForName}-${targetClass}`,
    `${fullRegionForName}-${targetClass}`,
    `${baseRegionForName} ${targetClass}`,
    `${fullRegionForName} ${targetClass}`,
    `${baseRegionForName}_CLASS_${targetClass}`,
    `${baseRegionForName}_CLASS${targetClass}`,
  ]));

  const isTenantOk = (p) => !p.tenantId || !tenantId ||
    String(p.tenantId).trim().toLowerCase() === String(tenantId).trim().toLowerCase();

  const nameMatches = availableProfiles.filter((p) => {
    if (typeof p.id !== 'string' || !p.id.trim() || !isTenantOk(p)) return false;
    const pName = String(p.name || '').toUpperCase();
    return nameTargets.some((target) => pName.includes(target));
  });

  const exactMatch = nameMatches.find((p) => {
    const pName = String(p.name || '').trim().toUpperCase();
    return nameTargets.includes(pName);
  });
  if (exactMatch) {
    return exactMatch;
  }

  if (nameMatches.length === 1) {
    return nameMatches[0];
  }

  if (nameMatches.length > 1) {
    const refined = nameMatches.filter((p) => {
      const pSupportsB = Boolean(p.supportsClassB === true || p.supportsClassB === 'true');
      const pSupportsC = Boolean(p.supportsClassC === true || p.supportsClassC === 'true');
      if (targetClass === 'C') return pSupportsC;
      if (targetClass === 'B') return pSupportsB;
      return !pSupportsC && !pSupportsB;
    });
    if (refined.length === 1) return refined[0];
  }

  return null;
}

test('resolves profile EU868_A when device is Class A', () => {
  const profiles = [
    { id: 'dp-eu868-a', name: 'EU868_A', region: 'EU868', supportsClassC: false },
    { id: 'dp-eu868-c', name: 'EU868_C', region: 'EU868', supportsClassC: true },
  ];
  const matched = matchDeviceProfile('EU868', 'A', profiles, 'tenant-1');
  assert.equal(matched?.id, 'dp-eu868-a');
  assert.equal(matched?.name, 'EU868_A');
});

test('resolves profile EU868_C when device is Class C', () => {
  const profiles = [
    { id: 'dp-eu868-a', name: 'EU868_A', region: 'EU868', supportsClassC: false },
    { id: 'dp-eu868-c', name: 'EU868_C', region: 'EU868', supportsClassC: true },
  ];
  const matched = matchDeviceProfile('EU868', 'C', profiles, 'tenant-1');
  assert.equal(matched?.id, 'dp-eu868-c');
  assert.equal(matched?.name, 'EU868_C');
});

test('resolves profile EU868_C when register 85 class numeric is 2 (Class C)', () => {
  const profiles = [
    { id: 'dp-eu868-a', name: 'EU868_A', region: 'EU868', supportsClassC: false },
    { id: 'dp-eu868-c', name: 'EU868_C', region: 'EU868', supportsClassC: true },
  ];
  const matched = matchDeviceProfile('EU868', '2', profiles, 'tenant-1');
  assert.equal(matched?.id, 'dp-eu868-c');
});

test('resolves profile with format CLASS_C or hyphen EU868-C', () => {
  const profiles = [
    { id: 'dp-eu868-c-hyphen', name: 'EU868-C', region: 'EU868', supportsClassC: true },
  ];
  const matched = matchDeviceProfile('EU868', 'CLASS_C', profiles, 'tenant-1');
  assert.equal(matched?.id, 'dp-eu868-c-hyphen');
});
