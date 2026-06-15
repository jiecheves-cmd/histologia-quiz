import { useState, useEffect, useRef } from "react";
import { useStorage } from "./storage.js";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const DIFFS = ["básico","intermedio","avanzado"];
const ROLES = ["alumno","profesor","supervisor"];
const ROLE_COLOR = {alumno:"#378ADD",profesor:"#1D9E75",supervisor:"#7B4FBE"};
const ROLE_BG    = {alumno:"#E8F3FC",profesor:"#E1F5EE",supervisor:"#F0EAF9"};
const TOPICS = [
  "Histología general","Tejido epitelial","Tejido conjuntivo",
  "Tejido óseo y cartilaginoso","Tejido muscular","Tejido nervioso",
  "Sistema cardiovascular","Sistema respiratorio","Sistema digestivo",
  "Sistema urinario","Sistema reproductor","Sistema endocrino",
  "Piel y anexos","Sistema inmune y linfoide"
];
const CONFIDENCE = [
  {label:"Alto", color:"#1D9E75",bg:"#E1F5EE",border:"#1D9E75",icon:"💪"},
  {label:"Medio",color:"#BA7517",bg:"#FEF3DC",border:"#E6A020",icon:"🤔"},
  {label:"Bajo", color:"#C0392B",bg:"#FAECE7",border:"#D85A30",icon:"😟"},
];
const CONF_MULT = [2, 1, 0.6];

const DEFAULT_DB = [
  {id:1,difficulty:"básico",supervised:false,topic:"Histología general",image:null,
   question:"¿Cuál es la tinción más utilizada en histología de rutina?",
   options:["PAS","Hematoxilina-Eosina (H&E)","Tricrómico de Masson","Azul de Toluidina"],
   answer:1,explanation:"La tinción H&E es el estándar de rutina: la hematoxilina tiñe los núcleos de azul-violeta y la eosina tiñe el citoplasma de rosa."},
  {id:2,difficulty:"básico",supervised:false,topic:"Tejido epitelial",image:null,
   question:"¿Qué tipo de epitelio recubre la tráquea?",
   options:["Escamoso estratificado","Cúbico simple","Cilíndrico pseudoestratificado ciliado","Transicional"],
   answer:2,explanation:"La tráquea está revestida por epitelio cilíndrico pseudoestratificado ciliado con células caliciformes, facilitando el transporte mucociliar."},
  {id:3,difficulty:"intermedio",supervised:false,topic:"Tejido conjuntivo",image:null,
   question:"¿Qué estructura del tejido conectivo produce colágeno tipo I?",
   options:["Mastocitos","Fibroblastos","Macrófagos","Células plasmáticas"],
   answer:1,explanation:"Los fibroblastos sintetizan colágeno tipo I, la proteína estructural más abundante del organismo."},
  {id:4,difficulty:"intermedio",supervised:false,topic:"Tejido óseo y cartilaginoso",image:null,
   question:"¿Qué célula del tejido óseo es responsable de la resorción ósea?",
   options:["Osteoblasto","Osteocito","Osteoclasto","Célula osteoprogenitora"],
   answer:2,explanation:"Los osteoclastos secretan ácido y enzimas lisosomales para resorber la matriz ósea."},
  {id:5,difficulty:"avanzado",supervised:false,topic:"Sistema reproductor",image:null,
   question:"¿Cuál es la función de las células de Sertoli en el testículo?",
   options:["Producción de testosterona","Soporte y nutrición de espermatocitos","Fagocitosis de espermatozoides dañados únicamente","Producción de FSH"],
   answer:1,explanation:"Las células de Sertoli forman la barrera hematotesticular, nutren a las células germinales y secretan inhibina y ABP."},
];
const DEFAULT_USERS = [
  {id:"u0",username:"supervisor",password:"1234",role:"supervisor",active:true,displayName:"Supervisor"},
];

// ─── SCORING ──────────────────────────────────────────────────────────────────
function calcSessionScore(answers) {
  let points = 0, streak = 0, bonuses = 0;
  (answers||[]).forEach(a => {
    const mult = CONF_MULT[a.confidence != null ? a.confidence : 1];
    if (a.correct) {
      points += 1 * mult;
      streak++;
      if (streak % 5 === 0) { points += 1; bonuses++; }
    } else {
      points -= 0.33 * mult;
      streak = 0;
    }
  });
  return { points: Math.round(points * 100) / 100, bonuses };
}
function periodKey(dateStr, period) {
  const d = new Date(dateStr);
  if (period === "week") {
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    return d.getFullYear() + "-W" + week;
  }
  if (period === "month") return d.getFullYear() + "-" + (d.getMonth() + 1);
  return "" + d.getFullYear();
}


function diffStyle(d) {
  const n = (d||"").toLowerCase().trim();
  return {
    bg: n==="básico" ? "#1D9E75" : n==="intermedio" ? "#F5C518" : n==="avanzado" ? "#C0392B" : "#888",
    color: n==="básico" ? "#fff" : "#111"
  };
}
function fmt(ms) {
  const s=Math.floor(ms/1000), m=Math.floor(s/60), h=Math.floor(m/60);
  if (h>0) return h+"h "+( m%60)+"m";
  if (m>0) return m+"m "+(s%60)+"s";
  return s+"s";
}
function Badge({ role }) {
  return (
    <span style={{fontSize:11,fontWeight:700,padding:"2px 9px",borderRadius:20,
      background:ROLE_BG[role],color:ROLE_COLOR[role],textTransform:"capitalize"}}>
      {role}
    </span>
  );
}
function SupervisionTag({ supervised }) {
  return supervised
    ? <span style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:"#E1F5EE",color:"#0F6E56",fontWeight:600}}>Supervisada</span>
    : <span style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:"#FEF3DC",color:"#7A4A00",fontWeight:600}}>Pendiente</span>;
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [db, setDb]           = useState(DEFAULT_DB);
  const [users, setUsers]     = useState(DEFAULT_USERS);
  const [currentUser, setCurrentUser] = useState(null);
  const [tab, setTab]         = useState("alumno");
  const [loaded, setLoaded]   = useState(false);
  const { save, load }        = useStorage();

  useEffect(() => {
    Promise.all([load("histo_db", DEFAULT_DB), load("histo_users", DEFAULT_USERS, true)])
      .then(([d, u]) => { setDb(d); setUsers(u); setLoaded(true); });
  }, []);

  const updateDb    = nd => { setDb(nd);    save("histo_db", nd); };
  const updateUsers = nu => { setUsers(nu); save("histo_users", nu, true); };

  if (!loaded) return <div style={{padding:"2rem",textAlign:"center",color:"var(--color-text-secondary)"}}>Cargando...</div>;
  if (!currentUser) return <LoginScreen users={users} onLogin={u => { setCurrentUser(u); setTab("alumno"); }} />;

  const role      = currentUser.role;
  const canTeacher = role === "profesor" || role === "supervisor";
  const canSuper   = role === "supervisor";

  return (
    <div style={{fontFamily:"var(--font-sans)",maxWidth:800,margin:"0 auto",padding:"1rem 0"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.25rem",flexWrap:"wrap",gap:8}}>
        <div>
          <h2 style={{fontSize:19,fontWeight:600,margin:"0 0 2px",color:"var(--color-text-primary)"}}>HistoMind</h2>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:13,color:"var(--color-text-secondary)"}}>{currentUser.displayName}</span>
            <Badge role={role} />
          </div>
        </div>
        <button onClick={() => setCurrentUser(null)}
          style={{fontSize:12,padding:"5px 14px",borderRadius:"var(--border-radius-md)",cursor:"pointer",
            background:"transparent",color:"var(--color-text-secondary)",border:"0.5px solid var(--color-border-tertiary)"}}>
          Cerrar sesión
        </button>
      </div>

      {canTeacher && (
        <div style={{display:"flex",gap:8,marginBottom:"1.5rem",flexWrap:"wrap"}}>
          {[["Modo Alumno","alumno"],["Modo Profesor","profesor"],...(canSuper?[["Supervisor","supervisor"]]:[])].map(([l,v]) => (
            <button key={v} onClick={() => setTab(v)}
              style={{padding:"6px 16px",borderRadius:"var(--border-radius-md)",fontSize:13,fontWeight:500,cursor:"pointer",
                background:tab===v?"var(--color-background-info)":"transparent",
                color:tab===v?"var(--color-text-info)":"var(--color-text-secondary)",
                border:tab===v?"0.5px solid var(--color-border-info)":"0.5px solid var(--color-border-tertiary)"}}>
              {l}
            </button>
          ))}
        </div>
      )}

      {tab==="alumno"     && <StudentMode db={db} studentName={currentUser.displayName} />}
      {tab==="profesor"   && canTeacher && <TeacherMode db={db} updateDb={updateDb} isSupervisor={canSuper} />}
      {tab==="supervisor" && canSuper   && <SupervisorMode users={users} updateUsers={updateUsers} />}
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ users, onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const login = () => {
    const u = users.find(u => u.username === username.trim() && u.password === password && u.active);
    if (u) { onLogin(u); setError(""); }
    else setError("Usuario o contraseña incorrectos, o cuenta inactiva.");
  };
  return (
    <div style={{fontFamily:"var(--font-sans)",maxWidth:380,margin:"3rem auto",padding:"0 1rem"}}>
      <h2 style={{fontSize:20,fontWeight:600,marginBottom:4,color:"var(--color-text-primary)"}}>Quiz de Histología</h2>
      <p style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:"1.75rem"}}>Introduce tus credenciales para acceder</p>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
        <input value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key==="Enter"&&login()}
          placeholder="Usuario"
          style={{fontSize:14,padding:"10px 14px",borderRadius:"var(--border-radius-md)",
            border:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)"}} />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key==="Enter"&&login()}
          placeholder="Contraseña"
          style={{fontSize:14,padding:"10px 14px",borderRadius:"var(--border-radius-md)",
            border:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)"}} />
      </div>
      {error && <p style={{fontSize:12,color:"#C0392B",marginBottom:12}}>{error}</p>}
      <button onClick={login}
        style={{width:"100%",padding:"10px",borderRadius:"var(--border-radius-md)",fontSize:14,fontWeight:600,cursor:"pointer",
          background:"var(--color-background-info)",color:"var(--color-text-info)",border:"0.5px solid var(--color-border-info)"}}>
        Entrar
      </button>
    </div>
  );
}

// ─── STUDENT MODE ─────────────────────────────────────────────────────────────
function StudentMode({ db, studentName }) {
  const [phase, setPhase]           = useState("config");
  const [filter, setFilter]         = useState("todas");
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [numQ, setNumQ]             = useState(5);
  const [questions, setQuestions]   = useState([]);
  const [current, setCurrent]       = useState(0);
  const [selected, setSelected]     = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [confirmed, setConfirmed]   = useState(false);
  const [answers, setAnswers]       = useState([]);
  const [sessionStart, setSessionStart]   = useState(null);
  const [questionStart, setQuestionStart] = useState(null);
  const { save, load } = useStorage();

  const availableTopics = [...new Set(db.map(q => q.topic).filter(Boolean))].sort();
  const poolSize = db.filter(q => {
    const diffOk  = filter==="todas" || q.difficulty===filter;
    const topicOk = selectedTopics.length===0 || selectedTopics.includes(q.topic);
    return diffOk && topicOk;
  }).length;

  const toggleTopic = t => setSelectedTopics(prev =>
    prev.includes(t) ? prev.filter(x => x!==t) : [...prev, t]
  );

  const start = async () => {
    let pool = db.filter(q => {
      const diffOk  = filter==="todas" || q.difficulty===filter;
      const topicOk = selectedTopics.length===0 || selectedTopics.includes(q.topic);
      return diffOk && topicOk;
    });
    if (!pool.length) return;
    const seenKey = "histo_seen_" + filter + "_" + (selectedTopics.length===0?"all":selectedTopics.slice().sort().join(","));
    let seen = await load(seenKey, []);
    let unseen = pool.filter(q => !seen.includes(q.id));
    if (!unseen.length) { seen = []; unseen = pool; }
    const batch = unseen.sort(() => Math.random()-0.5).slice(0, Math.min(numQ, unseen.length));
    save(seenKey, [...seen, ...batch.map(q => q.id)]);
    const shuffled = batch.map(q => {
      const idx = q.options.map((opt, i) => ({ opt, correct: i===q.answer }));
      idx.sort(() => Math.random()-0.5);
      return { ...q, options: idx.map(o => o.opt), answer: idx.findIndex(o => o.correct) };
    });
    const now = Date.now();
    setQuestions(shuffled); setCurrent(0); setSelected(null); setConfidence(null);
    setConfirmed(false); setAnswers([]); setSessionStart(now); setQuestionStart(now); setPhase("quiz");
  };

  const confirm = () => {
    if (selected===null || confidence===null) return;
    setConfirmed(true);
    const q = questions[current];
    setAnswers(p => [...p, {
      questionId:q.id, question:q.question, difficulty:q.difficulty, supervised:q.supervised,
      correct: selected===q.answer, userAnswer:selected, correctAnswer:q.answer,
      confidence, timeMs: Date.now() - (questionStart||Date.now())
    }]);
  };

  const next = async () => {
    if (current+1 >= questions.length) {
      const sc = calcSessionScore(answers);
      const sessionData = {
        student:studentName, date:new Date().toISOString(),
        durationMs: Date.now() - (sessionStart||Date.now()),
        filter, answers, points: sc.points, bonuses: sc.bonuses
      };
      const sessions = await load("histo_sessions", [], true);
      await save("histo_sessions", [...sessions, sessionData], true);
      setPhase("results"); return;
    }
    setCurrent(c => c+1); setSelected(null); setConfidence(null); setConfirmed(false); setQuestionStart(Date.now());
  };

  // Config
  if (phase==="config") return (
    <div>
      <p style={{fontSize:14,color:"var(--color-text-secondary)",marginBottom:"1.25rem"}}>
        Hola, <strong style={{color:"var(--color-text-primary)"}}>{studentName}</strong>. Configura tu sesión:
      </p>

      {/* Difficulty */}
      <div style={{marginBottom:"1.25rem"}}>
        <p style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)",margin:"0 0 8px"}}>Dificultad</p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {["todas","básico","intermedio","avanzado"].map(d => (
            <button key={d} onClick={() => setFilter(d)}
              style={{padding:"6px 16px",borderRadius:"var(--border-radius-md)",fontSize:13,cursor:"pointer",
                background:filter===d?"var(--color-background-secondary)":"transparent",
                color:"var(--color-text-primary)",fontWeight:filter===d?600:400,
                border:filter===d?"0.5px solid var(--color-border-secondary)":"0.5px solid var(--color-border-tertiary)",
                textTransform:"capitalize"}}>
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Topics */}
      <div style={{marginBottom:"1.25rem"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <p style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)",margin:0}}>Temas</p>
          <div style={{display:"flex",gap:8}}>
            <button onClick={() => setSelectedTopics([...availableTopics])}
              style={{fontSize:11,padding:"2px 10px",borderRadius:10,cursor:"pointer",
                background:"var(--color-background-secondary)",color:"var(--color-text-secondary)",
                border:"0.5px solid var(--color-border-tertiary)"}}>
              Todos
            </button>
            <button onClick={() => setSelectedTopics([])}
              style={{fontSize:11,padding:"2px 10px",borderRadius:10,cursor:"pointer",
                background:"var(--color-background-secondary)",color:"var(--color-text-secondary)",
                border:"0.5px solid var(--color-border-tertiary)"}}>
              Ninguno
            </button>
          </div>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {availableTopics.map(t => {
            const active = selectedTopics.includes(t);
            const count  = db.filter(q => q.topic===t && (filter==="todas"||q.difficulty===filter)).length;
            return (
              <button key={t} onClick={() => toggleTopic(t)}
                style={{fontSize:12,padding:"4px 12px",borderRadius:20,cursor:"pointer",
                  fontWeight:active?600:400,
                  background:active?"var(--color-background-info)":"transparent",
                  color:active?"var(--color-text-info)":"var(--color-text-secondary)",
                  border:active?"0.5px solid var(--color-border-info)":"0.5px solid var(--color-border-tertiary)"}}>
                {t} <span style={{fontSize:10,opacity:0.7}}>({count})</span>
              </button>
            );
          })}
        </div>
        <p style={{fontSize:12,color:"var(--color-text-secondary)",margin:"6px 0 0"}}>
          {selectedTopics.length===0 ? "Todos los temas seleccionados" : selectedTopics.length+" tema"+( selectedTopics.length!==1?"s":"")+" seleccionado"+(selectedTopics.length!==1?"s":"")}
        </p>
      </div>

      {/* Num questions */}
      <div style={{marginBottom:"1.75rem"}}>
        <p style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)",margin:"0 0 8px"}}>Número de preguntas</p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {[5,10,15,20].map(n => {
            const disabled = poolSize < n;
            return (
              <button key={n} onClick={() => !disabled && setNumQ(n)}
                style={{width:52,height:40,borderRadius:"var(--border-radius-md)",fontSize:15,
                  fontWeight:numQ===n?700:400, cursor:disabled?"not-allowed":"pointer", opacity:disabled?0.35:1,
                  background:numQ===n?"var(--color-background-info)":"transparent",
                  color:numQ===n?"var(--color-text-info)":"var(--color-text-primary)",
                  border:numQ===n?"0.5px solid var(--color-border-info)":"0.5px solid var(--color-border-tertiary)"}}>
                {n}
              </button>
            );
          })}
        </div>
        <p style={{fontSize:12,color:"var(--color-text-secondary)",margin:"6px 0 0"}}>{poolSize} preguntas disponibles</p>
      </div>

      <button onClick={start} disabled={!poolSize}
        style={{padding:"9px 28px",borderRadius:"var(--border-radius-md)",fontSize:14,fontWeight:600,
          cursor:poolSize?"pointer":"not-allowed", opacity:poolSize?1:0.5,
          background:"var(--color-background-info)",color:"var(--color-text-info)",border:"0.5px solid var(--color-border-info)"}}>
        Empezar quiz
      </button>
    </div>
  );

  // Results
  if (phase==="results") {
    const correct = answers.filter(a => a.correct).length;
    const pct     = Math.round((correct/answers.length)*100);
    const { points, bonuses } = calcSessionScore(answers);
    const ptAciertos  = answers.filter(a=>a.correct).reduce((s,a)=>s+CONF_MULT[a.confidence!=null?a.confidence:1],0);
    const ptErrores   = answers.filter(a=>!a.correct).reduce((s,a)=>s+0.33*CONF_MULT[a.confidence!=null?a.confidence:1],0);
    return (
      <ResultsWithRanking
        studentName={studentName}
        answers={answers}
        questions={questions}
        sessionStart={sessionStart}
        correct={correct}
        pct={pct}
        points={points}
        bonuses={bonuses}
        ptAciertos={ptAciertos}
        ptErrores={ptErrores}
        onNewSession={()=>setPhase("config")}
      />
    );
  }

  // Quiz
  const q  = questions[current];
  const ds = diffStyle((q.difficulty||"").toLowerCase().trim());
  return (
    <div>
      <style>{`
        .opt-btn{transition:transform .12s,box-shadow .12s,background .15s;}
        .opt-btn:hover:not(.opt-confirmed){transform:translateX(4px);box-shadow:-3px 0 0 0 #378ADD;}
        .opt-selected:not(.opt-confirmed){transform:translateX(6px);box-shadow:-4px 0 0 0 #185FA5;}
        .opt-correct{animation:popIn .25s ease;box-shadow:-4px 0 0 0 #0F6E56;}
        .opt-wrong{animation:shake .35s ease;box-shadow:-4px 0 0 0 #993C1D;}
        @keyframes popIn{0%{transform:scale(1)}40%{transform:scale(1.025) translateX(6px)}100%{transform:scale(1) translateX(6px)}}
        @keyframes shake{0%,100%{transform:translateX(6px)}25%{transform:translateX(2px)}75%{transform:translateX(10px)}}
        .conf-btn{transition:transform .1s,box-shadow .1s;}.conf-btn:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.1);}
        .explain-box{animation:fadeSlide .3s ease;}
        @keyframes fadeSlide{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        .next-btn{transition:transform .12s;}.next-btn:hover{transform:translateX(3px);}
      `}</style>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.75rem"}}>
        <span style={{fontSize:13,color:"var(--color-text-secondary)"}}>Pregunta {current+1} de {questions.length}</span>
        <SupervisionTag supervised={q.supervised} />
      </div>
      <div style={{marginBottom:"1rem"}}>
        <span style={{display:"inline-block",fontSize:13,fontWeight:700,padding:"5px 18px",borderRadius:6,
          textTransform:"capitalize",background:ds.bg,color:ds.color}}>
          Nivel: {q.difficulty||"—"}
        </span>
      </div>

      {q.image && <ImageViewer src={q.image} />}

      <p style={{fontSize:15,fontWeight:500,marginBottom:"1.25rem",color:"var(--color-text-primary)",lineHeight:1.5}}>{q.question}</p>

      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:"1.25rem"}}>
        {q.options.map((opt, i) => {
          let bg="var(--color-background-primary)", border="0.5px solid var(--color-border-tertiary)", tc="var(--color-text-primary)", cls="opt-btn";
          if (confirmed) {
            cls += " opt-confirmed";
            if (i===q.answer) { bg="#E1F5EE"; border="0.5px solid #1D9E75"; tc="#085041"; cls+=" opt-correct"; }
            else if (i===selected) { bg="#FAECE7"; border="0.5px solid #D85A30"; tc="#4A1B0C"; cls+=" opt-wrong"; }
            else { tc="var(--color-text-secondary)"; }
          } else if (i===selected) {
            bg="var(--color-background-info)"; border="0.5px solid var(--color-border-info)"; tc="var(--color-text-info)"; cls+=" opt-selected";
          }
          const lbl = ["A","B","C","D"][i];
          return (
            <div key={i} onClick={() => !confirmed && setSelected(i)} className={cls}
              style={{padding:"11px 14px",borderRadius:"var(--border-radius-md)",border,background:bg,
                cursor:confirmed?"default":"pointer",fontSize:14,color:tc,display:"flex",alignItems:"center",gap:10}}>
              <span style={{minWidth:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:12,fontWeight:500,flexShrink:0,
                background: confirmed&&i===q.answer?"#1D9E75": confirmed&&i===selected?"#D85A30": i===selected?"var(--color-text-info)":"var(--color-background-secondary)",
                color: (confirmed&&(i===q.answer||i===selected))||(!confirmed&&i===selected)?"#fff":"var(--color-text-secondary)"}}>
                {confirmed&&i===q.answer?"✓": confirmed&&i===selected?"✗": lbl}
              </span>
              <span>{opt}</span>
            </div>
          );
        })}
      </div>

      {selected!==null && !confirmed && (
        <div style={{marginBottom:"1.25rem",padding:"12px 14px",borderRadius:"var(--border-radius-md)",
          background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-tertiary)"}}>
          <p style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)",margin:"0 0 10px"}}>¿Con qué seguridad respondes?</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {CONFIDENCE.map((c, i) => (
              <button key={i} onClick={() => setConfidence(i)} className="conf-btn"
                style={{flex:1,minWidth:80,padding:"10px 8px",borderRadius:"var(--border-radius-md)",cursor:"pointer",
                  background:confidence===i?c.bg:"var(--color-background-primary)",
                  border:"1.5px solid "+(confidence===i?c.border:"var(--color-border-tertiary)"),
                  display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <span style={{fontSize:20}}>{c.icon}</span>
                <span style={{fontSize:13,fontWeight:confidence===i?700:400,color:confidence===i?c.color:"var(--color-text-secondary)"}}>{c.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {confirmed && (
        <div className="explain-box"
          style={{borderLeft:"3px solid",borderColor:selected===q.answer?"#1D9E75":"#D85A30",
            borderRadius:"0 var(--border-radius-md) var(--border-radius-md) 0",
            background:"var(--color-background-secondary)",padding:"12px 16px",marginBottom:"1.25rem",fontSize:13,lineHeight:1.7}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <span style={{fontWeight:500,color:selected===q.answer?"#0F6E56":"#993C1D"}}>
              {selected===q.answer?"Correcto":"Incorrecto"}
            </span>
            {confidence!==null && (
              <span style={{fontSize:12,padding:"2px 10px",borderRadius:20,
                background:CONFIDENCE[confidence].bg,color:CONFIDENCE[confidence].color,fontWeight:600}}>
                {CONFIDENCE[confidence].icon} {CONFIDENCE[confidence].label}
              </span>
            )}
          </div>
          <span style={{color:"var(--color-text-secondary)"}}>{q.explanation}</span>
          {q.explanationImage && (
            <div style={{marginTop:10}}>
              <ImageViewer src={q.explanationImage} label="Ver imagen de explicación" />
            </div>
          )}
        </div>
      )}

      <div style={{display:"flex",gap:8}}>
        {!confirmed
          ? <button onClick={confirm} disabled={selected===null||confidence===null}
              style={{padding:"8px 22px",borderRadius:"var(--border-radius-md)",fontSize:13,fontWeight:500,
                cursor:(selected===null||confidence===null)?"not-allowed":"pointer",
                opacity:(selected===null||confidence===null)?0.4:1,
                background:"var(--color-background-info)",color:"var(--color-text-info)",border:"0.5px solid var(--color-border-info)"}}>
              Confirmar respuesta
            </button>
          : <button onClick={next} className="next-btn"
              style={{padding:"8px 22px",borderRadius:"var(--border-radius-md)",fontSize:13,fontWeight:500,cursor:"pointer",
                background:selected===q.answer?"#E1F5EE":"#FAECE7",
                color:selected===q.answer?"#085041":"#4A1B0C",
                border:"0.5px solid "+(selected===q.answer?"#1D9E75":"#D85A30")}}>
              {current+1>=questions.length?"Ver resultados":"Siguiente"}
            </button>
        }
      </div>
    </div>
  );
}

// ─── RESULTS WITH RANKING ─────────────────────────────────────────────────────
function ResultsWithRanking({ studentName, answers, questions, sessionStart, correct, pct, points, bonuses, ptAciertos, ptErrores, onNewSession }) {
  const [sessions, setSessions] = useState([]);
  const [rankPeriod, setRankPeriod] = useState("week");
  const { load } = useStorage();

  useEffect(() => { load("histo_sessions", [], true).then(setSessions); }, []);

  const medals = ["🥇","🥈","🥉"];
  const periodLabel = { week:"Esta semana", month:"Este mes", year:"Este año" };

  const getRanking = (period) => {
    const now    = new Date().toISOString();
    const curKey = periodKey(now, period);
    const stuPoints = {};
    sessions.filter(s => periodKey(s.date, period)===curKey).forEach(s => {
      if (!stuPoints[s.student]) stuPoints[s.student] = { name:s.student, points:0 };
      const sc = s.points != null ? s.points : calcSessionScore(s.answers||[]).points;
      stuPoints[s.student].points = Math.round((stuPoints[s.student].points + sc)*100)/100;
    });
    return Object.values(stuPoints).sort((a,b) => b.points-a.points);
  };

  const ranking   = getRanking(rankPeriod);
  const myPos     = ranking.findIndex(r => r.name===studentName);
  const myPoints  = ranking[myPos]?.points ?? points;
  const totalInRanking = ranking.length;

  return (
    <div>
      <h3 style={{fontSize:18,fontWeight:500,marginBottom:"0.25rem"}}>Resultado final</h3>
      <p style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:"1rem"}}>
        {studentName} · {fmt(Date.now()-(sessionStart||Date.now()))}
      </p>

      {/* Score cards */}
      <div style={{display:"flex",gap:12,marginBottom:"1rem",flexWrap:"wrap"}}>
        {[["Correctas",correct,"#1D9E75"],["Incorrectas",answers.length-correct,"#C0392B"],["Acierto",pct+"%",pct>=70?"#1D9E75":"#C0392B"]].map(([l,v,c]) => (
          <div key={l} style={{flex:1,minWidth:100,background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"12px 16px"}}>
            <div style={{fontSize:12,color:"var(--color-text-secondary)",marginBottom:4}}>{l}</div>
            <div style={{fontSize:22,fontWeight:600,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Points breakdown */}
      <div style={{background:"#F0EAF9",border:"0.5px solid #C9A8F0",borderRadius:"var(--border-radius-md)",padding:"12px 16px",marginBottom:"1rem"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:13,fontWeight:600,color:"#5B2D9E"}}>Puntuación de sesión</span>
          <span style={{fontSize:22,fontWeight:700,color:"#7B4FBE"}}>{points>0?"+":""}{points} pts</span>
        </div>
        <div style={{display:"flex",gap:12,fontSize:12,color:"#5B2D9E",flexWrap:"wrap"}}>
          <span>Aciertos: +{ptAciertos.toFixed(2)} pts</span>
          <span>Errores: -{ptErrores.toFixed(2)} pts</span>
          {bonuses>0 && <span>Bonus rachas: +{bonuses} pts</span>}
        </div>
        <div style={{fontSize:11,color:"#8B6AC7",marginTop:6}}>Multiplicadores: Alto x2 · Medio x1 · Bajo x0.6</div>
      </div>

      {/* Ranking position */}
      <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"14px 16px",marginBottom:"1.5rem"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
          <span style={{fontSize:13,fontWeight:600,color:"var(--color-text-primary)"}}>Tu posición en el ranking</span>
          <div style={{display:"flex",gap:6}}>
            {["week","month","year"].map(p=>(
              <button key={p} onClick={()=>setRankPeriod(p)}
                style={{padding:"3px 10px",borderRadius:20,fontSize:11,cursor:"pointer",
                  fontWeight:rankPeriod===p?600:400,
                  background:rankPeriod===p?"#F0EAF9":"transparent",
                  color:rankPeriod===p?"#7B4FBE":"var(--color-text-secondary)",
                  border:rankPeriod===p?"0.5px solid #C9A8F0":"0.5px solid var(--color-border-tertiary)"}}>
                {periodLabel[p]}
              </button>
            ))}
          </div>
        </div>

        {/* My position highlight */}
        {myPos>=0 ? (
          <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",
            borderRadius:"var(--border-radius-md)",marginBottom:12,
            background: myPos===0?"#F0EAF9":myPos===1?"#F7F4FD":myPos===2?"#FAF8FF":"var(--color-background-info)",
            border:"1.5px solid "+(myPos<3?"#C9A8F0":"var(--color-border-info)")}}>
            <span style={{fontSize:myPos<3?28:20,minWidth:36,textAlign:"center"}}>
              {myPos<3 ? medals[myPos] : "#"+(myPos+1)}
            </span>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:700,color:"var(--color-text-primary)"}}>{studentName}</div>
              <div style={{fontSize:12,color:"var(--color-text-secondary)"}}>
                {myPos===0?"¡Eres el primero!":myPos===1?"¡Segundo puesto!":myPos===2?"¡Tercer puesto!":"Posición "+(myPos+1)+" de "+totalInRanking}
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:20,fontWeight:700,color:"#7B4FBE"}}>{myPoints>0?"+":""}{myPoints}</div>
              <div style={{fontSize:10,color:"#8B6AC7"}}>puntos acumulados</div>
            </div>
          </div>
        ) : (
          <div style={{padding:"10px 14px",borderRadius:"var(--border-radius-md)",background:"var(--color-background-primary)",
            fontSize:13,color:"var(--color-text-secondary)",marginBottom:12,textAlign:"center"}}>
            Aún no apareces en el ranking de este período. ¡Esta sesión te añadirá!
          </div>
        )}

        {/* Mini ranking — top 5 + neighbors */}
        {ranking.length>0 && (
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {ranking.slice(0,5).map((r,i)=>{
              const isMe = r.name===studentName;
              return (
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",
                  borderRadius:"var(--border-radius-md)",
                  background:isMe?"#F0EAF9":"var(--color-background-primary)",
                  border:"0.5px solid "+(isMe?"#C9A8F0":"var(--color-border-tertiary)"),
                  fontWeight:isMe?600:400}}>
                  <span style={{fontSize:i<3?16:12,minWidth:28,textAlign:"center"}}>{i<3?medals[i]:(i+1)+"."}</span>
                  <span style={{flex:1,fontSize:13,color:isMe?"#5B2D9E":"var(--color-text-primary)"}}>{r.name}{isMe?" (tú)":""}</span>
                  <span style={{fontSize:13,fontWeight:600,color:"#7B4FBE"}}>{r.points>0?"+":""}{r.points} pts</span>
                </div>
              );
            })}
            {myPos>=5 && (
              <>
                {myPos>5 && <div style={{textAlign:"center",fontSize:11,color:"var(--color-text-secondary)",padding:"2px 0"}}>···</div>}
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",
                  borderRadius:"var(--border-radius-md)",background:"#F0EAF9",border:"0.5px solid #C9A8F0",fontWeight:600}}>
                  <span style={{fontSize:12,minWidth:28,textAlign:"center"}}>{myPos+1}.</span>
                  <span style={{flex:1,fontSize:13,color:"#5B2D9E"}}>{studentName} (tú)</span>
                  <span style={{fontSize:13,fontWeight:600,color:"#7B4FBE"}}>{myPoints>0?"+":""}{myPoints} pts</span>
                </div>
              </>
            )}
            {ranking.length>5 && myPos<5 && (
              <div style={{textAlign:"center",fontSize:11,color:"var(--color-text-secondary)",padding:"2px 0"}}>
                y {ranking.length-5} más...
              </div>
            )}
          </div>
        )}
      </div>

      <p style={{fontSize:13,fontWeight:500,marginBottom:10}}>Repaso de preguntas</p>
      <div style={{marginBottom:"1.5rem"}}>
        {questions.map((q,i) => (
          <ReviewCard key={q.id} q={q} userAnswer={answers[i]?.userAnswer}
            correct={answers[i]?.correct} confidence={answers[i]?.confidence} idx={i} />
        ))}
      </div>
      <button onClick={onNewSession}
        style={{padding:"7px 20px",borderRadius:"var(--border-radius-md)",fontSize:13,cursor:"pointer",
          background:"transparent",color:"var(--color-text-primary)",border:"0.5px solid var(--color-border-tertiary)"}}>
        Nueva sesión
      </button>
    </div>
  );
}

// ─── IMAGE VIEWER ─────────────────────────────────────────────────────────────
function ImageViewer({ src, label }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div onClick={() => setOpen(true)}
        style={{borderRadius:"var(--border-radius-md)",overflow:"hidden",
          border:"0.5px solid var(--color-border-tertiary)",cursor:"zoom-in",position:"relative",
          marginBottom: label ? 0 : "1rem"}}>
        <img src={src} alt="Imagen histológica"
          style={{width:"100%",maxHeight: label ? 160 : 260,objectFit: label ? "contain" : "cover",display:"block",background: label ? "#f8f8f8" : "transparent"}} />
        <div style={{position:"absolute",bottom:8,right:8,background:"rgba(0,0,0,0.5)",color:"#fff",
          fontSize:11,padding:"3px 8px",borderRadius:20}}>{label || "Ver completa"}</div>
      </div>
      {open && (
        <div onClick={() => setOpen(false)}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:9999,
            display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem",cursor:"zoom-out"}}>
          <div onClick={e => e.stopPropagation()} style={{position:"relative",maxWidth:"95vw",maxHeight:"95vh"}}>
            <img src={src} alt="Imagen ampliada"
              style={{maxWidth:"95vw",maxHeight:"90vh",objectFit:"contain",borderRadius:8,display:"block",
                boxShadow:"0 8px 40px rgba(0,0,0,0.6)"}} />
            <button onClick={() => setOpen(false)}
              style={{position:"absolute",top:-14,right:-14,width:32,height:32,borderRadius:"50%",
                background:"#fff",border:"none",cursor:"pointer",fontSize:16,fontWeight:700,color:"#333",
                display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 8px rgba(0,0,0,0.3)"}}>
              X
            </button>
            <p style={{textAlign:"center",color:"rgba(255,255,255,0.5)",fontSize:12,marginTop:8}}>Clic fuera para cerrar</p>
          </div>
        </div>
      )}
    </>
  );
}

// ─── REVIEW CARD ──────────────────────────────────────────────────────────────
function ReviewCard({ q, userAnswer, correct, confidence, idx }) {
  const [open, setOpen] = useState(false);
  const labels = ["A","B","C","D"];
  return (
    <div style={{borderRadius:"var(--border-radius-md)",border:"0.5px solid var(--color-border-tertiary)",marginBottom:8,overflow:"hidden"}}>
      <div onClick={() => setOpen(o => !o)}
        style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",cursor:"pointer",background:"var(--color-background-primary)"}}>
        <span style={{minWidth:22,height:22,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:12,fontWeight:500,flexShrink:0,background:correct?"#1D9E75":"#D85A30",color:"#fff"}}>
          {correct?"✓":"✗"}
        </span>
        <span style={{flex:1,fontSize:13,color:"var(--color-text-primary)",lineHeight:1.4}}>{idx+1}. {q.question}</span>
        {confidence!=null && (
          <span style={{fontSize:11,padding:"2px 8px",borderRadius:10,
            background:CONFIDENCE[confidence].bg,color:CONFIDENCE[confidence].color,fontWeight:600,flexShrink:0}}>
            {CONFIDENCE[confidence].icon} {CONFIDENCE[confidence].label}
          </span>
        )}
        <span style={{fontSize:12,color:"var(--color-text-secondary)",flexShrink:0}}>{open?"▲":"▼"}</span>
      </div>
      {open && (
        <div style={{padding:"0 14px 14px",background:"var(--color-background-secondary)"}}>
          {q.image && <img src={q.image} alt="" style={{width:"100%",maxHeight:180,objectFit:"cover",borderRadius:"var(--border-radius-md)",margin:"10px 0"}} />}
          <div style={{display:"flex",flexDirection:"column",gap:6,margin:"10px 0"}}>
            {q.options.map((opt, i) => {
              const isC = i===q.answer, isU = i===userAnswer;
              let bg="var(--color-background-primary)", border="0.5px solid var(--color-border-tertiary)", tc="var(--color-text-secondary)";
              if (isC) { bg="#E1F5EE"; border="0.5px solid #1D9E75"; tc="#085041"; }
              else if (isU&&!isC) { bg="#FAECE7"; border="0.5px solid #D85A30"; tc="#4A1B0C"; }
              return (
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:"var(--border-radius-md)",border,background:bg}}>
                  <span style={{minWidth:20,height:20,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:11,fontWeight:500,flexShrink:0,
                    background:isC?"#1D9E75":isU?"#D85A30":"var(--color-background-secondary)",
                    color:isC||isU?"#fff":"var(--color-text-secondary)"}}>
                    {isC?"✓":isU?"✗":labels[i]}
                  </span>
                  <span style={{fontSize:13,color:tc,flex:1}}>{opt}</span>
                  {isU&&!isC && <span style={{fontSize:11,color:"#993C1D"}}>Tu respuesta</span>}
                  {isC        && <span style={{fontSize:11,color:"#0F6E56"}}>Correcta</span>}
                </div>
              );
            })}
          </div>
          <div style={{borderLeft:"3px solid",borderColor:correct?"#1D9E75":"#D85A30",
            borderRadius:"0 var(--border-radius-md) var(--border-radius-md) 0",
            background:"var(--color-background-primary)",padding:"10px 12px",fontSize:13,
            color:"var(--color-text-secondary)",lineHeight:1.6}}>
            {q.explanation}
            {q.explanationImage && (
              <div style={{marginTop:8}}>
                <ImageViewer src={q.explanationImage} label="Ver imagen de explicación" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── IMPORT VIEW ─────────────────────────────────────────────────────────────
function ImportView({ db, updateDb, genDiff, setGenDiff }) {
  const [tab, setTab]           = useState("pdf"); // pdf | excel
  const [pdfFile, setPdfFile]   = useState(null);
  const [pdfName, setPdfName]   = useState("");
  const [pdfDiff, setPdfDiff]   = useState("básico");
  const [pdfTopic, setPdfTopic] = useState(TOPICS[0]);
  const [pdfCount, setPdfCount] = useState(3);
  const [pdfStatus, setPdfStatus] = useState("");
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [preview, setPreview]   = useState(null); // array of questions to review before adding
  const [xlStatus, setXlStatus] = useState("");
  const pdfRef  = useRef();
  const xlRef   = useRef();

  // ── PDF/Word handler ──
  const handlePdfFile = e => {
    const f = e.target.files[0]; if (!f) return;
    setPdfFile(f); setPdfName(f.name); setPdfStatus(""); setPreview(null);
  };

  const generateFromDoc = async () => {
    if (!pdfFile) { setPdfStatus("Selecciona un archivo primero."); return; }
    setPdfGenerating(true); setPdfStatus("Leyendo documento..."); setPreview(null);
    try {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload  = () => res(r.result.split(",")[1]);
        r.onerror = () => rej(new Error("Error al leer el archivo"));
        r.readAsDataURL(pdfFile);
      });
      const isPdf = pdfFile.name.toLowerCase().endsWith(".pdf");
      const isDocx = pdfFile.name.toLowerCase().endsWith(".docx") || pdfFile.name.toLowerCase().endsWith(".doc");
      if (!isPdf && !isDocx) { setPdfStatus("Formato no soportado. Usa PDF o Word (.docx)."); setPdfGenerating(false); return; }
      setPdfStatus("Generando preguntas con IA...");
      const prompt = "Eres experto en histología médica. Lee el documento adjunto y genera exactamente "+pdfCount+" preguntas de opción múltiple de nivel \""+pdfDiff+"\" basadas en su contenido, sobre el tema \""+pdfTopic+"\".\n"+
        "Responde SOLO con un array JSON sin texto extra ni backticks:\n"+
        "[{\"question\":\"...\",\"options\":[\"...\",\"...\",\"...\",\"...\"],\"answer\":0,\"explanation\":\"...\"}]\n"+
        "\"answer\" es el índice 0-3 de la opción correcta. Explicaciones breves (máx 2 frases).";
      const res = await fetch("/api/generate-questions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    prompt,
    fileBase64: b64,
    fileName: pdfFile.name,
    mimeType: isPdf
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  })
});

if (!res.ok) {
  const err = await res.text();
  throw new Error("HTTP " + res.status + ": " + err.slice(0, 200));
}

const data = await res.json();
if (!data.text) throw new Error("Respuesta inesperada: " + JSON.stringify(data).slice(0, 200));
const text = data.text;
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("No se encontró JSON en la respuesta.");
      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed)||!parsed.length) throw new Error("La IA no devolvió preguntas válidas.");
      const questions = parsed.map((q,i)=>({...q, difficulty:pdfDiff, topic:pdfTopic, id:Date.now()+i, image:null, explanationImage:null, supervised:false}));
      setPreview(questions);
      setPdfStatus("Se generaron "+questions.length+" preguntas. Revísalas antes de añadir.");
    } catch(e) { setPdfStatus("Error: "+e.message); }
    setPdfGenerating(false);
  };

  const addPreview = () => {
    updateDb([...db, ...preview]);
    setPreview(null); setPdfStatus("Se añadieron "+preview.length+" preguntas al banco.");
    setPdfFile(null); setPdfName("");
  };

  // ── Excel/CSV handler ──
  const handleExcel = async e => {
    const f = e.target.files[0]; if (!f) return;
    setXlStatus("Procesando...");
    const isCsv = f.name.toLowerCase().endsWith(".csv");
    try {
      if (isCsv) {
        const text = await f.text();
        const rows = text.split("\n").map(r=>r.split(",").map(c=>c.trim().replace(/^"|"$/g,"")));
        const header = rows[0].map(h=>h.toLowerCase().trim());
        const qi=header.indexOf("pregunta"), o1=header.indexOf("opcion_a"), o2=header.indexOf("opcion_b"), o3=header.indexOf("opcion_c"), o4=header.indexOf("opcion_d");
        const ai=header.indexOf("respuesta"), di=header.indexOf("dificultad"), ti=header.indexOf("tema"), ei=header.indexOf("explicacion");
        if (qi<0||o1<0||o2<0||o3<0||o4<0||ai<0) throw new Error("Columnas requeridas: pregunta, opcion_a, opcion_b, opcion_c, opcion_d, respuesta");
        const ansMap = {a:0,b:1,c:2,d:3,"0":0,"1":1,"2":2,"3":3};
        const newQs = rows.slice(1).filter(r=>r[qi]&&r[qi].length>2).map((r,i)=>({
          id:Date.now()+i, question:r[qi], options:[r[o1],r[o2],r[o3],r[o4]],
          answer: ansMap[(r[ai]||"a").toLowerCase()]??0,
          difficulty: di>=0&&DIFFS.includes(r[di]) ? r[di] : "básico",
          topic: ti>=0&&TOPICS.includes(r[ti]) ? r[ti] : TOPICS[0],
          explanation: ei>=0 ? r[ei] : "", image:null, explanationImage:null, supervised:false
        }));
        if (!newQs.length) throw new Error("No se encontraron filas válidas.");
        updateDb([...db,...newQs]);
        setXlStatus("Se importaron "+newQs.length+" preguntas correctamente.");
      } else {
        // Excel via SheetJS
        const { read, utils } = await import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs");
        const ab = await f.arrayBuffer();
        const wb = read(ab);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = utils.sheet_to_json(ws, {defval:""});
        const ansMap = {a:0,b:1,c:2,d:3,A:0,B:1,C:2,D:3,"0":0,"1":1,"2":2,"3":3};
        const newQs = rows.filter(r=>r["pregunta"]||r["Pregunta"]).map((r,i)=>{
          const q = r["pregunta"]||r["Pregunta"]||"";
          const opts = [r["opcion_a"]||r["Opcion_A"]||r["A"]||"", r["opcion_b"]||r["Opcion_B"]||r["B"]||"", r["opcion_c"]||r["Opcion_C"]||r["C"]||"", r["opcion_d"]||r["Opcion_D"]||r["D"]||""];
          const ans  = String(r["respuesta"]||r["Respuesta"]||"a").trim();
          const diff = r["dificultad"]||r["Dificultad"]||"básico";
          const top  = r["tema"]||r["Tema"]||TOPICS[0];
          const expl = r["explicacion"]||r["Explicacion"]||r["explanation"]||"";
          return { id:Date.now()+i, question:q, options:opts, answer:ansMap[ans]??0,
            difficulty:DIFFS.includes(diff)?diff:"básico", topic:TOPICS.includes(top)?top:TOPICS[0],
            explanation:expl, image:null, explanationImage:null, supervised:false };
        }).filter(q=>q.question.length>2);
        if (!newQs.length) throw new Error("No se encontraron filas válidas. Revisa los nombres de columnas.");
        updateDb([...db,...newQs]);
        setXlStatus("Se importaron "+newQs.length+" preguntas correctamente.");
      }
    } catch(e) { setXlStatus("Error: "+e.message); }
    xlRef.current.value="";
  };

  return (
    <div>
      {/* tabs */}
      <div style={{display:"flex",gap:8,marginBottom:"1.5rem"}}>
        {[["📄 PDF / Word","pdf"],["📊 Excel / CSV","excel"]].map(([l,v])=>(
          <button key={v} onClick={()=>setTab(v)}
            style={{padding:"6px 16px",borderRadius:"var(--border-radius-md)",fontSize:13,cursor:"pointer",
              background:tab===v?"var(--color-background-info)":"transparent",
              color:tab===v?"var(--color-text-info)":"var(--color-text-secondary)",
              border:tab===v?"0.5px solid var(--color-border-info)":"0.5px solid var(--color-border-tertiary)"}}>
            {l}
          </button>
        ))}
      </div>

      {tab==="pdf" && (
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"14px 16px",fontSize:13,color:"var(--color-text-secondary)",lineHeight:1.7}}>
            Sube un PDF o Word con contenido de histología. La IA leerá el documento y generará preguntas basándose en él.
          </div>

          {/* File picker */}
          <div onClick={()=>pdfRef.current.click()} style={{border:"1.5px dashed var(--color-border-tertiary)",borderRadius:"var(--border-radius-md)",padding:"24px",textAlign:"center",cursor:"pointer",background:"var(--color-background-primary)"}}>
            <div style={{fontSize:28,marginBottom:6}}>📄</div>
            <div style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)",marginBottom:4}}>{pdfName||"Haz clic para seleccionar un archivo"}</div>
            <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>PDF o Word (.docx)</div>
            <input ref={pdfRef} type="file" accept=".pdf,.doc,.docx" onChange={handlePdfFile} style={{display:"none"}} />
          </div>

          {/* Options */}
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
            <select value={pdfDiff} onChange={e=>setPdfDiff(e.target.value)}
              style={{fontSize:13,padding:"6px 8px",borderRadius:"var(--border-radius-md)",border:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)"}}>
              {DIFFS.map(d=><option key={d} value={d}>{d}</option>)}
            </select>
            <select value={pdfTopic} onChange={e=>setPdfTopic(e.target.value)}
              style={{flex:1,minWidth:160,fontSize:13,padding:"6px 8px",borderRadius:"var(--border-radius-md)",border:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)"}}>
              {TOPICS.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            <select value={pdfCount} onChange={e=>setPdfCount(Number(e.target.value))}
              style={{fontSize:13,padding:"6px 8px",borderRadius:"var(--border-radius-md)",border:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)"}}>
              {[3,5,8,10].map(n=><option key={n} value={n}>{n} preguntas</option>)}
            </select>
            <button onClick={generateFromDoc} disabled={!pdfFile||pdfGenerating}
              style={{padding:"7px 18px",borderRadius:"var(--border-radius-md)",fontSize:13,fontWeight:500,
                cursor:(!pdfFile||pdfGenerating)?"not-allowed":"pointer",opacity:(!pdfFile||pdfGenerating)?0.5:1,
                background:"var(--color-background-info)",color:"var(--color-text-info)",border:"0.5px solid var(--color-border-info)"}}>
              {pdfGenerating?"Procesando...":"Generar preguntas"}
            </button>
          </div>

          {pdfStatus && <p style={{fontSize:12,margin:0,color:pdfStatus.startsWith("Error")?"#C0392B":pdfStatus.startsWith("Se generaron")?"#BA7517":"#0F6E56"}}>{pdfStatus}</p>}

          {/* Preview */}
          {preview && (
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <span style={{fontSize:13,fontWeight:600,color:"var(--color-text-primary)"}}>Previsualización — {preview.length} preguntas</span>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={addPreview}
                    style={{fontSize:13,padding:"6px 16px",borderRadius:"var(--border-radius-md)",cursor:"pointer",fontWeight:500,
                      background:"var(--color-background-success)",color:"var(--color-text-success)",border:"0.5px solid var(--color-border-success)"}}>
                    Añadir al banco
                  </button>
                  <button onClick={()=>setPreview(null)}
                    style={{fontSize:13,padding:"6px 12px",borderRadius:"var(--border-radius-md)",cursor:"pointer",
                      background:"transparent",color:"var(--color-text-secondary)",border:"0.5px solid var(--color-border-tertiary)"}}>
                    Descartar
                  </button>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {preview.map((q,i)=>{
                  const ds=diffStyle(q.difficulty);
                  return (
                    <div key={i} style={{padding:"10px 14px",borderRadius:"var(--border-radius-md)",border:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)"}}>
                      <div style={{fontSize:13,color:"var(--color-text-primary)",marginBottom:6,lineHeight:1.4}}>{i+1}. {q.question}</div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                        <span style={{fontSize:11,padding:"2px 8px",borderRadius:4,fontWeight:600,background:ds.bg,color:ds.color}}>{q.difficulty}</span>
                        <span style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:"var(--color-background-secondary)",color:"var(--color-text-secondary)",border:"0.5px solid var(--color-border-tertiary)"}}>{q.topic}</span>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:3}}>
                        {q.options.map((opt,j)=>(
                          <div key={j} style={{fontSize:12,color:j===q.answer?"#0F6E56":"var(--color-text-secondary)",fontWeight:j===q.answer?600:400}}>
                            {["A","B","C","D"][j]}. {opt} {j===q.answer&&"✓"}
                          </div>
                        ))}
                      </div>
                      {q.explanation&&<div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:6,fontStyle:"italic"}}>{q.explanation}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab==="excel" && (
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"14px 16px",fontSize:13,color:"var(--color-text-secondary)",lineHeight:1.7}}>
            Importa preguntas desde un archivo Excel (.xlsx) o CSV. Las columnas deben llamarse:<br/>
            <code style={{background:"#f0f0f0",padding:"1px 5px",borderRadius:3,fontSize:12,color:"#333"}}>pregunta, opcion_a, opcion_b, opcion_c, opcion_d, respuesta, dificultad, tema, explicacion</code><br/>
            El campo <strong>respuesta</strong> acepta A/B/C/D o 0/1/2/3. <strong>dificultad</strong>: básico/intermedio/avanzado.
          </div>

          {/* Plantilla descargable */}
          <button onClick={()=>{
            const csv = "pregunta,opcion_a,opcion_b,opcion_c,opcion_d,respuesta,dificultad,tema,explicacion\n"+
              "Ejemplo de pregunta,Opción A,Opción B,Opción C,Opción D,A,básico,Histología general,Explicación aquí\n";
            const a = document.createElement("a"); a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
            a.download="plantilla_preguntas.csv"; a.click();
          }} style={{alignSelf:"flex-start",fontSize:12,padding:"5px 14px",borderRadius:"var(--border-radius-md)",cursor:"pointer",
            background:"transparent",color:"var(--color-text-secondary)",border:"0.5px solid var(--color-border-tertiary)"}}>
            Descargar plantilla CSV
          </button>

          <div onClick={()=>xlRef.current.click()} style={{border:"1.5px dashed var(--color-border-tertiary)",borderRadius:"var(--border-radius-md)",padding:"24px",textAlign:"center",cursor:"pointer",background:"var(--color-background-primary)"}}>
            <div style={{fontSize:28,marginBottom:6}}>📊</div>
            <div style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)",marginBottom:4}}>Haz clic para seleccionar un archivo</div>
            <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>Excel (.xlsx) o CSV (.csv)</div>
            <input ref={xlRef} type="file" accept=".xlsx,.csv" onChange={handleExcel} style={{display:"none"}} />
          </div>

          {xlStatus && <p style={{fontSize:12,margin:0,color:xlStatus.startsWith("Error")?"#C0392B":"#0F6E56"}}>{xlStatus}</p>}
        </div>
      )}
    </div>
  );
}

// ─── TEACHER MODE ─────────────────────────────────────────────────────────────
function TeacherMode({ db, updateDb, isSupervisor }) {
  const [view, setView]             = useState("stats");
  const [editing, setEditing]       = useState(null);
  const [sessions, setSessions]     = useState([]);
  const [generating, setGenerating] = useState(false);
  const [genTopic, setGenTopic]     = useState("");
  const [genDiff, setGenDiff]       = useState("básico");
  const [genCount, setGenCount]     = useState(3);
  const [genMsg, setGenMsg]         = useState("");
  const [confirmDelete, setConfirmDelete]   = useState(null);
  const [filterSupervised, setFilterSupervised] = useState("todas");
  const [filterTopic, setFilterTopic]           = useState("todos");
  const [rankPeriod, setRankPeriod]             = useState("week");
  const [form, setForm] = useState({difficulty:"básico",topic:TOPICS[0],question:"",options:["","","",""],answer:0,explanation:"",image:null});
  const fileRef    = useRef();
  const explImgRef = useRef();
  const { save, load } = useStorage();

  useEffect(() => { load("histo_sessions", [], true).then(setSessions); }, []);

  const resetForm = () => setForm({difficulty:"básico",topic:TOPICS[0],question:"",options:["","","",""],answer:0,explanation:"",explanationImage:null,image:null});
  const openNew  = () => { resetForm(); setEditing(null); setView("edit"); };
  const openEdit = q => {
    setForm({difficulty:q.difficulty,topic:q.topic||TOPICS[0],question:q.question,
      options:[...q.options],answer:q.answer,explanation:q.explanation,
      explanationImage:q.explanationImage||null,image:q.image||null});
    setEditing(q.id); setView("edit");
  };
  const del = id => { updateDb(db.filter(q => q.id!==id)); setConfirmDelete(null); };
  const saveQ = () => {
    if (!form.question.trim() || form.options.some(o => !o.trim())) { alert("Completa todos los campos."); return; }
    if (editing) updateDb(db.map(q => q.id===editing ? {...q,...form,supervised:false} : q));
    else updateDb([...db, {...form,id:Date.now(),supervised:false}]);
    setView("list");
  };
  const handleImg = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = ev => setForm(f => ({...f,image:ev.target.result})); r.readAsDataURL(f);
  };
  const handleExplImg = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = ev => setForm(f => ({...f,explanationImage:ev.target.result})); r.readAsDataURL(f);
  };
  const toggleSupervised = id => updateDb(db.map(q => q.id===id ? {...q,supervised:!q.supervised} : q));

  const generateAI = async () => {
    if (!genTopic.trim()) { setGenMsg("Indica un tema."); return; }
    setGenerating(true); setGenMsg("Generando con IA...");
    try {
      const prompt = "Eres experto en histología médica. Genera exactamente "+genCount+" preguntas de nivel \""+genDiff+"\" sobre: \""+genTopic+"\".\n"+
        "Responde SOLO con un array JSON sin texto extra ni backticks:\n"+
        "[{\"question\":\"...\",\"options\":[\"...\",\"...\",\"...\",\"...\"],\"answer\":0,\"explanation\":\"...\",\"difficulty\":\""+genDiff+"\"}]\n"+
        "\"answer\" es el índice 0-3. Explicaciones breves (máx 2 frases).";
      const res = await fetch("/api/generate-questions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt })
});

if (!res.ok) {
  const err = await res.text();
  throw new Error("HTTP " + res.status + ": " + err.slice(0, 200));
}

const data = await res.json();
if (!data.text) throw new Error("Respuesta inesperada: " + JSON.stringify(data).slice(0, 200));
const text = data.text;
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("No se encontró JSON en: "+text.slice(0,200));
      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed)) throw new Error("El JSON no es un array.");
      const newQs  = parsed.map((q,i) => ({...q,difficulty:genDiff,topic:genTopic,id:Date.now()+i,image:null,supervised:false}));
      updateDb([...db,...newQs]);
      setGenMsg("Se añadieron "+newQs.length+" preguntas (pendientes de supervisión).");
    } catch(e) { setGenMsg("Error: "+e.message); }
    setGenerating(false);
  };

  const Nav = () => (
    <div style={{display:"flex",gap:8,marginBottom:"1.5rem",flexWrap:"wrap"}}>
      {[["Estadísticas","stats"],["Ranking","ranking"],["Preguntas","list"],["Generar IA","generate"],["Importar","import"]].map(([l,v]) => (
        <button key={v} onClick={() => setView(v)}
          style={{padding:"6px 14px",borderRadius:"var(--border-radius-md)",fontSize:13,cursor:"pointer",
            background:view===v?"var(--color-background-info)":"transparent",
            color:view===v?"var(--color-text-info)":"var(--color-text-secondary)",
            border:view===v?"0.5px solid var(--color-border-info)":"0.5px solid var(--color-border-tertiary)"}}>
          {l}
        </button>
      ))}
    </div>
  );

  // ── Stats ──
  if (view==="stats") {
    const allA        = sessions.flatMap(s => s.answers||[]);
    const students    = [...new Set(sessions.map(s => s.student))];
    const totalTime   = sessions.reduce((a,s) => a+(s.durationMs||0), 0);
    const qStats = {};
    allA.forEach(a => {
      if (!qStats[a.questionId]) qStats[a.questionId]={question:a.question,difficulty:a.difficulty,total:0,correct:0,conf:[0,0,0]};
      qStats[a.questionId].total++;
      if (a.correct) qStats[a.questionId].correct++;
      if (a.confidence!=null) qStats[a.questionId].conf[a.confidence]++;
    });
    const qList = Object.values(qStats).sort((a,b) => (a.correct/a.total)-(b.correct/b.total));
    const stuStats = {};
    sessions.forEach(s => {
      if (!stuStats[s.student]) stuStats[s.student]={name:s.student,sessions:0,totalTime:0,correct:0,total:0};
      stuStats[s.student].sessions++;
      stuStats[s.student].totalTime += s.durationMs||0;
      (s.answers||[]).forEach(a => { stuStats[s.student].total++; if (a.correct) stuStats[s.student].correct++; });
    });
    const stuList    = Object.values(stuStats).sort((a,b) => b.sessions-a.sessions);
    const confTotals = [0,1,2].map(i => allA.filter(a => a.confidence===i).length);
    const confCorrect= [0,1,2].map(i => allA.filter(a => a.confidence===i&&a.correct).length);
    const supervised = db.filter(q => q.supervised).length;

    return (
      <div>
        <Nav />
        <div style={{display:"flex",gap:8,marginBottom:"1rem",padding:"10px 14px",borderRadius:"var(--border-radius-md)",
          background:"#F0EAF9",border:"0.5px solid #C9A8F0",fontSize:13,alignItems:"center"}}>
          <span><strong>{supervised}/{db.length}</strong> preguntas supervisadas</span>
          <div style={{flex:1,height:6,borderRadius:3,background:"#ddd",overflow:"hidden",marginLeft:8}}>
            <div style={{width:(db.length?supervised/db.length*100:0)+"%",height:"100%",background:"#7B4FBE",borderRadius:3}} />
          </div>
        </div>
        {sessions.length===0
          ? <div style={{padding:"2rem",textAlign:"center",color:"var(--color-text-secondary)",background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)"}}>Sin datos de sesiones aún.</div>
          : (<>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:"1.5rem"}}>
              {[[sessions.length+"","Sesiones","#378ADD"],[students.length+"","Alumnos","#1D9E75"],
                [fmt(totalTime),"Tiempo total","#BA7517"],
                [Math.round(allA.filter(a=>a.correct).length/Math.max(allA.length,1)*100)+"%","Acierto global","#7B4FBE"]
              ].map(([v,l,c]) => (
                <div key={l} style={{flex:1,minWidth:100,background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"12px 14px"}}>
                  <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:4}}>{l}</div>
                  <div style={{fontSize:22,fontWeight:700,color:c}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"14px 16px",marginBottom:"1.25rem"}}>
              <p style={{fontSize:13,fontWeight:600,margin:"0 0 12px"}}>Seguridad vs Acierto</p>
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                {[0,1,2].map(i => (
                  <div key={i} style={{flex:1,minWidth:90,background:"var(--color-background-primary)",borderRadius:"var(--border-radius-md)",padding:"10px 12px",borderLeft:"3px solid "+CONFIDENCE[i].color}}>
                    <div style={{fontSize:12,fontWeight:600,color:CONFIDENCE[i].color,marginBottom:6}}>{CONFIDENCE[i].icon} {CONFIDENCE[i].label}</div>
                    <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>Resp: <strong>{confTotals[i]}</strong></div>
                    <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>Acierto: <strong style={{color:CONFIDENCE[i].color}}>{confTotals[i]?Math.round(confCorrect[i]/confTotals[i]*100):0}%</strong></div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"14px 16px",marginBottom:"1.25rem"}}>
              <p style={{fontSize:13,fontWeight:600,margin:"0 0 12px"}}>Preguntas más falladas</p>
              {qList.slice(0,5).map((q,i) => {
                const pct = Math.round(q.correct/q.total*100);
                const ds  = diffStyle(q.difficulty);
                return (
                  <div key={i} style={{marginBottom:10,paddingBottom:10,borderBottom:i<4?"0.5px solid var(--color-border-tertiary)":"none"}}>
                    <div style={{display:"flex",justifyContent:"space-between",gap:8,marginBottom:4}}>
                      <span style={{fontSize:13,flex:1,lineHeight:1.4}}>{q.question}</span>
                      <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:4,background:ds.bg,color:ds.color,flexShrink:0}}>{q.difficulty}</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{flex:1,height:6,borderRadius:3,background:"var(--color-border-tertiary)",overflow:"hidden"}}>
                        <div style={{width:pct+"%",height:"100%",background:pct>=70?"#1D9E75":pct>=40?"#F5C518":"#C0392B",borderRadius:3}} />
                      </div>
                      <span style={{fontSize:12,fontWeight:600,color:pct>=70?"#1D9E75":pct>=40?"#BA7517":"#C0392B",minWidth:36}}>{pct}%</span>
                      <span style={{fontSize:11,color:"var(--color-text-secondary)"}}>{q.total} resp.</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"14px 16px",marginBottom:"1.25rem"}}>
              <p style={{fontSize:13,fontWeight:600,margin:"0 0 12px"}}>Alumnos</p>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead>
                  <tr style={{color:"var(--color-text-secondary)",fontSize:11}}>
                    {["Alumno","Sesiones","Tiempo","Acierto"].map(h => <th key={h} style={{textAlign:"left",padding:"4px 8px",fontWeight:500}}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {stuList.map((s,i) => {
                    const pct = s.total ? Math.round(s.correct/s.total*100) : 0;
                    return (
                      <tr key={i} style={{borderTop:"0.5px solid var(--color-border-tertiary)"}}>
                        <td style={{padding:"8px",fontWeight:500}}>{s.name}</td>
                        <td style={{padding:"8px",color:"var(--color-text-secondary)"}}>{s.sessions}</td>
                        <td style={{padding:"8px",color:"var(--color-text-secondary)"}}>{fmt(s.totalTime)}</td>
                        <td style={{padding:"8px",fontWeight:600,color:pct>=70?"#1D9E75":pct>=40?"#BA7517":"#C0392B"}}>{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"14px 16px"}}>
              <p style={{fontSize:13,fontWeight:600,margin:"0 0 12px"}}>Historial de sesiones</p>
              {[...sessions].reverse().slice(0,10).map((s,i) => {
                const ans = s.answers||[];
                const ok  = ans.filter(a => a.correct).length;
                const pct = ans.length ? Math.round(ok/ans.length*100) : 0;
                return (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",
                    borderRadius:"var(--border-radius-md)",background:"var(--color-background-primary)",fontSize:13,marginBottom:6}}>
                    <span style={{flex:1,fontWeight:500}}>{s.student}</span>
                    <span style={{color:"var(--color-text-secondary)",fontSize:12}}>
                      {new Date(s.date).toLocaleDateString("es-ES",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}
                    </span>
                    <span style={{color:"var(--color-text-secondary)",fontSize:12}}>{fmt(s.durationMs||0)}</span>
                    <span style={{fontSize:12,fontWeight:600,padding:"2px 10px",borderRadius:10,
                      background:pct>=70?"#E1F5EE":pct>=40?"#FEF3DC":"#FAECE7",
                      color:pct>=70?"#0F6E56":pct>=40?"#7A4A00":"#993C1D"}}>
                      {pct}% · {ans.length}p
                    </span>
                  </div>
                );
              })}
            </div>
          </>)
        }
      </div>
    );
  }

  // ── Ranking ──
  if (view==="ranking") {
    const now    = new Date().toISOString();
    const curKey = periodKey(now, rankPeriod);
    const periodSessions = sessions.filter(s => periodKey(s.date, rankPeriod)===curKey);
    const stuPoints = {};
    periodSessions.forEach(s => {
      if (!stuPoints[s.student]) stuPoints[s.student]={name:s.student,points:0,sessions:0,correct:0,total:0,bonuses:0};
      const sc = s.points != null ? s.points : calcSessionScore(s.answers||[]).points;
      const bn = s.bonuses != null ? s.bonuses : calcSessionScore(s.answers||[]).bonuses;
      stuPoints[s.student].points   = Math.round((stuPoints[s.student].points + sc)*100)/100;
      stuPoints[s.student].sessions++;
      stuPoints[s.student].bonuses += bn;
      (s.answers||[]).forEach(a => { stuPoints[s.student].total++; if (a.correct) stuPoints[s.student].correct++; });
    });
    const ranking = Object.values(stuPoints).sort((a,b) => b.points-a.points);
    const medals  = ["🥇","🥈","🥉"];
    const periodLabel = {week:"Esta semana",month:"Este mes",year:"Este año"};
    return (
      <div>
        <Nav />
        <div style={{display:"flex",gap:8,marginBottom:"1.25rem"}}>
          {["week","month","year"].map(p => (
            <button key={p} onClick={() => setRankPeriod(p)}
              style={{padding:"6px 16px",borderRadius:20,fontSize:13,cursor:"pointer",
                fontWeight:rankPeriod===p?600:400,
                background:rankPeriod===p?"#F0EAF9":"transparent",
                color:rankPeriod===p?"#7B4FBE":"var(--color-text-secondary)",
                border:rankPeriod===p?"0.5px solid #C9A8F0":"0.5px solid var(--color-border-tertiary)"}}>
              {periodLabel[p]}
            </button>
          ))}
        </div>
        {ranking.length===0
          ? <div style={{padding:"2rem",textAlign:"center",color:"var(--color-text-secondary)",background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)"}}>Sin datos para este período.</div>
          : (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {ranking.map((s,i) => {
                const pct = s.total ? Math.round(s.correct/s.total*100) : 0;
                const isTop = i < 3;
                return (
                  <div key={s.name} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",
                    borderRadius:"var(--border-radius-md)",
                    border:"0.5px solid "+(isTop?"#C9A8F0":"var(--color-border-tertiary)"),
                    background:i===0?"#F0EAF9":i===1?"#F7F4FD":i===2?"#FAF8FF":"var(--color-background-primary)"}}>
                    <span style={{fontSize:i<3?24:15,minWidth:32,textAlign:"center"}}>{i<3?medals[i]:(i+1)+". "}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:600,color:"var(--color-text-primary)",marginBottom:2}}>{s.name}</div>
                      <div style={{fontSize:11,color:"var(--color-text-secondary)",display:"flex",gap:10,flexWrap:"wrap"}}>
                        <span>{s.sessions} sesión{s.sessions!==1?"es":""}</span>
                        <span>{pct}% acierto</span>
                        {s.bonuses>0 && <span>🔥 {s.bonuses} bonus</span>}
                      </div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:20,fontWeight:700,color:"#7B4FBE"}}>{s.points>0?"+":""}{s.points}</div>
                      <div style={{fontSize:10,color:"#8B6AC7"}}>puntos</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        }
        <div style={{marginTop:"1.25rem",padding:"10px 14px",borderRadius:"var(--border-radius-md)",
          background:"var(--color-background-secondary)",fontSize:11,color:"var(--color-text-secondary)",lineHeight:1.8}}>
          <strong style={{color:"var(--color-text-primary)"}}>Sistema de puntuación:</strong><br/>
          Acierto: +1 pt × seguridad (Alto x2 / Medio x1 / Bajo x0.6)<br/>
          Error: -0.33 pts × seguridad<br/>
          Bonus: +1 pt cada 5 aciertos consecutivos
        </div>
      </div>
    );
  }

  // ── Import ──
  if (view==="import") return <ImportView db={db} updateDb={updateDb} genDiff={genDiff} setGenDiff={setGenDiff} />;

  // ── Generate ──
  if (view==="generate") return (
    <div>
      <Nav />
      <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-lg)",padding:"1rem 1.25rem"}}>
        <h4 style={{fontSize:14,fontWeight:600,margin:"0 0 4px"}}>Generar preguntas con IA</h4>
        <p style={{fontSize:12,color:"#BA7517",margin:"0 0 12px"}}>Las preguntas generadas quedan pendientes de supervisión.</p>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",marginBottom:10}}>
          <input value={genTopic} onChange={e => setGenTopic(e.target.value)} placeholder="Tema (ej: epitelio intestinal...)"
            style={{flex:2,minWidth:160,fontSize:13,padding:"6px 10px",borderRadius:"var(--border-radius-md)",
              border:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)"}} />
          <select value={genDiff} onChange={e => setGenDiff(e.target.value)}
            style={{fontSize:13,padding:"6px 8px",borderRadius:"var(--border-radius-md)",
              border:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)"}}>
            {DIFFS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={genCount} onChange={e => setGenCount(Number(e.target.value))}
            style={{fontSize:13,padding:"6px 8px",borderRadius:"var(--border-radius-md)",
              border:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)"}}>
            {[1,2,3,5].map(n => <option key={n} value={n}>{n} pregunta{n>1?"s":""}</option>)}
          </select>
          <button onClick={generateAI} disabled={generating}
            style={{padding:"6px 16px",borderRadius:"var(--border-radius-md)",fontSize:13,fontWeight:500,
              cursor:generating?"not-allowed":"pointer",opacity:generating?0.6:1,
              background:"var(--color-background-info)",color:"var(--color-text-info)",border:"0.5px solid var(--color-border-info)"}}>
            {generating?"Generando...":"Generar"}
          </button>
        </div>
        {genMsg && <p style={{fontSize:12,color:genMsg.startsWith("Se añadieron")?"var(--color-text-success)":"var(--color-text-danger)",margin:0}}>{genMsg}</p>}
      </div>
    </div>
  );

  // ── Edit ──
  if (view==="edit") return (
    <div>
      <button onClick={() => setView("list")}
        style={{fontSize:13,color:"var(--color-text-secondary)",background:"none",border:"none",cursor:"pointer",padding:0,marginBottom:"1rem"}}>
        Volver
      </button>
      <h3 style={{fontSize:16,fontWeight:500,marginBottom:"1rem"}}>{editing?"Editar":"Nueva"} pregunta</h3>
      {editing && <p style={{fontSize:12,color:"#BA7517",marginBottom:"1rem"}}>Editar esta pregunta la marcará como pendiente de supervisión.</p>}
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:13,color:"var(--color-text-secondary)",minWidth:80}}>Dificultad</span>
            <select value={form.difficulty} onChange={e => setForm(f => ({...f,difficulty:e.target.value}))}
              style={{fontSize:13,padding:"4px 8px",borderRadius:"var(--border-radius-md)",
                border:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)"}}>
              {DIFFS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flex:1}}>
            <span style={{fontSize:13,color:"var(--color-text-secondary)",minWidth:40}}>Tema</span>
            <select value={form.topic||TOPICS[0]} onChange={e => setForm(f => ({...f,topic:e.target.value}))}
              style={{flex:1,fontSize:13,padding:"4px 8px",borderRadius:"var(--border-radius-md)",
                border:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)"}}>
              {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div>
          <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:4}}>Pregunta</div>
          <textarea value={form.question} onChange={e => setForm(f => ({...f,question:e.target.value}))} rows={3}
            style={{width:"100%",fontSize:13,padding:"8px 10px",borderRadius:"var(--border-radius-md)",
              border:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)",
              color:"var(--color-text-primary)",resize:"vertical",boxSizing:"border-box"}} />
        </div>
        <div>
          <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:4}}>Opciones (marca la correcta)</div>
          {form.options.map((opt,i) => (
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <input type="radio" name="correct" checked={form.answer===i} onChange={() => setForm(f => ({...f,answer:i}))} />
              <input value={opt} onChange={e => { const opts=[...form.options]; opts[i]=e.target.value; setForm(f => ({...f,options:opts})); }}
                placeholder={"Opción "+(i+1)}
                style={{flex:1,fontSize:13,padding:"6px 10px",borderRadius:"var(--border-radius-md)",
                  border:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)"}} />
            </div>
          ))}
        </div>
        <div>
          <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:4}}>Explicación</div>
          <textarea value={form.explanation} onChange={e => setForm(f => ({...f,explanation:e.target.value}))} rows={3}
            style={{width:"100%",fontSize:13,padding:"8px 10px",borderRadius:"var(--border-radius-md)",
              border:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)",
              color:"var(--color-text-primary)",resize:"vertical",boxSizing:"border-box"}} />
          <div style={{fontSize:12,color:"var(--color-text-secondary)",margin:"8px 0 4px"}}>Imagen de la explicación (opcional)</div>
          {form.explanationImage && (
            <img src={form.explanationImage} alt="preview explicación"
              style={{width:"100%",maxHeight:180,objectFit:"contain",borderRadius:"var(--border-radius-md)",marginBottom:6,border:"0.5px solid var(--color-border-tertiary)",background:"#f8f8f8"}} />
          )}
          <div style={{display:"flex",gap:8}}>
            <button onClick={() => explImgRef.current.click()}
              style={{fontSize:12,padding:"4px 12px",borderRadius:"var(--border-radius-md)",cursor:"pointer",
                background:"transparent",color:"var(--color-text-primary)",border:"0.5px solid var(--color-border-tertiary)"}}>
              Subir imagen
            </button>
            {form.explanationImage && (
              <button onClick={() => setForm(f => ({...f,explanationImage:null}))}
                style={{fontSize:12,padding:"4px 12px",borderRadius:"var(--border-radius-md)",cursor:"pointer",
                  background:"transparent",color:"var(--color-text-danger)",border:"0.5px solid var(--color-border-danger)"}}>
                Eliminar
              </button>
            )}
          </div>
          <input ref={explImgRef} type="file" accept="image/*" onChange={handleExplImg} style={{display:"none"}} />
        </div>
        <div>
          <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:6}}>Imagen (opcional)</div>
          {form.image && <img src={form.image} alt="" style={{width:"100%",maxHeight:200,objectFit:"cover",borderRadius:"var(--border-radius-md)",marginBottom:8}} />}
          <input ref={fileRef} type="file" accept="image/*" onChange={handleImg} style={{display:"none"}} />
          <div style={{display:"flex",gap:8}}>
            <button onClick={() => fileRef.current.click()}
              style={{fontSize:13,padding:"6px 14px",borderRadius:"var(--border-radius-md)",cursor:"pointer",
                background:"transparent",color:"var(--color-text-primary)",border:"0.5px solid var(--color-border-tertiary)"}}>
              Subir imagen
            </button>
            {form.image && (
              <button onClick={() => setForm(f => ({...f,image:null}))}
                style={{fontSize:13,padding:"6px 14px",borderRadius:"var(--border-radius-md)",cursor:"pointer",
                  background:"transparent",color:"var(--color-text-danger)",border:"0.5px solid var(--color-border-danger)"}}>
                Eliminar
              </button>
            )}
          </div>
        </div>
        <div style={{display:"flex",gap:8,paddingTop:8}}>
          <button onClick={saveQ}
            style={{padding:"7px 20px",borderRadius:"var(--border-radius-md)",fontSize:13,fontWeight:500,cursor:"pointer",
              background:"var(--color-background-success)",color:"var(--color-text-success)",border:"0.5px solid var(--color-border-success)"}}>
            Guardar
          </button>
          <button onClick={() => setView("list")}
            style={{padding:"7px 16px",borderRadius:"var(--border-radius-md)",fontSize:13,cursor:"pointer",
              background:"transparent",color:"var(--color-text-secondary)",border:"0.5px solid var(--color-border-tertiary)"}}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );

  // ── List ──
  const supervised  = db.filter(q => q.supervised).length;
  const usedTopics  = [...new Set(db.map(q => q.topic).filter(Boolean))].sort();
  const filteredDb  = db.filter(q => {
    const supOk   = filterSupervised==="todas" || (filterSupervised==="supervisadas"&&q.supervised) || (filterSupervised==="pendientes"&&!q.supervised);
    const topicOk = filterTopic==="todos" || q.topic===filterTopic;
    return supOk && topicOk;
  });
  return (
    <div>
      <Nav />
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem",flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:13,color:"var(--color-text-secondary)"}}>
          {db.length} preguntas ·{" "}
          <span style={{color:"#0F6E56",fontWeight:600}}>{supervised} supervisadas</span> ·{" "}
          <span style={{color:"#BA7517",fontWeight:600}}>{db.length-supervised} pendientes</span>
        </div>
        <button onClick={openNew}
          style={{padding:"6px 14px",borderRadius:"var(--border-radius-md)",fontSize:13,fontWeight:500,cursor:"pointer",
            background:"var(--color-background-success)",color:"var(--color-text-success)",border:"0.5px solid var(--color-border-success)"}}>
          + Nueva
        </button>
      </div>

      <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"12px 14px",marginBottom:"1rem",display:"flex",flexDirection:"column",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)",minWidth:80}}>Supervisión:</span>
          {[["todas","Todas"],["supervisadas","Supervisadas"],["pendientes","Pendientes"]].map(([v,l]) => (
            <button key={v} onClick={() => setFilterSupervised(v)}
              style={{fontSize:12,padding:"3px 12px",borderRadius:20,cursor:"pointer",
                fontWeight:filterSupervised===v?600:400,
                background:filterSupervised===v?(v==="supervisadas"?"#E1F5EE":v==="pendientes"?"#FEF3DC":"var(--color-background-primary)"):"transparent",
                color:filterSupervised===v?(v==="supervisadas"?"#0F6E56":v==="pendientes"?"#7A4A00":"var(--color-text-primary)"):"var(--color-text-secondary)",
                border:filterSupervised===v?(v==="supervisadas"?"0.5px solid #1D9E75":v==="pendientes"?"0.5px solid #E6A020":"0.5px solid var(--color-border-secondary)"):"0.5px solid var(--color-border-tertiary)"}}>
              {l}
            </button>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)",minWidth:80}}>Tema:</span>
          <select value={filterTopic} onChange={e => setFilterTopic(e.target.value)}
            style={{fontSize:12,padding:"4px 8px",borderRadius:"var(--border-radius-md)",
              border:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)"}}>
            <option value="todos">Todos los temas ({db.length})</option>
            {usedTopics.map(t => <option key={t} value={t}>{t} ({db.filter(q=>q.topic===t).length})</option>)}
          </select>
        </div>
        {(filterSupervised!=="todas" || filterTopic!=="todos") && (
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:12,color:"var(--color-text-secondary)"}}>{filteredDb.length} resultado{filteredDb.length!==1?"s":""}</span>
            <button onClick={() => { setFilterSupervised("todas"); setFilterTopic("todos"); }}
              style={{fontSize:11,padding:"2px 8px",borderRadius:10,cursor:"pointer",
                background:"transparent",color:"var(--color-text-secondary)",border:"0.5px solid var(--color-border-tertiary)"}}>
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filteredDb.length===0 && (
          <p style={{fontSize:13,color:"var(--color-text-secondary)",padding:"1rem",textAlign:"center"}}>No hay preguntas con estos filtros.</p>
        )}
        {filteredDb.map(q => {
          const ds = diffStyle(q.difficulty);
          return (
            <div key={q.id} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"10px 14px",
              borderRadius:"var(--border-radius-md)",
              border:"0.5px solid "+(q.supervised?"#1D9E75":"var(--color-border-tertiary)"),
              background:q.supervised?"#F7FDFB":"var(--color-background-primary)"}}>
              {q.image && <img src={q.image} alt="" style={{width:50,height:40,objectFit:"cover",borderRadius:4,flexShrink:0}} />}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,color:"var(--color-text-primary)",marginBottom:6,lineHeight:1.4}}>{q.question}</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:11,padding:"2px 8px",borderRadius:4,fontWeight:600,background:ds.bg,color:ds.color}}>{q.difficulty}</span>
                  {q.topic && <span style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:"var(--color-background-secondary)",color:"var(--color-text-secondary)",border:"0.5px solid var(--color-border-tertiary)"}}>{q.topic}</span>}
                  <SupervisionTag supervised={q.supervised} />
                  {isSupervisor && (
                    <button onClick={() => toggleSupervised(q.id)}
                      style={{fontSize:11,padding:"2px 10px",borderRadius:10,cursor:"pointer",fontWeight:600,
                        background:q.supervised?"#FAECE7":"#E1F5EE",color:q.supervised?"#993C1D":"#0F6E56",
                        border:"0.5px solid "+(q.supervised?"#D85A30":"#1D9E75")}}>
                      {q.supervised?"Quitar supervisión":"Supervisar"}
                    </button>
                  )}
                </div>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button onClick={() => openEdit(q)}
                  style={{fontSize:12,padding:"4px 10px",borderRadius:"var(--border-radius-md)",cursor:"pointer",
                    background:"transparent",color:"var(--color-text-secondary)",border:"0.5px solid var(--color-border-tertiary)"}}>
                  Editar
                </button>
                {confirmDelete===q.id
                  ? <div style={{display:"flex",gap:4,alignItems:"center"}}>
                      <span style={{fontSize:11,color:"#C0392B"}}>¿Seguro?</span>
                      <button onClick={() => del(q.id)}
                        style={{fontSize:12,padding:"4px 10px",borderRadius:"var(--border-radius-md)",cursor:"pointer",background:"#C0392B",color:"#fff",border:"none"}}>
                        Sí
                      </button>
                      <button onClick={() => setConfirmDelete(null)}
                        style={{fontSize:12,padding:"4px 10px",borderRadius:"var(--border-radius-md)",cursor:"pointer",
                          background:"transparent",color:"var(--color-text-secondary)",border:"0.5px solid var(--color-border-tertiary)"}}>
                        No
                      </button>
                    </div>
                  : <button onClick={() => setConfirmDelete(q.id)}
                      style={{fontSize:12,padding:"4px 10px",borderRadius:"var(--border-radius-md)",cursor:"pointer",
                        background:"transparent",color:"var(--color-text-danger)",border:"0.5px solid var(--color-border-danger)"}}>
                      Eliminar
                    </button>
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SUPERVISOR MODE ──────────────────────────────────────────────────────────
function SupervisorMode({ users, updateUsers }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({displayName:"",username:"",password:"",role:"alumno"});
  const [msg, setMsg]           = useState("");

  const add = () => {
    if (!form.username.trim()||!form.password.trim()||!form.displayName.trim()) { setMsg("Completa todos los campos."); return; }
    if (users.find(u => u.username===form.username.trim())) { setMsg("Ese nombre de usuario ya existe."); return; }
    updateUsers([...users, {...form,id:"u"+Date.now(),active:true,username:form.username.trim(),displayName:form.displayName.trim()}]);
    setForm({displayName:"",username:"",password:"",role:"alumno"}); setShowForm(false); setMsg("Usuario creado.");
  };
  const toggleActive = id => updateUsers(users.map(u => u.id===id ? {...u,active:!u.active} : u));
  const del = id => {
    if (id==="u0") { alert("No se puede eliminar el supervisor principal."); return; }
    updateUsers(users.filter(u => u.id!==id));
  };

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.25rem"}}>
        <h3 style={{fontSize:16,fontWeight:600,margin:0}}>Gestión de usuarios</h3>
        <button onClick={() => { setShowForm(s => !s); setMsg(""); }}
          style={{padding:"6px 14px",borderRadius:"var(--border-radius-md)",fontSize:13,fontWeight:500,cursor:"pointer",
            background:"var(--color-background-success)",color:"var(--color-text-success)",border:"0.5px solid var(--color-border-success)"}}>
          + Nuevo usuario
        </button>
      </div>

      {showForm && (
        <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"14px 16px",marginBottom:"1.25rem"}}>
          <h4 style={{fontSize:14,fontWeight:600,margin:"0 0 12px"}}>Nuevo usuario</h4>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <input value={form.displayName} onChange={e => setForm(f => ({...f,displayName:e.target.value}))}
                placeholder="Nombre completo"
                style={{flex:2,minWidth:140,fontSize:13,padding:"7px 10px",borderRadius:"var(--border-radius-md)",
                  border:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)"}} />
              <input value={form.username} onChange={e => setForm(f => ({...f,username:e.target.value}))}
                placeholder="Usuario (login)"
                style={{flex:1,minWidth:100,fontSize:13,padding:"7px 10px",borderRadius:"var(--border-radius-md)",
                  border:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)"}} />
              <input value={form.password} onChange={e => setForm(f => ({...f,password:e.target.value}))}
                placeholder="Contraseña"
                style={{flex:1,minWidth:100,fontSize:13,padding:"7px 10px",borderRadius:"var(--border-radius-md)",
                  border:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)"}} />
              <select value={form.role} onChange={e => setForm(f => ({...f,role:e.target.value}))}
                style={{fontSize:13,padding:"7px 8px",borderRadius:"var(--border-radius-md)",
                  border:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)"}}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={add}
                style={{padding:"6px 18px",borderRadius:"var(--border-radius-md)",fontSize:13,fontWeight:500,cursor:"pointer",
                  background:"var(--color-background-success)",color:"var(--color-text-success)",border:"0.5px solid var(--color-border-success)"}}>
                Crear
              </button>
              <button onClick={() => setShowForm(false)}
                style={{padding:"6px 14px",borderRadius:"var(--border-radius-md)",fontSize:13,cursor:"pointer",
                  background:"transparent",color:"var(--color-text-secondary)",border:"0.5px solid var(--color-border-tertiary)"}}>
                Cancelar
              </button>
            </div>
            {msg && <p style={{fontSize:12,color:msg==="Usuario creado."?"#0F6E56":"#C0392B",margin:0}}>{msg}</p>}
          </div>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {users.map(u => (
          <div key={u.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",
            borderRadius:"var(--border-radius-md)",border:"0.5px solid var(--color-border-tertiary)",
            background:u.active?"var(--color-background-primary)":"var(--color-background-secondary)",opacity:u.active?1:0.7}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:500,color:"var(--color-text-primary)",marginBottom:3}}>{u.displayName}</div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:11,color:"var(--color-text-secondary)"}}>@{u.username}</span>
                <Badge role={u.role} />
                {!u.active && <span style={{fontSize:11,padding:"1px 7px",borderRadius:10,background:"#f5f5f5",color:"#999",fontWeight:600}}>Inactivo</span>}
              </div>
            </div>
            <div style={{display:"flex",gap:6,flexShrink:0}}>
              <button onClick={() => toggleActive(u.id)}
                style={{fontSize:12,padding:"4px 10px",borderRadius:"var(--border-radius-md)",cursor:"pointer",
                  background:"transparent",color:u.active?"#BA7517":"#1D9E75",
                  border:"0.5px solid "+(u.active?"#E6A020":"#1D9E75")}}>
                {u.active?"Desactivar":"Activar"}
              </button>
              {u.id!=="u0" && (
                <button onClick={() => del(u.id)}
                  style={{fontSize:12,padding:"4px 10px",borderRadius:"var(--border-radius-md)",cursor:"pointer",
                    background:"transparent",color:"var(--color-text-danger)",border:"0.5px solid var(--color-border-danger)"}}>
                  Eliminar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
