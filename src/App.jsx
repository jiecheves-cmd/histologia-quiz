import { useState, useEffect, useRef } from "react";
import { useStorage } from "./storage.js";
import "./App.css";

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

// ─── AVATARES ─────────────────────────────────────────────────────────────────
function getInitials(name) {
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function getAvatarColor(name) {
  const colors = [
    "#6C4CFF","#1D9E75","#E05C2A","#2A7AE0","#BA7517",
    "#C0392B","#8E44AD","#16A085","#D35400","#2980B9",
    "#27AE60","#E74C3C","#7D3C98","#1ABC9C","#F39C12"
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function getAvatarLabel(name, allUsers) {
  const initials = getInitials(name);
  const sameInitials = allUsers
    .filter(u => getInitials(u.displayName) === initials)
    .sort((a, b) => a.id.localeCompare(b.id));
  const idx = sameInitials.findIndex(u => u.displayName === name);
  return idx <= 0 ? initials : initials + (idx + 1);
}

function Avatar({ name, allUsers = [], size = 32 }) {
  const label = allUsers.length > 0 ? getAvatarLabel(name, allUsers) : getInitials(name);
  const color = getAvatarColor(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: color, color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.35, fontWeight: 700, flexShrink: 0,
      letterSpacing: "-0.5px"
    }}>
      {label}
    </div>
  );
}
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

// ─── DB HELPERS ───────────────────────────────────────────────────────────────
async function saveQuestion(q, save) {
  await save("histo_q_" + q.id, q);
}

async function deleteQuestion(id, save) {
  await save("histo_q_" + id, null);
}

async function loadAllQuestions(load, defaultDb) {
  try {
    // Primero intentar cargar el nuevo formato (una fila por pregunta)
    const keys = await load("histo_q_keys", [], true);
    if (keys && keys.length > 0) {
      const questions = await Promise.all(keys.map(id => load("histo_q_" + id, null)));
      return questions.filter(Boolean);
    }
    // Si no hay preguntas en nuevo formato, cargar del formato antiguo
    const oldDb = await load("histo_db", defaultDb);
    return oldDb;
  } catch(e) {
    return defaultDb;
  }
}
// ─── SESSION HELPERS ──────────────────────────────────────────────────────────
async function saveSession(sessionData, save) {
  const id = Date.now() + "_" + Math.random().toString(36).slice(2,7);
  const summary = {
    id,
    student: sessionData.student,
    date: sessionData.date,
    points: sessionData.points,
    bonuses: sessionData.bonuses,
    correct: sessionData.answers.filter(a => a.correct).length,
    total: sessionData.answers.length,
    durationMs: sessionData.durationMs,
    filter: sessionData.filter
  };
  const detail = {
    id,
    answers: sessionData.answers
  };
  await save("histo_summary_" + id, summary, true);
  await save("histo_detail_" + id, detail, false);
  return { summary, detail };
}

async function migrateOldSessions(load, save) {
  try {
    // Verificar si ya se migró
    const migrated = await load("histo_migration_done", false, true);
    if (migrated) return;
    
    // Cargar sesiones antiguas
    const oldSessions = await load("histo_sessions", [], true);
    if (!oldSessions || oldSessions.length === 0) {
      await save("histo_migration_done", true, true);
      return;
    }
    
    // Migrar cada sesión al nuevo formato
    const newKeys = [];
    for (const s of oldSessions) {
      const id = s.date + "_migrated";
      const summary = {
        id,
        student: s.student,
        date: s.date,
        points: s.points || 0,
        bonuses: s.bonuses || 0,
        correct: (s.answers||[]).filter(a => a.correct).length,
        total: (s.answers||[]).length,
        durationMs: s.durationMs || 0,
        filter: s.filter || "todas"
      };
      await save("histo_summary_" + id, summary, true);
      await save("histo_detail_" + id, { id, answers: s.answers || [] }, false);
      newKeys.push(id);
    }
    // Combinar con keys existentes
    const existingKeys = await load("histo_summary_keys", [], true);
    const allKeys = [...new Set([...(Array.isArray(existingKeys) ? existingKeys : []), ...newKeys])];
    await save("histo_summary_keys", allKeys, true);
    await save("histo_migration_done", true, true);
    console.log("Migración completada:", newKeys.length, "sesiones");
  } catch(e) {
    console.error("Error en migración:", e);
  }
}
function oldSessionSummary(s) {
  return {
    id: s.id || s.date,
    student: s.student,
    date: s.date,
    points: s.points || 0,
    bonuses: s.bonuses || 0,
    correct: (s.answers||[]).filter(a => a.correct).length,
    total: (s.answers||[]).length,
    durationMs: s.durationMs || 0,
    filter: s.filter || "todas"
  };
}

async function loadSummaries(load, list) {
  try {
    const summariesById = new Map();
    const addSummary = s => {
      if (s && s.id && !summariesById.has(s.id)) summariesById.set(s.id, s);
    };

    const keys = await load("histo_summary_keys", [], true);
    if (Array.isArray(keys) && keys.length > 0) {
      const indexed = await Promise.all(keys.map(id => load("histo_summary_" + id, null, true)));
      indexed.forEach(addSummary);
    }

    if (list) {
      const listed = await list("histo_summary_", true);
      listed.forEach(item => addSummary(item.value));
    }

    const old = await load("histo_sessions", [], true);
    if (Array.isArray(old)) {
      old.forEach(s => {
        const migratedId = s.date + "_migrated";
        if (!summariesById.has(migratedId)) addSummary(oldSessionSummary(s));
      });
    }

    return [...summariesById.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
  } catch(e) {
    return [];
  }
}

async function loadDetails(load, summaryIds) {
  try {
    const old = await load("histo_sessions", [], true);
    const oldSessions = Array.isArray(old) ? old : [];
    const details = await Promise.all(summaryIds.map(async id => {
      const detail = await load("histo_detail_" + id, null, false);
      if (detail) return detail;
      const oldSession = oldSessions.find(s => s.id === id || s.date === id || s.date + "_migrated" === id);
      return oldSession ? { id, answers: oldSession.answers || [] } : null;
    }));
    return details.filter(Boolean);
  } catch(e) {
    return [];
  }
}

function applyProgressReset(resetAt) {
  if (!resetAt || localStorage.getItem("histo_progress_reset_seen") === resetAt) return;
  Object.keys(localStorage).forEach(key => {
    if (
      key === "histo_hall_of_fame" ||
      key.startsWith("histo_streak_") ||
      key.startsWith("histo_last_session_") ||
      key.startsWith("histo_seen_")
    ) {
      localStorage.removeItem(key);
    }
  });
  localStorage.setItem("histo_progress_reset_seen", resetAt);
}
// ─── APP ──────────────────────────────────────────────────────────────────────
const LEVELS = [
  { level: 1, title: "🔬 Aprendiz", xp: 0, coverage: 0 },
  { level: 2, title: "🧫 Cazador de células", xp: 250, coverage: 5 },
  { level: 3, title: "🧬 Explorador tisular", xp: 750, coverage: 10 },
  { level: 4, title: "🔍 Detective celular", xp: 1500, coverage: 20 },
  { level: 5, title: "📚 Maestro de la H&E", xp: 3000, coverage: 35 },
  { level: 6, title: "🧠 Gurú histológico", xp: 6000, coverage: 50 },
  { level: 7, title: "⚡ Dominador de tejidos", xp: 10000, coverage: 65 },
  { level: 8, title: "🏛️ Sabio microscópico", xp: 16000, coverage: 80 },
  { level: 9, title: "👑 Leyenda histológica", xp: 25000, coverage: 90 },
  { level: 10, title: "🏆 Histomind Supremo", xp: 40000, coverage: 100 }
];
export default function App() {
  const [db, setDb]           = useState(DEFAULT_DB);
  const [users, setUsers]     = useState(DEFAULT_USERS);
  const [sessions, setSessions] = useState([]);
  const [streakDays, setStreakDays] = useState(0);
const [answeredUnique, setAnsweredUnique] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  const [tab, setTab]         = useState("alumno");
  const [loaded, setLoaded]   = useState(false);
  const { save, load, list }  = useStorage();

useEffect(() => {
  load("histo_progress_reset_at", null, true).then(resetAt => {
    applyProgressReset(resetAt);
    return migrateOldSessions(load, save);
  }).then(() => {
    Promise.all([
      loadAllQuestions(load, DEFAULT_DB),
      load("histo_users", DEFAULT_USERS, true),
      loadSummaries(load, list)
    ])
    .then(([d, u, s]) => {
      setDb(d);
      setUsers(u);
      setSessions(s);
      setLoaded(true);
    });
  });
}, []);

  const [passwordRequests, setPasswordRequests] = useState([]);
  const updateDb = async nd => {
    setDb(nd);
    // Guardar cada pregunta individualmente
    const oldIds = db.map(q => q.id);
    const newIds = nd.map(q => q.id);
    // Guardar preguntas nuevas o modificadas
    await Promise.all(nd.map(q => save("histo_q_" + q.id, q)));
    // Eliminar preguntas borradas
    const deleted = oldIds.filter(id => !newIds.includes(id));
    await Promise.all(deleted.map(id => save("histo_q_" + id, null)));
    // Guardar índice de IDs
    await save("histo_q_keys", newIds, true);
  };
  const updateUsers = nu => { setUsers(nu); save("histo_users", nu, true); };

  if (!loaded) return <div style={{padding:"2rem",textAlign:"center",color:"var(--color-text-secondary)"}}>Cargando...</div>;
  const handlePasswordRequest = (username) => {
    if (!username.trim()) { alert("Escribe tu nombre de usuario primero."); return; }
    const exists = users.find(u => u.username === username.trim());
    if (!exists) { alert("No existe ningún usuario con ese nombre."); return; }
    setPasswordRequests(prev => [...prev.filter(r => r !== username.trim()), username.trim()]);
    alert("Tu solicitud ha sido enviada al supervisor. Contacta con tu profesor para obtener una nueva contraseña.");
  };
  if (!currentUser) return <LoginScreen users={users} onLogin={u => { setCurrentUser(u); setTab("alumno"); }} onPasswordRequest={handlePasswordRequest} />;

  const role      = currentUser.role;
  const canTeacher = role === "profesor" || role === "supervisor";
  const canSuper   = role === "supervisor";

  return (
    <div style={{fontFamily:"var(--font-sans)",maxWidth:1200,margin:"0 auto",padding:window.innerWidth<768?"0.5rem":"1rem 0",minHeight:"100vh",background:"radial-gradient(ellipse at 20% 50%, rgba(108,76,255,0.06) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(168,85,247,0.05) 0%, transparent 50%)",position:"relative"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.25rem",flexWrap:"wrap",gap:8}}>
        <div>
          
          <div style={{display:"flex",alignItems:"center",gap:10}}>
  <span style={{fontSize:28}}>🔬</span>
  <div>
    <h1 style={{fontSize:24,fontWeight:800,margin:0,color:"#1A1060",letterSpacing:"-0.03em"}}>HistoMind</h1>
    <p style={{fontSize:11,margin:0,color:"#6C4CFF",fontWeight:600,letterSpacing:"0.3px"}}>QUIZ DE HISTOLOGÍA</p>
  </div>
</div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <Avatar name={currentUser.displayName} allUsers={users} size={32} />
<span style={{fontSize:13,color:"var(--color-text-secondary)"}}>{currentUser.displayName}</span>
            <Badge role={role} />
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={() => setTab("perfil")}
            style={{fontSize:12,padding:"5px 14px",borderRadius:"var(--border-radius-md)",cursor:"pointer",
              background:"transparent",color:"var(--color-text-secondary)",border:"0.5px solid var(--color-border-tertiary)"}}>
            👤 Mi perfil
          </button>
          <button onClick={() => setCurrentUser(null)}
            style={{fontSize:12,padding:"5px 14px",borderRadius:"var(--border-radius-md)",cursor:"pointer",
              background:"transparent",color:"var(--color-text-secondary)",border:"0.5px solid var(--color-border-tertiary)"}}>
            Cerrar sesión
          </button>
        </div>
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
      {tab==="perfil"     && <ProfileScreen currentUser={currentUser} updateUsers={updateUsers} users={users} onBack={()=>setTab("alumno")} />}
      {tab==="profesor"   && canTeacher && <TeacherMode db={db} updateDb={updateDb} isSupervisor={canSuper} />}
      {tab==="supervisor" && canSuper   && <SupervisorMode users={users} updateUsers={updateUsers} passwordRequests={passwordRequests} setPasswordRequests={setPasswordRequests} />}
    </div>
  );
}

// ─── PROFILE SCREEN ───────────────────────────────────────────────────────────
function ProfileScreen({ currentUser, updateUsers, users, onBack }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword]         = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState(""); // "ok" | "error"

  const changePassword = () => {
    if (currentPassword !== currentUser.password) {
      setMsg("La contraseña actual no es correcta."); setMsgType("error"); return;
    }
    if (newPassword.length < 4) {
      setMsg("La nueva contraseña debe tener al menos 4 caracteres."); setMsgType("error"); return;
    }
    if (newPassword !== confirmPassword) {
      setMsg("Las contraseñas no coinciden."); setMsgType("error"); return;
    }
    updateUsers(users.map(u => u.id === currentUser.id ? {...u, password: newPassword} : u));
    currentUser.password = newPassword;
    setMsg("Contraseña cambiada correctamente."); setMsgType("ok");
    setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
  };

  return (
    <div style={{maxWidth:480,margin:"0 auto"}}>
      <button onClick={onBack}
        style={{fontSize:13,color:"var(--color-text-secondary)",background:"none",border:"none",cursor:"pointer",padding:0,marginBottom:20}}>
        ← Volver
      </button>

      <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:20,padding:24,marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20}}>
          <Avatar name={currentUser.displayName} allUsers={users} size={52} />
          <div>
            <div style={{fontSize:18,fontWeight:700,color:"var(--color-text-primary)"}}>{currentUser.displayName}</div>
            <div style={{fontSize:13,color:"var(--color-text-secondary)",marginTop:2}}>@{currentUser.username}</div>
            <Badge role={currentUser.role} />
          </div>
        </div>

        <div style={{borderTop:"0.5px solid var(--color-border-tertiary)",paddingTop:20}}>
          <p style={{fontSize:14,fontWeight:500,color:"var(--color-text-primary)",margin:"0 0 14px"}}>Cambiar contraseña</p>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <input type="password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}
              placeholder="Contraseña actual"
              style={{fontSize:14,padding:"10px 14px",borderRadius:12,border:"1.5px solid #E5E7EB",background:"#F9FAFB",color:"#1A1060",outline:"none"}} />
            <input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)}
              placeholder="Nueva contraseña"
              style={{fontSize:14,padding:"10px 14px",borderRadius:12,border:"1.5px solid #E5E7EB",background:"#F9FAFB",color:"#1A1060",outline:"none"}} />
            <input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}
              placeholder="Confirmar nueva contraseña"
              style={{fontSize:14,padding:"10px 14px",borderRadius:12,border:"1.5px solid #E5E7EB",background:"#F9FAFB",color:"#1A1060",outline:"none"}} />
          </div>
          {msg && <p style={{fontSize:12,color:msgType==="ok"?"#1D9E75":"#C0392B",margin:"10px 0 0"}}>{msg}</p>}
          <button onClick={changePassword}
            style={{width:"100%",marginTop:14,padding:"11px",borderRadius:12,fontSize:14,fontWeight:600,cursor:"pointer",
              background:"linear-gradient(135deg,#1A1060,#6C4CFF)",color:"#fff",border:"none"}}>
            Cambiar contraseña
          </button>
        </div>
      </div>
    </div>
  );
}
// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ users, onLogin, onPasswordRequest }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const login = () => {
    const u = users.find(u => u.username === username.trim() && u.password === password && u.active);
    if (u) { onLogin(u); setError(""); }
    else setError("Usuario o contraseña incorrectos, o cuenta inactiva.");
  };
  return (
   <div style={{fontFamily:"var(--font-sans)",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#1A1060 0%,#6C4CFF 50%,#A855F7 100%)",padding:"1rem"}}>
  <div style={{width:"100%",maxWidth:400,background:"rgba(255,255,255,0.97)",borderRadius:24,padding:"36px 32px",boxShadow:"0 32px 80px rgba(26,16,96,0.35)"}}>
    <div style={{textAlign:"center",marginBottom:28}}>
      <div style={{fontSize:48,marginBottom:10}}>🔬</div>
      <h1 style={{fontSize:30,fontWeight:800,margin:"0 0 6px",color:"#1A1060",letterSpacing:"-0.04em"}}>HistoMind</h1>
      <p style={{fontSize:14,color:"#6C4CFF",fontWeight:600,margin:"0 0 4px"}}>Aprende histología de forma inteligente</p>
      <p style={{fontSize:12,color:"#9CA3AF",margin:0}}>Introduce tus credenciales para acceder</p>
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
      <input value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key==="Enter"&&login()}
        placeholder="Usuario"
        style={{fontSize:14,padding:"12px 16px",borderRadius:12,border:"1.5px solid #E5E7EB",background:"#F9FAFB",color:"#1A1060",outline:"none"}} />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key==="Enter"&&login()}
        placeholder="Contraseña"
        style={{fontSize:14,padding:"12px 16px",borderRadius:12,border:"1.5px solid #E5E7EB",background:"#F9FAFB",color:"#1A1060",outline:"none"}} />
    </div>
    {error && <p style={{fontSize:12,color:"#C0392B",marginBottom:12}}>{error}</p>}
    <button onClick={login}
      style={{width:"100%",padding:"13px",borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer",
        background:"linear-gradient(135deg,#1A1060,#6C4CFF)",color:"#fff",border:"none",
        boxShadow:"0 8px 24px rgba(108,76,255,0.35)"}}>
      Entrar
    </button>
    <button onClick={() => onPasswordRequest(username)}
      style={{width:"100%",marginTop:10,padding:"10px",borderRadius:12,fontSize:13,fontWeight:500,cursor:"pointer",
        background:"transparent",color:"#6C4CFF",border:"1.5px solid #C9BBFF"}}>
      ¿Olvidaste tu contraseña?
    </button>
  </div>
</div>
  );
}
// ─── LIGA SEMANAL ─────────────────────────────────────────────────────────────
function getWeekKey(date = new Date()) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() - d.getDay() + 1); // Lunes
  return d.toISOString().split("T")[0];
}

function getWeekLabel(weekKey) {
  const start = new Date(weekKey);
  const end = new Date(weekKey);
  end.setDate(end.getDate() + 6);
  const fmt = d => d.toLocaleDateString("es-ES", {day:"2-digit", month:"short"});
  return fmt(start) + " – " + fmt(end);
}

function buildLeagueGroups(allSessions, allUsers, currentWeekKey) {
  // XP global por alumno
  const globalXP = {};
  allSessions.forEach(s => {
    if (!globalXP[s.student]) globalXP[s.student] = 0;
    globalXP[s.student] += s.points || 0;
  });

  // XP esta semana por alumno
  const weekXP = {};
  allSessions
    .filter(s => getWeekKey(new Date(s.date)) === currentWeekKey)
    .forEach(s => {
      if (!weekXP[s.student]) weekXP[s.student] = 0;
      weekXP[s.student] += s.points || 0;
    });

  // Ordenar alumnos por XP global y agrupar de 20 en 20
  const students = Object.keys(globalXP).sort((a,b) => globalXP[b] - globalXP[a]);
  const groups = [];
  for (let i = 0; i < students.length; i += 20) {
    const group = students.slice(i, i + 20).map(name => ({
      name,
      globalXP: Math.round(globalXP[name]),
      weekXP: Math.round(weekXP[name] || 0)
    })).sort((a,b) => b.weekXP - a.weekXP);
    groups.push(group);
  }
  return groups;
}

function buildHallOfFame(allSessions) {
  const currentWeekKey = getWeekKey();
  const weekly = {};
  allSessions.forEach(s => {
    if (!s.date || !s.student) return;
    const weekKey = getWeekKey(new Date(s.date));
    if (weekKey === currentWeekKey) return;
    if (!weekly[weekKey]) weekly[weekKey] = {};
    weekly[weekKey][s.student] = (weekly[weekKey][s.student] || 0) + (s.points || 0);
  });
  return Object.entries(weekly)
    .map(([weekKey, pointsByStudent]) => {
      const [winner, xp] = Object.entries(pointsByStudent).sort((a,b) => b[1] - a[1])[0] || [];
      return winner ? { weekKey, winner, xp, label: getWeekLabel(weekKey) } : null;
    })
    .filter(Boolean)
    .sort((a,b) => b.weekKey.localeCompare(a.weekKey));
}
// ─── STUDENT MODE ─────────────────────────────────────────────────────────────
function StudentMode({ db, studentName }) {
  const [sessions, setSessions] = useState([]);
  const [streakDays, setStreakDays] = useState(0);
const [answeredUnique, setAnsweredUnique] = useState(0);

useEffect(() => {
  loadSummaries(load, list).then(setSessions);
}, []);
  const [studentTab, setStudentTab] = useState("inicio");
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
  const [showRadarModal, setShowRadarModal] = useState(false);
  const [showRankingModal, setShowRankingModal] = useState(false);
  const [rankingModalTab, setRankingModalTab] = useState("xp");
  const [streakRanking, setStreakRanking] = useState([]);
  const [sessionMode, setSessionMode] = useState("practice");
  const [learningSnapshot, setLearningSnapshot] = useState({weakTopics:[], dueCount:0, errorCount:0, lowConfidenceCount:0, questionsToday:0, sessionsToday:0});
  const { save, load, list } = useStorage();

  const ranking = Object.values(
  sessions.reduce((acc, s) => {
    const name = s.student;
    if (!acc[name]) acc[name] = { name, points: 0 };
    acc[name].points += s.points || 0;
    return acc;
  }, {})
).sort((a, b) => b.points - a.points);

const myRank = ranking.findIndex(r => r.name === studentName) + 1;
const myPoints = ranking.find(r => r.name === studentName)?.points || 0;
const histoXP = myPoints;
const totalQuestions = db.length;

useEffect(() => {
  list("histo_streak_", true).then(items => {
    const rows = items
      .map(item => item.value)
      .filter(v => v && v.student && Number(v.best) > 0)
      .sort((a,b) => (b.best || 0) - (a.best || 0));
    setStreakRanking(rows);
  });
}, [sessions, streakDays]);


const coveragePct = totalQuestions
  ? Math.round((answeredUnique / totalQuestions) * 100)
  : 0;

const currentLevel = LEVELS
  .filter(l => histoXP >= l.xp && coveragePct >= l.coverage)
  .at(-1) || LEVELS[0];

const nextLevel = LEVELS.find(l => l.level === currentLevel.level + 1);

const xpCurrent = currentLevel.xp;
const xpNext = nextLevel ? nextLevel.xp : currentLevel.xp;
const xpProgress = nextLevel
  ? Math.min(100, Math.round(((histoXP - xpCurrent) / (xpNext - xpCurrent)) * 100))
  : 100;
 
 useEffect(() => {
  const mySessionIds = sessions.filter(s => s.student === studentName).map(s => s.id);
  if (mySessionIds.length === 0) { setAnsweredUnique(0); return; }
  loadDetails(load, mySessionIds).then(details => {
    const ids = new Set(
      details.flatMap(s => s.answers || [])
        .map(a => a.questionId)
        .filter(Boolean)
    );
    setAnsweredUnique(ids.size);
  });
}, [sessions, studentName]);

useEffect(() => {
  const lastSessionDate = localStorage.getItem("histo_last_session_" + studentName);
  const streakCount = parseInt(localStorage.getItem("histo_streak_" + studentName) || "0");
  if (!lastSessionDate) { setStreakDays(0); return; }
  const last = new Date(lastSessionDate);
  const today = new Date();
  const diffDays = Math.floor((today - last) / (1000 * 60 * 60 * 24));
  if (diffDays === 0 || diffDays === 1) setStreakDays(streakCount);
  else { setStreakDays(0); localStorage.setItem("histo_streak_" + studentName, "0"); }
}, [studentName]); 
  const xpMissing = nextLevel
  ? Math.max(0, nextLevel.xp - histoXP)
  : 0;

const coverageMissing = nextLevel
  ? Math.max(0, nextLevel.coverage - coveragePct)
  : 0;

useEffect(() => {
  const mySummaries = sessions.filter(s => s.student === studentName);
  if (mySummaries.length === 0) {
    setLearningSnapshot({weakTopics:[], dueCount:db.length, errorCount:0, lowConfidenceCount:0, questionsToday:0, sessionsToday:0});
    return;
  }
  loadDetails(load, mySummaries.map(s => s.id)).then(details => {
    const allAnswers = details.flatMap(s => s.answers || []);
    const today = new Date().toISOString().split("T")[0];
    const todaySummaries = mySummaries.filter(s => (s.date || "").slice(0,10) === today);
    const qStats = {};
    allAnswers.forEach(a => {
      if (!qStats[a.questionId]) qStats[a.questionId] = {correct:0,total:0,lowConf:0,lastSeen:0};
      qStats[a.questionId].total++;
      if (a.correct) qStats[a.questionId].correct++;
      if (a.confidence === 2) qStats[a.questionId].lowConf++;
      qStats[a.questionId].lastSeen = Math.max(qStats[a.questionId].lastSeen, a.timeStamp || 0);
    });
    const topicStats = {};
    db.forEach(q => { if (!topicStats[q.topic]) topicStats[q.topic] = {correct:0,total:0}; });
    allAnswers.forEach(a => {
      const q = db.find(x => x.id === a.questionId);
      if (!q || !topicStats[q.topic]) return;
      topicStats[q.topic].total++;
      if (a.correct) topicStats[q.topic].correct++;
    });
    const weakTopics = Object.entries(topicStats)
      .map(([topic, s]) => ({topic, pct:s.total ? Math.round(s.correct/s.total*100) : -1}))
      .sort((a,b) => a.pct - b.pct)
      .slice(0,3);
    setLearningSnapshot({
      weakTopics,
      dueCount: db.filter(q => !qStats[q.id] || (qStats[q.id].correct / Math.max(qStats[q.id].total,1)) < 0.7 || qStats[q.id].lowConf > 0).length,
      errorCount: db.filter(q => qStats[q.id] && qStats[q.id].correct < qStats[q.id].total).length,
      lowConfidenceCount: db.filter(q => qStats[q.id]?.lowConf > 0).length,
      questionsToday: todaySummaries.reduce((sum, s) => sum + (s.total || 0), 0),
      sessionsToday: todaySummaries.length
    });
  });
}, [sessions, db, studentName]);

  // ─── SESIÓN INTELIGENTE ────────────────────────────────────────────────────────
// ─── RADAR CHART ──────────────────────────────────────────────────────────────
useEffect(() => {
  if (studentTab !== "inicio" || phase !== "config") return;
  const renderRadar = async () => {
    const renderChart = async (canvasId, large = false) => {
      const canvas = document.getElementById(canvasId);
      if (!canvas || !window.Chart) return;
      if (canvas._chartInstance) { canvas._chartInstance.destroy(); canvas._chartInstance = null; }

      const mySummaries = sessions.filter(s => s.student === studentName);
      const myDetails = await loadDetails(load, mySummaries.map(s => s.id));
      const allAnswers = myDetails.flatMap(s => s.answers || []);
      const topics = [...new Set([...TOPICS, ...db.map(q => q.topic).filter(Boolean)])];
      const topicData = {};
      topics.forEach(t => { topicData[t] = {correct:0,total:0}; });
      allAnswers.forEach(a => {
        const q = db.find(x => x.id === a.questionId);
        if (!q || !topicData[q.topic]) return;
        topicData[q.topic].total++;
        if (a.correct) topicData[q.topic].correct++;
      });
      const values = topics.map(t => topicData[t].total ? Math.round(topicData[t].correct/topicData[t].total*100) : 0);

      canvas._chartInstance = new window.Chart(canvas, {
        type: "radar",
        data: {
          labels: topics,
          datasets: [
            { label:"Tu nivel", data:values, backgroundColor:"rgba(108,76,255,0.2)", borderColor:"#6C4CFF", borderWidth:large?3:2, pointBackgroundColor:"#6C4CFF", pointRadius:large?5:3 },
            { label:"Máximo", data:topics.map(()=>100), backgroundColor:"rgba(108,76,255,0.05)", borderColor:"rgba(108,76,255,0.2)", borderWidth:1, pointRadius:0 }
          ]
        },
        options: {
          responsive:true,
          maintainAspectRatio:false,
          plugins:{ legend:{ display:false } },
          scales:{ r:{
            min:0, max:100,
            ticks:{ stepSize:25, font:{size:large?12:9}, color:"#9CA3AF", backdropColor:"transparent" },
            pointLabels:{ font:{size:large?13:9, weight:large?"600":"400"}, color:"#6B7280" },
            grid:{ color:"rgba(108,76,255,0.12)" },
            angleLines:{ color:"rgba(108,76,255,0.18)" }
          } }
        }
      });
    };
    await renderChart("radarChart", false);
    if (showRadarModal) await renderChart("radarChartLarge", true);
  };
  if (window.Chart) { renderRadar(); return; }
  const script = document.createElement("script");
  script.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
  script.onload = renderRadar;
  document.head.appendChild(script);
}, [studentTab, phase, sessions, db, showRadarModal]);
  const buildSmartSession = async () => {
  const allSummaries = await loadSummaries(load, list);
  const mySummaries = allSummaries.filter(s => s.student === studentName);
  const myDetails = await loadDetails(load, mySummaries.map(s => s.id));
  const myAnswers = myDetails.flatMap(s => s.answers || []);

  const qStats = {};
  myAnswers.forEach(a => {
    if (!qStats[a.questionId]) qStats[a.questionId] = { correct: 0, total: 0, lowConf: 0, lastIndex: 0 };
    qStats[a.questionId].total++;
    if (a.correct) qStats[a.questionId].correct++;
    if (a.confidence === 2) qStats[a.questionId].lowConf++;
    qStats[a.questionId].lastIndex = myAnswers.length;
  });

  const topicCount = {};
  const selected = db
    .map(q => {
      const s = qStats[q.id];
      const accuracy = s ? s.correct / Math.max(s.total, 1) : 0;
      let priority = 0;
      if (!s) priority += 60;
      if (s && accuracy < 0.7) priority += Math.round((1 - accuracy) * 55);
      if (s?.lowConf) priority += 25 + s.lowConf * 4;
      priority += Math.random() * 8;
      return { ...q, _priority: priority };
    })
    .sort((a,b) => b._priority - a._priority)
    .filter(q => {
      topicCount[q.topic] = topicCount[q.topic] || 0;
      if (topicCount[q.topic] >= 3) return false;
      topicCount[q.topic]++;
      return true;
    })
    .slice(0, 10);

  return selected.map(q => {
    const idx = q.options.map((opt, i) => ({ opt, correct: i === q.answer }));
    idx.sort(() => Math.random() - 0.5);
    const { _priority, ...clean } = q;
    return { ...clean, options: idx.map(o => o.opt), answer: idx.findIndex(o => o.correct) };
  });
};

const smartTopics = () => {
  return learningSnapshot.weakTopics.length
    ? learningSnapshot.weakTopics
    : TOPICS.slice(0, 3).map(topic => ({topic, pct:-1}));
};

const startSmart = async () => {
  const qs = await buildSmartSession();
  if (!qs.length) return;
  const now = Date.now();
  setSessionMode("smart");
  setQuestions(qs); setCurrent(0); setSelected(null); setConfidence(null);
  setConfirmed(false); setAnswers([]); setSessionStart(now); setQuestionStart(now); setPhase("quiz");
};
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

// Si quedan pocas preguntas no vistas, completamos con preguntas ya vistas
// para respetar el número elegido por el alumno.
const shuffledUnseen = unseen.sort(() => Math.random()-0.5);
const seenPool = pool.filter(q => seen.includes(q.id)).sort(() => Math.random()-0.5);
const batch = [...shuffledUnseen, ...seenPool].slice(0, Math.min(numQ, pool.length));

// Si ya hemos usado todas las preguntas del filtro, reiniciamos el historial.
const newSeen = [...new Set([...seen, ...batch.map(q => q.id)])];
save(seenKey, newSeen.length >= pool.length ? [] : newSeen);
    const shuffled = batch.map(q => {
      const idx = q.options.map((opt, i) => ({ opt, correct: i===q.answer }));
      idx.sort(() => Math.random()-0.5);
      return { ...q, options: idx.map(o => o.opt), answer: idx.findIndex(o => o.correct) };
    });
    const now = Date.now();
    setSessionMode("practice");
    setQuestions(shuffled); setCurrent(0); setSelected(null); setConfidence(null);
    setConfirmed(false); setAnswers([]); setSessionStart(now); setQuestionStart(now); setPhase("quiz");
  };

  const startExam = async () => {
    let pool = db.filter(q => {
      const diffOk  = filter==="todas" || q.difficulty===filter;
      const topicOk = selectedTopics.length===0 || selectedTopics.includes(q.topic);
      return diffOk && topicOk;
    });
    if (!pool.length) return;
    const batch = pool.sort(() => Math.random()-0.5).slice(0, Math.min(20, pool.length));
    const shuffled = batch.map(q => {
      const idx = q.options.map((opt, i) => ({ opt, correct: i===q.answer }));
      idx.sort(() => Math.random()-0.5);
      return { ...q, options: idx.map(o => o.opt), answer: idx.findIndex(o => o.correct) };
    });
    const now = Date.now();
    setSessionMode("exam");
    setQuestions(shuffled); setCurrent(0); setSelected(null); setConfidence(null);
    setConfirmed(false); setAnswers([]); setSessionStart(now); setQuestionStart(now); setPhase("quiz");
  };

  const finishSession = async (finalAnswers) => {
    const sc = calcSessionScore(finalAnswers);
    const sessionData = {
      student:studentName, date:new Date().toISOString(),
      durationMs: Date.now() - (sessionStart||Date.now()),
      filter: sessionMode==="exam" ? "modo examen" : sessionMode==="smart" ? "repaso inteligente" : filter,
      answers: finalAnswers, points: sc.points, bonuses: sc.bonuses
    };
    const { summary } = await saveSession(sessionData, save);
    setSessions(prev => [...prev, summary]);
    const existingKeys = await load("histo_summary_keys", [], true);
    const keysArray = Array.isArray(existingKeys) ? existingKeys : [];
    const updatedKeys = [...new Set([...keysArray, summary.id])];
    await save("histo_summary_keys", updatedKeys, true);
    const today = new Date().toISOString().split("T")[0];
    const lastDay = localStorage.getItem("histo_last_session_" + studentName);
    const currentStreak = parseInt(localStorage.getItem("histo_streak_" + studentName) || "0");
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const newStreak = lastDay === today ? currentStreak : lastDay === yesterday ? currentStreak + 1 : 1;
    localStorage.setItem("histo_streak_" + studentName, String(newStreak));
    localStorage.setItem("histo_last_session_" + studentName, today);
    const storedStreak = await load("histo_streak_" + studentName, null, true);
    await save("histo_streak_" + studentName, {
      student: studentName,
      current: newStreak,
      best: Math.max(newStreak, storedStreak?.best || 0),
      lastDay: today,
      updatedAt: new Date().toISOString()
    }, true);
    setStreakDays(newStreak);
    setPhase("results");
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

  const submitExamAnswer = async () => {
    if (selected===null) return;
    const q = questions[current];
    const entry = {
      questionId:q.id, question:q.question, difficulty:q.difficulty, supervised:q.supervised,
      correct: selected===q.answer, userAnswer:selected, correctAnswer:q.answer,
      confidence:1, timeMs: Date.now() - (questionStart||Date.now())
    };
    const finalAnswers = [...answers, entry];
    setAnswers(finalAnswers);
    if (current+1 >= questions.length) {
      await finishSession(finalAnswers);
      return;
    }
    setCurrent(c => c+1); setSelected(null); setConfidence(null); setConfirmed(false); setQuestionStart(Date.now());
  };

  const next = async () => {
    if (current+1 >= questions.length) {
      await finishSession(answers);
      return;
    }
    setCurrent(c => c+1); setSelected(null); setConfidence(null); setConfirmed(false); setQuestionStart(Date.now());
  };


// ─── NAVEGACIÓN ALUMNO ────────────────────────────────────────────────────────
if (phase === "config") {
  const currentWeekKey = getWeekKey();
  const allSessions = sessions;
  const groups = buildLeagueGroups(allSessions, [], currentWeekKey);
  const myGroup = groups.find(g => g.find(s => s.name === studentName)) || [];
  const hallOfFame = buildHallOfFame(allSessions);

  return (
    <div>
      {/* Pestañas */}
      <div style={{display:"flex",gap:8,marginBottom:24,borderBottom:"1px solid var(--color-border-tertiary)",paddingBottom:12}}>
        {[["🏠 Inicio","inicio"],["🏆 Liga","liga"],["👑 Hall of Fame","hall"]].map(([l,v]) => (
          <button key={v} onClick={() => setStudentTab(v)}
            style={{padding:"7px 16px",borderRadius:20,fontSize:13,fontWeight:studentTab===v?700:400,cursor:"pointer",
              background:studentTab===v?"#6C4CFF":"transparent",
              color:studentTab===v?"#fff":"var(--color-text-secondary)",
              border:studentTab===v?"none":"0.5px solid var(--color-border-tertiary)"}}>
            {l}
          </button>
        ))}
      </div>

      {/* INICIO */}
      {studentTab==="inicio" && (
  <div style={{display:"grid",gap:28,alignItems:"start",gridTemplateColumns:window.innerWidth<768?"1fr":"minmax(0,2fr) 360px"}}>
    
    {/* Panel principal */}
    <div style={{
      background:"rgba(255,255,255,0.88)",
      border:"1px solid rgba(255,255,255,0.95)",
      borderRadius:28,
      padding:28,
      boxShadow:"0 24px 70px rgba(44,39,80,0.12)"
    }}>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:13,fontWeight:700,color:"#6C4CFF",marginBottom:8}}>
          MODO ALUMNO
        </div>
        <h1 style={{
          fontSize:window.innerWidth<768?18:34,
          lineHeight:1.05,
          letterSpacing:"-0.04em",
          margin:"0 0 10px",
          color:"var(--color-text-primary)"
        }}>
          {/* Sesión inteligente */}
<div style={{
  background:"linear-gradient(135deg,#1A1060,#6C4CFF)",
  borderRadius:20,
  padding:22,
  marginBottom:24,
  boxShadow:"0 12px 40px rgba(108,76,255,0.25)"
}}>
  <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,0.7)",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.5px"}}>
    Sesión inteligente
  </div>
  <div style={{fontSize:22,fontWeight:800,color:"#fff",marginBottom:4}}>
    🧠 10 preguntas adaptadas a ti
  </div>
  <div style={{fontSize:13,color:"rgba(255,255,255,0.75)",marginBottom:14}}>
    Tus puntos más débiles de hoy:
  </div>
  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>
    {smartTopics().map((t,i) => (
      <span key={i} style={{
        fontSize:12, fontWeight:600,
        padding:"5px 12px", borderRadius:20,
        background: t.pct === -1 ? "rgba(255,255,255,0.15)" : t.pct < 50 ? "rgba(239,68,68,0.25)" : "rgba(245,158,11,0.25)",
        color:"#fff",
        border: t.pct === -1 ? "1px solid rgba(255,255,255,0.2)" : t.pct < 50 ? "1px solid rgba(239,68,68,0.4)" : "1px solid rgba(245,158,11,0.4)"
      }}>
        {t.pct === -1 ? "🆕" : t.pct < 50 ? "🔴" : "🟡"} {t.topic}
      </span>
    ))}
  </div>
  <button onClick={startSmart}
    style={{
      width:"100%", padding:"14px",
      borderRadius:14, fontSize:15, fontWeight:800,
      cursor:"pointer", border:"none",
      background:"#fff", color:"#6C4CFF",
      boxShadow:"0 4px 20px rgba(0,0,0,0.15)"
    }}>
    ⚡ Empezar ahora
  </button>
</div>


          🧠 Preparado para tu siguiente reto?
        </h1>
        <p style={{fontSize:15,color:"var(--color-text-secondary)",margin:0}}>
          Hola, <strong style={{color:"var(--color-text-primary)"}}>{studentName}</strong>. Continúa mejorando tus conocimientos de histología con una sesión adaptada a tu nivel.
        </p>
      </div>

      {/* Misiones diarias */}
      <div style={{marginBottom:24}}>
        <p style={{fontSize:14,fontWeight:700,color:"var(--color-text-primary)",margin:"0 0 10px"}}>
          Misión diaria
        </p>
        <div style={{background:"#FFFFFF",border:"1px solid var(--color-border-tertiary)",borderRadius:16,padding:"14px 16px"}}>
          {(() => {
            const target = 20;
            const value = Math.min(target, learningSnapshot.questionsToday);
            const done = value >= target;
            const pct = Math.round((value / target) * 100);
            return (
              <>
                <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center",marginBottom:8}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:800,color:"var(--color-text-primary)"}}>Responder 20 preguntas</div>
                    <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:2}}>Suma cualquier sesión de práctica o repaso inteligente.</div>
                  </div>
                  <span style={{fontSize:12,fontWeight:800,color:done?"#1D9E75":"#BA7517"}}>{done?"Hecha":"Pendiente"}</span>
                </div>
                <div style={{height:8,borderRadius:999,background:"#F1F2F6",overflow:"hidden",marginBottom:7}}>
                  <div style={{width:pct+"%",height:"100%",background:done?"#1D9E75":"#F5C518"}} />
                </div>
                <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>{value}/{target} preguntas hoy</div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Difficulty */}
      <div style={{marginBottom:24}}>
        <p style={{fontSize:14,fontWeight:700,color:"var(--color-text-primary)",margin:"0 0 10px"}}>
          Dificultad
        </p>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {["todas","básico","intermedio","avanzado"].map(d => (
            <button key={d} onClick={() => setFilter(d)}
              style={{
                padding:"10px 18px",
                borderRadius:16,
                fontSize:14,
                cursor:"pointer",
                background:filter===d?"#6C4CFF":"#FFFFFF",
                color:filter===d?"#FFFFFF":"var(--color-text-primary)",
                fontWeight:filter===d?800:600,
                border:filter===d?"1px solid #6C4CFF":"1px solid var(--color-border-tertiary)",
                textTransform:"capitalize"
              }}>
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Topics */}
      <div style={{marginBottom:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,gap:12}}>
          <p style={{fontSize:14,fontWeight:700,color:"var(--color-text-primary)",margin:0}}>
            Temas
          </p>
          <div style={{display:"flex",gap:8}}>
            <button onClick={() => setSelectedTopics([...availableTopics])}
              style={{
                fontSize:12,
                padding:"6px 12px",
                borderRadius:999,
                cursor:"pointer",
                background:"#F5F3FF",
                color:"#5B31D6",
                border:"1px solid #DDD6FE",
                fontWeight:700
              }}>
              Todos
            </button>
            <button onClick={() => setSelectedTopics([])}
              style={{
                fontSize:12,
                padding:"6px 12px",
                borderRadius:999,
                cursor:"pointer",
                background:"#FFFFFF",
                color:"var(--color-text-secondary)",
                border:"1px solid var(--color-border-tertiary)",
                fontWeight:700
              }}>
              Ninguno
            </button>
          </div>
        </div>

        <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
          {availableTopics.map(t => {
            const active = selectedTopics.includes(t);
            const count  = db.filter(q => q.topic===t && (filter==="todas"||q.difficulty===filter)).length;
            return (
              <button key={t} onClick={() => toggleTopic(t)}
                style={{
                  fontSize:12,
                  padding:"8px 13px",
                  borderRadius:999,
                  cursor:"pointer",
                  fontWeight:active?800:600,
                  background:active?"#EFE9FF":"#FFFFFF",
                  color:active?"#5B31D6":"var(--color-text-secondary)",
                  border:active?"1px solid #C9BBFF":"1px solid var(--color-border-tertiary)"
                }}>
                {t} <span style={{fontSize:10,opacity:0.7}}>({count})</span>
              </button>
            );
          })}
        </div>

        <p style={{fontSize:13,color:"var(--color-text-secondary)",margin:"10px 0 0"}}>
          {selectedTopics.length===0 ? "Todos los temas seleccionados" : selectedTopics.length+" tema"+( selectedTopics.length!==1?"s":"")+" seleccionado"+(selectedTopics.length!==1?"s":"")}
        </p>
      </div>

      {/* Num questions */}
      <div style={{marginBottom:28}}>
        <p style={{fontSize:14,fontWeight:700,color:"var(--color-text-primary)",margin:"0 0 10px"}}>
          Número de preguntas
        </p>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {[5,10,15,20].map(n => {
            const disabled = poolSize < n;
            return (
              <button key={n} onClick={() => !disabled && setNumQ(n)}
                style={{
                  width:62,
                  height:48,
                  borderRadius:16,
                  fontSize:16,
                  fontWeight:numQ===n?800:600,
                  cursor:disabled?"not-allowed":"pointer",
                  opacity:disabled?0.35:1,
                  background:numQ===n?"#6C4CFF":"#FFFFFF",
                  color:numQ===n?"#FFFFFF":"var(--color-text-primary)",
                  border:numQ===n?"1px solid #6C4CFF":"1px solid var(--color-border-tertiary)"
                }}>
                {n}
              </button>
            );
          })}
        </div>
        <p style={{fontSize:13,color:"var(--color-text-secondary)",margin:"10px 0 0"}}>
          {poolSize} preguntas disponibles con esta configuración.
        </p>
      </div>

      <button onClick={start} disabled={!poolSize}
        style={{
          width:"100%",
          padding:"16px 28px",
          borderRadius:20,
          fontSize:16,
          fontWeight:800,
          cursor:poolSize?"pointer":"not-allowed",
          opacity:poolSize?1:0.5,
          background:"linear-gradient(135deg,#6C4CFF,#8B5CF6)",
          color:"#FFFFFF",
          border:"0",
          boxShadow:"0 18px 35px rgba(108,76,255,0.28)"
        }}>
        Empezar quiz
      </button>
      <button onClick={startExam} disabled={!poolSize}
        style={{
          width:"100%",
          marginTop:10,
          padding:"14px 24px",
          borderRadius:18,
          fontSize:15,
          fontWeight:800,
          cursor:poolSize?"pointer":"not-allowed",
          opacity:poolSize?1:0.5,
          background:"#FFFFFF",
          color:"#1A1060",
          border:"1px solid #C9BBFF"
        }}>
        Modo examen · sin feedback inmediato
      </button>
    </div>

    {/* Panel lateral */}
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div onClick={() => setShowRankingModal(true)}
        style={{
        background:"linear-gradient(135deg,#6C4CFF,#8B5CF6)",
        color:"#FFFFFF",
        borderRadius:28,
        padding:24,
        boxShadow:"0 24px 60px rgba(108,76,255,0.28)",
        cursor:"pointer"
      }}>
        <div style={{fontSize:13,fontWeight:700,opacity:0.86,marginBottom:10}}>
          TU PROGRESO
        </div>
        {streakDays > 0 && (
  <div style={{
    display:"flex", alignItems:"center", gap:10,
    background:"rgba(255,255,255,0.12)",
    border:"1px solid rgba(255,255,255,0.2)",
    borderRadius:14, padding:"10px 14px", marginBottom:14
  }}>
    <span style={{fontSize:26}}>🔥</span>
    <div>
      <div style={{fontSize:11,fontWeight:600,opacity:0.7,textTransform:"uppercase",letterSpacing:"0.5px"}}>
        Racha diaria
      </div>
      <div style={{fontSize:20,fontWeight:700,color:"#fff"}}>
        {streakDays} día{streakDays !== 1 ? "s" : ""} seguido{streakDays !== 1 ? "s" : ""}
      </div>
    </div>
  </div>
)}
        <div style={{fontSize:42,fontWeight:900,lineHeight:1,letterSpacing:"-0.05em"}}>
          {myRank ? "#" + myRank : "—"}
        </div>
        <div style={{fontSize:14,opacity:0.9,marginTop:8}}>
          posición en el ranking global
        </div>
        <div style={{
  marginTop:18,
  paddingTop:18,
  borderTop:"1px solid rgba(255,255,255,0.25)",
  fontSize:15,
  fontWeight:800
}}>
 🧬 {histoXP.toFixed(2)} HistoXP acumulados
</div>

<div style={{
  marginTop:20,
  background:"rgba(255,255,255,0.12)",
  borderRadius:12,
  overflow:"hidden"
}}>
  <div style={{
    width:`${xpProgress}%`,
    height:10,
    background:"#FFFFFF"
  }} />
</div>

<div style={{
  marginTop:8,
  fontSize:15,
  opacity:1,
  fontWeight:600
}}>
  ⭐ Nivel {currentLevel.level}
</div>
<div style={{marginTop:4,fontSize:18,fontWeight:800,opacity:1,color:"#fff"}}>
  {currentLevel.title}
</div>
<div style={{marginTop:4,fontSize:11,opacity:0.75}}>
  📚 Cobertura: {answeredUnique} / {totalQuestions} preguntas ({coveragePct}%)
</div>
{nextLevel && (
  <div style={{marginTop:8,fontSize:10,opacity:0.65,borderTop:"1px solid rgba(255,255,255,0.2)",paddingTop:8}}>
    Siguiente: Nivel {nextLevel.level} · {nextLevel.title}<br/>
    Faltan {xpMissing.toFixed(0)} XP y {coverageMissing}% cobertura
  </div>
)}
</div>

      {showRankingModal && (
        <div onClick={() => setShowRankingModal(false)}
          style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(26,16,96,0.55)",display:"flex",alignItems:"center",justifyContent:"center",padding:window.innerWidth<768?12:28}}>
          <div onClick={e => e.stopPropagation()}
            style={{width:"min(520px,100%)",background:"#fff",borderRadius:24,padding:24,boxShadow:"0 28px 90px rgba(26,16,96,0.35)"}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start",marginBottom:18}}>
              <div>
                <h3 style={{fontSize:20,fontWeight:800,color:"var(--color-text-primary)",margin:"0 0 4px"}}>Ranking global</h3>
                <p style={{fontSize:13,color:"var(--color-text-secondary)",margin:0}}>
                  {rankingModalTab==="xp" ? "Top 5 por HistoXP acumulado" : "Top 5 por mejor racha histórica"}
                </p>
              </div>
              <button onClick={() => setShowRankingModal(false)}
                style={{fontSize:13,padding:"7px 12px",borderRadius:"var(--border-radius-md)",cursor:"pointer",
                  background:"transparent",color:"var(--color-text-secondary)",border:"0.5px solid var(--color-border-tertiary)"}}>
                Cerrar
              </button>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              {[["xp","HistoXP"],["streak","Mejor racha"]].map(([key,label]) => (
                <button key={key} onClick={() => setRankingModalTab(key)}
                  style={{fontSize:12,padding:"6px 12px",borderRadius:999,cursor:"pointer",fontWeight:800,
                    background:rankingModalTab===key?"#6C4CFF":"#F8F7FC",
                    color:rankingModalTab===key?"#fff":"var(--color-text-secondary)",
                    border:rankingModalTab===key?"1px solid #6C4CFF":"1px solid var(--color-border-tertiary)"}}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {rankingModalTab==="xp" && ranking.slice(0,5).map((r,i) => {
                const isMe = r.name === studentName;
                const medals = ["🥇","🥈","🥉"];
                return (
                  <div key={r.name} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",
                    borderRadius:14,background:isMe?"#F0EAF9":"#F8F7FC",border:"0.5px solid "+(isMe?"#C9A8F0":"var(--color-border-tertiary)")}}>
                    <span style={{fontSize:i<3?22:13,minWidth:32,textAlign:"center",fontWeight:800,color:"#6C4CFF"}}>{i<3?medals[i]:(i+1)+"."}</span>
                    <Avatar name={r.name} size={30} />
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:isMe?800:600,color:"var(--color-text-primary)"}}>{r.name}{isMe?" (tú)":""}</div>
                    </div>
                    <div style={{fontSize:13,fontWeight:800,color:"#6C4CFF"}}>{r.points.toFixed(2)} XP</div>
                  </div>
                );
              })}
              {rankingModalTab==="streak" && streakRanking.slice(0,5).map((r,i) => {
                const isMe = r.student === studentName;
                const medals = ["🥇","🥈","🥉"];
                return (
                  <div key={r.student} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",
                    borderRadius:14,background:isMe?"#F0EAF9":"#F8F7FC",border:"0.5px solid "+(isMe?"#C9A8F0":"var(--color-border-tertiary)")}}>
                    <span style={{fontSize:i<3?22:13,minWidth:32,textAlign:"center",fontWeight:800,color:"#6C4CFF"}}>{i<3?medals[i]:(i+1)+"."}</span>
                    <Avatar name={r.student} size={30} />
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:isMe?800:600,color:"var(--color-text-primary)"}}>{r.student}{isMe?" (tú)":""}</div>
                    </div>
                    <div style={{fontSize:13,fontWeight:800,color:"#F97316"}}>{r.best} día{r.best!==1?"s":""}</div>
                  </div>
                );
              })}
              {((rankingModalTab==="xp" && ranking.length === 0) || (rankingModalTab==="streak" && streakRanking.length === 0)) && (
                <div style={{padding:"1.25rem",textAlign:"center",color:"var(--color-text-secondary)",background:"#F8F7FC",borderRadius:14}}>
                  Aún no hay datos de ranking.
                </div>
              )}
              {rankingModalTab==="xp" && myRank > 5 && (
                <>
                  <div style={{height:1,background:"var(--color-border-tertiary)",margin:"6px 0"}} />
                  <div style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",
                    borderRadius:14,background:"#F0EAF9",border:"0.5px solid #C9A8F0"}}>
                    <span style={{fontSize:13,minWidth:32,textAlign:"center",fontWeight:800,color:"#6C4CFF"}}>{myRank}.</span>
                    <Avatar name={studentName} size={30} />
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:800,color:"var(--color-text-primary)"}}>{studentName} (tú)</div>
                    </div>
                    <div style={{fontSize:13,fontWeight:800,color:"#6C4CFF"}}>{myPoints.toFixed(2)} XP</div>
                  </div>
                </>
              )}
              {rankingModalTab==="streak" && (() => {
                const myStreakPos = streakRanking.findIndex(r => r.student === studentName);
                const myStreak = myStreakPos >= 0 ? streakRanking[myStreakPos] : null;
                if (!myStreak || myStreakPos < 5) return null;
                return (
                  <>
                    <div style={{height:1,background:"var(--color-border-tertiary)",margin:"6px 0"}} />
                    <div style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",
                      borderRadius:14,background:"#F0EAF9",border:"0.5px solid #C9A8F0"}}>
                      <span style={{fontSize:13,minWidth:32,textAlign:"center",fontWeight:800,color:"#6C4CFF"}}>{myStreakPos+1}.</span>
                      <Avatar name={studentName} size={30} />
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:800,color:"var(--color-text-primary)"}}>{studentName} (tú)</div>
                      </div>
                      <div style={{fontSize:13,fontWeight:800,color:"#F97316"}}>{myStreak.best} día{myStreak.best!==1?"s":""}</div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Radar de dominio */}
      <div onClick={() => setShowRadarModal(true)}
        style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:20,padding:"1.25rem",cursor:"zoom-in"}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start"}}>
          <div>
            <p style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)",margin:"0 0 4px"}}>Tu mapa de dominio</p>
            <p style={{fontSize:12,color:"var(--color-text-secondary)",margin:"0 0 1rem"}}>Nivel por área histológica</p>
          </div>
          <span style={{fontSize:11,color:"#6C4CFF",fontWeight:700,whiteSpace:"nowrap"}}>Ampliar</span>
        </div>
        <div style={{position:"relative",width:"100%",height:300}}>
          <canvas id="radarChart" role="img" aria-label="Gráfico radar de dominio por tejido"></canvas>
        </div>
        <div style={{display:"flex",gap:12,marginTop:12}}>
          <span style={{fontSize:11,display:"flex",alignItems:"center",gap:4,color:"var(--color-text-secondary)"}}>
            <span style={{width:10,height:10,borderRadius:2,background:"rgba(108,76,255,0.5)",display:"inline-block"}}></span>Tu nivel
          </span>
          <span style={{fontSize:11,display:"flex",alignItems:"center",gap:4,color:"var(--color-text-secondary)"}}>
            <span style={{width:10,height:10,borderRadius:2,background:"rgba(108,76,255,0.15)",display:"inline-block"}}></span>Máximo
          </span>
        </div>
      </div>

      {showRadarModal && (
        <div onClick={() => setShowRadarModal(false)}
          style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(26,16,96,0.55)",display:"flex",alignItems:"center",justifyContent:"center",padding:window.innerWidth<768?12:28}}>
          <div onClick={e => e.stopPropagation()}
            style={{width:"min(1100px,100%)",maxHeight:"92vh",overflow:"auto",background:"#fff",borderRadius:24,padding:window.innerWidth<768?18:28,boxShadow:"0 28px 90px rgba(26,16,96,0.35)"}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start",marginBottom:12}}>
              <div>
                <h3 style={{fontSize:20,fontWeight:800,color:"var(--color-text-primary)",margin:"0 0 4px"}}>Tu mapa de dominio</h3>
                <p style={{fontSize:13,color:"var(--color-text-secondary)",margin:0}}>Todas las áreas histológicas del banco de preguntas</p>
              </div>
              <button onClick={() => setShowRadarModal(false)}
                style={{fontSize:13,padding:"7px 12px",borderRadius:"var(--border-radius-md)",cursor:"pointer",
                  background:"transparent",color:"var(--color-text-secondary)",border:"0.5px solid var(--color-border-tertiary)"}}>
                Cerrar
              </button>
            </div>
            <div style={{position:"relative",width:"100%",height:window.innerWidth<768?520:680}}>
              <canvas id="radarChartLarge" role="img" aria-label="Gráfico radar ampliado de dominio por tejido"></canvas>
            </div>
            <div style={{display:"flex",gap:14,marginTop:12,flexWrap:"wrap"}}>
              <span style={{fontSize:12,display:"flex",alignItems:"center",gap:5,color:"var(--color-text-secondary)"}}>
                <span style={{width:12,height:12,borderRadius:3,background:"rgba(108,76,255,0.5)",display:"inline-block"}}></span>Tu nivel
              </span>
              <span style={{fontSize:12,display:"flex",alignItems:"center",gap:5,color:"var(--color-text-secondary)"}}>
                <span style={{width:12,height:12,borderRadius:3,background:"rgba(108,76,255,0.15)",display:"inline-block"}}></span>Máximo
              </span>
              <span style={{fontSize:12,color:"var(--color-text-secondary)"}}>Los temas sin respuestas aparecen con 0%.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
      )}

      {/* LIGA SEMANAL */}
      {studentTab==="liga" && (
        <div>
          <div style={{background:"linear-gradient(135deg,#1A1060,#6C4CFF)",borderRadius:20,padding:20,marginBottom:20,color:"#fff"}}>
            <div style={{fontSize:12,fontWeight:700,opacity:0.7,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Liga semanal</div>
            <div style={{fontSize:20,fontWeight:800,marginBottom:4}}>{getWeekLabel(currentWeekKey)}</div>
            <div style={{fontSize:13,opacity:0.8}}>Grupo de {myGroup.length} alumnos · Tu nivel de XP</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {myGroup.map((s,i) => {
              const isMe = s.name === studentName;
              const medals = ["🥇","🥈","🥉"];
              return (
                <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",
                  borderRadius:14,
                  background:isMe?"#F0EAF9":"var(--color-background-primary)",
                  border:"0.5px solid "+(isMe?"#C9A8F0":"var(--color-border-tertiary)"),
                  fontWeight:isMe?600:400}}>
                  <span style={{fontSize:i<3?22:14,minWidth:32,textAlign:"center"}}>
                    {i<3?medals[i]:(i+1)+"."}
                  </span>
                  <Avatar name={s.name} size={30} />
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,color:isMe?"#5B2D9E":"var(--color-text-primary)"}}>{s.name}{isMe?" (tú)":""}</div>
                    <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>XP global: {s.globalXP}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:16,fontWeight:700,color:isMe?"#7B4FBE":"var(--color-text-primary)"}}>{s.weekXP} XP</div>
                    <div style={{fontSize:10,color:"var(--color-text-secondary)"}}>esta semana</div>
                  </div>
                </div>
              );
            })}
            {myGroup.length === 0 && (
              <div style={{padding:"2rem",textAlign:"center",color:"var(--color-text-secondary)",background:"var(--color-background-secondary)",borderRadius:14}}>
                Completa tu primera sesión para entrar en la liga 🏆
              </div>
            )}
          </div>
        </div>
      )}

      {/* HALL OF FAME */}
      {studentTab==="hall" && (
        <div>
          <div style={{textAlign:"center",marginBottom:24}}>
            <div style={{fontSize:40,marginBottom:8}}>👑</div>
            <h2 style={{fontSize:22,fontWeight:800,color:"#1A1060",margin:"0 0 4px"}}>Hall of Fame</h2>
            <p style={{fontSize:13,color:"var(--color-text-secondary)",margin:0}}>Ganadores de cada semana</p>
          </div>
          {hallOfFame.length === 0 ? (
            <div style={{padding:"2rem",textAlign:"center",color:"var(--color-text-secondary)",background:"var(--color-background-secondary)",borderRadius:14}}>
              Aún no hay ganadores registrados. ¡La primera liga está en curso!
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {hallOfFame.map((entry, i) => (
                <div key={i} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 18px",
                  borderRadius:14,
                  background:i===0?"linear-gradient(135deg,#FEF3DC,#FFF8E7)":"var(--color-background-primary)",
                  border:"0.5px solid "+(i===0?"#E6A020":"var(--color-border-tertiary)")}}>
                  <span style={{fontSize:i===0?32:20}}>{i===0?"👑":i===1?"🥈":"🥉"}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:"var(--color-text-primary)"}}>{entry.winner}</div>
                    <div style={{fontSize:12,color:"var(--color-text-secondary)"}}>{entry.label}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:18,fontWeight:800,color:"#BA7517"}}>{Math.round(entry.xp)} XP</div>
                    <div style={{fontSize:10,color:"var(--color-text-secondary)"}}>esa semana</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
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
        onRepeat={()=>{setPhase("quiz"); setCurrent(0); setSelected(null); setConfidence(null); setConfirmed(false); setAnswers([]); setSessionStart(Date.now()); setQuestionStart(Date.now());}}
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

      {selected!==null && !confirmed && sessionMode !== "exam" && (
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

      {confirmed && sessionMode !== "exam" && (
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
          {q.link && (
            <a href={q.link} target="_blank" rel="noopener noreferrer"
              style={{display:"flex",alignItems:"center",gap:8,marginTop:12,padding:"10px 16px",
                borderRadius:12,background:"linear-gradient(135deg,#1A1060,#6C4CFF)",
                color:"#fff",textDecoration:"none",fontSize:13,fontWeight:600,
                boxShadow:"0 4px 16px rgba(108,76,255,0.3)"}}>
              <span style={{fontSize:18}}>🔗</span>
              <span>Ampliar conocimientos</span>
              <span style={{marginLeft:"auto",fontSize:12,opacity:0.8}}>↗</span>
            </a>
          )}
          {q.explanationImage && (
            <div style={{marginTop:10}}>
              <ImageViewer src={q.explanationImage} label="Ver imagen de explicación" />
            </div>
          )}
        </div>
      )}

      <div style={{display:"flex",gap:8}}>
        {!confirmed
          ? <button onClick={sessionMode==="exam" ? submitExamAnswer : confirm} disabled={selected===null||(sessionMode!=="exam"&&confidence===null)}
              style={{padding:"8px 22px",borderRadius:"var(--border-radius-md)",fontSize:13,fontWeight:500,
                cursor:(selected===null||(sessionMode!=="exam"&&confidence===null))?"not-allowed":"pointer",
                opacity:(selected===null||(sessionMode!=="exam"&&confidence===null))?0.4:1,
                background:"var(--color-background-info)",color:"var(--color-text-info)",border:"0.5px solid var(--color-border-info)"}}>
              {sessionMode==="exam" ? (current+1>=questions.length?"Terminar examen":"Guardar y seguir") : "Confirmar respuesta"}
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
function ResultsWithRanking({ studentName, answers, questions, sessionStart, correct, pct, points, bonuses, ptAciertos, ptErrores, onNewSession, onRepeat }) {
  const [sessions, setSessions] = useState([]);
  const [rankPeriod, setRankPeriod] = useState("week");
  const { load, list } = useStorage();

  useEffect(() => { loadSummaries(load, list).then(setSessions); }, []);

  const medals = ["🥇","🥈","🥉"];
  const periodLabel = { week:"Esta semana", month:"Este mes", year:"Este año" };

  const getRanking = (period) => {
    const now    = new Date().toISOString();
    const curKey = periodKey(now, period);
    const stuPoints = {};
    sessions.filter(s => periodKey(s.date, period)===curKey).forEach(s => {
      if (!stuPoints[s.student]) stuPoints[s.student] = { name:s.student, points:0 };
      const sc = s.points != null ? s.points : 0;
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
                  <Avatar name={r.name} size={28} />
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
      <div style={{display:"flex",gap:8}}>
        <button onClick={onNewSession}
          style={{flex:1,padding:"10px 20px",borderRadius:"var(--border-radius-md)",fontSize:13,fontWeight:500,cursor:"pointer",
            background:"linear-gradient(135deg,#1A1060,#6C4CFF)",color:"#fff",border:"none"}}>
          ← Volver al inicio
        </button>
        <button onClick={onRepeat}
          style={{flex:1,padding:"10px 20px",borderRadius:"var(--border-radius-md)",fontSize:13,fontWeight:500,cursor:"pointer",
            background:"transparent",color:"var(--color-text-primary)",border:"0.5px solid var(--color-border-tertiary)"}}>
          🔁 Repetir sesión
        </button>
      </div>
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
  const [sessionDetails, setSessionDetails] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [genTopic, setGenTopic]     = useState("");
  const [genDiff, setGenDiff]       = useState("básico");
  const [genCount, setGenCount]     = useState(3);
  const [genMsg, setGenMsg]         = useState("");
  const [confirmDelete, setConfirmDelete]   = useState(null);
  const [filterSupervised, setFilterSupervised] = useState("todas");
  const [activeFilter, setActiveFilter] = useState("todos");
const [showAll, setShowAll] = useState(false);
  const [filterTopic, setFilterTopic]           = useState("todos");
  const [exportTopic, setExportTopic]           = useState("todos");
  const [rankPeriod, setRankPeriod]             = useState("week");
  const [form, setForm] = useState({difficulty:"básico",topic:TOPICS[0],question:"",options:["","","",""],answer:0,explanation:"",image:null,link:""});
  const fileRef    = useRef();
  const explImgRef = useRef();
  const { save, load, list } = useStorage();

  useEffect(() => { 
    loadSummaries(load, list).then(async summaries => {
      setSessions(summaries);
      const details = await loadDetails(load, summaries.map(s => s.id));
      setSessionDetails(details);
    }); 
  }, []);

  const resetForm = () => setForm({difficulty:"básico",topic:TOPICS[0],question:"",options:["","","",""],answer:0,explanation:"",explanationImage:null,image:null,link:""});
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
  const compressImage = (file, maxWidth = 800, quality = 0.7) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, maxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  const handleImg = async e => {
    const f = e.target.files[0]; if (!f) return;
    const compressed = await compressImage(f);
    setForm(prev => ({...prev, image: compressed}));
  };
  const handleExplImg = async e => {
    const f = e.target.files[0]; if (!f) return;
    const compressed = await compressImage(f);
    setForm(prev => ({...prev, explanationImage: compressed}));
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

  const exportQuestionsToWord = () => {
    const selectedQuestions = db
      .filter(q => exportTopic === "todos" || q.topic === exportTopic)
      .sort((a, b) => (a.topic || "").localeCompare(b.topic || "") || (a.question || "").localeCompare(b.question || ""));
    if (!selectedQuestions.length) { alert("No hay preguntas para exportar con esa selección."); return; }

    const escapeHtml = value => String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    const answerLabel = idx => ["A","B","C","D"][idx] || (idx + 1);
    const title = exportTopic === "todos" ? "Banco completo de preguntas" : "Preguntas - " + exportTopic;
    const rows = selectedQuestions.map((q, i) => {
      const correct = q.options?.[q.answer] ?? "";
      const image = q.image ? `<p><img src="${q.image}" style="max-width:420px;max-height:260px;border:1px solid #ddd;border-radius:6px;" /></p>` : "";
      const explanationImage = q.explanationImage ? `<p><strong>Imagen de explicación:</strong><br/><img src="${q.explanationImage}" style="max-width:420px;max-height:260px;border:1px solid #ddd;border-radius:6px;" /></p>` : "";
      return `
        <div class="question">
          <h2>${i + 1}. ${escapeHtml(q.question)}</h2>
          <p><strong>Tema:</strong> ${escapeHtml(q.topic || "Sin tema")} &nbsp; <strong>Dificultad:</strong> ${escapeHtml(q.difficulty || "Sin dificultad")} &nbsp; <strong>Supervisión:</strong> ${q.supervised ? "Supervisada" : "Pendiente"}</p>
          ${image}
          <ol type="A">
            ${(q.options || []).map(opt => `<li>${escapeHtml(opt)}</li>`).join("")}
          </ol>
          <p><strong>Respuesta correcta:</strong> ${answerLabel(q.answer)}. ${escapeHtml(correct)}</p>
          ${q.explanation ? `<p><strong>Explicación:</strong> ${escapeHtml(q.explanation)}</p>` : ""}
          ${q.link ? `<p><strong>Enlace:</strong> ${escapeHtml(q.link)}</p>` : ""}
          ${explanationImage}
        </div>
      `;
    }).join("");

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; color:#1A1060; line-height:1.45; }
          h1 { font-size:24px; margin-bottom:4px; }
          h2 { font-size:15px; margin:0 0 8px; color:#1A1060; }
          .meta { color:#666; font-size:12px; margin-bottom:20px; }
          .question { page-break-inside: avoid; border-bottom:1px solid #ddd; padding:14px 0; }
          ol { margin-top:8px; }
          li { margin-bottom:4px; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <p class="meta">${selectedQuestions.length} pregunta${selectedQuestions.length !== 1 ? "s" : ""} · Exportado desde HistoMind</p>
        ${rows}
      </body>
      </html>
    `;

    const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
    const filename = (exportTopic === "todos" ? "histomind_banco_preguntas" : "histomind_" + exportTopic)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase() + ".doc";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
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
    const allA = sessionDetails.flatMap(s => s.answers||[]);
    const students = [...new Set(sessions.map(s => s.student))];
    const totalTime = sessions.reduce((a,s) => a+(s.durationMs||0), 0);
    const supervised = db.filter(q => q.supervised).length;

    const qStats = {};
    allA.forEach(a => {
      if (!qStats[a.questionId]) qStats[a.questionId]={questionId:a.questionId,question:a.question,difficulty:a.difficulty,topic:a.topic||"",total:0,correct:0};
      qStats[a.questionId].total++;
      if (a.correct) qStats[a.questionId].correct++;
    });
    const qList = Object.values(qStats).sort((a,b) => (a.correct/a.total)-(b.correct/b.total));

    const stuStats = {};
    sessions.forEach(s => {
      if (!stuStats[s.student]) stuStats[s.student]={name:s.student,sessions:0,totalTime:0,correct:0,total:0};
      stuStats[s.student].sessions++;
      stuStats[s.student].totalTime += s.durationMs||0;
      stuStats[s.student].total += s.total || 0;
      stuStats[s.student].correct += s.correct || 0;
    });
    const stuList = Object.values(stuStats).sort((a,b) => b.sessions-a.sessions);

    const topicStats = {};
    db.forEach(q => { if (!topicStats[q.topic]) topicStats[q.topic]={topic:q.topic,correct:0,total:0}; });
    allA.forEach(a => {
      const q = db.find(x => x.id===a.questionId);
      if (!q) return;
      if (!topicStats[q.topic]) topicStats[q.topic]={topic:q.topic,correct:0,total:0};
      topicStats[q.topic].total++;
      if (a.correct) topicStats[q.topic].correct++;
    });
    const topicList = Object.values(topicStats).filter(t=>t.total>0).sort((a,b)=>(a.correct/a.total)-(b.correct/b.total));

    const globalPct = allA.length ? Math.round(allA.filter(a=>a.correct).length/allA.length*100) : 0;
    const criticalQs = qList.filter(q => Math.round(q.correct/q.total*100) < 40).length;

    return (
      <div>
        <Nav />

        {/* Supervisión */}
        <div style={{display:"flex",gap:8,marginBottom:16,padding:"10px 14px",borderRadius:"var(--border-radius-md)",
          background:"#F0EAF9",border:"0.5px solid #C9A8F0",fontSize:13,alignItems:"center"}}>
          <span><strong>{supervised}/{db.length}</strong> preguntas supervisadas</span>
          <div style={{flex:1,height:6,borderRadius:3,background:"#ddd",overflow:"hidden",marginLeft:8}}>
            <div style={{width:(db.length?supervised/db.length*100:0)+"%",height:"100%",background:"#7B4FBE",borderRadius:3}} />
          </div>
        </div>

        {sessions.length===0
          ? <div style={{padding:"2rem",textAlign:"center",color:"var(--color-text-secondary)",background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)"}}>Sin datos de sesiones aún.</div>
          : (<>
            {/* Métricas */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
              {[
                [sessions.length,"Sesiones totales","#378ADD",""],
                [students.length,"Alumnos activos","#1D9E75","de "+students.length+" en ranking"],
                [globalPct+"%","Acierto global",globalPct>=70?"#1D9E75":globalPct>=40?"#BA7517":"#C0392B",""],
                [criticalQs,"Preguntas críticas","#E24B4A","menos del 40% acierto"]
              ].map(([v,l,c,sub]) => (
                <div key={l} style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"12px 14px"}}>
                  <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:4}}>{l}</div>
                  <div style={{fontSize:22,fontWeight:500,color:c}}>{v}</div>
                  {sub && <div style={{fontSize:11,color:"var(--color-text-secondary)",marginTop:2}}>{sub}</div>}
                </div>
              ))}
            </div>

            {/* Preguntas más falladas */}
            <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"1rem 1.25rem",marginBottom:16}}>
              <p style={{fontSize:13,fontWeight:500,margin:"0 0 14px",color:"var(--color-text-primary)"}}>Preguntas más falladas</p>
              {qList.slice(0,8).map((q,i) => {
                const sourceQuestion = db.find(x => String(x.id) === String(q.questionId));
                const pct = Math.round(q.correct/q.total*100);
                const isRed = pct < 40;
                const isAmber = pct >= 40 && pct < 60;
                const color = isRed?"#E24B4A":isAmber?"#EF9F27":"#639922";
                const badgeBg = isRed?"#FCEBEB":isAmber?"#FAEEDA":"#EAF3DE";
                const badgeColor = isRed?"#A32D2D":isAmber?"#854F0B":"#3B6D11";
                const badgeText = isRed?"Crítica":isAmber?"Revisar":"OK";
                return (
                  <button key={i} onClick={() => sourceQuestion && openEdit(sourceQuestion)} disabled={!sourceQuestion}
                    title={sourceQuestion ? "Editar: " + sourceQuestion.question : q.question}
                    style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,width:"100%",padding:"7px 8px",
                      borderRadius:"var(--border-radius-md)",border:"0.5px solid transparent",
                      background:"transparent",cursor:sourceQuestion?"pointer":"default",textAlign:"left",
                      opacity:sourceQuestion?1:0.65}}>
                    <div style={{fontSize:12,color:"var(--color-text-secondary)",minWidth:260,flex:"0 1 420px",
                      whiteSpace:"normal",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",lineHeight:1.25}}>
                      {sourceQuestion?.question || q.question}
                    </div>
                    <div style={{flex:1,height:8,background:"var(--color-background-secondary)",borderRadius:4,overflow:"hidden"}}>
                      <div style={{width:pct+"%",height:"100%",background:color,borderRadius:4}} />
                    </div>
                    <div style={{fontSize:12,fontWeight:500,color:color,width:36,textAlign:"right"}}>{pct}%</div>
                    <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,fontWeight:500,background:badgeBg,color:badgeColor,flexShrink:0}}>{badgeText}</span>
                    <span style={{fontSize:11,color:sourceQuestion?"#6C4CFF":"var(--color-text-secondary)",fontWeight:600,width:44,textAlign:"right",flexShrink:0}}>
                      {sourceQuestion ? "Editar" : "No encontrada"}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Temas con dificultad */}
            <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"1rem 1.25rem",marginBottom:16}}>
              <p style={{fontSize:13,fontWeight:500,margin:"0 0 12px",color:"var(--color-text-primary)"}}>Rendimiento por tema</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {topicList.map((t,i) => {
                  const pct = Math.round(t.correct/t.total*100);
                  const isRed = pct < 40;
                  const isAmber = pct >= 40 && pct < 60;
                  const bg = isRed?"#FCEBEB":isAmber?"#FAEEDA":"#EAF3DE";
                  const color = isRed?"#A32D2D":isAmber?"#854F0B":"#3B6D11";
                  const border = isRed?"#F09595":isAmber?"#FAC775":"#C0DD97";
                  return (
                    <span key={i} style={{fontSize:12,padding:"4px 10px",borderRadius:10,
                      background:bg,color:color,border:"0.5px solid "+border}}>
                      {t.topic} — {pct}%
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Progreso individual con percentiles */}
            {(() => {
              const LEVELS = [
                {key:"critico",label:"🔴 Crítico",min:0,max:25,bg:"#FCEBEB",color:"#A32D2D",border:"#F09595"},
                {key:"riesgo",label:"🟠 En riesgo",min:25,max:50,bg:"#FEF0E7",color:"#C05C1A",border:"#FAB87A"},
                {key:"progreso",label:"🟡 En progreso",min:50,max:75,bg:"#FAEEDA",color:"#854F0B",border:"#FAC775"},
                {key:"destacado",label:"🟢 Destacado",min:75,max:100,bg:"#EAF3DE",color:"#3B6D11",border:"#C0DD97"},
              ];
              const sorted = [...stuList].sort((a,b) => {
                const pa = a.total?a.correct/a.total:0;
                const pb = b.total?b.correct/b.total:0;
                return pa-pb;
              });
              const withPercentile = sorted.map((s,i) => ({
                ...s,
                pct: s.total?Math.round(s.correct/s.total*100):0,
                percentile: Math.round((i/(Math.max(sorted.length-1,1)))*100)
              }));
              const getLevel = p => LEVELS.find(l => p>=l.min && p<l.max) || LEVELS[3];
              
              const filtered = activeFilter==="todos"
                ? withPercentile
                : withPercentile.filter(s => getLevel(s.percentile).key===activeFilter);
              const displayed = showAll ? filtered : filtered.slice(0,10);
              return (
                <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"1rem 1.25rem",marginBottom:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
                    <p style={{fontSize:13,fontWeight:500,margin:0,color:"var(--color-text-primary)"}}>Progreso individual</p>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {[["todos","Todos"],["critico","🔴 Crítico"],["riesgo","🟠 En riesgo"],["progreso","🟡 En progreso"],["destacado","🟢 Destacado"]].map(([k,l])=>(
                        <button key={k} onClick={()=>{setActiveFilter(k);setShowAll(false);}}
                          style={{fontSize:11,padding:"3px 10px",borderRadius:20,cursor:"pointer",
                            fontWeight:activeFilter===k?500:400,
                            background:activeFilter===k?"#1A1060":"transparent",
                            color:activeFilter===k?"#fff":"var(--color-text-secondary)",
                            border:activeFilter===k?"none":"0.5px solid var(--color-border-tertiary)"}}>
                          {l} {k!=="todos"?`(${withPercentile.filter(s=>getLevel(s.percentile).key===k).length})`:`(${withPercentile.length})`}
                        </button>
                      ))}
                    </div>
                  </div>
                  {displayed.map((s,i) => {
                    const lv = getLevel(s.percentile);
                    return (
                      <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",
                        borderBottom:i<displayed.length-1?"0.5px solid var(--color-border-tertiary)":"none"}}>
                        <Avatar name={s.name} size={28} />
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                            <span style={{fontSize:13,color:"var(--color-text-primary)"}}>{s.name}</span>
                            <span style={{fontSize:10,padding:"1px 7px",borderRadius:10,fontWeight:500,
                              background:lv.bg,color:lv.color,border:"0.5px solid "+lv.border}}>
                              {lv.label} · P{s.percentile}
                            </span>
                          </div>
                          <div style={{height:4,background:"var(--color-background-secondary)",borderRadius:2,overflow:"hidden"}}>
                            <div style={{width:s.pct+"%",height:"100%",background:lv.color,borderRadius:2}} />
                          </div>
                        </div>
                        <div style={{fontSize:12,fontWeight:500,color:lv.color,minWidth:36,textAlign:"right"}}>{s.pct}%</div>
                        <span style={{fontSize:11,color:"var(--color-text-secondary)",minWidth:60,textAlign:"right"}}>{s.sessions} ses.</span>
                      </div>
                    );
                  })}
                  {filtered.length>10 && (
                    <button onClick={()=>setShowAll(v=>!v)}
                      style={{width:"100%",marginTop:12,padding:"8px",borderRadius:"var(--border-radius-md)",
                        fontSize:12,cursor:"pointer",background:"var(--color-background-secondary)",
                        color:"var(--color-text-secondary)",border:"0.5px solid var(--color-border-tertiary)"}}>
                      {showAll?"Ver menos":"Ver todos ("+filtered.length+")"}
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Historial */}
            <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"1rem 1.25rem"}}>
              <p style={{fontSize:13,fontWeight:500,margin:"0 0 12px",color:"var(--color-text-primary)"}}>Historial de sesiones</p>
              {[...sessions].reverse().slice(0,10).map((s,i) => {
                const ans = s.answers||[];
                const ok = ans.filter(a=>a.correct).length;
                const pct = ans.length ? Math.round(ok/ans.length*100) : 0;
                return (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",
                    borderRadius:"var(--border-radius-md)",background:"var(--color-background-secondary)",fontSize:13,marginBottom:6}}>
                    <Avatar name={s.student} size={24} />
                    <span style={{flex:1,fontWeight:500,fontSize:13}}>{s.student}</span>
                    <span style={{color:"var(--color-text-secondary)",fontSize:12}}>
                      {new Date(s.date).toLocaleDateString("es-ES",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}
                    </span>
                    <span style={{color:"var(--color-text-secondary)",fontSize:12}}>{fmt(s.durationMs||0)}</span>
                    <span style={{fontSize:12,fontWeight:500,padding:"2px 10px",borderRadius:10,
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
      const sc = s.points != null ? s.points : 0;
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
          <div>
  <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:4}}>Link de ampliación (opcional)</div>
  <input value={form.link||""} onChange={e => setForm(f => ({...f,link:e.target.value}))}
    placeholder="https://www.youtube.com/... o cualquier URL"
    style={{width:"100%",fontSize:13,padding:"8px 10px",borderRadius:"var(--border-radius-md)",
      border:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)",
      color:"var(--color-text-primary)",boxSizing:"border-box"}} />
</div>
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
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",borderTop:"0.5px solid var(--color-border-tertiary)",paddingTop:10}}>
          <span style={{fontSize:12,fontWeight:500,color:"var(--color-text-secondary)",minWidth:80}}>Exportar:</span>
          <select value={exportTopic} onChange={e => setExportTopic(e.target.value)}
            style={{fontSize:12,padding:"4px 8px",borderRadius:"var(--border-radius-md)",
              border:"0.5px solid var(--color-border-tertiary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)"}}>
            <option value="todos">Todas las preguntas ({db.length})</option>
            {usedTopics.map(t => <option key={t} value={t}>{t} ({db.filter(q=>q.topic===t).length})</option>)}
          </select>
          <button onClick={exportQuestionsToWord}
            style={{fontSize:12,padding:"5px 12px",borderRadius:"var(--border-radius-md)",cursor:"pointer",fontWeight:600,
              background:"#E8F3FC",color:"#185FA5",border:"0.5px solid #9DC3E6"}}>
            Exportar Word
          </button>
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
function SupervisorMode({ users, updateUsers, passwordRequests, setPasswordRequests }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({displayName:"",username:"",password:"",role:"alumno"});
  const [msg, setMsg]           = useState("");
  const [resetText, setResetText] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState("");
  const { save, list } = useStorage();

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

  const resetAllProgress = async () => {
    if (resetText.trim() !== "REINICIAR") {
      setResetMsg("Escribe REINICIAR para confirmar el reseteo.");
      return;
    }
    const ok = window.confirm("Esto borrará el progreso, XP, ranking, sesiones y rachas de todos los usuarios. Usuarios y preguntas se conservan. ¿Continuar?");
    if (!ok) return;

    setResetBusy(true);
    setResetMsg("Reseteando progreso...");
    try {
      const [summaries, details, seen, streaks] = await Promise.all([
        list("histo_summary_", true),
        list("histo_detail_", false),
        list("histo_seen_", false),
        list("histo_streak_", true)
      ]);

      await Promise.all([
        ...summaries
          .filter(item => item.key !== "histo_summary_keys")
          .map(item => save(item.key, null, true)),
        ...details.map(item => save(item.key, null, false)),
        ...seen.map(item => save(item.key, [], false)),
        ...streaks.map(item => save(item.key, null, true)),
        save("histo_sessions", [], true),
        save("histo_summary_keys", [], true),
        save("histo_migration_done", true, true),
        save("histo_progress_reset_at", new Date().toISOString(), true)
      ]);

      setResetText("");
      setResetMsg("Progreso reiniciado. Los alumnos empezarán de cero al recargar la app.");
    } catch(e) {
      setResetMsg("Error al resetear: " + (e?.message || "inténtalo de nuevo"));
    }
    setResetBusy(false);
  };

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.25rem",gap:12,flexWrap:"wrap"}}>
        <h3 style={{fontSize:16,fontWeight:600,margin:0}}>Gestión de usuarios</h3>
        <button onClick={() => { setShowForm(s => !s); setMsg(""); }}
          style={{padding:"6px 14px",borderRadius:"var(--border-radius-md)",fontSize:13,fontWeight:500,cursor:"pointer",
            background:"var(--color-background-success)",color:"var(--color-text-success)",border:"0.5px solid var(--color-border-success)"}}>
          + Nuevo usuario
        </button>
      </div>

      {passwordRequests && passwordRequests.length > 0 && (
        <div style={{background:"#FEF3DC",border:"0.5px solid #E6A020",borderRadius:14,padding:"12px 16px",marginBottom:16}}>
          <p style={{fontSize:13,fontWeight:600,color:"#854F0B",margin:"0 0 10px"}}>⚠️ Solicitudes de contraseña pendientes ({passwordRequests.length})</p>
          {passwordRequests.map((username,i) => {
            const u = users.find(u => u.username === username);
            return (
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<passwordRequests.length-1?"0.5px solid #E6A020":"none"}}>
                <Avatar name={u?.displayName||username} size={28} />
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)"}}>{u?.displayName||username}</div>
                  <div style={{fontSize:11,color:"var(--color-text-secondary)"}}> @{username}</div>
                </div>
                <button onClick={()=>{
                  const newPass = prompt("Nueva contraseña para "+username+":");
                  if (!newPass) return;
                  updateUsers(users.map(u => u.username===username ? {...u,password:newPass} : u));
                  setPasswordRequests(prev => prev.filter(r => r!==username));
                  alert("Contraseña cambiada correctamente.");
                }}
                  style={{fontSize:12,padding:"5px 12px",borderRadius:10,cursor:"pointer",fontWeight:500,
                    background:"#1A1060",color:"#fff",border:"none"}}>
                  Resetear
                </button>
              </div>
            );
          })}
        </div>
      )}

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

      <div style={{
        background:"#FFF7ED",
        border:"0.5px solid #FDBA74",
        borderRadius:"var(--border-radius-md)",
        padding:"14px 16px",
        marginBottom:"1.25rem"
      }}>
        <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"flex-start",flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:240}}>
            <h4 style={{fontSize:14,fontWeight:700,color:"#9A3412",margin:"0 0 6px"}}>Reiniciar progreso de todos</h4>
            <p style={{fontSize:12,color:"#7C2D12",lineHeight:1.5,margin:0}}>
              Borra sesiones, XP, ranking, progreso por preguntas, rachas y Hall of Fame. Conserva usuarios, contraseñas y banco de preguntas.
            </p>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <input value={resetText} onChange={e => setResetText(e.target.value)} placeholder="Escribe REINICIAR"
              style={{fontSize:13,padding:"7px 10px",borderRadius:"var(--border-radius-md)",minWidth:160,
                border:"0.5px solid #FDBA74",background:"#fff",color:"var(--color-text-primary)"}} />
            <button onClick={resetAllProgress} disabled={resetBusy || resetText.trim() !== "REINICIAR"}
              style={{fontSize:13,padding:"7px 14px",borderRadius:"var(--border-radius-md)",fontWeight:700,
                cursor:(resetBusy || resetText.trim() !== "REINICIAR")?"not-allowed":"pointer",
                opacity:(resetBusy || resetText.trim() !== "REINICIAR")?0.55:1,
                background:"#C2410C",color:"#fff",border:"none"}}>
              {resetBusy ? "Reseteando..." : "Resetear progreso"}
            </button>
          </div>
        </div>
        {resetMsg && <p style={{fontSize:12,color:resetMsg.startsWith("Error")?"#C0392B":"#7C2D12",margin:"10px 0 0"}}>{resetMsg}</p>}
      </div>

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
