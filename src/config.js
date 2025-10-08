const path = require("path");
const dotenv = require("dotenv");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_DATA_DIR = path.join(ROOT_DIR, "data");
const envFile = process.env.LPG_ENV_FILE || path.join(ROOT_DIR, ".env");

dotenv.config({ path: envFile });

function toBoolean(value, defaultValue) {
  if (value === undefined) return defaultValue;
  return ["true", "1", "yes", "y"].includes(value.toLowerCase());
}

function toNumber(value, defaultValue) {
  if (value === undefined) return defaultValue;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

function toArray(value, defaultValue) {
  if (!value) return defaultValue;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolvePath(envValue, fallback) {
  if (!envValue) return fallback;
  return path.isAbsolute(envValue)
    ? envValue
    : path.resolve(ROOT_DIR, envValue);
}

const dataDir = resolvePath(process.env.LPG_DATA_DIR, DEFAULT_DATA_DIR);

const CONFIG = {
  baseUrl:
    process.env.LPG_BASE_URL || "https://subsiditepatlpg.mypertamina.id/merchant",
  loginUrlFragment: process.env.LPG_LOGIN_FRAGMENT || "/merchant-login",
  verificationUrlFragment:
    process.env.LPG_VERIFICATION_FRAGMENT || "/app/verification-nik",
  credentials: {
    email: process.env.LPG_EMAIL || "",
    pin: process.env.LPG_PIN || "",
  },
  paths: {
    dataDir,
    nikData: resolvePath(
      process.env.LPG_NIK_DATA_PATH,
      path.join(dataDir, "nik-data.json"),
    ),
    processedData: resolvePath(
      process.env.LPG_PROCESSED_DATA_PATH,
      path.join(dataDir, "processed-niks.json"),
    ),
    invalidNikData: resolvePath(
      process.env.LPG_INVALID_NIK_DATA_PATH,
      path.join(dataDir, "invalid-niks.json"),
    ),
    errorLog: resolvePath(
      process.env.LPG_ERROR_LOG_PATH,
      path.join(dataDir, "automation-error.log"),
    ),
  },
  weights: {
    "Rumah Tangga": 1,
    "Usaha Mikro": 2,
  },
  maxProcessedWeight: toNumber(process.env.LPG_MAX_WEIGHT, 100),
  browser: {
    headless: toBoolean(process.env.LPG_BROWSER_HEADLESS, false),
    defaultViewport: {
      width: toNumber(process.env.LPG_BROWSER_WIDTH, 1366),
      height: toNumber(process.env.LPG_BROWSER_HEIGHT, 768),
    },
    args: toArray(process.env.LPG_BROWSER_ARGS, ["--start-maximized"]),
    navigationTimeout: toNumber(process.env.LPG_BROWSER_NAV_TIMEOUT, 60000),
  },
};

const SELECTORS = {
  emailInput: "#mantine-r0",
  pinInput: "#mantine-r1",
  loginButtonXPath: "//button[@type='submit'][contains(., 'Masuk')]",
  initialModalCloseButton: ".styles_iconClose__ZjGFM",
  nikInput:
    'input.mantine-Input-input[placeholder="Masukkan 16 digit NIK Pelanggan"]',
  checkNikButton: '[data-testid="btnCheckNik"]',
  modalPilihPenggunaContainer: ".mantine-Modal-body",
  modalPilihPenggunaTextNeedle:
    "Pilih salah satu jenis pengguna untuk melanjutkan transaksi",
  btnContinueTrx: '[data-testid="btnContinueTrx"]',
  modalPerbaruiDataTextXPath:
    "//div[contains(@class, 'mantine-Text-root') and text()='Perbarui Data Pelanggan']",
  btnLewatiLanjutTransaksiXPath:
    "//button[contains(., 'Lewati, Lanjut Transaksi')]",
  addItemButton: '[data-testid="actionIcon2"]',
  quantityInput: '[data-testid="numberInput"].styles_input__DRhNi',
  btnCheckOrder: '[data-testid="btnCheckOrder"]',
  btnPay: '[data-testid="btnPay"]',
  btnBack: '[data-testid="btnBack"]',
};

module.exports = { CONFIG, SELECTORS };
