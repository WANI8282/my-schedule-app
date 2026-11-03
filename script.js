(() => {
  'use strict';
  const STORAGE_KEY = 'schedule-app-v1';
  const hours = Array.from({ length: 15 }, (_, i) => `${i + 8}:00`);
  const dayNames = ['月', '火', '水', '木', '金', '土', '日'];
  const classStartTimes = {
    60: [9 * 60, 10 * 60, 11 * 60, 13 * 60, 14 * 60, 15 * 60, 16 * 60],
    90: [9 * 60, 10 * 60 + 40, 13 * 60, 14 * 60 + 40, 16 * 60 + 20]
  };
  function buildClassPeriods(minutes) {
    return classStartTimes[minutes].map((start, index) => ({ id: `P${index + 1}`, label: `${index + 1}限`, start, end: start + minutes }));
  }
  const defaults = {
    presets: [{ id: 1, name: 'バイト', color: '#f39b38' }, { id: 2, name: 'サークル', color: '#45a878' }, { id: 3, name: '遊び', color: '#e36c86' }, { id: 4, name: '旅行', color: '#9074d5' }],
    universitySchedule: { 1: ['P2', 'P4'], 2: ['P2'] },
    scheduleData: {}, isSemesterActive: true
  };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (_) { saved = {}; }
  let timetablePeriodMode = saved.timetablePeriodMode === 90 ? 90 : 60;
  let classPeriods = buildClassPeriods(timetablePeriodMode);
  const savedPresetNamesNeedCleaning = Array.isArray(saved.presets) && saved.presets.some(p => p && cleanPresetName(p.name) !== p.name);
  let presets = Array.isArray(saved.presets) ? saved.presets.filter(p => p && typeof p === 'object').map(p => ({ ...p, name: cleanPresetName(p.name) })) : defaults.presets;
  let universitySchedule = saved.universitySchedule && typeof saved.universitySchedule === 'object' ? saved.universitySchedule : defaults.universitySchedule;
  let scheduleData = saved.scheduleData && typeof saved.scheduleData === 'object' ? saved.scheduleData : {};
  let isSemesterActive = typeof saved.isSemesterActive === 'boolean' ? saved.isSemesterActive : true;
  let isDarkMode = saved.isDarkMode === true;
  let hourlyWage = Number.isInteger(saved.hourlyWage) && saved.hourlyWage > 0 && saved.hourlyWage <= 1000000 ? saved.hourlyWage : 1100;
  let originalTimetablePeriodMode = timetablePeriodMode;
  let currentDate = new Date();
  let currentView = 'week';
  let selectedPresetId = null;
  let highlightFreeTime = false;
  let editingPresets = [], editingTimetable = {};
  let pendingUndo = null;
  let pendingUndoTimeout = null;
  let pendingDeleteRenderTimeout = null;
  let dragScheduleSelection = null;
  let suppressCellClickUntil = 0;
  const $ = (id) => document.getElementById(id);
  function cleanPresetName(value) {
    return String(value ?? '').replace(/[\p{Extended_Pictographic}\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}]/gu, '').replace(/\s+/g, ' ').trim();
  }
  const escapeHTML = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ presets, universitySchedule, scheduleData, isSemesterActive, isDarkMode, timetablePeriodMode, hourlyWage })); }
    catch (_) { showToast('保存できませんでした。端末の空き容量をご確認ください'); }
  }
  function vibrate() { if ('vibrate' in navigator) navigator.vibrate(10); }
  function showToast(message) {
    const el = $('toast');
    clearTimeout(showToast.timer); clearTimeout(pendingUndoTimeout);
    pendingUndo = null;
    el.replaceChildren(document.createTextNode(message));
    el.classList.add('show');
    showToast.timer = setTimeout(() => el.classList.remove('show'), 2100);
  }
  function showUndoToast(message, undoAction) {
    const el = $('toast');
    clearTimeout(showToast.timer); clearTimeout(pendingUndoTimeout);
    pendingUndo = undoAction;
    const text = document.createElement('span'); text.textContent = message;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'toast-undo'; button.textContent = '元に戻す';
    button.setAttribute('aria-label', '削除した予定を元に戻す');
    button.addEventListener('click', () => {
      if (!pendingUndo) return;
      const restore = pendingUndo;
      pendingUndo = null; clearTimeout(pendingUndoTimeout); clearTimeout(showToast.timer);
      restore();
      showToast('予定を元に戻しました');
    }, { once: true });
    el.replaceChildren(text, button);
    el.classList.add('show');
    pendingUndoTimeout = setTimeout(() => {
      pendingUndo = null;
      el.classList.remove('show');
    }, 3800);
  }
  function formatDateKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function selectedPeriodsForDay(dayIndex, schedule = universitySchedule) {
    const values = Array.isArray(schedule[dayIndex]) ? schedule[dayIndex] : [];
    const selected = new Set(values.filter(value => classPeriods.some(period => period.id === value)));
    values.forEach(value => {
      if (typeof value !== 'string' || !/^\d{1,2}:\d{2}$/.test(value)) return;
      const start = Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
      const nearest = classPeriods.map(period => ({ period, distance: Math.abs(period.start - start) })).sort((a, b) => a.distance - b.distance)[0];
      if (nearest && nearest.distance <= 60) selected.add(nearest.period.id);
      else classPeriods.filter(period => start < period.end && start + 60 > period.start).forEach(period => selected.add(period.id));
    });
    return classPeriods.filter(period => selected.has(period.id)).map(period => period.id);
  }
  function periodOverlaysForHour(dayIndex, hour) {
    const slotStart = hour * 60, slotEnd = slotStart + 60;
    const selected = new Set(selectedPeriodsForDay(dayIndex));
    return classPeriods.filter(period => selected.has(period.id) && period.start < slotEnd && period.end > slotStart).map(period => {
      const start = Math.max(period.start, slotStart), end = Math.min(period.end, slotEnd);
      return { period, top: (start - slotStart) / 60 * 100, height: (end - start) / 60 * 100, startsHere: start === period.start };
    });
  }
  function isClassBusy(dayIndex, time) {
    const hour = Number(time.split(':')[0]);
    return periodOverlaysForHour(dayIndex, hour).length > 0;
  }
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
    if (/明々後日|明明後日/.test(input)) { today.setDate(today.getDate() + 3); return today; }
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
    const addDuration = (startMinutes, endMinutes) => {
      for (let hour = Math.floor(startMinutes / 60); hour * 60 < endMinutes; hour++) {
        if (hour >= 8 && hour <= 22) found.add(`${hour}:00`);
      }
    };
    const timePart = '(\\d{1,2})(?::([0-5]\\d))?\\s*(?:時(?:\\s*([0-5]?\\d)\\s*分?)?)?';
    const durationPattern = new RegExp(`${timePart}\\s*(?:から|より)\\s*(\\d+(?:\\.\\d+)?)\\s*(?:時間(?:分)?|h)`, 'gi');
    const rangePattern = new RegExp(`${timePart}\\s*(?:から|〜|～|~|－|-|—|to)\\s*${timePart}`, 'gi');
    const consumed = [];
    for (const match of input.matchAll(durationPattern)) {
      specified = true; consumed.push([match.index, match.index + match[0].length]);
      const start = Number(match[1]) * 60 + Number(match[2] || match[3] || 0);
      const duration = Number(match[4]) * 60;
      if (Number.isFinite(duration) && duration > 0 && duration <= 24 * 60) addDuration(start, start + duration);
    }
    let remaining = input;
    for (const [start, end] of consumed.reverse()) remaining = `${remaining.slice(0, start)} ${remaining.slice(end)}`;
    for (const match of remaining.matchAll(rangePattern)) {
      specified = true;
      const start = Number(match[1]) * 60 + Number(match[2] || match[3] || 0);
      const end = Number(match[4]) * 60 + Number(match[5] || match[6] || 0);
      if (end > start) addDuration(start, end);
    }
    // Remove ranges before scanning standalone start times, so an end time is not added as another event.
    remaining = remaining.replace(rangePattern, ' ');
    const singlePattern = /(?<![\d/])(\d{1,2}):([0-5]\d)(?!\d)|(?<![\d/])(\d{1,2})\s*時(?:\s*([0-5]?\d)\s*分?)?/g;
    for (const match of remaining.matchAll(singlePattern)) {
      specified = true;
      const hour = Number(match[1] || match[3]);
      if (hour >= 8 && hour <= 22) found.add(`${hour}:00`);
    }
    return { slots: [...found].sort((a, b) => Number(a.split(':')[0]) - Number(b.split(':')[0])), specified };
  }
  function cleanInputText(text) { return String(text).replace(/[\p{Extended_Pictographic}\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}]/gu, '').replace(/\s+/g, ' ').trim(); }
  function addNaturalLanguageEvent(text) {
    const input = normalizeDigits(cleanInputText(text));
    const aliases = [
      { words: ['呑み', '飲み', '飲み会', 'ごはん', '食事', 'デート', '遊ぶ', '遊び', '遊んだ'], target: '遊び' },
      { words: ['練習', '部活', 'サークル'], target: 'サークル' },
      { words: ['シフト', 'アルバイト', 'バイト'], target: 'バイト' },
      { words: ['旅行', '旅'], target: '旅行' }
    ];
    const normalizedPresets = presets.map(item => ({ item, name: cleanPresetName(item.name) })).filter(entry => entry.name);
    let preset = normalizedPresets.sort((a, b) => b.name.length - a.name.length).find(({ name }) => input.includes(name))?.item;
    if (!preset) {
      for (const alias of aliases) {
        if (!alias.words.some(word => input.includes(word))) continue;
        preset = normalizedPresets.find(({ name }) => name.includes(alias.target) || alias.target.includes(name))?.item;
        if (preset) break;
      }
    }
    let selected = preset || presetFor(selectedPresetId) || presets[0];
    if (!selected) {
      selected = { id: Date.now(), name: '予定', color: '#6979c7' };
      presets.push(selected);
    }
    const date = parseNaturalDate(input);
    const parsedTime = parseNaturalTimes(input);
    if (parsedTime.specified && !parsedTime.slots.length) {
      showToast('予定は8時から23時の範囲で指定してください'); return false;
    }
    const dateKey = formatDateKey(date);
    const slots = parsedTime.specified ? parsedTime.slots : ['allday'];
    scheduleData[dateKey] ||= {};
    const addedSlots = slots.filter(slot => scheduleData[dateKey][slot] == null);
    addedSlots.forEach(slot => { scheduleData[dateKey][slot] = selected.id; });
    if (!addedSlots.length) { if (!Object.keys(scheduleData[dateKey]).length) delete scheduleData[dateKey]; showToast('指定した時間にはすでに予定があります'); return false; }
    currentDate = date;
    currentView = 'week';
    selectedPresetId = null;
    $('btn-cancel-edit').style.display = 'none';
    save(); updateUI(); vibrate();
    closeModal('ai-modal');
    const label = cleanPresetName(selected.name) || '予定';
    const dateLabel = `${date.getMonth() + 1}/${date.getDate()}`;
    const slotHours = addedSlots.map(slot => Number(slot.split(':')[0]));
    const isContinuous = slotHours.every((hour, index) => index === 0 || hour === slotHours[index - 1] + 1);
    const timeLabel = addedSlots[0] === 'allday' ? '終日' : isContinuous
      ? `${addedSlots[0]}〜${String(slotHours[slotHours.length - 1] + 1).padStart(2, '0')}:00`
      : addedSlots.join('・');
    showToast(`AIが【${dateLabel} ${timeLabel} ${label}】を追加しました`);
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
    renderWageEstimate();
    renderPalette(); $('btn-week').classList.toggle('active', currentView === 'week'); $('btn-month').classList.toggle('active', currentView === 'month');
    renderNextEvent();
    $('view-week').classList.toggle('hidden', currentView !== 'week'); $('view-month').classList.toggle('hidden', currentView !== 'month');
    if (currentView === 'week') { $('calendar-title').textContent = `${currentDate.getFullYear()}年 ${currentDate.getMonth() + 1}月`; renderWeekView(); }
    else { $('calendar-title').textContent = `${currentDate.getFullYear()}年 ${currentDate.getMonth() + 1}月`; renderMonthView(); }
  }
  function renderWageEstimate() {
    const targetMonth = formatDateKey(new Date()).slice(0, 7);
    const wagePreset = presets.find(preset => cleanPresetName(preset.name).includes('バイト'));
    let hoursThisMonth = 0;
    if (wagePreset) {
      Object.entries(scheduleData).forEach(([dateKey, events]) => {
        if (!dateKey.startsWith(targetMonth)) return;
        Object.entries(events || {}).forEach(([time, presetId]) => {
          if (time !== 'allday' && /^\d{1,2}:\d{2}$/.test(time) && String(presetId) === String(wagePreset.id)) hoursThisMonth++;
        });
      });
    }
    $('wage-rate').textContent = `時給 ¥${hourlyWage.toLocaleString('ja-JP')}`;
    $('wage-total').textContent = `¥${(hoursThisMonth * hourlyWage).toLocaleString('ja-JP')}`;
    $('wage-hours').textContent = `${hoursThisMonth}時間分の予定`;
    const wageInput = $('wage-input');
    if (document.activeElement !== wageInput) wageInput.value = String(hourlyWage);
  }
  function renderNextEvent() {
    const detail = $('next-event-detail');
    const now = new Date();
    const todayKey = formatDateKey(now);
    const entries = Object.entries(scheduleData).sort(([a], [b]) => a.localeCompare(b));
    let next = null;
    for (const [dateKey, events] of entries) {
      if (dateKey < todayKey) continue;
      if (events.allday != null) {
        const preset = presetFor(events.allday);
        if (preset) { next = { dateKey, time: '終日', name: cleanPresetName(preset.name) }; break; }
      }
      const timed = Object.entries(events).filter(([time]) => time !== 'allday').sort(([a], [b]) => a.localeCompare(b));
      for (const [time, id] of timed) {
        const hour = Number(time.split(':')[0]);
        if (!Number.isFinite(hour)) continue;
        const candidate = new Date(`${dateKey}T${String(hour).padStart(2, '0')}:00:00`);
        if (candidate < now) continue;
        const preset = presetFor(id);
        if (preset) { next = { dateKey, time, name: cleanPresetName(preset.name) }; break; }
      }
      if (next) break;
    }
    if (!next) { detail.textContent = '予定はありません'; return; }
    const dateLabel = next.dateKey === todayKey ? '' : `${Number(next.dateKey.slice(5, 7))}/${Number(next.dateKey.slice(8, 10))} `;
    detail.textContent = `${dateLabel}${next.time}${next.time === '終日' ? '' : '〜'}  ·  ${next.name}`;
  }
  function removeScheduledEvent(date, time, presetId, cell) {
    const backup = { date, time, presetId };
    delete scheduleData[date][time];
    if (!Object.keys(scheduleData[date]).length) delete scheduleData[date];
    save(); vibrate();
    const event = cell.querySelector('[data-event]');
    if (event) event.classList.add('removing');
    clearTimeout(pendingDeleteRenderTimeout);
    pendingDeleteRenderTimeout = setTimeout(() => { pendingDeleteRenderTimeout = null; updateUI(); }, 430);
    showUndoToast('予定を削除しました', () => {
      clearTimeout(pendingDeleteRenderTimeout); pendingDeleteRenderTimeout = null;
      scheduleData[backup.date] ||= {};
      scheduleData[backup.date][backup.time] = backup.presetId;
      save(); updateUI(); vibrate();
    });
  }
  function handleSlotClick(cell) {
    const date = cell.dataset.date, time = cell.dataset.time;
    const current = scheduleData[date] && scheduleData[date][time];
    if (current) {
      if (selectedPresetId && String(current) === String(selectedPresetId)) removeScheduledEvent(date, time, current, cell);
      else if (selectedPresetId) { scheduleData[date][time] = selectedPresetId; save(); vibrate(); updateUI(); showToast('予定を変更しました'); }
      else removeScheduledEvent(date, time, current, cell);
    } else if (selectedPresetId) { scheduleData[date] ||= {}; scheduleData[date][time] = selectedPresetId; save(); vibrate(); updateUI(); showToast('予定を1コマ追加しました'); }
    else { selectedPresetId = null; showToast('追加する種類をメニューから選んでください'); }
  }
  function addDraggedRange(date, startTime, endTime) {
    if (!selectedPresetId || startTime === 'allday' || endTime === 'allday') return;
    const first = Number(startTime.split(':')[0]), last = Number(endTime.split(':')[0]);
    const low = Math.min(first, last), high = Math.max(first, last);
    const weekday = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
    let added = 0;
    scheduleData[date] ||= {};
    for (let hour = low; hour <= high; hour++) {
      const slot = `${hour}:00`;
      if (scheduleData[date][slot] != null) continue;
      if (isSemesterActive && isClassBusy(weekday, slot)) continue;
      scheduleData[date][slot] = selectedPresetId;
      added++;
    }
    if (!added) { if (!Object.keys(scheduleData[date]).length) delete scheduleData[date]; showToast('選択範囲に追加できる空きコマがありません'); return; }
    save(); vibrate(); updateUI(); showToast(`予定を${added}コマ追加しました`);
  }
  function renderWeekView() {
    const days = getWeekDays(currentDate), today = formatDateKey(new Date());
    $('week-header').innerHTML = '<div class="day-head"></div>' + days.map(d => `<div class="day-head ${formatDateKey(d) === today ? 'today' : ''}">${dayName(d)} ${d.getDate()}</div>`).join('');
    $('all-day-row').innerHTML = '<div class="all-day-label">終日</div>' + days.map(d => { const key = formatDateKey(d), id = scheduleData[key] && scheduleData[key].allday; return `<div class="all-day-cell" data-date="${key}" data-time="allday">${id ? eventMarkup(id) : ''}</div>`; }).join('');
    const periodLabels = Object.fromEntries(classPeriods.map(period => [`${Math.floor(period.start / 60)}:00`, `${period.label} · ${String(Math.floor(period.start / 60)).padStart(2, '0')}:${String(period.start % 60).padStart(2, '0')}`]));
    let html = '<div class="time-col-label">' + hours.map(h => `<div class="time-label"><span>${h}</span>${periodLabels[h] ? `<small>${periodLabels[h]}</small>` : ''}</div>`).join('') + '<div class="time-label end-time-label"><span>23:00</span></div></div>';
    days.forEach((d, index) => {
      const key = formatDateKey(d);
      const cells = hours.map((h, hourIndex) => {
        const id = scheduleData[key] && scheduleData[key][h];
        const sameAsPrevious = id != null && hourIndex > 0 && String(scheduleData[key] && scheduleData[key][hours[hourIndex - 1]]) === String(id);
        const sameAsNext = id != null && hourIndex < hours.length - 1 && String(scheduleData[key] && scheduleData[key][hours[hourIndex + 1]]) === String(id);
        const hour = Number(h.split(':')[0]);
        const overlays = isSemesterActive ? periodOverlaysForHour(index, hour) : [];
        const busy = overlays.length > 0;
        const classes = ['time-cell'];
        if (id) classes.push('has-event');
        if (sameAsPrevious) classes.push('event-continues-up');
        if (sameAsNext) classes.push('event-continues-down');
        if (busy) classes.push('busy');
        if (highlightFreeTime && !id && !busy) classes.push('free-highlight');
        const blockClass = `event-block${sameAsPrevious ? ' connects-up' : ''}${sameAsNext ? ' connects-down' : ''}`;
        const classMarkup = overlays.map(overlay => `<span class="class-overlay" style="--class-top:${overlay.top}%;--class-height:${overlay.height}%" aria-label="${overlay.period.label} 授業">${overlay.startsHere ? '授業' : ''}</span>`).join('');
        return `<div class="${classes.join(' ')}" data-date="${key}" data-time="${h}">${classMarkup}${id ? eventMarkup(id, blockClass) : ''}</div>`;
      }).join('');
      html += `<div class="day-col-grid${key === today ? ' today-column' : ''}">${cells}</div>`;
    });
    $('timeline-grid').innerHTML = html;
    document.querySelectorAll('.time-cell,.all-day-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        if (Date.now() < suppressCellClickUntil) { suppressCellClickUntil = 0; return; }
        handleSlotClick(cell);
      });
      cell.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'mouse' || !selectedPresetId || cell.dataset.time === 'allday') return;
        dragScheduleSelection = { date: cell.dataset.date, startTime: cell.dataset.time, endTime: cell.dataset.time, pointerId: event.pointerId };
      });
      cell.addEventListener('pointerenter', event => {
        if (dragScheduleSelection && event.pointerId === dragScheduleSelection.pointerId && cell.dataset.date === dragScheduleSelection.date && cell.dataset.time !== 'allday') {
          dragScheduleSelection.endTime = cell.dataset.time;
        }
      });
    });
  }
  function renderMonthView() {
    const grid = $('month-grid'); let html = dayNames.map(n => `<div class="day-head">${n}</div>`).join('');
    const y = currentDate.getFullYear(), m = currentDate.getMonth(), first = new Date(y, m, 1), offset = first.getDay() === 0 ? 6 : first.getDay() - 1; const d = new Date(y, m, 1 - offset), today = formatDateKey(new Date());
    for (let i = 0; i < 42; i++) {
      const key = formatDateKey(d), events = scheduleData[key] || {};
      const uniquePresetIds = [...new Set(Object.values(events).map(id => String(id)))];
      const uniquePresets = uniquePresetIds.map(id => presetFor(id)).filter(Boolean);
      const visiblePresets = uniquePresets.slice(0, 2);
      const bars = visiblePresets.map(preset =>
        `<div class="month-preset-bar" style="--bar-color:${escapeHTML(preset.color)}" title="${escapeHTML(cleanPresetName(preset.name))}">${escapeHTML(cleanPresetName(preset.name))}</div>`
      ).join('');
      const more = uniquePresets.length > 2 ? `<span class="month-more">+${uniquePresets.length - 2}</span>` : '';
      html += `<div class="month-day-cell${d.getMonth() !== m ? ' other-month' : ''}${key === today ? ' today' : ''}" data-date="${key}"><div class="month-date">${d.getDate()}</div><div class="month-events">${bars}${more}</div></div>`;
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
    originalTimetablePeriodMode = timetablePeriodMode;
    editingTimetable = Object.fromEntries(Array.from({ length: 7 }, (_, day) => [day, selectedPeriodsForDay(day)]));
    $('toggle-semester-active').checked = isSemesterActive;
    renderPeriodLengthButtons();
    renderTimetableEditor();
    openModal('timetable-modal');
  }
  function renderPeriodLengthButtons() {
    document.querySelectorAll('.period-length-btn').forEach(button => {
      const active = Number(button.dataset.minutes) === timetablePeriodMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  function renderTimetableEditor() {
    let html = '<div class="tt-grid period-grid"><div class="tt-header">コマ</div>' + dayNames.map(d => `<div class="tt-header">${d}</div>`).join('');
    classPeriods.forEach(period => {
      html += `<div class="tt-period">${period.label}<small>${String(Math.floor(period.start / 60)).padStart(2, '0')}:${String(period.start % 60).padStart(2, '0')}</small></div>`;
      for (let day = 0; day < 7; day++) html += `<div class="tt-period-check"><input type="checkbox" class="tt-checkbox" data-d="${day}" data-period="${period.id}" aria-label="${dayNames[day]}曜日 ${period.label}" ${editingTimetable[day].includes(period.id) ? 'checked' : ''}></div>`;
    });
    $('timetable-editor').innerHTML = html + '</div>';
    document.querySelectorAll('.tt-checkbox').forEach(cb => cb.addEventListener('change', e => {
      const day = e.target.dataset.d, periodId = e.target.dataset.period;
      editingTimetable[day] = e.target.checked ? [...new Set([...editingTimetable[day], periodId])] : editingTimetable[day].filter(id => id !== periodId);
    }));
  }
  function cancelTimetableModal() {
    timetablePeriodMode = originalTimetablePeriodMode;
    classPeriods = buildClassPeriods(timetablePeriodMode);
    updateUI();
    closeModal('timetable-modal');
  }
  function openDrawer() { $('sidebar').classList.add('open'); $('drawer-scrim').classList.add('open'); $('menu-btn').setAttribute('aria-expanded', 'true'); }
  function closeDrawer() { $('sidebar').classList.remove('open'); $('drawer-scrim').classList.remove('open'); $('menu-btn').setAttribute('aria-expanded', 'false'); }
  function bindEvents() {
    $('wage-edit-toggle').onclick = () => {
      const editor = $('wage-editor'), opening = editor.hidden;
      editor.hidden = !opening;
      editor.classList.toggle('active', opening);
      $('wage-edit-toggle').setAttribute('aria-expanded', String(opening));
      if (opening) { $('wage-input').value = String(hourlyWage); setTimeout(() => $('wage-input').focus(), 0); }
    };
    $('wage-save').onclick = () => {
      const value = Number($('wage-input').value);
      if (!Number.isInteger(value) || value < 1 || value > 1000000) {
        $('wage-input').value = String(hourlyWage);
        showToast('時給は1〜1,000,000円で入力してください');
        return;
      }
      hourlyWage = value;
      save(); renderWageEstimate();
      $('wage-editor').hidden = true; $('wage-editor').classList.remove('active');
      $('wage-edit-toggle').setAttribute('aria-expanded', 'false');
      showToast('時給を保存しました');
    };
    $('wage-cancel').onclick = () => {
      $('wage-input').value = String(hourlyWage);
      $('wage-editor').hidden = true; $('wage-editor').classList.remove('active');
      $('wage-edit-toggle').setAttribute('aria-expanded', 'false');
    };
    $('wage-input').addEventListener('keydown', event => { if (event.key === 'Enter') $('wage-save').click(); });
    document.addEventListener('pointerup', event => {
      if (!dragScheduleSelection || event.pointerId !== dragScheduleSelection.pointerId) return;
      const drag = dragScheduleSelection;
      const endCell = document.elementFromPoint(event.clientX, event.clientY)?.closest('.time-cell');
      dragScheduleSelection = null;
      if (endCell && endCell.dataset.date === drag.date && endCell.dataset.time !== drag.startTime) {
        suppressCellClickUntil = Date.now() + 350;
        addDraggedRange(drag.date, drag.startTime, endCell.dataset.time);
      }
    });
    document.addEventListener('pointercancel', () => { dragScheduleSelection = null; });
    $('btn-week').onclick = () => { currentView = 'week'; updateUI(); closeDrawer(); };
    $('btn-month').onclick = () => { currentView = 'month'; updateUI(); closeDrawer(); };
    $('prev-btn').onclick = () => { if (currentView === 'week') currentDate.setDate(currentDate.getDate() - 7); else currentDate.setMonth(currentDate.getMonth() - 1); updateUI(); };
    $('next-btn').onclick = () => { if (currentView === 'week') currentDate.setDate(currentDate.getDate() + 7); else currentDate.setMonth(currentDate.getMonth() + 1); updateUI(); };
    $('today-btn').onclick = () => { currentDate = new Date(); currentDate.setHours(12, 0, 0, 0); updateUI(); };
    $('theme-toggle').onclick = () => { isDarkMode = !isDarkMode; save(); updateUI(); vibrate(); };
    $('find-free-btn').onclick = () => {
      highlightFreeTime = !highlightFreeTime;
      updateUI();
      vibrate();
      showToast(highlightFreeTime ? '空いている時間をハイライトしました' : 'ハイライトを解除しました');
    };
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
    document.querySelectorAll('.period-length-btn').forEach(button => button.addEventListener('click', () => {
      const nextMode = Number(button.dataset.minutes);
      if (nextMode === timetablePeriodMode) return;
      timetablePeriodMode = nextMode; classPeriods = buildClassPeriods(timetablePeriodMode);
      renderPeriodLengthButtons(); renderTimetableEditor(); updateUI(); vibrate();
    }));
    $('btn-timetable-cancel').onclick = cancelTimetableModal;
    $('btn-timetable-save').onclick = () => {
      const validIds = new Set(classPeriods.map(period => period.id));
      universitySchedule = Object.fromEntries(Array.from({ length: 7 }, (_, day) => [day, (editingTimetable[day] || []).filter(id => validIds.has(id))]));
      isSemesterActive = $('toggle-semester-active').checked; save(); updateUI(); closeModal('timetable-modal'); showToast('裏時間割を保存しました');
    };
    $('ai-fab').onclick = () => { $('ai-prompt').value = ''; openModal('ai-modal'); setTimeout(() => $('ai-prompt').focus(), 100); };
    $('ai-close').onclick = () => closeModal('ai-modal');
    $('ai-submit').onclick = () => { const text = $('ai-prompt').value.trim(); if (!text) { $('ai-prompt').focus(); showToast('予定の内容を入力してください'); return; } addNaturalLanguageEvent(text); };
    document.querySelectorAll('.modal-overlay').forEach(overlay => overlay.addEventListener('click', e => { if (e.target === overlay) overlay.id === 'timetable-modal' ? cancelTimetableModal() : closeModal(overlay.id); }));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { document.querySelectorAll('.modal-overlay.active').forEach(x => x.id === 'timetable-modal' ? cancelTimetableModal() : closeModal(x.id)); closeDrawer(); } });
  }
  bindEvents(); updateUI();
  if (savedPresetNamesNeedCleaning) save();
  setTimeout(() => $('skeleton').classList.add('done'), 500);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
})();
