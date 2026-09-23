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
const fmtDate=s=>{if(!s)return"";const d=parseD(s);return MONS[d.getMonth()]+" "+d.getDate()+(d.getFullYear()!==today().getFullYear()?", "+d.getFullYear():"");};
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
/* ---- swimlanes ----
   The board's columns are the person's own: prefs.board.lanes, each
   {id, name, color, done}, in order. A task's status is the id of its lane.
   A new planner starts with To do, In progress and Completed; a planner from
   before lanes could be edited keeps the six it had, so nothing moves under
   anyone. A lane marked done is where ticking a task sends it, and what
   counts as finished everywhere: struck through, out of overdue, counted as
   done. Customise (the customise section) edits all of it. */
const LEGACY_LANES=[
 {id:"backlog",name:"Backlog",color:"#9AA298",done:false},
 {id:"planned",name:"Planned",color:"#4C6FE0",done:false},
 {id:"in_progress",name:"In Progress",color:"#D99A16",done:false},
 {id:"review",name:"Waiting for Review",color:"#7C5CE0",done:false},
 {id:"completed",name:"Completed",color:"#3F7D5C",done:true},
 {id:"dropped",name:"Dropped",color:"#C25340",done:true}];
const DEFAULT_LANES=[
 {id:"todo",name:"To do",color:"#6B7CE0",done:false},
 {id:"in_progress",name:"In progress",color:"#D99A16",done:false},
 {id:"completed",name:"Completed",color:"#3F7D5C",done:true}];
const LANE_COLORS=["#6B7CE0","#D99A16","#3F7D5C","#9AA298","#7C5CE0","#C25340","#2F9BA8","#D0588F","#8A6A3F","#5B8C3A"];
/* The task panel's parts that can be switched off, in the panel's order. */
const BOARD_FEATS=[
 ["Schedule",[["when","Date","The day and time you plan to do it","i-calendar"],["reminder","Reminder","A nudge before it starts","i-bell"],["created","Created","When it was added","i-plus"]]],
 ["Organize",[["category","Category","Which part of life it’s in","i-folder"],["priority","Priority","How urgent and important","i-flag"],["tags","Tags","Labels to find it by","i-tag"],["status","Lane","Which board lane it’s in","i-board"]]],
 ["Effort",[["estimate","Estimate","How long you think it’ll take","i-clock"],["timer","Time tracker","Time how long it really takes","i-timer"]]],
 ["Links and files",[["links","Linked tasks","Tasks it’s connected to","i-link"],["files","Files","Attachments","i-clip"]]],
 ["Content",[["desc","Description","Notes about the task","i-note"],["subtasks","Subtasks","Smaller steps inside it","i-checklist"],["docs","Documents","Longer pages of writing","i-doc"],["comments","Comments","Updates and thoughts","i-chat"],["activity","Activity history","A record of every change","i-chart"]]]];
/* The list view's columns besides the task itself; the first four are on
   to begin with. Custom fields join these as "cf:<id>". */
/* Which part of the task panel each list column belongs to. */
const FEAT_COL_OF={date:"when",category:"category",priority:"priority",tags:"tags",estimate:"estimate",tracked:"timer",status:"status",created:"created"};
const LIST_COLS=[["date","Date"],["priority","Priority"],["category","Category"],["status","Status"],
 ["estimate","Estimate"],["tracked","Time tracked"],["tags","Tags"],["created","Created"]];
/* The board settings, filled in on the one object (as gcalPrefs() is): a sync
   or a save may be holding it. The first time, it is written down at once,
   so a new planner's three lanes do not become six once it has tasks. */
function board(){
  const p=S.prefs;
  if(!p.board||typeof p.board!=="object")p.board={};
  const b=p.board;let made=false;
  if(!Array.isArray(b.lanes)||!b.lanes.length){
    /* Tasks already here were made with the old six; a planner with none
       is new, or empty, and starts with the three. */
    const old=(S.tasks||[]).length>0;
    b.lanes=JSON.parse(JSON.stringify(old?LEGACY_LANES:DEFAULT_LANES));made=true;
  }
  if(!b.show||typeof b.show!=="object")b.show={};
  if(b.show.created==null&&Array.isArray(b.cols)&&b.cols.some(c=>c.k==="created"&&c.on))b.show.created=true;
  if(!Array.isArray(b.fields))b.fields=[];
  if(!Array.isArray(b.cols)){b.cols=LIST_COLS.map((c,i)=>({k:c[0],on:i<4}));made=true;}
  if(made)setTimeout(()=>save("prefs"),0);
  return b;
}
const lanes=()=>board().lanes;
const lane=id=>lanes().find(l=>l.id===id)||null;
const ST=id=>lane(id)||{id:id,name:"No lane",color:"#8A8F98",done:false};
const isDoneT=t=>{const l=lane(t.status);return l?!!l.done:(isDoneT(t)||t.status==="dropped");};
const firstOpen=()=>(lanes().find(l=>!l.done)||lanes()[0]).id;
const firstDone=()=>(lanes().find(l=>l.done)||lanes()[lanes().length-1]).id;
/* Every part starts on except Created, a date nobody fills in. */
const FEAT_OFF={created:1};
const feat=k=>{const v=board().show[k];return v==null?!FEAT_OFF[k]:v!==false;};
/* A status from before -- the sample week, an old backup -- lands in the
   nearest lane there is. */
function laneFor(status){
  if(lane(status))return status;
  const L=lanes(),open=L.filter(l=>!l.done),done=L.filter(l=>l.done);
  if(status==="completed"||status==="dropped")return (done[0]||L[L.length-1]).id;
  if(status==="in_progress"||status==="review")return (open[1]||open[0]||L[0]).id;
  return (open[0]||L[0]).id;
}
/* A task with its every field, for anything that makes one. */
function newTask(preset){
  return Object.assign({id:uid("t"),title:"",desc:"",due:"",dueTime:"",endTime:"",deadline:"",cat:S.categories[0].id,
    status:firstOpen(),urgent:null,important:null,est:0,tags:[],links:[],subtasks:[],attachments:[],cf:{},
    created:TODAY(),completedAt:null},preset||{});
}
const QUADS=[
 {id:"do",name:"Do First",tag:"Urgent + Important",note:"Do these tasks immediately.",cls:"q-do",icon:"i-bolt"},
 {id:"decide",name:"Schedule",tag:"Important, not urgent",note:"Schedule time to work on these.",cls:"q-decide",icon:"i-calendar"},
 {id:"delegate",name:"Delegate",tag:"Urgent, not important",note:"Hand these to someone else.",cls:"q-delegate",icon:"i-user"},
 {id:"drop",name:"Eliminate",tag:"Neither",note:"Drop or ignore these.",cls:"q-drop",icon:"i-x"}];
const quadOf=t=>{if(t.urgent==null||t.important==null)return null;if(t.urgent&&t.important)return"do";if(!t.urgent&&t.important)return"decide";if(t.urgent&&!t.important)return"delegate";return"drop";};
const CAT_ICONS=["i-briefcase","i-laptop","i-home","i-user","i-target","i-heart","i-circle","i-flame","i-paw","i-rocket","i-book","i-star","i-cart","i-music","i-plane","i-dumbbell","i-leaf","i-coffee","i-palette","i-note"];
const CAT_COLORS=["#4C6FE0","#7C5CE0","#E0854A","#D95C93","#2F9C86","#D8544E","#7A8A80","#D99A16","#A9713B","#3F8F4F","#2E8BA8","#B0517E"];

/* ============ starting data ============ */
function baseCategories(){
  return [
   {id:"goals",name:"Goals",icon:"i-target",color:"#2F9C86"},
   {id:"work",name:"Work",icon:"i-briefcase",color:"#4C6FE0"},
   {id:"side",name:"Side Hustle",icon:"i-rocket",color:"#7C5CE0"},
   {id:"personal",name:"Personal",icon:"i-user",color:"#D95C93"},
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
/* A link goes both ways: a task shows the tasks it links to and the tasks
   that link to it. It is stored on the one it was made from; the other side
   is looked up (ixBack). */
const tLinks=t=>{const own=Array.isArray(t.links)?t.links:[];if(!t.id)return own;
  return own.concat((ixBack().get(t.id)||[]).filter(id=>own.indexOf(id)<0));};
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
/* The ten categories a planner started with before the five. One that
   still has exactly those, untouched, moves to the five; what was filed
   under one that went moves to the nearest that stayed. Categories anyone
   has renamed, recoloured, added to or taken from are theirs, and stay.
   Safe to run any number of times. */
const OLD_CATS="office:Office:#4C6FE0|freelance:Freelance:#7C5CE0|home:Home:#E0854A|personal:Personal:#D95C93|goals:Goals:#2F9C86|hubby:Hubby:#D8544E|passion:Passion:#D99A16|pets:Pets:#A9713B|side:Side Hustle:#3F8F4F|other:Other:#7A8A80";
const OLD_CAT_TO={office:"work",freelance:"side",home:"personal",hubby:"personal",passion:"goals",pets:"personal"};
function fixCats(){
  if((S.categories||[]).map(c=>c.id+":"+c.name+":"+c.color).join("|")!==OLD_CATS)return;
  const to=id=>OLD_CAT_TO[id]||id;
  S.tasks.forEach(t=>{t.cat=to(t.cat);});S.routines.forEach(r=>{r.cat=to(r.cat);});S.notes.forEach(x=>{x.cat=to(x.cat);});
  S.categories=baseCategories();
  const p=S.prefs;
  if(Array.isArray(p.hidden))p.hidden=p.hidden.filter(id=>!OLD_CAT_TO[id]);
  if(p.quickCat)p.quickCat=to(p.quickCat);
  ["categories","tasks","routines","notes","prefs"].forEach(k=>save(k));
}
/* The routines setup suggests are the default set, the way the five
   categories are. A planner begun before setup offered them gets them
   once (setup itself starts with none picked, and whatever it ends with
   is the person's choice); one that has routines, or chose in setup,
   keeps what it has, and emptying the list later is a choice too. Held
   back while setup is on screen, which makes this choice itself. */
function fixRoutines(){
  const p=S.prefs;if(p.rtSeeded||OB.open||obNeeded())return;
  p.rtSeeded=true;
  if(!S.routines.length){
    S.routines=OB_RT.map(x=>({id:uid("r"),title:x.title,cat:S.categories.some(c=>c.id===x.cat)?x.cat:S.categories[0].id,
      freq:"weekly",days:x.days.slice(),every:2,time:x.time,dur:x.dur,start:TODAY(),end:"",active:true,note:""}));
    save("routines");
  }
  save("prefs");
}
function fixTasks(){
  let n=0;
  (S.tasks||[]).forEach(t=>{
    if(!lane(t.status)){t.status=laneFor(t.status);n++;}
    if(!t.start)return;
    t.due=t.start;t.start="";n++;
  });
  if(n)save("tasks");
}
function sampleState(){
  const st=blankState(),o=n=>ymd(addDays(today(),n));
  const T=(title,due,cat,status,u,i,extra)=>Object.assign({id:uid("t"),title:title,desc:"",due:due,cat:cat,status:status,
    urgent:u,important:i,subtasks:[],created:o(-4),completedAt:status==="completed"?due:null},extra||{});
  st.tasks=[
   T("Reply to the emails still sitting in the inbox",o(-1),"work","planned",true,true),
   T("Send the invoice for last month",o(0),"side","in_progress",true,true,{dueTime:"15:00",endTime:"15:30"}),
   T("Draft the project brief",o(2),"work","planned",false,true,
     {dueTime:"14:00",endTime:"15:30",desc:"One page: the problem, who it is for, and how we will know it worked.",
      subtasks:[{id:uid("s"),t:"Collect the background notes",d:true},{id:uid("s"),t:"Write the first pass",d:false},{id:uid("s"),t:"Send it round for comments",d:false}]}),
   T("Book the dentist",o(1),"personal","backlog",true,false),
   T("Tidy the desk",o(3),"personal","backlog",false,false),
   T("Buy a birthday gift",o(5),"other","planned",false,true),
   T("Plan next month's goals",o(6),"goals","backlog",null,null),
   T("Renew the gym membership",o(-3),"personal","completed",false,true)];
  const R=(title,cat,days,time,dur)=>({id:uid("r"),title:title,cat:cat,freq:"weekly",days:days,every:2,
    time:time,dur:dur,start:o(-28),end:"",active:true,note:""});
  st.routines=[
   R("Morning stand-up","work",[1,2,3,4,5],"09:30",15),
   R("Deep work block","work",[1,2,3,4,5],"10:00",90),
   R("Evening walk","goals",[1,2,3,4,5,6,0],"18:30",30),
   R("Weekly review","goals",[5],"16:00",45),
   R("Water the plants","personal",[1,4],"08:00",10)];
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
      "<h2>Routines</h2><p>Anything that repeats: daily, weekdays, chosen days, or every few days. Check off the day squares to keep a streak going: any day counts, and doing it on a day off makes up for a missed one.</p>"+
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
const LS="ember-v1",LS_OLD="everyday-orbit-v1";   // the name before the planner was called Ember
/* A planner saved under the old name is read once and written back under
   the new one; the old key is left where it is, so an older copy of the app
   still opens the planner it knew. */
function loadLocal(){try{const raw=localStorage.getItem(LS)||localStorage.getItem(LS_OLD);if(!raw)return false;const o=JSON.parse(raw);KEYS.forEach(k=>{if(o[k])S[k]=o[k];});return true;}catch(e){return false;}}
let storageOK=true;
/* Writing the planner to storage turns all of it into one string, which on a
   planner a year in is a few megabytes -- too much to do on every tick, and a
   tick often saves two keys at once. Saves in the same moment are gathered
   into one write a quarter of a second later, and anything still waiting is
   written at once when the page is put away or closed. */
let lsTimer=null;
function saveLocal(){if(!lsTimer)lsTimer=setTimeout(saveLocalNow,250);}
function saveLocalNow(){
  clearTimeout(lsTimer);lsTimer=null;
  try{const o={};KEYS.forEach(k=>o[k]=S[k]);localStorage.setItem(LS,JSON.stringify(o));storageOK=true;}catch(e){storageOK=false;}
}
const flushLocal=()=>{if(lsTimer)saveLocalNow();};
window.addEventListener("pagehide",flushLocal);
window.addEventListener("beforeunload",flushLocal);
document.addEventListener("visibilitychange",()=>{if(document.hidden)flushLocal();});
function saveWhere(){let d=false;try{d=driveOn();}catch(e){}return d?"Backed up to Google Drive":"Saved on this "+(hasDesktop()?"computer":"browser");}
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
  dirty[key]=true;touched[key]=true;ixDrop();saveLocal();setSync("warn","Saving…");
  if((key==="tasks"||key==="routines")&&!GC.applying)gcalSoon();
  if(key==="tasks"||key==="routines"||key==="completions"||key==="prefs")remindSoon();
  driveSoon();
  clearTimeout(timers[key]);
  timers[key]=setTimeout(()=>{
    timers[key]=null;
    if(!db){setSync("ok",saveWhere());dirty[key]=false;return;}
    const body=bodyFor(key);
    suppress[key]=Date.now();
    db.doc("state/"+key).set(body).then(()=>{dirty[key]=false;setSync("ok","All changes saved");})
      .catch(()=>{dirty[key]=false;setSync("warn",saveWhere());});
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
  if(!cap){setSync("warn",saveWhere());return;}
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
  }catch(e){setSync("warn",saveWhere());}
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
function refreshCatsModal(){const r=el("modalRoot");if(r&&r.querySelector("#cmList"))catsModal();}
/* ---- lookups ----
   One pass over each big list, kept until the data changes, instead of a
   scan per card, per day or per row: a year in, the board was counting 8,000
   activity entries for each of 1,500 cards, and the month scanned every
   tracked session once per day. save() and render() drop it (ixDrop()), and
   whatever asks next builds only the part it needs. Code that changes S must
   save(), as it always has, or these go stale until the next render. */
var IX={};
function ixDrop(){IX={};}
const ix=(name,build)=>IX[name]||(IX[name]=build());
function groupBy(list,key){const m=new Map();(list||[]).forEach(x=>{const k=key(x);const a=m.get(k);if(a)a.push(x);else m.set(k,[x]);});return m;}
const ixTasks=()=>ix("tasks",()=>new Map(S.tasks.map(t=>[t.id,t])));
const ixAct=()=>ix("act",()=>groupBy(S.activity,a=>a.task));
const ixDocs=()=>ix("docs",()=>groupBy(S.docs,d=>d.task));
const ixSess=()=>ix("sess",()=>groupBy(S.sessions,x=>x.task));
const ixSessDay=()=>ix("sessDay",()=>groupBy(S.sessions,x=>ymd(new Date(x.start))));
/* A task belongs to its date. */
const ixBack=()=>ix("back",()=>{const m=new Map();S.tasks.forEach(x=>(Array.isArray(x.links)?x.links:[]).forEach(id=>{const a=m.get(id);if(a)a.push(x.id);else m.set(id,[x.id]);}));return m;});
const ixDay=()=>ix("day",()=>groupBy(tops(),t=>t.due||""));
const NONE=[];
const taskById=id=>ixTasks().get(id)||S.tasks.find(t=>t.id===id);
const routineById=id=>S.routines.find(r=>r.id===id);
const noteById=id=>S.notes.find(n=>n.id===id);
const isOpen=t=>!isDoneT(t);
/* Late if the day you planned it has gone. A separate due date was tried
   and taken out: two dates on a task read as two deadlines, and one of them
   was always the wrong one to look at. */
const isOverdue=t=>isOpen(t)&&!!t.due&&t.due<TODAY();
/* What "late" says: how far past the date. */
const lateText=t=>relDue(t.due);
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
/* Asked for by the sidebar, the dashboard and the calendar in one redraw, so
   worked out once per change. */
const overdueItems=()=>ix("overdue",overdueNow);
function overdueNow(){
  const tasks=tops().filter(t=>isOverdue(t)&&visibleCat(t.cat)).sort((a,b)=>a.due<b.due?-1:1);
  const miss=[];
  S.routines.filter(r=>visibleCat(r.cat)).forEach(r=>{
    for(let i=1;i<=7;i++){const d=addDays(today(),-i),s=ymd(d);
      if(routineOn(r,d)&&!doneR(r,s)&&!madeUp(r,d))miss.push({r:r,date:s});}
  });
  miss.sort((a,b)=>a.date<b.date?1:-1);
  return {tasks:tasks,miss:miss.slice(0,12)};
}

/* ============ empty states ============
   What a section says when there is nothing in it. Each has a small
   drawing of its own and a colour of its own (--h), a heading that says
   where things stand, a line on what to do next, and where it helps, the
   button that does it. es() is the full one, for a whole view or panel;
   es(...,{mini:1}) sits in a row, for a group inside a card. The drawings use
   the theme's greys and the section's colour, so they follow light and dark. */
const ES_ART={
  clear:'<rect x="16" y="14" width="50" height="44" rx="9" class="es-f"/><path d="M16 27h50M29 9v9M53 9v9" class="es-l"/>'+
    '<path d="M27 38h8M42 38h8M27 47h8" class="es-l es-dash"/><circle cx="68" cy="52" r="13" class="es-h"/><path d="m62 52 4.5 4.5L75 48" class="es-on"/>',
  list:'<rect x="20" y="12" width="46" height="50" rx="8" class="es-f"/><path d="M31 27h24M31 38h18M31 49h21" class="es-l"/>'+
    '<circle cx="70" cy="22" r="10" class="es-h"/><path d="M70 17v10M65 22h10" class="es-on"/><circle cx="14" cy="50" r="2.5" class="es-dot"/><circle cx="80" cy="56" r="2" class="es-dot"/>',
  filter:'<path d="M16 16h44l-17 20v16l-10 6V36z" class="es-f"/><circle cx="62" cy="48" r="12" class="es-hs"/><path d="m71 57 8 8" class="es-hl"/>'+
    '<path d="M57 48h10" class="es-hl"/>',
  timeline:'<path d="M14 40h68" class="es-l"/><circle cx="26" cy="40" r="4" class="es-f"/><circle cx="48" cy="40" r="4" class="es-f"/>'+
    '<circle cx="70" cy="40" r="4" class="es-f"/><path d="M36 20a12 12 0 1 1 24 0" class="es-hl"/><path d="M48 8v-2M34 14l-2-2M62 14l2-2" class="es-hl"/>',
  timer:'<circle cx="46" cy="40" r="22" class="es-f"/><path d="M46 12v6M40 12h12M63 23l4-4" class="es-l"/>'+
    '<path d="M46 40V27" class="es-hl"/><path d="M46 40l9 6" class="es-l"/><circle cx="46" cy="40" r="3" class="es-h"/>',
  routine:'<path d="M26 34a20 20 0 0 1 36-12" class="es-hl"/><path d="m62 12 1 10-10 1" class="es-hl"/>'+
    '<path d="M66 40a20 20 0 0 1-36 12" class="es-l"/><path d="m30 62-1-10 10-1" class="es-l"/>'+
    '<circle cx="36" cy="37" r="3" class="es-h"/><circle cx="46" cy="37" r="3" class="es-h"/><circle cx="56" cy="37" r="3" class="es-f"/>',
  notes:'<rect x="28" y="10" width="40" height="50" rx="7" class="es-f" transform="rotate(8 48 35)"/>'+
    '<rect x="22" y="14" width="40" height="50" rx="7" class="es-f es-front"/><path d="M31 28h22M31 37h22M31 46h14" class="es-l"/><circle cx="64" cy="58" r="9" class="es-h"/><path d="M60 58h8M64 54v8" class="es-on"/>',
  page:'<rect x="24" y="10" width="42" height="54" rx="7" class="es-f"/><path d="M33 24h24M33 33h24M33 42h12" class="es-l es-dash"/>'+
    '<path d="m58 58 14-14 5 5-14 14-7 2z" class="es-hs"/><path d="m68 48 5 5" class="es-hl"/>',
  day:'<path d="M12 52h72" class="es-l"/><path d="M28 52a20 20 0 0 1 40 0" class="es-hs"/>'+
    '<path d="M48 22v-8M26 32l-5-5M70 32l5-5M18 44h-6M84 44h-6" class="es-hl"/><path d="M24 60h16M52 60h22" class="es-l es-dash"/>',
  history:'<circle cx="50" cy="38" r="20" class="es-f"/><path d="M50 26v12l8 5" class="es-hl"/>'+
    '<path d="M24 26a28 28 0 0 0-2 12" class="es-l es-dash"/><circle cx="20" cy="46" r="2.5" class="es-dot"/><circle cx="16" cy="56" r="2" class="es-dot"/>',
  subs:'<rect x="26" y="12" width="42" height="46" rx="7" class="es-f"/><rect x="33" y="21" width="7" height="7" rx="2" class="es-h"/><path d="m34.5 24.5 1.6 1.6 3-3.2" class="es-on"/>'+
    '<rect x="33" y="32" width="7" height="7" rx="2" class="es-l"/><rect x="33" y="43" width="7" height="7" rx="2" class="es-l"/><path d="M45 24.5h15M45 35.5h12M45 46.5h14" class="es-l"/>'+
    '<circle cx="66" cy="54" r="10" class="es-h"/><path d="M62 54h8M66 50v8" class="es-on"/>',
  doc:'<rect x="30" y="12" width="36" height="46" rx="6" class="es-f"/><path d="M38 26h20M38 34h20M38 42h12" class="es-l"/><circle cx="66" cy="54" r="10" class="es-h"/><path d="M62 54h8M66 50v8" class="es-on"/>',
  board:'<rect x="14" y="16" width="20" height="44" rx="5" class="es-f"/><rect x="38" y="16" width="20" height="44" rx="5" class="es-f"/>'+
    '<rect x="62" y="16" width="20" height="44" rx="5" class="es-f"/><rect x="40" y="22" width="16" height="10" rx="3" class="es-h"/>'
};
function esArt(kind,extra){
  return '<svg class="es-art" viewBox="0 0 96 72" aria-hidden="true">'+(extra||ES_ART[kind]||"")+'</svg>';
}
function es(kind,title,text,o){
  o=o||{};
  return '<div class="es'+(o.mini?" es-mini":"")+(o.cls?" "+o.cls:"")+'" style="--h:'+(o.hue||"var(--accent)")+'">'+
    (o.icon?'<span class="es-badge">'+icon(o.icon,o.mini?"ic-16":"ic-22")+'</span>':esArt(kind))+
    '<div class="es-copy"><b>'+title+'</b>'+(text?'<p>'+text+'</p>':"")+
    (o.actions?'<div class="es-acts">'+o.actions+'</div>':"")+'</div></div>';
}
/* What each quadrant says when it has nothing. */
const QUAD_EMPTY={
  do:["No fires today","Nothing is both urgent and important. Enjoy the calm."],
  decide:["Room to think ahead","Important work without a due date breathing down its neck belongs here."],
  delegate:["Nothing to hand off","Urgent things someone else could do will gather here."],
  drop:["Nothing to let go of","Tasks that are neither urgent nor important can wait here, or go."]};
/* What each board column says when it is empty. */
const COL_EMPTY={todo:"Nothing to do yet",backlog:"Park ideas here",planned:"Nothing lined up",in_progress:"Nothing on the go",
  review:"Nothing waiting on anyone",completed:"Finished work lands here",dropped:"Nothing dropped"};

/* ============ view state ============ */
const V={view:"dashboard",calMode:"week",anchor:today(),taskMode:"board",q:"",odOpen:true,adv:false,sheet:null,range:"week",
  f:{quick:"all",status:"",cat:"",quad:"",from:"",to:"",sort:"due"},noteId:null,noteTag:""};

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

/* The foot of the sidebar is who this planner is for and whether it is
   safe: a letter, the name, and the save state under it, the whole row
   opening Settings. Backup and restore were two bare arrows here; they live
   in Settings > Your data, with words. */
function renderMe(){
  const st=GC.status||{},name=S.prefs.name||st.first||st.name||"";
  const n=el("meName"),av=el("meAv");
  if(n)n.textContent=name||"Your planner";
  if(av)av.textContent=(name||st.email||"?").charAt(0).toUpperCase();
}
/* The sidebar can be folded to its icons, and stays as it was left.
   Open is the default. Below 1080px the width decides, not the button. */
function applyRail(){
  const mini=!!S.prefs.railMini;document.body.classList.toggle("rail-mini",mini);
  const b=el("railMini");if(b){const l=mini?"Expand the sidebar":"Collapse the sidebar";b.setAttribute("aria-label",l);b.title=l;b.setAttribute("aria-expanded",String(!mini));}
}
function renderRail(){
  applyRail();
  const bs=el("brandSub");if(bs)bs.textContent="Personal planner";
  renderMe();
  el("nav").innerHTML=NAV.map(n=>{const a=navAlert(n.id);
    return '<button class="nav-btn" data-act="view" data-view="'+n.id+'" aria-current="'+(V.view===n.id)+'" title="'+esc(n.name+(a?" · "+a.label:""))+'">'+
      icon(n.icon,"ic-18")+'<span>'+esc(n.name)+'</span>'+
      /* <b>, not <span>: the icon-only rail hides every span in a nav button,
         and an alert has to survive that. */
      (a?'<b class="nav-alert num" aria-label="'+esc(a.label)+'">'+a.n+'</b>':'')+'</button>';}).join("");
  const hid=hiddenCats().length;
  el("railHead").innerHTML='<span class="grow">Categories</span>'+
    (hid?'<button class="txt" data-act="cat-all" title="Show every category">Show all</button>':"")+
    '<button data-act="manage-cats" title="Edit categories" aria-label="Edit categories">'+icon("i-edit","ic-14")+'</button>';
  el("catList").innerHTML=S.categories.map(c=>{const off=!visibleCat(c.id);
    return '<button class="cat-row'+(off?" off":"")+'" style="--c:'+c.color+'" data-act="cat-toggle" data-id="'+c.id+'" role="switch" aria-checked="'+(!off)+'" title="'+esc(off?"Show":"Hide")+' '+esc(c.name)+'">'+
      '<span class="cat-box">'+icon("i-check")+'</span>'+icon(c.icon,"ic-14 ic-cat")+'<span class="cname">'+esc(c.name)+'</span></button>';}).join("");
}
function topSearch(ph){
  return '<div class="search">'+icon("i-search")+'<input id="q" type="search" placeholder="'+esc(ph)+'" value="'+esc(V.q)+'" aria-label="Search"></div>';
}
function renderTopbar(){
  const open=tops().filter(isOpen),over=tops().filter(isOverdue);
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
    title="Tasks";sub=tops().length?open.length+" open"+(over.length?" · "+over.length+" overdue":"")+" · "+tops().length+" total":"Nothing on your list yet";
    const fn=activeFilterCount();
    right='<div class="seg"><button data-act="task-mode" data-mode="board" aria-pressed="'+(V.taskMode==="board")+'">'+icon("i-board")+'Board</button>'+
      '<button data-act="task-mode" data-mode="list" aria-pressed="'+(V.taskMode==="list")+'">'+icon("i-list")+'List</button></div>'+
      '<button class="tb-btn'+(V.adv||fn?" on":"")+'" data-act="adv-toggle" aria-expanded="'+!!V.adv+'" title="Filter tasks">'+icon("i-filter")+'<span>Filter</span>'+(fn?'<b class="num">'+fn+'</b>':"")+'</button>'+
      '<button class="tb-btn" data-act="customise" data-tip="customize" title="Customize tasks">'+icon("i-sliders")+'<span>Customize</span></button>'+
      topSearch("Search tasks")+'<button class="btn btn-primary" data-act="new-task">'+icon("i-plus")+'New task</button>';
  }else if(V.view==="matrix"){
    title="Eisenhower Matrix";sub="Open tasks by urgency and importance, closest due date first";
    right=topSearch("Search tasks")+'<button class="btn btn-primary" data-act="new-task">'+icon("i-plus")+'New task</button>';
  }else if(V.view==="routines"){
    const due=S.routines.filter(r=>routineHere(r,today())).length,done=S.routines.filter(r=>doneR(r,TODAY())).length;
    title="Routines & Habits";sub=!S.routines.length?"Nothing on repeat yet":S.routines.length+" routine"+(S.routines.length===1?"":"s")+(due?" · "+done+" of "+due+" done today":" · none due today");
    right=topSearch("Search routines")+'<button class="btn btn-primary" data-act="new-routine">'+icon("i-plus")+'New routine</button>';
    }else{
    title="Notes";sub=S.notes.length?S.notes.length+" note"+(S.notes.length===1?"":"s")+" · action items land in your tasks and calendar":"Ideas, meeting notes and anything worth keeping";
    right=topSearch("Search notes")+
      '<button class="btn btn-primary" data-act="new-note">'+icon("i-plus")+'New note</button>';
  }
  const menu='<button class="rail-toggle" data-act="rail" aria-label="Show the sidebar" title="Sidebar">'+icon("i-menu","ic-18")+'</button>';
  el("topbar").innerHTML=menu+'<div class="title-wrap"><h1>'+title+'</h1><p>'+esc(sub)+'</p></div><div class="spacer"></div>'+timerBar()+right;
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
/* With what it belongs to, the pill is a button: a click on it changes the
   category right there, from a short list of them (catMenu()). */
function catChip(id,kind,of,plain){const c=cat(id);
  if(kind)return '<button type="button" class="chip chip-cat chip-pick" style="--c:'+c.color+'" data-act="cat-pick" data-kind="'+kind+'" data-id="'+of+'" title="Change category" aria-haspopup="menu">'+icon(c.icon)+esc(c.name)+(plain?"":icon("i-chev-d","ic-12 chip-caret"))+'</button>';
  return '<span class="chip chip-cat" style="--c:'+c.color+'">'+icon(c.icon)+esc(c.name)+'</span>';}
/* ---- changing a category from its pill ---- */
const CM={el:null,btn:null};
function catMenuClose(){CM.pick=null;CM.items=null;if(CM.el){CM.el.remove();CM.el=null;}if(CM.btn){CM.btn.setAttribute("aria-expanded","false");CM.btn=null;}}
function catOf(kind,id){const x=kind==="task"?taskById(id):kind==="routine"?S.routines.find(r=>r.id===id):S.notes.find(n=>n.id===id);return x||null;}
function catMenu(btn){
  if(CM.btn===btn){catMenuClose();return;}
  catMenuClose();pkClose();
  const x=catOf(btn.dataset.kind,btn.dataset.id);if(!x)return;
  const m=document.createElement("div");m.className="catmenu";m.setAttribute("role","menu");
  m.innerHTML=S.categories.map(c=>'<button type="button" role="menuitemradio" aria-checked="'+(x.cat===c.id)+'" class="cm-opt'+(x.cat===c.id?" on":"")+'" style="--c:'+c.color+'" data-act="cat-set" data-kind="'+btn.dataset.kind+'" data-id="'+btn.dataset.id+'" data-v="'+c.id+'">'+
    '<i></i><span>'+esc(c.name)+'</span>'+(x.cat===c.id?icon("i-check","ic-14"):"")+'</button>').join("");
  document.body.appendChild(m);CM.el=m;CM.btn=btn;btn.setAttribute("aria-expanded","true");
  const r=btn.getBoundingClientRect(),w=m.offsetWidth,h=m.offsetHeight;
  let top=r.bottom+6;if(top+h>innerHeight-8)top=Math.max(8,r.top-6-h);
  m.style.left=Math.round(Math.min(Math.max(8,r.left),innerWidth-w-8))+"px";m.style.top=Math.round(top)+"px";
  const on=m.querySelector(".cm-opt.on")||m.querySelector(".cm-opt");if(on)on.focus({preventScroll:true});
}
function catSet(kind,id,v){
  const x=catOf(kind,id);catMenuClose();if(!x||x.cat===v)return;
  if(kind==="task"){patchTask(id,{cat:v});return;}
  x.cat=v;if(kind==="note")x.updated=Date.now();
  save(kind==="routine"?"routines":"notes");render();
}
document.addEventListener("mousedown",function(e){if(CM.el&&!CM.el.contains(e.target)&&!(CM.btn&&CM.btn.contains(e.target)))catMenuClose();},true);
document.addEventListener("scroll",function(e){if(CM.el&&!CM.el.contains(e.target))catMenuClose();},true);
document.addEventListener("keydown",function(e){
  if(!CM.el)return;
  if(e.key==="Escape"){e.preventDefault();e.stopPropagation();const b=CM.btn;catMenuClose();if(b&&b.isConnected)b.focus();return;}
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();const o=[...CM.el.querySelectorAll(".cm-opt")],i=o.indexOf(document.activeElement);
    const n=o[(i+(e.key==="ArrowDown"?1:-1)+o.length)%o.length];if(n)n.focus();}
  if(e.key==="Tab")catMenuClose();
},true);
function dueChip(t){
  if(!t.due)return"";
  const d=dayDiff(t.due,TODAY());const k=isOpen(t)?(d<0?"over":(d<=1?"soon":"")):"";
  return '<span class="chip chip-due '+k+'">'+icon("i-clock")+esc(relDue(t.due)+(t.dueTime?" "+fmtTime(t.dueTime):""))+'</span>';
}
function quadChip(t){const q=quadOf(t);if(!q)return"";const Q=QUADS.find(x=>x.id===q);
  return '<span class="chip chip-q '+Q.cls+'">'+esc(Q.name)+'</span>';}
function tickBtn(t){return '<button class="tick'+(isDoneT(t)?" on":"")+'" data-act="task-done" data-id="'+t.id+'" aria-label="Mark complete" title="Mark complete">'+icon("i-check")+'</button>';}

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
  (ixSessDay().get(dayStr)||NONE).forEach(x=>{(by[x.task]=by[x.task]||[]).push(x);});
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
/* A task belongs to its date. */
function tasksFor(s){
  return (ixDay().get(s)||NONE).filter(t=>visibleCat(t.cat)&&matchQ(t,V.q)&&t.status!=="dropped");
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
      const done=isDoneT(t);
      return '<div class="tchip'+(done?" done":"")+(isOverdue(t)?" over":"")+'" style="--c:'+c.color+'">'+
        '<button class="tchip-tick" data-act="task-done" data-id="'+t.id+'" role="checkbox" aria-checked="'+done+'" aria-label="'+(done?"Mark not done":"Mark complete")+'">'+icon("i-check")+'</button>'+
        '<button class="tchip-body" data-act="task" data-id="'+t.id+'">'+icon(c.icon,"ic-14")+'<span>'+esc(t.title)+'</span></button>'+
        '</div>';}).join("")+'</div>';}).join("")+'</div>';
  let hours="";for(let h=H0;h<H1;h++)hours+='<div class="hourlab num">'+fmtTime(pad(h)+":00")+'</div>';
  const cols=days.map(d=>{
    const s=ymd(d);let lines="";for(let h=H0;h<H1;h++)lines+='<div class="hourline"></div>';
    const q=(V.q||"").toLowerCase();
    const tev=tasksFor(s).filter(t=>timedOn(t,s)).map(t=>{const sp=tSpan(t);return {kind:"task",t:t,start:sp.start,dur:sp.end-sp.start};});
    const aev=awayOn(s).map(a=>({kind:"away",a:a,start:hm2m(a.start),dur:Math.max(15,hm2m(a.end)-hm2m(a.start))}));
    const evs=layoutEvents(eventsFor(d).concat(gcalFor(d).timed,tev,aev).sort((a,b)=>a.start-b.start).filter(e=>{
      if(!q||e.kind==="task"||e.kind==="away")return true;
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
        const w=100/e._n,left=e._c*w,sm=ht-clip<40,done=isDoneT(t);
        return '<div class="ev tev'+(done?" done":"")+(isOverdue(t)?" over":"")+(sm?" sm":"")+'" style="--c:'+c.color+';top:'+Math.max(0,top).toFixed(1)+'px;height:'+
          Math.max(20,ht-clip).toFixed(1)+'px;left:calc('+left+'% + 3px);width:calc('+w+'% - 6px)">'+
          '<button class="tchip-tick" data-act="task-done" data-id="'+t.id+'" role="checkbox" aria-checked="'+done+'" aria-label="'+(done?"Mark not done":"Mark complete")+'">'+icon("i-check")+'</button>'+
          '<button class="tev-body" data-act="task" data-id="'+t.id+'" title="'+esc(t.title+" · "+fmtTaskTime(t))+'"><b>'+esc(t.title)+'</b>'+
          '<i class="num">'+esc(sm?fmtTime(t.dueTime):fmtTaskTime(t))+'</i></button></div>';
      }
      /* Time marked unavailable: hatched, in the greys, as it is not work. */
      if(e.kind==="away"){
        const a=e.a,top=(e.start/60-H0)*PX,ht=Math.max(18,(e.dur/60)*PX-2),w=100/e._n,left=e._c*w,sm=ht<40,clip=Math.max(0,-top);
        return '<button class="ev away'+(sm?" sm":"")+'" style="top:'+Math.max(0,top).toFixed(1)+'px;height:'+Math.max(18,ht-clip).toFixed(1)+'px;left:calc('+left+'% + 3px);width:calc('+w+'% - 6px)" data-act="away-open" data-id="'+a.id+'" title="'+esc(a.title+" · "+fmtTime(a.start)+" – "+fmtTime(a.end))+'">'+
          '<b>'+(sm?"":icon("i-moon","ic-14"))+esc(a.title)+'</b><i class="num">'+esc(sm?fmtTime(a.start):fmtTime(a.start)+" – "+fmtTime(a.end))+'</i></button>';
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
  qcOpen({date:DG.col.dataset.date,start:m2hm(DG.a),end:m2hm(end)},DG.g);
});

/* ---- quick create, from a drag on the week ----
   As Google Calendar does it: a small card beside the stretch just drawn,
   with a name to type and the few things that matter, and the kind of thing
   to make across its top -- a task, a routine, or time you are unavailable.
   Enter or Save makes it; More options carries what is typed into the full
   form. A click away, Escape or the close button drops it, and the
   placeholder on the grid with it. Unavailable time opens here too when
   its block is clicked, to change or delete. */
const QC={el:null};
const AWAY_DEF="Unavailable";
const qcDurs=[15,30,45,60,90,120,180,240];
function awayList(){return S.prefs.away||(S.prefs.away=[]);}
function awayOn(s){return awayList().filter(a=>a.date===s);}
function qcOpen(o,anchor){
  qcClose(true);
  QC.v=Object.assign({kind:"task",title:"",cat:"",prio:"",rep:"week"},o);
  QC.anchor=anchor;
  const p=document.createElement("div");p.className="qc";p.setAttribute("role","dialog");p.setAttribute("aria-label","New");
  document.body.appendChild(p);QC.el=p;
  qcDraw();qcPlace();
  const t=el("qcTitle");if(t)t.focus();
}
function qcClose(keepGhost){
  if(QC.el){QC.el.remove();QC.el=null;}
  pkClose();catMenuClose();
  if(!keepGhost)clearGhosts();
  QC.v=null;QC.anchor=null;
}
/* What is typed so far, read back before the card is drawn again. */
function qcRead(){
  const v=QC.v;if(!v||!QC.el)return v;
  const g=id=>{const x=el(id);return x?x.value:null;};
  if(g("qcTitle")!=null)v.title=g("qcTitle");
  if(g("qcDate")!=null)v.date=g("qcDate")||v.date;
  if(g("qcStart")!=null)v.start=g("qcStart")||v.start;
  if(g("qcEnd")!=null)v.end=g("qcEnd")||v.end;
  if(g("qcCat")!=null)v.cat=g("qcCat");
  if(g("qcPrio")!=null)v.prio=g("qcPrio");
  if(g("qcDur")!=null){const d=Number(g("qcDur"))||30;v.end=m2hm(Math.min(24*60-1,hm2m(v.start)+d));}
  return v;
}
function qcDraw(){
  const v=QC.v,p=QC.el;if(!v||!p)return;
  const kinds=[["task","Task","i-check"],["routine","Routine","i-repeat"],["away","Unavailable","i-moon"]];
  const d=parseD(v.date),dow=(d.getDay()+6)%7,len=Math.max(15,hm2m(v.end)-hm2m(v.start));
  const dayName=d.toLocaleDateString("en-US",{weekday:"long"});
  const when='<div class="qc-row">'+icon("i-clock","ic-16 qc-ic")+'<div class="qc-when">'+
      (v.kind==="routine"
        ?timeField('id="qcStart"',v.start,{sm:1,label:"Starts at",req:1})+'<span class="qc-for">for</span>'+
          '<select class="inp inp-sm qc-dur" id="qcDur" aria-label="How long">'+qcDurs.concat(qcDurs.indexOf(len)<0?[len]:[]).sort((a,b)=>a-b).map(m=>'<option value="'+m+'"'+(m===len?" selected":"")+'>'+esc(fmtMins(m))+'</option>').join("")+'</select>'
        :dateField('id="qcDate"',v.date,{sm:1,label:"Date",req:1})+
          timeField('id="qcStart"',v.start,{sm:1,label:"Starts at",req:1})+'<span class="qc-dash">–</span>'+
          timeField('id="qcEnd"',v.end,{sm:1,label:"Ends at",req:1,after:v.start}))+
    '</div></div>';
  const catRow='<div class="qc-row">'+icon("i-tag","ic-16 qc-ic")+catSelect('class="inp inp-sm" id="qcCat" aria-label="Category"',v.cat||(S.categories.find(c=>c.id==="other")||S.categories[0]).id)+'</div>';
  let rows="";
  if(v.kind==="task"){
    rows=when+catRow+
      '<div class="qc-row">'+icon("i-flag","ic-16 qc-ic")+'<select class="inp inp-sm" id="qcPrio" aria-label="Priority"><option value="">No priority</option>'+
        QA_PRIO.map(x=>'<option value="'+x[0]+'"'+(v.prio===x[0]?" selected":"")+'>'+esc(x[1])+'</option>').join("")+'</select></div>';
  }else if(v.kind==="routine"){
    const reps=[["day","Every day"],["weekdays","Weekdays"],["week","Every "+dayName]];
    rows=when+
      '<div class="qc-row">'+icon("i-repeat","ic-16 qc-ic")+'<div class="qc-reps" role="radiogroup" aria-label="Repeats">'+reps.map(x=>
        '<button type="button" role="radio" aria-checked="'+(v.rep===x[0])+'" class="qc-rep'+(v.rep===x[0]?" on":"")+'" data-act="qc-rep" data-v="'+x[0]+'">'+esc(x[1])+'</button>').join("")+'</div></div>'+
      catRow;
  }else{
    rows=when+'<p class="qc-note">'+icon("i-moon","ic-14")+'Shown on your calendar as time you are not free.</p>';
  }
  const editing=v.kind==="away"&&v.id;
  p.setAttribute("aria-label",editing?"Unavailable time":"New "+(v.kind==="away"?"unavailable time":v.kind));
  p.innerHTML='<div class="qc-top"><span class="spacer" style="flex:1"></span>'+
      (editing?'<button type="button" class="icon-btn btn-sm" data-act="qc-del" aria-label="Delete" title="Delete">'+icon("i-trash","ic-14")+'</button>':"")+
      '<button type="button" class="icon-btn btn-sm" data-act="qc-close" aria-label="Close" title="Close">'+icon("i-x","ic-14")+'</button></div>'+
    '<input class="qc-title" id="qcTitle" value="'+esc(v.title)+'" maxlength="200" autocomplete="off" placeholder="'+(v.kind==="task"?"Add a task":v.kind==="routine"?"Name the routine":"Unavailable")+'" aria-label="Name">'+
    (editing?"":'<div class="qc-kinds" role="tablist" aria-label="What to make">'+kinds.map(k=>
      '<button type="button" role="tab" aria-selected="'+(v.kind===k[0])+'" class="qc-kind'+(v.kind===k[0]?" on":"")+'" data-act="qc-kind" data-v="'+k[0]+'">'+esc(k[1])+'</button>').join("")+'</div>')+
    '<div class="qc-rows">'+rows+'</div>'+
    '<div class="qc-foot">'+(v.kind!=="away"?'<button type="button" class="linkish" data-act="qc-more">More options</button>':"")+'<span class="spacer" style="flex:1"></span>'+
      '<button type="button" class="btn btn-primary btn-sm" data-act="qc-save">Save</button></div>';
}
/* Beside the stretch drawn: to its right where there is room, else its left. */
function qcPlace(){
  const p=QC.el;if(!p)return;
  const a=QC.anchor&&QC.anchor.isConnected?QC.anchor.getBoundingClientRect():null;
  const w=p.offsetWidth,h=p.offsetHeight;
  let left=innerWidth/2-w/2,top=innerHeight/2-h/2;
  if(a){left=a.right+10;if(left+w>innerWidth-10)left=a.left-10-w;if(left<10)left=Math.max(10,Math.min(innerWidth-w-10,a.left));
    top=Math.min(Math.max(10,a.top-24),innerHeight-h-10);}
  p.style.left=Math.round(left)+"px";p.style.top=Math.round(Math.max(10,top))+"px";
}
function qcSave(){
  const v=qcRead();if(!v)return;
  const title=(v.title||"").trim();
  if(v.kind==="task"){
    if(!title){toast("Give the task a name");el("qcTitle").focus();return;}
    const f={do:[true,true],decide:[false,true],delegate:[true,false],drop:[false,false]}[v.prio]||[null,null];
    const t=newTask({title:title,status:firstOpen(),cat:v.cat||(S.categories.find(c=>c.id==="other")||S.categories[0]).id,
      due:v.date,dueTime:v.start,endTime:hm2m(v.end)>hm2m(v.start)?v.end:"",urgent:f[0],important:f[1]});
    S.tasks.push(t);logAct(t.id,"created","Created this task");save("tasks");toast("Task added");
  }else if(v.kind==="routine"){
    if(!title){toast("Give the routine a name");el("qcTitle").focus();return;}
    const dow=parseD(v.date).getDay();
    const days=v.rep==="day"?[1,2,3,4,5,6,0]:v.rep==="weekdays"?[1,2,3,4,5]:[dow];
    S.routines.push({id:uid("r"),title:title,cat:v.cat||S.categories[0].id,freq:"weekly",days:days,every:2,time:v.start,
      dur:Math.max(5,hm2m(v.end)-hm2m(v.start)||30),start:v.date,end:"",active:true,remind:null,note:""});
    save("routines");toast("Routine added");
  }else{
    const x={date:v.date,start:v.start,end:hm2m(v.end)>hm2m(v.start)?v.end:m2hm(Math.min(24*60-1,hm2m(v.start)+60)),title:title||AWAY_DEF};
    if(v.id){const a=awayList().find(a=>a.id===v.id);if(a)Object.assign(a,x);}
    else awayList().push(Object.assign({id:uid("a")},x));
    save("prefs");toast(v.id?"Updated":"Marked as unavailable");
  }
  qcClose();render();
}
function qcMore(){
  const v=qcRead();if(!v)return;const title=(v.title||"").trim();
  qcClose(v.kind==="task");
  if(v.kind==="task"){
    const f={do:[true,true],decide:[false,true],delegate:[true,false],drop:[false,false]}[v.prio]||[null,null];
    openSheet(null,Object.assign({title:title,due:v.date,dueTime:v.start,endTime:v.end,status:firstOpen(),urgent:f[0],important:f[1]},v.cat?{cat:v.cat}:{}));
    const ti=el("shTitle");if(ti){ti.focus();if(title)ti.setSelectionRange(title.length,title.length);}
  }else if(v.kind==="routine"){
    const dow=parseD(v.date).getDay();
    routineModal(null,{title:title,cat:v.cat||S.categories[0].id,time:v.start,dur:Math.max(5,hm2m(v.end)-hm2m(v.start)||30),start:v.date,
      days:v.rep==="day"?[1,2,3,4,5,6,0]:v.rep==="weekdays"?[1,2,3,4,5]:[dow]});
  }
}
function awayOpen(id,anchor){
  const a=awayList().find(x=>x.id===id);if(!a)return;
  qcOpen({kind:"away",id:a.id,title:a.title===AWAY_DEF?"":a.title,date:a.date,start:a.start,end:a.end},anchor);
}
document.addEventListener("mousedown",function(e){
  if(!QC.el)return;const t=e.target;
  if(QC.el.contains(t)||(t.closest&&t.closest(".pk,.catmenu,.cpk")))return;
  qcClose();
},true);
document.addEventListener("keydown",function(e){
  if(!QC.el)return;
  if(e.key==="Escape"&&!PK.el&&!CM.el){e.preventDefault();qcClose();return;}
  if(e.key==="Enter"&&e.target&&e.target.id==="qcTitle"&&!e.isComposing){e.preventDefault();qcSave();}
});
addEventListener("resize",()=>{if(QC.el)qcPlace();});

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
      items.push('<button class="mchip'+(isDoneT(t)?" done":"")+'" style="--c:'+c.color+'" data-act="task" data-id="'+t.id+'" data-stop="1"><span>'+esc(t.title)+'</span></button>');});
    gd.allDay.filter(e=>hit(e.title)).forEach(e=>items.push(
      '<button class="gchip mline-chip" style="--c:'+e.color+'" data-act="gcal-ev" data-id="'+esc(e.id)+'" data-stop="1"><span>'+esc(e.title)+'</span></button>'));
    /* Then everything with a time, in order: a dot, the time, the name. */
    const timed=evs.filter(e=>e.kind!=="session"&&hit(e.r.title)).map(e=>({start:e.start,
        html:'<button class="mline'+(e.done?" done":"")+'" style="--c:'+cat(e.r.cat).color+'" data-act="routine" data-id="'+e.r.id+'" data-date="'+s+'" data-stop="1">'+
          '<i class="mline-dot"></i><span class="mline-t num">'+esc(clock(e.start))+'</span><span class="mline-n">'+esc(e.r.title)+'</span></button>'}))
      .concat(gd.timed.filter(x=>hit(x.g.title)).map(x=>({start:x.start,
        html:'<button class="mline ev" style="--c:'+x.g.color+'" data-act="gcal-ev" data-id="'+esc(x.g.id)+'" data-stop="1">'+
          '<i class="mline-dot"></i><span class="mline-t num">'+esc(clock(x.start))+'</span><span class="mline-n">'+esc(x.g.title)+'</span></button>'})))
      .concat(awayOn(s).filter(a=>hit(a.title)).map(a=>({start:hm2m(a.start),
        html:'<button class="mline away" data-act="away-open" data-id="'+a.id+'" data-stop="1">'+
          '<i class="mline-dot"></i><span class="mline-t num">'+esc(clock(hm2m(a.start)))+'</span><span class="mline-n">'+esc(a.title)+'</span></button>'})))
      .concat(tasksFor(s).filter(t=>timedOn(t,s)).map(t=>({start:tSpan(t).start,
        html:'<button class="mline'+(isDoneT(t)?" done":"")+'" style="--c:'+cat(t.cat).color+'" data-act="task" data-id="'+t.id+'" data-stop="1">'+
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
/* Every cell is measured in one pass and changed in another. Hiding a line
   and measuring again, cell by cell, made the browser lay the month out
   dozens of times over. */
function fitMonth(){
  const plan=[];
  document.querySelectorAll(".mcell").forEach(c=>{
    const list=c.querySelector(".mlist");if(!list)return;
    const items=[...list.children].filter(x=>!x.classList.contains("mmore"));
    items.forEach(x=>{x.style.display="";});
    plan.push({c:c,list:list,items:items,total:Number(c.dataset.total)||0});
  });
  /* reads */
  plan.forEach(p=>{
    const top=p.list.getBoundingClientRect().top,rects=p.items.map(x=>x.getBoundingClientRect());
    const m=p.list.querySelector(".mmore");
    p.avail=p.list.clientHeight+1;
    p.bottoms=rects.map(r=>r.bottom-top);
    p.gap=rects.length>1?Math.max(0,rects[1].top-rects[0].bottom):2;
    p.moreH=m?m.getBoundingClientRect().height:(rects[0]?rects[0].height:16);
  });
  /* writes */
  plan.forEach(p=>{
    let k=p.items.length;
    const fits=n=>(n?p.bottoms[n-1]:0)+(n<p.total?(n?p.gap:0)+p.moreH:0)<=p.avail;
    while(k>0&&!fits(k))k--;
    p.items.forEach((x,i)=>{if(i>=k)x.style.display="none";});
    let more=p.list.querySelector(".mmore");
    const left=p.total-k;
    if(left<=0){if(more)more.remove();return;}
    if(!more){more=document.createElement("button");more.className="mmore";more.dataset.act="peek";
      more.dataset.date=p.c.dataset.date;more.dataset.stop="1";p.list.appendChild(more);}
    more.textContent="+"+left+" more";
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
  if(!n)body=es("clear","You’re all caught up","Nothing overdue and no routines missed. A clean slate.");
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
   the scratch pad lives only here, and every list is read
   straight from tasks, routines and notes. */
function todayItems(){
  const ts=TODAY();
  /* Open first, finished at the bottom, where they read as progress rather
     than as clutter. */
  const tasks=(ixDay().get(ts)||NONE).filter(t=>visibleCat(t.cat)&&t.status!=="dropped")
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
    (rows||empty||"")+'</div>';
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
  const taskRow=t=>{const c=cat(t.cat),done=isDoneT(t),est=tEst(t);
    return dashRow({color:c.color,done:done,tick:tickBtn(t),open:'data-act="task" data-id="'+t.id+'"',title:t.title,
      meta:esc(c.name)+(t.dueTime&&t.due===TODAY()?' · '+esc(fmtTaskTime(t)):"")+(est?' · '+esc(fmtMins(est))+' estimate':""),
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
    dashGroup("To do",openT,d.tasks.map(taskRow).join(""),es("list","Today’s list is clear","Add something above, or enjoy the breathing room.",{mini:1,hue:"var(--blue)"}))+
    '<div class="dgroup"><h3>Schedule'+(leftR?'<span class="num">'+leftR+'</span>':"")+'</h3>'+allDay+
      (sched.length?'<div class="dag">'+sched.map(agRow).join("")+'</div>'
        :(allDay?"":es("timeline","No fixed times today","Your day is yours to shape.",{mini:1,hue:"var(--amber)"})))+'</div>'+
    '</section>';

  /* ---- needs your attention ---- */
  const o=overdueItems(),ai=noteActionItems();
  const need=o.tasks.length+o.miss.length+ai.length;
  /* No red total here: the sidebar's red number means late, and a total that
     also counts missed routines and undated notes would say 10 beside its 1.
     Each group below carries its own count. */
  const attn='<section class="dcard dash-attn'+(need?"":" clear")+'">'+dashHead(need?"i-alert":"i-flag","Needs your attention",need?"warn":"")+
    (!need?es("clear","You’re all caught up","Nothing overdue, nothing missed. Enjoy the head start.",{mini:1,cls:"es-attn"}):
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
      '<button class="rte-txt" data-act="scratch-note" title="Save the whole pad, or just the selected text, as a note">'+icon("i-note","ic-14")+'Save as note</button>'+
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
  const doneT=d.tasks.filter(t=>isDoneT(t)).length,doneRt=d.routines.filter(r=>doneR(r,ts)).length;
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
      '<div class="dhero-eyebrow">'+esc(today().toLocaleDateString("en-US",{weekday:"long",day:"numeric",month:"long"}))+'</div>'+
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
  return body||'<span class="dnext-none">Nothing else on the clock today.</span>';
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
  (ixSessDay().get(ts)||NONE).forEach(x=>{by[x.task]=(by[x.task]||0)+(x.secs||0);});
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
      :es("timer","No time tracked yet","Press "+icon("i-play","ic-14 es-inline")+" on any task and watch the minutes add up.",{mini:1,hue:"var(--blue)"}))+
    '</section>';
}

/* ---- scratch pad to task or note ----
   Make task works on the selection, or the line the caret is in. Save as
   note works on the selection, or with nothing selected on the whole pad,
   formatting and all -- taking only the caret's line lost everything above
   it. What is converted is moved, not copied: the point is that the pad
   empties as thoughts find their place. */
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
    const t={id:uid("t"),title:line.slice(0,200),desc:"",due:"",start:"",cat:S.categories[0].id,status:firstOpen(),
      urgent:null,important:null,est:0,tags:[],links:[],subtasks:[],attachments:[],created:TODAY(),completedAt:null};
    S.tasks.push(t);logAct(t.id,"created","Created from the scratch pad");return t;});
  p.remove();scratchCommit();save("tasks");
  /* One task opens so its date and category can be set straight away. */
  if(made.length===1){render();openSheet(made[0].id);toast("Moved into a task");}
  else{render();toast(made.length+" tasks added to your backlog");}
}
/* The selection if there is one, otherwise everything in the pad. */
function scratchAll(){
  const pad=el("scratchPad");if(!pad)return null;
  restoreSel();
  const sel=window.getSelection();
  if(sel&&sel.rangeCount&&pad.contains(sel.anchorNode)&&!sel.getRangeAt(0).collapsed)return scratchPick();
  return {text:pad.innerText,html:pad.innerHTML,remove:()=>{pad.innerHTML="";}};
}
function scratchToNote(){
  const p=scratchAll();
  const text=p?p.text.trim():"";
  if(!text){toast("Write something in the scratch pad first");return;}
  const title=text.split(/\n/)[0].replace(/^\s*[•\-*]\s*/,"").trim().slice(0,80);
  const nn={id:uid("n"),title:title,cat:S.categories[0].id,tags:[],pinned:false,html:p.html,actions:[],updated:Date.now()};
  S.notes.unshift(nn);p.remove();scratchCommit();save("notes");render();
  toast("Saved to Notes as “"+title+"”");
}
function quickAdd(){
  const inp=el("dashQuick");if(!inp)return;
  const title=inp.value.trim();if(!title)return;
  const c=(el("dashQuickCat")||{}).value||S.categories[0].id;
  const t={id:uid("t"),title:title,desc:"",due:TODAY(),start:"",cat:c,status:firstOpen(),
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
  let secs=0;
  for(let i=0;i<7;i++)(ixSessDay().get(ymd(addDays(startOfWeek(V.anchor),i)))||NONE).forEach(x=>{secs+=x.secs||0;});

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
const QUICKS=[{id:"all",name:"All"},{id:"today",name:"Today"},{id:"week",name:"This Week"},{id:"overdue",name:"Overdue"},{id:"done",name:"Completed"}];
function filterTasks(mode){
  const f=V.f,t0=TODAY(),wkEnd=ymd(addDays(startOfWeek(today()),6));
  let list=tops().filter(t=>visibleCat(t.cat)&&matchQ(t,V.q));
  if(f.quick==="today")list=list.filter(t=>t.due===t0);
  else if(f.quick==="week")list=list.filter(t=>t.due&&t.due>=ymd(startOfWeek(today()))&&t.due<=wkEnd);
  else if(f.quick==="overdue")list=list.filter(isOverdue);
  else if(f.quick==="done")list=list.filter(t=>isDoneT(t));
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
/* The filters open under the top bar from its Filter button; while any is
   set and the panel is shut, they show as a line of chips with a way to
   clear each. A row of quick filters (All, Today, This week...) once sat
   here over every board and list, and read as noise. */
function filterBar(){
  const n=activeFilterCount(),f=V.f;
  if(!V.adv){
    if(!n)return "";
    const chip=(k,label)=>'<span class="fchip">'+esc(label)+'<button type="button" data-act="f-drop" data-k="'+k+'" aria-label="Remove this filter">'+icon("i-x","ic-12")+'</button></span>';
    return '<div class="fchips">'+
      (f.status?chip("status","Status: "+((lane(f.status)||{}).name||"")):"")+
      (f.cat?chip("cat","Category: "+cat(f.cat).name):"")+
      (f.quad?chip("quad","Priority: "+(f.quad==="none"?"Not prioritized":(QUADS.find(q=>q.id===f.quad)||{}).name||"")):"")+
      (f.from?chip("from","From "+fmtDate(f.from)):"")+
      (f.to?chip("to","Until "+fmtDate(f.to)):"")+
      (f.sort!=="due"?chip("sort","Sorted by "+({priority:"priority",title:"name",created:"newest"}[f.sort]||f.sort)):"")+
      '<button class="linkish" data-act="filter-clear">Clear all</button></div>';
  }
  return '<div class="adv">'+
      field("Status",'<select class="inp" data-act="f" data-k="status"><option value="">Any status</option>'+lanes().map(s=>'<option value="'+s.id+'"'+(f.status===s.id?" selected":"")+'>'+esc(s.name)+'</option>').join("")+'</select>')+
      field("Category",catSelect('class="inp" data-act="f" data-k="cat"',f.cat,{any:"All categories"}))+
      field("Priority",'<select class="inp" data-act="f" data-k="quad"><option value="">Any priority</option>'+QUADS.map(q=>'<option value="'+q.id+'"'+(f.quad===q.id?" selected":"")+'>'+esc(q.name)+'</option>').join("")+'<option value="none"'+(f.quad==="none"?" selected":"")+'>Not prioritized</option></select>')+
      field("Date from",dateField('data-act="f" data-k="from"',f.from,{label:"Date from",ph:"Any date"}))+
      field("Date until",dateField('data-act="f" data-k="to"',f.to,{label:"Date until",ph:"Any date"}))+
      field("Sort by",'<select class="inp" data-act="f" data-k="sort"><option value="due"'+(f.sort==="due"?" selected":"")+'>Date</option><option value="priority"'+(f.sort==="priority"?" selected":"")+'>Priority</option><option value="title"'+(f.sort==="title"?" selected":"")+'>Name A–Z</option><option value="created"'+(f.sort==="created"?" selected":"")+'>Recently added</option></select>')+
      '<div class="adv-foot">'+(n?'<button class="btn btn-sm btn-ghost" data-act="filter-clear">'+icon("i-x","ic-14")+'Clear all</button>':"")+
        '<button class="btn btn-sm" data-act="adv-toggle">Done</button></div>'+
    '</div>';
}
const field=(l,inner)=>'<div class="field"><label>'+esc(l)+'</label>'+inner+'</div>';

/* ============ tasks: board + list ============ */
function taskCard(t){
  const c=cat(t.cat),sp=subProgress(t),subs={length:feat("subtasks")?sp.n:0},dn=sp.d;
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
  const state=isDoneT(t)?'<span class="tc-state done">'+icon("i-check","ic-14")+'Done'+esc(doneWhen(t.completedAt))+'</span>'
    :t.status==="dropped"?'<span class="tc-state dropped">'+icon("i-x","ic-14")+'Dropped</span>':"";
  const head='<div class="tc-head">'+
    '<button type="button" class="tc-cat chip-pick" data-act="cat-pick" data-kind="task" data-id="'+t.id+'" title="Change category" aria-haspopup="menu">'+icon(c.icon,"ic-14")+esc(c.name)+'</button>'+
    '<span class="tc-right">'+(state?state:
      (t.due?'<span class="m-due'+(over?" over":soon?" soon":"")+'">'+esc(relDue(t.due)+(t.dueTime?" "+fmtTime(t.dueTime):""))+'</span>':"")+
      (Q?'<span class="tc-q '+Q.cls+'" title="'+esc(Q.name)+'" aria-label="'+esc(Q.name)+'">'+icon(Q.icon,"ic-14")+'</span>':""))+
    '</span></div>';

  /* What is attached to this task, counted straight off state so the card does
     not depend on helpers declared further down the file. */
  const comments=(ixAct().get(t.id)||NONE).reduce((n,a)=>n+(a.kind==="comment"?1:0),0);
  const docs=(ixDocs().get(t.id)||NONE).length;
  const marks=[];
  const mark=(ic,n,one,many)=>'<span class="m-mark" title="'+n+' '+(n===1?one:many)+'">'+icon(ic,"ic-14")+'<span class="num">'+n+'</span></span>';
  if(subs.length)marks.push('<span class="m-mark" title="'+dn+' of '+subs.length+' subtasks done">'+icon("i-check","ic-14")+'<span class="num">'+dn+'/'+subs.length+'</span></span>');
  if(comments&&feat("comments"))marks.push(mark("i-chat",comments,"comment","comments"));
  if(docs&&feat("docs"))marks.push(mark("i-doc",docs,"document","documents"));
  if(tFiles(t).length&&feat("files"))marks.push(mark("i-clip",tFiles(t).length,"attachment","attachments"));
  if(tLinks(t).length&&feat("links"))marks.push(mark("i-link",tLinks(t).length,"linked task","linked tasks"));
  /* Fields chosen to show on cards. */
  const cfs=board().fields.filter(f=>f.card).map(f=>cfChip(t,f)).filter(Boolean);

  /* The quadrant's name is in the label too, for anyone not going by the
     badge's colour or icon. */
  const label=Q?esc(t.title)+" — "+Q.name+", "+Q.tag.toLowerCase():esc(t.title);
  return '<div class="tcard'+(isDoneT(t)?" done":t.status==="dropped"?" dropped":"")+'" style="--c:'+c.color+'" draggable="true" data-id="'+t.id+'" data-act="task" title="'+label+'" aria-label="'+label+'">'+
    head+
    '<div class="top">'+tickBtn(t)+'<span class="ttl">'+esc(t.title)+'</span></div>'+
    (cfs.length?'<div class="tc-cf">'+cfs.join("")+'</div>':"")+
    (marks.length?'<div class="marks">'+marks.join("")+'</div>':"")+
    (subs.length?'<div class="bar" title="'+dn+' of '+subs.length+' subtasks done"><i style="width:'+Math.round(dn/subs.length*100)+'%"></i></div>':"")+
    '</div>';
}
/* A column draws its first COL_SHOWN cards and offers the rest on a
   button. A Completed column a year deep was hundreds of cards drawn for
   nobody, and the browser's layout of them was most of the board's cost. */
const COL_SHOWN=50;
function colCards(id,items){
  const more=(V.colMore&&V.colMore[id])||0,shown=COL_SHOWN+more,left=items.length-shown;
  return items.slice(0,shown).map(taskCard).join("")+
    (left>0?'<button class="col-more" data-act="col-more" data-v="'+id+'">Show '+Math.min(left,100)+' more <span class="num">· '+left+' hidden</span></button>':"");
}
function viewBoard(){
  const list=filterTasks("board");
  return '<div class="task-main">'+filterBar()+'<div class="board-scroll"><div class="board">'+lanes().map(s=>{
    const items=list.filter(t=>t.status===s.id);
    return '<div class="col" data-col="'+s.id+'" style="--s:'+s.color+'"><div class="col-head"><span class="sw" style="--s:'+s.color+'"></span><h3>'+esc(s.name)+'</h3><span class="n num">'+items.length+'</span></div>'+
      '<div class="col-list">'+(items.length?colCards(s.id,items):'<div class="col-empty" style="--h:'+s.color+'">'+esc(COL_EMPTY[s.id]||"Nothing here")+'</div>')+'</div>'+
      (V.qa&&V.qa.lane===s.id?qaCard():'<button class="addcard" data-act="qa-open" data-status="'+s.id+'">'+icon("i-plus","ic-14")+'Add task</button>')+'</div>';}).join("")+'</div></div></div>';
}
/* ---- adding tasks in a lane ----
   "Add task" at the foot of a lane opens a small card there, kept as plain
   as a name: the name, then two dashed pills (category and priority, empty
   until picked), then small round icons for whichever of start date, due
   date, estimate and files are switched on, each showing its value once
   set. Enter adds the task and leaves the card open and empty for the next,
   keeping the date and the category, so a run of tasks goes in without
   leaving the board. The side panel is for the rest. V.qa holds what is
   typed and picked, so a redraw keeps it. */
const QA_PRIO=[["do","Do first"],["decide","Schedule"],["delegate","Delegate"],["drop","Eliminate"]];
const QA_EST=[15,30,45,60,90,120,180,240,480];
function qaCard(){
  const q=V.qa,c=q.cat?cat(q.cat):null,P=QA_PRIO.find(x=>x[0]===q.prio);
  const pill=(act,ic,label,on,style)=>'<button type="button" class="qa-pill'+(on?" on":"")+'" data-act="'+act+'"'+(style||"")+' aria-haspopup="menu">'+ic+'<span>'+esc(label)+'</span></button>';
  const dateIc=(id,ic,label,v)=>'<span class="pkf qa-icf"><button type="button" class="pk-btn qa-ic'+(v?" on":"")+'" data-act="pk-open" data-pk="date" data-ph="" data-label="'+label+'" title="'+label+'" aria-label="'+label+(v?": "+esc(pkDateText(v)):"")+'">'+
    icon(ic,"ic-14")+'<span class="pk-val">'+(v?esc(pkDateText(v)):"")+'</span></button><input type="hidden" id="'+id+'" value="'+esc(v||"")+'"></span>';
  const icons=[
    feat("when")?dateIc("qaDue","i-calendar","Date",q.due):"",
    feat("estimate")?'<button type="button" class="qa-ic'+(q.est?" on":"")+'" data-act="qa-est" title="Estimate" aria-label="Estimate'+(q.est?": "+esc(fmtMins(q.est)):"")+'" aria-haspopup="menu">'+icon("i-timer","ic-14")+(q.est?'<span>'+esc(fmtMins(q.est))+'</span>':"")+'</button>':"",
    feat("files")&&hasDesktop()?'<button type="button" class="qa-ic" data-act="qa-files" title="Create it and attach files" aria-label="Create it and attach files">'+icon("i-clip","ic-14")+'</button>':""].join("");
  return '<div class="qa" data-lane="'+q.lane+'">'+
    '<div class="qa-name"><span class="qa-dot" aria-hidden="true">'+icon("i-check","ic-12")+'</span>'+
      '<input id="qaTitle" class="qa-title" placeholder="Write a task name" maxlength="200" autocomplete="off" aria-label="Task name" value="'+esc(q.title||"")+'"></div>'+
    ((feat("category")||feat("priority"))?'<div class="qa-pills">'+
      (feat("category")?pill("qa-cat",c?'<i class="qa-cdot" style="--c:'+c.color+'"></i>':icon("i-folder","ic-14"),c?c.name:"Category",!!c):"")+
      (feat("priority")?pill("qa-prio",icon("i-flag","ic-14"),P?P[1]:"Priority",!!P):"")+'</div>':"")+
    '<div class="qa-foot">'+icons+'<span class="spacer" style="flex:1"></span>'+
      '<button type="button" class="btn btn-sm btn-primary qa-add" data-act="qa-save" title="Add (Enter)">'+icon("i-check","ic-14")+'Add</button></div></div>';
}
/* A short list under a pill or an icon, as the category pill's is. */
function qaMenu(btn,items,cur,pick){
  if(CM.btn===btn){catMenuClose();return;}
  catMenuClose();pkClose();
  const m=document.createElement("div");m.className="catmenu";m.setAttribute("role","menu");
  m.innerHTML=items.map((x,i)=>'<button type="button" role="menuitemradio" aria-checked="'+(x.v===cur)+'" class="cm-opt'+(x.v===cur?" on":"")+(x.v===""?" cm-clear":"")+'" data-act="qa-pick" data-i="'+i+'"'+(x.color?' style="--c:'+x.color+'"':"")+'>'+
    (x.color?'<i></i>':"")+'<span>'+esc(x.label)+'</span>'+(x.v===cur&&x.v!==""?icon("i-check","ic-14"):"")+'</button>').join("");
  document.body.appendChild(m);CM.el=m;CM.btn=btn;CM.pick=v=>{catMenuClose();pick(v);};CM.items=items;
  const r=btn.getBoundingClientRect(),w=m.offsetWidth,h=m.offsetHeight;
  let top=r.bottom+6;if(top+h>innerHeight-8)top=Math.max(8,r.top-6-h);
  m.style.left=Math.round(Math.min(Math.max(8,r.left),innerWidth-w-8))+"px";m.style.top=Math.round(top)+"px";
  const on=m.querySelector(".cm-opt.on")||m.querySelector(".cm-opt");if(on)on.focus({preventScroll:true});
}
function qaSet(k,v){if(!V.qa)return;V.qa[k]=v;renderView();qaFocus();}
function qaOpen(lane){
  const keep=V.qa||{};
  V.qa={lane:lane,title:"",due:keep.due||"",dl:"",est:0,prio:"",cat:keep.cat||""};
  renderView();qaFocus();
}
function qaFocus(){const i=el("qaTitle");if(i){i.focus({preventScroll:true});i.setSelectionRange(i.value.length,i.value.length);
  const card=i.closest(".qa");if(card)card.scrollIntoView({block:"nearest"});}}
/* Typing is kept as it happens; Enter adds, Esc closes; a click away from
   an empty card closes it. After a redraw the caret goes back where it was. */
document.addEventListener("input",function(e){const t=e.target;if(!V.qa||!t)return;
  if(t.id==="qaTitle")V.qa.title=t.value;});
document.addEventListener("keydown",function(e){const t=e.target;if(!V.qa||!t||!t.closest||!t.closest(".qa"))return;
  if(e.key==="Enter"&&t.id==="qaTitle"){e.preventDefault();qaSave();}
  else if(e.key==="Escape"&&!PK.el){e.preventDefault();qaClose();}});
document.addEventListener("focusin",function(e){if(V.qa)V.qa.at=e.target&&e.target.closest&&e.target.closest(".qa")?e.target.id||"":"";});
document.addEventListener("mousedown",function(e){const t=e.target;if(!V.qa||!t||!t.closest)return;
  if(t.closest(".qa")||t.closest(".pk")||t.closest(".catmenu"))return;
  if(!(V.qa.title||"").trim()){V.qa=null;setTimeout(renderView,0);}});
function qaRefocus(){if(!V.qa||!V.qa.at||document.activeElement!==document.body)return;const x=el(V.qa.at);if(x&&x.focus){x.focus({preventScroll:true});if(x.setSelectionRange&&x.type==="text")x.setSelectionRange(x.value.length,x.value.length);}}
function qaClose(){if(!V.qa)return;const lane=V.qa.lane;V.qa=null;renderView();
  const b=document.querySelector('[data-act="qa-open"][data-status="'+lane+'"]');if(b)b.focus({preventScroll:true});}
function qaSave(){
  const q=V.qa;if(!q)return;
  const title=(q.title||"").trim();
  if(!title){toast("Give the task a name");qaFocus();return;}
  const flags={do:[true,true],decide:[false,true],delegate:[true,false],drop:[false,false]}[q.prio]||[null,null];
  /* No category picked: Other, where there is one. */
  const fallback=(S.categories.find(c=>c.id==="other")||S.categories[0]).id;
  const t=newTask({title:title,status:q.lane,cat:q.cat||fallback,due:q.due||"",est:q.est||0,urgent:flags[0],important:flags[1]});
  if(isDoneT(t))t.completedAt=TODAY();
  S.tasks.push(t);logAct(t.id,"created","Created this task");save("tasks");
  V.qa=Object.assign({},q,{title:"",prio:"",dl:"",est:0});
  render();qaFocus();
  return t;
}
function viewList(){
  const list=filterTasks("list");
  if(!list.length){
    const any=tops().some(t=>visibleCat(t.cat)),n=activeFilterCount();
    const acts=any?(n?'<button class="btn btn-sm" data-act="filter-clear">'+icon("i-x","ic-14")+'Clear filters</button>':"")+
""
      :'<button class="btn btn-sm btn-primary" data-act="new-task">'+icon("i-plus","ic-14")+'New task</button>';
    return '<div class="task-main">'+filterBar()+'<div class="list-scroll">'+(any
      ?es("filter","Nothing matches",V.q?"Nothing fits “"+esc(V.q)+"” with these filters.":"No task fits this view. Try another filter.",{hue:"var(--apricot)",actions:acts})
      :es("list","Your list is empty","Capture the first thing on your mind. You can sort it out later.",{actions:acts}))+'</div></div>';
  }
  /* A table per month of the task's date, in order, and No date last, as the
     list always was: each a card with its own headings, as a month is read
     on its own. The tables share one set of column widths (`lrWidths()`),
     so they line up, and the page scrolls sideways as one. Every cell is
     changed where it is; hovering one shows only that cell's control, and
     hovering a row shows Details in the task column's own end.
     A heading is clicked to sort: A to Z, Z to A, then back as it was
     (`board().lsort`); a heading is dragged to move it and its edge to
     size it. */
  const cols=listCols().filter(c=>c.on),W=lrWidths(cols),srt=lrSort();
  const grid='grid-template-columns:40px var(--w-name) '+cols.map(c=>'var(--w-'+lrVar(c.k)+')').join(" ")+' minmax(0,1fr)';
  const vars=Object.keys(W).map(k=>'--w-'+lrVar(k)+':'+W[k]+'px').join(";");
  const hd=(k,label,drag)=>{const on=srt&&srt.k===k,dir=on?srt.dir:"";
    const next=!on?"Sort A to Z":dir==="asc"?"Sort Z to A":"Back to the usual order";
    return '<span class="lh'+(on?" sorted":"")+'" role="columnheader" aria-sort="'+(on?(dir==="asc"?"ascending":"descending"):"none")+'" tabindex="0" data-act="lr-sort" data-v="'+esc(k)+'" data-col="'+esc(k)+'"'+(drag?' draggable="true"':"")+' title="'+next+(drag?", or drag to move":"")+'">'+
      '<span class="lh-t">'+esc(label)+'</span>'+icon(on&&dir==="desc"?"i-arr-d":"i-arr-u","ic-12 lh-ar")+
      '<i class="lh-rs" data-rs="'+esc(k)+'" title="Drag to resize"></i></span>';};
  const head='<div class="lrow head" style="'+grid+'"><span class="lr-lead"></span>'+hd("name","Task",false)+cols.map(c=>hd(c.k,colLabel(c.k),true)).join("")+'<span></span></div>';
  const g=lgBy(),groups={},meta={},order=[];
  list.forEach(t=>{const x=lgOf(t,g),k=x.k;if(!groups[k]){groups[k]=[];meta[k]=x;order.push(k);}groups[k].push(t);});
  order.sort((a,b)=>meta[a].o<meta[b].o?-1:meta[a].o>meta[b].o?1:0);
  const month=g==="date"||(g.indexOf("cf:")===0&&(fieldById(g.slice(3))||{}).type==="date");
  const body=order.map(k=>{
    const items=srt?lrSorted(groups[k],srt):groups[k],shut=!!(V.lshut&&V.lshut[k]);
    const name=meta[k].name;
    return '<section class="lgroup">'+
      '<h3 class="lg-h"><button class="lg-head" data-act="lg-toggle" data-v="'+k+'" aria-expanded="'+!shut+'" title="'+(shut?"Show":"Hide")+' '+esc(name)+'">'+icon(shut?"i-chev-r":"i-chev-d","ic-14")+esc(name)+'<span class="n num">'+items.length+'</span></button></h3>'+
      (shut?"":'<div class="ltable">'+head+items.map(t=>lrRow(t,cols,grid)).join("")+
        (V.lqa===k?'<div class="lrow lr-add" style="'+grid+'"><span class="lr-lead"></span><span class="name"><input id="lqaTitle" class="lr-in" placeholder="Task name, then press Enter" maxlength="200" autocomplete="off" aria-label="New task in '+esc(name)+'">'+
            (month&&k!=="none"?'<span class="lr-when">'+esc(pkDateText(lqaDate(k)))+'</span>':"")+'</span></div>'
          :'<div class="lrow lr-add" style="'+grid+'"><span class="lr-lead"></span><button class="lr-addbtn" data-act="lqa-open" data-v="'+k+'">'+icon("i-plus","ic-14")+'Add task</button></div>')+
      '</div>')+
      '</section>';}).join("");
  return '<div class="task-main">'+filterBar()+'<div class="list-scroll lr-root" style="'+vars+'"><div class="lr-sheet">'+body+'</div></div></div>';
}
/* A task added under a month is dated in it, or it would vanish from where it
   was typed: today in this month, otherwise the month's first day. */
const lqaDate=k=>TODAY().slice(0,7)===k?TODAY():k+"-01";
/* What the list can be grouped by: the fields switched on that sort tasks
   into a few clear piles. [value, name, hint, icon]. */
function lgChoices(){
  const out=[];
  if(feat("when"))out.push(["date","Date","A table for each month",("i-calendar")]);
  out.push(["status","Status","A table for each lane","i-board"]);
  if(feat("category"))out.push(["category","Category","A table for each category","i-folder"]);
  if(feat("priority"))out.push(["priority","Priority","Do first, Schedule, Delegate, Eliminate","i-flag"]);
  board().fields.filter(f=>f.panel!==false&&(f.type==="single"||f.type==="checkbox"||f.type==="date")).forEach(f=>
    out.push(["cf:"+f.id,f.name,f.type==="date"?"A table for each month":f.type==="checkbox"?"Yes and No":"A table for each option",cfType(f.type)[2]]));
  out.push(["none","No grouping","One table with every task","i-list"]);
  return out;
}
/* The grouping in force: the person's pick while its field is on, else the
   start date, the due date, or the lanes, whichever is there first. */
function lgBy(){const ok=lgChoices().map(x=>x[0]),g=board().lgroup;
  return g&&ok.indexOf(g)>-1?g:ok[0];}
const monName=k=>MON[Number(k.slice(5))-1]+" "+k.slice(0,4);
/* A task's table under grouping g: {k, name, o} (o orders the tables). */
function lgOf(t,g){
  const month=(v,none)=>v?{k:v.slice(0,7),name:monName(v.slice(0,7)),o:v.slice(0,7)}:{k:"none",name:none,o:"~"};
  if(g==="date")return month(t.due,"No date");
  if(g==="status"){const L=lanes(),i=L.findIndex(l=>l.id===t.status);return {k:t.status,name:i<0?"No status":L[i].name,o:String(1000+(i<0?999:i))};}
  if(g==="category"){const i=S.categories.findIndex(c=>c.id===t.cat);return {k:t.cat,name:i<0?"No category":S.categories[i].name,o:String(1000+(i<0?999:i))};}
  if(g==="priority"){const q=quadOf(t),i=QUADS.findIndex(x=>x.id===q);return q?{k:q,name:QUADS[i].name,o:String(1000+i)}:{k:"none",name:"No priority",o:"~"};}
  if(g&&g.indexOf("cf:")===0){const f=fieldById(g.slice(3));if(!f)return {k:"all",name:"All tasks",o:"0"};const v=cfVal(t,f);
    if(f.type==="date")return month(v,"No "+f.name.toLowerCase());
    if(f.type==="checkbox")return v?{k:"yes",name:f.name+": Yes",o:"0"}:{k:"no",name:f.name+": No",o:"1"};
    const i=(f.options||[]).findIndex(o=>o.id===v);return i<0?{k:"none",name:"No "+f.name.toLowerCase(),o:"~"}:{k:v,name:f.options[i].name,o:String(1000+i)};}
  return {k:"all",name:"All tasks",o:"0"};
}
/* What a task added under a table gets, so it lands in that table. */
function lgPreset(g,k){
  if(k==="none"||k==="all")return {};
  if(g==="date")return {due:lqaDate(k)};
  if(g==="status")return {status:k};
  if(g==="category")return {cat:k};
  if(g==="priority"){const f={do:[true,true],decide:[false,true],delegate:[true,false],drop:[false,false]}[k];return f?{urgent:f[0],important:f[1]}:{};}
  if(g.indexOf("cf:")===0){const f=fieldById(g.slice(3));if(!f)return {};
    return {cf:{[f.id]:f.type==="date"?lqaDate(k):f.type==="checkbox"?k==="yes":k}};}
  return {};
}
/* Sorting the list. Empty cells go last either way, so a sort never opens
   with a page of blanks; equal values keep the order they had. */
function lrSort(){const x=board().lsort;if(!x||!x.k)return null;
  if(x.k!=="name"&&!listCols().some(c=>c.on&&c.k===x.k))return null;return x;}
function lrSortVal(k,t){
  switch(k){
    case "name":return (t.title||"").toLowerCase();
    case "date":return t.due?t.due+" "+(t.dueTime||""):null;
    case "priority":{const q=quadOf(t);return q?["do","decide","delegate","drop"].indexOf(q):null;}
    case "category":{const i=S.categories.findIndex(c=>c.id===t.cat);return i<0?null:i;}
    case "status":{const i=lanes().findIndex(l=>l.id===t.status);return i<0?null:i;}
    case "estimate":return tEst(t)||null;
    case "tracked":return trackedSecs(t.id)||null;
    case "tags":return (t.tags||[]).length?t.tags.slice().sort()[0].toLowerCase():null;
    case "created":return t.created||null;
  }
  if(k.indexOf("cf:")===0){const f=fieldById(k.slice(3));if(!f)return null;const v=cfVal(t,f);
    if(v==null||v===""||v===false||(Array.isArray(v)&&!v.length))return null;
    if(f.type==="single"){const i=(f.options||[]).findIndex(o=>o.id===v);return i<0?null:i;}
    if(f.type==="multi")return v.map(id=>{const i=(f.options||[]).findIndex(o=>o.id===id);return i<0?99:i;}).sort((a,b)=>a-b)[0];
    if(f.type==="checkbox")return 1;
    if(f.type==="number"||f.type==="rating"||f.type==="progress")return Number(v);
    return String(v).toLowerCase();}
  return null;
}
function lrSorted(items,x){
  const m=x.dir==="desc"?-1:1;
  return items.map((t,i)=>({t:t,i:i,v:lrSortVal(x.k,t)})).sort((a,b)=>{
    if(a.v==null||b.v==null)return a.v==null&&b.v==null?a.i-b.i:a.v==null?1:-1;
    const c=typeof a.v==="number"&&typeof b.v==="number"?a.v-b.v:String(a.v).localeCompare(String(b.v),undefined,{numeric:true});
    return c?c*m:a.i-b.i;}).map(x=>x.t);
}
/* A column's width is the person's once they drag it; until then it has one
   to suit what it holds. */
const lrVar=k=>String(k).replace(/[^a-z0-9]/gi,"_");
function lrWidths(cols){
  const saved=board().colW||{},W={name:saved.name||380};
  cols.forEach(c=>{W[c.k]=saved[c.k]||(parseInt(String(colW(c.k)).replace("minmax(",""),10)||110)+20;});
  return W;
}
function lrRow(t,cols,grid){
  const c=cat(t.cat),sp=subProgress(t),edit=V.lrename===t.id;
  /* The row itself opens nothing. Every cell is edited where it is, and a
     click that missed a control -- or a second click on the name while it is
     being typed in -- used to throw the panel open over the list. Details,
     at the end of the task column, is the way in. */
  return '<div class="lrow'+(isDoneT(t)?" done":"")+'" style="'+grid+'" data-task="'+t.id+'">'+
    '<span class="lr-lead">'+tickBtn(t)+'</span>'+
    '<span class="name">'+icon(c.icon,"ic-14")+
      (edit?'<input class="lr-in lr-rename" id="lrRename" data-id="'+t.id+'" value="'+esc(t.title)+'" maxlength="200" aria-label="Task name">'
        :'<button type="button" class="lr-title" data-act="lr-rename" data-id="'+t.id+'" title="Click to rename">'+esc(t.title)+'</button>')+
      (sp.n&&feat("subtasks")?'<span class="sub num">'+sp.d+'/'+sp.n+'</span>':"")+
      '<span class="lr-acts">'+
        '<button type="button" class="rowbtn lr-det" data-act="sh-open" data-id="'+t.id+'" title="Details" aria-label="Details">Details'+icon("i-chev-r","ic-12")+'</button></span></span>'+
    cols.map(k=>'<span class="lr-cell">'+lrCell(k.k,t)+'</span>').join("")+'<span></span></div>';
}
function lrCell(k,t){
  const a=v=>'data-act="'+v+'" data-id="'+t.id+'"';
  switch(k){
    case "date":return dateField('data-act="lr-set" data-id="'+t.id+'" data-k="due"',t.due||"",{sm:1,ph:"",label:"Start date",cls:"lr-f"+(isOverdue(t)&&t.due&&t.due<TODAY()?" over":"")});
    case "priority":return '<button type="button" class="lr-pick'+(quadChip(t)?"":" empty")+'" '+a("lr-prio")+' aria-haspopup="menu" title="Priority" aria-label="Priority">'+(quadChip(t)||icon("i-chev-d","ic-12 lr-hint"))+'</button>';
    case "category":return catChip(t.cat,"task",t.id,1);
    case "status":{const st=ST(t.status);return '<button type="button" class="lr-pick" '+a("lr-move")+' aria-haspopup="menu" title="Change status"><span class="chip chip-cat chip-lane" style="--c:'+st.color+'">'+esc(st.name)+'</span></button>';}
    case "estimate":return '<button type="button" class="lr-pick'+(tEst(t)?"":" empty")+'" '+a("lr-est")+' aria-haspopup="menu" title="Estimate" aria-label="Estimate">'+(tEst(t)?'<span class="num lr-v">'+esc(fmtMins(tEst(t)))+'</span>':icon("i-chev-d","ic-12 lr-hint"))+'</button>';
    case "tags":return '<span class="lr-tags">'+(t.tags||[]).map(x=>'<span class="chip lr-tag">#'+esc(x)+'<button type="button" data-act="lr-tag-del" data-id="'+t.id+'" data-v="'+esc(x)+'" aria-label="Remove '+esc(x)+'">'+icon("i-x","ic-12")+'</button></span>').join("")+
      (V.ltag===t.id?'<input class="lr-in lr-tagin" id="lrTag" data-id="'+t.id+'" placeholder="Tag" maxlength="40" autocomplete="off" aria-label="New tag">'
        /* No plus sitting in the middle of an empty cell: pointing at the
           cell offers the box itself, worded as what it makes. */
        :'<button type="button" class="lr-tagadd" '+a("lr-tag-add")+' aria-label="Add a tag">'+((t.tags||[]).length?"Add":"Add a tag")+'</button>')+'</span>';
  }
  if(k.indexOf("cf:")===0){const f=fieldById(k.slice(3));return f?'<span class="lr-cf">'+cfControl(t,f,t.id)+'</span>':"";}
  if(k==="tracked"){const x=trackedSecs(t.id);return x?'<span class="num lr-v">'+esc(fmtTracked(x))+'</span>':"";}
  if(k==="created")return t.created?'<span class="num lr-v">'+esc(fmtDate(t.created))+'</span>':"";
  return colCell(k,t);
}
function lrSaveCols(order){const cols=listCols();board().cols=order.map(k=>cols.find(c=>c.k===k)).filter(Boolean).concat(cols.filter(c=>order.indexOf(c.k)<0));save("prefs");renderView();}

/* ============ customise ============
   How tasks work, set by the person: the board's lanes, which parts the task
   panel has, whether subtasks are tasks in their own right, the list's
   columns and fields of their own. All of it is prefs.board (board(), at the
   top of the file), so it travels with backups and Drive like any setting.
   One window, opened from Customise beside Advanced, three tabs. */

/* ---- fields of their own ----
   prefs.board.fields: {id, name, type, desc, options:[{id,name,color}],
   panel, list, card}. A task keeps its values in t.cf, by field id. */
const CF_TYPES=[
 ["text","Text","i-type","A line of words"],["number","Number","i-hash","Cost, effort, a count"],
 ["date","Date","i-calendar","A day"],["single","Single-select","i-single","One of your options"],
 ["multi","Multi-select","i-multi","Any of your options"],["checkbox","Checkbox","i-check","Yes or no"],
 ["link","Link","i-link","A web address"],["rating","Rating","i-star","One to five stars"],
 ["progress","Progress","i-chart","0 to 100%"]];
const cfType=k=>CF_TYPES.find(x=>x[0]===k)||CF_TYPES[0];
const fieldById=id=>board().fields.find(f=>f.id===id)||null;
const cfVal=(t,f)=>t.cf&&t.cf[f.id]!=null?t.cf[f.id]:(f.type==="multi"?[]:"");
const cfOpt=(f,id)=>(f.options||[]).find(o=>o.id===id)||null;
function cfText(f,v){
  if(v==null||v===""||(Array.isArray(v)&&!v.length))return "—";
  switch(f.type){
    case "date":return fmtDate(v);
    case "single":{const o=cfOpt(f,v);return o?o.name:"—";}
    case "multi":return v.map(id=>(cfOpt(f,id)||{}).name).filter(Boolean).join(", ")||"—";
    case "checkbox":return v?"Yes":"No";
    case "rating":return "★".repeat(Number(v)||0);
    case "progress":return (Number(v)||0)+"%";
    default:return String(v);
  }
}
/* A field's value drawn small: in a list cell or on a card. */
function cfChip(t,f){
  const v=cfVal(t,f);
  if(v===""||v==null||(Array.isArray(v)&&!v.length)||(f.type==="checkbox"&&!v))return "";
  const opt=o=>o?'<span class="cf-opt" style="--c:'+o.color+'">'+esc(o.name)+'</span>':"";
  switch(f.type){
    case "single":return opt(cfOpt(f,v));
    case "multi":return v.map(id=>opt(cfOpt(f,id))).join("");
    case "checkbox":return '<span class="cf-yes">'+icon("i-check","ic-14")+esc(f.name)+'</span>';
    case "link":return '<a class="cf-link" href="'+esc(/^https?:\/\//i.test(v)?v:"https://"+v)+'" target="_blank" rel="noopener noreferrer" data-stop="1">'+icon("i-link","ic-14")+esc(String(v).replace(/^https?:\/\//i,"").slice(0,32))+'</a>';
    case "rating":return '<span class="cf-stars" aria-label="'+v+' of 5">'+"★".repeat(Number(v)||0)+'<i>'+"★".repeat(5-(Number(v)||0))+'</i></span>';
    case "progress":return '<span class="cf-prog"><i style="width:'+Math.max(0,Math.min(100,Number(v)||0))+'%"></i></span><span class="num cf-pct">'+(Number(v)||0)+'%</span>';
    case "date":return '<span class="num">'+esc(fmtDate(v))+'</span>';
    default:return '<span class="cf-txt">'+esc(String(v))+'</span>';
  }
}
/* The control for a field in the task panel. Every one saves on change, as
   the rest of the panel does. */
function cfControl(t,f,tid){
  const v=cfVal(t,f),to=tid?' data-tid="'+tid+'"':"",a='data-act="sh-cf" data-k="'+f.id+'"'+to;
  switch(f.type){
    case "number":return '<input class="inp inp-sm cf-in" type="number" '+a+' value="'+esc(v)+'" placeholder="0">';
    case "date":return dateField(a,v,{sm:1,label:f.name,ph:"Pick a day"});
    case "single":return '<select class="inp inp-sm" '+a+'><option value="">None</option>'+(f.options||[]).map(o=>
      '<option value="'+o.id+'"'+(v===o.id?" selected":"")+'>'+esc(o.name)+'</option>').join("")+'</select>';
    case "multi":return '<div class="cf-pills">'+(f.options||[]).map(o=>
      '<button class="cf-pill'+(v.indexOf(o.id)>-1?" on":"")+'" style="--c:'+o.color+'" data-act="sh-cf-multi" data-k="'+f.id+'"'+to+' data-v="'+o.id+'" aria-pressed="'+(v.indexOf(o.id)>-1)+'">'+esc(o.name)+'</button>').join("")+
      (!(f.options||[]).length?'<span class="mnone">No options yet. Add some in Customize.</span>':"")+'</div>';
    case "checkbox":return '<label class="switch"><input type="checkbox" '+a+(v?" checked":"")+'><span></span><i>'+(v?"Yes":"No")+'</i></label>';
    case "link":return '<div class="cf-linkrow"><input class="inp inp-sm" type="url" '+a+' value="'+esc(v)+'" placeholder="https://…">'+
      (v?'<a class="icon-btn btn-sm" href="'+esc(/^https?:\/\//i.test(v)?v:"https://"+v)+'" target="_blank" rel="noopener noreferrer" aria-label="Open link">'+icon("i-pop","ic-14")+'</a>':"")+'</div>';
    case "rating":return '<div class="cf-rate" role="radiogroup" aria-label="'+esc(f.name)+'">'+[1,2,3,4,5].map(n=>
      '<button class="'+(n<=v?"on":"")+'" data-act="sh-cf-rate" data-k="'+f.id+'"'+to+' data-v="'+n+'" role="radio" aria-checked="'+(n===Number(v))+'" aria-label="'+n+' of 5">★</button>').join("")+'</div>';
    case "progress":return '<div class="cf-range"><input type="range" min="0" max="100" step="5" '+a+' value="'+(Number(v)||0)+'"><span class="num">'+(Number(v)||0)+'%</span></div>';
    default:return '<input class="inp inp-sm" '+a+' value="'+esc(v)+'" placeholder="'+esc(f.desc||"Add text")+'">';
  }
}
function setCf(k,v,tid){
  const t=tid?taskById(tid):sheetTask();if(!t)return;
  const cf=Object.assign({},t.cf||{});
  if(v===""||v==null||(Array.isArray(v)&&!v.length))delete cf[k];else cf[k]=v;
  if(tid){patchTask(tid,{cf:cf});return;}
  patchCurrent({cf:cf});
}

/* ---- subtasks as tasks ----
   With prefs.board.fullSubs on, a subtask is a task of its own with a
   parent: dates, lane, comments, documents, a timer. It lives inside its
   parent only -- the board, calendar, lists, matrix, today and overdue all
   read tops(), which leaves them out. Switching it on turns the checklist
   subtasks every task had into these; switching it off keeps them, drawn
   as a checklist again. */
const tops=()=>ix("tops",()=>S.tasks.filter(t=>!t.parent));
const kidsOf=id=>(ix("kids",()=>groupBy(S.tasks.filter(t=>t.parent),t=>t.parent)).get(id)||NONE);
function subProgress(t){
  const light=t.subtasks||[],k=t.id?kidsOf(t.id):NONE;
  return {n:light.length+k.length,d:light.filter(x=>x.d).length+k.filter(isDoneT).length};
}
function setFullSubs(on){
  const b=board();b.fullSubs=on;
  if(on){
    let n=0;
    S.tasks.slice().forEach(t=>{
      if(t.parent||!(t.subtasks||[]).length)return;
      t.subtasks.forEach(s=>{if(!s.t)return;S.tasks.push(newTask({title:s.t,parent:t.id,cat:t.cat,status:s.d?firstDone():firstOpen()}));n++;});
      t.subtasks=[];
    });
    if(n)save("tasks");
  }
  save("prefs");
}
function addKid(parentId,title){
  const p=taskById(parentId);if(!p||!title.trim())return;
  const k=newTask({title:title.trim().slice(0,200),parent:p.id,cat:p.cat});
  S.tasks.push(k);logAct(k.id,"created","Added as a subtask of “"+p.title+"”");save("tasks");
}
function kidRow(k){
  const s=ST(k.status);
  return '<div class="kid'+(isDoneT(k)?" done":"")+'">'+tickBtn(k)+
    '<button class="kid-t" data-act="task" data-id="'+k.id+'">'+esc(k.title||"Untitled")+'</button>'+
    (k.due?'<span class="kid-when num">'+esc(relDue(k.due))+'</span>':"")+
    '<span class="kid-lane" style="--s:'+s.color+'"><i></i>'+esc(s.name)+'</span>'+
    '<span class="kid-go">'+icon("i-chev-r","ic-14")+'</span></div>';
}
function subtasksSection(t,isNew){
  const light=t.subtasks||[],k=t.id?kidsOf(t.id):NONE,full=!!board().fullSubs,p=subProgress(t);
  let h='<div class="sh-sec"><label class="sec-label">Subtasks'+(p.n?' <span class="num">'+p.d+'/'+p.n+'</span>':"")+'</label>';
  const none=!light.length&&!k.length?es("subs","No subtasks yet","Break it into smaller steps you can check off one by one.",{mini:1,hue:"var(--accent)"}):"";
  if(full&&!isNew){
    h+=none+(k.length?'<div class="kids">'+k.map(kidRow).join("")+'</div>':"")+
      (light.length?'<div id="shSubs">'+light.map(subRow).join("")+'</div>':"")+
      '<div class="kid-add">'+icon("i-plus","ic-14")+'<input id="shKid" autocomplete="off" placeholder="Add a subtask, then press Enter" aria-label="New subtask"></div>';
  }else{
    h+=none+'<div id="shSubs">'+light.map(subRow).join("")+'</div>'+
      (k.length?'<div class="kids">'+k.map(kidRow).join("")+'</div>':"")+
      '<button class="btn btn-sm" data-act="sh-sub-add" style="margin-top:8px">'+icon("i-plus","ic-14")+'Add subtask</button>';
  }
  return h+'</div>';
}

/* ---- the list's columns ----
   prefs.board.cols: [{k, on}] in order; a custom field is "cf:<id>". */
function listCols(){
  const b=board(),seen={};
  const cols=b.cols.filter(c=>{
    if(seen[c.k])return false;seen[c.k]=1;
    return c.k.indexOf("cf:")===0?!!fieldById(c.k.slice(3)):LIST_COLS.some(x=>x[0]===c.k);});
  LIST_COLS.forEach(x=>{if(!seen[x[0]])cols.push({k:x[0],on:false});});
  b.fields.forEach(f=>{if(!seen["cf:"+f.id])cols.push({k:"cf:"+f.id,on:f.list!==false});});
  /* A task shows the same fields wherever it is seen: a column with a part
     in the task panel is on exactly when that part is. Only Lane and
     Created, which the panel has no switch for, keep a setting of their own. */
  cols.forEach(c=>{
    if(c.k.indexOf("cf:")===0){const f=fieldById(c.k.slice(3));if(f)c.on=f.panel!==false;}
    else if(FEAT_COL_OF[c.k])c.on=feat(FEAT_COL_OF[c.k]);});
  return cols;
}
function colLabel(k){
  if(k.indexOf("cf:")===0){const f=fieldById(k.slice(3));return f?f.name:"Field";}
  return (LIST_COLS.find(x=>x[0]===k)||[k,k])[1];
}
/* Wide enough that the list's own heading fits whole: a column that opens
   with "TIME TRACK…" in it reads as broken. Status went the other way: a
   lane's name is short and it was taking room the rest needed. */
const COL_W={date:"118px",priority:"96px",category:"112px",status:"116px",estimate:"84px",tracked:"124px",tags:"minmax(90px,150px)",created:"96px"};
const colW=k=>{if(k.indexOf("cf:")!==0)return COL_W[k]||"110px";
  const f=fieldById(k.slice(3))||{};return {rating:"96px",progress:"120px",checkbox:"90px",number:"90px",date:"104px",multi:"minmax(110px,180px)",text:"minmax(110px,180px)"}[f.type]||"124px";};
function colCell(k,t){
  switch(k){
    case "date":return '<span class="sub num lr-when" style="color:'+(isOverdue(t)?"var(--danger)":"var(--muted)")+'">'+esc(t.due?fmtDate(t.due):"—")+'</span>';
    case "priority":return '<span>'+(quadChip(t)||'<span class="sub">—</span>')+'</span>';
    case "category":return '<span>'+catChip(t.cat,"task",t.id)+'</span>';
    case "status":{const s=ST(t.status);return '<span class="status-dot" style="--s:'+s.color+'"><span class="sw"></span>'+esc(s.name)+'</span>';}
    case "estimate":return '<span class="sub num">'+(tEst(t)?esc(fmtMins(tEst(t))):"—")+'</span>';
    case "tracked":{const s=trackedSecs(t.id);return '<span class="sub num">'+(s?esc(fmtTracked(s)):"—")+'</span>';}
    case "tags":return '<span class="lr-tags">'+((t.tags||[]).map(x=>'<span class="chip">#'+esc(x)+'</span>').join("")||'<span class="sub">—</span>')+'</span>';
    case "created":return '<span class="sub num">'+esc(t.created?fmtDate(t.created):"—")+'</span>';
  }
  const f=fieldById(k.slice(3));
  return '<span class="lr-cf">'+(f?(cfChip(t,f)||'<span class="sub">—</span>'):"")+'</span>';
}

/* ---- the window ---- */
function customiseModal(){
  const c=V.cz=V.cz||{tab:"lanes"};
  czReadDraft();  /* a field being written survives a redraw from a switch */
  const tabs=[["lanes","Board lanes","i-board"],["panel","Task details","i-panel"],["list","List view","i-list"]];
  if(c.tab==="cols")c.tab="list";
  const body=c.tab==="panel"?czPanel():c.tab==="list"?czList():czLanes();
  openModal('<div class="modal cz" role="dialog" aria-modal="true" aria-label="Customize tasks">'+
    '<div class="mhead2">'+icon("i-sliders","ic-18")+'<h2>Customize tasks</h2><button class="icon-btn" data-act="close" aria-label="Close">'+icon("i-x")+'</button></div>'+
    '<div class="cz-tabs" role="tablist">'+tabs.map(x=>'<button role="tab" class="cz-tab" data-act="cz-tab" data-v="'+x[0]+'" aria-selected="'+(c.tab===x[0])+'">'+icon(x[2],"ic-14")+x[1]+'</button>').join("")+'</div>'+
    '<div class="mbody cz-body">'+body+'</div></div>');
}
function czLanes(){
  const L=lanes(),count=id=>tops().filter(t=>t.status===id).length,doneN=L.filter(l=>l.done).length;
  const del=V.cz.del?lane(V.cz.del):null;
  return '<p class="cz-lead">The columns on your board, left to right. Drag to reorder, click a name to rename it, and switch on <b>Done</b> for the lane finished tasks go to.</p>'+
    '<div class="cz-lanes" id="czLanes">'+L.map((l,i)=>{const n=count(l.id),pal=V.cz.pal===l.id;
      return '<div class="cz-lane" draggable="true" data-lane="'+l.id+'" style="--s:'+l.color+'">'+
        '<button type="button" class="cz-grip" data-grip="lane" data-id="'+l.id+'" title="Drag to reorder" aria-label="Move '+esc(l.name)+': drag, or use the arrow keys">'+icon("i-grip","ic-14")+'</button>'+
        '<button class="cz-swatch" data-act="cz-lane-pal" data-id="'+l.id+'" aria-label="Color of '+esc(l.name)+'" aria-expanded="'+pal+'"></button>'+
        '<input class="cz-name" data-act="cz-lane-name" data-id="'+l.id+'" value="'+esc(l.name)+'" maxlength="40" aria-label="Lane name">'+
        '<span class="cz-n num" title="Tasks in this lane">'+n+'</span>'+
        '<label class="switch cz-done" title="Ticking a task moves it here, and it counts as finished"><input type="checkbox" data-act="cz-lane-done" data-id="'+l.id+'"'+(l.done?" checked":"")+'><span></span><i>Done</i></label>'+
        '<button class="icon-btn btn-sm cz-del" data-act="cz-lane-del" data-id="'+l.id+'" aria-label="Remove '+esc(l.name)+'"'+(L.length<2?" disabled":"")+'>'+icon("i-trash","ic-14")+'</button>'+
        (pal?'<div class="cz-pal">'+LANE_COLORS.map(x=>'<button class="'+(x===l.color?"on":"")+'" style="--c:'+x+'" data-act="cz-lane-color" data-id="'+l.id+'" data-v="'+x+'" aria-label="'+x+'"></button>').join("")+
          cpSwatch('data-act="cp-open" data-cp="lane" data-id="'+l.id+'"',l.color,LANE_COLORS.indexOf(l.color)<0,"Any color you like")+'</div>':"")+
        (del&&del.id===l.id?czDelRow(l,n):"")+
        '</div>';}).join("")+'</div>'+
    '<button class="btn btn-sm" data-act="cz-lane-add">'+icon("i-plus","ic-14")+'Add a lane</button>'+
    (!doneN?'<p class="cz-warn">'+icon("i-alert","ic-14")+'No lane counts as done, so checking off a task moves it to the last lane.</p>':"");
}
function czDelRow(l,n){
  const others=lanes().filter(x=>x.id!==l.id);
  return '<div class="cz-delrow">'+(n
    ?'<span>Move its '+n+' task'+(n===1?"":"s")+' to</span><select class="inp inp-sm" id="czMoveTo">'+others.map(x=>'<option value="'+x.id+'"'+(x.done===l.done?" selected":"")+'>'+esc(x.name)+'</option>').join("")+'</select>'
    :'<span>Remove this empty lane?</span>')+
    '<div class="spacer" style="flex:1"></div><button class="btn btn-sm" data-act="cz-lane-del-no">Keep it</button>'+
    '<button class="btn btn-sm btn-danger" data-act="cz-lane-del-yes" data-id="'+l.id+'">Remove lane</button></div>';
}
/* What a task holds, in one place and kept plain: the fields first, one
   switch each beside a task panel drawn from the same switches; then how
   subtasks work, as two small picture cards; then the order of the list's
   columns. Each row carries a short line on what it is for. */
/* The list column that goes with a part of the task panel, and the columns
   that have no part in the panel of their own. */
const FEAT_COL={when:"date",category:"category",priority:"priority",tags:"tags",estimate:"estimate",timer:"tracked",status:"status",created:"created"};
function czPanel(){
  const b=board(),full=!!b.fullSubs,cols=listCols();
  const colOn=k=>{const c=cols.find(x=>x.k===k);return !!(c&&c.on);};
  /* One row, one switch: its part of the task panel, or for Lane and
     Created its list column. The list follows the panel (listCols()). */
  const row=(name,hint,ic,pk,ck,edit)=>{
    const on=pk?(edit?fieldById(pk).panel!==false:feat(pk)):colOn(ck),k=pk||ck,w=pk?"panel":"list";
    return '<div class="cz-row'+(on?"":" off")+'"><span class="cz-row-ic">'+icon(ic,"ic-14")+'</span>'+
      '<span class="cz-row-t"><b>'+esc(name)+'</b><small>'+esc(hint)+'</small></span>'+
      (edit?'<button class="icon-btn btn-sm cz-row-edit" data-act="cz-field-edit" data-id="'+pk+'" aria-label="Edit '+esc(name)+'">'+icon("i-edit","ic-14")+'</button>':"")+
      '<label class="switch cz-rsw"><input type="checkbox" data-act="cz-where" data-k="'+esc(k)+'" data-w="'+w+'"'+(on?" checked":"")+' aria-label="Show '+esc(name)+'"><span></span></label></div>';};
  const mode=(v,title,text,pic)=>'<button class="cz-mode'+((v==="full")===full?" on":"")+'" data-act="cz-subs" data-v="'+v+'" role="radio" aria-checked="'+((v==="full")===full)+'">'+
    '<span class="cz-mode-pic" aria-hidden="true">'+pic+'</span><span class="cz-mode-t"><b><i class="cz-radio"></i>'+title+'</b><small>'+text+'</small></span></button>';
  const checkPic='<span class="czp-chk on"><i></i><em></em></span><span class="czp-chk on"><i></i><em></em></span><span class="czp-chk"><i></i><em></em></span>';
  const fullPic='<span class="czp-kid"><i></i><em></em><u>Fri</u></span><span class="czp-kid"><i></i><em></em><u>Mon</u></span>';
  const allOn=BOARD_FEATS.every(g=>g[1].every(x=>FEAT_OFF[x[0]]||feat(x[0])))&&b.fields.every(f=>f.panel!==false);
  const shown=cols.filter(c=>c.on);
  return '<div class="cz-sec"><div class="cz-sh-row"><h3 class="cz-sh">Fields</h3>'+
      (allOn?"":'<button class="linkish" data-act="cz-feat-all">Show everything</button>')+'</div>'+
      '<p class="cz-lead">What a task shows, when opened and in the list. Hiding one keeps what’s in it.</p>'+
      '<div class="cz-split"><div class="cz-rows">'+
        BOARD_FEATS.map(g=>'<div class="cz-group"><div class="cz-gh"><span>'+esc(g[0])+'</span></div>'+
          g[1].map(x=>row(x[1],x[2],x[3],x[0],FEAT_COL[x[0]]||"")).join("")+
'</div>').join("")+
        '<div class="cz-group"><div class="cz-gh"><span>Your own fields</span></div>'+
          b.fields.map(f=>V.cz.edit===f.id?czFieldEditor():row(f.name,f.desc||cfType(f.type)[1],cfType(f.type)[2],f.id,"cf:"+f.id,true)).join("")+
          (V.cz.edit==="new"?czFieldEditor():'<button class="btn btn-sm cz-newf" data-act="cz-field-new">'+icon("i-plus","ic-14")+'New field</button>')+'</div>'+
      '</div>'+czPanelPreview()+'</div></div>'+
    '<div class="cz-sec"><h3 class="cz-sh">Subtasks</h3>'+
      '<div class="cz-modes" role="radiogroup" aria-label="How subtasks work">'+
        mode("check","Checklist","Steps you check off",checkPic)+
        mode("full","Full tasks","Steps with their own date and timer",fullPic)+'</div></div>';
}
/* ---- the List view's own settings ----
   How its tables are grouped, and the order of its columns. Grouping by
   the start date alone left a planner with the Start row switched off with
   one table called No date, so the grouping is the person's to pick, from
   the fields they have switched on. */
function czList(){
  const b=board(),g=lgBy(),shown=listCols().filter(c=>c.on);
  const opt=(v,name,hint,ic)=>'<button type="button" class="cz-gopt'+(g===v?" on":"")+'" role="radio" aria-checked="'+(g===v)+'" data-act="cz-lgroup" data-v="'+esc(v)+'">'+
    '<i class="cz-radio"></i><span class="cz-row-ic">'+icon(ic,"ic-14")+'</span><span class="cz-row-t"><b>'+esc(name)+'</b><small>'+esc(hint)+'</small></span></button>';
  return '<p class="cz-lead">How Tasks ▸ List is laid out.</p>'+
    '<div class="cz-sec"><h3 class="cz-sh">Group the tables by</h3>'+
      '<div class="cz-gopts" role="radiogroup" aria-label="Group the tables by">'+lgChoices().map(x=>opt(x[0],x[1],x[2],x[3])).join("")+'</div></div>'+
    '<div class="cz-sec"><div class="cz-sh-row"><h3 class="cz-sh">Column order</h3>'+
        '<button class="linkish" data-act="cz-open-list">Open the List view</button></div>'+
      '<p class="cz-lead">After the task’s name, top to bottom here is left to right in the list. Drag a handle to change the order, or drag a heading in the list itself; drag a heading’s edge there to change its width. A column shows when its field is on in Task details.</p>'+
      (shown.length?'<div class="cz-cols" id="czCols">'+shown.map(c=>
        '<div class="cz-col" draggable="true" data-col="'+esc(c.k)+'">'+
          '<button type="button" class="cz-grip" data-grip="col" data-id="'+esc(c.k)+'" title="Drag to reorder" aria-label="Move '+esc(colLabel(c.k))+': drag, or use the arrow keys">'+icon("i-grip","ic-14")+'</button>'+
          '<span class="cz-col-n">'+esc(colLabel(c.k))+'</span>'+
          '</div>').join("")+'</div>'
        :'<p class="cz-empty">No columns: the list shows just each task’s name. Switch on a field in Task details to add one.</p>')+
    '</div>';
}
/* A task panel in miniature, drawn from the switches. */
function czPanelPreview(){
  const b=board(),on=k=>feat(k);
  const line=(ic,label,w)=>'<div class="czv-f">'+icon(ic,"ic-12")+'<span>'+esc(label)+'</span><i style="width:'+w+'%"></i></div>';
  let h=(on("status")?'<div class="czv-lane"><i></i>In progress</div>':"")+'<div class="czv-title"><i class="czv-tick"></i><b>Plan the team offsite</b></div>';
  const sched=[on("when")&&line("i-calendar","Date","56"),on("reminder")&&line("i-bell","Reminder","34"),on("created")&&'<div class="czv-f">'+icon("i-plus","ic-12")+'<span>Created</span><b class="czv-val">19 Sep</b></div>'].filter(Boolean);
  const org=[on("category")&&'<span class="czv-chip">Work</span>',on("priority")&&'<span class="czv-chip">Do first</span>',on("tags")&&'<span class="czv-chip">#planning</span>'].filter(Boolean);
  const eff=[on("estimate")&&line("i-clock","Estimate","30"),on("timer")&&'<div class="czv-timer">'+icon("i-play","ic-12")+'<span>Start</span><b class="num">0:00</b></div>'].filter(Boolean);
  if(sched.length)h+='<div class="czv-sec">'+sched.join("")+'</div>';
  if(org.length)h+='<div class="czv-chips">'+org.join("")+'</div>';
  if(eff.length)h+='<div class="czv-sec">'+eff.join("")+'</div>';
  b.fields.filter(f=>f.panel!==false).forEach(f=>{h+='<div class="czv-sec">'+line(cfType(f.type)[2],f.name,"44")+'</div>';});
  if(on("desc"))h+='<div class="czv-sec"><div class="czv-h">Description</div><i class="czv-txt" style="width:92%"></i><i class="czv-txt" style="width:70%"></i></div>';
  if(on("subtasks"))h+='<div class="czv-sec"><div class="czv-h">Subtasks</div>'+(b.fullSubs
    ?'<div class="czv-kid"><i></i><span>Book the venue</span><u>Fri</u></div><div class="czv-kid"><i></i><span>Send invites</span><u>Mon</u></div>'
    :'<div class="czv-chk on"><i></i><span>Book the venue</span></div><div class="czv-chk"><i></i><span>Send invites</span></div>')+'</div>';
  const att=[on("links")&&'<span class="czv-chip">'+icon("i-link","ic-12")+'1 linked</span>',on("files")&&'<span class="czv-chip">'+icon("i-clip","ic-12")+'2 files</span>',on("docs")&&'<span class="czv-chip">'+icon("i-doc","ic-12")+'Agenda</span>'].filter(Boolean);
  if(att.length)h+='<div class="czv-chips">'+att.join("")+'</div>';
  const tabs=[on("comments")&&"Comments",on("activity")&&"Activity"].filter(Boolean);
  if(tabs.length)h+='<div class="czv-tabs">'+tabs.map((x,i)=>'<span'+(i?"":' class="on"')+'>'+x+'</span>').join("")+'</div>';
  return '<div class="czv" aria-hidden="true"><div class="czv-cap">Preview</div><div class="czv-card">'+h+'</div></div>';
}
/* Making or changing a field: its name, its type, a note, and for the two
   select types, the options. Held in V.cz.draft until saved. */
function czFieldEditor(){
  const d=V.cz.draft,sel=d.type==="single"||d.type==="multi";
  /* In place, inside Your own fields: a field is made or changed where it
     will sit, not on a page of its own. It shows on tasks and in the list
     like every other field, so where to show it is not asked. */
  return '<div class="cz-inline" id="czEditor"><div class="cz-form">'+
      '<div class="cz-pair">'+
        '<label class="cz-l"><span>Field name<span class="req" aria-hidden="true">*</span></span><input class="inp" id="czFName" maxlength="40" value="'+esc(d.name)+'" placeholder="Client, Effort, Budget…" autocomplete="off"></label>'+
        '<label class="cz-l cz-typel"><span>Type</span><select class="inp" data-act="cz-ftype-sel" aria-label="Field type">'+CF_TYPES.map(x=>
          '<option value="'+x[0]+'" data-ic="'+x[2]+'" data-sub="'+esc(x[3])+'"'+(d.type===x[0]?" selected":"")+'>'+x[1]+'</option>').join("")+'</select></label>'+
      '</div>'+
      (d.isNew?"":'<small class="cz-hint">Changing the type clears values that don’t fit it.</small>')+
      (d.showDesc||d.desc?'<label class="cz-l">Description<input class="inp" id="czFDesc" maxlength="120" value="'+esc(d.desc||"")+'" placeholder="What goes in it"></label>'
        :'<button class="linkish" data-act="cz-desc-show">'+icon("i-plus","ic-14")+'Add a description</button>')+

      (sel?'<div class="cz-l">Options</div><div class="cz-opts">'+(d.options||[]).map((o,i)=>
          '<div class="cz-opt"><button type="button" class="cz-dot" style="--c:'+o.color+'" data-act="cp-open" data-cp="opt" data-v="'+i+'" aria-label="Color of this option" aria-haspopup="dialog"></button>'+
          '<input class="inp inp-sm" data-act="cz-opt-name" data-v="'+i+'" value="'+esc(o.name)+'" placeholder="Option '+(i+1)+'" maxlength="40">'+
          '<button class="icon-btn btn-sm" data-act="cz-opt-del" data-v="'+i+'" aria-label="Remove option">'+icon("i-x","ic-14")+'</button></div>').join("")+
        '<button class="btn btn-sm" data-act="cz-opt-add">'+icon("i-plus","ic-14")+'Add an option</button></div>':"")+
    '</div>'+
    '<div class="cz-foot">'+(d.isNew?"":'<button class="btn btn-ghost btn-danger" data-act="cz-field-del" data-id="'+d.id+'">'+icon("i-trash","ic-14")+'Delete field</button>')+
      '<div class="spacer" style="flex:1"></div><button class="btn" data-act="cz-field-back">Cancel</button>'+
      '<button class="btn btn-primary" data-act="cz-field-save">'+icon("i-check")+(d.isNew?"Create field":"Save")+'</button></div></div>';
}
/* Read what is typed in the editor into the draft before any redraw. */
function czReadDraft(){
  const d=V.cz&&V.cz.draft;if(!d)return;
  const n=el("czFName");if(n)d.name=n.value;
  const ds=el("czFDesc");if(ds)d.desc=ds.value;
  d.list=d.panel;
  document.querySelectorAll('[data-act="cz-opt-name"]').forEach(i=>{const o=d.options[Number(i.dataset.v)];if(o)o.name=i.value;});
}
function czSaveField(){
  czReadDraft();
  const d=V.cz.draft,b=board();
  if(!d.name.trim()){toast("Give the field a name");const n=el("czFName");if(n)n.focus();return;}
  const f={id:d.id,name:d.name.trim(),type:d.type,desc:(d.desc||"").trim(),panel:d.panel!==false,list:d.list!==false,card:d.card===true,
    options:(d.type==="single"||d.type==="multi")?(d.options||[]).filter(o=>o.name.trim()).map(o=>({id:o.id,name:o.name.trim(),color:o.color})):[]};
  const was=fieldById(f.id);
  if(was){
    /* A new type, or options taken away, leaves values that no longer fit. */
    if(was.type!==f.type||f.options.length<(was.options||[]).length){
      const ok=new Set(f.options.map(o=>o.id));
      S.tasks.forEach(t=>{if(!t.cf||t.cf[f.id]==null)return;
        const v=t.cf[f.id];
        if(was.type!==f.type)delete t.cf[f.id];
        else if(f.type==="single"&&!ok.has(v))delete t.cf[f.id];
        else if(f.type==="multi")t.cf[f.id]=v.filter(x=>ok.has(x));});
      save("tasks");
    }
    Object.assign(was,f);
  }else b.fields.push(f);
  const col=b.cols.find(c=>c.k==="cf:"+f.id);
  if(col)col.on=f.list;else b.cols.push({k:"cf:"+f.id,on:f.list});
  save("prefs");V.cz.edit=null;V.cz.draft=null;V.cz.tab="panel";
  customiseModal();render();renderSheet();toast(was?"Field saved":"Field “"+f.name+"” added");
}
function czDeleteField(id){
  const b=board();b.fields=b.fields.filter(f=>f.id!==id);b.cols=b.cols.filter(c=>c.k!=="cf:"+id);
  S.tasks.forEach(t=>{if(t.cf&&id in t.cf)delete t.cf[id];});
  save("prefs");save("tasks");V.cz.edit=null;V.cz.draft=null;
  customiseModal();render();renderSheet();toast("Field deleted");
}
function czMoveLane(id,step){
  const L=lanes(),i=L.findIndex(l=>l.id===id),j=i+step;
  if(i<0||j<0||j>=L.length)return;
  const x=L.splice(i,1)[0];L.splice(j,0,x);save("prefs");customiseModal();render();
}
function czMoveCol(k,step){
  const cols=listCols(),on=cols.filter(c=>c.on),i=on.findIndex(c=>c.k===k),j=i+step;
  if(i<0||j<0||j>=on.length)return;
  const x=on.splice(i,1)[0];on.splice(j,0,x);board().cols=on.concat(cols.filter(c=>!c.on));save("prefs");customiseModal();render();
  const f=document.querySelector('.cz [data-act="cz-col-move"][data-k="'+k+'"][data-v="'+step+'"]:not(:disabled)');if(f)f.focus({preventScroll:true});
}
function czRemoveLane(id){
  const L=lanes();if(L.length<2)return;
  const l=lane(id);if(!l)return;
  if(l.done&&L.filter(x=>x.done).length===1&&L.length>1)toast("No lane counts as done now. Mark another one in Customize.");
  const to=(el("czMoveTo")||{}).value||(L.find(x=>x.id!==id)||{}).id;
  S.tasks.forEach(t=>{if(t.status===id){t.status=to;t.completedAt=isDoneT(t)?(t.completedAt||TODAY()):null;}});
  board().lanes=L.filter(x=>x.id!==id);
  V.cz.del=null;save("tasks");save("prefs");customiseModal();render();renderSheet();toast("Lane removed");
}
/* Dragging a lane or a column in the list to a new place. */
function czDragWire(){
  let from=null;
  document.addEventListener("dragstart",e=>{
    const r=e.target.closest&&e.target.closest(".cz-lane,.cz-col,.cm-row");if(!r)return;
    from=r;r.classList.add("dragging");try{e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain","");}catch(x){}
  });
  document.addEventListener("dragover",e=>{
    if(!from)return;const r=e.target.closest&&e.target.closest(".cz-lane,.cz-col,.cm-row");
    if(!r||r===from||r.parentNode!==from.parentNode)return;
    e.preventDefault();const b=r.getBoundingClientRect(),after=e.clientY>b.top+b.height/2;
    r.parentNode.insertBefore(from,after?r.nextSibling:r);
  });
  document.addEventListener("dragend",()=>{
    if(!from)return;const box=from.parentNode;from.classList.remove("dragging");from=null;
    if(box.id==="czLanes"){const order=[...box.children].map(x=>x.dataset.lane);
      board().lanes=order.map(id=>lane(id)).filter(Boolean);save("prefs");customiseModal();render();}
    else if(box.id==="cmList"){const order=[...box.children].map(x=>x.dataset.cat);
      S.categories=order.map(id=>S.categories.find(c=>c.id===id)).filter(Boolean);save("categories");renderRail();renderView();catsModal();}
    else if(box.id==="czCols"){const cols=listCols(),order=[...box.children].map(x=>x.dataset.col);
      board().cols=order.map(k=>cols.find(c=>c.k===k)).filter(Boolean).concat(cols.filter(c=>order.indexOf(c.k)<0));save("prefs");customiseModal();render();}
  });
}
czDragWire();

/* ============ matrix ============ */
function viewMatrix(){
  const base=tops().filter(t=>visibleCat(t.cat)&&matchQ(t,V.q)&&t.status!=="dropped"&&(!isDoneT(t)||V.f.quick==="done"));
  const byDue=(a,b)=>{if(!a.due)return 1;if(!b.due)return -1;return a.due<b.due?-1:(a.due>b.due?1:0);};
  const grid='<div class="mx">'+QUADS.map(Q=>{
    const items=base.filter(t=>quadOf(t)===Q.id).sort(byDue);
    return '<section class="quad '+Q.cls+'"><div class="quad-head">'+icon(Q.icon,"ic-18")+'<div><h3>'+esc(Q.name)+'</h3><p>'+esc(Q.note)+'</p></div><span class="n num">'+items.length+'</span></div>'+
      '<div class="quad-body">'+(items.length?items.map(t=>
        '<div class="qrow'+(isDoneT(t)?" done":"")+'" data-act="task" data-id="'+t.id+'">'+tickBtn(t)+
        '<div class="t"><b>'+esc(t.title)+'</b><div class="m">'+catChip(t.cat,"task",t.id)+'<span class="chip">'+esc(ST(t.status).name)+'</span></div></div>'+
        '<span class="chip chip-due '+(isOverdue(t)?"over":(t.due&&dayDiff(t.due,TODAY())<=1?"soon":""))+'">'+esc(t.due?fmtDate(t.due):"No date")+'</span></div>').join("")
        :es("",QUAD_EMPTY[Q.id][0],QUAD_EMPTY[Q.id][1],{icon:Q.icon,hue:"var(--q)",cls:"es-quad"}))+'</div></section>';}).join("")+'</div>';
  const un=base.filter(t=>!quadOf(t));
  /* Not prioritized yet: each task offers the four quadrants themselves, so
     one click places it. Two toggles for urgent and important left the other
     two quadrants to be guessed at. */
  const TRAY_SHOWN=12;
  const tray=un.length?'<div class="unsorted"><div class="un-head"><h3>Not prioritized yet <span class="num">'+un.length+'</span></h3>'+
      '<p>Choose where each one belongs.</p></div>'+
    un.slice(0,TRAY_SHOWN).map(t=>'<div class="urow"><span class="t" data-act="task" data-id="'+t.id+'">'+esc(t.title)+'</span>'+
      '<span class="chip chip-due">'+esc(t.due?fmtDate(t.due):"No date")+'</span>'+
      '<span class="uq-set" role="group" aria-label="Place '+esc(t.title)+'">'+QUADS.map(Q=>
        '<button class="uq '+Q.cls+'" data-act="mx-quad" data-id="'+t.id+'" data-v="'+Q.id+'" title="'+esc(Q.tag)+'">'+icon(Q.icon,"ic-14")+esc(Q.name)+'</button>').join("")+
      '</span></div>').join("")+
    (un.length>TRAY_SHOWN?'<p class="un-more">'+(un.length-TRAY_SHOWN)+' more after these are placed.</p>':"")+'</div>':"";
  return grid+tray;
}

/* ============ routines ============ */
function viewRoutines(){
  const q=V.q.toLowerCase();
  const list=S.routines.filter(r=>visibleCat(r.cat)&&(!q||r.title.toLowerCase().indexOf(q)>-1||cat(r.cat).name.toLowerCase().indexOf(q)>-1));
  if(!list.length)return '<div class="card es-card">'+(S.routines.length
    ?es("filter","No routines match",q?"Nothing fits “"+esc(V.q)+"”. Try another word.":"Their categories are hidden. Check them in the sidebar to see them.",{hue:"var(--apricot)"})
    :es("routine","Build a rhythm","Stand-ups, workouts, a weekly review: pick the days, check them off, and watch your streak grow.",
      {actions:'<button class="btn btn-primary" data-act="new-routine">'+icon("i-plus")+'New routine</button>'}))+'</div>';
  const wkStart=startOfWeek(today());
  return '<div class="rgrid">'+list.map(r=>{
    const c=cat(r.cat),st=streak(r);
    const days='<div class="week-dots">'+[0,1,2,3,4,5,6].map(i=>{
      const d=addDays(wkStart,i),s=ymd(d),sched=routineOn(r,d),done=doneR(r,s),isT=s===TODAY(),later=s>TODAY();
      /* Every square up to today takes a tick, the days off the schedule
         included. Days still to come wait for their day. */
      return '<div class="wd"><small>'+DOWS[(d.getDay()+6)%7][0]+'</small><button class="cell'+(sched?" sched":" off")+(done?" done":"")+(isT?" today":"")+(later?" later":"")+'"'+
        ' data-act="routine-done" data-id="'+r.id+'" data-date="'+s+'" aria-pressed="'+done+'"'+(later&&!done?' aria-disabled="true"':"")+
        ' aria-label="'+esc(r.title)+' on '+esc(fmtDate(s))+(sched?"":", not a scheduled day")+'"'+
        ' title="'+(done?(later?"Checked off ahead of time. Click to undo":"Done"):later?"Not yet: this day is still to come":sched?"Mark done":"Not scheduled, but you can still mark it done")+'" style="--c:'+c.color+'">'+icon("i-check")+'</button></div>';}).join("")+'</div>';
    /* Every card is the same four rows, each one line high: the name and
       its streak, when (time, length, how often), the week, and a foot with
       the category and the reminder. A reminder once sat in the second line
       and pushed that card's week lower than its neighbours'. */
    const rm=remindMins(r);
    return '<article class="rcard'+(r.active?"":" paused")+'" style="--c:'+c.color+'" data-rid="'+r.id+'">'+
      '<div class="rtop"><span class="ravatar">'+icon(c.icon,"ic-18")+'</span>'+
      '<div class="rhead"><h3 title="'+esc(r.title)+'">'+esc(r.title)+'</h3>'+
        '<div class="rsub" title="'+esc(fmtTime(r.time)+" · "+fmtMins(r.dur)+" · "+freqLabel(r))+'">'+icon("i-clock","ic-14")+'<span class="num">'+esc(fmtTime(r.time))+' · '+esc(fmtMins(r.dur))+'</span><span class="rdot">·</span><span class="rfreq">'+esc(freqLabel(r))+'</span></div></div>'+
      (!r.active?'<span class="rpaused">'+icon("i-pause","ic-12")+'Paused</span>':st?'<span class="streak" title="'+st+(st===1?" day":" days")+' in a row">'+icon("i-flame","ic-14")+st+'</span>':"")+'</div>'+
      days+
      '<div class="rfoot">'+catChip(r.cat,"routine",r.id)+
        '<span class="rbell'+(rm===null?" off":"")+'" title="Reminder">'+icon(rm===null?"i-bell-off":"i-bell","ic-14")+esc(rm===null?"No reminder":remindLabel(r).replace(" (default)",""))+'</span>'+
        '<div class="spacer" style="flex:1"></div>'+
        '<button class="icon-btn btn-sm" data-act="rt-menu" data-id="'+r.id+'" title="More" aria-label="More for '+esc(r.title)+'" aria-haspopup="menu">'+icon("i-more","ic-14")+'</button></div>'+
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
        '<span class="nm">'+catChip(n.cat)+'<span class="date">'+esc(new Date(n.updated||Date.now()).toLocaleDateString("en-US",{day:"numeric",month:"short"}))+'</span></span></button>';}).join("")
      :(S.notes.length
        ?es("filter","No notes match",V.noteTag?"Nothing tagged #"+esc(V.noteTag)+" fits.":"Try another word or tag.",{hue:"var(--apricot)",cls:"es-side"})
        :es("notes","No notes yet","Meeting notes, ideas, a parking lot for later.",{hue:"var(--amber)",cls:"es-side"})))+
    '</div></div>';
  const n=noteById(V.noteId);
  if(!n)return '<div class="notes">'+side+'<div class="neditor">'+(S.notes.length
    ?es("page","Pick a note","Choose one on the left, or start something new.")
    :es("page","A blank page","Write down anything worth keeping. Action items you add become tasks.",{actions:'<button class="btn btn-sm btn-primary" data-act="new-note">'+icon("i-plus","ic-14")+'Start a note</button>'}))+'</div></div>';
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
    (n.actions||[]).map(a=>{const t=a.taskId?taskById(a.taskId):null;const done=t?isDoneT(t):a.done;
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
  /* One note at a time: a second click replaces it rather than stacking. */
  document.querySelectorAll("body > .toast").forEach(x=>x.remove());
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
  /* Whoever went through setup chose their routines there, none included. */
  if(obSteps().indexOf("routines")>-1)S.prefs.rtSeeded=true;
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
    '<div class="obx-brand"><span class="brand-mark">'+icon("i-orbit","ic-18")+'</span><span>Ember</span></div>'+
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
  if(!g)act='<p class="obx-note">'+icon("i-laptop","ic-14")+'<span>'+esc(noGoogleWhy())+' You can still use everything; your planner is saved in this '+here()+'.</span></p>'+
    '<button class="btn btn-primary obx-wide" data-act="ob-local">Continue'+icon("i-chev-r","ic-14")+'</button>';
  else if(OB.busy)act=obWaiting(web?"Waiting for you in Google’s window…":"Waiting for you to sign in in your browser…");
  else act='<button class="obx-google" data-act="ob-google">'+G_LOGO+'<span>Continue with Google</span></button>';
  return '<div class="obx-first'+(fresh?" enter":"")+'">'+obSky()+
    '<div class="obx-hero">'+
      '<span class="brand-mark obx-mark">'+icon("i-orbit","ic-18")+'</span>'+
      '<h1>'+(again?"Welcome back"+(S.prefs.name?", <em>"+esc(S.prefs.name)+"</em>":""):"Everything you plan,<br>in <em>one orbit</em>.")+'</h1>'+
      '<p class="obx-lead">'+(again?"Sign in to pick up where you left off."
        :"Tasks, routines, your calendar and your notes, together in one calm place.")+'</p>'+
      act+obErr()+
      (g?'<p class="obx-fine">Your plans stay private. Nothing is shared unless you choose to.</p>':"")+
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
  if(r&&r.ok)throw new Error("Access wasn’t given. Check the "+(part==="drive"?"Google Drive":"Google Calendar")+" box in Google’s window and try again.");
  if(r&&r.error==="Cancelled.")return false;
  throw new Error((r&&r.error)||"We couldn’t reach Google. Check your connection and try again.");
}


/* ---- where the planner lives ---- */
function obData(){
  if(OB.found){
    const local=hasData();
    return obHead("Your data","Welcome back. We found <em>your planner</em>",
        "Pick up right where you left off, or start with a clean slate.")+
      '<div class="obx-cards">'+
        obCard("ob-restore","","i-download",local?"Use my Drive copy":"Restore my planner",
          local?"Replaces what’s in this "+here()+" with your Drive copy.":"Your tasks, routines, notes and settings, just as you left them.",false,"")+
        obCard("ob-fresh","",local?"i-laptop":"i-plus",local?"Keep what’s here":"Start fresh",
          local?"Your Drive copy is updated to match this "+here()+".":"Begin with an empty planner. It replaces your Drive copy.",false,"")+
      '</div>'+(OB.busy?obWaiting("Just a moment…"):"")+obErr();
  }
  return obHead("Your data","Where should your planner <em>live</em>?",
      "Both work offline and save as you go.")+
    '<div class="obx-cards">'+
      obCard("ob-store","drive","i-cloud","Back up to Google Drive","Saved automatically. Sign in on any device and carry on where you left off.",OB.store==="drive","Recommended")+
      obCard("ob-store","local","i-laptop","Keep it on this device","Private to this "+here()+". Export a backup whenever you like.",OB.store==="local","")+
    '</div>'+
    (OB.busy?obWaiting(acctParts().drive?"Looking for your planner…":"Allow Google Drive access in Google’s window…"):"")+obErr()+
    '<p class="obx-fine">We only see the one file we create, never the rest of your Drive. Have a backup file? <button class="linkish" data-act="import">Restore it</button></p>';
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
    const f=OB.found,c=f.counts,when=f.at?new Date(f.at).toLocaleString("en-US",{day:"numeric",month:"long",hour:"numeric",minute:"2-digit"}):"";
    return '<div class="obx-panel obx-found"><div class="obx-found-h">'+icon("i-cloud")+'<span><b>Ember backup</b><small>'+esc(when)+'</small></span></div>'+
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
      throw new Error("We found your planner in Google Drive but couldn’t open it. Try again, or keep it on this device for now.");
    }
    await driveBackup();
    obGo(obNext());
  }catch(e){OB.busy=false;OB.err=e.message||"Could not reach Google Drive.";obRender();}
}


/* ---- about you ---- */
function obName(){
  return obHead("About you","What should we <em>call you</em>?","A nickname works just as well.")+
    '<label class="obx-big"><span>I’m</span><input id="obName" autocomplete="given-name" maxlength="40" placeholder="your name" required aria-required="true" value="'+esc(S.prefs.name||"")+'"></label>'+obErr();
}
function obShowName(){
  const n=S.prefs.name||"",d=today();
  const date=d.toLocaleDateString("en-US",{weekday:"long",day:"numeric",month:"long"});
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
  return obHead("Categories","Color-code <em>your life</em>",
      "Rename, recolor or remove any of these to suit how you plan.")+
    '<div class="obx-cats">'+S.categories.map(c=>{const open=OB.pal===c.id;
      return '<div class="obx-cat'+(open?" open":"")+'" style="--c:'+c.color+'">'+
        '<button class="obx-swatch" data-act="ob-cat-pal" data-id="'+c.id+'" aria-expanded="'+open+'" aria-label="Color of '+esc(c.name)+'"></button>'+
        '<input class="obx-cat-name" data-act="ob-cat-name" data-id="'+c.id+'" value="'+esc(c.name)+'" size="'+Math.max(4,c.name.length)+'" maxlength="30" aria-label="Category name">'+
        (S.categories.length>1?'<button class="obx-x" data-act="ob-cat-del" data-id="'+c.id+'" aria-label="Remove '+esc(c.name)+'">'+icon("i-x","ic-14")+'</button>':"")+
        (open?'<div class="obx-pal" role="group" aria-label="Colors">'+CAT_COLORS.map(x=>'<button class="'+(x===c.color?"on":"")+'" style="--c:'+x+'" data-act="ob-cat-swatch" data-id="'+c.id+'" data-v="'+x+'" aria-label="'+x+'"></button>').join("")+'</div>':"")+
        '</div>';}).join("")+
      '<button class="obx-cat obx-cat-add" data-act="ob-cat-add">'+icon("i-plus","ic-14")+'Add category</button></div>';
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
  {k:"walk",title:"Morning walk",cat:"goals",days:[0,1,2,3,4,5,6],time:"07:00",dur:30,ic:"i-sun"},
  {k:"workout",title:"Workout",cat:"goals",days:[1,3,5],time:"18:00",dur:45,ic:"i-dumbbell"},
  {k:"read",title:"Read before bed",cat:"personal",days:[0,1,2,3,4,5,6],time:"21:30",dur:20,ic:"i-book"},
  {k:"plants",title:"Water the plants",cat:"personal",days:[1,4],time:"08:00",dur:10,ic:"i-leaf"},
  {k:"review",title:"Weekly review",cat:"goals",days:[5],time:"16:00",dur:45,ic:"i-target"},
  {k:"cook",title:"Cook dinner",cat:"personal",days:[0,1,2,3,4,5,6],time:"19:00",dur:45,ic:"i-pot"}];
function obRt(){
  if(!OB.rt)OB.rt=OB_RT.map(x=>Object.assign({on:false},x));
  return OB.rt;
}
const obRtCat=x=>S.categories.some(c=>c.id===x.cat)?x.cat:S.categories[0].id;
/* Each routine is a card, and a card only picks: tapping it puts the
   routine in your week or takes it out. What it is like is changed in the
   week beside it — a square is a day, tapped on or off, and the length at
   the end of the row opens a row of lengths under it. Editing inside the
   cards was tried twice: open, a card grew and broke the grid around it.
   A routine you add yourself is named in its own card. */
const OB_DURS=[10,15,20,30,45,60,90,120];
const obRtSum=x=>(x.days.length?freqLabel({freq:"weekly",days:x.days}):"No days yet")+" · "+fmtMins(x.dur);
function obRoutines(){
  return obHead("Routines","What do you do <em>every week</em>?",
      "Pick a few, then tap the days in your week to make them yours.")+
    '<div class="obx-rts">'+obRt().map(x=>{
      const c=cat(obRtCat(x));
      return '<div class="obx-rt'+(x.on?" on":"")+(OB.pop===x.k?" pop":"")+'" style="--c:'+c.color+'">'+
        '<button class="obx-rt-ic" data-act="ob-rt-toggle" data-k="'+x.k+'" aria-pressed="'+x.on+'" aria-label="'+(x.on?"Leave out ":"Add ")+esc(x.title||"this routine")+'">'+
          icon(x.ic,"ic-18 obx-rt-own")+icon("i-check","ic-18 obx-rt-ok")+'</button>'+
        (x.custom
          ?'<span class="obx-rt-txt"><input class="obx-rt-name" data-act="ob-rt-name" data-k="'+x.k+'" value="'+esc(x.title)+'" maxlength="60" placeholder="Name your routine" aria-label="Routine name" autocomplete="off">'+
            '<small data-rt-sum="'+x.k+'">'+esc(obRtSum(x))+'</small></span>'+
            '<button class="obx-rt-edit" data-act="ob-rt-del" data-k="'+x.k+'" aria-label="Remove this routine">'+icon("i-x","ic-14")+'</button>'
          :'<button class="obx-rt-txt" data-act="ob-rt-toggle" data-k="'+x.k+'" aria-pressed="'+x.on+'"><b>'+esc(x.title)+'</b><small>'+esc(obRtSum(x))+'</small></button>')+
        '</div>';}).join("")+
      '<button class="obx-rt obx-rt-add" data-act="ob-rt-add">'+icon("i-plus","ic-18")+'<span><b>Add your own</b><small>Anything that repeats</small></span></button>'+
    '</div>';
}
function obRtFind(k){return obRt().find(r=>r.k===k)||null;}
/* Redraw the step and give the keyboard back to the control that was used. */
function obRtRedraw(sel){
  obRender();
  const n=sel&&document.querySelector("#obRoot "+sel);if(n)n.focus({preventScroll:true});
}
/* The week filling in, and where it is changed: one row per routine picked,
   each square a day to tap, and its length at the end of the row. */
function obShowWeek(){
  const on=obRt().filter(x=>x.on),order=[1,2,3,4,5,6,0];
  const checks=on.reduce((n,x)=>n+x.days.length,0);
  return '<div class="obx-panel obx-week">'+
    '<div class="obx-week-h"><b>Your week</b><span class="num">'+(on.length?on.length+" routine"+(on.length===1?"":"s")+" · "+checks+" check-ins":"Nothing yet")+'</span></div>'+
    '<div class="obx-week-grid"><span class="obx-wk-pad"></span>'+DOWS.map(d=>'<span class="obx-wd">'+d[0]+'</span>').join("")+'<span></span>'+
      (on.length?on.map(x=>{const c=cat(obRtCat(x)),open=OB.rtOpen===x.k,name=x.title||"Your own routine";
        return '<span class="obx-wk-name" style="--c:'+c.color+'"><i></i><b data-rt-name="'+x.k+'">'+esc(name)+'</b></span>'+
          order.map((d,j)=>{const is=x.days.indexOf(d)>-1;
            return '<button class="obx-cell'+(is?" on":"")+(OB.pop===x.k?" pop":"")+'" style="--c:'+c.color+';--dl:'+(j*35)+'ms" data-act="ob-rt-day" data-k="'+x.k+'" data-v="'+d+'" aria-pressed="'+is+'" aria-label="'+esc(name)+" on "+DOWS[j]+'"></button>';}).join("")+
          '<button class="obx-len'+(open?" open":"")+'" data-act="ob-rt-open" data-k="'+x.k+'" aria-expanded="'+open+'" aria-label="How long: '+esc(fmtMins(x.dur))+'">'+esc(fmtMins(x.dur))+icon("i-chev-d","ic-12")+'</button>'+
          (open?'<div class="obx-lens" role="group" aria-label="How long '+esc(name)+' takes">'+OB_DURS.map(m=>
            '<button class="obx-chip'+(x.dur===m?" on":"")+'" data-act="ob-rt-dur" data-k="'+x.k+'" data-v="'+m+'" aria-pressed="'+(x.dur===m)+'">'+esc(fmtMins(m))+'</button>').join("")+'</div>':"");}).join("")+
        '<p class="obx-week-hint">Tap a square to change a day</p>'
      :'<p class="obx-week-empty">Pick a routine and watch your week fill in.</p>')+
    '</div></div>';
}
/* Going back and forth must not make them twice: the ones setup made are
   remembered, and replaced rather than added to. */
function obRtCommit(){
  const made=(S.prefs.onboard&&S.prefs.onboard.made)||[];
  S.routines=S.routines.filter(r=>made.indexOf(r.id)<0);
  const ids=[];
  obRt().filter(x=>x.on&&x.days.length).forEach(x=>{const id=uid("r");ids.push(id);
    S.routines.push({id:id,title:(x.title||"").trim()||"My routine",cat:obRtCat(x),freq:"weekly",days:x.days.slice(),every:2,time:x.time,dur:x.dur,start:TODAY(),end:"",active:true,note:""});});
  save("routines");
  S.prefs.onboard=Object.assign({},S.prefs.onboard||{},{made:ids});S.prefs.rtSeeded=true;save("prefs");
}

/* ---- Google Calendar ---- */
function obCalendar(){
  const on=gcalOn(),g=gcalPrefs();
  const tg=(k,v,l)=>'<label class="switch"><input type="checkbox" data-act="set-pref" data-k="'+k+'"'+(v?" checked":"")+'><span></span><i>'+esc(l)+'</i></label>';
  return obHead("Google Calendar","See your whole day <em>in one place</em>",
      "Your meetings sit beside your tasks, and your plans follow you to your phone.")+
    (on?'<p class="obx-ok">'+icon("i-check","ic-14")+'Connected as <b>'+esc(GC.status.email)+'</b></p>'+
      '<div class="obx-stack">'+tg("gcal.pushTasks",g.pushTasks,"Add dated tasks to Google Calendar")+
        tg("gcal.pushRoutines",g.pushRoutines,"Add routines to Google Calendar")+'</div>'
    :OB.busy?obWaiting("Allow Google Calendar access in Google’s window…")
    :'<button class="btn btn-primary obx-connect" data-act="ob-cal">'+icon("i-calendar","ic-14")+'Connect Google Calendar</button>')+obErr()+
    '<p class="obx-fine">Uses the account you signed in with. You can change this anytime.</p>';
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
  return obHead("Obsidian","Write in <em>Obsidian</em>, too",
      "Your task documents stay in step with your vault, whichever side you edit.")+
    (v?'<p class="obx-ok">'+icon("i-check","ic-14")+'Syncing with <b>'+esc(v)+'/Ember</b></p>'+
      '<button class="btn btn-sm" data-act="vault-pick">'+icon("i-folder","ic-14")+'Choose another vault</button>'
    :'<button class="btn btn-primary obx-connect" data-act="vault-pick">'+icon("i-folder","ic-14")+'Choose your vault</button>')+
    '<p class="obx-fine">Don’t use Obsidian? Skip this. Your documents are safe in the planner.</p>';
}
function obShowVault(){
  const v=vaultPath(),docs=["Project brief","Meeting notes","Reading list"];
  return '<div class="obx-panel obx-vault'+(v?" on":"")+'">'+
    '<div class="obx-docs">'+docs.map((d,k)=>'<div class="obx-doc" style="--k:'+k+'"><b># '+esc(d)+'</b><i></i><i></i><i class="short"></i><small>'+esc(d.toLowerCase().replace(/ /g,"-"))+'.md</small></div>').join("")+'</div>'+
    '<div class="obx-folder">'+icon("i-folder")+'<span><b>'+(v?esc(v.split(/[\\/]/).pop()):"Your vault")+'</b><small>/ Ember</small></span></div>'+
    '</div>';
}

/* ---- appearance ---- */
function obLook(){
  const cur=S.prefs.theme||"system";
  /* Each theme as the app in miniature: a sidebar, a header with the accent
     button, and two task cards in the person's own category colours. */
  const cc=S.categories;
  const mini=t=>'<span class="mini '+t+'"><i class="m-rail"><b></b><b></b><b></b></i>'+
    '<i class="m-top"><u></u><em></em></i>'+
    [0,1].map(k=>'<i class="m-card"><s style="--c:'+((cc[k]||{}).color||CAT_COLORS[k])+'"></s><u></u></i>').join("")+'</span>';
  const card=(v,label)=>'<button class="obx-theme'+(cur===v?" on":"")+'" data-act="set-theme" data-v="'+v+'" aria-pressed="'+(cur===v)+'">'+
    '<span class="obx-thumb">'+(v==="system"?mini("light")+mini("dark half"):mini(v))+'</span><b>'+label+'</b></button>';
  return obHead("Appearance","Make it feel like <em>yours</em>",
      "Pick a theme and an accent color. Change them whenever you like.")+
    '<div class="obx-themes">'+card("light","Light")+card("dark","Dark")+card("system","Match system")+'</div>'+
    '<div class="obx-set"><div class="obx-flabel">Accent color</div>'+accentPickHtml(true)+'</div>';
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
/* Where a browser stands on notifications, said plainly. The button only
   shows while it can still ask; once the browser has said no it cannot ask
   again, and a button doing nothing on a click read as broken. */
function webNotifyHtml(){
  if(hasDesktop())return "";
  if(typeof Notification==="undefined")
    return '<p class="notif-state bad">'+icon("i-alert","ic-14")+'This browser can’t show notifications. The desktop app can.</p>';
  if(Notification.permission==="granted")
    return '<p class="notif-state ok">'+icon("i-check","ic-14")+'Notifications are on in this browser</p>';
  if(Notification.permission==="denied")
    return '<div class="notif-state bad">'+icon("i-alert","ic-14")+'<div><b>Your browser is blocking reminders.</b> To let them through:'+
      '<ol class="notif-steps"><li>Click the small icon just left of the web address, at the very top of this window.</li>'+
      '<li>Find <b>Notifications</b> and change it to <b>Allow</b>.</li><li>Refresh this page.</li></ol></div></div>';
  return '<button class="btn btn-sm btn-primary" data-act="remind-allow">'+icon("i-bell","ic-14")+'Allow notifications</button>';
}
function obNotify(){
  const rp=remindPrefs();
  const tg=(k,v,l)=>'<label class="switch"><input type="checkbox" data-act="set-pref" data-k="remind.'+k+'"'+(v?" checked":"")+'><span></span><i>'+esc(l)+'</i></label>';
  const tin=(k,v,l)=>timeField('data-act="set-pref" data-k="remind.'+k+'"',v,{sm:1,cls:"inp-time",label:l,ph:"Pick a time",req:k==="overdueAt"});
  const web=!hasDesktop();
  /* The switch leads each card, its icon sits in the corner; what a switch
     governs shows only while it is on, as quiet hours' times always did. */
  const opt=(ic,body)=>'<div class="obx-opt"><div>'+body+'</div><span class="obx-opt-ic">'+icon(ic,"ic-14")+'</span></div>';
  return obHead("Notifications","Stay on track, <em>without the noise</em>",
      "Choose when we nudge you, and when we leave you alone.")+
    '<div class="obx-opts">'+
      opt("i-bell",tg("on",rp.on,"Remind me before things start")+
        (rp.on?'<p class="obx-fine">30 minutes ahead by default.'+(web?" Works while this tab is open.":" Works even when the app is closed.")+'</p>'+
        webNotifyHtml():""))+
      opt("i-alert",'<div class="obx-inline">'+tg("overdue",rp.overdue,"Daily overdue summary at")+tin("overdueAt",rp.overdueAt,"Time of the overdue count")+'</div>')+
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
      "Your planner is ready. You can change any of this in Settings.")+
    '<div class="obx-sums">'+
      (g?item(signedIn(),"i-user","Signed in",esc((GC.status&&GC.status.email)||"")):"")+
      item(true,driveOn()?"i-cloud":"i-laptop",driveOn()?"Backed up to Google Drive":"Saved in this "+here(),
        driveOn()?"After every change":"As you go")+
      (OB.mode==="new"?item(true,"i-tag",S.categories.length+" categories",rts?rts+" routine"+(rts===1?"":"s")+" to start with":"Ready for your first task"):"")+
      (g?item(gcalOn(),"i-calendar",gcalOn()?"Google Calendar connected":"Google Calendar",gcalOn()?"Syncing both ways":"Connect anytime in Settings"):"")+
      (d?item(!!vaultPath(),"i-folder",vaultPath()?"Obsidian vault linked":"Obsidian",vaultPath()?esc(vaultPath()):"Link a vault anytime in Settings"):"")+
    '</div>'+obBackupCard()+(d?"":obGetApp());
}
/* Where backups go, chosen at the end of setup. Picking a folder turns on a
   weekly copy there; it can be changed or switched off in Settings. */
function obBackupCard(){
  if(!canPickFolder())return "";
  const dir=(S.prefs.autoBackup||{}).dir;
  return '<div class="obx-getapp obx-bk'+(dir?" set":"")+'">'+
    '<span class="obx-getapp-ic">'+icon(dir?"i-check":"i-folder")+'</span>'+
    '<span class="obx-getapp-txt"><b>'+(dir?"Backups go to "+esc(dir):"Where should backups go?")+'</b><small>'+
      (dir?"A copy of your planner is saved there every week.":"Choose a folder, and a copy of your planner is saved there every week.")+'</small></span>'+
    '<button class="btn btn-sm'+(dir?"":" btn-primary")+'" data-act="backup-dir">'+icon("i-folder","ic-14")+(dir?"Change":"Choose folder")+'</button></div>';
}
/* In a browser, the one thing setup cannot do for you: the desktop app. */
const DOWNLOAD_URL="https://thixuni.github.io/ember/";
function obGetApp(){
  return '<a class="obx-getapp" href="'+DOWNLOAD_URL+'" target="_blank" rel="noopener">'+
    '<span class="obx-getapp-ic">'+icon("i-laptop")+'</span>'+
    '<span class="obx-getapp-txt"><b>Get the desktop app</b><small>Reminders when your browser is closed, a floating focus timer and Obsidian sync.</small></span>'+
    '<span class="btn btn-sm btn-primary">'+icon("i-download","ic-14")+'Download</span></a>';
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
/* The page takes a custom accent as it is being picked; the settings around
   the picker are only marked, not redrawn. */
function accentLive(hex){
  setCustomAccent(hex);
  const note=document.querySelector(".accent-note");
  if(note){const b=note.querySelector("b");if(b)b.textContent=S.prefs.accentHex;
    const lab=note.querySelector("span");if(lab)lab.textContent="Your own color";}
  const tri=accentTrio(S.prefs.accentHex);
  document.querySelectorAll('.cp-swatch[data-cp="accent"]').forEach(x=>{x.classList.add("on");x.style.setProperty("--dot",isDark()?tri.lift:tri.base);});
  document.querySelectorAll('[data-act="set-accent"]').forEach(x=>{x.classList.remove("on");x.setAttribute("aria-pressed","false");});
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
/* plain: just the name of the colour, for setup; Settings shows its code too. */
function accentPickHtml(plain){
  const p=S.prefs||{},dark=isDark(),cur=p.accent||"green",curHex=accentHex();
  const shade=h=>{const t=accentTrio(h);return dark?t.lift:t.base;};
  const swatch=a=>'<button class="accent-dot'+(cur===a.id?" on":"")+'" style="--dot:'+shade(a.hex)+'"'+
    ' data-act="set-accent" data-v="'+a.id+'" title="'+esc(a.name)+'" aria-label="'+esc(a.name)+'"'+
    ' aria-pressed="'+(cur===a.id)+'"></button>';
  return '<div class="accents">'+ACCENTS.map(swatch).join("")+
    cpSwatch('data-act="cp-open" data-cp="accent"',shade(curHex),cur==="custom","Any color you like")+'</div>'+
    '<div class="accent-note"><span>'+(cur==="custom"?"Your own color":
      esc((ACCENTS.filter(a=>a.id===cur)[0]||ACCENTS[0]).name))+'</span>'+(plain?'':'<b>'+esc(curHex)+'</b>')+'</div>';
}
/* ---- the colour picker ----
   The planner's own, for every "any colour" in it: the accent, a category,
   a lane and a field's option. The operating system's came in its own grey
   and its own layout. It opens under the multicoloured swatch, in the panel
   colours of the theme: a square to pick the shade, a strip for the hue, a
   preview, the colour's code to type, and a dropper where the system has
   one. A drag shows as it goes (onLive); letting go keeps it (onDone);
   Escape puts back what was there. */
const CPK={el:null,hsv:null,start:"",live:null,done:null,btn:null};
const cpSwatch=(attrs,hex,on,label)=>'<button type="button" class="cp-swatch'+(on?" on":"")+'" '+attrs+' style="--dot:'+esc(hex||"")+'" title="'+esc(label)+'" aria-label="'+esc(label)+'" aria-haspopup="dialog"></button>';
function hexToHsv(hex){
  const m=/^#?([0-9a-f]{6})$/i.exec(String(hex||"").trim());const v=m?parseInt(m[1],16):0x3F7D5C;
  const r=(v>>16&255)/255,g=(v>>8&255)/255,b=(v&255)/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;
  let h=0;if(d){h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;if(h<0)h+=360;}
  return {h:h,s:mx?d/mx:0,v:mx};
}
function hsvToHex(o){
  const c=o.v*o.s,x=c*(1-Math.abs((o.h/60)%2-1)),m=o.v-c;
  const [r,g,b]=o.h<60?[c,x,0]:o.h<120?[x,c,0]:o.h<180?[0,c,x]:o.h<240?[0,x,c]:o.h<300?[x,0,c]:[c,0,x];
  return "#"+[r,g,b].map(q=>Math.round((q+m)*255).toString(16).padStart(2,"0")).join("").toUpperCase();
}
function cpOpen(btn,hex,onLive,onDone){
  if(CPK.el&&CPK.btn===btn){cpClose(true);return;}
  cpClose(true);pkClose();catMenuClose();
  CPK.hsv=hexToHsv(hex);CPK.start=hsvToHex(CPK.hsv);CPK.live=onLive;CPK.done=onDone;CPK.btn=btn;
  const p=document.createElement("div");p.className="cpk";p.setAttribute("role","dialog");p.setAttribute("aria-label","Pick a color");
  p.innerHTML='<div class="cpk-sv" data-cp="sv"><i class="cpk-knob"></i></div>'+
    '<div class="cpk-row">'+(window.EyeDropper?'<button type="button" class="cpk-drop" data-act="cp-drop" title="Pick a color from the screen" aria-label="Pick a color from the screen">'+icon("i-dropper","ic-14")+'</button>':"")+
      '<span class="cpk-prev"></span><div class="cpk-hue" data-cp="hue" role="slider" aria-label="Hue" aria-valuemin="0" aria-valuemax="360" tabindex="0"><i class="cpk-knob"></i></div></div>'+
    '<div class="cpk-row"><label class="cpk-hex"><span>Color code</span><input id="cpkHex" class="inp inp-sm num" maxlength="7" autocomplete="off" spellcheck="false"></label>'+
      '<button type="button" class="btn btn-sm btn-primary" data-act="cp-done">Done</button></div>';
  document.body.appendChild(p);CPK.el=p;cpDraw();
  const r=btn.getBoundingClientRect(),w=p.offsetWidth,h=p.offsetHeight;
  let top=r.bottom+8;if(top+h>innerHeight-8)top=Math.max(8,r.top-8-h);
  p.style.left=Math.round(Math.min(Math.max(8,r.left+r.width/2-w/2),innerWidth-w-8))+"px";p.style.top=Math.round(top)+"px";
  const hx=el("cpkHex");if(hx)hx.focus({preventScroll:true});
}
function cpDraw(txt){
  const p=CPK.el;if(!p)return;const o=CPK.hsv,hex=hsvToHex(o);
  p.style.setProperty("--cp-h",String(Math.round(o.h)));p.style.setProperty("--cp",hex);
  const sv=p.querySelector(".cpk-sv .cpk-knob"),hu=p.querySelector(".cpk-hue .cpk-knob");
  sv.style.left=(o.s*100)+"%";sv.style.top=((1-o.v)*100)+"%";hu.style.left=(o.h/360*100)+"%";
  p.querySelector(".cpk-hue").setAttribute("aria-valuenow",String(Math.round(o.h)));
  const hx=el("cpkHex");if(hx&&!txt)hx.value=hex;
}
function cpClose(revert){
  if(!CPK.el)return;const hsvHex=hsvToHex(CPK.hsv),start=CPK.start,live=CPK.live,done=CPK.done,b=CPK.btn;
  CPK.el.remove();CPK.el=null;CPK.btn=null;
  if(revert){if(live&&hsvHex!==start)live(start,true);}
  else if(done)done(hsvHex);
  if(b&&b.isConnected)b.focus({preventScroll:true});
}
function cpSet(o,txt){Object.assign(CPK.hsv,o);cpDraw(txt);if(CPK.live)CPK.live(hsvToHex(CPK.hsv));}
document.addEventListener("pointerdown",function(e){
  if(!CPK.el)return;const t=e.target;
  if(!CPK.el.contains(t)){if(!(CPK.btn&&CPK.btn.contains(t)))cpClose(false);return;}
  const area=t.closest&&t.closest("[data-cp]");if(!area)return;
  e.preventDefault();try{area.setPointerCapture(e.pointerId);}catch(x){}
  const move=ev=>{const r=area.getBoundingClientRect(),x=Math.min(1,Math.max(0,(ev.clientX-r.left)/r.width)),y=Math.min(1,Math.max(0,(ev.clientY-r.top)/r.height));
    if(area.dataset.cp==="sv")cpSet({s:x,v:1-y});else cpSet({h:x*360});};
  move(e);
  const up=()=>{area.removeEventListener("pointermove",move);area.removeEventListener("pointerup",up);area.removeEventListener("pointercancel",up);};
  area.addEventListener("pointermove",move);area.addEventListener("pointerup",up);area.addEventListener("pointercancel",up);
},true);
document.addEventListener("keydown",function(e){
  if(!CPK.el)return;
  if(e.key==="Escape"){e.preventDefault();e.stopPropagation();cpClose(true);return;}
  const t=e.target;
  if(t&&t.id==="cpkHex"&&e.key==="Enter"){e.preventDefault();cpClose(false);return;}
  if(t&&t.classList&&t.classList.contains("cpk-hue")&&(e.key==="ArrowLeft"||e.key==="ArrowRight")){e.preventDefault();
    cpSet({h:(CPK.hsv.h+(e.key==="ArrowRight"?5:-5)+360)%360});}
},true);
document.addEventListener("input",function(e){
  if(!CPK.el||!e.target||e.target.id!=="cpkHex")return;
  const v=e.target.value.trim(),m=/^#?([0-9a-f]{6})$/i.exec(v);if(m)cpSet(hexToHsv(m[1]),true);
});
function settingsModal(){
  const n=S.tasks.length+S.routines.length+S.notes.length;
  const p=S.prefs||{};
  const tab=SET_TABS.some(t=>t.id===V.setTab)?V.setTab:"account";

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
      sec("Accent color",field("",accentPick,
        "The last circle takes any color you like. Whatever you pick is adjusted just enough to keep the text on it readable."))+
      sec("Tips",field("",'<button class="btn btn-sm" data-act="tips-again">'+icon("i-info","ic-14")+'Show the tips again</button>',
        "The short pointers that show the first time you reach a part of the planner."));
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
    const timeIn=(k,v,label,req)=>timeField('data-act="set-pref" data-k="remind.'+k+'"',v,{cls:"inp-time",label:label,ph:"Pick a time",req:req});
    const reach=web?'<div class="set-actions" style="margin-top:12px">'+webNotifyHtml()+'</div>':"";
    /* Each control sits on the line of the switch it belongs to, so the tab
       fits without scrolling, as the other tabs do. A switch that is off
       shows only itself: its times, buttons and explanation come with it
       turning on, the way setup's notifications step works. */
    pane=sec("Reminders",
        field("",'<div class="set-actions">'+toggle("remind.on",rp.on,"Send reminders")+
          (rp.on?'<button class="btn btn-sm" data-act="remind-test">'+icon("i-bell","ic-14")+'Send a test</button>':"")+'</div>',
          rp.on?"Routines, and tasks with a start time, remind you 30 minutes before unless you choose otherwise on the task or routine."+
            (web?" In a browser they only arrive while this tab is open.":" They arrive even with the window closed."):"")+
        (rp.on?reach:""))+
      sec("Overdue tasks",
        field("",'<div class="set-actions">'+toggle("remind.overdue",rp.overdue,"A daily count of overdue tasks")+
          (rp.overdue?'<span class="set-to">at</span>'+timeIn("overdueAt",rp.overdueAt,"Time of the overdue count",1):"")+'</div>',
          rp.overdue?"One notification with how many tasks are overdue, not one per task, and only when there are any.":""))+
      sec("Quiet hours",
        field("",'<div class="set-actions">'+toggle("remind.quiet",rp.quiet,"Quiet hours")+
          (rp.quiet?timeIn("quietFrom",rp.quietFrom,"Quiet hours start")+'<span class="set-to">to</span>'+
            timeIn("quietTo",rp.quietTo,"Quiet hours end"):"")+'</div>',
          !rp.quiet?"":!(rp.quietFrom&&rp.quietTo)?"Pick both times to switch quiet hours on."
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
              vault?'Syncing with <b>'+esc(vault)+'/Ember</b>.':about)
          : field("",'<span class="mnone">Vault sync needs the desktop app.</span>',about))+
      sec("Google Calendar",gcalSettings(toggle));
  }
  else{
    const bk=p.autoBackup||{};
    const auto=canPickFolder()
      ? field("",toggle("autoBackup.on",bk.on,"Back up automatically")+
          (bk.on?'<div class="set-actions">'+
            '<select class="inp inp-sm" data-act="set-pref" data-k="autoBackup.every">'+
            [["day","Every day"],["week","Every week"],["month","Every month"]].map(x=>
              '<option value="'+x[0]+'"'+((bk.every||"week")===x[0]?" selected":"")+'>'+x[1]+'</option>').join("")+'</select>'+
            '<button class="btn btn-sm" data-act="backup-dir">'+icon("i-folder","ic-14")+(bk.dir?"Change folder":"Choose folder")+'</button>'+
            '</div>':""),
          bk.on?(bk.dir?"Into <b>"+esc(bk.dir)+"</b> · "+(bk.last?"last ran "+esc(relTime(bk.last)):"not run yet")+
              (hasDesktop()?"":". After your browser restarts, it asks once before saving there again."):"Choose a folder to keep them in.")
            :"A copy is saved to a folder of your choosing, on a schedule.")
      : field("",'<span class="mnone">This browser can only save backups as downloads. Chrome, Edge or the desktop app can save them to a folder you choose.</span>');

    pane=sec("Backups",
        field("",'<div class="set-actions">'+
          '<button class="btn btn-sm" data-act="export">'+icon("i-download","ic-14")+'Back up now</button>'+
          '<button class="btn btn-sm" data-act="import">'+icon("i-upload","ic-14")+'Restore</button>'+
          (n===0?'<button class="btn btn-sm" data-act="load-sample">'+icon("i-sparkle","ic-14")+'Load the sample week</button>':"")+
          '</div>',n+" item"+(n===1?"":"s")+" saved on this device."+(canPickFolder()?(bk.dir?" Back up now saves a copy into <b>"+esc(bk.dir)+"</b>.":" Back up now asks where to keep your backups."):""))+auto)+
      sec("Start over",field("",
        '<button class="btn btn-sm btn-danger" data-act="reset-all">'+icon("i-trash","ic-14")+'Clear everything</button>',
        "Removes every task, routine, note, document and tracked hour. Your settings stay as they are."));
  }

  const nav='<nav class="set-nav" role="tablist" aria-label="Settings sections">'+
    SET_TABS.map(t=>t.group?'<div class="set-nav-h">'+esc(t.group)+'</div>':
      '<button class="set-tab" role="tab" data-act="set-tab" data-v="'+t.id+'" aria-selected="'+(t.id===tab)+'">'+
      icon(t.icon)+'<span>'+esc(t.name)+'</span></button>').join("")+
    /* Sign out sits at the foot of the sidebar, reachable from every tab,
       and only when there is an account to leave. */
    (signedIn()?'<button class="set-tab set-out" data-act="acct-signout">'+icon("i-logout")+'<span>Sign out</span></button>':"")+
    '<div class="set-nav-foot">Ember</div></nav>';
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
      '<li>Open <b>console.cloud.google.com</b> and create a project. Call it Ember.</li>'+
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
/* ---- a folder of the person's choosing ----
   Backups go to a folder the person picks, not to Downloads. The desktop app
   asks the main process. In a browser, Chrome and Edge let a page be handed
   one folder to write into (the File System Access API); the folder is kept
   in IndexedDB, since it cannot be written into localStorage, and after the
   browser restarts it asks once before writing there again. Firefox, Safari
   and the artifact cannot, and there a backup is handed over as a download. */
const BF={handle:null,loaded:null};
const bfCan=()=>!hasDesktop()&&!window.claude&&typeof window.showDirectoryPicker==="function"&&typeof indexedDB!=="undefined";
const canPickFolder=()=>!!(desktop()&&desktop().chooseBackupDir)||bfCan();
function bfKv(k,v){
  return new Promise((ok,no)=>{const r=indexedDB.open("ember",1);
    r.onupgradeneeded=()=>r.result.createObjectStore("kv");r.onerror=()=>no(r.error);
    r.onsuccess=()=>{const tx=r.result.transaction("kv",v===undefined?"readonly":"readwrite"),st=tx.objectStore("kv");
      const q=v===undefined?st.get(k):st.put(v,k);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);};});
}
/* The folder picked before the rename lives in a store of the old name; it
   is copied across the first time it is wanted. */
function bfOldKv(k){
  return new Promise(ok=>{let r;try{r=indexedDB.open("everyday-orbit",1);}catch(e){return ok(null);}
    r.onupgradeneeded=()=>{try{r.result.createObjectStore("kv");}catch(e){}};r.onerror=()=>ok(null);
    r.onsuccess=()=>{try{const tx=r.result.transaction("kv","readonly"),q=tx.objectStore("kv").get(k);
      q.onsuccess=()=>ok(q.result||null);q.onerror=()=>ok(null);}catch(e){ok(null);}};});
}
function bfLoad(){
  if(!BF.loaded)BF.loaded=bfCan()
    ?bfKv("backupDir").then(h=>h||bfOldKv("backupDir").then(old=>{if(old)bfKv("backupDir",old).catch(()=>{});return old;}),()=>null)
      .then(h=>BF.handle=h||null,()=>null)
    :Promise.resolve(null);
  return BF.loaded;
}
/* Write one file into the chosen folder. Asking again for permission needs
   a click, so an automatic backup passes ask=false and simply waits. */
async function bfWrite(name,text,ask){
  const h=BF.handle||await bfLoad();if(!h)return false;
  let p=await h.queryPermission({mode:"readwrite"});
  if(p!=="granted"&&ask)p=await h.requestPermission({mode:"readwrite"});
  if(p!=="granted")return false;
  const w=await (await h.getFileHandle(name,{create:true})).createWritable();
  await w.write(text);await w.close();return true;
}
function pickBackupFolder(then){
  const set=dir=>{
    S.prefs.autoBackup=Object.assign({on:true,every:"week",last:0},S.prefs.autoBackup||{},{dir:dir});
    save("prefs");panels();if(then)then();else toast("Backups go to "+dir);};
  const o=desktop();
  if(o&&o.chooseBackupDir){Promise.resolve(o.chooseBackupDir()).then(dir=>{if(dir)set(dir);}).catch(()=>{});return;}
  if(bfCan())window.showDirectoryPicker({id:"orbit-backups",mode:"readwrite"})
    .then(h=>{BF.handle=h;BF.loaded=Promise.resolve(h);return bfKv("backupDir",h).then(()=>set(h.name));}).catch(()=>{});
}
/* Runs at most once a launch, and only when the interval has actually passed. */
function maybeAutoBackup(){
  const o=desktop(),b=S.prefs&&S.prefs.autoBackup;
  if(!b||!b.on||!b.dir)return;
  const gap=BACKUP_EVERY[b.every||"week"]||BACKUP_EVERY.week;
  if(b.last&&Date.now()-b.last<gap)return;
  const name="ember-"+TODAY()+".json",text=JSON.stringify(backupPayload(),null,2);
  const done=()=>{S.prefs.autoBackup=Object.assign({},S.prefs.autoBackup,{last:Date.now()});save("prefs");};
  if(o&&o.writeBackup){try{o.writeBackup({dir:b.dir,name:name,text:text});done();}catch(e){}return;}
  if(bfCan())bfWrite(name,text,false).then(ok=>{if(ok)done();}).catch(()=>{});
}

function exportData(){
  const payload=backupPayload();
  const text=JSON.stringify(payload,null,2);
  const name="ember-"+TODAY()+".json";
  /* Into the backup folder, choosing one first if there is none yet. */
  const bk=S.prefs.autoBackup||{},o=desktop();
  if(o&&o.writeBackup){
    if(!bk.dir){pickBackupFolder(exportData);return;}
    o.writeBackup({dir:bk.dir,name:name,text:text});toast("Backed up to "+bk.dir);return;
  }
  if(bfCan()){
    bfWrite(name,text,true).then(ok=>{if(ok)toast("Backed up to "+BF.handle.name);else pickBackupFolder(exportData);},
      ()=>toast("Couldn’t write to that folder. Choose it again in Settings."));
    return;
  }
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
    try{o=JSON.parse(String(r.result));}catch(e){toast("That doesn't look like an Ember backup");return;}
    const d=o&&o.data?o.data:o;
    if(!d||!Array.isArray(d.tasks)||!Array.isArray(d.categories)){toast("That doesn't look like an Ember backup");return;}
    pendingImport=d;
    openModal('<div class="modal narrow" role="dialog" aria-modal="true" aria-label="Restore backup">'+
      '<div class="mhead2">'+icon("i-upload","ic-18")+'<h2>Restore this backup?</h2><button class="icon-btn" data-act="close" aria-label="Close">'+icon("i-x")+'</button></div>'+
      '<div class="mbody"><p style="margin:0;color:var(--ink-2)">The file holds '+
        '<b>'+d.tasks.length+'</b> tasks, <b>'+((d.routines||[]).length)+'</b> routines, <b>'+((d.notes||[]).length)+'</b> notes and <b>'+d.categories.length+'</b> categories'+
        (o&&o.exported?', backed up on '+esc(new Date(o.exported).toLocaleDateString("en-US",{day:"numeric",month:"long",year:"numeric"})):"")+'.</p>'+
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

function quadName(t){const q=quadOf(t);return q?QUADS.find(x=>x.id===q).name:"Not prioritized";}
function subRow(s){return '<div class="sub-row'+(s.d?" done":"")+'" data-sid="'+(s.id||uid("s"))+'">'+
  '<button class="tick'+(s.d?" on":"")+'" data-act="sub-toggle" aria-label="Toggle subtask">'+icon("i-check")+'</button>'+
  '<span class="t"><input value="'+esc(s.t)+'" placeholder="Subtask"></span>'+
  '<button class="rowbtn" style="opacity:1" data-act="sub-del" aria-label="Remove subtask">'+icon("i-x","ic-14")+'</button></div>';}
/* A routine in one short form: its name; its time, length and category as
   three labelled fields; then how it repeats, as one drop-down with the
   week under it. The week is always there (bar Every few days, which shows
   its gap instead), lit for the choice, and tapping a day turns the choice
   into On chosen days -- or back into Every day or Weekdays when the days
   come to match. The rest (reminder, start and end, paused) waits behind
   More options, closed. "At 9am for 30m in Personal" as a sentence read as
   a puzzle, and four tabs with nothing under two of them looked broken. */
function routineModal(id,preset){
  const r=id?routineById(id):Object.assign({id:"",title:"",cat:S.categories[0].id,freq:"weekly",days:[1,2,3,4,5],every:2,time:"09:00",dur:30,start:TODAY(),end:"",active:true,note:""},preset||{});
  if(!r)return;
  const days=r.days||[],wk=days.length===5&&[1,2,3,4,5].every(x=>days.indexOf(x)>-1);
  const rep=r.freq==="interval"?"interval":days.length===7?"daily":wk?"weekdays":"weekly";
  const durs=[5,10,15,20,30,45,60,90,120,180];if(durs.indexOf(r.dur)<0)durs.push(r.dur);durs.sort((a,b)=>a-b);
  openModal('<div class="modal rt-modal" role="dialog" aria-modal="true" aria-label="Routine">'+
    '<div class="mhead2"><h2>'+(id?"Edit routine":"New routine")+'</h2>'+
    (id?'<button class="btn btn-sm btn-ghost btn-danger" data-act="routine-delete" data-id="'+id+'">'+icon("i-trash","ic-14")+'Delete</button>':"")+
    '<button class="icon-btn" data-act="close" aria-label="Close">'+icon("i-x")+'</button></div>'+
    '<div class="mbody rt-body">'+
    '<input class="rt-title" id="rTitle" value="'+esc(r.title)+'" maxlength="120" placeholder="Routine name" aria-label="Routine name">'+
    '<div class="rt-grid">'+
      field("Time",timeField('id="rTime"',r.time,{label:"Time",req:1}))+
      field("How long",'<select class="inp" id="rDur" aria-label="How long">'+durs.map(m=>'<option value="'+m+'"'+(m===r.dur?" selected":"")+'>'+esc(fmtMins(m))+'</option>').join("")+'</select>')+
      field("Category",catSelect('class="inp" id="rCat" aria-label="Category"',r.cat))+
    '</div>'+
    '<div class="rt-sec"><div class="rt-rep">'+field("Repeats",'<select class="inp" id="rRep" aria-label="Repeats">'+
      [["daily","Every day"],["weekdays","Weekdays (Mon – Fri)"],["weekly","On chosen days"],["interval","Every few days"]].map(x=>
        '<option value="'+x[0]+'"'+(rep===x[0]?" selected":"")+'>'+x[1]+'</option>').join("")+'</select>')+
      '<div class="rt-sub" id="rDaysWrap"'+(rep==="interval"?" hidden":"")+'><div class="dow-pick" id="rDays" role="group" aria-label="Days">'+
        [1,2,3,4,5,6,0].map((d,i)=>'<button type="button" class="'+(days.indexOf(d)>-1?"on":"")+'" data-act="r-day" data-v="'+d+'" aria-pressed="'+(days.indexOf(d)>-1)+'" aria-label="'+DOWS[i]+'">'+DOWS[i][0]+'</button>').join("")+'</div></div>'+
      '<div class="rt-sub rt-every" id="rEveryWrap"'+(rep==="interval"?"":" hidden")+'><span>Every</span><input class="inp" type="number" min="2" max="60" id="rEvery" value="'+Math.max(2,r.every||2)+'" aria-label="Number of days"><span>days</span></div>'+
    '</div></div>'+
    '<details class="rt-more"><summary>'+icon("i-chev-r","ic-14")+'More options</summary>'+
      '<div class="rt-more-in">'+
        field("Reminder",'<select class="inp" id="rRemind">'+remindOptions(r)+'</select>')+
        '<div class="grid2">'+field("Starts",dateField('id="rStart"',r.start||TODAY(),{label:"Starts",req:1}))+
          field("Ends",dateField('id="rEnd"',r.end,{label:"Ends",ph:"Never"}))+'</div>'+
        (id?'<label class="rt-switch"><span><b>Paused</b><small>Kept, but not on your calendar or reminded</small></span>'+
          '<span class="switch"><input type="checkbox" id="rPaused"'+(r.active?"":" checked")+' aria-label="Paused"><span></span></span></label>':"")+
      '</div></details>'+
    '</div><div class="mfoot"><div class="spacer" style="flex:1"></div><button class="btn" data-act="close">Cancel</button>'+
    '<button class="btn btn-primary" data-act="routine-save" data-id="'+(id||"")+'">'+icon("i-check")+(id?"Save":"Add routine")+'</button></div></div>');
  const M=el("modalRoot");M.dataset.freq=r.freq;M.dataset.active=String(!!r.active);
  if(!id){const t=el("rTitle");if(t)t.focus();}
}
/* How a routine repeats, chosen from the drop-down: the week lights the
   days it means, or gives way to the gap for Every few days. */
function rtRepeat(v){
  const M=el("modalRoot");M.dataset.freq=v==="interval"?"interval":"weekly";
  const days=M.querySelectorAll("#rDays button"),set=b=>{b.setAttribute("aria-pressed",String(b.classList.contains("on")));};
  if(v==="daily")days.forEach(b=>{b.classList.add("on");set(b);});
  if(v==="weekdays")days.forEach(b=>{b.classList.toggle("on",["1","2","3","4","5"].indexOf(b.dataset.v)>-1);set(b);});
  el("rDaysWrap").hidden=v==="interval";el("rEveryWrap").hidden=v!=="interval";
}
/* ---- editing categories ----
   One window, one row a category, changed where it is: drag the handle to
   reorder, the icon and the colour open their choices under the row, the
   name is typed into. What is done less often (hiding it, showing only it,
   moving it, deleting it) is behind the row's ⋯. Deleting asks in the row
   and says where its tasks go. Name, colour and icon were once a second
   window, and every row carried a Shown label and a task count. */
function catsModal(){
  const E=V.catEdit||{},del=E.del?cat(E.del):null;
  const row=c=>{const open=E.id===c.id?E.part:"",off=!visibleCat(c.id);
    const n=S.tasks.filter(t=>t.cat===c.id).length+S.routines.filter(r=>r.cat===c.id).length;
    const to=S.categories.find(x=>x.id!==c.id);
    return '<div class="cm-row'+(off?" off":"")+(open?" open":"")+'" draggable="true" data-cat="'+c.id+'" style="--c:'+c.color+'">'+
      '<button type="button" class="cz-grip" data-grip="cat" data-id="'+c.id+'" title="Drag to reorder" aria-label="Move '+esc(c.name)+': drag, or use the arrow keys">'+icon("i-grip","ic-14")+'</button>'+
      '<button type="button" class="cm-ic'+(open==="icon"?" on":"")+'" data-act="cm-part" data-id="'+c.id+'" data-v="icon" aria-label="Icon for '+esc(c.name)+'" aria-expanded="'+(open==="icon")+'">'+icon(c.icon,"ic-16")+'</button>'+
      '<button type="button" class="cm-sw'+(open==="color"?" on":"")+'" data-act="cm-part" data-id="'+c.id+'" data-v="color" aria-label="Color of '+esc(c.name)+'" aria-expanded="'+(open==="color")+'"></button>'+
      '<input class="cm-name" data-act="cm-name" data-id="'+c.id+'" value="'+esc(c.name)+'" maxlength="40" aria-label="Category name" autocomplete="off">'+
      (off?'<span class="cm-hid" title="Hidden from your views">'+icon("i-eye-off","ic-14")+'</span>':"")+
      '<button type="button" class="icon-btn btn-sm cm-more" data-act="cm-more" data-id="'+c.id+'" aria-label="More for '+esc(c.name)+'" aria-haspopup="menu">'+icon("i-more","ic-14")+'</button>'+
      (open==="color"?'<div class="cm-pick">'+CAT_COLORS.map(x=>'<button type="button" class="cm-dot'+(x.toLowerCase()===c.color.toLowerCase()?" on":"")+'" style="--c:'+x+'" data-act="cm-color" data-id="'+c.id+'" data-v="'+x+'" aria-label="'+x+'"></button>').join("")+
        cpSwatch('data-act="cp-open" data-cp="cat" data-id="'+c.id+'"',c.color,!CAT_COLORS.some(x=>x.toLowerCase()===c.color.toLowerCase()),"Any color you like")+'</div>':"")+
      (open==="icon"?'<div class="cm-pick cm-icons">'+CAT_ICONS.map(i=>'<button type="button" class="cm-icon'+(i===c.icon?" on":"")+'" data-act="cm-icon" data-id="'+c.id+'" data-v="'+i+'" aria-label="'+i.replace("i-","")+'">'+icon(i,"ic-16")+'</button>').join("")+'</div>':"")+
      (del&&del.id===c.id?'<div class="cz-delrow"><span>'+(n?'Delete “'+esc(c.name)+'”? '+(n===1?"Its one item moves":"Its "+n+" items move")+' to '+esc(to?to.name:"")+'.':'Delete “'+esc(c.name)+'”?')+'</span>'+
        '<span class="spacer" style="flex:1"></span><button type="button" class="btn btn-sm" data-act="cm-del-no">Keep it</button>'+
        '<button type="button" class="btn btn-sm btn-danger" data-act="cm-del-yes" data-id="'+c.id+'">Delete</button></div>':"")+
      '</div>';};
  openModal('<div class="modal narrow" role="dialog" aria-modal="true" aria-label="Categories">'+
    '<div class="mhead2"><h2>Categories</h2><button class="icon-btn" data-act="close" aria-label="Close">'+icon("i-x")+'</button></div>'+
    '<div class="mbody"><p class="cz-lead">Rename, recolor or reorder them. Drag the handle to move one.</p>'+
      '<div class="cat-manage" id="cmList">'+S.categories.map(row).join("")+'</div>'+
      '<button type="button" class="btn btn-sm cm-new" data-act="cm-new">'+icon("i-plus","ic-14")+'New category</button></div>'+
    '<div class="mfoot"><div class="spacer" style="flex:1"></div><button class="btn btn-primary" data-act="close">Done</button></div></div>');
}
document.addEventListener("keydown",function(e){const t=e.target;if(t&&t.classList&&t.classList.contains("cm-name")&&e.key==="Enter"){e.preventDefault();t.blur();}});
/* Rows move by their handle only: dragged, or with the arrow keys once it
   has the keyboard. Up and down buttons beside it were a second way to do
   one thing. */
document.addEventListener("keydown",function(e){
  const g=e.target&&e.target.closest&&e.target.closest(".cz-grip[data-grip]");if(!g||(e.key!=="ArrowUp"&&e.key!=="ArrowDown"))return;
  e.preventDefault();const step=e.key==="ArrowUp"?-1:1,k=g.dataset.grip,id=g.dataset.id;
  if(k==="lane")czMoveLane(id,step);else if(k==="col")czMoveCol(id,step);else if(k==="cat")cmMove(id,step);
  const n=document.querySelector('.cz-grip[data-grip="'+k+'"][data-id="'+CSS.escape(id)+'"]');if(n)n.focus({preventScroll:true});
});
function cmSet(id,patch){const c=cat(id);if(!c||c.id!==id)return;Object.assign(c,patch);save("categories");renderRail();renderView();catsModal();}
function cmMove(id,step){const L=S.categories,i=L.findIndex(c=>c.id===id),j=i+step;if(i<0||j<0||j>=L.length)return;
  const x=L.splice(i,1)[0];L.splice(j,0,x);save("categories");renderRail();renderView();catsModal();}
function peekModal(date){
  V.peek=date;
  const ts=tasksFor(date),evs=eventsFor(parseD(date));
  const routines=evs.filter(e=>e.kind!=="session"),tracked=evs.filter(e=>e.kind==="session");
  const gd=gcalFor(parseD(date)),gev=gd.allDay.concat(gd.timed.map(x=>x.g));
  openModal('<div class="modal narrow" role="dialog" aria-modal="true" aria-label="Day" data-peek="1">'+
    '<div class="mhead2"><h2>'+esc(parseD(date).toLocaleDateString("en-US",{weekday:"long",day:"numeric",month:"long"}))+'</h2>'+
    '<button class="icon-btn" data-act="close" aria-label="Close">'+icon("i-x")+'</button></div><div class="mbody">'+
    (gev.length?'<div><div class="sec-label" style="margin-bottom:6px">Events</div>'+gev.map(e=>'<div class="qrow" data-act="gcal-ev" data-id="'+esc(e.id)+'"><span class="gdot" style="--c:'+e.color+'"></span><div class="t"><b>'+esc(e.title)+'</b></div><span class="chip num">'+esc(e.allDay?"All day":fmtTime(pad(new Date(e.st).getHours())+":"+pad(new Date(e.st).getMinutes())))+'</span></div>').join("")+'</div>':"")+
    (ts.length?'<div><div class="sec-label" style="margin-bottom:6px">Tasks</div>'+ts.map(t=>'<div class="qrow" data-act="task" data-id="'+t.id+'">'+tickBtn(t)+'<div class="t"><b>'+esc(t.title)+'</b></div>'+catChip(t.cat)+'</div>').join("")+'</div>':"")+
    (routines.length?'<div><div class="sec-label" style="margin-bottom:6px">Routines</div>'+routines.map(e=>'<div class="qrow"><button class="tick'+(e.done?" on":"")+'" data-act="routine-done" data-id="'+e.r.id+'" data-date="'+date+'" aria-label="Toggle">'+icon("i-check")+'</button><div class="t"><b>'+esc(e.r.title)+'</b></div><span class="chip num">'+esc(fmtTime(e.r.time))+'</span></div>').join("")+'</div>':"")+
    (tracked.length?'<div><div class="sec-label" style="margin-bottom:6px">Time tracked</div>'+tracked.map(e=>'<div class="qrow">'+icon("i-timer","ic-14")+'<div class="t"><b>'+esc(e.t.title)+'</b></div><span class="chip num">'+esc(fmtTracked(e.secs))+'</span></div>').join("")+'</div>':"")+
    (!ts.length&&!evs.length&&!gev.length?es("day","A free day","Nothing planned yet. Keep it that way, or add a task.",{hue:"var(--amber)"}):"")+
    '</div><div class="mfoot"><button class="btn btn-primary" data-act="new-task" data-date="'+date+'">'+icon("i-plus")+'Add task</button><div class="spacer" style="flex:1"></div><button class="btn" data-act="close">Close</button></div></div>');
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
/* Only boxes that have actually been scrolled are asked where they are. They
   are noted as they scroll (the capturing listener below); asking every
   element on the page instead made the browser lay the whole page out again,
   which on a big board took over a second per redraw. */
const SCROLLED=new Set();
document.addEventListener("scroll",function(e){const t=e.target;if(t&&t.nodeType===1)SCROLLED.add(t);},true);
function scrollMarks(root){
  const out=[];if(!root)return out;
  SCROLLED.forEach(n=>{
    if(!n.isConnected){SCROLLED.delete(n);return;}
    if((n===root||root.contains(n))&&(n.scrollTop||n.scrollLeft))out.push([scrollKey(n,root),n.scrollTop,n.scrollLeft]);});
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
  qaRefocus();
}
function render(){
  /* The lanes are settled before anything else: first thing on a new planner,
     before any task can arrive and make it look like an old one. */
  ixDrop();board();fixCats();fixRoutines();fixTasks();
  renderRail();renderTopbar();renderView();
  /* The day popup lists what the page does; a tick in it redraws the page, so
     the popup is redrawn with it rather than left showing the old state. */
  if(V.peek&&el("modalRoot").querySelector('.modal[data-peek]'))peekModal(V.peek);
}

/* ============ actions ============ */
function toggleTaskDone(id){
  const t=taskById(id);if(!t)return;
  if(isDoneT(t)){t.status=firstOpen();t.completedAt=null;logAct(id,"reopened","Reopened the task");}
  else{t.status=firstDone();t.completedAt=TODAY();logAct(id,"done","Completed the task");}
  save("tasks");render();
  /* A subtask ticked in its parent's panel: the panel shows the tick too. */
  if(V.sheet&&V.sheet.id)renderSheet();
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
  /* Its subtasks go with it. */
  const gone=new Set([id].concat(S.tasks.filter(x=>x.parent===id).map(x=>x.id)));
  gone.forEach(g=>docsFor(g).forEach(removeDocFromVault));
  S.tasks=S.tasks.filter(x=>!gone.has(x.id));
  S.notes.forEach(x=>{x.actions=(x.actions||[]).filter(y=>!gone.has(y.taskId));});
  S.tasks.forEach(x=>{if(Array.isArray(x.links))x.links=x.links.filter(l=>!gone.has(l));});
  S.docs=S.docs.filter(d=>!gone.has(d.task));
  S.activity=S.activity.filter(a=>!gone.has(a.task));
  S.sessions=S.sessions.filter(x=>!gone.has(x.task));
  if(running()&&gone.has(running().task)){S.prefs.running=null;syncTimerWindow();}
  const parent=t.parent;
  ["tasks","notes","docs","activity","sessions","prefs"].forEach(save);
  /* A subtask deleted from its own panel goes back to its parent's. */
  if(parent&&taskById(parent)){V.sheet={id:parent,tab:"details",draft:null};renderSheet();}else closeSheet();
  render();toast("Task deleted");
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
    start:el("rStart").value||TODAY(),end:el("rEnd").value||"",active:el("rPaused")?!el("rPaused").checked:M.dataset.active!=="false",
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
  const t={id:uid("t"),title:txt,desc:"From note: "+n.title,due:due,cat:n.cat,status:firstOpen(),urgent:null,important:null,subtasks:[],created:TODAY(),completedAt:null,noteId:n.id};
  S.tasks.push(t);
  n.actions=n.actions||[];n.actions.push({id:uid("a"),t:txt,done:false,taskId:t.id});
  n.updated=Date.now();
  save("tasks");save("notes");render();
  const f=el("aiText");if(f)f.focus();
  toast("Added to your tasks and calendar");
}

/* ============ events ============ */
document.addEventListener("click",function(e){
  if(docOpen()&&richTick(e))return;
  let t=e.target;
  if(t&&t.nodeType===3)t=t.parentNode;
  while(t&&!t.closest)t=t.parentNode||t.host;
  if(!t||!t.closest)return;
  if(t.dataset&&t.dataset.scrim==="1"){if(docMayClose())closeModal();return;}
  const n=t.closest("[data-act]");
  if(!n)return;
  const a=n.dataset.act,id=n.dataset.id,M=el("modalRoot");
  try{
  switch(a){
    case "rail":document.body.classList.toggle("rail-open");break;
    case "view":V.view=n.dataset.view;V.q="";closeRail();render();break;
    case "cat-toggle":if(n.classList.contains("cat-row")&&Date.now()<CP.skipUntil)break;toggleCat(id);break;
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
    case "quick":V.f.quick=n.dataset.v;V.colMore={};renderView();break;
    case "col-more":V.colMore=V.colMore||{};V.colMore[n.dataset.v]=(V.colMore[n.dataset.v]||0)+100;renderView();break;
    case "rail-mini":S.prefs.railMini=!S.prefs.railMini;save("prefs");applyRail();tipHide();break;
    case "tip-ok":tipNext();break;
    case "tip-skip":tipEnd();break;
    case "tips-again":S.prefs.tips={done:{},at:{},off:false};save("prefs");toast("The tips will show again, a set for each screen");break;
    case "adv-toggle":V.adv=!V.adv;render();break;
    case "f-drop":{const k=n.dataset.k;V.f[k]=k==="sort"?"due":"";render();break;}
    case "filter-clear":V.f={quick:"all",status:"",cat:"",quad:"",from:"",to:"",sort:"due"};render();break;
    case "task":if(id)openSheet(id);break;
    case "sh-open":if(id)openSheet(id);break;
    case "task-done":toggleTaskDone(id);break;
    case "new-task":openSheet(null,{due:n.dataset.date||"",status:n.dataset.status||firstOpen()});break;
    case "task-delete":if(arm(n,"Delete for good?")){closeModal();deleteTask(id);}break;
    case "sh-sub-add":{const w=el("shSubs"),e=w.parentNode.querySelector(":scope > .es");if(e)e.remove();w.insertAdjacentHTML("beforeend",subRow({id:uid("s"),t:"",d:false}));w.lastElementChild.querySelector("input").focus();break;}
    case "sub-toggle":n.classList.toggle("on");n.closest(".sub-row").classList.toggle("done");commitSubs();break;
    case "sub-del":n.closest(".sub-row").remove();commitSubs();break;

    /* ---- task detail sheet ---- */
    case "sheet-close":closeSheet();break;
    case "sh-create":createFromDraft();break;
    case "sh-tab":V.sheet.tab=n.dataset.v;renderSheet();break;
    case "sh-remind-rel":patchCurrent({remindAt:""});break;
    case "sh-est-u":if(V.sheet){V.sheet.estU=n.dataset.v;renderSheet();const b=document.querySelector('#sheetRoot [data-act="sh-est-u"][data-v="'+n.dataset.v+'"]');if(b)b.focus({preventScroll:true});}break;
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
    case "sh-prio-clear":if(sheetTask())patchCurrent({urgent:null,important:null});break;
    case "sh-cf-multi":{const tid=n.dataset.tid,t=tid?taskById(tid):sheetTask(),fd=fieldById(n.dataset.k);if(!t||!fd)break;
      const v=cfVal(t,fd).slice(),i=v.indexOf(n.dataset.v);if(i>-1)v.splice(i,1);else v.push(n.dataset.v);setCf(fd.id,v,tid);break;}
    case "sh-cf-rate":{const tid=n.dataset.tid,t=tid?taskById(tid):sheetTask(),fd=fieldById(n.dataset.k);if(!t||!fd)break;
      const v=Number(n.dataset.v);setCf(fd.id,Number(cfVal(t,fd))===v?"":v,tid);break;}
    case "lg-toggle":V.lshut=V.lshut||{};V.lshut[n.dataset.v]=!V.lshut[n.dataset.v];renderView();break;
    /* The name is edited where it is: the caret lands where the click did,
       nothing is selected, and the panel stays shut. */
    case "lr-rename":{const b=n.getBoundingClientRect(),x=e.clientX-b.left;
      V.lrename=id;renderView();
      const i=el("lrRename");
      if(i){i.focus();const at=lrCaretAt(i,x);i.setSelectionRange(at,at);}break;}
    case "lr-tag-add":V.ltag=id;renderView();{const i=el("lrTag");if(i)i.focus();}break;
    case "lr-tag-del":{const t=taskById(id);if(t)patchTask(id,{tags:(t.tags||[]).filter(x=>x!==n.dataset.v)});break;}
    case "lr-move":{const t=taskById(id);if(!t)break;
      qaMenu(n,lanes().map(l=>({v:l.id,label:l.name,color:l.color})),t.status,v=>{if(v&&v!==t.status)patchTask(id,{status:v});});break;}
    case "lr-prio":{const t=taskById(id);if(!t)break;
      qaMenu(n,[{v:"",label:"No priority"}].concat(QA_PRIO.map(x=>({v:x[0],label:x[1]}))),quadOf(t)||"",v=>{
        const f={do:[true,true],decide:[false,true],delegate:[true,false],drop:[false,false]}[v]||[null,null];patchTask(id,{urgent:f[0],important:f[1]});});break;}
    case "lr-est":{const t=taskById(id);if(!t)break;
      qaMenu(n,[{v:0,label:"No estimate"}].concat(QA_EST.map(m=>({v:m,label:fmtMins(m)}))),tEst(t),v=>patchTask(id,{est:v}));break;}
    case "lqa-open":V.lqa=n.dataset.v;renderView();{const i=el("lqaTitle");if(i)i.focus();}break;
    case "lr-sort":{if(e.target.closest(".lh-rs")||Date.now()-LR.resized<400)break;
      const b=board(),k=n.dataset.v,x=b.lsort&&b.lsort.k===k?b.lsort:null;
      b.lsort=!x?{k:k,dir:"asc"}:x.dir==="asc"?{k:k,dir:"desc"}:null;save("prefs");renderView();
      if(!e.detail){const h=document.querySelector('.lh[data-act="lr-sort"][data-v="'+CSS.escape(k)+'"]');if(h)h.focus({preventScroll:true});}break;}
    case "customise":V.cz={tab:"lanes"};customiseModal();break;
    case "cz-open-list":closeModal();V.view="tasks";V.taskMode="list";render();break;
    case "cz-lgroup":board().lgroup=n.dataset.v;V.lshut={};save("prefs");customiseModal();render();break;
    case "cp-done":cpClose(false);break;
    case "cp-drop":if(window.EyeDropper){new EyeDropper().open().then(r=>{if(r&&r.sRGBHex&&CPK.el)cpSet(hexToHsv(r.sRGBHex));}).catch(()=>{});}break;
    case "cp-open":{const k=n.dataset.cp,id=n.dataset.id;
      if(k==="accent"){const was={a:S.prefs.accent,h:S.prefs.accentHex};
        cpOpen(n,accentHex(),(hex,back)=>{if(back){S.prefs.accent=was.a;S.prefs.accentHex=was.h;applyAppearance();panels();}else accentLive(hex);},
          hex=>{setCustomAccent(hex);save("prefs");syncTimerWindow();render();panels();});}
      else if(k==="cat"){const c=cat(id);if(c&&c.id===id)cpOpen(n,c.color,hex=>{n.style.setProperty("--dot",hex);n.classList.add("on");},hex=>cmSet(id,{color:hex}));}
      else if(k==="lane"){const l=lane(id);if(l)cpOpen(n,l.color,hex=>{n.style.setProperty("--dot",hex);n.classList.add("on");},hex=>{l.color=hex;save("prefs");customiseModal();render();});}
      else if(k==="opt"){czReadDraft();const o=V.cz.draft&&V.cz.draft.options[Number(n.dataset.v)];
        if(o)cpOpen(n,o.color,hex=>n.style.setProperty("--c",hex),hex=>{czReadDraft();o.color=hex;customiseModal();});}
      break;}
    case "task-menu":taskMenu(id,null,n,false);break;
    case "tm-do":tmDo(n.dataset.v,id,n);break;
    case "qa-open":qaOpen(n.dataset.status);break;
    case "qa-save":qaSave();break;
    case "qa-close":qaClose();break;
    case "qa-cat":qaMenu(n,[{v:"",label:"No category"}].concat(S.categories.map(c=>({v:c.id,label:c.name,color:c.color}))),V.qa.cat||"",v=>qaSet("cat",v));break;
    case "qa-prio":qaMenu(n,[{v:"",label:"No priority"}].concat(QA_PRIO.map(x=>({v:x[0],label:x[1]}))),V.qa.prio||"",v=>qaSet("prio",v));break;
    case "qa-est":qaMenu(n,[{v:0,label:"No estimate"}].concat(QA_EST.map(m=>({v:m,label:fmtMins(m)}))),V.qa.est||0,v=>qaSet("est",v));break;
    case "qa-pick":if(CM.pick&&CM.items){const x=CM.items[Number(n.dataset.i)];if(x)CM.pick(x.v);}break;
    case "qa-files":{if(!(V.qa.title||"").trim()){toast("Name the task first");qaFocus();break;}
      const t=qaSave();if(t){openSheet(t.id);pickAttachment();}break;}
    case "cat-pick":catMenu(n);break;
    case "cat-set":catSet(n.dataset.kind,n.dataset.id,n.dataset.v);break;
    case "cz-subs":{const on=n.dataset.v==="full";if(!!board().fullSubs===on)break;
      const had=S.tasks.reduce((c,t)=>c+(t.parent?0:(t.subtasks||[]).filter(x=>x.t).length),0);
      setFullSubs(on);
      toast(on?(had?had+" checklist item"+(had===1?" is":"s are")+" now full subtasks":"Subtasks now work like full tasks"):"New subtasks are checklist items");
      render();renderSheet();customiseModal();
      const f=document.querySelector('.cz [data-act="cz-subs"][data-v="'+n.dataset.v+'"]');if(f)f.focus({preventScroll:true});break;}
    case "cz-feat-all":{const b=board();BOARD_FEATS.forEach(g=>g[1].forEach(x=>{b.show[x[0]]=true;}));b.fields.forEach(f=>{f.panel=true;f.list=true;});
      save("prefs");renderSheet();render();customiseModal();break;}
    case "cz-tab":czReadDraft();V.cz.tab=n.dataset.v;V.cz.edit=null;V.cz.draft=null;V.cz.del=null;customiseModal();break;
    case "cz-lane-pal":V.cz.pal=V.cz.pal===id?null:id;customiseModal();break;
    case "cz-lane-color":{const l=lane(id);if(l){l.color=n.dataset.v;save("prefs");V.cz.pal=null;customiseModal();render();}break;}
    case "cz-lane-move":czMoveLane(id,Number(n.dataset.v));break;
    case "cz-lane-del":V.cz.del=id;customiseModal();break;
    case "cz-lane-del-no":V.cz.del=null;customiseModal();break;
    case "cz-lane-del-yes":czRemoveLane(id);break;
    case "cz-lane-add":{const L=lanes(),used=L.map(l=>l.color),col=LANE_COLORS.find(x=>used.indexOf(x)<0)||LANE_COLORS[0];
      const nid=uid("lane");
      /* A new lane goes in before the first done one, where open work is. */
      const at=L.findIndex(l=>l.done);L.splice(at<0?L.length:at,0,{id:nid,name:"New lane",color:col,done:false});
      save("prefs");customiseModal();render();
      const inp=document.querySelector('[data-act="cz-lane-name"][data-id="'+nid+'"]');if(inp){inp.focus();inp.select();}break;}
    case "cz-col-move":czMoveCol(n.dataset.k,Number(n.dataset.v));break;
    case "cz-field-new":czReadDraft();V.cz.edit="new";V.cz.draft={id:uid("f"),isNew:true,name:"",type:"text",desc:"",options:[],panel:true,list:true,card:false};customiseModal();
      {const e=el("czEditor");if(e)e.scrollIntoView({block:"nearest"});const i=el("czFName");if(i)i.focus({preventScroll:true});}break;
    case "cz-field-edit":{const fd=fieldById(id);if(!fd)break;V.cz.edit=id;V.cz.draft=JSON.parse(JSON.stringify(Object.assign({isNew:false},fd)));customiseModal();
      const e=el("czEditor");if(e)e.scrollIntoView({block:"nearest"});const i=el("czFName");if(i)i.focus({preventScroll:true});break;}
    case "cz-field-back":V.cz.edit=null;V.cz.draft=null;V.cz.tab="panel";customiseModal();break;
    case "cz-field-save":czSaveField();break;
    case "cz-field-del":if(arm(n,"Delete field and its values?"))czDeleteField(id);break;
    case "cz-desc-show":czReadDraft();V.cz.draft.showDesc=true;customiseModal();{const i=el("czFDesc");if(i)i.focus();}break;
    case "cz-opt-add":{czReadDraft();const o=V.cz.draft.options;o.push({id:uid("o"),name:"",color:CAT_COLORS[o.length%CAT_COLORS.length]});customiseModal();
      const ins=document.querySelectorAll('[data-act="cz-opt-name"]');if(ins.length)ins[ins.length-1].focus();break;}
    case "cz-opt-del":czReadDraft();V.cz.draft.options.splice(Number(n.dataset.v),1);customiseModal();break;
    case "cz-opt-color":{czReadDraft();const o=V.cz.draft.options[Number(n.dataset.v)];if(o){const i=CAT_COLORS.indexOf(o.color);o.color=CAT_COLORS[(i+1)%CAT_COLORS.length];}customiseModal();break;}
    case "sh-tag-del":{const t=sheetTask();if(!t)break;
      patchCurrent({tags:tTags(t).filter(x=>x!==n.dataset.v)});break;}
    case "sh-link-del":{const t=sheetTask();if(!t)break;
      /* Taken off whichever side it was stored on. */
      const other=taskById(n.dataset.v);
      if(other&&t.id&&Array.isArray(other.links)&&other.links.indexOf(t.id)>-1){other.links=other.links.filter(x=>x!==t.id);save("tasks");}
      patchCurrent({links:(Array.isArray(t.links)?t.links:[]).filter(x=>x!==n.dataset.v)});break;}
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
    case "doc-new":{let t=sheetTask();if(!t)break;
      if(!V.sheet.id){t=createFromDraft();if(!t)break;}
      docModal(null,t.id);break;}
    case "doc-open":docModal(id);break;
    case "doc-save":docSave();break;
    case "doc-tool":docTool(n.dataset.v);break;
    case "doc-src":docSrc();break;
    case "doc-url-ok":richAskDone(true);break;
    case "doc-url-cancel":richAskDone(false);break;
    case "doc-full":docFull();break;
    case "doc-discard":DE.dirty=false;closeModal();break;
    case "doc-keep":{const f=el("dcFoot");if(f)f.innerHTML=docFootHtml();docCount();const ta=el("dcMd");if(ta)ta.focus();break;}
    case "doc-del":if(arm(n,"Delete for good?")){deleteDoc(id);DE.dirty=false;closeModal();renderSheet();renderView();toast("Document deleted");}break;

    /* ---- analytics ---- */
    case "mx-quad":{const t=taskById(id);if(!t)break;
      const v=n.dataset.v;t.urgent=v==="do"||v==="delegate";t.important=v==="do"||v==="decide";
      save("tasks");render();toast("Moved to "+(QUADS.find(q=>q.id===v)||{}).name);break;}
    case "new-routine":routineModal(null);break;
    case "qc-kind":qcRead();QC.v.kind=n.dataset.v;qcDraw();qcPlace();{const t=el("qcTitle");if(t)t.focus();}break;
    case "qc-rep":qcRead();QC.v.rep=n.dataset.v;qcDraw();break;
    case "qc-close":qcClose();break;
    case "qc-save":qcSave();break;
    case "qc-more":qcMore();break;
    case "qc-del":{const v=QC.v;if(v&&v.id){S.prefs.away=awayList().filter(a=>a.id!==v.id);save("prefs");qcClose();render();toast("Deleted");}break;}
    case "away-open":awayOpen(id,n);break;
    case "routine":case "routine-edit":routineModal(id);break;
    case "routine-save":saveRoutine(id||null);break;
    case "routine-delete":if(arm(n,"Delete for good?"))deleteRoutine(id);break;
    case "rt-menu":ctxMenu(routineItems(id,TODAY()),null,n);break;
    case "cx-do":{const x=TMN.items&&TMN.items[Number(n.dataset.i)];if(!x)break;
      if(x.arm&&!arm(n,x.arm))break;taskMenuClose();x.run();break;}
    case "routine-done":{const k=id+"|"+n.dataset.date;
      /* A day that has not come yet cannot be done yet; a tick already on
         one can still be taken off. */
      if(S.completions[k])delete S.completions[k];
      else if(n.dataset.date>TODAY()){toast("You can check this off on "+fmtDate(n.dataset.date));break;}
      else S.completions[k]=true;
      save("completions");render();break;}
    case "r-day":{n.classList.toggle("on");n.setAttribute("aria-pressed",String(n.classList.contains("on")));
      /* The drop-down follows the days: all seven is Every day, Monday to
         Friday is Weekdays, anything else is On chosen days. */
      const on=[...M.querySelectorAll("#rDays button.on")].map(b=>b.dataset.v).sort().join("");
      const sel=el("rRep");if(sel)sel.value=on==="0123456"?"daily":on==="12345"?"weekdays":"weekly";break;}
    case "r-active":{const on=M.dataset.active!=="false";M.dataset.active=String(!on);n.classList.toggle("on",on);n.setAttribute("aria-checked",String(on));break;}
    case "manage-cats":V.catEdit={};catsModal();break;
    case "cm-part":{const E=V.catEdit||{};V.catEdit=(E.id===id&&E.part===n.dataset.v)?{}:{id:id,part:n.dataset.v};catsModal();
      const b=document.querySelector('.cm-row[data-cat="'+id+'"] [data-act="cm-part"][data-v="'+n.dataset.v+'"]');if(b)b.focus({preventScroll:true});break;}
    case "cm-color":cmSet(id,{color:n.dataset.v});break;
    case "cm-icon":cmSet(id,{icon:n.dataset.v});break;
    case "cm-new":{const used=S.categories.map(x=>x.color.toLowerCase()),col=CAT_COLORS.find(x=>used.indexOf(x.toLowerCase())<0)||CAT_COLORS[0],nid=uid("c");
      S.categories.push({id:nid,name:"New category",icon:"i-circle",color:col});V.catEdit={};save("categories");renderRail();catsModal();
      const i=document.querySelector('.cm-name[data-id="'+nid+'"]');if(i){i.focus();i.select();}break;}
    case "cm-more":{const c=cat(id);if(!c||c.id!==id)break;const i=S.categories.indexOf(c),off=!visibleCat(id);
      const items=[{v:"vis",label:off?"Show in my views":"Hide from my views"},{v:"only",label:"Show only this"}]
        .concat(S.categories.length>1?[{v:"del",label:"Delete…"}]:[]);
      qaMenu(n,items,null,v=>{
        if(v==="vis")toggleCat(id);
        else if(v==="only"){S.prefs.hidden=S.categories.filter(x=>x.id!==id).map(x=>x.id);touched.prefs=true;save("prefs");render();catsModal();}
        else if(v==="up"||v==="down")cmMove(id,v==="up"?-1:1);
        else if(v==="del"){V.catEdit={del:id};catsModal();}});break;}
    case "cm-del-no":V.catEdit={};catsModal();break;
    case "cm-del-yes":V.catEdit={};delCat(id);break;
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
      Promise.resolve(Notification.requestPermission()).then(p=>{panels();remindSoon();
        if(p==="granted"){try{new Notification("Ember",{body:"This is how your reminders will look."});}catch(e){toast("Notifications are on");}}
        else if(p==="denied")toast("Notifications are blocked in this browser");
      });break;
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
      /* A name is needed: the planner greets and addresses the person by it. */
      if(OB.step==="name"){const v=((el("obName")||{}).value||"").trim();
        if(!v){OB.err="Add your name to carry on.";obRender();const i=el("obName");if(i)i.focus();break;}
        S.prefs.name=v;save("prefs");}
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
    case "ob-rt-toggle":{const x=obRtFind(n.dataset.k);if(!x)break;x.on=!x.on;OB.pop=x.on?x.k:null;
      if(!x.on&&OB.rtOpen===x.k)OB.rtOpen=null;obRtRedraw('[data-act="ob-rt-toggle"][data-k="'+x.k+'"]');break;}
    case "ob-rt-open":{const x=obRtFind(n.dataset.k);if(!x)break;
      OB.rtOpen=OB.rtOpen===x.k?null:x.k;OB.pop=null;
      obRtRedraw('[data-act="ob-rt-open"][data-k="'+x.k+'"]');break;}
    case "ob-rt-day":{const x=obRtFind(n.dataset.k);if(!x)break;const d=Number(n.dataset.v),i=x.days.indexOf(d);
      if(i>-1)x.days.splice(i,1);else x.days.push(d);OB.pop=null;
      obRtRedraw('[data-act="ob-rt-day"][data-k="'+x.k+'"][data-v="'+d+'"]');break;}
    case "ob-rt-dur":{const x=obRtFind(n.dataset.k);if(!x)break;x.dur=Number(n.dataset.v);OB.pop=null;
      OB.rtOpen=null;obRtRedraw('[data-act="ob-rt-open"][data-k="'+x.k+'"]');break;}
    case "ob-rt-add":{const k=uid("rt");
      obRt().push({k:k,custom:true,on:true,title:"",cat:S.categories[0].id,days:[1,2,3,4,5],time:"09:00",dur:30,ic:"i-repeat"});
      OB.rtOpen=null;OB.pop=k;obRtRedraw('[data-act="ob-rt-name"][data-k="'+k+'"]');break;}
    case "ob-rt-del":OB.rt=obRt().filter(r=>r.k!==n.dataset.k);OB.rtOpen=null;obRender();break;
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
    case "settings":V.setTab="account";settingsModal();break;
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
    case "close":if(docMayClose())closeModal();break;
  }
  }catch(err){if(window.console)console.error(err);
    toast("Couldn't do that: "+((err&&err.message)||"unknown error")+" · action "+a);}
});
/* ---- sweeping across the category boxes ----
   Press a category's box and drag over the others: every row between the
   first and the pointer takes the state the first one took, like selecting
   cells, and dragging back gives rows their old state again. It is saved
   once, on release, with one redraw. With a mouse it starts at once; on a
   touch screen after a short hold, so a plain swipe still scrolls. A tap or
   a key press is still an ordinary toggle. */
const CP={id:null,armed:false,timer:0,skipUntil:0};
const CAT_ROW='.cat-row[data-act="cat-toggle"]';
function catPaintRow(row,show){row.classList.toggle("off",!show);row.setAttribute("aria-checked",String(show));}
function catPaintTo(row){
  const all=[...document.querySelectorAll(CAT_ROW)],ids=all.map(r=>r.dataset.id);
  const a=ids.indexOf(CP.start),b=ids.indexOf(row.dataset.id);
  if(a<0||b<0)return;
  const lo=Math.min(a,b),hi=Math.max(a,b);
  CP.rows=new Map();
  all.forEach((r,i)=>{
    const id=r.dataset.id,inside=i>=lo&&i<=hi;
    catPaintRow(r,inside?CP.show:CP.orig.get(id));
    if(inside)CP.rows.set(id,CP.show);
  });
}
document.addEventListener("pointerdown",function(e){
  const row=e.target&&e.target.closest?e.target.closest(CAT_ROW):null;
  if(!row||e.button!==0)return;
  clearTimeout(CP.timer);
  Object.assign(CP,{id:e.pointerId,armed:false,sx:e.clientX,sy:e.clientY,start:row.dataset.id});
  const begin=()=>{
    CP.armed=true;CP.show=row.classList.contains("off");
    CP.orig=new Map([...document.querySelectorAll(CAT_ROW)].map(r=>[r.dataset.id,!r.classList.contains("off")]));
    catPaintTo(row);
    document.body.classList.add("cat-sweep");
  };
  if(e.pointerType==="touch")CP.timer=setTimeout(begin,260);
  else{e.preventDefault();begin();}
});
document.addEventListener("pointermove",function(e){
  if(e.pointerId!==CP.id)return;
  if(!CP.armed){
    if(Math.hypot(e.clientX-CP.sx,e.clientY-CP.sy)>8){clearTimeout(CP.timer);CP.id=null;}
    return;
  }
  const hit=document.elementFromPoint(e.clientX,e.clientY),row=hit&&hit.closest?hit.closest(CAT_ROW):null;
  if(row)catPaintTo(row);
});
function catSweepEnd(e){
  if(e.pointerId!==CP.id)return;
  clearTimeout(CP.timer);CP.id=null;
  if(!CP.armed)return;
  CP.armed=false;document.body.classList.remove("cat-sweep");
  /* The click that follows the release is this gesture, not a toggle. */
  CP.skipUntil=Date.now()+500;
  if(e.type==="pointercancel"){render();return;}
  const h=hiddenCats();
  (CP.rows||new Map()).forEach((show,id)=>{const i=h.indexOf(id);if(show){if(i>-1)h.splice(i,1);}else if(i<0)h.push(id);});
  touched.prefs=true;save("prefs");render();refreshCatsModal();
}
document.addEventListener("pointerup",catSweepEnd);
document.addEventListener("pointercancel",catSweepEnd);
document.addEventListener("touchmove",function(e){if(CP.armed)e.preventDefault();},{passive:false});
document.addEventListener("contextmenu",function(e){if(CP.armed||Date.now()<CP.skipUntil)e.preventDefault();});
document.addEventListener("mousedown",function(e){
  const t=e.target;if(!t||!t.closest)return;
  if(docOpen()&&richTick(e))return;
  if(t.closest('[data-act="doc-tool"]')){richKeep();e.preventDefault();return;}
  const b=t.closest('[data-act="rte"],[data-act="rte-link"],[data-act="scratch-task"],[data-act="scratch-note"]');
  if(b){saveSel();e.preventDefault();}
});
document.addEventListener("selectionchange",function(){
  const a=document.activeElement;if(a&&(a.id==="rte"||a.id==="scratchPad"))saveSel();
  if(a&&a.id==="dcRich")richKeep();
});
document.addEventListener("input",function(e){
  const t=e.target;
  /* Search redraws once typing pauses, not on every key: on a big list each
     redraw is tens of milliseconds, and letters queued behind them. */
  if(t.id==="q"){V.q=t.value;clearTimeout(V.qTimer);V.qTimer=setTimeout(renderView,V.q?140:0);return;}
  if(t.id==="rte"){const x=noteById(V.noteId);if(x){x.html=t.innerHTML;x.updated=Date.now();save("notes");}return;}
  if(t.id==="scratchPad"){S.prefs.scratch=t.innerHTML;save("prefs");return;}
  if(t.id==="obName"){const h=el("obxHi"),v=t.value.trim();if(h)h.textContent=dashGreeting()+(v?", "+v:"");
    if(OB.err&&v){OB.err="";const e=document.querySelector("#obRoot .obx-err");if(e)e.remove();}return;}
  if(t.dataset&&t.dataset.act==="ob-rt-name"){const x=obRtFind(t.dataset.k);if(x){x.title=t.value;
    const b=document.querySelector('#obRoot [data-rt-name="'+x.k+'"]');if(b)b.textContent=t.value||"Your own routine";}return;}
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
    accentLive(e.target.value);return;
  }
  if(false){
    const note=document.querySelector(".accent-note");
    if(note){
      const b=note.querySelector("b");if(b)b.textContent=S.prefs.accentHex;
      const lab=note.querySelector("span");if(lab)lab.textContent="Your own color";
    }
    const tri=accentTrio(S.prefs.accentHex);
    e.target.classList.remove("empty");
    e.target.classList.add("on");
    e.target.style.setProperty("--dot",isDark()?tri.lift:tri.base);
    document.querySelectorAll('[data-act="set-accent"]').forEach(function(el){
      el.classList.remove("on");el.setAttribute("aria-pressed","false");});
    return;
  }
  if(e.target&&(e.target.id==="dcMd"||e.target.id==="dcTitle")){
    if(e.target.id==="dcMd")docChanged();else DE.dirty=true;
  }
  if(e.target&&e.target.id==="dcRich"){richAuto(e);docChanged();
  }
});
document.addEventListener("paste",function(e){if(docOpen()&&!DE.src&&(e.target.id==="dcRich"||richIn(e.target)))richPaste(e);});
document.addEventListener("keydown",function(e){
  if(docOpen()&&docKeys(e))return;
  if(e.key==="Escape"&&el("modalRoot").innerHTML){if(docMayClose())closeModal();return;}
  if(e.key==="Escape"&&V.tmBreak){closeTimeBreakdown();return;}
  if(e.key==="Escape"&&V.sheet&&!el("modalRoot").innerHTML){closeSheet();return;}
  if(e.key==="Escape"&&document.body.classList.contains("rail-open")){closeRail();return;}
  if(e.key==="Enter"&&OB.open&&!PK.el){const t=e.target;
    if(t.dataset&&(t.dataset.act==="ob-cat-name"||t.dataset.act==="ob-rt-name")){e.preventDefault();t.blur();return;}
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
  if(t&&t.id==="shKid"&&e.key==="Enter"&&V.sheet&&V.sheet.id){
    e.preventDefault();const v=t.value;t.value="";addKid(V.sheet.id,v);renderSheet();render();
    const k=el("shKid");if(k)k.focus();return;
  }
  if(t&&t.dataset&&t.dataset.act==="cz-lane-name"&&e.key==="Enter"){e.preventDefault();t.blur();return;}
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
  if(t.id==="rRep"){rtRepeat(t.value);return;}
  if(t.id==="qcStart"&&QC.v){const v=QC.v,len=Math.max(15,hm2m(v.end)-hm2m(v.start));qcRead();v.start=t.value;v.end=m2hm(Math.min(24*60-1,hm2m(v.start)+len));qcDraw();return;}
  if(QC.v&&(t.id==="qcEnd"||t.id==="qcDate"||t.id==="qcDur")){qcRead();qcDraw();return;}
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
  if(t.dataset&&t.dataset.act==="ob-rt-name"){const x=obRtFind(t.dataset.k);if(!x)return;x.title=t.value.trim();OB.pop=null;obRender();return;}
  /* Drive backup switched on asks Google for Drive first, if it has not yet. */
  if(t.dataset&&t.dataset.act==="drive-toggle"){
    if(!t.checked){S.prefs.storage="local";save("prefs");panels();return;}
    const on=()=>{S.prefs.storage="drive";save("prefs");driveBackup().then(ok=>{if(ok)toast("Backed up to Google Drive");});panels();};
    if(acctParts().drive)on();
    else googleAsk("drive").then(ok=>{if(ok)on();else panels();},e=>{DB.err=e.message;panels();});
    return;
  }
  if(t.dataset&&t.dataset.act==="lr-set"){patchTask(t.dataset.id,{[t.dataset.k]:t.value});return;}
  if(t.dataset&&t.dataset.act==="sh-cf"){
    const fd=fieldById(t.dataset.k);if(!fd)return;
    setCf(fd.id,fd.type==="checkbox"?t.checked:fd.type==="number"?(t.value===""?"":Number(t.value)):fd.type==="progress"?Number(t.value):t.value.trim(),t.dataset.tid);
    return;
  }
  if(t.dataset&&t.dataset.act==="cz-lane-name"){const l=lane(t.dataset.id);if(l&&t.value.trim()){l.name=t.value.trim().slice(0,40);save("prefs");render();renderSheet();}else if(l)t.value=l.name;return;}
  if(t.dataset&&t.dataset.act==="cz-lane-done"){const l=lane(t.dataset.id);if(!l)return;
    l.done=t.checked;
    /* Tasks in the lane take on what it now means. */
    S.tasks.forEach(x=>{if(x.status===l.id)x.completedAt=l.done?(x.completedAt||TODAY()):null;});
    save("prefs");save("tasks");customiseModal();render();renderSheet();return;}
  if(t.dataset&&t.dataset.act==="cz-opt-name"){czReadDraft();return;}
  if(t.dataset&&t.dataset.act==="cz-lane-hex"){const l=lane(t.dataset.id);if(l){l.color=t.value;save("prefs");customiseModal();render();}return;}
  if(t.dataset&&t.dataset.act==="cz-ftype-sel"){czReadDraft();const d=V.cz.draft;if(!d)return;d.type=t.value;
    if((d.type==="single"||d.type==="multi")&&!d.options.length)
      d.options=[{id:uid("o"),name:"",color:CAT_COLORS[0]},{id:uid("o"),name:"",color:CAT_COLORS[1]}];
    customiseModal();const f=document.querySelector('.cz [data-act="cz-ftype-sel"]');if(f)f.focus({preventScroll:true});return;}
  /* A field shown in the task, or as a column in the list. */
  if(t.dataset&&t.dataset.act==="cz-where"){
    const k=t.dataset.k,w=t.dataset.w;
    if(w==="panel"){const fd=fieldById(k);if(fd){fd.panel=t.checked;fd.list=t.checked;}else board().show[k]=t.checked;}
    else{const cols=listCols(),c=cols.find(x=>x.k===k);if(!c)return;c.on=t.checked;}
    /* A column that comes on joins the end of the ones already showing. */
    {const cols=listCols(),ck=w==="panel"?(FEAT_COL[k]||(fieldById(k)?"cf:"+k:"")):k,c=ck&&cols.find(x=>x.k===ck);
      if(c&&c.on){const rest=cols.filter(x=>x!==c);board().cols=rest.filter(x=>x.on).concat([c],rest.filter(x=>!x.on));}
      else board().cols=cols;}
    save("prefs");renderSheet();render();customiseModal();
    const f=document.querySelector('.cz [data-act="cz-where"][data-k="'+k+'"][data-w="'+w+'"]');if(f)f.focus({preventScroll:true});
    return;}
  if(V.qa&&t.id==="qaDue"){V.qa.due=t.value;renderView();qaFocus();return;}
  if(t.dataset&&t.dataset.act==="cm-name"){const v=t.value.trim();if(!v){const c=cat(t.dataset.id);t.value=c?c.name:"";toast("A category needs a name");return;}
    const c=cat(t.dataset.id);if(c&&c.name!==v){c.name=v;save("categories");renderRail();renderView();}return;}
  if(t.dataset&&t.dataset.act==="cm-hex"){cmSet(t.dataset.id,{color:t.value});return;}
  if(t.dataset&&t.dataset.act==="sh-est"){const cur=sheetTask()||{},n=Math.max(0,parseFloat(t.value)||0);
    patchCurrent({est:Math.round(estUnit(cur)==="h"?n*60:n)});return;}
  if(t.dataset&&t.dataset.act==="sh-set"){
    const k=t.dataset.k;let v=t.value;
    if(k==="est")v=Math.max(0,parseInt(v,10)||0);
    if(k==="remind"&&v==="at"){const cur=sheetTask()||{};
      const m=Math.max(0,hm2m(cur.dueTime||"09:30")-30);patchCurrent({remindAt:(tTimeDay(cur)||TODAY())+" "+m2hm(m)});return;}
    if(k==="remindDate"){const cur=sheetTask()||{};patchCurrent({remindAt:v?v+" "+((cur.remindAt||"").slice(11)||"09:00"):""});return;}
    if(k==="remindTime"){const cur=sheetTask()||{};if(cur.remindAt)patchCurrent({remindAt:cur.remindAt.slice(0,10)+" "+v});return;}
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
    if(cur)patchCurrent({links:(Array.isArray(cur.links)?cur.links:[]).concat([t.value])});
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
  if(t&&t.status!==col.dataset.col){t.status=col.dataset.col;t.completedAt=isDoneT(t)?TODAY():null;save("tasks");render();}
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
const FIELD_LABEL={title:"Title",desc:"Description",due:"Date",start:"Date",endTime:"End time",
  status:"Status",cat:"Category",est:"Estimate",urgent:"Urgent",important:"Important",
  tags:"Tags",links:"Linked tasks",subtasks:"Subtasks",attachments:"Attachments",
  dueTime:"Start time",remind:"Reminder",remindAt:"Reminder"};

const actFor=id=>(ixAct().get(id)||NONE).slice().sort((a,b)=>a.at-b.at);

function logAct(taskId,kind,text,meta){
  if(!Array.isArray(S.activity))S.activity=[];
  S.activity.push({id:uid("a"),task:taskId,at:Date.now(),kind:kind,text:text||"",meta:meta||null});
  save("activity");
}

/* Render a field value the way a person would say it, not the way it is stored. */
const fieldLabel=k=>k.indexOf("cf:")===0?((fieldById(k.slice(3))||{name:"A field"}).name):FIELD_LABEL[k];
function fieldText(k,v){
  if(k.indexOf("cf:")===0){const fd=fieldById(k.slice(3));return fd?cfText(fd,v):String(v==null?"—":v);}
  if(k==="remind")return remindLabel({remind:v});
  if(k==="dueTime"||k==="endTime")return v?fmtTime(v):"no time";
  if(v==null||v===""||(Array.isArray(v)&&!v.length))return "empty";
  if(k==="status")return ST(v).name;
  if(k==="cat")return cat(v).name;
  if(k==="due"||k==="start")return fmtDate(v);
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
  const a=before.cf||{},b=after.cf||{};
  Object.keys(Object.assign({},a,b)).forEach(fid=>{if(!sameVal(a[fid],b[fid]))logField(id,"cf:"+fid,a[fid],b[fid]);});
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
    prev.text=fieldLabel(k)+": "+fieldText(k,prev.meta.from)+" → "+fieldText(k,to);
    save("activity");return;
  }
  logAct(id,"field",fieldLabel(k)+": "+fieldText(k,from)+" → "+fieldText(k,to),{f:k,from:from,to:to});
}

/* ============ time tracking ============ */
/* Two modes. Countdown runs against the task's estimate and keeps going once
   it passes zero, so overtime is visible rather than hidden. Stopwatch just
   counts up, for work you cannot estimate yet. Either way each run is stored
   as a session, and a task's total is the sum of its sessions. */
const sessionsFor=id=>(ixSess().get(id)||NONE).slice().sort((a,b)=>b.start-a.start);
const trackedSecs=id=>(ixSess().get(id)||NONE).reduce((n,s)=>n+(s.secs||0),0);
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
  const moved=toWorkLane(taskId);
  save("prefs");syncTimerWindow();render();renderSheet();
  if(moved)toast("Moved to "+moved.name);
}
/* Timing a task means it has begun, so a task still waiting in an earlier
   lane (Backlog, To do, Planned) moves to the lane for work in hand. The
   lanes are the person's, so that lane is found by its name -- "In
   progress", "Doing" -- or the built-in id; with none, nothing moves. A task
   already past that lane (waiting for review, say) or finished stays put. */
function workLane(){const L=lanes();
  return L.find(l=>!l.done&&/progress|doing|working|active/i.test(l.name))||L.find(l=>l.id==="in_progress"&&!l.done)||null;}
function toWorkLane(taskId){
  const t=taskById(taskId),w=workLane();if(!t||!w||isDoneT(t)||t.status===w.id)return null;
  const L=lanes().map(l=>l.id);if(L.indexOf(t.status)>L.indexOf(w.id))return null;
  const before=JSON.parse(JSON.stringify(t));t.status=w.id;logChanges(t.id,before,t);save("tasks");
  return w;
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
  if(!t||isDoneT(t))return;
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

/* The strip that sits in the top bar whenever a timer exists: a small
   orbit that fills against the estimate, with pause or resume at its
   centre, then the task and the time. Stop and Pop out come in on hover,
   so the strip is one quiet line the rest of the time. */
function orbitAngle(secs,est){return est&&secs<=est?secs/est*360:(secs%60)*6;}
function timerBar(){
  const r=running();if(!r)return "";
  const t=taskById(r.task);if(!t)return "";
  const c=cat(t.cat),secs=liveSecs(),est=tEst(t)*60;
  const over=est&&secs>est,p=est?Math.min(1,secs/est):0;
  return '<div class="tbar'+(over?" over":"")+(r.since?"":" held")+'" style="--c:'+c.color+'">'+
    '<button class="tbar-orb" data-act="timer-toggle" data-id="'+t.id+'" aria-label="'+(r.since?"Pause":"Resume")+'" title="'+(r.since?"Pause":"Resume")+'">'+
      '<svg viewBox="0 0 30 30" aria-hidden="true"><circle class="to-track" cx="15" cy="15" r="12"/>'+
        '<circle class="to-fill" cx="15" cy="15" r="12" pathLength="100" stroke-dasharray="100" stroke-dashoffset="'+(100-p*100).toFixed(1)+'" transform="rotate(-90 15 15)"/>'+
        '<g class="to-spin" style="transform:rotate('+orbitAngle(secs,est).toFixed(1)+'deg)"><circle class="to-planet" cx="15" cy="3" r="2.6"/></g></svg>'+
      icon(r.since?"i-pause":"i-play","ic-12")+'</button>'+
    '<span class="tbar-name">'+esc(t.title)+'</span>'+
    '<span class="tbar-time num">'+fmtDur(secs)+(est?'<em> of '+esc(fmtMins(est/60))+'</em>':"")+'</span>'+
    '<span class="tbar-more">'+
      '<button class="tbar-btn" data-act="timer-stop" aria-label="Stop and log" title="Stop and log">'+icon("i-stop","ic-14")+'</button>'+
      (desktop()?'<button class="tbar-btn" data-act="timer-pop" aria-label="Pop out the timer" title="Pop out">'+icon("i-pop","ic-14")+'</button>':"")+
    '</span></div>';
}

/* ============ documents ============ */
/* Documents are markdown, so they can live in an Obsidian vault unchanged. */
const docsFor=id=>(ixDocs().get(id)||NONE).slice().sort((a,b)=>b.updated-a.updated);
const docById=id=>S.docs.find(d=>d.id===id);

/* Markdown to HTML, for the document preview and comments: headings,
   emphasis, strikethrough, highlight, code, quotes, lists (nested by
   indent), task boxes, tables, rules, links, images and Obsidian's
   [[links]]. Everything is escaped before any markup is added, and only
   http(s), mailto and inline images are ever turned into addresses.
   mode "edit": for the editor's page -- headings at their own level, and
   checklist items marked by class, their boxes drawn by the stylesheet. */
function mdInline(s){
  const keep=[],hold=h=>"\u0000"+(keep.push(h)-1)+"\u0000";
  let t=esc(s);
  t=t.replace(/`([^`]+)`/g,(_,c)=>hold("<code>"+c+"</code>"));
  t=t.replace(/!\[([^\]]*)\]\(((?:https?:\/\/|data:image\/)[^)\s]+)\)/g,(_,a,u)=>hold('<img src="'+u+'" alt="'+a+'" loading="lazy">'));
  t=t.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g,(_,a,u)=>hold('<a href="'+u+'" target="_blank" rel="noopener noreferrer">'+a+'</a>'));
  t=t.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,(_,p,a)=>hold('<span class="md-wiki">'+(a||p)+'</span>'));
  t=t.replace(/(^|[\s(])(https?:\/\/[^\s<]*[^\s<.,;:!?)])/g,(_,b,u)=>b+hold('<a href="'+u+'" target="_blank" rel="noopener noreferrer">'+u+'</a>'));
  t=t.replace(/\*\*\*(?=\S)([^*]*?\S)\*\*\*/g,"<b><i>$1</i></b>")
    .replace(/(\*\*|__)(?=\S)(.*?\S)\1/g,"<b>$2</b>")
    .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\*)/g,"$1<i>$2</i>")
    .replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?!\w)/g,"$1<i>$2</i>")
    .replace(/~~(?=\S)(.*?\S)~~/g,"<s>$1</s>")
    .replace(/==(?=\S)(.*?\S)==/g,"<mark>$1</mark>");
  return t.replace(/\u0000(\d+)\u0000/g,(_,i)=>keep[+i]);
}
const MD_RULE=/^\s*([-*_])(\s*\1){2,}\s*$/;
const MD_BLOCK=/^\s*(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|```|~~~|\|)/;
function mdToHtml(md,mode){
  const edit=mode==="edit";
  const L=String(md||"").split(/\r?\n/),out=[];
  let list=null;
  const shut=()=>{if(list){out.push("</"+list+">");list=null;}};
  const open=tag=>{if(list!==tag){shut();out.push("<"+tag+">");list=tag;}};
  const lvl=sp=>{const n=Math.min(4,Math.floor(sp.replace(/\t/g,"  ").length/2));return n?' style="--lv:'+n+'"':"";};
  const cells=l=>l.trim().replace(/^\|/,"").replace(/\|$/,"").split("|").map(c=>c.trim());
  for(let i=0;i<L.length;i++){
    const l=L[i].replace(/\s+$/,"");let m;
    if((m=l.match(/^\s*(```|~~~)/))){
      shut();const buf=[];let j=i+1;
      while(j<L.length&&L[j].trim().indexOf(m[1])!==0){buf.push(L[j]);j++;}
      out.push("<pre><code>"+esc(buf.join("\n"))+"</code></pre>");i=j;continue;
    }
    if(!l.trim()){shut();continue;}
    if(MD_RULE.test(l)){shut();out.push("<hr>");continue;}
    if((m=l.match(/^(#{1,6})\s+(.*?)\s*#*$/))){shut();const n=edit?m[1].length:Math.min(m[1].length+1,6);out.push("<h"+n+">"+mdInline(m[2])+"</h"+n+">");continue;}
    if(/^\s*\|/.test(l)&&i+1<L.length&&/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(L[i+1])){
      shut();
      const head=cells(l),al=cells(L[i+1]).map(c=>/^:-+:$/.test(c)?"center":/-:$/.test(c)?"right":"");
      const td=(tag,c,k)=>"<"+tag+(al[k]?' style="text-align:'+al[k]+'"':"")+">"+mdInline(c)+"</"+tag+">";
      let h='<div class="md-table"><table><thead><tr>'+head.map((c,k)=>td("th",c,k)).join("")+"</tr></thead><tbody>";
      i+=2;
      while(i<L.length&&/^\s*\|/.test(L[i])){const r=cells(L[i]);h+="<tr>"+head.map((_,k)=>td("td",r[k]||"",k)).join("")+"</tr>";i++;}
      i--;out.push(h+"</tbody></table></div>");continue;
    }
    if((m=l.match(/^\s*>\s?(.*)$/))){
      shut();const q=[m[1]];
      while(i+1<L.length&&(m=L[i+1].match(/^\s*>\s?(.*)$/))){q.push(m[1]);i++;}
      out.push("<blockquote>"+q.map(mdInline).join("<br>")+"</blockquote>");continue;
    }
    if((m=l.match(/^(\s*)[-*+]\s+\[([ xX])\]\s*(.*)$/))){
      open("ul");const on=m[2]!==" ",cls="md-box"+(on?" on":"");
      out.push('<li class="md-task'+(on?" done":"")+'"'+lvl(m[1])+">"+
        (edit?mdInline(m[3]):'<span class="'+cls+'"></span><span>'+mdInline(m[3])+"</span>")+"</li>");
      continue;
    }
    if((m=l.match(/^(\s*)[-*+]\s+(.*)$/))){open("ul");out.push("<li"+lvl(m[1])+">"+mdInline(m[2])+"</li>");continue;}
    if((m=l.match(/^(\s*)(\d+)[.)]\s+(.*)$/))){
      if(list!=="ol"){shut();out.push('<ol start="'+(+m[2])+'">');list="ol";}
      out.push("<li"+lvl(m[1])+">"+mdInline(m[3])+"</li>");continue;
    }
    shut();
    const para=[l.trim()];
    while(i+1<L.length&&L[i+1].trim()&&!MD_BLOCK.test(L[i+1])&&!MD_RULE.test(L[i+1])){para.push(L[i+1].trim());i++;}
    out.push("<p>"+para.map(mdInline).join("<br>")+"</p>");
  }
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

/* ---- a task's menu ----
   The same list from the ⋯ in the side panel and from a right-click on a
   task anywhere: adding to the task first (a subtask, time, files, a link),
   then copying it, and deleting last, apart from the rest. Parts switched off
   in Customize are left out. From a card, the task opens first, since each
   of these lands in its panel. */
const TMN={el:null,btn:null};
function taskMenuClose(){if(TMN.el){TMN.el.remove();TMN.el=null;}if(TMN.btn){TMN.btn.setAttribute("aria-expanded","false");TMN.btn=null;}}
function taskMenu(id,at,btn,fromCard){
  const t=taskById(id);if(!t)return;
  if(btn&&TMN.btn===btn){taskMenuClose();return;}
  taskMenuClose();catMenuClose();pkClose();
  const r=running(),going=r&&r.task===id&&r.since;
  const items=[];
  if(fromCard)items.push(["open","i-panel","Open task"]);
  if(feat("subtasks")&&!t.parent)items.push(["sub","i-checklist","Add subtask"]);
  if(feat("timer"))items.push(["time",going?"i-pause":"i-play",going?"Pause the timer":"Track time"]);
  if(feat("files"))items.push(["files","i-clip","Attach files"]);
  if(feat("links"))items.push(["link","i-link","Link task"]);
  items.push(["dup","i-copy","Duplicate task"]);
  if(feat("activity")){const on=V.sheet&&V.sheet.id===id&&V.sheet.tab==="activity";items.push(["activity",on?"i-panel":"i-chart",on?"Back to details":"Activity history"]);}
  const m=document.createElement("div");m.className="catmenu tmenu";m.setAttribute("role","menu");
  m.innerHTML=items.map(x=>'<button type="button" role="menuitem" class="cm-opt" data-act="tm-do" data-v="'+x[0]+'" data-id="'+id+'">'+icon(x[1],"ic-14")+'<span>'+x[2]+'</span></button>').join("")+
    '<div class="tm-sep" role="separator"></div><button type="button" role="menuitem" class="cm-opt tm-danger" data-act="tm-do" data-v="del" data-id="'+id+'">'+icon("i-trash","ic-14")+'<span>Delete task</span></button>';
  document.body.appendChild(m);TMN.el=m;TMN.btn=btn||null;if(btn)btn.setAttribute("aria-expanded","true");
  const w=m.offsetWidth,h=m.offsetHeight;let x,y;
  if(btn){const b=btn.getBoundingClientRect();x=b.right-w;y=b.bottom+6;if(y+h>innerHeight-8)y=Math.max(8,b.top-6-h);}
  else{x=at.x;y=at.y;if(y+h>innerHeight-8)y=Math.max(8,innerHeight-8-h);}
  m.style.left=Math.round(Math.min(Math.max(8,x),innerWidth-w-8))+"px";m.style.top=Math.round(y)+"px";
  const f=m.querySelector(".cm-opt");if(f)f.focus({preventScroll:true});
}
function tmDo(v,id,n){
  if(v==="del"){if(!arm(n,"Delete for good?"))return;taskMenuClose();deleteTask(id);return;}
  taskMenuClose();
  if(v==="dup"){duplicateTask(id);return;}
  if(v==="time"){toggleTimer(id);renderSheet();return;}
  if(!V.sheet||V.sheet.id!==id)openSheet(id);
  if(v==="activity"){V.sheet.tab=V.sheet.tab==="activity"?"details":"activity";renderSheet();const b=document.querySelector("#sheetRoot .sh-body");if(b)b.scrollTop=0;return;}
  if(V.sheet.tab==="activity"){V.sheet.tab="details";renderSheet();}
  const find=sel=>document.querySelector("#sheetRoot "+sel);
  const show=node=>{if(node)node.scrollIntoView({block:"center"});};
  if(v==="sub"){
    if(board().fullSubs){const i=find("#shKid");show(i);if(i)i.focus();}
    else{const b=find('[data-act="sh-sub-add"]');show(b);if(b)b.click();}
  }else if(v==="files"){const b=find('[data-act="sh-file-add"]');show(b||find(".filebox"));pickAttachment();}
  else if(v==="link"){const sel=find('[data-act="sh-link-add"]');show(sel||find(".linkbox"));
    if(sel){sel.focus();if(pkSelectable(sel))pkOpen(sel);}else toast("There are no other tasks to link yet");}
}
/* ---- guided tips ----
   One short tour a screen, played the first time that screen is opened and
   never again: two to four pointers, each beside the thing it is about,
   with Next and a count. Tips used to be one long queue across the whole
   planner, so a pointer about the sidebar could land in the middle of
   learning the calendar and the thread was lost. A tour is a section's
   own: leaving half way keeps its place (`prefs.tips.at`), finishing or
   skipping marks it done (`prefs.tips.done`), and Settings ▸ Appearance ▸
   Show the tips again clears both. They wait while setup, a window, a menu
   or the task panel is open, and never take the keyboard.
   A step whose thing is not on the screen is passed over. */
const TIP_TOURS=[
  {id:"dashboard",where:()=>V.view==="dashboard",steps:[
    {sel:".dash-scratch [data-act=\"scratch-task\"]",title:"A scratch pad",
      text:()=>"Jot anything down here. Turn a line into a task, or save the lot as a note."},
    {sel:"#railHead [data-act=\"manage-cats\"]",title:"Your categories",
      text:()=>"Rename them, change their colors and icons, or add your own. Click a box to hide a category everywhere."},
    {sel:".me",title:"Settings",
      text:()=>"Your account, backups, reminders and how the planner looks are all in here."},
    {sel:"#railMini",title:"More room to work",
      text:()=>"Fold the sidebar down to its icons with this button. Click it again to open it."}]},
  {id:"tasks-board",where:()=>V.view==="tasks"&&V.taskMode==="board",steps:[
    {sel:'[data-act="qa-open"]',title:"Add right where it goes",
      text:()=>"Add a task straight into a lane, and drag cards between lanes as work moves along."},
    {sel:'[data-act="task"]',title:"More on a right-click",
      text:()=>"Right-click a task for its options: subtasks, time tracking, duplicate, delete. Routines, notes and calendar items work the same way."},
    {sel:'[data-tip="customize"]',title:"Make tasks yours",
      text:()=>"Choose your board lanes, the details every task has, and how the list is laid out."}]},
  {id:"tasks-list",where:()=>V.view==="tasks"&&V.taskMode==="list",steps:[
    {sel:".lg-head",title:"How the list is grouped",
      text:()=>{const x=lgChoices().find(c=>c[0]===lgBy());return "These tables are grouped by "+(x?x[1].toLowerCase():"start date")+". Pick another way in Customize ▸ List view.";}},
    {sel:'.lrow.head .lh[data-v="name"]',title:"Sort, move and resize",
      text:()=>"Click a column heading to sort by it. Drag a heading to move its column, or drag its edge to change the width."},
    {sel:".lrow:not(.head) .lr-title",title:"Edit it where it is",
      text:()=>"Click any cell to change it: the name, a date, the priority. Details opens the whole task."}]},
  {id:"calendar",where:()=>V.view==="calendar"&&V.calMode==="week",steps:[
    {sel:".daycol.today",title:"Draw it in",
      text:()=>"Drag down a day to add a task, a routine, or time you are unavailable."},
    {sel:".wk-sticky .ad-cell",title:"All day across the top",
      text:()=>"Tasks with a date but no time sit in this band. Anything with a time goes in the grid below."}]},
  {id:"matrix",where:()=>V.view==="matrix",steps:[
    {sel:".quad .quad-head",title:"Four boxes, one question each",
      text:()=>"Tasks sort themselves by how urgent and how important they are. Do first, schedule, delegate or drop: start at the top left."},
    {sel:".unsorted .uq-set",title:"Place it in one click",
      text:()=>"Tasks without a priority wait here. Pick a box to give one, and the task moves into it."}]},
  {id:"routines",where:()=>V.view==="routines",steps:[
    {sel:".rcard .week-dots",title:"Check off a day",
      text:()=>"Click a day’s square to mark the routine done. Any day up to today counts toward your streak, even one that wasn’t scheduled."},
    {sel:".rcard .streak,.rcard .rpaused,.rcard .rbell",title:"How it is going",
      text:()=>"A flame counts the days in a row. The foot of the card shows its category and when it reminds you."},
    {sel:'.rcard [data-act="rt-menu"]',title:"Edit, pause or delete",
      text:()=>"This button, or a right-click anywhere on the card, opens everything you can do to a routine."}]},
  {id:"notes",where:()=>V.view==="notes",steps:[
    {sel:'.nlist-head [data-act="new-note"]',title:"Notes that turn into tasks",
      text:()=>"Write anything here: meeting notes, ideas, plans. Give a note action items and they become real tasks."},
    {sel:".ai-add",title:"Action items",
      text:()=>"Type a to-do and pick a date. It shows up in your tasks and on the calendar, and checking it off here checks it off there."}]}];
const TIP={el:null,tour:null,i:0,target:null,miss:0};
function tipPrefs(){const p=S.prefs.tips||(S.prefs.tips={});if(!p.done)p.done={};if(!p.at)p.at={};return p;}
function tipBlocked(){
  return document.hidden||!!el("modalRoot").innerHTML||!!V.sheet||!!QC.el||!!TMN.el||!!CM.el||!!PK.el||
    document.body.classList.contains("ob-open")||document.body.classList.contains("ob-wait")||(el("obRoot")&&el("obRoot").innerHTML);
}
/* On the page and laid out; it may still be scrolled out of sight, which
   the tip fixes by scrolling to it. A hidden control (the sidebar button on
   a narrow window) has no size and is passed over. */
function tipShown(x){if(!x)return false;const r=x.getBoundingClientRect();return r.width>0&&r.height>0;}
function tipStepAt(tour,i){for(let k=i;k<tour.steps.length;k++){const t=document.querySelector(tour.steps[k].sel);if(tipShown(t))return {i:k,target:t};}return null;}
function tipCheck(){
  const p=tipPrefs();
  if(p.off||tipBlocked()){tipHide();return;}
  if(TIP.tour&&!TIP.tour.where())tipHide();
  if(!TIP.tour){
    const tour=TIP_TOURS.find(t=>!p.done[t.id]&&t.where());
    if(!tour)return;
    TIP.tour=tour;TIP.i=Math.min(p.at[tour.id]||0,tour.steps.length-1);
  }
  const at=tipStepAt(TIP.tour,TIP.i);
  /* Nothing left to point at: on this screen that step does not apply --
     no tasks without a priority, no room for the sidebar button -- so the
     tour is counted as given rather than waiting forever. A tour that has
     not started yet waits for a screen with something on it. */
  if(!at){tipHide2();if(TIP.i>0&&++TIP.miss>3)tipEnd();return;}
  TIP.miss=0;
  if(TIP.el&&TIP.i===at.i&&TIP.target===at.target){tipPlace();return;}
  TIP.i=at.i;tipDraw(at.target);
}
function tipDraw(target){
  const tour=TIP.tour,st=tour.steps[TIP.i],last=TIP.i>=tour.steps.length-1;
  tipHide2();
  const d=document.createElement("div");d.className="tip";d.setAttribute("role","status");
  d.innerHTML='<i class="tip-arrow"></i><b>'+esc(st.title)+'</b><p>'+esc(st.text())+'</p>'+
    '<div class="tip-foot"><button type="button" class="linkish" data-act="tip-skip">'+(last?"":"Skip")+'</button><span class="spacer" style="flex:1"></span>'+
    (tour.steps.length>1?'<span class="tip-n num">'+(TIP.i+1)+' of '+tour.steps.length+'</span>':"")+
    '<button type="button" class="btn btn-sm btn-primary" data-act="tip-ok">'+(last?"Got it":"Next")+'</button></div>';
  document.body.appendChild(d);TIP.el=d;TIP.target=target;
  /* Scrolled out of sight, the thing is brought into view first. */
  const b=target.getBoundingClientRect();
  if(b.bottom<40||b.top>innerHeight-40)try{target.scrollIntoView({block:"center",behavior:"smooth"});}catch(e){target.scrollIntoView();}
  /* A tall target (a whole day of the week) is pointed at, not outlined. */
  if(target.getBoundingClientRect().height<300)target.classList.add("tip-on");
  tipPlace();
}
function tipPlace(){
  const d=TIP.el,t=TIP.target;if(!d||!t)return;
  const r=t.getBoundingClientRect(),w=d.offsetWidth,h=d.offsetHeight;
  const tall=r.height>=300,below=r.bottom+12+h<innerHeight-8,side=r.right+12+w<innerWidth-8&&(tall||(r.width<260&&r.left<260));
  let x,y,cls;
  if(side&&tall){x=r.right+12;y=Math.min(Math.max(8,Math.max(r.top,0)+120),innerHeight-h-8);cls="left";}
  else if(side){x=r.right+12;y=Math.min(Math.max(8,r.top+r.height/2-h/2),innerHeight-h-8);cls="left";}
  else if(below){x=r.left+r.width/2-w/2;y=r.bottom+12;cls="up";}
  else{x=r.left+r.width/2-w/2;y=Math.max(8,r.top-12-h);cls="down";}
  x=Math.min(Math.max(8,x),innerWidth-w-8);
  d.style.left=Math.round(x)+"px";d.style.top=Math.round(y)+"px";d.dataset.side=cls;
  const a=d.querySelector(".tip-arrow");
  if(cls==="left")a.style.cssText="top:"+Math.round(tall?24:Math.min(Math.max(12,r.top+r.height/2-y),h-12))+"px";
  else a.style.cssText="left:"+Math.round(Math.min(Math.max(14,r.left+r.width/2-x),w-14))+"px";
}
/* Takes the card off the screen; the tour it belongs to carries on. */
function tipHide2(){if(TIP.el){TIP.el.remove();TIP.el=null;}if(TIP.target)TIP.target.classList.remove("tip-on");TIP.target=null;}
function tipHide(){tipHide2();TIP.tour=null;TIP.i=0;TIP.miss=0;}
function tipEnd(){const p=tipPrefs();if(TIP.tour){p.done[TIP.tour.id]=1;delete p.at[TIP.tour.id];}save("prefs");tipHide();}
function tipNext(){
  const p=tipPrefs(),tour=TIP.tour;if(!tour)return;
  if(TIP.i>=tour.steps.length-1){tipEnd();return;}
  TIP.i++;p.at[tour.id]=TIP.i;save("prefs");tipHide2();setTimeout(tipCheck,60);
}
setInterval(tipCheck,1000);
addEventListener("resize",()=>{if(TIP.el)tipPlace();});
document.addEventListener("scroll",()=>{if(TIP.el)tipPlace();},true);

/* ---- right-click menus everywhere ----
   A task has its own (`taskMenu()`). Everything else that can be changed
   -- a routine wherever it shows, a note, time marked unavailable, a
   Google event, a category, a lane -- gets the same kind of list on a
   right-click, and routines on their card's ⋯ as well: the thing's own
   actions first, deleting last and apart, asking twice. A text field keeps
   the browser's menu, which has copy and paste. */
function ctxMenu(items,at,btn){
  items=items.filter(Boolean);if(!items.length)return;
  if(btn&&TMN.btn===btn){taskMenuClose();return;}
  taskMenuClose();catMenuClose();pkClose();
  while(items[items.length-1]==="sep")items.pop();
  const m=document.createElement("div");m.className="catmenu tmenu";m.setAttribute("role","menu");
  m.innerHTML=items.map((x,i)=>x==="sep"?'<div class="tm-sep" role="separator"></div>':
    '<button type="button" role="menuitem" class="cm-opt'+(x.danger?" tm-danger":"")+'" data-act="cx-do" data-i="'+i+'">'+icon(x.icon,"ic-14")+'<span>'+esc(x.label)+'</span></button>').join("");
  document.body.appendChild(m);TMN.el=m;TMN.btn=btn||null;TMN.items=items;if(btn)btn.setAttribute("aria-expanded","true");
  const w=m.offsetWidth,h=m.offsetHeight;let x,y;
  if(btn){const b=btn.getBoundingClientRect();x=b.right-w;y=b.bottom+6;if(y+h>innerHeight-8)y=Math.max(8,b.top-6-h);}
  else{x=at.x;y=at.y;if(y+h>innerHeight-8)y=Math.max(8,innerHeight-8-h);}
  m.style.left=Math.round(Math.min(Math.max(8,x),innerWidth-w-8))+"px";m.style.top=Math.round(y)+"px";
  const f=m.querySelector(".cm-opt");if(f)f.focus({preventScroll:true});
}
function deleteRoutine(id){
  const r=routineById(id);if(!r)return;
  S.routines=S.routines.filter(x=>x.id!==id);save("routines");
  /* Its ticks go with it; left behind they were dead weight in every save. */
  Object.keys(S.completions).forEach(k=>{if(k.indexOf(id+"|")===0)delete S.completions[k];});save("completions");
  closeModal();render();toast("Routine deleted");
}
function routineItems(id,date){
  const r=routineById(id);if(!r)return [];
  const k=id+"|"+date,done=!!S.completions[k],later=date>TODAY();
  const day=date===TODAY()?"today":fmtDate(date);
  return [
    later&&!done?null:{icon:done?"i-x":"i-check",label:done?"Mark not done "+(date===TODAY()?"today":"on "+day):"Mark done "+(date===TODAY()?"today":"on "+day),
      run:()=>{if(done)delete S.completions[k];else S.completions[k]=true;save("completions");render();}},
    {icon:"i-edit",label:"Edit routine",run:()=>routineModal(id)},
    {icon:r.active?"i-pause":"i-play",label:r.active?"Pause routine":"Resume routine",
      run:()=>{r.active=!r.active;save("routines");render();toast(r.active?"Routine resumed":"Routine paused");}},
    {icon:"i-copy",label:"Duplicate routine",run:()=>{const c=JSON.parse(JSON.stringify(r));c.id=uid("r");c.title=r.title+" (copy)";
      S.routines.splice(S.routines.indexOf(r)+1,0,c);save("routines");render();toast("Routine duplicated");}},
    "sep",
    {icon:"i-trash",label:"Delete routine",danger:true,arm:"Delete for good?",run:()=>deleteRoutine(id)}];
}
function noteItems(id){
  const x=noteById(id);if(!x)return [];
  return [
    {icon:"i-note",label:"Open note",run:()=>{V.view="notes";V.noteId=id;render();}},
    {icon:"i-pin",label:x.pinned?"Unpin":"Pin to the top",run:()=>{x.pinned=!x.pinned;x.updated=Date.now();save("notes");render();}},
    {icon:"i-copy",label:"Duplicate note",run:()=>{const c=JSON.parse(JSON.stringify(x));c.id=uid("n");c.title=(x.title||"Untitled note")+" (copy)";c.updated=Date.now();c.pinned=false;
      S.notes.unshift(c);V.noteId=c.id;save("notes");render();toast("Note duplicated");}},
    "sep",
    {icon:"i-trash",label:"Delete note",danger:true,arm:"Delete note?",run:()=>{S.notes=S.notes.filter(n=>n.id!==id);if(V.noteId===id)V.noteId=null;save("notes");render();toast("Note deleted. Tasks it created stay.");}}];
}
function awayItems(id,anchor){
  const a=awayList().find(x=>x.id===id);if(!a)return [];
  return [
    {icon:"i-edit",label:"Edit",run:()=>awayOpen(id,anchor)},
    {icon:"i-copy",label:"Duplicate to the next day",run:()=>{awayList().push(Object.assign({},a,{id:uid("a"),date:ymd(addDays(parseD(a.date),1))}));save("prefs");render();toast("Copied to "+fmtDate(ymd(addDays(parseD(a.date),1))));}},
    "sep",
    {icon:"i-trash",label:"Delete",danger:true,arm:"Delete?",run:()=>{S.prefs.away=awayList().filter(x=>x.id!==id);save("prefs");render();toast("Deleted");}}];
}
function catItems(id){
  const c=cat(id);if(!c||c.id!==id)return [];
  const off=!visibleCat(id);
  return [
    {icon:off?"i-eye":"i-eye-off",label:off?"Show "+c.name:"Hide "+c.name,run:()=>toggleCat(id)},
    {icon:"i-target",label:"Show only "+c.name,run:()=>{S.prefs.hidden=S.categories.filter(x=>x.id!==id).map(x=>x.id);touched.prefs=true;save("prefs");render();refreshCatsModal();}},
    hiddenCats().length?{icon:"i-eye",label:"Show every category",run:()=>{S.prefs.hidden=[];touched.prefs=true;save("prefs");render();refreshCatsModal();}}:null,
    "sep",
    {icon:"i-edit",label:"Edit categories",run:()=>{V.catEdit={};catsModal();}}];
}
function laneItems(id){
  const l=lane(id);if(!l)return [];
  return [
    {icon:"i-plus",label:"Add a task here",run:()=>{const b=document.querySelector('[data-act="qa-open"][data-status="'+id+'"]');if(b)b.click();}},
    {icon:"i-sliders",label:"Edit lanes",run:()=>{V.cz={tab:"lanes"};customiseModal();}}];
}
document.addEventListener("contextmenu",function(e){
  const t=e.target;if(!t||!t.closest||e.defaultPrevented)return;
  if(t.closest("input,textarea,[contenteditable='true'],select"))return;
  let items=null;
  const rt=t.closest('[data-act="routine"][data-id],[data-act="routine-done"][data-id]'),rc=t.closest(".rcard[data-rid]");
  const nt=t.closest('[data-act="note-open"][data-id]'),aw=t.closest('[data-act="away-open"][data-id]');
  const cr=t.closest('.cat-row[data-id]'),ln=t.closest('.col[data-col]');
  if(rt)items=routineItems(rt.dataset.id,rt.dataset.date||TODAY());
  else if(rc)items=routineItems(rc.dataset.rid,TODAY());
  else if(nt)items=noteItems(nt.dataset.id);
  else if(aw)items=awayItems(aw.dataset.id,aw);
  else if(cr)items=catItems(cr.dataset.id);
  else if(ln&&!t.closest('[data-act="task"]'))items=laneItems(ln.dataset.col);
  if(!items||!items.length)return;
  e.preventDefault();ctxMenu(items,{x:e.clientX,y:e.clientY},null);
});
/* A copy with its details, checklist and fields, in the same lane; not its
   history, its tracked time or its comments, which belong to the original. */
function duplicateTask(id){
  const t=taskById(id);if(!t)return;
  const c=JSON.parse(JSON.stringify(t));
  c.id=uid("t");c.title=t.title+" (copy)";c.created=TODAY();
  c.subtasks=(c.subtasks||[]).map(x=>Object.assign({},x,{id:uid("s")}));
  if(!isDoneT(c))c.completedAt=null;
  S.tasks.splice(S.tasks.indexOf(t)+1,0,c);
  logAct(c.id,"created","Duplicated from “"+t.title+"”");save("tasks");render();
  openSheet(c.id);toast("Task duplicated");
}
document.addEventListener("mousedown",function(e){if(TMN.el&&!TMN.el.contains(e.target)&&!(TMN.btn&&TMN.btn.contains(e.target)))taskMenuClose();},true);
document.addEventListener("scroll",function(e){if(TMN.el&&!TMN.el.contains(e.target))taskMenuClose();},true);
document.addEventListener("keydown",function(e){
  if(!TMN.el)return;
  if(e.key==="Escape"){e.preventDefault();e.stopPropagation();const b=TMN.btn;taskMenuClose();if(b&&b.isConnected)b.focus();return;}
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();const o=[...TMN.el.querySelectorAll(".cm-opt")],i=o.indexOf(document.activeElement);
    const n=o[(i+(e.key==="ArrowDown"?1:-1)+o.length)%o.length];if(n)n.focus();}
  if(e.key==="Tab")taskMenuClose();
},true);
/* The list's in-place boxes: Enter keeps what is typed, Esc leaves it,
   and leaving the box keeps it too. A new task in a lane stays open for the
   next, as the board's does. */
/* Where in the name a click at x pixels landed, measured in a copy of the
   box's own type rather than guessed from the average letter. */
function lrCaretAt(i,x){
  const v=i.value;if(x==null||x<=0)return 0;
  const cs=getComputedStyle(i),pad=parseFloat(cs.paddingLeft)||0;
  const c=document.createElement("canvas").getContext("2d");
  c.font=cs.fontStyle+" "+cs.fontWeight+" "+cs.fontSize+" "+cs.fontFamily;
  const want=x-pad;let last=0;
  for(let k=1;k<=v.length;k++){const w=c.measureText(v.slice(0,k)).width;
    if(w>=want)return (want-last)<(w-want)?k-1:k;last=w;}
  return v.length;
}
function lrCommit(i,keep){
  if(i.id==="lrRename"){const v=i.value.trim();V.lrename=null;
    if(keep&&v&&taskById(i.dataset.id)&&v!==taskById(i.dataset.id).title)patchTask(i.dataset.id,{title:v});else renderView();}
  else if(i.id==="lrTag"){const v=i.value.trim().replace(/^#/,""),t=taskById(i.dataset.id);V.ltag=null;
    if(keep&&v&&t&&(t.tags||[]).indexOf(v)<0)patchTask(t.id,{tags:(t.tags||[]).concat([v])});else renderView();}
  else if(i.id==="lqaTitle"){const v=i.value.trim(),k=V.lqa;
    if(keep&&v){const x=newTask(Object.assign({title:v,status:firstOpen(),cat:(S.categories.find(c=>c.id==="other")||S.categories[0]).id},lgPreset(lgBy(),k)));if(isDoneT(x))x.completedAt=TODAY();
      S.tasks.push(x);logAct(x.id,"created","Created this task");save("tasks");render();const n=el("lqaTitle");if(n)n.focus();}
    else{V.lqa=null;renderView();}}
}
document.addEventListener("keydown",function(e){const t=e.target;if(!t||!/^(lrRename|lrTag|lqaTitle)$/.test(t.id))return;
  if(e.key==="Enter"&&!e.isComposing){e.preventDefault();lrCommit(t,true);}
  else if(e.key==="Escape"){e.preventDefault();if(t.id==="lqaTitle")V.lqa=null;V.lrename=null;V.ltag=null;renderView();}});
document.addEventListener("focusout",function(e){const t=e.target;if(!t||!/^(lrRename|lrTag|lqaTitle)$/.test(t.id))return;
  setTimeout(()=>{if(t.isConnected)lrCommit(t,t.id!=="lqaTitle"||!!t.value.trim()?true:false);},0);});
/* Column widths: drag a heading's edge. All the tables follow at once, as the
   widths are variables on the page; the new width is kept on letting go. */
const LR={resized:0};
/* Scrolled sideways, the task column shows its edge. */
document.addEventListener("scroll",function(e){const r=e.target;if(r&&r.classList&&r.classList.contains("lr-root"))r.classList.toggle("lr-x",r.scrollLeft>0);},true);
/* A heading has the keyboard: Enter or Space sorts by it. */
document.addEventListener("keydown",function(e){const h=e.target&&e.target.classList&&e.target.classList.contains("lh")?e.target:null;
  if(!h||(e.key!=="Enter"&&e.key!==" "))return;e.preventDefault();h.click();});
document.addEventListener("pointerdown",function(e){
  const h=e.target&&e.target.closest&&e.target.closest(".lh-rs");if(!h)return;
  e.preventDefault();e.stopPropagation();
  const k=h.dataset.rs,root=h.closest(".lr-root"),cell=h.parentNode,x0=e.clientX,w0=cell.getBoundingClientRect().width,min=k==="name"?160:64;
  document.body.classList.add("lr-resizing");
  const move=ev=>{const w=Math.max(min,Math.round(w0+ev.clientX-x0));root.style.setProperty("--w-"+lrVar(k),w+"px");h.dataset.w=w;};
  const up=()=>{document.removeEventListener("pointermove",move);document.removeEventListener("pointerup",up);document.body.classList.remove("lr-resizing");LR.resized=Date.now();
    if(h.dataset.w){const b=board();b.colW=Object.assign({},b.colW||{},{[k]:Number(h.dataset.w)});save("prefs");}};
  document.addEventListener("pointermove",move);document.addEventListener("pointerup",up);
},true);
/* Column order: hold a heading and drag it along. */
(function(){
  let from=null;
  document.addEventListener("dragstart",e=>{const h=e.target&&e.target.closest&&e.target.closest(".lrow.head .lh[draggable]");if(!h)return;
    from=h.dataset.col;h.classList.add("dragging");try{e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain","");}catch(x){}});
  document.addEventListener("dragover",e=>{if(!from)return;const h=e.target.closest&&e.target.closest(".lrow.head .lh[draggable]");if(!h)return;
    e.preventDefault();document.querySelectorAll(".lh.drop-l,.lh.drop-r").forEach(x=>x.classList.remove("drop-l","drop-r"));
    if(h.dataset.col===from)return;const r=h.getBoundingClientRect();h.classList.add(e.clientX<r.left+r.width/2?"drop-l":"drop-r");});
  document.addEventListener("drop",e=>{if(!from)return;const h=e.target.closest&&e.target.closest(".lrow.head .lh[draggable]");if(!h||h.dataset.col===from)return;
    e.preventDefault();const before=h.classList.contains("drop-l");
    const order=listCols().filter(c=>c.on).map(c=>c.k).filter(k=>k!==from),i=order.indexOf(h.dataset.col);
    order.splice(before?i:i+1,0,from);from=null;lrSaveCols(order);});
  document.addEventListener("dragend",()=>{from=null;document.querySelectorAll(".lh.dragging,.lh.drop-l,.lh.drop-r").forEach(x=>x.classList.remove("dragging","drop-l","drop-r"));});
})();
/* A new task: type the name, press Enter, and it is made. */
document.addEventListener("keydown",function(e){const t=e.target;
  if(!t||t.id!=="shTitle"||e.key!=="Enter"||e.isComposing||!V.sheet||V.sheet.id)return;
  e.preventDefault();patchDraft({title:t.value});createFromDraft();});
/* Right-click on a task anywhere on the page opens the same menu there. */
document.addEventListener("contextmenu",function(e){
  const t=e.target&&e.target.closest&&e.target.closest('[data-act="task"][data-id],.lrow[data-task]');
  if(!t)return;
  const id=t.dataset.id||t.dataset.task;
  if(t.closest("#sheetRoot")||!taskById(id))return;
  e.preventDefault();taskMenu(id,{x:e.clientX,y:e.clientY},null,true);
});
function openSheet(id,preset){
  if(id&&!taskById(id))return;
  V.tmBreak=null;
  V.sheet={id:id||null,tab:"details",
    draft:id?null:Object.assign({title:"",desc:"",due:"",dueTime:"",endTime:"",deadline:"",cat:S.categories[0].id,
      status:firstOpen(),urgent:null,important:null,est:0,tags:[],links:[],subtasks:[],attachments:[],cf:{}},preset||{})};
  renderSheet();
}
function closeSheet(){V.sheet=null;V.tmBreak=null;renderSheet();clearGhosts();}

/* The task being shown, or the unsaved draft for a new one. */
const sheetTask=()=>{const s=V.sheet;return s?(s.id?taskById(s.id):s.draft):null;};

function patchTask(id,patch,redraw){
  const t=taskById(id);if(!t)return;
  const before=JSON.parse(JSON.stringify(t));
  Object.assign(t,patch);
  if(isDoneT(t)&&!t.completedAt)t.completedAt=TODAY();
  if(!isDoneT(t))t.completedAt=null;
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
/* An estimate in minutes or hours, whichever reads better; it is kept in
   minutes either way. A whole number of hours opens in hours. */
const estUnit=t=>(V.sheet&&V.sheet.estU)||(tEst(t)>=60&&tEst(t)%15===0?"h":"m");
function estField(t){
  const u=estUnit(t),m=tEst(t),v=!m?"":u==="h"?String(Math.round(m/60*100)/100):String(m);
  return '<div class="est-wrap"><input class="inp inp-sm est-in" type="number" min="0" step="'+(u==="h"?"0.25":"5")+'" value="'+v+'" placeholder="0" data-act="sh-est" aria-label="Time estimate in '+(u==="h"?"hours":"minutes")+'">'+
    '<div class="seg est-u" role="group" aria-label="Unit">'+[["m","minutes"],["h","hours"]].map(x=>'<button type="button" data-act="sh-est-u" data-v="'+x[0]+'" aria-pressed="'+(u===x[0])+'">'+x[1]+'</button>').join("")+'</div></div>';
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
  V.sheet={id:t.id,tab:"details",draft:null};
  render();renderSheet();toast("Task added");
  return t;
}

const metaRow=(label,inner,ic)=>'<div class="mrow"><div class="mlab">'+(ic?icon(ic,"ic-14"):"")+esc(label)+'</div><div class="mval">'+inner+'</div></div>';

/* When, the way Google Calendar asks it: a date, then a start and an end
   time on the same line -- or, ticked, all day. The times wait for a date
   to hang on. A second date, the day it was due by, sat under this one and
   was taken out: people read the two as two deadlines. */
function sheetDates(t){
  const day=t.due||"",all=!t.dueTime;
  const line='<div class="when-line">'+
    dateField('data-act="sh-set" data-k="due"',day,{sm:1,long:1,label:"Date",ph:"Add a date",cls:"when-date"})+
    (day&&!all?timeField('data-act="sh-set" data-k="dueTime"',t.dueTime,{sm:1,label:"Start time",req:1,cls:"when-time"})+
      '<span class="when-dash" aria-hidden="true">–</span>'+
      timeField('data-act="sh-set" data-k="endTime"',t.endTime||m2hm(tSpan(t).end),{sm:1,label:"End time",req:1,after:t.dueTime,cls:"when-time"}):"")+
    '</div>';
  const allday=day?'<label class="when-all"><input type="checkbox" data-act="sh-allday"'+(all?" checked":"")+'><span>All day</span></label>':"";
  return '<div class="when">'+line+allday+'</div>';
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
const pkDateText=v=>{const d=parseD(v);return DOWS[(d.getDay()+6)%7]+", "+fmtDate(v);};
/* "Wednesday, 9 September", as Google writes the date of an event. */
const pkLongDate=v=>{const d=parseD(v);
  return d.toLocaleDateString("en-US",Object.assign({weekday:"long",day:"numeric",month:"long"},d.getFullYear()===today().getFullYear()?{}:{year:"numeric"}));};
const pkText=(kind,v,fmt)=>kind==="date"?(fmt==="long"?pkLongDate(v):pkDateText(v)):fmtTime(v);
/* How long an end time makes it: 30 mins, 1 hr, 1.5 hrs. */
const durLabel=m=>m<60?m+" mins":(Math.round(m/60*100)/100)+(m===60?" hr":" hrs");
function pickField(kind,attrs,val,o){
  o=o||{};val=val||"";
  /* A time is a box you type in or pick from, as Google Calendar's is: the
     list opens under it, and what is typed is read when Enter is pressed or
     the box is left. */
  if(kind==="time")return '<span class="pkf pkf-time">'+
    '<input type="text" class="inp'+(o.sm?" inp-sm":"")+(o.cls?" "+o.cls:"")+' pk-btn pk-tin'+(val?"":" is-empty")+'" data-act="pk-open" data-pk="time"'+
      ' data-ph="'+esc(o.ph||"Pick a time")+'"'+(o.req?' data-req="1"':"")+' data-label="'+esc(o.label||"")+'"'+(o.after?' data-after="'+esc(o.after)+'"':"")+
      ' value="'+esc(val?fmtTime(val):"")+'" placeholder="'+esc(o.ph||"Pick a time")+'" aria-label="'+esc(o.label||"Time")+'" autocomplete="off" spellcheck="false"'+
      ' role="combobox" aria-haspopup="listbox" aria-expanded="false"'+(o.disabled?" disabled":"")+'>'+
    '<input type="hidden" '+attrs+' value="'+esc(val)+'"></span>';
  const txt=val?pkText(kind,val,o.long?"long":""):(o.ph!=null?o.ph:(kind==="date"?"Pick a date":"Pick a time"));
  return '<span class="pkf">'+
    '<button type="button" class="inp'+(o.sm?" inp-sm":"")+(o.cls?" "+o.cls:"")+' pk-btn'+(val?"":" is-empty")+'" data-act="pk-open" data-pk="'+kind+'"'+
      ' data-ph="'+esc(o.ph!=null?o.ph:(kind==="date"?"Pick a date":"Pick a time"))+'"'+(o.req?' data-req="1"':"")+' data-label="'+esc(o.label||"")+'"'+(o.long?' data-fmt="long"':"")+(o.after?' data-after="'+esc(o.after)+'"':"")+
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
  if(PK.src===src){if(btn.tagName!=="INPUT")pkClose();return;}
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
    tinScroll();
    if(document.activeElement!==btn)btn.focus({preventScroll:true});
    btn.select();
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
  if(PK.kind==="time")p.style.width=Math.max(b.dataset.after?196:140,r.width)+"px";
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
      ' data-act="pk-day" data-v="'+s+'" tabindex="'+(s===PK.focus?0:-1)+'" aria-label="'+esc(d.toLocaleDateString("en-US",{weekday:"long",day:"numeric",month:"long",year:"numeric"}))+'"'+
      (s===t?' aria-current="date"':"")+' aria-pressed="'+(s===v)+'">'+d.getDate()+'</button>';}
  return '<div class="pk-top">'+quick.map(q=>'<button type="button" class="pk-chip'+(q[1]===v?" on":"")+'" data-act="pk-day" data-v="'+q[1]+'" title="'+esc(pkDateText(q[1]))+'">'+q[0]+'</button>').join("")+'</div>'+
    '<div class="pk-mh"><b>'+MON[mo]+' '+y+'</b>'+
      '<button type="button" class="pk-nav" data-act="pk-month" data-v="-1" aria-label="Previous month">'+icon("i-chev-l","ic-14")+'</button>'+
      '<button type="button" class="pk-nav" data-act="pk-month" data-v="1" aria-label="Next month">'+icon("i-chev-r","ic-14")+'</button></div>'+
    '<div class="pk-cal"><div class="pk-dow">'+dowLabels().map(x=>'<span>'+x.slice(0,2)+'</span>').join("")+'</div>'+
      '<div class="pk-days">'+days+'</div></div>'+
    pkFoot(v?esc(parseD(v).toLocaleDateString("en-US",{weekday:"long",day:"numeric",month:"long"})):"Pick a day, or use the arrow keys",
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
  const cur=PK.src.value,after=PK.btn.dataset.after,a=after?hm2m(after):null;
  /* Half hours, as Google Calendar lists them; a time typed in between is
     kept and shown in its place. */
  const n=new Date(),next=Math.min(23*60+30,Math.ceil((n.getHours()*60+n.getMinutes())/30)*30);
  const aim=cur||(after?m2hm(Math.min(a+60,23*60+30)):m2hm(next));
  const vals=[];for(let m=after?a+30:0;m<24*60;m+=30)vals.push(m2hm(m));
  if(cur&&vals.indexOf(cur)<0&&(!after||hm2m(cur)>a)){vals.push(cur);vals.sort();}
  return '<div class="pk-body pk-tlist" role="listbox" aria-label="'+esc(PK.btn.dataset.label||"Times")+'">'+vals.map(v=>
    '<button type="button" class="pk-opt'+(v===cur?" on":"")+(v===aim?" aim":"")+'" data-act="pk-pick" data-v="'+v+'" role="option" aria-selected="'+(v===cur)+'" tabindex="-1">'+
      '<span>'+esc(fmtTime(v))+'</span>'+(after?'<small class="pk-dur">'+esc(durLabel(hm2m(v)-a))+'</small>':"")+'</button>').join("")+'</div>';
}
/* The row the keyboard is on, and keeping it in view. */
function tinScroll(){
  const p=PK.el;if(!p)return;const list=p.querySelector(".pk-body"),aim=p.querySelector(".pk-opt.aim");
  if(list&&aim)list.scrollTop=aim.offsetTop-list.clientHeight/2+aim.offsetHeight/2;
}
function tinAim(opt){
  if(!PK.el||!opt)return;PK.el.querySelectorAll(".pk-opt.aim").forEach(o=>o.classList.remove("aim"));
  opt.classList.add("aim");tinScroll();
}
/* Typing moves the list to the nearest time at or after what is typed. */
function tinTyped(inp){
  if(!PK.el||PK.btn!==inp)pkOpen(inp);
  const v=parseTimeStr(inp.value);if(!v||!PK.el)return;
  const opts=[...PK.el.querySelectorAll(".pk-opt")];
  tinAim(opts.find(o=>o.dataset.v>=v)||opts[opts.length-1]);
}
/* Read what is typed: a time, nothing (where allowed), or back to what it was. */
function tinCommit(inp){
  const src=inp.parentNode.querySelector('input[type="hidden"]');if(!src)return;
  const txt=inp.value.trim(),cur=src.value;
  let v=txt?parseTimeStr(txt):"";
  if(txt&&!v){inp.value=cur?fmtTime(cur):"";toast("Try a time like 9, 9:30, 2:15pm or 14:15");return;}
  if(!v&&inp.dataset.req){inp.value=cur?fmtTime(cur):"";return;}
  if(v&&inp.dataset.after&&hm2m(v)<=hm2m(inp.dataset.after)){inp.value=cur?fmtTime(cur):"";toast("The end has to be after the start");return;}
  inp.value=v?fmtTime(v):"";inp.classList.toggle("is-empty",!v);
  if(v===cur)return;
  src.value=v;src.dispatchEvent(new Event("change",{bubbles:true}));
}
function pkTyped(){if(PK.btn&&PK.btn.classList.contains("pk-tin")){const b=PK.btn;pkClose();tinCommit(b);}}

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
      (c?'<i class="pk-dot"></i>':"")+(o.dataset.ic?icon(o.dataset.ic,"ic-14 pk-ic"):"")+
      (o.dataset.sub?'<span class="pk-two"><span>'+esc(o.text)+'</span><small>'+esc(o.dataset.sub)+'</small></span>':'<span>'+esc(o.text)+'</span>')+
      (on?icon("i-check","ic-14"):"")+'</button>';
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
  if(b&&b.tagName==="INPUT"){b.value=v?fmtTime(v):"";b.classList.toggle("is-empty",!v);}
  else if(b){const txt=v?pkText(b.dataset.pk,v,b.dataset.fmt):(b.dataset.ph||"");
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
  if(t.classList&&t.classList.contains("pk-tin")){
    if(!PK.el||PK.btn!==t){if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();pkOpen(t);}
      else if(e.key==="Enter"){e.preventDefault();tinCommit(t);}return;}
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();
      const opts=[...PK.el.querySelectorAll(".pk-opt")],i=opts.findIndex(o=>o.classList.contains("aim"));
      const n=opts[Math.max(0,Math.min(opts.length-1,(i<0?0:i)+(e.key==="ArrowDown"?1:-1)))];
      tinAim(n);if(n)t.value=fmtTime(n.dataset.v);t.select();return;}
    if(e.key==="Enter"){e.preventDefault();pkClose();tinCommit(t);return;}
    if(e.key==="Escape"){e.preventDefault();e.stopPropagation();const src=t.parentNode.querySelector('input[type="hidden"]');
      t.value=src&&src.value?fmtTime(src.value):"";pkClose();return;}
    if(e.key==="Tab"){pkClose();return;}
    return;
  }
  if(!PK.el)return;
  if(e.key==="Escape"){e.preventDefault();e.stopPropagation();pkClose(true);return;}
  if(e.key==="Tab"&&PK.kind==="select"){pkClose();return;}
  if(!PK.el.contains(t))return;
  if(PK.kind==="date"&&t.classList.contains("pk-day")){pkDayKey(e);return;}
  if(PK.kind==="select"&&(e.key==="ArrowDown"||e.key==="ArrowUp"||(t.id==="pkFind"&&e.key==="Enter"))){
    const list=[...PK.el.querySelectorAll(".pk-opt:not([hidden]):not(:disabled)")];if(!list.length)return;
    e.preventDefault();
    if(t.id==="pkFind"){if(e.key==="Enter")list[0].click();else if(e.key==="ArrowDown")list[0].focus();return;}
    const i=list.indexOf(t),n=e.key==="ArrowDown"?Math.min(list.length-1,i+1):i-1;
    if(n<0){const f=el("pkFind");if(f)f.focus();}else list[n].focus();
  }
},true);
document.addEventListener("input",function(e){if(e.target&&e.target.id==="pkFind")pkFind(e.target.value);
  if(e.target&&e.target.classList&&e.target.classList.contains("pk-tin"))tinTyped(e.target);});
/* Leaving a time box reads what was typed, unless the move is into its list. */
document.addEventListener("focusout",function(e){
  const t=e.target;if(!t||!t.classList||!t.classList.contains("pk-tin"))return;
  if(PK.el&&e.relatedTarget&&PK.el.contains(e.relatedTarget))return;
  tinCommit(t);
});
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
      :'<span class="prio-note">Answer both to place it in the matrix.</span>')+
    /* Clicking a chosen answer again clears it, but nothing said so. */
    (st.urgent!==""||st.important!==""?'<button class="prio-clear" data-act="sh-prio-clear" title="Take the task out of the matrix">'+icon("i-x","ic-14")+'Clear</button>':"")+
    '</div></div>';
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
    parseD(k).toLocaleDateString("en-US",{weekday:"short",day:"numeric",month:"short"});
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
    ? '<p class="tmb-empty">No time tracked yet. Press Start, and each session appears here at the hour you worked.</p>'
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
const histCount=t=>(ixAct().get(t.id)||NONE).reduce((n,a)=>n+(a.kind!=="comment"?1:0),0);

/* A task still being written shows the section too, rather than leaving
   people to find it after pressing Create; its button creates the task
   first, then opens the document. */
function docsSection(t,isNew){
  const ds=isNew?NONE:docsFor(t.id);
  return '<div class="sh-sec"><label class="sec-label">Documents'+(ds.length?' <span class="num">'+ds.length+'</span>':"")+'</label>'+
    (ds.length?'<div class="doclist">'+ds.map(d=>
      '<button class="doccard" data-act="doc-open" data-id="'+d.id+'">'+icon("i-doc","ic-14")+
      '<span class="dc-t">'+esc(d.title)+'</span>'+
      '<span class="dc-m">'+esc(relTime(d.updated))+'</span></button>').join("")+'</div>'
      :es("doc","No documents yet","Write a brief, meeting notes or a plan for this task.",{mini:1,hue:"var(--apricot)"}))+
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
  if(!items.length)return es("history","The story starts here","Status changes, edits and time tracked are listed as they happen.",{mini:1,hue:"var(--blue)"});

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
  const isNew=!s.id,c=cat(t.cat),done=isDoneT(t);
  if(s.tab==="activity"&&!feat("activity"))s.tab="details";
  const parent=t.parent?taskById(t.parent):null;
  /* The panel has the parts switched on in Customize; a group with none
     left is not drawn at all. */
  const group=(title,rows)=>{const r=rows.filter(Boolean).join("");return r?'<div class="sh-group"><div class="sh-gh">'+title+'</div>'+r+'</div>':"";};
  const cfRows=board().fields.filter(f=>f.panel!==false).map(f=>metaRow(f.name,cfControl(t,f),cfType(f.type)[2]));

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
      (feat("status")?'<select class="inp inp-sm sh-status" data-act="sh-set" data-k="status" aria-label="Lane">'+
        lanes().map(x=>'<option value="'+x.id+'"'+(t.status===x.id?" selected":"")+'>'+esc(x.name)+'</option>').join("")+'</select>':"")+
      '<div class="spacer" style="flex:1"></div>'+
      (isNew||!feat("timer")?"":'<button class="icon-btn btn-sm" data-act="sh-timer" title="Start the timer" aria-label="Start the timer">'+icon(running()&&running().task===t.id&&running().since?"i-pause":"i-play","ic-14")+'</button>')+
      /* A new task is made from the top right, beside close, where the eye
         already is after typing the name; Enter in the name does it too. */
      (isNew?'<button class="btn btn-sm btn-primary sh-create-top" data-act="sh-create">'+icon("i-check","ic-14")+'Create task</button>'
        :'<button class="icon-btn btn-sm" data-act="task-menu" data-id="'+t.id+'" title="More" aria-label="More options" aria-haspopup="menu">'+icon("i-more","ic-14")+'</button>')+
      '<button class="icon-btn btn-sm" data-act="sheet-close" aria-label="Close">'+icon("i-x","ic-14")+'</button>';

  const bodyHtml=
      (parent?'<button class="sh-crumb" data-act="task" data-id="'+parent.id+'">'+icon("i-chev-l","ic-14")+'<span>Subtask of</span><b>'+esc(parent.title)+'</b></button>':"")+
      '<input class="sh-title" id="shTitle" value="'+esc(t.title)+'" placeholder="What needs doing?" data-act="sh-set" data-k="title">'+

      /* One page of details. The task's history opens from the ⋯ menu in
         its place, with a way back; a Details and Activity tab pair sat
         over every task for something looked at now and then. */
      (s.tab==="activity"?'<div class="sh-histhead"><button class="linkish sh-back" data-act="sh-tab" data-v="details">'+icon("i-chev-l","ic-14")+'Back to details</button>'+
        '<h3>Activity history'+(histCount(t)?'<span class="num">'+histCount(t)+'</span>':"")+'</h3></div>':"")+

      /* Grouped under four small headings rather than one long list, so the
         form reads as when, what, how long, and what it is tied to. */
      (s.tab==="activity"?historyPane(t):'<div class="sh-meta">'+
        group("Schedule",[
          feat("when")?metaRow("Date",sheetDates(t),"i-calendar"):"",
          feat("reminder")?metaRow("Reminder",'<div id="shRemind">'+taskRemindHtml(t)+'</div>',"i-bell"):"",
          feat("created")&&!isNew&&t.created?metaRow("Created",'<span class="mnone">'+esc(fmtDate(t.created))+'</span>',"i-plus"):""])+
        group("Organize",[
          feat("category")?metaRow("Category",sheetCats(t),c.icon):"",
          feat("priority")?metaRow("Priority",sheetPrio(t),"i-flag"):"",
          feat("tags")?metaRow("Tags",sheetTags(t),"i-tag"):""])+
        group("Effort",[
          feat("estimate")?metaRow("Estimate",estField(t),"i-timer"):"",
          feat("timer")?metaRow("Time",sheetTime(t,isNew),"i-clock"):""])+
        group("Fields",cfRows)+
        group("Links and files",[
          feat("links")?metaRow("Linked",sheetLinks(t,isNew),"i-link"):"",
          feat("files")?metaRow("Files",sheetFiles(t,isNew),"i-clip"):""])+
      '</div>'+

      (feat("desc")?'<div class="sh-sec"><label class="sec-label">Description</label>'+
        '<textarea class="inp" id="shDesc" rows="3" placeholder="Any detail worth keeping" data-act="sh-set" data-k="desc">'+esc(t.desc||"")+'</textarea></div>':"")+

      (feat("subtasks")&&!parent?subtasksSection(t,isNew):"")+
      (feat("docs")?docsSection(t,isNew):"")+
      (feat("comments")?commentsPane(t,isNew):""))+

      (isNew?'<p class="sh-create-note mnone">Comments and the timer open up once it’s created.</p>':"");

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

/* ---- document editor ----
   One page that looks like the document as it is written -- headings as
   headings, lists as lists, ticks you can tick -- the way Google Docs or
   Notion work. Underneath it is still Markdown, because that is what goes
   to the vault: htmlToMd() turns the page into it on save and mdToHtml(md,
   "edit") turns it back into the page. The Markdown toggle shows the text
   itself for anyone who would rather write it. Nothing is required -- no
   title, no text -- and closing with changes asks first rather than
   throwing them away. */
const DE={id:null,task:null,dirty:false,full:false,src:false,range:null,hist:[],redo:[]};
const DE_TOOLS=[
  [["h1","H1","Heading 1  (Ctrl+Alt+1)"],["h2","H2","Heading 2  (Ctrl+Alt+2)"],["h3","H3","Heading 3  (Ctrl+Alt+3)"]],
  [["bold","B","Bold  (Ctrl+B)"],["italic","I","Italic  (Ctrl+I)"],["strike","S","Strikethrough  (Ctrl+Shift+X)"],
   ["mark","i-highlight","Highlight  (Ctrl+Shift+H)"],["code","i-code","Inline code  (Ctrl+E)"]],
  [["ul","i-list","Bulleted list  (Ctrl+Shift+8)"],["ol","i-ol","Numbered list  (Ctrl+Shift+7)"],
   ["task","i-checklist","Checklist  (Ctrl+Shift+9)"],["quote","i-quote","Quote  (Ctrl+Shift+.)"]],
  [["link","i-link","Link  (Ctrl+K)"],["image","i-image","Image"],["table","i-table","Table"],
   ["codeblock","i-codeblock","Code block"],["hr","i-hr","Divider"]],
  [["undo","i-undo","Undo  (Ctrl+Z)"],["redo","i-redo","Redo  (Ctrl+Y)"]]];
const docOpen=()=>!!el("dcMd");
function docFootHtml(){
  return '<span class="doc-count" id="dcCount"></span>'+
    (vaultPath()?'<span class="doc-sync">'+icon("i-folder","ic-14")+'Syncs to Obsidian</span>':"")+
    '<div class="spacer" style="flex:1"></div>'+
    '<button class="btn" data-act="close">Cancel</button>'+
    '<button class="btn btn-primary" data-act="doc-save">'+icon("i-check")+'Save</button>';
}
function docModal(id,taskId){
  const d=id?docById(id):null,md=d?d.md:"";
  Object.assign(DE,{id:d?d.id:null,task:taskId||(d?d.task:null),dirty:false,src:!!V.docSrc,range:null,hist:[],redo:[]});
  const tools=DE_TOOLS.map(g=>'<div class="dt-group">'+g.map(t=>
    '<button class="dt-btn" data-act="doc-tool" data-v="'+t[0]+'" title="'+esc(t[2])+'" aria-label="'+esc(t[2].split("  ")[0])+'">'+
      (t[1].indexOf("i-")===0?icon(t[1]):'<span class="dt-'+t[0]+'">'+t[1]+'</span>')+'</button>').join("")+'</div>').join("");
  const full=DE.full?"Exit full screen":"Full screen";
  openModal('<div class="modal doc-modal'+(DE.full?" doc-full":"")+'" role="dialog" aria-modal="true" aria-label="Document">'+
    '<div class="doc-head">'+
      '<span class="doc-ic">'+icon("i-doc")+'</span>'+
      '<input class="doc-title" id="dcTitle" value="'+esc(d?d.title:"")+'" placeholder="Untitled document" aria-label="Title" autocomplete="off" spellcheck="true">'+
      '<button class="doc-srcbtn" data-act="doc-src" aria-pressed="'+DE.src+'" title="Edit the Markdown behind the document">'+icon("i-code","ic-14")+'Markdown</button>'+
      '<button class="icon-btn" data-act="doc-full" aria-label="'+full+'" title="'+full+'">'+icon(DE.full?"i-shrink":"i-expand")+'</button>'+
      (d?'<button class="icon-btn" data-act="doc-del" data-id="'+d.id+'" aria-label="Delete document" title="Delete document">'+icon("i-trash")+'</button>':"")+
      '<button class="icon-btn" data-act="close" aria-label="Close">'+icon("i-x")+'</button>'+
    '</div>'+
    '<div class="doc-tools" id="dcTools" role="toolbar" aria-label="Formatting">'+tools+'</div>'+
    '<div class="doc-body'+(DE.src?" src":"")+'" id="dcBody">'+
      '<div class="doc-page"><div class="doc-rich" id="dcRich" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Document" spellcheck="true" data-ph="Start writing, or type # for a heading and - for a list">'+
        (mdToHtml(md,"edit")||"<p><br></p>")+'</div></div>'+
      '<textarea class="doc-md" id="dcMd" spellcheck="true" aria-label="Markdown" placeholder="Start writing…">'+esc(md)+'</textarea>'+
    '</div>'+
    '<div class="doc-foot" id="dcFoot">'+docFootHtml()+'</div>'+
  '</div>');
  try{document.execCommand("defaultParagraphSeparator",false,"p");}catch(e){}
  richMerge(el("dcRich"));richTidy();docCount();
  if(!d)el("dcTitle").focus();
  else if(DE.src){const ta=el("dcMd");ta.focus();ta.setSelectionRange(0,0);}
  else{const r=el("dcRich");r.focus();const s=getSelection(),rg=document.createRange();rg.setStart(r,0);rg.collapse(true);s.removeAllRanges();s.addRange(rg);}
}
/* The document as Markdown, whichever way it is being edited. */
const docText=()=>DE.src?el("dcMd").value:htmlToMd(el("dcRich"));
function docCount(){
  const c=el("dcCount");if(!c)return;
  const txt=DE.src?el("dcMd").value.replace(/[#>*_~=`|[\]()-]/g," "):el("dcRich").innerText;
  const w=(txt.match(/\S+/g)||[]).length;
  c.textContent=w?w+" word"+(w===1?"":"s")+" · "+Math.max(1,Math.round(w/220))+" min read":"No words yet";
}
function docChanged(){DE.dirty=true;if(!DE.src)richTidy();docCount();}
function docSave(){
  const t=el("dcTitle");if(!docOpen())return;
  saveDoc(DE.id||null,DE.task||null,((t&&t.value)||"").trim()||"Untitled",docText());
  DE.dirty=false;closeModal();renderSheet();renderView();toast("Document saved");
}
/* Anything that would close the editor asks here first. */
function docMayClose(){
  if(!docOpen()||!DE.dirty)return true;
  const f=el("dcFoot");
  if(f)f.innerHTML='<span class="doc-ask">'+icon("i-alert","ic-14")+'You have unsaved changes</span><div class="spacer" style="flex:1"></div>'+
    '<button class="btn btn-ghost btn-danger" data-act="doc-discard">Discard</button>'+
    '<button class="btn" data-act="doc-keep">Keep editing</button>'+
    '<button class="btn btn-primary" data-act="doc-save">'+icon("i-check")+'Save</button>';
  const k=f&&f.querySelector('[data-act="doc-keep"]');if(k)k.focus();
  return false;
}
/* The page and the Markdown are two views of one text: switching carries it
   across. */
function docSrc(){
  const r=el("dcRich"),ta=el("dcMd"),b=el("dcBody");if(!r||!ta)return;
  richAskDone(false);
  if(DE.src){r.innerHTML=mdToHtml(ta.value,"edit")||"<p><br></p>";richMerge(r);DE.hist=[];DE.redo=[];}
  else ta.value=htmlToMd(r);
  DE.src=!DE.src;V.docSrc=DE.src;
  b.classList.toggle("src",DE.src);
  const t=document.querySelector('[data-act="doc-src"]');if(t)t.setAttribute("aria-pressed",String(DE.src));
  richTidy();docCount();
  if(DE.src){ta.focus();ta.setSelectionRange(0,0);ta.scrollTop=0;}else r.focus();
}
function docFull(){
  DE.full=!DE.full;
  const m=document.querySelector(".doc-modal"),b=m&&m.querySelector('[data-act="doc-full"]');
  if(m)m.classList.toggle("doc-full",DE.full);
  if(b){const l=DE.full?"Exit full screen":"Full screen";b.innerHTML=icon(DE.full?"i-shrink":"i-expand");b.title=l;b.setAttribute("aria-label",l);}
}

/* ---- the page ---- */
const RICH_BLOCK="h1,h2,h3,h4,h5,h6,p,blockquote,pre,li,div";
function richIn(n){const r=el("dcRich");return !!(r&&n&&r.contains(n));}
function richAt(sel){
  const s=getSelection();let n=s.rangeCount?s.anchorNode:null;
  if(n&&n.nodeType===3)n=n.parentNode;
  const hit=n&&n.closest?n.closest(sel):null;
  return hit&&richIn(hit)&&hit.id!=="dcRich"?hit:null;
}
/* Put the caret back where it was before a toolbar click or the link bar. */
function richFocus(){
  const r=el("dcRich"),s=getSelection();
  if(s.rangeCount&&richIn(s.anchorNode)&&document.activeElement===r)return;
  r.focus();
  if(DE.range&&richIn(DE.range.startContainer)){s.removeAllRanges();s.addRange(DE.range);}
}
function richKeep(){const s=getSelection();if(s.rangeCount&&richIn(s.anchorNode))DE.range=s.getRangeAt(0).cloneRange();}
function richTidy(){
  const r=el("dcRich");if(!r)return;
  if(!r.firstChild)r.innerHTML="<p><br></p>";
  r.classList.toggle("is-empty",!r.textContent.trim()&&!r.querySelector("img,hr,table,li"));
  r.querySelectorAll("li:not(.md-task).done").forEach(li=>li.classList.remove("done"));
}
/* Highlight and inline code have no command of their own: wrap the
   selection with insertHTML, which keeps Ctrl+Z working, or unwrap. */
function richWrap(tag,ph){
  const hit=richAt(tag),s=getSelection();
  if(hit){const rg=document.createRange();rg.selectNode(hit);s.removeAllRanges();s.addRange(rg);
    document.execCommand("insertHTML",false,hit.innerHTML||"&#8203;");return;}
  if(!s.rangeCount)return;
  const box=document.createElement("div");box.appendChild(s.getRangeAt(0).cloneContents());
  const inner=tag==="code"?esc(box.textContent||ph):(box.innerHTML||esc(ph));
  document.execCommand("insertHTML",false,"<"+tag+">"+inner+"</"+tag+">&#8203;");
}
/* ---- lines: headings, quotes, code, lists ----
   The browser's own list and block commands nest lists inside paragraphs
   and cannot turn a list back into text, so the page does these itself:
   the lines the selection touches are rebuilt as the chosen kind, or back
   into paragraphs if they already are it. The caret rides along on two
   marker spans. Each change is kept, so Undo can take it back. */
const RICH_KIND={H1:"h1",H2:"h2",H3:"h3",H4:"h4",H5:"h5",H6:"h6",BLOCKQUOTE:"quote",PRE:"pre"};
const RICH_TAG={p:"P",h1:"H1",h2:"H2",h3:"H3",quote:"BLOCKQUOTE",pre:"PRE"};
const isList=n=>!!n&&(n.tagName==="UL"||n.tagName==="OL");
function richKind(n){
  if(n.tagName==="LI")return n.parentNode.tagName==="OL"?"ol":n.classList.contains("md-task")?"task":"ul";
  return RICH_KIND[n.tagName]||"p";
}
/* Change the page with the caret kept and the change remembered. */
function richMutate(fn){
  const r=el("dcRich"),s=getSelection();
  if(!r||!s.rangeCount||!(richIn(s.anchorNode)||s.anchorNode===r))return false;
  const before=r.innerHTML,rg=s.getRangeAt(0);
  const mk=t=>{const m=document.createElement("span");m.setAttribute("data-caret",t);return m;};
  const e=rg.cloneRange();e.collapse(false);e.insertNode(mk("e"));
  const b=rg.cloneRange();b.collapse(true);b.insertNode(mk("s"));
  const sm=r.querySelector('[data-caret="s"]'),em=r.querySelector('[data-caret="e"]');
  /* A caret between lines rather than in one belongs to the line before. */
  [sm,em].forEach(m=>{
    if(m.parentNode!==r)return;
    let host=m.previousElementSibling;
    while(host&&host.hasAttribute("data-caret"))host=host.previousElementSibling;
    if(!host||/^(TABLE|HR|UL|OL)$/.test(host.tagName)){host=document.createElement("p");r.insertBefore(host,m);}
    const last=host.lastChild;
    if(last&&last.nodeName==="BR")host.insertBefore(m,last);else host.appendChild(m);
  });
  const span=document.createRange();span.setStartBefore(sm);span.setEndAfter(em);
  const changed=fn(r,span)!==false;
  const put=m=>{const p=m.parentNode,i=[...p.childNodes].indexOf(m);m.remove();return [p,i];};
  const a1=put(sm),a2=put(em);
  if(!changed){r.innerHTML=before;richFocus();return false;}
  const nr=document.createRange();
  try{nr.setStart(a1[0],a1[1]);nr.setEnd(a2[0],a2[1]);}catch(x){nr.selectNodeContents(r);nr.collapse(false);}
  s.removeAllRanges();s.addRange(nr);
  DE.hist.push({before:before,after:r.innerHTML});DE.redo=[];
  if(DE.hist.length>80)DE.hist.shift();
  docChanged();
  return true;
}
/* The lines a range touches: top-level blocks, and list items whose own
   text (not only their sub-list) is touched. */
function richLines(r,span){
  const out=[];
  const walkList=L=>[...L.children].forEach(li=>{
    if(li.tagName!=="LI"||!span.intersectsNode(li))return;
    const own=[...li.childNodes].filter(c=>!isList(c));
    if(!own.length||own.some(c=>span.intersectsNode(c)))out.push(li);
    [...li.children].filter(isList).forEach(walkList);
  });
  [...r.children].forEach(b=>{
    if(!span.intersectsNode(b))return;
    if(isList(b))walkList(b);
    else if(!/^(TABLE|HR)$/.test(b.tagName)&&!b.classList.contains("md-table")&&!b.hasAttribute("data-caret"))out.push(b);
  });
  return out;
}
/* What a line says, lifted out: its inline content, without sub-lists. */
function richInner(n){
  const f=document.createDocumentFragment();
  let src=n;
  if(n.tagName==="PRE"&&n.firstElementChild&&n.firstElementChild.tagName==="CODE"&&n.childNodes.length===1)src=n.firstElementChild;
  const blocks=[...src.childNodes].filter(c=>c.nodeType===1&&/^(P|DIV|H[1-6])$/.test(c.tagName));
  [...src.childNodes].forEach(c=>{
    if(isList(c))return;
    if(blocks.indexOf(c)>-1){
      if(f.childNodes.length)f.appendChild(document.createElement("br"));
      while(c.firstChild)f.appendChild(c.firstChild);
      return;
    }
    f.appendChild(c);
  });
  if(n.tagName==="PRE")[...f.childNodes].forEach(c=>{
    if(c.nodeType!==3||c.nodeValue.indexOf("\n")<0)return;
    c.nodeValue.replace(/\n$/,"").split("\n").forEach((part,i)=>{
      if(i)f.insertBefore(document.createElement("br"),c);
      f.insertBefore(document.createTextNode(part),c);
    });
    c.remove();
  });
  return f;
}
/* Nothing written in it; bare: not even a line break to give it height. */
const richEmpty=b=>!b.textContent.replace(/\u200b/g,"")&&!b.querySelector("img");
const richBare=b=>richEmpty(b)&&!b.querySelector("br");
function richBuild(lines,to){
  const out=[];let list=null;
  lines.forEach(n=>{
    const subs=n.tagName==="LI"?[...n.children].filter(isList):[];
    const inner=richInner(n);
    if(to==="ul"||to==="ol"||to==="task"){
      const tag=to==="ol"?"OL":"UL";
      if(!list||list.tagName!==tag){list=document.createElement(tag);out.push(list);}
      const li=document.createElement("li");
      if(to==="task")li.className="md-task"+(n.classList.contains("done")&&n.classList.contains("md-task")?" done":"");
      li.appendChild(inner);
      if(richBare(li))li.appendChild(document.createElement("br"));
      subs.forEach(x=>li.appendChild(x));
      list.appendChild(li);
      return;
    }
    list=null;
    const b=document.createElement(RICH_TAG[to]||"P");
    b.appendChild(inner);
    if(to==="pre")b.querySelectorAll("br").forEach(x=>x.replaceWith(document.createTextNode("\n")));
    if(richBare(b))b.appendChild(document.createElement("br"));
    out.push(b);
    subs.forEach(x=>out.push(x));
  });
  return out;
}
/* Neighbouring lists of the same kind become one, as they would in the
   Markdown anyway, and a paragraph holding blocks is taken apart. */
function richMerge(r){
  r.querySelectorAll("p").forEach(p=>{
    if(![...p.children].some(c=>/^(UL|OL|P|DIV|H[1-6]|BLOCKQUOTE|PRE|TABLE|HR)$/.test(c.tagName)))return;
    while(p.firstChild)p.parentNode.insertBefore(p.firstChild,p);
    p.remove();
  });
  [...r.querySelectorAll("ul,ol")].forEach(L=>{
    /* Anything left loose in a list goes into the item before it. */
    [...L.childNodes].forEach(c=>{
      if(c.nodeType===1&&(c.tagName==="LI"||isList(c)))return;
      if(c.nodeType===3&&!c.nodeValue.trim()){c.remove();return;}
      let li=c.previousElementSibling;
      while(li&&li.tagName!=="LI")li=li.previousElementSibling;
      if(!li){li=document.createElement("li");L.insertBefore(li,c);}
      li.appendChild(c);
    });
    const nx=L.nextElementSibling;
    if(nx&&nx.tagName===L.tagName&&L.parentNode){while(nx.firstChild)L.appendChild(nx.firstChild);nx.remove();}
  });
  [...r.childNodes].forEach(c=>{
    if(c.nodeType===3&&c.nodeValue.trim()||c.nodeType===1&&/^(B|I|S|STRONG|EM|MARK|CODE|A|SPAN|IMG|BR)$/.test(c.tagName)&&!c.hasAttribute("data-caret")){
      const p=document.createElement("p");r.insertBefore(p,c);p.appendChild(c);
      while(p.nextSibling&&(p.nextSibling.nodeType===3||/^(B|I|S|STRONG|EM|MARK|CODE|A|SPAN|IMG)$/.test(p.nextSibling.tagName)))p.appendChild(p.nextSibling);
    }
  });
}
/* Turn the touched lines into a kind, or back to text if they already are
   it. force: always that kind (Enter out of a heading). */
function richConvert(kind,force){
  return richMutate((r,span)=>{
    const lines=richLines(r,span);
    if(!lines.length)return false;
    const to=!force&&lines.every(l=>richKind(l)===kind)?"p":kind;
    const groups=[];
    lines.forEach(l=>{
      const top=l.tagName==="LI"?l.parentNode:l;
      let g=groups.find(x=>x.top===top);
      if(!g){g={top:top,lines:[]};groups.push(g);}
      g.lines.push(l);
    });
    groups.forEach(g=>{
      const top=g.top,made=[];
      if(isList(top)){
        const items=[...top.children],a=items.indexOf(g.lines[0]),z=items.indexOf(g.lines[g.lines.length-1]);
        const keep=part=>{const L=document.createElement(top.tagName);part.forEach(i=>L.appendChild(i));return L;};
        const pre=items.slice(0,a),mid=items.slice(a,z+1).filter(i=>g.lines.indexOf(i)>-1||i.tagName==="LI"),post=items.slice(z+1);
        if(pre.length)made.push(keep(pre));
        made.push.apply(made,richBuild(mid,to));
        if(post.length)made.push(keep(post));
      }else made.push.apply(made,richBuild([top],to));
      made.forEach(m=>top.parentNode.insertBefore(m,top));
      top.remove();
    });
    richMerge(r);
  });
}
/* Tab and Shift+Tab on a list item: in under the item above, or back out. */
function richIndent(out){
  return richMutate(()=>{
    const li=richAt("li");if(!li)return false;
    const list=li.parentNode;
    if(!out){
      const prev=li.previousElementSibling;if(!prev)return false;
      let sub=[...prev.children].reverse().find(isList);
      if(!sub||sub.tagName!==list.tagName){sub=document.createElement(list.tagName);prev.appendChild(sub);}
      sub.appendChild(li);
      return true;
    }
    const host=list.parentNode;
    if(!host||host.tagName!=="LI")return false;
    const after=[...list.children].slice([...list.children].indexOf(li)+1);
    if(after.length){const sub=document.createElement(list.tagName);after.forEach(x=>sub.appendChild(x));li.appendChild(sub);}
    host.parentNode.insertBefore(li,host.nextSibling);
    if(!list.children.length)list.remove();
    return true;
  });
}
/* Undo and Redo take back the page's own changes first; typing is the
   browser's to undo. */
function richUndo(redo){
  const r=el("dcRich"),from=redo?DE.redo:DE.hist,to=redo?DE.hist:DE.redo,top=from[from.length-1];
  if(top&&r.innerHTML===(redo?top.before:top.after)){
    from.pop();to.push(top);
    r.innerHTML=redo?top.after:top.before;
    r.focus();
    const s=getSelection(),rg=document.createRange(),end=r.lastElementChild||r;
    rg.selectNodeContents(end.tagName==="UL"||end.tagName==="OL"?end.lastElementChild||end:end);rg.collapse(false);
    s.removeAllRanges();s.addRange(rg);
    docChanged();return;
  }
  richFocus();
  try{document.execCommand(redo?"redo":"undo");}catch(x){}
  docChanged();
}
/* A divider in place of the line the caret is on, and a fresh line after. */
function richRule(){
  return richMutate((r,span)=>{
    const lines=richLines(r,span),at=lines[0];
    const hr=document.createElement("hr"),p=document.createElement("p");
    const top=at?(at.tagName==="LI"?null:at):null;
    if(top&&richEmpty(top)){
      top.parentNode.insertBefore(hr,top);
      top.parentNode.insertBefore(p,top);
      while(top.firstChild)p.appendChild(top.firstChild);
      top.remove();
    }else{
      const anchor=top||[...r.children].find(c=>span.intersectsNode(c))||r.lastChild;
      anchor.parentNode.insertBefore(hr,anchor.nextSibling);
      hr.parentNode.insertBefore(p,hr.nextSibling);
      p.appendChild(r.querySelector('[data-caret="s"]'));
      p.appendChild(r.querySelector('[data-caret="e"]'));
    }
    if(!p.querySelector("br"))p.appendChild(document.createElement("br"));
  });
}
/* Links and images ask for their address in a bar under the toolbar, not a
   browser prompt, which the artifact sandbox blocks. */
function richAsk(kind){
  richKeep();
  const old=el("dcUrlBar");if(old)old.remove();
  const s=getSelection(),empty=!s.rangeCount||s.isCollapsed;
  el("dcTools").insertAdjacentHTML("afterend",'<div class="doc-urlbar" id="dcUrlBar">'+icon(kind==="image"?"i-image":"i-link","ic-14")+
    '<input class="inp" id="dcUrl" data-kind="'+kind+'" autocomplete="off" spellcheck="false" placeholder="'+(kind==="image"?"Paste the address of an image":"Paste or type a web address")+'">'+
    (kind==="link"&&empty?'<input class="inp" id="dcUrlText" autocomplete="off" placeholder="Text to show (optional)">':"")+
    '<button class="btn btn-sm btn-primary" data-act="doc-url-ok">'+(kind==="image"?"Add image":"Add link")+'</button>'+
    '<button class="btn btn-sm btn-ghost" data-act="doc-url-cancel">Cancel</button></div>');
  el("dcUrl").focus();
}
function richAskDone(ok){
  const bar=el("dcUrlBar");if(!bar)return;
  const inp=el("dcUrl"),u=inp.value.trim(),kind=inp.dataset.kind,tx=el("dcUrlText"),label=tx?tx.value.trim():"";
  bar.remove();
  if(DE.src)return;
  richFocus();
  if(!ok||!u)return;
  let url=u;
  if(!/^(https?:|mailto:|data:image\/)/i.test(url))url=(kind==="link"&&/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(url)?"mailto:":"https://")+url;
  const s=getSelection();
  if(kind==="image"){document.execCommand("insertHTML",false,'<img src="'+esc(url)+'" alt="">');richMerge(el("dcRich"));}
  else if(!s.rangeCount||s.isCollapsed)document.execCommand("insertHTML",false,'<a href="'+esc(url)+'">'+esc(label||u)+'</a>&nbsp;');
  else document.execCommand("createLink",false,url);
  docChanged();
}
function richTool(k){
  if(k==="link"||k==="image"){richFocus();richAsk(k);return;}
  richFocus();
  const X=(c,v)=>document.execCommand(c,false,v==null?null:v);
  switch(k){
    case "bold":X("bold");break;
    case "italic":X("italic");break;
    case "strike":X("strikeThrough");break;
    case "mark":richWrap("mark","highlighted text");break;
    case "code":richWrap("code","code");break;
    case "h1":case "h2":case "h3":case "ul":case "ol":case "task":case "quote":richConvert(k);break;
    case "codeblock":richConvert("pre");break;
    case "hr":richRule();break;
    case "table":{const c=n=>'<'+n+'>'+(n==="th"?"Column":"<br>")+'</'+n+'>';
      X("insertHTML",'<table data-new="1"><thead><tr>'+c("th")+c("th")+c("th")+'</tr></thead><tbody><tr>'+c("td")+c("td")+c("td")+'</tr><tr>'+c("td")+c("td")+c("td")+'</tr></tbody></table><p><br></p>');
      const t=el("dcRich").querySelector("table[data-new]");
      if(t){t.removeAttribute("data-new");richMerge(el("dcRich"));const rg=document.createRange();rg.selectNodeContents(t.querySelector("th"));const s=getSelection();s.removeAllRanges();s.addRange(rg);}
      break;}
    case "undo":case "redo":richUndo(k==="redo");return;
  }
  docChanged();
}
function docTool(k){if(!docOpen())return;if(DE.src)srcTool(k);else richTool(k);}
/* Typing Markdown at the start of a line formats it, as Notion does:
   "# " a heading, "- " a list, "1. " a numbered one, "[] " a checklist,
   "> " a quote, "``` " code, "--- " a divider. */
function richAuto(e){
  if(e.inputType!=="insertText"||(e.data!=null&&e.data!==" "))return;
  /* After the keystroke has landed: a formatting command run inside the
     input event of another is ignored. */
  setTimeout(richAutoNow,0);
}
function richAutoNow(){
  if(!docOpen()||DE.src)return;
  const b=richAt(RICH_BLOCK);if(!b||!/^(P|DIV)$/.test(b.tagName))return;
  const s=getSelection();if(!s.rangeCount||!s.isCollapsed)return;
  const rg=document.createRange();rg.setStart(b,0);rg.setEnd(s.anchorNode,s.anchorOffset);
  const typed=rg.toString().replace(/\u00a0/g," ");
  const m=typed.match(/^(#{1,6}|[-*+]|1[.)]|>|\[ ?\]|```|---) $/);if(!m)return;
  s.removeAllRanges();s.addRange(rg);document.execCommand("delete");
  const k=m[1];
  if(k==="---"){richRule();return;}
  richConvert(k[0]==="#"?"h"+Math.min(k.length,3):/^[-*+]$/.test(k)?"ul":/^1/.test(k)?"ol":k===">"?"quote":k==="```"?"pre":"task",true);
}
/* A tick box is drawn before a checklist item; a click there ticks it. */
function richTick(e){
  const li=e.target&&e.target.closest?e.target.closest("#dcRich li.md-task"):null;if(!li)return false;
  const x=e.clientX-li.getBoundingClientRect().left;
  if(x<0||x>24)return false;
  e.preventDefault();
  if(e.type==="click"){li.classList.toggle("done");docChanged();}
  return true;
}
/* Pasted text comes in as the planner's own formatting: other pages' styles,
   fonts and colours are left behind, and pasted Markdown is formatted. An
   image on the clipboard goes in as a picture. */
function richPaste(e){
  const cd=e.clipboardData;if(!cd)return;
  e.preventDefault();
  const img=[...(cd.files||[])].find(f=>/^image\//.test(f.type));
  if(img){
    if(img.size>4*1024*1024){toast("That image is too large to paste. Link to it instead.");return;}
    const fr=new FileReader();
    fr.onload=()=>{richFocus();document.execCommand("insertHTML",false,'<img src="'+esc(fr.result)+'" alt="">');docChanged();};
    fr.readAsDataURL(img);return;
  }
  const h=cd.getData("text/html"),t=cd.getData("text/plain");
  let md=t;
  if(h){try{md=htmlToMd(new DOMParser().parseFromString(h,"text/html").body);}catch(x){md=t;}}
  if(!md)return;
  if(!/\n/.test(md)&&!h)document.execCommand("insertText",false,md);
  else document.execCommand("insertHTML",false,mdToHtml(md,"edit"));
  richMerge(el("dcRich"));
  docChanged();
}

/* The page back to Markdown. Only what Markdown can say is kept; styles and
   colours from pasted pages are dropped. */
function htmlToMd(root){
  const wrap=(m,x)=>{const c=x.trim();if(!c)return x;return x.match(/^\s*/)[0]+m+c+m+x.match(/\s*$/)[0];};
  const inl=n=>{
    if(n.nodeType===3)return n.nodeValue.replace(/\u200b/g,"").replace(/\u00a0/g," ").replace(/\s*\n\s*/g," ");
    if(n.nodeType!==1)return "";
    const kids=()=>[...n.childNodes].map(inl).join("");
    switch(n.tagName){
      case "BR":return "\n";
      case "B":case "STRONG":return wrap("**",kids());
      case "I":case "EM":return wrap("*",kids());
      case "S":case "STRIKE":case "DEL":return wrap("~~",kids());
      case "MARK":return wrap("==",kids());
      case "CODE":{const c=n.textContent.replace(/\u200b/g,"");return c?"`"+c+"`":"";}
      case "A":{const h=n.getAttribute("href")||"",x=kids();return /^(https?:|mailto:)/i.test(h)&&x.trim()?"["+x.trim()+"]("+h+")":x;}
      case "IMG":{const s=n.getAttribute("src")||"";return /^(https?:|data:image\/)/i.test(s)?"!["+(n.getAttribute("alt")||"")+"]("+s+")":"";}
      case "SCRIPT":case "STYLE":case "TEMPLATE":return "";
      case "SPAN":{
        if(n.classList.contains("md-wiki"))return "[["+n.textContent+"]]";
        let x=kids();const st=n.style;
        if(st.fontWeight==="bold"||+st.fontWeight>=600)x=wrap("**",x);
        if(st.fontStyle==="italic")x=wrap("*",x);
        if(/line-through/.test(st.textDecoration||""))x=wrap("~~",x);
        return x;
      }
      default:return kids();
    }
  };
  const BLOCK=/^(H[1-6]|P|DIV|UL|OL|BLOCKQUOTE|PRE|HR|TABLE|SECTION|ARTICLE|HEADER|FOOTER|MAIN|FIGURE|LI)$/;
  const out=[],lists=new Set();let buf="";
  const flush=()=>{const x=buf.replace(/^\n+|\n+$/g,"");if(x.trim())out.push(x);buf="";};
  const list=(ul,depth,lines)=>{
    let k=(parseInt(ul.getAttribute&&ul.getAttribute("start"),10)||1)-1;
    [...ul.children].forEach(li=>{
      if(li.tagName==="UL"||li.tagName==="OL"){list(li,depth+1,lines);return;}
      if(li.tagName!=="LI")return;
      k++;
      const subs=[...li.children].filter(c=>c.tagName==="UL"||c.tagName==="OL");
      const own=[...li.childNodes].filter(c=>subs.indexOf(c)<0).map(inl).join("").replace(/\s*\n\s*/g," ").trim();
      const lv=depth+(parseInt(li.style.getPropertyValue("--lv"),10)||0);
      const mark=ul.tagName==="OL"?k+". ":li.classList.contains("md-task")?"- ["+(li.classList.contains("done")?"x":" ")+"] ":"- ";
      lines.push("  ".repeat(lv)+mark+own);
      subs.forEach(sb=>list(sb,depth+1,lines));
    });
  };
  const walk=parent=>{
    [...parent.childNodes].forEach(n=>{
      if(n.nodeType!==1||!BLOCK.test(n.tagName)){buf+=inl(n);return;}
      flush();
      const t=n.tagName;
      if(/^H[1-6]$/.test(t)){const x=inl(n).replace(/\s*\n\s*/g," ").trim();if(x)out.push("#".repeat(+t[1])+" "+x);}
      else if(t==="UL"||t==="OL"){
        const lines=[];list(n,0,lines);
        if(!lines.length)return;
        /* A list indented under the one before it, or the rest of that list
           after one, is the same list in Markdown: no blank line between. */
        const prev=lists.has(out.length-1)?out[out.length-1]:null;
        if(prev!=null&&(/^\s/.test(lines[0])||/(^|\n)\s+\S[^\n]*$/.test(prev)))out[out.length-1]=prev+"\n"+lines.join("\n");
        else{out.push(lines.join("\n"));lists.add(out.length-1);}
      }
      else if(t==="LI"){const lines=[];list({tagName:"UL",children:[n]},0,lines);out.push(lines.join("\n"));}
      else if(t==="BLOCKQUOTE"){const x=[...n.children].some(c=>BLOCK.test(c.tagName))?htmlToMd(n):inl(n).trim();
        if(x.trim())out.push(x.split("\n").map(l=>"> "+l).join("\n"));}
      else if(t==="PRE")out.push("```\n"+n.textContent.replace(/\u200b/g,"").replace(/\n$/,"")+"\n```");
      else if(t==="HR")out.push("---");
      else if(t==="TABLE"){
        const rows=[...n.querySelectorAll("tr")].map(tr=>[...tr.children].map(c=>inl(c).replace(/\s*\n\s*/g," ").trim().replace(/\|/g,"\\|")));
        if(rows.length){
          const w=Math.max(...rows.map(r=>r.length)),line=r=>"| "+Array.from({length:w},(_,i)=>r[i]||"").join(" | ")+" |";
          out.push([line(rows[0]),"| "+Array(w).fill("---").join(" | ")+" |"].concat(rows.slice(1).map(line)).join("\n"));
        }
      }
      else walk(n);
      flush();
    });
  };
  walk(root);flush();
  return out.join("\n\n").replace(/\n{3,}/g,"\n\n").trim()+(out.length?"\n":"");
}

/* ---- editing the text ---- */
function deReplace(ta,s,e,text,selS,selE){
  ta.focus();ta.setSelectionRange(s,e);
  let ok=false;
  try{ok=text===""?(s===e||document.execCommand("delete")):document.execCommand("insertText",false,text);}catch(x){ok=false;}
  if(!ok||ta.value.slice(s,s+text.length)!==text)ta.setRangeText(text,s,e,"end");
  ta.setSelectionRange(s+selS,s+selE);
  docChanged();
}
function deWrap(a,b,ph){
  const ta=el("dcMd"),v=ta.value,s=ta.selectionStart,e=ta.selectionEnd,sel=v.slice(s,e);
  if(v.slice(s-a.length,s)===a&&v.slice(e,e+b.length)===b){deReplace(ta,s-a.length,e+b.length,sel,0,sel.length);return;}
  if(sel.length>=a.length+b.length&&sel.indexOf(a)===0&&sel.slice(-b.length)===b){
    const inner=sel.slice(a.length,sel.length-b.length);deReplace(ta,s,e,inner,0,inner.length);return;
  }
  const blank=!sel.trim(),lead=blank?"":sel.match(/^\s*/)[0],trail=blank?"":sel.match(/\s*$/)[0];
  const core=blank?ph:sel.trim();
  deReplace(ta,s,e,(blank?sel:"")+lead+a+core+b+trail,(blank?sel.length:0)+lead.length+a.length,(blank?sel.length:0)+lead.length+a.length+core.length);
}
/* The lines the selection touches, whole. */
function deSpan(ta){
  const v=ta.value,a=ta.selectionStart;let b=ta.selectionEnd;
  if(b>a&&v[b-1]==="\n")b--;
  const s=v.lastIndexOf("\n",a-1)+1;let e=v.indexOf("\n",b);if(e<0)e=v.length;
  return {s:s,e:e,lines:v.slice(s,e).split("\n")};
}
const DE_PREFIX=/^(\s*)(#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)?/;
function deLines(kind){
  const ta=el("dcMd"),sp=deSpan(ta),lines=sp.lines;
  const want={h1:"# ",h2:"## ",h3:"### ",quote:"> ",ul:"- ",task:"- [ ] ",ol:"1. "}[kind];
  const has=l=>{const p=(l.match(DE_PREFIX)[2]||"");
    if(kind==="ol")return /^\d+[.)]\s/.test(p);
    if(kind==="task")return /\[[ xX]\]/.test(p);
    if(kind==="ul")return /^[-*+]\s+$/.test(p);
    return p.trim()===want.trim();};
  const full=lines.filter(l=>l.trim());
  const off=full.length>0&&full.every(has);
  let n=0;
  const text=lines.map(l=>{
    if(!l.trim()&&lines.length>1)return l;
    const m=l.match(DE_PREFIX),rest=l.slice(m[0].length);
    if(off)return m[1]+rest;
    n++;return m[1]+(kind==="ol"?n+". ":want)+rest;
  }).join("\n");
  if(lines.length===1)deReplace(ta,sp.s,sp.e,text,text.length,text.length);
  else deReplace(ta,sp.s,sp.e,text,0,text.length);
}
/* A block on lines of its own, with a blank line either side. */
function deBlock(text,a,b){
  const ta=el("dcMd"),v=ta.value,s=ta.selectionStart,e=ta.selectionEnd;
  const before=v.slice(0,s),after=v.slice(e);
  const pre=!before||/\n\n$/.test(before)?"":/\n$/.test(before)?"\n":"\n\n";
  /* At the very end, a line to carry on writing on. */
  const post=!after?"\n":/^\n\n/.test(after)?"":/^\n/.test(after)?"\n":"\n\n";
  deReplace(ta,s,e,pre+text+post,pre.length+a,pre.length+b);
}
function deIndent(out){
  const ta=el("dcMd"),a=ta.selectionStart,b=ta.selectionEnd,sp=deSpan(ta);
  let first=0;
  const text=sp.lines.map((l,k)=>{
    if(out){const cut=(l.match(/^ {1,2}|^\t/)||[""])[0].length;if(!k)first=-cut;return l.slice(cut);}
    if(!k)first=2;return "  "+l;
  }).join("\n");
  if(a===b)deReplace(ta,sp.s,sp.e,text,Math.max(0,a-sp.s+first),Math.max(0,a-sp.s+first));
  else deReplace(ta,sp.s,sp.e,text,0,text.length);
}
/* The same toolbar, writing Markdown into the text. */
function srcTool(k){
  const ta=el("dcMd");if(!ta)return;
  const v=ta.value,s=ta.selectionStart,e=ta.selectionEnd,sel=v.slice(s,e);
  switch(k){
    case "bold":deWrap("**","**","bold text");break;
    case "italic":deWrap("*","*","italic text");break;
    case "strike":deWrap("~~","~~","struck text");break;
    case "mark":deWrap("==","==","highlighted text");break;
    case "code":deWrap("`","`","code");break;
    case "h1":case "h2":case "h3":case "ul":case "ol":case "task":case "quote":deLines(k);break;
    case "link":
      if(/^(https?:\/\/|mailto:)\S+$/.test(sel)){const t="[link text]("+sel+")";deReplace(ta,s,e,t,1,10);}
      else{const label=sel||"link text",t="["+label+"](https://)";deReplace(ta,s,e,t,label.length+3,label.length+11);}
      break;
    case "image":{const alt=sel||"description",t="!["+alt+"](https://)";deReplace(ta,s,e,t,alt.length+4,alt.length+12);break;}
    case "table":deBlock("| Column | Column | Column |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |",2,8);break;
    case "codeblock":deBlock("```\n"+sel+"\n```",4,4+sel.length);break;
    case "hr":deBlock("---",4,4);break;
    case "undo":case "redo":ta.focus();try{document.execCommand(k);}catch(x){}docChanged();break;
  }
}
/* Keys in the editor: the usual shortcuts, and Tab to indent a list or move
   along a table. Escape still closes, so the keyboard is never trapped. */
function docKeys(e){
  const t=e.target,mod=e.ctrlKey||e.metaKey,key=(e.key||"").toLowerCase();
  if(t.id==="dcUrl"||t.id==="dcUrlText"){
    if(e.key==="Enter"){e.preventDefault();richAskDone(true);return true;}
    if(e.key==="Escape"){e.preventDefault();richAskDone(false);return true;}
    return false;
  }
  const inDoc=t.id==="dcMd"||t.id==="dcTitle"||richIn(t)||t.id==="dcRich";
  if(!inDoc)return false;
  if(mod&&!e.altKey&&(key==="s"||key==="enter")){e.preventDefault();docSave();return true;}
  if(t.id==="dcTitle"){
    if(e.key==="Enter"||(e.key==="ArrowDown"&&!mod)){e.preventDefault();const f=DE.src?el("dcMd"):el("dcRich");if(f)f.focus();return true;}
    return false;
  }
  const map=mod&&!e.altKey&&!e.shiftKey?{b:"bold",i:"italic",e:"code",k:"link"}[key]
    :mod&&e.shiftKey&&!e.altKey?{x:"strike",h:"mark","8":"ul","*":"ul","7":"ol","&":"ol","9":"task","(":"task",".":"quote",">":"quote"}[key]
    :mod&&e.altKey?{"1":"h1","2":"h2","3":"h3"}[key]:null;
  if(map){e.preventDefault();docTool(map);return true;}
  if(DE.src){
    if(e.key==="Tab"&&!mod&&!e.altKey){e.preventDefault();deIndent(e.shiftKey);return true;}
    if(e.key==="Enter"&&!e.shiftKey&&!mod&&!e.altKey&&t.selectionStart===t.selectionEnd){
      const v=t.value,s=t.selectionStart,ls=v.lastIndexOf("\n",s-1)+1,line=v.slice(ls,s);
      const m=line.match(/^(\s*)([-*+]\s+\[[ xX]\]\s+|[-*+]\s+|(\d+)([.)])\s+|>\s?)/);
      if(!m)return false;
      e.preventDefault();
      let le=v.indexOf("\n",s);if(le<0)le=v.length;
      if(!line.slice(m[0].length).trim()&&!v.slice(s,le).trim()){deReplace(t,ls,le,"",0,0);return true;}
      let p=m[2];
      if(m[3])p=(+m[3]+1)+m[4]+" ";else p=p.replace(/\[[xX]\]/,"[ ]");
      const ins="\n"+m[1]+p;
      deReplace(t,s,s,ins,ins.length,ins.length);
      return true;
    }
    return false;
  }
  if(e.key==="Tab"&&!mod&&!e.altKey){
    const cell=richAt("td,th");
    if(cell){
      e.preventDefault();
      const all=[...cell.closest("table").querySelectorAll("th,td")],i=all.indexOf(cell);
      const next=all[i+(e.shiftKey?-1:1)];
      if(next){const rg=document.createRange();rg.selectNodeContents(next);const s=getSelection();s.removeAllRanges();s.addRange(rg);}
      return true;
    }
    if(richAt("li")){e.preventDefault();richIndent(e.shiftKey);return true;}
    return false;
  }
  if(mod&&!e.altKey&&(key==="z"||key==="y")){e.preventDefault();richUndo(key==="y"||e.shiftKey);return true;}
  /* Enter on an empty list item or quote steps out of it; a new item after a
     ticked one starts unticked; the line after a heading is plain text. */
  if(e.key==="Enter"&&!e.shiftKey&&!mod){
    const li=richAt("li"),q=richAt("blockquote,pre");
    if(li&&!li.textContent.replace(/\u200b/g,"").trim()&&![...li.children].some(isList)){e.preventDefault();richConvert(richKind(li));return true;}
    if(q&&q.tagName==="BLOCKQUOTE"&&!q.textContent.replace(/\u200b/g,"").trim()){e.preventDefault();richConvert("quote");return true;}
    const h=richAt("h1,h2,h3,h4,h5,h6");
    setTimeout(()=>{
      const b=richAt(RICH_BLOCK);if(!b)return;
      if(h&&/^H[1-6]$/.test(b.tagName)&&b!==h&&!b.textContent.trim())richConvert("p",true);
      if(b.tagName==="LI"&&b.classList.contains("done")&&!b.textContent.trim())b.classList.remove("done");
      if(b.tagName==="DIV"&&b.parentNode&&b.parentNode.id==="dcRich")richConvert("p",true);
    },0);
  }
  return false;
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
/* A task with a start time is reminded a while before it starts. One
   without -- no start, all day, or the Start row switched off in Customize
   -- is reminded on a day and at a time of its own (`remindAt`, "YYYY-MM-DD
   HH:MM"), which a timed task can choose too. */
function taskRemindHtml(t){
  const rel=!!(tTimeDay(t)&&t.dueTime),at=t.remindAt||"",d=at.slice(0,10),tm=at.slice(11)||"09:00";
  if(rel&&!at)return '<select class="inp inp-sm" data-act="sh-set" data-k="remind" aria-label="Reminder">'+remindOptions(t)+
    '<option value="at">On a day and time I choose…</option></select>';
  return '<div class="rm-at">'+dateField('data-act="sh-set" data-k="remindDate"',d,{sm:1,label:"Reminder day",ph:"Pick a day",cls:"when-date"})+
    (d?timeField('data-act="sh-set" data-k="remindTime"',tm,{sm:1,label:"Reminder time",req:1,cls:"when-time"}):"")+
    (rel?'<button type="button" class="linkish" data-act="sh-remind-rel">Before it starts instead</button>':"")+'</div>';
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
    if(isOpen(t)&&t.remindAt){
      const fire=at(t.remindAt.slice(0,10),t.remindAt.slice(11)||"09:00");if(!keep(fire))return;
      out.push({id:"ta:"+t.id+":"+t.remindAt,at:fire,title:t.title,
        body:cat(t.cat).name,
        open:{kind:"task",id:t.id}});
      return;
    }
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
  /* The notification is the answer; a "Test sent" note on the page as well
     arrived at another moment and read as a second notification. */
  if(o&&o.testReminder){o.testReminder(msg);return;}
  if(typeof Notification==="undefined"){toast("This browser cannot show notifications");return;}
  if(Notification.permission!=="granted"){toast(Notification.permission==="denied"?"Your browser is blocking reminders. The steps to allow them are just below.":"Press Allow notifications first");return;}
  try{new Notification(msg.title,{body:msg.body});}catch(e){toast("The browser would not show it");}
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
  if(hasGoogle()||(wgOrigin()&&!desktop()))return "Signing in with Google isn’t switched on for this copy of Ember yet.";
  if(window.claude)return "This copy of Ember can’t sign in with Google.";
  return "Opened straight from a file, Ember can’t sign in with Google.";
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
  const ev={summary:(isDoneT(t)?"✓ ":"")+t.title,
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
      if(t.due&&!t.parent&&t.status!=="dropped"&&(t.due>=floor||links[t.id]))want[t.id]={kind:"task",item:t,ev:taskEvent(t)};});
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
const DRIVE_FILE="Ember backup.json",DRIVE_FILE_OLD="Everyday Orbit backup.json";
const DB={soon:null,busy:false,err:"",quiet:false};
const driveOn=()=>!!(hasGoogle()&&S.prefs&&S.prefs.storage==="drive"&&acctParts().drive);
function backupPayload(){
  const p={app:"ember",version:1,exported:new Date().toISOString(),data:{}};
  KEYS.forEach(k=>{p.data[k]=S[k];});
  return p;
}
function driveSoon(){
  if(DB.quiet||!driveOn())return;
  clearTimeout(DB.soon);DB.soon=setTimeout(()=>{driveBackup().catch(()=>{});},20000);
}
async function driveFind(){
  const o=gAcct();
  const find=name=>o.gcalRequest({api:"drive",method:"GET",path:"/files",
    query:{q:"name = '"+name+"' and trashed = false",fields:"files(id,modifiedTime)",orderBy:"modifiedTime desc",pageSize:"5",spaces:"drive"}});
  let r=await find(DRIVE_FILE);
  /* Nothing under the new name: the backup made before the planner was
     called Ember is taken over, and renamed as it is. */
  if(r.ok&&!(r.data&&r.data.files&&r.data.files.length)){
    const old=await find(DRIVE_FILE_OLD);
    if(old.ok&&old.data&&old.data.files&&old.data.files[0]){
      const f=old.data.files[0];
      try{await o.gcalRequest({api:"drive",method:"PATCH",path:"/files/"+f.id,body:{name:DRIVE_FILE}});}catch(e){}
      return f;
    }
  }
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
        description:"Ember keeps a copy of your planner here. Sign in on another computer to bring it back."});
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
/* Nothing live is redrawn while the window is hidden -- minimised, behind the
   tray, or a background tab; one redraw catches up when it is shown again. */
setInterval(()=>{if(document.hidden)return;if(V.view==="calendar"&&V.calMode==="week"&&!el("modalRoot").innerHTML&&!DG.on&&!document.querySelector(".drag-ghost"))renderView();},60000);
document.addEventListener("visibilitychange",()=>{
  if(document.hidden||OB.open)return;
  const a=document.activeElement,typing=a&&(a.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  if(!typing&&!el("modalRoot").innerHTML&&!DG.on)render();
});
setInterval(()=>{if(document.hidden||V.view!=="dashboard")return;
  const n=el("dashNext");if(n)n.innerHTML=upNextHtml();
  const st=el("dashStrip");if(st)st.innerHTML=dayStripHtml();},30000);

/* The clock ticks in place. A full render every second would fight anything
   being typed, so only the two readouts are touched. */
setInterval(function(){
  const r=running();
  if(!r||!r.since)return;
  /* Hidden, the page is not redrawn, but the floating timer -- which may be
     the only thing on screen -- still gets its second. */
  if(document.hidden){syncTimerWindow();return;}
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
    const f=document.querySelector(".tbar .to-fill");if(f)f.setAttribute("stroke-dashoffset",(100-(est?Math.min(1,secs/est):0)*100).toFixed(1));
    const sp=document.querySelector(".tbar .to-spin");if(sp)sp.style.transform="rotate("+orbitAngle(secs,est).toFixed(1)+"deg)";
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
