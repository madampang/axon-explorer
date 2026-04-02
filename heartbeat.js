const { ethers } = require('ethers');

const RPC_URL = 'https://mainnet-rpc.axonchain.ai/';
const PRECOMPILE_ADDR = '0x0000000000000000000000000000000000000801';
const LAST_HEART_FILE = '/var/lib/axon-last-heart.txt';

async function getLastHeartBlock() {
  try {
    const fs = require('fs');
    if (fs.existsSync(LAST_HEART_FILE)) {
      const val = parseInt(fs.readFileSync(LAST_HEART_FILE, 'utf-8').trim(), 10);
      return isNaN(val) ? 0 : val;
    }
  } catch (e) {}
  return 0;
}

async function setLastHeartBlock(block) {
  try {
    const fs = require('fs');
    fs.writeFileSync(LAST_HEART_FILE, block.toString());
  } catch (e) {
    console.error('Failed to write last heart file:', e.message);
  }
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

    console.log(`[${new Date().toISOString()}] Heartbeat check for ${wallet.address}`);

    const currentBlock = await provider.getBlockNumber();
    console.log(`Current block: ${currentBlock}`);

    // Get agent info
    const ifaceView = new ethers.Interface([
      'function getAgent(address) returns (string agentId, string[] capabilities, string model, uint64 reputation, bool isOnline)',
      'function getStakeInfo(address) returns (uint256 totalStake, uint256 pendingReduce, uint64 reduceUnlockHeight)'
    ]);
    const agentData = ifaceView.encodeFunctionData('getAgent', [wallet.address]);
    const rawAgent = await provider.call({ to: PRECOMPILE_ADDR, data: agentData });
    const agentDecoded = ifaceView.decodeFunctionResult('getAgent', rawAgent);
    const { agentId, capabilities, model, reputation, isOnline } = agentDecoded;
    console.log(`Agent: id=${agentId}, online=${isOnline}, reputation=${reputation.toString()}, model=${model}`);

    // Check last heart locally
    const lastHeart = await getLastHeartBlock();
    const blocksSince = currentBlock - lastHeart;
    console.log(`Blocks since last heartbeat: ${blocksSince} (require >= 100)`);

    if (!isOnline) {
      console.log('Agent is offline on-chain. Heartbeat may help bring online.');
    }

    if (blocksSince < 100) {
      console.log(`Skipping: only ${blocksSince} blocks passed.`);
      return;
    }

    // Send heartbeat
    const ifaceTx = new ethers.Interface(['function heartbeat()']);
    const data = ifaceTx.encodeFunctionData('heartbeat');
    const tx = await wallet.sendTransaction({
      to: PRECOMPILE_ADDR,
      data: data,
      gasLimit: 100000,
    });
    console.log(`Tx sent: ${tx.hash}`);

    try {
      const receipt = await tx.wait();
      console.log(`Heartbeat confirmed. Block: ${receipt.blockNumber}, gasUsed: ${receipt.gasUsed}`);
      await setLastHeartBlock(currentBlock);
    } catch (waitErr) {
      // Could not parse receipt fully
      console.log(`Tx sent, receipt parse error: ${waitErr.message}. Updating last heart anyway.`);
      await setLastHeartBlock(currentBlock);
    }
  } catch (err) {
    console.error('Heartbeat error:', err);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
