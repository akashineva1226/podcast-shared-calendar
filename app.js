'use strict';
// Public Firebase client configuration. Access is enforced by Database Rules.
firebase.initializeApp({
  apiKey: 'AIzaSyBG47bHgl3mmt0kCaToym4hEsOZB7tulz8',
  authDomain: 'podcast-online-schedule.firebaseapp.com',
  databaseURL: 'https://podcast-online-schedule-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'podcast-online-schedule',
  messagingSenderId: '586544204050',
  appId: '1:586544204050:web:8c5fbd661a9cff3cc3cbcb'
});
const db = firebase.database();
const auth = firebase.auth();
let ownerUid = null;
const el = id => document.getElementById(id);
const monthId = () => `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
let connected = false, receivedEvents = false, receivedNotes = false;
let permission = false, ownMembershipOff = null, ownRequestOff = null;
let adminOff = [], members = {}, requests = {}, pendingWrites = 0;
const noteDrafts = new Map();
let notesBusy = false;
let teamTasks = {};
let tasksReady = false;
const taskPanels = new Map();
let taskMonthRef;
let stopTaskMonth;
let taskMonth;

window.showFeedback = message => { el('feedback').textContent = message; };
const isOwner = user => user?.emailVerified && user.uid === ownerUid;
window.canEditCalendar = () => !!auth.currentUser && permission && connected && receivedEvents && receivedNotes;
function paintStatus() {
  const ready = receivedEvents && receivedNotes;
  el('sync-status').textContent = !connected ? '連線中斷／等待連線，暫停編輯' : !ready ? '正在載入共用資料…' : pendingWrites ? '正在同步，請保留此頁…' : '共用行事曆已同步';
  const writable = canEditCalendar();
  el('add-event-btn').disabled = !writable;
  el('monthly-notes').disabled = !writable || notesBusy;
  el('save-notes-btn').disabled = !writable || notesBusy || !noteDrafts.has(monthId());
  for (const button of el('event-form').querySelectorAll('button')) button.disabled = pendingWrites > 0;
  el('month-subtitle').textContent = writable ? '點擊日期或行程，共同編輯團隊安排' : '公開瀏覽 · 登入並取得核准後可編輯';
  for (const panel of taskPanels.values()) {
    for (const control of panel.querySelectorAll('input, button')) {
      control.disabled = !writable || !tasksReady || pendingWrites > 0;
    }
  }
}
function displayError(error) {
  console.error(error);
  showFeedback(error.code?.includes('PERMISSION') || error.code?.includes('permission') ? '沒有編輯權限或登入已失效，請重新登入；內容尚未儲存。' : '操作未完成，請檢查連線後重試；內容尚未儲存。');
}
db.ref('.info/connected').on('value', snapshot => { connected = snapshot.val() === true; paintStatus(); });
db.ref('calendar/events').on('value', snapshot => {
  events = Object.entries(snapshot.val() || {}).map(([id, value]) => ({...value, id}));
  receivedEvents = true;
  renderCalendar(); paintStatus();
}, error => { receivedEvents = false; paintStatus(); displayError(error); });
db.ref('calendar/notes').on('value', snapshot => {
  monthlyNotes = snapshot.val() || {};
  receivedNotes = true;
  renderNotes(); paintStatus();
}, error => { receivedNotes = false; paintStatus(); displayError(error); });

window.renderNotes = function () {
  const key = monthId(), draft = noteDrafts.get(key), saved = monthlyNotes[key];
  const desired = draft ? draft.text : saved?.text || '';
  if (el('monthly-notes').value !== desired) el('monthly-notes').value = desired;
  el('save-status').classList.remove('opacity-0');
  el('save-status').textContent = draft ? ((saved?.rev || 0) !== draft.rev ? '他人已更新，請先下載你的草稿再重新載入' : '尚未儲存') : '共用備忘錄';
  paintStatus();
};
window.markNotesDirty = function () {
  const key = monthId(), old = noteDrafts.get(key);
  noteDrafts.set(key, {text:el('monthly-notes').value, rev:old?.rev ?? monthlyNotes[key]?.rev ?? 0});
  el('save-status').textContent = '尚未儲存'; paintStatus();
};
async function writeWithStatus(action) {
  if (!canEditCalendar()) { showFeedback('請先登入、取得編輯權限並等待連線完成。'); return false; }
  pendingWrites++; paintStatus();
  try { await action(); showFeedback('已儲存，團隊成員會即時收到更新。'); return true; }
  catch (error) { displayError(error); return false; }
  finally { pendingWrites--; paintStatus(); }
}
function renderTeamTasks() {
  const monthRef = taskMonthRef;
  for (const [group, panel] of taskPanels) {
    const list = panel.querySelector('ul');
    const tasks = Object.entries(teamTasks[group] || {});
    list.replaceChildren();
    if (!tasks.length) {
      const empty = document.createElement('li');
      empty.className = 'text-sm text-morandi-muted';
      empty.textContent = tasksReady ? '目前沒有待辦事項。' : '正在載入待辦…';
      list.append(empty);
    }
    for (const [id, task] of tasks) {
      const item = document.createElement('li');
      const label = document.createElement('label');
      label.className = 'flex items-start gap-3 rounded-lg bg-morandi-bg p-3';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.done;
      checkbox.className = 'mt-1 h-4 w-4 shrink-0 accent-morandi-sagedark';
      const title = document.createElement('span');
      title.className = task.done ? 'break-all line-through text-morandi-muted' : 'break-all';
      title.textContent = task.title;
      checkbox.addEventListener('change', async () => {
        const done = checkbox.checked;
        if (monthRef !== taskMonthRef) return;
        const saved = await writeWithStatus(() => monthRef.child(`${group}/${id}/done`).set(done));
        if (!saved) checkbox.checked = teamTasks[group]?.[id]?.done ?? task.done;
      });
      label.append(checkbox, title);
      item.append(label);
      list.append(item);
    }
  }
  paintStatus();
}

const taskLists = el('team-task-lists');
window.loadTaskMonth = function () {
  if (!taskLists || taskMonth === monthId()) return;
  stopTaskMonth?.();
  taskMonth = monthId();
  // November keeps the original shared list so existing items and checkmarks carry over.
  const monthRef = db.ref(taskMonth === '2026-11' ? 'calendar/tasks' : `calendar/monthlyTasks/${taskMonth}`);
  taskMonthRef = monthRef;
  teamTasks = {};
  tasksReady = false;
  el('team-tasks-heading').textContent = `${currentYear} 年 ${currentMonth + 1} 月各組待辦事項`;
  for (const panel of taskPanels.values()) panel.querySelector('form').reset();
  renderTeamTasks();
  const onValue = snapshot => {
    if (monthRef !== taskMonthRef) return;
    teamTasks = snapshot.val() || {};
    tasksReady = true;
    renderTeamTasks();
  };
  monthRef.on('value', onValue, error => {
    if (monthRef !== taskMonthRef) return;
    el('team-tasks-heading').textContent += '（載入失敗）';
    displayError(error);
  });
  stopTaskMonth = () => monthRef.off('value', onValue);
};
if (taskLists) {
  for (const [group, name] of Object.entries({host: '主持組', marketing: '行銷組', engineering: '工程組'})) {
    const panel = document.createElement('section');
    panel.className = 'min-w-0 rounded-2xl border border-morandi-border bg-white p-5 shadow-sm';
    panel.innerHTML = `<h3 class="mb-3 font-bold"></h3>
      <form class="mb-4 flex flex-wrap gap-2">
        <input class="min-w-0 flex-1 rounded-lg border border-morandi-border px-3 py-2" required maxlength="160" placeholder="輸入待辦事項">
        <button class="rounded-lg bg-morandi-sagedark px-3 py-2 text-white" type="submit">新增</button>
      </form><ul class="space-y-2"></ul>`;
    panel.querySelector('h3').textContent = name;
    const input = panel.querySelector('input');
    input.setAttribute('aria-label', `${name}待辦事項`);
    panel.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const title = input.value.trim();
      if (!title || pendingWrites || !tasksReady) return;
      const monthRef = taskMonthRef;
      const saved = await writeWithStatus(() => monthRef.child(group).push({title, done: false}));
      if (saved && monthRef === taskMonthRef) input.value = '';
    });
    taskPanels.set(group, panel);
    taskLists.append(panel);
  }
  loadTaskMonth();
}
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === value && value >= '2026-11-01' && value <= '2027-09-30';
}
window.handleFormSubmit = async function (e) {
  e.preventDefault(); if (pendingWrites) return;
  const id = el('event-id').value;
  const title = el('event-title').value.trim(), start = el('event-start').value, end = el('event-end').value;
  const color = el('event-color').value, desc = el('event-desc').value.trim();
  if (!title || title.length > 120 || desc.length > 3000 || !validDate(start) || !validDate(end) || end < start || !MORANDI_COLORS[color]) {
    showFeedback('請檢查標題、日期範圍（2026/11–2027/9）與內容長度。'); return;
  }
  const target = id ? db.ref(`calendar/events/${id}`) : db.ref('calendar/events').push();
  const expectedRev = id ? window.editingRevision : 0;
  const uid = auth.currentUser?.uid;
  const saved = await writeWithStatus(async () => {
    const result = await target.transaction(current => {
      if ((current?.rev || 0) !== expectedRev) return;
      return {title,start,end,color,desc,rev:expectedRev + 1,updatedBy:uid,updatedAt:firebase.database.ServerValue.TIMESTAMP};
    }, undefined, false);
    if (!result.committed) { showFeedback('這筆行程已被他人修改或刪除。請先保留你的內容，再關閉並重新開啟行程。'); throw Object.assign(new Error('conflict'),{code:'CONFLICT'}); }
  });
  if (saved) closeModal();
};
window.deleteCurrentEvent = async function () {
  const id = el('event-id').value; if (!id || pendingWrites) return;
  if (!confirm('確定刪除這筆共用行程？所有成員都會同步移除。建議先下載備份。')) return;
  const expected = window.editingRevision;
  const saved = await writeWithStatus(async () => {
    const result = await db.ref(`calendar/events/${id}`).transaction(current => current?.rev === expected ? null : undefined, undefined, false);
    if (!result.committed) throw Object.assign(new Error('conflict'),{code:'CONFLICT'});
  });
  if (saved) closeModal();
};
window.saveMonthlyNotes = async function () {
  const key = monthId(), draft = noteDrafts.get(key); if (!draft || notesBusy) return;
  notesBusy = true; paintStatus();
  const uid = auth.currentUser?.uid;
  const saved = await writeWithStatus(async () => {
    const result = await db.ref(`calendar/notes/${key}`).transaction(current => {
      if ((current?.rev || 0) !== draft.rev) return;
      return {text:draft.text,rev:draft.rev+1,updatedBy:uid,updatedAt:firebase.database.ServerValue.TIMESTAMP};
    }, undefined, false);
    if (!result.committed) throw Object.assign(new Error('conflict'),{code:'CONFLICT'});
  });
  notesBusy = false;
  if (saved) noteDrafts.delete(key);
  renderNotes();
};
const originalDisplayError = displayError;
displayError = function (error) {
  if (error.code === 'CONFLICT') showFeedback('他人已修改或刪除此內容；你的草稿仍保留。請下載備份保存草稿，再重新載入最新版本。');
  else originalDisplayError(error);
};
window.login = async function () {
  try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
  catch (error) { console.error(error); showFeedback('Google 登入未完成。請允許彈出視窗，並使用一般瀏覽器開啟本頁後重試。'); }
};
window.logout = async function () {
  if ((noteDrafts.size || !el('event-modal').classList.contains('hidden')) && !confirm('還有未儲存內容，確定登出？請先下載備份保存草稿。')) return;
  try { await auth.signOut(); closeModal(); noteDrafts.clear(); renderNotes(); } catch (error) { displayError(error); }
};
window.requestAccess = async function () {
  const user = auth.currentUser; if (!user?.emailVerified || !connected) return;
  el('request-btn').disabled = true;
  try {
    await db.ref(`requests/${user.uid}`).set({email:user.email, name:(user.displayName || user.email).slice(0,120)});
    showFeedback('已送出申請，請通知管理員核准。');
  } catch (error) { displayError(error); }
  finally { el('request-btn').disabled = false; }
};
function subscribe(reference, callback) {
  reference.on('value', callback, displayError);
  return () => reference.off('value', callback);
}
function rowFor(person, label, action) {
  const row = document.createElement('div'); row.className = 'flex flex-wrap items-center gap-3';
  const text = document.createElement('span'); text.textContent = `${person.name}（${person.email}）`; row.append(text);
  const button = document.createElement('button'); button.textContent = label; button.className = 'border rounded-lg px-3 py-1';
  button.onclick = async () => { button.disabled = true; try { await action(); } catch (e) { displayError(e); } finally { button.disabled = false; } };
  row.append(button); return row;
}
function renderPeople() {
  el('member-requests').replaceChildren(); el('member-list').replaceChildren();
  const heading = document.createElement('p'); heading.textContent = '待核准申請'; el('member-requests').append(heading);
  for (const [uid, person] of Object.entries(requests)) {
    el('member-requests').append(rowFor(person, '核准', () => db.ref().update({[`members/${uid}`]:person, [`requests/${uid}`]:null})));
  }
  const title = document.createElement('p'); title.textContent = '已核准成員'; el('member-list').append(title);
  for (const [uid, person] of Object.entries(members)) {
    el('member-list').append(rowFor(person, '移除編輯權限', async () => {
      if (confirm(`移除 ${person.name} 的編輯權限？`)) await db.ref(`members/${uid}`).remove();
    }));
  }
}
auth.onAuthStateChanged(async user => {
  ownMembershipOff?.(); ownRequestOff?.(); adminOff.forEach(off => off()); adminOff = [];
  permission = false; ownerUid = null; paintStatus();
  if (user?.emailVerified) {
    try { if ((await db.ref(`admins/${user.uid}`).get()).val() === true) ownerUid = user.uid; }
    catch (error) { displayError(error); }
  }
  if (auth.currentUser?.uid !== user?.uid) return;
  permission = !!isOwner(user);
  el('login-btn').hidden = !!user; el('logout-btn').hidden = !user;
  el('request-btn').hidden = !user || permission;
  el('admin-panel').hidden = !isOwner(user);
  el('account-status').textContent = !user ? '公開瀏覽' : `${isOwner(user) ? 'Chou' : user.displayName || user.email} · ${permission ? '管理員' : '僅可瀏覽'}`;
  if (user) {
    ownMembershipOff = subscribe(db.ref(`members/${user.uid}`), snap => {
      permission = !!isOwner(user) || (user.emailVerified && snap.exists());
      el('request-btn').hidden = permission;
      el('account-status').textContent = `${isOwner(user) ? 'Chou' : user.displayName || user.email} · ${isOwner(user) ? '管理員' : permission ? '團隊編輯' : '僅可瀏覽'}`;
      if (!permission) closeModal(); paintStatus();
    });
    ownRequestOff = subscribe(db.ref(`requests/${user.uid}`), snap => {
      el('request-btn').disabled = snap.exists();
      el('request-btn').textContent = snap.exists() ? '等待管理員核准' : '申請編輯權限';
    });
  }
  if (isOwner(user)) {
    adminOff.push(subscribe(db.ref('requests'), snap => { requests=snap.val() || {}; renderPeople(); }));
    adminOff.push(subscribe(db.ref('members'), snap => { members=snap.val() || {}; renderPeople(); }));
  } else { members={}; requests={}; el('member-list').replaceChildren(); el('member-requests').replaceChildren(); }
  paintStatus();
});
window.exportCalendar = function () {
  const draftEvent = !el('event-modal').classList.contains('hidden') ? {title:el('event-title').value,start:el('event-start').value,end:el('event-end').value,desc:el('event-desc').value} : null;
  const blob = new Blob([JSON.stringify({exportedAt:new Date().toISOString(),events,notes:monthlyNotes,noteDrafts:Object.fromEntries(noteDrafts),draftEvent},null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href=url; link.download=`podcast-calendar-${new Date().toISOString().slice(0,10)}.json`; link.click(); URL.revokeObjectURL(url);
};
window.addEventListener('beforeunload', event => {
  if (noteDrafts.size || pendingWrites || !el('event-modal').classList.contains('hidden')) { event.preventDefault(); event.returnValue=''; }
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !pendingWrites) closeModal(); });
