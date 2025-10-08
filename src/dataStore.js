const fs = require("fs");
const path = require("path");

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function loadNikData(filePath) {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File NIK tidak ditemukan di path: ${resolvedPath}`);
  }
  const raw = fs.readFileSync(resolvedPath, "utf-8");
  return JSON.parse(raw);
}

function loadProcessedData(filePath, weights, normalizeCategory) {
  let processedData = [];
  const processedNikSet = new Set();
  let initialTotalWeight = 0;

  try {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      console.log(
        `INFO: File ${resolvedPath} tidak ditemukan. Akan dibuat saat NIK pertama diproses.`,
      );
      return { processedData, processedNikSet, initialTotalWeight };
    }

    const raw = fs.readFileSync(resolvedPath, "utf-8");
    if (!raw.trim()) {
      console.log(`INFO: File ${resolvedPath} kosong. Memulai dengan data kosong.`);
      return { processedData, processedNikSet, initialTotalWeight };
    }

    processedData = JSON.parse(raw);
    if (!Array.isArray(processedData)) {
      console.warn(
        `PERINGATAN: Isi file ${resolvedPath} bukan array JSON yang valid. Memulai dengan data kosong.`,
      );
      processedData = [];
      return { processedData, processedNikSet, initialTotalWeight };
    }

    processedData.forEach((item) => {
      if (item && item.NIK && item.KATEGORI) {
        processedNikSet.add(item.NIK);
        const categoryNormalized = normalizeCategory(item.KATEGORI);
        initialTotalWeight += weights[categoryNormalized] || 0;
      } else {
        console.warn(
          "PERINGATAN: Menemukan item tidak valid dalam processed data, item dilewati:",
          item,
        );
      }
    });

    console.log(
      `INFO: Ditemukan ${processedNikSet.size} NIK unik yang sudah diproses sebelumnya. Total bobot awal: ${initialTotalWeight}`,
    );

    return { processedData, processedNikSet, initialTotalWeight };
  } catch (error) {
    console.error(
      `KESALAHAN saat membaca/parsing ${filePath}: ${error.message}. Memulai dengan data kosong.`,
    );
    return { processedData: [], processedNikSet: new Set(), initialTotalWeight: 0 };
  }
}

function loadInvalidNikSet(filePath) {
  const invalidNikSet = new Set();

  try {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      console.log(
        `INFO: File ${resolvedPath} tidak ditemukan. Akan dibuat saat NIK tidak valid pertama terdeteksi.`,
      );
      return invalidNikSet;
    }

    const raw = fs.readFileSync(resolvedPath, "utf-8");
    if (!raw.trim()) {
      console.log(
        `INFO: File ${resolvedPath} kosong. Memulai dengan data NIK tidak valid kosong.`,
      );
      return invalidNikSet;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn(
        `PERINGATAN: Isi file ${resolvedPath} bukan array JSON yang valid. Memulai dengan data kosong.`,
      );
      return invalidNikSet;
    }

    parsed.forEach((nik) => {
      if (nik) invalidNikSet.add(nik);
    });

    console.log(
      `INFO: Ditemukan ${invalidNikSet.size} NIK unik yang sebelumnya ditandai tidak valid.`,
    );
    return invalidNikSet;
  } catch (error) {
    console.error(
      `KESALAHAN saat membaca/parsing ${filePath}: ${error.message}. Memulai dengan data NIK tidak valid kosong.`,
    );
    return new Set();
  }
}

function saveProcessedData(filePath, data) {
  const resolvedPath = path.resolve(filePath);
  ensureDir(resolvedPath);
  fs.writeFileSync(resolvedPath, JSON.stringify(data, null, 2), "utf-8");
}

function saveInvalidNikSet(filePath, invalidNikSet) {
  const resolvedPath = path.resolve(filePath);
  ensureDir(resolvedPath);
  const payload = JSON.stringify(Array.from(invalidNikSet), null, 2);
  fs.writeFileSync(resolvedPath, payload, "utf-8");
}

function appendErrorLog(filePath, message) {
  try {
    const resolvedPath = path.resolve(filePath);
    ensureDir(resolvedPath);
    fs.appendFileSync(resolvedPath, message, "utf-8");
  } catch (error) {
    console.error(`KESALAHAN log ke file: ${error.message}`);
  }
}

module.exports = {
  loadNikData,
  loadProcessedData,
  loadInvalidNikSet,
  saveProcessedData,
  saveInvalidNikSet,
  appendErrorLog,
};
