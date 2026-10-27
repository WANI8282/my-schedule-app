(() => {
  'use strict';
  const STORAGE_KEY = 'schedule-app-v1';
  const hours = Array.from({ length: 13 }, (_, i) => `${i + 9}:00`);
  const dayNames = ['月', '火', '水', '木', '金', '土', '日'];
  const defaults = {
    presets: [{ id: 1, name: '💼 バイト', color: '#f39b38' }, { id: 2, name: '⚽ サークル', color: '#45a878' }, { id: 3, name: '🍻 遊び', color: '#e36c86' }, { id: 4, name: '✈️ 旅行', color: '#9074d5' }],
    universitySchedule: { 1: ['10:00', '13:00'], 2: ['10:00'] },
    scheduleData: {}, isSemesterActive: true
  };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (_) { saved = {}; }
  let presets = Array.isArray(saved.presets) ? saved.presets : defaults.presets;
  let universitySchedule = saved.universitySchedule && typeof saved.universitySchedule === 'object' ? saved.universitySchedule : defaults.universitySchedule;
  let scheduleData = saved.scheduleData && typeof saved.scheduleData === 'object' ? saved.scheduleData : {};
  let isSemesterActive = typeof saved.isSemesterActive === 'boolean' ? saved.isSemesterActive : true;
  let currentDate = new Date();
  let currentView = 'week';
  let selectedPresetId = null;
  let editingPresets = [], editingTimetable = {};
  const $ = (id) => document.getElementById(id);
  const escapeHTML = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ presets, universitySchedule, scheduleData, isSemesterActive })); }
    catch (_) { showToast('保存できませんでした。端末の空き容量をご確認ください'); }
  }
  function vibrate() { if ('vibrate' in navigator) navigator.vibrate(10); }
  function showToast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => el.classList.remove('show'), 2100); }
  function formatDateKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function getWeekDays(d) { const start = new Date(d); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (start.getDay() === 0 ? 6 : start.getDay() - 1)); return Array.from({ length: 7 }, (_, i) => { const date = new Date(start); date.setDate(start.getDate() + i); return date; }); }
  function dayName(d) { return dayNames[d.getDay() === 0 ? 6 : d.getDay() - 1]; }
  function presetFor(id) { return presets.find(p => String(p.id) === String(id)); }
  function renderPalette() {
    const grid = $('palette-grid'); grid.replaceChildren();
    presets.forEach(p => {
      const btn = document.createElement('button'); btn.className = `palette-btn${String(selectedPresetId) === String(p.id) ? ' selected' : ''}`;
      btn.style.backgroundColor = p.color; btn.textContent = p.name; btn.setAttribute('aria-pressed', String(String(selectedPresetId) === String(p.id)));
      btn.addEventListener('click', () => { selectedPresetId = String(selectedPresetId) === String(p.id) ? null : p.id; $('btn-cancel-edit').style.display = selectedPresetId ? 'block' : 'none'; vibrate(); renderPalette(); closeDrawer(); });
      grid.append(btn);
    });
  }
  function eventMarkup(id, cls = 'event-block') { const p = presetFor(id); return p ? `<div class="${cls}" style="background:${escapeHTML(p.color)}" data-event="true">${escapeHTML(p.name)}</div>` : ''; }
  function updateUI() {
    renderPalette(); $('btn-week').classList.toggle('active', currentView === 'week'); $('btn-month').classList.toggle('active', currentView === 'month');
    $('view-week').classList.toggle('hidden', currentView !== 'week'); $('view-month').classList.toggle('hidden', currentView !== 'month');
    if (currentView === 'week') { $('calendar-title').textContent = `${currentDate.getFullYear()}年 ${currentDate.getMonth() + 1}月`; renderWeekView(); }
    else { $('calendar-title').textContent = `${currentDate.getFullYear()}年 ${currentDate.getMonth() + 1}月`; renderMonthView(); }
  }
  function handleSlotClick(cell) {
    const date = cell.dataset.date, time = cell.dataset.time;
    const current = scheduleData[date] && scheduleData[date][time];
    if (current) {
      if (selectedPresetId && String(current) === String(selectedPresetId)) { delete scheduleData[date][time]; if (!Object.keys(scheduleData[date]).length) delete scheduleData[date]; save(); vibrate(); const event = cell.querySelector('[data-event]'); if (event) event.classList.add('removing'); setTimeout(updateUI, 290); showToast('予定を削除しました'); }
      else if (selectedPresetId) { scheduleData[date][time] = selectedPresetId; save(); vibrate(); updateUI(); showToast('予定を変更しました'); }
      else { delete scheduleData[date][time]; if (!Object.keys(scheduleData[date]).length) delete scheduleData[date]; save(); vibrate(); const event = cell.querySelector('[data-event]'); if (event) event.classList.add('removing'); setTimeout(updateUI, 290); showToast('予定を削除しました'); }
    } else if (selectedPresetId) { if (!scheduleData[date]) scheduleData[date] = {}; scheduleData[date][time] = selectedPresetId; save(); vibrate(); updateUI(); showToast('予定を追加しました'); }
    else { selectedPresetId = null; showToast('追加する種類をメニューから選んでください'); }
  }
  function renderWeekView() {
    const days = getWeekDays(currentDate), today = formatDateKey(new Date());
    $('week-header').innerHTML = '<div class="day-head"></div>' + days.map(d => `<div class="day-head ${formatDateKey(d) === today ? 'today' : ''}">${dayName(d)} ${d.getDate()}</div>`).join('');
    $('all-day-row').innerHTML = '<div class="all-day-label">終日</div>' + days.map(d => { const key = formatDateKey(d), id = scheduleData[key] && scheduleData[key].allday; return `<div class="all-day-cell" data-date="${key}" data-time="allday">${id ? eventMarkup(id) : ''}</div>`; }).join('');
    let html = '<div class="time-col-label">' + hours.map(h => `<div class="time-label">${h}</div>`).join('') + '</div>';
    days.forEach((d, index) => { const key = formatDateKey(d); html += '<div class="day-col-grid">' + hours.map(h => { const id = scheduleData[key] && scheduleData[key][h]; const busy = isSemesterActive && universitySchedule[index] && universitySchedule[index].includes(h); return `<div class="time-cell${busy ? ' busy' : ''}" data-date="${key}" data-time="${h}">${id ? eventMarkup(id) : ''}</div>`; }).join('') + '</div>'; });
    $('timeline-grid').innerHTML = html;
    document.querySelectorAll('.time-cell,.all-day-cell').forEach(cell => cell.addEventListener('click', () => handleSlotClick(cell)));
  }
  function renderMonthView() {
    const grid = $('month-grid'); let html = dayNames.map(n => `<div class="day-head">${n}</div>`).join('');
    const y = currentDate.getFullYear(), m = currentDate.getMonth(), first = new Date(y, m, 1), offset = first.getDay() === 0 ? 6 : first.getDay() - 1; const d = new Date(y, m, 1 - offset), today = formatDateKey(new Date());
    for (let i = 0; i < 42; i++) { const key = formatDateKey(d), events = scheduleData[key] || {}; const dots = Object.values(events).map(id => eventMarkup(id, 'event-dot')).join(''); html += `<div class="month-day-cell${d.getMonth() !== m ? ' other-month' : ''}${key === today ? ' today' : ''}" data-date="${key}"><div class="month-date">${d.getDate()}</div>${dots}</div>`; d.setDate(d.getDate() + 1); }
    grid.innerHTML = html; grid.querySelectorAll('.month-day-cell').forEach(cell => cell.addEventListener('click', () => { currentDate = new Date(`${cell.dataset.date}T12:00:00`); currentView = 'week'; updateUI(); }));
  }
  function openModal(id) { $(id).classList.add('active'); vibrate(); }
  function closeModal(id) { $(id).classList.remove('active'); }
  function openPresetModal() { editingPresets = JSON.parse(JSON.stringify(presets)); renderPresetEditor(); openModal('preset-modal'); }
  function renderPresetEditor() {
    const list = $('preset-list'); list.innerHTML = '';
    editingPresets.forEach((p, i) => { const row = document.createElement('div'); row.className = 'preset-item'; row.innerHTML = `<input type="text" maxlength="24" aria-label="予定の名前" value="${escapeHTML(p.name)}"><input type="color" aria-label="色" value="${/^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '#3478f6'}"><button class="btn-remove" aria-label="削除">×</button>`; row.querySelector('input[type=text]').addEventListener('input', e => editingPresets[i].name = e.target.value); row.querySelector('input[type=color]').addEventListener('input', e => editingPresets[i].color = e.target.value); row.querySelector('.btn-remove').addEventListener('click', () => { editingPresets.splice(i, 1); renderPresetEditor(); }); list.append(row); });
  }
  function openTimetableModal() {
    editingTimetable = JSON.parse(JSON.stringify(universitySchedule)); $('toggle-semester-active').checked = isSemesterActive;
    let html = '<div class="tt-grid"><div class="tt-header">時間</div>' + dayNames.map(d => `<div class="tt-header">${d}</div>`).join('');
    hours.forEach(h => { html += `<div class="tt-time">${h}</div>`; for (let i = 0; i < 7; i++) html += `<div><input type="checkbox" class="tt-checkbox" data-d="${i}" data-h="${h}" ${editingTimetable[i] && editingTimetable[i].includes(h) ? 'checked' : ''}></div>`; });
    $('timetable-editor').innerHTML = html + '</div>';
    document.querySelectorAll('.tt-checkbox').forEach(cb => cb.addEventListener('change', e => { const day = e.target.dataset.d, hour = e.target.dataset.h; editingTimetable[day] ||= []; editingTimetable[day] = e.target.checked ? [...new Set([...editingTimetable[day], hour])] : editingTimetable[day].filter(x => x !== hour); }));
    openModal('timetable-modal');
  }
  function openDrawer() { $('sidebar').classList.add('open'); $('drawer-scrim').classList.add('open'); $('menu-btn').setAttribute('aria-expanded', 'true'); }
  function closeDrawer() { $('sidebar').classList.remove('open'); $('drawer-scrim').classList.remove('open'); $('menu-btn').setAttribute('aria-expanded', 'false'); }
  function bindEvents() {
    $('btn-week').onclick = () => { currentView = 'week'; updateUI(); closeDrawer(); };
    $('btn-month').onclick = () => { currentView = 'month'; updateUI(); closeDrawer(); };
    $('prev-btn').onclick = () => { if (currentView === 'week') currentDate.setDate(currentDate.getDate() - 7); else currentDate.setMonth(currentDate.getMonth() - 1); updateUI(); };
    $('next-btn').onclick = () => { if (currentView === 'week') currentDate.setDate(currentDate.getDate() + 7); else currentDate.setMonth(currentDate.getMonth() + 1); updateUI(); };
    $('today-btn').onclick = () => { currentDate = new Date(); updateUI(); };
    $('menu-btn').onclick = openDrawer; $('drawer-scrim').onclick = closeDrawer;
    $('btn-cancel-edit').onclick = () => { selectedPresetId = null; $('btn-cancel-edit').style.display = 'none'; renderPalette(); vibrate(); };
    $('btn-open-preset-setting').onclick = openPresetModal;
    $('btn-add-preset').onclick = () => { editingPresets.push({ id: Date.now(), name: '新しい予定', color: '#3478f6' }); renderPresetEditor(); };
    $('btn-preset-cancel').onclick = () => closeModal('preset-modal');
    $('btn-preset-save').onclick = () => { presets = editingPresets.filter(p => p.name.trim()).map(p => ({ ...p, name: p.name.trim() })); if (selectedPresetId && !presetFor(selectedPresetId)) selectedPresetId = null; save(); updateUI(); closeModal('preset-modal'); showToast('設定を保存しました'); };
    $('btn-open-timetable').onclick = () => { closeDrawer(); openTimetableModal(); };
    $('btn-timetable-cancel').onclick = () => closeModal('timetable-modal');
    $('btn-timetable-save').onclick = () => { universitySchedule = editingTimetable; isSemesterActive = $('toggle-semester-active').checked; save(); updateUI(); closeModal('timetable-modal'); showToast('裏時間割を保存しました'); };
    $('ai-fab').onclick = () => { $('ai-prompt').value = ''; openModal('ai-modal'); setTimeout(() => $('ai-prompt').focus(), 100); };
    $('ai-close').onclick = () => closeModal('ai-modal');
    $('ai-submit').onclick = () => { if (!$('ai-prompt').value.trim()) { $('ai-prompt').focus(); showToast('内容を入力してください'); return; } vibrate(); $('ai-note').textContent = 'モック画面です。AI連携時に入力内容から予定を提案します。'; showToast('AI連携は準備中です'); };
    document.querySelectorAll('.modal-overlay').forEach(overlay => overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); }));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { document.querySelectorAll('.modal-overlay.active').forEach(x => closeModal(x.id)); closeDrawer(); } });
  }
  bindEvents(); updateUI();
  setTimeout(() => $('skeleton').classList.add('done'), 500);
})();
