const { execSync } = require('child_process');
const fs = require('fs');

const PK = (() => {
  try {
    return fs.readFileSync('/root/.axon_pk', 'utf-8').trim();
  } catch (e) {
    console.error('ERROR: Cannot read /root/.axon_pk');
    process.exit(1);
  }
})();

const MINER_CMD = `node /root/.openclaw/workspace/cli-miner.js ${PK}`;
const LOG = '/tmp/aore-watchdog.log';
const CHECK_INTERVAL = 30; // seconds

function sendTelegram(msg) {
  try {
    execSync(`openclaw message send --channel telegram --target 1135683132 --message "${msg.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
  } catch (e) {
    console.error('Telegram error:', e.message);
  }
}

function isMinerRunning() {
  try {
    const out = execSync("pgrep -f cli-miner.js", { encoding: 'utf-8' });
    return out.trim().split('\n').filter(Boolean).length > 0;
  } catch (e) {
    return false;
  }
}

function startMiner() {
  execSync(MINER_CMD + ' >> /tmp/aore-miner.log 2>&1 &');
  console.log(`[${new Date().toISOString()}] Miner started`);
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  try {
    fs.appendFileSync(LOG, line + '\n');
  } catch (e) {
    console.error('Log write error:', e.message);
  }
  console.log(line);
}

log('Watchdog started');

setInterval(() => {
  if (isMinerRunning()) {
    return;
  }
  log('Miner not running! Restarting...');
  sendTelegram('⚠️ AORE miner crashed, restarting...');
  try {
    startMiner();
    sendTelegram('✅ AORE miner restarted');
  } catch (e) {
    log('Failed to start miner: ' + e.message);
  }
}, CHECK_INTERVAL * 1000);
