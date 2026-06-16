import { useState, useEffect } from "react";
import Head from "next/head";

const TUTORIAL = {
  steps: [
    { title:"Welcome to THREADLE", body:"Each day you get a start word and an end word. Connect them by changing one letter at a time.", example:{ from:"CAT", to:"COT", explanation:"Change A → O" }, action:null },
    { title:"Every step must be a real word", body:"You can change, add, or remove one letter. Try it — type COT to make your first move.", prompt:"CAT", target:"COT", action:"type" },
    { title:"Keep going until you reach the end", body:"Now type DOT to get one step closer to DOG.", prompt:"COT", target:"DOT", action:"type" },
  ],
  finalStep:{ title:"You've got it!", body:"Type DOG to finish your practice puzzle. You'll be scored against 'par' — the shortest possible path.", prompt:"DOT", target:"DOG", action:"type" },
};

function editDist(a,b) {
  if (Math.abs(a.length-b.length)>1) return 99;
  if (a.length===b.length) { let d=0; for(let i=0;i<a.length;i++) if(a[i]!==b[i]) d++; return d; }
  const[s,l]=a.length<b.length?[a,b]:[b,a];
  for(let skip=0;skip<=l.length;skip++) if(l.slice(0,skip)+l.slice(skip+1)===s) return 1;
  return 99;
}

function scoreResult(steps,par) {
  const d=steps-par;
  if(d<=-2) return{label:"Eagle",emoji:"🦅"};
  if(d===-1) return{label:"Birdie",emoji:"🐦"};
  if(d===0) return{label:"Par",emoji:"✅"};
  if(d===1) return{label:"Bogey",emoji:"😅"};
  return{label:"Double Bogey",emoji:"😬"};
}

async function getSmartHint(currentWord, targetWord, optimalPath) {
  try {
    const pathIdx = optimalPath.indexOf(currentWord);
    let nextWord = null;
    if (pathIdx !== -1 && pathIdx < optimalPath.length-1) {
      nextWord = optimalPath[pathIdx+1];
    } else {
      const res = await fetch("/api/hint", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({currentWord, targetWord, optimalPath})
      });
      const data = await res.json();
      nextWord = data.nextWord;
    }
    if (!nextWord) return "Try changing one letter at a time toward " + targetWord;
    const a=currentWord.toUpperCase(), b=nextWord.toUpperCase();
    if(a.length===b.length) {
      for(let i=0;i<a.length;i++) if(a[i]!==b[i]) return `Change the ${a[i]} to ${b[i]} — try "${b}"`;
    } else if(b.length>a.length) { return `Add a letter to get "${b}"`; }
    else { return `Remove a letter to get "${b}"`; }
    return `Try "${nextWord}" next`;
  } catch(e) { return "Try changing one letter at a time toward " + targetWord; }
}

function TutorialModal({onComplete}) {
  const [step,setStep]=useState(0);
  const [tutInput,setTutInput]=useState("");
  const [tutChain,setTutChain]=useState(["CAT"]);
  const [tutMsg,setTutMsg]=useState("");
  const [tutDone,setTutDone]=useState(false);
  const allSteps=[...TUTORIAL.steps,TUTORIAL.finalStep];
  const current=allSteps[step];
  const isLast=step===allSteps.length-1;

  function handleTutInput() {
    const word=tutInput.trim().toUpperCase(); setTutInput("");
    if(!current.action||!current.target) return;
    if(word!==current.target){setTutMsg(`Try typing "${current.target}"`);return;}
    setTutMsg("");
    setTutChain(c=>[...c,word]);
    if(isLast){setTutDone(true);setTimeout(onComplete,1200);}
    else setStep(s=>s+1);
  }

  return(
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.modalHeader}>
          <div style={S.modalStep}>{step+1} / {allSteps.length}</div>
          <div style={{display:"flex",gap:4}}>{allSteps.map((_,i)=><div key={i} style={{...S.pdot,...(i<=step?S.pdotOn:{})}}/>)}</div>
        </div>
        <div style={S.modalTitle}>{current.title}</div>
        <div style={S.modalBody}>{current.body}</div>
        {current.example&&<div style={S.exRow}><div style={{...S.cw,...S.wS}}>{current.example.from}</div><div style={S.arr}>→</div><div style={{...S.cw,...S.wV}}>{current.example.to}</div><div style={{fontSize:12,color:"#888"}}>{current.example.explanation}</div></div>}
        {current.action&&(
          <div style={{marginBottom:16}}>
            <div style={S.chain}>
              {tutChain.map((w,i)=><div key={i}><div style={S.chainRow}><div style={{...S.cw,...(i===0?S.wS:S.wV)}}>{w}</div></div><div style={S.dot}/></div>)}
              <div style={S.chainRow}><div style={{...S.cw,opacity:.3,fontSize:13}}>DOG</div><span style={{fontSize:11,color:"#aaa"}}>goal</span></div>
            </div>
            {!tutDone&&<div style={S.inputRow}><input style={S.input} value={tutInput} onChange={e=>setTutInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&handleTutInput()} placeholder={`Type ${current.target}...`} autoFocus autoComplete="off" autoCorrect="off" spellCheck="false" maxLength={8}/><button style={S.btnP} onClick={handleTutInput}>Go</button></div>}
            {tutMsg&&<div style={{...S.msg,...S.msgE}}>{tutMsg}</div>}
            {tutDone&&<div style={{...S.msg,...S.msgS}}>🎉 You got it!</div>}
          </div>
        )}
        <div style={{display:"flex",gap:8,justifyContent:"space-between"}}>
          <button style={S.btnSkip} onClick={onComplete}>Skip tutorial</button>
          {!current.action&&<button style={S.btnP} onClick={()=>setStep(s=>s+1)}>{step===0?"Let's try it →":"Next →"}</button>}
        </div>
      </div>
    </div>
  );
}

function DifficultyBadge({diff}) {
  const colors={easy:{bg:"#EAF3DE",color:"#27500A"},medium:{bg:"#FFF3CD",color:"#856404"},hard:{bg:"#FCEBEB",color:"#791F1F"}};
  const c=colors[diff]||colors.medium;
  return <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:c.bg,color:c.color,fontWeight:500}}>{diff}</span>;
}

export default function Home() {
  const [mode,setMode]=useState("daily"); // "daily" | "practice"
  const [puzzle,setPuzzle]=useState(null);
  const [wordSet,setWordSet]=useState(null);
  const [chain,setChain]=useState([]);
  const [input,setInput]=useState("");
  const [msg,setMsg]=useState({text:"",type:""});
  const [done,setDone]=useState(false);
  const [hintsLeft,setHintsLeft]=useState(2);
  const [hintLoading,setHintLoading]=useState(false);
  const [copied,setCopied]=useState(false);
  const [loading,setLoading]=useState(true);
  const [showTutorial,setShowTutorial]=useState(false);
  const [practiceLoading,setPracticeLoading]=useState(false);
  const [selectedDiff,setSelectedDiff]=useState("medium");

  // Load word list once
  useEffect(()=>{
    fetch("/common_words.txt").then(r=>r.text()).then(text=>{
      const words=new Set(text.split("\n").map(w=>w.trim().toUpperCase()).filter(Boolean));
      setWordSet(words);
    });
    const seen=localStorage.getItem("threadle_seen");
    if(!seen) setShowTutorial(true);
  },[]);

  // Load daily puzzle on mount
  useEffect(()=>{ loadDailyPuzzle(); },[]);

  function loadDailyPuzzle() {
    setLoading(true);
    fetch("/api/puzzle?v="+Date.now()).then(r=>r.json()).then(data=>{
      setPuzzle(data);
      if(wordSet&&data.path) data.path.forEach(w=>wordSet.add(w.toUpperCase()));
      setLoading(false);
      resetGame();
    });
  }

  async function loadPracticePuzzle(difficulty) {
    setPracticeLoading(true);
    setMode("practice");
    const data=await fetch(`/api/practice?difficulty=${difficulty}`).then(r=>r.json());
    setPuzzle(data);
    if(wordSet&&data.path) data.path.forEach(w=>wordSet.add(w.toUpperCase()));
    setPracticeLoading(false);
    resetGame();
  }

  function resetGame() {
    setChain([]);
    setInput("");
    setMsg({text:"",type:""});
    setDone(false);
    setHintsLeft(2);
    setCopied(false);
  }

  function completeTutorial(){localStorage.setItem("threadle_seen","1");setShowTutorial(false);}

  function submit() {
    if(done||!puzzle||!wordSet) return;
    const word=input.trim().toUpperCase(); setInput("");
    if(!word) return;
    const prev=chain.length>0?chain[chain.length-1]:puzzle.start;
    if(!wordSet.has(word)){setMsg({text:`"${word}" isn't a valid word`,type:"e"});return;}
    if(word===prev){setMsg({text:"Same as previous word",type:"e"});return;}
    if(chain.includes(word)||word===puzzle.start){setMsg({text:"Already used that word",type:"e"});return;}
    if(editDist(prev,word)!==1){setMsg({text:`"${word}" is more than one step from "${prev}"`,type:"e"});return;}
    setMsg({text:"",type:""});
    const newChain=[...chain,word];
    setChain(newChain);
    if(word===puzzle.end) setTimeout(()=>setDone(true),300);
  }

  function undo(){if(chain.length===0||done)return;setChain(chain.slice(0,-1));setMsg({text:"",type:""});}

  async function hint() {
    if(hintsLeft<=0){setMsg({text:"No hints left",type:"e"});return;}
    if(hintLoading)return;
    setHintLoading(true);
    const currentWord=chain.length>0?chain[chain.length-1]:puzzle.start;
    const hintText=await getSmartHint(currentWord,puzzle.end,puzzle.path);
    setHintsLeft(h=>h-1);
    setMsg({text:hintText,type:"i"});
    setHintLoading(false);
  }

  function buildShareText() {
    const steps=chain.length,par=puzzle.par||puzzle.steps;
    const score=scoreResult(steps,par);
    const diff=steps-par;
    return `THREADLE — ${score.label} ${score.emoji}\n${puzzle.start} → ${puzzle.end}\n${"🟦".repeat(steps)}\n${steps} steps · par ${par} · ${diff>0?"+":""}${diff===0?"even":diff}\nthreadle-web.vercel.app`;
  }

  function copyShare(){navigator.clipboard.writeText(buildShareText()).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});}

  if(loading||practiceLoading) return(
    <div style={S.center}><div style={S.logo}>THREADLE</div><div style={{color:"#888",fontSize:14}}>{practiceLoading?"Generating puzzle...":"Loading today's puzzle..."}</div></div>
  );

  if(!puzzle) return(
    <div style={S.center}><div style={S.logo}>THREADLE</div><div style={{color:"#c00",fontSize:14}}>Failed to load. Try refreshing.</div></div>
  );

  const steps=chain.length,par=puzzle.par||puzzle.steps;
  const score=done?scoreResult(steps,par):null;
  const allWords=[puzzle.start,...chain];

  return(
    <>
      <Head><title>THREADLE — Daily Word Chain</title><meta name="viewport" content="width=device-width, initial-scale=1"/></Head>
      {showTutorial&&<TutorialModal onComplete={completeTutorial}/>}

      <div style={S.page}>
        <div style={S.container}>

          {/* Header */}
          <div style={S.header}>
            <div style={S.logo}>THREADLE</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginTop:4}}>
              <div style={S.sub}>{mode==="daily"?"Daily puzzle · "+puzzle.date:"Practice mode"}</div>
              {puzzle.classification&&<DifficultyBadge diff={puzzle.classification}/>}
              <button style={S.btnHow} onClick={()=>setShowTutorial(true)}>How to play</button>
            </div>
          </div>

          {/* Mode tabs */}
          <div style={S.modeTabs}>
            <button style={{...S.modeTab,...(mode==="daily"?S.modeTabOn:{})}} onClick={()=>{setMode("daily");loadDailyPuzzle();}}>📅 Daily</button>
            <button style={{...S.modeTab,...(mode==="practice"?S.modeTabOn:{})}} onClick={()=>setMode("practice")}>🎯 Practice</button>
          </div>

          {/* Practice difficulty selector */}
          {mode==="practice"&&(
            <div style={S.practicePanel}>
              <div style={{fontSize:13,color:"#555",marginBottom:10,fontWeight:500}}>Choose difficulty and play a new puzzle</div>
              <div style={{display:"flex",gap:8,marginBottom:12}}>
                {["easy","medium","hard"].map(d=>(
                  <button key={d} style={{...S.diffBtn,...(selectedDiff===d?S.diffBtnOn:{})}} onClick={()=>setSelectedDiff(d)}>{d}</button>
                ))}
              </div>
              <button style={{...S.btnP,width:"100%"}} onClick={()=>loadPracticePuzzle(selectedDiff)}>
                Generate {selectedDiff} puzzle →
              </button>
            </div>
          )}

          {/* Puzzle */}
          <div style={S.ends}>
            <div style={S.pill}>{puzzle.start}</div>
            <div style={S.arr}>→</div>
            <div style={S.pill}>{puzzle.end}</div>
          </div>

          <div style={S.stats}>
            <div style={S.stat}><div style={S.statV}>{steps}</div><div style={S.statL}>steps</div></div>
            <div style={S.stat}><div style={S.statV}>{par}</div><div style={S.statL}>par</div></div>
            <div style={S.stat}><div style={S.statV}>🔥 1</div><div style={S.statL}>streak</div></div>
          </div>

          <div style={S.chain}>
            {allWords.map((w,i)=>(
              <div key={i}>
                <div style={S.chainRow}>
                  <div style={{...S.cw,...(i===0?S.wS:{}),...(w===puzzle.end?S.wE:{}),...(i>0&&w!==puzzle.end?S.wV:{})}}>{w}</div>
                  {i>0&&w!==puzzle.end&&<span style={S.badge}>step {i}</span>}
                  {w===puzzle.end&&<span style={S.badge}>🎉 done!</span>}
                </div>
                {(i<allWords.length-1||!done)&&<div style={S.dot}/>}
              </div>
            ))}
            {!done&&<><div style={S.dot}/><div style={S.chainRow}><div style={{...S.cw,opacity:.3,fontSize:13}}>{puzzle.end}</div><span style={{fontSize:11,color:"#aaa"}}>goal</span></div></>}
          </div>

          {msg.text&&<div style={{...S.msg,...(msg.type==="e"?S.msgE:msg.type==="i"?S.msgI:S.msgS)}}>{msg.text}</div>}

          {!done&&(
            <div>
              <div style={S.inputRow}>
                <input style={S.input} value={input} onChange={e=>setInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="Next word..." autoComplete="off" autoCorrect="off" spellCheck="false" maxLength={12}/>
                <button style={S.btnP} onClick={submit}>Add</button>
              </div>
              <div style={S.actions}>
                <button style={S.btnSec} onClick={undo}>↩ Undo</button>
                <button style={{...S.btnSec,opacity:hintLoading?.6:1}} onClick={hint}>{hintLoading?"...": `💡 Hint (${hintsLeft} left)`}</button>
              </div>
            </div>
          )}

          {done&&score&&(
            <div style={S.complete}>
              <div style={{fontSize:32,marginBottom:6}}>{score.emoji}</div>
              <div style={S.scoreL}>{score.label}</div>
              <div style={S.scoreD}>{steps} steps · par {par} · {steps-par>0?"+":""}{steps-par===0?"even":steps-par}</div>
              <div style={S.shareBox}>{buildShareText()}</div>
              <div style={S.copied}>{copied?"Copied!":""}</div>
              <button style={{...S.btnP,width:"100%",marginTop:8}} onClick={copyShare}>Copy result ↗</button>
              {mode==="practice"&&(
                <button style={{...S.btnSec,width:"100%",marginTop:8}} onClick={()=>loadPracticePuzzle(selectedDiff)}>
                  Play another {selectedDiff} puzzle →
                </button>
              )}
            </div>
          )}

          <div style={S.parNote}>Par is {par} steps — can you match or beat it?</div>
        </div>
      </div>
    </>
  );
}

const S={
  page:{minHeight:"100vh",background:"#fafafa",display:"flex",justifyContent:"center",padding:"20px 16px"},
  container:{width:"100%",maxWidth:480,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"},
  center:{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12},
  header:{textAlign:"center",marginBottom:12},
  logo:{fontSize:26,fontWeight:500,letterSpacing:5,color:"#1a1a2e"},
  sub:{fontSize:12,color:"#888"},
  modeTabs:{display:"flex",gap:8,marginBottom:12,background:"#f0f0f0",padding:4,borderRadius:10},
  modeTab:{flex:1,padding:"8px 0",fontSize:13,background:"transparent",border:"none",borderRadius:8,cursor:"pointer",color:"#888"},
  modeTabOn:{background:"#fff",color:"#1a1a2e",fontWeight:500,boxShadow:"0 1px 3px rgba(0,0,0,.1)"},
  practicePanel:{background:"#f5f5f5",borderRadius:10,padding:"14px",marginBottom:14,border:"1px solid #e0e0e0"},
  diffBtn:{flex:1,padding:"8px 0",fontSize:12,background:"#fff",border:"1px solid #ddd",borderRadius:8,cursor:"pointer",color:"#555"},
  diffBtnOn:{background:"#378ADD",color:"#fff",border:"1px solid #378ADD",fontWeight:500},
  ends:{display:"flex",alignItems:"center",justifyContent:"center",gap:14,marginBottom:16},
  pill:{background:"#f0f0f0",border:"1px solid #ddd",borderRadius:8,padding:"9px 18px",fontSize:17,fontWeight:500,letterSpacing:4,color:"#1a1a2e"},
  arr:{color:"#aaa",fontSize:18},
  stats:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16},
  stat:{background:"#f5f5f5",borderRadius:8,padding:8,textAlign:"center"},
  statV:{fontSize:20,fontWeight:500,color:"#1a1a2e"},
  statL:{fontSize:11,color:"#888"},
  chain:{display:"flex",flexDirection:"column",marginBottom:12},
  chainRow:{display:"flex",alignItems:"center",gap:10,padding:"3px 0"},
  cw:{fontSize:16,fontWeight:500,letterSpacing:3,padding:"8px 14px",borderRadius:8,border:"1px solid #e0e0e0",background:"#fff",color:"#1a1a2e",minWidth:80,textAlign:"center"},
  wS:{borderColor:"#378ADD",background:"#E6F1FB",color:"#0C447C"},
  wV:{borderColor:"#1D9E75",background:"#E1F5EE",color:"#085041"},
  wE:{borderColor:"#639922",background:"#EAF3DE",color:"#27500A"},
  dot:{width:5,height:5,borderRadius:"50%",background:"#ddd",margin:"2px 0 2px 21px"},
  badge:{fontSize:11,color:"#1D9E75"},
  msg:{padding:"10px 14px",borderRadius:8,marginBottom:10,fontSize:13,textAlign:"center"},
  msgE:{background:"#FCEBEB",color:"#791F1F"},
  msgI:{background:"#E6F1FB",color:"#0C447C"},
  msgS:{background:"#E1F5EE",color:"#085041"},
  inputRow:{display:"flex",gap:8,marginBottom:8},
  input:{flex:1,fontSize:15,letterSpacing:3,fontWeight:500,padding:"10px 12px",border:"1px solid #ddd",borderRadius:8,outline:"none",textTransform:"uppercase"},
  btnP:{padding:"10px 20px",fontSize:14,fontWeight:500,background:"#378ADD",color:"#fff",border:"none",borderRadius:8,cursor:"pointer"},
  btnSec:{flex:1,padding:8,fontSize:12,background:"#f5f5f5",color:"#555",border:"1px solid #e0e0e0",borderRadius:8,cursor:"pointer"},
  btnSkip:{padding:"8px 16px",fontSize:12,background:"transparent",color:"#aaa",border:"1px solid #e0e0e0",borderRadius:8,cursor:"pointer"},
  btnHow:{fontSize:11,padding:"3px 8px",background:"transparent",border:"1px solid #ddd",borderRadius:20,color:"#aaa",cursor:"pointer"},
  actions:{display:"flex",gap:8,marginBottom:12},
  complete:{background:"#f5f5f5",border:"1px solid #e0e0e0",borderRadius:12,padding:"1.5rem",textAlign:"center",marginBottom:12},
  scoreL:{fontSize:18,fontWeight:500,color:"#1a1a2e"},
  scoreD:{fontSize:13,color:"#888",margin:"4px 0 12px"},
  shareBox:{fontFamily:"monospace",fontSize:12,background:"#fff",border:"1px solid #e0e0e0",borderRadius:8,padding:10,whiteSpace:"pre",lineHeight:1.9,textAlign:"left",color:"#1a1a2e",marginBottom:8},
  copied:{fontSize:11,color:"#1D9E75",height:16,marginBottom:4},
  parNote:{textAlign:"center",fontSize:12,color:"#aaa",marginTop:8},
  overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16},
  modal:{background:"#fff",borderRadius:16,padding:"1.5rem",maxWidth:400,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,.2)"},
  modalHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16},
  modalStep:{fontSize:11,color:"#aaa",textTransform:"uppercase",letterSpacing:1},
  modalTitle:{fontSize:18,fontWeight:500,color:"#1a1a2e",marginBottom:8},
  modalBody:{fontSize:14,color:"#555",lineHeight:1.6,marginBottom:16},
  exRow:{display:"flex",alignItems:"center",gap:10,marginBottom:16,padding:12,background:"#f5f5f5",borderRadius:8},
  pdot:{width:6,height:6,borderRadius:"50%",background:"#e0e0e0"},
  pdotOn:{background:"#378ADD"},
};
