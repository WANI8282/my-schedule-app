// =========================================
// 🔒 簡易セキュリティ機能 (合言葉認証)
// =========================================
const SECRET_PASSWORD = "1234"; // ★ 好きな合言葉（数字や英字）に変更してください

const userPrompt = prompt("合言葉（パスワード）を入力してください:");
if (userPrompt !== SECRET_PASSWORD) {
  document.body.innerHTML = `
    <div style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; background:#f8f9fa;">
      <div style="text-align:center; padding:30px; background:white; border-radius:12px; box-shadow:0 4px 15px rgba(0,0,0,0.1);">
        <h2 style="color:#e53e3e; margin-bottom:10px;">🔒 アクセスが拒否されました</h2>
        <p style="color:#666;">正しい合言葉を入力してください。</p>
      </div>
    </div>
  `;
  throw new Error("Unauthorized access - Invalid password.");
}

// =========================================
// アプリ本体のロジック
// =========================================
let currentDate = new Date(2026, 9, 14); 
let currentView = 'week';
let selectedPresetId = null;
let isSemesterActive = true; 

const hours = Array.from({length: 13}, (_, i) => `${i+9}:00`); 
const dayNames = ['月', '火', '水', '木', '金', '土', '日'];

let presets = [
  { id: 1, name: "💼 バイト", color: "#FF9800" },
  { id: 2, name: "⚽️ サークル", color: "#4CAF50" },
  { id: 3, name: "🍻 遊び", color: "#E91E63" },
  { id: 4, name: "✈️ 旅行", color: "#9C27B0" }
];

let universitySchedule = {
  1: ["10:00", "13:00"], 
  2: ["10:00"]           
};

let scheduleData = {
  "2026-10-14": { "17:00": 1, "19:00": 2 },
  "2026-10-15": { "allday": 4 }
};

function formatDateKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function getWeekDays(d) {
  const tmp = new Date(d);
  const diff = tmp.getDay() === 0 ? 6 : tmp.getDay() - 1;
  tmp.setDate(tmp.getDate() - diff);
  return Array.from({length: 7}, (_, i) => { const nd = new Date(tmp); nd.setDate(nd.getDate() + i); return nd; });
}

function init() {
  setupEventListeners();
  updateUI();
}

function updateUI() {
  renderPalette();
  const title = document.getElementById('calendar-title');
  document.getElementById('btn-week').classList.toggle('active', currentView === 'week');
  document.getElementById('btn-month').classList.toggle('active', currentView === 'month');
  
  if (currentView === 'week') {
    title.innerText = `${currentDate.getFullYear()}年 ${currentDate.getMonth()+1}月 第${Math.ceil(currentDate.getDate()/7)}週`;
    document.getElementById('view-week').classList.remove('hidden');
    document.getElementById('view-month').classList.add('hidden');
    renderWeekView();
  } else {
    title.innerText = `${currentDate.getFullYear()}年 ${currentDate.getMonth()+1}月`;
    document.getElementById('view-week').classList.add('hidden');
    document.getElementById('view-month').classList.remove('hidden');
    renderMonthView();
  }
}

function renderPalette() {
  const grid = document.getElementById('palette-grid');
  grid.innerHTML = '';
  presets.forEach(p => {
    const btn = document.createElement('button');
    btn.className = `palette-btn ${selectedPresetId === p.id ? 'selected' : ''}`;
    btn.style.backgroundColor = p.color;
    btn.innerText = p.name;
    btn.onclick = () => {
      selectedPresetId = selectedPresetId === p.id ? null : p.id;
      document.getElementById('btn-cancel-edit').style.display = selectedPresetId ? 'block' : 'none';
      renderPalette();
    };
    grid.appendChild(btn);
  });
}

function renderWeekView() {
  const weekDays = getWeekDays(currentDate);
  const todayKey = formatDateKey(new Date());
  
  let headerHtml = `<div class="day-head"></div>`;
  let allDayHtml = `<div class="all-day-label">終日</div>`;
  
  weekDays.forEach((d) => {
    const dKey = formatDateKey(d);
    const isToday = dKey === todayKey ? 'today' : '';
    headerHtml += `<div class="day-head ${isToday}">${dNames(d)} ${d.getDate()}</div>`;
    
    const adEvent = scheduleData[dKey] && scheduleData[dKey]["allday"];
    let adContent = '';
    if (adEvent) {
      const p = presets.find(x => x.id === adEvent);
      if (p) adContent = `<div class="event-block" style="background:${p.color}">${p.name}</div>`;
    }
    allDayHtml += `<div class="all-day-cell" data-date="${dKey}" data-time="allday">${adContent}</div>`;
  });
  document.getElementById('week-header').innerHTML = headerHtml;
  document.getElementById('all-day-row').innerHTML = allDayHtml;

  const grid = document.getElementById('timeline-grid');
  let gridHtml = `<div class="time-col-label">`;
  hours.forEach(h => gridHtml += `<div class="time-label">${h}</div>`);
  gridHtml += `</div>`;

  weekDays.forEach((d, dayIndex) => {
    gridHtml += `<div class="day-col-grid">`;
    const dKey = formatDateKey(d);
    
    hours.forEach(h => {
      const eventId = scheduleData[dKey] && scheduleData[dKey][h];
      const isBusy = isSemesterActive && universitySchedule[dayIndex] && universitySchedule[dayIndex].includes(h);
      const busyClass = isBusy ? 'busy' : '';

      let content = '';
      if (eventId) {
        const p = presets.find(x => x.id === eventId);
        if (p) content = `<div class="event-block" style="background:${p.color}">${p.name}</div>`;
      }
      gridHtml += `<div class="time-cell ${busyClass}" data-date="${dKey}" data-time="${h}">${content}</div>`;
    });
    gridHtml += `</div>`;
  });
  grid.innerHTML = gridHtml;

  document.querySelectorAll('.time-cell, .all-day-cell').forEach(cell => {
    cell.addEventListener('click', (e) => {
      const dKey = e.currentTarget.dataset.date;
      const tKey = e.currentTarget.dataset.time;
      
      if (selectedPresetId) {
        if (!scheduleData[dKey]) scheduleData[dKey] = {};
        scheduleData[dKey][tKey] = selectedPresetId;
        renderWeekView(); 
      } else if (scheduleData[dKey] && scheduleData[dKey][tKey]) {
        if(confirm("予定を削除しますか？")) {
          delete scheduleData[dKey][tKey];
          renderWeekView();
        }
      }
    });
  });
}
function dNames(d) { return dayNames[d.getDay() === 0 ? 6 : d.getDay() - 1]; }

function renderMonthView() {
  const grid = document.getElementById('month-grid');
  let html = '';
  const y = currentDate.getFullYear(), m = currentDate.getMonth();
  const firstDay = new Date(y, m, 1);
  const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const d = new Date(y, m, 1 - startOffset);

  dayNames.forEach(n => html += `<div class="day-head">${n}</div>`);

  for (let i = 0; i < 42; i++) {
    const dKey = formatDateKey(d);
    const isOtherMonth = d.getMonth() !== m ? 'other-month' : '';
    let eventsHtml = '';
    if (scheduleData[dKey]) {
      Object.values(scheduleData[dKey]).forEach(eid => {
        const p = presets.find(x => x.id === eid);
        if (p) eventsHtml += `<div class="event-dot" style="background:${p.color}">${p.name}</div>`;
      });
    }
    html += `<div class="month-day-cell ${isOtherMonth}" data-date="${dKey}"><div class="month-date">${d.getDate()}</div>${eventsHtml}</div>`;
    d.setDate(d.getDate() + 1);
  }
  grid.innerHTML = html;

  document.querySelectorAll('.month-day-cell').forEach(cell => {
    cell.addEventListener('click', (e) => {
      currentDate = new Date(e.currentTarget.dataset.date);
      currentView = 'week';
      updateUI();
    });
  });
}

// モーダル処理
let editingPresets = [];
let editingTimetable = {};

function openPresetModal() {
  editingPresets = JSON.parse(JSON.stringify(presets));
  renderPresetEditor();
  document.getElementById('preset-modal').classList.add('active');
}
function renderPresetEditor() {
  const list = document.getElementById('preset-list');
  list.innerHTML = '';
  editingPresets.forEach((p, idx) => {
    list.innerHTML += `
      <div class="preset-item">
        <input type="text" value="${p.name}" data-idx="${idx}" class="preset-name">
        <input type="color" value="${p.color}" data-idx="${idx}" class="preset-color">
        <button class="btn-remove" data-idx="${idx}">✖</button>
      </div>`;
  });
  document.querySelectorAll('.preset-name').forEach(el => el.oninput = (e) => editingPresets[e.target.dataset.idx].name = e.target.value);
  document.querySelectorAll('.preset-color').forEach(el => el.oninput = (e) => editingPresets[e.target.dataset.idx].color = e.target.value);
  document.querySelectorAll('.btn-remove').forEach(el => el.onclick = (e) => { editingPresets.splice(e.target.dataset.idx, 1); renderPresetEditor(); });
}

function openTimetableModal() {
  editingTimetable = JSON.parse(JSON.stringify(universitySchedule));
  document.getElementById('toggle-semester-active').checked = isSemesterActive;
  
  const editor = document.getElementById('timetable-editor');
  let html = `<div class="tt-grid"><div class="tt-header">時間</div>`;
  dayNames.forEach(d => html += `<div class="tt-header">${d}</div>`);
  
  hours.forEach(h => {
    html += `<div class="tt-time">${h}</div>`;
    for(let dIdx = 0; dIdx < 7; dIdx++) {
      const isChecked = editingTimetable[dIdx] && editingTimetable[dIdx].includes(h) ? 'checked' : '';
      html += `<div><input type="checkbox" class="tt-checkbox" data-d="${dIdx}" data-h="${h}" ${isChecked}></div>`;
    }
  });
  html += `</div>`;
  editor.innerHTML = html;
  
  document.querySelectorAll('.tt-checkbox').forEach(cb => {
    cb.onchange = (e) => {
      const d = e.target.dataset.d, h = e.target.dataset.h;
      if (!editingTimetable[d]) editingTimetable[d] = [];
      if (e.target.checked) editingTimetable[d].push(h);
      else editingTimetable[d] = editingTimetable[d].filter(time => time !== h);
    };
  });
  
  document.getElementById('timetable-modal').classList.add('active');
}

function setupEventListeners() {
  document.getElementById('btn-week').onclick = () => { currentView = 'week'; updateUI(); };
  document.getElementById('btn-month').onclick = () => { currentView = 'month'; updateUI(); };
  document.getElementById('prev-btn').onclick = () => { currentView === 'week' ? currentDate.setDate(currentDate.getDate() - 7) : currentDate.setMonth(currentDate.getMonth() - 1); updateUI(); };
  document.getElementById('next-btn').onclick = () => { currentView === 'week' ? currentDate.setDate(currentDate.getDate() + 7) : currentDate.setMonth(currentDate.getMonth() + 1); updateUI(); };
  
  document.getElementById('btn-cancel-edit').onclick = () => { selectedPresetId = null; document.getElementById('btn-cancel-edit').style.display = 'none'; renderPalette(); };

  document.getElementById('btn-open-preset-setting').onclick = openPresetModal;
  document.getElementById('btn-add-preset').onclick = () => { editingPresets.push({id: Date.now(), name: "新規", color: "#333"}); renderPresetEditor(); };
  document.getElementById('btn-preset-cancel').onclick = () => document.getElementById('preset-modal').classList.remove('active');
  document.getElementById('btn-preset-save').onclick = () => { presets = JSON.parse(JSON.stringify(editingPresets)); updateUI(); document.getElementById('preset-modal').classList.remove('active'); };

  document.getElementById('btn-open-timetable').onclick = openTimetableModal;
  document.getElementById('btn-timetable-cancel').onclick = () => document.getElementById('timetable-modal').classList.remove('active');
  document.getElementById('btn-timetable-save').onclick = () => { 
    universitySchedule = JSON.parse(JSON.stringify(editingTimetable)); 
    isSemesterActive = document.getElementById('toggle-semester-active').checked;
    updateUI(); 
    document.getElementById('timetable-modal').classList.remove('active'); 
  };
}

init();