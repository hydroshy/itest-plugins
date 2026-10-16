import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Standard pure-Node.js ZIP generator for plugin packaging.
 * No external dependencies required.
 */

// CRC32 implementation
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const d = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: d };
}

export function createZipBuffer(files) {
  const localHeaders = [];
  const centralDirs = [];
  let offset = 0;
  const now = new Date();
  const { time, date } = dosDateTime(now);

  for (const file of files) {
    const rawData = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    const uncompressedSize = rawData.length;
    const fileCrc = crc32(rawData);
    const compressedData = zlib.deflateRawSync(rawData);
    const compressedSize = compressedData.length;
    const nameBuf = Buffer.from(file.name.replace(/\\/g, '/'));

    // Local Header
    const lh = Buffer.alloc(30 + nameBuf.length);
    lh.writeUInt32LE(0x04034b50, 0); // signature
    lh.writeUInt16LE(20, 4);         // version needed (2.0)
    lh.writeUInt16LE(0, 6);          // flags
    lh.writeUInt16LE(8, 8);          // compression method (deflate)
    lh.writeUInt16LE(time, 10);
    lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(fileCrc, 14);
    lh.writeUInt32LE(compressedSize, 18);
    lh.writeUInt32LE(uncompressedSize, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);         // extra field len
    nameBuf.copy(lh, 30);

    localHeaders.push(lh, compressedData);

    // Central Directory Header
    const cd = Buffer.alloc(46 + nameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0); // signature
    cd.writeUInt16LE(20, 4);         // version made by
    cd.writeUInt16LE(20, 6);         // version needed
    cd.writeUInt16LE(0, 8);          // flags
    cd.writeUInt16LE(8, 10);         // compression method
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(fileCrc, 16);
    cd.writeUInt32LE(compressedSize, 20);
    cd.writeUInt32LE(uncompressedSize, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);         // extra field len
    cd.writeUInt16LE(0, 32);         // comment len
    cd.writeUInt16LE(0, 34);         // disk start
    cd.writeUInt16LE(0, 36);         // internal attrs
    cd.writeUInt32LE(0, 38);         // external attrs
    cd.writeUInt32LE(offset, 42);    // relative offset of local header
    nameBuf.copy(cd, 46);

    centralDirs.push(cd);
    offset += lh.length + compressedData.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const cd of centralDirs) {
    centralDirSize += cd.length;
  }

  // End of Central Directory Record (EOCD)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4);          // disk number
  eocd.writeUInt16LE(0, 6);          // disk with central dir
  eocd.writeUInt16LE(files.length, 8); // total entries on disk
  eocd.writeUInt16LE(files.length, 10); // total entries
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);         // comment length

  return Buffer.concat([...localHeaders, ...centralDirs, eocd]);
}

/**
 * Validates manifest.json conforms to Universal IoT Platform standards.
 */
export function validateManifest(manifest) {
  const errors = [];
  if (!manifest.id || typeof manifest.id !== 'string') errors.push('Missing or invalid "id"');
  if (!manifest.name || typeof manifest.name !== 'string') errors.push('Missing or invalid "name"');
  if (!manifest.version || typeof manifest.version !== 'string') errors.push('Missing or invalid "version"');
  if (!manifest.entry || typeof manifest.entry !== 'string') errors.push('Missing or invalid "entry"');
  if (!Array.isArray(manifest.capabilities)) errors.push('"capabilities" must be an array');
  if (!Array.isArray(manifest.permissions)) errors.push('"permissions" must be an array');
  if (errors.length > 0) {
    throw new Error(`Manifest validation failed:\n - ${errors.join('\n - ')}`);
  }
}

/**
 * Packages a plugin directory into a standard release zip file.
 */
export async function packPlugin(pluginDir, outDir = null) {
  const manifestPath = path.join(pluginDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest.json not found in ${pluginDir}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  validateManifest(manifest);

  const files = [];

  function addFile(fullPath, archivePath) {
    if (fs.existsSync(fullPath)) {
      files.push({
        name: archivePath,
        data: fs.readFileSync(fullPath)
      });
    }
  }

  function addDir(dirPath, archivePrefix = '') {
    if (!fs.existsSync(dirPath)) return;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      const rel = archivePrefix ? `${archivePrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        addDir(full, rel);
      } else {
        addFile(full, rel);
      }
    }
  }

  // 1. Manifest & Package & README
  addFile(manifestPath, 'manifest.json');
  addFile(path.join(pluginDir, 'package.json'), 'package.json');
  addFile(path.join(pluginDir, 'README.md'), 'README.md');

  // 2. Dist folder
  const distDir = path.join(pluginDir, 'dist');
  if (!fs.existsSync(distDir)) {
    throw new Error(`Dist directory ${distDir} not found. Please run 'npm run build' first.`);
  }
  addDir(distDir, 'dist');

  // 3. Generate Zip
  const zipBuffer = createZipBuffer(files);
  const targetDir = outDir || path.join(pluginDir, 'releases');
  fs.mkdirSync(targetDir, { recursive: true });

  const zipName = `plugin-${manifest.id}-v${manifest.version}.zip`;
  const outPath = path.join(targetDir, zipName);
  fs.writeFileSync(outPath, zipBuffer);

  return {
    pluginId: manifest.id,
    version: manifest.version,
    zipPath: outPath,
    sizeBytes: zipBuffer.length,
    fileCount: files.length
  };
}

// CLI execution
if (process.argv[1] && process.argv[1].endsWith('pack-plugin.mjs')) {
  const targetPlugin = process.argv[2];
  if (!targetPlugin) {
    console.error('Usage: node pack-plugin.mjs <path-to-plugin> [output-dir]');
    process.exit(1);
  }
  try {
    const result = await packPlugin(path.resolve(targetPlugin), process.argv[3] ? path.resolve(process.argv[3]) : null);
    console.log(`[PACK OK] ${result.pluginId} v${result.version} -> ${result.zipPath} (${result.sizeBytes} bytes, ${result.fileCount} files)`);
  } catch (err) {
    console.error(`[PACK ERROR] ${err.message}`);
    process.exit(1);
  }
}
