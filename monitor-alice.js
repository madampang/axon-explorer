const { execSync } = require('child_process');
const fs = require('fs');

const LOG = '/tmp/alice_miner.log';
const CHECK_INTERVAL = 10; // seconds
const READY_TIMEOUT = 15 * 60 * 1000; // 15 min
let startTime = Date.now();
let notified = false;

function sendTelegram(msg) {
  try {
    execSync(`openclaw message send --channel telegram --target 1135683132 --message "${msg.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
  } catch (e) {
    console.error('Telegram error:', e.message);
  }
}

function checkLog() {
  if (!fs.existsSync(LOG)) {
    // If log doesn't exist after 5 min, maybe miner failed to start
    if (Date.now() - startTime > 5 * 60 * 1000 && !notified) {
      sendTelegram('⚠️ Alice miner log not found. Check if miner started correctly.');
      notified = true; // avoid spam
    }
    return;
  }

  try {
    const content = fs.readFileSync(LOG, 'utf-8');
    // Heuristic: look for signs of active mining
    if (content.includes('Connected') || content.includes('Starting') || content.includes('Epoch') || content.includes('miner started')) {
      if (!notified) {
        sendTelegram('✅ Alice miner is now ACTIVE and mining!');
        notified = true;
      }
    }
  } catch (e) {
    // ignore read errors
  }
}

console.log('[alice-monitor] Started. Watching:', LOG);
setInterval(checkLog, CHECK_INTERVAL * 1000);
