'use strict';

// Paste the Apps Script deployment URL ending in /exec. Leave blank for demo.
const API_URL = '';
const demo = !API_URL;
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
const icon = name => '<i data-lucide="' + name + '"></i>';
const drawIcons = () => window.lucide?.createIcons();
const routes = [
  ['dashboard','layout-dashboard','Dashboard'], ['harta','building-2','Senarai Harta'],
  ['kerja','clipboard-list','Agih Kerja'], ['profil','users-round','Profil / Staf']
];
const groups = ['Semua','Aduan Baru','Dalam Proses','Selesai'];
const next = {'Diagih':'Terima Tugas','Terima Tugas':'Sedang Dibaiki','Sedang Dibaiki':'Selesai'};
const demoStaff = [
  {id:'ADM01',nama:'Ketua Unit',jawatan:'Pentadbir UPHF',peranan:'Admin'},
  {id:'STF01',nama:'Amir Hakim',jawatan:'Juruteknik Mekanikal',peranan:'Staf'},
  {id:'STF02',nama:'Nur Izzati',jawatan:'Juruteknik Awam',peranan:'Staf'},
  {id:'STF03',nama:'Faiz Rahman',jawatan:'Juruteknik Elektrik',peranan:'Staf'},
  {id:'STF04',nama:'Siti Nabila',jawatan:'Penyelia Fasiliti',peranan:'Staf'}
];
const demoAssets = [
  ['AST-01','Pam Air Domestik','Mekanikal','Blok Temenggung','Aktif'],
  ['AST-02','Lif Penumpang','Mekanikal','Bangunan Tun Fatimah','Aktif'],
  ['AST-03','Panel Penggera Kebakaran','Elektrik','Bangunan Pentadbiran','Aktif'],
  ['AST-04','Unit Penghawa Dingin','Mekanikal','Dewan Delima','Aktif'],
  ['AST-05','Lampu Laluan Kecemasan','Elektrik','Dewan Nusantara','Aktif'],
  ['AST-06','Pintu Rintangan Api','Awam','Bangunan Pentadbiran','Penyelenggaraan']
].map(([id,nama,kategori,lokasi,status]) => ({id,nama,kategori,lokasi,status}));
const demoJobs = [
  ['Pam air tidak berfungsi','Blok Temenggung','Mekanikal','Mendesak','Baru',''],
  ['Kebocoran pada dinding tangga','Bangunan Pentadbiran','Awam','Tinggi','Diagih','STF02'],
  ['Penghawa dingin kurang sejuk','Dewan Delima','Mekanikal','Biasa','Sedang Dibaiki','STF01'],
  ['Lampu laluan tidak menyala','Dewan Nusantara','Elektrik','Biasa','Terima Tugas','STF03'],
  ['Pemeriksaan lampu kecemasan','Bangunan Pentadbiran','Elektrik','Biasa','Selesai','STF03'],
  ['Pelarasan pintu rintangan api','Bangunan Pentadbiran','Awam','Biasa','Selesai','STF02']
].map(([tajuk,lokasi,kategori,keutamaan,status,staf_id],i) =>
  ({id:'ADU-00'+(i+1),tarikh:'2026-11-12',tajuk,lokasi,kategori,keutamaan,status,staf_id,catatan:'',versi:'0'}));

const state = {route:'dashboard',group:'Semua',staffFilter:'',assetSearch:'',actor:null,jobs:[],assets:[],staff:[],token:sessionStorage.getItem('uphf-session') || '',busy:false,online:false};
let localJobs = demoJobs.map(job => ({...job}));
let localActor = demoStaff[0];

function demoRead() {
  return {actor:localActor, jobs:localJobs.filter(job => localActor.peranan === 'Admin' || job.staf_id === localActor.id),
    assets:demoAssets,staff:demoStaff};
}
async function api(action, fields = {}) {
  if (demo) {
    if (action === 'login') {
      localActor = demoStaff.find(person => person.id === fields.id);
      if (!localActor) throw Error('Pilih pengguna demo.');
    }
    if (action === 'assign' || action === 'advance') {
      const job = localJobs.find(item => item.id === fields.id);
      Object.assign(job, {status:action === 'assign' ? 'Diagih' : next[job.status],
        staf_id:fields.staffId || job.staf_id,catatan:fields.note,versi:String(Number(job.versi)+1)});
      return {...job};
    }
    return demoRead();
  }
  let response;
  try {
    response = await fetch(API_URL, {
      method:'POST', headers:{'Content-Type':'text/plain;charset=UTF-8'},
      body:JSON.stringify({action,token:state.token,...fields}), credentials:'omit',
      redirect:'follow',signal:AbortSignal.timeout(20000)
    });
  } catch (_) {
    throw Error('Google Sheets tidak dapat dihubungi. Semak sambungan dan URL Web App /exec.');
  }
  let result;
  try { result = await response.json(); }
  catch (_) { throw Error('Respons Web App tidak sah. Semak URL /exec dan tetapan akses Anyone.'); }
  if (!response.ok || !result.ok) throw Object.assign(Error(result.message || 'Permintaan gagal.'),{code:result.code});
  return result.data;
}
function showNotice(message = '', error = false) {
  $('notice').hidden = !message;
  $('notice').textContent = message;
  $('notice').classList.toggle('error',error);
}
function applySnapshot(data) {
  Object.assign(state,{actor:data.actor,jobs:data.jobs,assets:data.assets,staff:data.staff,online:!demo});
  if (data.token) {
    state.token = data.token;
    sessionStorage.setItem('uphf-session',data.token);
  }
}
function clearSession() {
  Object.assign(state,{actor:null,token:'',jobs:[],assets:[],staff:[],online:false,staffFilter:''});
  sessionStorage.removeItem('uphf-session');
}
async function load() {
  if (state.busy || (!demo && !state.token)) return;
  state.busy = true;
  $('refresh').disabled = true;
  showNotice('Memuatkan data…');
  try { applySnapshot(await api('read')); showNotice(); }
  catch (error) {
    state.online = false;
    if (error.code === 'AUTH') clearSession();
    showNotice(error.message,true);
  } finally {
    state.busy = false;
    $('refresh').disabled = false;
    render();
  }
}
function title(name, sub) {
  return '<div class="page-head"><h1>'+esc(name)+'</h1><p class="sub">'+esc(sub)+'</p></div>';
}
const initials = name => name.trim().split(/\s+/).slice(0,2).map(word => word[0]).join('').toUpperCase();
function avatars(staff) {
  const members = staff.filter(person => person.peranan === 'Staf');
  return '<div class="avatars">'+members.slice(0,5).map(person =>
    '<span class="avatar" title="'+esc(person.nama)+'" aria-label="'+esc(person.nama)+'">'+esc(initials(person.nama))+'</span>').join('')+
    (members.length > 5 ? '<span class="avatar">+'+(members.length-5)+'</span>' : '')+'</div>';
}
function progress(label, jobs) {
  const done = jobs.filter(job => job.status === 'Selesai').length;
  const pct = jobs.length ? Math.round(done / jobs.length * 100) : 0;
  return '<div class="progress-top"><span>'+esc(label)+'</span><strong>'+pct+'%</strong></div>'+
    '<progress max="100" value="'+pct+'" aria-label="'+esc(label)+'">'+pct+'%</progress>'+
    '<p class="meta">'+done+' daripada '+jobs.length+' selesai</p>';
}
function badge(status) {
  const tone = ['Selesai','Aktif'].includes(status) ? 'done' : status === 'Baru' ? 'new' : 'wait';
  return '<span class="badge '+tone+'">'+esc(status)+'</span>';
}
function stat(label,count,description,glyph) {
  return '<article class="card stat"><span class="logo">'+icon(glyph)+'</span><strong>'+count+'</strong><h3>'+label+'</h3><p class="meta">'+description+'</p></article>';
}
function jobCard(job, actionable) {
  const admin = state.actor.peranan === 'Admin';
  const assignee = state.staff.find(person => person.id === job.staf_id);
  const action = admin && ['Baru','Diagih'].includes(job.status) ? 'Agih kerja' :
    !admin && job.staf_id === state.actor.id ? next[job.status] : '';
  return '<article class="item"><div class="item-head"><div><p class="meta">'+esc(job.id)+' · '+esc(job.kategori)+
    '</p><h3 class="item-title">'+esc(job.tajuk)+'</h3></div>'+badge(job.status)+'</div>'+
    '<p class="meta">'+esc(job.lokasi)+(job.tarikh ? ' · '+esc(job.tarikh) : '')+'</p>'+
    '<p class="meta">'+esc(assignee?.nama || job.staf_id || 'Belum diagih')+' · '+esc(job.keutamaan || 'Biasa')+'</p>'+
    (job.catatan ? '<p class="meta">'+esc(job.catatan)+'</p>' : '')+
    (actionable && action ? '<div class="actions"><button class="btn primary" data-job="'+esc(job.id)+'">'+esc(action)+'</button></div>' : '')+'</article>';
}
function dashboard() {
  const priority = {Mendesak:0,Tinggi:1,Biasa:2,Rendah:3};
  const open = state.jobs.filter(job => job.status !== 'Selesai').sort((a,b) =>
    (priority[a.keutamaan] ?? 4)-(priority[b.keutamaan] ?? 4) || String(b.tarikh).localeCompare(String(a.tarikh)));
  const first = open[0];
  const inProgress = state.jobs.filter(job => ['Diagih','Terima Tugas','Sedang Dibaiki'].includes(job.status));
  const categories = [...new Set(state.jobs.map(job => job.kategori).filter(Boolean))].sort();
  const today = new Intl.DateTimeFormat('ms-MY',{dateStyle:'long',timeZone:'Asia/Kuala_Lumpur'}).format(new Date());
  return title('Dashboard Pengurusan Harta',today+' · '+(state.actor.peranan === 'Admin' ? 'Ringkasan operasi' : 'Ringkasan tugasan anda'))+
    '<section class="hero"><div><span class="badge '+(first?.keutamaan === 'Mendesak' ? 'urgent' : 'new')+'">'+esc(first?.keutamaan || 'Status kerja')+
    '</span><h2>'+esc(first?.tajuk || 'Tiada kerja terbuka')+'</h2><p class="meta">'+esc(first?.lokasi || 'Aduan aktif akan dipaparkan di sini.')+
    (first ? ' · '+esc(first.id) : '')+'</p><div class="actions"><a class="btn primary" href="#kerja">'+icon('clipboard-list')+
    (state.actor.peranan === 'Admin' ? 'Agih Kerja' : 'Tugasan Saya')+'</a><a class="btn" href="#harta">Lihat Senarai</a></div></div>'+
    '<span class="hero-art" aria-hidden="true">'+icon('wrench')+'</span></section>'+
    '<div class="bento">'+stat('Aset aktif',state.assets.filter(a => a.status === 'Aktif').length,'Dalam daftar harta','boxes')+
    stat('Kerja berjalan',inProgress.length,'Diagih atau sedang dibaiki','activity')+'</div>'+
    '<div class="split"><section class="card"><h2>Kemajuan penyelenggaraan</h2>'+progress('Keseluruhan',state.jobs)+
    categories.map(category => progress(category,state.jobs.filter(job => job.kategori === category))).join('')+'</section>'+
    '<section class="card"><h2>Pasukan teknikal</h2>'+avatars(state.staff)+'<p class="meta">'+state.staff.filter(person => person.peranan === 'Staf').length+
    ' staf aktif</p><div class="actions"><a class="btn" href="#profil">Lihat staf</a></div></section></div>'+
    '<section class="card"><div class="section-head"><h2>Kerja terbuka</h2><a href="#kerja" class="btn">Semua kerja</a></div>'+
    '<div class="list">'+(open.slice(0,4).map(job => jobCard(job,false)).join('') || '<p class="empty">Tiada kerja terbuka.</p>')+'</div></section>';
}
function assets() {
  return title('Senarai Harta','Daftar aset dan lokasi kemudahan UPHF.')+
    '<section class="card"><label class="field">Cari aset<input type="search" id="asset-search" placeholder="Nama, lokasi atau ID aset" value="'+esc(state.assetSearch)+'"></label><div id="asset-results" class="list"></div></section>';
}
function assetResults() {
  const term = state.assetSearch.trim().toLocaleLowerCase('ms');
  $('asset-results').innerHTML = state.assets.filter(a => [a.id,a.nama,a.kategori,a.lokasi,a.status].join(' ').toLocaleLowerCase('ms').includes(term))
    .map(a => '<article class="item"><div class="item-head"><div><p class="meta">'+esc(a.id)+' · '+esc(a.kategori)+'</p><h3>'+esc(a.nama)+
      '</h3></div>'+badge(a.status)+'</div><p class="meta">'+esc(a.lokasi)+'</p></article>').join('') || '<p class="empty">Tiada aset sepadan.</p>';
}
function works() {
  const admin = state.actor.peranan === 'Admin';
  const matches = state.jobs.filter(job => {
    const group = job.status === 'Baru' ? 'Aduan Baru' : job.status === 'Selesai' ? 'Selesai' : 'Dalam Proses';
    return (state.group === 'Semua' || state.group === group) && (!state.staffFilter || state.staffFilter === job.staf_id);
  });
  return title(admin ? 'Agih Kerja' : 'Tugasan Saya',admin ? 'Pilih aduan dan agihkan kepada staf teknikal.' : 'Terima tugasan dan kemas kini status pembaikan anda.')+
    '<section class="card"><div class="pills" aria-label="Penapis status">'+groups.map(group =>
      '<button class="pill'+(group === state.group ? ' active' : '')+'" aria-pressed="'+(group === state.group)+'" data-group="'+esc(group)+'">'+esc(group)+'</button>').join('')+'</div>'+
    (admin ? '<label class="field">Tapis mengikut staf<select id="staff-filter"><option value="">Semua staf</option>'+
      staffOptions(state.staffFilter)+'</select></label>' : '<p class="meta">Staf · '+esc(state.actor.nama)+'</p>')+
    '<div class="list">'+(matches.map(job => jobCard(job,true)).join('') || '<p class="empty">Tiada tugasan dalam penapis ini.</p>')+'</div></section>';
}
function staffOptions(selected) {
  return state.staff.filter(person => person.peranan === 'Staf').map(person =>
    '<option value="'+esc(person.id)+'"'+(person.id === selected ? ' selected' : '')+'>'+esc(person.nama)+'</option>').join('');
}
function profile() {
  return title('Profil / Staf','Akaun dan direktori pasukan UPHF.')+
    '<div class="split"><section class="card"><div class="section-head"><div><h2>'+esc(state.actor.nama)+'</h2><p class="meta">'+esc(state.actor.jawatan)+
    '</p></div><span class="badge new">'+esc(state.actor.peranan)+'</span></div>'+
    (demo ? '<label class="field">Tukar pengguna demo<select id="demo-user">'+demoStaff.map(person =>
      '<option value="'+person.id+'"'+(person.id === state.actor.id ? ' selected' : '')+'>'+esc(person.peranan+' · '+person.nama)+'</option>').join('')+
      '</select></label>' : '<button class="btn" id="logout">Log keluar</button>')+'</section>'+
    '<section class="card"><h2>Direktori staf aktif</h2><div class="list">'+state.staff.map(person =>
      '<article class="item"><div class="item-head"><div><h3>'+esc(person.nama)+'</h3><p class="meta">'+esc(person.jawatan)+'</p></div><span class="avatar">'+
      esc(initials(person.nama))+'</span></div></article>').join('')+'</div></section></div>';
}
function loginView() {
  return title('Log masuk UPHF','Gunakan ID staf dan PIN yang diberikan oleh pentadbir.')+
    '<section class="card"><form id="login"><label class="field">ID staf<input name="id" autocomplete="username" required maxlength="40" placeholder="Contoh STF01"></label>'+
    '<label class="field">PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{8,12}" autocomplete="current-password" required maxlength="12"></label>'+
    '<button class="btn primary" type="submit">'+icon('log-in')+'Log masuk</button></form></section>';
}
function render() {
  const current = routes.find(([route]) => '#'+route === location.hash);
  state.route = current ? current[0] : 'dashboard';
  const navigation = state.actor ? routes.map(([route,glyph,label]) =>
    '<a class="nav-link" href="#'+route+'"'+(state.route === route ? ' aria-current="page"' : '')+'>'+
    icon(glyph)+esc(route === 'kerja' && state.actor.peranan === 'Staf' ? 'Tugasan' : label)+'</a>').join('') : '';
  $('desktop-nav').innerHTML = $('mobile-nav').innerHTML = navigation;
  $('mobile-nav').hidden = !state.actor;
  $('quick').hidden = !state.actor;
  $('refresh').hidden = !state.actor && !state.token;
  $('connection').textContent = demo ? 'Mod demo' : state.online ? 'Google Sheets' : state.actor ? 'Sambungan terputus' : 'Akses staf';
  $('connection').className = 'connection'+(state.online ? ' live' : state.actor && !demo ? ' off' : '');
  const views = {dashboard,harta:assets,kerja:works,profil:profile};
  $('view').innerHTML = state.actor ? views[state.route]() : state.busy ? '<p class="empty">Menyambung ke Google Sheets…</p>' : loginView();
  if (state.actor && state.route === 'harta') assetResults();
  drawIcons();
}
function openJob(id) {
  const job = state.jobs.find(item => item.id === id);
  if (!job) return;
  const admin = state.actor.peranan === 'Admin';
  $('dialog-body').innerHTML = '<div class="section-head"><div><h2 id="dialog-title">'+(admin ? 'Agih kerja' : esc(next[job.status]))+
    '</h2><p class="meta">'+esc(job.id+' · '+job.tajuk)+'</p></div><button class="icon-btn" data-close aria-label="Tutup">'+icon('x')+'</button></div>'+
    '<form id="job-form" data-id="'+esc(id)+'">'+(admin ?
      '<label class="field">Staf bertanggungjawab<select name="staffId" required><option value="">Pilih staf</option>'+staffOptions(job.staf_id)+'</select></label>' : '')+
    '<label class="field">Catatan<textarea name="note" rows="3" maxlength="500">'+esc(job.catatan)+'</textarea></label>'+
    '<p class="dialog-error" role="alert" hidden></p><button class="btn primary" type="submit">Simpan perubahan</button></form>';
  $('dialog').showModal();
  drawIcons();
}
function whatsapp(job, person) {
  let number = String(person?.telefon || '').replace(/[^\d]/g,'');
  if (number.startsWith('00')) number = number.slice(2);
  if (number.startsWith('0')) number = '60'+number.slice(1);
  if (!/^[1-9]\d{7,14}$/.test(number)) return '';
  const message = ['Salam '+person.nama+', tugasan UPHF telah diagihkan kepada anda.',
    'Aduan: '+job.id+' · '+job.tajuk,'Lokasi: '+job.lokasi,'Keutamaan: '+job.keutamaan,
    ...(job.catatan ? ['Catatan: '+job.catatan] : []),'Sila terima tugasan dalam portal UPHF.'].join('\n');
  return 'https://wa.me/'+number+'?text='+encodeURIComponent(message);
}
async function saveJob(form) {
  const job = state.jobs.find(item => item.id === form.dataset.id);
  const admin = state.actor.peranan === 'Admin';
  const values = Object.fromEntries(new FormData(form));
  const button = form.querySelector('button[type=submit]');
  const alert = form.querySelector('.dialog-error');
  button.disabled = true;
  alert.hidden = true;
  try {
    const saved = await api(admin ? 'assign' : 'advance',{...values,id:job.id,version:job.versi || '0'});
    Object.assign(state.jobs.find(item => item.id === saved.id) || job,saved);
    render();
    showNotice('Perubahan disimpan.');
    if (!admin) { $('dialog').close(); return; }
    const person = state.staff.find(item => item.id === saved.staf_id);
    const link = whatsapp({...job,...saved},person);
    $('dialog-body').innerHTML = '<h2 id="dialog-title">Tugasan telah diagih</h2><p class="sub">'+esc(person?.nama || saved.staf_id)+
      '</p><div class="actions">'+(link ? '<a class="btn primary" target="_blank" rel="noopener noreferrer" href="'+esc(link)+'">'+icon('message-circle')+
      'Hantar ke WhatsApp</a>' : '<p class="meta">'+(demo ? 'WhatsApp tersedia selepas nombor staf diisi dalam Google Sheets.' : 'Nombor WhatsApp staf belum tersedia.')+
      '</p>')+'<button class="btn" data-close>Tutup</button></div>';
    $('dialog-body').querySelector('a,button')?.focus();
    drawIcons();
  } catch (error) {
    if (error.code === 'AUTH') { $('dialog').close(); clearSession(); render(); showNotice(error.message,true); }
    else { alert.textContent = error.message; alert.hidden = false; }
  } finally { button.disabled = false; }
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.id === 'refresh') load();
  if (button.id === 'quick') location.hash = 'kerja';
  if (button.id === 'logout') { clearSession(); showNotice(); render(); }
  if (button.hasAttribute('data-close') && !$('dialog').querySelector('button[type=submit]:disabled')) $('dialog').close();
  if (button.dataset.job) openJob(button.dataset.job);
  if (button.dataset.group) {
    state.group = button.dataset.group;
    render();
    [...document.querySelectorAll('[data-group]')].find(item => item.dataset.group === state.group)?.focus();
  }
});
$('dialog').addEventListener('cancel',event => {
  if ($('dialog').querySelector('button[type=submit]:disabled')) event.preventDefault();
});
document.addEventListener('change',async event => {
  if (event.target.id === 'staff-filter') { state.staffFilter = event.target.value; render(); $('staff-filter').focus(); }
  if (event.target.id === 'demo-user') {
    state.staffFilter = '';
    state.group = 'Semua';
    applySnapshot(await api('login',{id:event.target.value}));
    showNotice();
    render();
    $('demo-user')?.focus();
  }
});
document.addEventListener('input',event => {
  if (event.target.id === 'asset-search') { state.assetSearch = event.target.value; assetResults(); }
});
document.addEventListener('submit',async event => {
  event.preventDefault();
  const form = event.target;
  if (form.id === 'job-form') { await saveJob(form); return; }
  if (form.id !== 'login') return;
  const values = Object.fromEntries(new FormData(form));
  const button = form.querySelector('button');
  button.disabled = true;
  showNotice('Menyemak akses…');
  try { applySnapshot(await api('login',values)); showNotice(); render(); }
  catch (error) { form.elements.pin.value = ''; showNotice(error.message,true); form.elements.pin.focus(); }
  finally { button.disabled = false; }
});
window.addEventListener('hashchange',() => { window.scrollTo(0,0); render(); });
if (demo) applySnapshot(demoRead());
else if (state.token) load();
render();
