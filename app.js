import { db, ensureSeed } from './db.js';

/* ---------- Utilitaires ---------- */
const qs = sel => document.querySelector(sel);
const qsa = sel => [...document.querySelectorAll(sel)];
const fmtDate = d => d.toISOString().slice(0,10);

let navStack = [];   // pile de views (éléments)
let currentRoute = 'sessions';
let currentRoutineId = null;
let currentExerciseId = null;

/* ---------- Navigation haute + sous-onglets ---------- */
const header = {
  set({back=false, title='', ok=false}){
    const btnBack = qs('#btnBack'), btnOk = qs('#btnOk'), titleEl = qs('#title');
    btnBack.hidden = !back; btnOk.hidden = !ok; titleEl.textContent = title;
  },
  onBack(cb){ qs('#btnBack').onclick = cb; },
  onOk(cb){ qs('#btnOk').onclick = cb; }
};

function showView(viewId, {push=true}={}){
  const next = qs(`#${viewId}`);
  const cur = navStack.at(-1);
  next.hidden = false;
  if(push){
    next.classList.add('enter-from-right');
    requestAnimationFrame(()=>{
      if(cur) cur.classList.add('leave-to-left');
      next.classList.remove('enter-from-right');
    });
    next.addEventListener('transitionend', function onEnd(){
      next.removeEventListener('transitionend', onEnd);
      if(cur){ cur.hidden = true; cur.classList.remove('leave-to-left'); }
    });
    navStack.push(next);
  }else{
    // Replace
    if(cur) cur.hidden = true;
    navStack = [next];
  }
  currentRoute = next.dataset.route;
  renderSubtabs();
}

function back(){
  if(navStack.length<=1) return;
  const cur = navStack.pop();
  const prev = navStack.at(-1);
  prev.hidden = false;
  prev.classList.add('enter-from-left');
  requestAnimationFrame(()=>{
    cur.classList.add('leave-to-right');
    prev.classList.remove('enter-from-left');
  });
  cur.addEventListener('transitionend', function onEnd(){
    cur.removeEventListener('transitionend', onEnd);
    cur.hidden = true; cur.classList.remove('leave-to-right');
  });
  currentRoute = prev.dataset.route;
  renderSubtabs();
}

/* ---------- Sous-onglets selon section ---------- */
function renderSubtabs(){
  const st = qs('#subTabs');
  st.innerHTML = '';
  st.hidden = true;
  const libs = ['routines','plan','exercises'];
  const stats = ['stats-general','stats-progress','goals'];

  if(currentRoute==='exercises' || currentRoute==='routines' || currentRoute==='routine-form' || currentRoute==='add-movements' || currentRoute==='plan'){
    st.hidden = false;
    libs.forEach(id=>{
      const b = document.createElement('button'); b.className='chip'; b.textContent = id==='routines'?'Routines':id==='plan'?'Plan':'Exercices';
      if((currentRoute.startsWith('routine') && id==='routines') || currentRoute===id) b.classList.add('active');
      b.onclick = ()=>{
        if(id==='routines') openRoutines();
        if(id==='plan') openPlan();
        if(id==='exercises') openExercises();
      };
      st.appendChild(b);
    });
  } else if(currentRoute.startsWith('stats-') || currentRoute==='goals'){
    st.hidden = false;
    stats.forEach(id=>{
      const b = document.createElement('button'); b.className='chip'; b.textContent = id==='stats-general'?'Général':id==='stats-progress'?'Progrès':'Objectifs';
      if(currentRoute===id) b.classList.add('active');
      b.onclick = ()=>{ if(id==='goals') openGoals(); if(id==='stats-general') openStatsGeneral(); if(id==='stats-progress') openStatsProgress(); };
      st.appendChild(b);
    });
  }
}

/* ---------- Onglets bas ---------- */
qsa('.tab').forEach(t=>{
  t.addEventListener('click', ()=>{
    qsa('.tab').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    const tab = t.dataset.tab;
    if(tab==='sessions'){ header.set({back:false,title:'Séances',ok:false}); showView('v-sessions',{push:false}); renderSessions(); }
    if(tab==='libraries'){ openRoutines(); }
    if(tab==='stats'){ openStatsGeneral(); }
    if(tab==='settings'){ openSettings(); }
  });
});

/* ---------- DRAG & DROP handle (︙) ---------- */
function enableReorder(listEl, onReorder){
  let dragEl=null, ph=null, startY=0, pressTimer=null, startIndex=-1;

  const itemAtY = y => [...listEl.querySelectorAll('.item')].find(el=>{
    const r=el.getBoundingClientRect(); return y>=r.top && y<=r.bottom;
  });

  function startDrag(el, y){
    dragEl = el; startIndex=[...listEl.children].indexOf(el); startY=y;
    ph = document.createElement('li'); ph.className='placeholder'; listEl.insertBefore(ph, el.nextSibling);
    el.classList.add('dragging');
    const r = el.getBoundingClientRect();
    el.style.position='fixed'; el.style.left=r.left+'px'; el.style.top=r.top+'px'; el.style.width=r.width+'px'; el.style.zIndex='9';
    document.body.style.touchAction='none';
  }
  function moveDrag(y){
    if(!dragEl) return;
    dragEl.style.top = (y - dragEl.offsetHeight/2) + 'px';
    const tgt = itemAtY(y);
    if(tgt && tgt!==ph && tgt!==dragEl){
      const r = tgt.getBoundingClientRect();
      listEl.insertBefore(ph, (y < r.top + r.height/2) ? tgt : tgt.nextSibling);
    }
  }
  function endDrag(){
    if(!dragEl) return;
    dragEl.classList.remove('dragging'); dragEl.style.cssText='';
    listEl.insertBefore(dragEl, ph);
    const newIndex = [...listEl.children].indexOf(dragEl);
    ph.remove(); ph=null; document.body.style.touchAction='';
    const ids = [...listEl.querySelectorAll('.item')].map(el=>Number(el.dataset.id));
    onReorder?.(ids, startIndex, newIndex);
    dragEl=null;
  }

  listEl.addEventListener('contextmenu', e=>e.preventDefault());
  listEl.addEventListener('pointerdown', e=>{
    const handle = e.target.closest('.grab'); if(!handle) return;
    const li = e.target.closest('.item'); if(!li) return;
    pressTimer = setTimeout(()=> startDrag(li, e.clientY), 180);
  });
  window.addEventListener('pointermove', e=>{
    if(pressTimer && Math.abs(e.movementY)>2){ clearTimeout(pressTimer); pressTimer=null; }
    moveDrag(e.clientY);
  });
  window.addEventListener('pointerup', ()=>{ clearTimeout(pressTimer); pressTimer=null; endDrag(); });
}

/* ---------- Exercices (3.1) ---------- */
async function openExercises(){
  header.set({back:false,title:'Exercices',ok:false});
  showView('v-exercises',{push:false});
  await renderExerciseFilters();
  renderExerciseList();
}
async function renderExerciseFilters(){
  const exos = await db.getAll('exercises');
  const g = new Set(), m = new Set();
  exos.forEach(e=>{ if(e.group3) g.add(e.group3); if(e.equipment) m.add(e.equipment); });
  const fGrp=qs('#fGrp'); const fMat=qs('#fMat');
  fGrp.innerHTML = '<option value="">Groupe musculaire</option>' + [...g].map(x=>`<option>${x}</option>`).join('');
  fMat.innerHTML = '<option value="">Matériel</option>' + [...m].map(x=>`<option>${x}</option>`).join('');
}
async function renderExerciseList(){
  const q = qs('#searchExo').value.trim().toLowerCase();
  const fgrp = qs('#fGrp').value; const fmat = qs('#fMat').value;
  const list = qs('#exerciseList'); list.innerHTML='';
  const exos = await db.getAll('exercises');
  exos
    .filter(e=>!q || e.name.toLowerCase().includes(q))
    .filter(e=>!fgrp || e.group3===fgrp)
    .filter(e=>!fmat || e.equipment===fmat)
    .sort((a,b)=>a.name.localeCompare(b.name))
    .forEach(e=>{
      const li=document.createElement('li'); li.className='item'; li.dataset.id=e.id;
      li.innerHTML = `
        <div class="thumb"></div>
        <div class="grow">
          <div class="name">${e.name}</div>
          <div class="detail">${e.group3 || ''} – ${e.equipment || ''}</div>
        </div>
        <button class="edit">✏️</button>
      `;
      li.onclick = ()=> openExerciseForm(e.id);
      list.appendChild(li);
    });
}
qs('#btnNewExercise').onclick = ()=>openExerciseForm(null);
qs('#searchExo').oninput = renderExerciseList;
qs('#fGrp').onchange = renderExerciseList;
qs('#fMat').onchange = renderExerciseList;

async function openExerciseForm(id){
  currentExerciseId = id;
  header.set({back:true,title:id?'Modifier':'Ajouter',ok:true});
  header.onBack(()=>{ back(); });
  header.onOk(async ()=>{
    const f = new FormData(qs('#exerciseForm'));
    const name = f.get('name').trim();
    const group3 = f.get('group3'); const equipment=f.get('equipment'); const desc=f.get('desc')||'';
    if(!name || !group3 || !equipment) return alert('Nom, groupe et matériel requis');
    const obj = {id: id||undefined, name, group3, equipment, desc};
    await db.put('exercises', obj);
    back(); openExercises();
  });
  qs('#exerciseDeleteRow').hidden = !id;
  qs('#btnDelExercise').onclick = async ()=>{
    if(confirm('Supprimer cet exercice ?')){
      await db.delete('exercises', id); back(); openExercises();
    }
  };
  const form = qs('#exerciseForm'); form.reset();
  if(id){
    const e = await db.get('exercises', id);
    form.name.value = e.name || '';
    form.group3.value = e.group3 || '';
    form.equipment.value = e.equipment || '';
    form.desc.value = e.desc || '';
  }
  showView('v-exercise-form');
}

/* ---------- Routines (3.2) ---------- */
async function openRoutines(){
  header.set({back:false,title:'Routines',ok:false});
  showView('v-routines',{push:false});
  renderRoutineList();
}
async function renderRoutineList(){
  const list = qs('#routineList'); list.innerHTML='';
  const q = qs('#searchRoutine').value.trim().toLowerCase();
  const t = qs('#fType').value;
  const routines = await db.getAll('routines');
  routines
    .filter(r=>!q || r.name.toLowerCase().includes(q))
    .filter(r=>!t || r.type===t)
    .forEach(r=>{
      const setsCount = (r.items||[]).reduce((a,m)=>a+(m.sets?.length||0),0);
      const li=document.createElement('li'); li.className='item'; li.dataset.id=r.id;
      li.innerHTML = `
        <button class="grab" aria-label="Réordonner">︙</button>
        <div class="grow">
          <div class="name">${r.name}</div>
          <div class="detail">${(r.items||[]).length} Exo. ${setsCount} Sets. ${r.groups||'—'}</div>
        </div>
        <button class="edit">✏️</button>
      `;
      li.onclick = ()=> openRoutineForm(r.id);
      list.appendChild(li);
    });
  enableReorder(list, async (ids)=>{
    // réordonner en base selon la nouvelle liste
    const all = await db.getAll('routines');
    const map = new Map(all.map(r=>[r.id,r]));
    const ordered = ids.map(id=>map.get(id)).filter(Boolean);
    // rien à faire coté DB (l’ordre est visuel). Si tu veux persister, stocke un champ order sur chaque routine.
  });
}
qs('#btnNewRoutine').onclick = ()=> openRoutineForm(null);
qs('#searchRoutine').oninput = renderRoutineList;
qs('#fType').onchange = renderRoutineList;

async function openRoutineForm(id){
  currentRoutineId = id;
  header.set({back:true,title:id?'Modifier':'Ajouter',ok:true});
  header.onBack(()=> back());
  header.onOk(async ()=>{
    const f = new FormData(qs('#routineForm'));
    const name=f.get('name').trim(); if(!name) return alert('Nom requis');
    const obj = { id:id||undefined, name, type:f.get('type'), desc:f.get('desc')||'', items: state.movementItems||[] };
    await db.put('routines', obj);
    back(); openRoutines();
  });
  qs('#routineDeleteRow').hidden = !id;
  qs('#btnDelRoutine').onclick = async ()=>{
    if(confirm('Supprimer cette routine ?')){
      await db.delete('routines', id); back(); openRoutines();
    }
  };
  // Prefill form
  const form = qs('#routineForm'); form.reset();
  let routine = {name:'', type:'Général', desc:'', items:[]};
  if(id){ routine = await db.get('routines', id) || routine; }
  form.name.value = routine.name; form.type.value = routine.type; form.desc.value = routine.desc;

  // Mouvements list
  state.movementItems = (routine.items||[]).map(x=>({...x}));
  renderMovementList();
  qs('#btnAddMovements').onclick = openAddMovements;

  showView('v-routine-form');
}
function renderMovementList(){
  const ul = qs('#movementList'); ul.innerHTML='';
  (state.movementItems||[]).forEach((m,idx)=>{
    const sets = m.sets?.length||0;
    const min = Math.min(...(m.sets||[]).map(s=>s.repsDefault??0));
    const max = Math.max(...(m.sets||[]).map(s=>s.repsDefault??0));
    const li=document.createElement('li'); li.className='item'; li.dataset.id=idx;
    li.innerHTML = `
      <button class="grab" aria-label="Réordonner">︙</button>
      <div class="grow">
        <div class="name">${m.name || '(exercice supprimé)'}</div>
        <div class="detail">${sets} x ${Number.isFinite(min)&&Number.isFinite(max)?`${min}-${max}`:'0-0'} Reps. ${m.group3||'—'}</div>
      </div>
      <button class="edit">✏️</button>
    `;
    li.onclick = ()=> editMovement(idx);
    ul.appendChild(li);
  });
  enableReorder(ul, (ids, from, to)=>{
    const arr = state.movementItems;
    const [item] = arr.splice(from,1);
    arr.splice(to,0,item);
    renderMovementList();
  });
}
async function openAddMovements(){
  header.set({back:true,title:'Ajout d’exercices',ok:true});
  header.onBack(()=> back());
  header.onOk(()=>{
    const checked = qsa('#exercisePickList input[type=checkbox]:checked').map(x=>Number(x.value));
    addMovementsToRoutine(checked);
    back(); // retour routine
  });
  await renderExercisePickList();
  showView('v-add-movements');
}
async function renderExercisePickList(){
  const list = qs('#exercisePickList'); list.innerHTML='';
  const q = qs('#searchExoForRoutine').value.trim().toLowerCase();
  const grp = qs('#fGrp2').value; const mat = qs('#fMat2').value;
  const exos = await db.getAll('exercises');
  const groups = new Set(exos.map(e=>e.group3).filter(Boolean));
  const mats = new Set(exos.map(e=>e.equipment).filter(Boolean));
  qs('#fGrp2').innerHTML = '<option value="">Groupe musculaire</option>'+[...groups].map(g=>`<option>${g}</option>`).join('');
  qs('#fMat2').innerHTML = '<option value="">Matériel</option>'+[...mats].map(m=>`<option>${m}</option>`).join('');
  exos
    .filter(e=>!q || e.name.toLowerCase().includes(q))
    .filter(e=>!grp || e.group3===grp)
    .filter(e=>!mat || e.equipment===mat)
    .forEach(e=>{
      const li=document.createElement('li'); li.className='item';
      li.innerHTML = `
        <div class="thumb"></div>
        <div class="grow">
          <div class="name">${e.name}</div>
          <div class="detail">${e.group3} – ${e.equipment}</div>
        </div>
        <input type="checkbox" value="${e.id}">
      `;
      li.onclick = (ev)=>{ if(ev.target.tagName!=='INPUT') li.querySelector('input').click(); };
      list.appendChild(li);
    });
  qs('#searchExoForRoutine').oninput = renderExercisePickList;
  qs('#fGrp2').onchange = renderExercisePickList;
  qs('#fMat2').onchange = renderExercisePickList;
}
async function addMovementsToRoutine(exIds){
  const arr = state.movementItems||[];
  for(const id of exIds){
    const e = await db.get('exercises', id);
    if(!e) continue;
    if(arr.some(x=>x.exId===id)) continue; // no doublon
    arr.push({ exId:id, name:e.name, group3:e.group3, sets:[{repsDefault:10, restDefault:60},{repsDefault:10, restDefault:60}] });
  }
  state.movementItems = arr;
  renderMovementList();
}
function editMovement(index){
  // Simple éditeur inline : toggle nombre de sets en +1
  const m = state.movementItems[index];
  const add = confirm(`Ajouter une série à "${m.name}" ?`);
  if(add){ m.sets = (m.sets||[]).concat({repsDefault:10, restDefault:60}); renderMovementList(); }
}

/* ---------- Plan (3.3) : stub 28 jours ---------- */
async function openPlan(){
  header.set({back:false,title:'Plan',ok:false});
  showView('v-plan',{push:false});
  const ul = qs('#planList'); ul.innerHTML='';
  for(let day=1; day<=28; day++){
    const item = await db.get('plan', day);
    const li=document.createElement('li'); li.className='item';
    li.innerHTML = `
      <div class="grow">
        <div class="name">Jour ${day} — ${item?.name || 'Non défini'}</div>
        <div class="detail">${item?.groups || '—'}</div>
      </div>
      <button class="edit">✏️</button>
    `;
    li.onclick = async ()=>{
      const routines = await db.getAll('routines');
      const pick = prompt('Nom de routine (exact) :\n'+routines.map(r=>r.name).join('\n'));
      if(!pick){ return; }
      const r = routines.find(x=>x.name===pick);
      if(!r){ alert('Routine inconnue'); return; }
      await db.put('plan', {day, routineId:r.id, name:r.name, groups:r.groups||''});
      openPlan();
    };
    ul.appendChild(li);
  }
}

/* ---------- Séances (3.4) : simplifiée ---------- */
async function renderSessions(){
  const today = new Date();
  qs('#todayLabel').textContent = new Intl.DateTimeFormat('fr-FR',{weekday:'long', day:'numeric', month:'short'}).format(today);
  renderCalendar(today);
  // Stubs pour les blocs exercice de la séance courante
  qs('#sessionExercises').innerHTML = `
    <div class="item"><div class="grow"><div class="name">Développé couché</div><div class="detail">8×80 — RPE 8</div></div><button class="edit">✏️</button></div>
  `;
}
function renderCalendar(day){
  const cal = qs('#calendar'); cal.innerHTML='';
  const start = new Date(day); start.setDate(day.getDate()-3);
  for(let i=0;i<7;i++){
    const d = new Date(start); d.setDate(start.getDate()+i);
    const div = document.createElement('div'); div.className='day';
    if(fmtDate(d)===fmtDate(new Date())) div.classList.add('today','selected');
    div.textContent = d.getDate();
    cal.appendChild(div);
  }
}

/* ---------- Stats / Objectifs (stubs) ---------- */
function openGoals(){ header.set({back:false,title:'Objectifs',ok:false}); showView('v-goals',{push:false}); }
function openStatsGeneral(){ header.set({back:false,title:'Général',ok:false}); showView('v-stats-general',{push:false}); }
function openStatsProgress(){ header.set({back:false,title:'Progrès',ok:false}); showView('v-stats-progress',{push:false}); }
function openSettings(){
  header.set({back:false,title:'Réglages',ok:false});
  showView('v-settings',{push:false});
  // charger / appliquer
  applySettingsUI();
}

/* ---------- Réglages ---------- */
async function applySettingsUI(){
  const fs = (await db.get('settings','fontSize'))?.value || 'normal';
  const dt = (await db.get('settings','defaultTimer'))?.value ?? 60;
  const st = (await db.get('settings','weightStep'))?.value ?? 1;
  const md = (await db.get('settings','seriesDefaultMode'))?.value || 'template';
  const th = (await db.get('settings','theme'))?.value || 'light';
  qs('#setFont').value=fs; qs('#setTimer').value=dt; qs('#setStep').value=st;
  qs('#setSeriesDefault').value=md; qs('#setTheme').value=th;
  // Appliquer
  document.body.classList.toggle('theme-dark', th==='dark');
  document.body.style.setProperty('--font', fs==='small'?'15px':fs==='large'?'18px':'16px');
}
qs('#setFont').onchange = async (e)=>{ await db.put('settings',{key:'fontSize',value:e.target.value}); applySettingsUI(); };
qs('#setTimer').onchange = async (e)=>{ await db.put('settings',{key:'defaultTimer',value:Number(e.target.value)}); };
qs('#setStep').onchange = async (e)=>{ await db.put('settings',{key:'weightStep',value:Number(e.target.value)}); };
qs('#setSeriesDefault').onchange = async (e)=>{ await db.put('settings',{key:'seriesDefaultMode',value:e.target.value}); };
qs('#setTheme').onchange = async (e)=>{ await db.put('settings',{key:'theme',value:e.target.value}); applySettingsUI(); };

/* ---------- État global minimal ---------- */
const state = { movementItems: [] };

/* ---------- Entrée ---------- */
(async function start(){
  await ensureSeed();
  // par défaut: Séances
  header.set({back:false,title:'Séances',ok:false});
  showView('v-sessions',{push:false});
  renderSessions();

  // Enregistrement SW
  if('serviceWorker' in navigator){ try{ await navigator.serviceWorker.register('./sw.js'); }catch(e){} }
})();
