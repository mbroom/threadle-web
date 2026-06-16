import path from "path";
import fs from "fs";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const HAIKU = "claude-haiku-4-5";
const HAIKU_IN = 0.8 / 1e6, HAIKU_OUT = 4.0 / 1e6;
const RANGES = { easy:[3,4], medium:[5,7], hard:[8,12] };

const HARD_START_WORDS = [
  "PLANT","STONE","LIGHT","HEART","FRAME","CRANE","SWORD","BREAD",
  "FLAME","STORM","GRACE","PROUD","BLOOM","FLESH","GRIND","CLASH",
  "PLACE","GRAND","BLAST","CLEAR","PRESS","TRICK","TRACK","PRICE"
];

function loadWordSet(filePath) {
  return new Set(
    fs.readFileSync(filePath, "utf8").split("\n")
      .map(w => w.trim().toUpperCase())
      .filter(w => w.length >= 3 && w.length <= 8 && /^[A-Z]+$/.test(w))
  );
}

function getNeighbors(word, wordSet) {
  const neighbors = [];
  const L = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let i = 0; i < word.length; i++)
    for (const l of L) if (l !== word[i]) { const c = word.slice(0,i)+l+word.slice(i+1); if (wordSet.has(c)) neighbors.push(c); }
  for (let i = 0; i <= word.length; i++)
    for (const l of L) { const c = word.slice(0,i)+l+word.slice(i); if (wordSet.has(c)) neighbors.push(c); }
  if (word.length > 3)
    for (let i = 0; i < word.length; i++) { const c = word.slice(0,i)+word.slice(i+1); if (wordSet.has(c)) neighbors.push(c); }
  return neighbors;
}

function bfsOutward(start, wordSet, maxDist) {
  const meta = new Map([[start, { dist:0, parent:null }]]);
  let frontier = [start], dist = 0;
  while (frontier.length > 0 && dist < maxDist) {
    dist++;
    const next = [];
    for (const word of frontier)
      for (const n of getNeighbors(word, wordSet))
        if (!meta.has(n)) { meta.set(n, { dist, parent:word }); next.push(n); }
    frontier = next;
  }
  return meta;
}

function reconstructPath(meta, start, end) {
  if (!meta.has(end)) return null;
  const path = [];
  let current = end;
  while (current !== null) { path.unshift(current); current = meta.get(current).parent; }
  return path[0] === start ? path : null;
}

function parseJSON(text) {
  const cleaned = text.replace(/```json|```/g, "");
  const blocks = [];
  let depth = 0, start = -1;
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === "{") { if (depth === 0) start = i; depth++; }
    else if (cleaned[i] === "}") { depth--; if (depth === 0 && start !== -1) { blocks.push(cleaned.slice(start, i+1)); start = -1; } }
  }
  for (let i = blocks.length - 1; i >= 0; i--) {
    try { const p = JSON.parse(blocks[i]); if (Object.keys(p).length > 0) return p; } catch { continue; }
  }
  return null;
}

async function callHaiku(client, system, user) {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const c = new Anthropic();
  const res = await c.messages.create({
    model: HAIKU, max_tokens: 128, system,
    messages: [{ role:"user", content:user }]
  });
  const text = res.content.map(b => b.text||"").join("");
  return { text, cost: HAIKU_IN*res.usage.input_tokens + HAIKU_OUT*res.usage.output_tokens };
}

async function generateOnePuzzle(difficulty, wordSet, commonWords) {
  const [min, max] = RANGES[difficulty];
  let startWord;

  if (difficulty === "hard") {
    startWord = HARD_START_WORDS[Math.floor(Math.random()*HARD_START_WORDS.length)];
  } else {
    const r1 = await callHaiku(null,
      `Pick a common English word, 3-6 letters, for a word puzzle. Vary choices.\nONLY JSON: {"word":"WORD"}`,
      `Pick a start word for a ${difficulty} puzzle.`
    );
    const p1 = parseJSON(r1.text);
    const candidate = (p1?.word||"").toUpperCase().replace(/[^A-Z]/g,"");
    startWord = commonWords.has(candidate) ? candidate : "PLANT";
  }

  const meta = bfsOutward(startWord, wordSet, max);
  const candidates = [];
  for (const [word,{dist}] of meta.entries())
    if (dist >= min && dist <= max && commonWords.has(word)) candidates.push({ word, dist });
  if (candidates.length === 0) throw new Error("No candidates from " + startWord);

  const sample = candidates.sort(()=>Math.random()-0.5).slice(0,20).map(c=>c.word);
  const r2 = await callHaiku(null,
    `Pick the most interesting END word for a puzzle starting at "${startWord}". All verified correct distance. No proper nouns.\nONLY JSON: {"word":"WORD"}`,
    `Start: ${startWord}\nCandidates: ${sample.join(", ")}\nPick best.`
  );
  const p2 = parseJSON(r2.text);
  const rawChoice = (p2?.word||"").toUpperCase().replace(/[^A-Z]/g,"");
  const verified = candidates.find(c=>c.word===rawChoice);
  const endWord = verified ? rawChoice : candidates[Math.floor(Math.random()*Math.min(50,candidates.length))].word;
  const path = reconstructPath(meta, startWord, endWord);
  if (!path) throw new Error("Path reconstruction failed");

  return { start:startWord, end:endWord, path, steps:path.length-1, par:path.length-1 };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error:"Method not allowed" });

  const secret = process.env.CRON_SECRET || "threadle-cron";
  const provided = req.headers["authorization"];
  if (provided !== secret) return res.status(401).json({ error:"Unauthorized" });

  const { difficulty, count = 7 } = req.body;
  if (!["easy","medium","hard"].includes(difficulty)) {
    return res.status(400).json({ error:"Invalid difficulty" });
  }

  try {
    const cwd = process.cwd();
    const wordSet = loadWordSet(path.join(cwd, "public", "wordlist.txt"));
    const commonWords = loadWordSet(path.join(cwd, "public", "common_words.txt"));
    const bankKey = `threadle:bank:${difficulty}`;
    const generated = [];
    let failures = 0;

    for (let i = 0; i < count; i++) {
      try {
        const puzzle = await generateOnePuzzle(difficulty, wordSet, commonWords);
        await redis.rpush(bankKey, JSON.stringify(puzzle));
        generated.push(puzzle.start + "→" + puzzle.end);
      } catch (e) {
        failures++;
        console.error("Failed to generate puzzle:", e.message);
      }
    }

    const remaining = await redis.llen(bankKey);
    console.log(`Replenished ${difficulty}: ${generated.length} puzzles added, ${remaining} total in bank`);
    return res.status(200).json({ ok:true, generated:generated.length, failures, remaining, puzzles:generated });

  } catch (e) {
    console.error("Replenish error:", e.message);
    return res.status(500).json({ error:e.message });
  }
}
