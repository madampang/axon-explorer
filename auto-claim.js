const { ethers } = require('ethers');
const { execSync } = require('child_process');

const RPC_URL = 'https://mainnet-rpc.axonchain.ai/';
const PRECOMPILE_ADDR = '0x0000000000000000000000000000000000000801';
const CLAIM_METHOD = 'claimReducedStake()';

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
    const wallet = new ethers.Wallet(pk);
    const provider = new ethers.JsonRpcProvider(RPC_URL);

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
      sendNotification(`✅ AXON claim successful! ${pending} AXON claimed. Tx: ${tx.hash}`);
    } catch (err) {
      console.error('Decode/claim error:', err);
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
