const puppeteer = require("puppeteer");
const { delay } = require("./utils");

async function launchBrowser(browserConfig) {
  const browser = await puppeteer.launch({
    headless: browserConfig.headless,
    defaultViewport: browserConfig.defaultViewport,
    args: browserConfig.args,
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(browserConfig.navigationTimeout);
  return { browser, page };
}

async function loginIfNeeded(page, config, selectors) {
  console.log(`INFO: Navigasi ke ${config.baseUrl}`);
  await page.goto(config.baseUrl, { waitUntil: "networkidle2" });

  if (page.url().includes(config.loginUrlFragment)) {
    console.log("INFO: Dialihkan ke halaman login. Mencoba untuk login...");
    await page.waitForSelector(selectors.emailInput, { visible: true });
    await page.type(selectors.emailInput, config.credentials.email, {
      delay: 50,
    });
    await page.type(selectors.pinInput, config.credentials.pin, { delay: 50 });

    const loginButtonElement = await page.evaluateHandle((xpath) => {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      );
      return result.singleNodeValue;
    }, selectors.loginButtonXPath);

    if (!loginButtonElement || !(await loginButtonElement.asElement())) {
      throw new Error(
        "Tombol login tidak ditemukan dengan XPath (via evaluate).",
      );
    }

    await Promise.all([
      loginButtonElement.click(),
      page.waitForNavigation({ waitUntil: "networkidle2" }),
    ]);
    await loginButtonElement.dispose();
    console.log("INFO: Login berhasil dikirim.");
  } else {
    console.log("INFO: Tidak di halaman login.");
  }
}

async function ensureVerificationPage(page, config) {
  if (page.url().includes(config.verificationUrlFragment)) {
    return;
  }

  console.warn(
    `PERINGATAN: Tidak berada di halaman verifikasi NIK. URL saat ini: ${page.url()}. Mencoba navigasi...`,
  );
  await page.goto(config.baseUrl + config.verificationUrlFragment, {
    waitUntil: "networkidle2",
  });

  if (!page.url().includes(config.verificationUrlFragment)) {
    throw new Error(
      "Gagal mencapai halaman verifikasi NIK setelah navigasi paksa.",
    );
  }

  console.log("INFO: Berhasil navigasi ke halaman verifikasi NIK.");
}

async function closeInitialModal(page, selectors, timeout = 7000) {
  try {
    await page.waitForSelector(selectors.initialModalCloseButton, {
      visible: true,
      timeout,
    });
    console.log("INFO: Modal awal terdeteksi, mencoba menutup...");
    await page.click(selectors.initialModalCloseButton);
    await delay(500);
  } catch (error) {
    console.log("INFO: Modal awal tidak ditemukan atau sudah ditutup.");
  }
}

module.exports = {
  launchBrowser,
  loginIfNeeded,
  ensureVerificationPage,
  closeInitialModal,
};
