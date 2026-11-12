const TABS = {
  Aduan_Kerja: ['id','tarikh','tajuk','lokasi','kategori','keutamaan','status','staf_id','catatan','dikemas_kini','versi'],
  Senarai_Harta: ['id','nama','kategori','lokasi','status'],
  Senarai_Staf: ['id','nama','jawatan','telefon','peranan','aktif']
};
const NEXT = {'Diagih':'Terima Tugas','Terima Tugas':'Sedang Dibaiki','Sedang Dibaiki':'Selesai'};

function setupSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw Error('Buka Apps Script daripada fail Google Sheets.');
  book.setSpreadsheetTimeZone('Asia/Kuala_Lumpur');
  Object.entries(TABS).forEach(([name, headers]) => {
    const sheet = book.getSheetByName(name) || book.insertSheet(name);
    const header = sheet.getRange(1, 1, 1, headers.length);
    if (!sheet.getLastRow()) {
      header.setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
      if (name === 'Senarai_Staf') sheet.getRange('D:D').setNumberFormat('@');
    } else if (header.getDisplayValues()[0].join('|') !== headers.join('|')) {
      throw Error('Susunan lajur tidak sepadan pada tab ' + name);
    }
  });
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SHEET_ID', book.getId());
  if (!props.getProperty('SESSION_SECRET')) {
    props.setProperty('SESSION_SECRET', Utilities.getUuid() + Utilities.getUuid());
  }
}

function doGet(e) {
  return respond_(() => {
    const action = e && e.parameter.action || 'health';
    if (action === 'health') return {service:'UPHF', version:1};
    if (action !== 'read') fail_('BAD_REQUEST','Tindakan tidak sah.');
    // Read-only integration endpoint. The dashboard uses POST to keep credentials out of URLs.
    return snapshot_(authenticate_(e.parameter.token));
  });
}

function doPost(e) {
  return respond_(() => {
    const raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 12000) fail_('BAD_REQUEST','Permintaan tidak sah.');
    let body;
    try { body = JSON.parse(raw); } catch (_) { fail_('BAD_REQUEST','Format JSON tidak sah.'); }
    if (!body || typeof body !== 'object') fail_('BAD_REQUEST','Permintaan tidak sah.');
    if (body.action === 'login') return login_(body);
    const actor = authenticate_(body.token);
    if (body.action === 'read') return snapshot_(actor);
    if (body.action === 'assign' || body.action === 'advance') return update_(actor, body);
    fail_('BAD_REQUEST','Tindakan tidak sah.');
  });
}

function respond_(run) {
  let result;
  try { result = {ok:true, data:run()}; }
  catch (error) {
    if (!error.code) console.error(error.stack || String(error));
    result = {ok:false, code:error.code || 'SERVER', message:error.code ? error.message : 'Pelayan gagal memproses permintaan. Semak Apps Script Executions.'};
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function records_(name) {
  const book = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  const sheet = book.getSheetByName(name);
  const headers = TABS[name];
  const rows = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), headers.length).getDisplayValues();
  if (rows.shift().join('|') !== headers.join('|')) throw Error('Lajur tidak sepadan: ' + name);
  const ids = new Set();
  const items = rows.map((cells, i) => {
    const item = Object.fromEntries(headers.map((key, j) => [key, cells[j]]));
    item.id = item.id.trim();
    return {item, row:i + 2};
  }).filter(entry => entry.item.id);
  items.forEach(({item}) => {
    if (ids.has(item.id)) throw Error('ID berulang pada tab ' + name);
    ids.add(item.id);
  });
  return {sheet, items};
}

function staff_() {
  return records_('Senarai_Staf').items.map(({item}) => item).filter(item =>
    /^[A-Z0-9_-]{1,40}$/.test(item.id) && ['YA','TRUE'].includes(item.aktif.trim().toUpperCase()) &&
    ['Admin','Staf'].includes(item.peranan)
  );
}

function signature_(value) {
  const key = PropertiesService.getScriptProperties().getProperty('SESSION_SECRET');
  if (!key) throw Error('Jalankan setupSheet dahulu.');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(value, key));
}

function equals_(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}

function locked_(run) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) fail_('BUSY','Sistem sedang sibuk. Cuba lagi.');
  try { return run(); } finally { lock.releaseLock(); }
}

function login_(body) {
  const id = typeof body.id === 'string' ? body.id.trim().toUpperCase() : '';
  const pin = typeof body.pin === 'string' ? body.pin : '';
  if (!/^[A-Z0-9_-]{1,40}$/.test(id) || !/^\d{8,12}$/.test(pin)) fail_('LOGIN','ID atau PIN tidak sah.');
  return locked_(() => {
    const props = PropertiesService.getScriptProperties();
    const stored = props.getProperty('PIN_' + id);
    if (!stored) fail_('LOGIN','ID atau PIN tidak sah.');
    const key = 'TRIES_' + id;
    const now = Date.now();
    const previous = JSON.parse(props.getProperty(key) || 'null');
    const tries = previous && previous.until > now ? previous : {count:0, until:now + 15 * 60000};
    if (tries.count >= 5) fail_('RATE_LIMIT','Terlalu banyak percubaan. Cuba selepas 15 minit.');
    if (!equals_(pin, stored)) {
      tries.count++;
      props.setProperty(key, JSON.stringify(tries));
      fail_('LOGIN','ID atau PIN tidak sah.');
    }
    const actor = staff_().find(item => item.id === id);
    if (!actor) fail_('LOGIN','ID atau PIN tidak sah.');
    props.deleteProperty(key);
    const data = [id, now + 8 * 3600000, Utilities.getUuid()].join('.');
    const token = data + '.' + signature_(data + '.' + signature_(stored));
    return {token, ...snapshot_(actor)};
  });
}

function authenticate_(token) {
  if (typeof token !== 'string' || token.length > 250) fail_('AUTH','Sila log masuk semula.');
  const parts = token.split('.');
  if (parts.length !== 4 || !/^[A-Z0-9_-]{1,40}$/.test(parts[0]) ||
      !/^\d{13}$/.test(parts[1]) || Number(parts[1]) <= Date.now()) fail_('AUTH','Sesi tamat. Sila log masuk semula.');
  const pin = PropertiesService.getScriptProperties().getProperty('PIN_' + parts[0]);
  if (!pin || !equals_(parts[3], signature_(parts.slice(0,3).join('.') + '.' + signature_(pin)))) fail_('AUTH','Sila log masuk semula.');
  const actor = staff_().find(item => item.id === parts[0]);
  if (!actor) fail_('AUTH','Akses staf tidak aktif.');
  return actor;
}

function snapshot_(actor) {
  const admin = actor.peranan === 'Admin';
  const {id, nama, jawatan, peranan} = actor;
  return {
    actor:{id,nama,jawatan,peranan},
    jobs:records_('Aduan_Kerja').items.map(({item}) => item).filter(item => admin || item.staf_id === id),
    assets:records_('Senarai_Harta').items.map(({item}) => item),
    staff:staff_().map(({id,nama,jawatan,telefon,peranan}) => ({
      id,nama,jawatan,peranan,telefon:admin ? telefon : ''
    }))
  };
}

function update_(actor, body) {
  return locked_(() => {
    actor = authenticate_(body.token);
    const {sheet, items} = records_('Aduan_Kerja');
    const entry = items.find(({item}) => item.id === body.id);
    if (!entry) fail_('NOT_FOUND','Aduan tidak dijumpai.');
    const job = entry.item;
    if (body.action === 'assign') {
      if (actor.peranan !== 'Admin') fail_('FORBIDDEN','Agihan hanya untuk Admin.');
      if (!['Baru','Diagih'].includes(job.status)) fail_('STATUS','Agihan boleh dibuat sebelum tugas diterima.');
      if (!staff_().some(item => item.id === body.staffId && item.peranan === 'Staf')) fail_('BAD_REQUEST','Pilih staf aktif.');
    } else {
      if (actor.peranan !== 'Staf' || job.staf_id !== actor.id) fail_('FORBIDDEN','Tugasan ini bukan di bawah akaun anda.');
      if (!Object.prototype.hasOwnProperty.call(NEXT, job.status)) fail_('STATUS','Status ini tidak boleh dikemas kini.');
    }
    if (String(body.version) !== String(job.versi || '0')) fail_('CONFLICT','Rekod telah berubah. Segar semula dan cuba lagi.');
    if (typeof body.note !== 'string' || body.note.trim().length > 500) fail_('BAD_REQUEST','Catatan maksimum 500 aksara.');
    const status = body.action === 'assign' ? 'Diagih' : NEXT[job.status];
    const assignee = body.action === 'assign' ? body.staffId : job.staf_id;
    const note = body.note.trim();
    const safeNote = /^[=+@\-]/.test(note) ? "'" + note : note;
    const timestamp = Utilities.formatDate(new Date(),'Asia/Kuala_Lumpur','yyyy-MM-dd HH:mm:ss');
    sheet.getRange(entry.row, 7, 1, 5).setValues([[status, assignee, safeNote, timestamp, Number(job.versi || 0) + 1]]);
    SpreadsheetApp.flush();
    return {id:job.id, status, staf_id:assignee, catatan:note, dikemas_kini:timestamp, versi:String(Number(job.versi || 0) + 1)};
  });
}
