const { delay, toTitleCase, getLocalTimestamp } = require("./utils");

const TARGET_ERROR_MESSAGE =
  "Tidak dapat transaksi karena telah melebihi batas kewajaran pembelian LPG 3 kg bulan ini untuk NIK yang terdaftar pada nomor KK yang sama.";

async function processNikLoop({
  page,
  config,
  selectors,
  nikData,
  processedData,
  processedNikSet,
  invalidNikSet,
  initialTotalWeight,
  dataStore,
  sessionHelpers,
}) {
  let totalProcessedWeight = initialTotalWeight;
  let currentIteration = 0;

  while (totalProcessedWeight < config.maxProcessedWeight) {
    currentIteration += 1;
    console.log(
      `\n--- Iterasi ${currentIteration} | Bobot Terproses: ${totalProcessedWeight}/${config.maxProcessedWeight} ---`,
    );

    const remainingData = getRemainingNikData(nikData, processedNikSet, invalidNikSet);
    if (remainingData.length === 0) {
      console.log(
        "INFO: Semua data NIK (yang belum diproses dan bukan tidak valid) telah diproses atau tidak ada lagi yang tersisa.",
      );
      break;
    }

    const selectedNikData = pickRandomNik(remainingData);
    if (!selectedNikData || !selectedNikData.KATEGORI) {
      console.warn(
        "PERINGATAN: Data NIK terpilih tidak valid atau tidak memiliki KATEGORI, melewati...",
        selectedNikData,
      );
      continue;
    }

    const kategoriNormalized = toTitleCase(selectedNikData.KATEGORI);
    console.log(
      `INFO: Memproses NIK: ${selectedNikData.NIK}, Kategori JSON: "${selectedNikData.KATEGORI}", Kategori Normalisasi: "${kategoriNormalized}"`,
    );

    try {
      const result = await processSingleNik({
        page,
        config,
        selectors,
        selectedNikData,
        kategoriNormalized,
        processedData,
        processedNikSet,
        invalidNikSet,
        dataStore,
        sessionHelpers,
      });

      if (result.weightAdded) {
        totalProcessedWeight += result.weightAdded;
      }
    } catch (error) {
      const timestamp = getLocalTimestamp();
      const nikLabel = (selectedNikData && selectedNikData.NIK) || "TIDAK_DI_KETAHUI";
      const errorDetails =
        `[${timestamp}] KESALAHAN TAK TERDUGA SAAT PROSES NIK ${nikLabel}:\n` +
        `Pesan: ${error.message || "Tidak ada pesan error spesifik."}\n` +
        `Stack Trace:\n${error.stack || "Tidak ada stack trace."}\n\n`;
      dataStore.appendErrorLog(config.paths.errorLog, errorDetails);
      console.error(
        `[${nikLabel}] KESALAHAN TAK TERDUGA: ${error.message || "Tanpa pesan"}. Melanjutkan ke NIK berikutnya.`,
      );
    }
  }

  console.log(
    `\nINFO: Loop selesai atau batas bobot tercapai. Total bobot akhir: ${totalProcessedWeight}.`,
  );
  console.log(`INFO: Data yang sudah diproses tersimpan di: ${config.paths.processedData}`);
  if (invalidNikSet.size > 0) {
    console.log(
      `INFO: Data NIK yang tidak valid (batas kewajaran) tersimpan di: ${config.paths.invalidNikData}`,
    );
  }

  return { totalProcessedWeight };
}

async function processSingleNik({
  page,
  config,
  selectors,
  selectedNikData,
  kategoriNormalized,
  processedData,
  processedNikSet,
  invalidNikSet,
  dataStore,
  sessionHelpers,
}) {
  if (
    !(await ensureOnVerificationPageForNik({
      page,
      config,
      selectors,
      nik: selectedNikData.NIK,
      dataStore,
      sessionHelpers,
    }))
  ) {
    return { weightAdded: 0 };
  }

  try {
    await typeNik(page, selectors, selectedNikData.NIK);
  } catch (error) {
    console.error(
      `[${selectedNikData.NIK}] KESALAHAN: ${error.message}. Melewati NIK ini.`,
    );
    return { weightAdded: 0 };
  }

  await page.click(selectors.checkNikButton);
  console.log(
    new Date().toLocaleTimeString(),
    `[${selectedNikData.NIK}] --- Klik Cek NIK ---`,
  );

  await waitAfterNikCheck(page, selectedNikData.NIK);

  const nikDinyatakanTidakValid = await detectQuotaLimit(page);
  if (nikDinyatakanTidakValid) {
    await handleInvalidNik({
      page,
      selectors,
      selectedNikData,
      invalidNikSet,
      dataStore,
      config,
      sessionHelpers,
    });
    return { weightAdded: 0 };
  }

  const modalProcessed = await handleModalPilihPengguna({
    page,
    selectors,
    kategoriNormalized,
    nik: selectedNikData.NIK,
  });

  if (!modalProcessed) {
    await handlePerbaruiDataModal({
      page,
      selectors,
      nik: selectedNikData.NIK,
    });
  }

  const addItemReady = await ensureAddItemButton({
    page,
    selectors,
    nik: selectedNikData.NIK,
    dataStore,
    config,
  });
  if (!addItemReady) {
    return { weightAdded: 0 };
  }

  const clickCount = config.weights[kategoriNormalized];
  if (typeof clickCount === "undefined") {
    const timestamp = getLocalTimestamp();
    const errorDetails =
      `[${timestamp}] KESALAHAN NIK ${selectedNikData.NIK}:\n` +
      `Pesan: Bobot kategori tidak valid untuk "${kategoriNormalized}". Periksa konfigurasi dan data JSON.\n\n`;
    dataStore.appendErrorLog(config.paths.errorLog, errorDetails);
    console.error(
      `[${selectedNikData.NIK}] KESALAHAN KRITIS: Tidak ada bobot ditemukan untuk kategori normalisasi "${kategoriNormalized}".`,
    );
    return { weightAdded: 0 };
  }

  await performAddItemClicks({
    page,
    selectors,
    nik: selectedNikData.NIK,
    clickCount,
  });

  const quantityMatches = await ensureQuantityMatches({
    page,
    selectors,
    nik: selectedNikData.NIK,
    expectedQuantity: clickCount,
  });
  if (!quantityMatches) {
    return { weightAdded: 0 };
  }

  const transactionCompleted = await completeTransaction({
    page,
    selectors,
    nik: selectedNikData.NIK,
  });
  if (!transactionCompleted) {
    return { weightAdded: 0 };
  }

  processedData.push(selectedNikData);
  processedNikSet.add(selectedNikData.NIK);

  try {
    dataStore.saveProcessedData(config.paths.processedData, processedData);
    console.log(
      `[${selectedNikData.NIK}] INFO: NIK berhasil diproses dan disimpan.`,
    );
  } catch (error) {
    console.error(
      `[${selectedNikData.NIK}] KESALAHAN saat menyimpan ke ${config.paths.processedData}: ${error.message}`,
    );
  }

  return { weightAdded: config.weights[kategoriNormalized] || 0 };
}

function getRemainingNikData(nikData, processedNikSet, invalidNikSet) {
  return nikData.filter(
    (item) =>
      item &&
      item.NIK &&
      !processedNikSet.has(item.NIK) &&
      !invalidNikSet.has(item.NIK),
  );
}

function pickRandomNik(data) {
  return data[Math.floor(Math.random() * data.length)];
}

async function ensureOnVerificationPageForNik({
  page,
  config,
  selectors,
  nik,
  dataStore,
  sessionHelpers,
}) {
  try {
    if (!page.url().includes(config.verificationUrlFragment)) {
      console.log(
        `INFO: Tidak di halaman verifikasi NIK. Mencoba navigasi ulang sebelum input NIK ${nik}`,
      );
    }
    await sessionHelpers.ensureVerificationPage(page, config);
    await sessionHelpers.closeInitialModal(page, selectors, 5000);
    return true;
  } catch (error) {
    console.error(
      `[${nik}] KESALAHAN KRITIS: Gagal memastikan halaman verifikasi NIK. Error: ${error.message}. Melewati NIK ini.`,
    );
    const timestamp = getLocalTimestamp();
    const errorDetails =
      `[${timestamp}] KESALAHAN NAVIGASI ULANG NIK ${nik}:\n` +
      `Pesan: Gagal navigasi kembali ke ${config.verificationUrlFragment}.\n` +
      `Detail: ${error.message}\n\n`;
    dataStore.appendErrorLog(config.paths.errorLog, errorDetails);
    return false;
  }
}

async function typeNik(page, selectors, nik) {
  await page.waitForSelector(selectors.nikInput, { visible: true });
  const nikInputElement = await page.$(selectors.nikInput);
  if (!nikInputElement) {
    throw new Error("Elemen input NIK tidak ditemukan.");
  }
  await nikInputElement.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  for (const char of nik) {
    await page.keyboard.type(char, { delay: Math.random() * 70 + 30 });
  }
  await nikInputElement.dispose();
}

async function waitAfterNikCheck(page, nik) {
  console.log(
    new Date().toLocaleTimeString(),
    `[${nik}] Menunggu reaksi halaman setelah Cek NIK...`,
  );
  try {
    await page.waitForNetworkIdle({ timeout: 7000 });
    await delay(500);
  } catch (error) {
    console.warn(
      `[${nik}] PERINGATAN: Network idle timeout singkat setelah Cek NIK. Melanjutkan dengan jeda tetap.`,
    );
    await delay(1000);
  }
  console.log(
    new Date().toLocaleTimeString(),
    `[${nik}] Selesai menunggu reaksi halaman, mulai cek pesan error spesifik dan modal.`,
  );
}

async function detectQuotaLimit(page) {
  try {
    await delay(1000);
    return await page.evaluate((errorMessage) => {
      const allSpans = Array.from(document.querySelectorAll("span"));
      return allSpans.some(
        (span) => span.textContent && span.textContent.trim() === errorMessage,
      );
    }, TARGET_ERROR_MESSAGE);
  } catch (error) {
    console.warn(
      `PERINGATAN: Terjadi kesalahan saat mencari pesan error batas kewajaran: ${error.message}`,
    );
    return false;
  }
}

async function handleInvalidNik({
  page,
  selectors,
  selectedNikData,
  invalidNikSet,
  dataStore,
  config,
  sessionHelpers,
}) {
  console.warn(
    `[${selectedNikData.NIK}] PERINGATAN SPESIFIK: Terdeteksi pesan "${TARGET_ERROR_MESSAGE}"`,
  );
  invalidNikSet.add(selectedNikData.NIK);

  try {
    dataStore.saveInvalidNikSet(
      config.paths.invalidNikData,
      invalidNikSet,
    );
    console.log(
      `[${selectedNikData.NIK}] INFO: NIK tidak valid ${selectedNikData.NIK} telah disimpan ke ${config.paths.invalidNikData}`,
    );
  } catch (error) {
    console.error(
      `[${selectedNikData.NIK}] KESALAHAN saat menyimpan NIK tidak valid ke ${config.paths.invalidNikData}: ${error.message}`,
    );
  }

  const timestamp = getLocalTimestamp();
  const errorDetails =
    `[${timestamp}] NIK DITANDAI TIDAK VALID ${selectedNikData.NIK}:\n` +
    `Pesan: ${TARGET_ERROR_MESSAGE}\n\n`;
  dataStore.appendErrorLog(config.paths.errorLog, errorDetails);

  await clearNikInput(page, selectors);

  try {
    await sessionHelpers.ensureVerificationPage(page, config);
    await sessionHelpers.closeInitialModal(page, selectors, 5000);
  } catch (error) {
    console.error(
      `[${selectedNikData.NIK}] KESALAHAN saat navigasi kembali ke halaman verifikasi NIK (setelah NIK tidak valid): ${error.message}`,
    );
    const navErrTimestamp = getLocalTimestamp();
    const navErrDetails =
      `[${navErrTimestamp}] KESALAHAN NAVIGASI KEMBALI (NIK TIDAK VALID) ${selectedNikData.NIK}:\n` +
      `Pesan: ${error.message}\n\n`;
    dataStore.appendErrorLog(config.paths.errorLog, navErrDetails);
  }
}

async function clearNikInput(page, selectors) {
  const nikInputElement = await page.$(selectors.nikInput);
  if (nikInputElement) {
    await nikInputElement.click({ clickCount: 3 });
    await page.keyboard.press("Backspace");
    await nikInputElement.dispose();
  }
}

async function handleModalPilihPengguna({
  page,
  selectors,
  kategoriNormalized,
  nik,
}) {
  let modalProcessed = false;
  try {
    console.log(
      new Date().toLocaleTimeString(),
      `[${nik}] DEBUG: Mencoba waitForSelector untuk modalPilihPenggunaContainer (timeout 4s).`,
    );
    await page.waitForSelector(selectors.modalPilihPenggunaContainer, {
      visible: true,
      timeout: 4000,
    });
    console.log(
      new Date().toLocaleTimeString(),
      `[${nik}] DEBUG: modalPilihPenggunaContainer ditemukan. Mengevaluasi teks.`,
    );
    const modalBodyText = await page.$eval(
      selectors.modalPilihPenggunaContainer,
      (el) => el.innerText,
    );
    console.log(
      new Date().toLocaleTimeString(),
      `[${nik}] DEBUG: Teks modal mentah: "${modalBodyText.substring(0, 200)}"`,
    );

    if (modalBodyText.includes(selectors.modalPilihPenggunaTextNeedle)) {
      console.log(
        `[${nik}] INFO: Modal "Pilih jenis pengguna" terdeteksi (teks cocok).`,
      );
      console.log(
        new Date().toLocaleTimeString(),
        `[${nik}] DEBUG: Kategori Normalisasi: "${kategoriNormalized}". Mencoba menemukan dan klik radio button yang cocok...`,
      );

      let radioBerhasilDiklik = false;
      const semuaRadioButtons = await page.$$(
        `${selectors.modalPilihPenggunaContainer} input[type="radio"]`,
      );
      console.log(
        `[${nik}] DEBUG: Ditemukan ${semuaRadioButtons.length} elemen input[type="radio"] di dalam modal.`,
      );

      if (semuaRadioButtons.length === 0) {
        console.error(
          `[${nik}] KESALAHAN: Tidak ada elemen input[type="radio"] yang ditemukan di dalam modal.`,
        );
        throw new Error("Tidak ada radio button ditemukan di modal.");
      }

      for (const radioButtonHandle of semuaRadioButtons) {
        const valueAttribute = await radioButtonHandle.evaluate(
          (el) => el.value,
        );
        if (
          valueAttribute &&
          valueAttribute.trim().toLowerCase() ===
            kategoriNormalized.trim().toLowerCase()
        ) {
          console.log(
            `[${nik}] DEBUG: COCOK! Radio button untuk "${kategoriNormalized}" ditemukan berdasarkan atribut 'value' (case-insensitive).`,
          );
          try {
            const parentLabelHandles = await radioButtonHandle.$x(
              "./ancestor::label[1]",
            );
            if (parentLabelHandles.length > 0) {
              const labelToClick = parentLabelHandles[0];
              console.log(
                `[${nik}] DEBUG: Elemen <label> pembungkus ditemukan. Akan diklik.`,
              );
              await labelToClick.click();
              for (const handle of parentLabelHandles) {
                await handle.dispose();
              }
            } else {
              console.warn(
                `[${nik}] PERINGATAN: Tidak menemukan <label> pembungkus. Mencoba klik input radio langsung.`,
              );
              await radioButtonHandle.click();
            }
          } catch (clickError) {
            console.error(
              `[${nik}] KESALAHAN saat mencoba klik (label atau input): ${clickError.message}.`,
            );
            console.log(
              `[${nik}] DEBUG: Mencoba klik input radio via page.evaluate karena klik standar gagal.`,
            );
            await radioButtonHandle.evaluate((el) => el.click());
          }
          console.log(
            new Date().toLocaleTimeString(),
            `[${nik}] DEBUG: Radio button target (atau labelnya) berhasil diklik.`,
          );
          radioBerhasilDiklik = true;
          break;
        }
      }
      for (const radioButtonHandle of semuaRadioButtons) {
        await radioButtonHandle.dispose();
      }
      if (!radioBerhasilDiklik) {
        console.error(
          `[${nik}] KESALAHAN: Radio button untuk kategori "${kategoriNormalized}" TIDAK BERHASIL DIKLIK setelah memeriksa semua radio button.`,
        );
        throw new Error(
          `Radio button untuk kategori "${kategoriNormalized}" tidak berhasil diklik.`,
        );
      }
      modalProcessed = true;
      console.log(
        new Date().toLocaleTimeString(),
        `[${nik}] DEBUG: Mencoba waitForSelector untuk tombol Lanjutkan Transaksi (btnContinueTrx) (timeout 3s).`,
      );
      await page.waitForSelector(selectors.btnContinueTrx, {
        visible: true,
        timeout: 3000,
      });
      console.log(
        new Date().toLocaleTimeString(),
        `[${nik}] DEBUG: Tombol Lanjutkan Transaksi ditemukan. Akan diklik.`,
      );
      await page.click(selectors.btnContinueTrx);
      console.log(
        `[${nik}] INFO: Tombol "Lanjutkan Transaksi" BERHASIL ditekan.`,
      );
      await page.waitForNetworkIdle({ timeout: 15000 });
      await delay(1500);
      console.log(
        new Date().toLocaleTimeString(),
        `[${nik}] DEBUG: Proses modal "Pilih jenis pengguna" selesai sepenuhnya.`,
      );
    } else {
      console.log(
        `[${nik}] INFO: Teks modal ditemukan, TAPI TIDAK COCOK dengan '${selectors.modalPilihPenggunaTextNeedle}'.`,
      );
    }
  } catch (error) {
    console.log(
      `[${nik}] INFO: Terjadi ERROR di dalam blok TRY modal "Pilih jenis pengguna". Pesan dari catch: ${error.message}`,
    );
    console.error(`[${nik}] STACK TRACE ERROR MODAL 1: ${error.stack}`);
  }

  return modalProcessed;
}

async function handlePerbaruiDataModal({ page, selectors, nik }) {
  try {
    const perbaruiDataTextElementHandle = await page.waitForXPath(
      selectors.modalPerbaruiDataTextXPath,
      { visible: true, timeout: 4000 },
    );
    if (perbaruiDataTextElementHandle) {
      console.log(
        `[${nik}] INFO: Teks "Perbarui Data Pelanggan" terdeteksi.`,
      );
      const skipButtonHandle = await page.evaluateHandle((xpath) => {
        const result = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        );
        return result.singleNodeValue;
      }, selectors.btnLewatiLanjutTransaksiXPath);
      if (skipButtonHandle && (await skipButtonHandle.asElement())) {
        await skipButtonHandle.click();
        console.log(
          `[${nik}] INFO: Tombol "Lewati, Lanjut Transaksi" ditekan.`,
        );
        await page.waitForNetworkIdle({ timeout: 10000 });
        await delay(500);
        await skipButtonHandle.dispose();
      } else {
        console.warn(
          `[${nik}] PERINGATAN: Tombol "Lewati" tidak ditemukan (via evaluate), meskipun teks "Perbarui Data" ada.`,
        );
        if (skipButtonHandle) await skipButtonHandle.dispose();
      }
      await perbaruiDataTextElementHandle.dispose();
    }
  } catch (error) {
    console.log(
      `[${nik}] INFO: Modal "Perbarui Data Pelanggan" tidak ditemukan atau error saat proses: ${error.message}`,
    );
  }
  console.log(
    new Date().toLocaleTimeString(),
    `[${nik}] Selesai semua pengecekan modal.`,
  );
}

async function ensureAddItemButton({
  page,
  selectors,
  nik,
  dataStore,
  config,
}) {
  console.log(
    new Date().toLocaleTimeString(),
    `[${nik}] Menunggu actionIcon2 (SELECTORS.addItemButton) untuk siap...`,
  );
  try {
    await page.waitForSelector(selectors.addItemButton, {
      visible: true,
      timeout: 10000,
    });
    console.log(
      new Date().toLocaleTimeString(),
      `[${nik}] actionIcon2 (addItemButton) siap.`,
    );
    return true;
  } catch (error) {
    console.error(
      `[${nik}] KESALAHAN: actionIcon2 tidak muncul setelah proses modal. Error: ${error.message}`,
    );
    const timestamp = getLocalTimestamp();
    const errorDetails =
      `[${timestamp}] KESALAHAN NIK ${nik}:\n` +
      `Pesan: actionIcon2 (addItemButton) tidak muncul setelah proses modal.\n` +
      `Detail: ${error.message || "Tidak ada pesan error spesifik."}\n` +
      `Stack Trace:\n${error.stack || "Tidak ada stack trace."}\n\n`;
    dataStore.appendErrorLog(config.paths.errorLog, errorDetails);
    console.log(
      `[${nik}] INFO: Detail kesalahan (actionIcon2 tidak muncul) telah dicatat ke file. Melanjutkan ke NIK berikutnya.`,
    );
    return false;
  }
}

async function performAddItemClicks({
  page,
  selectors,
  nik,
  clickCount,
}) {
  console.log(
    `[${nik}] INFO: Menekan tombol tambah item ${clickCount} kali.`,
  );
  for (let i = 0; i < clickCount; i += 1) {
    await page.waitForSelector(selectors.addItemButton, {
      visible: true,
      timeout: 3000,
    });
    await page.click(selectors.addItemButton);
    await delay(1000);
  }
}

async function ensureQuantityMatches({
  page,
  selectors,
  nik,
  expectedQuantity,
}) {
  await page.waitForSelector(selectors.quantityInput, {
    visible: true,
  });
  const qtyValue = await page.$eval(selectors.quantityInput, (el) => el.value);
  if (parseInt(qtyValue, 10) !== expectedQuantity) {
    console.error(
      `[${nik}] KESALAHAN: Jumlah item tidak sesuai. Diharapkan ${expectedQuantity}, didapat ${qtyValue}. Melewati.`,
    );
    return false;
  }
  return true;
}

async function completeTransaction({ page, selectors, nik }) {
  try {
    console.log(`[${nik}] INFO: Menekan tombol "Periksa Pesanan".`);
    await page.click(selectors.btnCheckOrder);
    await page.waitForNetworkIdle({ timeout: 15000 });
    await delay(1500);

    console.log(`[${nik}] INFO: Menekan tombol "Bayar".`);
    await page.click(selectors.btnPay);
    await page.waitForNetworkIdle({ timeout: 15000 });
    await delay(1500);

    console.log(`[${nik}] INFO: Menekan tombol "Kembali".`);
    await Promise.all([
      page.click(selectors.btnBack),
      page.waitForNavigation({ waitUntil: "networkidle2" }),
    ]);

    console.log(
      `[${nik}] DEBUG: Menambahkan NIK ke processedDataInMemory dan processedNikSet.`,
    );
    return true;
  } catch (error) {
    console.error(
      `[${nik}] KESALAHAN saat menyelesaikan transaksi: ${error.message}`,
    );
    return false;
  }
}

module.exports = { processNikLoop };

