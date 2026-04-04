const { ethers } = require('ethers');
const { execSync } = require('child_process');
const fs = require('fs');

const RPC_URL = 'https://ai-colony.top/axon-rpc-write/';
const CONTRACT_ADDR = '0x544ed1bede0f71874f493c8335af38f42bf3fd25';
const ABI = [
  'function nextMineId() view returns (uint256)',
  'function pendingMines(uint256) view returns (address miner, uint256 baseReward, bytes32 hash, uint256 timestamp, bool processed)'
];
const STATE_FILE = '/var/lib/aore-reward-monitor.json';
const CHECK_INTERVAL = 30; // seconds

// Load PK from /root/.axon_pk
const pk = fs.readFileSync('/root/.axon_pk', 'utf-8').trim();
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(pk, provider);
const contract = new ethers.Contract(CONTRACT_ADDR, ABI, wallet);

function sendTelegram(msg) {
  try {
    execSync(`openclaw message send --channel telegram --target 1135683132 --message "${msg.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
  } catch (e) {
    console.error('Telegram error:', e.message);
  }
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { lastSeenId: 0 };
}

function saveState(state) {
  try {
    fs.mkdirSync('/var/lib', { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('Failed to save state:', e.message);
  }
}

async function checkRewards() {
  try {
    const nextId = await contract.nextMineId();
    const n = Number(nextId);
    const state = loadState();
    const start = Math.max(0, state.lastSeenId);
    
    for (let i = start; i < n; i++) {
      const pm = await contract.pendingMines(i);
      if (pm.miner.toLowerCase() === wallet.address.toLowerCase() && pm.processed) {
        const reward = ethers.formatEther(pm.baseReward);
        sendTelegram(`💰 AORE reward received! +${reward} AORE (mine #${i})`);
        state.lastSeenId = i + 1;
      }
    }
    
    if (state.lastSeenId < n) {
      state.lastSeenId = n;
    }
    saveState(state);
  } catch (e) {
    console.error('Check error:', e.message);
  }
}

console.log('[aore-reward-monitor] Started, checking every', CHECK_INTERVAL, 's');
setInterval(checkRewards, CHECK_INTERVAL * 1000);
