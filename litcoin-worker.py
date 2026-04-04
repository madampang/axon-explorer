#!/usr/bin/env python3
import os, sys, time, logging
from litcoin import Agent

logging.basicConfig(
    filename='/var/log/litcoin-worker.log',
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s'
)
log = logging.getLogger()

def main():
    bankr_key = os.getenv('BANKR_API_KEY')
    if not bankr_key:
        try:
            with open('/root/.bankr_api_key', 'r') as f:
                bankr_key = f.read().strip()
        except Exception as e:
            log.error(f'BANKR_API_KEY not set and file unreadable: {e}')
            sys.exit(1)

    try:
        agent = Agent(bankr_key=bankr_key)
        log.info('Starting mining cycle...')
        agent.mine(rounds=100)          # comprehension mining
        # Optional: check claims
        # agent.claim()
        bal = agent.balance()
        log.info(f'Cycle done. Balances: {bal}')
    except Exception as e:
        log.exception('Worker error')

if __name__ == '__main__':
    main()
