const { ethers } = require('ethers');

const PRIVATE_KEY = '0x899ac9beb7bbb849cae24b8f8001d598cf030d91c76b979b044d9502f76db4a0';
const RPC_URL = 'https://mainnet-rpc.axonchain.ai/';
const PRECOMPILE_ADDR = '0x0000000000000000000000000000000000000801';

async function main() {
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  console.log('Wallet address:', wallet.address);

  // Get current block
  const block = await provider.getBlockNumber();
  console.log('Current block:', block);

  // Balance in AXON (aaxon = 10^-18)
  const balWei = await provider.getBalance(wallet.address);
  const balAaxon = ethers.formatUnits(balWei, 18);
  console.log('Balance (aaxon):', balAaxon);

  // Helper to encode call
  function encodeCall(sig, args = []) {
    const iface = new ethers.Interface([`function ${sig}`]);
    return iface.encodeFunctionData(sig, args);
  }

  // isAgent(address)
  const isAgentData = encodeCall('isAgent(address)', [wallet.address]);
  let isAgentResult;
  try {
    isAgentResult = await provider.call({ to: PRECOMPILE_ADDR, data: isAgentData });
    // bool is 32 bytes, last byte 0 or 1
    const isAgentBool = parseInt(isAgentResult.slice(-2), 16) === 1;
    console.log('isAgent:', isAgentBool ? 'true' : 'false', '(raw)', isAgentResult);
  } catch (e) {
    console.log('isAgent call error:', e.message);
  }

  // getStakeInfo(address)
  const getStakeInfoData = encodeCall('getStakeInfo(address)', [wallet.address]);
  let getStakeResult;
  try {
    getStakeResult = await provider.call({ to: PRECOMPILE_ADDR, data: getStakeInfoData });
    console.log('getStakeInfo raw:', getStakeResult);
  } catch (e) {
    console.log('getStakeInfo call error:', e.message);
    getStakeResult = null;
  }

  // Parse result if present
  if (getStakeResult && getStakeResult !== '0x') {
    try {
      const iface2 = new ethers.Interface([
        'function getStakeInfo(address) returns (uint256 totalStake, uint256 pendingReduce, uint64 reduceUnlockHeight)'
      ]);
      // The output is (uint256, uint256, uint64) = 32+32+8 = 72 bytes? Actually uint64 is 8 bytes but padded to 32. So total 32*3 = 96 bytes.
      const decoded = iface2.decodeFunctionResult('getStakeInfo', getStakeResult);
      console.log('totalStake (aaxon):', ethers.formatUnits(decoded.totalStake, 18));
      console.log('pendingReduce (aaxon):', ethers.formatUnits(decoded.pendingReduce, 18));
      console.log('reduceUnlockHeight:', decoded.reduceUnlockHeight.toString());
      // Check if we can claim
      if (block >= decoded.reduceUnlockHeight) {
        console.log('✅ Block >= unlockHeight. Eligible to claimReducedStake now.');
      } else {
        console.log(`⏳ Need to wait until block ${decoded.reduceUnlockHeight} (current ${block})`);
      }
    } catch (e) {
      console.log('Decode error:', e.message);
    }
  } else {
    console.log('No valid result; maybe not registered or call reverted.');
  }

  // Check if we can claim (block >= unlockHeight)
  // We'll need to parse reduceUnlockHeight if possible
}

main().catch(console.error);
