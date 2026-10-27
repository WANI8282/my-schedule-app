(() => {
  'use strict';
  const STORAGE_KEY = 'schedule-app-v1';
  const hours = Array.from({ length: 13 }, (_, i) => `${i + 9}:00`);
  const dayNames = ['月', '火', '水', '木', '金', '土', '日'];
  const defaults = {
    presets: [{ id: 1, name: 'バイト', color: '#f39b38' }, { id: 2, name: 'サークル', color: '#45a878' }, { id: 3, name: '遊び', color: '#e36c86' }, { id: 4, name: '旅行', color: '#9074d5' }],
    universitySchedule: { 1: ['10:00', '13:00'], 2: ['10:00'] },
    scheduleData: {}, isSemesterActive: true
  };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (_) { saved = {}; }
  const savedPresetNamesNeedCleaning = Array.isArray(saved.presets) && saved.presets.some(p => p && cleanPresetName(p.name) !== p.name);
  let presets = Array.isArray(saved.presets) ? saved.presets.filter(p => p && typeof p === 'object').map(p => ({ ...p, name: cleanPresetName(p.name) })) : defaults.presets;
  let universitySchedule = saved.universitySchedule && typeof saved.universitySchedule === 'object' ? saved.universitySchedule : defaults.universitySchedule;
  let scheduleData = saved.scheduleData && typeof saved.scheduleData === 'object' ? saved.scheduleData : {};
  let isSemesterActive = typeof saved.isSemesterActive === 'boolean' ? saved.isSemesterActive : true;
  let isDarkMode = saved.isDarkMode === true;
  let currentDate = new Date();
  let currentView = 'week';
  let selectedPresetId = null;
  let highlightFreeTime = false;
  let editingPresets = [], editingTimetable = {};
  const $ = (id) => document.getElementById(id);
  function cleanPresetName(value) {
    return String(value ?? '').replace(/[\p{Extended_Pictographic}\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}]/gu, '').replace(/\s+/g, ' ').trim();
  }
  const escapeHTML = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ presets, universitySchedule, scheduleData, isSemesterActive, isDarkMode })); }
    catch (_) { showToast('保存できませんでした。端末の空き容量をご確認ください'); }
  }
  function vibrate() { if ('vibrate' in navigator) navigator.vibrate(10); }
  function showToast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => el.classList.remove('show'), 2100); }
  function formatDateKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function normalizeDigits(text) { return text.replace(/[０-９]/g, digit => String.fromCharCode(digit.charCodeAt(0) - 0xFEE0)); }
  function parseNaturalDate(text) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const input = normalizeDigits(text);
    let match = input.match(/(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/);
    if (match) return validDate(+match[1], +match[2], +match[3]) || today;
    match = input.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (!match) match = input.match(/(?:^|\D)(\d{1,2})\s*\/\s*(\d{1,2})(?!\d)/);
    if (match) {
      let year = today.getFullYear();
      let result = validDate(year, +match[1], +match[2]);
      if (result && result < today) result = validDate(year + 1, +match[1], +match[2]);
      return result || today;
    }
    if (/明後日|あさって/.test(input)) { today.setDate(today.getDate() + 2); return today; }
    if (/明日/.test(input)) { today.setDate(today.getDate() + 1); return today; }
    if (/今日/.test(input)) return today;
    const weekday = input.match(/([月火水木金土日])(?:曜日|曜)/);
    if (weekday) {
      const offsets = { '月': 0, '火': 1, '水': 2, '木': 3, '金': 4, '土': 5, '日': 6 };
      const todayIndex = (today.getDay() + 6) % 7;
      let delta = offsets[weekday[1]] - todayIndex;
      if (/来週/.test(input)) delta = 7 - todayIndex + offsets[weekday[1]];
      else if (delta < 0) delta += 7;
      today.setDate(today.getDate() + delta); return today;
    }
    if (/来週/.test(input)) today.setDate(today.getDate() + 7);
    return today;
  }
  function validDate(year, month, day) {
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }
  function parseNaturalTimes(text) {
    const input = normalizeDigits(text);
    const found = new Set();
    let specified = false;
    const rangePattern = /(\d{1,2})(?::(\d{2}))?\s*時?\s*(?:から|〜|～|~|－|-|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*時?/gi;
    const withoutRanges = input.replace(rangePattern, (_, startH, _startM, endH) => {
      specified = true;
      const start = Number(startH), end = Number(endH);
      for (let hour = start; hour < end; hour++) if (hour >= 9 && hour <= 21) found.add(`${hour}:00`);
      return ' ';
    });
    const singlePattern = /(\d{1,2}):([0-5]\d)|(?<![\d/])(\d{1,2})\s*時(?:\s*(\d{1,2})\s*分)?/g;
    for (const match of withoutRanges.matchAll(singlePattern)) {
      specified = true;
      const hour = Number(match[1] || match[3]);
      if (hour >= 9 && hour <= 21) found.add(`${hour}:00`);
    }
    return { slots: [...found].sort((a, b) => Number(a.split(':')[0]) - Number(b.split(':')[0])), specified };
  }
  function cleanInputText(text) { return String(text).replace(/[\p{Extended_Pictographic}\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}]/gu, '').replace(/\s+/g, ' ').trim(); }
  function addNaturalLanguageEvent(text) {
    const input = normalizeDigits(cleanInputText(text));
    const preset = presets.find(item => { const name = cleanPresetName(item.name); return name && input.includes(name); });
    let selected = preset || presets[0];
    if (!selected) {
      selected = { id: Date.now(), name: '予定', color: '#6979c7' };
      presets.push(selected);
    }
    const date = parseNaturalDate(input);
    const parsedTime = parseNaturalTimes(input);
    if (parsedTime.specified && !parsedTime.slots.length) {
      showToast('予定は9時から21時の範囲で指定してください'); return false;
    }
    const dateKey = formatDateKey(date);
    const slots = parsedTime.specified ? parsedTime.slots : ['allday'];
    scheduleData[dateKey] ||= {};
    let added = 0;
    slots.forEach(slot => {
      if (scheduleData[dateKey][slot] == null) { scheduleData[dateKey][slot] = selected.id; added++; }
    });
    if (!added) { showToast('指定した時間にはすでに予定があります'); return false; }
    currentDate = date;
    currentView = 'week';
    selectedPresetId = null;
    $('btn-cancel-edit').style.display = 'none';
    save(); updateUI(); vibrate();
    closeModal('ai-modal');
    const label = cleanPresetName(selected.name) || '予定';
    showToast(`AIが${label}の予定を追加しました`);
    return true;
  }
  function getWeekDays(d) { const start = new Date(d); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (start.getDay() === 0 ? 6 : start.getDay() - 1)); return Array.from({ length: 7 }, (_, i) => { const date = new Date(start); date.setDate(start.getDate() + i); return date; }); }
  function dayName(d) { return dayNames[d.getDay() === 0 ? 6 : d.getDay() - 1]; }
  function presetFor(id) { return presets.find(p => String(p.id) === String(id)); }
  function renderPalette() {
    const grid = $('palette-grid'); grid.replaceChildren();
    presets.forEach(p => {
      const btn = document.createElement('button'); btn.className = `palette-btn${String(selectedPresetId) === String(p.id) ? ' selected' : ''}`;
      btn.style.backgroundColor = p.color; btn.textContent = cleanPresetName(p.name); btn.setAttribute('aria-pressed', String(String(selectedPresetId) === String(p.id)));
      btn.addEventListener('click', () => { selectedPresetId = String(selectedPresetId) === String(p.id) ? null : p.id; $('btn-cancel-edit').style.display = selectedPresetId ? 'block' : 'none'; vibrate(); renderPalette(); closeDrawer(); });
      grid.append(btn);
    });
  }
  function eventMarkup(id, cls = 'event-block') { const p = presetFor(id); return p ? `<div class="${cls}" style="background:${escapeHTML(p.color)}" data-event="true">${escapeHTML(cleanPresetName(p.name))}</div>` : ''; }
  function updateUI() {
    document.documentElement.dataset.theme = isDarkMode ? 'dark' : 'light';
    $('theme-toggle').textContent = isDarkMode ? 'DAY' : 'NIGHT';
    $('theme-toggle').setAttribute('aria-label', isDarkMode ? 'ライトモードに切り替え' : 'ダークモードに切り替え');
    $('find-free-btn').setAttribute('aria-pressed', String(highlightFreeTime));
    $('find-free-btn').classList.toggle('is-active', highlightFreeTime);
    renderPalette(); $('btn-week').classList.toggle('active', currentView === 'week'); $('btn-month').classList.toggle('active', currentView === 'month');
    $('view-week').classList.toggle('hidden', currentView !== 'week'); $('view-month').classList.toggle('hidden', currentView !== 'month');
    if (currentView === 'week') { $('calendar-title').textContent = `${currentDate.getFullYear()}年 ${currentDate.getMonth() + 1}月`; renderWeekView(); }
    else { $('calendar-title').textContent = `${currentDate.getFullYear()}年 ${currentDate.getMonth() + 1}月`; renderMonthView(); }
  }
  function handleSlotClick(cell) {
    const date = cell.dataset.date, time = cell.dataset.time;
    const current = scheduleData[date] && scheduleData[date][time];
    if (current) {
      if (selectedPresetId && String(current) === String(selectedPresetId)) { delete scheduleData[date][time]; if (!Object.keys(scheduleData[date]).length) delete scheduleData[date]; save(); vibrate(); const event = cell.querySelector('[data-event]'); if (event) event.classList.add('removing'); setTimeout(updateUI, 430); showToast('予定を削除しました'); }
      else if (selectedPresetId) { scheduleData[date][time] = selectedPresetId; save(); vibrate(); updateUI(); showToast('予定を変更しました'); }
      else { delete scheduleData[date][time]; if (!Object.keys(scheduleData[date]).length) delete scheduleData[date]; save(); vibrate(); const event = cell.querySelector('[data-event]'); if (event) event.classList.add('removing'); setTimeout(updateUI, 430); showToast('予定を削除しました'); }
    } else if (selectedPresetId) { if (!scheduleData[date]) scheduleData[date] = {}; scheduleData[date][time] = selectedPresetId; save(); vibrate(); updateUI(); showToast('予定を追加しました'); }
    else { selectedPresetId = null; showToast('追加する種類をメニューから選んでください'); }
  }
  function renderWeekView() {
    const days = getWeekDays(currentDate), today = formatDateKey(new Date());
    $('week-header').innerHTML = '<div class="day-head"></div>' + days.map(d => `<div class="day-head ${formatDateKey(d) === today ? 'today' : ''}">${dayName(d)} ${d.getDate()}</div>`).join('');
    $('all-day-row').innerHTML = '<div class="all-day-label">終日</div>' + days.map(d => { const key = formatDateKey(d), id = scheduleData[key] && scheduleData[key].allday; return `<div class="all-day-cell" data-date="${key}" data-time="allday">${id ? eventMarkup(id) : ''}</div>`; }).join('');
    let html = '<div class="time-col-label">' + hours.map(h => `<div class="time-label">${h}</div>`).join('') + '</div>';
    days.forEach((d, index) => { const key = formatDateKey(d); html += '<div class="day-col-grid">' + hours.map(h => { const id = scheduleData[key] && scheduleData[key][h]; const busy = isSemesterActive && universitySchedule[index] && universitySchedule[index].includes(h); const free = highlightFreeTime && !id && !busy; return `<div class="time-cell${busy ? ' busy' : ''}${free ? ' free-highlight' : ''}" data-date="${key}" data-time="${h}">${id ? eventMarkup(id) : ''}</div>`; }).join('') + '</div>'; });
    $('timeline-grid').innerHTML = html;
    document.querySelectorAll('.time-cell,.all-day-cell').forEach(cell => cell.addEventListener('click', () => handleSlotClick(cell)));
  }
  function renderMonthView() {
    const grid = $('month-grid'); let html = dayNames.map(n => `<div class="day-head">${n}</div>`).join('');
    const y = currentDate.getFullYear(), m = currentDate.getMonth(), first = new Date(y, m, 1), offset = first.getDay() === 0 ? 6 : first.getDay() - 1; const d = new Date(y, m, 1 - offset), today = formatDateKey(new Date());
    for (let i = 0; i < 42; i++) {
      const key = formatDateKey(d), events = scheduleData[key] || {};
      const uniquePresetIds = [...new Set(Object.values(events).map(id => String(id)))];
      const dots = uniquePresetIds.map(id => {
        const preset = presetFor(id);
        return preset ? `<span class="event-dot" style="--dot-color:${escapeHTML(preset.color)}" title="${escapeHTML(cleanPresetName(preset.name))}" aria-label="${escapeHTML(cleanPresetName(preset.name))}"></span>` : '';
      }).join('');
      html += `<div class="month-day-cell${d.getMonth() !== m ? ' other-month' : ''}${key === today ? ' today' : ''}" data-date="${key}"><div class="month-date">${d.getDate()}</div><div class="month-dots">${dots}</div></div>`;
      d.setDate(d.getDate() + 1);
    }
    grid.innerHTML = html; grid.querySelectorAll('.month-day-cell').forEach(cell => cell.addEventListener('click', () => { currentDate = new Date(`${cell.dataset.date}T12:00:00`); currentView = 'week'; updateUI(); }));
  }
  function openModal(id) { $(id).classList.add('active'); vibrate(); }
  function closeModal(id) { $(id).classList.remove('active'); }
  function openPresetModal() { editingPresets = JSON.parse(JSON.stringify(presets)); renderPresetEditor(); openModal('preset-modal'); }
  function renderPresetEditor() {
    const list = $('preset-list'); list.innerHTML = '';
    editingPresets.forEach((p, i) => { const row = document.createElement('div'); row.className = 'preset-item'; row.innerHTML = `<input type="text" maxlength="24" aria-label="予定の名前" value="${escapeHTML(cleanPresetName(p.name))}"><input type="color" aria-label="色" value="${/^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '#3478f6'}"><button class="btn-remove" aria-label="削除">×</button>`; row.querySelector('input[type=text]').addEventListener('input', e => editingPresets[i].name = e.target.value); row.querySelector('input[type=color]').addEventListener('input', e => editingPresets[i].color = e.target.value); row.querySelector('.btn-remove').addEventListener('click', () => { editingPresets.splice(i, 1); renderPresetEditor(); }); list.append(row); });
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
    $('theme-toggle').onclick = () => { isDarkMode = !isDarkMode; save(); updateUI(); vibrate(); };
    $('find-free-btn').onclick = () => { highlightFreeTime = !highlightFreeTime; updateUI(); vibrate(); showToast(highlightFreeTime ? '空いている時間をハイライトしました' : 'ハイライトを解除しました'); };
    $('copy-week-btn').onclick = () => {
      const days = getWeekDays(currentDate);
      const source = days.map(d => { const prev = new Date(d); prev.setDate(prev.getDate() - 7); return scheduleData[formatDateKey(prev)] || {}; });
      const total = source.reduce((sum, events) => sum + Object.keys(events).length, 0);
      if (!total) { showToast('先週にはコピーできる予定がありません'); closeDrawer(); return; }
      if (!confirm('先週の予定を、今週の空いている時間にコピーしますか？')) return;
      let copied = 0, skipped = 0;
      days.forEach((d, i) => {
        const targetKey = formatDateKey(d); scheduleData[targetKey] ||= {};
        Object.entries(source[i]).forEach(([time, id]) => {
          if (scheduleData[targetKey][time] == null) { scheduleData[targetKey][time] = id; copied++; } else skipped++;
        });
        if (!Object.keys(scheduleData[targetKey]).length) delete scheduleData[targetKey];
      });
      save(); updateUI(); closeDrawer(); vibrate(); showToast(`先週の予定を${copied}件コピー${skipped ? `（${skipped}件は既存予定のためスキップ）` : ''}`);
    };
    $('menu-btn').onclick = openDrawer; $('drawer-scrim').onclick = closeDrawer;
    $('btn-cancel-edit').onclick = () => { selectedPresetId = null; $('btn-cancel-edit').style.display = 'none'; renderPalette(); vibrate(); };
    $('btn-open-preset-setting').onclick = openPresetModal;
    $('btn-add-preset').onclick = () => { editingPresets.push({ id: Date.now(), name: '新しい予定', color: '#3478f6' }); renderPresetEditor(); };
    $('btn-preset-cancel').onclick = () => closeModal('preset-modal');
    $('btn-preset-save').onclick = () => { presets = editingPresets.filter(p => cleanPresetName(p.name)).map(p => ({ ...p, name: cleanPresetName(p.name) })); if (selectedPresetId && !presetFor(selectedPresetId)) selectedPresetId = null; save(); updateUI(); closeModal('preset-modal'); showToast('設定を保存しました'); };
    $('btn-open-timetable').onclick = () => { closeDrawer(); openTimetableModal(); };
    $('btn-timetable-cancel').onclick = () => closeModal('timetable-modal');
    $('btn-timetable-save').onclick = () => { universitySchedule = editingTimetable; isSemesterActive = $('toggle-semester-active').checked; save(); updateUI(); closeModal('timetable-modal'); showToast('裏時間割を保存しました'); };
    $('ai-fab').onclick = () => { $('ai-prompt').value = ''; openModal('ai-modal'); setTimeout(() => $('ai-prompt').focus(), 100); };
    $('ai-close').onclick = () => closeModal('ai-modal');
    $('ai-submit').onclick = () => { const text = $('ai-prompt').value.trim(); if (!text) { $('ai-prompt').focus(); showToast('予定の内容を入力してください'); return; } addNaturalLanguageEvent(text); };
    document.querySelectorAll('.modal-overlay').forEach(overlay => overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); }));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { document.querySelectorAll('.modal-overlay.active').forEach(x => closeModal(x.id)); closeDrawer(); } });
  }
  bindEvents(); updateUI();
  if (savedPresetNamesNeedCleaning) save();
  setTimeout(() => $('skeleton').classList.add('done'), 500);
})();
