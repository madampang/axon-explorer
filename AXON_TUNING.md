# Axon Node Tuning (2026-04-04)

Applied optimizations to improve sync speed:

- **IAVL cache size**: 781250 → 5000000 nodes (in `app.toml`)
- **Outbound peers**: 10 → 30 (in `config.toml`)
- Binary upgraded to `v1.1.1-beta2`
- Node running via `start_sync_node.sh` with PID tracking

Results:
- Initial sync rate after tuning: ~150–200 blocks/s (from ~95 blocks/s)
- Node home: `/opt/axon-node/data/node`
- Log: `/opt/axon-node/data/node.log`

Notes:
- Tuning applied to active config files in node home (not templates) for immediate effect.
- Consider adding more bootstrap peers in `bootstrap_peers.txt` if available.
- Monitor disk I/O; ensure using SSD.
