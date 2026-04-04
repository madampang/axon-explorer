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
    const address = wallet.address;

    console.log(`Checking agent status for ${address}`);

    const iface = new ethers.Interface([
      'function getAgent(address) returns (string agentId, string[] capabilities, string model, uint64 reputation, bool isOnline)'
    ]);
    const data = iface.encodeFunctionData('getAgent', [address]);
    const raw = await provider.call({ to: PRECOMPILE_ADDR, data: data });
    const { agentId, capabilities, model, reputation, isOnline } = iface.decodeFunctionResult('getAgent', raw);

    console.log('Agent Info:');
    console.log(`  ID: ${agentId}`);
    console.log(`  Model: ${model}`);
    console.log(`  Reputation: ${reputation.toString()}`);
    console.log(`  Online: ${isOnline}`);
    console.log(`  Capabilities: ${JSON.stringify(capabilities)}`);
  } catch (err) {
    console.error('Check error:', err);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
