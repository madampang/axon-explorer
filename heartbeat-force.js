const { ethers } = require('ethers');

const RPC_URL = 'https://mainnet-rpc.axonchain.ai/';
const PRECOMPILE_ADDR = '0x0000000000000000000000000000000000000801';

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

    console.log(`[${new Date().toISOString()}] Forcing heartbeat from ${wallet.address}`);

    const iface = new ethers.Interface(['function heartbeat()']);
    const data = iface.encodeFunctionData('heartbeat');
    const tx = await wallet.sendTransaction({
      to: PRECOMPILE_ADDR,
      data: data,
      gasLimit: 100000,
    });
    console.log(`Tx sent: ${tx.hash}`);

    try {
      const receipt = await tx.wait(10); // wait up to 10s for mining
      console.log(`Heartbeat confirmed. Block: ${receipt.blockNumber}, status: ${receipt.status ? 'ok' : 'reverted'}`);
    } catch (waitErr) {
      console.log(`Tx sent, could not confirm: ${waitErr.message}`);
    }
  } catch (err) {
    console.error('Heartbeat error:', err);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
