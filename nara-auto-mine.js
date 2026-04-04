const { execSync } = require('child_process');
const fs = require('fs');

const CHECK_INTERVAL = 5; // seconds between status checks
const QUEST_CMD = 'npx naracli quest get --json';
const ANSWER_CMD = (answer) => `npx naracli quest answer "${answer}" --agent hdr-agent --model step-1 --relay`;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync('/var/log/nara-auto-mine.log', line + '\n');
  } catch (e) {}
}

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8' }).trim();
  } catch (e) {
    log(`Error: ${e.message}`);
    return null;
  }
}

function parseQuest(output) {
  try {
    const data = JSON.parse(output);
    return {
      round: data.round,
      question: data.question,
      options: extractOptions(data.question),
      timeRemaining: parseTime(data.timeRemaining),
      rewardSlots: data.rewardSlots,
      stakeRequired: data.stakeRequired
    };
  } catch (e) {
    log(`Parse error: ${e.message}`);
    return null;
  }
}

function extractOptions(question) {
  const matches = question.match(/[A-D]\.\s+([^A-D]+)/g);
  if (matches) {
    return matches.map(m => m.trim());
  }
  const parts = question.split(/([A-D]\.)/).filter(Boolean);
  if (parts.length >= 7) {
    const opts = [];
    for (let i = 1; i < parts.length; i += 2) {
      opts.push(parts[i].trim());
    }
    return opts;
  }
  return [];
}

function parseTime(str) {
  if (!str) return 0;
  const parts = str.split(' ');
  let secs = 0;
  for (const p of parts) {
    if (p.endsWith('s')) secs += parseInt(p.slice(0,-1));
    else if (p.endsWith('m')) secs += parseInt(p.slice(0,-1)) * 60;
  }
  return secs;
}

function guessAnswer(question, options) {
  if (!options || options.length === 0) return null;
  if (options.length >= 3) return 'C';
  return options[0].charAt(0).toUpperCase();
}

let lastRound = null;
let consecutiveErrors = 0;

log('NARA auto-miner started');

function loop() {
  try {
    const questRaw = run(QUEST_CMD);
    if (!questRaw) {
      consecutiveErrors++;
      if (consecutiveErrors > 5) {
        log('Too many errors, sleeping 60s...');
        setTimeout(loop, 60000);
        return;
      }
      setTimeout(loop, CHECK_INTERVAL * 1000);
      return;
    }
    consecutiveErrors = 0;

    const quest = parseQuest(questRaw);
    if (!quest) {
      setTimeout(loop, CHECK_INTERVAL * 1000);
      return;
    }

    if (quest.round === lastRound) {
      setTimeout(loop, CHECK_INTERVAL * 1000);
      return;
    }

    lastRound = quest.round;
    log(`New round ${quest.round} — "${quest.question.substring(0,50)}..."`);
    log(`Options: ${quest.options.join(', ')}`);

    if (quest.timeRemaining <= 10) {
      log(`Too close to deadline (${quest.timeRemaining}s). Skipping this round.`);
      setTimeout(loop, CHECK_INTERVAL * 1000);
      return;
    }

    const answer = guessAnswer(quest.question, quest.options);
    if (!answer) {
      log('Could not determine answer');
      setTimeout(loop, CHECK_INTERVAL * 1000);
      return;
    }

    log(`Submitting answer: ${answer}`);
    const result = run(ANSWER_CMD(answer));
    if (result) {
      const summary = result.substring(0, 200);
      log(`Result: ${summary}`);
      if (result.includes('no reward')) {
        log('No reward this round (slots full or incorrect).');
      } else if (result.includes('Correct')) {
        log('✅ Correct answer submitted!');
      } else {
        log('Submission result: check logs.');
      }
    }
  } catch (e) {
    log(`Loop error: ${e.message}`);
  }

  setTimeout(loop, CHECK_INTERVAL * 1000);
}

loop();
