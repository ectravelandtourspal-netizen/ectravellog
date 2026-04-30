/* ════════════════════════════════════════════════════════
   EC Travel LOG — script.js
   All frontend logic: landing, office staff, trips, admin
════════════════════════════════════════════════════════ */

// ── Google Apps Script Web App URL (public endpoint)
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzQ7SLcTmOc8FC-IuQbKu0QwPbzMZalzz-lyqvOaASgWC3l4tD6dDfpwnD_8MLm_d0_/exec';

// ── GAS helpers ──────────────────────────────────────────
async function gasGet(params) {
  const url = new URL(GAS_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString());
  return res.json();
}

async function gasPost(payload) {
  const url = new URL(GAS_URL);
  url.searchParams.set('payload', JSON.stringify(payload));
  const res = await fetch(url.toString(), { method: 'POST', redirect: 'follow' });
  return res.json();
}

// ══════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════
let isAdmin = false;

// ══════════════════════════════════════════════════════════
// DOM REFS — Landing
// ══════════════════════════════════════════════════════════
const landingPage      = document.getElementById('landingPage');
const officeSection    = document.getElementById('officeSection');
const onBoardSection   = document.getElementById('onBoardSection');

// ══════════════════════════════════════════════════════════
// LANDING NAVIGATION
// ══════════════════════════════════════════════════════════
document.getElementById('officeStaffBtn').addEventListener('click', () => {
  landingPage.classList.add('hidden');
  officeSection.classList.remove('hidden');
  loadOfficeDashboard();
});

document.getElementById('onBoardStaffBtn').addEventListener('click', () => {
  landingPage.classList.add('hidden');
  onBoardSection.classList.remove('hidden');
  loadDashboard();
  loadStaffNamesDatalist();
});

document.getElementById('officeBackBtn').addEventListener('click', () => {
  officeSection.classList.add('hidden');
  landingPage.classList.remove('hidden');
});

document.getElementById('onBoardBackBtn').addEventListener('click', () => {
  onBoardSection.classList.add('hidden');
  landingPage.classList.remove('hidden');
});

// ══════════════════════════════════════════════════════════
// OFFICE STAFF — Time In
// ══════════════════════════════════════════════════════════
const timeInModalOverlay = document.getElementById('timeInModalOverlay');
const timeInForm         = document.getElementById('timeInForm');
const timeInFeedback     = document.getElementById('timeInFeedback');
const officeBody         = document.getElementById('officeBody');
let _timeInClock = null; // interval for live clock

document.getElementById('timeInBtn').addEventListener('click', () => {
  // set today's date
  const today = new Date();
  const yy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  document.getElementById('tiDate').value = `${yy}-${mm}-${dd}`;

  // live clock — update every second
  const timeInput = document.getElementById('tiTime');
  function tickClock() {
    const n = new Date();
    const hh = String(n.getHours()).padStart(2, '0');
    const mi = String(n.getMinutes()).padStart(2, '0');
    const ss = String(n.getSeconds()).padStart(2, '0');
    timeInput.value = `${hh}:${mi}:${ss}`;
  }
  tickClock();
  clearInterval(_timeInClock);
  _timeInClock = setInterval(tickClock, 1000);

  // auto-fill location via geolocation (always read-only)
  const locInput = document.getElementById('tiLocation');
  locInput.value = '';
  locInput.placeholder = '📍 Getting location…';

  function applyCoords(lat, lon) {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    fetch(url, { headers: { 'Accept-Language': 'en' } })
      .then(r => r.json())
      .then(geo => {
        const addr = geo.address || {};
        const parts = [
          addr.village || addr.town || addr.city || addr.municipality || addr.county || '',
          addr.state || '',
          addr.country || '',
        ].filter(Boolean);
        locInput.value = parts.join(', ') || geo.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        locInput.placeholder = '📍 Location detected';
      })
      .catch(() => {
        locInput.value = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        locInput.placeholder = '📍 Location detected';
      });
  }

  if (navigator.geolocation) {
    // First try high-accuracy (GPS), fall back to low-accuracy (WiFi/cell) on timeout/error
    navigator.geolocation.getCurrentPosition(
      pos => applyCoords(pos.coords.latitude, pos.coords.longitude),
      () => {
        // Retry with low accuracy (faster, uses WiFi/cell towers)
        navigator.geolocation.getCurrentPosition(
          pos => applyCoords(pos.coords.latitude, pos.coords.longitude),
          () => {
            locInput.value = '';
            locInput.placeholder = '⚠️ Location unavailable — check browser permissions';
          },
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  } else {
    locInput.placeholder = '⚠️ Geolocation not supported';
  }

  hideFeedback(timeInFeedback);
  openModal(timeInModalOverlay);
});

function _stopTimeInClock() { clearInterval(_timeInClock); _timeInClock = null; }

document.getElementById('closeTimeInModal').addEventListener('click', () => { _stopTimeInClock(); closeModal(timeInModalOverlay); });
document.getElementById('cancelTimeInBtn').addEventListener('click', () => { _stopTimeInClock(); closeModal(timeInModalOverlay); });
timeInModalOverlay.addEventListener('click', e => { if (e.target === timeInModalOverlay) { _stopTimeInClock(); closeModal(timeInModalOverlay); } });

timeInForm.addEventListener('submit', async e => {
  e.preventDefault();
  hideFeedback(timeInFeedback);
  const name     = document.getElementById('tiStaffName').value.trim();
  const position = document.getElementById('tiPosition').value.trim();
  const date     = document.getElementById('tiDate').value;
  const location = document.getElementById('tiLocation').value.trim();

  if (!name || !position) {
    showFeedback(timeInFeedback, 'Please fill in all required fields.', 'error');
    return;
  }
  if (!location) {
    showFeedback(timeInFeedback, '⚠️ Location not yet detected. Please wait or allow location access.', 'error');
    return;
  }

  const btn = document.getElementById('timeInSubmitBtn');
  btn.disabled = true; btn.textContent = 'Saving…';

  // Snapshot the displayed time at the moment of submit
  const time = document.getElementById('tiTime').value || (() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`;
  })();
  _stopTimeInClock();

  try {
    const data = await gasPost({ action: 'officeTimeIn', name, position, date, time, location });
    if (!data.success) throw new Error(data.message || 'Failed to save');
    showFeedback(timeInFeedback, '✅ Time in recorded!', 'success');
    timeInForm.reset();
    await loadOfficeDashboard();
    setTimeout(() => closeModal(timeInModalOverlay), 1200);
  } catch (err) {
    showFeedback(timeInFeedback, `❌ ${err.message}`, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Time In';
  }
});

async function loadOfficeDashboard() {
  officeBody.innerHTML = '<tr><td colspan="5" class="empty-msg">Loading…</td></tr>';
  try {
    const today = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    })();
    const data = await gasGet({ action: 'getOfficeAttendance', date: today });
    if (!data.success) throw new Error(data.message || 'Failed to load');
    const rows = data.records || [];
    if (rows.length === 0) {
      officeBody.innerHTML = '<tr><td colspan="5" class="empty-msg">No time-ins recorded today.</td></tr>';
      return;
    }
    officeBody.innerHTML = rows.map(r => `
      <tr>
        <td>${escapeHTML(r.name)}</td>
        <td>${escapeHTML(r.position)}</td>
        <td>${escapeHTML(r.time)}</td>
        <td>${escapeHTML(r.location)}</td>
        <td>${escapeHTML(r.date)}</td>
      </tr>`).join('');
  } catch (err) {
    officeBody.innerHTML = `<tr><td colspan="5" class="empty-msg">⚠️ ${err.message}</td></tr>`;
  }
}

// ══════════════════════════════════════════════════════════
// DOM REFS — Trips & Admin
// ══════════════════════════════════════════════════════════
const newTripBtn        = document.getElementById('newTripBtn');
const tripModalOverlay  = document.getElementById('tripModalOverlay');
const closeTripModal    = document.getElementById('closeTripModal');
const cancelTripBtn     = document.getElementById('cancelTripBtn');
const tripForm          = document.getElementById('tripForm');
const submitBtn         = document.getElementById('submitBtn');
const formFeedback      = document.getElementById('formFeedback');

const endDateInput      = document.getElementById('endDate');

const staffTableEl      = document.getElementById('staffTable');
const addStaffRowBtn    = document.getElementById('addStaffRow');

const adminBtn          = document.getElementById('adminBtn');
const adminModalOverlay = document.getElementById('adminModalOverlay');
const closeAdminModal   = document.getElementById('closeAdminModal');
const adminForm         = document.getElementById('adminForm');
const adminFeedback     = document.getElementById('adminFeedback');

// Salary panels
const adminPanelLogin   = document.getElementById('adminPanelLogin');
const adminPanelSalary  = document.getElementById('adminPanelSalary');
const adminPanelDetail  = document.getElementById('adminPanelDetail');
const staffBalanceList  = document.getElementById('staffBalanceList');
const salaryFeedback    = document.getElementById('salaryFeedback');
const detailFeedback    = document.getElementById('detailFeedback');
const detailStaffName   = document.getElementById('detailStaffName');
const salaryDetailTable = document.getElementById('salaryDetailTable');
const markPaidBtn       = document.getElementById('markPaidBtn');
const amountGivenInput  = document.getElementById('amountGivenInput');
const payNotesInput     = document.getElementById('payNotesInput');
const payDeductInput    = document.getElementById('payDeductInput');
let currentDetailRows   = [];
let currentStaffName    = '';
let currentGrandTotal   = 0;
let currentTotalAdvances = 0;

const tripsBody         = document.getElementById('tripsBody');
const adminOnlyCols     = document.querySelectorAll('.admin-only');

// Cash advance panel
const adminPanelAdvance = document.getElementById('adminPanelAdvance');
const advanceFeedback   = document.getElementById('advanceFeedback');
const advStaffName      = document.getElementById('advStaffName');
const advDate           = document.getElementById('advDate');
const advAmount         = document.getElementById('advAmount');
const advNotes          = document.getElementById('advNotes');
let currentAdvanceRows  = []; // rowIndexes of outstanding advances shown in detail

// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  buildDefaultStaffRows();
  wireEndDate();
});

// ══════════════════════════════════════════════════════════
// STAFF NAMES DATALIST — loaded from rates sheet col A
// ══════════════════════════════════════════════════════════
async function loadStaffNamesDatalist() {
  try {
    const data = await gasGet({ action: 'getStaffNames' });
    if (!data.success || !data.names) return;
    const dl = document.getElementById('staffNamesList');
    dl.innerHTML = data.names.map(n => `<option value="${escapeAttr(n)}"></option>`).join('');
  } catch (_) { /* non-critical, silently fail */ }
}

// ══════════════════════════════════════════════════════════
// END DATE — auto-calculate from start date + number of days
// Rule: end date = start date + (days - 1)
//   e.g. start 03/03/2026, days 3 → end 03/05/2026
// ══════════════════════════════════════════════════════════
function wireEndDate() {
  const startInput = document.getElementById('startDate');
  const daysInput  = document.getElementById('numDays');

  function recalcEndDate() {
    const startVal = startInput.value;
    const daysVal  = parseInt(daysInput.value, 10);

    if (startVal && daysVal >= 1) {
      // Parse as local date to avoid UTC-shift issues
      const [year, month, day] = startVal.split('-').map(Number);
      const start = new Date(year, month - 1, day);
      start.setDate(start.getDate() + daysVal - 1);

      // Format back to YYYY-MM-DD for the date input
      const yy = start.getFullYear();
      const mm = String(start.getMonth() + 1).padStart(2, '0');
      const dd = String(start.getDate()).padStart(2, '0');
      endDateInput.value = `${yy}-${mm}-${dd}`;
    } else {
      endDateInput.value = '';
    }
  }

  startInput.addEventListener('change', recalcEndDate);
  daysInput.addEventListener('input',  recalcEndDate);
}

// ══════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════

// Safe JSON parser — checks Content-Type before calling .json()
// so the user sees a clear message instead of "Unexpected token '<'"
async function safeJSON(response) {
  const ct = response.headers.get('content-type') || '';
  if (!ct.includes('application/json') && !ct.includes('text/plain')) {
    const text = await response.text().catch(() => '');
    if (text.trimStart().startsWith('<')) {
      throw new Error('The server returned an HTML page instead of JSON. Check that the Google Apps Script is deployed with "Anyone" access.');
    }
    throw new Error(`Unexpected server response (HTTP ${response.status}).`);
  }
  return response.json();
}

async function loadDashboard() {
  try {
    const data = await gasGet({ action: 'getTrips' });
    if (!data.success) throw new Error(data.message || 'Failed to load trips');
    renderDashboard(data.trips);
  } catch (err) {
    tripsBody.innerHTML = `<tr><td colspan="7" class="empty-msg">⚠️ ${err.message}</td></tr>`;
  }
}

function renderDashboard(trips) {
  if (!trips || trips.length === 0) {
    tripsBody.innerHTML = '<tr><td colspan="7" class="empty-msg">No trips recorded yet.</td></tr>';
    return;
  }

  tripsBody.innerHTML = trips.map(t => {
    const routeBadge = t.route === 'El Nido to Coron'
      ? `<span class="badge badge-blue">${t.route}</span>`
      : `<span class="badge badge-green">${t.route}</span>`;

    // Admin-only cells
    let staffCell  = '';
    let imagesCell = '';

    if (isAdmin) {
      let staffList = [];
      try { staffList = JSON.parse(t.staffList || '[]'); } catch {}
      staffCell = `<td>${staffList.map(s => `<div><strong>${s.position}</strong>: ${s.name}</div>`).join('') || '—'}</td>`;

      let imgs = [];
      try { imgs = JSON.parse(t.imageURLs || '[]'); } catch {}
      imagesCell = `<td>${imgs.map(url => `<a href="${sanitizeURL(url)}" target="_blank" rel="noopener noreferrer">🖼</a>`).join(' ') || '—'}</td>`;
    }

    return `
      <tr>
        <td>${escapeHTML(formatDate(t.date))}</td>
        <td>${routeBadge}</td>
        <td>${escapeHTML(t.boat)}</td>
        <td>${escapeHTML(String(t.guests))}</td>
        <td>${escapeHTML(t.teamLeader)}</td>
        ${staffCell}
        ${imagesCell}
      </tr>`;
  }).join('');
}

function toggleAdminColumns(show) {
  adminOnlyCols.forEach(el => {
    if (show) el.classList.remove('hidden');
    else      el.classList.add('hidden');
  });
}

// ══════════════════════════════════════════════════════════
// TRIP MODAL — open / close
// ══════════════════════════════════════════════════════════
newTripBtn.addEventListener('click', () => {
  openModal(tripModalOverlay);
});

closeTripModal.addEventListener('click',  () => closeModal(tripModalOverlay));
cancelTripBtn.addEventListener('click',   () => closeModal(tripModalOverlay));

tripModalOverlay.addEventListener('click', e => {
  if (e.target === tripModalOverlay) closeModal(tripModalOverlay);
});

// ══════════════════════════════════════════════════════════
// STAFF ROWS
// ══════════════════════════════════════════════════════════
const DEFAULT_STAFF_ROWS = 5;

// Pre-defined positions for the 5 default rows
const DEFAULT_POSITIONS = [
  'Lead Tour Guide',
  'Asst. Tour Guide',
  'Chef',
  'Boat Crew',
  'Boat Crew',
];

// All selectable positions for the "add row" dropdown
const POSITION_OPTIONS = [
  'Lead Tour Guide',
  'Asst. Tour Guide',
  'Chef',
  'Asst. Chef',
  'Boat Crew',
  'Fire Dancer',
  'Other',
];

function buildDefaultStaffRows() {
  DEFAULT_POSITIONS.forEach(pos => addStaffRow(pos, '', true));
}

/**
 * @param {string}  position  - pre-selected position value
 * @param {string}  name      - pre-filled name value
 * @param {boolean} isDefault - if true, render position as plain readonly text;
 *                              if false, render position as a dropdown
 */
function addStaffRow(position = '', name = '', isDefault = false) {
  const row = document.createElement('div');
  row.className = 'staff-row';

  let positionCell;
  if (isDefault) {
    // Default rows: show position as a non-editable styled label
    positionCell = `<input type="text" value="${escapeAttr(position)}" class="staff-position" readonly tabindex="-1" />`;
  } else {
    // Added rows: show a dropdown
    const options = POSITION_OPTIONS.map(opt =>
      `<option value="${escapeAttr(opt)}"${opt === position ? ' selected' : ''}>${escapeAttr(opt)}</option>`
    ).join('');
    positionCell = `<select class="staff-position"><option value="">— Position —</option>${options}</select>`;
  }

  row.innerHTML = `
    ${positionCell}
    <input type="text" placeholder="Full name" value="${escapeAttr(name)}" class="staff-name" list="staffNamesList" autocomplete="off" />
    <button type="button" class="btn-icon remove-staff" title="Remove row">✕</button>`;

  staffTableEl.appendChild(row);

  row.querySelector('.remove-staff').addEventListener('click', () => {
    if (staffTableEl.querySelectorAll('.staff-row').length > 1) {
      row.remove();
    } else {
      showFeedback(formFeedback, 'At least one staff row is required.', 'error');
    }
  });
}

addStaffRowBtn.addEventListener('click', () => addStaffRow('', '', false));

function collectStaff() {
  const rows = staffTableEl.querySelectorAll('.staff-row');
  return Array.from(rows).map(r => ({
    position: r.querySelector('.staff-position').value.trim(),
    name:     r.querySelector('.staff-name').value.trim(),
  })).filter(s => s.position || s.name);
}

// ══════════════════════════════════════════════════════════
// FORM SUBMIT
// ══════════════════════════════════════════════════════════
tripForm.addEventListener('submit', async e => {
  e.preventDefault();
  hideFeedback(formFeedback);

  // ── Basic field validation
  const startDate = tripForm.startDate.value.trim();
  const numDays   = tripForm.numDays.value.trim();
  const boatName  = tripForm.boatName.value.trim();
  const route     = tripForm.route.value.trim();
  const numGuests = tripForm.numGuests.value.trim();

  if (!startDate || !numDays || !boatName || !route || !numGuests) {
    showFeedback(formFeedback, 'Please fill in all required trip fields.', 'error');
    return;
  }

  const staffList = collectStaff();
  if (staffList.length === 0) {
    showFeedback(formFeedback, 'Please add at least one staff member.', 'error');
    return;
  }

  // First 4 default rows (Lead Tour Guide, Asst. Tour Guide, Chef, Boat Crew)
  // must have a name filled in before submitting.
  const allRows   = Array.from(staffTableEl.querySelectorAll('.staff-row'));
  const required  = allRows.slice(0, 4);
  const missing   = required.find(r => !r.querySelector('.staff-name').value.trim());
  if (missing) {
    const pos = missing.querySelector('.staff-position').value || 'staff';
    showFeedback(formFeedback, `Please enter a name for "${pos}" before submitting.`, 'error');
    missing.querySelector('.staff-name').focus();
    return;
  }

  const teamLeader = staffList[0].name || '—';

  // ── Disable button & show spinner
  setLoading(submitBtn, true);

  try {
    // ── 1. Map staff list to named sheet columns
    const staffList = collectStaff();
    const named = { leadTourGuide: '', asstTourGuide: '', chef: '', boatCrew1: '', boatCrew2: '', fireDancer: '' };
    const filled = { leadTourGuide: 0, asstTourGuide: 0, chef: 0, boatCrew: 0, fireDancer: 0 };
    const additional = [];
    for (const s of staffList) {
      const pos = (s.position || '').toLowerCase().trim();
      if (pos === 'lead tour guide')   { if (!filled.leadTourGuide)  { named.leadTourGuide  = s.name; filled.leadTourGuide++; }  else additional.push(s); }
      else if (pos === 'asst. tour guide') { if (!filled.asstTourGuide) { named.asstTourGuide = s.name; filled.asstTourGuide++; } else additional.push(s); }
      else if (pos === 'chef')         { if (!filled.chef)           { named.chef           = s.name; filled.chef++; }          else additional.push(s); }
      else if (pos === 'boat crew')    { filled.boatCrew++; if (filled.boatCrew === 1) named.boatCrew1 = s.name; else if (filled.boatCrew === 2) named.boatCrew2 = s.name; else additional.push(s); }
      else if (pos === 'fire dancer')  { if (!filled.fireDancer)     { named.fireDancer     = s.name; filled.fireDancer++; }    else additional.push(s); }
      else additional.push(s);
    }
    const add1 = additional[0] || { position: '', name: '' };
    const add2 = additional[1] || { position: '', name: '' };
    const add3 = additional[2] || { position: '', name: '' };

    // ── 3. Submit trip to Google Sheets via GAS
    const data = await gasPost({
      action:        'addTrip',
      startDate:     startDate,
      endDate:       endDateInput.value || '',
      days:          Number(numDays),
      guests:        Number(numGuests),
      boat:          boatName,
      route,
      leadTourGuide: named.leadTourGuide,
      asstTourGuide: named.asstTourGuide,
      chef:          named.chef,
      boatCrew1:     named.boatCrew1,
      boatCrew2:     named.boatCrew2,
      fireDancer:    named.fireDancer,
      add1Position:  add1.position,
      add1Name:      add1.name,
      add2Position:  add2.position,
      add2Name:      add2.name,
      add3Position:  add3.position,
      add3Name:      add3.name,
      imageURLs:     '[]',
    });

    if (!data.success) throw new Error(data.message || 'Submission failed');

    // ── 3. Success
    showFeedback(formFeedback, '✅ Trip submitted successfully!', 'success');
    resetForm();
    await loadDashboard();

    // Auto-close modal after 1.5 s
    setTimeout(() => closeModal(tripModalOverlay), 1500);

  } catch (err) {
    showFeedback(formFeedback, `❌ ${err.message}`, 'error');
  } finally {
    setLoading(submitBtn, false);
  }
});

function resetForm() {
  tripForm.reset();
  endDateInput.value = '';
  staffTableEl.querySelectorAll('.staff-row').forEach(r => r.remove());
  buildDefaultStaffRows();
}

// ══════════════════════════════════════════════════════════
// ADMIN MODAL — login + salary dashboard
// ══════════════════════════════════════════════════════════
adminBtn.addEventListener('click', () => {
  if (isAdmin) {
    showSalaryPanel();
    openModal(adminModalOverlay);
  } else {
    showLoginPanel();
    openModal(adminModalOverlay);
  }
});

// Close buttons
closeAdminModal.addEventListener('click', () => closeModal(adminModalOverlay));
document.getElementById('closeSalaryModal').addEventListener('click', () => closeModal(adminModalOverlay));
document.getElementById('closeDetailModal').addEventListener('click', () => closeModal(adminModalOverlay));
adminModalOverlay.addEventListener('click', e => {
  if (e.target === adminModalOverlay) closeModal(adminModalOverlay);
});

// ── Login form submit
adminForm.addEventListener('submit', async e => {
  e.preventDefault();
  hideFeedback(adminFeedback);
  const user = document.getElementById('adminUser').value.trim();
  const pass = document.getElementById('adminPass').value;
  if (!user || !pass) return showFeedback(adminFeedback, 'Enter username and password.', 'error');

  const btn = document.getElementById('adminLoginBtn');
  btn.disabled = true;
  btn.textContent = 'Logging in…';

  try {
    const data = await gasPost({ action: 'adminLogin', username: user, password: pass });
    if (!data.success) throw new Error(data.message || 'Invalid credentials');

    isAdmin = true;
    adminBtn.textContent = '🔑 Admin';
    toggleAdminColumns(true);
    loadDashboard();
    showSalaryPanel();
  } catch (err) {
    showFeedback(adminFeedback, err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Login';
  }
});

// ── Logout
document.getElementById('adminLogoutBtn').addEventListener('click', () => {
  isAdmin = false;
  adminBtn.textContent = 'Admin';
  toggleAdminColumns(false);
  loadDashboard();
  closeModal(adminModalOverlay);
  document.getElementById('adminUser').value = '';
  document.getElementById('adminPass').value = '';
});

// ── Refresh balances
document.getElementById('salaryRefreshBtn').addEventListener('click', loadStaffBalances);

// listen to deduction input change to update suggested amount
payDeductInput.addEventListener('input', updateLiveNet);

function updateLiveNet() {
  const liveRow    = document.getElementById('liveNetRow');
  const liveAmt    = document.getElementById('liveNetAmount');
  const deductAmt  = Number(payDeductInput.value) || 0;
  const net        = currentGrandTotal - currentTotalAdvances - deductAmt;
  const netDisplay = Math.max(0, net);
  if (liveAmt)  liveAmt.textContent = `₱${netDisplay.toLocaleString()}`;
  if (liveRow)  liveRow.classList.toggle('hidden', !currentGrandTotal);
  amountGivenInput.placeholder = `Suggested: ₱${netDisplay.toLocaleString()}`;
}

// ── Back to salary list
document.getElementById('backToSalaryBtn').addEventListener('click', showSalaryPanel);

// ── Cash Advance button (from salary dashboard)
document.getElementById('recordAdvanceBtn').addEventListener('click', () => showAdvancePanel(''));

// ── Back from advance panel
document.getElementById('backFromAdvanceBtn').addEventListener('click', showSalaryPanel);

// ── Save cash advance
document.getElementById('saveAdvanceBtn').addEventListener('click', async () => {
  const name   = advStaffName.value.trim();
  const date   = advDate.value;
  const amount = Number(advAmount.value);
  if (!name || !date || !amount || amount <= 0) {
    showFeedback(advanceFeedback, '⚠️ Please fill in Staff Name, Date, and Amount.', 'error');
    return;
  }
  const btn = document.getElementById('saveAdvanceBtn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const data = await gasPost({ action: 'addCashAdvance', staffName: name, date, amount, notes: advNotes.value.trim() });
    if (!data.success) throw new Error(data.message);
    showFeedback(advanceFeedback, '✅ Cash advance recorded!', 'success');
    advStaffName.value = ''; advDate.value = ''; advAmount.value = ''; advNotes.value = '';
    setTimeout(() => showSalaryPanel(), 1400);
  } catch (err) {
    showFeedback(advanceFeedback, err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Save Cash Advance';
  }
});

// ── Mark all as paid
markPaidBtn.addEventListener('click', async () => {
  if (!currentDetailRows.length) return;

  const rawAmount = amountGivenInput.value.trim();
  if (rawAmount === '') {
    showFeedback(detailFeedback, '⚠️ Please enter the amount to give before marking as paid.', 'error');
    amountGivenInput.focus();
    return;
  }
  const amountPaid = Number(rawAmount);
  if (isNaN(amountPaid) || amountPaid < 0) {
    showFeedback(detailFeedback, '⚠️ Please enter a valid positive amount.', 'error');
    amountGivenInput.focus();
    return;
  }

  markPaidBtn.disabled = true;
  markPaidBtn.textContent = 'Processing…';
  try {
    const data = await gasPost({
      action:            'markPaid',
      rowIndexes:        currentDetailRows,
      amountPaid,
      notes:             payNotesInput.value.trim(),
      deduction:         currentTotalAdvances + (Number(payDeductInput.value) || 0),
      staffName:         currentStaffName,
      totalOwed:         currentGrandTotal,
      advanceRowIndexes: currentAdvanceRows,
    });
    if (!data.success) throw new Error(data.message || 'Failed to mark as paid');
    showFeedback(detailFeedback, `✅ Marked as paid! ₱${amountPaid.toLocaleString()} recorded.`, 'success');
    setTimeout(() => { showSalaryPanel(); }, 1400);
  } catch (err) {
    showFeedback(detailFeedback, err.message, 'error');
  } finally {
    markPaidBtn.disabled = false;
    markPaidBtn.textContent = '✓ Mark All as Paid';
  }
});

// ── Panel helpers
function showLoginPanel() {
  adminPanelLogin.classList.remove('hidden');
  adminPanelSalary.classList.add('hidden');
  adminPanelDetail.classList.add('hidden');
  hideFeedback(adminFeedback);
}

function showSalaryPanel() {
  adminPanelLogin.classList.add('hidden');
  adminPanelSalary.classList.remove('hidden');
  adminPanelDetail.classList.add('hidden');
  adminPanelAdvance.classList.add('hidden');
  amountGivenInput.value  = '';
  payNotesInput.value      = '';
  payDeductInput.value     = '0';
  currentStaffName     = '';
  currentGrandTotal    = 0;
  currentTotalAdvances = 0;
  currentAdvanceRows   = [];
  document.getElementById('liveNetRow').classList.add('hidden');
  loadStaffBalances();
}

function showAdvancePanel(prefillName) {
  adminPanelLogin.classList.add('hidden');
  adminPanelSalary.classList.add('hidden');
  adminPanelDetail.classList.add('hidden');
  adminPanelAdvance.classList.remove('hidden');
  if (prefillName) advStaffName.value = prefillName;
  advDate.value = new Date().toISOString().split('T')[0];
  hideFeedback(advanceFeedback);
}

function showDetailPanel(name) {
  adminPanelLogin.classList.add('hidden');
  adminPanelSalary.classList.add('hidden');
  adminPanelDetail.classList.remove('hidden');
  adminPanelAdvance.classList.add('hidden');
  detailStaffName.textContent = name;
  currentAdvanceRows   = [];
  currentTotalAdvances = 0;
  payDeductInput.value = '0';
  document.getElementById('liveNetRow').classList.add('hidden');
  loadStaffDetail(name);
}

async function loadStaffBalances() {
  staffBalanceList.innerHTML = '<p class="empty-msg">Loading…</p>';
  hideFeedback(salaryFeedback);
  try {
    const data = await gasGet({ action: 'getStaffBalances' });
    if (!data.success) throw new Error(data.message);

    if (!data.staff || data.staff.length === 0) {
      staffBalanceList.innerHTML = '<p class="empty-msg">No outstanding salary balances.</p>';
      return;
    }

    staffBalanceList.innerHTML = data.staff.map(s => `
      <div class="staff-balance-card" data-name="${escapeAttr(s.name)}">
        <div class="staff-info">
          <span class="staff-name">${escapeHTML(s.name)}</span>
          <span class="staff-meta">${s.tripCount} trip${s.tripCount !== 1 ? 's' : ''} unpaid</span>
        </div>
        <span class="staff-total">₱${Number(s.totalOwed).toLocaleString()}</span>
      </div>
    `).join('');

    staffBalanceList.querySelectorAll('.staff-balance-card').forEach(card => {
      card.addEventListener('click', () => showDetailPanel(card.dataset.name));
    });
  } catch (err) {
    showFeedback(salaryFeedback, err.message, 'error');
    staffBalanceList.innerHTML = '';
  }
}

async function loadStaffDetail(name) {
  salaryDetailTable.innerHTML = '<p class="empty-msg">Loading…</p>';
  hideFeedback(detailFeedback);
currentDetailRows    = [];
    currentStaffName     = name;
    currentGrandTotal    = 0;
    currentTotalAdvances = 0;
    amountGivenInput.value = '';
    document.getElementById('liveNetRow').classList.add('hidden');

  try {
    const data = await gasGet({ action: 'getStaffDetail', name });
    if (!data.success) throw new Error(data.message);

    if (!data.records || data.records.length === 0) {
      salaryDetailTable.innerHTML = '<p class="empty-msg">No unpaid records found.</p>';
      return;
    }

    currentDetailRows = data.records.map(r => r.rowIndex);
    let grandTotal = 0;

    const rows = data.records.map(r => {
      grandTotal += Number(r.total) || 0;
      return `
        <tr>
          <td>${escapeHTML(formatDate(r.startDate))}</td>
          <td>${escapeHTML(String(r.days))}</td>
          <td>${escapeHTML(r.route)}</td>
          <td>${escapeHTML(r.boat)}</td>
          <td>${escapeHTML(String(r.guests))}</td>
          <td>${escapeHTML(r.position)}</td>
          <td>₱${Number(r.ratePerDay).toLocaleString()}</td>
          <td>₱${Number(r.total).toLocaleString()}</td>
        </tr>`;
    }).join('');

    // Build advances deduction section
    const advances = Array.isArray(data.advances) ? data.advances : [];
    currentAdvanceRows   = advances.map(a => a.rowIndex);
    currentTotalAdvances = advances.reduce((s, a) => s + (Number(a.amount) || 0), 0);
    const totalAdvances  = currentTotalAdvances;
    const netTotal = grandTotal - totalAdvances;

    const advanceSection = advances.length ? `
      <div class="advance-section">
        <p class="advance-heading">💸 Cash Advance Deductions</p>
        <table class="salary-detail-table">
          <thead><tr><th>Date</th><th>Notes</th><th>Amount</th></tr></thead>
          <tbody>
            ${advances.map(a => `
              <tr>
                <td>${escapeHTML(String(a.date))}</td>
                <td>${escapeHTML(String(a.notes || ''))}</td>
                <td style="color:#e53935">-₱${Number(a.amount).toLocaleString()}</td>
              </tr>`).join('')}
            <tr class="total-row">
              <td colspan="2" style="text-align:right">Total Deductions</td>
              <td style="color:#e53935">-₱${totalAdvances.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="net-total-row">
        <span class="net-label">Net Payable</span>
        <span class="net-amount">₱${netTotal.toLocaleString()}</span>
      </div>` : '';

    salaryDetailTable.innerHTML = `
      <div style="overflow-x:auto">
        <table class="salary-detail-table">
          <thead>
            <tr>
              <th>Start Date</th>
              <th>Days</th>
              <th>Route</th>
              <th>Boat</th>
              <th>Guests</th>
              <th>Position</th>
              <th>Rate/Day</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr class="total-row">
              <td colspan="7" style="text-align:right">Grand Total</td>
              <td>₱${grandTotal.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
      ${advanceSection}`;
    currentGrandTotal = grandTotal;
    updateLiveNet();
  } catch (err) {
    showFeedback(detailFeedback, err.message, 'error');
    salaryDetailTable.innerHTML = '';
  }
}

// ══════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════
function openModal(overlay) {
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(overlay) {
  overlay.classList.add('hidden');
  document.body.style.overflow = '';
}

function showFeedback(el, msg, type) {
  el.textContent = msg;
  el.className   = `feedback ${type}`;
}

function hideFeedback(el) {
  el.textContent = '';
  el.classList.add('hidden');
  el.classList.remove('success', 'error');
}

function setLoading(btn, loading) {
  if (loading) {
    btn.disabled   = true;
    btn.dataset.originalText = btn.textContent;
    btn.innerHTML  = `<span class="spinner"></span> Submitting…`;
  } else {
    btn.disabled   = false;
    btn.textContent = btn.dataset.originalText || 'Submit Trip';
  }
}

// Escape HTML to prevent XSS when injecting into innerHTML
// Formats a date value as "Sunday, April 26, 2026" (keeps the day name, strips the time)
function formatDate(val) {
  if (!val) return '';
  const s = String(val).trim();

  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    // "2026-04-26" — parse as local date to avoid UTC-shift changing the day
    const [y, mo, dy] = s.split('-').map(Number);
    d = new Date(y, mo - 1, dy);
  } else if (s.includes('T')) {
    // ISO datetime "2026-04-26T00:00:00.000Z"
    const [y, mo, dy] = s.split('T')[0].split('-').map(Number);
    d = new Date(y, mo - 1, dy);
  } else {
    // "Sun Apr 26 2026 00:00:00 GMT+0800 (...)" or truncated variant
    // Strip the time part (HH:MM:SS and everything after) to get a clean date string
    const dateOnly = s.replace(/\d{2}:\d{2}:\d{2}.*$/, '').trim();
    d = new Date(dateOnly);
  }

  if (isNaN(d.getTime())) return s; // unrecognised — return as-is

  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
  });
}

function escapeHTML(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escape attribute values
function escapeAttr(str) {
  if (str == null) return '';
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Validate URLs before rendering as links (SSRF / open-redirect guard on client)
function sanitizeURL(url) {
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) return '#';
    return url;
  } catch {
    return '#';
  }
}
