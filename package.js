(function attachFormationPackage(globalScope) {
  "use strict";

  const LOCAL_FILE_SIGNATURE = 0x04034b50;
  const CENTRAL_FILE_SIGNATURE = 0x02014b50;
  const END_OF_CENTRAL_SIGNATURE = 0x06054b50;
  const UTF8_FLAG = 0x0800;
  const MAX_ZIP32_SIZE = 0xffffffff;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8", { fatal: true });

  const crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    crcTable[index] = value >>> 0;
  }

  function fail(message = "Invalid formation package") {
    throw new Error(message);
  }

  function isSafeEntryName(name) {
    return (
      typeof name === "string" &&
      name.length > 0 &&
      name.length <= 180 &&
      !name.startsWith("/") &&
      !name.includes("\\") &&
      !name.split("/").includes("..") &&
      !name.includes("//") &&
      /^[a-zA-Z0-9._/-]+$/.test(name)
    );
  }

  function createHeader(length, write) {
    const bytes = new Uint8Array(length);
    write(new DataView(bytes.buffer), bytes);
    return bytes;
  }

  async function calculateBlobCrc32(blob) {
    let crc = 0xffffffff;
    const reader = blob.stream().getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const byte of value) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
      }
    } finally {
      reader.releaseLock();
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function toBlob(data) {
    if (data instanceof Blob) return data;
    if (typeof data === "string") return new Blob([data], { type: "application/json" });
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return new Blob([data]);
    fail("Unsupported package entry data");
  }

  async function createStoredZip(entries, options = {}) {
    const maximumBytes = Math.min(MAX_ZIP32_SIZE, Number(options.maximumBytes) || MAX_ZIP32_SIZE);
    if (!Array.isArray(entries) || entries.length === 0 || entries.length > 32) fail("Invalid package entry count");
    const names = new Set();
    const prepared = [];
    let localOffset = 0;

    for (const entry of entries) {
      if (!isSafeEntryName(entry?.name) || names.has(entry.name)) fail("Invalid or duplicate package entry name");
      names.add(entry.name);
      const nameBytes = encoder.encode(entry.name);
      if (nameBytes.length > 0xffff) fail("Package entry name is too long");
      const blob = toBlob(entry.data);
      if (blob.size > MAX_ZIP32_SIZE) fail("Package entry is too large");
      const crc32 = await calculateBlobCrc32(blob);
      const localHeaderLength = 30 + nameBytes.length;
      prepared.push({ name: entry.name, nameBytes, blob, crc32, localOffset });
      localOffset += localHeaderLength + blob.size;
      if (localOffset > maximumBytes || localOffset > MAX_ZIP32_SIZE) fail("Complete project exceeds the package size limit");
    }

    const localParts = [];
    const centralParts = [];
    let centralSize = 0;
    for (const entry of prepared) {
      const localHeader = createHeader(30, (view) => {
        view.setUint32(0, LOCAL_FILE_SIGNATURE, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, UTF8_FLAG, true);
        view.setUint16(8, 0, true);
        view.setUint32(14, entry.crc32, true);
        view.setUint32(18, entry.blob.size, true);
        view.setUint32(22, entry.blob.size, true);
        view.setUint16(26, entry.nameBytes.length, true);
      });
      localParts.push(localHeader, entry.nameBytes, entry.blob);

      const centralHeader = createHeader(46, (view) => {
        view.setUint32(0, CENTRAL_FILE_SIGNATURE, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 20, true);
        view.setUint16(8, UTF8_FLAG, true);
        view.setUint16(10, 0, true);
        view.setUint32(16, entry.crc32, true);
        view.setUint32(20, entry.blob.size, true);
        view.setUint32(24, entry.blob.size, true);
        view.setUint16(28, entry.nameBytes.length, true);
        view.setUint32(42, entry.localOffset, true);
      });
      centralParts.push(centralHeader, entry.nameBytes);
      centralSize += centralHeader.length + entry.nameBytes.length;
    }

    const endHeader = createHeader(22, (view) => {
      view.setUint32(0, END_OF_CENTRAL_SIGNATURE, true);
      view.setUint16(8, prepared.length, true);
      view.setUint16(10, prepared.length, true);
      view.setUint32(12, centralSize, true);
      view.setUint32(16, localOffset, true);
    });
    if (localOffset + centralSize + endHeader.length > maximumBytes) fail("Complete project exceeds the package size limit");
    return new Blob([...localParts, ...centralParts, endHeader], { type: "application/zip" });
  }

  function findEndOfCentralDirectory(tailBytes) {
    const view = new DataView(tailBytes.buffer, tailBytes.byteOffset, tailBytes.byteLength);
    for (let offset = tailBytes.length - 22; offset >= 0; offset -= 1) {
      if (view.getUint32(offset, true) === END_OF_CENTRAL_SIGNATURE) return offset;
    }
    return -1;
  }

  async function readStoredZip(blob, options = {}) {
    const maximumBytes = Math.min(MAX_ZIP32_SIZE, Number(options.maximumBytes) || MAX_ZIP32_SIZE);
    const maximumEntries = Math.max(1, Math.min(32, Number(options.maximumEntries) || 16));
    if (!(blob instanceof Blob) || blob.size < 22 || blob.size > maximumBytes) fail();
    const tailLength = Math.min(blob.size, 0xffff + 22);
    const tailOffset = blob.size - tailLength;
    const tailBytes = new Uint8Array(await blob.slice(tailOffset).arrayBuffer());
    const endOffset = findEndOfCentralDirectory(tailBytes);
    if (endOffset < 0) fail();
    const endView = new DataView(tailBytes.buffer, tailBytes.byteOffset + endOffset, tailBytes.byteLength - endOffset);
    if (endView.getUint16(4, true) !== 0 || endView.getUint16(6, true) !== 0) fail();
    const entryCount = endView.getUint16(10, true);
    if (entryCount === 0 || entryCount > maximumEntries || endView.getUint16(8, true) !== entryCount) fail();
    const centralSize = endView.getUint32(12, true);
    const centralOffset = endView.getUint32(16, true);
    const commentLength = endView.getUint16(20, true);
    if (tailOffset + endOffset + 22 + commentLength !== blob.size) fail();
    if (centralOffset + centralSize > blob.size - 22 || centralSize > 1024 * 1024) fail();

    const centralBytes = new Uint8Array(await blob.slice(centralOffset, centralOffset + centralSize).arrayBuffer());
    const centralView = new DataView(centralBytes.buffer, centralBytes.byteOffset, centralBytes.byteLength);
    const metadata = [];
    const names = new Set();
    let cursor = 0;
    let totalSize = 0;
    for (let index = 0; index < entryCount; index += 1) {
      if (cursor + 46 > centralBytes.length || centralView.getUint32(cursor, true) !== CENTRAL_FILE_SIGNATURE) fail();
      const flags = centralView.getUint16(cursor + 8, true);
      const method = centralView.getUint16(cursor + 10, true);
      const crc32 = centralView.getUint32(cursor + 16, true);
      const compressedSize = centralView.getUint32(cursor + 20, true);
      const uncompressedSize = centralView.getUint32(cursor + 24, true);
      const nameLength = centralView.getUint16(cursor + 28, true);
      const extraLength = centralView.getUint16(cursor + 30, true);
      const entryCommentLength = centralView.getUint16(cursor + 32, true);
      const disk = centralView.getUint16(cursor + 34, true);
      const localOffset = centralView.getUint32(cursor + 42, true);
      const recordLength = 46 + nameLength + extraLength + entryCommentLength;
      if (cursor + recordLength > centralBytes.length || method !== 0 || compressedSize !== uncompressedSize || disk !== 0) fail();
      if ((flags & 1) !== 0 || (flags & ~UTF8_FLAG) !== 0) fail();
      let name;
      try {
        name = decoder.decode(centralBytes.subarray(cursor + 46, cursor + 46 + nameLength));
      } catch (error) {
        fail();
      }
      if (!isSafeEntryName(name) || names.has(name)) fail();
      names.add(name);
      totalSize += uncompressedSize;
      if (totalSize > maximumBytes || localOffset >= centralOffset) fail();
      metadata.push({ name, crc32, size: uncompressedSize, localOffset });
      cursor += recordLength;
    }
    if (cursor !== centralBytes.length) fail();

    const ranges = [];
    const result = new Map();
    for (const entry of metadata) {
      const localBytes = new Uint8Array(await blob.slice(entry.localOffset, entry.localOffset + 30).arrayBuffer());
      if (localBytes.length !== 30) fail();
      const localView = new DataView(localBytes.buffer, localBytes.byteOffset, localBytes.byteLength);
      if (
        localView.getUint32(0, true) !== LOCAL_FILE_SIGNATURE ||
        localView.getUint16(6, true) !== UTF8_FLAG ||
        localView.getUint16(8, true) !== 0 ||
        localView.getUint32(14, true) !== entry.crc32 ||
        localView.getUint32(18, true) !== entry.size ||
        localView.getUint32(22, true) !== entry.size
      ) fail();
      const localNameLength = localView.getUint16(26, true);
      const localExtraLength = localView.getUint16(28, true);
      const localNameBytes = new Uint8Array(await blob.slice(entry.localOffset + 30, entry.localOffset + 30 + localNameLength).arrayBuffer());
      let localName;
      try {
        localName = decoder.decode(localNameBytes);
      } catch (error) {
        fail();
      }
      if (localName !== entry.name) fail();
      const dataOffset = entry.localOffset + 30 + localNameLength + localExtraLength;
      const dataEnd = dataOffset + entry.size;
      if (dataEnd > centralOffset) fail();
      ranges.push([entry.localOffset, dataEnd]);
      const entryBlob = blob.slice(dataOffset, dataEnd);
      if (options.verifyCrc !== false && await calculateBlobCrc32(entryBlob) !== entry.crc32) fail("Package integrity check failed");
      result.set(entry.name, { blob: entryBlob, crc32: entry.crc32, size: entry.size });
    }
    ranges.sort((left, right) => left[0] - right[0]);
    if (ranges.some((range, index) => index > 0 && range[0] < ranges[index - 1][1])) fail();
    return result;
  }

  const api = { calculateBlobCrc32, createStoredZip, isSafeEntryName, readStoredZip };
  globalScope.FormationPackage = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
