const { CONFIG, SELECTORS } = require("./config");
const { getLocalTimestamp, toTitleCase } = require("./utils");
const {
  loadNikData,
  loadProcessedData,
  loadInvalidNikSet,
  saveProcessedData,
  saveInvalidNikSet,
  appendErrorLog,
} = require("./dataStore");
const {
  launchBrowser,
  loginIfNeeded,
  ensureVerificationPage,
  closeInitialModal,
} = require("./session");
const { processNikLoop } = require("./nikProcessor");

async function run() {
  let browser;
  let page;

  console.log(`INFO: Skrip dimulai pada: ${getLocalTimestamp()}`);

  try {
    console.log(`INFO: Memuat data NIK dari: ${CONFIG.paths.nikData}`);
    const nikData = loadNikData(CONFIG.paths.nikData);
    console.log(`INFO: Berhasil memuat ${nikData.length} data NIK sumber.`);

    console.log(
      `INFO: Membaca data yang sudah diproses dari: ${CONFIG.paths.processedData}`,
    );
    const {
      processedData,
      processedNikSet,
      initialTotalWeight,
    } = loadProcessedData(
      CONFIG.paths.processedData,
      CONFIG.weights,
      toTitleCase,
    );

    console.log(
      `INFO: Membaca data NIK tidak valid dari: ${CONFIG.paths.invalidNikData}`,
    );
    const invalidNikSet = loadInvalidNikSet(CONFIG.paths.invalidNikData);

    if (!CONFIG.credentials.email || !CONFIG.credentials.pin) {
      throw new Error(
        "Environment variable LPG_EMAIL dan LPG_PIN wajib diisi sebelum menjalankan skrip.",
      );
    }

    const launched = await launchBrowser(CONFIG.browser);
    browser = launched.browser;
    page = launched.page;

    await loginIfNeeded(page, CONFIG, SELECTORS);
    await ensureVerificationPage(page, CONFIG);
    await closeInitialModal(page, SELECTORS);

    await processNikLoop({
      page,
      config: CONFIG,
      selectors: SELECTORS,
      nikData,
      processedData,
      processedNikSet,
      invalidNikSet,
      initialTotalWeight,
      dataStore: {
        saveProcessedData,
        saveInvalidNikSet,
        appendErrorLog,
      },
      sessionHelpers: {
        ensureVerificationPage,
        closeInitialModal,
      },
    });
  } catch (error) {
    console.error(`KESALAHAN FATAL: ${error.message}`);
    const timestamp = getLocalTimestamp();
    const errorDetails =
      `[${timestamp}] KESALAHAN FATAL:\n` +
      `Pesan: ${error.message || "Tidak ada pesan error spesifik."}\n` +
      `Stack Trace:\n${error.stack || "Tidak ada stack trace."}\n\n`;
    appendErrorLog(CONFIG.paths.errorLog, errorDetails);
    console.log(
      `INFO: Detail kesalahan telah dicatat ke file: ${CONFIG.paths.errorLog}`,
    );
  } finally {
    if (browser) {
      console.log("INFO: Menutup browser...");
      await browser.close();
    }
    console.log(`INFO: Skrip selesai pada: ${getLocalTimestamp()}`);
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
