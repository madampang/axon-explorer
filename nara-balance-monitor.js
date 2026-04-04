const { execSync } = require('child_process');
const fs = require('fs');

const STATE_FILE = '/var/lib/nara-balance-monitor.json';
const CHECK_INTERVAL = 30; // seconds
const TG_TARGET = '1135683132';

function sendTelegram(msg) {
  try {
    execSync(`openclaw message send --channel telegram --target ${TG_TARGET} --message "${msg.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
  } catch (e) {
    console.error('Telegram error:', e.message);
  }
}

function getBalance() {
  try {
    const out = execSync('npx naracli balance --json', { encoding: 'utf-8' });
    const data = JSON.parse(out);
    return parseFloat(data.balance || '0');
  } catch (e) {
    console.error('Balance check error:', e.message);
    return null;
  }
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { lastBalance: 0 };
}

function saveState(state) {
  try {
    fs.mkdirSync('/var/lib', { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('Save state error:', e.message);
  }
}

let lastCheck = Date.now();
let heartbeatInterval = 10 * 60 * 1000; // 10 min heartbeat

function loop() {
  try {
    const balance = getBalance();
    if (balance === null) {
      setTimeout(loop, CHECK_INTERVAL * 1000);
      return;
    }

    const state = loadState();
    if (balance > state.lastBalance + 0.01) {
      const diff = (balance - state.lastBalance).toFixed(4);
      sendTelegram(`💰 NARA balance increased! New: ${balance.toFixed(4)} NARA (+${diff})`);
      state.lastBalance = balance;
    } else if (balance < state.lastBalance - 0.01) {
      const diff = (state.lastBalance - balance).toFixed(4);
      sendTelegram(`⚠️ NARA balance decreased! New: ${balance.toFixed(4)} NARA (-${diff})`);
      state.lastBalance = balance;
    }
    saveState(state);

    if (Date.now() - lastCheck > heartbeatInterval) {
      sendTelegram(`ℹ️ NARA balance monitor alive. Current balance: ${balance.toFixed(4)} NARA`);
      lastCheck = Date.now();
    }
  } catch (e) {
    console.error('Loop error:', e.message);
  }

  setTimeout(loop, CHECK_INTERVAL * 1000);
}

console.log('[nara-balance-monitor] Started');
loop();
