const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG = '/tmp/alice_miner.log';
const REPORTS_DIR = path.join(process.env.HOME, '.alice', 'reports', 'epochs');
const CHECK_INTERVAL = 10; // seconds
let notifiedActive = false;
let lastEpochReport = 0;
let startTime = Date.now();
let lastReportTime = 0;

function sendTelegram(msg) {
  try {
    execSync(`openclaw message send --channel telegram --target 1135683132 --message "${msg.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
  } catch (e) {
    console.error('Telegram error:', e.message);
  }
}

function checkLog() {
  if (!fs.existsSync(LOG)) {
    if (!notifiedActive && Date.now() - startTime > 5 * 60 * 1000) {
      sendTelegram('⚠️ Alice miner log not found. Check if miner started.');
      notifiedActive = true;
    }
    return;
  }

  try {
    const content = fs.readFileSync(LOG, 'utf-8');
    if (!notifiedActive) {
      if (content.includes('Connected') || content.includes('Starting') || content.includes('miner started') || content.includes('Epoch')) {
        sendTelegram('✅ Alice miner is now ACTIVE and mining!');
        notifiedActive = true;
      }
    }

    const epochMatch = content.match(/Epoch (\d+) completed/);
    if (epochMatch) {
      const epochNum = parseInt(epochMatch[1], 10);
      if (epochNum > lastEpochReport) {
        lastEpochReport = epochNum;
        sendTelegram(`🔄 Alice miner: Epoch ${epochNum} completed. Check ~/.alice/reports/ for details.`);
      }
    }
  } catch (e) {}
}

function checkReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) return;
  try {
    const files = fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith('.md'));
    if (files.length > 0) {
      files.sort();
      const latest = files[files.length - 1];
      const stat = fs.statSync(path.join(REPORTS_DIR, latest));
      const mtime = stat.mtimeMs;
      if (mtime > lastReportTime) {
        lastReportTime = mtime;
        if (!notifiedActive) {
          sendTelegram('✅ Alice miner is now ACTIVE and mining!');
          notifiedActive = true;
        }
        sendTelegram(`📄 New Alice epoch report: ${latest}`);
      }
    }
  } catch (e) {}
}

console.log('[alice-monitor] Started. Watching:', LOG);
setInterval(() => {
  checkLog();
  checkReportsDir();
}, CHECK_INTERVAL * 1000);
