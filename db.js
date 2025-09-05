// Minimal IndexedDB helper + stores for spec
const DB_NAME = 'muscu-db';
const DB_VER  = 1;

function openDB(){
  return new Promise((res, rej)=>{
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e=>{
      const db = req.result;
      if(!db.objectStoreNames.contains('exercises')){
        const s = db.createObjectStore('exercises',{keyPath:'id',autoIncrement:true});
        s.createIndex('name','name',{unique:false});
        s.createIndex('group3','group3');
        s.createIndex('equipment','equipment');
      }
      if(!db.objectStoreNames.contains('routines')){
        const s = db.createObjectStore('routines',{keyPath:'id',autoIncrement:true});
        // items = mouvements [{exId, name, sets:[{repsDefault, restDefault}], order}]
      }
      if(!db.objectStoreNames.contains('workouts')){
        const s = db.createObjectStore('workouts',{keyPath:'date'}); // "YYYY-MM-DD"
      }
      if(!db.objectStoreNames.contains('settings')){
        db.createObjectStore('settings',{keyPath:'key'});
      }
      if(!db.objectStoreNames.contains('plan')){
        db.createObjectStore('plan',{keyPath:'day'}); // 1..28
      }
    };
    req.onsuccess = ()=>res(req.result);
    req.onerror = ()=>rej(req.error);
  });
}

async function tx(store, mode='readonly'){
  const db = await openDB();
  return db.transaction(store, mode).objectStore(store);
}

export const db = {
  async getAll(store){ const s=await tx(store); return new Promise(r=>{ const req=s.getAll(); req.onsuccess=()=>r(req.result); });},
  async get(store, key){ const s=await tx(store); return new Promise(r=>{ const req=s.get(key); req.onsuccess=()=>r(req.result); });},
  async put(store, val){ const s=await tx(store,'readwrite'); return new Promise(r=>{ const req=s.put(val); req.onsuccess=()=>r(req.result); });},
  async delete(store, key){ const s=await tx(store,'readwrite'); return new Promise(r=>{ const req=s.delete(key); req.onsuccess=()=>r(); });},
  async clear(store){ const s=await tx(store,'readwrite'); return new Promise(r=>{ const req=s.clear(); req.onsuccess=()=>r(); });}
};

// Seed minimal (one time)
export async function ensureSeed(){
  const exos = await db.getAll('exercises');
  if(exos.length===0){
    await db.put('exercises',{name:'Développé couché', group3:'Pectoraux', equipment:'Barre', desc:''});
    await db.put('exercises',{name:'Squat', group3:'Quadriceps', equipment:'Barre', desc:''});
    await db.put('exercises',{name:'Tractions', group3:'Dos', equipment:'Poids de corps', desc:''});
  }
  const st = await db.getAll('settings');
  if(st.length===0){
    await db.put('settings',{key:'fontSize', value:'normal'});
    await db.put('settings',{key:'defaultTimer', value:60});
    await db.put('settings',{key:'weightStep', value:1});
    await db.put('settings',{key:'seriesDefaultMode', value:'template'});
    await db.put('settings',{key:'theme', value:'light'});
  }
}
