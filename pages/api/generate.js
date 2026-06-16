import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const HAIKU = "claude-haiku-4-5";
const HAIKU_IN = 0.8 / 1e6, HAIKU_OUT = 4.0 / 1e6;

const HARD_START_WORDS = [
  "PLANT","STONE","LIGHT","HEART","FRAME","CRANE","SWORD","BREAD",
  "FLAME","STORM","GRACE","PROUD","BLOOM","FLESH","GRIND","CLASH",
  "PLACE","GRAND","BLAST","CLEAR","PRESS","TRICK","TRACK","PRICE"
];

const RANGES = { easy: [3,4], medium: [5,7], hard: [8,12] };

const FALLBACKS = {
  easy:   { start:"CAT",   end:"DOG",    path:["CAT","COT","DOT","DOG"],                          steps:3 },
  medium: { start:"COLD",  end:"WARM",   path:["COLD","CORD","WORD","WARD","WARM"],                steps:4 },
  hard:   { start:"PLANT", end:"PRISON", path:["PLANT","PLAN","PIAN","PION","PRION","PRISON"],     steps:5 },
};

function getDifficulty() {
  const day = new Date().getDay();
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

async function callHaiku(system, user) {
  const res = await client.messages.create({
    model: HAIKU, max_tokens: 128, system,
    messages: [{ role: "user", content: user }]
  });
  const text = res.content.map(b => b.text || "").join("");
  const cost = HAIKU_IN * res.usage.input_tokens + HAIKU_OUT * res.usage.output_tokens;
  return { text, cost };
}

async function generatePuzzle(difficulty, wordSet, commonWords) {
  const [min, max] = RANGES[difficulty];
  let totalCost = 0;
  let startWord;

  if (difficulty === "hard") {
    startWord = HARD_START_WORDS[Math.floor(Math.random() * HARD_START_WORDS.length)];
  } else {
    const r1 = await callHaiku(
      `Pick a common English word, 3-6 letters, for a word puzzle. Vary choices.\nONLY JSON: {"word": "WORD"}`,
      `Pick a start word for a ${difficulty} puzzle.`
    );
    totalCost += r1.cost;
    const p1 = parseJSON(r1.text);
    const candidate = (p1?.word||"").toUpperCase().replace(/[^A-Z]/g,"");
    startWord = commonWords.has(candidate) ? candidate : "PLANT";
  }

  const meta = bfsOutward(startWord, wordSet, max);
  const candidates = [];
  for (const [word, {dist}] of meta.entries())
    if (dist >= min && dist <= max && commonWords.has(word)) candidates.push({ word, dist });

  if (candidates.length === 0) throw new Error("No candidates from " + startWord);

  const sample = candidates.sort(() => Math.random()-0.5).slice(0,20).map(c => c.word);
  const r2 = await callHaiku(
    `Pick the most interesting END word for a puzzle starting at "${startWord}". All candidates verified correct distance. No proper nouns.\nONLY JSON: {"word": "WORD"}`,
    `Start: ${startWord}\nCandidates: ${sample.join(", ")}\nPick best.`
  );
  totalCost += r2.cost;
  const p2 = parseJSON(r2.text);
  const rawChoice = (p2?.word||"").toUpperCase().replace(/[^A-Z]/g,"");
  const verified = candidates.find(c => c.word === rawChoice);
  const endWord = verified ? rawChoice : candidates[Math.floor(Math.random()*Math.min(50,candidates.length))].word;

  const path = reconstructPath(meta, startWord, endWord);
  if (!path) throw new Error("Path reconstruction failed");

  return { start: startWord, end: endWord, path, steps: path.length-1, totalCost };
}

// ── Next.js API route handler ─────────────────────────────────────────────
// Called by Vercel cron at 7am UTC daily (midnight PT)
// Also callable manually: GET /api/generate?secret=YOUR_SECRET
export default async function handler(req, res) {
  // Basic auth — prevent public from triggering regeneration
  const secret = process.env.CRON_SECRET || "threadle-cron";
  const provided = req.headers["authorization"] || req.query.secret;
  if (provided !== secret && provided !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const difficulty = getDifficulty();
  const today = new Date().toISOString().slice(0,10);

  try {
    const cwd = process.cwd();
    const wordSet = loadWordSet(path.join(cwd, "public", "wordlist.txt"));
    const commonWords = loadWordSet(path.join(cwd, "public", "common_words.txt"));

    const gen = await generatePuzzle(difficulty, wordSet, commonWords);

    const puzzle = {
      start: gen.start,
      end: gen.end,
      path: gen.path,
      steps: gen.steps,
      par: gen.steps,
      classification: difficulty,
      date: today,
      generatedAt: new Date().toISOString(),
      cost: gen.totalCost,
      fallback: false
    };

    // Write puzzle.json — this is what /api/puzzle serves to players
    fs.writeFileSync(path.join(cwd, "puzzle.json"), JSON.stringify(puzzle, null, 2));

    console.log("Generated: " + puzzle.start + " -> " + puzzle.end + " (" + puzzle.steps + " steps)");
    return res.status(200).json({ ok: true, puzzle });

  } catch (e) {
    // On failure write fallback — players never see an error
    console.error("Generation failed: " + e.message);
    const fb = FALLBACKS[difficulty];
    const fallback = { ...fb, par: fb.steps, classification: difficulty, date: today, fallback: true };
    fs.writeFileSync(
      path.join(process.cwd(), "puzzle.json"),
      JSON.stringify(fallback, null, 2)
    );
    return res.status(200).json({ ok: true, fallback: true, puzzle: fallback });
  }
}
