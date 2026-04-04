const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');

const CHECK_INTERVAL = 60; // seconds between quest checks (rate limit friendly)
const QUEST_CMD = 'npx naracli quest get --json';
const ANSWER_CMD = (answer, model) => `npx naracli quest answer "${answer.replace(/"/g, '\\"')}" --agent hdr-agent --model ${model} --relay`;

const OPENROUTER_KEY = 'REDACTED';
const OPENROUTER_MODEL = 'qwen/qwen3.6-plus:free';
const ALTERNATE_MODEL = 'mistralai/mixtral-8x7b-instruct:free';

let useAlt = false;
let lastRound = null;
let consecutiveErrors = 0;
let backoffUntil = 0;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync('/var/log/nara-auto-mine.log', line + '\n'); } catch (e) {}
}

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf-8' }).trim(); }
  catch (e) { log(`Error: ${e.message}`); return null; }
}

function parseQuest(output) {
  try {
    const data = JSON.parse(output);
    const options = extractOptions(data.question);
    const type = options.length > 0 ? 'mcq' : 'open';
    return {
      round: data.round,
      question: data.question,
      options,
      type,
      timeRemaining: parseTime(data.timeRemaining),
      rewardSlots: data.rewardSlots,
      stakeRequired: data.stakeRequired
    };
  } catch (e) { log(`Parse error: ${e.message}`); return null; }
}

function extractOptions(question) {
  if (!question) return [];
  const matches = question.match(/[A-D]\.\s+([^A-D]+)/g);
  if (matches) return matches.map(m => m.trim());
  const parts = question.split(/([A-D]\.)/).filter(Boolean);
  if (parts.length >= 7) {
    const opts = [];
    for (let i = 1; i < parts.length; i += 2) opts.push(parts[i].trim());
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

function getOpenRouterAnswer(question, options, type) {
  return new Promise((resolve) => {
    let prompt;
    if (type === 'mcq') {
      const optsList = options.map((o,i)=>['A','B','C','D'][i]+'. '+o).join('\n');
      prompt = `You are an AI assistant answering a multiple-choice quiz. Provide your answer as a single uppercase letter (A, B, C, or D) representing the correct option. Do not add any other text.\n\nQuestion: ${question}\n\nOptions:\n${optsList}\n\nAnswer:`;
    } else {
      prompt = `You are an AI assistant. Provide a very concise, precise answer (1-3 words). If the question asks for a person's name, provide the full name. Do not include any explanations, prefixes like "Answer:" or quotes.\n\n${question}\n\nAnswer:`;
    }

    const data = JSON.stringify({
      model: useAlt ? ALTERNATE_MODEL : OPENROUTER_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: type === 'mcq' ? 5 : 50
    });

    const req = https.request({
      hostname: 'openrouter.ai',
      port: 443,
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': 'https://openrouter.ai',
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 429) {
          log('OpenRouter rate limited. Backing off 60s and toggling model.');
          useAlt = !useAlt;
          return resolve({ rateLimited: true, backoff: 60 });
        }
        if (res.statusCode !== 200) {
          log(`OpenRouter error ${res.statusCode}: ${body.substring(0,200)}`);
          return resolve(null);
        }
        try {
          const json = JSON.parse(body);
          const text = json.choices?.[0]?.message?.content?.trim() || '';
          if (type === 'mcq') {
            const match = text.match(/[A-D]/i);
            if (match) resolve(match[0].toUpperCase());
            else resolve(null);
          } else {
            // open-ended: clean, remove quotes, trim
            let answer = text.replace(/["']/g, '').trim();
            // Remove any leading "Answer:" etc.
            answer = answer.replace(/^answer\s*:?\s*/i, '');
            resolve(answer || null);
          }
        } catch (e) {
          log(`OpenRouter parse error: ${e.message}`);
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      log(`OpenRouter request error: ${e.message}`);
      resolve(null);
    });

    req.write(data);
    req.end();
  });
}

log('NARA auto-miner started (OpenRouter robust)');

async function loop() {
  const now = Date.now();
  if (now < backoffUntil) {
    const wait = Math.ceil((backoffUntil - now)/1000);
    log(`In backoff, waiting ${wait}s...`);
    setTimeout(loop, CHECK_INTERVAL * 1000);
    return;
  }

  try {
    const questRaw = run(QUEST_CMD);
    if (!questRaw) {
      consecutiveErrors++;
      if (consecutiveErrors > 5) { log('Too many errors, sleeping 60s...'); setTimeout(loop, 60000); return; }
      setTimeout(loop, CHECK_INTERVAL * 1000); return;
    }
    consecutiveErrors = 0;

    const quest = parseQuest(questRaw);
    if (!quest) { setTimeout(loop, CHECK_INTERVAL * 1000); return; }

    if (quest.round === lastRound) { setTimeout(loop, CHECK_INTERVAL * 1000); return; }

    lastRound = quest.round;
    log(`Round ${quest.round} — Type: ${quest.type}`);
    const qPreview = quest.question.length > 80 ? quest.question.substring(0,80)+'...' : quest.question;
    log(`Question: ${qPreview}`);
    if (quest.type === 'mcq') log(`Options: ${quest.options.join(', ')}`);

    if (quest.timeRemaining <= 15) {
      log(`Too close to deadline (${quest.timeRemaining}s). Skipping.`);
      setTimeout(loop, CHECK_INTERVAL * 1000); return;
    }

    log(`Asking OpenRouter (${useAlt ? ALTERNATE_MODEL : OPENROUTER_MODEL})...`);
    const answer = await getOpenRouterAnswer(quest.question, quest.options, quest.type);
    if (!answer) {
      log('No answer from OpenRouter, skip this round.');
      setTimeout(loop, CHECK_INTERVAL * 1000); return;
    }
    if (answer.rateLimited) {
      backoffUntil = Date.now() + answer.backoff * 1000;
      log(`Backoff until ${new Date(backoffUntil).toISOString()}`);
      setTimeout(loop, CHECK_INTERVAL * 1000); return;
    }

    log(`Submitting answer: ${answer}`);
    const result = run(ANSWER_CMD(answer, useAlt ? ALTERNATE_MODEL : OPENROUTER_MODEL));
    if (result) {
      const summary = result.substring(0, 200);
      log(`Result: ${summary}`);
      if (result.includes('no reward')) log('No reward this round (slots full).');
      else if (result.includes('Correct')) log('✅ Correct answer submitted!');
      else log('Submission result indicated failure.');
    }
  } catch (e) {
    log(`Loop error: ${e.message}`);
  }

  setTimeout(loop, CHECK_INTERVAL * 1000);
}

loop();
