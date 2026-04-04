const { ethers } = require('ethers');
const fs = require('fs');

const RPC_URL = 'https://ai-colony.top/axon-rpc-write/';
const CONTRACT_ADDR = '0x544ed1bede0f71874f493c8335af38f42bf3fd25';
const ABI = [
  'function nextMineId() view returns (uint256)',
  'function pendingMines(uint256) view returns (address miner, uint256 baseReward, bytes32 hash, uint256 timestamp, bool processed)',
  'function claim(uint256 mineId)'
];
const PK = fs.readFileSync('/root/.axon_pk', 'utf-8').trim();

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PK, provider);
  const contract = new ethers.Contract(CONTRACT_ADDR, ABI, wallet);

  console.log('Wallet:', wallet.address);
  const nextId = await contract.nextMineId();
  const n = Number(nextId);
  console.log('nextMineId:', n);

  let claimedAny = false;
  for (let i = 0; i < n; i++) {
    const pm = await contract.pendingMines(i);
    if (pm.miner.toLowerCase() === wallet.address.toLowerCase() && pm.processed) {
      // Try to claim
      try {
        const tx = await contract.claim(i);
        console.log(`Claiming mine #${i} (reward ${ethers.formatEther(pm.baseReward)} AXON)... tx: ${tx.hash}`);
        await tx.wait();
        console.log(`✅ Claimed #${i}`);
        claimedAny = true;
      } catch (e) {
        console.error(`❌ Claim #${i} failed:`, e.reason || e.message);
      }
    }
  }

  if (!claimedAny) {
    console.log('No processed rewards to claim (or already claimed).');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
