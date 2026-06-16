import { useState, useEffect, useCallback } from "react";
import Head from "next/head";

// ── TUTORIAL PUZZLE (fixed, always CAT → DOG) ─────────────────────────────
const TUTORIAL = {
  steps: [
    {
      title: "Welcome to THREADLE",
      body: "Each day you get a start word and an end word. Your job: connect them by changing one letter at a time.",
      example: { from: "CAT", to: "COT", explanation: "Change A → O" },
      action: null,
    },
    {
      title: "Every step must be a real word",
      body: "You can change a letter, add a letter, or remove a letter. Try it — type COT to make your first move.",
      prompt: "CAT",
      target: "COT",
      action: "type",
    },
    {
      title: "Keep going until you reach the end",
      body: "Now type DOT to get one step closer to DOG.",
      prompt: "COT",
      target: "DOT",
      action: "type",
    },
  ],
  finalStep: {
    title: "You've got it!",
    body: "Type DOG to finish your practice puzzle. In the real game, you're scored against 'par' — the shortest possible path.",
    prompt: "DOT",
    target: "DOG",
    action: "type",
  },
};

function editDist(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 99;
  if (a.length === b.length) {
    let d = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
    return d;
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  for (let skip = 0; skip <= l.length; skip++) {
    if (l.slice(0, skip) + l.slice(skip + 1) === s) return 1;
  }
  return 99;
}

function scoreResult(steps, par) {
  const diff = steps - par;
  if (diff <= -2) return { label: "Eagle", stars: "⭐⭐⭐", emoji: "🦅" };
  if (diff === -1) return { label: "Birdie", stars: "⭐⭐", emoji: "🐦" };
  if (diff === 0) return { label: "Par", stars: "⭐", emoji: "✅" };
  if (diff === 1) return { label: "Bogey", stars: "", emoji: "😅" };
  return { label: "Double Bogey", stars: "", emoji: "😬" };
}

// ── SMART HINT: calls API with current word + optimal path ─────────────────
async function getSmartHint(currentWord, targetWord, optimalPath) {
  try {
    // Find where the player is relative to the optimal path
    const pathIdx = optimalPath.indexOf(currentWord);
    let nextWord = null;

    if (pathIdx !== -1 && pathIdx < optimalPath.length - 1) {
      // Player is on the optimal path — give them the next word
      nextWord = optimalPath[pathIdx + 1];
    } else {
      // Player is off the optimal path — use API to suggest next move
      const res = await fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentWord, targetWord, optimalPath }),
      });
      const data = await res.json();
      nextWord = data.nextWord;
    }

    if (!nextWord) return "Try changing one letter at a time toward " + targetWord;

    // Generate the specific letter-change instruction
    const a = currentWord.toUpperCase();
    const b = nextWord.toUpperCase();

    if (a.length === b.length) {
      // Find which position changed
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
          return `Change the ${a[i]} to ${b[i]} — try "${b}"`;
        }
      }
    } else if (b.length > a.length) {
      // Letter was added
      return `Add a letter to get "${b}"`;
    } else {
      // Letter was removed
      return `Remove a letter to get "${b}"`;
    }

    return `Try "${nextWord}" as your next word`;
  } catch (e) {
    return "Try changing one letter at a time toward " + targetWord;
  }
}

// ── TUTORIAL MODAL ─────────────────────────────────────────────────────────
function TutorialModal({ onComplete }) {
  const [step, setStep] = useState(0);
  const [tutInput, setTutInput] = useState("");
  const [tutChain, setTutChain] = useState(["CAT"]);
  const [tutMsg, setTutMsg] = useState("");
  const [tutDone, setTutDone] = useState(false);

  const allSteps = [...TUTORIAL.steps, TUTORIAL.finalStep];
  const current = allSteps[step];
  const isLastStep = step === allSteps.length - 1;

  function handleTutorialInput() {
    const word = tutInput.trim().toUpperCase();
    setTutInput("");
    if (!current.action || !current.target) return;

    if (word !== current.target) {
      setTutMsg(`Try typing "${current.target}"`);
      return;
    }

    setTutMsg("");
    const newChain = [...tutChain, word];
    setTutChain(newChain);

    if (isLastStep) {
      setTutDone(true);
      setTimeout(onComplete, 1200);
    } else {
      setStep(s => s + 1);
    }
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <div style={styles.modalStep}>{step + 1} / {allSteps.length}</div>
          <div style={styles.modalProgress}>
            {allSteps.map((_, i) => (
              <div key={i} style={{ ...styles.progressDot, ...(i <= step ? styles.progressDotActive : {}) }} />
            ))}
          </div>
        </div>

        <div style={styles.modalTitle}>{current.title}</div>
        <div style={styles.modalBody}>{current.body}</div>

        {/* Show example on first step */}
        {current.example && (
          <div style={styles.exampleRow}>
            <div style={{ ...styles.chainWord, ...styles.wordStart }}>{current.example.from}</div>
            <div style={styles.arrow}>→</div>
            <div style={{ ...styles.chainWord, ...styles.wordValid }}>{current.example.to}</div>
            <div style={styles.exampleNote}>{current.example.explanation}</div>
          </div>
        )}

        {/* Show practice chain */}
        {current.action && (
          <div style={{ marginBottom: 16 }}>
            <div style={styles.chain}>
              {tutChain.map((w, i) => (
                <div key={i}>
                  <div style={styles.chainRow}>
                    <div style={{ ...styles.chainWord, ...(i === 0 ? styles.wordStart : styles.wordValid) }}>{w}</div>
                  </div>
                  <div style={styles.dot} />
                </div>
              ))}
              <div style={styles.chainRow}>
                <div style={{ ...styles.chainWord, opacity: 0.3, fontSize: 13 }}>DOG</div>
                <span style={{ fontSize: 11, color: "#aaa" }}>goal</span>
              </div>
            </div>

            {!tutDone && (
              <div style={styles.inputRow}>
                <input
                  style={styles.input}
                  value={tutInput}
                  onChange={e => setTutInput(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === "Enter" && handleTutorialInput()}
                  placeholder={`Type ${current.target}...`}
                  autoFocus
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                  maxLength={8}
                />
                <button style={styles.btnPrimary} onClick={handleTutorialInput}>Go</button>
              </div>
            )}
            {tutMsg && <div style={{ ...styles.msg, ...styles.msgError }}>{tutMsg}</div>}
            {tutDone && <div style={{ ...styles.msg, ...styles.msgSuccess }}>🎉 You got it!</div>}
          </div>
        )}

        {/* Skip / next buttons */}
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
          <button style={styles.btnSkip} onClick={onComplete}>Skip tutorial</button>
          {!current.action && (
            <button style={styles.btnPrimary} onClick={() => setStep(s => s + 1)}>
              {step === 0 ? "Let's try it →" : "Next →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MAIN GAME ──────────────────────────────────────────────────────────────
export default function Home() {
  const [puzzle, setPuzzle] = useState(null);
  const [wordSet, setWordSet] = useState(null);
  const [chain, setChain] = useState([]);
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState({ text: "", type: "" });
  const [done, setDone] = useState(false);
  const [hintsLeft, setHintsLeft] = useState(2);
  const [hintLoading, setHintLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/puzzle?v=" + Date.now()).then(r => r.json()),
      fetch("/common_words.txt").then(r => r.text())
    ]).then(([puzzleData, wordText]) => {
      setPuzzle(puzzleData);
      const words = new Set(
        wordText.split("\n").map(w => w.trim().toUpperCase()).filter(Boolean)
      );
      // Also add all words in the puzzle path so they're always valid
      if (puzzleData.path) puzzleData.path.forEach(w => words.add(w.toUpperCase()));
      setWordSet(words);
      setLoading(false);

      // Check if first visit
      const seen = localStorage.getItem("threadle_seen");
      if (!seen) setShowTutorial(true);
    });
  }, []);

  function completeTutorial() {
    localStorage.setItem("threadle_seen", "1");
    setShowTutorial(false);
  }

  function submit() {
    if (done || !puzzle || !wordSet) return;
    const word = input.trim().toUpperCase();
    setInput("");
    if (!word) return;
    const prev = chain.length > 0 ? chain[chain.length - 1] : puzzle.start;
    if (!wordSet.has(word)) { setMsg({ text: `"${word}" isn't a valid word`, type: "e" }); return; }
    if (word === prev) { setMsg({ text: "Same as previous word", type: "e" }); return; }
    if (chain.includes(word) || word === puzzle.start) { setMsg({ text: "Already used that word", type: "e" }); return; }
    if (editDist(prev, word) !== 1) { setMsg({ text: `"${word}" is more than one step from "${prev}"`, type: "e" }); return; }
    setMsg({ text: "", type: "" });
    const newChain = [...chain, word];
    setChain(newChain);
    if (word === puzzle.end) setTimeout(() => setDone(true), 300);
  }

  function undo() {
    if (chain.length === 0 || done) return;
    setChain(chain.slice(0, -1));
    setMsg({ text: "", type: "" });
  }

  async function hint() {
    if (hintsLeft <= 0) { setMsg({ text: "No hints left", type: "e" }); return; }
    if (hintLoading) return;
    setHintLoading(true);
    const currentWord = chain.length > 0 ? chain[chain.length - 1] : puzzle.start;
    const hintText = await getSmartHint(currentWord, puzzle.end, puzzle.path);
    setHintsLeft(h => h - 1);
    setMsg({ text: hintText, type: "i" });
    setHintLoading(false);
  }

  function buildShareText() {
    const steps = chain.length;
    const par = puzzle.par || puzzle.steps;
    const score = scoreResult(steps, par);
    const squares = chain.map(() => "🟦").join("");
    const diff = steps - par;
    return `THREADLE — ${score.label}\n${puzzle.start} → ${puzzle.end}\n${squares}\n${steps} steps · par ${par} · ${diff > 0 ? "+" : ""}${diff === 0 ? "0 (even)" : diff}\nthreadle-web.vercel.app`;
  }

  function copyShare() {
    navigator.clipboard.writeText(buildShareText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) return (
    <div style={styles.center}>
      <div style={styles.logo}>THREADLE</div>
      <div style={{ color: "#888", fontSize: 14 }}>Loading today's puzzle...</div>
    </div>
  );

  if (!puzzle) return (
    <div style={styles.center}>
      <div style={styles.logo}>THREADLE</div>
      <div style={{ color: "#c00", fontSize: 14 }}>Failed to load puzzle. Try refreshing.</div>
    </div>
  );

  const steps = chain.length;
  const par = puzzle.par || puzzle.steps;
  const score = done ? scoreResult(steps, par) : null;
  const allWords = [puzzle.start, ...chain];

  return (
    <>
      <Head>
        <title>THREADLE — Daily Word Chain</title>
        <meta name="description" content="Connect the words, one letter at a time." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {showTutorial && <TutorialModal onComplete={completeTutorial} />}

      <div style={styles.page}>
        <div style={styles.container}>

          <div style={styles.header}>
            <div style={styles.logo}>THREADLE</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
              <div style={styles.sub}>Daily word chain · {puzzle.date}</div>
              <button style={styles.btnHow} onClick={() => setShowTutorial(true)}>How to play</button>
            </div>
          </div>

          <div style={styles.ends}>
            <div style={styles.pill}>{puzzle.start}</div>
            <div style={styles.arrow}>→</div>
            <div style={styles.pill}>{puzzle.end}</div>
          </div>

          <div style={styles.stats}>
            <div style={styles.stat}><div style={styles.statVal}>{steps}</div><div style={styles.statLabel}>steps</div></div>
            <div style={styles.stat}><div style={styles.statVal}>{par}</div><div style={styles.statLabel}>par</div></div>
            <div style={styles.stat}><div style={styles.statVal}>🔥 1</div><div style={styles.statLabel}>streak</div></div>
          </div>

          <div style={styles.chain}>
            {allWords.map((w, i) => (
              <div key={i}>
                <div style={styles.chainRow}>
                  <div style={{
                    ...styles.chainWord,
                    ...(i === 0 ? styles.wordStart : {}),
                    ...(w === puzzle.end ? styles.wordEnd : {}),
                    ...(i > 0 && w !== puzzle.end ? styles.wordValid : {}),
                  }}>{w}</div>
                  {i > 0 && w !== puzzle.end && <span style={styles.stepBadge}>step {i}</span>}
                  {w === puzzle.end && <span style={styles.stepBadge}>🎉 done!</span>}
                </div>
                {(i < allWords.length - 1 || !done) && <div style={styles.dot} />}
              </div>
            ))}
            {!done && (
              <>
                <div style={styles.dot} />
                <div style={styles.chainRow}>
                  <div style={{ ...styles.chainWord, opacity: 0.3, fontSize: 13 }}>{puzzle.end}</div>
                  <span style={{ fontSize: 11, color: "#aaa" }}>goal</span>
                </div>
              </>
            )}
          </div>

          {msg.text && (
            <div style={{ ...styles.msg, ...(msg.type === "e" ? styles.msgError : msg.type === "i" ? styles.msgInfo : styles.msgSuccess) }}>
              {msg.text}
            </div>
          )}

          {!done && (
            <div>
              <div style={styles.inputRow}>
                <input
                  style={styles.input}
                  value={input}
                  onChange={e => setInput(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === "Enter" && submit()}
                  placeholder="Next word..."
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                  maxLength={12}
                />
                <button style={styles.btnPrimary} onClick={submit}>Add</button>
              </div>
              <div style={styles.actions}>
                <button style={styles.btnSecondary} onClick={undo}>↩ Undo</button>
                <button style={{ ...styles.btnSecondary, opacity: hintLoading ? 0.6 : 1 }} onClick={hint}>
                  {hintLoading ? "..." : `💡 Hint (${hintsLeft} left)`}
                </button>
              </div>
            </div>
          )}

          {done && score && (
            <div style={styles.complete}>
              <div style={{ fontSize: 32, marginBottom: 6 }}>{score.emoji}</div>
              <div style={styles.scoreLabel}>{score.label}</div>
              <div style={styles.scoreDetail}>{steps} steps · par {par} · {steps - par > 0 ? "+" : ""}{steps - par === 0 ? "even" : steps - par}</div>
              <div style={styles.shareBox}>{buildShareText()}</div>
              <div style={styles.copied}>{copied ? "Copied!" : ""}</div>
              <button style={{ ...styles.btnPrimary, width: "100%", marginTop: 8 }} onClick={copyShare}>
                Copy result ↗
              </button>
            </div>
          )}

          <div style={styles.parNote}>Par is {par} steps — can you match or beat it?</div>
        </div>
      </div>
    </>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#fafafa", display: "flex", justifyContent: "center", padding: "20px 16px" },
  container: { width: "100%", maxWidth: 480, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  center: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 },
  header: { textAlign: "center", marginBottom: 20 },
  logo: { fontSize: 26, fontWeight: 500, letterSpacing: 5, color: "#1a1a2e" },
  sub: { fontSize: 12, color: "#888", marginTop: 4 },
  ends: { display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 16 },
  pill: { background: "#f0f0f0", border: "1px solid #ddd", borderRadius: 8, padding: "9px 18px", fontSize: 17, fontWeight: 500, letterSpacing: 4, color: "#1a1a2e" },
  arrow: { color: "#aaa", fontSize: 18 },
  stats: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16 },
  stat: { background: "#f5f5f5", borderRadius: 8, padding: "8px", textAlign: "center" },
  statVal: { fontSize: 20, fontWeight: 500, color: "#1a1a2e" },
  statLabel: { fontSize: 11, color: "#888" },
  chain: { display: "flex", flexDirection: "column", marginBottom: 12 },
  chainRow: { display: "flex", alignItems: "center", gap: 10, padding: "3px 0" },
  chainWord: { fontSize: 16, fontWeight: 500, letterSpacing: 3, padding: "8px 14px", borderRadius: 8, border: "1px solid #e0e0e0", background: "#fff", color: "#1a1a2e", minWidth: 80, textAlign: "center" },
  wordStart: { borderColor: "#378ADD", background: "#E6F1FB", color: "#0C447C" },
  wordValid: { borderColor: "#1D9E75", background: "#E1F5EE", color: "#085041" },
  wordEnd: { borderColor: "#639922", background: "#EAF3DE", color: "#27500A" },
  dot: { width: 5, height: 5, borderRadius: "50%", background: "#ddd", margin: "2px 0 2px 21px" },
  stepBadge: { fontSize: 11, color: "#1D9E75" },
  msg: { padding: "10px 14px", borderRadius: 8, marginBottom: 10, fontSize: 13, textAlign: "center" },
  msgError: { background: "#FCEBEB", color: "#791F1F" },
  msgInfo: { background: "#E6F1FB", color: "#0C447C" },
  msgSuccess: { background: "#E1F5EE", color: "#085041" },
  inputRow: { display: "flex", gap: 8, marginBottom: 8 },
  input: { flex: 1, fontSize: 15, letterSpacing: 3, fontWeight: 500, padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8, outline: "none", textTransform: "uppercase" },
  btnPrimary: { padding: "10px 20px", fontSize: 14, fontWeight: 500, background: "#378ADD", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" },
  btnSecondary: { flex: 1, padding: "8px", fontSize: 12, background: "#f5f5f5", color: "#555", border: "1px solid #e0e0e0", borderRadius: 8, cursor: "pointer" },
  btnSkip: { padding: "8px 16px", fontSize: 12, background: "transparent", color: "#aaa", border: "1px solid #e0e0e0", borderRadius: 8, cursor: "pointer" },
  btnHow: { fontSize: 11, padding: "3px 8px", background: "transparent", border: "1px solid #ddd", borderRadius: 20, color: "#aaa", cursor: "pointer" },
  actions: { display: "flex", gap: 8, marginBottom: 12 },
  complete: { background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: 12, padding: "1.5rem", textAlign: "center", marginBottom: 12 },
  scoreLabel: { fontSize: 18, fontWeight: 500, color: "#1a1a2e" },
  scoreDetail: { fontSize: 13, color: "#888", margin: "4px 0 12px" },
  shareBox: { fontFamily: "monospace", fontSize: 12, background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8, padding: 10, whiteSpace: "pre", lineHeight: 1.9, textAlign: "left", color: "#1a1a2e", marginBottom: 8 },
  copied: { fontSize: 11, color: "#1D9E75", height: 16, marginBottom: 4 },
  parNote: { textAlign: "center", fontSize: 12, color: "#aaa", marginTop: 8 },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, padding: "1.5rem", maxWidth: 400, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" },
  modalHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  modalStep: { fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: 1 },
  modalProgress: { display: "flex", gap: 4 },
  progressDot: { width: 6, height: 6, borderRadius: "50%", background: "#e0e0e0" },
  progressDotActive: { background: "#378ADD" },
  modalTitle: { fontSize: 18, fontWeight: 500, color: "#1a1a2e", marginBottom: 8 },
  modalBody: { fontSize: 14, color: "#555", lineHeight: 1.6, marginBottom: 16 },
  exampleRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16, padding: "12px", background: "#f5f5f5", borderRadius: 8 },
  exampleNote: { fontSize: 12, color: "#888" },
};
