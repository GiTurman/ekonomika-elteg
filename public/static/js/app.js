// ═══════════════════════════════════════════════════════
//  KLEEMANN Calculator Pro  –  app.js
// ═══════════════════════════════════════════════════════
console.log('✅ app.js loading...');

let DB = null;           // full data from server
let proj = null;         // active project
let currentScenario = 'base';
let activeTypeFilter = 'all';

const SCENARIOS = {
  base: {l:15, i:50, c:5},
  bull: {l:22, i:70, c:3},
  bear: {l: 8, i:33, c:7}
};

// ─── EXPOSE TO GLOBAL ───────────────────────────────────
// Assigning early to ensure availability for HTML onclicks
window.newProject = newProject;
window.toggleSidebar = toggleSidebar;
window.doReset = doReset;
window.refreshRates = refreshRates;
window.addUnit = addUnit;
window.saveUnits = saveUnits;
window.applyGlobalMarkup = applyGlobalMarkup;
window.saveMission = saveMission;
window.setScenario = setScenario;
window.recalcResults = recalcResults;
window.refreshFinalProject = refreshFinalProject;
window.refreshAnalysis = refreshAnalysis;
window.refreshFullAnalysis = refreshFullAnalysis;
window.saveProposalSettings = saveProposalSettings;
window.exportToExcel = exportToExcel;
window.printSection = printSection;
window.createBackup = createBackup;
window.loadBkList = loadBkList;
window.restoreBackup = restoreBackup;
window.uploadBackup = uploadBackup;
window.removeUnit = removeUnit;
window.toggleUnit = toggleUnit;
window.deleteProject = deleteProject;

// ─── INIT ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 App initializing...');
  window.manualCurChange = manualCurChange;
  initNav();
  initTypeFilter();
  try {
    await loadDB();
    if (DB && DB.projects && DB.projects.length > 0) {
      setActiveProject(DB.active_project || DB.projects[0].id);
    } else {
      console.warn('No projects found in DB');
    }
  } catch (e) {
    console.error('Initialization failed:', e);
    toast('❌ ჩატვირთვის შეცდომა: ' + e.message, 'err');
  }
  loadBkList();
  setInterval(() => syncDB(), 90_000);
});

// ─── NAVIGATION ─────────────────────────────────────────
function initNav() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      const tab = el.dataset.tab;
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      document.getElementById('tab-' + tab).classList.add('active');
      if (tab === 'results')   recalcResults();
      if (tab === 'analysis')  refreshAnalysis();
      if (tab === 'full_analysis') refreshFullAnalysis();
      if (tab === 'final')     refreshFinalProject();
      if (tab === 'dashboard') refreshDashboard();
      if (tab === 'backup')    loadBkList();
    });
  });
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}

// ─── TYPE FILTER ────────────────────────────────────────
function initTypeFilter() {
  document.querySelectorAll('.tf-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.tf-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      activeTypeFilter = b.dataset.tf;
      renderUnits();
    });
  });
}

// ─── DATA ───────────────────────────────────────────────
async function loadDB() {
  const r = await fetch('/api/data');
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`სერვერის შეცდომა (${r.status}): ${text.substring(0, 100)}`);
  }
  DB = await r.json();
  renderProjectList();
  updateCurrencyBar();
}

function syncDB() {
  fetch('/api/data', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(DB)});
}

function persist(msg) {
  syncDB();
  if (msg) toast(msg, 'ok');
}

// ─── PROJECTS ───────────────────────────────────────────
function renderProjectList() {
  const c = document.getElementById('projectList');
  c.innerHTML = '';
  DB.projects.forEach(p => {
    const el = document.createElement('div');
    el.className = 'proj-item' + (p.id === DB.active_project ? ' active' : '');
    el.innerHTML = `
      <span class="proj-name">${p.name}</span>
      <span class="proj-badge">${p.units.length}</span>
      <button class="proj-del-btn" title="წაშლა" onclick="event.stopPropagation(); deleteProject('${p.id}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
      </button>`;
    el.onclick = () => setActiveProject(p.id);
    c.appendChild(el);
  });
}

function deleteProject(id) {
  if (DB.projects.length <= 1) {
    toast('ბოლო პროექტის წაშლა შეუძლებელია', 'err');
    return;
  }
  if (!confirm('ნამდვილად გსურთ პროექტის წაშლა?')) return;

  const idx = DB.projects.findIndex(p => p.id === id);
  if (idx === -1) return;

  DB.projects.splice(idx, 1);

  if (DB.active_project === id) {
    DB.active_project = DB.projects[0].id;
    setActiveProject(DB.active_project);
  } else {
    renderProjectList();
    persist();
  }
}

function setActiveProject(id) {
  console.log('🎯 setActiveProject:', id);
  if (!DB || !DB.projects) return;
  DB.active_project = id;
  proj = DB.projects.find(p => p.id === id);
  if (!proj) {
    console.error('Project not found:', id);
    return;
  }
  renderProjectList();
  const tb = document.getElementById('topbarProject');
  if (tb) tb.textContent = proj.name;
  refreshDashboard();
  renderUnits();
  fillMission();
  fillProposalSettings();
  // sync scenario from project
  const gm = proj.global_markup || {};
  setVal('g_lift_pct',    gm.lift_pct || 15);
  setVal('g_install_pct', gm.install_pct || 50);
  setVal('g_cont_pct',    gm.contingency_pct || 5);
  syncDB();
}

function newProject() {
  console.log('➕ newProject clicked');
  if (!DB) { 
    toast('მონაცემები ჯერ არ ჩატვირთულა', 'info');
    loadDB().then(() => {
      if (DB) toast('მონაცემები ჩაიტვირთა, სცადეთ თავიდან', 'info');
    });
    return; 
  }
  
  let name;
  try {
    name = prompt('პროექტის სახელი:');
    if (name === null) {
      // If prompt is blocked it might return null, but usually it's a user cancel.
      // However, if we suspect it's blocked, we could use a default.
      // For now, let's just allow cancel to work, but if it's empty we use default.
      return; 
    }
  } catch (e) {
    console.warn('prompt blocked or failed', e);
    name = "პროექტი " + (DB.projects.length + 1);
  }
  
  name = (name || "").trim();
  if (!name) name = "პროექტი " + (DB.projects.length + 1);
  
  const id = 'proj_' + Date.now();
  console.log('Creating project:', id, name);
  
  DB.projects.push({
    id, name, location:'თბილისი', delivery_year: 2026, type:'residential',
    units:[], 
    mission:{mechanics_count:2,mechanics_days:30,mechanics_visits:1,electricians_count:2,electricians_days:10,electricians_visits:1,admin_count:1,admin_days:10,admin_visits:4,distance_km:400,fuel_price_gel:0,fuel_consumption_per_100km:10,food_per_day_gel:0,accommodation_per_day_gel:0},
    global_markup:{lift_pct:15,install_pct:50,contingency_pct:5},
    proposal:{
      vat_text: "ფასები მოცემულია დღგ-ს ჩათვლით.",
      payment_text: "გადახდის პირობები: შეთანხმებით.",
      guarantee_text: "გარანტია: სტანდარტული ქარხნული გარანტია.",
      validity_text: "შეთავაზება ძალაშია 30 კალენდარული დღის განმავლობაში.",
      sign_prefix: "პატივისცემით,",
      sign_name: "KLEEMANN Calculator Pro Team"
    }
  });
  setActiveProject(id);
  persist('პროექტი შექმნილია');
}

// ─── CURRENCY ───────────────────────────────────────────
function updateCurrencyBar() {
  const c = DB.currency;
  const u = document.getElementById('hUsd');
  const e = document.getElementById('hEur');
  if (u) u.value = c.usd_gel || 0;
  if (e) e.value = c.eur_gel || 0;
  setTxt('hDate', c.last_updated || '');
}

function manualCurChange() {
  const u = +document.getElementById('hUsd').value;
  const e = +document.getElementById('hEur').value;
  if (u > 0 && e > 0) {
    DB.currency.usd_gel = u;
    DB.currency.eur_gel = e;
    DB.currency.eur_usd = Number((e / u).toFixed(6));
    DB.currency.last_updated = 'Manual ' + new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    updateCurrencyBar();
    syncDB();
    refreshDashboard();
    toast('კურსი განახლებულია', 'ok');
  }
}

async function refreshRates() {
  const btn = document.querySelector('.btn-cur');
  btn.style.animation = 'spin 1s linear infinite';
  loader(true);
  try {
    const r = await fetch('/api/rates/refresh', {method:'POST'});
    const d = await r.json();
    if (d.status === 'ok') {
      DB.currency = {...DB.currency, ...d.rates};
      updateCurrencyBar();
      toast(`✅ USD=${d.rates.usd_gel}  EUR=${d.rates.eur_gel}`, 'ok');
      refreshDashboard();
    } else {
      toast('❌ ' + d.message, 'err');
    }
  } catch(e) { toast('❌ ' + e.message, 'err'); }
  loader(false);
  btn.style.animation = '';
}

// ─── DASHBOARD ──────────────────────────────────────────
async function refreshDashboard() {
  if (!proj) return;
  try {
    const units = proj.units;
    const cur   = DB.currency;

    // Info tiles
    document.getElementById('projInfoGrid').innerHTML = `
      <div class="info-tile"><div class="info-tile-label">პროექტი</div><div class="info-tile-value">${proj.name}</div></div>
      <div class="info-tile"><div class="info-tile-label">ადგილმდებარეობა</div><div class="info-tile-value">${proj.location}</div></div>
      <div class="info-tile"><div class="info-tile-label">ჩაბ. წელი</div><div class="info-tile-value">${proj.delivery_year}</div></div>
      <div class="info-tile"><div class="info-tile-label">დანადგარები</div><div class="info-tile-value">${units.length} ერთეული</div></div>
    `;

    if (!units.length) {
      document.getElementById('metricsStrip').innerHTML = '';
      document.getElementById('dashTable').innerHTML = '<p class="muted">დანადგარები არ მოიძებნა</p>';
      return;
    }

    const missionGel = getMissionCostGel();
    const missionEur = missionGel / cur.eur_gel;
    const perUnitMissionEur = units.length > 0 ? missionEur / units.length : 0;

    const modUnits = units.map(u => {
      let missionInUnitCur = perUnitMissionEur;
      if (u.currency === 'USD') missionInUnitCur = perUnitMissionEur * cur.eur_usd;
      if (u.currency === 'GEL') missionInUnitCur = perUnitMissionEur * cur.eur_gel;
      return { ...u, other_expense: (u.other_expense || 0) + missionInUnitCur };
    });

    const results = await calcUnits(modUnits, cur);
    const totalPriceExVatEur = results.reduce((s,r) => s + (r.price_ex_vat?.eur||0), 0);
    const totalRevEur   = results.reduce((s,r) => s + (r.revenue?.eur||0), 0);
    const avgMargin     = totalPriceExVatEur > 0 ? totalRevEur/totalPriceExVatEur*100 : 0;
    const totalCostEur  = results.reduce((s,r) => s + (r.total_cost?.eur||0), 0);

    const mColor = avgMargin>15?'var(--green2)':avgMargin>8?'var(--yellow2)':'var(--red2)';
    const totalPriceIncVatEur = results.reduce((s,r) => s + (r.price_inc_vat?.eur||0), 0);
    document.getElementById('metricsStrip').innerHTML = `
      <div class="metric"><div class="metric-label">სულ ფასი (დღგ-ით)</div>
        <div class="metric-value" style="color:var(--purple2)">${fmtN(totalPriceIncVatEur)}</div>
        <div class="metric-sub">EUR</div></div>
      <div class="metric"><div class="metric-label">სულ შემოსავალი</div>
        <div class="metric-value" style="color:var(--green2)">${fmtN(totalRevEur)}</div>
        <div class="metric-sub">EUR</div></div>
      <div class="metric"><div class="metric-label">საერთო მარჟა</div>
        <div class="metric-value" style="color:${mColor}">${avgMargin.toFixed(2)}%</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(avgMargin*3,100)}%;background:${mColor}"></div></div></div>
      <div class="metric"><div class="metric-label">სულ თვითღ.</div>
        <div class="metric-value" style="color:var(--accent2)">${fmtN(totalCostEur)}</div>
        <div class="metric-sub">EUR</div></div>
    `;

    // Summary table
    const typeCounts = {};
    units.forEach(u => typeCounts[u.type] = (typeCounts[u.type]||0)+1);
    const typeList = Object.entries(typeCounts).map(([t,n]) => `${t}: ${n}`).join(' · ');

    let rows = results.map(r => {
      const u = units.find(x => x.id === r.id) || {};
      const mc = r.tm_pct>15?'bg-g':r.tm_pct>8?'bg-y':'bg-r';
      const typeBadge = r.type==='lift'?'badge-lift':r.type==='escalator'?'badge-escalator':'badge-travelator';
      return `<tr>
        <td><span class="unit-type-badge ${typeBadge}">${r.type}</span></td>
        <td class="v-lbl"><b>${r.id}</b></td>
        <td class="v-lbl">${u.brand||''} ${u.model||''}</td>
        <td class="v-lbl">${u.capacity||''}</td>
        <td class="v-lbl">${u.floors||''}</td>
        <td class="v-trade">${fmtV(r.price_ex_vat,r.currency)}</td>
        <td class="v-eur">${fmtN(r.price_inc_vat?.eur)}</td>
        <td class="v-gel">${fmtN(r.revenue?.eur)}</td>
        <td><span class="badge ${mc}">${r.tm_pct?.toFixed(1)}%</span></td>
      </tr>`;
    }).join('');

    document.getElementById('dashTable').innerHTML = `
      <p class="muted" style="margin-bottom:10px">${typeList}</p>
      <table class="rt">
        <thead><tr>
          <th>სახეობა</th><th>ID</th><th>ბრენდი / მოდ.</th><th>ტვ. (კგ/მმ)</th><th>სართ.</th>
          <th>ფასი (${proj.units[0]?.currency||'EUR'}, გ/დღგ)</th><th>EUR (დღგ-ით)</th><th>შემ. EUR</th><th>მარჟა</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  } catch (e) {
    console.error('Dashboard refresh failed:', e);
    toast('მიმოხილვის განახლების შეცდომა', 'err');
  }
}

// ─── UNITS ──────────────────────────────────────────────
function renderUnits() {
  if (!proj) return;
  const c = document.getElementById('unitsContainer');
  c.innerHTML = '';
  const gm = proj.global_markup || {};
  setVal('g_lift_pct',    gm.lift_pct || 15);
  setVal('g_install_pct', gm.install_pct || 50);
  setVal('g_cont_pct',    gm.contingency_pct || 5);

  const filtered = activeTypeFilter === 'all'
    ? proj.units
    : proj.units.filter(u => u.type === activeTypeFilter);

  filtered.forEach((u, idx) => {
    const realIdx = proj.units.indexOf(u);
    c.appendChild(buildUnitCard(u, realIdx));
  });
}

function buildUnitCard(u, idx) {
  const typeBadge = u.type==='lift'?'badge-lift':u.type==='escalator'?'badge-escalator':'badge-travelator';
  const typeIcon  = u.type==='lift'?'🛗':u.type==='escalator'?'↕':'↔';

  const el = document.createElement('div');
  el.className = 'unit-card';
  el.id = `uc_${idx}`;
  el.innerHTML = `
  <div class="unit-header" onclick="toggleUnit(${idx})">
    <span class="unit-type-badge ${typeBadge}">${typeIcon} ${u.type}</span>
    <span class="unit-id-label">${u.id}</span>
    <div class="unit-meta">
      <span>${u.brand||''} ${u.model||''}</span>
      <span>⚡ ${u.capacity||''}</span>
      <span>🏢 ${u.floors||0} სართ.</span>
      <span>${u.currency||''}</span>
    </div>
    <div class="unit-mini-result">
      <div class="unit-mini-price" id="miniPrice_${idx}">...</div>
      <div class="unit-mini-margin" id="miniMargin_${idx}"></div>
    </div>
    <button class="btn btn-sm btn-danger" style="margin-left:8px" onclick="event.stopPropagation();removeUnit(${idx})">✕</button>
    <span class="unit-toggle">▼</span>
  </div>
  <div class="unit-body" id="ubody_${idx}">

    <div class="sec-title">📋 ზოგადი</div>
    <div class="grid-4">
      ${fi(idx,'id','ID','text',u.id)}
      ${fi(idx,'type','სახეობა','select:lift|escalator|travelator',u.type)}
      ${fi(idx,'capacity','ტვ. (კგ/მმ)','text',u.capacity)}
      ${fi(idx,'floors','სართ.','number',u.floors)}
      ${fi(idx,'currency','ვალუტა','select:EUR|USD|GEL',u.currency)}
      ${fi(idx,'brand','ბრენდი','text',u.brand)}
      ${fi(idx,'model','მოდ.','text',u.model)}
      ${fi(idx,'country','ქვეყანა','text',u.country)}
      ${fi(idx,'mr_mrl','MR/MRL','text',u.mr_mrl)}
      ${fi(idx,'delivery','EXW/DAP','text',u.delivery)}
      ${fi(idx,'variant','ვარიანტი','number',u.variant)}
    </div>

    <div class="sec-title">💰 შეძენის ღირებულება</div>
    <div class="grid-4">
      ${fi(idx,'factory_price','ქ/ფასი','number',u.factory_price)}
      ${fi(idx,'bank_fee','ბანკი','number',u.bank_fee)}
      ${fi(idx,'intl_transport','საერთ.ტრ.','number',u.intl_transport)}
      ${fi(idx,'terminal_fee','ტერმინ.','number',u.terminal_fee)}
      ${fi(idx,'local_transport','ადგ.ტრ.','number',u.local_transport)}
    </div>

    <div class="sec-title">🔨 მონტაჟი</div>
    <div class="grid-4">
      ${fi(idx,'install_labor','მონტ.ხელ.(+20%+4%)','number',u.install_labor)}
      ${fi(idx,'electrical','ელ.+გაშ.(+20%+4%)','number',u.electrical)}
      ${fi(idx,'accommodation','საცხ.','number',u.accommodation)}
      ${fi(idx,'food','კვება','number',u.food)}
      ${fi(idx,'fuel','საწვ.','number',u.fuel)}
      ${fi(idx,'materials','მასალა','number',u.materials)}
    </div>

    <div class="sec-title">📈 ფასნამატი & ხარჯები</div>
    <div class="grid-4">
      ${fi(idx,'lift_markup_pct','ლიფ. ფასნ.%','number',u.lift_markup_pct,'0.5')}
      ${fi(idx,'install_markup_pct','მონტ. ფასნ.%','number',u.install_markup_pct,'1')}
      ${fi(idx,'contingency_pct','გაუთვ.%','number',u.contingency_pct,'0.5')}
      ${fi(idx,'bank_risk_cent','სავალ.რ.ც.','number',u.bank_risk_cent,'0.01')}
      ${fi(idx,'other_expense','სხვა','number',u.other_expense)}
      ${fi(idx,'grounding','დამ.+ზედ.','number',u.grounding)}
      ${fi(idx,'intermediary','შუამ.','number',u.intermediary)}
      ${fi(idx,'customs_pct','საბ/ო %','number',u.customs_pct||0,'1')}
    </div>

    <div class="sec-title">🏦 გარანტია & სერვისი & დღგ</div>
    <div class="grid-4">
      ${fi(idx,'guarantee_pct','გარ.%','number',u.guarantee_pct)}
      ${fi(idx,'guarantee_days','გარ.დღ.','number',u.guarantee_days)}
      ${fi(idx,'guarantee_annual_pct','გარ.წლ.%','number',u.guarantee_annual_pct)}
      ${fi(idx,'free_service_months','უფ.სერვ.თვ','number',u.free_service_months)}
      ${fi(idx,'monthly_service','ყვ.სერვ.','number',u.monthly_service)}
      ${fi(idx,'vat_pct','დღგ %','number',u.vat_pct)}
    </div>

    <div class="sec-title">📊 შედეგი (live)</div>
    <div id="liveResult_${idx}" class="muted">გამოთვლა...</div>
  </div>`;

  // live calc on any change
  el.querySelectorAll('input,select').forEach(inp => {
    inp.addEventListener('change', () => saveUnitField(idx, inp));
  });

  // compute mini result
  setTimeout(() => calcMiniResult(idx), 100);
  return el;
}

function fi(idx, key, label, type, val, step) {
  const id = `u_${idx}_${key}`;
  if (type.startsWith('select:')) {
    const opts = type.replace('select:','').split('|');
    return `<div class="fg"><label>${label}</label><select class="inp" id="${id}" data-key="${key}">${opts.map(o=>`<option ${String(val)===o?'selected':''}>${o}</option>`).join('')}</select></div>`;
  }
  const s = step ? `step="${step}"` : '';
  return `<div class="fg"><label>${label}</label><input type="${type==='number'?'number':'text'}" class="inp" id="${id}" data-key="${key}" value="${val??0}" ${s}></div>`;
}

function toggleUnit(idx) {
  const header = document.querySelector(`#uc_${idx} .unit-header`);
  const body   = document.getElementById('ubody_'+idx);
  header.classList.toggle('open');
  body.classList.toggle('open');
  if (body.classList.contains('open')) calcMiniResult(idx);
}

function saveUnitField(idx, inp) {
  const key = inp.dataset.key;
  const val = inp.type === 'number' ? +inp.value : inp.value;
  proj.units[idx][key] = val;
  syncDB();
  calcMiniResult(idx);
}

async function calcMiniResult(idx) {
  const u = proj.units[idx];
  if (!u) return;

  const missionGel = getMissionCostGel();
  const missionEur = missionGel / DB.currency.eur_gel;
  const perUnitMissionEur = proj.units.length > 0 ? missionEur / proj.units.length : 0;

  let missionInUnitCur = perUnitMissionEur;
  if (u.currency === 'USD') missionInUnitCur = perUnitMissionEur * DB.currency.eur_usd;
  if (u.currency === 'GEL') missionInUnitCur = perUnitMissionEur * DB.currency.eur_gel;

  const modUnit = { ...u, other_expense: (u.other_expense || 0) + missionInUnitCur };

  try {
    const r = await fetch('/api/calculate', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({units:[modUnit], currency: DB.currency})
    });
    const [res] = await r.json();
    setTxt('miniPrice_'+idx, `${fmtV(res.price_ex_vat, u.currency)} ${u.currency}`);
    const mc = res.tm_pct>15?'var(--green2)':res.tm_pct>8?'var(--yellow2)':'var(--red2)';
    const el = document.getElementById('miniMargin_'+idx);
    if (el) { el.textContent = `მარჟა: ${res.tm_pct?.toFixed(2)}%`; el.style.color = mc; }

    // live result section
    const lr = document.getElementById('liveResult_'+idx);
    if (lr) lr.innerHTML = buildMiniTable(res, u.currency);
  } catch(e) { console.error(e); }
}

function buildMiniTable(r, cur) {
  const total = r.price_inc_vat?.gel || 1;
  const row = (label, obj, bold) => {
    const share = ((obj?.gel || 0) / total * 100).toFixed(1);
    return `<tr${bold?' class="total-row"':''}>
    <td class="v-lbl">${label}</td>
    <td class="v-trade">${fmtV(obj,cur)}</td>
    <td class="v-eur">${fmtN(obj?.eur)}</td>
    <td class="v-usd">${fmtN(obj?.usd)}</td>
    <td class="v-gel">${fmtN(obj?.gel)}</td>
    <td class="v-share" style="color:var(--muted)">${share}%</td>
  </tr>`;
  };
  return `<table class="rt">
    <thead><tr><th>პოზ.</th><th>${cur}</th><th>EUR</th><th>USD</th><th>GEL</th><th>წილი %</th></tr></thead>
    <tbody>
      ${row('შეძ. თვ/ღ.', r.unit_cost)}
      ${row('მონტ. თვ/ღ.', r.install_cost)}
      ${row('სულ თვ/ღ.', r.total_cost)}
      ${row('სულ ფასნ.', r.total_markup)}
      ${row('სხვ. ხ.', r.other_costs)}
      ${row('ფასი გ/დღგ', r.price_ex_vat, true)}
      ${row('დღგ', r.vat)}
      <tr class="grand-row">
        <td class="v-lbl">ფასი დღგ-ით</td>
        <td class="v-trade">${fmtV(r.price_inc_vat,cur)}</td>
        <td class="v-eur">${fmtN(r.price_inc_vat?.eur)}</td>
        <td class="v-usd">${fmtN(r.price_inc_vat?.usd)}</td>
        <td class="v-gel">${fmtN(r.price_inc_vat?.gel)}</td>
        <td class="v-share">100%</td>
      </tr>
      <tr class="total-row">
        <td class="v-lbl" style="color:var(--green2)">შემ. / მარჟა</td>
        <td class="v-gel">${fmtV(r.revenue,cur)}</td>
        <td colspan="4" class="v-gel">${r.tm_pct?.toFixed(3)}%</td>
      </tr>
    </tbody>
  </table>`;
}

function addUnit(type) {
  const prev = proj.units.filter(u => u.type===type).slice(-1)[0] || {};
  const id = type==='lift'?`L${proj.units.filter(u=>u.type==='lift').length+1}`:
             type==='escalator'?`ESC${proj.units.filter(u=>u.type==='escalator').length+1}`:`TRA${proj.units.filter(u=>u.type==='travelator').length+1}`;
  proj.units.push({
    id, type, capacity: prev.capacity||'1000', floors: prev.floors||5,
    currency: prev.currency||'EUR', brand: prev.brand||'', model: prev.model||'MRL',
    kind: prev.kind||'Passenger', drive:'ელექტრული', delivery:'EXW', mr_mrl:'MRL',
    country: prev.country||'kleemann china', variant:1,
    factory_price:0, bank_fee:10, intl_transport:4300, terminal_fee:60,
    local_transport:550, install_labor:0, electrical:0, accommodation:500,
    food:0, fuel:250, materials:300,
    lift_markup_pct:15, install_markup_pct:50, contingency_pct:5,
    bank_risk_cent:0.02, other_expense:0, grounding:350, intermediary:0,
    guarantee_pct:0, guarantee_days:175, guarantee_annual_pct:4,
    free_service_months:0, monthly_service:0, vat_pct:18, customs_pct:0
  });
  syncDB();
  activeTypeFilter = 'all';
  document.querySelectorAll('.tf-btn').forEach(b => b.classList.toggle('active', b.dataset.tf==='all'));
  renderUnits();
  toast(`${type} დამატებულია — ${id}`, 'ok');
}

function removeUnit(idx) {
  if (!confirm(`${proj.units[idx].id} — წაშლა?`)) return;
  proj.units.splice(idx, 1);
  syncDB();
  renderUnits();
  toast('წაიშალა', 'info');
}

function saveUnits() {
  // collect all visible inputs
  proj.units.forEach((u, idx) => {
    const card = document.getElementById('uc_'+idx);
    if (!card) return;
    card.querySelectorAll('[data-key]').forEach(inp => {
      const key = inp.dataset.key;
      u[key] = inp.type==='number' ? +inp.value : inp.value;
    });
  });
  persist('ყველა დანადგარი შენახულია');
  refreshDashboard();
}

function previewGlobal() {}
function applyGlobalMarkup() {
  const l = +getVal('g_lift_pct');
  const i = +getVal('g_install_pct');
  const c = +getVal('g_cont_pct');
  proj.units.forEach(u => {
    u.lift_markup_pct    = l;
    u.install_markup_pct = i;
    u.contingency_pct    = c;
  });
  proj.global_markup = {lift_pct:l, install_pct:i, contingency_pct:c};
  persist('გლობ. ფასნამატი გამოყენებულია');
  renderUnits();
  refreshDashboard();
}

// ─── MISSION ────────────────────────────────────────────
function fillMission() {
  const m = proj.mission || {};
  setVal('m_mc',   m.mechanics_count||2);
  setVal('m_md',   m.mechanics_days||30);
  setVal('m_mv',   m.mechanics_visits||1);
  setVal('m_ec',   m.electricians_count||2);
  setVal('m_ed',   m.electricians_days||10);
  setVal('m_ev',   m.electricians_visits||1);
  setVal('m_ac',   m.admin_count||1);
  setVal('m_ad',   m.admin_days||10);
  setVal('m_av',   m.admin_visits||4);
  setVal('m_dist', m.distance_km||400);
  setVal('m_fp',   m.fuel_price_gel||0);
  setVal('m_fc',   m.fuel_consumption_per_100km||10);
  setVal('m_food', m.food_per_day_gel||0);
  setVal('m_acc',  m.accommodation_per_day_gel||0);
  calcMission();
}

function calcMission() {
  const g = getVal;
  const mc=+g('m_mc'),md=+g('m_md'),mv=+g('m_mv');
  const ec=+g('m_ec'),ed=+g('m_ed'),ev=+g('m_ev');
  const ac=+g('m_ac'),ad=+g('m_ad'),av=+g('m_av');
  const dist=+g('m_dist'), fp=+g('m_fp'), fc=+g('m_fc');
  const food=+g('m_food'), acc=+g('m_acc');

  const totalVisits = mv+ev+av;
  const totalDist   = totalVisits * dist * 2;
  const fuelGel     = totalDist * (fc/100) * fp;
  const foodGel     = (mc*md + ec*ed + ac*ad) * food;
  const accomGel    = (mc*md + ec*ed + ac*ad) * acc;
  const totalGel    = fuelGel + foodGel + accomGel;

  const cur = DB.currency;
  const g2e = v => (v/cur.eur_gel).toFixed(2);
  const g2u = v => (v/cur.usd_gel).toFixed(2);
  const f   = v => fmtN(v);

  document.getElementById('missionResult').innerHTML = `
    <div class="card-hd">📋 მივლინება — სარეზიუმე</div>
    <table class="rt">
      <thead><tr><th>პოზ.</th><th>GEL</th><th>USD</th><th>EUR</th></tr></thead>
      <tbody>
        <tr><td class="v-lbl">სულ ვიზიტი</td><td class="v-gel">${totalVisits}</td><td></td><td></td></tr>
        <tr><td class="v-lbl">სულ მანძ. (კმ)</td><td class="v-gel">${totalDist}</td><td></td><td></td></tr>
        <tr><td class="v-lbl">საწვავი</td><td class="v-gel">${f(fuelGel)}</td><td class="v-usd">${g2u(fuelGel)}</td><td class="v-eur">${g2e(fuelGel)}</td></tr>
        <tr><td class="v-lbl">კვება</td><td class="v-gel">${f(foodGel)}</td><td class="v-usd">${g2u(foodGel)}</td><td class="v-eur">${g2e(foodGel)}</td></tr>
        <tr><td class="v-lbl">სასტუმრო</td><td class="v-gel">${f(accomGel)}</td><td class="v-usd">${g2u(accomGel)}</td><td class="v-eur">${g2e(accomGel)}</td></tr>
        <tr class="total-row"><td class="v-lbl">სულ</td><td class="v-gel">${f(totalGel)}</td><td class="v-usd">${g2u(totalGel)}</td><td class="v-eur">${g2e(totalGel)}</td></tr>
      </tbody>
    </table>`;
}

function saveMission() {
  const g = getVal;
  proj.mission = {
    mechanics_count:+g('m_mc'),mechanics_days:+g('m_md'),mechanics_visits:+g('m_mv'),
    electricians_count:+g('m_ec'),electricians_days:+g('m_ed'),electricians_visits:+g('m_ev'),
    admin_count:+g('m_ac'),admin_days:+g('m_ad'),admin_visits:+g('m_av'),
    distance_km:+g('m_dist'),fuel_price_gel:+g('m_fp'),
    fuel_consumption_per_100km:+g('m_fc'),
    food_per_day_gel:+g('m_food'),accommodation_per_day_gel:+g('m_acc')
  };
  persist('მივლინება შენახულია');
}

// ─── RESULTS ────────────────────────────────────────────
function setScenario(sc) {
  currentScenario = sc;
  document.querySelectorAll('.sc-btn').forEach(b => b.classList.toggle('active', b.id==='sc_'+sc));
  const s = SCENARIOS[sc];
  setVal('sc_l', s.l); setVal('sc_i', s.i); setVal('sc_c', s.c);
  recalcResults();
}

function getMissionCostGel() {
  const m = proj.mission;
  if (!m) return 0;
  const totalVisits = (m.mechanics_visits||0) + (m.electricians_visits||0) + (m.admin_visits||0);
  const totalDist   = totalVisits * (m.distance_km||0) * 2;
  const fuelGel     = totalDist * ((m.fuel_consumption_per_100km||0)/100) * (m.fuel_price_gel||0);
  const foodGel     = ((m.mechanics_count||0)*(m.mechanics_days||0) + (m.electricians_count||0)*(m.electricians_days||0) + (m.admin_count||0)*(m.admin_days||0)) * (m.food_per_day_gel||0);
  const accomGel    = ((m.mechanics_count||0)*(m.mechanics_days||0) + (m.electricians_count||0)*(m.electricians_days||0) + (m.admin_count||0)*(m.admin_days||0)) * (m.accommodation_per_day_gel||0);
  return fuelGel + foodGel + accomGel;
}

async function recalcResults() {
  if (!proj) return;
  try {
    const lPct = +getVal('sc_l')||15;
    const iPct = +getVal('sc_i')||50;
    const cPct = +getVal('sc_c')||5;
    const dispCur = getVal('sc_cur')||'EUR';

    const missionGel = getMissionCostGel();
    const missionEur = missionGel / DB.currency.eur_gel;
    const perUnitMissionEur = proj.units.length > 0 ? missionEur / proj.units.length : 0;

    const modUnits = proj.units.map(u => {
      let missionInUnitCur = perUnitMissionEur;
      if (u.currency === 'USD') missionInUnitCur = perUnitMissionEur * DB.currency.eur_usd;
      if (u.currency === 'GEL') missionInUnitCur = perUnitMissionEur * DB.currency.eur_gel;
      return {
        ...u, 
        lift_markup_pct:lPct, 
        install_markup_pct:iPct, 
        contingency_pct:cPct,
        other_expense: (u.other_expense || 0) + missionInUnitCur
      };
    });

    const results = await calcUnits(modUnits, DB.currency);
    const c = document.getElementById('resultsContainer');
    c.innerHTML = '';

    let grandPrice=0, grandRev=0;
    const k = dispCur.toLowerCase();
    results.forEach((r,i) => {
      c.appendChild(buildResultCard(r, proj.units[i], dispCur));
      grandPrice += r.price_inc_vat?.[k]||0;
      grandRev   += r.revenue?.[k]||0;
    });

    // grand summary
    const gs = document.getElementById('grandSummary');
    if (results.length > 1) {
      gs.style.display = 'block';
      const gm = grandPrice>0 ? grandRev/grandPrice*100 : 0;
      const mc = gm>15?'var(--green2)':gm>8?'var(--yellow2)':'var(--red2)';
      gs.innerHTML = `
        <div class="card-hd">📊 პროექტის სრული სარეზიუმე — ${proj.name}</div>
        <div class="metrics-strip" style="margin-bottom:16px">
          <div class="metric"><div class="metric-label">სულ ფასი ${dispCur} (დღგ-ით)</div><div class="metric-value" style="color:var(--purple2)">${fmtN(grandPrice)}</div><div class="metric-sub">${dispCur}</div></div>
          <div class="metric"><div class="metric-label">სულ შემოსავ. ${dispCur}</div><div class="metric-value" style="color:var(--green2)">${fmtN(grandRev)}</div><div class="metric-sub">${dispCur}</div></div>
          <div class="metric"><div class="metric-label">GEL (ფასი)</div><div class="metric-value" style="color:var(--accent2)">${fmtN(dispCur==='GEL'?grandPrice:grandPrice*(dispCur==='USD'?DB.currency.usd_gel:DB.currency.eur_gel))}</div><div class="metric-sub">GEL</div></div>
          <div class="metric"><div class="metric-label">საერთო მარჟა</div><div class="metric-value" style="color:${mc}">${gm.toFixed(2)}%</div>
            <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(gm*3,100)}%;background:${mc}"></div></div></div>
        </div>
        <table class="rt">
          <thead><tr><th>სახ.</th><th>ID</th><th>ბრ./მოდ.</th><th>ტვ.</th><th>ფ. გ/დღგ (${dispCur})</th><th>EUR (დ/ვ)</th><th>GEL (დ/ვ)</th><th>შემ. EUR</th><th>მარჟა</th><th>წილი %</th></tr></thead>
          <tbody>${results.map((r,i) => {
            const u = proj.units[i]||{};
            const mc2 = r.tm_pct>15?'bg-g':r.tm_pct>8?'bg-y':'bg-r';
            const share = grandPrice > 0 ? ((r.price_inc_vat?.[k] || 0) / grandPrice * 100).toFixed(1) : 0;
            return `<tr>
              <td><span class="unit-type-badge ${r.type==='lift'?'badge-lift':r.type==='escalator'?'badge-escalator':'badge-travelator'}">${r.type}</span></td>
              <td class="v-lbl"><b>${r.id}</b></td>
              <td class="v-lbl">${u.brand||''} ${u.model||''}</td>
              <td class="v-lbl">${u.capacity||''}</td>
              <td class="v-trade">${fmtV(r.price_ex_vat, dispCur)}</td>
              <td class="v-eur">${fmtN(r.price_inc_vat?.eur)}</td>
              <td class="v-gel">${fmtN(r.price_inc_vat?.gel)}</td>
              <td class="v-gel">${fmtN(r.revenue?.eur)}</td>
              <td><span class="badge ${mc2}">${r.tm_pct?.toFixed(1)}%</span></td>
              <td class="v-share" style="color:var(--muted)">${share}%</td>
            </tr>`;
          }).join('')}</tbody>
        </table>`;
    } else {
      gs.style.display = 'none';
    }
  } catch (e) {
    console.error('Recalc results failed:', e);
    toast('შედეგების განახლების შეცდომა', 'err');
  }
}

function buildResultCard(r, u, dispCur) {
  const mc = r.tm_pct>15?'var(--green2)':r.tm_pct>8?'var(--yellow2)':'var(--red2)';
  const mw = Math.min((r.tm_pct||0)*3, 100);
  const typeBadge = r.type==='lift'?'badge-lift':r.type==='escalator'?'badge-escalator':'badge-travelator';

  const el = document.createElement('div');
  el.className = 'card mb';
  el.innerHTML = `
    <div class="card-hd"><span class="unit-type-badge ${typeBadge}">${r.type}</span> ${r.id} — ${u?.brand||''} ${u?.model||''} | ${u?.capacity||''} | ${u?.floors||''}სართ. | ${r.currency}</div>
    <div class="metrics-strip" style="margin-bottom:14px">
      <div class="metric"><div class="metric-label">ფასი გ/დღგ (${dispCur})</div><div class="metric-value" style="color:var(--yellow2)">${fmtV(r.price_ex_vat,dispCur)}</div></div>
      <div class="metric"><div class="metric-label">ფასი დღგ-ით (${dispCur})</div><div class="metric-value" style="color:var(--purple2)">${fmtV(r.price_inc_vat,dispCur)}</div></div>
      <div class="metric"><div class="metric-label">შემოსავ. ${dispCur}</div><div class="metric-value" style="color:var(--green2)">${fmtV(r.revenue,dispCur)}</div></div>
      <div class="metric"><div class="metric-label">მარჟა %</div><div class="metric-value" style="color:${mc}">${r.tm_pct?.toFixed(2)}%</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${mw}%;background:${mc}"></div></div></div>
    </div>
    ${buildMiniTable(r, dispCur)}`;
  return el;
}

// ─── FINAL PROJECT ──────────────────────────────────────
async function refreshFinalProject() {
  if (!proj) return;
  const cur = DB.currency;
  const results = await calcUnits(proj.units, cur);
  const c = document.getElementById('finalProjectContainer');
  c.innerHTML = '';

  const totalEur = results.reduce((s, r) => s + (r.price_inc_vat?.eur || 0), 0);
  const totalGel = results.reduce((s, r) => s + (r.price_inc_vat?.gel || 0), 0);

  const card = document.createElement('div');
  card.className = 'card final-proposal';
  card.innerHTML = `
    <div class="proposal-header">
      <div class="proposal-title">კომერციული წინადადება</div>
      <div class="proposal-meta">
        <div>პროექტი: <b>${proj.name}</b></div>
        <div>თარიღი: <b>${new Date().toLocaleDateString('ka-GE')}</b></div>
        <div>ადგილმდებარეობა: <b>${proj.location || 'თბილისი'}</b></div>
      </div>
    </div>
    
    <div class="proposal-body">
      <p>მოგესალმებით,</p>
      <p>წარმოგიდგენთ კომერციულ შეთავაზებას თქვენი პროექტისთვის <b>"${proj.name}"</b>. 
      ჩვენი გუნდი მზად არის უზრუნველყოს უმაღლესი ხარისხის მომსახურება და დანადგარების მონტაჟი.</p>
      
      <div class="sec-title">📦 დანადგარების ჩამონათვალი</div>
      <table class="rt mb">
        <thead>
          <tr>
            <th>ID</th>
            <th>სახეობა</th>
            <th>ბრენდი / მოდელი</th>
            <th>მახასიათებლები</th>
            <th>ფასი (დღგ-ით)</th>
          </tr>
        </thead>
        <tbody>
          ${results.map(r => {
            const u = proj.units.find(x => x.id === r.id) || {};
            return `
            <tr>
              <td><b>${r.id}</b></td>
              <td>${r.type}</td>
              <td>${u.brand || ''} ${u.model || ''}</td>
              <td>${u.capacity || ''} კგ | ${u.floors || ''} სართ.</td>
              <td class="v-eur">${fmtN(r.price_inc_vat?.eur)} EUR</td>
            </tr>`;
          }).join('')}
        </tbody>
        <tfoot>
          <tr class="grand-row">
            <td colspan="4" style="text-align:right"><b>ჯამური ღირებულება:</b></td>
            <td class="v-eur"><b>${fmtN(totalEur)} EUR</b></td>
          </tr>
          <tr class="total-row">
            <td colspan="4" style="text-align:right"><b>ჯამური ღირებულება (GEL):</b></td>
            <td class="v-gel"><b>${fmtN(totalGel)} GEL</b></td>
          </tr>
        </tfoot>
      </table>

      <div class="sec-title">📜 პირობები</div>
      <ul class="proposal-terms">
        <li>${proj.proposal?.vat_text || 'ფასები მოცემულია დღგ-ს ჩათვლით.'}</li>
        <li>${proj.proposal?.payment_text || 'გადახდის პირობები: შეთანხმებით.'}</li>
        <li>${proj.proposal?.guarantee_text || 'გარანტია: სტანდარტული ქარხნული გარანტია.'}</li>
        <li>${proj.proposal?.validity_text || 'შეთავაზება ძალაშია 30 კალენდარული დღის განმავლობაში.'}</li>
      </ul>
      
      <div class="proposal-footer mt">
        <p>${proj.proposal?.sign_prefix || 'პატივისცემით,'}</p>
        <p><b>${proj.proposal?.sign_name || 'KLEEMANN Calculator Pro Team'}</b></p>
      </div>
    </div>
  `;
  c.appendChild(card);
}

function fillProposalSettings() {
  const p = proj.proposal || {
    vat_text: "ფასები მოცემულია დღგ-ს ჩათვლით.",
    payment_text: "გადახდის პირობები: შეთანხმებით.",
    guarantee_text: "გარანტია: სტანდარტული ქარხნული გარანტია.",
    validity_text: "შეთავაზება ძალაშია 30 კალენდარული დღის განმავლობაში.",
    sign_prefix: "პატივისცემით,",
    sign_name: "KLEEMANN Calculator Pro Team"
  };
  setVal('prop_vat', p.vat_text);
  setVal('prop_pay', p.payment_text);
  setVal('prop_gua', p.guarantee_text);
  setVal('prop_val', p.validity_text);
  setVal('prop_sp',  p.sign_prefix);
  setVal('prop_sn',  p.sign_name);
}

function saveProposalSettings() {
  proj.proposal = {
    vat_text: getVal('prop_vat'),
    payment_text: getVal('prop_pay'),
    guarantee_text: getVal('prop_gua'),
    validity_text: getVal('prop_val'),
    sign_prefix: getVal('prop_sp'),
    sign_name: getVal('prop_sn')
  };
  persist('შეთავაზების პარამეტრები შენახულია');
  refreshFinalProject();
}

// ─── ANALYSIS ───────────────────────────────────────────
async function refreshAnalysis() {
  if (!proj || !proj.units.length) {
    document.getElementById('tab-analysis').querySelectorAll('.chart-container, .table-wrap, .stats-grid').forEach(el => el.innerHTML = '<p class="muted">მონაცემები არ არის</p>');
    return;
  }
  try {
    const results = await calcUnits(proj.units, DB.currency);
    renderBrandAnalysis(results, proj.units);
    renderFloorAnalysis(results, proj.units);
    renderABCAnalysis(results, proj.units);
    renderEfficiencyStats(results, proj.units);
    renderTimeAnalysis(results, proj.units);
  } catch (e) {
    console.error('Analysis failed:', e);
    toast('ანალიზის შეცდომა', 'err');
  }
}

function renderBrandAnalysis(results, units) {
  const data = {};
  results.forEach((r, i) => {
    const brand = units[i].brand || 'Unknown';
    if (!data[brand]) data[brand] = { name: brand, value: 0, revenue: 0 };
    data[brand].value += r.price_inc_vat?.eur || 0;
    data[brand].revenue += r.revenue?.eur || 0;
  });
  const chartData = Object.values(data).sort((a,b) => b.value - a.value);
  createBarChart('#brandChart', chartData, 'name', 'revenue', 'EUR');
}

function renderFloorAnalysis(results, units) {
  const data = results.map((r, i) => ({
    floors: +(units[i].floors || 0),
    price: r.price_inc_vat?.eur || 0,
    id: r.id
  })).sort((a,b) => a.floors - b.floors);
  
  // Group by floors to see average price
  const grouped = d3.groups(data, d => d.floors).map(([floors, items]) => ({
    floors,
    avgPrice: d3.mean(items, i => i.price)
  }));
  
  createBarChart('#floorChart', grouped, 'floors', 'avgPrice', 'EUR (Avg)');
}

function renderABCAnalysis(results, units) {
  const data = results.map((r, i) => ({
    id: r.id,
    brand: units[i].brand || 'Unknown',
    value: r.price_inc_vat?.eur || 0
  })).sort((a,b) => b.value - a.value);

  const totalValue = d3.sum(data, d => d.value);
  let cumulative = 0;
  data.forEach(d => {
    cumulative += d.value;
    const pct = (cumulative / totalValue) * 100;
    if (pct <= 70) d.cat = 'A';
    else if (pct <= 90) d.cat = 'B';
    else d.cat = 'C';
  });

  const container = document.getElementById('abcTable');
  container.innerHTML = `
    <table class="rt">
      <thead><tr><th>ID</th><th>ბრენდი</th><th>ღირებ. (EUR)</th><th>კატეგორია</th></tr></thead>
      <tbody>
        ${data.map(d => `
          <tr>
            <td>${d.id}</td>
            <td>${d.brand}</td>
            <td>${fmtN(d.value)}</td>
            <td><span class="abc-badge abc-${d.cat.toLowerCase()}">${d.cat}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderEfficiencyStats(results, units) {
  const totalEur = d3.sum(results, r => r.price_inc_vat?.eur || 0);
  const totalRev = d3.sum(results, r => r.revenue?.eur || 0);
  const totalFloors = d3.sum(units, u => +(u.floors || 0));
  const avgMargin = totalEur > 0 ? (totalRev / totalEur) * 100 : 0;
  const pricePerFloor = totalFloors > 0 ? totalEur / totalFloors : 0;

  const container = document.getElementById('efficiencyStats');
  container.innerHTML = `
    <div class="metric"><div class="metric-label">საშ. მარჟა</div><div class="metric-value">${avgMargin.toFixed(1)}%</div></div>
    <div class="metric"><div class="metric-label">ფასი / სართულზე</div><div class="metric-value">${fmtN(pricePerFloor)}</div><div class="metric-sub">EUR</div></div>
    <div class="metric"><div class="metric-label">დანადგ. რაოდ.</div><div class="metric-value">${units.length}</div></div>
    <div class="metric"><div class="metric-label">სულ სართული</div><div class="metric-value">${totalFloors}</div></div>
  `;
}

function renderTimeAnalysis(results, units) {
  const data = {};
  results.forEach((r, i) => {
    const year = proj.delivery_year || 2026;
    if (!data[year]) data[year] = { year, value: 0 };
    data[year].value += r.price_inc_vat?.eur || 0;
  });
  const chartData = Object.values(data).sort((a,b) => a.year - b.year);
  createBarChart('#timeChart', chartData, 'year', 'value', 'EUR');
}

function createBarChart(selector, data, xKey, yKey, unit) {
  const container = d3.select(selector);
  container.selectAll('*').remove();
  
  const width = container.node().getBoundingClientRect().width || 400;
  const height = 300;
  const margin = { top: 20, right: 20, bottom: 40, left: 60 };

  const svg = container.append('svg')
    .attr('width', width)
    .attr('height', height);

  const x = d3.scaleBand()
    .domain(data.map(d => d[xKey]))
    .range([margin.left, width - margin.right])
    .padding(0.3);

  const y = d3.scaleLinear()
    .domain([0, d3.max(data, d => d[yKey]) * 1.1 || 100])
    .nice()
    .range([height - margin.bottom, margin.top]);

  // Grid lines
  svg.append('g')
    .attr('class', 'grid')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).tickSize(-(width - margin.left - margin.right)).tickFormat(''))
    .style('stroke', 'var(--border)')
    .style('stroke-opacity', 0.2);

  // Bars
  svg.selectAll('.bar')
    .data(data)
    .enter().append('rect')
    .attr('class', 'bar-rect')
    .attr('x', d => x(d[xKey]))
    .attr('y', height - margin.bottom)
    .attr('width', x.bandwidth())
    .attr('height', 0)
    .attr('fill', 'var(--accent)')
    .attr('rx', 4)
    .transition()
    .duration(800)
    .attr('y', d => y(d[yKey]))
    .attr('height', d => height - margin.bottom - y(d[yKey]));

  // X Axis
  svg.append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x))
    .selectAll('text')
    .attr('class', 'axis-label')
    .style('fill', 'var(--text2)');

  // Y Axis
  svg.append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5).tickFormat(d => d >= 1000 ? (d/1000)+'k' : d))
    .selectAll('text')
    .attr('class', 'axis-label')
    .style('fill', 'var(--text2)');

  // Tooltip
  const tooltip = container.append('div').attr('class', 'chart-tooltip').style('opacity', 0);
  
  svg.selectAll('.bar-rect')
    .on('mouseover', (e, d) => {
      tooltip.transition().duration(200).style('opacity', 1);
      tooltip.html(`<b>${d[xKey]}</b><br>${fmtN(d[yKey])} ${unit}`)
        .style('left', (e.offsetX + 10) + 'px')
        .style('top', (e.offsetY - 10) + 'px');
    })
    .on('mousemove', (e) => {
      tooltip.style('left', (e.offsetX + 10) + 'px')
        .style('top', (e.offsetY - 10) + 'px');
    })
    .on('mouseout', () => {
      tooltip.transition().duration(500).style('opacity', 0);
    });
}

// ─── FULL ANALYSIS ──────────────────────────────────────
async function aggregateAllProjects() {
  if (!DB || !DB.projects) return null;
  loader(true);
  try {
    const allResults = await Promise.all(DB.projects.map(async p => {
      const res = await calcUnits(p.units, 'EUR');
      return { project: p, results: res };
    }));

    const stats = {
      totalProjects: DB.projects.length,
      totalUnits: 0,
      totalEur: 0,
      totalRev: 0,
      totalFloors: 0
    };

    const brandData = {};
    const floorData = [];
    const abcData = [];
    const timeData = {};

    allResults.forEach(({ project, results }) => {
      results.forEach((r, i) => {
        const u = project.units[i];
        const brand = u.brand || 'Unknown';
        const eur = r.price_inc_vat?.eur || 0;
        const rev = r.revenue?.eur || 0;
        const floors = +(u.floors || 0);

        stats.totalUnits++;
        stats.totalEur += eur;
        stats.totalRev += rev;
        stats.totalFloors += floors;

        if (!brandData[brand]) brandData[brand] = { name: brand, value: 0, revenue: 0 };
        brandData[brand].value += eur;
        brandData[brand].revenue += rev;

        floorData.push({ floors, price: eur });

        abcData.push({
          id: r.id,
          brand,
          value: eur,
          projectName: project.name
        });

        const year = project.delivery_year || 2026;
        if (!timeData[year]) timeData[year] = { year, value: 0 };
        timeData[year].value += eur;
      });
    });

    // ABC categorization
    abcData.sort((a, b) => b.value - a.value);
    let cumulative = 0;
    abcData.forEach(d => {
      cumulative += d.value;
      const pct = (cumulative / stats.totalEur) * 100;
      if (pct <= 70) d.cat = 'A';
      else if (pct <= 90) d.cat = 'B';
      else d.cat = 'C';
    });

    return { stats, brandData, floorData, abc: abcData, timeData };
  } finally {
    loader(false);
  }
}

async function refreshFullAnalysis() {
  try {
    const data = await aggregateAllProjects();
    if (!data) return;

    // Metrics
    const ms = document.getElementById('fullMetricsStrip');
    ms.innerHTML = `
      <div class="metric-card">
        <div class="m-label">სულ პროექტები</div>
        <div class="m-val">${data.stats.totalProjects}</div>
      </div>
      <div class="metric-card">
        <div class="m-label">სულ დანადგარები</div>
        <div class="m-val">${data.stats.totalUnits}</div>
      </div>
      <div class="metric-card">
        <div class="m-label">ჯამური ღირებულება</div>
        <div class="m-val">${fmtN(data.stats.totalEur)} <small>EUR</small></div>
      </div>
      <div class="metric-card">
        <div class="m-label">საშუალო მარჟა</div>
        <div class="m-val">${(data.stats.totalEur > 0 ? (data.stats.totalRev / data.stats.totalEur * 100) : 0).toFixed(1)}%</div>
      </div>
    `;

    // Brand Chart
    const brandChartData = Object.values(data.brandData).sort((a, b) => b.value - a.value);
    createBarChart('#fullBrandChart', brandChartData, 'name', 'revenue', 'EUR');

    // Floor Chart
    const floorGrouped = d3.groups(data.floorData, d => d.floors).map(([floors, items]) => ({
      floors,
      avgPrice: d3.mean(items, i => i.price)
    })).sort((a, b) => a.floors - b.floors);
    createBarChart('#fullFloorChart', floorGrouped, 'floors', 'avgPrice', 'EUR (Avg)');

    // ABC Table
    const abcContainer = document.getElementById('fullAbcTable');
    abcContainer.innerHTML = `
      <table class="rt">
        <thead><tr><th>პროექტი</th><th>ID</th><th>ბრენდი</th><th>EUR</th><th>ABC</th></tr></thead>
        <tbody>
          ${data.abc.slice(0, 20).map(d => `
            <tr>
              <td class="v-lbl">${d.projectName}</td>
              <td>${d.id}</td>
              <td>${d.brand}</td>
              <td>${fmtN(d.value)}</td>
              <td><span class="abc-badge abc-${d.cat.toLowerCase()}">${d.cat}</span></td>
            </tr>
          `).join('')}
          ${data.abc.length > 20 ? `<tr><td colspan="5" class="muted" style="text-align:center">...და კიდევ ${data.abc.length - 20} დანადგარი</td></tr>` : ''}
        </tbody>
      </table>
    `;

    // Efficiency Stats
    const effContainer = document.getElementById('fullEfficiencyStats');
    const pricePerFloor = data.stats.totalFloors > 0 ? data.stats.totalEur / data.stats.totalFloors : 0;
    effContainer.innerHTML = `
      <div class="metric"><div class="metric-label">ფასი / სართულზე (საშ)</div><div class="metric-value">${fmtN(pricePerFloor)}</div><div class="metric-sub">EUR</div></div>
      <div class="metric"><div class="metric-label">საშ. დანადგ. პროექტში</div><div class="metric-value">${(data.stats.totalUnits / data.stats.totalProjects).toFixed(1)}</div></div>
      <div class="metric"><div class="metric-label">საშ. სართ. დანადგარზე</div><div class="metric-value">${(data.stats.totalFloors / data.stats.totalUnits).toFixed(1)}</div></div>
      <div class="metric"><div class="metric-label">მომგებიანობა</div><div class="metric-value">${fmtN(data.stats.totalRev)}</div><div class="metric-sub">EUR</div></div>
    `;

    // Time Chart
    const timeChartData = Object.values(data.timeData).sort((a, b) => a.year - b.year);
    createBarChart('#fullTimeChart', timeChartData, 'year', 'value', 'EUR');
  } catch (e) {
    console.error('Full analysis failed:', e);
    toast('სრული ანალიზის შეცდომა', 'err');
  }
}

// ─── EXPORT & PRINT ─────────────────────────────────────
async function exportToExcel(type) {
  if (!proj) return;
  const cur = DB.currency;
  const results = await calcUnits(proj.units, cur);
  
  let data = [];
  let filename = `${proj.name}_${type}_${new Date().toISOString().slice(0,10)}.xlsx`;

  if (type === 'results') {
    data = results.map(r => {
      const u = proj.units.find(x => x.id === r.id) || {};
      return {
        'ID': r.id,
        'სახეობა': r.type,
        'ბრენდი': u.brand,
        'მოდელი': u.model,
        'ტევადობა': u.capacity,
        'სართულები': u.floors,
        'ფასი (EUR)': r.price_inc_vat?.eur,
        'ფასი (GEL)': r.price_inc_vat?.gel,
        'მარჟა %': r.tm_pct?.toFixed(2)
      };
    });
  } else if (type === 'final') {
    data = results.map(r => {
      const u = proj.units.find(x => x.id === r.id) || {};
      return {
        'პროექტი': proj.name,
        'ID': r.id,
        'დანადგარი': `${r.type} ${u.brand} ${u.model}`,
        'მახასიათებლები': `${u.capacity} კგ / ${u.floors} სართ.`,
        'ფასი EUR (დღგ-ით)': r.price_inc_vat?.eur,
        'ფასი GEL (დღგ-ით)': r.price_inc_vat?.gel
      };
    });
  } else if (type === 'analysis') {
    const results = await calcUnits(proj.units, DB.currency);
    const totalEur = d3.sum(results, r => r.price_inc_vat?.eur || 0);
    const totalRev = d3.sum(results, r => r.revenue?.eur || 0);
    
    // ABC Data
    const abcData = results.map((r, i) => ({
      id: r.id,
      brand: proj.units[i].brand || 'Unknown',
      value: r.price_inc_vat?.eur || 0
    })).sort((a,b) => b.value - a.value);

    let cumulative = 0;
    data = abcData.map(d => {
      cumulative += d.value;
      const pct = (cumulative / totalEur) * 100;
      let cat = 'C';
      if (pct <= 70) cat = 'A';
      else if (pct <= 90) cat = 'B';
      return {
        'ID': d.id,
        'ბრენდი': d.brand,
        'ღირებულება (EUR)': d.value,
        'კუმულატიური %': pct.toFixed(1),
        'ABC კატეგორია': cat
      };
    });
    
    data.push({});
    data.push({ 'ID': 'ჯამური რეიტინგი', 'ბრენდი': 'მარჟა %', 'ღირებულება (EUR)': ((totalRev/totalEur)*100).toFixed(1) + '%' });
  } else if (type === 'full_analysis') {
    const allData = await aggregateAllProjects();
    data = allData.abc.map(d => ({
      'პროექტი': d.projectName,
      'ID': d.id,
      'ბრენდი': d.brand,
      'ღირებულება (EUR)': d.value,
      'კატეგორია': d.cat
    }));
    data.push({});
    data.push({ 'პროექტი': 'სულ პროექტები', 'ID': allData.stats.totalProjects });
    data.push({ 'პროექტი': 'სულ ღირებულება (EUR)', 'ID': allData.stats.totalEur });
  } else if (type === 'dashboard') {
    data = results.map(r => {
      const u = proj.units.find(x => x.id === r.id) || {};
      return {
        'ID': r.id,
        'ტიპი': r.type,
        'ბრენდი': u.brand,
        'მოდელი': u.model,
        'ტევადობა': u.capacity,
        'სართულები': u.floors,
        'ფასი (EUR)': r.price_ex_vat?.eur,
        'ფასი (GEL)': r.price_ex_vat?.gel,
        'მარჟა %': r.tm_pct?.toFixed(2)
      };
    });
    // Add summary row
    const totalEur = results.reduce((s, r) => s + (r.price_inc_vat?.eur || 0), 0);
    data.push({});
    data.push({ 'ID': 'ჯამი (დღგ-ით)', 'ფასი (EUR)': totalEur });
  } else if (type === 'units') {
    data = proj.units.map(u => {
      return {
        'ID': u.id,
        'ტიპი': u.type,
        'ბრენდი': u.brand,
        'მოდელი': u.model,
        'ტევადობა': u.capacity,
        'სართულები': u.floors,
        'ქარხნული ფასი': u.factory_price,
        'ბანკის საკომისიო': u.bank_fee,
        'საერთ. ტრანსპორტი': u.intl_transport,
        'ტერმინალი': u.terminal_fee,
        'ადგ. ტრანსპორტი': u.local_transport,
        'მონტაჟის ხელფასი': u.install_labor,
        'ელექტროობა': u.electrical,
        'საცხოვრებელი': u.accommodation,
        'კვება': u.food,
        'საწვავი': u.fuel,
        'მასალები': u.materials,
        'ლიფტის ფასნამატი %': u.lift_markup_pct,
        'მონტაჟის ფასნამატი %': u.install_markup_pct,
        'გაუთვ. ხარჯი %': u.contingency_pct,
        'სხვა ხარჯი': u.other_expense,
        'დღგ %': u.vat_pct
      };
    });
  } else if (type === 'mission') {
    const m = proj.mission || {};
    data = [
      { 'კატეგორია': 'მექანიკოსები', 'რაოდენობა': m.mechanics_count, 'დღეები': m.mechanics_days, 'ვიზიტები': m.mechanics_visits },
      { 'კატეგორია': 'ელექტრიკოსები', 'რაოდენობა': m.electricians_count, 'დღეები': m.electricians_days, 'ვიზიტები': m.electricians_visits },
      { 'კატეგორია': 'ადმინისტრაცია', 'რაოდენობა': m.admin_count, 'დღეები': m.admin_days, 'ვიზიტები': m.admin_visits },
      {},
      { 'კატეგორია': 'მანძილი (კმ)', 'მნიშვნელობა': m.distance_km },
      { 'კატეგორია': 'საწვავის ფასი', 'მნიშვნელობა': m.fuel_price_gel },
      { 'კატეგორია': 'მოხმარება', 'მნიშვნელობა': m.fuel_consumption_per_100km },
      { 'კატეგორია': 'კვება (დღეში)', 'მნიშვნელობა': m.food_per_day_gel },
      { 'კატეგორია': 'სასტუმრო (დღეში)', 'მნიშვნელობა': m.accommodation_per_day_gel },
      {},
      { 'კატეგორია': 'ჯამური ღირებულება (GEL)', 'მნიშვნელობა': getMissionCostGel() }
    ];
  }

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, filename);
  toast('ექსპორტი დასრულებულია', 'ok');
}

function printSection(id) {
  const content = document.getElementById('tab-' + id).innerHTML;
  const win = window.open('', '_blank');
  win.document.write(`
    <html>
      <head>
        <title>Print - ${proj.name}</title>
        <link rel="stylesheet" href="/static/css/style.css">
        <style>
          body { padding: 40px; background: white; color: black; }
          .btn, .scenario-bar, .flex-between button { display: none !important; }
          .card { border: 1px solid #eee; box-shadow: none; }
          .rt { width: 100%; border-collapse: collapse; }
          .rt th, .rt td { border: 1px solid #ddd; padding: 8px; }
          @media print {
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="print-container">
          ${content}
        </div>
        <script>
          setTimeout(() => { window.print(); window.close(); }, 500);
        </script>
      </body>
    </html>
  `);
  win.document.close();
}

// ─── CALC HELPER ────────────────────────────────────────
async function calcUnits(units, cur) {
  const r = await fetch('/api/calculate', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({units, currency: cur})
  });
  return r.json();
}

// ─── BACKUP ─────────────────────────────────────────────
async function createBackup() {
  const name = getVal('bkName').trim();
  const r = await fetch('/api/backup/create', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
  const d = await r.json();
  if (d.status==='ok') { toast('✅ ბექაპი: '+d.timestamp, 'ok'); setVal('bkName',''); loadBkList(); }
  else toast('❌ '+d.message, 'err');
}

async function loadBkList() {
  const r = await fetch('/api/backup/list');
  const list = await r.json();
  const c = document.getElementById('bkList');
  if (!list.length) { c.innerHTML = '<p class="muted">ბექაპი არ არის</p>'; return; }
  c.innerHTML = list.map(b => `
    <div class="bk-item">
      <div><div class="bk-name">📄 ${b.name}</div><div class="bk-meta">${b.modified} · ${(b.size/1024).toFixed(1)} KB</div></div>
      <div class="bk-actions">
        <a href="/api/backup/download/${b.name}" class="btn btn-sm btn-outline" download>⬇</a>
        <button class="btn btn-sm btn-warning" onclick="restoreBackup('${b.name}')">↩ აღდ.</button>
      </div>
    </div>`).join('');
}

async function restoreBackup(name) {
  if (!confirm(`„${name}" — აღდგენა?`)) return;
  const r = await fetch('/api/backup/restore', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
  const d = await r.json();
  if (d.status==='ok') {
    toast('✅ მონაცემები აღდგა', 'ok');
    await loadDB();
    setActiveProject(DB.active_project || DB.projects[0].id);
  } else toast('❌ '+d.message, 'err');
}

async function uploadBackup() {
  const file = document.getElementById('bkFile').files[0];
  if (!file) { toast('ფაილი არ არის', 'err'); return; }
  const fd = new FormData(); fd.append('file', file);
  const r = await fetch('/api/backup/upload', {method:'POST', body:fd});
  const d = await r.json();
  if (d.status==='ok') {
    toast('✅ ატვირთულია', 'ok');
    await loadDB();
    setActiveProject(DB.active_project || DB.projects[0].id);
  } else toast('❌ '+d.message, 'err');
}

async function doReset() {
  if (!confirm('ყველა მონაცემი გადაიტვირთება!')) return;
  await fetch('/api/backup/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'pre_reset'})});
  location.reload();
}

// ─── UTILS ──────────────────────────────────────────────
const getVal = id => document.getElementById(id)?.value ?? '';
const setVal = (id,v) => { const e=document.getElementById(id); if(e) e.value=v??''; };
const setTxt = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v??''; };

function fmtN(n) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return n.toLocaleString('ka-GE', {minimumFractionDigits:2, maximumFractionDigits:2});
}
function fmtV(obj, cur) {
  if (!obj) return '—';
  const k = cur==='EUR'?'eur':cur==='USD'?'usd':'gel';
  return fmtN(obj[k]);
}

function toast(msg, type='info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type==='ok'?'ok':type==='err'?'err':'info'}`;
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.className='toast', 3800);
}

function loader(show) {
  document.getElementById('loader').style.display = show ? 'flex' : 'none';
}

// init scenario defaults
setTimeout(() => setScenario('base'), 200);
