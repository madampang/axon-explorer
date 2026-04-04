#!/usr/bin/env node
/**
 * AORE CLI Miner — Mine from your server
 * Usage: node cli-miner.js <private_key>
 */
const { ethers } = require('ethers');

const RPC_URL = "https://ai-colony.top/axon-rpc-write/";
const CONTRACT_ADDR = "0x544ed1bede0f71874f493c8335af38f42bf3fd25";

const ABI = [
    "function globalChallenge() view returns (bytes32)",
    "function difficultyTarget() view returns (uint256)",
    "function lastMinedTime(address) view returns (uint256)",
    "function mine(uint256 nonce) payable",
    "function pendingMines(uint256) view returns (address miner, uint256 baseReward, bytes32 hash, uint256 timestamp, bool processed)",
    "function nextMineId() view returns (uint256)"
];

async function main() {
    const pk = process.argv[2];
    if (!pk) {
        console.error("Usage: node cli-miner.js <private_key>");
        console.error("You can get the private key from the Session Wallet export in the browser.");
        process.exit(1);
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    let wallet;
    try {
        wallet = new ethers.Wallet(pk, provider);
    } catch(e) {
        console.error("Invalid private key");
        process.exit(1);
    }

    console.log("════════════════════════════════════════════");
    console.log(" AORE CLI Miner ");
    console.log("════════════════════════════════════════════");
    console.log("Address: ", wallet.address);

    const contract = new ethers.Contract(CONTRACT_ADDR, ABI, wallet);

    while (true) {
        try {
            // Check cooldown
            const lastMined = Number(await contract.lastMinedTime(wallet.address));
            const now = Math.floor(Date.now() / 1000);
            if (now < lastMined + 60) {
                const wait = lastMined + 60 - now;
                process.stdout.write(`\rCooldown... wait ${wait}s `);
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }

            // Fetch challenge & target
            const challenge = await contract.globalChallenge();
            const target = BigInt(await contract.difficultyTarget());
            
            console.log(`\n\nMining...`);
            console.log(`Challenge: ${challenge.slice(0,16)}...`);
            
            // CPU intensive loop
            let nonce = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
            let hashVal;
            let attempts = 0;
            const start = Date.now();
            const types = ['bytes32', 'address', 'uint256'];
            
            while (true) {
                const hashStr = ethers.solidityPackedKeccak256(types, [challenge, wallet.address, nonce]);
                hashVal = BigInt(hashStr);
                attempts++;
                
                if (hashVal <= target) {
                    const elapsed = (Date.now() - start)/1000;
                    console.log(`\n🎯 Found valid hash!`);
                    console.log(`Hash: ${hashStr}`);
                    console.log(`Nonce: ${nonce.toString()}`);
                    console.log(`Hashrate: ${Math.floor(attempts/elapsed)} H/s | Elapsed: ${elapsed.toFixed(1)}s`);
                    break;
                }
                
                if (attempts % 100000 === 0) {
                    process.stdout.write(`\rHashing... ${attempts} attempts`);
                }
                nonce++;
            }

            // Submit tx
            console.log(`Submitting on-chain...`);
            const tx = await contract.mine(nonce, { value: ethers.parseEther("0.2"), gasLimit: 500000 });
            console.log(`TX sent: ${tx.hash}`);
            
            console.log(`Waiting for confirmation...`);
            
            // Custom wait to bypass Axon chain transactionIndex overflow bug
            let confirmed = false;
            for(let i=0; i<30; i++) {
                await new Promise(r => setTimeout(r, 2000));
                const receipt = await provider.send("eth_getTransactionReceipt", [tx.hash]);
                if (receipt) {
                    if (receipt.status === "0x1") {
                        console.log(`✅ Success! Wait 60s for next round.\n`);
                        confirmed = true;
                        break;
                    } else if (receipt.status === "0x0") {
                        console.log(`❌ Transaction Reverted.\n`);
                        confirmed = true;
                        break;
                    }
                }
            }
            if (!confirmed) console.log(`⚠️ Receipt timeout, but it might still be mined.\n`);
            
        } catch (e) {
            console.log(`\n❌ Error: ${e.reason || e.message}`);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

main();
