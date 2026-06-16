// scripts/generate.js — run this daily via cron to regenerate the puzzle
// Cron: 0 0 * * * node /path/to/threadle-web/scripts/generate.js

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { config } from 'dotenv';
config({ path: '.env.local' });

const client = new Anthropic();
const HAIKU = "claude-haiku-4-5";
const HAIKU_IN = 0.8 / 1e6, HAIKU_OUT = 4.0 / 1e6;

const HARD_START_WORDS = [
  "PLANT","STONE","LIGHT","HEART","FRAME","CRANE","SWORD","BREAD",
  "FLAME","STORM","GRACE","PROUD","BLOOM","FLESH","GRIND","CLASH",
  "PLACE","GRAND","BLAST","CLEAR","PRESS","TRICK","TRACK","PRICE"
];

// Day-of-week difficulty rotation: Mon=easy, Tue-Fri=medium, Sat-Sun=hard
function getDifficultyForToday() {
  const day = new Date().getDay(); // 0=Sun, 1=Mon ... 6=Sat
  if (day === 1) return "easy";
  if (day === 0 || day === 6) return "hard";
  return "medium";
}

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
  const meta = new Map([[start, { dist: 0, parent: null }]]);
  let frontier = [start];
  let dist = 0;
  while (frontier.length > 0 && dist < maxDist) {
    dist++;
    const next = [];
    for (const word of frontier)
      for (const n of getNeighbors(word, wordSet))
        if (!meta.has(n)) { meta.set(n, { dist, parent: word }); next.push(n); }
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

async function generatePuzzle(difficulty, wordSet, commonWords) {
  const RANGES = { easy: [3,4], medium: [5,7], hard: [8,12] };
  const [min, max] = RANGES[difficulty];
  let totalCost = 0;

  let startWord;
  if (difficulty === "hard") {
    startWord = HARD_START_WORDS[Math.floor(Math.random() * HARD_START_WORDS.length)];
  } else {
    const r1 = await client.messages.create({
      model: HAIKU, max_tokens: 128,
      system: `Pick a common English word, 3-6 letters, for a word puzzle. Vary choices.\nONLY JSON: {"word": "WORD"}`,
      messages: [{ role: "user", content: `Pick a start word for a ${difficulty} puzzle.` }]
    });
    const p1 = parseJSON(r1.content.map(b=>b.text||"").join(""));
    totalCost += HAIKU_IN * r1.usage.input_tokens + HAIKU_OUT * r1.usage.output_tokens;
    const candidate = (p1?.word||"").toUpperCase().replace(/[^A-Z]/g,"");
    startWord = commonWords.has(candidate) ? candidate : "PLANT";
  }

  const meta = bfsOutward(startWord, wordSet, max);
  const candidates = [];
  for (const [word, {dist}] of meta.entries())
    if (dist >= min && dist <= max && commonWords.has(word)) candidates.push({ word, dist });

  if (candidates.length === 0) throw new Error("No candidates from " + startWord);

  const sample = candidates.sort(() => Math.random()-0.5).slice(0,20).map(c=>c.word);
  const r2 = await client.messages.create({
    model: HAIKU, max_tokens: 128,
    system: `Pick the most interesting END word for a puzzle starting at "${startWord}". All candidates verified correct distance. No proper nouns. ONLY JSON: {"word": "WORD"}`,
    messages: [{ role: "user", content: `Start: ${startWord}\nCandidates: ${sample.join(", ")}\nPick best.` }]
  });
  totalCost += HAIKU_IN * r2.usage.input_tokens + HAIKU_OUT * r2.usage.output_tokens;
  const p2 = parseJSON(r2.content.map(b=>b.text||"").join(""));
  const rawChoice = (p2?.word||"").toUpperCase().replace(/[^A-Z]/g,"");
  const verified = candidates.find(c => c.word === rawChoice);
  const endWord = verified ? rawChoice : candidates[Math.floor(Math.random()*Math.min(50,candidates.length))].word;

  const path = reconstructPath(meta, startWord, endWord);
  if (!path) throw new Error("Path reconstruction failed");

  return { startWord, endWord, path, steps: path.length-1, difficulty, totalCost };
}

async function main() {
  const difficulty = getDifficultyForToday();
  const today = new Date().toISOString().slice(0,10);
  console.log("Generating " + difficulty + " puzzle for " + today + "...");

  const wordSet = loadWordSet(path.join(process.cwd(), "wordlist.txt"));
  const commonWords = loadWordSet(path.join(process.cwd(), "common_words.txt"));

  // Fallback puzzle in case generation fails
  const FALLBACKS = {
    easy:   { start:"CAT",  end:"DOG",    path:["CAT","COT","DOT","DOG"],              steps:3 },
    medium: { start:"COLD", end:"WARM",   path:["COLD","CORD","WORD","WARD","WARM"],   steps:4 },
    hard:   { start:"PLANT",end:"PRISON", path:["PLANT","PLAN","PIAN","PION","PRION","PRISON"], steps:5 },
  };

  let result;
  try {
    const gen = await generatePuzzle(difficulty, wordSet, commonWords);
    result = {
      start: gen.startWord,
      end: gen.endWord,
      path: gen.path,
      steps: gen.steps,
      par: gen.steps,
      classification: difficulty,
      date: today,
      generatedAt: new Date().toISOString(),
      cost: gen.totalCost,
      fallback: false
    };
    console.log("Generated: " + result.start + " -> " + result.end + " (" + result.steps + " steps, $" + result.cost.toFixed(5) + ")");
  } catch (e) {
    console.error("Generation failed: " + e.message + " — using fallback");
    const fb = FALLBACKS[difficulty];
    result = { ...fb, par: fb.steps, classification: difficulty, date: today, fallback: true };
  }

  fs.writeFileSync(
    path.join(process.cwd(), "puzzle.json"),
    JSON.stringify(result, null, 2)
  );
  console.log("puzzle.json written.");
}

main().catch(console.error);
