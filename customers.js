import {
  db, collection, doc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy, serverTimestamp, runTransaction
} from './firebase-config.js';
import { showToast, fmtDate } from './admin-core.js';

let allCustomers = [];
let customersLoaded = false;
let editingId = null;
let saving = false;

/* ---------- Module screen ---------- */
export function renderCustomersModule(section) {
  section.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h2>Customers <span id="custCount" style="font-size:13px; font-weight:400; color:var(--ink-600);"></span></h2>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <div class="search-box"><input type="text" id="custSearch" placeholder="Search name, code, NIC, phone, address"></div>
          <button class="btn btn-ghost" id="custCsvBtn">Download report (CSV)</button>
          <button class="btn btn-ghost" id="custPrintBtn">Print report</button>
          <button class="btn btn-amber" id="addCustBtn">+ Add customer</button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Code</th><th>Name</th><th>Gender</th><th>NIC / ID</th><th>Phone</th>
              <th>WhatsApp</th><th>Address</th><th>Road</th><th>Location</th><th></th>
            </tr>
          </thead>
          <tbody id="custTableBody"></tbody>
        </table>
      </div>
      <div id="custEmpty" class="empty-state hidden">
        <div class="big">No customers yet</div>
        Add your first customer. A customer code is generated automatically.
      </div>
    </div>
  `;

  document.getElementById('addCustBtn').addEventListener('click', () => openCustomerModal());
  document.getElementById('custSearch').addEventListener('input', renderTable);
  document.getElementById('custCsvBtn').addEventListener('click', downloadCsv);
  document.getElementById('custPrintBtn').addEventListener('click', printReport);

  onSnapshot(query(collection(db, 'customers'), orderBy('customerCode', 'desc')), (snap) => {
    allCustomers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    customersLoaded = true;
    renderTable();
  }, (err) => showToast('Could not load customers: ' + err.message, 'error'));
}

/* ---------- Helpers ---------- */
function filteredRows() {
  const term = (document.getElementById('custSearch')?.value || '').trim().toLowerCase();
  if (!term) return allCustomers;
  return allCustomers.filter(c =>
    [c.customerCode, c.name, c.nic, c.phone, c.whatsapp, c.address, c.road]
      .some(v => String(v || '').toLowerCase().includes(term))
  );
}

// Sri Lankan number -> wa.me format (0788769011 -> 94788769011)
function waNumber(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '94' + d.slice(1);
  return d;
}

function mapsUrl(c) {
  return `https://www.google.com/maps?q=${c.latitude},${c.longitude}`;
}

function hasLocation(c) {
  return typeof c.latitude === 'number' && typeof c.longitude === 'number';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
}
function escapeAttr(s) { return escapeHtml(s ?? ''); }

/* ---------- Table ---------- */
function renderTable() {
  const body = document.getElementById('custTableBody');
  const empty = document.getElementById('custEmpty');
  const count = document.getElementById('custCount');
  if (!body) return;

  const rows = filteredRows();
  count.textContent = `(${rows.length}${rows.length !== allCustomers.length ? ' of ' + allCustomers.length : ''})`;

  if (rows.length === 0) {
    body.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  body.innerHTML = rows.map(c => {
    const wa = waNumber(c.whatsapp);
    return `
      <tr>
        <td><span class="badge badge-teal">${escapeHtml(c.customerCode || '—')}</span></td>
        <td>${escapeHtml(c.name || '—')}</td>
        <td>${escapeHtml(c.gender || '—')}</td>
        <td>${escapeHtml(c.nic || '—')}</td>
        <td>${escapeHtml(c.phone || '—')}</td>
        <td>${wa
          ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener" style="color:var(--teal-700);">${escapeHtml(c.whatsapp)}</a>`
          : '—'}</td>
        <td>${escapeHtml(c.address || '—')}</td>
        <td>${escapeHtml(c.road || '—')}</td>
        <td>${hasLocation(c)
          ? `<a href="${mapsUrl(c)}" target="_blank" rel="noopener" style="color:var(--teal-700);">View map</a>`
          : '—'}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-ghost btn-sm" data-edit="${c.id}">Edit</button>
          <button class="btn btn-danger btn-sm" data-delete="${c.id}">Delete</button>
        </td>
      </tr>`;
  }).join('');

  body.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openCustomerModal(b.dataset.edit)));
  body.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', () => confirmDelete(b.dataset.delete)));
}

/* ---------- Add / edit ---------- */
function openCustomerModal(id = null) {
  editingId = id;
  const c = id ? allCustomers.find(x => x.id === id) : null;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" style="max-height:92vh; overflow-y:auto;">
      <h3>${c ? 'Edit customer' : 'Add customer'}</h3>
      <p class="modal-sub">${c ? 'Customer code: <strong>' + escapeHtml(c.customerCode) + '</strong>' : 'A customer code is generated automatically when you save.'}</p>

      <div class="field-row">
        <div class="field"><label>Name *</label><input id="c_name" value="${escapeAttr(c?.name)}" placeholder="Full name"></div>
        <div class="field"><label>Gender</label>
          <select id="c_gender">
            <option value="">Select</option>
            <option value="Male" ${c?.gender === 'Male' ? 'selected' : ''}>Male</option>
            <option value="Female" ${c?.gender === 'Female' ? 'selected' : ''}>Female</option>
          </select>
        </div>
      </div>

      <div class="field-row">
        <div class="field"><label>NIC / ID number</label><input id="c_nic" value="${escapeAttr(c?.nic)}" placeholder="e.g. 199012345678"></div>
        <div class="field"><label>Phone *</label><input id="c_phone" type="tel" value="${escapeAttr(c?.phone)}" placeholder="07XXXXXXXX"></div>
      </div>

      <div class="field">
        <label>WhatsApp number</label>
        <input id="c_whatsapp" type="tel" value="${escapeAttr(c?.whatsapp)}" placeholder="07XXXXXXXX">
        <label style="margin-top:6px; display:flex; align-items:center; gap:6px; cursor:pointer;">
          <input type="checkbox" id="c_waSame" style="width:auto;"> Same as phone
        </label>
      </div>

      <div class="field"><label>Address</label><input id="c_address" value="${escapeAttr(c?.address)}" placeholder="House no., village / town"></div>
      <div class="field"><label>Road</label><input id="c_road" value="${escapeAttr(c?.road)}" placeholder="Road / route name"></div>

      <div class="field">
        <label>Location</label>
        <div class="field-row">
          <input id="c_lat" type="number" step="any" value="${c && hasLocation(c) ? c.latitude : ''}" placeholder="Latitude">
          <input id="c_lng" type="number" step="any" value="${c && hasLocation(c) ? c.longitude : ''}" placeholder="Longitude">
        </div>
        <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
          <button type="button" class="btn btn-ghost btn-sm" id="c_getLoc">Use my current location</button>
          <a id="c_mapLink" class="btn btn-ghost btn-sm hidden" target="_blank" rel="noopener">Open in Maps</a>
        </div>
        <div style="font-size:12px; color:var(--ink-600); margin-top:6px;">Stand at the customer's home and tap "Use my current location" to record it.</div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-ghost" id="c_cancel">Cancel</button>
        <button class="btn btn-primary" id="c_save">${c ? 'Save changes' : 'Add customer'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const $ = (sel) => backdrop.querySelector(sel);
  const latEl = $('#c_lat'), lngEl = $('#c_lng'), mapLink = $('#c_mapLink');

  const refreshMapLink = () => {
    const lat = parseFloat(latEl.value), lng = parseFloat(lngEl.value);
    if (!isNaN(lat) && !isNaN(lng)) {
      mapLink.href = `https://www.google.com/maps?q=${lat},${lng}`;
      mapLink.classList.remove('hidden');
    } else {
      mapLink.classList.add('hidden');
    }
  };
  refreshMapLink();
  latEl.addEventListener('input', refreshMapLink);
  lngEl.addEventListener('input', refreshMapLink);

  $('#c_waSame').addEventListener('change', (e) => {
    if (e.target.checked) $('#c_whatsapp').value = $('#c_phone').value;
  });

  $('#c_getLoc').addEventListener('click', () => {
    if (!navigator.geolocation) { showToast('This browser cannot get your location.', 'error'); return; }
    showToast('Getting location...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        latEl.value = pos.coords.latitude.toFixed(6);
        lngEl.value = pos.coords.longitude.toFixed(6);
        refreshMapLink();
        showToast('Location captured (accuracy about ' + Math.round(pos.coords.accuracy) + ' m).', 'success');
      },
      (err) => showToast('Could not get location: ' + err.message, 'error'),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });

  $('#c_cancel').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  $('#c_save').addEventListener('click', () => saveCustomer(backdrop));
}

async function saveCustomer(backdrop) {
  if (saving) return;
  const val = (id) => backdrop.querySelector('#' + id).value.trim();

  const name = val('c_name');
  const phone = val('c_phone');
  if (!name || !phone) { showToast('Name and phone are required.', 'error'); return; }

  const lat = parseFloat(val('c_lat'));
  const lng = parseFloat(val('c_lng'));
  const payload = {
    name,
    gender: val('c_gender'),
    nic: val('c_nic'),
    phone,
    whatsapp: val('c_whatsapp'),
    address: val('c_address'),
    road: val('c_road'),
    latitude: isNaN(lat) ? null : lat,
    longitude: isNaN(lng) ? null : lng,
  };

  if (!customersLoaded) { showToast('Customers are still loading - try again in a moment.', 'error'); return; }

  // Duplicate checks (ignore the customer being edited)
  const others = allCustomers.filter(x => x.id !== editingId);
  if (payload.nic) {
    const dup = others.find(x => (x.nic || '').toLowerCase() === payload.nic.toLowerCase());
    if (dup) { showToast(`NIC already exists for ${dup.name} (${dup.customerCode}).`, 'error'); return; }
  }
  const dupPhone = others.find(x => (x.phone || '') === payload.phone);
  if (dupPhone && !confirm(`Phone number already used by ${dupPhone.name} (${dupPhone.customerCode}). Save anyway?`)) return;

  const saveBtn = backdrop.querySelector('#c_save');
  saving = true; saveBtn.disabled = true;
  try {
    if (editingId) {
      await updateDoc(doc(db, 'customers', editingId), { ...payload, updatedAt: serverTimestamp() });
      showToast('Customer updated.', 'success');
    } else {
      const code = await createCustomer(payload);
      showToast(`Customer added - code ${code}.`, 'success');
    }
    backdrop.remove();
  } catch (err) {
    showToast('Save failed: ' + err.message, 'error');
    saveBtn.disabled = false;
  } finally {
    saving = false;
  }
}

// Atomically bumps the counter and creates the customer, so codes never repeat.
async function createCustomer(payload) {
  const counterRef = doc(db, 'counters', 'customers');
  const newRef = doc(collection(db, 'customers'));
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const next = (snap.exists() ? (snap.data().last || 0) : 0) + 1;
    const customerCode = 'C' + String(next).padStart(5, '0');
    tx.set(counterRef, { last: next });
    tx.set(newRef, { ...payload, customerCode, createdAt: serverTimestamp() });
    return customerCode;
  });
}

/* ---------- Delete ---------- */
function confirmDelete(id) {
  const c = allCustomers.find(x => x.id === id);
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" style="max-width:420px;">
      <h3>Delete customer?</h3>
      <p class="modal-sub">"${escapeHtml(c?.name || '')}" (${escapeHtml(c?.customerCode || '')}) will be removed. This cannot be undone.</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="cancelDel">Cancel</button>
        <button class="btn btn-danger" id="confirmDel">Delete</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#cancelDel').addEventListener('click', () => backdrop.remove());
  backdrop.querySelector('#confirmDel').addEventListener('click', async () => {
    try {
      await deleteDoc(doc(db, 'customers', id));
      showToast('Customer deleted.', 'success');
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    }
    backdrop.remove();
  });
}

/* ---------- Customer report (CSV + print) ---------- */
const REPORT_COLS = [
  ['Code', c => c.customerCode], ['Name', c => c.name], ['Gender', c => c.gender],
  ['NIC / ID', c => c.nic], ['Phone', c => c.phone], ['WhatsApp', c => c.whatsapp],
  ['Address', c => c.address], ['Road', c => c.road],
  ['Latitude', c => hasLocation(c) ? c.latitude : ''], ['Longitude', c => hasLocation(c) ? c.longitude : ''],
  ['Added on', c => (c.createdAt ? fmtDate(c.createdAt) : '')],
];

function downloadCsv() {
  const rows = filteredRows();
  if (rows.length === 0) { showToast('No customers to export.', 'error'); return; }
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [REPORT_COLS.map(([h]) => esc(h)).join(',')];
  rows.forEach(c => lines.push(REPORT_COLS.map(([, f]) => esc(f(c))).join(',')));
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `customer-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function printReport() {
  const rows = filteredRows();
  if (rows.length === 0) { showToast('No customers to print.', 'error'); return; }
  const w = window.open('', '_blank');
  if (!w) { showToast('Allow pop-ups to print the report.', 'error'); return; }
  const cols = REPORT_COLS.filter(([h]) => h !== 'Latitude' && h !== 'Longitude');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Customer report</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; color: #111; }
      h1 { font-size: 18px; margin: 0 0 4px; } p { margin: 0 0 14px; font-size: 12px; color: #555; }
      table { border-collapse: collapse; width: 100%; font-size: 11px; }
      th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; }
      th { background: #eee; }
    </style></head><body>
    <h1>Rio Enterprise - Customer report</h1>
    <p>${new Date().toLocaleDateString('en-GB')} &middot; ${rows.length} customers</p>
    <table><thead><tr>${cols.map(([h]) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(c => `<tr>${cols.map(([, f]) => `<td>${escapeHtml(f(c))}</td>`).join('')}</tr>`).join('')}</tbody></table>
    </body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

export function getAllCustomersCache() { return allCustomers; }
