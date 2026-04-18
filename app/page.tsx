"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { puter } from "@heyputer/puter.js";

// ═══════════════════════════════════════════════════════════════
//  ARIHANT EDUCARE — ARIO AI TEACHER  v3.0
//  Default admin → username: admin  password: AEAdmin@2024
//  Special admin bypass: type  ##AEADMIN##  in username field
//  Logo Colors Theme: Blue #1E22CC, Red #E8000D
//  NEW v3: Multi-session chats, fixed wake word ("Yes?"),
//          logo always visible, email+phone signup,
//          admin full data view, Parent Report retained
// ═══════════════════════════════════════════════════════════════

type Language = "english" | "hindi" | "marathi" | "hinglish";
type UserRole  = "student" | "admin";
type AppView   = "auth" | "app" | "admin";

interface User {
  username: string; password: string; name: string;
  grade: string; language: Language; role: UserRole;
  createdAt: number; lastLogin: number;
  email?: string; phone?: string;
}
interface StudentProfile {
  name: string; grade: string; language: Language;
  topicsExplored: string[]; strengths: string[];
  weaknesses: string[]; currentTopic: string | null;
  totalSessions: number; lastActive: number;
  topicSummaries?: Record<string, string>;
}
interface BoardItem {
  type: "svg"|"image"|"text"; content: string;
  annotation?: string; id: number; step: number;
}
interface ChatMessage {
  role: "student"|"ario"; content: string;
  timestamp: number; hasImage?: boolean; topic?: string;
}
interface ChatSession {
  id: string; title: string; createdAt: number;
  summary: string; messages: ChatMessage[];
  board: BoardItem[];
}
interface PracticeQ {
  id: number; question: string; topic: string;
  attempted: boolean; feedback: string;
}

// ─── Theme Colors ────────────────────────────────────────────
const C = {
  blue:"#1E22CC",   blueDark:"#13169A",  blueLight:"#4A4FE8", bluePale:"#E8E9FF",
  red:"#E8000D",    redLight:"#FF3340",  redPale:"#FFE8E9",
  dark:"#0A0B1A",   darkMid:"#0D0F22",   panel:"#10122A",     card:"#151830",
  border:"#1E2246", green:"#00D68F",      greenDark:"#00A86B",
  text:"#C8CDF5",   muted:"#5A6090",      white:"#F0F1FF",
};

const LOGO_SRC = "/logo_and_name.png";

const GRADES: Record<string,{label:string;level:string}> = {
  "6": {label:"Grade 6",  level:"Very simple, real-life analogies, avoid heavy formulas"},
  "7": {label:"Grade 7",  level:"Simple with basic formulas introduced gently"},
  "8": {label:"Grade 8",  level:"Moderate depth, step-by-step reasoning with formulas"},
  "9": {label:"Grade 9",  level:"Board-level clarity, standard concepts, exam-focused"},
  "10":{label:"Grade 10", level:"Board-level depth, standard derivations, key formulas"},
  "11":{label:"Grade 11", level:"Advanced, JEE/NEET-aware, detailed derivations"},
  "12":{label:"Grade 12", level:"Expert depth, competitive exam level, full derivations"},
};

const LANG_UI: Record<Language,{label:string;flag:string;placeholder:string;wakeHint:string;thinking:string;speaking:string;listening:string;ready:string;wakeActive:string}> = {
  english: {label:"English",  flag:"🇬🇧", placeholder:"Ask Ario anything…",        wakeHint:'Say "Hey Ario" — Ario will say "Yes?"', thinking:"Thinking…",      speaking:"Speaking…",    listening:"Listening…",  ready:"Ready",       wakeActive:"Hey Ario!"},
  hindi:   {label:"हिंदी",    flag:"🇮🇳", placeholder:"Ario se kuch bhi poochho…", wakeHint:'"Hey Ario" bolo — Ario "Haan?" bolega',  thinking:"Soch raha…",    speaking:"Bol raha…",    listening:"Sun raha…",   ready:"Taiyaar",     wakeActive:"Hey Ario!"},
  marathi: {label:"मराठी",   flag:"🌸", placeholder:"Ario ला काही विचारा…",      wakeHint:'"Hey Ario" म्हणा — Ario "हो?" म्हणेल',  thinking:"विचार करतो…",  speaking:"बोलतोय…",     listening:"ऐकतोय…",    ready:"तयार",       wakeActive:"Hey Ario!"},
  hinglish:{label:"Hinglish", flag:"🇮🇳", placeholder:"Kuch bhi poochho Ario se…", wakeHint:'"Hey Ario" bolo — Ario "Haan bolo!" kehega', thinking:"Soch raha…", speaking:"Bol raha…",    listening:"Sun raha…",   ready:"Ready",       wakeActive:"Hey Ario!"},
};

// ─── Storage ─────────────────────────────────────────────────
const PFX = "ae3_";
const hashPwd = (p: string) => btoa(p + "_ae2024_arihant");
const genId   = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36);

const getUsers    = (): User[]         => { try { return JSON.parse(localStorage.getItem(PFX+"users")      || "[]");   } catch { return []; }    };
const saveUsers   = (u: User[])        => localStorage.setItem(PFX+"users", JSON.stringify(u));
const getProfile  = (un: string): StudentProfile|null => { try { return JSON.parse(localStorage.getItem(PFX+"prof_"+un) || "null"); } catch { return null; } };
const saveProfile = (un: string, p: StudentProfile)   => localStorage.setItem(PFX+"prof_"+un, JSON.stringify(p));
const getSessions = (un: string): ChatSession[] => { try { return JSON.parse(localStorage.getItem(PFX+"sess_"+un) || "[]"); } catch { return []; } };
const saveSessions= (un: string, s: ChatSession[]) => localStorage.setItem(PFX+"sess_"+un, JSON.stringify(s));

const seedAdmin = () => {
  const users = getUsers();
  if (!users.find(u => u.username === "admin")) {
    users.unshift({ username:"admin", password:hashPwd("AEAdmin@2024"), name:"Administrator",
      grade:"admin", language:"english", role:"admin", createdAt:Date.now(), lastLogin:0 });
    saveUsers(users);
  }
};

function extractJSON(raw: string): any {
  let s = raw.replace(/^```(?:json)?\s*/im,"").replace(/\s*```\s*$/m,"").trim();
  try { return JSON.parse(s); } catch {}
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

function buildSysPrompt(p: StudentProfile, hasImage?: boolean): string {
  const gradeInfo = GRADES[p.grade];
  const mem = [
    p.currentTopic          ? `Current Topic: ${p.currentTopic}`                       : "",
    p.topicsExplored.length ? `Topics Covered: ${p.topicsExplored.join(", ")}`         : "",
    p.strengths.length      ? `Strengths: ${p.strengths.join(", ")}`                   : "",
    p.weaknesses.length     ? `Needs Work: ${p.weaknesses.join(", ")}`                 : "",
  ].filter(Boolean).join("\n");
  const langInstr: Record<Language,string> = {
    english:  "Respond entirely in clear, simple English. Warm and encouraging tone.",
    hindi:    "पूरी तरह से हिंदी में जवाब दो। गर्म और प्रोत्साहित करने वाले अंदाज में। English technical terms रख सकते हो।",
    marathi:  "संपूर्ण मराठी मध्ये उत्तर द्या. उबदार आणि प्रोत्साहन देणार्‍या सुरात. English technical terms ठेवता येतात.",
    hinglish: "Hinglish mein baat karo — Hindi aur English naturally mix karo jaise Indians bolte hain.",
  };
  const imageSection = hasImage
    ? `\nIMAGE PROVIDED: Student uploaded an image/problem. Read carefully, explain step-by-step, draw SVG diagram.`
    : "";
  return `You are Ario — an exceptional AI teacher created by Arihant Educare. Address student as ${p.name}.${imageSection}

⚠️ CRITICAL: Respond ONLY in valid raw JSON. Zero text before or after. No markdown fences.

STUDENT:
- Name: ${p.name}
- Grade: ${gradeInfo?.label ?? p.grade}
- Teaching Level: ${gradeInfo?.level ?? "Age-appropriate"}
- Language Preference: ${p.language}
${mem ? `\nMEMORY:\n${mem}` : ""}

JSON FORMAT (strict):
{
  "speech": "What you say to ${p.name} — use name naturally — max 3 sentences, warm and direct",
  "board": {
    "type": "svg OR text OR image",
    "content": "SVG markup OR short key concept text OR image URL",
    "annotation": "Short label 5-8 words"
  },
  "question": "One Socratic question — do NOT answer it yourself",
  "memory_update": {
    "topic": "current topic (2-5 words)",
    "strength": "something student got right or null",
    "weakness": "something student struggles with or null"
  }
}

LANGUAGE: ${langInstr[p.language]}

WHITEBOARD RULES (CRITICAL — NEVER SKIP):
★ EVERY response MUST include a board item — no exceptions
★ ALWAYS prefer type "svg" with a real diagram
★ Each SVG must be FRESH content relevant to THIS specific explanation
★ type "text" → ONLY for formulas/key facts
★ type "image" → ONLY real Wikipedia Commons photo URLs

SVG RULES:
- Open: <svg viewBox="0 0 520 300" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-height:280px;font-family:sans-serif;background:#fff;border-radius:8px;padding:8px">
- Close: </svg>
- Colors: blue #1E22CC, red #E8000D, green #22c55e, amber #f59e0b, purple #8b5cf6
- Use <text> for all labels, font-size 13-16, stroke 2-3px
- Good SVGs: atom model, graph, force diagram, triangle, number line, timeline, cell diagram, Venn diagram, circuit

TEACHING STYLE:
- Socratic method: guide, never give away answers directly
- ${gradeInfo?.level ?? "Explain clearly"}
- Use relatable Indian analogies (cricket, chai, dosa, local trains, etc.)
- If student is wrong: gentle nudge, never say "wrong" or "incorrect"
- End with exactly ONE question`;
}

// ─── Logo Component — always visible ─────────────────────────
function AELogo({ height = 44, darkBg = false }: { height?: number; darkBg?: boolean }) {
  const [imgError, setImgError] = useState(false);
  if (imgError) {
    return (
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <div style={{ width:Math.round(height*0.7), height, background:`linear-gradient(160deg,${C.blue},${C.blueDark})`, borderRadius:6, border:`3px solid ${C.red}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <span style={{ color:C.red, fontSize:Math.round(height*0.32), fontWeight:900, fontFamily:"Georgia, serif" }}>AE</span>
        </div>
        <div>
          <div style={{ fontSize:Math.round(height*0.36), fontWeight:900, lineHeight:1.1, fontFamily:"'Arial Black', sans-serif" }}>
            <span style={{ color:C.blue }}>ARIHANT </span>
            <span style={{ color:C.red }}>EDUCARE</span>
          </div>
          {height > 36 && <div style={{ fontSize:Math.round(height*0.22), color: darkBg ? "#666" : C.muted, fontStyle:"italic" }}>a tradition of excellence...</div>}
        </div>
      </div>
    );
  }
  return (
    <img
      src={LOGO_SRC}
      alt="Arihant Educare"
      style={{ height, objectFit:"contain", display:"block", maxWidth:"100%" }}
      onError={() => setImgError(true)}
    />
  );
}

// ─── Ario Avatar ──────────────────────────────────────────────
function AvatarFace({ isSpeaking, isThinking, wakeListening }:
  { isSpeaking:boolean; isThinking:boolean; wakeListening:boolean }) {
  const eyeColor = wakeListening ? C.blue : C.green;
  return (
    <svg viewBox="0 0 200 240" width="150" height="180" xmlns="http://www.w3.org/2000/svg">
      <line x1="100" y1="8" x2="100" y2="38" stroke={eyeColor} strokeWidth="3" strokeLinecap="round"/>
      <circle cx="100" cy="6" r="7" fill={eyeColor}>
        {(isSpeaking||wakeListening) && <animate attributeName="r" values="7;11;7" dur="0.5s" repeatCount="indefinite"/>}
      </circle>
      {(isSpeaking||wakeListening) && (
        <circle cx="100" cy="6" r="7" fill="none" stroke={eyeColor} strokeWidth="2" opacity="0.4">
          <animate attributeName="r" values="7;18;7" dur="0.5s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.6;0;0.6" dur="0.5s" repeatCount="indefinite"/>
        </circle>
      )}
      <rect x="25" y="38" width="150" height="128" rx="22" fill={C.panel} stroke={eyeColor} strokeWidth="2.5"/>
      <rect x="12" y="78" width="13" height="24" rx="5" fill={C.panel} stroke={eyeColor} strokeWidth="2"/>
      <rect x="175" y="78" width="13" height="24" rx="5" fill={C.panel} stroke={eyeColor} strokeWidth="2"/>
      <ellipse cx="73" cy="96" rx="22" ry="22" fill="#020617"/>
      <ellipse cx="127" cy="96" rx="22" ry="22" fill="#020617"/>
      <ellipse cx="73" cy="96" rx="14" ry="14" fill={eyeColor}>
        <animate attributeName="ry" values="14;1;14" dur="3.8s" repeatCount="indefinite" keyTimes="0;0.48;1"/>
      </ellipse>
      <circle cx="77" cy="92" r="4" fill="white" opacity="0.85"/>
      <circle cx="70" cy="100" r="2" fill="white" opacity="0.4"/>
      <ellipse cx="127" cy="96" rx="14" ry="14" fill={eyeColor}>
        <animate attributeName="ry" values="14;1;14" dur="3.8s" repeatCount="indefinite" keyTimes="0;0.48;1"/>
      </ellipse>
      <circle cx="131" cy="92" r="4" fill="white" opacity="0.85"/>
      <circle cx="124" cy="100" r="2" fill="white" opacity="0.4"/>
      {isSpeaking ? (
        <ellipse cx="100" cy="144" rx="22" ry="9" fill={eyeColor}>
          <animate attributeName="ry" values="9;3;10;4;9" dur="0.28s" repeatCount="indefinite"/>
        </ellipse>
      ) : isThinking ? (
        <path d="M 78 142 Q 100 138 122 142" stroke={eyeColor} strokeWidth="3" fill="none" strokeLinecap="round"/>
      ) : wakeListening ? (
        <path d="M 76 140 Q 100 152 124 140" stroke={C.blue} strokeWidth="3" fill="none" strokeLinecap="round"/>
      ) : (
        <path d="M 76 140 Q 100 157 124 140" stroke={eyeColor} strokeWidth="3" fill="none" strokeLinecap="round"/>
      )}
      {isThinking && [82,100,118].map((x,i) => (
        <circle key={i} cx={x} cy={170} r="4" fill={eyeColor}>
          <animate attributeName="opacity" values="0.15;1;0.15" dur="1.1s" repeatCount="indefinite" begin={`${i*0.25}s`}/>
          <animate attributeName="cy" values="170;165;170" dur="1.1s" repeatCount="indefinite" begin={`${i*0.25}s`}/>
        </circle>
      ))}
      {wakeListening && (
        <g>{[0,1,2,3,4].map(i => (
          <circle key={i} cx={68+i*16} cy={170} r="3.5" fill={C.blue}>
            <animate attributeName="r" values="3.5;6;3.5" dur="0.9s" repeatCount="indefinite" begin={`${i*0.18}s`}/>
            <animate attributeName="opacity" values="0.4;1;0.4" dur="0.9s" repeatCount="indefinite" begin={`${i*0.18}s`}/>
          </circle>
        ))}</g>
      )}
      <rect x="82" y="166" width="36" height="22" rx="6" fill={C.panel} stroke={eyeColor} strokeWidth="2"/>
      <rect x="40" y="188" width="120" height="22" rx="10" fill={C.panel} stroke={eyeColor} strokeWidth="2"/>
    </svg>
  );
}

// ─── Whiteboard Card ──────────────────────────────────────────
function BoardCard({ item }: { item: BoardItem }) {
  const [entered, setEntered] = useState(false);
  const [annotIn, setAnnotIn] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setEntered(true), 60);
    const t2 = setTimeout(() => setAnnotIn(true), 750);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return (
    <div style={{ opacity:entered?1:0, transform:entered?"translateY(0) scale(1)":"translateY(20px) scale(0.97)", transition:"all 0.5s cubic-bezier(.34,1.56,.64,1)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
        <div style={{ width:24, height:24, borderRadius:"50%", background:`linear-gradient(135deg,${C.blue},${C.red})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"#fff", flexShrink:0, boxShadow:`0 2px 8px ${C.blue}66` }}>
          {item.step}
        </div>
        {item.annotation && (
          <div style={{ opacity:annotIn?1:0, transform:annotIn?"translateX(0)":"translateX(-10px)", transition:"all 0.4s ease", background:`linear-gradient(90deg,${C.bluePale},#dde0ff)`, border:`1.5px solid ${C.blueLight}99`, borderRadius:20, padding:"3px 12px", fontSize:12, fontWeight:600, color:C.blueDark, display:"flex", alignItems:"center", gap:5 }}>
            <span>📌</span>{item.annotation}
          </div>
        )}
      </div>
      {item.type==="svg"   && <div style={{ borderRadius:14, overflow:"hidden", border:"1.5px solid #e2e8f0", boxShadow:"0 4px 20px rgba(0,0,0,0.06)", background:"#fff" }}><div dangerouslySetInnerHTML={{__html:item.content}} style={{width:"100%",overflow:"hidden",display:"block"}}/></div>}
      {item.type==="image" && <div style={{ borderRadius:14, overflow:"hidden", border:"1.5px solid #e2e8f0" }}><img src={item.content} alt={item.annotation||"diagram"} style={{width:"100%",maxHeight:260,objectFit:"contain",display:"block",background:"#fff"}} onError={e=>{(e.target as HTMLImageElement).style.display="none"}}/></div>}
      {item.type==="text"  && <div style={{ background:`linear-gradient(135deg,${C.bluePale},#dde0ff)`, border:`1.5px solid ${C.blueLight}99`, borderLeft:`4px solid ${C.blue}`, borderRadius:12, padding:"14px 18px", fontSize:15, color:C.blueDark, fontFamily:"'Kalam',cursive", lineHeight:1.7 }}>{item.content}</div>}
    </div>
  );
}

function Whiteboard({ items, user }: { items: BoardItem[]; user: User|null }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [items]);
  return (
    <div style={{ background:"#fffef7", borderRadius:18, minHeight:360, padding:"24px 28px", border:"2px solid #e8e4d9", boxShadow:"0 6px 32px rgba(0,0,0,0.06)", position:"relative" }}>
      <div style={{ position:"absolute", inset:0, borderRadius:18, backgroundImage:"repeating-linear-gradient(transparent,transparent 31px,#e8e4d960 31px,#e8e4d960 32px)", backgroundPosition:"0 62px", pointerEvents:"none" }}/>
      <div style={{ position:"relative", zIndex:1 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:22, paddingBottom:16, borderBottom:"2.5px dashed #d8d4c4" }}>
          <div style={{ display:"flex", gap:6 }}>{[C.red,"#f59e0b",C.green].map((c,i) => <div key={i} style={{width:10,height:10,borderRadius:"50%",background:c}}/>)}</div>
          <span style={{ color:"#94a3b8", fontSize:12, fontFamily:"'Space Mono',monospace", fontWeight:700, letterSpacing:"0.08em" }}>ARIO&apos;S BOARD</span>
          {user && <span style={{ marginLeft:"auto", background:C.bluePale, border:`1px solid ${C.blueLight}99`, borderRadius:20, padding:"2px 10px", fontSize:11, color:C.blueDark, fontWeight:600 }}>{user.name} · {GRADES[user.grade]?.label ?? `Grade ${user.grade}`}</span>}
        </div>
        {items.length===0 && (
          <div style={{ textAlign:"center", color:"#c8c4b7", marginTop:80, fontSize:15, fontFamily:"'Kalam',cursive", lineHeight:1.8 }}>
            ✏️ Ario ka whiteboard taiyaar hai…<br/>
            <span style={{fontSize:13}}>Yahan diagrams aur notes aayenge jaise tum seekhoge!</span>
          </div>
        )}
        <div style={{ display:"flex", flexDirection:"column", gap:28 }}>
          {items.map(item => <BoardCard key={item.id} item={item}/>)}
        </div>
        <div ref={endRef}/>
      </div>
    </div>
  );
}

// ─── Status Pill ──────────────────────────────────────────────
function StatusPill({ isListening, isThinking, isSpeaking, wakeListening, lang }:
  { isListening:boolean; isThinking:boolean; isSpeaking:boolean; wakeListening:boolean; lang:Language }) {
  const ui = LANG_UI[lang];
  let label=ui.ready, dot=C.muted;
  if (wakeListening)  { label=`🔵 ${ui.wakeActive}`;  dot=C.blueLight;  }
  else if (isListening)  { label=ui.listening;  dot="#a78bfa"; }
  else if (isThinking)   { label=ui.thinking;   dot="#fbbf24"; }
  else if (isSpeaking)   { label=ui.speaking;   dot=C.green;   }
  return (
    <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"4px 14px", borderRadius:999, background:`${dot}22`, border:`1px solid ${dot}44`, fontSize:12, fontWeight:600, color:dot, fontFamily:"'Outfit',sans-serif", transition:"all 0.3s" }}>
      <span style={{ width:7, height:7, borderRadius:"50%", background:dot, display:"inline-block", animation:(isListening||isThinking||isSpeaking||wakeListening)?"statusPulse 1s infinite":"none" }}/>
      {label}
    </div>
  );
}

// ─── Session Sidebar ──────────────────────────────────────────
function SessionSidebar({ sessions, activeId, onSelect, onNew, onDelete }:
  { sessions:ChatSession[]; activeId:string|null; onSelect:(id:string)=>void; onNew:()=>void; onDelete:(id:string)=>void }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <div style={{ padding:"10px 12px", borderBottom:`1px solid ${C.border}` }}>
        <button onClick={onNew}
          style={{ width:"100%", padding:"9px 0", borderRadius:10, border:`1.5px dashed ${C.blueLight}`, background:`${C.blue}10`, color:C.blueLight, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'Outfit',sans-serif", display:"flex", alignItems:"center", justifyContent:"center", gap:6, transition:"all 0.15s" }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background=`${C.blue}20`; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background=`${C.blue}10`; }}>
          ✚ New Chat
        </button>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"8px" }}>
        {sessions.length===0 && <p style={{ color:C.muted, fontSize:12, textAlign:"center", marginTop:20, padding:"0 8px" }}>No chats yet. Start one!</p>}
        {[...sessions].reverse().map(s => (
          <div key={s.id}
            style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 10px", borderRadius:10, border:`1px solid ${activeId===s.id?C.blue:C.border}`, background:activeId===s.id?`${C.blue}15`:C.card, cursor:"pointer", marginBottom:5 }}
            onClick={() => onSelect(s.id)}>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ color:"#e2e8f0", fontSize:12, fontWeight:600, margin:0, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{s.title||"Untitled"}</p>
              <p style={{ color:C.muted, fontSize:10, margin:"2px 0 0" }}>{new Date(s.createdAt).toLocaleDateString("en-IN")}</p>
              {s.summary && <p style={{ color:C.muted, fontSize:10, margin:"3px 0 0", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", fontStyle:"italic" }}>"{s.summary.slice(0,45)}…"</p>}
            </div>
            <button onClick={e => { e.stopPropagation(); onDelete(s.id); }}
              style={{ width:20, height:20, borderRadius:"50%", border:"none", background:"transparent", color:C.muted, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color=C.red; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color=C.muted; }}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Auth Screen ──────────────────────────────────────────────
function AuthScreen({ onLogin }: { onLogin:(user:User)=>void }) {
  const [tab, setTab]     = useState<"login"|"signup">("login");
  const [form, setForm]   = useState({ username:"", password:"", name:"", grade:"10", confirmPwd:"", email:"", phone:"" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const f = (k:string, v:string) => setForm(p => ({...p,[k]:v}));

  const handleLogin = () => {
    setError(""); setLoading(true);
    setTimeout(() => {
      let uname = form.username.trim(), pwd = form.password;
      if (uname === "##AEADMIN##") { uname="admin"; pwd="AEAdmin@2024"; }
      const users = getUsers();
      const u = users.find(x => x.username===uname && x.password===hashPwd(pwd));
      if (!u) { setError("Username ya password galat hai."); setLoading(false); return; }
      saveUsers(users.map(x => x.username===uname ? {...x,lastLogin:Date.now()} : x));
      onLogin({...u, lastLogin:Date.now()});
      setLoading(false);
    }, 600);
  };

  const handleSignup = () => {
    setError("");
    if (!form.name.trim()||!form.username.trim()||!form.password||!form.email.trim()||!form.phone.trim())
      { setError("Saari fields bharni zaroori hain."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      { setError("Valid email address daalo."); return; }
    if (!/^\d{10}$/.test(form.phone.replace(/\D/g,"")))
      { setError("Valid 10-digit phone number daalo."); return; }
    if (form.password !== form.confirmPwd) { setError("Passwords match nahi kiye."); return; }
    if (form.password.length < 6)          { setError("Password kam se kam 6 characters ka hona chahiye."); return; }
    const users = getUsers();
    if (users.find(u => u.username===form.username.trim().toLowerCase()))
      { setError("Yeh username pehle se liya hua hai."); return; }
    const nu: User = {
      username:form.username.trim().toLowerCase(), password:hashPwd(form.password),
      name:form.name.trim(), grade:form.grade, language:"hinglish",
      role:"student", createdAt:Date.now(), lastLogin:Date.now(),
      email:form.email.trim().toLowerCase(), phone:form.phone.trim().replace(/\D/g,""),
    };
    saveUsers([...users, nu]);
    saveProfile(nu.username, { name:nu.name, grade:nu.grade, language:"hinglish",
      topicsExplored:[], strengths:[], weaknesses:[],
      currentTopic:null, totalSessions:0, lastActive:Date.now(), topicSummaries:{} });
    onLogin(nu);
  };

  return (
    <div style={{ minHeight:"100dvh", background:C.dark, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'Outfit',sans-serif", padding:20 }}>
      {/* Logo — always visible */}
      <div style={{ textAlign:"center", marginBottom:28 }}>
        <div style={{ display:"inline-flex", background:"#fff", borderRadius:14, padding:"10px 20px", boxShadow:`0 4px 24px ${C.blue}30`, marginBottom:14 }}>
          <AELogo height={58} darkBg/>
        </div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12 }}>
          <div style={{ height:2, width:50, background:`linear-gradient(90deg,transparent,${C.blue})` }}/>
          <span style={{ fontSize:13, color:C.muted, letterSpacing:"0.1em", fontWeight:600 }}>POWERED BY ARIO AI</span>
          <div style={{ height:2, width:50, background:`linear-gradient(90deg,${C.red},transparent)` }}/>
        </div>
      </div>

      <div style={{ width:"100%", maxWidth:430, background:C.panel, border:`1px solid ${C.border}`, borderRadius:20, overflow:"hidden", boxShadow:"0 24px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ display:"flex", borderBottom:`1px solid ${C.border}` }}>
          {(["login","signup"] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setError(""); }}
              style={{ flex:1, padding:"15px 0", background:tab===t?`linear-gradient(135deg,${C.blue}10,${C.red}10)`:"transparent", border:"none", color:tab===t?"#e2e8f0":C.muted, fontFamily:"'Outfit',sans-serif", fontSize:14, fontWeight:700, cursor:"pointer", borderBottom:tab===t?`3px solid ${C.blue}`:"3px solid transparent", transition:"all 0.2s" }}>
              {t==="login" ? "🔑 Login" : "📝 Sign Up"}
            </button>
          ))}
        </div>
        <div style={{ padding:"24px 24px 20px", maxHeight:"72dvh", overflowY:"auto" }}>
          {tab==="signup" && <>
            <AuthInput label="Full Name"      value={form.name}     onChange={v=>f("name",v)}     placeholder="e.g. Arjun Sharma"/>
            <AuthInput label="Email ID"       type="email" value={form.email}    onChange={v=>f("email",v)}    placeholder="arjun@email.com"/>
            <AuthInput label="Phone Number"   type="tel"   value={form.phone}    onChange={v=>f("phone",v)}    placeholder="10-digit mobile number"/>
          </>}
          <AuthInput label="Username" value={form.username} onChange={v=>f("username",v)} placeholder={tab==="login"?"Username daalo":"Create a username"}/>
          <AuthInput label="Password" type="password" value={form.password} onChange={v=>f("password",v)} placeholder="Password"/>
          {tab==="signup" && <>
            <AuthInput label="Confirm Password" type="password" value={form.confirmPwd} onChange={v=>f("confirmPwd",v)} placeholder="Password dobara daalo"/>
            <div style={{ marginBottom:20 }}>
              <label style={{ display:"block", fontSize:13, color:C.muted, marginBottom:6, fontWeight:600 }}>Tumhara Grade</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {Object.entries(GRADES).map(([g,cfg]) => (
                  <button key={g} onClick={() => f("grade",g)}
                    style={{ padding:"5px 14px", borderRadius:8, border:`1.5px solid ${form.grade===g?C.blue:C.border}`, background:form.grade===g?`${C.blue}20`:C.card, color:form.grade===g?C.blueLight:C.muted, fontSize:13, fontWeight:700, cursor:"pointer", transition:"all 0.15s" }}>
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>
          </>}
          {error && <div style={{ color:"#fca5a5", fontSize:13, marginBottom:14, padding:"8px 12px", background:`${C.red}10`, border:`1px solid ${C.red}40`, borderRadius:8 }}>⚠️ {error}</div>}
          <button onClick={tab==="login"?handleLogin:handleSignup} disabled={loading}
            style={{ width:"100%", padding:"14px 0", borderRadius:12, border:"none", background:`linear-gradient(135deg,${C.blue},${C.red})`, color:"#fff", fontSize:16, fontWeight:700, cursor:loading?"not-allowed":"pointer", fontFamily:"'Outfit',sans-serif", opacity:loading?0.7:1, letterSpacing:"0.04em" }}>
            {loading ? "…" : tab==="login" ? "Login Karo →" : "Account Banao →"}
          </button>
          {tab==="login" && <p style={{ textAlign:"center", color:C.muted, fontSize:12, marginTop:14 }}>Naya student?{" "}<button onClick={() => setTab("signup")} style={{ background:"none", border:"none", color:C.blueLight, fontSize:12, cursor:"pointer", fontWeight:600 }}>Sign Up karo</button></p>}
        </div>
      </div>
      <p style={{ color:"#1e293b", fontSize:11, marginTop:20, textAlign:"center" }}>© Arihant Educare · All student data stored locally on this device</p>
    </div>
  );
}

function AuthInput({ label,value,onChange,placeholder,type="text" }:
  { label:string; value:string; onChange:(v:string)=>void; placeholder:string; type?:string }) {
  return (
    <div style={{ marginBottom:16 }}>
      <label style={{ display:"block", fontSize:13, color:C.muted, marginBottom:6, fontWeight:600 }}>{label}</label>
      <input suppressHydrationWarning type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{ width:"100%", background:C.card, border:`1.5px solid ${C.border}`, borderRadius:10, padding:"11px 14px", color:"#e2e8f0", fontSize:14, outline:"none", fontFamily:"'Outfit',sans-serif", boxSizing:"border-box" }}
        onFocus={e=>e.target.style.borderColor=C.blue} onBlur={e=>e.target.style.borderColor=C.border}/>
    </div>
  );
}

// ─── Language Picker Modal ────────────────────────────────────
function LangPickerModal({ onSelect }: { onSelect:(l:Language)=>void }) {
  const langs = [
    {id:"english"  as Language, label:"English",  flag:"🇬🇧", desc:"Full English explanations"},
    {id:"hindi"    as Language, label:"हिंदी",    flag:"🇮🇳", desc:"पूरी हिंदी में सीखो"},
    {id:"marathi"  as Language, label:"मराठी",   flag:"🌸", desc:"संपूर्ण मराठी मध्ये शिका"},
    {id:"hinglish" as Language, label:"Hinglish", flag:"🇮🇳", desc:"Hindi + English mix — desi style!"},
  ];
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(6,10,20,0.92)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, padding:20 }}>
      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:20, padding:32, maxWidth:460, width:"100%", boxShadow:"0 24px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🌐</div>
          <h2 style={{ color:"#e2e8f0", fontSize:22, fontWeight:700, margin:0, fontFamily:"'Outfit',sans-serif" }}>Apni Bhasha Chunein</h2>
          <p style={{ color:C.muted, fontSize:14, marginTop:6 }}>Choose your language / अपनी भाषा चुनें</p>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {langs.map(l => (
            <button key={l.id} onClick={() => onSelect(l.id)}
              style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 18px", borderRadius:12, border:`1.5px solid ${C.border}`, background:C.card, cursor:"pointer", textAlign:"left", fontFamily:"'Outfit',sans-serif" }}
              onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor=C.blue;(e.currentTarget as HTMLButtonElement).style.background=`${C.blue}10`;}}
              onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor=C.border;(e.currentTarget as HTMLButtonElement).style.background=C.card;}}>
              <span style={{fontSize:26}}>{l.flag}</span>
              <div><div style={{color:"#e2e8f0",fontWeight:700,fontSize:16}}>{l.label}</div><div style={{color:C.muted,fontSize:13}}>{l.desc}</div></div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Practice Modal ───────────────────────────────────────────
function PracticeModal({ questions, onClose, onSubmitAnswer, onGenerate, topic, lang, isLoading }:
  { questions:PracticeQ[]; onClose:()=>void; onSubmitAnswer:(qId:number,answer:string,imageB64?:string)=>void;
    onGenerate:()=>void; topic:string|null; lang:Language; isLoading:boolean }) {
  const [answers, setAnswers] = useState<Record<number,string>>({});
  const [images,  setImages]  = useState<Record<number,string>>({});
  const fileRefs = useRef<Record<number,HTMLInputElement|null>>({});
  const handleImg = (qId:number, file:File) => {
    const r = new FileReader();
    r.onload = () => { const b64=(r.result as string).split(",")[1]; setImages(p=>({...p,[qId]:b64})); };
    r.readAsDataURL(file);
  };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(6,10,20,0.92)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:150, padding:16 }}>
      <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:20, width:"100%", maxWidth:600, maxHeight:"85dvh", display:"flex", flexDirection:"column", boxShadow:"0 24px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ padding:"20px 24px", borderBottom:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <h3 style={{color:"#e2e8f0",fontFamily:"'Space Mono',monospace",fontSize:16,fontWeight:700,margin:0}}>📝 PRACTICE MODE</h3>
            {topic && <p style={{color:C.muted,fontSize:12,marginTop:3}}>Topic: {topic}</p>}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={onGenerate} disabled={isLoading}
              style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${C.blue}`,background:`${C.blue}20`,color:C.blueLight,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>
              {isLoading ? "…" : "🔄 New Questions"}
            </button>
            <button onClick={onClose} style={{width:32,height:32,borderRadius:"50%",border:`1px solid ${C.border}`,background:C.card,color:C.muted,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"20px 24px",display:"flex",flexDirection:"column",gap:20}}>
          {questions.length===0 && (
            <div style={{textAlign:"center",color:C.muted,paddingTop:40}}>
              <div style={{fontSize:32,marginBottom:12}}>📚</div>
              <p style={{fontSize:15}}>{isLoading ? "Ario questions bana raha hai…" : "Practice questions generate karne ke liye upar button dabao."}</p>
            </div>
          )}
          {questions.map((q,i) => (
            <div key={q.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px 18px"}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:12}}>
                <div style={{width:26,height:26,borderRadius:"50%",background:`linear-gradient(135deg,${C.blue},${C.red})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff",flexShrink:0}}>Q{i+1}</div>
                <p style={{color:"#e2e8f0",fontSize:14,lineHeight:1.6,margin:0}}>{q.question}</p>
              </div>
              {q.feedback ? (
                <div style={{background:"#0d2f1f",border:"1px solid #34d399",borderRadius:10,padding:"12px 14px",fontSize:13,color:"#a7f3d0",lineHeight:1.6}}>✅ <strong>Ario ka Feedback:</strong><br/>{q.feedback}</div>
              ) : (
                <div>
                  <textarea suppressHydrationWarning value={answers[q.id]||""} onChange={e=>setAnswers(p=>({...p,[q.id]:e.target.value}))} placeholder="Apna jawab yahan likho ya image upload karo…" rows={3}
                    style={{width:"100%",background:"#0a1020",border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",color:"#e2e8f0",fontSize:13,fontFamily:"'Outfit',sans-serif",resize:"vertical",outline:"none",boxSizing:"border-box"}}
                    onFocus={e=>e.target.style.borderColor=C.blue} onBlur={e=>e.target.style.borderColor=C.border}/>
                  <div style={{display:"flex",gap:8,marginTop:8}}>
                    <input type="file" accept="image/*" ref={el=>{if(el) fileRefs.current[q.id]=el;}} style={{display:"none"}} onChange={e=>e.target.files?.[0] && handleImg(q.id,e.target.files[0])}/>
                    <button onClick={()=>fileRefs.current[q.id]?.click()}
                      style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card,color:images[q.id]?"#34d399":C.muted,fontSize:12,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>
                      {images[q.id] ? "📷 Image ready" : "📷 Upload Answer"}
                    </button>
                    <button onClick={()=>onSubmitAnswer(q.id,answers[q.id]||"",images[q.id])} disabled={!answers[q.id]&&!images[q.id]}
                      style={{padding:"6px 16px",borderRadius:8,border:"none",background:`linear-gradient(135deg,${C.blue},${C.red})`,color:"#fff",fontSize:12,fontWeight:700,cursor:(answers[q.id]||images[q.id])?"pointer":"not-allowed",opacity:(answers[q.id]||images[q.id])?1:0.4,fontFamily:"'Outfit',sans-serif"}}>
                      Submit →
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Parent Summary Modal ─────────────────────────────────────
function ParentSummaryModal({ user, profile, onClose, onGenerate, summary, isLoading }:
  { user:User; profile:StudentProfile; onClose:()=>void; onGenerate:()=>void; summary:string; isLoading:boolean }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(6,10,20,0.92)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:160, padding:16 }}>
      <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:640, maxHeight:"88dvh", display:"flex", flexDirection:"column", boxShadow:"0 24px 80px rgba(0,0,0,0.5)", overflow:"hidden" }}>
        <div style={{ padding:"20px 28px", borderBottom:"2px solid #e5e7eb", display:"flex", alignItems:"center", justifyContent:"space-between", background:`linear-gradient(135deg,${C.blue},${C.blueDark})` }}>
          <div>
            <h3 style={{color:"#fff",fontFamily:"'Space Mono',monospace",fontSize:16,fontWeight:700,margin:0}}>📊 PARENT REPORT</h3>
            <p style={{color:"#a5b4fc",fontSize:12,marginTop:3}}>{user.name} · {GRADES[user.grade]?.label}</p>
          </div>
          <div style={{display:"flex",gap:8}}>
            {!summary && (
              <button onClick={onGenerate} disabled={isLoading}
                style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#fff",color:C.blue,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>
                {isLoading ? "Generating…" : "Generate Report"}
              </button>
            )}
            {summary && (
              <button onClick={() => window.print()}
                style={{padding:"8px 18px",borderRadius:8,border:"none",background:"#fff",color:C.blue,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>
                🖨️ Print
              </button>
            )}
            <button onClick={onClose} style={{width:32,height:32,borderRadius:"50%",border:"none",background:"#ffffff30",color:"#fff",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"24px 28px"}}>
          {!summary && !isLoading && (
            <div style={{textAlign:"center",paddingTop:60,color:"#6b7280"}}>
              <div style={{fontSize:40,marginBottom:16}}>📋</div>
              <p style={{fontSize:16,fontWeight:600,marginBottom:8}}>Parent Progress Report</p>
              <p style={{fontSize:14}}>Click "Generate Report" to create a detailed analysis of {user.name}&apos;s learning journey.</p>
            </div>
          )}
          {isLoading && (
            <div style={{textAlign:"center",paddingTop:60,color:"#6b7280"}}>
              <div style={{fontSize:40,marginBottom:16}}>⚙️</div>
              <p style={{fontSize:16}}>Ario is preparing the report…</p>
            </div>
          )}
          {summary && (
            <div style={{fontFamily:"'Outfit',sans-serif",color:"#1e293b",lineHeight:1.8}}>
              <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:24,padding:"16px 20px",background:`linear-gradient(135deg,${C.bluePale},#dde0ff)`,borderRadius:14,border:`1px solid ${C.blueLight}99`}}>
                <div style={{width:50,height:50,borderRadius:"50%",background:`linear-gradient(135deg,${C.blue},${C.red})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,color:"#fff",fontWeight:900}}>
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{fontWeight:700,fontSize:18,color:C.blueDark}}>{user.name}</div>
                  <div style={{fontSize:13,color:"#64748b"}}>{GRADES[user.grade]?.label} · Sessions: {profile.totalSessions}</div>
                </div>
              </div>
              <div style={{whiteSpace:"pre-wrap",fontSize:14,lineHeight:1.9}}>{summary}</div>
              <div style={{marginTop:24,padding:"12px 16px",background:"#f0fdf4",borderRadius:10,border:"1px solid #a7f3d0",fontSize:13,color:"#166534"}}>
                Generated by Ario AI · Arihant Educare · {new Date().toLocaleDateString("en-IN")}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Admin Topic Summary Card ─────────────────────────────────
function TopicSummaryCard({ topic, summary, grade }: { topic:string; summary:string; grade:string }) {
  return (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"14px 16px", borderLeft:`3px solid ${C.blue}` }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
        <span style={{ background:`${C.blue}20`, border:`1px solid ${C.blue}40`, borderRadius:20, padding:"2px 10px", fontSize:11, color:C.blueLight, fontWeight:700 }}>📖 {topic}</span>
        <span style={{ background:`${C.red}15`, border:`1px solid ${C.red}30`, borderRadius:20, padding:"2px 8px", fontSize:10, color:C.redLight }}>{GRADES[grade]?.label}</span>
      </div>
      <p style={{ color:C.text, fontSize:13, lineHeight:1.7, margin:0, whiteSpace:"pre-wrap" }}>{summary}</p>
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────
function AdminPanel({ onLogout }: { onLogout:()=>void }) {
  const [students, setStudents]   = useState<User[]>([]);
  const [selected, setSelected]   = useState<string|null>(null);
  const [selProfile, setSelProfile] = useState<StudentProfile|null>(null);
  const [selSessions, setSelSessions] = useState<ChatSession[]>([]);
  const [genSummaries, setGenSummaries] = useState(false);
  const [topicSummaries, setTopicSummaries] = useState<Record<string,string>>({});
  const [search, setSearch]       = useState("");
  const [activeTab, setActiveTab] = useState<"info"|"summaries"|"sessions">("info");

  useEffect(() => { setStudents(getUsers().filter(u=>u.role!=="admin")); }, []);

  const selectStudent = (uname:string) => {
    setSelected(uname);
    const p = getProfile(uname);
    setSelProfile(p);
    setSelSessions(getSessions(uname));
    setTopicSummaries(p?.topicSummaries||{});
    setActiveTab("info");
  };

  const generateTopicSummaries = async () => {
    if (!selProfile||!selected) return;
    setGenSummaries(true);
    const allMsgs = selSessions.flatMap(s=>s.messages);
    const prompt = `You are generating per-topic summaries for an admin/teacher review.

Student: ${selProfile.name}
Grade: ${GRADES[selProfile.grade]?.label ?? selProfile.grade}
Topics Explored: ${selProfile.topicsExplored.join(", ")||"none"}

Chat history (last 60 messages):
${allMsgs.slice(-60).map(m=>`[${m.role==="student"?"Student":"Ario"}] ${m.content.slice(0,150)}`).join("\n")}

For each topic the student explored, write exactly 5 lines:
1. What the student learned
2. How well they understood it
3. Key strength observed
4. Area needing improvement
5. Teacher recommendation

Respond ONLY in JSON: {"summaries":{"topic_name":"5 line summary here.",...}}`;
    try {
      const res = await (puter as any).ai.chat([{role:"user",content:prompt}],{model:"deepseek/deepseek-v3.2"});
      const raw = res.message?.content ?? String(res);
      const parsed = extractJSON(raw);
      if (parsed?.summaries) {
        const ns = parsed.summaries as Record<string,string>;
        setTopicSummaries(ns);
        const up = {...selProfile, topicSummaries:ns};
        saveProfile(selected, up); setSelProfile(up);
      }
    } catch { console.error("Summary generation failed"); }
    setGenSummaries(false);
  };

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{display:"flex",height:"100dvh",background:C.dark,fontFamily:"'Outfit',sans-serif",overflow:"hidden"}}>
      {/* Sidebar */}
      <div style={{width:280,borderRight:`1px solid ${C.border}`,background:C.darkMid,display:"flex",flexDirection:"column"}}>
        <div style={{padding:"12px 14px",borderBottom:`1px solid ${C.border}`,background:`linear-gradient(135deg,${C.blueDark}30,${C.red}15)`}}>
          {/* Logo always visible */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <div style={{background:"#fff",borderRadius:9,padding:"5px 10px"}}><AELogo height={30} darkBg/></div>
            <button onClick={onLogout} style={{padding:"4px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:C.card,color:C.muted,fontSize:11,cursor:"pointer"}}>Logout</button>
          </div>
          <p style={{color:C.blueLight,fontSize:10,fontWeight:700,fontFamily:"'Space Mono',monospace",letterSpacing:"0.08em",margin:"0 0 3px"}}>ADMIN PANEL</p>
          <p style={{color:"#e2e8f0",fontSize:15,fontWeight:700,margin:"0 0 10px"}}>All Students</p>
          <input suppressHydrationWarning value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search students…"
            style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 11px",color:"#e2e8f0",fontSize:12,outline:"none",fontFamily:"'Outfit',sans-serif",boxSizing:"border-box"}}/>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:10}}>
          {filtered.length===0 && <p style={{color:C.muted,fontSize:13,textAlign:"center",marginTop:40}}>No students registered yet.</p>}
          {filtered.map(u => {
            const profile = getProfile(u.username);
            const hasSummaries = profile?.topicSummaries && Object.keys(profile.topicSummaries).length > 0;
            return (
              <button key={u.username} onClick={() => selectStudent(u.username)}
                style={{width:"100%",padding:"11px 12px",borderRadius:12,border:`1px solid ${selected===u.username?C.blue:C.border}`,background:selected===u.username?`${C.blue}15`:C.card,cursor:"pointer",textAlign:"left",marginBottom:7}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:32,height:32,borderRadius:"50%",background:`linear-gradient(135deg,${C.blue},${C.red})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:"#fff",flexShrink:0}}>{u.name.charAt(0).toUpperCase()}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{color:"#e2e8f0",fontWeight:700,fontSize:13,margin:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{u.name}</p>
                    <p style={{color:C.muted,fontSize:10,margin:"2px 0 0"}}>@{u.username} · {GRADES[u.grade]?.label}</p>
                  </div>
                  {hasSummaries && <span style={{fontSize:9,color:C.green}}>●</span>}
                </div>
                {profile?.topicsExplored?.length > 0 && (
                  <div style={{marginTop:5,display:"flex",flexWrap:"wrap",gap:3}}>
                    {profile.topicsExplored.slice(-3).map(t=><span key={t} style={{background:`${C.blue}15`,borderRadius:4,padding:"1px 5px",fontSize:9,color:C.blueLight}}>{t}</span>)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div style={{padding:"10px 14px",borderTop:`1px solid ${C.border}`,textAlign:"center"}}>
          <p style={{color:C.muted,fontSize:11}}>{students.length} students registered</p>
        </div>
      </div>

      {/* Main content */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Top bar — logo always visible */}
        <div style={{padding:"10px 20px",borderBottom:`1px solid ${C.border}`,background:`linear-gradient(90deg,${C.blueDark}20,${C.red}10)`,display:"flex",alignItems:"center",gap:12}}>
          <div style={{background:"#fff",borderRadius:9,padding:"5px 12px"}}><AELogo height={32} darkBg/></div>
          <div style={{width:1,height:30,background:C.border}}/>
          <span style={{color:C.blueLight,fontSize:12,fontWeight:700,fontFamily:"'Space Mono',monospace"}}>ADMIN DASHBOARD</span>
        </div>

        {!selected ? (
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{textAlign:"center",color:C.muted}}>
              <div style={{fontSize:48,marginBottom:16}}>👈</div>
              <p style={{fontSize:18,fontWeight:600,color:"#e2e8f0"}}>Select a student</p>
              <p style={{fontSize:14}}>View info, sessions, and topic summaries</p>
            </div>
          </div>
        ) : (
          <>
            <div style={{padding:"12px 20px",borderBottom:`1px solid ${C.border}`,background:C.darkMid,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <p style={{color:"#e2e8f0",fontWeight:700,fontSize:17,margin:0}}>{students.find(s=>s.username===selected)?.name}</p>
                <div style={{display:"flex",gap:7,marginTop:3,flexWrap:"wrap"}}>
                  <span style={{background:`${C.blue}20`,borderRadius:12,padding:"1px 8px",fontSize:10,color:C.blueLight}}>{selProfile?.totalSessions||0} sessions</span>
                  {selProfile?.currentTopic && <span style={{background:`${C.green}15`,borderRadius:12,padding:"1px 8px",fontSize:10,color:C.green}}>📖 {selProfile.currentTopic}</span>}
                  {selProfile?.strengths?.slice(-1)[0] && <span style={{background:"#05966920",borderRadius:12,padding:"1px 8px",fontSize:10,color:"#34d399"}}>✅ {selProfile.strengths.slice(-1)[0]}</span>}
                </div>
              </div>
              {activeTab==="summaries" && (
                <button onClick={generateTopicSummaries} disabled={genSummaries}
                  style={{padding:"8px 18px",borderRadius:10,border:"none",background:`linear-gradient(135deg,${C.blue},${C.red})`,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Outfit',sans-serif",opacity:genSummaries?0.7:1}}>
                  {genSummaries ? "⚙️ Generating…" : "🔄 Generate Topic Summaries"}
                </button>
              )}
            </div>

            {/* Sub-tabs */}
            <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:C.darkMid,padding:"0 4px"}}>
              {([["info","👤 Student Info"],["sessions","💬 Chat Sessions"],["summaries","📊 Topic Summaries"]] as const).map(([t,label])=>(
                <button key={t} onClick={()=>setActiveTab(t as any)}
                  style={{padding:"10px 18px",border:"none",borderBottom:activeTab===t?`2px solid ${C.blue}`:"2px solid transparent",background:"transparent",color:activeTab===t?"#e2e8f0":C.muted,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>
                  {label}
                </button>
              ))}
            </div>

            <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>

              {/* ── Student Info Tab ── */}
              {activeTab==="info" && (() => {
                const u = students.find(s=>s.username===selected)!;
                return (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,maxWidth:720}}>
                    {([
                      ["👤 Full Name",   u?.name||"—"],
                      ["🆔 Username",    u?.username||"—"],
                      ["📧 Email ID",    u?.email||"Not provided"],
                      ["📱 Phone",       u?.phone||"Not provided"],
                      ["🎓 Grade",       GRADES[u?.grade]?.label||u?.grade],
                      ["🌐 Language",    u?.language],
                      ["📅 Registered",  new Date(u?.createdAt||0).toLocaleDateString("en-IN")],
                      ["🕐 Last Login",  u?.lastLogin?new Date(u.lastLogin).toLocaleString("en-IN"):"Never"],
                      ["📚 Sessions",    String(selProfile?.totalSessions||0)],
                      ["📖 Current Topic", selProfile?.currentTopic||"—"],
                      ["✅ Strengths",   selProfile?.strengths?.join(", ")||"None recorded"],
                      ["⚠️ Weaknesses",  selProfile?.weaknesses?.join(", ")||"None recorded"],
                      ["🗂 Topics Explored", selProfile?.topicsExplored?.join(", ")||"None yet"],
                    ] as [string,string][]).map(([k,v])=>(
                      <div key={k} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 16px"}}>
                        <p style={{color:C.muted,fontSize:11,fontWeight:600,margin:"0 0 4px"}}>{k}</p>
                        <p style={{color:"#e2e8f0",fontSize:13,margin:0,wordBreak:"break-all"}}>{v}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* ── Sessions Tab ── */}
              {activeTab==="sessions" && (
                <div style={{display:"flex",flexDirection:"column",gap:12,maxWidth:720}}>
                  {selSessions.length===0 && <p style={{color:C.muted,textAlign:"center",marginTop:40}}>No chat sessions yet for this student.</p>}
                  {[...selSessions].reverse().map(s=>(
                    <div key={s.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 18px"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                        <p style={{color:"#e2e8f0",fontWeight:700,fontSize:14,margin:0}}>{s.title||"Untitled"}</p>
                        <span style={{fontSize:11,color:C.muted}}>{new Date(s.createdAt).toLocaleString("en-IN")}</span>
                      </div>
                      {s.summary && <p style={{color:C.muted,fontSize:12,fontStyle:"italic",margin:"0 0 10px",background:`${C.blue}10`,borderRadius:7,padding:"5px 10px"}}>"{s.summary}"</p>}
                      <details>
                        <summary style={{color:C.blueLight,fontSize:12,cursor:"pointer",fontWeight:600,marginBottom:6}}>{s.messages.length} messages — click to expand</summary>
                        <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:280,overflowY:"auto",marginTop:8}}>
                          {s.messages.map((m,i)=>(
                            <div key={i} style={{display:"flex",justifyContent:m.role==="student"?"flex-end":"flex-start"}}>
                              <div style={{maxWidth:"72%",padding:"7px 11px",borderRadius:10,background:m.role==="student"?C.blue:C.darkMid,border:`1px solid ${m.role==="student"?C.blueLight:C.border}`,fontSize:11,color:m.role==="student"?"#eff6ff":C.text,lineHeight:1.5}}>
                                {m.hasImage && <span style={{fontSize:10,color:"#a78bfa",marginRight:4}}>📷</span>}
                                {m.content}
                                <div style={{fontSize:9,color:m.role==="student"?"#a5b4fc":C.muted,marginTop:2}}>{new Date(m.timestamp).toLocaleTimeString("en-IN")}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Topic Summaries Tab ── */}
              {activeTab==="summaries" && (
                <div style={{display:"flex",flexDirection:"column",gap:14,maxWidth:720}}>
                  {Object.keys(topicSummaries).length===0 && !genSummaries && (
                    <div style={{textAlign:"center",paddingTop:60,color:C.muted}}>
                      <div style={{fontSize:40,marginBottom:12}}>📊</div>
                      <p style={{fontSize:16,fontWeight:600,color:"#e2e8f0",marginBottom:8}}>No Topic Summaries Yet</p>
                      <p style={{fontSize:14}}>
                        {selProfile?.topicsExplored?.length
                          ? `${selProfile.topicsExplored.length} topic(s) explored. Click "Generate Topic Summaries".`
                          : "Student hasn't explored any topics yet."}
                      </p>
                      {selProfile?.topicsExplored?.length > 0 && (
                        <div style={{marginTop:16,display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center"}}>
                          {selProfile.topicsExplored.map(t=><span key={t} style={{background:`${C.blue}20`,borderRadius:20,padding:"4px 12px",fontSize:12,color:C.blueLight}}>{t}</span>)}
                        </div>
                      )}
                    </div>
                  )}
                  {genSummaries && <div style={{textAlign:"center",paddingTop:60,color:C.muted}}><div style={{fontSize:36,marginBottom:12}}>⚙️</div><p>Analyzing {selProfile?.topicsExplored?.length||0} topics…</p></div>}
                  {Object.entries(topicSummaries).map(([topic,summary])=>(
                    <TopicSummaryCard key={topic} topic={topic} summary={summary} grade={students.find(s=>s.username===selected)?.grade||"10"}/>
                  ))}
                </div>
              )}

            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════════
export default function Home() {
  const [view, setView]               = useState<AppView>("auth");
  const [currentUser, setCurrentUser] = useState<User|null>(null);
  const [profile, setProfile]         = useState<StudentProfile|null>(null);

  // Sessions
  const [sessions, setSessions]           = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string|null>(null);
  const [showSessionSidebar, setShowSessionSidebar] = useState(false);

  // Active chat state
  const [messages, setMessages]     = useState<ChatMessage[]>([]);
  const [board, setBoard]           = useState<BoardItem[]>([]);
  const [boardCounter, setBoardCounter] = useState(0);
  const [stepCounter, setStepCounter]   = useState(0);

  const [input, setInput]               = useState("");
  const [pendingImage, setPendingImage] = useState<string|null>(null);
  const [pendingImageType, setPendingImageType] = useState("image/jpeg");

  // Speech states
  const [isSpeaking, setIsSpeaking]     = useState(false);
  const [isThinking, setIsThinking]     = useState(false);
  const [isListening, setIsListening]   = useState(false);
  const [wakeListening, setWakeListening] = useState(false);
  const [wakeEnabled, setWakeEnabled]   = useState(false);

  // Modals
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showPractice, setShowPractice]     = useState(false);
  const [showSummary, setShowSummary]       = useState(false);

  // Practice
  const [practiceQs, setPracticeQs]         = useState<PracticeQ[]>([]);
  const [practiceLoading, setPracticeLoading] = useState(false);

  // Parent report
  const [summaryText, setSummaryText]     = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);

  const recognitionRef  = useRef<any>(null);
  const wakeRecogRef    = useRef<any>(null);
  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const currentAudioRef = useRef<HTMLAudioElement|null>(null);
  const fileInputRef    = useRef<HTMLInputElement|null>(null);
  const profileRef      = useRef<StudentProfile|null>(null);
  const wakeEnabledRef  = useRef(false);
  const isListeningRef  = useRef(false);

  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { wakeEnabledRef.current = wakeEnabled; }, [wakeEnabled]);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);
  useEffect(() => { seedAdmin(); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);

  // ── Persist sessions whenever messages/board change ────────
  useEffect(() => {
    if (!currentUser||!activeSessionId) return;
    setSessions(prev => {
      const updated = prev.map(s => s.id===activeSessionId ? {...s, messages, board} : s);
      saveSessions(currentUser.username, updated);
      return updated;
    });
  }, [messages, board]);

  // ── Init speech recognition ────────────────────────────────
  useEffect(() => {
    if (typeof window==="undefined") return;
    const SR = (window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = false; r.interimResults = true;
    r.lang = profile?.language==="marathi"?"mr-IN":profile?.language==="hindi"?"hi-IN":"en-IN";
    r.onresult = (e:any) => setInput(Array.from(e.results).map((x:any)=>x[0].transcript).join(""));
    r.onend    = () => setIsListening(false);
    r.onerror  = () => setIsListening(false);
    recognitionRef.current = r;
  }, [profile?.language]);

  // ── TTS helper ─────────────────────────────────────────────
  const speakAsync = async (text: string): Promise<void> => {
    return new Promise(resolve => {
      try {
        if (currentAudioRef.current) { currentAudioRef.current.pause(); currentAudioRef.current=null; }
        setIsSpeaking(true);
        (puter as any).ai.txt2speech(text, {engine:"neural",language:"en-IN"})
          .then((audio:any) => {
            currentAudioRef.current = audio;
            audio.onended = () => { setIsSpeaking(false); currentAudioRef.current=null; resolve(); };
            audio.play();
          }).catch(() => { setIsSpeaking(false); resolve(); });
      } catch { setIsSpeaking(false); resolve(); }
    });
  };

  const speak = (text: string) => { speakAsync(text); };

  // ── WAKE WORD — robust restart loop ──────────────────────
  //  Detects "Hey Ario", then SPEAKS "Yes? How can I help you?"
  //  then activates command mic. Restarts after each cycle.
  const startWakeLoop = useCallback(() => {
    if (typeof window==="undefined") return;
    const SR = (window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    if (!SR) return;

    try { wakeRecogRef.current?.abort(); } catch {}

    const r = new SR();
    r.continuous    = true;
    r.interimResults = true;
    r.lang          = "en-IN";
    let triggered   = false;

    r.onresult = (e:any) => {
      if (triggered || !wakeEnabledRef.current || isListeningRef.current) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript.toLowerCase().replace(/[^a-z\s]/g,"").trim();
        // Broad pattern to catch phonetic variations
        if (/\b(hey\s+ari[oy]o|hey\s+rio|hey\s+ario|ario|hey\s+ari)\b/.test(t) || /hey.{0,6}ari/i.test(t)) {
          triggered = true;
          setWakeListening(true);
          try { r.stop(); } catch {}

          // Speak "Yes?" confirmation — then open command mic
          speakAsync("Yes? How can I help you?").then(() => {
            setWakeListening(false);
            try {
              if (recognitionRef.current && wakeEnabledRef.current) {
                recognitionRef.current.lang = profileRef.current?.language==="marathi"?"mr-IN"
                  :profileRef.current?.language==="hindi"?"hi-IN":"en-IN";
                recognitionRef.current.start();
                setIsListening(true);
              }
            } catch {}
            // Restart wake loop after command window
            setTimeout(() => {
              triggered = false;
              if (wakeEnabledRef.current) startWakeLoop();
            }, 5000);
          });
          break;
        }
      }
    };

    r.onerror = () => { if (wakeEnabledRef.current) setTimeout(startWakeLoop, 1500); };
    r.onend   = () => { if (!triggered && wakeEnabledRef.current) setTimeout(startWakeLoop, 800); };

    try { r.start(); wakeRecogRef.current = r; }
    catch { setTimeout(startWakeLoop, 2000); }
  }, []);

  const toggleWakeWord = () => {
    const next = !wakeEnabled;
    setWakeEnabled(next);
    wakeEnabledRef.current = next;
    if (next) {
      setTimeout(startWakeLoop, 200);
    } else {
      try { wakeRecogRef.current?.abort(); } catch {}
      setWakeListening(false);
    }
  };

  useEffect(() => () => { try { wakeRecogRef.current?.abort(); } catch {} }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) { recognitionRef.current.stop(); setIsListening(false); }
    else {
      try {
        recognitionRef.current.lang = profile?.language==="marathi"?"mr-IN":profile?.language==="hindi"?"hi-IN":"en-IN";
        recognitionRef.current.start(); setIsListening(true);
      } catch {}
    }
  };

  // ── Session helpers ────────────────────────────────────────
  const genId2 = () => genId();

  const createNewSession = useCallback((user:User, greeting?:string, summaryCtx?:string) => {
    const sid = genId2();
    const initMsgs: ChatMessage[] = greeting ? [{role:"ario",content:greeting,timestamp:Date.now()}] : [];
    const session: ChatSession = { id:sid, title:"New Chat", createdAt:Date.now(), summary:summaryCtx||"", messages:initMsgs, board:[] };
    setSessions(prev => {
      const updated = [...prev, session];
      saveSessions(user.username, updated);
      return updated;
    });
    setActiveSessionId(sid);
    setMessages(initMsgs);
    setBoard([]);
    setBoardCounter(0);
    setStepCounter(0);
    return sid;
  }, []);

  const switchSession = (id: string) => {
    const s = sessions.find(x => x.id===id);
    if (!s) return;
    setActiveSessionId(id);
    setMessages(s.messages);
    setBoard(s.board||[]);
    setBoardCounter(s.board?.length||0);
    setStepCounter(s.board?.length||0);
  };

  const deleteSession = (id: string) => {
    if (!currentUser) return;
    setSessions(prev => {
      const updated = prev.filter(s => s.id!==id);
      saveSessions(currentUser.username, updated);
      if (activeSessionId===id) {
        if (updated.length>0) {
          const last = updated[updated.length-1];
          setActiveSessionId(last.id); setMessages(last.messages);
          setBoard(last.board||[]); setBoardCounter(last.board?.length||0); setStepCounter(last.board?.length||0);
        } else { setActiveSessionId(null); setMessages([]); setBoard([]); }
      }
      return updated;
    });
  };

  const newChatWithSummary = async () => {
    if (!currentUser||!profile) return;
    const activeSession = sessions.find(s=>s.id===activeSessionId);
    let summaryStr = "";
    if (activeSession && activeSession.messages.length > 3) {
      try {
        const sp = `Summarize this tutoring session in 2-3 sentences. Focus on topic, student progress, pending questions.
Messages: ${activeSession.messages.slice(-20).map(m=>`[${m.role}] ${m.content.slice(0,100)}`).join("\n")}
Respond with just the summary text.`;
        const res = await (puter as any).ai.chat([{role:"user",content:sp}],{model:"deepseek/deepseek-v3.2"});
        summaryStr = res?.message?.content ?? String(res);
        if (typeof summaryStr!=="string") summaryStr="";
        summaryStr = summaryStr.slice(0,200);
        // Save summary to current session
        setSessions(prev => {
          const title = profile.currentTopic || activeSession.messages.find(m=>m.role==="student")?.content.slice(0,35) || "Session";
          const updated = prev.map(s=>s.id===activeSessionId?{...s,summary:summaryStr,title}:s);
          saveSessions(currentUser.username,updated);
          return updated;
        });
      } catch {}
    }
    const lang = profile.language;
    const greetings: Record<Language,string> = {
      english:  `Starting a new session! ${summaryStr?"I remember from last time: "+summaryStr.slice(0,100)+"… "  :""}What would you like to explore today, ${profile.name}?`,
      hindi:    `नई बातचीत! ${summaryStr?"पिछली बार: "+summaryStr.slice(0,80)+"… ":""}आज क्या सीखें, ${profile.name}?`,
      marathi:  `नवीन सत्र! ${summaryStr?"मागच्या वेळी: "+summaryStr.slice(0,80)+"… ":""}आज काय शिकायचे आहे, ${profile.name}?`,
      hinglish: `Naya session! ${summaryStr?"Last time: "+summaryStr.slice(0,100)+"… ":""}Aaj kya explore karein, ${profile.name}?`,
    };
    const g = greetings[lang];
    createNewSession(currentUser, g, summaryStr);
    speak(g);
  };

  // ── Login ──────────────────────────────────────────────────
  const handleLogin = (user: User) => {
    setCurrentUser(user);
    if (user.role==="admin") { setView("admin"); return; }

    let p = getProfile(user.username);
    const isNew = !p;
    if (!p) {
      p = { name:user.name, grade:user.grade, language:user.language, topicsExplored:[], strengths:[],
        weaknesses:[], currentTopic:null, totalSessions:0, lastActive:Date.now(), topicSummaries:{} };
      saveProfile(user.username, p);
    }
    const updated = {...p, totalSessions:p.totalSessions+1, lastActive:Date.now()};
    setProfile(updated); profileRef.current = updated;
    saveProfile(user.username, updated);

    const existing = getSessions(user.username);
    setSessions(existing);
    if (existing.length>0) {
      const last = existing[existing.length-1];
      setActiveSessionId(last.id); setMessages(last.messages);
      setBoard(last.board||[]); setBoardCounter(last.board?.length||0); setStepCounter(last.board?.length||0);
    } else {
      // First session — create with welcome
    }
    if (isNew) setShowLangPicker(true);
    setView("app");
  };

  // ── Language select ────────────────────────────────────────
  const handleLangSelect = (lang: Language) => {
    if (!profile||!currentUser) return;
    const up = {...profile, language:lang};
    setProfile(up); profileRef.current = up;
    saveProfile(currentUser.username, up);
    saveUsers(getUsers().map(u => u.username===currentUser.username ? {...u,language:lang} : u));
    setShowLangPicker(false);
    const greetings: Record<Language,string> = {
      english:  `Great choice! I'll teach you in English, ${profile.name}. What would you like to explore today?`,
      hindi:    `बहुत बढ़िया ${profile.name}! अब मैं हिंदी में पढ़ाऊँगा। आज क्या सीखना चाहते हो?`,
      marathi:  `छान ${profile.name}! आता मराठी मध्ये शिकवतो. आज काय शिकायचे आहे?`,
      hinglish: `Arre waah ${profile.name}! Hinglish mein padhaaunga. Aaj kya explore karna hai?`,
    };
    const g = greetings[lang];
    if (!activeSessionId) {
      createNewSession(currentUser, g);
    } else {
      setMessages(prev => [...prev, {role:"ario",content:g,timestamp:Date.now()}]);
    }
    speak(g);
  };

  // ── Image select ───────────────────────────────────────────
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => { setPendingImage((r.result as string).split(",")[1]); setPendingImageType(file.type||"image/jpeg"); };
    r.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Profile memory update ──────────────────────────────────
  const applyMemory = (update:any, oldProfile:StudentProfile): StudentProfile => {
    if (!update) return oldProfile;
    return {
      ...oldProfile,
      currentTopic: update.topic ?? oldProfile.currentTopic,
      topicsExplored: update.topic && !oldProfile.topicsExplored.includes(update.topic)
        ? [...oldProfile.topicsExplored, update.topic] : oldProfile.topicsExplored,
      strengths: update.strength && !oldProfile.strengths.includes(update.strength)
        ? [...oldProfile.strengths.slice(-5), update.strength] : oldProfile.strengths,
      weaknesses: update.weakness && !oldProfile.weaknesses.includes(update.weakness)
        ? [...oldProfile.weaknesses.slice(-5), update.weakness] : oldProfile.weaknesses,
    };
  };

  // ── Send message ───────────────────────────────────────────
  const sendMessage = async (overrideText?: string) => {
    const userText = (overrideText ?? input).trim();
    if (!userText && !pendingImage) return;
    if (!profile||!currentUser) return;
    if (isListening && recognitionRef.current) { recognitionRef.current.stop(); setIsListening(false); }

    const hasImg = !!pendingImage, imgB64 = pendingImage, imgType = pendingImageType;
    if (!overrideText) setInput("");
    setPendingImage(null);

    // Auto-create session if none
    let sid = activeSessionId;
    if (!sid) { sid = createNewSession(currentUser); }

    const userMsg: ChatMessage = { role:"student", content:userText||"Please explain this image.", timestamp:Date.now(), hasImage:hasImg, topic:profile.currentTopic||undefined };
    setMessages(prev => [...prev, userMsg]);
    setIsThinking(true);

    // Auto-title session from first student message
    if (sessions.find(s=>s.id===sid)?.messages.filter(m=>m.role==="student").length===0) {
      setSessions(prev => {
        const updated = prev.map(s => s.id===sid ? {...s,title:(userText||"Image question").slice(0,40)} : s);
        saveSessions(currentUser.username, updated);
        return updated;
      });
    }

    try {
      const prevSummary = sessions.find(s=>s.id===sid)?.summary||"";
      const sysPrompt = buildSysPrompt(profile, hasImg) + (prevSummary?`\n\nPREVIOUS SESSION CONTEXT: "${prevSummary}"`:"");
      const apiMessages: any[] = [
        { role:"system", content:sysPrompt },
        ...messages.slice(-14).map(m=>({ role:m.role==="student"?"user":"assistant", content:m.content })),
      ];
      if (hasImg && imgB64) {
        apiMessages.push({ role:"user", content:[
          {type:"image_url", image_url:{url:`data:${imgType};base64,${imgB64}`}},
          {type:"text", text:userText||"Explain this step by step and draw a diagram."}
        ]});
      } else {
        apiMessages.push({ role:"user", content:userText });
      }
      apiMessages.push({ role:"user", content:"⚠️ Your entire response must be raw JSON only. Include a fresh SVG diagram. Address student by name." });

      const model = hasImg ? "gpt-4o" : "deepseek/deepseek-v3.2";
      const response = await (puter as any).ai.chat(apiMessages, {model});
      const raw: string = response.message?.content ?? String(response);
      let parsed = extractJSON(raw);
      if (!parsed||!parsed.speech) {
        parsed = { speech:raw.length<400?raw:"Ek moment, technical hiccup. Dobara try karo!", board:{type:"text",content:"Concept loading…",annotation:"Note"}, question:"", memory_update:null };
      }
      if (parsed.board?.type==="text" && parsed.speech && parsed.board.content?.trim()===parsed.speech.trim()) {
        parsed.board.content = parsed.question || "Key concept — explore karte hain!";
      }

      setIsThinking(false);
      const updatedProfile = applyMemory(parsed.memory_update, profile);
      setProfile(updatedProfile); profileRef.current = updatedProfile;
      saveProfile(currentUser.username, updatedProfile);

      if (parsed.board?.content && parsed.board.content.trim().length>5) {
        const nId=boardCounter+1, nStep=stepCounter+1;
        setBoardCounter(nId); setStepCounter(nStep);
        setBoard(prev => [...prev, {type:parsed.board.type??"text",content:parsed.board.content,annotation:parsed.board.annotation,id:nId,step:nStep}]);
      }

      const fullReply = [parsed.speech, parsed.question].filter(Boolean).join("\n\n");
      const arioMsg: ChatMessage = { role:"ario", content:fullReply, timestamp:Date.now(), topic:updatedProfile.currentTopic||undefined };
      setMessages(prev => [...prev, arioMsg]);
      speak([parsed.speech, parsed.question].filter(Boolean).join(" "));

    } catch(err) {
      console.error(err); setIsThinking(false);
      setMessages(prev => [...prev,{role:"ario",content:"Yaar, kuch technical gadbad ho gayi. Ek baar phir try karo! 🙏",timestamp:Date.now()}]);
    }
  };

  // ── Practice ───────────────────────────────────────────────
  const generatePractice = async () => {
    if (!profile) return;
    setPracticeLoading(true); setPracticeQs([]);
    const prompt = `You are Ario, creating practice questions for ${profile.name} (${GRADES[profile.grade]?.label}).
Topic focus: ${profile.currentTopic || "general revision"}
Topics explored: ${profile.topicsExplored.join(", ")||"general"}

Generate exactly 4 practice questions. Respond ONLY in JSON array:
[{"id":1,"question":"Question text","topic":"topic name","attempted":false,"feedback":""},...]
Questions should be at ${GRADES[profile.grade]?.level}. Mix easy, medium, and one challenging.`;
    try {
      const res = await (puter as any).ai.chat([{role:"user",content:prompt}],{model:"deepseek/deepseek-v3.2"});
      const raw = res.message?.content ?? String(res);
      let qs = null;
      try { qs=JSON.parse(raw.replace(/```json?\s*/gi,"").replace(/```\s*/g,"").trim()); } catch {
        const m=raw.match(/\[[\s\S]*\]/); if(m){try{qs=JSON.parse(m[0]);}catch{}}
      }
      if (Array.isArray(qs)) setPracticeQs(qs.map((q:any,i:number)=>({...q,id:i+1,attempted:false,feedback:""})));
    } catch {} setPracticeLoading(false);
  };

  const submitAnswer = async (qId:number, answer:string, imageB64?:string) => {
    if (!profile) return;
    const q = practiceQs.find(x=>x.id===qId); if (!q) return;
    const prompt = `You are Ario, checking ${profile.name}'s answer.
Question: ${q.question}
${imageB64?"Student uploaded a handwritten answer image.":`Student's answer: "${answer}"`}
Check the answer and give feedback in ${profile.language}. Warm, encouraging. Max 5 sentences.`;
    const apiContent: any[] = [];
    if (imageB64) { apiContent.push({type:"image_url",image_url:{url:`data:image/jpeg;base64,${imageB64}`}}); }
    apiContent.push({type:"text",text:prompt});
    try {
      const model = imageB64?"gpt-4o":"deepseek/deepseek-v3.2";
      const res = await (puter as any).ai.chat([{role:"user",content:imageB64?apiContent:prompt}],{model});
      const feedback = res.message?.content ?? String(res);
      setPracticeQs(prev=>prev.map(x=>x.id===qId?{...x,attempted:true,feedback:typeof feedback==="string"?feedback:JSON.stringify(feedback)}:x));
    } catch {
      setPracticeQs(prev=>prev.map(x=>x.id===qId?{...x,attempted:true,feedback:"Feedback load nahi ho saka. Dobara try karo."}:x));
    }
  };

  // ── Parent summary ─────────────────────────────────────────
  const generateSummary = async () => {
    if (!profile||!currentUser) return;
    setSummaryLoading(true);
    const prompt = `Create a warm parent-friendly progress report for:
Student: ${profile.name}, ${GRADES[profile.grade]?.label}
Topics: ${profile.topicsExplored.join(", ")||"Just getting started"}
Strengths: ${profile.strengths.join(", ")||"Observing..."}
Areas for improvement: ${profile.weaknesses.join(", ")||"Identifying..."}
Sessions: ${profile.totalSessions}
Current focus: ${profile.currentTopic||"General exploration"}

Write in English. Include: summary, topics covered, strengths, improvement areas, how parents can help, next goals. 4 paragraphs, warm and encouraging.`;
    try {
      const res = await (puter as any).ai.chat([{role:"user",content:prompt}],{model:"deepseek/deepseek-v3.2"});
      const t = res.message?.content ?? String(res);
      setSummaryText(typeof t==="string"?t:JSON.stringify(t));
    } catch { setSummaryText("Report generate karne mein problem aayi."); }
    setSummaryLoading(false);
  };

  // ─── Render ────────────────────────────────────────────────
  if (view==="auth")  return <AuthScreen onLogin={handleLogin}/>;
  if (view==="admin") return <AdminPanel onLogout={() => { setView("auth"); setCurrentUser(null); }}/>;
  if (!profile||!currentUser) return null;

  const lang = profile.language;
  const ui   = LANG_UI[lang];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=Space+Mono:wght@700&family=Kalam:wght@400;700&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:5px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:#1E2246;border-radius:99px;}
        @keyframes statusPulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.35;transform:scale(0.65);}}
        @keyframes micGlow{0%,100%{box-shadow:0 0 0 0 rgba(167,139,250,0.5);}50%{box-shadow:0 0 0 10px rgba(167,139,250,0);}}
        @keyframes wakeGlow{0%,100%{box-shadow:0 0 0 0 rgba(30,34,204,0.7);}50%{box-shadow:0 0 0 16px rgba(30,34,204,0);}}
        @keyframes shimmer{0%{background-position:-400px 0;}100%{background-position:400px 0;}}
        @keyframes popIn{from{opacity:0;transform:translateY(6px) scale(0.96);}to{opacity:1;transform:translateY(0) scale(1);}}
        @media print{body>*{display:none!important;}.print-only{display:block!important;}}
      `}</style>

      {/* ── Modals ─────────────────────────────────────────── */}
      {showLangPicker && <LangPickerModal onSelect={handleLangSelect}/>}
      {showPractice   && <PracticeModal questions={practiceQs} onClose={()=>setShowPractice(false)} onSubmitAnswer={submitAnswer} onGenerate={generatePractice} topic={profile.currentTopic} lang={lang} isLoading={practiceLoading}/>}
      {showSummary    && currentUser && <ParentSummaryModal user={currentUser} profile={profile} onClose={()=>setShowSummary(false)} onGenerate={generateSummary} summary={summaryText} isLoading={summaryLoading}/>}

      {/* ── Session Sidebar slide-over ─────────────────────── */}
      {showSessionSidebar && (
        <div style={{ position:"fixed", inset:0, zIndex:100, display:"flex" }}>
          <div style={{ width:270, background:C.darkMid, borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column", height:"100%" }}>
            <div style={{ padding:"12px 14px", borderBottom:`1px solid ${C.border}`, background:`linear-gradient(135deg,${C.blueDark}30,${C.red}15)`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{background:"#fff",borderRadius:8,padding:"4px 8px"}}><AELogo height={26} darkBg/></div>
              <button onClick={() => setShowSessionSidebar(false)} style={{width:28,height:28,borderRadius:"50%",border:`1px solid ${C.border}`,background:C.card,color:C.muted,fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>
            <SessionSidebar
              sessions={sessions} activeId={activeSessionId}
              onSelect={id => { switchSession(id); setShowSessionSidebar(false); }}
              onNew={() => { newChatWithSummary(); setShowSessionSidebar(false); }}
              onDelete={deleteSession}
            />
          </div>
          <div style={{ flex:1, background:"rgba(0,0,0,0.5)" }} onClick={() => setShowSessionSidebar(false)}/>
        </div>
      )}

      <div style={{ display:"flex", height:"100dvh", background:C.dark, overflow:"hidden", fontFamily:"'Outfit',sans-serif" }}>

        {/* ════════════ LEFT PANEL ════════════ */}
        <div style={{ width:390, minWidth:320, display:"flex", flexDirection:"column", borderRight:`1px solid ${C.border}`, background:C.darkMid }}>

          {/* TOP BAR — Logo always visible */}
          <div style={{ padding:"8px 12px", borderBottom:`1px solid ${C.border}`, background:`linear-gradient(135deg,${C.blueDark}40,${C.red}20)` }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              {/* Logo on white bg so it's always clearly visible */}
              <div style={{ background:"#fff", borderRadius:9, padding:"4px 10px", flexShrink:0 }}>
                <AELogo height={30} darkBg/>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:4 }}>
                  <button onClick={() => setShowSessionSidebar(true)} title="Chat sessions"
                    style={{ padding:"3px 9px", borderRadius:7, border:`1px solid ${C.border}`, background:C.card, color:C.blueLight, fontSize:10, fontWeight:600, cursor:"pointer" }}>
                    💬 Sessions
                  </button>
                  <button onClick={newChatWithSummary} title="Start new chat"
                    style={{ padding:"3px 9px", borderRadius:7, border:`1px solid ${C.border}`, background:C.card, color:C.green, fontSize:10, fontWeight:600, cursor:"pointer" }}>
                    ✚ New Chat
                  </button>
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:3, flexShrink:0 }}>
                <button onClick={() => setShowLangPicker(true)} style={{ padding:"3px 9px", borderRadius:7, border:`1px solid ${C.border}`, background:"#ffffff15", color:"#e2e8f0", fontSize:10, cursor:"pointer", fontWeight:600 }}>🌐 {ui.flag}</button>
                <button onClick={() => { setCurrentUser(null); setView("auth"); }} style={{ padding:"3px 9px", borderRadius:7, border:`1px solid ${C.border}`, background:"#ffffff10", color:C.muted, fontSize:10, cursor:"pointer" }}>Logout</button>
              </div>
            </div>
          </div>

          {/* Avatar */}
          <div style={{ padding:"16px 20px 12px", display:"flex", flexDirection:"column", alignItems:"center", gap:6, borderBottom:`1px solid ${C.border}`, background:`radial-gradient(ellipse at 50% 0%,${C.blueDark}20 0%,${C.darkMid} 70%)` }}>
            <AvatarFace isSpeaking={isSpeaking} isThinking={isThinking} wakeListening={wakeListening}/>
            <div style={{ textAlign:"center" }}>
              <h2 style={{ fontSize:20, fontWeight:700, color:C.green, letterSpacing:"0.04em", fontFamily:"'Space Mono',monospace" }}>ARIO</h2>
              <p style={{ fontSize:10, color:C.muted, letterSpacing:"0.12em", textTransform:"uppercase", marginTop:2 }}>AI Teacher · Arihant Educare</p>
            </div>
            {/* Status + Wake toggle */}
            <div style={{ display:"flex", gap:7, alignItems:"center", flexWrap:"wrap", justifyContent:"center" }}>
              <StatusPill isListening={isListening} isThinking={isThinking} isSpeaking={isSpeaking} wakeListening={wakeListening} lang={lang}/>
              <button onClick={toggleWakeWord} title={wakeEnabled?"Wake word ON — click to disable":"Enable wake word (Hey Ario)"}
                style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 11px", borderRadius:999, border:`1px solid ${wakeEnabled?C.blue:C.border}`, background:wakeEnabled?`${C.blue}25`:C.card, color:wakeEnabled?C.blueLight:C.muted, fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"'Outfit',sans-serif", transition:"all 0.2s", animation:wakeListening?"wakeGlow 0.7s infinite":"none" }}>
                <span style={{fontSize:13}}>🎤</span>{wakeEnabled?"Wake: ON":"Wake: OFF"}
              </button>
            </div>
            {wakeEnabled && <p style={{ fontSize:10, color:C.muted, marginTop:2 }}>🔵 {ui.wakeHint}</p>}
          </div>

          {/* Chat messages */}
          <div style={{ flex:1, overflowY:"auto", padding:"12px 10px", display:"flex", flexDirection:"column", gap:9 }}>
            {messages.length===0 && (
              <div style={{ textAlign:"center", color:C.muted, marginTop:50, fontSize:14, lineHeight:1.8 }}>
                👋 Ario taiyaar hai!<br/><span style={{fontSize:12}}>Kuch bhi poochho ya image upload karo</span>
              </div>
            )}
            {messages.map((msg,i) => {
              const isS = msg.role==="student";
              return (
                <div key={i} style={{ display:"flex", justifyContent:isS?"flex-end":"flex-start", alignItems:"flex-start" }}>
                  {!isS && <div style={{ width:24, height:24, borderRadius:"50%", background:`linear-gradient(135deg,${C.blue},${C.red})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:"#fff", fontWeight:700, flexShrink:0, marginRight:6, marginTop:3, fontFamily:"'Space Mono',monospace" }}>A</div>}
                  <div style={{ maxWidth:"82%", padding:"9px 13px", borderRadius:isS?"14px 14px 3px 14px":"14px 14px 14px 3px", background:isS?C.blue:C.card, border:isS?`1px solid ${C.blueLight}`:`1px solid ${C.border}`, fontSize:13, lineHeight:1.65, color:isS?"#eff6ff":C.text, whiteSpace:"pre-wrap" }}>
                    {msg.hasImage && <div style={{fontSize:10,color:"#a78bfa",marginBottom:4}}>📷 Image attached</div>}
                    {msg.content}
                  </div>
                </div>
              );
            })}
            {isThinking && (
              <div style={{ display:"flex", alignItems:"flex-start", gap:6 }}>
                <div style={{ width:24, height:24, borderRadius:"50%", background:`linear-gradient(135deg,${C.blue},${C.red})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:"#fff", fontWeight:700, flexShrink:0, marginTop:3 }}>A</div>
                <div style={{ padding:"12px 16px", borderRadius:"14px 14px 14px 3px", background:C.card, border:`1px solid ${C.border}`, width:130, height:44, backgroundImage:`linear-gradient(90deg,${C.panel} 0px,${C.card} 40px,${C.panel} 80px)`, backgroundSize:"400px 100%", animation:"shimmer 1.2s infinite linear" }}/>
              </div>
            )}
            <div ref={messagesEndRef}/>
          </div>

          {/* Action buttons — Practice + Parent Report */}
          <div style={{ padding:"8px 10px 0", display:"flex", gap:6 }}>
            <button onClick={() => { setShowPractice(true); if(!practiceQs.length) generatePractice(); }}
              style={{ flex:1, padding:"7px 0", borderRadius:8, border:`1px solid ${C.border}`, background:C.card, color:C.blueLight, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'Outfit',sans-serif", display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
              📝 Practice
            </button>
            <button onClick={() => setShowSummary(true)}
              style={{ flex:1, padding:"7px 0", borderRadius:8, border:`1px solid ${C.border}`, background:C.card, color:"#f59e0b", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'Outfit',sans-serif", display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
              📊 Parent Report
            </button>
          </div>

          {/* Input area */}
          <div style={{ padding:"8px 10px 12px", borderTop:`1px solid ${C.border}` }}>
            {pendingImage && (
              <div style={{ marginBottom:7, display:"flex", alignItems:"center", gap:7, background:`${C.blue}15`, border:`1px solid ${C.blue}40`, borderRadius:8, padding:"5px 9px" }}>
                <img src={`data:${pendingImageType};base64,${pendingImage}`} alt="preview" style={{width:32,height:32,borderRadius:5,objectFit:"cover"}}/>
                <span style={{color:C.blueLight,fontSize:11,flex:1}}>Image ready to send</span>
                <button onClick={() => setPendingImage(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:15}}>×</button>
              </div>
            )}
            <div style={{ display:"flex", gap:6, alignItems:"flex-end" }}>
              <button onClick={toggleListening} title={isListening?"Stop":"Speak"}
                style={{ width:40, height:40, borderRadius:"50%", border:isListening?"2px solid #a78bfa":"1.5px solid #1E2246", background:isListening?"#2e1065":C.card, color:isListening?"#a78bfa":C.muted, cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, animation:isListening?"micGlow 1.2s infinite":"none" }}>🎙️</button>
              <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageSelect} style={{display:"none"}}/>
              <button onClick={() => fileInputRef.current?.click()} title="Upload image of problem"
                style={{ width:40, height:40, borderRadius:"50%", border:`1.5px solid ${C.border}`, background:C.card, color:C.muted, cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}
                onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor=C.blue;}}
                onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor=C.border;}}>📷</button>
              <textarea suppressHydrationWarning value={input} onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}}}
                placeholder={ui.placeholder} rows={1}
                style={{ flex:1, background:C.card, border:`1.5px solid ${C.border}`, borderRadius:12, padding:"10px 13px", color:"#e2e8f0", fontSize:13, resize:"none", outline:"none", fontFamily:"'Outfit',sans-serif", lineHeight:1.55, transition:"border-color 0.2s" }}
                onFocus={e=>e.target.style.borderColor=C.green} onBlur={e=>e.target.style.borderColor=C.border}/>
              <button onClick={() => sendMessage()} disabled={(!input.trim()&&!pendingImage)||isThinking}
                style={{ width:40, height:40, borderRadius:"50%", border:"none", background:(input.trim()||pendingImage)&&!isThinking?`linear-gradient(135deg,${C.blue},${C.red})`:C.card, color:(input.trim()||pendingImage)&&!isThinking?"#fff":C.muted, cursor:(input.trim()||pendingImage)&&!isThinking?"pointer":"not-allowed", fontSize:19, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontWeight:700, transition:"all 0.2s" }}>↑</button>
            </div>
          </div>
        </div>

        {/* ════════════ RIGHT PANEL — WHITEBOARD ════════════ */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", background:"#f0ece0", overflow:"hidden" }}>
          {/* Whiteboard header — logo always visible */}
          <div style={{ padding:"10px 20px", background:"#ffffff", borderBottom:"2px solid #d8d4c4", display:"flex", alignItems:"center", gap:12 }}>
            <AELogo height={38} darkBg/>
            <div style={{ width:1, height:32, background:"#e2e8f0" }}/>
            <span style={{ fontSize:11, color:"#94a3b8", fontFamily:"'Space Mono',monospace", fontWeight:700, letterSpacing:"0.06em" }}>🖊️ INTERACTIVE WHITEBOARD</span>
            {board.length>0 && (
              <span style={{ background:C.bluePale, border:`1px solid ${C.blueLight}99`, borderRadius:20, padding:"2px 9px", fontSize:10, color:C.blueDark, fontWeight:600 }}>
                {board.length} diagram{board.length>1?"s":""}
              </span>
            )}
            {profile.currentTopic && (
              <span style={{ background:`${C.red}15`, border:`1px solid ${C.red}30`, borderRadius:20, padding:"2px 9px", fontSize:10, color:C.red, fontWeight:600 }}>
                📖 {profile.currentTopic}
              </span>
            )}
            {board.length>0 && (
              <button onClick={() => { setBoard([]); setBoardCounter(0); setStepCounter(0); }}
                style={{ marginLeft:"auto", padding:"5px 14px", background:"none", border:"1.5px solid #cbd5e1", borderRadius:8, cursor:"pointer", color:"#94a3b8", fontSize:12, fontWeight:600, fontFamily:"'Outfit',sans-serif", transition:"all 0.2s" }}
                onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor=C.red;(e.currentTarget as HTMLButtonElement).style.color=C.red;}}
                onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor="#cbd5e1";(e.currentTarget as HTMLButtonElement).style.color="#94a3b8";}}>
                Board saaf karo
              </button>
            )}
          </div>
          <div style={{ flex:1, overflowY:"auto", padding:"28px 32px" }}>
            <Whiteboard items={board} user={currentUser}/>
          </div>
        </div>

      </div>
    </>
  );
}