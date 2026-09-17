(function(){
"use strict";
/* ============ utilities ============ */
const $=s=>document.querySelector(s);
const el=id=>document.getElementById(id);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid=p=>p+"_"+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-3);
const pad=n=>String(n).padStart(2,"0");
const ymd=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const parseD=s=>{const p=String(s).split("-").map(Number);return new Date(p[0],p[1]-1,p[2]);};
const addDays=(d,n)=>{const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()+n);return x;};
/* Which weekday a week starts on, 0=Sunday..6=Saturday. Monday unless asked. */
const weekStart=()=>{const v=S&&S.prefs?Number(S.prefs.weekStart):1;return isNaN(v)?1:Math.min(6,Math.max(0,v));};
const startOfWeek=d=>addDays(d,-((d.getDay()-weekStart()+7)%7));
const clock24=()=>!!(S&&S.prefs&&S.prefs.clock24);
/* DOWS is written Monday-first; these are the seven columns as displayed. */
const dowLabels=()=>{const out=[],w=weekStart();
  for(let i=0;i<7;i++)out.push(DOWS[((w+i)+6)%7]);return out;};
const today=()=>{const n=new Date();return new Date(n.getFullYear(),n.getMonth(),n.getDate());};
const TODAY=()=>ymd(today());
const dayDiff=(a,b)=>Math.round((parseD(a)-parseD(b))/864e5);
const MON=["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOWS=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const icon=(n,c)=>'<svg class="ic '+(c||"")+'" aria-hidden="true"><use href="#'+n+'"/></svg>';
const fmtDate=s=>{if(!s)return"";const d=parseD(s);return d.getDate()+" "+MONS[d.getMonth()]+(d.getFullYear()!==today().getFullYear()?" "+d.getFullYear():"");};
const fmtTime=t=>{if(!t)return"";const[h,m]=t.split(":").map(Number);
  if(clock24())return pad(h)+":"+pad(m);
  const ap=h>=12?"pm":"am",hh=h%12===0?12:h%12;return hh+(m?":"+pad(m):"")+ap;};
/* "9–9:45am" — the trailing am/pm is dropped from the start when both ends
   share it, which is how calendars write a range. */
const fmtRange=(t,dur)=>{
  if(!t)return"";
  const[h,m]=t.split(":").map(Number),s=h*60+m;
  if(!dur)return fmtTime(t);
  const e=s+dur,eh=Math.floor(e/60)%24,em=e%60;
  const a=fmtTime(t),b=fmtTime(pad(eh)+":"+pad(em));
  return((h<12)===(eh<12)?a.replace(/(am|pm)$/,""):a)+"–"+b;
};
const relDue=s=>{if(!s)return"No date";const d=dayDiff(s,TODAY());if(d===0)return"Today";if(d===1)return"Tomorrow";if(d===-1)return"Yesterday";if(d<0)return Math.abs(d)+"d overdue";if(d<7)return"In "+d+"d";return fmtDate(s);};
const stripHtml=h=>{const t=document.createElement("div");t.innerHTML=String(h||"").replace(/<\/(p|div|h[1-6]|li|blockquote|ul|ol|tr)>/gi,"$& ");return (t.textContent||"").replace(/\s+/g," ").trim();};

/* ============ constants ============ */
const STATUSES=[
 {id:"backlog",name:"Backlog",color:"#9AA298"},
 {id:"planned",name:"Planned",color:"#4C6FE0"},
 {id:"in_progress",name:"In Progress",color:"#D99A16"},
 {id:"review",name:"Waiting for Review",color:"#7C5CE0"},
 {id:"completed",name:"Completed",color:"#3F7D5C"},
 {id:"dropped",name:"Dropped",color:"#C25340"}];
const ST=id=>STATUSES.find(s=>s.id===id)||STATUSES[0];
const QUADS=[
 {id:"do",name:"Do First",tag:"Urgent + Important",note:"Do these tasks immediately.",cls:"q-do",icon:"i-bolt"},
 {id:"decide",name:"Schedule",tag:"Important, not urgent",note:"Schedule time to work on these.",cls:"q-decide",icon:"i-calendar"},
 {id:"delegate",name:"Delegate",tag:"Urgent, not important",note:"Hand these to someone else.",cls:"q-delegate",icon:"i-user"},
 {id:"drop",name:"Eliminate",tag:"Neither",note:"Drop or ignore these.",cls:"q-drop",icon:"i-x"}];
const quadOf=t=>{if(t.urgent==null||t.important==null)return null;if(t.urgent&&t.important)return"do";if(!t.urgent&&t.important)return"decide";if(t.urgent&&!t.important)return"delegate";return"drop";};
const CAT_ICONS=["i-briefcase","i-laptop","i-home","i-user","i-target","i-heart","i-circle","i-flame","i-paw","i-rocket","i-book","i-star","i-cart","i-music","i-plane","i-dumbbell","i-leaf","i-coffee","i-palette","i-note"];
const CAT_COLORS=["#4C6FE0","#7C5CE0","#E0854A","#D95C93","#2F9C86","#D8544E","#7A8A80","#D99A16","#A9713B","#3F8F4F","#2E8BA8","#B0517E"];
const OPEN=["backlog","planned","in_progress","review"];

/* ============ starting data ============ */
function baseCategories(){
  return [
   {id:"office",name:"Office",icon:"i-briefcase",color:"#4C6FE0"},
   {id:"freelance",name:"Freelance",icon:"i-laptop",color:"#7C5CE0"},
   {id:"home",name:"Home",icon:"i-home",color:"#E0854A"},
   {id:"personal",name:"Personal",icon:"i-user",color:"#D95C93"},
   {id:"goals",name:"Goals",icon:"i-target",color:"#2F9C86"},
   {id:"hubby",name:"Hubby",icon:"i-heart",color:"#D8544E"},
   {id:"passion",name:"Passion",icon:"i-flame",color:"#D99A16"},
   {id:"pets",name:"Pets",icon:"i-paw",color:"#A9713B"},
   {id:"side",name:"Side Hustle",icon:"i-rocket",color:"#3F8F4F"},
   {id:"other",name:"Other",icon:"i-circle",color:"#7A8A80"}];
}
function blankState(){
  return {categories:baseCategories(),tasks:[],routines:[],notes:[],completions:{},
    activity:[],docs:[],sessions:[],
    prefs:{hidden:[],scratch:"",setup:false,vault:"",
      theme:"system",accent:"green",weekStart:1,clock24:false,launch:"dashboard",
      autoBackup:{on:false,dir:"",every:"week",last:0},
      running:null}};
}
/* Tasks gained fields over time; older saved tasks predate them. Read through
   these rather than assuming the field is there. */
const tTags=t=>Array.isArray(t.tags)?t.tags:[];
const tLinks=t=>Array.isArray(t.links)?t.links:[];
const tFiles=t=>Array.isArray(t.attachments)?t.attachments:[];
const tEst=t=>Number(t.est)||0;
/* When a task happens, put the way Google Calendar puts it: a date -- stored
   as `due`, a name older than the idea -- and then either all day, or a
   start and an end time (`dueTime`, `endTime`). Apart from that, an
   optional deadline: the day it has to be done by, which is not the day you
   plan to do it. */
const tTimeDay=t=>t.due||"";
const hm2m=hm=>{const x=String(hm||"").split(":").map(Number);return x[0]*60+(x[1]||0);};
const m2hm=m=>pad(Math.floor(m/60))+":"+pad(m%60);
/* A start time with no end -- set before tasks had an end -- is drawn half
   an hour long. */
const TASK_DUR=30;
function tSpan(t){
  if(!t.dueTime)return null;
  const s=hm2m(t.dueTime);let e=t.endTime?hm2m(t.endTime):s+TASK_DUR;
  if(e<=s)e=Math.min(s+TASK_DUR,24*60);
  return {start:s,end:e};
}
const fmtTaskTime=t=>{const sp=tSpan(t);return sp?fmtRange(t.dueTime,sp.end-sp.start):"";};
/* The task form once had a start date beside the due date. The date is now
   the day you plan to do it, so a start date becomes the date, and a due
   date after it becomes the deadline. The time went with the start date
   already, so it stays with it. Safe to run any number of times. */
function fixTasks(){
  let n=0;
  (S.tasks||[]).forEach(t=>{
    if(!t.start)return;
    if(t.due&&t.due>t.start&&!t.deadline)t.deadline=t.due;
    t.due=t.start;t.start="";n++;
  });
  if(n)save("tasks");
}
function sampleState(){
  const st=blankState(),o=n=>ymd(addDays(today(),n));
  const T=(title,due,cat,status,u,i,extra)=>Object.assign({id:uid("t"),title:title,desc:"",due:due,cat:cat,status:status,
    urgent:u,important:i,subtasks:[],created:o(-4),completedAt:status==="completed"?due:null},extra||{});
  st.tasks=[
   T("Reply to the emails still sitting in the inbox",o(-1),"office","planned",true,true),
   T("Send the invoice for last month",o(0),"freelance","in_progress",true,true,{dueTime:"15:00",endTime:"15:30"}),
   T("Draft the project brief",o(2),"office","planned",false,true,
     {dueTime:"14:00",endTime:"15:30",deadline:o(4),desc:"One page: the problem, who it is for, and how we will know it worked.",
      subtasks:[{id:uid("s"),t:"Collect the background notes",d:true},{id:uid("s"),t:"Write the first pass",d:false},{id:uid("s"),t:"Send it round for comments",d:false}]}),
   T("Book the dentist",o(1),"personal","backlog",true,false),
   T("Tidy the desk",o(3),"home","backlog",false,false),
   T("Buy a birthday gift",o(5),"other","planned",false,true),
   T("Plan next month's goals",o(6),"goals","backlog",null,null),
   T("Renew the gym membership",o(-3),"personal","completed",false,true)];
  const R=(title,cat,days,time,dur)=>({id:uid("r"),title:title,cat:cat,freq:"weekly",days:days,every:2,
    time:time,dur:dur,start:o(-28),end:"",active:true,note:""});
  st.routines=[
   R("Morning stand-up","office",[1,2,3,4,5],"09:30",15),
   R("Deep work block","office",[1,2,3,4,5],"10:00",90),
   R("Evening walk","goals",[1,2,3,4,5,6,0],"18:30",30),
   R("Weekly review","goals",[5],"16:00",45),
   R("Water the plants","home",[1,4],"08:00",10)];
  st.routines.forEach(function(r){
    for(var i=1;i<=5;i++){var d=addDays(today(),-i);
      if(r.days.indexOf(d.getDay())>-1&&i!==2)st.completions[r.id+"|"+ymd(d)]=true;}
  });
  st.notes=[
   {id:uid("n"),title:"How this planner works",cat:"personal",tags:["start-here"],pinned:true,updated:Date.now(),
    html:"<p>Six sections, all sharing the same tasks and categories.</p>"+
      "<h2>Dashboard</h2><p>Today on one page: tasks due today, today’s routines, anything overdue or missed, open action items from your notes, and a scratch pad for a quick thought.</p>"+
      "<h2>Calendar</h2><p>Week and month. Tasks with a time and routines sit in the time grid, and all-day tasks in the band across the top. Drag down a day to make a task for that time. The <b>Catch-up</b> panel on the right collects anything overdue so you can clear it in one place.</p>"+
      "<h2>Tasks</h2><p>A board you can drag cards across, or a list grouped by month. Quick filters sit on one row, and Advanced opens status, category, priority and date range.</p>"+
      "<h2>Matrix</h2><p>Every task lands in a quadrant based on whether it is urgent, important, both or neither. Closest due date comes first. Anything you have not judged yet waits in the tray at the bottom.</p>"+
      "<h2>Routines</h2><p>Anything that repeats: daily, weekdays, chosen days, or every few days. Tick the day squares to keep a streak going: any day counts, and doing it on a day off makes up for a missed one.</p>"+
      "<h2>Notes</h2><p>Write freely, tag by category, and turn any line into an action item. Action items become real tasks on your board and calendar.</p>"+
      "<p><b>Your data stays on this device</b>, in this browser. Use the download icon at the bottom of the sidebar to back it up, and the upload icon to restore it or move it to another computer.</p>",
    actions:[{id:uid("a"),t:"Add your own first task",done:false,taskId:null}]},
   {id:uid("n"),title:"Parking lot",cat:"goals",tags:["ideas"],pinned:false,updated:Date.now()-864e5,
    html:"<p>Somewhere to put the things that are not tasks yet.</p><ul><li>Somewhere to keep half-formed ideas</li><li>Books worth getting to</li></ul>",actions:[]}];
  st.prefs.setup=true;
  return st;
}

/* ============ state + persistence ============ */
const KEYS=["categories","tasks","routines","notes","completions","prefs","activity","docs","sessions"];
let S=blankState();
let db=null,dirty={},timers={},suppress={},touched={};
const LS="everyday-orbit-v1";
function loadLocal(){try{const raw=localStorage.getItem(LS);if(!raw)return false;const o=JSON.parse(raw);KEYS.forEach(k=>{if(o[k])S[k]=o[k];});return true;}catch(e){return false;}}
let storageOK=true;
function saveLocal(){try{const o={};KEYS.forEach(k=>o[k]=S[k]);localStorage.setItem(LS,JSON.stringify(o));storageOK=true;}catch(e){storageOK=false;}}
function setSync(state,label){
  const n=el("sync");if(!n)return;
  if(!storageOK&&!db){state="warn";label="This browser is blocking storage — back up often";}
  n.className="sync"+(state==="warn"?" warn":"");n.title=label;n.lastElementChild.textContent=label;
}
function bodyFor(k){
  if(k==="completions")return {list:Object.keys(S.completions||{})};
  if(k==="prefs")return {v:S.prefs};
  return {items:S[k]};
}
function save(key){
  dirty[key]=true;touched[key]=true;saveLocal();setSync("warn","Saving…");
  if((key==="tasks"||key==="routines")&&!GC.applying)gcalSoon();
  if(key==="tasks"||key==="routines"||key==="completions"||key==="prefs")remindSoon();
  driveSoon();
  clearTimeout(timers[key]);
  timers[key]=setTimeout(()=>{
    timers[key]=null;
    if(!db){setSync("ok","Saved on this device");dirty[key]=false;return;}
    const body=bodyFor(key);
    suppress[key]=Date.now();
    db.doc("state/"+key).set(body).then(()=>{dirty[key]=false;setSync("ok","All changes saved");})
      .catch(()=>{dirty[key]=false;setSync("warn","Saved on this device");});
  },500);
}
function readDoc(key,snap){
  if(!snap||!snap.exists)return;
  const d=snap.data()||{};
  if(key==="completions"){
    if(Array.isArray(d.list)){const m={};d.list.forEach(k=>{m[k]=true;});S.completions=m;}
    else if(d.map&&typeof d.map==="object")S.completions=d.map;
  }
  else if(key==="prefs"&&d.v)S.prefs=Object.assign({hidden:[],scratch:""},d.v);
  else if(d.items)S[key]=d.items;
}
async function connect(){
  let cap=null;
  try{cap=window.claude&&claude.use?await claude.use("db"):null;}catch(e){cap=null;}
  if(!cap){setSync("warn","Saved on this device");return;}
  db=cap;
  try{
    const meta=await db.doc("state/meta").get();
    if(!meta.exists){
      await db.doc("state/meta").set({seeded:true,v:1,at:new Date().toISOString()});
      for(const k of KEYS)await db.doc("state/"+k).set(bodyFor(k));
    }else{
      const snaps=await Promise.all(KEYS.map(k=>db.doc("state/"+k).get()));
      KEYS.forEach((k,i)=>{if(!touched[k])readDoc(k,snaps[i]);});
      if(S.prefs.setup||S.tasks.length||S.routines.length||S.notes.length)obRecheck();
      saveLocal();render();
    }
    setSync("ok","All changes saved");
    KEYS.forEach(k=>{
      db.doc("state/"+k).onSnapshot(snap=>{
        if(dirty[k]||timers[k])return;
        if(suppress[k]&&Date.now()-suppress[k]<8000)return;
        if(snap.metadata&&snap.metadata.hasPendingWrites)return;
        readDoc(k,snap);saveLocal();render();
      },()=>{});
    });
  }catch(e){setSync("warn","Saved on this device");}
}

/* ============ derived helpers ============ */
const cat=id=>S.categories.find(c=>c.id===id)||{id:"",name:"Uncategorised",icon:"i-circle",color:"#7A8A80"};
function hiddenCats(){
  if(!S.prefs||typeof S.prefs!=="object")S.prefs={hidden:[],scratch:""};
  if(!Array.isArray(S.prefs.hidden))S.prefs.hidden=[];
  return S.prefs.hidden;
}
const visibleCat=id=>hiddenCats().indexOf(id)===-1;
function toggleCat(id,force){
  const h=hiddenCats(),i=h.indexOf(id),show=force==null?i>-1:force;
  if(show){if(i>-1)h.splice(i,1);}else if(i===-1)h.push(id);
  touched.prefs=true;save("prefs");render();refreshCatsModal();
}
function refreshCatsModal(){const r=el("modalRoot");if(r&&r.querySelector('[data-act="cat-del"]'))catsModal();}
const taskById=id=>S.tasks.find(t=>t.id===id);
const routineById=id=>S.routines.find(r=>r.id===id);
const noteById=id=>S.notes.find(n=>n.id===id);
const isOpen=t=>OPEN.indexOf(t.status)>-1;
/* Late if the day you planned it has gone, or the deadline has. */
const isOverdue=t=>isOpen(t)&&((!!t.due&&t.due<TODAY())||(!!t.deadline&&t.deadline<TODAY()));
/* What "late" says: how far past the deadline when that has gone, otherwise
   how far past the date. */
const lateText=t=>relDue(t.deadline&&t.deadline<TODAY()?t.deadline:t.due);
/* A deadline, as a small mark beside the date. */
function dlMark(t){
  if(!t.deadline)return "";
  const over=isOpen(t)&&t.deadline<TODAY();
  return '<span class="m-dl'+(over?" over":"")+'" title="Deadline '+esc(fmtDate(t.deadline))+'">'+icon("i-deadline","ic-14")+esc(fmtDate(t.deadline))+'</span>';
}
function routineOn(r,d){
  if(!r.active)return false;
  const s=ymd(d);
  if(r.start&&s<r.start)return false;
  if(r.end&&s>r.end)return false;
  if(r.freq==="interval"){const n=Math.max(1,r.every||2);return Math.floor((parseD(s)-parseD(r.start||s))/864e5)%n===0;}
  return (r.days||[]).indexOf(d.getDay())>-1;
}
const doneR=(r,s)=>!!S.completions[r.id+"|"+s];
/* A routine's schedule is a plan, not a rule. It can be ticked on any day,
   and a routine kept on a different day is still kept: it shows on the day it
   was done, counts towards the streak, and makes up for a missed day. */
const routineHere=(r,d)=>routineOn(r,d)||doneR(r,ymd(d));
/* A missed day is made up by doing it on an off day after it, before the next
   day it is due -- each missed day has its own window, so one extra tick
   never covers two. */
function madeUp(r,d){
  for(let i=1;i<60;i++){const x=addDays(d,i),s=ymd(x);
    if(s>TODAY()||routineOn(r,x))return false;
    if(doneR(r,s))return true;}
  return false;
}
function matchQ(t,q){
  if(!q)return true;q=q.toLowerCase();
  return (t.title||"").toLowerCase().indexOf(q)>-1||(t.desc||"").toLowerCase().indexOf(q)>-1||
    cat(t.cat).name.toLowerCase().indexOf(q)>-1||(t.subtasks||[]).some(s=>s.t.toLowerCase().indexOf(q)>-1);
}
/* Every day it was done counts, scheduled or not. A scheduled day missed
   ends the streak unless it was made up; an off day left empty is neutral,
   and so is today until it is over. */
function streak(r){
  if(!r.active)return 0;
  let n=0;
  for(let i=0;i<366;i++){const d=addDays(today(),-i);
    if(doneR(r,ymd(d))){n++;continue;}
    if(i===0||!routineOn(r,d)||madeUp(r,d))continue;
    break;}
  return n;
}
function overdueItems(){
  const tasks=S.tasks.filter(t=>isOverdue(t)&&visibleCat(t.cat)).sort((a,b)=>(a.due||a.deadline)<(b.due||b.deadline)?-1:1);
  const miss=[];
  S.routines.filter(r=>visibleCat(r.cat)).forEach(r=>{
    for(let i=1;i<=7;i++){const d=addDays(today(),-i),s=ymd(d);
      if(routineOn(r,d)&&!doneR(r,s)&&!madeUp(r,d))miss.push({r:r,date:s});}
  });
  miss.sort((a,b)=>a.date<b.date?1:-1);
  return {tasks:tasks,miss:miss.slice(0,12)};
}

/* ============ view state ============ */
const V={view:"dashboard",calMode:"week",anchor:today(),taskMode:"board",q:"",odOpen:true,adv:false,sheet:null,range:"week",
  f:{quick:"open",status:"",cat:"",quad:"",from:"",to:"",sort:"due"},noteId:null,noteTag:""};

/* Google Calendar's working state. In memory only: events are Google's data,
   not the planner's, so they are never saved, synced to the cloud store, or
   put in a backup. See the google calendar section. */
const GC={events:[],cals:[],from:"",to:"",busy:false,fetching:false,err:"",status:null,
  connecting:false,applying:false,soon:null,draft:{id:"",secret:""}};

/* Reminders' working state: the pending reschedule, and in a plain browser
   the timers and what has already been shown. See the reminders section. */
const RM={soon:null,web:new Map(),fired:new Set()};

/* ============ rail + topbar ============ */
const NAV=[{id:"dashboard",name:"Dashboard",icon:"i-dash"},{id:"calendar",name:"Calendar",icon:"i-calendar"},{id:"tasks",name:"Tasks",icon:"i-board"},
 {id:"matrix",name:"Matrix",icon:"i-grid"},{id:"routines",name:"Routines",icon:"i-repeat"},{id:"notes",name:"Notes",icon:"i-note"}];
/* The sidebar carries a number only when something is late, and only once,
   on Dashboard, where "Needs your attention" lives. A count on every section
   -- open tasks, today's routines, how many notes -- was inventory, and a
   number that is always there stops being noticed. What is due today is a
   plan, not an alarm, so it does not count; what has slipped past its date
   does. */
function navAlert(id){
  if(id!=="dashboard")return null;
  const n=overdueItems().tasks.length;
  return n?{n:n,label:n+" overdue task"+(n===1?"":"s")}:null;
}
/* On a narrow screen the rail is a drawer over the view; on a wide one the
   class is inert because the rail is always in the layout. */
function closeRail(){document.body.classList.remove("rail-open");}

function renderRail(){
  const bs=el("brandSub");if(bs)bs.textContent="Personal planner";
  el("nav").innerHTML=NAV.map(n=>{const a=navAlert(n.id);
    return '<button class="nav-btn" data-act="view" data-view="'+n.id+'" aria-current="'+(V.view===n.id)+'" title="'+esc(n.name+(a?" · "+a.label:""))+'">'+
      icon(n.icon,"ic-18")+'<span>'+esc(n.name)+'</span>'+
      /* <b>, not <span>: the icon-only rail hides every span in a nav button,
         and an alert has to survive that. */
      (a?'<b class="nav-alert num" aria-label="'+esc(a.label)+'">'+a.n+'</b>':'')+'</button>';}).join("");
  const hid=hiddenCats().length;
  el("railHead").innerHTML='<span class="grow">Categories</span>'+
    (hid?'<button class="txt" data-act="cat-all" title="Show every category">Show all</button>'
        :'<button class="txt" data-act="cat-none" title="Hide every category">None</button>')+
    '<button data-act="manage-cats" title="Manage categories" aria-label="Manage categories">'+icon("i-settings","ic-14")+'</button>';
  el("catList").innerHTML=S.categories.map(c=>{const off=!visibleCat(c.id);
    return '<button class="cat-row'+(off?" off":"")+'" style="--c:'+c.color+'" data-act="cat-toggle" data-id="'+c.id+'" role="switch" aria-checked="'+(!off)+'" title="'+esc(off?"Show":"Hide")+' '+esc(c.name)+'">'+
      '<span class="cat-box">'+icon("i-check")+'</span>'+icon(c.icon,"ic-14 ic-cat")+'<span class="cname">'+esc(c.name)+'</span></button>';}).join("");
}
function topSearch(ph){
  return '<div class="search">'+icon("i-search")+'<input id="q" type="search" placeholder="'+esc(ph)+'" value="'+esc(V.q)+'" aria-label="Search"></div>';
}
function renderTopbar(){
  const open=S.tasks.filter(isOpen),over=S.tasks.filter(isOverdue);
  let title="",sub="",right="";
  if(V.view==="dashboard"){
    const d=todayItems(),left=d.tasks.filter(isOpen).length+d.routines.filter(r=>!doneR(r,TODAY())).length;
    title="Dashboard";sub="Your day at a glance";
    right='<button class="btn btn-primary" data-act="new-task" data-date="'+TODAY()+'">'+icon("i-plus")+'New task</button>';
  }else if(V.view==="calendar"){
    title="Calendar";
    sub=V.calMode==="week"?"Week of "+fmtDate(ymd(startOfWeek(V.anchor))):MON[V.anchor.getMonth()]+" "+V.anchor.getFullYear();
    right=topSearch("Search tasks and routines")+'<button class="btn btn-primary" data-act="new-task">'+icon("i-plus")+'New task</button>';
  }else if(V.view==="tasks"){
    title="Tasks";sub=open.length+" open"+(over.length?" · "+over.length+" overdue":"")+" · "+S.tasks.length+" total";
    right='<div class="seg"><button data-act="task-mode" data-mode="board" aria-pressed="'+(V.taskMode==="board")+'">'+icon("i-board")+'Board</button>'+
      '<button data-act="task-mode" data-mode="list" aria-pressed="'+(V.taskMode==="list")+'">'+icon("i-list")+'List</button></div>'+
      topSearch("Search tasks")+'<button class="btn btn-primary" data-act="new-task">'+icon("i-plus")+'New task</button>';
  }else if(V.view==="matrix"){
    title="Eisenhower Matrix";sub="Open tasks by urgency and importance, closest due date first";
    right=topSearch("Search tasks")+'<button class="btn btn-primary" data-act="new-task">'+icon("i-plus")+'New task</button>';
  }else if(V.view==="routines"){
    const due=S.routines.filter(r=>routineHere(r,today())).length,done=S.routines.filter(r=>doneR(r,TODAY())).length;
    title="Routines & Habits";sub=S.routines.length+" routines · "+done+" of "+due+" done today";
    right=topSearch("Search routines")+'<button class="btn btn-primary" data-act="new-routine">'+icon("i-plus")+'New routine</button>';
    }else{
    title="Notes";sub=S.notes.length+" notes · action items land in your tasks and calendar";
    right=topSearch("Search notes")+'<button class="btn" data-act="scratch">'+icon("i-bolt")+'Scratch pad</button>'+
      '<button class="btn btn-primary" data-act="new-note">'+icon("i-plus")+'New note</button>';
  }
  const hid=hiddenCats().length;
  const notice=hid?'<button class="filter-pill on" data-act="cat-all" title="Show all categories again">'+icon("i-filter")+hid+(hid===1?" category":" categories")+' hidden'+icon("i-x","ic-14")+'</button>':"";
  const menu='<button class="rail-toggle" data-act="rail" aria-label="Show the sidebar" title="Sidebar">'+icon("i-menu","ic-18")+'</button>';
  el("topbar").innerHTML=menu+'<div class="title-wrap"><h1>'+title+'</h1><p>'+esc(sub)+'</p></div><div class="spacer"></div>'+timerBar()+notice+right;
}

/* ============ shared fragments ============ */
/* A category drop-down shows the chosen category's colour as a dot inside
   the field -- the same dot its list shows beside every option -- so the
   colours stay familiar wherever a category is picked. `any` adds a first
   option with no category, which shows no dot. */
function catSelect(attrs,val,o){
  o=o||{};const c=val?cat(val):null;
  return '<span class="catsel'+(o.cls?" "+o.cls:"")+(c?"":" none")+'" style="--c:'+(c?c.color:"transparent")+'">'+
    '<i class="catsel-dot" aria-hidden="true"></i><select '+attrs+'>'+
    (o.any?'<option value="">'+esc(o.any)+'</option>':"")+
    S.categories.map(x=>'<option value="'+x.id+'"'+(val===x.id?" selected":"")+'>'+esc(x.name)+'</option>').join("")+
    '</select></span>';
}
function catChip(id){const c=cat(id);return '<span class="chip chip-cat" style="--c:'+c.color+'">'+icon(c.icon)+esc(c.name)+'</span>';}
function dueChip(t){
  if(!t.due)return"";
  const d=dayDiff(t.due,TODAY());const k=isOpen(t)?(d<0?"over":(d<=1?"soon":"")):"";
  return '<span class="chip chip-due '+k+'">'+icon("i-clock")+esc(relDue(t.due)+(t.dueTime?" "+fmtTime(t.dueTime):""))+'</span>';
}
function quadChip(t){const q=quadOf(t);if(!q)return"";const Q=QUADS.find(x=>x.id===q);
  return '<span class="chip chip-q '+Q.cls+'">'+esc(Q.name)+'</span>';}
function tickBtn(t){return '<button class="tick'+(t.status==="completed"?" on":"")+'" data-act="task-done" data-id="'+t.id+'" aria-label="Mark complete" title="Mark complete">'+icon("i-check")+'</button>';}

/* ============ calendar ============ */
function eventsFor(d){
  const s=ymd(d);
  const evs=S.routines.filter(r=>visibleCat(r.cat)&&routineHere(r,d)).map(r=>{
    const[h,m]=(r.time||"09:00").split(":").map(Number);
    return {kind:"routine",r:r,start:h*60+m,dur:r.dur||30,date:s,done:doneR(r,s)};
  });
  /* Time you actually spent, drawn at the hour you spent it. Runs of one task
     close together are one sitting with pauses in it, so they draw as one
     block from the first start to the last stop, labelled with the time
     actually tracked. */
  const dayEnd=addDays(d,1).setHours(0,0,0,0);
  sittings(s).forEach(g=>{
    const st=new Date(g.start);
    evs.push({kind:"session",g:g,t:g.t,date:s,secs:g.secs,
      start:st.getHours()*60+st.getMinutes(),
      dur:Math.max(1,(Math.min(g.end,dayEnd)-g.start)/60000)});
  });
  return evs.sort((a,b)=>a.start-b.start);
}
/* A gap longer than this starts a new block: a morning run and an afternoon
   run are two sittings, and one block across them would claim the hours in
   between. */
const RUN_GAP=30*60*1000;
const runEnd=x=>x.end||(x.start+(x.secs||0)*1000);
function sittings(dayStr){
  const by={},out=[];
  S.sessions.forEach(x=>{if(ymd(new Date(x.start))===dayStr)(by[x.task]=by[x.task]||[]).push(x);});
  /* The run in progress has no row until it stops, so it is added here as
     one: from when it began to now, or, if paused, as far as it had got. It
     merges like any other run, so resuming soon after a stop carries on the
     same block rather than starting a new one beside it. */
  const r=running();
  if(r&&r.began&&ymd(new Date(r.began))===dayStr){
    const secs=liveSecs();
    (by[r.task]=by[r.task]||[]).push({task:r.task,start:r.began,end:r.since?Date.now():r.began+secs*1000,secs:secs,live:true});
  }
  Object.keys(by).forEach(id=>{
    const t=taskById(id);if(!t||!visibleCat(t.cat))return;
    let cur=null;
    by[id].sort((a,b)=>a.start-b.start).forEach(x=>{
      if(cur&&x.start-cur.end<=RUN_GAP){cur.end=Math.max(cur.end,runEnd(x));cur.secs+=x.secs||0;cur.runs.push(x);}
      else{cur={t:t,start:x.start,end:runEnd(x),secs:x.secs||0,runs:[x]};out.push(cur);}
      /* base is what the stopped runs add up to, so the tick can show base
         plus the live seconds without recounting the rows. */
      if(x.live){cur.live=true;cur.base=cur.secs-(x.secs||0);}
    });
  });
  return out;
}
/* Tracked time the way a person says it: 45s, 12m, 1h 5m. */
function fmtTracked(secs){
  const s=Math.max(0,Math.round(secs||0));
  if(s<60)return s+"s";
  const m=Math.floor(s/60),h=Math.floor(m/60);
  return h?h+"h"+(m%60?" "+m%60+"m":""):m+"m";
}
function layoutEvents(evs){
  const out=[];let cluster=[],end=-1;
  evs.forEach(e=>{
    if(cluster.length&&e.start>=end){flush();}
    cluster.push(e);end=Math.max(end,e.start+e.dur);
  });
  flush();
  function flush(){
    if(!cluster.length)return;
    const cols=[];
    cluster.forEach(e=>{
      let i=0;while(cols[i]&&cols[i]>e.start)i++;
      cols[i]=e.start+e.dur;e._c=i;
    });
    const n=cols.length;cluster.forEach(e=>{e._n=n;out.push(e);});
    cluster=[];end=-1;
  }
  return out;
}
/* A task belongs to its date, or, with no date, to its deadline. */
function tasksFor(s){
  return S.tasks.filter(t=>(t.due===s||(!t.due&&t.deadline===s))&&visibleCat(t.cat)&&matchQ(t,V.q)&&t.status!=="dropped");
}
/* A task with a time sits in the time grid; the band across the top is for
   the rest. */
const timedOn=(t,s)=>t.due===s&&!!t.dueTime;
const H0=6,H1=24,PX=48;
function weekGrid(){
  const start=startOfWeek(V.anchor),days=[];for(let i=0;i<7;i++)days.push(addDays(start,i));
  const tstr=TODAY();
  let head='<div class="wk-head"><div class="corner"></div>'+days.map(d=>{const s=ymd(d);
    return '<div class="dcol'+(s===tstr?" today":"")+'"><div class="dow">'+DOWS[(d.getDay()+6)%7]+'</div><div class="dnum num">'+d.getDate()+'</div></div>';}).join("")+'</div>';
  let ad='<div class="allday"><div class="lab">'+(gcalOn()?"All day":"Tasks")+'</div>'+days.map(d=>{const s=ymd(d);
    const ts=tasksFor(s).filter(t=>!timedOn(t,s));
    const gad=gcalFor(d).allDay.filter(e=>!V.q||e.title.toLowerCase().indexOf(V.q.toLowerCase())>-1);
    return '<div class="ad-cell'+(s===tstr?" today":"")+'" data-act="new-task" data-date="'+s+'">'+
      gad.map(e=>'<button class="gchip" style="--c:'+e.color+'" data-act="gcal-ev" data-id="'+esc(e.id)+'" title="'+esc(e.title+" · "+e.calName)+'"><span>'+esc(e.title)+'</span></button>').join("")+
      ts.map(t=>{const c=cat(t.cat);
      // A task, not an event: a tick box you can complete straight from the
      // calendar, then the title. Two buttons so both stay keyboard reachable.
      const done=t.status==="completed";
      return '<div class="tchip'+(done?" done":"")+(isOverdue(t)?" over":"")+'" style="--c:'+c.color+'">'+
        '<button class="tchip-tick" data-act="task-done" data-id="'+t.id+'" role="checkbox" aria-checked="'+done+'" aria-label="'+(done?"Mark not done":"Mark complete")+'">'+icon("i-check")+'</button>'+
        '<button class="tchip-body" data-act="task" data-id="'+t.id+'"'+(t.due!==s?' title="Deadline"':"")+'>'+icon(t.due!==s?"i-deadline":c.icon,"ic-14")+'<span>'+esc(t.title)+'</span></button>'+
        '</div>';}).join("")+'</div>';}).join("")+'</div>';
  let hours="";for(let h=H0;h<H1;h++)hours+='<div class="hourlab num">'+fmtTime(pad(h)+":00")+'</div>';
  const cols=days.map(d=>{
    const s=ymd(d);let lines="";for(let h=H0;h<H1;h++)lines+='<div class="hourline"></div>';
    const q=(V.q||"").toLowerCase();
    const tev=tasksFor(s).filter(t=>timedOn(t,s)).map(t=>{const sp=tSpan(t);return {kind:"task",t:t,start:sp.start,dur:sp.end-sp.start};});
    const evs=layoutEvents(eventsFor(d).concat(gcalFor(d).timed,tev).sort((a,b)=>a.start-b.start).filter(e=>{
      if(!q||e.kind==="task")return true;
      if(e.kind==="gcal")return e.g.title.toLowerCase().indexOf(q)>-1||e.g.calName.toLowerCase().indexOf(q)>-1;
      const title=e.kind==="session"?e.t.title:e.r.title;
      const cid=e.kind==="session"?e.t.cat:e.r.cat;
      return title.toLowerCase().indexOf(q)>-1||cat(cid).name.toLowerCase().indexOf(q)>-1;
    }));
    const body=evs.map(e=>{
      /* A task with a time: a block like a routine's, with the task's tick
         box in its corner, so it can be finished from the calendar. */
      if(e.kind==="task"){
        const t=e.t,c=cat(t.cat),top=(e.start/60-H0)*PX,ht=Math.max(20,(e.dur/60)*PX-2),clip=Math.max(0,-top);
        const w=100/e._n,left=e._c*w,sm=ht-clip<40,done=t.status==="completed";
        return '<div class="ev tev'+(done?" done":"")+(isOverdue(t)?" over":"")+(sm?" sm":"")+'" style="--c:'+c.color+';top:'+Math.max(0,top).toFixed(1)+'px;height:'+
          Math.max(20,ht-clip).toFixed(1)+'px;left:calc('+left+'% + 3px);width:calc('+w+'% - 6px)">'+
          '<button class="tchip-tick" data-act="task-done" data-id="'+t.id+'" role="checkbox" aria-checked="'+done+'" aria-label="'+(done?"Mark not done":"Mark complete")+'">'+icon("i-check")+'</button>'+
          '<button class="tev-body" data-act="task" data-id="'+t.id+'" title="'+esc(t.title+" · "+fmtTaskTime(t))+'"><b>'+esc(t.title)+'</b>'+
          '<i class="num">'+esc(sm?fmtTime(t.dueTime):fmtTaskTime(t))+'</i></button></div>';
      }
      if(e.kind==="gcal"){
        const top=(e.start/60-H0)*PX,ht=Math.max(18,(e.dur/60)*PX-2),w=100/e._n,left=e._c*w,sm=ht<40;
        const clip=Math.max(0,-top);   // an event that starts before the grid does
        return '<button class="ev gev-block'+(sm?" sm":"")+'" style="--c:'+e.g.color+';top:'+Math.max(0,top).toFixed(1)+'px;height:'+
          Math.max(18,ht-clip).toFixed(1)+'px;left:calc('+left+'% + 3px);width:calc('+w+'% - 6px)" data-act="gcal-ev" data-id="'+esc(e.g.id)+'" '+
          'title="'+esc(e.g.title+" · "+gcalWhen(e.g)+" · "+e.g.calName)+'"><b>'+esc(e.g.title)+'</b>'+
          '<i class="num">'+esc(sm?fmtTime(pad(Math.floor(e.start/60))+":"+pad(e.start%60)):gcalWhen(e.g))+'</i></button>';
      }
      const isS=e.kind==="session";
      const c=cat(isS?e.t.cat:e.r.cat),top=(e.start/60-H0)*PX;
      /* A sitting is drawn its true length, with a floor only big enough to
         click: a minute of tracking would otherwise be a one-pixel line. */
      const ht=isS?Math.max(16,(e.dur/60)*PX-2):Math.max(20,(e.dur/60)*PX-2);
      const w=100/e._n,left=e._c*w;
      const pos='--c:'+c.color+';top:'+top.toFixed(1)+'px;height:'+ht.toFixed(1)+'px;left:calc('+left+'% + 3px);width:calc('+w+'% - 6px)';
      // A stacked title and time needs about 40px. Shorter blocks put them on
      // one line, and show only the start time there so the full range does
      // not eat the room the title needs.
      const compact=ht<40;

      if(isS){
        const hm=ms=>{const x=new Date(ms);return fmtTime(pad(x.getHours())+":"+pad(x.getMinutes()));};
        const n=e.g.runs.length;
        if(e.g.live){
          const going=!!(running()||{}).since;
          return '<button class="ev tracked live'+(going?"":" held")+(compact?" sm":"")+'" style="'+pos+'" data-act="task" data-id="'+e.t.id+'"'+
            ' data-live-base="'+e.g.base+'" data-live-start="'+e.g.start+'" aria-label="'+esc(e.t.title+(going?", timer running":", timer paused"))+'">'+
            '<b><span class="ev-dot"></span>'+esc(e.t.title)+'</b>'+
            '<i class="num">'+(going?"":"Paused · ")+'<span class="ev-clock">'+esc(fmtDur(e.secs))+'</span></i></button>';
        }
        return '<button class="ev tracked'+(compact?" sm":"")+'" style="'+pos+'" data-act="task" data-id="'+e.t.id+
          '" title="'+esc(e.t.title+" · "+fmtTracked(e.secs)+" tracked, "+hm(e.g.start)+"–"+hm(e.g.end)+(n>1?", in "+n+" runs":""))+'">'+
          /* The timer icon only where there is room for it; squeezed into a
             short block it read as a stray bracket. */
          '<b>'+(compact?"":icon("i-timer","ic-14"))+esc(e.t.title)+'</b><i class="num">'+esc(fmtTracked(e.secs))+'</i></button>';
      }
      const when=compact?fmtTime(e.r.time):fmtRange(e.r.time,e.r.dur);
      return '<button class="ev'+(e.done?" done":"")+(compact?" sm":"")+'" style="'+pos+'" data-act="routine" data-id="'+e.r.id+'" data-date="'+s+'" title="'+esc(e.r.title+" · "+fmtRange(e.r.time,e.r.dur))+'"><b>'+esc(e.r.title)+'</b><i class="num">'+esc(when)+'</i></button>';}).join("");
    let now="";
    if(s===tstr){const n=new Date(),mins=n.getHours()*60+n.getMinutes();
      if(mins>=H0*60&&mins<=H1*60)now='<div class="nowline" style="top:'+(((mins/60)-H0)*PX).toFixed(1)+'px"></div>';}
    return '<div class="daycol'+(s===tstr?" today":"")+'" data-date="'+s+'">'+lines+body+now+'</div>';}).join("");
  /* The head and the task band live inside the scroller, pinned. Outside it
     they were laid out over the full width while the grid lost the scrollbar's
     15px, so the day columns drifted further apart across the week. */
  return '<div class="grid-scroll" id="gridScroll">'+
    '<div class="wk-sticky">'+head+ad+'</div>'+
    '<div class="tgrid"><div class="tcol-time">'+hours+'</div>'+cols+'</div></div>';
}
/* ---- drag on the week to make a task ----
   As in Google Calendar: press on an empty stretch of a day, drag to the end
   time, let go, and a new task opens with that day and those times. A click
   without a drag makes an hour. Times snap to quarter hours, as the time
   picker's do. The placeholder stays on the grid while the new task is being
   filled in, and goes when it is made or abandoned. */
const DG={on:false};
const snap15=m=>Math.round(m/15)*15;
function dragMinute(y){
  const r=DG.col.getBoundingClientRect();
  return Math.max(H0*60,Math.min(H1*60,H0*60+(y-r.top)/PX*60));
}
function paintGhost(){
  const a=DG.a,b=DG.b,g=DG.g;
  g.style.top=((a/60-H0)*PX).toFixed(1)+"px";g.style.height=Math.max(12,((b-a)/60)*PX-2).toFixed(1)+"px";
  g.textContent=fmtRange(m2hm(a),b-a);
}
function clearGhosts(){document.querySelectorAll(".drag-ghost").forEach(x=>x.remove());}
document.addEventListener("mousedown",function(e){
  if(e.button!==0||!e.target.closest)return;
  const col=e.target.closest(".daycol");
  if(!col||!col.dataset.date||e.target.closest(".ev"))return;
  e.preventDefault();
  clearGhosts();
  const g=document.createElement("div");g.className="drag-ghost";g.setAttribute("aria-hidden","true");col.appendChild(g);
  Object.assign(DG,{on:true,col:col,g:g,y0:e.clientY,moved:false});
  DG.m0=Math.min(H1*60-15,Math.floor(dragMinute(e.clientY)/15)*15);
  DG.a=DG.m0;DG.b=DG.m0+60>H1*60?H1*60:DG.m0+60;
  paintGhost();
});
document.addEventListener("mousemove",function(e){
  if(!DG.on)return;
  if(Math.abs(e.clientY-DG.y0)>4)DG.moved=true;
  if(!DG.moved)return;
  const m=dragMinute(e.clientY);
  if(m>=DG.m0){DG.a=DG.m0;DG.b=Math.max(DG.m0+15,snap15(m));}
  else{DG.a=Math.floor(m/15)*15;DG.b=DG.m0+15;}
  paintGhost();
});
document.addEventListener("mouseup",function(){
  if(!DG.on)return;
  DG.on=false;
  const end=Math.min(DG.b,24*60-1);
  openSheet(null,{due:DG.col.dataset.date,dueTime:m2hm(DG.a),endTime:m2hm(end),status:"planned"});
  const ti=el("shTitle");if(ti)ti.focus();
});

/* A cell shows this many lines before the rest fold into "+N more". Four
   fits a six-week month on an ordinary laptop screen. */
const MONTH_LINES=4;
function monthGrid(){
  const y=V.anchor.getFullYear(),m=V.anchor.getMonth(),tstr=TODAY(),q=(V.q||"").toLowerCase();
  /* Only the weeks the month touches: from the week holding its first day to
     the week holding its last. Days of the next or last month appear only to
     fill out those weeks, never as whole rows of their own. */
  const start=startOfWeek(new Date(y,m,1)),end=addDays(startOfWeek(new Date(y,m+1,0)),6);
  const days=[];for(let d=start;ymd(d)<=ymd(end);d=addDays(d,1))days.push(d);
  const hit=t=>!q||t.toLowerCase().indexOf(q)>-1;
  const clock=mins=>fmtTime(pad(Math.floor(mins/60))+":"+pad(mins%60));

  const cells=days.map((d,i)=>{
    const s=ymd(d),evs=eventsFor(d),gd=gcalFor(d),items=[];
    /* Tasks first, as chips: they belong to the day, not to a time in it. */
    tasksFor(s).filter(t=>!timedOn(t,s)).forEach(t=>{const c=cat(t.cat);
      items.push('<button class="mchip'+(t.status==="completed"?" done":"")+'" style="--c:'+c.color+'" data-act="task" data-id="'+t.id+'" data-stop="1"><span>'+esc(t.title)+'</span></button>');});
    gd.allDay.filter(e=>hit(e.title)).forEach(e=>items.push(
      '<button class="gchip mline-chip" style="--c:'+e.color+'" data-act="gcal-ev" data-id="'+esc(e.id)+'" data-stop="1"><span>'+esc(e.title)+'</span></button>'));
    /* Then everything with a time, in order: a dot, the time, the name. */
    const timed=evs.filter(e=>e.kind!=="session"&&hit(e.r.title)).map(e=>({start:e.start,
        html:'<button class="mline'+(e.done?" done":"")+'" style="--c:'+cat(e.r.cat).color+'" data-act="routine" data-id="'+e.r.id+'" data-date="'+s+'" data-stop="1">'+
          '<i class="mline-dot"></i><span class="mline-t num">'+esc(clock(e.start))+'</span><span class="mline-n">'+esc(e.r.title)+'</span></button>'}))
      .concat(gd.timed.filter(x=>hit(x.g.title)).map(x=>({start:x.start,
        html:'<button class="mline ev" style="--c:'+x.g.color+'" data-act="gcal-ev" data-id="'+esc(x.g.id)+'" data-stop="1">'+
          '<i class="mline-dot"></i><span class="mline-t num">'+esc(clock(x.start))+'</span><span class="mline-n">'+esc(x.g.title)+'</span></button>'})))
      .concat(tasksFor(s).filter(t=>timedOn(t,s)).map(t=>({start:tSpan(t).start,
        html:'<button class="mline'+(t.status==="completed"?" done":"")+'" style="--c:'+cat(t.cat).color+'" data-act="task" data-id="'+t.id+'" data-stop="1">'+
          '<i class="mline-dot sq"></i><span class="mline-t num">'+esc(fmtTime(t.dueTime))+'</span><span class="mline-n">'+esc(t.title)+'</span></button>'})))
      .sort((p,r)=>p.start-r.start);
    timed.forEach(x=>items.push(x.html));
    /* Time tracked is one line for the day, not one per sitting. */
    const tracked=evs.filter(e=>e.kind==="session"),secs=tracked.reduce((n,e)=>n+(e.secs||0),0);
    if(tracked.length)items.push('<button class="mline tracked" data-act="peek" data-date="'+s+'" data-stop="1">'+
      icon("i-timer","ic-14")+'<span class="mline-n">'+esc(fmtTracked(secs))+' tracked</span></button>');

    const over=items.length>MONTH_LINES,shown=over?items.slice(0,MONTH_LINES-1):items;
    const first=d.getDate()===1;
    return '<div class="mcell'+(d.getMonth()!==m?" out":"")+(s===tstr?" today":"")+(s<tstr?" past":"")+
        ((i+1)%7===0?" last-col":"")+(i>=days.length-7?" last-row":"")+'" data-act="new-task" data-date="'+s+'" data-total="'+items.length+'">'+
      '<div class="mtop"><span class="mnum num'+(first?" wide":"")+'">'+(first?esc(MONS[d.getMonth()])+" ":"")+d.getDate()+'</span></div>'+
      '<div class="mlist">'+shown.join("")+
        (over?'<button class="mmore" data-act="peek" data-date="'+s+'" data-stop="1">+'+(items.length-shown.length)+' more</button>':"")+
      '</div></div>';
  }).join("");
  return '<div class="mhead">'+dowLabels().map(x=>'<div>'+x+'</div>').join("")+'</div>'+
    '<div class="mgrid" style="grid-template-rows:repeat('+(days.length/7)+',minmax(var(--mrow-min),1fr))">'+cells+'</div>';
}
/* Four lines is the most a cell shows, but on a short screen a six-week
   month has room for fewer, and a half-cut fourth line reads as a fault.
   After drawing, each cell drops lines from the end until what is left fits,
   and the "+N more" count takes them in. */
function fitMonth(){
  document.querySelectorAll(".mcell").forEach(c=>{
    const list=c.querySelector(".mlist");if(!list)return;
    const total=Number(c.dataset.total)||0;
    const items=[...list.children].filter(x=>!x.classList.contains("mmore"));
    items.forEach(x=>{x.style.display="";});
    let more=list.querySelector(".mmore"),shown=items.length;
    const setMore=()=>{
      const n=total-shown;if(n<=0){if(more)more.remove();more=null;return;}
      if(!more){more=document.createElement("button");more.className="mmore";more.dataset.act="peek";
        more.dataset.date=c.dataset.date;more.dataset.stop="1";list.appendChild(more);}
      more.textContent="+"+n+" more";
    };
    while(list.scrollHeight>list.clientHeight+1&&shown>0){items[--shown].style.display="none";setMore();}
  });
}
let fitTimer=null;
window.addEventListener("resize",()=>{clearTimeout(fitTimer);fitTimer=setTimeout(()=>{if(V.view==="calendar"&&V.calMode!=="week")fitMonth();},120);});

function overduePanel(){
  const o=overdueItems(),n=o.tasks.length+o.miss.length;
  const head='<div class="od-head">'+
    '<button class="icon-btn" data-act="od-toggle" title="'+(V.odOpen?"Collapse":"Expand")+' catch-up panel" aria-label="Toggle catch-up panel">'+icon(V.odOpen?"i-chev-r":"i-panel")+'</button>'+
    '<h3>Catch-up</h3>'+(n?'<span class="od-count num">'+n+'</span>':"")+'</div>';
  if(!V.odOpen)return '<aside class="overdue collapsed">'+head+'</aside>';
  let body="";
  if(!n)body='<div class="empty">'+icon("i-check")+'<p>Nothing behind. Every task and routine up to today is done.</p></div>';
  else{
    if(o.tasks.length)body+='<div class="od-group"><h4>Overdue tasks</h4>'+o.tasks.map(t=>
      '<div class="od-item">'+tickBtn(t)+'<div class="t"><b>'+esc(t.title)+'</b><small>'+esc(lateText(t))+' · '+esc(cat(t.cat).name)+'</small></div>'+
      '<button class="rowbtn" style="opacity:1" data-act="task" data-id="'+t.id+'" aria-label="Open task">'+icon("i-edit","ic-14")+'</button></div>').join("")+'</div>';
    if(o.miss.length)body+='<div class="od-group"><h4>Missed routines</h4>'+o.miss.map(x=>
      '<div class="od-item"><button class="tick" data-act="routine-done" data-id="'+x.r.id+'" data-date="'+x.date+'" aria-label="Mark done">'+icon("i-check")+'</button>'+
      '<div class="t"><b>'+esc(x.r.title)+'</b><small class="mut">'+esc(fmtDate(x.date))+' · '+esc(cat(x.r.cat).name)+'</small></div></div>').join("")+'</div>';
  }
  return '<aside class="overdue">'+head+'<div class="od-body">'+body+'</div></aside>';
}
/* ============ dashboard ============ */
/* One page for today: what is due, what repeats, what slipped, and somewhere
   to put a thought without going to Notes. Nothing here is its own data --
   the scratch pad is the same one Notes opens, and every list is read
   straight from tasks, routines and notes. */
function todayItems(){
  const ts=TODAY();
  /* Open first, finished at the bottom, where they read as progress rather
     than as clutter. */
  const tasks=S.tasks.filter(t=>(t.due===ts||(!t.due&&t.deadline===ts))&&visibleCat(t.cat)&&t.status!=="dropped")
    .sort((a,b)=>(isOpen(a)?0:1)-(isOpen(b)?0:1)||((a.dueTime||"99")<(b.dueTime||"99")?-1:1));
  const routines=S.routines.filter(r=>visibleCat(r.cat)&&routineHere(r,today()))
    .sort((a,b)=>(a.time||"99")<(b.time||"99")?-1:1);
  return {tasks:tasks,routines:routines};
}
/* Open action items from notes that nothing else on the page already shows.
   One due today is in Today and one overdue is in Overdue; listing it twice
   would make one piece of work look like two. */
function noteActionItems(){
  const ts=TODAY(),out=[];
  S.notes.forEach(n=>(n.actions||[]).forEach(a=>{
    const t=a.taskId?taskById(a.taskId):null;
    if(t){
      if(!isOpen(t)||!visibleCat(t.cat))return;
      if(t.due===ts||isOverdue(t))return;
    }else if(a.done)return;
    out.push({n:n,a:a,t:t});
  }));
  /* Soonest first; anything with no date waits at the end. */
  return out.sort((x,y)=>((x.t&&x.t.due)||"9999")<((y.t&&y.t.due)||"9999")?-1:1);
}
function dashRow(o){
  return '<div class="drow'+(o.done?" done":"")+'" style="--c:'+o.color+'">'+o.tick+
    '<button class="drow-body" '+o.open+'><b>'+esc(o.title)+'</b>'+
    (o.meta?'<small><i class="cdot"></i>'+o.meta+'</small>':"")+'</button>'+
    (o.end?'<span class="drow-end'+(o.late?" late":o.behind?" behind":"")+'">'+o.end+'</span>':"")+'</div>';
}
function dashGroup(title,count,rows,empty){
  return '<div class="dgroup"><h3>'+esc(title)+(count?'<span class="num">'+count+'</span>':"")+'</h3>'+
    (rows||'<p class="dempty">'+esc(empty)+'</p>')+'</div>';
}
/* Past this many, missed routines fold away behind "Show more": they are the
   least actionable thing on the page and ten of them hid everything below. */
const MISS_SHOWN=4;
function dashHead(ic,title,tone,extra){
  return '<header class="dcard-h"><span class="dch-ic'+(tone?" "+tone:"")+'">'+icon(ic,"ic-14")+'</span>'+
    '<h2>'+esc(title)+'</h2>'+(extra||"")+'</header>';
}
function viewDashboard(){
  const ts=TODAY(),d=todayItems(),nowMin=new Date().getHours()*60+new Date().getMinutes();
  const mins=tm=>{if(!tm)return -1;const x=tm.split(":").map(Number);return x[0]*60+x[1];};

  /* ---- to do: tasks due today ---- */
  const taskRow=t=>{const c=cat(t.cat),done=t.status==="completed",est=tEst(t);
    return dashRow({color:c.color,done:done,tick:tickBtn(t),open:'data-act="task" data-id="'+t.id+'"',title:t.title,
      meta:esc(c.name)+(t.dueTime&&t.due===TODAY()?' · '+esc(fmtTaskTime(t)):"")+(t.deadline?' · deadline '+esc(t.deadline===TODAY()?"today":fmtDate(t.deadline)):"")+(est?' · '+esc(fmtMins(est))+' estimate':""),
      end:done?"":timerBtn(t)});};
  const openT=d.tasks.filter(isOpen).length;

  /* ---- schedule: routines and Google events on one line of time ----
     A routine's dot is its tick; an event's dot is a square and is not,
     because it is Google's to change. */
  const gd=gcalFor(today());
  const sched=d.routines.map(r=>({kind:"r",r:r,start:r.time?mins(r.time):-1,end:r.time?mins(r.time)+(Number(r.dur)||0):-1}))
    .concat(gd.timed.map(x=>({kind:"g",g:x.g,start:x.start,end:x.start+x.dur})))
    .sort((a,b)=>a.start-b.start);
  const agRow=it=>{
    const isNow=it.start>=0&&it.start<=nowMin&&nowMin<it.end;
    if(it.kind==="g"){const e=it.g;
      return '<div class="dag-row'+(e.en<Date.now()?" past":"")+(isNow?" now":"")+'" style="--c:'+e.color+'">'+
        '<span class="dag-time num">'+esc(fmtTime(pad(Math.floor(it.start/60))+":"+pad(it.start%60)))+'</span>'+
        '<span class="dag-dot ev" aria-hidden="true"></span>'+
        '<button class="drow-body" data-act="gcal-ev" data-id="'+esc(e.id)+'"><b>'+esc(e.title)+'</b>'+
        '<small><i class="cdot"></i>'+esc(e.calName)+'</small></button>'+(isNow?'<span class="dag-now">Now</span>':"")+'</div>';}
    const r=it.r,c=cat(r.cat),done=doneR(r,ts),behind=!done&&it.end>=0&&it.end<nowMin;
    return '<div class="dag-row'+(done?" done":"")+(isNow&&!done?" now":"")+'" style="--c:'+c.color+'">'+
      '<span class="dag-time num'+(behind?" behind":"")+'">'+(r.time?esc(fmtTime(r.time)):"Any time")+'</span>'+
      '<button class="dag-dot" data-act="routine-done" data-id="'+r.id+'" data-date="'+ts+'" aria-label="'+(done?"Mark not done":"Mark done")+'">'+icon("i-check")+'</button>'+
      '<button class="drow-body" data-act="routine" data-id="'+r.id+'" data-date="'+ts+'"><b>'+esc(r.title)+'</b>'+
      '<small><i class="cdot"></i>'+esc(c.name)+(r.dur?' · '+esc(fmtMins(r.dur)):"")+'</small></button>'+
      (isNow&&!done?'<span class="dag-now">Now</span>':"")+'</div>';
  };
  const allDay=gd.allDay.length?'<div class="dag-allday">'+gd.allDay.map(e=>
    '<button class="gchip" style="--c:'+e.color+'" data-act="gcal-ev" data-id="'+esc(e.id)+'"><span>'+esc(e.title)+'</span></button>').join("")+'</div>':"";
  const leftR=d.routines.filter(r=>!doneR(r,ts)).length;

  const qc=S.categories.some(c=>c.id===S.prefs.quickCat)?S.prefs.quickCat:S.categories[0].id;
  const quick='<div class="dquick">'+icon("i-plus","ic-14")+
    '<input id="dashQuick" placeholder="Add a task for today, then press Enter" aria-label="Add a task for today" autocomplete="off">'+
    catSelect('id="dashQuickCat" aria-label="Category for the new task"',qc,{cls:"bare"})+'</div>';

  const todayCard='<section class="dcard dash-today">'+dashHead("i-sun","Today","",
      '<small>'+openT+' to do · '+leftR+' in your schedule</small>')+quick+
    dashGroup("To do",openT,d.tasks.map(taskRow).join(""),"Nothing due today. Add one above.")+
    '<div class="dgroup"><h3>Schedule'+(leftR?'<span class="num">'+leftR+'</span>':"")+'</h3>'+allDay+
      (sched.length?'<div class="dag">'+sched.map(agRow).join("")+'</div>'
        :(allDay?"":'<p class="dempty">Nothing scheduled today.</p>'))+'</div>'+
    '</section>';

  /* ---- needs your attention ---- */
  const o=overdueItems(),ai=noteActionItems();
  const need=o.tasks.length+o.miss.length+ai.length;
  /* No red total here: the sidebar's red number means late, and a total that
     also counts missed routines and undated notes would say 10 beside its 1.
     Each group below carries its own count. */
  const attn='<section class="dcard dash-attn'+(need?"":" clear")+'">'+dashHead(need?"i-alert":"i-check","Needs your attention",need?"warn":"")+
    (!need?'<div class="dclear"><span class="dclear-ic">'+icon("i-check")+'</span><div><b>You’re all caught up</b>'+
      '<p>Nothing overdue, nothing missed. Enjoy it.</p></div></div>':
      (o.tasks.length?dashGroup("Overdue",o.tasks.length,o.tasks.map(t=>{const c=cat(t.cat);
        return dashRow({color:c.color,tick:tickBtn(t),open:'data-act="task" data-id="'+t.id+'"',title:t.title,
          meta:esc(c.name),end:esc(lateText(t)),late:true});}).join("")):"")+
      (ai.length?dashGroup("From your notes",ai.length,ai.map(x=>{
        const c=cat(x.t?x.t.cat:x.n.cat);
        return dashRow({color:c.color,
          tick:'<button class="tick" data-act="ai-done" data-nid="'+x.n.id+'" data-id="'+x.a.id+'" aria-label="Mark done">'+icon("i-check")+'</button>',
          open:'data-act="dash-note" data-id="'+x.n.id+'" title="Open the note"',title:x.a.t,
          meta:'In '+esc(x.n.title||"Untitled note"),end:x.t&&x.t.due?esc(relDue(x.t.due)):""});}).join("")):"")+
      (o.miss.length?dashGroup("Missed routines",o.miss.length,(V.dashAll?o.miss:o.miss.slice(0,MISS_SHOWN)).map(x=>{const c=cat(x.r.cat);
        return dashRow({color:c.color,
          tick:'<button class="tick" data-act="routine-done" data-id="'+x.r.id+'" data-date="'+x.date+'" aria-label="Mark done">'+icon("i-check")+'</button>',
          open:'data-act="routine" data-id="'+x.r.id+'" data-date="'+x.date+'"',title:x.r.title,meta:esc(c.name),
          end:esc(fmtDate(x.date))});}).join("")+
        (o.miss.length>MISS_SHOWN?'<button class="dmore" data-act="dash-more">'+(V.dashAll?"Show fewer":"Show "+(o.miss.length-MISS_SHOWN)+" more")+'</button>':"")):""))+
    '</section>';

  /* ---- scratch pad ---- */
  const scratch='<section class="dcard dash-scratch">'+dashHead("i-edit","Scratch pad","note",'<small>Saves as you type</small>')+
    '<div class="rte-bar">'+["bold|B","italic|I","insertUnorderedList|•"].map(x=>{const q=x.split("|");
      return '<button data-act="rte" data-cmd="'+q[0]+'" data-scratch="1" aria-label="'+q[0]+'">'+q[1]+'</button>';}).join("")+
      '<span class="spacer" style="flex:1"></span>'+
      '<button class="rte-txt" data-act="scratch-task" title="Turn the selected text, or the line you are on, into a task">'+icon("i-check","ic-14")+'Make task</button>'+
      '<button class="rte-txt" data-act="scratch-note" title="Save the selected text, or the line you are on, as a note">'+icon("i-note","ic-14")+'Save as note</button>'+
    '</div>'+
    '<div class="rte" id="scratchPad" contenteditable="true" data-ph="Anything you need out of your head…">'+(S.prefs.scratch||"")+'</div>'+
    '</section>';

  return '<div class="dash">'+dashHero(d)+
    '<div class="dash-grid"><div class="dash-col">'+todayCard+attn+'</div>'+
    '<div class="dash-side">'+timeTodayCard()+scratch+'</div></div></div>';
}

/* ---- the welcome panel ----
   The top of the page says hello, says in a sentence how today stands, and
   shows the day as an orbit: a planet that travels round as the things due
   today get done. Under it, the whole day on one strip. */
function dashGreeting(){
  const h=new Date().getHours();
  return h<5?"Still up?":h<12?"Good morning":h<17?"Good afternoon":h<22?"Good evening":"Winding down";
}
function dashHero(d){
  const ts=TODAY(),over=overdueItems().tasks.length;
  const doneT=d.tasks.filter(t=>t.status==="completed").length,doneRt=d.routines.filter(r=>doneR(r,ts)).length;
  const total=d.tasks.length+d.routines.length,done=doneT+doneRt,left=total-done;
  const plural=(n,w)=>n+" "+w+(n===1?"":"s");
  let line;
  if(!total&&!over)line="Nothing planned for today. A clear day, all yours.";
  else if(!left&&!over)line="Everything for today is done. Nicely handled.";
  else if(!left)line="Today’s list is done. "+plural(over,"thing")+" carried over still need"+(over===1?"s":"")+" you.";
  else line=plural(left,"thing")+" left for today"+(over?", and "+over+" carried over from before.":".");

  /* The orbit. r=40 in a 100 box; the planet sits where the arc ends. */
  const pct=total?done/total:0,C=2*Math.PI*40,ang=pct*2*Math.PI-Math.PI/2;
  const px=(50+40*Math.cos(ang)).toFixed(2),py=(50+40*Math.sin(ang)).toFixed(2);
  const ring='<div class="dorbit" role="img" aria-label="'+(total?done+" of "+total+" done today":"Nothing planned today")+'">'+
    '<svg viewBox="0 0 100 100" aria-hidden="true">'+
      '<circle class="dorbit-track" cx="50" cy="50" r="40"/>'+
      (pct>0?'<circle class="dorbit-arc" cx="50" cy="50" r="40" stroke-dasharray="'+(C*pct).toFixed(2)+' '+C.toFixed(2)+'" transform="rotate(-90 50 50)"/>':"")+
      '<circle class="dorbit-planet" cx="'+px+'" cy="'+py+'" r="6.5"/>'+
    '</svg>'+
    '<div class="dorbit-mid">'+(total?'<b class="num">'+done+'<i>/'+total+'</i></b><span>done</span>':icon("i-sun"))+'</div></div>';

  return '<section class="dhero">'+
    '<div class="dhero-top"><div class="dhero-text">'+
      '<div class="dhero-eyebrow">'+esc(today().toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long"}))+'</div>'+
      '<h2 class="dhero-hi">'+esc(dashGreeting()+(S.prefs.name?", "+S.prefs.name:""))+'</h2>'+
      '<p class="dhero-line">'+esc(line)+'</p>'+
      '<div class="dnext-list" id="dashNext">'+upNextHtml()+'</div>'+
    '</div>'+ring+'</div>'+
    '<div id="dashStrip">'+dayStripHtml()+'</div>'+
  '</section>';
}
/* A small play button on a task row. Running shows the live clock and pauses. */
function timerBtn(t){
  const r=running(),on=r&&r.task===t.id&&r.since;
  return '<button class="dplay'+(on?" on":"")+'" data-act="timer-toggle" data-id="'+t.id+'" '+
    'aria-label="'+(on?"Pause the timer":"Start the timer")+'" title="'+(on?"Pause":"Start timing this task")+'">'+
    icon(on?"i-pause":"i-play","ic-14")+(on?'<span class="num" data-live="'+t.id+'">'+esc(fmtDur(liveSecs()))+'</span>':"")+'</button>';
}

/* ---- up next ----
   What is on now and what comes next, from anything in today with a time.
   Redrawn in place once a minute, never by a full render, so it cannot take
   the caret out of the scratch pad. */
function timedToday(){
  const ts=TODAY(),m=tm=>{const x=tm.split(":").map(Number);return x[0]*60+x[1];};
  return todayItems().routines.filter(r=>r.time&&!doneR(r,ts))
    .map(r=>({title:r.title,color:cat(r.cat).color,start:m(r.time),end:m(r.time)+(Number(r.dur)||0),
      act:'data-act="routine" data-id="'+r.id+'" data-date="'+ts+'"'}))
    .concat(gcalTimedToday())
    .sort((a,b)=>a.start-b.start);
}
function inMins(n){const h=Math.floor(n/60),m=n%60;return (h?h+"h ":"")+(m||!h?m+" min":"").trim();}
function upNextHtml(){
  const now=new Date().getHours()*60+new Date().getMinutes(),items=timedToday();
  const cur=items.filter(x=>x.start<=now&&now<x.end)[0];
  const next=items.filter(x=>x.start>now)[0];
  const clock=mn=>fmtTime(pad(Math.floor(mn/60)%24)+":"+pad(mn%60));
  const pill=(label,x,when)=>'<button class="dnext'+(label==="Now"?" is-now":"")+'" style="--c:'+x.color+'" '+x.act+'>'+
    '<span class="dnext-l">'+esc(label)+'</span><b>'+esc(x.title)+'</b><span class="dnext-w">'+esc(when)+'</span></button>';
  let body="";
  if(cur)body+=pill("Now",cur,"until "+clock(cur.end));
  if(next)body+=pill("Next",next,"in "+inMins(next.start-now)+" · "+clock(next.start));
  return body||'<span class="dnext-none">Nothing else with a time today.</span>';
}
/* The day from the calendar's first hour to midnight on one strip: routines
   and Google events as bars at their real times, what has passed shaded,
   and a line for now. Overlaps stack into up to three lanes. Swapped in
   place with up next, so the now line walks across without a redraw. */
function dayStripHtml(){
  const from=H0*60,to=H1*60,span=to-from,ts=TODAY();
  const n=new Date(),now=n.getHours()*60+n.getMinutes();
  const m=tm=>{const x=tm.split(":").map(Number);return x[0]*60+x[1];};
  const items=todayItems().routines.filter(r=>r.time).map(r=>({title:r.title,color:cat(r.cat).color,
      start:m(r.time),end:m(r.time)+Math.max(10,Number(r.dur)||30),done:doneR(r,ts),
      act:'data-act="routine" data-id="'+r.id+'" data-date="'+ts+'"'}))
    .concat(gcalFor(today()).timed.map(x=>({title:x.g.title,color:x.g.color,start:x.start,end:x.start+x.dur,done:false,
      act:'data-act="gcal-ev" data-id="'+esc(x.g.id)+'"'})))
    .sort((a,b)=>a.start-b.start);
  const lanes=[];
  items.forEach(it=>{
    let l=lanes.findIndex(e=>e<=it.start);
    if(l<0){if(lanes.length<3){lanes.push(0);l=lanes.length-1;}else l=lanes.length-1;}
    lanes[l]=Math.max(lanes[l],it.end);it.lane=l;
  });
  const pos=v=>Math.max(0,Math.min(100,(v-from)/span*100));
  const hh=h=>fmtTime(pad(h%24)+":00");
  const ticks=[];for(let h=H0;h<=H1;h+=3)ticks.push('<span class="dtick'+(h===H0?" first":h>=H1?" last":"")+'" style="left:'+pos(h*60).toFixed(2)+'%">'+esc(hh(h))+'</span>');
  const bars=items.map(it=>{const l=pos(it.start),w=Math.max(.9,pos(it.end)-l);
    return '<button class="dblk'+(it.done?" done":"")+'" style="--c:'+it.color+';left:'+l.toFixed(2)+'%;width:'+w.toFixed(2)+'%;top:'+(6+it.lane*14)+'px" '+it.act+
      ' title="'+esc(it.title+" · "+fmtTime(pad(Math.floor(it.start/60))+":"+pad(it.start%60)))+'" aria-label="'+esc(it.title)+'"></button>';}).join("");
  const inDay=now>=from&&now<=to;
  return '<div class="dstrip" style="--lanes:'+Math.max(1,lanes.length)+'">'+
      '<div class="dstrip-past" style="width:'+pos(now).toFixed(2)+'%"></div>'+bars+
      (inDay?'<div class="dnow" style="left:'+pos(now).toFixed(2)+'%"><span>Now</span></div>':"")+
    '</div><div class="dticks">'+ticks.join("")+'</div>';
}

/* ---- time tracked today ----
   Summed from the session rows like every other total, plus the run in
   progress, which has no row until it stops. */
function trackedToday(){
  const ts=TODAY(),by={};
  S.sessions.forEach(x=>{if(ymd(new Date(x.start))!==ts)return;by[x.task]=(by[x.task]||0)+(x.secs||0);});
  const r=running();
  if(r&&ymd(new Date(r.began))===ts)by[r.task]=(by[r.task]||0)+liveSecs();
  const rows=Object.keys(by).map(id=>({t:taskById(id),secs:by[id]})).filter(x=>x.t&&(x.secs>0||(r&&r.task===x.t.id)))
    .sort((a,b)=>b.secs-a.secs);
  return {rows:rows,total:rows.reduce((n,x)=>n+x.secs,0)};
}
const totalMins=secs=>{const m=Math.floor(secs/60);return m?fmtMins(m):"0m";};
function timeTodayCard(){
  const d=trackedToday(),max=d.rows.length?d.rows[0].secs:0,r=running();
  return '<section class="dcard dash-time">'+dashHead("i-timer","Time today","blue",
      '<span class="dtotal num" id="dashTotal">'+esc(totalMins(d.total))+'</span>')+
    (d.rows.length?'<div class="dtime">'+d.rows.map(x=>{const c=cat(x.t.cat),live=r&&r.task===x.t.id;
      return '<button class="dtrow" data-act="task" data-id="'+x.t.id+'" style="--c:'+c.color+'">'+
        '<span class="dtrow-t">'+esc(x.t.title)+'</span>'+
        '<span class="dtrow-v num'+(live?" live":"")+'"'+(live?' data-live-total="'+x.t.id+'"':"")+'>'+esc(live?fmtDur(x.secs):fmtTracked(x.secs))+'</span>'+
        '<span class="dtrow-bar"><i style="width:'+Math.max(3,x.secs/max*100).toFixed(1)+'%"></i></span></button>';}).join("")+'</div>'
      :'<p class="dempty dtime-empty">Nothing tracked yet. Press '+icon("i-play","ic-14")+' on a task to start.</p>')+
    '</section>';
}

/* ---- scratch pad to task or note ----
   Works on the selection, or on the line the caret is in when nothing is
   selected. What is converted is moved, not copied: the point is that the
   pad empties as thoughts find their place. */
function scratchPick(){
  const pad=el("scratchPad");if(!pad)return null;
  restoreSel();
  const sel=window.getSelection();
  if(!sel||!sel.rangeCount||!pad.contains(sel.anchorNode))return null;
  const range=sel.getRangeAt(0);
  if(!range.collapsed){
    const box=document.createElement("div");box.appendChild(range.cloneContents());
    return {text:sel.toString(),html:box.innerHTML,remove:()=>range.deleteContents()};
  }
  let n=sel.anchorNode;
  while(n&&n.parentNode!==pad)n=n.parentNode;
  if(!n||n===pad)return null;
  /* A caret in a bare text node at the top level: the line is that node. */
  const text=n.textContent||"";
  const html=n.nodeType===1?n.outerHTML:esc(text);
  return {text:text,html:html,remove:()=>n.parentNode&&n.parentNode.removeChild(n)};
}
/* Moving text out can leave the husk of a list or paragraph behind. */
function scratchCommit(){
  const pad=el("scratchPad");if(!pad)return;
  pad.querySelectorAll("li,ul,ol,p,div").forEach(n=>{
    if(!n.textContent.trim()&&!n.querySelector("img"))n.remove();});
  S.prefs.scratch=pad.innerHTML;save("prefs");
}
function scratchToTask(){
  const p=scratchPick();
  const lines=p?p.text.split(/\n+/).map(x=>x.replace(/^\s*[•\-*]\s*/,"").trim()).filter(Boolean):[];
  if(!lines.length){toast("Select some text in the scratch pad, or click into a line");return;}
  const made=lines.map(line=>{
    const t={id:uid("t"),title:line.slice(0,200),desc:"",due:"",start:"",cat:S.categories[0].id,status:"backlog",
      urgent:null,important:null,est:0,tags:[],links:[],subtasks:[],attachments:[],created:TODAY(),completedAt:null};
    S.tasks.push(t);logAct(t.id,"created","Created from the scratch pad");return t;});
  p.remove();scratchCommit();save("tasks");
  /* One task opens so its date and category can be set straight away. */
  if(made.length===1){render();openSheet(made[0].id);toast("Moved into a task");}
  else{render();toast(made.length+" tasks added to your backlog");}
}
function scratchToNote(){
  const p=scratchPick();
  const text=p?p.text.trim():"";
  if(!text){toast("Select some text in the scratch pad, or click into a line");return;}
  const title=text.split(/\n/)[0].replace(/^\s*[•\-*]\s*/,"").trim().slice(0,80);
  const nn={id:uid("n"),title:title,cat:S.categories[0].id,tags:[],pinned:false,html:p.html,actions:[],updated:Date.now()};
  S.notes.unshift(nn);p.remove();scratchCommit();save("notes");render();
  toast("Saved to Notes as “"+title+"”");
}
function quickAdd(){
  const inp=el("dashQuick");if(!inp)return;
  const title=inp.value.trim();if(!title)return;
  const c=(el("dashQuickCat")||{}).value||S.categories[0].id;
  const t={id:uid("t"),title:title,desc:"",due:TODAY(),start:"",cat:c,status:"planned",
    urgent:null,important:null,est:0,tags:[],links:[],subtasks:[],attachments:[],created:TODAY(),completedAt:null};
  S.tasks.push(t);save("tasks");logAct(t.id,"created","Created this task");
  render();
  /* Stay in the box, ready for the next one. */
  const again=el("dashQuick");if(again)again.focus();
}

function viewCalendar(){
  const week=V.calMode==="week";
  /* Hours tracked in the week on screen, so the total sits with the blocks it
     is made of rather than on a page of its own. */
  const from=ymd(startOfWeek(V.anchor)),to=ymd(addDays(startOfWeek(V.anchor),6));
  const secs=S.sessions.reduce((n,x)=>{const k=ymd(new Date(x.start));
    return n+(k>=from&&k<=to?(x.secs||0):0);},0);

  const bar='<div class="cal-bar">'+
    '<div class="stepper"><button data-act="cal-prev" aria-label="Previous">'+icon("i-chev-l")+'</button><button data-act="cal-next" aria-label="Next">'+icon("i-chev-r")+'</button></div>'+
    '<button class="btn btn-sm" data-act="cal-today">Today</button>'+
    '<h2>'+(week?fmtDate(from)+" – "+fmtDate(to):MON[V.anchor.getMonth()]+" "+V.anchor.getFullYear())+'</h2>'+
    (week&&secs?'<span class="cal-tracked" title="Time tracked this week">'+icon("i-timer","ic-14")+fmtDur(secs)+'</span>':"")+
    '<div class="spacer"></div>'+
    '<div class="seg"><button data-act="cal-mode" data-mode="week" aria-pressed="'+week+'">Week</button>'+
    '<button data-act="cal-mode" data-mode="month" aria-pressed="'+(!week)+'">Month</button></div></div>';
  return '<div class="cal-wrap"><div class="cal-main">'+bar+(week?weekGrid():monthGrid())+'</div>'+overduePanel()+'</div>';
}

/* ============ tasks: filters ============ */
const QUICKS=[{id:"open",name:"Open"},{id:"today",name:"Today"},{id:"week",name:"This week"},{id:"overdue",name:"Overdue"},{id:"done",name:"Completed"},{id:"all",name:"Everything"}];
function filterTasks(mode){
  const f=V.f,t0=TODAY(),wkEnd=ymd(addDays(startOfWeek(today()),6));
  let list=S.tasks.filter(t=>visibleCat(t.cat)&&matchQ(t,V.q));
  if(f.quick==="today")list=list.filter(t=>t.due===t0);
  else if(f.quick==="week")list=list.filter(t=>t.due&&t.due>=ymd(startOfWeek(today()))&&t.due<=wkEnd);
  else if(f.quick==="overdue")list=list.filter(isOverdue);
  else if(f.quick==="done")list=list.filter(t=>t.status==="completed");
  else if(f.quick==="open"&&mode!=="board")list=list.filter(isOpen);
  else if(f.quick==="open"&&mode==="board")list=list.filter(t=>t.status!=="dropped"||true);
  if(f.status)list=list.filter(t=>t.status===f.status);
  if(f.cat)list=list.filter(t=>t.cat===f.cat);
  if(f.quad)list=list.filter(t=>f.quad==="none"?!quadOf(t):quadOf(t)===f.quad);
  if(f.from)list=list.filter(t=>t.due&&t.due>=f.from);
  if(f.to)list=list.filter(t=>t.due&&t.due<=f.to);
  const ord={do:0,decide:1,delegate:2,drop:3};
  list.sort((a,b)=>{
    if(f.sort==="title")return a.title.localeCompare(b.title);
    if(f.sort==="priority"){const x=ord[quadOf(a)]==null?9:ord[quadOf(a)],y=ord[quadOf(b)]==null?9:ord[quadOf(b)];if(x!==y)return x-y;}
    if(f.sort==="created")return (b.created||"")<(a.created||"")?-1:1;
    if(!a.due)return 1;if(!b.due)return -1;return a.due<b.due?-1:(a.due>b.due?1:0);});
  return list;
}
function activeFilterCount(){const f=V.f;return (f.status?1:0)+(f.cat?1:0)+(f.quad?1:0)+(f.from?1:0)+(f.to?1:0)+(f.sort!=="due"?1:0);}
function filterBar(){
  const n=activeFilterCount();
  let h='<div class="toolbar">'+QUICKS.map(q=>'<button class="filter-pill'+(V.f.quick===q.id?" on":"")+'" data-act="quick" data-v="'+q.id+'">'+esc(q.name)+'</button>').join("");
  h+='<div class="spacer"></div>';
  h+='<button class="filter-pill'+(V.adv||n?" on":"")+'" data-act="adv-toggle">'+icon("i-filter")+'Advanced'+(n?' · '+n:"")+'</button>';
  if(n)h+='<button class="filter-pill" data-act="filter-clear">'+icon("i-x")+'Clear</button>';
  h+='</div>';
  if(V.adv){
    h+='<div class="adv">'+
      field("Status",'<select class="inp" data-act="f" data-k="status"><option value="">Any status</option>'+STATUSES.map(s=>'<option value="'+s.id+'"'+(V.f.status===s.id?" selected":"")+'>'+esc(s.name)+'</option>').join("")+'</select>')+
      field("Category",catSelect('class="inp" data-act="f" data-k="cat"',V.f.cat,{any:"All categories"}))+
      field("Matrix quadrant",'<select class="inp" data-act="f" data-k="quad"><option value="">Any priority</option>'+QUADS.map(q=>'<option value="'+q.id+'"'+(V.f.quad===q.id?" selected":"")+'>'+esc(q.name)+'</option>').join("")+'<option value="none"'+(V.f.quad==="none"?" selected":"")+'>Not prioritised</option></select>')+
      field("Date from",dateField('data-act="f" data-k="from"',V.f.from,{label:"Date from",ph:"Any date"}))+
      field("Date until",dateField('data-act="f" data-k="to"',V.f.to,{label:"Date until",ph:"Any date"}))+
      field("Sort by",'<select class="inp" data-act="f" data-k="sort"><option value="due"'+(V.f.sort==="due"?" selected":"")+'>Due date</option><option value="priority"'+(V.f.sort==="priority"?" selected":"")+'>Matrix priority</option><option value="title"'+(V.f.sort==="title"?" selected":"")+'>Title A–Z</option><option value="created"'+(V.f.sort==="created"?" selected":"")+'>Recently added</option></select>')+
      '</div>';
  }
  return h;
}
const field=(l,inner)=>'<div class="field"><label>'+esc(l)+'</label>'+inner+'</div>';

/* ============ tasks: board + list ============ */
function taskCard(t){
  const c=cat(t.cat),subs=t.subtasks||[],dn=subs.filter(s=>s.d).length;
  const q=quadOf(t),Q=q?QUADS.find(x=>x.id===q):null;
  const over=isOpen(t)&&!!t.due&&t.due<TODAY(),soon=!over&&t.due&&dayDiff(t.due,TODAY())<=1;

  /* The category is a tinted pill at the top of the card, and its colour
     washes faintly in from that corner. One pill, not three: a row of filled
     pills per card turned a column into a wall of colour. The due date and
     the priority sit opposite it, the priority as a small badge wearing its
     quadrant's icon, where the coloured left edge used to be the only clue. */
  /* Once a task is finished or dropped its due date and priority no longer
     matter; what it says instead is that it is done, and when. */
  const doneWhen=d=>!d?"":d===TODAY()?" today":d===ymd(addDays(today(),-1))?" yesterday":" "+fmtDate(d);
  const state=t.status==="completed"?'<span class="tc-state done">'+icon("i-check","ic-14")+'Done'+esc(doneWhen(t.completedAt))+'</span>'
    :t.status==="dropped"?'<span class="tc-state dropped">'+icon("i-x","ic-14")+'Dropped</span>':"";
  const head='<div class="tc-head">'+
    '<span class="tc-cat">'+icon(c.icon,"ic-14")+esc(c.name)+'</span>'+
    '<span class="tc-right">'+(state?state:
      (t.due?'<span class="m-due'+(over?" over":soon?" soon":"")+'">'+esc(relDue(t.due)+(t.dueTime?" "+fmtTime(t.dueTime):""))+'</span>':"")+dlMark(t)+
      (Q?'<span class="tc-q '+Q.cls+'" title="'+esc(Q.name)+'" aria-label="'+esc(Q.name)+'">'+icon(Q.icon,"ic-14")+'</span>':""))+
    '</span></div>';

  /* What is attached to this task, counted straight off state so the card does
     not depend on helpers declared further down the file. */
  const comments=S.activity.reduce((n,a)=>n+(a.task===t.id&&a.kind==="comment"?1:0),0);
  const docs=S.docs.reduce((n,d)=>n+(d.task===t.id?1:0),0);
  const marks=[];
  const mark=(ic,n,one,many)=>'<span class="m-mark" title="'+n+' '+(n===1?one:many)+'">'+icon(ic,"ic-14")+'<span class="num">'+n+'</span></span>';
  if(subs.length)marks.push('<span class="m-mark" title="'+dn+' of '+subs.length+' subtasks done">'+icon("i-check","ic-14")+'<span class="num">'+dn+'/'+subs.length+'</span></span>');
  if(comments)marks.push(mark("i-chat",comments,"comment","comments"));
  if(docs)marks.push(mark("i-doc",docs,"document","documents"));
  if(tFiles(t).length)marks.push(mark("i-clip",tFiles(t).length,"attachment","attachments"));
  if(tLinks(t).length)marks.push(mark("i-link",tLinks(t).length,"linked task","linked tasks"));

  /* The quadrant's name is in the label too, for anyone not going by the
     badge's colour or icon. */
  const label=Q?esc(t.title)+" — "+Q.name+", "+Q.tag.toLowerCase():esc(t.title);
  return '<div class="tcard'+(t.status==="completed"?" done":t.status==="dropped"?" dropped":"")+'" style="--c:'+c.color+'" draggable="true" data-id="'+t.id+'" data-act="task" title="'+label+'" aria-label="'+label+'">'+
    head+
    '<div class="top">'+tickBtn(t)+'<span class="ttl">'+esc(t.title)+'</span></div>'+
    (marks.length?'<div class="marks">'+marks.join("")+'</div>':"")+
    (subs.length?'<div class="bar" title="'+dn+' of '+subs.length+' subtasks done"><i style="width:'+Math.round(dn/subs.length*100)+'%"></i></div>':"")+
    '</div>';
}
function viewBoard(){
  const list=filterTasks("board");
  return '<div class="task-main">'+filterBar()+'<div class="board-scroll"><div class="board">'+STATUSES.map(s=>{
    const items=list.filter(t=>t.status===s.id);
    return '<div class="col" data-col="'+s.id+'"><div class="col-head"><span class="sw" style="--s:'+s.color+'"></span><h3>'+esc(s.name)+'</h3><span class="n num">'+items.length+'</span></div>'+
      '<div class="col-list">'+items.map(taskCard).join("")+'</div>'+
      '<button class="addcard" data-act="new-task" data-status="'+s.id+'">'+icon("i-plus","ic-14")+'Add task</button></div>';}).join("")+'</div></div></div>';
}
function viewList(){
  const list=filterTasks("list");
  if(!list.length)return '<div class="task-main">'+filterBar()+'<div class="list-scroll"><div class="empty">'+icon("i-inbox")+'<p>No tasks match these filters. Try clearing them or add something new.</p></div></div></div>';
  const groups={},order=[];
  list.forEach(t=>{const k=t.due?MONS[parseD(t.due).getMonth()]+" "+parseD(t.due).getFullYear():"No date";
    if(!groups[k]){groups[k]=[];order.push(k);}groups[k].push(t);});
  const head='<div class="lrow head"><span></span><span>Task</span><span>Date</span><span>Priority</span><span>Category</span><span>Status</span><span></span></div>';
  return '<div class="task-main">'+filterBar()+'<div class="list-scroll">'+order.map(k=>'<div class="lgroup"><h3>'+esc(k)+'<span class="n num">'+groups[k].length+'</span></h3><div class="ltable">'+head+
    groups[k].map(t=>{const c=cat(t.cat),s=ST(t.status),subs=t.subtasks||[];
      return '<div class="lrow'+(t.status==="completed"?" done":"")+'" data-act="task" data-id="'+t.id+'">'+
        tickBtn(t)+
        '<span class="name">'+icon(c.icon,"ic-14")+'<b>'+esc(t.title)+'</b>'+(subs.length?'<span class="sub num">'+subs.filter(x=>x.d).length+'/'+subs.length+'</span>':"")+'</span>'+
        '<span class="sub num lr-when" style="color:'+(isOverdue(t)?"var(--danger)":"var(--muted)")+'">'+esc(t.due?fmtDate(t.due):"—")+dlMark(t)+'</span>'+
        '<span>'+(quadChip(t)||'<span class="sub">—</span>')+'</span>'+
        '<span>'+catChip(t.cat)+'</span>'+
        '<span class="status-dot" style="--s:'+s.color+'"><span class="sw"></span>'+esc(s.name)+'</span>'+
        '<button class="rowbtn" data-act="task" data-id="'+t.id+'" data-stop="1" aria-label="Edit task">'+icon("i-edit","ic-14")+'</button></div>';}).join("")+
    '</div></div>').join("")+'</div></div>';
}

/* ============ matrix ============ */
function viewMatrix(){
  const base=S.tasks.filter(t=>visibleCat(t.cat)&&matchQ(t,V.q)&&t.status!=="dropped"&&(V.f.quick==="done"?true:t.status!=="completed"||V.f.quick==="all"));
  const byDue=(a,b)=>{if(!a.due)return 1;if(!b.due)return -1;return a.due<b.due?-1:(a.due>b.due?1:0);};
  const grid='<div class="mx">'+QUADS.map(Q=>{
    const items=base.filter(t=>quadOf(t)===Q.id).sort(byDue);
    return '<section class="quad '+Q.cls+'"><div class="quad-head">'+icon(Q.icon,"ic-18")+'<div><h3>'+esc(Q.name)+'</h3><p>'+esc(Q.note)+'</p></div><span class="n num">'+items.length+'</span></div>'+
      '<div class="quad-body">'+(items.length?items.map(t=>
        '<div class="qrow'+(t.status==="completed"?" done":"")+'" data-act="task" data-id="'+t.id+'">'+tickBtn(t)+
        '<div class="t"><b>'+esc(t.title)+'</b><div class="m">'+catChip(t.cat)+'<span class="chip">'+esc(ST(t.status).name)+'</span></div></div>'+
        '<span class="chip chip-due '+(isOverdue(t)?"over":(t.due&&dayDiff(t.due,TODAY())<=1?"soon":""))+'">'+esc(t.due?fmtDate(t.due):"No date")+'</span></div>').join("")
        :'<div class="empty" style="padding:20px">'+icon("i-check")+'<p>Nothing here right now.</p></div>')+'</div></section>';}).join("")+'</div>';
  const un=base.filter(t=>!quadOf(t));
  const tray=un.length?'<div class="unsorted"><h3>Not prioritised yet</h3><p>Tick urgent, important, or both and the task moves into a quadrant.</p>'+
    un.slice(0,10).map(t=>'<div class="urow"><span class="t">'+esc(t.title)+'</span>'+
      '<span class="chip chip-due">'+esc(t.due?fmtDate(t.due):"No date")+'</span>'+
      '<span class="toggle-pair"><button class="tgl warn'+(t.urgent?" on":"")+'" data-act="mx-set" data-id="'+t.id+'" data-k="urgent">Urgent</button>'+
      '<button class="tgl'+(t.important?" on":"")+'" data-act="mx-set" data-id="'+t.id+'" data-k="important">Important</button></span></div>').join("")+'</div>':"";
  return grid+tray;
}

/* ============ routines ============ */
function viewRoutines(){
  const q=V.q.toLowerCase();
  const list=S.routines.filter(r=>visibleCat(r.cat)&&(!q||r.title.toLowerCase().indexOf(q)>-1||cat(r.cat).name.toLowerCase().indexOf(q)>-1));
  if(!list.length)return '<div class="card"><div class="empty">'+icon("i-repeat")+'<p>No routines yet. Add the things you want to happen on repeat — a stand-up, a skincare routine, a weekly review.</p><button class="btn btn-primary" data-act="new-routine">'+icon("i-plus")+'New routine</button></div></div>';
  const wkStart=startOfWeek(today());
  return '<div class="rgrid">'+list.map(r=>{
    const c=cat(r.cat),st=streak(r);
    const days='<div class="week-dots">'+[0,1,2,3,4,5,6].map(i=>{
      const d=addDays(wkStart,i),s=ymd(d),sched=routineOn(r,d),done=doneR(r,s),isT=s===TODAY();
      /* Every square takes a tick, the days off the schedule included. */
      return '<div class="wd"><small>'+DOWS[i][0]+'</small><button class="cell'+(sched?" sched":" off")+(done?" done":"")+(isT?" today":"")+'"'+
        ' data-act="routine-done" data-id="'+r.id+'" data-date="'+s+'" aria-pressed="'+done+'"'+
        ' aria-label="'+esc(r.title)+' on '+esc(fmtDate(s))+(sched?"":", not a scheduled day")+'"'+
        ' title="'+(done?"Done":sched?"Mark done":"Not scheduled, but you can still mark it done")+'" style="--c:'+c.color+'">'+icon("i-check")+'</button></div>';}).join("")+'</div>';
    return '<article class="rcard'+(r.active?"":" paused")+'" style="--c:'+c.color+'">'+
      '<div class="rtop"><span class="ravatar">'+icon(c.icon,"ic-18")+'</span>'+
      '<div style="flex:1;min-width:0"><h3>'+esc(r.title)+'</h3><div class="rsub">'+icon("i-clock","ic-14")+'<span class="num">'+esc(fmtTime(r.time))+' · '+r.dur+' min</span><span>·</span><span>'+esc(freqLabel(r))+'</span>'+
      '<span class="rbell'+(remindMins(r)===null?" off":"")+'" title="Reminder">'+icon("i-bell","ic-14")+esc(remindLabel(r))+'</span></div></div>'+
      (st>1?'<span class="streak">'+icon("i-flame","ic-14")+st+'</span>':"")+'</div>'+
      days+
      '<div style="display:flex;gap:6px;align-items:center">'+catChip(r.cat)+'<div class="spacer" style="flex:1"></div>'+
      '<button class="btn btn-sm btn-ghost" data-act="routine-edit" data-id="'+r.id+'">'+icon("i-edit","ic-14")+'Edit</button></div>'+
      '</article>';}).join("")+'</div>';
}
function freqLabel(r){
  if(r.freq==="interval")return "Every "+(r.every||2)+" days";
  const d=r.days||[];
  if(d.length===7)return "Every day";
  if(d.length===5&&[1,2,3,4,5].every(x=>d.indexOf(x)>-1))return "Weekdays";
  if(!d.length)return "No days set";
  return d.slice().sort((a,b)=>((a+6)%7)-((b+6)%7)).map(x=>DOWS[(x+6)%7]).join(", ");
}

/* ============ notes ============ */
function allTags(){const s=[];S.notes.forEach(n=>(n.tags||[]).forEach(t=>{if(s.indexOf(t)===-1)s.push(t);}));return s.sort();}
function viewNotes(){
  const q=V.q.toLowerCase();
  let list=S.notes.filter(n=>visibleCat(n.cat));
  if(V.noteTag)list=list.filter(n=>(n.tags||[]).indexOf(V.noteTag)>-1);
  if(q)list=list.filter(n=>(n.title||"").toLowerCase().indexOf(q)>-1||stripHtml(n.html).toLowerCase().indexOf(q)>-1||(n.tags||[]).join(" ").toLowerCase().indexOf(q)>-1);
  list.sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||(b.updated||0)-(a.updated||0));
  if(!V.noteId||!noteById(V.noteId))V.noteId=list.length?list[0].id:null;
  const tags=allTags();
  const side='<div class="nlist"><div class="nlist-head">'+
    '<button class="btn btn-primary btn-sm" data-act="new-note">'+icon("i-plus","ic-14")+'New note</button>'+
    (tags.length?'<div class="pickers"><button class="pick'+(V.noteTag?"":" on")+'" data-act="note-tag" data-v="">All</button>'+
      tags.map(t=>'<button class="pick'+(V.noteTag===t?" on":"")+'" data-act="note-tag" data-v="'+esc(t)+'">#'+esc(t)+'</button>').join("")+'</div>':"")+
    '</div><div class="nlist-body">'+
    (list.length?list.map(n=>{const c=cat(n.cat);
      return '<button class="nitem'+(n.id===V.noteId?" on":"")+'" data-act="note-open" data-id="'+n.id+'">'+
        '<b>'+(n.pinned?"📌 ":"")+esc(n.title||"Untitled note")+'</b>'+
        '<p>'+esc(stripHtml(n.html).slice(0,110)||"Empty note")+'</p>'+
        '<span class="nm">'+catChip(n.cat)+'<span class="date">'+esc(new Date(n.updated||Date.now()).toLocaleDateString(undefined,{day:"numeric",month:"short"}))+'</span></span></button>';}).join("")
      :'<div class="empty">'+icon("i-note")+'<p>No notes match. Start one and tag it.</p></div>')+
    '</div></div>';
  const n=noteById(V.noteId);
  if(!n)return '<div class="notes">'+side+'<div class="neditor"><div class="empty">'+icon("i-note")+'<p>Pick a note on the left, or start a new one.</p></div></div></div>';
  const tools=[["bold","B","Bold"],["italic","I","Italic"],["underline","U","Underline"]];
  const bar='<div class="rte-bar">'+tools.map(t=>'<button data-act="rte" data-cmd="'+t[0]+'" title="'+t[2]+'" style="font-family:var(--fd)">'+t[1]+'</button>').join("")+
    '<span class="rte-sep"></span>'+
    '<button data-act="rte" data-cmd="formatBlock" data-v="h2" title="Heading">H2</button>'+
    '<button data-act="rte" data-cmd="formatBlock" data-v="h3" title="Subheading">H3</button>'+
    '<button data-act="rte" data-cmd="formatBlock" data-v="p" title="Body text">¶</button>'+
    '<span class="rte-sep"></span>'+
    '<button data-act="rte" data-cmd="insertUnorderedList" title="Bulleted list">'+icon("i-list","ic-14")+'</button>'+
    '<button data-act="rte" data-cmd="insertOrderedList" title="Numbered list">1.</button>'+
    '<button data-act="rte" data-cmd="formatBlock" data-v="blockquote" title="Quote">&ldquo;</button>'+
    '<span class="rte-sep"></span>'+
    '<button data-act="rte-link" title="Add link" style="width:auto;padding:0 9px;font-size:12px;font-weight:600">Link</button>'+
    '<button data-act="rte" data-cmd="removeFormat" title="Clear formatting">'+icon("i-x","ic-14")+'</button>'+
    '<span class="spacer" style="flex:1"></span>'+
    '<button data-act="note-pin" data-id="'+n.id+'" title="Pin note" style="width:auto;padding:0 9px;font-size:12px;font-weight:600">'+(n.pinned?"Unpin":"Pin")+'</button>'+
    '<button data-act="note-delete" data-id="'+n.id+'" title="Delete note" style="color:var(--danger)">'+icon("i-trash","ic-14")+'</button></div>';
  const meta='<div class="ned-meta">'+
    catSelect('class="inp" id="noteCat" aria-label="Category"',n.cat,{cls:"note-cat"})+
    '<input class="inp" id="noteTags" style="width:auto;min-width:200px;flex:1" value="'+esc((n.tags||[]).join(", "))+'" placeholder="Tags, comma separated">'+
    '</div>';
  const acts='<div class="actions-panel"><h4>'+icon("i-check","ic-14")+'Action items <span style="color:var(--faint);font-weight:600;text-transform:none;letter-spacing:0">— each one becomes a task on your board and calendar</span></h4>'+
    (n.actions||[]).map(a=>{const t=a.taskId?taskById(a.taskId):null;const done=t?t.status==="completed":a.done;
      return '<div class="ai-row'+(done?" done":"")+'"><button class="tick'+(done?" on":"")+'" data-act="ai-done" data-nid="'+n.id+'" data-id="'+a.id+'" aria-label="Complete">'+icon("i-check")+'</button>'+
        '<span class="t">'+esc(a.t)+'</span>'+(t&&t.due?'<span class="chip chip-due">'+esc(relDue(t.due))+'</span>':"")+
        (t?'<button class="rowbtn" style="opacity:1" data-act="task" data-id="'+t.id+'" aria-label="Open task">'+icon("i-edit","ic-14")+'</button>':"")+
        '<button class="rowbtn" style="opacity:1" data-act="ai-del" data-nid="'+n.id+'" data-id="'+a.id+'" aria-label="Remove">'+icon("i-x","ic-14")+'</button></div>';}).join("")+
    '<div class="ai-add"><input class="inp" id="aiText" placeholder="Add an action item…" style="flex:1">'+dateField('id="aiDate"',TODAY(),{label:"Due",ph:"No due date",cls:"ai-date"})+''+
    '<button class="btn btn-sm" data-act="ai-add" data-nid="'+n.id+'">'+icon("i-plus","ic-14")+'Add</button></div></div>';
  return '<div class="notes">'+side+'<div class="neditor">'+
    '<div class="ned-head"><input class="ned-title" id="noteTitle" value="'+esc(n.title)+'" placeholder="Note title">'+meta+'</div>'+
    bar+'<div class="rte" id="rte" contenteditable="true" data-ph="Start writing…">'+(n.html||"")+'</div>'+acts+'</div></div>';
}

/* ============ modals ============ */
function closeModal(){el("modalRoot").innerHTML="";V.peek=null;}
function openModal(html,opt){
  const root=el("modalRoot"),open=root.querySelector(".scrim > .modal");
  const label=(html.match(/aria-label="([^"]*)"/)||[])[1];
  /* The same modal drawn again -- the categories list after an edit, the day
     popup after a tick -- is swapped in place: no pop-in replayed, the list
     left where it was scrolled, and the focus left alone. */
  if(open&&label&&open.getAttribute("aria-label")===label){
    const marks=scrollMarks(open),scrim=root.querySelector(".scrim");
    scrim.innerHTML=html;scrim.classList.add("still");
    const m=scrim.querySelector(".modal");if(m){m.classList.add("still");putScroll(m,marks);}
    return;
  }
  root.innerHTML='<div class="scrim" data-scrim="1">'+html+'</div>';
  /* Settings has no first field worth focusing: the ring that landed on its
     first select read as a fault, not a convenience. */
  if(opt&&opt.focus===false)return;
  const f=el("modalRoot").querySelector("input,textarea,select");if(f)setTimeout(()=>f.focus(),40);
}
/* Native confirm()/prompt() are blocked inside the sandboxed artifact frame,
   so destructive actions arm on the first click and fire on the second. */
function arm(btn,label){
  if(btn.dataset.armed==="1")return true;
  btn.dataset.armed="1";btn.dataset.prev=btn.innerHTML;
  btn.innerHTML=esc(label);
  btn.style.width="auto";btn.style.padding="0 9px";btn.style.fontSize="11.5px";
  btn.style.fontWeight="700";btn.style.color="var(--danger)";btn.style.background="var(--danger-soft)";
  toast("Click again to confirm");
  setTimeout(function(){
    if(btn.dataset.armed==="1"){btn.dataset.armed="";btn.innerHTML=btn.dataset.prev||"";
      btn.style.width="";btn.style.padding="";btn.style.fontSize="";btn.style.fontWeight="";btn.style.color="";btn.style.background="";}
  },3500);
  return false;
}
let savedRange=null;
function saveSel(){try{const s=window.getSelection();if(s&&s.rangeCount)savedRange=s.getRangeAt(0).cloneRange();}catch(e){}}
function restoreSel(){try{if(!savedRange)return false;const s=window.getSelection();s.removeAllRanges();s.addRange(savedRange);return true;}catch(e){return false;}}
function linkBar(host){
  if(document.getElementById("linkUrl")){el("linkUrl").focus();return;}
  host.insertAdjacentHTML("afterend",'<div class="link-bar"><input class="inp" id="linkUrl" placeholder="https://…" style="flex:1;max-width:340px">'+
    '<button class="btn btn-sm btn-primary" data-act="rte-link-apply">Add link</button>'+
    '<button class="btn btn-sm" data-act="rte-link-cancel">Cancel</button></div>');
  el("linkUrl").focus();
}
function closeLinkBar(){const b=document.querySelector(".link-bar");if(b)b.remove();}
function toast(msg){
  const n=document.createElement("div");n.className="toast";n.textContent=msg;document.body.appendChild(n);
  setTimeout(()=>n.remove(),2200);
}
/* ============ account + setup ============
   The planner is used signed in with a Google account. The first launch is a
   setup of its own, a page rather than a dialog: sign in with Google, choose
   where the planner lives -- backed up to the person's own Google Drive, or on
   this device alone -- then their name, categories and a few routines,
   Google Calendar, Obsidian, how it looks and what it tells them.

   The account is Google's: gcal.js signs in and holds the key, and access is
   asked for a piece at a time, when the step that needs it is reached. No
   other service is involved, so what someone plans only ever goes to their
   own Google account, and only if they ask for it.

   Someone who already has a planner signs in and chooses where it lives, and
   that is all: their categories and routines are already theirs. Signing out
   brings back the sign-in and nothing else; the planner stays on the device.
   The desktop app and a browser copy served from a web address both sign in
   (gAcct(), below). Only a copy with no address Google can know -- a file
   opened by double-click, the Claude artifact -- cannot, and goes through
   the same setup without the steps that need the account.

   Where setup has got to is kept in prefs.onboard, so closing the app half
   way through picks up at the same step. */
const OB={open:false,step:"signin",mode:"new",busy:false,err:"",store:"drive",found:null,rt:null};
const signedIn=()=>!!(GC.status&&GC.status.connected&&GC.status.email);
const acctParts=()=>(GC.status&&GC.status.parts)||{};
/* Where a planner kept here lives, in words: this computer, or this browser. */
const here=()=>hasDesktop()?"computer":"browser";
const hasData=()=>!!(S.tasks.length||S.routines.length||S.notes.length);
const OB_LABEL={signin:"Sign in",data:"Your data",name:"About you",cats:"Categories",routines:"Routines",
  calendar:"Google Calendar",obsidian:"Obsidian",look:"Appearance",notify:"Notifications",done:"All set"};
/* The steps skipping ahead is harmless for: nothing is lost by leaving them. */
const OB_SKIP=["routines","calendar","obsidian"];
function obSteps(){
  const g=googleReady(),d=hasDesktop();
  if(OB.mode==="again")return ["signin"];
  if(OB.mode==="returning")return ["signin"].concat(g?["data"]:[],["done"]);
  const links=(g?["calendar"]:[]).concat(d?["obsidian"]:[]);
  if(OB.mode==="restored")return ["signin","data"].concat(links,["done"]);
  return ["signin"].concat(g?["data"]:[],["name","cats","routines"],links,["look","notify","done"]);
}
function obNeeded(){
  const done=!!(S.prefs.onboard&&S.prefs.onboard.done);
  if(googleReady())return !done||!signedIn();
  /* A copy that cannot sign in (a file opened by double-click, the artifact)
     and was in use before setup existed simply carries on. */
  return !done&&!hasData()&&!S.prefs.setup;
}
function obStart(){
  const ob=S.prefs.onboard||{};
  OB.mode=ob.done?"again":(ob.mode||((hasData()||S.prefs.setup)?"returning":"new"));
  if(!googleReady()&&OB.mode!=="new"){S.prefs.onboard={done:true};save("prefs");return;}
  OB.step=obSteps().indexOf(ob.step)>-1?ob.step:"signin";
  if(OB.step==="signin"&&signedIn()&&OB.mode!=="again")OB.step=obSteps()[1];
  OB.open=true;OB.err="";obRender();
}
/* Everything the app loaded behind setup stays drawn but hidden, so the page
   appears the moment setup is done. */
function obRootEl(){
  let r=el("obRoot");
  if(!r){r=document.createElement("div");r.id="obRoot";document.body.appendChild(r);}
  return r;
}
function obGo(step){
  if(!step){obFinish();return;}
  OB.step=step;OB.err="";OB.busy=false;
  S.prefs.onboard={done:false,step:step,mode:OB.mode,made:(S.prefs.onboard&&S.prefs.onboard.made)||[]};
  save("prefs");obRender();
  const r=el("obRoot"),f=el("obName")||(r&&r.querySelector(".obx-q h1,.obx-hero h1"));
  if(f){if(f.tagName==="H1")f.setAttribute("tabindex","-1");f.focus({preventScroll:true});}
}
const obNext=()=>{const s=obSteps();return s[s.indexOf(OB.step)+1]||null;};
const obPrev=()=>{const s=obSteps();return s[s.indexOf(OB.step)-1]||null;};
function obFinish(){
  S.prefs.onboard={done:true};S.prefs.setup=true;save("prefs");
  OB.open=false;const r=el("obRoot");if(r)r.remove();
  document.body.classList.remove("ob-open");
  applyAppearance();render();remindSoon();
  if(driveOn())driveBackup();
  if(gcalOn())gcalSync();
  toast(S.prefs.name?"Welcome, "+S.prefs.name:"You're all set");
}
/* Anything that changes what setup shows while it is open redraws it here,
   as the settings do -- the same controls sit in both. */
function panels(){
  if(el("modalRoot").querySelector(".modal.settings"))settingsModal();
  if(OB.open)obRender();
}
function obRecheck(){if(OB.open&&!obNeeded()){OB.open=false;const r=el("obRoot");if(r)r.remove();document.body.classList.remove("ob-open");}}

const G_LOGO='<svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true">'+
  '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>'+
  '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>'+
  '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>'+
  '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
const obAvatar=()=>'<span class="ob-av" aria-hidden="true">'+esc(((GC.status&&(GC.status.first||GC.status.name||GC.status.email))||S.prefs.name||"?").charAt(0).toUpperCase())+'</span>';
const obWaiting=what=>'<div class="obx-wait" role="status"><span class="obx-spin" aria-hidden="true"></span><span>'+esc(what)+'</span>'+
  '<button class="btn btn-sm btn-ghost" data-act="ob-cancel">Cancel</button></div>';
const obErr=()=>OB.err?'<p class="obx-err" role="alert">'+icon("i-alert","ic-14")+esc(OB.err)+'</p>':"";

/* ---- the page ----
   Each step is a question on the left and, on the right, a live picture of
   what the answer does -- the greeting with your name in it, your categories
   circling you, your week filling in as routines are ticked, the app itself
   in the theme you are choosing. Across the top, the steps as a track you can
   click back along. Enter moves on. A step's entrance plays when the step
   changes, not when something inside it is changed, which would make every
   click look like a new page. */
function obRender(){
  if(!OB.open)return;
  document.body.classList.add("ob-open");
  const root=obRootEl(),marks=scrollMarks(root),fresh=OB.drawn!==OB.step;
  OB.drawn=OB.step;
  if(OB.step==="signin"){root.innerHTML=obSignin(fresh);putScroll(root,marks);return;}
  const steps=obSteps().filter(s=>s!=="signin"),i=steps.indexOf(OB.step),last=Math.max(1,steps.length-1);
  const top='<header class="obx-top">'+
    '<div class="obx-brand"><span class="brand-mark">'+icon("i-orbit","ic-18")+'</span><span>Everyday Orbit</span></div>'+
    '<nav class="obx-track" aria-label="Setup steps"><div class="obx-rail"><i style="width:'+(i/last*100).toFixed(1)+'%"></i></div>'+
      steps.map((s,j)=>'<button class="obx-dot'+(j<i?" done":j===i?" now":"")+'" style="left:'+(j/last*100).toFixed(1)+'%"'+
        (j<i?' data-act="ob-jump" data-v="'+s+'" title="Back to '+esc(OB_LABEL[s])+'"':' tabindex="-1"')+
        ' aria-label="'+esc(OB_LABEL[s]+(j<i?", done":j===i?", this step":""))+'"'+(j===i?' aria-current="step"':"")+'>'+
        (j<i?icon("i-check"):"")+'<span class="obx-tip">'+esc(OB_LABEL[s])+'</span></button>').join("")+
    '</nav>'+
    '<div class="obx-count"><b>'+esc(OB_LABEL[OB.step])+'</b><span class="num">'+(i+1)+' of '+steps.length+'</span></div>'+
    '</header>';
  root.innerHTML='<div class="obx'+(fresh?" enter":"")+'" data-step="'+OB.step+'">'+top+
    '<main class="obx-stage"><section class="obx-q" aria-label="'+esc(OB_LABEL[OB.step])+'">'+obStepHtml()+'</section>'+
    '<aside class="obx-show" aria-hidden="true">'+obShow()+'</aside></main>'+obFoot()+'</div>';
  putScroll(root,marks);
}
function obFoot(){
  const s=OB.step,enter='<span class="obx-hint">or press <kbd>Enter</kbd></span>';
  if(s==="done")return '<footer class="obx-foot"><span></span><div class="spacer"></div>'+enter+
    '<button class="btn btn-primary obx-go" data-act="ob-finish">Open my planner'+icon("i-chev-r","ic-14")+'</button></footer>';
  const back=obPrev()&&obPrev()!=="signin";
  const skip=OB_SKIP.indexOf(s)>-1&&!(s==="calendar"&&gcalOn())&&!(s==="obsidian"&&vaultPath());
  return '<footer class="obx-foot">'+
    (back?'<button class="btn btn-ghost" data-act="ob-back"'+(OB.busy?" disabled":"")+'>'+icon("i-chev-l","ic-14")+'Back</button>':'<span></span>')+
    '<div class="spacer"></div>'+
    (skip?'<button class="btn btn-ghost" data-act="ob-skip"'+(OB.busy?" disabled":"")+'>Skip for now</button>':"")+
    (OB.found?"":enter+'<button class="btn btn-primary obx-go" data-act="ob-next"'+(OB.busy?" disabled":"")+'>'+obNextLabel()+icon("i-chev-r","ic-14")+'</button>')+
    '</footer>';
}
function obNextLabel(){
  if(OB.step==="routines"){const n=obRt().filter(x=>x.on).length;return n?"Add "+n+" routine"+(n===1?"":"s"):"Continue";}
  if(OB.step==="data"&&OB.store==="drive"&&!acctParts().drive)return "Continue with Google Drive";
  return "Continue";
}
/* title is written by the caller, so it may carry a highlighted word */
const obHead=(eyebrow,title,lead)=>'<p class="obx-eyebrow">'+esc(eyebrow)+'</p><h1>'+title+'</h1>'+(lead?'<p class="obx-lead">'+lead+'</p>':"");
function obStepHtml(){
  switch(OB.step){
    case "data":return obData();
    case "name":return obName();
    case "cats":return obCats();
    case "routines":return obRoutines();
    case "calendar":return obCalendar();
    case "obsidian":return obObsidian();
    case "look":return obLook();
    case "notify":return obNotify();
    default:return obDone();
  }
}
function obShow(){
  switch(OB.step){
    case "data":return obShowData();
    case "name":return obShowName();
    case "cats":return obShowCats();
    case "routines":return obShowWeek();
    case "calendar":return obShowCalendar();
    case "obsidian":return obShowVault();
    case "look":return obShowApp();
    case "notify":return obShowNotify();
    default:return obShowDone();
  }
}

/* ---- sign in: the sky ----
   Three rings turning at their own pace, planets on them in the category
   colours, and the things the planner holds drifting between them. */
function obSky(){
  const cols=S.categories.map(c=>c.color).concat(CAT_COLORS);
  const ring=(n,size,dur,count,off,rev)=>{let p="";
    for(let k=0;k<count;k++)p+='<i class="obx-planet" style="--a:'+(off+k*360/count)+'deg;--c:'+cols[(n*4+k)%cols.length]+'"></i>';
    return '<div class="obx-ring'+(rev?" rev":"")+'" style="--s:'+size+'px;--d:'+dur+'s">'+p+'</div>';};
  const chip=(ic,label,x,y,d)=>'<span class="obx-float" style="left:'+x+'%;top:'+y+'%;--dl:'+d+'s">'+icon(ic,"ic-14")+label+'</span>';
  return '<div class="obx-sky" aria-hidden="true">'+ring(0,440,70,3,20)+ring(1,700,110,4,65,true)+ring(2,980,160,5,10)+
    chip("i-check","Tasks",12,24,0)+chip("i-repeat","Routines",78,18,1.2)+chip("i-calendar","Calendar",8,70,2.1)+
    chip("i-note","Notes",82,72,.6)+chip("i-timer","Focus timer",64,88,1.7)+chip("i-target","Priorities",26,90,2.6)+'</div>';
}
function obSignin(fresh){
  const g=googleReady(),web=googleWeb();
  const again=OB.mode==="again";
  let act;
  /* Nobody using the planner is ever asked for keys. A copy that cannot
     sign in says so in a sentence and carries on without it. */
  if(!g)act='<p class="obx-note">'+icon("i-laptop","ic-14")+'<span>'+esc(noGoogleWhy())+' Your planner will be kept in this '+here()+'.</span></p>'+
    '<button class="btn btn-primary obx-wide" data-act="ob-local">Continue'+icon("i-chev-r","ic-14")+'</button>';
  else if(OB.busy)act=obWaiting(web?"Finish signing in in Google's window.":"Finish signing in in your browser.");
  else act='<button class="obx-google" data-act="ob-google">'+G_LOGO+'<span>Continue with Google</span></button>';
  return '<div class="obx-first'+(fresh?" enter":"")+'">'+obSky()+
    '<div class="obx-hero">'+
      '<span class="brand-mark obx-mark">'+icon("i-orbit","ic-18")+'</span>'+
      '<h1>'+(again?"Welcome back"+(S.prefs.name?", <em>"+esc(S.prefs.name)+"</em>":""):"Everything you plan,<br>in <em>one orbit</em>.")+'</h1>'+
      '<p class="obx-lead">'+(again?"Sign in with your Google account to open your planner."
        :"Tasks, routines, your calendar and your notes, sharing one set of categories — so something you write once shows up wherever you look for it.")+'</p>'+
      act+obErr()+
      (g?'<p class="obx-fine">Your Google account is how you sign in. What you plan stays on this '+(web?"device":"computer")+' unless you choose to back it up to your own Google Drive, and it goes nowhere else.</p>':"")+
    '</div></div>';
}
async function obSignIn(){
  const o=gAcct();if(!o||OB.busy)return;
  OB.busy=true;OB.err="";obRender();
  let r;
  try{r=await o.gcalConnect({want:["account"],clientId:GC.draft.id,clientSecret:GC.draft.secret});}
  catch(e){r={ok:false,error:"Could not start the sign-in."};}
  OB.busy=false;
  if(!(r&&r.ok)){if(!r||r.error!=="Cancelled.")OB.err=(r&&r.error)||"Could not sign in.";obRender();return;}
  GC.draft={id:"",secret:""};
  try{GC.status=await o.gcalStatus();}catch(e){}
  if(!S.prefs.name&&GC.status&&GC.status.first){S.prefs.name=GC.status.first;save("prefs");}
  if(OB.mode==="again"){obFinish();return;}
  obGo(obNext());
}
/* Asks Google for one more part of the account -- Calendar or Drive -- from
   setup or from Settings. Resolves true once it is granted. */
async function googleAsk(part){
  const o=gAcct();if(!o)return false;
  let r;
  try{r=await o.gcalConnect({want:[part]});}catch(e){r={ok:false,error:"Could not start the sign-in."};}
  try{GC.status=await o.gcalStatus();}catch(e){}
  if(r&&r.ok&&acctParts()[part])return true;
  if(r&&r.ok)throw new Error("Google did not grant it. Tick the box for "+(part==="drive"?"Google Drive":"Google Calendar")+" on Google's page and try again.");
  if(r&&r.error==="Cancelled.")return false;
  throw new Error((r&&r.error)||"Could not reach Google.");
}


/* ---- where the planner lives ---- */
function obData(){
  if(OB.found){
    const local=hasData();
    return obHead("Your data","Your planner is <em>already</em> in your Drive",
        "Sign in anywhere and it comes back. Bring it into this "+here()+", or begin again.")+
      '<div class="obx-cards">'+
        obCard("ob-restore","","i-download",local?"Use the one in Drive":"Restore it here",
          local?"Replaces what is in this "+here()+" with the backup.":"Tasks, routines, notes, categories and settings, all of it.",false,"")+
        obCard("ob-fresh","",local?"i-laptop":"i-plus",local?"Keep this "+here()+"'s":"Start fresh",
          local?"Backs this "+here()+"'s planner up over the one in Drive.":"An empty planner. Its first backup replaces the one in Drive.",false,"")+
      '</div>'+(OB.busy?obWaiting("Working…"):"")+obErr();
  }
  return obHead("Your data","Where should your planner <em>live</em>?",
      "Either way it works offline and saves as you go. The difference is whether a copy follows you.")+
    '<div class="obx-cards">'+
      obCard("ob-store","drive","i-cloud","Back up to Google Drive","A copy goes to your own Drive after every change. Sign in anywhere else and it all comes back.",OB.store==="drive","Recommended")+
      obCard("ob-store","local","i-laptop","Only on this device","Nothing leaves this "+here()+". Save a backup file by hand from Settings, any time.",OB.store==="local","")+
    '</div>'+
    (OB.busy?obWaiting(acctParts().drive?"Looking for an earlier backup…":"Finish in your browser: allow access to Google Drive."):"")+obErr()+
    '<p class="obx-fine">Everyday Orbit sees only the one file it makes in your Drive, never the rest. Moving from a backup file? <button class="linkish" data-act="import">Restore a backup file</button></p>';
}
/* A big choice: an illustration, a title, a line on what it means, and a
   tick that pops in when it is the one chosen. */
function obCard(act,v,ic,title,body,on,tag){
  return '<button class="obx-card'+(on?" on":"")+'" data-act="'+act+'"'+(v?' data-v="'+v+'" aria-pressed="'+on+'"':"")+'>'+
    '<span class="obx-card-art">'+icon(ic)+'</span>'+(tag?'<em class="obx-tag">'+esc(tag)+'</em>':"")+
    '<span class="obx-card-tick">'+icon("i-check")+'</span>'+
    '<b>'+esc(title)+'</b><span>'+esc(body)+'</span></button>';
}
function obShowData(){
  if(OB.found){
    const f=OB.found,c=f.counts,when=f.at?new Date(f.at).toLocaleString(undefined,{day:"numeric",month:"long",hour:"numeric",minute:"2-digit"}):"";
    return '<div class="obx-panel obx-found"><div class="obx-found-h">'+icon("i-cloud")+'<span><b>Everyday Orbit backup</b><small>'+esc(when)+'</small></span></div>'+
      '<div class="obx-stats">'+[[c.tasks,"tasks"],[c.routines,"routines"],[c.notes,"notes"]].map(x=>'<div><b class="num">'+x[0]+'</b><span>'+x[1]+'</span></div>').join("")+'</div></div>';
  }
  const drive=OB.store==="drive";
  return '<div class="obx-panel obx-sync'+(drive?" on":"")+'">'+
    '<div class="obx-node">'+icon("i-laptop")+'<b>This '+here()+'</b><small>Always saved here</small></div>'+
    '<div class="obx-wire"><i></i><i></i><i></i></div>'+
    '<div class="obx-node far">'+icon("i-cloud")+'<b>Google Drive</b><small>'+(drive?"A copy after every change":"Not used")+'</small></div>'+
    '</div>';
}
async function obDataNext(){
  if(OB.store==="local"){S.prefs.storage="local";save("prefs");obGo(obNext());return;}
  OB.busy=true;OB.err="";obRender();
  try{
    if(!acctParts().drive&&!(await googleAsk("drive"))){OB.busy=false;obRender();return;}
    S.prefs.storage="drive";save("prefs");
    const f=await driveFind();
    if(f){
      const d=await driveRead(f.id),data=d&&(d.data||d);
      if(data&&Array.isArray(data.tasks)){
        OB.found={id:f.id,at:d.exported||f.modifiedTime,data:data,
          counts:{tasks:data.tasks.length,routines:(data.routines||[]).length,notes:(data.notes||[]).length}};
        OB.busy=false;obRender();return;
      }
      /* There is a backup and it did not come down. Carrying on would write
         this empty planner over it. */
      throw new Error("Your backup is in Google Drive but could not be opened just now. Try again, or keep this planner on this "+here()+" for now.");
    }
    await driveBackup();
    obGo(obNext());
  }catch(e){OB.busy=false;OB.err=e.message||"Could not reach Google Drive.";obRender();}
}


/* ---- about you ---- */
function obName(){
  return obHead("About you","What should we <em>call you</em>?","It goes in the greeting on your dashboard, and nowhere else.")+
    '<label class="obx-big"><span>I’m</span><input id="obName" autocomplete="given-name" maxlength="40" placeholder="your first name" value="'+esc(S.prefs.name||"")+'"></label>';
}
function obShowName(){
  const n=S.prefs.name||"",d=today();
  const date=d.toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long"});
  return '<div class="obx-panel obx-hi">'+
    '<p class="obx-hi-date">'+esc(date)+'</p>'+
    '<h2 id="obxHi">'+esc(dashGreeting()+(n?", "+n:""))+'</h2>'+
    '<p class="obx-hi-sub">Here is your day, all in one place.</p>'+
    '<div class="obx-hi-row"><div class="obx-ring-mini"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15"/><circle class="arc" cx="18" cy="18" r="15" pathLength="100" stroke-dasharray="60 100"/></svg><b class="num">3/5</b></div>'+
      '<div class="obx-strip">'+S.categories.slice(0,4).map((c,k)=>'<i style="--c:'+c.color+';left:'+(8+k*22)+'%;width:'+(10+(k%2)*6)+'%"></i>').join("")+'<em style="left:58%"></em></div></div>'+
    '</div>';
}

/* ---- categories ---- */
function obCats(){
  return obHead("Categories","Make the categories <em>yours</em>",
      "Everything you plan wears one. Rename them, pick a colour, drop what you will not use.")+
    '<div class="obx-cats">'+S.categories.map(c=>{const open=OB.pal===c.id;
      return '<div class="obx-cat'+(open?" open":"")+'" style="--c:'+c.color+'">'+
        '<button class="obx-swatch" data-act="ob-cat-pal" data-id="'+c.id+'" aria-expanded="'+open+'" aria-label="Colour of '+esc(c.name)+'"></button>'+
        '<input class="obx-cat-name" data-act="ob-cat-name" data-id="'+c.id+'" value="'+esc(c.name)+'" size="'+Math.max(4,c.name.length)+'" maxlength="30" aria-label="Category name">'+
        (S.categories.length>1?'<button class="obx-x" data-act="ob-cat-del" data-id="'+c.id+'" aria-label="Remove '+esc(c.name)+'">'+icon("i-x","ic-14")+'</button>':"")+
        (open?'<div class="obx-pal" role="group" aria-label="Colours">'+CAT_COLORS.map(x=>'<button class="'+(x===c.color?"on":"")+'" style="--c:'+x+'" data-act="ob-cat-swatch" data-id="'+c.id+'" data-v="'+x+'" aria-label="'+x+'"></button>').join("")+'</div>':"")+
        '</div>';}).join("")+
      '<button class="obx-cat obx-cat-add" data-act="ob-cat-add">'+icon("i-plus","ic-14")+'Add</button></div>';
}
/* Your categories as planets round you: the page's name, made literal. */
function obShowCats(){
  const cs=S.categories,n=cs.length;
  return '<div class="obx-orbit">'+
    '<div class="obx-orbit-ring r1"></div><div class="obx-orbit-ring r2"></div>'+
    '<div class="obx-core">'+obAvatar()+'<span>'+esc(S.prefs.name||"You")+'</span></div>'+
    cs.map((c,k)=>{const outer=n>6&&k%2===1,r=outer?46:33,a=(k/n)*Math.PI*2-Math.PI/2;
      return '<div class="obx-moon" data-planet="'+c.id+'" style="--c:'+c.color+';left:'+(50+r*Math.cos(a)).toFixed(1)+'%;top:'+(50+r*Math.sin(a)).toFixed(1)+'%;--dl:'+(k*60)+'ms">'+
        '<i>'+icon(c.icon,"ic-14")+'</i><span>'+esc(c.name)+'</span></div>';}).join("")+
    '</div>';
}

/* ---- starter routines ---- */
const OB_RT=[
  {k:"standup",title:"Morning stand-up",cat:"office",days:[1,2,3,4,5],time:"09:30",dur:15,ic:"i-coffee"},
  {k:"deep",title:"Deep work block",cat:"office",days:[1,2,3,4,5],time:"10:00",dur:90,ic:"i-bolt"},
  {k:"workout",title:"Workout",cat:"goals",days:[1,3,5],time:"07:00",dur:45,ic:"i-dumbbell"},
  {k:"walk",title:"Evening walk",cat:"goals",days:[0,1,2,3,4,5,6],time:"18:30",dur:30,ic:"i-sun"},
  {k:"read",title:"Read before bed",cat:"personal",days:[0,1,2,3,4,5,6],time:"21:30",dur:20,ic:"i-book"},
  {k:"review",title:"Weekly review",cat:"goals",days:[5],time:"16:00",dur:45,ic:"i-target"},
  {k:"plants",title:"Water the plants",cat:"home",days:[1,4],time:"08:00",dur:10,ic:"i-leaf"}];
function obRt(){
  if(!OB.rt)OB.rt=OB_RT.map(x=>Object.assign({on:false},x));
  return OB.rt;
}
const obRtCat=x=>S.categories.some(c=>c.id===x.cat)?x.cat:S.categories[0].id;
function obRoutines(){
  return obHead("Routines","What already <em>repeats</em> in your week?",
      "Tap the ones you do and set their time. They land on your calendar and remind you before they start.")+
    '<div class="obx-rts">'+obRt().map(x=>{const c=cat(obRtCat(x));
      return '<div class="obx-rt'+(x.on?" on":"")+(OB.pop===x.k?" pop":"")+'" style="--c:'+c.color+'">'+
        '<label class="obx-rt-hit"><input type="checkbox" class="obx-sr" data-act="ob-rt" data-k="'+x.k+'"'+(x.on?" checked":"")+'>'+
          '<span class="obx-rt-ic">'+icon(x.ic,"ic-18 obx-rt-own")+icon("i-check","ic-18 obx-rt-ok")+'</span>'+
          '<span class="obx-rt-txt"><b>'+esc(x.title)+'</b><small>'+esc(freqLabel({freq:"weekly",days:x.days}))+' · '+esc(fmtMins(x.dur))+'</small></span></label>'+
        '<div class="obx-rt-when">'+timeField('data-act="ob-rt-time" data-k="'+x.k+'"',x.time,{sm:1,req:1,label:x.title+" time",cls:"obx-rt-time"})+'</div>'+
        '</div>';}).join("")+'</div>';
}
/* The week filling in: one row per routine ticked, a dot on each day it is due. */
function obShowWeek(){
  const on=obRt().filter(x=>x.on),order=[1,2,3,4,5,6,0];
  const checks=on.reduce((n,x)=>n+x.days.length,0);
  return '<div class="obx-panel obx-week">'+
    '<div class="obx-week-h"><b>Your week</b><span class="num">'+(on.length?on.length+" routine"+(on.length===1?"":"s")+" · "+checks+" check-ins":"Nothing yet")+'</span></div>'+
    '<div class="obx-week-grid"><span></span>'+DOWS.map(d=>'<span class="obx-wd">'+d[0]+'</span>').join("")+
      (on.length?on.map((x,k)=>{const c=cat(obRtCat(x));
        return '<span class="obx-wk-name" style="--c:'+c.color+'"><i></i>'+esc(x.title)+'<small class="num">'+esc(fmtTime(x.time))+'</small></span>'+
          order.map((d,j)=>'<span class="obx-cell'+(x.days.indexOf(d)>-1?" on":"")+(OB.pop===x.k?" pop":"")+'" style="--c:'+c.color+';--dl:'+(j*35)+'ms"></span>').join("");}).join("")
      :'<p class="obx-week-empty">Tap a routine on the left and watch your week fill in.</p>')+
    '</div></div>';
}
/* Going back and forth must not make them twice: the ones setup made are
   remembered, and replaced rather than added to. */
function obRtCommit(){
  const made=(S.prefs.onboard&&S.prefs.onboard.made)||[];
  S.routines=S.routines.filter(r=>made.indexOf(r.id)<0);
  const ids=[];
  obRt().filter(x=>x.on).forEach(x=>{const id=uid("r");ids.push(id);
    S.routines.push({id:id,title:x.title,cat:obRtCat(x),freq:"weekly",days:x.days.slice(),every:2,time:x.time,dur:x.dur,start:TODAY(),end:"",active:true,note:""});});
  save("routines");
  S.prefs.onboard=Object.assign({},S.prefs.onboard||{},{made:ids});save("prefs");
}

/* ---- Google Calendar ---- */
function obCalendar(){
  const on=gcalOn(),g=gcalPrefs();
  const tg=(k,v,l)=>'<label class="switch"><input type="checkbox" data-act="set-pref" data-k="'+k+'"'+(v?" checked":"")+'><span></span><i>'+esc(l)+'</i></label>';
  return obHead("Google Calendar","Bring your <em>Google Calendar</em> in",
      "Your events appear beside everything else, and your tasks and routines go the other way — so your phone knows about them too.")+
    (on?'<p class="obx-ok">'+icon("i-check","ic-14")+'Connected as <b>'+esc(GC.status.email)+'</b></p>'+
      '<div class="obx-stack">'+tg("gcal.pushTasks",g.pushTasks,"Put tasks that have a date into Google Calendar")+
        tg("gcal.pushRoutines",g.pushRoutines,"Put routines into Google Calendar")+'</div>'
    :OB.busy?obWaiting("Finish in your browser: allow access to Google Calendar.")
    :'<button class="btn btn-primary obx-connect" data-act="ob-cal">'+icon("i-calendar","ic-14")+'Connect Google Calendar</button>')+obErr()+
    '<p class="obx-fine">It uses the Google account you signed in with. Change what syncs, or disconnect, from Settings.</p>';
}
function obShowCalendar(){
  const on=gcalOn(),c=S.categories;
  const row=(dir,title,when,col,from)=>'<div class="obx-flow '+dir+'" style="--c:'+col+'"><i></i><b>'+esc(title)+'</b><small class="num">'+esc(when)+'</small><em>'+icon(from?"i-chev-l":"i-chev-r","ic-14")+'</em></div>';
  return '<div class="obx-panel obx-cal'+(on?" on":"")+'">'+
    '<div class="obx-pair"><span class="obx-tile brand-mark">'+icon("i-orbit","ic-18")+'</span>'+
      '<span class="obx-beam"><i></i><i></i></span>'+
      '<span class="obx-tile gcal"><b class="num">'+today().getDate()+'</b><small>'+esc(MONS[today().getMonth()])+'</small></span></div>'+
    '<div class="obx-flows">'+
      row("out","Deep work block","10am",(c[0]||{}).color||CAT_COLORS[0],false)+
      row("in","Team sync","2pm","var(--blue)",true)+
      row("out","Evening walk","6:30pm",(c[4]||c[1]||{}).color||CAT_COLORS[4],false)+
    '</div></div>';
}

/* ---- Obsidian ---- */
function obObsidian(){
  const v=vaultPath();
  return obHead("Obsidian","Keep your documents in <em>Obsidian</em>",
      "Documents you write on a task are saved into your vault as ordinary Markdown, and edits you make in Obsidian come back.")+
    (v?'<p class="obx-ok">'+icon("i-check","ic-14")+'Syncing with <b>'+esc(v)+'/Everyday Orbit</b></p>'+
      '<button class="btn btn-sm" data-act="vault-pick">'+icon("i-folder","ic-14")+'Choose another vault</button>'
    :'<button class="btn btn-primary obx-connect" data-act="vault-pick">'+icon("i-folder","ic-14")+'Choose your vault folder</button>')+
    '<p class="obx-fine">Not an Obsidian person? Skip it: documents stay in the planner either way.</p>';
}
function obShowVault(){
  const v=vaultPath(),docs=["Project brief","Meeting notes","Reading list"];
  return '<div class="obx-panel obx-vault'+(v?" on":"")+'">'+
    '<div class="obx-docs">'+docs.map((d,k)=>'<div class="obx-doc" style="--k:'+k+'"><b># '+esc(d)+'</b><i></i><i></i><i class="short"></i><small>'+esc(d.toLowerCase().replace(/ /g,"-"))+'.md</small></div>').join("")+'</div>'+
    '<div class="obx-folder">'+icon("i-folder")+'<span><b>'+(v?esc(v.split(/[\\/]/).pop()):"Your vault")+'</b><small>/ Everyday Orbit</small></span></div>'+
    '</div>';
}

/* ---- appearance ---- */
function obLook(){
  const cur=S.prefs.theme||"system";
  const card=(v,label)=>'<button class="obx-theme'+(cur===v?" on":"")+'" data-act="set-theme" data-v="'+v+'" aria-pressed="'+(cur===v)+'">'+
    '<span class="obx-thumb '+v+'"><i></i><i></i><i></i></span><b>'+label+'</b></button>';
  return obHead("Appearance","Make it look like <em>yours</em>",
      "Light, dark, or following Windows as it switches at dusk — and an accent for the buttons and highlights. Every choice keeps the text readable.")+
    '<div class="obx-themes">'+card("light","Light")+card("dark","Dark")+card("system","System")+'</div>'+
    '<div class="obx-set"><div class="obx-flabel">Accent colour</div>'+accentPickHtml()+'</div>';
}
/* The app in miniature, drawn from the real tokens, so it changes the moment
   the theme or accent does. */
function obShowApp(){
  const c=S.categories,n=S.prefs.name||"";
  const card=(cc,title,done)=>'<div class="obx-mcard'+(done?" done":"")+'" style="--c:'+cc.color+'"><span class="obx-mpill">'+esc(cc.name)+'</span>'+
    '<span class="obx-mline"><i class="obx-mtick">'+(done?icon("i-check"):"")+'</i>'+esc(title)+'</span></div>';
  return '<div class="obx-app">'+
    '<div class="obx-app-rail"><span class="brand-mark">'+icon("i-orbit","ic-14")+'</span>'+
      ["Dashboard","Calendar","Tasks","Routines"].map((x,k)=>'<i class="'+(k===0?"on":"")+'"><em></em>'+x+'</i>').join("")+'</div>'+
    '<div class="obx-app-main"><div class="obx-app-top"><b>'+esc(dashGreeting()+(n?", "+n:""))+'</b><span class="obx-app-btn">'+icon("i-plus","ic-14")+'New task</span></div>'+
      card(c[0]||{color:CAT_COLORS[0],name:"Office"},"Draft the project brief",false)+
      card(c[3]||c[1]||{color:CAT_COLORS[3],name:"Personal"},"Book the dentist",true)+
      '<div class="obx-app-row"><span class="obx-app-switch"></span>Reminders on<span class="obx-app-chip">Today</span></div>'+
    '</div></div>';
}

/* ---- notifications ---- */
function obNotify(){
  const rp=remindPrefs();
  const tg=(k,v,l)=>'<label class="switch"><input type="checkbox" data-act="set-pref" data-k="remind.'+k+'"'+(v?" checked":"")+'><span></span><i>'+esc(l)+'</i></label>';
  const tin=(k,v,l)=>timeField('data-act="set-pref" data-k="remind.'+k+'"',v,{sm:1,cls:"inp-time",label:l,ph:"Pick a time",req:k==="overdueAt"});
  const web=!hasDesktop(),canWeb=typeof Notification!=="undefined";
  const opt=(ic,body)=>'<div class="obx-opt">'+'<span class="obx-opt-ic">'+icon(ic,"ic-14")+'</span><div>'+body+'</div></div>';
  return obHead("Notifications","A nudge at the <em>right</em> moment",
      "Before a routine or a task starts, one daily count of anything overdue — and quiet hours when nothing gets through.")+
    '<div class="obx-opts">'+
      opt("i-bell",tg("on",rp.on,"Remind me before things start")+
        '<p class="obx-fine">30 minutes before, unless you choose otherwise on the task or routine.'+(web?" In a browser, only while the tab is open.":" Even with the window closed.")+'</p>'+
        (web&&canWeb&&Notification.permission!=="granted"?'<button class="btn btn-sm" data-act="remind-allow">'+icon("i-bell","ic-14")+'Allow notifications</button>':""))+
      opt("i-alert",'<div class="obx-inline">'+tg("overdue",rp.overdue,"A daily count of overdue tasks, at")+tin("overdueAt",rp.overdueAt,"Time of the overdue count")+'</div>')+
      opt("i-moon",'<div class="obx-inline">'+tg("quiet",rp.quiet,"Quiet hours")+
        (rp.quiet?tin("quietFrom",rp.quietFrom,"Quiet hours start")+'<span class="set-to">to</span>'+tin("quietTo",rp.quietTo,"Quiet hours end"):"")+'</div>')+
    '</div>';
}
/* A reminder as it will arrive, and the whole day as a clock: quiet hours the
   shaded arc, the overdue count a marker on the rim. */
function obShowNotify(){
  const rp=remindPrefs(),R=78,C=2*Math.PI*R,frac=hm=>hm2m(hm)/1440;
  const first=obRt().find(x=>x.on)||{title:"Morning stand-up",time:"09:30"};
  let arc="";
  if(rp.quiet&&rp.quietFrom&&rp.quietTo){
    /* A dash one circumference apart from the next wraps past midnight by
       itself: quiet hours from 10pm to 7am are one arc over the top. */
    const a=frac(rp.quietFrom),len=((frac(rp.quietTo)-a)+1)%1||1;
    arc='<circle class="quiet" cx="100" cy="100" r="'+R+'" stroke-dasharray="'+(len*C).toFixed(1)+' '+(C-len*C).toFixed(1)+'" stroke-dashoffset="'+(-a*C).toFixed(1)+'" transform="rotate(-90 100 100)"/>';
  }
  const at=frac(rp.overdueAt||"12:00")*Math.PI*2-Math.PI/2,mx=100+R*Math.cos(at),my=100+R*Math.sin(at);
  let ticks="";for(let h=0;h<24;h++){const t=h/24*Math.PI*2-Math.PI/2,r1=h%6?R-5:R-9;
    ticks+='<line x1="'+(100+r1*Math.cos(t)).toFixed(1)+'" y1="'+(100+r1*Math.sin(t)).toFixed(1)+'" x2="'+(100+(R-1)*Math.cos(t)).toFixed(1)+'" y2="'+(100+(R-1)*Math.sin(t)).toFixed(1)+'"/>';}
  const n=new Date(),nowA=(n.getHours()*60+n.getMinutes())/1440*Math.PI*2-Math.PI/2;
  return '<div class="obx-toast'+(rp.on?"":" off")+'"><span class="brand-mark">'+icon("i-orbit","ic-14")+'</span>'+
      '<div><b>'+esc(first.title)+'</b><small>'+(rp.on?"Starts in 30 minutes · "+esc(fmtTime(first.time)):"Reminders are off")+'</small></div></div>'+
    '<div class="obx-clock"><svg viewBox="0 0 200 200">'+
      '<circle class="rim" cx="100" cy="100" r="'+R+'"/>'+arc+'<g class="ticks">'+ticks+'</g>'+
      '<line class="hand" x1="100" y1="100" x2="'+(100+(R-18)*Math.cos(nowA)).toFixed(1)+'" y2="'+(100+(R-18)*Math.sin(nowA)).toFixed(1)+'"/><circle class="hub" cx="100" cy="100" r="3.5"/>'+
      (rp.overdue?'<circle class="mark" cx="'+mx.toFixed(1)+'" cy="'+my.toFixed(1)+'" r="6"/>':"")+
      '<text x="100" y="14">12am</text><text x="190" y="104">6am</text><text x="100" y="197">12pm</text><text x="10" y="104">6pm</text>'+
      '</svg><div class="obx-clock-key">'+
        (rp.quiet&&rp.quietFrom&&rp.quietTo?'<span><i class="k-quiet"></i>Quiet '+esc(fmtTime(rp.quietFrom))+'–'+esc(fmtTime(rp.quietTo))+'</span>':'<span><i class="k-none"></i>No quiet hours</span>')+
        (rp.overdue?'<span><i class="k-mark"></i>Overdue count at '+esc(fmtTime(rp.overdueAt||"12:00"))+'</span>':"")+
      '</div></div>';
}

/* ---- done ---- */
function obDone(){
  const g=googleReady(),d=hasDesktop(),rts=((S.prefs.onboard&&S.prefs.onboard.made)||[]).length;
  const item=(ok,ic,title,sub)=>'<div class="obx-sum'+(ok?" ok":"")+'"><span class="obx-sum-ic">'+icon(ok?ic:"i-minus","ic-14")+'</span><span><b>'+title+'</b><small>'+sub+'</small></span></div>';
  return obHead("All set",S.prefs.name?"You’re all set, <em>"+esc(S.prefs.name)+"</em>":"You’re <em>all set</em>",
      "Here is your planner. Every one of these can be changed later in Settings.")+
    '<div class="obx-sums">'+
      (g?item(signedIn(),"i-user","Signed in",esc((GC.status&&GC.status.email)||"")):"")+
      item(true,driveOn()?"i-cloud":"i-laptop",driveOn()?"Backed up to Google Drive":"Saved in this "+here(),
        driveOn()?"After every change":"As you go")+
      (OB.mode==="new"?item(true,"i-tag",S.categories.length+" categories",rts?rts+" routine"+(rts===1?"":"s")+" to start with":"Ready for your first task"):"")+
      (g?item(gcalOn(),"i-calendar",gcalOn()?"Google Calendar connected":"Google Calendar",gcalOn()?"Syncing both ways":"Not connected — any time from Settings"):"")+
      (d?item(!!vaultPath(),"i-folder",vaultPath()?"Obsidian vault linked":"Obsidian",vaultPath()?esc(vaultPath()):"Not linked — any time from Settings"):"")+
    '</div>';
}
/* The finish: you at the centre, what you set up in orbit round you, lit
   when it is on, and a burst of your colours as it opens. */
function obShowDone(){
  const g=googleReady(),d=hasDesktop(),rts=((S.prefs.onboard&&S.prefs.onboard.made)||[]).length;
  const sats=[[true,"i-tag",S.categories.length+" categories"]];
  if(rts)sats.push([true,"i-repeat",rts+" routine"+(rts===1?"":"s")]);
  if(g){sats.push([driveOn(),"i-cloud","Drive"]);sats.push([gcalOn(),"i-calendar","Calendar"]);}
  if(d)sats.push([!!vaultPath(),"i-folder","Obsidian"]);
  sats.push([true,"i-bell","Reminders"]);
  const cols=S.categories.map(c=>c.color);
  let burst="";for(let k=0;k<18;k++){const a=k/18*Math.PI*2;
    burst+='<i style="--c:'+cols[k%cols.length]+';--x:'+(Math.cos(a)*(120+(k%3)*40)).toFixed(0)+'px;--y:'+(Math.sin(a)*(120+(k%3)*40)).toFixed(0)+'px;--dl:'+(k%5)*40+'ms"></i>';}
  return '<div class="obx-orbit done">'+
    '<div class="obx-burst">'+burst+'</div>'+
    '<div class="obx-orbit-ring r1 turn"></div><div class="obx-orbit-ring r2 turn rev"></div>'+
    '<div class="obx-core big">'+obAvatar()+'<span>'+esc(S.prefs.name||"You")+'</span></div>'+
    sats.map((s,k)=>{const a=(k/sats.length)*Math.PI*2-Math.PI/2,r=k%2?44:36;
      return '<div class="obx-moon sat'+(s[0]?" lit":"")+'" style="left:'+(50+r*Math.cos(a)).toFixed(1)+'%;top:'+(50+r*Math.sin(a)).toFixed(1)+'%;--dl:'+(200+k*90)+'ms">'+
        '<i>'+icon(s[1],"ic-14")+'</i><span>'+esc(s[2])+'</span></div>';}).join("")+
    '</div>';
}

/* ---- Settings ▸ Account ---- */
function accountPane(sec,field,toggle){
  const p=S.prefs;
  const nameIn='<input class="inp" data-act="set-pref" data-k="name" maxlength="40" value="'+esc(p.name||"")+'" placeholder="Your first name">';
  if(!googleReady())return sec("You",field("Your name",nameIn,"Used in the greeting on your dashboard."))+
    sec("Google account",field("",'<span class="mnone">'+esc(noGoogleWhy())+'</span>',
      "Your planner is kept in this "+here()+". Back it up from Your data."));
  const st=GC.status||{},drive=p.storage==="drive"&&acctParts().drive;
  const last=p.drive&&p.drive.last?"Last backed up "+relTime(p.drive.last):"Not backed up yet";
  return sec("Google account",field("",
      '<div class="acct">'+obAvatar()+'<span class="acct-who"><b>'+esc(st.name||st.email||"")+'</b>'+esc(st.name?st.email:"")+'</span>'+
      '<button class="btn btn-sm btn-danger" data-act="acct-signout">Sign out</button></div>',
      "Signing out keeps your planner in this "+here()+"; you sign in again to open it."))+
    sec("You",field("Your name",nameIn,"Used in the greeting on your dashboard."))+
    sec("Google Drive backup",field("",
      '<label class="switch"><input type="checkbox" data-act="drive-toggle"'+(drive?" checked":"")+'><span></span><i>Back up to Google Drive</i></label>'+
      (drive?'<div class="set-actions" style="margin-top:12px"><button class="btn btn-sm" data-act="drive-now"'+(DB.busy?" disabled":"")+'>'+icon("i-upload","ic-14")+(DB.busy?"Backing up…":"Back up now")+'</button>'+
        '<button class="btn btn-sm" data-act="drive-restore">'+icon("i-download","ic-14")+'Restore from Drive</button></div>':""),
      (drive?esc(last)+". A copy goes into “"+esc(DRIVE_FILE)+"” in your Drive after every change.":"Your planner is kept in this "+here()+" only.")+
      (DB.err?'<br><span class="set-err-inline">'+esc(DB.err)+'</span>':"")));
}

/* ============ appearance ============ */
/* Theme and accent live on the root element, so a change is one attribute and
   the whole app follows. "system" sets nothing and lets the media query
   decide, which is the only way to track the OS switching at dusk. */
/* An accent is one colour. The three shades the app runs on are worked out
   from it, which is what lets the accent be any colour at all rather than one
   of a fixed six -- a stylesheet cannot hold a rule for a colour nobody has
   picked yet. The presets are just colours that happen to have names. */
const ACCENTS=[
  {id:"green",   name:"Green",    hex:"#3F7D5C"},
  {id:"teal",    name:"Teal",     hex:"#2F7D7A"},
  {id:"blue",    name:"Blue",     hex:"#3A6DA6"},
  {id:"indigo",  name:"Indigo",   hex:"#4C5FB5"},
  {id:"violet",  name:"Violet",   hex:"#6B5AC4"},
  {id:"plum",    name:"Plum",     hex:"#8B4F9E"},
  {id:"rose",    name:"Rose",     hex:"#C0517A"},
  {id:"red",     name:"Red",      hex:"#BC4B45"},
  {id:"amber",   name:"Amber",    hex:"#B5791C"},
  {id:"olive",   name:"Olive",    hex:"#6D7A2E"},
  {id:"slate",   name:"Slate",    hex:"#54666B"}];

/* ---- colour arithmetic, only ever used to build an accent ---- */
function hex2rgb(h){h=String(h||"").replace("#","");
  if(h.length===3)h=h.split("").map(c=>c+c).join("");
  if(!/^[0-9a-f]{6}$/i.test(h))return [63,125,92];
  return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));}
const rgb2hex=r=>"#"+r.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0")).join("");
function rgb2hsl(c){const r=c[0]/255,g=c[1]/255,b=c[2]/255;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;let h=0,s=0;
  if(mx!==mn){const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);
    h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;h/=6;}
  return [h*360,s*100,l*100];}
function hsl2rgb(h,s,l){h=((h%360)+360)%360/360;s/=100;l/=100;
  if(!s)return [l*255,l*255,l*255];
  const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;
  const f=t=>{t=(t+1)%1;return t<1/6?p+(q-p)*6*t:t<1/2?q:t<2/3?p+(q-p)*(2/3-t)*6:p;};
  return [f(h+1/3)*255,f(h)*255,f(h-1/3)*255];}
const relLum=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);};
  return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2]);};
const contrast=(a,b)=>{const x=relLum(a),y=relLum(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};

/* Clamps keep a bad pick readable rather than refusing it. Each shade is
   moved, in lightness only, until every place it is used clears WCAG AA
   (4.5:1) against what it is actually used on:

     base  a fill under white text, and text on a white page       (light)
     dark  text on white, and on the accent's own soft tint        (light)
     lift  text and marks on a dark panel and on its soft tint,
           and a fill under the dark on-accent text                (dark)

   Checking against plain white and plain dark grey was not enough: text in
   the accent sits on a tint *of* the accent, and a black accent put black
   text on a near-black tint. Pick neon yellow and it comes back darkened;
   pick black and the light shade comes back a grey you can read. */
const WHITE=[255,255,255],DARK_PANEL=[40,40,43],ON_DARK=[14,17,19],AA=4.5;
const mixRGB=(a,p,b)=>a.map((v,i)=>v*p/100+b[i]*(1-p/100));
/* The same mix the stylesheet makes: a tint is 13% accent into the panel.
   The dark panel is --surface, a plain grey the accent does not touch. */
const softOn=(c,panel)=>mixRGB(c,13,panel);
const darkPanelFor=()=>DARK_PANEL;
/* Checked on the colour as it will be written out -- rounded to whole RGB
   values -- since rounding alone can take 4.50 to 4.49. */
const shade=(h,s,l)=>hex2rgb(rgb2hex(hsl2rgb(h,s,l)));
function accentTrio(hex){
  const c=rgb2hsl(hex2rgb(hex)),h=c[0],s=Math.min(92,c[1]);
  let l=c[2],base=shade(h,s,l);
  while(contrast(base,WHITE)<AA&&l>0){l-=1;base=shade(h,s,l);}
  let ld=Math.max(0,l-9),dark=shade(h,s,ld);
  while(contrast(dark,softOn(base,WHITE))<AA&&ld>0){ld-=1;dark=shade(h,s,ld);}
  const liftOk=x=>{const p=darkPanelFor(x);
    return contrast(x,p)>=AA&&contrast(x,softOn(x,p))>=AA&&contrast(x,ON_DARK)>=AA;};
  let li=Math.min(96,l+15),lift=shade(h,s,li);
  while(!liftOk(lift)&&li<100){li+=1;lift=shade(h,s,li);}
  return {base:rgb2hex(base),dark:rgb2hex(dark),lift:rgb2hex(lift)};
}
function setCustomAccent(hex){
  S.prefs.accent="custom";
  S.prefs.accentHex=String(hex||"").toUpperCase();
  applyAppearance();
}
/* What the accent actually is, preset or not. */
function accentHex(){const p=S.prefs||{};
  if(p.accent==="custom")return p.accentHex||ACCENTS[0].hex;
  const a=ACCENTS.filter(x=>x.id===p.accent)[0];
  return a?a.hex:ACCENTS[0].hex;}
const THEMES=[{id:"light",name:"Light",icon:"i-sun"},{id:"dark",name:"Dark",icon:"i-moon"},
  {id:"system",name:"System",icon:"i-laptop"}];

/* What the ramp resolved to, which "system" only knows by asking. The timer
   is a second window with its own stylesheet, so it has to be told. */
const isDark=()=>{const t=(S.prefs&&S.prefs.theme)||"system";
  return t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme:dark)").matches);};

function applyAppearance(){
  const r=document.documentElement,p=S.prefs||{};
  const theme=p.theme||"system";
  if(theme==="system")r.removeAttribute("data-theme");
  else r.setAttribute("data-theme",theme);
  r.setAttribute("data-accent",p.accent||"green");
  /* The three shades are written onto the root, where every rule in the
     stylesheet reads them. The CSS holds only a default for the moment
     before this first runs. */
  const t=accentTrio(accentHex());
  r.style.setProperty("--a-base",t.base);
  r.style.setProperty("--a-dark",t.dark);
  r.style.setProperty("--a-lift",t.lift);
}

/* ============ settings ============ */
/* A sidebar of sections with one pane open at a time, rather than every
   setting stacked in one long column. The open pane lives in V, not prefs:
   which tab you were on is not a setting. */
const SET_TABS=[
  {group:"You"},
  {id:"account",    name:"Account",        icon:"i-user"},
  {group:"Preferences"},
  {id:"appearance", name:"Appearance",     icon:"i-palette"},
  {id:"dates",      name:"Dates and times",icon:"i-clock"},
  {id:"reminders",  name:"Reminders",      icon:"i-bell"},
  {group:"Your planner"},
  {id:"connections",name:"Connections",    icon:"i-link"},
  {id:"data",       name:"Your data",      icon:"i-folder"}];

function themePickHtml(){
  const p=S.prefs||{};
  return '<div class="seg">'+THEMES.map(t=>
    '<button data-act="set-theme" data-v="'+t.id+'" aria-pressed="'+((p.theme||"system")===t.id)+'">'+
    icon(t.icon,"ic-14")+esc(t.name)+'</button>').join("")+'</div>';
}
/* A swatch shows the shade the theme in force would actually use, so what
   you press is what you get rather than the light-mode version of it. */
function accentPickHtml(){
  const p=S.prefs||{},dark=isDark(),cur=p.accent||"green",curHex=accentHex();
  const shade=h=>{const t=accentTrio(h);return dark?t.lift:t.base;};
  const swatch=a=>'<button class="accent-dot'+(cur===a.id?" on":"")+'" style="--dot:'+shade(a.hex)+'"'+
    ' data-act="set-accent" data-v="'+a.id+'" title="'+esc(a.name)+'" aria-label="'+esc(a.name)+'"'+
    ' aria-pressed="'+(cur===a.id)+'"></button>';
  return '<div class="accents">'+ACCENTS.map(swatch).join("")+
    '<input type="color" class="accent-dot accent-custom'+(cur==="custom"?" on":" empty")+'"'+
      ' style="--dot:'+shade(curHex)+'" value="'+esc(curHex)+'" data-act="set-accent-hex"'+
      ' title="Any colour you like" aria-label="Custom accent colour"></div>'+
    '<div class="accent-note"><span>'+(cur==="custom"?"Your own colour":
      esc((ACCENTS.filter(a=>a.id===cur)[0]||ACCENTS[0]).name))+'</span><b>'+esc(curHex)+'</b></div>';
}
function settingsModal(){
  const n=S.tasks.length+S.routines.length+S.notes.length;
  const p=S.prefs||{};
  const tab=SET_TABS.some(t=>t.id===V.setTab)?V.setTab:"appearance";

  const sec=(title,body)=>'<div class="set-sec"><h3>'+esc(title)+'</h3>'+body+'</div>';
  const field=(label,control,help)=>'<div class="set-field">'+
    (label?'<div class="set-flabel">'+esc(label)+'</div>':"")+control+
    (help?'<p class="set-help">'+help+'</p>':"")+'</div>';
  const toggle=(k,on,label)=>'<label class="switch"><input type="checkbox" data-act="set-pref" data-k="'+k+'"'+
    (on?" checked":"")+'><span></span><i>'+esc(label)+'</i></label>';

  let pane="";
  if(tab==="account")pane=accountPane(sec,field,toggle);
  else if(tab==="appearance"){
    const themePick=themePickHtml(),accentPick=accentPickHtml();

    pane=sec("Theme",field("",themePick,"System follows Windows, and switches when it does."))+
      sec("Accent colour",field("",accentPick,
        "The last circle takes any colour you like. Whatever you pick is adjusted just enough to keep the text on it readable."));
  }
  else if(tab==="dates"){
    const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const weekPick='<select class="inp" data-act="set-pref" data-k="weekStart">'+
      [1,0,6].concat([2,3,4,5]).map(d=>'<option value="'+d+'"'+(weekStart()===d?" selected":"")+'>'+days[d]+'</option>').join("")+'</select>';
    const launchPick='<select class="inp" data-act="set-pref" data-k="launch">'+
      NAV.map(v=>'<option value="'+v.id+'"'+((p.launch||"dashboard")===v.id?" selected":"")+'>'+esc(v.name)+'</option>').join("")+'</select>';

    pane=sec("Calendar",
        field("Start week on:",weekPick)+
        field("Open the planner on:",launchPick,"The view you land on each time the planner starts."))+
      sec("Time",field("",toggle("clock24",p.clock24,"24-hour clock"),
        p.clock24?"Times read as 14:30.":"Times read as 2:30pm."));
  }
  else if(tab==="reminders"){
    const rp=remindPrefs(),web=!hasDesktop();
    const canWeb=typeof Notification!=="undefined";
    const timeIn=(k,v,label,req)=>timeField('data-act="set-pref" data-k="remind.'+k+'"',v,{cls:"inp-time",label:label,ph:"Pick a time",req:req});
    const reach=!web?"":!canWeb
      ? '<p class="set-err">'+icon("i-alert","ic-14")+'This browser cannot show notifications. The desktop app can.</p>'
      : Notification.permission!=="granted"
        ? '<div class="set-actions" style="margin-top:12px"><button class="btn btn-sm btn-primary" data-act="remind-allow">'+icon("i-bell","ic-14")+'Allow notifications</button></div>'
        : "";
    /* Each control sits on the line of the switch it belongs to, so the tab
       fits without scrolling, as the other tabs do. */
    pane=sec("Reminders",
        field("",'<div class="set-actions">'+toggle("remind.on",rp.on,"Send reminders")+
          '<button class="btn btn-sm" data-act="remind-test">'+icon("i-bell","ic-14")+'Send a test</button></div>',
          "Routines, and tasks with a due time, remind you 30 minutes before unless you choose otherwise on the task or routine."+
          (web?" In a browser they only arrive while this tab is open.":" They arrive even with the window closed."))+
        reach)+
      sec("Overdue tasks",
        field("",'<div class="set-actions">'+toggle("remind.overdue",rp.overdue,"A daily count of overdue tasks, at")+
          timeIn("overdueAt",rp.overdueAt,"Time of the overdue count",1)+'</div>',
          "One notification with how many tasks are overdue, not one per task, and only when there are any."))+
      sec("Quiet hours",
        field("",'<div class="set-actions">'+toggle("remind.quiet",rp.quiet,"Quiet hours")+
          (rp.quiet?timeIn("quietFrom",rp.quietFrom,"Quiet hours start")+'<span class="set-to">to</span>'+
            timeIn("quietTo",rp.quietTo,"Quiet hours end"):"")+'</div>',
          rp.quiet&&!(rp.quietFrom&&rp.quietTo)?"Pick both times to switch quiet hours on."
            :"Nothing is sent in this window, the overdue count included. Reminders inside it are skipped, not saved up."));
  }
  else if(tab==="connections"){
    const vault=vaultPath();
    const about="Documents are written into your vault as .md files, and edits made in Obsidian come back.";
    pane=sec("Obsidian",
        hasDesktop()
          ? field("",'<div class="set-actions">'+
              '<button class="btn btn-sm" data-act="vault-pick">'+icon("i-folder","ic-14")+(vault?"Change vault":"Connect a vault")+'</button>'+
              (vault?'<button class="btn btn-sm" data-act="vault-open">'+icon("i-pop","ic-14")+'Open</button>'+
                '<button class="btn btn-sm btn-danger" data-act="vault-forget">Disconnect</button>':"")+'</div>',
              vault?'Syncing with <b>'+esc(vault)+'/Everyday Orbit</b>.':about)
          : field("",'<span class="mnone">Vault sync needs the desktop app.</span>',about))+
      sec("Google Calendar",gcalSettings(toggle));
  }
  else{
    const bk=p.autoBackup||{};
    const auto=hasDesktop()
      ? field("",toggle("autoBackup.on",bk.on,"Back up automatically")+
          (bk.on?'<div class="set-actions">'+
            '<select class="inp inp-sm" data-act="set-pref" data-k="autoBackup.every">'+
            [["day","Every day"],["week","Every week"],["month","Every month"]].map(x=>
              '<option value="'+x[0]+'"'+((bk.every||"week")===x[0]?" selected":"")+'>'+x[1]+'</option>').join("")+'</select>'+
            '<button class="btn btn-sm" data-act="backup-dir">'+icon("i-folder","ic-14")+(bk.dir?"Change folder":"Choose folder")+'</button>'+
            '</div>':""),
          bk.on?(bk.dir?"Into <b>"+esc(bk.dir)+"</b> · "+(bk.last?"last ran "+esc(relTime(bk.last)):"not run yet"):"Choose a folder to keep them in.")
            :"A copy is saved to a folder of your choosing, on a schedule.")
      : field("",'<span class="mnone">Automatic backups need the desktop app.</span>');

    pane=sec("Backups",
        field("",'<div class="set-actions">'+
          '<button class="btn btn-sm" data-act="export">'+icon("i-download","ic-14")+'Back up now</button>'+
          '<button class="btn btn-sm" data-act="import">'+icon("i-upload","ic-14")+'Restore</button>'+
          (n===0?'<button class="btn btn-sm" data-act="load-sample">'+icon("i-sparkle","ic-14")+'Load the sample week</button>':"")+
          '</div>',n+" item"+(n===1?"":"s")+" saved on this device.")+auto)+
      sec("Start over",field("",
        '<button class="btn btn-sm btn-danger" data-act="reset-all">'+icon("i-trash","ic-14")+'Clear everything</button>',
        "Removes every task, routine, note, document and tracked hour. Your settings stay as they are."));
  }

  const nav='<nav class="set-nav" role="tablist" aria-label="Settings sections">'+
    SET_TABS.map(t=>t.group?'<div class="set-nav-h">'+esc(t.group)+'</div>':
      '<button class="set-tab" role="tab" data-act="set-tab" data-v="'+t.id+'" aria-selected="'+(t.id===tab)+'">'+
      icon(t.icon)+'<span>'+esc(t.name)+'</span></button>').join("")+
    '<div class="set-nav-foot">Everyday Orbit</div></nav>';
  const inner=nav+'<section class="set-pane" role="tabpanel" data-tab="'+tab+'">'+
    '<button class="icon-btn set-close" data-act="close" aria-label="Close settings">'+icon("i-x")+'</button>'+
    pane+'</section>';

  /* Every change redraws settings, so an open modal has its insides swapped
     rather than being opened again -- that would replay the pop-in animation
     on every toggle, the same flicker the task panel had. */
  const open=el("modalRoot").querySelector(".modal.settings");
  if(open){
    const was=open.querySelector(".set-pane");
    const keep=was&&was.dataset.tab===tab?was.scrollTop:0;
    open.innerHTML=inner;
    open.querySelector(".set-pane").scrollTop=keep;
  }else{
    openModal('<div class="modal settings" role="dialog" aria-modal="true" aria-label="Settings">'+inner+'</div>',{focus:false});
  }
}

/* The Google Calendar part of Settings ▸ Connections. Three states: no
   desktop app, not connected (the two fields and the steps to fill them),
   and connected (what syncs, what shows, and the state of the last sync). */
function gcalSettings(toggle){
  const field=(label,control,help)=>'<div class="set-field">'+
    (label?'<div class="set-flabel">'+esc(label)+'</div>':"")+control+(help?'<p class="set-help">'+help+'</p>':"")+'</div>';
  if(!gcalBridge())return field("",'<span class="mnone">Google Calendar needs signing in, which this copy can’t do.</span>',
    "Your Google events show in the planner, and your dated tasks and routines go into Google.");
  const st=GC.status||{},g=gcalPrefs(),err=GC.err?'<p class="set-err">'+icon("i-alert","ic-14")+esc(GC.err)+'</p>':"";

  /* Signed in with Google: Calendar is one more permission on that account. */
  if(signedIn()&&!gcalOn()){
    return field("",GC.connecting
        ? '<div class="set-actions"><span class="set-wait">Waiting for Google. Finish in your browser.</span>'+
          '<button class="btn btn-sm" data-act="gcal-cancel">Cancel</button></div>'
        : '<div class="set-actions"><button class="btn btn-sm btn-primary" data-act="gcal-connect">'+icon("i-calendar","ic-14")+'Connect Google Calendar</button></div>',
      "Uses the Google account you signed in with, <b>"+esc(st.email)+"</b>. Your Google events show in the planner, and your dated tasks and routines go into Google.")+err;
  }
  if(!st.connected){
    const steps='<details class="set-steps"><summary>How to get these — about five minutes, once</summary><ol>'+
      '<li>Open <b>console.cloud.google.com</b> and create a project. Call it Everyday Orbit.</li>'+
      '<li>In <b>APIs &amp; Services ▸ Library</b>, find <b>Google Calendar API</b> and enable it.</li>'+
      '<li>In <b>Google Auth Platform</b>, set up the consent screen: choose <b>External</b>, give it a name and your email.</li>'+
      '<li>Under <b>Audience</b>, press <b>Publish app</b>. Left in Testing, Google signs you out every seven days.</li>'+
      '<li>Under <b>Clients</b>, create a client of type <b>Desktop app</b>. Copy its Client ID and Client secret into the boxes above.</li>'+
      '<li>Press Connect. Your browser opens; sign in and allow access. Google will warn that it has not verified the app, because it is yours and not a published one. Choose <b>Advanced</b>, then go to the app.</li>'+
      '</ol></details>';
    return field("Client ID",'<input class="inp inp-wide" id="gcId" autocomplete="off" spellcheck="false" placeholder="….apps.googleusercontent.com" value="'+
        esc(GC.draft.id||st.clientId||"")+'">')+
      field("Client secret",'<input class="inp inp-wide" id="gcSecret" type="password" autocomplete="off" placeholder="'+
        (st.hasSecret?"Saved. Leave empty to keep it":"")+'" value="'+esc(GC.draft.secret)+'">')+
      field("",GC.connecting
        ? '<div class="set-actions"><span class="set-wait">Waiting for Google. Finish signing in in your browser.</span>'+
          '<button class="btn btn-sm" data-act="gcal-cancel">Cancel</button></div>'
        : '<div class="set-actions"><button class="btn btn-sm btn-primary" data-act="gcal-connect">'+icon("i-calendar","ic-14")+'Connect</button></div>',
        "It needs a Client ID from Google, which you make yourself. The keys it gets back stay on this computer, encrypted.")+
      err+steps;
  }

  const when=GC.busy?"Syncing now…":g.last?"Last synced "+relTime(g.last):"Not synced yet";
  const cals=GC.cals.length?'<div class="gcals">'+GC.cals.map(c=>
    '<label class="gcal-pick"><input type="checkbox" data-act="gcal-cal" data-id="'+esc(c.id)+'"'+(calShown(c)?" checked":"")+'>'+
    '<span class="gdot" style="--c:'+c.color+'"></span><span>'+esc(c.name)+'</span></label>').join("")+'</div>'
    :'<span class="mnone">'+(GC.busy?"Loading your calendars…":"No calendars loaded yet.")+'</span>';
  return field("",'<div class="set-actions"><span class="set-who">'+icon("i-check","ic-14")+'Connected as <b>'+esc(st.email||"your Google account")+'</b></span></div>'+
      '<div class="set-actions"><button class="btn btn-sm" data-act="gcal-sync"'+(GC.busy?" disabled":"")+'>'+icon("i-repeat","ic-14")+'Sync now</button>'+
      '<button class="btn btn-sm btn-danger" data-act="gcal-disconnect">Disconnect</button></div>',
      esc(when)+". It also syncs by itself every few minutes and whenever you change a task or routine.")+err+
    field("Put into your main Google calendar",
      '<div class="set-stack">'+toggle("gcal.pushTasks",g.pushTasks,"Tasks with a due date")+
      toggle("gcal.pushRoutines",g.pushRoutines,"Routines")+'</div>',
      "Tasks go in as all-day events, routines as repeating ones. Rename or move one in Google and the planner follows. Delete one there and it stops syncing, but stays here.")+
    field("Show in the planner",cals,"Events from these calendars appear on your calendar and dashboard.");
}

/* ============ backup + restore ============ */
let pendingImport=null;
/* ---- automatic backups ---- */
const BACKUP_EVERY={day:864e5,week:7*864e5,month:30*864e5};
function pickBackupFolder(){
  const o=desktop();if(!o||!o.chooseBackupDir)return;
  Promise.resolve(o.chooseBackupDir()).then(dir=>{
    if(!dir)return;
    S.prefs.autoBackup=Object.assign({on:true,every:"week",last:0},S.prefs.autoBackup||{},{dir:dir});
    save("prefs");panels();toast("Backups will be written to "+dir);
  }).catch(()=>{});
}
/* Runs at most once a launch, and only when the interval has actually passed. */
function maybeAutoBackup(){
  const o=desktop();if(!o||!o.writeBackup)return;
  const b=S.prefs&&S.prefs.autoBackup;
  if(!b||!b.on||!b.dir)return;
  const gap=BACKUP_EVERY[b.every||"week"]||BACKUP_EVERY.week;
  if(b.last&&Date.now()-b.last<gap)return;
  const payload=backupPayload();
  try{
    o.writeBackup({dir:b.dir,name:"everyday-orbit-"+TODAY()+".json",text:JSON.stringify(payload,null,2)});
    S.prefs.autoBackup=Object.assign({},b,{last:Date.now()});
    save("prefs");
  }catch(e){}
}

function exportData(){
  const payload=backupPayload();
  const text=JSON.stringify(payload,null,2);
  const name="everyday-orbit-"+TODAY()+".json";
  function viaBlob(){
    try{
      const url=URL.createObjectURL(new Blob([text],{type:"application/json"}));
      const a=document.createElement("a");a.href=url;a.download=name;a.style.display="none";
      document.body.appendChild(a);a.click();
      setTimeout(function(){a.remove();URL.revokeObjectURL(url);},1500);
      toast("Backup saved to your downloads");
    }catch(e){toast("Couldn't save the file here — try the local copy");}
  }
  let p=null;
  try{p=window.claude&&claude.use?claude.use("downloads"):null;}catch(e){p=null;}
  if(!p){viaBlob();return;}
  Promise.resolve(p).then(function(d){
    if(!d||!d.save)return viaBlob();
    return d.save({filename:name,data:text}).then(function(){toast("Backup saved");},function(){viaBlob();});
  },function(){viaBlob();});
}
function importPicked(file){
  if(!file)return;
  const r=new FileReader();
  r.onerror=function(){toast("Couldn't read that file");};
  r.onload=function(){
    let o=null;
    try{o=JSON.parse(String(r.result));}catch(e){toast("That file isn't valid JSON");return;}
    const d=o&&o.data?o.data:o;
    if(!d||!Array.isArray(d.tasks)||!Array.isArray(d.categories)){toast("That doesn't look like an Everyday Orbit backup");return;}
    pendingImport=d;
    openModal('<div class="modal narrow" role="dialog" aria-modal="true" aria-label="Restore backup">'+
      '<div class="mhead2">'+icon("i-upload","ic-18")+'<h2>Restore this backup?</h2><button class="icon-btn" data-act="close" aria-label="Close">'+icon("i-x")+'</button></div>'+
      '<div class="mbody"><p style="margin:0;color:var(--ink-2)">The file holds '+
        '<b>'+d.tasks.length+'</b> tasks, <b>'+((d.routines||[]).length)+'</b> routines, <b>'+((d.notes||[]).length)+'</b> notes and <b>'+d.categories.length+'</b> categories'+
        (o&&o.exported?', backed up on '+esc(new Date(o.exported).toLocaleDateString(undefined,{day:"numeric",month:"long",year:"numeric"})):"")+'.</p>'+
      '<p style="margin:0;color:var(--danger);font-weight:600">This replaces everything currently in the planner.</p></div>'+
      '<div class="mfoot"><div class="spacer" style="flex:1"></div><button class="btn" data-act="close">Cancel</button>'+
      '<button class="btn btn-primary" data-act="import-apply">'+icon("i-check")+'Restore</button></div></div>');
  };
  r.readAsText(file);
}
function applyImport(){
  const d=pendingImport;if(!d)return;
  KEYS.forEach(function(k){
    if(k==="completions"){S.completions=(d.completions&&typeof d.completions==="object")?d.completions:{};}
    else if(k==="prefs"){S.prefs=Object.assign({hidden:[],scratch:""},d.prefs||{});}
    else if(Array.isArray(d[k]))S[k]=d[k];
  });
  hiddenCats();S.prefs.setup=true;pendingImport=null;V.noteId=null;
  KEYS.forEach(function(k){touched[k]=true;save(k);});
  closeModal();render();toast("Backup restored");
  if(OB.open){OB.mode="restored";OB.found=null;obGo(obNext());}
}
/* The priority section is two either/or pairs shown as four boxes, in the
   order they appear on the matrix table: urgency and importance each stay
   unset until one of their two boxes is ticked. */
const PRIO_OPTS=[
 {k:"urgent",   v:"1",name:"Urgent"},
 {k:"important",v:"1",name:"Important"},
 {k:"important",v:"0",name:"Not Important"},
 {k:"urgent",   v:"0",name:"Not Urgent"}];

const flagVal=b=>b==null?"":(b?"1":"0");
function quadFromFlags(u,i){
  if(u===""||i==="")return null;
  const U=u==="1",I=i==="1";
  if(U&&I)return "do";
  if(!U&&I)return "decide";
  if(U&&!I)return "delegate";
  return "drop";
}

function quadName(t){const q=quadOf(t);return q?QUADS.find(x=>x.id===q).name:"Not prioritised";}
function subRow(s){return '<div class="sub-row'+(s.d?" done":"")+'" data-sid="'+(s.id||uid("s"))+'">'+
  '<button class="tick'+(s.d?" on":"")+'" data-act="sub-toggle" aria-label="Toggle subtask">'+icon("i-check")+'</button>'+
  '<span class="t"><input value="'+esc(s.t)+'" placeholder="Subtask"></span>'+
  '<button class="rowbtn" style="opacity:1" data-act="sub-del" aria-label="Remove subtask">'+icon("i-x","ic-14")+'</button></div>';}
function routineModal(id){
  const r=id?routineById(id):{id:"",title:"",cat:S.categories[0].id,freq:"weekly",days:[1,2,3,4,5],every:2,time:"09:00",dur:30,start:TODAY(),end:"",active:true,note:""};
  if(!r)return;
  openModal('<div class="modal" role="dialog" aria-modal="true" aria-label="Routine">'+
    '<div class="mhead2"><h2>'+(id?"Edit routine":"New routine")+'</h2>'+
    (id?'<button class="btn btn-sm btn-ghost btn-danger" data-act="routine-delete" data-id="'+id+'">'+icon("i-trash","ic-14")+'Delete</button>':"")+
    '<button class="icon-btn" data-act="close" aria-label="Close">'+icon("i-x")+'</button></div>'+
    '<div class="mbody">'+
    field("Routine",'<input class="inp" id="rTitle" value="'+esc(r.title)+'" placeholder="Skincare routine, stand-up, weekly review…">')+
    '<div class="grid3">'+
      field("Category",catSelect('class="inp" id="rCat"',r.cat))+
      field("Time",timeField('id="rTime"',r.time,{label:"Time",req:1}))+
      field("Minutes",'<input class="inp" type="number" min="5" step="5" id="rDur" value="'+(r.dur||30)+'">')+
    '</div>'+
    field("Reminder",'<select class="inp" id="rRemind">'+remindOptions(r)+'</select>')+
    field("Repeats",'<div class="pickers" id="rFreq">'+
      ['daily|Every day','weekdays|Weekdays','weekly|Chosen days','interval|Every N days'].map(o=>{const[v,l]=o.split("|");
        const on=(v==="daily"&&r.freq==="weekly"&&(r.days||[]).length===7)||(v==="weekdays"&&r.freq==="weekly"&&(r.days||[]).length===5&&[1,2,3,4,5].every(x=>r.days.indexOf(x)>-1))||(v==="weekly"&&r.freq==="weekly"&&!((r.days||[]).length===7||((r.days||[]).length===5&&[1,2,3,4,5].every(x=>r.days.indexOf(x)>-1))))||(v==="interval"&&r.freq==="interval");
        return '<button class="pick'+(on?" on":"")+'" data-act="r-freq" data-v="'+v+'">'+l+'</button>';}).join("")+'</div>')+
    '<div class="grid2"><div class="field" id="rDaysWrap"><label>Days of the week</label><div class="dow-pick" id="rDays">'+
      [1,2,3,4,5,6,0].map((d,i)=>'<button class="'+((r.days||[]).indexOf(d)>-1?"on":"")+'" data-act="r-day" data-v="'+d+'">'+DOWS[i][0]+'</button>').join("")+'</div></div>'+
      field("Every N days",'<input class="inp" type="number" min="1" max="60" id="rEvery" value="'+(r.every||2)+'">')+'</div>'+
    '<div class="grid2">'+field("Starts",dateField('id="rStart"',r.start||TODAY(),{label:"Starts",req:1}))+
      field("Ends (optional)",dateField('id="rEnd"',r.end,{label:"Ends",ph:"No end date"}))+'</div>'+
    field("Active",'<div class="pickers"><button class="pick'+(r.active?" on":"")+'" data-act="r-active">'+icon("i-repeat")+'<span id="rActiveLbl">'+(r.active?"Running":"Paused")+'</span></button></div>')+
    '</div><div class="mfoot"><div class="spacer" style="flex:1"></div><button class="btn" data-act="close">Cancel</button>'+
    '<button class="btn btn-primary" data-act="routine-save" data-id="'+(id||"")+'">'+icon("i-check")+'Save routine</button></div></div>');
  const M=el("modalRoot");M.dataset.freq=r.freq;M.dataset.active=String(!!r.active);
}
function catsModal(){
  openModal('<div class="modal narrow" role="dialog" aria-modal="true" aria-label="Categories">'+
    '<div class="mhead2"><h2>Categories</h2><button class="icon-btn" data-act="close" aria-label="Close">'+icon("i-x")+'</button></div>'+
    '<div class="mbody"><div class="cat-manage">'+S.categories.map(c=>
      '<div class="cm-row" style="--c:'+c.color+'"><span class="ravatar" style="width:28px;height:28px;border-radius:9px">'+icon(c.icon,"ic-14")+'</span>'+
      '<span class="t">'+esc(c.name)+'</span>'+
      '<span class="chip num" style="color:var(--muted)">'+(function(k){return k+(k===1?" task":" tasks");})(S.tasks.filter(t=>t.cat===c.id).length)+'</span>'+
      '<button class="tgl'+(visibleCat(c.id)?" on":"")+'" data-act="cat-toggle" data-id="'+c.id+'" title="Show or hide across every view">'+(visibleCat(c.id)?"Shown":"Hidden")+'</button>'+
      '<button class="rowbtn" style="opacity:1" data-act="cat-only" data-id="'+c.id+'" title="Show only this category">'+icon("i-target","ic-14")+'</button>'+
      '<button class="rowbtn" style="opacity:1" data-act="cat-edit" data-id="'+c.id+'" aria-label="Edit">'+icon("i-edit","ic-14")+'</button>'+
      '<button class="rowbtn" style="opacity:1;color:var(--danger)" data-act="cat-del" data-id="'+c.id+'" aria-label="Delete">'+icon("i-trash","ic-14")+'</button></div>').join("")+
    '</div></div><div class="mfoot"><button class="btn btn-primary" data-act="cat-edit" data-id="">'+icon("i-plus")+'New category</button>'+
    '<div class="spacer" style="flex:1"></div><button class="btn" data-act="close">Done</button></div></div>');
}
function catEditModal(id){
  const c=id?cat(id):{id:"",name:"",icon:"i-star",color:CAT_COLORS[Math.floor(Math.random()*CAT_COLORS.length)]};
  openModal('<div class="modal narrow" role="dialog" aria-modal="true" aria-label="Category">'+
    '<div class="mhead2"><h2>'+(id?"Edit category":"New category")+'</h2><button class="icon-btn" data-act="close" aria-label="Close">'+icon("i-x")+'</button></div>'+
    '<div class="mbody">'+field("Name",'<input class="inp" id="cName" value="'+esc(c.name)+'" placeholder="Category name">')+
    field("Colour",'<div class="swatches" id="cColors">'+CAT_COLORS.map(x=>'<button class="sw-btn'+(x===c.color?" on":"")+'" style="--c:'+x+'" data-act="c-color" data-v="'+x+'" aria-label="'+x+'"></button>').join("")+'</div>')+
    field("Icon",'<div class="icon-pick" id="cIcons">'+CAT_ICONS.map(i=>'<button class="'+(i===c.icon?"on":"")+'" data-act="c-icon" data-v="'+i+'" aria-label="'+i+'">'+icon(i)+'</button>').join("")+'</div>')+
    '</div><div class="mfoot"><div class="spacer" style="flex:1"></div><button class="btn" data-act="cats-back">Back</button>'+
    '<button class="btn btn-primary" data-act="cat-save" data-id="'+(id||"")+'">Save category</button></div></div>');
  const M=el("modalRoot");M.dataset.color=c.color;M.dataset.icon=c.icon;
}
function peekModal(date){
  V.peek=date;
  const ts=tasksFor(date),evs=eventsFor(parseD(date));
  const routines=evs.filter(e=>e.kind!=="session"),tracked=evs.filter(e=>e.kind==="session");
  const gd=gcalFor(parseD(date)),gev=gd.allDay.concat(gd.timed.map(x=>x.g));
  openModal('<div class="modal narrow" role="dialog" aria-modal="true" aria-label="Day" data-peek="1">'+
    '<div class="mhead2"><h2>'+esc(parseD(date).toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long"}))+'</h2>'+
    '<button class="icon-btn" data-act="close" aria-label="Close">'+icon("i-x")+'</button></div><div class="mbody">'+
    (gev.length?'<div><div class="sec-label" style="margin-bottom:6px">Events</div>'+gev.map(e=>'<div class="qrow" data-act="gcal-ev" data-id="'+esc(e.id)+'"><span class="gdot" style="--c:'+e.color+'"></span><div class="t"><b>'+esc(e.title)+'</b></div><span class="chip num">'+esc(e.allDay?"All day":fmtTime(pad(new Date(e.st).getHours())+":"+pad(new Date(e.st).getMinutes())))+'</span></div>').join("")+'</div>':"")+
    (ts.length?'<div><div class="sec-label" style="margin-bottom:6px">Tasks</div>'+ts.map(t=>'<div class="qrow" data-act="task" data-id="'+t.id+'">'+tickBtn(t)+'<div class="t"><b>'+esc(t.title)+'</b></div>'+catChip(t.cat)+'</div>').join("")+'</div>':"")+
    (routines.length?'<div><div class="sec-label" style="margin-bottom:6px">Routines</div>'+routines.map(e=>'<div class="qrow"><button class="tick'+(e.done?" on":"")+'" data-act="routine-done" data-id="'+e.r.id+'" data-date="'+date+'" aria-label="Toggle">'+icon("i-check")+'</button><div class="t"><b>'+esc(e.r.title)+'</b></div><span class="chip num">'+esc(fmtTime(e.r.time))+'</span></div>').join("")+'</div>':"")+
    (tracked.length?'<div><div class="sec-label" style="margin-bottom:6px">Time tracked</div>'+tracked.map(e=>'<div class="qrow">'+icon("i-timer","ic-14")+'<div class="t"><b>'+esc(e.t.title)+'</b></div><span class="chip num">'+esc(fmtTracked(e.secs))+'</span></div>').join("")+'</div>':"")+
    (!ts.length&&!evs.length&&!gev.length?'<div class="empty">'+icon("i-calendar")+'<p>Nothing scheduled. A clear day.</p></div>':"")+
    '</div><div class="mfoot"><button class="btn btn-primary" data-act="new-task" data-date="'+date+'">'+icon("i-plus")+'Add task</button><div class="spacer" style="flex:1"></div><button class="btn" data-act="close">Close</button></div></div>');
}
function scratchModal(){
  openModal('<div class="modal" role="dialog" aria-modal="true" aria-label="Scratch pad">'+
    '<div class="mhead2">'+icon("i-bolt","ic-18")+'<h2>Scratch pad</h2><button class="icon-btn" data-act="close" aria-label="Close">'+icon("i-x")+'</button></div>'+
    '<div class="rte-bar">'+["bold|B","italic|I","insertUnorderedList|•"].map(o=>{const[c,l]=o.split("|");return '<button data-act="rte" data-cmd="'+c+'" data-scratch="1">'+l+'</button>';}).join("")+'</div>'+
    '<div class="rte" id="scratchPad" contenteditable="true" data-ph="Anything you need out of your head…" style="min-height:280px">'+(S.prefs.scratch||"")+'</div>'+
    '<div class="mfoot"><span style="color:var(--muted);font-size:12px">Saves as you type</span><div class="spacer" style="flex:1"></div><button class="btn btn-primary" data-act="close">Done</button></div></div>');
}

/* ============ render ============ */
/* ---- keeping your place across a redraw ----
   A redraw replaces the HTML, and every scrolled box inside it goes with it:
   tick a missed routine halfway down the dashboard and the column jumped back
   to the top; the calendar went back to 7am every minute. So before a redraw
   each scrolled box is noted by where it sits -- its id, or its first class
   and its place among boxes of that class -- and afterwards the box in the
   same place is scrolled back. Scroll positions only carry over within one
   screen: a different view, mode or note starts at its top. */
function scrollKey(n,root){
  if(n===root)return ":root";
  if(n.id)return "#"+CSS.escape(n.id);
  const sel=n.classList.length?"."+CSS.escape(n.classList[0]):n.tagName.toLowerCase();
  return sel+"@"+Array.prototype.indexOf.call(root.querySelectorAll(sel),n);
}
function scrollMarks(root){
  const out=[];if(!root)return out;
  [root].concat(Array.from(root.querySelectorAll("*"))).forEach(n=>{
    if(n.scrollTop||n.scrollLeft)out.push([scrollKey(n,root),n.scrollTop,n.scrollLeft]);});
  return out;
}
function putScroll(root,marks){
  (marks||[]).forEach(m=>{
    let n=null;const k=m[0],at=k.lastIndexOf("@");
    if(k===":root")n=root;
    else if(k[0]==="#")n=root.querySelector(k);
    else if(at>0)n=root.querySelectorAll(k.slice(0,at))[Number(k.slice(at+1))];
    if(n){n.scrollTop=m[1];n.scrollLeft=m[2];}
  });
}
/* The button that was pressed is redrawn too; give the keyboard back to its
   replacement, so a keyboard user does not start again from the top. */
function focusKey(a,root){
  if(!a||a.tagName!=="BUTTON"||!root.contains(a)||!a.dataset.act)return "";
  return ["act","id","date","v","k"].map(k=>a.dataset[k]?'[data-'+k+'="'+CSS.escape(a.dataset[k])+'"]':"").join("");
}
const screenKey=()=>[V.view,V.view==="tasks"?V.taskMode:"",V.view==="calendar"?V.calMode:"",V.view==="notes"?V.noteId:""].join("|");

function renderView(){
  const vp=el("viewport"),flush=(V.view==="calendar"||V.view==="notes"||V.view==="tasks"||V.view==="dashboard");
  const screen=screenKey(),same=vp.dataset.screen===screen;
  const marks=same?scrollMarks(vp):null,hadGrid=same&&!!el("gridScroll");
  const fk=same?focusKey(document.activeElement,vp):"";
  vp.className="viewport"+(flush?" flush":"");
  if(V.view==="dashboard")vp.innerHTML=viewDashboard();
  else if(V.view==="calendar")vp.innerHTML=viewCalendar();
  else if(V.view==="tasks")vp.innerHTML=V.taskMode==="board"?viewBoard():viewList();
  else if(V.view==="matrix")vp.innerHTML=viewMatrix();
  else if(V.view==="routines")vp.innerHTML=viewRoutines();
  else vp.innerHTML=viewNotes();
  /* Worked out again: drawing can settle what the screen is, as Notes does
     when it picks the note to open. */
  vp.dataset.screen=screenKey();
  /* The week opens at 7am the first time it is shown, and stays where you
     left it after that -- across redraws and across weeks. */
  const gs=el("gridScroll");if(gs&&!hadGrid)gs.scrollTop=Math.max(0,(7-H0)*PX-8);
  if(marks)putScroll(vp,marks);
  if(fk){const b=vp.querySelector(fk);if(b&&document.activeElement===document.body)b.focus({preventScroll:true});}
  if(V.view==="calendar"||V.view==="dashboard")gcalEnsure();
  if(V.view==="calendar"&&document.querySelector(".mgrid"))fitMonth();
}
function render(){
  fixTasks();
  renderRail();renderTopbar();renderView();
  /* The day popup lists what the page does; a tick in it redraws the page, so
     the popup is redrawn with it rather than left showing the old state. */
  if(V.peek&&el("modalRoot").querySelector('.modal[data-peek]'))peekModal(V.peek);
}

/* ============ actions ============ */
function toggleTaskDone(id){
  const t=taskById(id);if(!t)return;
  if(t.status==="completed"){t.status="planned";t.completedAt=null;logAct(id,"reopened","Reopened the task");}
  else{t.status="completed";t.completedAt=TODAY();logAct(id,"done","Completed the task");}
  save("tasks");render();
}

function readSheetSubs(){
  const w=el("shSubs");if(!w)return null;
  return Array.prototype.map.call(w.querySelectorAll(".sub-row"),row=>({
    id:row.dataset.sid,t:row.querySelector("input").value.trim(),
    d:row.querySelector(".tick").classList.contains("on")})).filter(x=>x.t);
}
function commitSubs(){
  const subs=readSheetSubs(),sh=V.sheet;
  if(!subs||!sh)return;
  if(!sh.id){patchDraft({subtasks:subs});return;}
  const t=taskById(sh.id);
  if(t&&JSON.stringify(t.subtasks||[])!==JSON.stringify(subs)){t.subtasks=subs;save("tasks");render();}
}

/* Deleting a task takes its history, documents and sessions with it. */
function deleteTask(id){
  const t=taskById(id);if(!t)return;
  docsFor(id).forEach(removeDocFromVault);
  S.tasks=S.tasks.filter(x=>x.id!==id);
  S.notes.forEach(x=>{x.actions=(x.actions||[]).filter(y=>y.taskId!==id);});
  S.tasks.forEach(x=>{if(Array.isArray(x.links))x.links=x.links.filter(l=>l!==id);});
  S.docs=S.docs.filter(d=>d.task!==id);
  S.activity=S.activity.filter(a=>a.task!==id);
  S.sessions=S.sessions.filter(x=>x.task!==id);
  if(running()&&running().task===id){S.prefs.running=null;syncTimerWindow();}
  ["tasks","notes","docs","activity","sessions","prefs"].forEach(save);
  closeSheet();render();toast("Task deleted");
}

const fmtBytes=n=>{n=Number(n)||0;return n<1024?n+" B":n<1048576?Math.round(n/1024)+" KB":(n/1048576).toFixed(1)+" MB";};
function pickAttachment(){
  if(!hasDesktop()){toast("Attaching files needs the desktop app");return;}
  let inp=el("orbitFile");
  if(!inp){inp=document.createElement("input");inp.type="file";inp.id="orbitFile";
    inp.style.display="none";document.body.appendChild(inp);}
  inp.value="";inp.click();
}
function takeAttachment(file){
  const t=sheetTask();if(!file||!t||!V.sheet||!V.sheet.id)return;
  const o=desktop(),rec={id:uid("f"),name:file.name,size:fmtBytes(file.size),type:file.type||""};
  /* Electron 32 dropped File.path, so the preload hands back the real path. */
  const src=o&&o.pathFor?o.pathFor(file):file.path;
  if(o&&o.saveFile&&src){
    try{const saved=o.saveFile({path:src,name:file.name,task:t.id});if(saved&&saved.path)rec.path=saved.path;}catch(e){}
  }
  patchCurrent({attachments:tFiles(t).concat([rec])});
}
function popOutTimer(){
  const o=desktop();
  if(o&&o.popTimer){try{o.popTimer();}catch(e){}syncTimerWindow();return;}
  toast("The floating timer needs the desktop app");
}
function saveRoutine(id){
  const M=el("modalRoot"),title=el("rTitle").value.trim();
  if(!title){el("rTitle").focus();toast("Give the routine a name first");return;}
  const days=Array.prototype.map.call(M.querySelectorAll("#rDays button.on"),b=>Number(b.dataset.v));
  const freq=M.dataset.freq==="interval"?"interval":"weekly";
  const data={title:title,cat:el("rCat").value,time:el("rTime").value||"09:00",dur:Math.max(5,Number(el("rDur").value)||30),
    freq:freq,days:freq==="interval"?[]:days,every:Math.max(1,Number(el("rEvery").value)||2),
    start:el("rStart").value||TODAY(),end:el("rEnd").value||"",active:M.dataset.active!=="false",
    remind:(v=>v==="d"?null:v==="off"?false:Number(v))(el("rRemind").value)};
  if(freq==="weekly"&&!days.length){toast("Pick at least one day");return;}
  let r=id?routineById(id):null;
  if(r)Object.assign(r,data);else S.routines.push(Object.assign({id:uid("r"),note:""},data));
  save("routines");closeModal();render();toast(id?"Routine updated":"Routine added");
}
function saveCat(id){
  const M=el("modalRoot"),name=el("cName").value.trim();
  if(!name){el("cName").focus();toast("Name the category first");return;}
  if(id){const c=cat(id);c.name=name;c.color=M.dataset.color;c.icon=M.dataset.icon;}
  else S.categories.push({id:uid("c"),name:name,color:M.dataset.color,icon:M.dataset.icon});
  save("categories");catsModal();renderRail();renderView();
}
function delCat(id){
  const n=S.tasks.filter(t=>t.cat===id).length+S.routines.filter(r=>r.cat===id).length+S.notes.filter(x=>x.cat===id).length;
  if(S.categories.length<2){toast("Keep at least one category");return;}
  const fbc=S.categories.find(c=>c.id!==id),fb=fbc.id;
  S.tasks.forEach(t=>{if(t.cat===id)t.cat=fb;});S.routines.forEach(r=>{if(r.cat===id)r.cat=fb;});S.notes.forEach(x=>{if(x.cat===id)x.cat=fb;});
  S.categories=S.categories.filter(c=>c.id!==id);
  S.prefs.hidden=S.prefs.hidden.filter(x=>x!==id);
  save("categories");save("tasks");save("routines");save("notes");save("prefs");catsModal();render();
  toast(n?n+" item"+(n===1?"":"s")+" moved to "+fbc.name:"Category deleted");
}
function addAction(nid){
  const n=noteById(nid);if(!n)return;
  const txt=el("aiText").value.trim();if(!txt){el("aiText").focus();return;}
  const due=el("aiDate").value||"";
  const t={id:uid("t"),title:txt,desc:"From note: "+n.title,due:due,cat:n.cat,status:"planned",urgent:null,important:null,subtasks:[],created:TODAY(),completedAt:null,noteId:n.id};
  S.tasks.push(t);
  n.actions=n.actions||[];n.actions.push({id:uid("a"),t:txt,done:false,taskId:t.id});
  n.updated=Date.now();
  save("tasks");save("notes");render();
  const f=el("aiText");if(f)f.focus();
  toast("Added to your tasks and calendar");
}

/* ============ events ============ */
document.addEventListener("click",function(e){
  let t=e.target;
  if(t&&t.nodeType===3)t=t.parentNode;
  while(t&&!t.closest)t=t.parentNode||t.host;
  if(!t||!t.closest)return;
  if(t.dataset&&t.dataset.scrim==="1"){closeModal();return;}
  const n=t.closest("[data-act]");
  if(!n)return;
  const a=n.dataset.act,id=n.dataset.id,M=el("modalRoot");
  try{
  switch(a){
    case "rail":document.body.classList.toggle("rail-open");break;
    case "view":V.view=n.dataset.view;V.q="";closeRail();render();break;
    case "cat-toggle":toggleCat(id);break;
    case "cat-all":hiddenCats().length=0;touched.prefs=true;save("prefs");render();refreshCatsModal();break;
    case "cat-none":S.prefs.hidden=S.categories.map(c=>c.id);touched.prefs=true;save("prefs");render();refreshCatsModal();break;
    case "cat-only":S.prefs.hidden=S.categories.filter(c=>c.id!==id).map(c=>c.id);touched.prefs=true;save("prefs");render();refreshCatsModal();break;
    case "cal-prev":V.anchor=V.calMode==="week"?addDays(V.anchor,-7):new Date(V.anchor.getFullYear(),V.anchor.getMonth()-1,1);renderTopbar();renderView();break;
    case "cal-next":V.anchor=V.calMode==="week"?addDays(V.anchor,7):new Date(V.anchor.getFullYear(),V.anchor.getMonth()+1,1);renderTopbar();renderView();break;
    case "cal-today":V.anchor=today();renderTopbar();renderView();break;
    case "cal-mode":V.calMode=n.dataset.mode;V.anchor=today();renderTopbar();renderView();break;
    case "od-toggle":V.odOpen=!V.odOpen;renderView();break;
    case "peek":peekModal(n.dataset.date);break;
    case "task-mode":V.taskMode=n.dataset.mode;renderTopbar();renderView();break;
    case "quick":V.f.quick=n.dataset.v;renderView();break;
    case "adv-toggle":V.adv=!V.adv;renderView();break;
    case "filter-clear":V.f={quick:V.f.quick,status:"",cat:"",quad:"",from:"",to:"",sort:"due"};renderView();break;
    case "task":if(id)openSheet(id);break;
    case "sh-open":if(id)openSheet(id);break;
    case "task-done":toggleTaskDone(id);break;
    case "new-task":openSheet(null,{due:n.dataset.date||"",status:n.dataset.status||"backlog"});break;
    case "task-delete":if(arm(n,"Delete for good?")){S.tasks=S.tasks.filter(t=>t.id!==id);S.notes.forEach(x=>{x.actions=(x.actions||[]).filter(y=>y.taskId!==id);});save("tasks");save("notes");closeModal();render();toast("Task deleted");}break;
    case "sh-sub-add":{const w=el("shSubs");w.insertAdjacentHTML("beforeend",subRow({id:uid("s"),t:"",d:false}));w.lastElementChild.querySelector("input").focus();break;}
    case "sub-toggle":n.classList.toggle("on");n.closest(".sub-row").classList.toggle("done");commitSubs();break;
    case "sub-del":n.closest(".sub-row").remove();commitSubs();break;

    /* ---- task detail sheet ---- */
    case "sheet-close":closeSheet();break;
    case "sh-create":createFromDraft();break;
    case "sh-deadline":{if(!V.sheet)break;V.sheet.dl=true;renderSheet();
      const b=document.querySelector('.when-dl .pk-btn');if(b)pkOpen(b);break;}
    case "sh-tab":V.sheet.tab=n.dataset.v;renderSheet();break;
    case "sh-done":{const t=sheetTask();if(t&&V.sheet.id)toggleTaskDone(t.id),renderSheet();break;}
    case "sh-delete":if(arm(n,"Delete for good?"))deleteTask(V.sheet.id);break;
    case "pk-open":pkOpen(n);break;
    case "pk-pick":case "pk-day":pkPick(n.dataset.v);break;
    case "pk-clear":pkPick("");break;
    case "pk-type":pkTyped();break;
    case "pk-month":pkMonth(Number(n.dataset.v));break;
    case "pk-opt":{const o=PK.src&&PK.src.options[Number(n.dataset.i)];if(o)pkPick(o.value);break;}
    case "sh-flag":{const t=sheetTask();if(!t)break;
      const k=n.dataset.k,cur=flagVal(t[k]);
      patchCurrent({[k]:cur===n.dataset.v?null:n.dataset.v==="1"});break;}
    case "sh-tag-del":{const t=sheetTask();if(!t)break;
      patchCurrent({tags:tTags(t).filter(x=>x!==n.dataset.v)});break;}
    case "sh-link-del":{const t=sheetTask();if(!t)break;
      patchCurrent({links:tLinks(t).filter(x=>x!==n.dataset.v)});break;}
    case "sh-file-add":pickAttachment();break;
    case "sh-file-open":{const t=sheetTask(),o=desktop();if(!t||!o||!o.openFile)break;
      const f=tFiles(t).find(x=>x.id===n.dataset.v);
      if(f&&f.path)o.openFile(f.path);break;}
    case "sh-file-del":{const t=sheetTask();if(!t)break;
      patchCurrent({attachments:tFiles(t).filter(f=>f.id!==n.dataset.v)});break;}
    case "sh-timer":{const t=sheetTask();if(t&&V.sheet.id)toggleTimer(t.id);break;}

    /* ---- timer ---- */
    case "timer-toggle":toggleTimer(id||(running()||{}).task);break;
    case "timer-stop":stopTimer();break;
    case "done-after-timer":closeModal();toggleTaskDone(id);renderSheet();break;
    case "timer-pop":popOutTimer();break;

    /* ---- comments and documents ---- */
    case "comment-add":{const box=el("shComment"),t=sheetTask();
      if(!box||!t||!V.sheet.id)break;
      const txt=box.value.trim();
      if(!txt){box.focus();break;}
      logAct(t.id,"comment",txt);box.value="";renderSheet();renderView();break;}
    case "act-del":if(arm(n,"Delete?")){S.activity=S.activity.filter(a=>a.id!==id);save("activity");renderSheet();renderView();}break;
    case "doc-new":{const t=sheetTask();if(t&&V.sheet.id)docModal(null,t.id);break;}
    case "doc-open":docModal(id);break;
    case "doc-save":{const title=(el("dcTitle").value||"").trim()||"Untitled",md=el("dcMd").value;
      saveDoc(n.dataset.id||null,n.dataset.task||null,title,md);
      closeModal();renderSheet();renderView();toast("Document saved");break;}
    case "doc-del":if(arm(n,"Delete for good?")){deleteDoc(id);closeModal();renderSheet();renderView();toast("Document deleted");}break;

    /* ---- analytics ---- */
    case "mx-set":{const t=taskById(id),k=n.dataset.k;
      if(t[k]==null){t[k]=true;const o=k==="urgent"?"important":"urgent";if(t[o]==null)t[o]=false;}
      else t[k]=!t[k];
      save("tasks");render();break;}
    case "new-routine":routineModal(null);break;
    case "routine":case "routine-edit":routineModal(id);break;
    case "routine-save":saveRoutine(id||null);break;
    case "routine-delete":if(arm(n,"Delete for good?")){S.routines=S.routines.filter(r=>r.id!==id);save("routines");closeModal();render();toast("Routine deleted");}break;
    case "routine-done":{const k=id+"|"+n.dataset.date;if(S.completions[k])delete S.completions[k];else S.completions[k]=true;save("completions");render();break;}
    case "r-freq":{const v=n.dataset.v;M.dataset.freq=v==="interval"?"interval":"weekly";
      M.querySelectorAll('[data-act="r-freq"]').forEach(b=>b.classList.toggle("on",b===n));
      const days=M.querySelectorAll("#rDays button");
      if(v==="daily")days.forEach(b=>b.classList.add("on"));
      if(v==="weekdays")days.forEach(b=>b.classList.toggle("on",["1","2","3","4","5"].indexOf(b.dataset.v)>-1));
      el("rDaysWrap").style.opacity=v==="interval"?".4":"1";break;}
    case "r-day":n.classList.toggle("on");break;
    case "r-active":{const on=M.dataset.active!=="false";M.dataset.active=String(!on);n.classList.toggle("on",!on);el("rActiveLbl").textContent=!on?"Running":"Paused";break;}
    case "manage-cats":catsModal();break;
    case "cat-edit":catEditModal(id||null);break;
    case "cats-back":catsModal();break;
    case "cat-save":saveCat(id||null);break;
    case "cat-del":if(arm(n,"Delete?"))delCat(id);break;
    case "c-color":M.dataset.color=n.dataset.v;M.querySelectorAll('[data-act="c-color"]').forEach(b=>b.classList.toggle("on",b===n));break;
    case "c-icon":M.dataset.icon=n.dataset.v;M.querySelectorAll('[data-act="c-icon"]').forEach(b=>b.classList.toggle("on",b===n));break;
    case "new-note":{const nn={id:uid("n"),title:"",cat:S.categories[0].id,tags:[],pinned:false,html:"",actions:[],updated:Date.now()};
      S.notes.unshift(nn);V.view="notes";V.noteId=nn.id;V.q="";save("notes");render();const ti=el("noteTitle");if(ti)ti.focus();break;}
    case "note-open":V.noteId=id;renderView();break;
    case "scratch-task":scratchToTask();break;
    case "scratch-note":scratchToNote();break;
    case "gcal-ev":gcalEventModal(n.dataset.id);break;
    case "gcal-connect":gcalConnect();break;
    case "gcal-cancel":{const o=gcalBridge();if(o&&o.gcalCancel)o.gcalCancel();break;}
    case "gcal-sync":gcalSync();break;
    case "gcal-disconnect":if(arm(n,"Disconnect?"))gcalDisconnect();break;
    case "remind-test":remindTest();break;
    case "remind-allow":if(typeof Notification!=="undefined")
      Promise.resolve(Notification.requestPermission()).then(()=>{panels();remindSoon();});break;
    case "tm-break":if(V.tmBreak===id)closeTimeBreakdown();else{V.tmBreak=id;renderSheet();}break;
    case "dash-more":V.dashAll=!V.dashAll;renderView();break;
    case "dash-note":V.view="notes";V.noteId=id;V.q="";render();break;
    case "note-tag":V.noteTag=n.dataset.v;renderView();break;
    case "note-pin":{const x=noteById(id);x.pinned=!x.pinned;x.updated=Date.now();save("notes");renderView();break;}
    case "note-delete":if(arm(n,"Delete note?")){S.notes=S.notes.filter(x=>x.id!==id);V.noteId=null;save("notes");render();toast("Note deleted — tasks it created stay");}break;
    case "ai-add":addAction(n.dataset.nid);break;
    case "ai-done":{const x=noteById(n.dataset.nid);if(!x)break;
      const it=(x.actions||[]).find(y=>y.id===id);if(!it)break;
      if(it.taskId&&taskById(it.taskId))toggleTaskDone(it.taskId);else{it.done=!it.done;x.updated=Date.now();save("notes");render();}break;}
    case "ai-del":{const x=noteById(n.dataset.nid);if(!x)break;
      const it=(x.actions||[]).find(y=>y.id===id);
      if(it&&it.taskId)S.tasks=S.tasks.filter(t=>t.id!==it.taskId);
      x.actions=(x.actions||[]).filter(y=>y.id!==id);x.updated=Date.now();save("notes");save("tasks");render();toast("Action item and its task removed");break;}
    /* ---- setup ---- */
    case "ob-google":obSignIn();break;
    case "ob-cancel":{const o=gAcct();if(o&&o.gcalCancel)o.gcalCancel();break;}
    case "ob-local":S.prefs.storage="local";save("prefs");obGo(obNext());break;
    case "ob-back":OB.found=null;obGo(obPrev());break;
    case "ob-skip":obGo(obNext());break;
    case "ob-next":{
      if(OB.step==="data"){obDataNext();break;}
      if(OB.step==="name"){const v=(el("obName")||{}).value||"";S.prefs.name=v.trim();save("prefs");}
      if(OB.step==="routines")obRtCommit();
      obGo(obNext());break;}
    case "ob-finish":obFinish();break;
    case "ob-store":OB.store=n.dataset.v;obRender();break;
    case "ob-restore":if(OB.found){const d=OB.found.data;OB.found=null;applyBackup(d);OB.mode="restored";obGo(obNext());toast("Your planner is back");}break;
    case "ob-fresh":OB.found=null;OB.busy=true;obRender();driveBackup().then(()=>obGo(obNext()));break;
    case "ob-cal":OB.busy=true;OB.err="";obRender();
      googleAsk("calendar").then(ok=>{OB.busy=false;if(ok){gcalPrefs().off=false;save("prefs");gcalSync();}obRender();},
        e=>{OB.busy=false;OB.err=e.message;obRender();});break;
    case "ob-cat-pal":OB.pal=OB.pal===id?null:id;obRender();break;
    case "ob-cat-swatch":{const c=S.categories.find(x=>x.id===id);if(!c)break;
      c.color=n.dataset.v;OB.pal=null;save("categories");obRender();break;}
    case "ob-jump":OB.found=null;obGo(n.dataset.v);break;
    case "ob-cat-del":if(S.categories.length>1){S.categories=S.categories.filter(x=>x.id!==id);save("categories");obRender();}break;
    case "ob-cat-add":{const used=S.categories.map(x=>x.color),col=CAT_COLORS.find(x=>used.indexOf(x)<0)||CAT_COLORS[0],nid=uid("c");
      S.categories.push({id:nid,name:"New category",icon:"i-circle",color:col});save("categories");obRender();
      const f=document.querySelector('[data-act="ob-cat-name"][data-id="'+nid+'"]');if(f){f.focus();f.select();}break;}
    /* ---- the Google account, in Settings ---- */
    case "acct-signout":if(arm(n,"Sign out?")){const o=gAcct();if(!o)break;
      Promise.resolve(o.gcalDisconnect()).then(()=>o.gcalStatus()).then(st=>{GC.status=st;GC.events=[];GC.cals=[];
        closeModal();render();obStart();});}break;
    case "g-renew":wgRenew();break;
    case "drive-now":driveBackup().then(ok=>{if(ok)toast("Backed up to Google Drive");});break;
    case "drive-restore":if(arm(n,"Replace this planner?")){
      driveFind().then(f=>f?driveRead(f.id):null).then(d=>{const data=d&&(d.data||d);
        if(!data||!Array.isArray(data.tasks)){toast("There is no backup in your Drive yet");return;}
        applyBackup(data);closeModal();toast("Restored from Google Drive");}).catch(e=>toast(e.message));}break;
    case "settings":V.setTab="appearance";settingsModal();break;
    case "set-tab":V.setTab=n.dataset.v;settingsModal();break;
    case "set-theme":S.prefs.theme=n.dataset.v;save("prefs");applyAppearance();syncTimerWindow();panels();break;
    case "set-accent":S.prefs.accent=n.dataset.v;save("prefs");applyAppearance();syncTimerWindow();panels();break;
    case "backup-dir":pickBackupFolder();break;
    case "load-sample":{const keep=S.prefs;S=sampleState();S.prefs=Object.assign(S.prefs,keep,{setup:true});KEYS.forEach(function(k){touched[k]=true;save(k);});closeModal();applyAppearance();render();toast("Sample week loaded");break;}
    case "reset-all":if(arm(n,"Clear everything?")){
      /* Your settings are not your data: the theme, the accent and the vault
         you connected survive a clear-out. */
      const keep=S.prefs;
      S=blankState();
      S.prefs=Object.assign(S.prefs,keep,{setup:true,running:null});
      KEYS.forEach(function(k){touched[k]=true;save(k);});
      V.noteId=null;V.sheet=null;closeModal();applyAppearance();render();renderSheet();
      toast("Cleared — a fresh start");}break;
    case "export":exportData();break;
    case "import":el("importFile").value="";el("importFile").click();break;
    case "import-apply":applyImport();break;
    case "scratch":scratchModal();break;
    case "vault-pick":{const o=desktop();if(!o)break;
      Promise.resolve(o.chooseVault()).then(function(pth){
        if(!pth)return;
        S.prefs.vault=pth;save("prefs");
        S.docs.forEach(pushDocToVault);               // seed the folder with what exists
        panels();toast("Vault connected");
      });break;}
    case "vault-open":{const o=desktop();if(o&&o.openVault)o.openVault();break;}
    case "vault-forget":if(arm(n,"Disconnect?")){const o=desktop();
      if(o&&o.forgetVault)Promise.resolve(o.forgetVault()).then(function(){
        S.prefs.vault="";save("prefs");panels();toast("Vault disconnected");});}
      break;
    case "rte":document.execCommand(n.dataset.cmd,false,n.dataset.v||null);
      if(n.dataset.scratch){S.prefs.scratch=el("scratchPad").innerHTML;save("prefs");}
      else{const x=noteById(V.noteId);if(x){x.html=el("rte").innerHTML;x.updated=Date.now();save("notes");}}break;
    case "rte-link":linkBar(n.closest(".rte-bar"));break;
    case "rte-link-cancel":closeLinkBar();break;
    case "rte-link-apply":{const u=(el("linkUrl").value||"").trim();closeLinkBar();
      if(!u)break;
      if(!restoreSel()){toast("Select the words you want to link first");break;}
      document.execCommand("createLink",false,u);
      const x=noteById(V.noteId);if(x){x.html=el("rte").innerHTML;x.updated=Date.now();save("notes");}break;}
    case "close":closeModal();break;
  }
  }catch(err){if(window.console)console.error(err);
    toast("Couldn't do that: "+((err&&err.message)||"unknown error")+" · action "+a);}
});
document.addEventListener("mousedown",function(e){
  const t=e.target;if(!t||!t.closest)return;
  const b=t.closest('[data-act="rte"],[data-act="rte-link"],[data-act="scratch-task"],[data-act="scratch-note"]');
  if(b){saveSel();e.preventDefault();}
});
document.addEventListener("selectionchange",function(){
  const a=document.activeElement;if(a&&(a.id==="rte"||a.id==="scratchPad"))saveSel();
});
document.addEventListener("input",function(e){
  const t=e.target;
  if(t.id==="q"){V.q=t.value;renderView();return;}
  if(t.id==="rte"){const x=noteById(V.noteId);if(x){x.html=t.innerHTML;x.updated=Date.now();save("notes");}return;}
  if(t.id==="scratchPad"){S.prefs.scratch=t.innerHTML;save("prefs");return;}
  if(t.id==="obName"){const h=el("obxHi"),v=t.value.trim();if(h)h.textContent=dashGreeting()+(v?", "+v:"");return;}
  if(t.dataset&&t.dataset.act==="ob-cat-name"){t.size=Math.max(4,t.value.length);
    const p=document.querySelector('[data-planet="'+t.dataset.id+'"] span');if(p)p.textContent=t.value||"…";return;}
  if(t.id==="gcId"){GC.draft.id=t.value;return;}
  if(t.id==="gcSecret"){GC.draft.secret=t.value;return;}
  if(t.id==="noteTitle"){const x=noteById(V.noteId);if(x){x.title=t.value;x.updated=Date.now();save("notes");
    const li=document.querySelector(".nitem.on b");if(li)li.textContent=(x.pinned?"📌 ":"")+(t.value||"Untitled note");}return;}
  if(t.id==="aiText"&&e.inputType==="insertLineBreak")addAction(t.closest(".ai-add").querySelector('[data-act="ai-add"]').dataset.nid);
});
document.addEventListener("input",function(e){
  /* A colour input fires all the way through a drag. The page follows along
     so the choice can be judged in place, but the modal is left alone --
     redrawing it would tear the picker off its own input. */
  if(e.target&&e.target.dataset&&e.target.dataset.act==="set-accent-hex"){
    setCustomAccent(e.target.value);
    const note=document.querySelector(".accent-note");
    if(note){
      const b=note.querySelector("b");if(b)b.textContent=S.prefs.accentHex;
      const lab=note.querySelector("span");if(lab)lab.textContent="Your own colour";
    }
    const tri=accentTrio(S.prefs.accentHex);
    e.target.classList.remove("empty");
    e.target.classList.add("on");
    e.target.style.setProperty("--dot",isDark()?tri.lift:tri.base);
    document.querySelectorAll('[data-act="set-accent"]').forEach(function(el){
      el.classList.remove("on");el.setAttribute("aria-pressed","false");});
    return;
  }
  if(e.target&&e.target.id==="dcMd"){
    const prev=el("dcPrev");
    if(prev)prev.innerHTML=mdToHtml(e.target.value);
  }
});
document.addEventListener("keydown",function(e){
  if(e.key==="Escape"&&el("modalRoot").innerHTML){closeModal();return;}
  if(e.key==="Escape"&&V.tmBreak){closeTimeBreakdown();return;}
  if(e.key==="Escape"&&V.sheet&&!el("modalRoot").innerHTML){closeSheet();return;}
  if(e.key==="Escape"&&document.body.classList.contains("rail-open")){closeRail();return;}
  if(e.key==="Enter"&&OB.open&&!PK.el){const t=e.target;
    if(t.dataset&&t.dataset.act==="ob-cat-name"){e.preventDefault();t.blur();return;}
    if(t.id==="obName"||t===document.body||(t.closest&&t.closest("#obRoot")&&/^(H1|SECTION|MAIN|DIV)$/.test(t.tagName))){
      e.preventDefault();const b=document.querySelector('#obRoot [data-act="ob-next"],#obRoot [data-act="ob-finish"]');
      if(b&&!b.disabled)b.click();return;}}
  if(e.key==="Enter"&&e.target.id==="linkUrl"){e.preventDefault();
    const b=document.querySelector('[data-act="rte-link-apply"]');if(b)b.click();return;}
  if(e.key==="Enter"&&e.target.id==="aiText"){e.preventDefault();
    const b=document.querySelector('[data-act="ai-add"]');if(b)addAction(b.dataset.nid);return;}
  if(e.key==="Enter"&&e.target.id==="dashQuick"){e.preventDefault();quickAdd();return;}
  if(e.key==="Enter"&&e.target.id==="rTitle"){e.preventDefault();
    const b=document.querySelector('[data-act="routine-save"]');if(b)b.click();return;}
  /* The sheet has no save button: leaving the field is what commits it. */
  if(e.key==="Enter"&&e.target.id==="shTitle"){e.preventDefault();e.target.blur();}
});
document.addEventListener("keydown",function(e){
  if(e.key!=="Enter")return;
  const t=e.target;
  if(t&&t.id==="shTag"){
    e.preventDefault();
    const v=t.value.trim().replace(/^#/,""),cur=sheetTask();
    if(v&&cur&&tTags(cur).indexOf(v)===-1)patchCurrent({tags:tTags(cur).concat([v])});
    else t.value="";
    return;
  }
  if(t&&t.id==="shComment"&&(e.metaKey||e.ctrlKey)){
    e.preventDefault();
    const btn=document.querySelector('[data-act="comment-add"]');
    if(btn)btn.click();
  }
});
document.addEventListener("change",function(e){
  const t=e.target;
  const cs=t.tagName==="SELECT"&&t.closest(".catsel");
  if(cs){const c=t.value?cat(t.value):null;cs.style.setProperty("--c",c?c.color:"transparent");cs.classList.toggle("none",!c);}
  if(t.id==="importFile"){importPicked(t.files&&t.files[0]);return;}
  if(t.id==="dashQuickCat"){S.prefs.quickCat=t.value;save("prefs");return;}
  if(t.dataset&&t.dataset.act==="gcal-cal"){
    gcalPrefs().cals[t.dataset.id]=t.checked;save("prefs");GC.from="";
    gcalFetchShown(true).catch(e=>{GC.err=e.message;}).then(()=>{softRender();panels();});
    return;
  }
  if(t.dataset&&t.dataset.act==="f"){V.f[t.dataset.k]=t.value;renderView();return;}
  if(t.dataset&&t.dataset.act==="set-accent-hex"){
    setCustomAccent(t.value);save("prefs");syncTimerWindow();render();panels();return;
  }
  if(t.dataset&&t.dataset.act==="set-pref"){
    const k=t.dataset.k,v=t.type==="checkbox"?t.checked:t.value;
    if(k.indexOf(".")>-1){const[a,b]=k.split(".");
      /* In place, not a copy: a sync in flight holds this object. */
      S.prefs[a]=S.prefs[a]||{};S.prefs[a][b]=v;
      if(a==="autoBackup"&&b==="on"&&v&&!S.prefs.autoBackup.dir)pickBackupFolder();
      if(a==="gcal")gcalSoon();
    }else S.prefs[k]=(k==="weekStart")?Number(v):v;
    if(k==="launch")S.prefs.launchSet=true;
    save("prefs");applyAppearance();render();panels();return;
  }
  /* setup: a category renamed, a starter routine ticked or given a time */
  if(t.dataset&&t.dataset.act==="ob-cat-name"){const c=S.categories.find(x=>x.id===t.dataset.id);
    if(c){c.name=t.value.trim()||c.name;t.value=c.name;save("categories");}return;}
  if(t.dataset&&t.dataset.act==="ob-rt"){const x=obRt().find(r=>r.k===t.dataset.k);if(x){x.on=t.checked;OB.pop=x.on?x.k:null;}obRender();
    const f=document.querySelector('#obRoot [data-act="ob-rt"][data-k="'+t.dataset.k+'"]');if(f)f.focus({preventScroll:true});return;}
  if(t.dataset&&t.dataset.act==="ob-rt-time"){const x=obRt().find(r=>r.k===t.dataset.k);if(x&&t.value)x.time=t.value;return;}
  /* Drive backup switched on asks Google for Drive first, if it has not yet. */
  if(t.dataset&&t.dataset.act==="drive-toggle"){
    if(!t.checked){S.prefs.storage="local";save("prefs");panels();return;}
    const on=()=>{S.prefs.storage="drive";save("prefs");driveBackup().then(ok=>{if(ok)toast("Backed up to Google Drive");});panels();};
    if(acctParts().drive)on();
    else googleAsk("drive").then(ok=>{if(ok)on();else panels();},e=>{DB.err=e.message;panels();});
    return;
  }
  if(t.dataset&&t.dataset.act==="sh-set"){
    const k=t.dataset.k;let v=t.value;
    if(k==="est")v=Math.max(0,parseInt(v,10)||0);
    if(k==="remind")v=v==="d"?null:v==="off"?false:Number(v);
    /* No date, no times. */
    if(k==="due"&&!v){patchCurrent({due:"",dueTime:"",endTime:""});return;}
    /* A new start time keeps the length the task already had, as moving an
       event in Google does; the first one gets an hour. */
    if(k==="dueTime"){const cur=sheetTask()||{};
      if(!v){patchCurrent({dueTime:"",endTime:""});return;}
      const len=cur.dueTime&&cur.endTime?Math.max(15,hm2m(cur.endTime)-hm2m(cur.dueTime)):60;
      patchCurrent({dueTime:v,endTime:m2hm(Math.min(hm2m(v)+len,24*60-1))});return;}
    if(k==="endTime"){const cur=sheetTask()||{};
      if(v&&cur.dueTime&&hm2m(v)<=hm2m(cur.dueTime)){toast("The end time has to be after the start");renderSheet();return;}}
    if(k==="deadline"&&!v&&V.sheet)V.sheet.dl=false;
    if(k==="title"){v=v.trim();if(!v){const cur=sheetTask();t.value=cur?cur.title:"";return;}}
    // Re-rendering while the caret is in a text field would throw it away.
    patchCurrent({[k]:v},k!=="title"&&k!=="desc");
    return;
  }
  /* All day clears the times; unticked, it offers the next hour today, or
     nine in the morning on any other day, an hour long. */
  if(t.dataset&&t.dataset.act==="sh-allday"){
    const cur=sheetTask();if(!cur)return;
    if(t.checked){patchCurrent({dueTime:"",endTime:""});return;}
    const s=cur.due===TODAY()?Math.min(23*60,(new Date().getHours()+1)*60):9*60;
    patchCurrent({dueTime:m2hm(s),endTime:m2hm(Math.min(s+60,24*60-1))});return;
  }
  if(t.dataset&&t.dataset.act==="sh-link-add"&&t.value){
    const cur=sheetTask();
    if(cur)patchCurrent({links:tLinks(cur).concat([t.value])});
    return;
  }
  if(t.id==="shSubs"||(t.closest&&t.closest("#shSubs"))){commitSubs();return;}
  if(t.id==="orbitFile"){takeAttachment(t.files&&t.files[0]);return;}
  if(t.id==="noteCat"){const x=noteById(V.noteId);if(x){x.cat=t.value;x.updated=Date.now();save("notes");render();}return;}
  if(t.id==="noteTags"){const x=noteById(V.noteId);if(x){x.tags=t.value.split(",").map(s=>s.trim().replace(/^#/,"")).filter(Boolean);x.updated=Date.now();save("notes");renderView();}return;}
});
let dragId=null;
document.addEventListener("dragstart",function(e){const c=e.target.closest&&e.target.closest(".tcard");if(!c)return;
  dragId=c.dataset.id;c.classList.add("dragging");e.dataTransfer.effectAllowed="move";try{e.dataTransfer.setData("text/plain",dragId);}catch(_){}});
document.addEventListener("dragend",function(e){const c=e.target.closest&&e.target.closest(".tcard");if(c)c.classList.remove("dragging");
  document.querySelectorAll(".col.over").forEach(x=>x.classList.remove("over"));dragId=null;});
document.addEventListener("dragover",function(e){const col=e.target.closest&&e.target.closest(".col");if(!col||!dragId)return;
  e.preventDefault();e.dataTransfer.dropEffect="move";col.classList.add("over");});
document.addEventListener("dragleave",function(e){const col=e.target.closest&&e.target.closest(".col");
  if(col&&!col.contains(e.relatedTarget))col.classList.remove("over");});
document.addEventListener("drop",function(e){const col=e.target.closest&&e.target.closest(".col");if(!col||!dragId)return;
  e.preventDefault();col.classList.remove("over");
  const t=taskById(dragId);
  if(t&&t.status!==col.dataset.col){t.status=col.dataset.col;t.completedAt=t.status==="completed"?TODAY():null;save("tasks");render();}
  dragId=null;});

/* ============ init ============ */
window.addEventListener("error",function(e){
  if(!e||!e.message||(e.target&&e.target!==window))return;
  toast("Page error: "+e.message);
});
window.addEventListener("unhandledrejection",function(e){
  const m=e&&e.reason&&(e.reason.message||e.reason.code);
  if(m)toast("Sync issue: "+m);
});
/* ============ activity log ============ */
/* Everything that happens to a task lands here: comments and documents you
   write, plus an automatic entry for every field that changes. */
const FIELD_LABEL={title:"Title",desc:"Description",due:"Date",start:"Start date",deadline:"Deadline",endTime:"End time",
  status:"Status",cat:"Category",est:"Estimate",urgent:"Urgent",important:"Important",
  tags:"Tags",links:"Linked tasks",subtasks:"Subtasks",attachments:"Attachments",
  dueTime:"Start time",remind:"Reminder"};

const actFor=id=>S.activity.filter(a=>a.task===id).sort((a,b)=>a.at-b.at);

function logAct(taskId,kind,text,meta){
  if(!Array.isArray(S.activity))S.activity=[];
  S.activity.push({id:uid("a"),task:taskId,at:Date.now(),kind:kind,text:text||"",meta:meta||null});
  save("activity");
}

/* Render a field value the way a person would say it, not the way it is stored. */
function fieldText(k,v){
  if(k==="remind")return remindLabel({remind:v});
  if(k==="dueTime"||k==="endTime")return v?fmtTime(v):"no time";
  if(v==null||v===""||(Array.isArray(v)&&!v.length))return "empty";
  if(k==="status")return ST(v).name;
  if(k==="cat")return cat(v).name;
  if(k==="due"||k==="start"||k==="deadline")return fmtDate(v);
  if(k==="est")return fmtMins(Number(v)||0);
  if(k==="urgent"||k==="important")return v?"yes":"no";
  if(k==="tags")return v.join(", ");
  if(k==="links")return v.length+(v.length===1?" task":" tasks");
  if(k==="subtasks"||k==="attachments")return v.length+" item"+(v.length===1?"":"s");
  return String(v);
}
const sameVal=(a,b)=>JSON.stringify(a==null?"":a)===JSON.stringify(b==null?"":b);

/* One entry per changed field, so the thread reads as a history. */
function logChanges(id,before,after){
  Object.keys(FIELD_LABEL).forEach(k=>{
    if(sameVal(before[k],after[k]))return;
    if(k==="subtasks"||k==="attachments"){
      if((before[k]||[]).length===(after[k]||[]).length)return;   // ticking a subtask is not a field change
    }
    logField(id,k,before[k],after[k]);
  });
}

/* Still-warm edits to the same field fold into the entry already there, so a
   run of fiddling reads as one change. Land back where you started and the
   entry goes away entirely rather than recording a round trip. */
const FOLD_MS=10*60*1000;
function logField(id,k,from,to){
  const now=Date.now();
  let prev=null;
  for(let i=S.activity.length-1;i>=0;i--){
    const a=S.activity[i];
    if(a.task!==id||now-a.at>FOLD_MS)continue;
    if(a.kind==="field"&&a.meta&&a.meta.f===k){prev=a;break;}
  }
  if(prev){
    if(sameVal(prev.meta.from,to)){
      S.activity=S.activity.filter(a=>a.id!==prev.id);
      save("activity");return;
    }
    prev.meta.to=to;prev.at=now;
    prev.text=FIELD_LABEL[k]+": "+fieldText(k,prev.meta.from)+" → "+fieldText(k,to);
    save("activity");return;
  }
  logAct(id,"field",FIELD_LABEL[k]+": "+fieldText(k,from)+" → "+fieldText(k,to),{f:k,from:from,to:to});
}

/* ============ time tracking ============ */
/* Two modes. Countdown runs against the task's estimate and keeps going once
   it passes zero, so overtime is visible rather than hidden. Stopwatch just
   counts up, for work you cannot estimate yet. Either way each run is stored
   as a session, and a task's total is the sum of its sessions. */
const sessionsFor=id=>S.sessions.filter(s=>s.task===id).sort((a,b)=>b.start-a.start);
const trackedSecs=id=>S.sessions.reduce((n,s)=>n+(s.task===id?(s.secs||0):0),0);
const running=()=>(S.prefs&&S.prefs.running)||null;

function fmtDur(secs){
  const s=Math.max(0,Math.round(secs)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),ss=s%60;
  return (h?h+":"+pad(m):m)+":"+pad(ss);
}
function fmtMins(m){
  m=Math.round(Number(m)||0);
  if(!m)return "none";
  const h=Math.floor(m/60),mm=m%60;
  return (h?h+"h":"")+(h&&mm?" ":"")+(mm||!h?mm+"m":"");
}
/* Seconds on the clock right now, including the run in progress. */
function liveSecs(){
  const r=running();if(!r)return 0;
  return (r.acc||0)+(r.since?Math.floor((Date.now()-r.since)/1000):0);
}
function startTimer(taskId){
  const r=running();
  if(r&&r.task!==taskId)stopTimer();          // one task at a time
  const cur=running();
  S.prefs.running=cur&&cur.task===taskId
    ? Object.assign({},cur,{since:Date.now()})
    : {task:taskId,acc:0,since:Date.now(),began:Date.now()};
  save("prefs");syncTimerWindow();render();renderSheet();
}
function pauseTimer(){
  const r=running();if(!r||!r.since)return;
  S.prefs.running=Object.assign({},r,{acc:liveSecs(),since:0});
  save("prefs");syncTimerWindow();render();renderSheet();
}
function stopTimer(){
  const r=running();if(!r)return;
  const secs=liveSecs();
  S.prefs.running=null;
  if(secs>=5){                                 // a five second run is a misclick, not work
    S.sessions.push({id:uid("s"),task:r.task,start:r.began,end:Date.now(),secs:secs});
    save("sessions");
    logAct(r.task,"time","Tracked "+fmtDur(secs),{secs:secs});
  }
  save("prefs");syncTimerWindow();render();renderSheet();
  if(secs>=5)askIfDone(r.task,secs);
}

/* Stopping usually means finishing, but not always, so it is offered rather
   than assumed. */
function askIfDone(taskId,secs){
  const t=taskById(taskId);
  if(!t||t.status==="completed")return;
  const est=tEst(t)*60,total=trackedSecs(taskId);
  const verdict=est?(total>est?"That is "+fmtDur(total-est)+" over your "+fmtMins(est/60)+" estimate."
                             :"That is inside your "+fmtMins(est/60)+" estimate, with "+fmtDur(est-total)+" to spare.")
                  :"";
  openModal('<div class="modal modal-sm" role="dialog" aria-modal="true" aria-label="Finished?">'+
    '<div class="mbody">'+
      '<h2 style="font-size:17px;margin-bottom:6px">Logged '+esc(fmtDur(secs))+' on “'+esc(t.title)+'”</h2>'+
      '<p class="mnone" style="margin:0">'+esc(verdict||"Nothing was estimated for this one.")+'</p>'+
    '</div>'+
    '<div class="mfoot"><div class="spacer" style="flex:1"></div>'+
      '<button class="btn" data-act="close">Not yet</button>'+
      '<button class="btn btn-primary" data-act="done-after-timer" data-id="'+taskId+'">'+icon("i-check")+'Mark complete</button>'+
    '</div></div>');
}

function toggleTimer(taskId){
  const r=running();
  if(r&&r.task===taskId&&r.since)pauseTimer();
  else startTimer(taskId);
}

/* The strip that sits in the top bar whenever a timer exists. */
function timerBar(){
  const r=running();if(!r)return "";
  const t=taskById(r.task);if(!t)return "";
  const c=cat(t.cat),secs=liveSecs(),est=tEst(t)*60;
  const over=est&&secs>est;
  return '<div class="tbar'+(over?" over":"")+(r.since?"":" held")+'" style="--c:'+c.color+'">'+
    '<button class="tbar-btn" data-act="timer-toggle" data-id="'+t.id+'" aria-label="'+(r.since?"Pause":"Resume")+'">'+icon(r.since?"i-pause":"i-play","ic-14")+'</button>'+
    '<span class="tbar-name">'+esc(t.title)+'</span>'+
    '<span class="tbar-time num">'+fmtDur(secs)+(est?'<em> of '+esc(fmtMins(est/60))+'</em>':"")+'</span>'+
    '<button class="tbar-btn" data-act="timer-stop" aria-label="Stop and log">'+icon("i-stop","ic-14")+'</button>'+
    '<button class="tbar-btn" data-act="timer-pop" aria-label="Pop out the timer" title="Pop out">'+icon("i-pop","ic-14")+'</button>'+
    '</div>';
}

/* ============ documents ============ */
/* Documents are markdown, so they can live in an Obsidian vault unchanged. */
const docsFor=id=>S.docs.filter(d=>d.task===id).sort((a,b)=>b.updated-a.updated);
const docById=id=>S.docs.find(d=>d.id===id);

/* A deliberately small markdown renderer for the preview: headings, emphasis,
   code, quotes, lists, task boxes, rules and links. Everything is escaped
   before any markup is added. */
function mdToHtml(md){
  const lines=String(md||"").split(/\r?\n/),out=[];
  let list=null,fence=false,buf=[];
  const inline=s=>esc(s)
    .replace(/`([^`]+)`/g,"<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g,"<b>$1</b>")
    .replace(/(^|[^*])\*([^*]+)\*/g,"$1<i>$2</i>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  const shut=()=>{if(list){out.push("</"+list+">");list=null;}};
  const open=tag=>{if(list!==tag){shut();out.push("<"+tag+">");list=tag;}};
  lines.forEach(raw=>{
    const l=raw.replace(/\s+$/,"");
    if(/^```/.test(l)){
      if(fence){out.push("<pre><code>"+esc(buf.join("\n"))+"</code></pre>");buf=[];fence=false;}
      else{shut();fence=true;}
      return;
    }
    if(fence){buf.push(raw);return;}
    if(!l.trim()){shut();return;}
    let m;
    if(/^---+$/.test(l)){shut();out.push("<hr>");return;}
    if((m=l.match(/^(#{1,4})\s+(.*)$/))){shut();const n=Math.min(m[1].length+1,5);out.push("<h"+n+">"+inline(m[2])+"</h"+n+">");return;}
    if((m=l.match(/^&gt;\s?(.*)$/))||(m=l.match(/^>\s?(.*)$/))){shut();out.push("<blockquote>"+inline(m[1])+"</blockquote>");return;}
    if((m=l.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/))){open("ul");
      out.push('<li class="md-task"><span class="md-box'+(m[1]===" "?"":" on")+'"></span>'+inline(m[2])+"</li>");return;}
    if((m=l.match(/^[-*]\s+(.*)$/))){open("ul");out.push("<li>"+inline(m[1])+"</li>");return;}
    if((m=l.match(/^\d+[.)]\s+(.*)$/))){open("ol");out.push("<li>"+inline(m[1])+"</li>");return;}
    shut();out.push("<p>"+inline(l)+"</p>");
  });
  if(fence&&buf.length)out.push("<pre><code>"+esc(buf.join("\n"))+"</code></pre>");
  shut();
  return out.join("");
}

/* A filename Obsidian is happy with, stable for a given document. */
function docFile(d){
  const base=String(d.title||"Untitled").replace(/[\\/:*?"<>|#^[\]]/g,"").replace(/\s+/g," ").trim().slice(0,80);
  return (base||"Untitled")+" "+d.id.slice(-6)+".md";
}
/* What actually gets written to the vault: front matter Obsidian can read,
   then the body. */
function docFileBody(d){
  const t=taskById(d.task),c=t?cat(t.cat):null;
  return "---\ntitle: "+JSON.stringify(String(d.title||"Untitled"))+
    "\ntask: "+JSON.stringify(t?t.title:"")+
    (c?"\ncategory: "+JSON.stringify(c.name):"")+
    "\nupdated: "+new Date(d.updated||Date.now()).toISOString()+
    "\norbit-id: "+d.id+
    "\n---\n\n"+String(d.md||"");
}
/* The inverse, for changes coming back from the vault. */
function stripFrontMatter(text){
  const m=String(text||"").match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m?String(text).slice(m[0].length).replace(/^\r?\n/,""):String(text||"");
}

function saveDoc(id,taskId,title,md){
  let d=id?docById(id):null;
  const now=Date.now();
  if(d){
    const changed=d.md!==md||d.title!==title;
    d.title=title;d.md=md;d.updated=now;
    if(changed)logAct(d.task,"doc-edit","Edited the document “"+title+"”",{doc:d.id});
  }else{
    d={id:uid("d"),task:taskId,title:title,md:md,created:now,updated:now};
    S.docs.push(d);
    logAct(taskId,"doc","Added the document “"+title+"”",{doc:d.id});
  }
  save("docs");pushDocToVault(d);
  return d;
}
function deleteDoc(id){
  const d=docById(id);if(!d)return;
  S.docs=S.docs.filter(x=>x.id!==id);
  save("docs");logAct(d.task,"doc-del","Deleted the document “"+d.title+"”");
  removeDocFromVault(d);
}


/* ============ task detail panel ============ */
/* A sheet over the right-hand side rather than a full screen: the task's
   fields at the top, its history underneath. Fields save as you leave them,
   so there is no save button to forget. */

function openSheet(id,preset){
  if(id&&!taskById(id))return;
  V.tmBreak=null;
  V.sheet={id:id||null,tab:"details",
    draft:id?null:Object.assign({title:"",desc:"",due:"",dueTime:"",endTime:"",deadline:"",cat:S.categories[0].id,
      status:"backlog",urgent:null,important:null,est:0,tags:[],links:[],subtasks:[],attachments:[]},preset||{})};
  renderSheet();
}
function closeSheet(){V.sheet=null;V.tmBreak=null;renderSheet();clearGhosts();}

/* The task being shown, or the unsaved draft for a new one. */
const sheetTask=()=>{const s=V.sheet;return s?(s.id?taskById(s.id):s.draft):null;};

function patchTask(id,patch,redraw){
  const t=taskById(id);if(!t)return;
  const before=JSON.parse(JSON.stringify(t));
  Object.assign(t,patch);
  if(t.status==="completed"&&!t.completedAt)t.completedAt=TODAY();
  if(t.status!=="completed")t.completedAt=null;
  logChanges(id,before,t);
  save("tasks");render();
  if(redraw!==false)renderSheet();
}
/* A draft has no id yet, so edits are held until it is created. */
function patchDraft(patch){
  if(V.sheet&&V.sheet.draft)Object.assign(V.sheet.draft,patch);
  /* The placeholder on the grid showed the times it was dragged to. */
  if("due" in patch||"dueTime" in patch||"endTime" in patch)clearGhosts();
}
function patchCurrent(patch,redraw){
  const s=V.sheet;if(!s)return;
  if(s.id)patchTask(s.id,patch,redraw);
  else{patchDraft(patch);if(redraw!==false)renderSheet();}
}
function createFromDraft(){
  const s=V.sheet;if(!s||!s.draft)return;
  const d=s.draft;
  if(!d.title.trim()){toast("Give the task a name first");const n=el("shTitle");if(n)n.focus();return;}
  const t=Object.assign({id:uid("t"),created:TODAY(),completedAt:null},d);
  S.tasks.push(t);save("tasks");
  logAct(t.id,"created","Created this task");
  V.sheet={id:t.id,tab:"activity",draft:null};
  render();renderSheet();toast("Task added");
}

const metaRow=(label,inner,ic)=>'<div class="mrow"><div class="mlab">'+(ic?icon(ic,"ic-14"):"")+esc(label)+'</div><div class="mval">'+inner+'</div></div>';

/* When, the way Google Calendar asks it: a date, then a start and an end
   time on the same line -- or, ticked, all day -- and apart from both, a
   deadline, which stays out of the way behind "Add deadline" until a task
   needs one. The times wait for a date to hang on. */
function sheetDates(t){
  const day=t.due||"",all=!t.dueTime,open=!!(V.sheet&&V.sheet.dl);
  const line='<div class="when-line">'+
    dateField('data-act="sh-set" data-k="due"',day,{sm:1,long:1,label:"Date",ph:"Add a date",cls:"when-date"})+
    (day&&!all?timeField('data-act="sh-set" data-k="dueTime"',t.dueTime,{sm:1,label:"Start time",req:1,cls:"when-time"})+
      '<span class="when-dash" aria-hidden="true">–</span>'+
      timeField('data-act="sh-set" data-k="endTime"',t.endTime||m2hm(tSpan(t).end),{sm:1,label:"End time",req:1,after:t.dueTime,cls:"when-time"}):"")+
    '</div>';
  const allday=day?'<label class="when-all"><input type="checkbox" data-act="sh-allday"'+(all?" checked":"")+'><span>All day</span></label>':"";
  const dl=t.deadline||open
    ? '<div class="when-dl">'+icon("i-deadline","ic-14")+'<span class="when-dl-k">Deadline</span>'+
        dateField('data-act="sh-set" data-k="deadline"',t.deadline,{sm:1,label:"Deadline",ph:"Pick a deadline",cls:"when-dl-f"})+'</div>'
    : '<button class="when-add" data-act="sh-deadline">'+icon("i-deadline","ic-14")+'Add deadline</button>';
  return '<div class="when">'+line+allday+dl+'</div>';
}

/* ============ pickers ============
   Every date, time and drop-down in the planner opens the same pop-over: a
   card in the panel colours with a header, a body and a footer, and options
   that are the same rows everywhere, the chosen one filled in the accent.
   The browser's own pickers came in whatever grey the operating system
   chose, and matched nothing else on the page.

   A date or time field is a button showing the value in words, beside a
   hidden input that holds it. Picking writes the input and fires a real
   change event from it, so every handler that already existed --
   data-act="sh-set", "set-pref", "f", or a read by id when a form saves --
   goes on working untouched.

   A <select> keeps its own element, so its value, its handlers and its
   keyboard arrows stay native: only the mousedown that would open the
   browser's list is stopped, and the pop-over lists its options instead.
   On a touch screen the phone's own picker is the better one, so there it
   is left alone.

   The pop-over lives on <body>, not in the field, so the overflow of a
   modal or the panel cannot clip it; it is placed against the field and
   follows it when the page scrolls. */
const PK={el:null,src:null,btn:null,kind:"",month:null,focus:""};
const TP_PARTS=[["Night",0,6],["Morning",6,12],["Afternoon",12,17],["Evening",17,24]];
const pkDateText=v=>{const d=parseD(v);return DOWS[(d.getDay()+6)%7]+" "+fmtDate(v);};
/* "Wednesday, 9 September", as Google writes the date of an event. */
const pkLongDate=v=>{const d=parseD(v);
  return d.toLocaleDateString(undefined,Object.assign({weekday:"long",day:"numeric",month:"long"},d.getFullYear()===today().getFullYear()?{}:{year:"numeric"}));};
const pkText=(kind,v,fmt)=>kind==="date"?(fmt==="long"?pkLongDate(v):pkDateText(v)):fmtTime(v);
/* How long an end time makes it: 30 mins, 1 hr, 1.5 hrs. */
const durLabel=m=>m<60?m+" mins":(Math.round(m/60*100)/100)+(m===60?" hr":" hrs");
function pickField(kind,attrs,val,o){
  o=o||{};val=val||"";
  const txt=val?pkText(kind,val,o.long?"long":""):(o.ph||(kind==="date"?"Pick a date":"Pick a time"));
  return '<span class="pkf">'+
    '<button type="button" class="inp'+(o.sm?" inp-sm":"")+(o.cls?" "+o.cls:"")+' pk-btn'+(val?"":" is-empty")+'" data-act="pk-open" data-pk="'+kind+'"'+
      ' data-ph="'+esc(o.ph||(kind==="date"?"Pick a date":"Pick a time"))+'"'+(o.req?' data-req="1"':"")+' data-label="'+esc(o.label||"")+'"'+(o.long?' data-fmt="long"':"")+(o.after?' data-after="'+esc(o.after)+'"':"")+
      ' aria-label="'+esc((o.label?o.label+": ":"")+txt)+'" aria-haspopup="dialog" aria-expanded="false"'+(o.disabled?" disabled":"")+'>'+
      '<span class="pk-val">'+esc(txt)+'</span>'+icon(kind==="date"?"i-calendar":"i-clock","ic-14")+'</button>'+
    '<input type="hidden" '+attrs+' value="'+esc(val)+'"></span>';
}
const dateField=(attrs,val,o)=>pickField("date",attrs,val,o);
const timeField=(attrs,val,o)=>pickField("time",attrs,val,o);
const pkCoarse=()=>{try{return matchMedia("(pointer:coarse)").matches;}catch(e){return false;}};
const pkSelectable=s=>s&&s.tagName==="SELECT"&&!s.multiple&&!(s.size>1)&&!s.disabled&&!pkCoarse();

/* Redraws replace the field under an open pop-over -- a sync landing, the
   panel refreshing. The field is found again by what it writes to, so the
   pop-over stays with it rather than writing into a detached copy. */
function pkKey(s){
  if(s.id)return "#"+CSS.escape(s.id);
  const a=s.dataset.act,k=s.dataset.k;
  return s.tagName.toLowerCase()+(s.tagName==="INPUT"?'[type="hidden"]':"")+
    (a?'[data-act="'+a+'"]':"")+(k?'[data-k="'+k+'"]':"");
}
function pkRelink(){
  if(!PK.el)return;
  if(PK.src.isConnected&&PK.btn.isConnected)return;
  const s=PK.key&&document.querySelector(PK.key);
  if(!s||s.closest(".pk")){pkClose();return;}
  PK.src=s;PK.btn=s.tagName==="SELECT"?s:s.parentNode.querySelector(".pk-btn");
  if(!PK.btn){pkClose();return;}
  pkMark(true);pkPlace();
}
function pkMark(on){
  const b=PK.btn;if(!b)return;
  b.classList.toggle("pk-on",on);
  if(b.tagName!=="SELECT")b.setAttribute("aria-expanded",String(on));
}

function pkOpen(btn){
  const sel=btn.tagName==="SELECT";
  const src=sel?btn:btn.parentNode.querySelector('input[type="hidden"]');
  if(!src||btn.disabled)return;
  if(PK.src===src){pkClose();return;}
  pkClose();
  Object.assign(PK,{src:src,btn:btn,kind:sel?"select":btn.dataset.pk,key:pkKey(src)});
  if(PK.kind==="date"){const d=src.value?parseD(src.value):today();
    PK.month=new Date(d.getFullYear(),d.getMonth(),1);PK.focus=src.value||TODAY();}
  const p=document.createElement("div");
  p.className="pk pk-"+PK.kind;p.setAttribute("role","dialog");
  p.setAttribute("aria-label",sel?"Choose an option":PK.kind==="date"?"Pick a date":"Pick a time");
  document.body.appendChild(p);PK.el=p;
  pkDraw();pkMark(true);pkPlace();
  if(PK.kind==="time"){
    const list=p.querySelector(".pk-body"),aim=p.querySelector(".pk-opt.aim");
    if(list&&aim)list.scrollTop=aim.offsetTop-list.offsetTop-list.clientHeight/2+aim.offsetHeight/2;
    const inp=el("pkType");if(inp){inp.focus();inp.select();}
  }else if(PK.kind==="date"){pkFocusDay();}
  else{
    const on=p.querySelector(".pk-opt.on")||p.querySelector(".pk-opt");
    const find=el("pkFind");
    if(on){const list=p.querySelector(".pk-body");list.scrollTop=on.offsetTop-list.offsetTop-list.clientHeight/2+on.offsetHeight/2;}
    if(find)find.focus();else if(on)on.focus();
  }
}
function pkClose(refocus){
  if(!PK.el)return;
  const b=PK.btn;
  PK.el.remove();pkMark(false);
  Object.assign(PK,{el:null,src:null,btn:null,kind:"",key:""});
  if(refocus&&b&&b.isConnected)b.focus({preventScroll:true});
}
/* Below the field, or above it when there is no room below; never off the
   side of the window. A select's list is at least as wide as the select. */
function pkPlace(){
  const p=PK.el,b=PK.btn;if(!p||!b)return;
  if(!b.isConnected){pkRelink();return;}
  const r=b.getBoundingClientRect(),vw=innerWidth,vh=innerHeight,gap=6;
  if(PK.kind==="select")p.style.width=Math.max(200,Math.min(340,r.width))+"px";
  const w=p.offsetWidth,h=p.offsetHeight;
  let top=r.bottom+gap;
  if(top+h>vh-8)top=r.top-gap-h>8?r.top-gap-h:Math.max(8,vh-h-8);
  p.style.left=Math.round(Math.min(Math.max(8,r.left),vw-w-8))+"px";
  p.style.top=Math.round(top)+"px";
}
function pkDraw(){
  const p=PK.el;if(!p)return;
  p.innerHTML=PK.kind==="date"?pkDateHtml():PK.kind==="time"?pkTimeHtml():pkSelectHtml();
}
function pkFoot(left,clear){
  return '<div class="pk-foot"><span>'+left+'</span>'+
    (clear?'<button type="button" class="pk-clear" data-act="pk-clear">'+icon("i-x","ic-14")+esc(clear)+'</button>':"")+'</div>';
}
const pkClearable=()=>PK.src.value&&!PK.btn.dataset.req;

/* ---- the date picker ----
   A month at a time, always six rows so it does not change height as you
   page through, the week starting on the day Settings says. Today is ringed,
   the chosen day filled. The shortcuts across the top are the three dates
   most tasks get. */
function pkDateHtml(){
  const v=PK.src.value,m=PK.month,t=TODAY(),y=m.getFullYear(),mo=m.getMonth();
  const start=startOfWeek(m),quick=[["Today",t],["Tomorrow",ymd(addDays(today(),1))],
    ["Next week",ymd(addDays(startOfWeek(today()),7))]];
  let days="";
  for(let i=0;i<42;i++){const d=addDays(start,i),s=ymd(d);
    days+='<button type="button" class="pk-day'+(d.getMonth()!==mo?" out":"")+(s===t?" today":"")+(s===v?" on":"")+'"'+
      ' data-act="pk-day" data-v="'+s+'" tabindex="'+(s===PK.focus?0:-1)+'" aria-label="'+esc(d.toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long",year:"numeric"}))+'"'+
      (s===t?' aria-current="date"':"")+' aria-pressed="'+(s===v)+'">'+d.getDate()+'</button>';}
  return '<div class="pk-top">'+quick.map(q=>'<button type="button" class="pk-chip'+(q[1]===v?" on":"")+'" data-act="pk-day" data-v="'+q[1]+'" title="'+esc(pkDateText(q[1]))+'">'+q[0]+'</button>').join("")+'</div>'+
    '<div class="pk-mh"><b>'+MON[mo]+' '+y+'</b>'+
      '<button type="button" class="pk-nav" data-act="pk-month" data-v="-1" aria-label="Previous month">'+icon("i-chev-l","ic-14")+'</button>'+
      '<button type="button" class="pk-nav" data-act="pk-month" data-v="1" aria-label="Next month">'+icon("i-chev-r","ic-14")+'</button></div>'+
    '<div class="pk-cal"><div class="pk-dow">'+dowLabels().map(x=>'<span>'+x.slice(0,2)+'</span>').join("")+'</div>'+
      '<div class="pk-days">'+days+'</div></div>'+
    pkFoot(v?esc(parseD(v).toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long"})):"Pick a day, or use the arrow keys",
      pkClearable()?"Clear date":"");
}
function pkMonth(n){PK.month=new Date(PK.month.getFullYear(),PK.month.getMonth()+n,1);
  const f=parseD(PK.focus);PK.focus=ymd(new Date(PK.month.getFullYear(),PK.month.getMonth(),Math.min(f.getDate(),28)));
  pkDraw();pkPlace();
  const b=PK.el.querySelector('.pk-nav[data-v="'+n+'"]');if(b)b.focus({preventScroll:true});}
function pkFocusDay(){const b=PK.el&&PK.el.querySelector('.pk-day[tabindex="0"]');if(b)b.focus({preventScroll:true});}
/* Arrow keys move a day or a week, Page Up and Down a month, Home and End
   to the ends of the week; the month turns over by itself. */
function pkDayKey(e){
  const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key];
  let d=parseD(PK.focus);
  if(step)d=addDays(d,step);
  else if(e.key==="PageUp"||e.key==="PageDown")d=new Date(d.getFullYear(),d.getMonth()+(e.key==="PageUp"?-1:1),Math.min(d.getDate(),28));
  else if(e.key==="Home")d=startOfWeek(d);
  else if(e.key==="End")d=addDays(startOfWeek(d),6);
  else return;
  e.preventDefault();PK.focus=ymd(d);
  if(d.getMonth()!==PK.month.getMonth()||d.getFullYear()!==PK.month.getFullYear())PK.month=new Date(d.getFullYear(),d.getMonth(),1);
  pkDraw();pkFocusDay();
}

/* ---- the time picker ----
   Type a time, or pick one: quarter hours grouped by part of the day, opened
   at the time already set or at the next quarter hour from now. */
function parseTimeStr(s){
  const m=String(s||"").trim().toLowerCase().replace(/\s+/g,"").match(/^(\d{1,2})(?:[:.]?(\d{2}))?(a|am|p|pm)?$/);
  if(!m)return "";
  let h=Number(m[1]);const mm=Number(m[2]||0),ap=m[3];
  if(mm>59||h>24)return "";
  if(ap){if(h<1||h>12)return "";if(ap[0]==="p"&&h<12)h+=12;if(ap[0]==="a"&&h===12)h=0;}
  if(h===24)h=0;
  return pad(h)+":"+pad(mm);
}
function pkTimeHtml(){
  const cur=PK.src.value,after=PK.btn.dataset.after;
  /* An end time lists the quarter hours after the start, each with how long
     that makes it, as Google Calendar does. */
  if(after){
    const a=hm2m(after),aim=cur||m2hm(Math.min(a+60,23*60+45));let items="";
    for(let m=a+15;m<24*60;m+=15){const v=m2hm(m);
      items+='<button type="button" class="pk-opt'+(v===cur?" on":"")+(v===aim?" aim":"")+'" data-act="pk-pick" data-v="'+v+'" role="option" aria-selected="'+(v===cur)+'">'+
        '<span>'+esc(fmtTime(v))+' <small>('+esc(durLabel(m-a))+')</small></span>'+(v===cur?icon("i-check","ic-14"):"")+'</button>';}
    return '<div class="pk-top"><input id="pkType" class="inp inp-sm" placeholder="Type a time, like 4:30pm" autocomplete="off" value="'+esc(cur?fmtTime(cur):"")+'">'+
        '<button type="button" class="btn btn-sm btn-primary" data-act="pk-type">Set</button></div>'+
      '<div class="pk-body" role="listbox"><div class="pk-opts one">'+items+'</div></div>'+
      pkFoot("Ends after "+esc(fmtTime(after)),"");
  }
  const n=new Date(),next=Math.min(23*60+45,Math.ceil((n.getHours()*60+n.getMinutes())/15)*15);
  const aim=cur||pad(Math.floor(next/60))+":"+pad(next%60);
  const groups=TP_PARTS.map(g=>{let items="";
    for(let mins=g[1]*60;mins<g[2]*60;mins+=15){const v=pad(Math.floor(mins/60))+":"+pad(mins%60);
      items+='<button type="button" class="pk-opt'+(v===cur?" on":"")+(v===aim?" aim":"")+'" data-act="pk-pick" data-v="'+v+'" role="option" aria-selected="'+(v===cur)+'">'+
        '<span>'+esc(fmtTime(v))+'</span>'+(v===cur?icon("i-check","ic-14"):"")+'</button>';}
    return '<div class="pk-gh">'+g[0]+'</div><div class="pk-opts">'+items+'</div>';}).join("");
  return '<div class="pk-top"><input id="pkType" class="inp inp-sm" placeholder="Type a time, like 8:15pm" autocomplete="off" value="'+esc(cur?fmtTime(cur):"")+'">'+
      '<button type="button" class="btn btn-sm btn-primary" data-act="pk-type">Set</button></div>'+
    '<div class="pk-body" role="listbox">'+groups+'</div>'+
    pkFoot(clock24()?"24-hour clock":"Enter a time or pick one",pkClearable()?"Clear time":"");
}
function pkTyped(){
  const i=el("pkType"),v=parseTimeStr(i&&i.value);
  if(v)pkPick(v);else{toast("Try a time like 9, 9:30, 2:15pm or 14:15");if(i)i.focus();}
}

/* ---- the drop-down ----
   The select's own options, as rows. A list of categories shows each one's
   colour, as the category pills do; a long list gets a box to narrow it. */
function pkSelectHtml(){
  const s=PK.src,opts=[...s.options];
  const cats=opts.filter(o=>o.value).every(o=>S.categories.some(c=>c.id===o.value));
  let last=null,rows="";
  opts.forEach((o,i)=>{
    if(o.hidden)return;
    const g=o.parentNode.tagName==="OPTGROUP"?o.parentNode.label:null;
    if(g!==last&&g)rows+='<div class="pk-gh">'+esc(g)+'</div>';last=g;
    const on=o.selected,c=cats&&o.value?cat(o.value):null;
    rows+='<button type="button" class="pk-opt'+(on?" on":"")+(o.value?"":" blank")+'" data-act="pk-opt" data-i="'+i+'" role="option" aria-selected="'+on+'"'+
      (o.disabled?" disabled":"")+(c?' style="--c:'+c.color+'"':"")+'>'+
      (c?'<i class="pk-dot"></i>':"")+'<span>'+esc(o.text)+'</span>'+(on?icon("i-check","ic-14"):"")+'</button>';
  });
  return (opts.length>12?'<div class="pk-top"><input id="pkFind" class="inp inp-sm" placeholder="Find…" autocomplete="off" aria-label="Narrow the list"></div>':"")+
    '<div class="pk-body" role="listbox"><div class="pk-opts">'+rows+'</div></div>';
}
function pkFind(q){
  q=q.trim().toLowerCase();
  PK.el.querySelectorAll(".pk-opt").forEach(b=>{b.hidden=!!q&&b.textContent.toLowerCase().indexOf(q)===-1;});
}

/* Writes the value, closes, and lets the field's own change handler do the
   rest -- for a date or time field, after putting the new value in words. */
function pkPick(v){
  pkRelink();
  const src=PK.src,key=PK.key;if(!src)return;
  pkClose(true);
  if(src.value===v)return;
  src.value=v;
  const b=src.tagName==="INPUT"&&src.parentNode.querySelector(".pk-btn");
  if(b){const txt=v?pkText(b.dataset.pk,v,b.dataset.fmt):(b.dataset.ph||"");
    b.querySelector(".pk-val").textContent=txt;b.classList.toggle("is-empty",!v);
    b.setAttribute("aria-label",(b.dataset.label?b.dataset.label+": ":"")+txt);}
  src.dispatchEvent(new Event("change",{bubbles:true}));
  /* The handler usually redraws the field; keep the keyboard on it. */
  if(!src.isConnected&&document.activeElement===document.body){
    const s=document.querySelector(key),nb=s&&(s.tagName==="SELECT"?s:s.parentNode.querySelector(".pk-btn"));
    if(nb)nb.focus({preventScroll:true});
  }
}

document.addEventListener("mousedown",function(e){
  const t=e.target;if(!t||!t.closest)return;
  const s=t.closest("select");
  if(pkSelectable(s)){
    e.preventDefault();
    if(PK.src===s){pkClose();return;}
    pkClose();s.focus({preventScroll:true});pkOpen(s);return;
  }
  if(PK.el&&!PK.el.contains(t)&&!(PK.btn&&PK.btn.contains(t)))pkClose();
},true);
document.addEventListener("focusin",function(e){
  if(PK.el&&!PK.el.contains(e.target)&&e.target!==PK.btn)pkClose();
});
document.addEventListener("keydown",function(e){
  const t=e.target;
  /* A closed select opens the planner's list from the keys that would have
     opened the browser's. */
  if(!PK.el&&pkSelectable(t)&&(e.key==="Enter"||e.key===" "||e.key==="F4"||(e.altKey&&e.key==="ArrowDown"))){
    e.preventDefault();pkOpen(t);return;
  }
  if(!PK.el)return;
  if(e.key==="Escape"){e.preventDefault();e.stopPropagation();pkClose(true);return;}
  if(e.key==="Tab"&&PK.kind==="select"){pkClose();return;}
  if(!PK.el.contains(t))return;
  if(t.id==="pkType"&&e.key==="Enter"){e.preventDefault();pkTyped();return;}
  if(PK.kind==="date"&&t.classList.contains("pk-day")){pkDayKey(e);return;}
  if(PK.kind==="select"&&(e.key==="ArrowDown"||e.key==="ArrowUp"||(t.id==="pkFind"&&e.key==="Enter"))){
    const list=[...PK.el.querySelectorAll(".pk-opt:not([hidden]):not(:disabled)")];if(!list.length)return;
    e.preventDefault();
    if(t.id==="pkFind"){if(e.key==="Enter")list[0].click();else if(e.key==="ArrowDown")list[0].focus();return;}
    const i=list.indexOf(t),n=e.key==="ArrowDown"?Math.min(list.length-1,i+1):i-1;
    if(n<0){const f=el("pkFind");if(f)f.focus();}else list[n].focus();
  }
},true);
document.addEventListener("input",function(e){if(e.target&&e.target.id==="pkFind")pkFind(e.target.value);});
document.addEventListener("scroll",function(e){if(PK.el&&!PK.el.contains(e.target))pkPlace();},true);
window.addEventListener("resize",function(){if(PK.el)pkPlace();});
try{new MutationObserver(function(){if(PK.el&&!(PK.btn&&PK.btn.isConnected))pkRelink();})
  .observe(document.body,{childList:true,subtree:true});}catch(e){}

function sheetCats(t){
  return catSelect('class="inp inp-sm" data-act="sh-set" data-k="cat" aria-label="Category"',t.cat);
}
/* Two questions, each a yes or a no, and the quadrant they add up to --
   rather than four checkboxes whose pairing had to be guessed. */
function sheetPrio(t){
  const st={urgent:flagVal(t.urgent),important:flagVal(t.important)};
  const q=quadFromFlags(st.urgent,st.important),Q=q?QUADS.find(x=>x.id===q):null;
  const row=(k,label,yes,no)=>'<div class="prio-row"><span class="prio-k">'+esc(label)+'</span><div class="seg">'+
    [["1",yes],["0",no]].map(o=>'<button data-act="sh-flag" data-k="'+k+'" data-v="'+o[0]+'" aria-pressed="'+(st[k]===o[0])+'">'+esc(o[1])+'</button>').join("")+
    '</div></div>';
  return '<div class="prio2">'+row("urgent","Urgency","Urgent","Not urgent")+row("important","Importance","Important","Not important")+
    '<div class="prio-res">'+(Q?'<span class="chip chip-q '+Q.cls+'">'+icon(Q.icon,"ic-14")+esc(Q.name)+'</span>'
      :'<span class="prio-note">Answer both to place it in the matrix.</span>')+'</div></div>';
}

function sheetTime(t,isNew){
  if(isNew)return '<span class="mnone">Available once the task exists</span>';
  const r=running(),live=r&&r.task===t.id,going=live&&r.since;
  const secs=trackedSecs(t.id)+(live?liveSecs():0);
  const est=tEst(t),estSecs=est*60;
  const over=estSecs&&secs>estSecs;

  /* The total opens what it is made of on a click, not a hover. */
  const open=V.tmBreak===t.id;

  return '<div class="tm">'+
    '<div class="tm-controls">'+
      '<button class="btn btn-sm'+(going?"":" btn-primary")+'" data-act="sh-timer">'+
        icon(going?"i-pause":"i-play","ic-14")+(going?"Pause":live?"Resume":"Start")+'</button>'+
      (live?'<button class="btn btn-sm btn-danger" data-act="timer-stop">'+icon("i-stop","ic-14")+'Stop</button>':"")+
    '</div>'+
    '<div class="tm-read">'+
      '<span class="tm-anchor"><button class="num tm-total" data-act="tm-break" data-id="'+t.id+'" aria-haspopup="dialog" aria-expanded="'+open+'">'+
        '<b>'+fmtDur(secs)+'</b>'+(estSecs?' of '+fmtMins(est):' tracked')+icon("i-chev-d","ic-14")+'</button>'+
        (open?timeBreakdown(t,secs,live):"")+'</span>'+
      (estSecs?'<span class="tm-delta'+(over?" over":"")+'">'+
        (over?"over by "+fmtDur(secs-estSecs):fmtDur(estSecs-secs)+" left")+'</span>':"")+
    '</div>'+
    (estSecs?'<div class="tm-bar'+(over?" over":"")+'"><i style="width:'+
      Math.min(100,secs/estSecs*100).toFixed(1)+'%"></i></div>':"")+
    '</div>';
}

/* ---- the time breakdown ----
   Opened from the total. Every run on a line of the day, grouped by day, so
   you see not only how long but when -- the same 6am-to-midnight strip the
   dashboard draws, at a smaller scale. Against an estimate, the bar is scaled
   to whichever is longer and the overrun is hatched red past a marker. */
function timeBreakdown(t,total,live){
  const r=running(),est=tEst(t)*60,c=cat(t.cat).color;
  const runs=sessionsFor(t.id).map(x=>({start:x.start,end:runEnd(x),secs:x.secs||0}));
  if(live&&r)runs.push({start:r.began,end:Date.now(),secs:liveSecs(),live:true});
  const days={};runs.forEach(x=>{const k=ymd(new Date(x.start));(days[k]=days[k]||[]).push(x);});
  const keys=Object.keys(days).sort().reverse(),shown=keys.slice(0,7),rest=keys.slice(7);
  const from=H0*60,span=(H1-H0)*60;
  const pos=ms=>{const d=new Date(ms);return Math.max(0,Math.min(100,(d.getHours()*60+d.getMinutes()-from)/span*100));};
  const hm=ms=>{const d=new Date(ms);return fmtTime(pad(d.getHours())+":"+pad(d.getMinutes()));};
  const dayName=k=>k===TODAY()?"Today":k===ymd(addDays(today(),-1))?"Yesterday":
    parseD(k).toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"short"});
  const plural=(n,w)=>n+" "+w+(n===1?"":"s");

  let meter="";
  if(est){
    const top=Math.max(total,est),fill=Math.min(total,est)/top*100,over=total>est?(total-est)/top*100:0;
    meter='<div class="tmb-meter" role="img" aria-label="'+esc(fmtTracked(total)+" of a "+fmtTracked(est)+" estimate")+'">'+
      '<i style="width:'+fill.toFixed(1)+'%"></i>'+(over?'<i class="tmb-overrun" style="left:'+fill.toFixed(1)+'%;width:'+over.toFixed(1)+'%"></i>':"")+
      '<span class="tmb-mark" style="left:'+(est/top*100).toFixed(1)+'%"></span></div>'+
      '<div class="tmb-scale"><span>0</span><span>Estimate '+esc(fmtTracked(est))+'</span></div>';
  }
  const pill=est?(total>est?'<span class="tmb-pill is-over">'+esc(fmtTracked(total-est))+' over</span>'
    :'<span class="tmb-pill">'+esc(fmtTracked(est-total))+' left</span>'):"";

  const body=!runs.length
    ? '<p class="tmb-empty">Nothing tracked yet. Press Start, and each run will show here at the time you did it.</p>'
    : '<div class="tmb-axis"><span>6am</span><span>noon</span><span>6pm</span><span>midnight</span></div>'+
      '<div class="tmb-days">'+shown.map(k=>{
        const list=days[k].sort((a,b)=>a.start-b.start),sum=list.reduce((n,x)=>n+x.secs,0);
        return '<div class="tmb-day"><div class="tmb-dh"><span>'+esc(dayName(k))+'</span><b class="num">'+esc(fmtTracked(sum))+'</b></div>'+
          '<div class="tmb-track">'+list.map(x=>{const l=pos(x.start),w=Math.max(1.4,pos(x.end)-l);
            return '<i class="'+(x.live?"live":"")+'" style="left:'+l.toFixed(2)+'%;width:'+w.toFixed(2)+'%"></i>';}).join("")+'</div>'+
          '<div class="tmb-runs">'+list.map(x=>{
            /* A run inside one minute is one time, not 5pm–5pm. */
            const when=x.live?hm(x.start)+'–now':hm(x.start)===hm(x.end)?hm(x.start):hm(x.start)+'–'+hm(x.end);
            return '<span class="num'+(x.live?" live":"")+'">'+esc(when)+'<b>'+esc(fmtTracked(x.secs))+'</b></span>';}).join("")+'</div></div>';}).join("")+
        (rest.length?'<p class="tmb-more">and '+plural(rest.length,"earlier day")+', '+
          esc(fmtTracked(rest.reduce((n,k)=>n+days[k].reduce((m,x)=>m+x.secs,0),0)))+'</p>':"")+
      '</div>';

  return '<div class="tmb" role="dialog" aria-label="Time breakdown" style="--c:'+c+'">'+
    '<div class="tmb-eyebrow">Time breakdown</div>'+
    '<div class="tmb-head"><span class="tmb-total num">'+esc(fmtTracked(total))+'</span>'+
      '<span class="tmb-sub">'+(runs.length?plural(runs.length,"run")+" over "+plural(keys.length,"day"):"tracked")+'</span>'+pill+'</div>'+
    meter+body+'</div>';
}
/* Closed by a click anywhere else, or Escape, and taken out in place: a full
   panel redraw for a pop-over would be the flicker the panel once had. */
function closeTimeBreakdown(){
  if(!V.tmBreak)return;V.tmBreak=null;
  const p=document.querySelector(".tmb");if(p)p.remove();
  const b=document.querySelector('[data-act="tm-break"]');if(b)b.setAttribute("aria-expanded","false");
}
document.addEventListener("click",function(e){
  if(!V.tmBreak||!e.target.closest)return;
  if(e.target.closest('.tmb,[data-act="tm-break"]'))return;
  closeTimeBreakdown();
},true);

function sheetTags(t){
  const tags=tTags(t);
  return '<div class="tagbox">'+tags.map(x=>'<span class="chip chip-tag">'+esc(x)+
      '<button data-act="sh-tag-del" data-v="'+esc(x)+'" aria-label="Remove tag">'+icon("i-x","ic-14")+'</button></span>').join("")+
    '<input class="tag-in" id="shTag" placeholder="'+(tags.length?"Add":"Add a tag")+'" aria-label="Add a tag">'+
    '</div>';
}

function sheetLinks(t,isNew){
  if(isNew)return '<span class="mnone">Available once the task exists</span>';
  const ids=tLinks(t),others=S.tasks.filter(x=>x.id!==t.id&&ids.indexOf(x.id)===-1);
  return '<div class="linkbox">'+
    ids.map(id=>{const o=taskById(id);if(!o)return "";
      return '<div class="linkrow"><button class="lk" data-act="sh-open" data-id="'+o.id+'">'+icon(cat(o.cat).icon,"ic-14")+
        '<span>'+esc(o.title)+'</span></button>'+
        '<button class="rowx" data-act="sh-link-del" data-v="'+o.id+'" aria-label="Unlink">'+icon("i-x","ic-14")+'</button></div>';}).join("")+
    (others.length?'<select class="inp inp-sm" data-act="sh-link-add"><option value="">Link a task…</option>'+
      others.slice(0,200).map(o=>'<option value="'+o.id+'">'+esc(o.title)+'</option>').join("")+'</select>':"")+
    '</div>';
}

function sheetFiles(t,isNew){
  if(isNew)return '<span class="mnone">Available once the task exists</span>';
  const files=tFiles(t);
  return '<div class="filebox">'+
    files.map(f=>'<div class="filerow">'+icon("i-clip","ic-14")+
      (f.path?'<button class="fname lk-inline" data-act="sh-file-open" data-v="'+esc(f.id)+'" title="Open">'+esc(f.name)+'</button>'
             :'<span class="fname">'+esc(f.name)+'</span>')+
      '<span class="fsize num">'+esc(f.size)+'</span>'+
      '<button class="rowx" data-act="sh-file-del" data-v="'+f.id+'" aria-label="Remove">'+icon("i-x","ic-14")+'</button></div>').join("")+
    (hasDesktop()
      ? '<button class="btn btn-sm" data-act="sh-file-add">'+icon("i-plus","ic-14")+'Attach a file</button>'
      : '<span class="mnone">Attaching files needs the desktop app</span>')+
    '</div>';
}

/* ---- activity feed ---- */
const ACT_ICON={gcal:"i-calendar",created:"i-plus",comment:"i-chat",doc:"i-doc","doc-edit":"i-doc","doc-del":"i-trash",
  field:"i-edit",time:"i-timer",done:"i-check",reopened:"i-repeat"};

function relTime(ms){
  const d=Math.floor((Date.now()-ms)/1000);
  if(d<60)return "just now";
  if(d<3600)return Math.floor(d/60)+"m ago";
  if(d<86400)return Math.floor(d/3600)+"h ago";
  const dt=new Date(ms);
  return fmtDate(ymd(dt))+" at "+fmtTime(pad(dt.getHours())+":"+pad(dt.getMinutes()));
}

/* Documents sit with the task's working material, not its history. */
const histCount=t=>S.activity.reduce((n,a)=>n+(a.task===t.id&&a.kind!=="comment"?1:0),0);

function docsSection(t,isNew){
  if(isNew)return "";
  const ds=docsFor(t.id);
  return '<div class="sh-sec"><label class="sec-label">Documents'+(ds.length?' <span class="num">'+ds.length+'</span>':"")+'</label>'+
    (ds.length?'<div class="doclist">'+ds.map(d=>
      '<button class="doccard" data-act="doc-open" data-id="'+d.id+'">'+icon("i-doc","ic-14")+
      '<span class="dc-t">'+esc(d.title)+'</span>'+
      '<span class="dc-m">'+esc(relTime(d.updated))+'</span></button>').join("")+'</div>'
      :'<p class="mnone" style="margin:0 0 8px">Markdown, so your vault can read them.</p>')+
    '<button class="btn btn-sm" data-act="doc-new">'+icon("i-plus","ic-14")+'New document</button></div>';
}

/* Comments live with the details, where the work is. */
function commentsPane(t,isNew){
  if(isNew)return "";
  const who=(S.prefs&&S.prefs.owner)||"You";
  const list=actFor(t.id).filter(a=>a.kind==="comment");
  return '<div class="sh-sec"><label class="sec-label">Comments'+(list.length?' <span class="num">'+list.length+'</span>':"")+'</label>'+
    (list.length?'<div class="feed">'+list.map(a=>
      '<div class="act act-comment"><div class="act-top"><b>'+esc(who)+'</b><span>'+esc(relTime(a.at))+'</span>'+
      '<button class="rowx" data-act="act-del" data-id="'+a.id+'" aria-label="Delete comment">'+icon("i-x","ic-14")+'</button></div>'+
      '<div class="act-body">'+mdToHtml(a.text)+'</div></div>').join("")+'</div>':"")+
    '<div class="composer">'+
      '<textarea class="inp" id="shComment" rows="2" placeholder="Write a comment… markdown works"></textarea>'+
      '<div class="composer-foot">'+
        '<span class="mnone">Ctrl+Enter to post</span>'+
        '<div class="spacer" style="flex:1"></div>'+
        '<button class="btn btn-sm btn-primary" data-act="comment-add">'+icon("i-send","ic-14")+'Comment</button>'+
      '</div></div></div>';
}

/* The history: what happened to the task, without the conversation. */
function historyPane(t){
  const items=actFor(t.id).filter(a=>a.kind!=="comment");
  if(!items.length)return '<div class="act-empty">Nothing has happened to this task yet.</div>';

  /* Runs of bookkeeping that happened at the same moment become one block
     under one timestamp, instead of a stack of near-identical rows. */
  const blocks=[];
  items.forEach(a=>{
    const when=relTime(a.at),last=blocks[blocks.length-1];
    if(last&&last.when===when)last.list.push(a);
    else blocks.push({when:when,list:[a]});
  });
  const line=a=>{
    const d=a.meta&&a.meta.doc?docById(a.meta.doc):null;
    const text=d?'<button class="lk lk-inline" data-act="doc-open" data-id="'+d.id+'">'+esc(a.text)+'</button>':esc(a.text);
    return '<div class="ag-line">'+icon(ACT_ICON[a.kind]||"i-dot-grid","ic-14")+'<span>'+text+'</span></div>';
  };
  return '<div class="feed">'+blocks.map(b=>
    '<div class="act-group"><div class="ag-when">'+esc(b.when)+'</div>'+
    '<div class="ag-lines">'+b.list.map(line).join("")+'</div></div>').join("")+'</div>';
}

function renderSheet(){
  const root=el("sheetRoot");if(!root)return;
  const s=V.sheet;
  if(!s){root.innerHTML="";document.body.classList.remove("sheet-open");return;}
  const t=sheetTask();
  if(!t){root.innerHTML="";document.body.classList.remove("sheet-open");V.sheet=null;return;}
  document.body.classList.add("sheet-open");
  const isNew=!s.id,c=cat(t.cat),done=t.status==="completed";
  const subs=t.subtasks||[],dn=subs.filter(x=>x.d).length;

  /* The scrim and the panel carry the open animation. Rebuilding them on every
     edit replayed it, which read as the panel closing and reopening, so the
     shell is created once and only its two halves are redrawn. */
  let sheet=root.querySelector(".sheet");
  if(!sheet){
    root.innerHTML='<div class="sheet-scrim" data-act="sheet-close"></div>'+
      '<aside class="sheet" role="dialog" aria-modal="true" aria-label="Task detail">'+
      '<header class="sh-head"></header><div class="sh-body"></div></aside>';
    sheet=root.querySelector(".sheet");
  }

  const headHtml=
      '<button class="tick'+(done?" on":"")+'" data-act="sh-done" aria-label="Mark complete"'+(isNew?" disabled":"")+'>'+icon("i-check")+'</button>'+
      '<select class="inp inp-sm sh-status" data-act="sh-set" data-k="status">'+
        STATUSES.map(x=>'<option value="'+x.id+'"'+(t.status===x.id?" selected":"")+'>'+esc(x.name)+'</option>').join("")+'</select>'+
      '<div class="spacer" style="flex:1"></div>'+
      (isNew?"":'<button class="icon-btn btn-sm" data-act="sh-timer" title="Start the timer" aria-label="Start the timer">'+icon(running()&&running().task===t.id&&running().since?"i-pause":"i-play","ic-14")+'</button>')+
      (isNew?"":'<button class="icon-btn btn-sm btn-danger" data-act="sh-delete" title="Delete" aria-label="Delete task">'+icon("i-trash","ic-14")+'</button>')+
      '<button class="icon-btn btn-sm" data-act="sheet-close" aria-label="Close">'+icon("i-x","ic-14")+'</button>';

  const bodyHtml=
      '<input class="sh-title" id="shTitle" value="'+esc(t.title)+'" placeholder="What needs doing?" data-act="sh-set" data-k="title">'+

      (isNew?"":'<div class="sh-tabs" role="tablist">'+
        '<button class="sh-tab" data-act="sh-tab" data-v="details" role="tab" aria-selected="'+(s.tab!=="activity")+'">Details</button>'+
        '<button class="sh-tab" data-act="sh-tab" data-v="activity" role="tab" aria-selected="'+(s.tab==="activity")+'">Activity'+
          (histCount(t)?'<span class="num">'+histCount(t)+'</span>':"")+'</button></div>')+

      /* Grouped under four small headings rather than one long list, so the
         form reads as when, what, how long, and what it is tied to. */
      (s.tab==="activity"?historyPane(t):'<div class="sh-meta">'+
        '<div class="sh-group"><div class="sh-gh">Schedule</div>'+
          metaRow("When",sheetDates(t),"i-clock")+
          metaRow("Reminder",'<div id="shRemind">'+taskRemindHtml(t)+'</div>',"i-bell")+
        '</div>'+
        '<div class="sh-group"><div class="sh-gh">Organise</div>'+
          metaRow("Category",sheetCats(t),c.icon)+
          metaRow("Priority",sheetPrio(t),"i-flag")+
          metaRow("Tags",sheetTags(t),"i-tag")+
        '</div>'+
        '<div class="sh-group"><div class="sh-gh">Effort</div>'+
          metaRow("Estimate",'<div class="est-wrap"><input class="inp inp-sm est-in" type="number" min="0" step="5" value="'+(tEst(t)||"")+
            '" placeholder="0" data-act="sh-set" data-k="est" aria-label="Time estimate in minutes"><span>minutes</span></div>',"i-timer")+
          metaRow("Time",sheetTime(t,isNew),"i-clock")+
        '</div>'+
        '<div class="sh-group"><div class="sh-gh">Attached</div>'+
          metaRow("Linked",sheetLinks(t,isNew),"i-link")+
          metaRow("Files",sheetFiles(t,isNew),"i-clip")+
        '</div>'+
      '</div>'+

      '<div class="sh-sec"><label class="sec-label">Description</label>'+
        '<textarea class="inp" id="shDesc" rows="3" placeholder="Any detail worth keeping" data-act="sh-set" data-k="desc">'+esc(t.desc||"")+'</textarea></div>'+

      '<div class="sh-sec"><label class="sec-label">Subtasks'+(subs.length?' <span class="num">'+dn+'/'+subs.length+'</span>':"")+'</label>'+
        '<div id="shSubs">'+subs.map(x=>subRow(x)).join("")+'</div>'+
        '<button class="btn btn-sm" data-act="sh-sub-add" style="margin-top:8px">'+icon("i-plus","ic-14")+'Add subtask</button></div>'+
      docsSection(t,isNew)+
      commentsPane(t,isNew))+

      (isNew?'<div class="sh-create"><button class="btn btn-primary" data-act="sh-create">'+icon("i-check")+'Create task</button>'+
          '<span class="mnone">Comments, documents and the timer open up once it exists.</span></div>':"");

  /* Hold the scroll position across a redraw, but start at the top when the
     content underneath actually changed — a different task, or the other tab. */
  const bodyEl=sheet.querySelector(".sh-body");
  const sameContent=root.dataset.task===String(t.id)&&root.dataset.tab===String(s.tab);
  const keep=bodyEl.scrollTop;

  sheet.querySelector(".sh-head").innerHTML=headHtml;
  bodyEl.innerHTML=bodyHtml;
  bodyEl.scrollTop=sameContent?keep:0;

  root.dataset.task=t.id;
  root.dataset.tab=s.tab;
}

/* ---- document editor ---- */
function docModal(id,taskId){
  const d=id?docById(id):null;
  openModal('<div class="modal modal-wide" role="dialog" aria-modal="true" aria-label="Document">'+
    '<div class="mhead2"><h2>'+(d?"Document":"New document")+'</h2>'+
      (d?'<button class="btn btn-sm btn-ghost btn-danger" data-act="doc-del" data-id="'+d.id+'">'+icon("i-trash","ic-14")+'Delete</button>':"")+
      '<button class="icon-btn" data-act="close" aria-label="Close">'+icon("i-x")+'</button></div>'+
    '<div class="mbody">'+
      '<input class="inp doc-title" id="dcTitle" value="'+esc(d?d.title:"")+'" placeholder="Document title">'+
      '<div class="doc-split">'+
        '<textarea class="inp doc-md" id="dcMd" spellcheck="true" placeholder="# Heading&#10;&#10;Write in markdown. It is saved as a .md file.">'+esc(d?d.md:"")+'</textarea>'+
        '<div class="doc-prev" id="dcPrev">'+mdToHtml(d?d.md:"")+'</div>'+
      '</div>'+
      '<p class="mnone">'+(vaultPath()?'Saved to your vault as '+esc(d?docFile(d):"a .md file"):'Saved inside the planner. Connect a vault in Settings to mirror it into Obsidian.')+'</p>'+
    '</div>'+
    '<div class="mfoot"><div class="spacer" style="flex:1"></div>'+
      '<button class="btn" data-act="close">Cancel</button>'+
      '<button class="btn btn-primary" data-act="doc-save" data-id="'+(d?d.id:"")+'" data-task="'+esc(taskId||(d?d.task:""))+'">'+icon("i-check")+'Save</button>'+
    '</div></div>');
}


/* ============ the desktop bridge ============ */
/* main.js exposes window.orbit through a preload script. In a plain browser
   it is absent, so every one of these is a no-op and the features that need
   a real filesystem or a floating window simply do not appear. */
const desktop=()=>(typeof window!=="undefined"&&window.orbit)||null;
const hasDesktop=()=>!!desktop();
const vaultPath=()=>(S.prefs&&S.prefs.vault)||"";

function pushDocToVault(d){
  const o=desktop();if(!o||!vaultPath()||!d)return;
  try{o.writeDoc({file:docFile(d),body:docFileBody(d),id:d.id});}catch(e){}
}
function removeDocFromVault(d){
  const o=desktop();if(!o||!vaultPath()||!d)return;
  try{o.deleteDoc({file:docFile(d),id:d.id});}catch(e){}
}
function syncTimerWindow(){
  const o=desktop();if(!o||!o.timer)return;
  const r=running();
  const dark=isDark(),tri=accentTrio(accentHex()),accent=dark?tri.lift:tri.base;
  if(!r){try{o.timer({state:"idle",dark:dark,accent:accent});}catch(e){}return;}
  const t=taskById(r.task);if(!t)return;
  const est=tEst(t)*60,secs=liveSecs();
  try{o.timer({state:r.since?"running":"paused",title:t.title,task:t.id,
    secs:secs,est:est,colour:cat(t.cat).color,over:est>0&&secs>est,dark:dark,accent:accent});}catch(e){}
}

/* ============ reminders ============ */
/* Worked out here, where the data is, and handed to the desktop shell to
   deliver: main.js holds the timers and shows the notifications, so they
   arrive with the window closed and are not slowed the way a hidden page's
   timers are. The list is rebuilt from scratch whenever tasks, routines,
   ticks or settings change, and every five minutes, so nothing is ever
   stale by more than that. In a plain browser the page keeps the timers
   itself, and they only fire while the tab is open.

   A reminder's id carries what it was worked out from -- the item, the day,
   the time, the lead -- so moving a routine or changing its reminder makes a
   new one rather than being swallowed as "already shown". */
const REMIND_DEFAULT=30;
const REMIND_OPTS=[[0,"At the time"],[5,"5 min before"],[10,"10 min before"],[15,"15 min before"],
  [60,"1 hour before"],[120,"2 hours before"],[1440,"1 day before"]];
/* remind is unset (the default, 30 minutes), a number of minutes, or false. */
function remindMins(x){if(x.remind===false)return null;return typeof x.remind==="number"?x.remind:REMIND_DEFAULT;}
function remindLabel(x){
  const m=remindMins(x);if(m===null)return "No reminder";
  if(m===REMIND_DEFAULT)return "30 min before";
  const o=REMIND_OPTS.filter(p=>p[0]===m)[0];return o?o[1]:m+" min before";
}
function remindOptions(x){
  const v=x.remind===false?"off":typeof x.remind==="number"&&x.remind!==REMIND_DEFAULT?String(x.remind):"d";
  return '<option value="d"'+(v==="d"?" selected":"")+'>30 min before (default)</option>'+
    REMIND_OPTS.map(o=>'<option value="'+o[0]+'"'+(v===String(o[0])?" selected":"")+'>'+o[1]+'</option>').join("")+
    '<option value="off"'+(v==="off"?" selected":"")+'>No reminder</option>';
}
function taskRemindHtml(t){
  if(!tTimeDay(t))return '<span class="mnone">Give it a date and a time to get a reminder</span>';
  if(!t.dueTime)return '<span class="mnone">Untick All day and set a time to get a reminder</span>';
  return '<select class="inp inp-sm" data-act="sh-set" data-k="remind" aria-label="Reminder">'+remindOptions(t)+'</select>';
}
/* Defaults filled in on the one object, as with gcalPrefs, since the nested
   settings handler writes into it in place. No quiet hours by default. */
function remindPrefs(){
  const p=S.prefs.remind||(S.prefs.remind={});
  if(p.on===undefined)p.on=true;
  if(p.overdue===undefined)p.overdue=true;
  if(!p.overdueAt)p.overdueAt="12:00";
  if(p.quiet===undefined)p.quiet=false;
  if(p.quietFrom===undefined)p.quietFrom="";
  if(p.quietTo===undefined)p.quietTo="";
  return p;
}
const hm=tm=>{const x=String(tm||"0:0").split(":").map(Number);return x[0]*60+(x[1]||0);};
function inQuiet(ms,p){
  if(!p.quiet||!p.quietFrom||!p.quietTo||p.quietFrom===p.quietTo)return false;
  const d=new Date(ms),m=d.getHours()*60+d.getMinutes(),a=hm(p.quietFrom),b=hm(p.quietTo);
  return a<b?(m>=a&&m<b):(m>=a||m<b);          // a window like 22:00-07:00 wraps midnight
}
function leadText(mins){
  if(!mins)return "now";
  if(mins<60)return "in "+mins+" min";
  if(mins<1440)return "in "+(mins/60)+" hour"+(mins===60?"":"s");
  return "tomorrow";
}
function buildReminders(){
  const p=remindPrefs();if(!p.on)return [];
  const now=Date.now(),until=now+36*3600e3,out=[];
  const at=(ds,tm)=>{const d=parseD(ds);d.setHours(Math.floor(hm(tm)/60),hm(tm)%60,0,0);return d.getTime();};
  const clock=ms=>{const d=new Date(ms);return fmtTime(pad(d.getHours())+":"+pad(d.getMinutes()));};
  const keep=fire=>fire>=now-60000&&fire<=until;
  /* A day-before reminder for tomorrow's routine is fired today, so look two
     days ahead. Reminders ignore the category filter: hiding a category is
     about what you look at, not what you want to be told. */
  for(let i=0;i<=2;i++){
    const d=addDays(today(),i),ds=ymd(d);
    S.routines.forEach(r=>{
      if(!r.time||!routineOn(r,d)||doneR(r,ds))return;
      const m=remindMins(r);if(m===null)return;
      const start=at(ds,r.time),fire=start-m*60000;if(!keep(fire))return;
      out.push({id:"r:"+r.id+":"+ds+":"+r.time+":"+m,at:fire,title:r.title,
        body:(m?"Starts "+leadText(m)+", at "+clock(start):"Starting now")+" · "+cat(r.cat).name,
        open:{kind:"routine",id:r.id,date:ds}});
    });
  }
  S.tasks.forEach(t=>{
    const day=tTimeDay(t);
    if(!isOpen(t)||!day||!t.dueTime)return;
    const m=remindMins(t);if(m===null)return;
    const due=at(day,t.dueTime),fire=due-m*60000;if(!keep(fire))return;
    out.push({id:"t:"+t.id+":"+day+"T"+t.dueTime+":"+m,at:fire,title:t.title,
      body:(m?"Starts "+leadText(m)+", at "+clock(due):"Starting now")+" · "+cat(t.cat).name,
      open:{kind:"task",id:t.id}});
  });
  if(p.overdue){
    let fire=at(TODAY(),p.overdueAt);if(fire<now-60000)fire=at(ymd(addDays(today(),1)),p.overdueAt);
    /* Counted as it will stand then: anything open and due before that day. */
    const day=ymd(new Date(fire)),late=S.tasks.filter(t=>isOpen(t)&&t.due&&t.due<day);
    if(late.length)out.push({id:"overdue:"+day+":"+p.overdueAt,at:fire,
      title:late.length+" overdue task"+(late.length===1?"":"s"),
      body:late.slice(0,2).map(t=>t.title).join(", ")+(late.length>2?" and "+(late.length-2)+" more":""),
      open:{kind:"dashboard"}});
  }
  return out.filter(r=>!inQuiet(r.at,p)).sort((a,b)=>a.at-b.at);
}
function remindSoon(){clearTimeout(RM.soon);RM.soon=setTimeout(scheduleReminders,800);}
function scheduleReminders(){
  let list;try{list=buildReminders();}catch(e){return;}
  const o=desktop();
  if(o&&o.scheduleReminders){try{o.scheduleReminders(list);}catch(e){}return;}
  /* The browser: the page keeps its own timers, and only while open. */
  RM.web.forEach(x=>clearTimeout(x));RM.web.clear();
  if(typeof Notification==="undefined"||Notification.permission!=="granted")return;
  const now=Date.now();
  list.forEach(r=>{
    if(RM.fired.has(r.id))return;
    RM.web.set(r.id,setTimeout(()=>{
      RM.fired.add(r.id);RM.web.delete(r.id);
      try{const n=new Notification(r.title,{body:r.body,tag:r.id});
        n.onclick=()=>{try{window.focus();}catch(e){}openReminder(r.open);n.close();};}catch(e){}
    },Math.max(0,r.at-now)));
  });
}
/* Where a reminder takes you: a task opens its panel; a routine or the
   overdue count opens the dashboard, where they can be ticked off. */
function openReminder(o){
  if(!o)return;
  closeModal();
  if(o.kind==="task"&&taskById(o.id)){V.view="tasks";render();openSheet(o.id);return;}
  V.view="dashboard";render();
}
function remindTest(){
  const o=desktop(),msg={title:"Reminders are working",body:"This is how a reminder will look."};
  if(o&&o.testReminder){o.testReminder(msg);toast("Test sent");return;}
  if(typeof Notification==="undefined"){toast("This browser cannot show notifications");return;}
  if(Notification.permission!=="granted"){toast("Allow notifications first");return;}
  try{new Notification(msg.title,{body:msg.body});toast("Test sent");}catch(e){toast("The browser would not show it");}
}
function remindBoot(){
  const o=desktop();
  if(o&&o.onReminderOpen)o.onReminderOpen(openReminder);
  scheduleReminders();
  setInterval(scheduleReminders,5*60*1000);
}

/* ============ google in a browser ============
   On the desktop, gcal.js signs in and keeps a long-lived key in the main
   process. A web page has no main process, so here Google's own sign-in
   library (Google Identity Services) hands the page a short-lived key, an
   hour at a time, through a Google window. It answers the same five calls
   window.orbit does, so everything that uses the account -- setup, Drive
   backup, Calendar sync -- runs on it unchanged. gAcct() picks the one there
   is.

   It needs an address Google knows: the page served over http(s), and a
   "Web application" client listing that address as an authorised JavaScript
   origin. Its Client ID is not a secret; it comes from
   google-web-client.json beside the page, or is pasted once on the sign-in
   page. A file opened by double-click, and the Claude artifact, have no such
   address, and keep the planner in the browser without signing in.

   The key waits in sessionStorage until it runs out, so a reload does not
   ask again; who is signed in and what was granted are in localStorage.
   Google hands out the next key only in answer to a click -- a window opened
   without one is blocked -- so when the hour is up, requests answer "renew"
   and a Reconnect pill (wgPill) asks for that click. Keeping someone signed
   in for weeks needs a server to hold a refresh key, which this app has not. */
const WG_AUTH="https://www.googleapis.com/auth/";
const WG_SCOPES={account:["openid","email","profile"],
  calendar:[WG_AUTH+"calendar.readonly",WG_AUTH+"calendar.events"],drive:[WG_AUTH+"drive.file"]};
const WG_BASE={calendar:"https://www.googleapis.com/calendar/v3",drive:"https://www.googleapis.com/drive/v3",
  upload:"https://www.googleapis.com/upload/drive/v3"};
const WG_PATH={calendar:/^\/(users\/me\/calendarList|calendars\/[^/?#]+(\/events(\/[^/?#]+)?)?)$/,
  drive:/^\/files(\/[A-Za-z0-9_-]+)?$/};
const WG_KEY="orbit.google",WG_TOK="orbit.google.key";
const WG={cfg:null,lib:null,pend:null,renew:false};
const wgOrigin=()=>typeof location!=="undefined"&&/^https?:$/.test(location.protocol)&&!window.claude;
const gis=()=>{const g=window.google;return g&&g.accounts&&g.accounts.oauth2||null;};
function wgGet(k,store){try{return JSON.parse((store||localStorage).getItem(k)||"null");}catch(e){return null;}}
function wgPut(k,v,store){try{const s=store||localStorage;if(v==null)s.removeItem(k);else s.setItem(k,JSON.stringify(v));}catch(e){}}
const wgShipped=()=>(WG.cfg&&WG.cfg.clientId)||"";
const wgClientId=()=>wgShipped()||((wgGet(WG_KEY)||{}).clientId)||"";
/* The address's own client, if one is published beside the page -- either
   {"clientId": …} or the JSON Google Cloud offers for download -- and
   Google's library, loaded early so a click can open its window at once. */
function wgLoad(){
  if(!WG.loading)WG.loading=wgFetchCfg();
  return WG.loading;
}
async function wgFetchCfg(){
  if(!wgOrigin())return;
  if(!WG.cfg){
    WG.cfg={};
    try{
      const r=await Promise.race([fetch("google-web-client.json",{cache:"no-store"}),new Promise((_,no)=>setTimeout(no,4000))]);
      const j=r.ok?await r.json():{};
      WG.cfg={clientId:String(j.clientId||(j.web&&j.web.client_id)||"")};
    }catch(e){}
  }
  wgLib().catch(()=>{});
}
function wgLib(){
  if(!WG.lib)WG.lib=new Promise((ok,no)=>{
    if(gis()){ok();return;}
    const s=document.createElement("script");
    s.src="https://accounts.google.com/gsi/client";s.async=true;
    s.onload=()=>ok();
    s.onerror=()=>{WG.lib=null;s.remove();no(new Error("Could not load Google's sign-in. Check your connection."));};
    document.head.appendChild(s);
  });
  return WG.lib;
}
function wgStatus(){
  const a=wgGet(WG_KEY)||{},g=a.scopes||[],on=!!a.email,has=s=>g.indexOf(s)>-1;
  return {connected:on,email:a.email||"",name:a.name||"",first:a.first||"",clientId:a.clientId||"",
    hasSecret:false,builtIn:!!wgShipped(),web:true,
    parts:on?{account:true,calendar:WG_SCOPES.calendar.every(has),drive:WG_SCOPES.drive.every(has)}
      :{account:false,calendar:false,drive:false}};
}
/* Must be reached from a click without waiting on anything first: the
   window Google opens is a pop-up, and a browser lets one open only then. */
function wgConnect(input){
  const want=(input&&input.want)||["calendar"];
  const id=String((input&&input.clientId)||"").trim()||wgClientId();
  const lib=gis();
  if(!id)return Promise.resolve({ok:false,error:"Paste the Client ID first."});
  if(!lib){wgLib().catch(()=>{});return Promise.resolve({ok:false,error:"Google's sign-in is still loading. Try again in a moment."});}
  if(WG.pend)WG.pend({ok:false,error:"Cancelled."});
  const was=wgGet(WG_KEY)||{};
  const scope=want.reduce((l,p)=>l.concat(WG_SCOPES[p]||[]),[]).join(" ");
  return new Promise(resolve=>{
    const done=r=>{if(WG.pend===done)WG.pend=null;resolve(r);};
    WG.pend=done;
    const tc=lib.initTokenClient(Object.assign({client_id:id,scope:scope,include_granted_scopes:true,
      callback:async t=>{
        if(WG.pend!==done)return;
        if(!t||t.error){done({ok:false,error:t&&t.error==="access_denied"?"Cancelled.":(t&&(t.error_description||t.error))||"Could not sign in."});return;}
        const key={token:t.access_token,exp:Date.now()+(Number(t.expires_in)||3600)*1000};
        /* Who this is, from Google, every time: a later ask made with a
           different account in Google's window is a different sign-in. */
        let who={};
        try{const r=await fetch("https://www.googleapis.com/oauth2/v3/userinfo",{headers:{Authorization:"Bearer "+key.token}});
          if(r.ok)who=await r.json();}catch(e){}
        const email=who.email||was.email||"";
        if(!email){done({ok:false,error:"Google did not say who you are. Try again."});return;}
        const same=email===was.email,got=String(t.scope||scope).split(" ");
        wgPut(WG_TOK,key,sessionStorage);
        wgPut(WG_KEY,{clientId:id===wgShipped()?"":id,email:email,
          name:who.name||(same?was.name:"")||"",first:who.given_name||(same?was.first:"")||"",
          scopes:(same?(was.scopes||[]):[]).concat(got).filter((s,i,l)=>l.indexOf(s)===i)});
        WG.renew=false;wgPill();
        done({ok:true,email:email,name:who.name||""});
      },
      error_callback:e=>{
        const k=e&&e.type;
        done({ok:false,error:k==="popup_closed"?"Cancelled."
          :k==="popup_failed_to_open"?"Your browser blocked Google's sign-in window. Allow pop-ups for this page, then try again."
          :"Could not sign in."});
      }},was.email?{login_hint:was.email}:{}));
    tc.requestAccessToken({prompt:was.email?"":"select_account"});
  });
}
function wgCancel(){if(WG.pend)WG.pend({ok:false,error:"Cancelled."});return true;}
async function wgDisconnect(){
  const key=wgGet(WG_TOK,sessionStorage),lib=gis(),a=wgGet(WG_KEY)||{};
  if(key&&key.token&&lib)try{lib.revoke(key.token,()=>{});}catch(e){}
  wgPut(WG_KEY,a.clientId?{clientId:a.clientId}:null);
  wgPut(WG_TOK,null,sessionStorage);
  WG.renew=false;wgPill();
  return true;
}
async function wgRequest(req){
  const method=String(req&&req.method||"GET").toUpperCase(),path=String(req&&req.path||"");
  const api=String(req&&req.api||"calendar"),base=WG_BASE[api];
  if(!base||!(api==="calendar"?WG_PATH.calendar:WG_PATH.drive).test(path))
    return {ok:false,status:0,error:"Not a request this app makes: "+method+" "+path};
  const key=wgGet(WG_TOK,sessionStorage);
  if(!key||key.exp-60000<Date.now()){wgNeedRenew();return {ok:false,status:401,error:"renew"};}
  const qs=req.query?"?"+new URLSearchParams(req.query).toString():"";
  let body,ctype;
  if(api==="upload"){
    const up=req.upload||{},b="orbit"+Array.from(crypto.getRandomValues(new Uint8Array(12)),x=>x.toString(16).padStart(2,"0")).join("");
    ctype="multipart/related; boundary="+b;
    body="--"+b+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+JSON.stringify(up.meta||{})+
      "\r\n--"+b+"\r\nContent-Type: "+(up.type||"application/json")+"\r\n\r\n"+String(up.content||"")+"\r\n--"+b+"--";
  }else if(req.body){ctype="application/json";body=JSON.stringify(req.body);}
  let res;
  try{res=await fetch(base+path+qs,{method:method,body:body,
    headers:Object.assign({Authorization:"Bearer "+key.token},ctype?{"Content-Type":ctype}:{})});}
  catch(e){return {ok:false,status:0,error:"offline"};}
  if(res.status===401){wgPut(WG_TOK,null,sessionStorage);wgNeedRenew();return {ok:false,status:401,error:"renew"};}
  let data=null;
  if(res.status!==204){try{data=await res.json();}catch(e){}}
  return {ok:res.ok,status:res.status,data:data,
    error:res.ok?"":(data&&data.error&&data.error.message)||("HTTP "+res.status)};
}
const WEB_GOOGLE={gcalStatus:async()=>wgStatus(),gcalConnect:wgConnect,gcalCancel:wgCancel,
  gcalDisconnect:wgDisconnect,gcalRequest:wgRequest};
/* The Google account, whichever way this copy reaches it. */
const gAcct=()=>{const o=desktop();return o&&o.gcalRequest?o:wgOrigin()&&wgClientId()?WEB_GOOGLE:null;};
const hasGoogle=()=>!!gAcct();
const googleWeb=()=>!!(gAcct()===WEB_GOOGLE);
/* Whether this copy can actually sign in: the way to Google, and the app's
   own Google client to sign in with. A copy built or served without one
   (a developer's, before the keys are in) runs without an account rather
   than asking anyone for keys. */
function googleReady(){
  if(!hasGoogle())return false;
  if(googleWeb())return true;
  const st=GC.status||{};
  return !!(st.builtIn||st.clientId);
}
function noGoogleWhy(){
  if(hasGoogle()||(wgOrigin()&&!desktop()))return "Signing in with Google isn’t switched on for this copy of Everyday Orbit yet.";
  if(window.claude)return "This copy of Everyday Orbit can’t sign in with Google.";
  return "Opened straight from a file, Everyday Orbit can’t sign in with Google.";
}

/* The hour is up: one click on Reconnect gets the next key -- Google's
   window opens and, with access already given, closes by itself -- and
   whatever was held back runs. */
function wgNeedRenew(){if(!WG.renew){WG.renew=true;wgPill();}}
function wgPill(){
  let p=el("gRenew");
  if(!WG.renew||OB.open||!signedIn()){if(p)p.remove();return;}
  if(p)return;
  p=document.createElement("div");p.id="gRenew";p.className="g-renew";p.setAttribute("role","status");
  p.innerHTML=icon("i-cloud","ic-14")+'<span>Reconnect Google to keep '+(driveOn()&&gcalOn()?"backing up and syncing":driveOn()?"backing up":"syncing")+'.</span>'+
    '<button class="btn btn-sm btn-primary" data-act="g-renew">Reconnect</button>';
  document.body.appendChild(p);
}
function wgRenew(){
  const p=acctParts(),want=["account"].concat(p.calendar?["calendar"]:[],p.drive?["drive"]:[]);
  wgConnect({want:want}).then(r=>{
    if(!(r&&r.ok)){if(r&&r.error!=="Cancelled.")toast(r.error);return;}
    GC.err="";DB.err="";
    if(gcalOn())gcalSync();
    if(driveOn())driveBackup();
    panels();
  });
}

/* ============ google calendar ============ */
/* Two jobs, kept apart.

   Showing. Events from the Google calendars you tick are fetched for the
   weeks around the one on screen and held in GC.events. They are drawn beside
   the planner's own things and never become tasks.

   Syncing. Dated tasks and active routines are written into your main Google
   calendar as events whose private extended properties carry orbitApp,
   orbitKind and orbitId. That is how the planner finds its own events, and
   why it leaves them out of what it shows: it already draws those itself.

   Each link is remembered in prefs.gcal.links as {e: event id, h: a hash of
   what was last written, u: the event's "updated" stamp when last seen}.
   A new hash means the planner changed the item; a new stamp means someone
   changed the event in Google. If both changed, the planner wins. An event
   deleted in Google stops that item syncing ({off:true}) rather than being
   put back, and the item itself is left alone. */
const TZ=(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC";}catch(e){return "UTC";}})();
const BYDAY=["SU","MO","TU","WE","TH","FR","SA"];
/* Tasks further back than this are history, not plans. A first sync should
   not pour two years of finished work into someone's calendar. */
const GCAL_BACK=14;

/* Fills in defaults on the one object rather than replacing it. A sync holds
   on to this across many awaits; handing out a fresh copy meanwhile left it
   writing "last synced" into an object nothing read any more. */
function gcalPrefs(){
  const g=S.prefs.gcal||(S.prefs.gcal={});
  if(g.pushTasks===undefined)g.pushTasks=true;
  if(g.pushRoutines===undefined)g.pushRoutines=true;
  if(!g.cals)g.cals={};
  if(!g.links)g.links={};
  if(!g.last)g.last=0;
  return g;
}
const gcalBridge=()=>gAcct();
/* Calendar is one part of the Google account: connected when that part was
   granted and not switched off here. Switching it off keeps the account --
   the same key signs in and backs up. */
const gcalOn=()=>!!(gcalBridge()&&GC.status&&GC.status.connected&&
  (!GC.status.parts||GC.status.parts.calendar)&&!(S.prefs.gcal&&S.prefs.gcal.off));
function gcalSoon(){
  try{if(!gcalOn())return;}catch(e){return;}
  clearTimeout(GC.soon);GC.soon=setTimeout(()=>gcalSync(),4000);
}

async function gapi(method,path,query,body){
  const o=gcalBridge();if(!o)return {ok:false,error:"desktop"};
  const r=await o.gcalRequest({method:method,path:path,query:query||null,body:body||null});
  if(!r.ok&&r.error==="reconnect"){GC.status=Object.assign({},GC.status,{connected:false});
    GC.err="Google Calendar needs connecting again.";}
  if(!r.ok&&r.error==="renew")GC.err="Google needs you to reconnect before it can sync.";
  return r;
}
async function gList(path,query){
  let items=[],page="";
  for(let i=0;i<25;i++){
    const r=await gapi("GET",path,Object.assign({},query,page?{pageToken:page}:{}));
    if(!r.ok)throw new Error(r.error==="offline"?"You look to be offline.":r.error==="renew"?"Google needs you to reconnect before it can sync.":r.error||"Google Calendar did not answer.");
    items=items.concat((r.data&&r.data.items)||[]);
    page=r.data&&r.data.nextPageToken;if(!page)break;
  }
  return items;
}
const ep=ev=>(ev&&ev.extendedProperties&&ev.extendedProperties.private)||{};
const gHash=ev=>JSON.stringify([ev.summary,ev.start,ev.end,ev.recurrence||null]);
const evPath=id=>"/calendars/primary/events/"+encodeURIComponent(id);

/* ---- what the planner writes ---- */
function taskEvent(t){
  const ev={summary:(t.status==="completed"?"✓ ":"")+t.title,
    /* A task is not a meeting: it should not show you as busy. */
    transparency:"transparent",
    extendedProperties:{private:{orbitApp:"1",orbitKind:"task",orbitId:t.id}}};
  /* On its date: from its start to its end time, or all day. */
  const sp=tSpan(t);
  if(sp){ev.start={dateTime:t.due+"T"+m2hm(sp.start)+":00",timeZone:TZ};
    ev.end={dateTime:t.due+"T"+m2hm(Math.min(sp.end,24*60-1))+":00",timeZone:TZ};}
  else{ev.start={date:t.due};ev.end={date:ymd(addDays(parseD(t.due),1))};}
  return ev;
}
/* A repeating event's first instance has to be a day it actually falls on. */
function routineFirst(r){
  let d=parseD(r.start||TODAY());
  if(r.freq==="interval")return d;
  for(let i=0;i<7;i++){if((r.days||[]).indexOf(d.getDay())>-1)return d;d=addDays(d,1);}
  return d;
}
function routineRule(r,timed){
  let rule;
  if(r.freq==="interval")rule="RRULE:FREQ=DAILY;INTERVAL="+Math.max(1,r.every||2);
  else{const days=(r.days||[]).slice().sort();
    rule=days.length===7?"RRULE:FREQ=DAILY":"RRULE:FREQ=WEEKLY;BYDAY="+days.map(x=>BYDAY[x]).join(",");}
  if(r.end)rule+=";UNTIL="+r.end.replace(/-/g,"")+(timed?"T235959Z":"");
  return rule;
}
function routineEvent(r){
  const first=ymd(routineFirst(r)),timed=!!r.time;
  const ev={summary:r.title,recurrence:[routineRule(r,timed)],
    extendedProperties:{private:{orbitApp:"1",orbitKind:"routine",orbitId:r.id}}};
  if(timed){
    const x=r.time.split(":").map(Number),end=x[0]*60+x[1]+(Number(r.dur)||30);
    const endDay=ymd(addDays(parseD(first),Math.floor(end/1440))),em=end%1440;
    ev.start={dateTime:first+"T"+r.time+":00",timeZone:TZ};
    ev.end={dateTime:endDay+"T"+pad(Math.floor(em/60))+":"+pad(em%60)+":00",timeZone:TZ};
  }else{ev.start={date:first};ev.end={date:ymd(addDays(parseD(first),1))};}
  return ev;
}

/* ---- what comes back ---- */
function applyTaskEvent(t,ev){
  const title=String(ev.summary||"").replace(/^✓\s*/,"").trim();
  const sd=ev.start&&(ev.start.date||String(ev.start.dateTime||"").slice(0,10));
  if(!sd)return;
  const before=JSON.parse(JSON.stringify(t));
  if(title)t.title=title;
  /* Moved or resized in Google: its day and times follow. The deadline is
     the planner's own and is left alone. */
  if(ev.start.dateTime){
    const st=new Date(ev.start.dateTime),en=ev.end&&ev.end.dateTime?new Date(ev.end.dateTime):null;
    t.due=ymd(st);t.dueTime=pad(st.getHours())+":"+pad(st.getMinutes());
    t.endTime=!en?"":ymd(en)===t.due?pad(en.getHours())+":"+pad(en.getMinutes()):"23:59";
  }else{t.due=sd;t.dueTime="";t.endTime="";}
  t.start="";
  if(JSON.stringify(before)!==JSON.stringify(t)){
    logAct(t.id,"gcal","Changed in Google Calendar");
    logChanges(t.id,before,t);
  }
}
function applyRoutineEvent(r,ev){
  const title=String(ev.summary||"").trim();
  if(title)r.title=title;
  if(ev.start&&ev.start.dateTime&&ev.end&&ev.end.dateTime){
    const st=new Date(ev.start.dateTime),en=new Date(ev.end.dateTime);
    r.time=pad(st.getHours())+":"+pad(st.getMinutes());
    r.dur=Math.max(5,Math.round((en-st)/60000));
  }
  /* Which days it repeats on can be changed there too. */
  const rule=((ev.recurrence||[]).filter(x=>/^RRULE:/.test(x))[0]||"").slice(6);
  if(rule){
    const kv={};rule.split(";").forEach(p=>{const q=p.split("=");kv[q[0]]=q[1];});
    if(kv.FREQ==="DAILY"&&Number(kv.INTERVAL)>1){r.freq="interval";r.every=Number(kv.INTERVAL);r.days=[];}
    else if(kv.FREQ==="DAILY"){r.freq="weekly";r.days=[0,1,2,3,4,5,6];}
    else if(kv.FREQ==="WEEKLY"&&kv.BYDAY){
      const days=kv.BYDAY.split(",").map(x=>BYDAY.indexOf(x.replace(/^[-+\d]+/,""))).filter(x=>x>-1);
      if(days.length){r.freq="weekly";r.days=days.sort();}
    }
    if(kv.UNTIL)r.end=kv.UNTIL.slice(0,4)+"-"+kv.UNTIL.slice(4,6)+"-"+kv.UNTIL.slice(6,8);
  }
}

/* ---- the sync ---- */
async function gcalSync(){
  if(!gcalOn()||GC.busy)return;
  GC.busy=true;GC.err="";paintGcal();
  const g=gcalPrefs(),links=g.links;
  let touchedTasks=false,touchedRoutines=false;
  try{
    const mine=await gList("/calendars/primary/events",
      {privateExtendedProperty:"orbitApp=1",showDeleted:"true",maxResults:"2500"});
    const byEvent={},byItem={};
    mine.forEach(ev=>{byEvent[ev.id]=ev;const id=ep(ev).orbitId;if(id&&ev.status!=="cancelled")byItem[id]=ev;});

    const floor=ymd(addDays(today(),-GCAL_BACK)),want={};
    if(g.pushTasks)S.tasks.forEach(t=>{
      if(t.due&&t.status!=="dropped"&&(t.due>=floor||links[t.id]))want[t.id]={kind:"task",item:t,ev:taskEvent(t)};});
    if(g.pushRoutines)S.routines.forEach(r=>{
      if(r.active&&(r.freq==="interval"||(r.days||[]).length))want[r.id]={kind:"routine",item:r,ev:routineEvent(r)};});

    /* Linked, but no longer wanted: deleted here, undated, dropped, paused,
       or its kind switched off in Settings. The event goes. */
    for(const id of Object.keys(links)){
      if(want[id])continue;
      const L=links[id],ev=L.e&&byEvent[L.e];
      if(ev&&ev.status!=="cancelled"&&!L.off){
        const r=await gapi("DELETE",evPath(L.e));
        if(!r.ok&&r.status!==404&&r.status!==410)throw new Error(r.error);
      }
      delete links[id];
    }

    for(const id of Object.keys(want)){
      const w=want[id],L=links[id],h=gHash(w.ev);
      if(L&&L.off)continue;
      const ev=L&&L.e?byEvent[L.e]:byItem[id];
      if(L&&L.e&&(!ev||ev.status==="cancelled")){
        links[id]={off:true};
        if(w.kind==="task")logAct(id,"gcal","Deleted in Google Calendar, so it no longer syncs there");
        continue;
      }
      if(!ev){
        const r=await gapi("POST","/calendars/primary/events",null,w.ev);
        if(!r.ok)throw new Error(r.error);
        links[id]={e:r.data.id,h:h,u:r.data.updated};
        continue;
      }
      const mineChanged=!L||L.h!==h,theirsChanged=!!L&&ev.updated!==L.u;
      if(mineChanged){
        const r=await gapi("PATCH",evPath(ev.id),null,w.ev);
        if(!r.ok)throw new Error(r.error);
        links[id]={e:ev.id,h:h,u:r.data.updated};
      }else if(theirsChanged){
        GC.applying=true;
        try{if(w.kind==="task"){applyTaskEvent(w.item,ev);touchedTasks=true;}
            else{applyRoutineEvent(w.item,ev);touchedRoutines=true;}}
        finally{GC.applying=false;}
        const now=w.kind==="task"?taskEvent(w.item):routineEvent(w.item);
        links[id]={e:ev.id,h:gHash(now),u:ev.updated};
      }
    }
    await gcalFetchShown(true);
    g.last=Date.now();
  }catch(e){
    GC.err=e&&e.message?e.message:"Sync failed.";
  }finally{
    GC.applying=true;
    try{if(touchedTasks)save("tasks");if(touchedRoutines)save("routines");save("prefs");}
    finally{GC.applying=false;GC.busy=false;}
    softRender();paintGcal();
  }
}

/* ---- what is shown ---- */
function gcalWindow(){
  const base=startOfWeek(new Date(V.anchor.getFullYear(),V.anchor.getMonth(),1));
  const a=addDays(base,-7),b=addDays(base,49),ta=addDays(today(),-7),tb=addDays(today(),14);
  return {from:ymd(a<ta?a:ta),to:ymd(b>tb?b:tb)};
}
const calShown=c=>{const m=gcalPrefs().cals;return m[c.id]!==undefined?!!m[c.id]:!!c.primary;};
async function gcalFetchShown(force){
  if(!gcalOn())return;
  const w=gcalWindow();
  if(!force&&GC.from&&w.from>=GC.from&&w.to<=GC.to)return;
  const list=await gList("/users/me/calendarList",{minAccessRole:"reader"});
  GC.cals=list.map(c=>({id:c.id,name:c.summaryOverride||c.summary||c.id,color:c.backgroundColor||"#6B8BD9",primary:!!c.primary}))
    .sort((a,b)=>(b.primary?1:0)-(a.primary?1:0)||a.name.localeCompare(b.name));
  const timeMin=parseD(w.from).toISOString(),timeMax=parseD(w.to).toISOString(),out=[];
  for(const c of GC.cals.filter(calShown)){
    const items=await gList("/calendars/"+encodeURIComponent(c.id)+"/events",
      {singleEvents:"true",orderBy:"startTime",maxResults:"2500",timeMin:timeMin,timeMax:timeMax});
    items.forEach(ev=>{
      if(ev.status==="cancelled"||ep(ev).orbitApp)return;
      /* An invitation you turned down is not in your day. */
      if((ev.attendees||[]).some(a=>a.self&&a.responseStatus==="declined"))return;
      const all=!!(ev.start&&ev.start.date);
      out.push({id:ev.id,cal:c.id,calName:c.name,color:c.color,title:ev.summary||"(No title)",allDay:all,
        sd:all?ev.start.date:"",ed:all?ev.end.date:"",
        st:all?0:Date.parse(ev.start.dateTime),en:all?0:Date.parse(ev.end.dateTime),
        where:ev.location||"",link:ev.htmlLink||"",meet:ev.hangoutLink||""});
    });
  }
  GC.events=out;GC.from=w.from;GC.to=w.to;
}
/* Called on every calendar or dashboard draw; fetches only when the weeks on
   screen fall outside what is already held. */
function gcalEnsure(){
  if(!gcalOn()||GC.busy||GC.fetching)return;
  const w=gcalWindow();
  if(GC.from&&w.from>=GC.from&&w.to<=GC.to)return;
  GC.fetching=true;
  gcalFetchShown(false).catch(e=>{GC.err=e.message||"Could not load events.";})
    .then(()=>{GC.fetching=false;softRender();});
}
/* A day's events, split the way the views draw them. Timed ones are clipped
   to the day, so an event across midnight shows on both sides of it. */
function gcalFor(d){
  const s=ymd(d),d0=new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime(),d1=addDays(d,1).setHours(0,0,0,0);
  const timed=[],allDay=[];
  GC.events.forEach(e=>{
    if(e.allDay){if(e.sd<=s&&s<e.ed)allDay.push(e);return;}
    if(e.en<=d0||e.st>=d1)return;
    const a=Math.max(e.st,d0),b=Math.min(e.en,d1);
    timed.push({kind:"gcal",g:e,date:s,start:Math.round((a-d0)/60000),dur:Math.max(15,Math.round((b-a)/60000))});
  });
  return {timed:timed,allDay:allDay};
}
function gcalTimedToday(){
  return gcalFor(today()).timed.map(x=>({title:x.g.title,color:x.g.color,start:x.start,end:x.start+x.dur,
    act:'data-act="gcal-ev" data-id="'+esc(x.g.id)+'"'}));
}
function gcalWhen(e){
  if(e.allDay){
    const last=ymd(addDays(parseD(e.ed),-1));
    return e.sd===last?"All day":"All day, "+fmtDate(e.sd)+" – "+fmtDate(last);
  }
  const a=new Date(e.st),b=new Date(e.en),hm=x=>fmtTime(pad(x.getHours())+":"+pad(x.getMinutes()));
  return (ymd(a)!==TODAY()?fmtDate(ymd(a))+", ":"")+hm(a)+" – "+hm(b);
}
function gcalEventModal(id){
  const e=GC.events.filter(x=>x.id===id)[0];if(!e)return;
  openModal('<div class="modal narrow" role="dialog" aria-modal="true" aria-label="Event">'+
    '<div class="mhead2"><span class="gdot" style="--c:'+e.color+'"></span><h2>'+esc(e.title)+'</h2>'+
    '<button class="icon-btn" data-act="close" aria-label="Close">'+icon("i-x")+'</button></div>'+
    '<div class="mbody gev">'+
      '<p>'+icon("i-clock","ic-14")+esc(gcalWhen(e))+'</p>'+
      '<p>'+icon("i-calendar","ic-14")+esc(e.calName)+'</p>'+
      (e.where?'<p>'+icon("i-flag","ic-14")+esc(e.where)+'</p>':"")+
      (e.meet?'<p>'+icon("i-link","ic-14")+'<a href="'+esc(e.meet)+'" target="_blank" rel="noopener">Join the video call</a></p>':"")+
      '<p class="gev-note">From Google Calendar. Change it there.</p>'+
    '</div><div class="mfoot">'+
      (e.link?'<a class="btn" href="'+esc(e.link)+'" target="_blank" rel="noopener">'+icon("i-pop","ic-14")+'Open in Google Calendar</a>':"")+
      '<div class="spacer" style="flex:1"></div><button class="btn btn-primary" data-act="close">Done</button></div></div>');
}

/* ---- redraws that respect the caret ----
   A sync finishing while you type in the scratch pad or a search box would
   throw the caret away, so the redraw waits until you leave the field. */
function typingInView(){
  const a=document.activeElement,vp=el("viewport");
  return !!(a&&vp&&vp.contains(a)&&(a.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)));
}
function softRender(){
  if(typingInView()){V.renderLater=true;return;}
  V.renderLater=false;render();
}
document.addEventListener("focusout",function(){
  if(!V.renderLater)return;
  setTimeout(function(){if(V.renderLater&&!typingInView()){V.renderLater=false;render();}},0);
});
/* Settings shows the sync state; keep it current if it is open on that tab. */
function paintGcal(){
  if(el("modalRoot").querySelector('.modal.settings .set-pane[data-tab="connections"]'))settingsModal();
}

async function gcalConnect(){
  const o=gcalBridge();if(!o||GC.connecting)return;
  GC.connecting=true;GC.err="";panels();
  let r;
  try{r=await o.gcalConnect(signedIn()?{want:["calendar"]}:{clientId:GC.draft.id,clientSecret:GC.draft.secret});}
  catch(e){r={ok:false,error:"Could not start the sign-in."};}
  GC.connecting=false;
  if(r&&r.ok){
    if(S.prefs.gcal)S.prefs.gcal.off=false;save("prefs");
    GC.draft={id:"",secret:""};
    try{GC.status=await o.gcalStatus();}catch(e){}
    toast("Connected to Google Calendar");
    panels();gcalSync();
  }else{
    if(r&&r.error!=="Cancelled.")GC.err=r&&r.error||"Could not connect.";
    panels();
  }
}
async function gcalDisconnect(){
  const o=gcalBridge();if(!o)return;
  /* Signed in, the key is the account's too: switch Calendar off and keep
     it. Only the Calendar-only sign-in of before is revoked outright. */
  if(signedIn()&&GC.status.parts&&GC.status.parts.account)gcalPrefs().off=true;
  else try{await o.gcalDisconnect();GC.status=await o.gcalStatus();}catch(e){}
  /* The events stay in Google; only the links go. Connect again and the
     planner finds its own events by the orbitId they carry, so nothing is
     written twice. The links kept are the ones you stopped by deleting the
     event in Google: that was a choice about the item, and reconnecting
     should not undo it. */
  const g=gcalPrefs();Object.keys(g.links).forEach(id=>{if(!g.links[id].off)delete g.links[id];});save("prefs");
  GC.events=[];GC.cals=[];GC.from=GC.to="";GC.err="";
  panels();softRender();toast("Google Calendar disconnected");
}
async function gcalBoot(){
  const o=gcalBridge();if(!o||!o.gcalStatus)return;
  try{GC.status=await o.gcalStatus();}catch(e){return;}
  if(gcalOn())gcalSync();
  setInterval(()=>{if(gcalOn())gcalSync();},5*60*1000);
}

/* ============ google drive backup ============
   With the planner kept in Drive, a copy goes into one file there after every
   change, twenty seconds after the last one, so a burst of edits is one
   upload. It is the same file a backup by hand makes. The Drive permission
   reaches only the files this app made, so the file is found by name among
   those and nothing else in someone's Drive is visible to it.

   Writing down when it last backed up is itself a save of prefs, which would
   schedule another backup, and so on forever: DB.quiet holds that off. */
const DRIVE_FILE="Everyday Orbit backup.json";
const DB={soon:null,busy:false,err:"",quiet:false};
const driveOn=()=>!!(hasGoogle()&&S.prefs&&S.prefs.storage==="drive"&&acctParts().drive);
function backupPayload(){
  const p={app:"everyday-orbit",version:1,exported:new Date().toISOString(),data:{}};
  KEYS.forEach(k=>{p.data[k]=S[k];});
  return p;
}
function driveSoon(){
  if(DB.quiet||!driveOn())return;
  clearTimeout(DB.soon);DB.soon=setTimeout(()=>{driveBackup().catch(()=>{});},20000);
}
async function driveFind(){
  const o=gAcct();
  const r=await o.gcalRequest({api:"drive",method:"GET",path:"/files",
    query:{q:"name = '"+DRIVE_FILE+"' and trashed = false",fields:"files(id,modifiedTime)",orderBy:"modifiedTime desc",pageSize:"5",spaces:"drive"}});
  if(!r.ok)throw new Error(r.error==="renew"?"Reconnect Google to reach your Drive.":r.error==="reconnect"?"Sign in again to reach Google Drive.":r.error==="offline"?"You are offline.":"Google Drive said: "+r.error);
  return (r.data&&r.data.files&&r.data.files[0])||null;
}
async function driveRead(id){
  const r=await gAcct().gcalRequest({api:"drive",method:"GET",path:"/files/"+id,query:{alt:"media"}});
  return r.ok?r.data:null;
}
async function driveBackup(){
  if(!driveOn()||DB.busy)return false;
  DB.busy=true;
  try{
    const o=gAcct(),d=S.prefs.drive||{},text=JSON.stringify(backupPayload());
    const up=(method,path,meta)=>o.gcalRequest({api:"upload",method:method,path:path,
      query:{uploadType:"multipart",fields:"id,modifiedTime"},upload:{meta:meta,content:text,type:"application/json"}});
    let id=d.fileId,r=id?await up("PATCH","/files/"+id,{}):null;
    if(!r||!r.ok){
      const f=await driveFind();id=f&&f.id;
      r=id?await up("PATCH","/files/"+id,{}):await up("POST","/files",{name:DRIVE_FILE,mimeType:"application/json",
        description:"Everyday Orbit keeps a copy of your planner here. Sign in on another computer to bring it back."});
    }
    if(!r.ok)throw new Error(r.error==="renew"?"Reconnect Google to carry on backing up.":r.error==="reconnect"?"Sign in again to back up to Google Drive.":r.error==="offline"?"Offline; it will back up when you are back.":"Google Drive said: "+r.error);
    DB.err="";DB.quiet=true;
    S.prefs.drive=Object.assign({},d,{fileId:r.data.id,last:Date.now()});save("prefs");
    DB.quiet=false;
    return true;
  }catch(e){DB.err=e.message;return false;}
  finally{DB.busy=false;panels();}
}
/* A restore brings back everything, except what belongs to this computer:
   where its vault is, where its backups go, the timer running on it, and
   this very setup. */
function applyBackup(d){
  const keep=S.prefs,dev={vault:keep.vault||"",autoBackup:keep.autoBackup,running:keep.running||null,
    onboard:keep.onboard,storage:keep.storage,drive:keep.drive,setup:true};
  KEYS.forEach(function(k){
    if(k==="completions")S.completions=(d.completions&&typeof d.completions==="object")?d.completions:{};
    else if(k==="prefs")S.prefs=Object.assign({hidden:[],scratch:""},d.prefs||{},dev);
    else if(Array.isArray(d[k]))S[k]=d[k];
  });
  hiddenCats();V.noteId=null;
  KEYS.forEach(function(k){touched[k]=true;save(k);});
  applyAppearance();render();
}

/* ============ time analytics ============ */

/* A bar row, used for both the category and the task breakdown. */
function barRow(label,secs,max,colour,right){
  const w=max?Math.max(1.5,secs/max*100):0;
  return '<div class="brow"><div class="blab">'+label+'</div>'+
    '<div class="btrack"><div class="bfill" style="width:'+w.toFixed(1)+'%;--c:'+(colour||"var(--accent)")+'"></div></div>'+
    '<div class="bval num">'+esc(right||fmtDur(secs))+'</div></div>';
}

const hadLocal=loadLocal();
render();
if(hadLocal)saveLocal();

/* A document edited inside Obsidian arrives here. The planner never writes
   back in response, so the two sides cannot ping-pong. */
function applyVaultChange(d){
  if(!d||!d.id)return;
  const doc=docById(d.id);if(!doc)return;
  const sameText=doc.md===d.md,sameTitle=!d.title||doc.title===d.title;
  if(sameText&&sameTitle)return;
  doc.md=d.md;
  if(d.title)doc.title=d.title;
  doc.updated=Date.now();
  save("docs");
  logAct(doc.task,"doc-edit","Updated “"+doc.title+"” from the vault",{doc:doc.id});
  renderSheet();
  toast("Updated “"+doc.title+"” from your vault");
}

(function bindDesktop(){
  const o=desktop();if(!o)return;
  if(o.onTimerCmd)o.onTimerCmd(function(d){
    if(!d||!d.cmd)return;
    const r=running();
    if(d.cmd==="toggle"&&r)toggleTimer(r.task);
    else if(d.cmd==="stop")stopTimer();
    else if(d.cmd==="open"&&r){V.view="tasks";openSheet(r.task);render();}
  });
  if(o.onVaultChange)o.onVaultChange(applyVaultChange);
  /* Keep the shell in step with the path the planner remembers. */
  if(o.useVault&&vaultPath())try{o.useVault(vaultPath());}catch(e){}
})();

/* In the hosted copy, wait for the cloud check before offering a fresh start,
   so a slow connection can never invite someone to overwrite existing data. */
/* Setup, or the sign-in, before anything else. On the desktop the account is
   asked about first, and the page stays hidden until the answer is in, so
   nobody sees their planner flash up only to be asked to sign in. In the
   hosted copy, wait for the cloud check first, so a slow connection can never
   invite someone to set up over existing data. */
async function accountBoot(){
  await wgLoad();
  const o=gAcct();
  if(o&&o.gcalStatus){try{GC.status=await o.gcalStatus();}catch(e){}}
  document.body.classList.remove("ob-wait");
  if(obNeeded())obStart();
  else if(driveOn()&&!(S.prefs.drive&&S.prefs.drive.last&&Date.now()-S.prefs.drive.last<36e5))driveSoon();
}
if(hasDesktop()||wgOrigin())document.body.classList.add("ob-wait");
if(window.claude&&window.claude.use)connect().then(accountBoot,accountBoot);
else{connect();accountBoot();}
/* The theme is applied before anything draws, so there is no flash of the
   wrong one on a dark setup. */
applyAppearance();
/* On "system" the OS can change the theme under us at dusk. The page follows
   by itself through the media query; the timer window has to be told. */
try{matchMedia("(prefers-color-scheme:dark)").addEventListener("change",syncTimerWindow);}catch(e){}
if(S.prefs&&!S.prefs.launchSet&&S.prefs.launch==="calendar"){S.prefs.launch="dashboard";save("prefs");}
if(S.prefs&&S.prefs.launch&&NAV.some(v=>v.id===S.prefs.launch)){V.view=S.prefs.launch;render();}
maybeAutoBackup();
wgLoad().then(gcalBoot);
remindBoot();
setInterval(()=>{if(V.view==="calendar"&&V.calMode==="week"&&!el("modalRoot").innerHTML&&!DG.on&&!document.querySelector(".drag-ghost"))renderView();},60000);
setInterval(()=>{if(V.view!=="dashboard")return;
  const n=el("dashNext");if(n)n.innerHTML=upNextHtml();
  const st=el("dashStrip");if(st)st.innerHTML=dayStripHtml();},30000);

/* The clock ticks in place. A full render every second would fight anything
   being typed, so only the two readouts are touched. */
setInterval(function(){
  const r=running();
  if(!r||!r.since)return;
  const t=taskById(r.task);if(!t)return;
  const secs=liveSecs(),est=tEst(t)*60,over=est&&secs>est;
  /* The calendar's live block counts with the pill and grows as the run
     does, touched in place; the grid itself redraws once a minute. */
  if(V.view==="calendar"){
    const lb=document.querySelector(".ev.tracked.live");
    if(lb){
      const c=lb.querySelector(".ev-clock");if(c)c.textContent=fmtDur((Number(lb.dataset.liveBase)||0)+secs);
      const mins=(Date.now()-Number(lb.dataset.liveStart))/60000;
      if(mins>0)lb.style.height=Math.max(16,(mins/60)*PX-2).toFixed(1)+"px";
    }
  }
  if(V.view==="dashboard"){
    document.querySelectorAll('[data-live="'+r.task+'"]').forEach(n=>{n.textContent=fmtDur(secs);});
    const tt=el("dashTotal"),td=trackedToday();
    if(tt)tt.textContent=totalMins(td.total);
    td.rows.forEach(x=>{const v=document.querySelector('[data-live-total="'+x.t.id+'"]');if(v)v.textContent=fmtDur(x.secs);});
  }
  const bar=document.querySelector(".tbar-time");
  if(bar){
    bar.innerHTML=esc(fmtDur(secs))+(est?"<em> of "+esc(fmtMins(est/60))+"</em>":"");
    const wrap=bar.closest(".tbar");if(wrap)wrap.classList.toggle("over",!!over);
  }
  /* Keep the panel readout live without redrawing it and losing the caret. */
  if(V.sheet&&V.sheet.id===r.task){
    const total=trackedSecs(r.task)+secs;
    const b=document.querySelector(".tm-total b");if(b)b.textContent=fmtDur(total);
    const tb=document.querySelector(".tmb-total");if(tb)tb.textContent=fmtTracked(total);
    const d=document.querySelector(".tm-delta");
    if(d&&est){d.textContent=total>est?"over by "+fmtDur(total-est):fmtDur(est-total)+" left";
      d.classList.toggle("over",total>est);}
    const fill=document.querySelector(".tm-bar i");
    if(fill&&est){fill.style.width=Math.min(100,total/est*100).toFixed(1)+"%";
      fill.parentNode.classList.toggle("over",total>est);}
  }
  syncTimerWindow();
},1000);

/* A timer left running when the app closed keeps its accumulated seconds but
   does not keep counting through time the app was not open. */
(function resumeTimer(){
  const r=running();
  if(r&&r.since){S.prefs.running=Object.assign({},r,{acc:liveSecs(),since:0});save("prefs");}
  syncTimerWindow();
})();
})();
