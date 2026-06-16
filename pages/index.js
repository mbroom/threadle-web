import { useState, useEffect } from "react";
import Head from "next/head";

const VALID_MOVES_MSG = {
  notWord: (w) => `"${w}" isn't a valid word`,
  tooFar: (w, prev) => `"${w}" is more than one step from "${prev}"`,
  alreadyUsed: "Already used that word",
  sameWord: "Same as previous word",
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

export default function Home() {
  const [puzzle, setPuzzle] = useState(null);
  const [wordSet, setWordSet] = useState(null);
  const [chain, setChain] = useState([]);
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState({ text: "", type: "" });
  const [done, setDone] = useState(false);
  const [hintsLeft, setHintsLeft] = useState(2);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load puzzle and word list in parallel
    Promise.all([
fetch("/api/puzzle?v=" + Date.now()).then(r => r.json()),      fetch("/common_words.txt").then(r => r.text())
    ]).then(([puzzleData, wordText]) => {
      setPuzzle(puzzleData);
      const words = new Set(
        wordText.split("\n").map(w => w.trim().toUpperCase()).filter(Boolean)
      );
      setWordSet(words);
      setLoading(false);
    });
  }, []);

  function submit() {
    if (done || !puzzle || !wordSet) return;
    const word = input.trim().toUpperCase();
    setInput("");
    if (!word) return;
    const prev = chain.length > 0 ? chain[chain.length - 1] : puzzle.start;
    if (!wordSet.has(word)) { setMsg({ text: VALID_MOVES_MSG.notWord(word), type: "e" }); return; }
    if (word === prev) { setMsg({ text: VALID_MOVES_MSG.sameWord, type: "e" }); return; }
    if (chain.includes(word) || word === puzzle.start) { setMsg({ text: VALID_MOVES_MSG.alreadyUsed, type: "e" }); return; }
    if (editDist(prev, word) !== 1) { setMsg({ text: VALID_MOVES_MSG.tooFar(word, prev), type: "e" }); return; }
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

  function hint() {
    if (hintsLeft <= 0) { setMsg({ text: "No hints left", type: "e" }); return; }
    setHintsLeft(h => h - 1);
    const currentWord = chain.length > 0 ? chain[chain.length - 1] : puzzle.start;
    setMsg({ text: `You're at "${currentWord}" — try changing one letter at a time toward "${puzzle.end}"`, type: "i" });
  }

  function buildShareText() {
    const steps = chain.length;
    const par = puzzle.par || puzzle.steps;
    const score = scoreResult(steps, par);
    const squares = chain.map(() => "🟦").join("");
    const diff = steps - par;
    const sign = diff > 0 ? "+" : "";
    return `THREADLE — ${score.label}\n${puzzle.start} → ${puzzle.end}\n${squares}\n${steps} steps · par ${par} · ${sign}${diff === 0 ? "0 (even)" : diff}\nthreadle.vercel.app`;
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
  const currentWord = chain.length > 0 ? chain[chain.length - 1] : puzzle.start;
  const allWords = [puzzle.start, ...chain];

  return (
    <>
      <Head>
        <title>THREADLE — Daily Word Chain</title>
        <meta name="description" content="Connect the words, one letter at a time." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={styles.page}>
        <div style={styles.container}>

          {/* Header */}
          <div style={styles.header}>
            <div style={styles.logo}>THREADLE</div>
            <div style={styles.sub}>Daily word chain · {puzzle.date}</div>
          </div>

          {/* Puzzle ends */}
          <div style={styles.ends}>
            <div style={styles.pill}>{puzzle.start}</div>
            <div style={styles.arrow}>→</div>
            <div style={styles.pill}>{puzzle.end}</div>
          </div>

          {/* Stats */}
          <div style={styles.stats}>
            <div style={styles.stat}><div style={styles.statVal}>{steps}</div><div style={styles.statLabel}>steps</div></div>
            <div style={styles.stat}><div style={styles.statVal}>{par}</div><div style={styles.statLabel}>par</div></div>
            <div style={styles.stat}><div style={styles.statVal}>🔥 1</div><div style={styles.statLabel}>streak</div></div>
          </div>

          {/* Chain */}
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

          {/* Message */}
          {msg.text && (
            <div style={{ ...styles.msg, ...(msg.type === "e" ? styles.msgError : msg.type === "i" ? styles.msgInfo : styles.msgSuccess) }}>
              {msg.text}
            </div>
          )}

          {/* Input */}
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
                <button style={styles.btnSecondary} onClick={hint}>💡 Hint ({hintsLeft} left)</button>
              </div>
            </div>
          )}

          {/* Complete */}
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
  actions: { display: "flex", gap: 8, marginBottom: 12 },
  complete: { background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: 12, padding: "1.5rem", textAlign: "center", marginBottom: 12 },
  scoreLabel: { fontSize: 18, fontWeight: 500, color: "#1a1a2e" },
  scoreDetail: { fontSize: 13, color: "#888", margin: "4px 0 12px" },
  shareBox: { fontFamily: "monospace", fontSize: 12, background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8, padding: 10, whiteSpace: "pre", lineHeight: 1.9, textAlign: "left", color: "#1a1a2e", marginBottom: 8 },
  copied: { fontSize: 11, color: "#1D9E75", height: 16, marginBottom: 4 },
  parNote: { textAlign: "center", fontSize: 12, color: "#aaa", marginTop: 8 },
};
