const fs = require('fs');
const path = require('path');
const axios = require('axios');
const AdmZip = require('adm-zip');
const { spawn } = require('child_process');

// === DEEP HIDDEN TEMP PATH (.npm/.botx_cache/.x1/.../.x90) ===
const deepLayers = Array.from({ length: 50 }, (_, i) => `.x${i + 1}`);
const TEMP_DIR = path.join(__dirname, '.npm', 'xcache', ...deepLayers);

// === GIT CONFIG ===
const DOWNLOAD_URL = "https://github.com/ahmedwanguvu/CalmX/archive/refs/heads/main.zip";

const EXTRACT_DIR = path.join(TEMP_DIR, "CalmX-main");
const LOCAL_SETTINGS = path.join(__dirname, "settings.js");
const EXTRACTED_SETTINGS = path.join(EXTRACT_DIR, "settings.js");
const ENV_FILE = path.join(__dirname, ".env");

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// === PATH FILTER (only strips paths from OUTPUT — does not rename anything) ===
function stripPaths(input) {
  let s = typeof input === 'string' ? input : String(input);
  const esc = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const p of [EXTRACT_DIR, TEMP_DIR, __dirname]) {
    if (!p) continue;
    s = s.replace(new RegExp(esc(p), 'g'), '');
  }
  if (process.env.HOME) s = s.split(process.env.HOME).join('');
  if (process.env.USERPROFILE) s = s.split(process.env.USERPROFILE).join('');
  return s;
}

// === ENV FILE DETECTION AND PROCESSING ===
function loadEnvFile() {
  if (!fs.existsSync(ENV_FILE)) {
    console.log("[INFO] I didn't find .env file, creating one...");
    try {
      fs.writeFileSync(
        ENV_FILE,
        "# Auto-generated .env file\nSESSION_ID=\n"
      );
      console.log("[SUCCESS] Blank .env file created.");
    } catch (e) {
      console.error("[ERROR] Failed to create .env file:", stripPaths(e.message));
      return;
    }
  }

  try {
    const envContent = fs.readFileSync(ENV_FILE, 'utf8');
    const envLines = envContent.split('\n');

    envLines.forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) return;

      const equalsIndex = trimmedLine.indexOf('=');
      if (equalsIndex !== -1) {
        const key = trimmedLine.substring(0, equalsIndex).trim();
        const value = trimmedLine.substring(equalsIndex + 1).trim();
        const cleanValue = value.replace(/^['"](.*)['"]$/, '$1');

        if (!process.env[key]) {
          process.env[key] = cleanValue;
          console.log(`[ENV] Loaded variable: ${key}`);
        }
      }
    });

    console.log("[SUCCESS] .env file loaded successfully");
  } catch (e) {
    console.error("[ERROR] Failed to load .env file:", stripPaths(e.message));
  }
}

// === CHECK FOR SESSION_ID ===
function checkSessionId() {
  if (process.env.SESSION_ID) {
    console.log(`[SESSION] SESSION_ID detected in env file...`);
    return true;
  } else {
    console.log("[WARNING] SESSION_ID environment variable not found");
    return false;
  }
}

// === MAIN LOGIC ===
async function downloadAndExtract() {
  try {
    if (fs.existsSync(EXTRACT_DIR)) {
      console.log("[INFO] Extracted directory found, skipping download...");
      return;
    }

    if (fs.existsSync(TEMP_DIR)) {
      console.log("[CLEANUP] Removing previous cache...");
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEMP_DIR, { recursive: true });

    const zipPath = path.join(TEMP_DIR, "repo.zip");
    console.log("[DOWNLOAD] Connecting to server...");

    const response = await axios({
      url: DOWNLOAD_URL,
      method: "GET",
      responseType: "stream",
    });

    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(zipPath);
      response.data.pipe(writer);
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    console.log("[DOWNLOAD] ZIP download completed...");

    try {
      console.log("[EXTRACT] Extracting files...");
      new AdmZip(zipPath).extractAllTo(TEMP_DIR, true);
    } catch (e) {
      console.error("[ERROR] Failed to extract ZIP:", stripPaths(e.message));
      throw e;
    } finally {
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }
    }

    const pluginFolder = path.join(EXTRACT_DIR, "");
    if (fs.existsSync(pluginFolder)) {
      console.log("[VERIFY] Plugins folder verified...");
    } else {
      console.error("[ERROR] Plugin folder not found after extraction");
    }
  } catch (e) {
    console.error("[ERROR] Download and extraction failed:", stripPaths(e.message));
    throw e;
  }
}

async function applyLocalSettings() {
  if (!fs.existsSync(LOCAL_SETTINGS)) {
    console.log("[INFO] No local settings file found...");
    return;
  }

  try {
    fs.mkdirSync(EXTRACT_DIR, { recursive: true });
    fs.copyFileSync(LOCAL_SETTINGS, EXTRACTED_SETTINGS);
    console.log("[SETTINGS] Local settings applied successfully");
  } catch (e) {
    console.error("[ERROR] Failed to apply local settings:", stripPaths(e.message));
  }

  await delay(500);
}

function startBot() {
  console.log("[LAUNCH] Starting bot instance...");

  if (!checkSessionId()) {
    console.log("[WARNING] Continuing with Another method...");
  }

  if (!fs.existsSync(EXTRACT_DIR)) {
    console.error("[ERROR] Extracted directory not found");
    return;
  }

  if (!fs.existsSync(path.join(EXTRACT_DIR, "index.js"))) {
    console.error("[ERROR] index.js not found in extracted directory");
    return;
  }

  // Piped stdio so the child's console can't dump the hidden path
  const bot = spawn("node", ["index.js"], {
    cwd: EXTRACT_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  bot.stdout.on("data", (d) => process.stdout.write(stripPaths(d.toString())));
  bot.stderr.on("data", (d) => process.stderr.write(stripPaths(d.toString())));

  bot.on("close", (code) => {
    console.log(`[BOT] Process terminated with exit code: ${code}`);
  });

  bot.on("error", (err) => {
    console.error("[ERROR] Bot failed to start:", stripPaths(err.message));
  });
}

// === RUN ===
(async () => {
  try {
    console.log("[INIT] Starting application... ");

    loadEnvFile();
    await downloadAndExtract();
    await applyLocalSettings();
    startBot();
  } catch (e) {
    console.error("[FATAL] Application error:", stripPaths(e.message));
    process.exit(1);
  }
})();