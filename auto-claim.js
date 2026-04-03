const { ethers } = require('ethers');
const { execSync } = require('child_process');
const fs = require('fs');

const RPC_URL = 'https://mainnet-rpc.axonchain.ai/';
const PRECOMPILE_ADDR = '0x0000000000000000000000000000000000000801';
const CLAIM_METHOD = 'claimReducedStake()';
const CLAIMS_HISTORY = '/var/log/axon-claims-history.json';

function loadClaims() {
  try {
    if (fs.existsSync(CLAIMS_HISTORY)) {
      const data = fs.readFileSync(CLAIMS_HISTORY, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load claims history:', e.message);
  }
  return [];
}

function saveClaims(claims) {
  try {
    fs.writeFileSync(CLAIMS_HISTORY, JSON.stringify(claims, null, 2) + '\n');
  } catch (e) {
    console.error('Failed to save claims history:', e.message);
  }
}

function recordClaim(txHash, amount, block) {
  const claims = loadClaims();
  claims.push({
    txHash,
    amount,
    block: parseInt(block, 10),
    timestamp: new Date().toISOString()
  });
  saveClaims(claims);
}

function sendNotification(message) {
  try {
    execSync(`openclaw message send --channel telegram --target 1135683132 --message "${message.replace(/"/g, '\\"')}"`, { stdio: 'ignore' });
  } catch (e) {
    console.error('Failed to send notification:', e.message);
  }
}

function encodeCall(sig, args = []) {
  const iface = new ethers.Interface([`function ${sig}`]);
  return iface.encodeFunctionData(sig, args);
}

async function main() {
  let pk = process.env.AXON_PK;
  if (!pk) {
    try {
      const fs = require('fs');
      pk = fs.readFileSync('/root/.axon_pk', 'utf-8').trim();
    } catch (e) {
      console.error('ERROR: No AXON_PK env or /root/.axon_pk file');
      process.exit(1);
    }
  }

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(pk).connect(provider);

    console.log(`[${new Date().toISOString()}] Checking ${wallet.address}...`);

    const currentBlock = await provider.getBlockNumber();
    const getData = encodeCall('getStakeInfo(address)', [wallet.address]);

    let raw;
    try {
      raw = await provider.call({ to: PRECOMPILE_ADDR, data: getData });
    } catch (err) {
      console.error('RPC call failed:', err.message);
      return;
    }

    if (!raw || raw === '0x') {
      console.log('No stake info returned (agent not registered?).');
      return;
    }

    try {
      const iface = new ethers.Interface([
        'function getStakeInfo(address) returns (uint256 totalStake, uint256 pendingReduce, uint64 reduceUnlockHeight)'
      ]);
      const { totalStake, pendingReduce, reduceUnlockHeight } = iface.decodeFunctionResult('getStakeInfo', raw);
      const total = ethers.formatUnits(totalStake, 18);
      const pending = ethers.formatUnits(pendingReduce, 18);
      // reduceUnlockHeight may be a BigNumber; convert safely
      const unlock = parseInt(reduceUnlockHeight.toString(), 10);

      console.log(`Stake: total=${total} AXON, pending=${pending} AXON, unlockHeight=${unlock}`);

      if (currentBlock < unlock) {
        console.log(`Not ready: need block >= ${unlock}, currently ${currentBlock}.`);
        return;
      }

      // Check balance for gas (optional)
      const bal = await provider.getBalance(wallet.address);
      console.log(`Balance: ${ethers.formatEther(bal)} ETH for gas.`);

      // Send claim
      const claimData = encodeCall(CLAIM_METHOD);
      const tx = await wallet.sendTransaction({
        to: PRECOMPILE_ADDR,
        data: claimData,
        gasLimit: 100000,
      });
      console.log(`Tx sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`Claimed! Block: ${receipt.blockNumber}, gasUsed: ${receipt.gasUsed}`);
      recordClaim(tx.hash, pending, receipt.blockNumber);
      sendNotification(`✅ AXON claim successful! ${pending} AXON claimed. Tx: ${tx.hash}`);
    } catch (err) {
      console.error('Decode/claim error:', err);
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
