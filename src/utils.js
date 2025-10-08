function getLocalTimestamp() {
  return new Date().toLocaleString("id-ID", { timeZone: "Asia/Makassar" });
}

function toTitleCase(str) {
  if (!str) return "";
  return str.toLowerCase().replace(/\b(\w)/g, (s) => s.toUpperCase());
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { getLocalTimestamp, toTitleCase, delay };
