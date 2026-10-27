import {
  db, collection, doc, getDocs, setDoc, addDoc, onSnapshot,
  query, where, orderBy, limit, runTransaction, serverTimestamp
} from './firebase-config.js';
import { showToast, fmtDate } from './admin-core.js';

const STORES = [
  { id: 'main', name: 'Main store' },
  { id: 'vehicle1', name: 'Vehicle 1' },
  { id: 'vehicle2', name: 'Vehicle 2' },
  { id: 'vehicle3', name: 'Vehicle 3' },
];

let itemsCache = [];
let currentStoreLevels = []; // for overview tab, live
let currentTab = 'overview';

export function renderStockModule(section) {
  section.innerHTML = `
    <div class="subtabs">
      <button class="subtab active" data-tab="overview">Stock overview</button>
      <button class="subtab" data-tab="transfer">Stock transfer</button>
      <button class="subtab" data-tab="check">Vehicle stock check</button>
    </div>
    <div id="stockTabBody"></div>
  `;

  section.querySelectorAll('.subtab').forEach(btn => {
    btn.addEventListener('click', () => {
      section.querySelectorAll('.subtab').forEach(b => b.classList.toggle('active', b === btn));
      currentTab = btn.dataset.tab;
      renderTabBody();
    });
  });

  // keep a live cache of items for dropdowns everywhere in this module
  onSnapshot(query(collection(db, 'items'), orderBy('itemName')), (snap) => {
    itemsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (currentTab === 'transfer' || currentTab === 'check') renderTabBody();
  });

  renderTabBody();
}

function renderTabBody() {
  const body = document.getElementById('stockTabBody');
  if (!body) return;
  if (currentTab === 'overview') return renderOverview(body);
  if (currentTab === 'transfer') return renderTransfer(body);
  if (currentTab === 'check') return renderVehicleCheck(body);
}

/* ============================================================
   TAB 1 — Stock overview (per store, with quick opening-stock set)
   ============================================================ */
function renderOverview(body) {
  body.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h2>Stock by store</h2>
        <select id="ovStore" style="padding:8px 10px; border:1px solid var(--border); border-radius:6px;">
          ${STORES.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
        </select>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Code</th><th>Item</th><th class="num">Qty</th><th></th></tr></thead>
          <tbody id="ovBody"></tbody>
        </table>
      </div>
      <div id="ovEmpty" class="empty-state hidden"><div class="big">No stock recorded yet</div>Set opening stock for items in this store below.</div>
    </div>
  `;

  const storeSelect = document.getElementById('ovStore');
  let unsub = null;
  const load = () => {
    if (unsub) unsub();
    unsub = onSnapshot(query(collection(db, 'stockLevels'), where('storeId', '==', storeSelect.value)), (snap) => {
      currentStoreLevels = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      paintOverview(storeSelect.value);
    });
  };
  storeSelect.addEventListener('change', load);
  load();
}

function paintOverview(storeId) {
  const levelsByItem = {};
  currentStoreLevels.forEach(l => { levelsByItem[l.itemId] = l.qty; });

  const rows = itemsCache.map(it => ({
    id: it.id, itemCode: it.itemCode, itemName: it.itemName,
    qty: levelsByItem[it.id] ?? 0,
  }));

  const tbody = document.getElementById('ovBody');
  const empty = document.getElementById('ovEmpty');
  if (!tbody) return;

  if (itemsCache.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    empty.querySelector('.big').textContent = 'No items in the catalogue yet';
    return;
  }
  empty.classList.add('hidden');

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><span class="badge badge-teal">${escapeHtml(r.itemCode)}</span></td>
      <td>${escapeHtml(r.itemName)}</td>
      <td class="num">${r.qty}</td>
      <td><button class="btn btn-ghost btn-sm" data-setqty="${r.id}" data-name="${escapeAttr(r.itemName)}" data-qty="${r.qty}">Set qty</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-setqty]').forEach(b => b.addEventListener('click', () => {
    const val = prompt(`Set stock quantity for "${b.dataset.name}":`, b.dataset.qty);
    if (val === null) return;
    const qty = parseInt(val, 10);
    if (isNaN(qty) || qty < 0) { showToast('Enter a valid quantity.', 'error'); return; }
    setOpeningStock(storeId, b.dataset.setqty, qty);
  }));
}

async function setOpeningStock(storeId, itemId, qty) {
  const item = itemsCache.find(i => i.id === itemId);
  try {
    await setDoc(doc(db, 'stockLevels', `${storeId}__${itemId}`), {
      storeId, itemId, itemCode: item?.itemCode || '', itemName: item?.itemName || '',
      qty, updatedAt: serverTimestamp(),
    }, { merge: true });
    showToast('Stock updated.', 'success');
  } catch (err) {
    showToast('Failed: ' + err.message, 'error');
  }
}

/* ============================================================
   TAB 2 — Stock transfer (between any two stores)
   ============================================================ */
function renderTransfer(body) {
  body.innerHTML = `
    <div class="panel">
      <div class="panel-head"><h2>Transfer stock</h2></div>
      <div class="field-row">
        <div class="field"><label>From</label>
          <select id="trFrom">${STORES.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select>
        </div>
        <div class="field"><label>To</label>
          <select id="trTo">${STORES.map((s, i) => `<option value="${s.id}" ${i===1?'selected':''}>${s.name}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field-row">
        <div class="field"><label>Item</label>
          <select id="trItem">${itemsCache.map(it => `<option value="${it.id}">${escapeHtml(it.itemCode)} — ${escapeHtml(it.itemName)}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Quantity</label><input id="trQty" type="number" min="1" placeholder="0"></div>
      </div>
      <div class="field"><label>Note (optional)</label><input id="trNote" placeholder="e.g. loading for weekend route"></div>
      <button class="btn btn-amber" id="trSubmit">Transfer stock</button>
    </div>

    <div class="panel">
      <div class="panel-head"><h2>Recent transfers</h2></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Date</th><th>Item</th><th>From</th><th>To</th><th class="num">Qty</th><th>Note</th></tr></thead>
          <tbody id="trHistory"></tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('trSubmit').addEventListener('click', submitTransfer);

  onSnapshot(query(collection(db, 'stockTransfers'), orderBy('date', 'desc'), limit(20)), (snap) => {
    const tbody = document.getElementById('trHistory');
    if (!tbody) return;
    const rows = snap.docs.map(d => d.data());
    tbody.innerHTML = rows.length ? rows.map(r => `
      <tr>
        <td>${fmtDate(r.date)}</td>
        <td>${escapeHtml(r.itemName)}</td>
        <td>${storeName(r.fromStore)}</td>
        <td>${storeName(r.toStore)}</td>
        <td class="num">${r.qty}</td>
        <td>${escapeHtml(r.note || '—')}</td>
      </tr>
    `).join('') : `<tr><td colspan="6" style="text-align:center; color:var(--ink-600); padding:20px;">No transfers yet</td></tr>`;
  });
}

async function submitTransfer() {
  const fromStore = document.getElementById('trFrom').value;
  const toStore = document.getElementById('trTo').value;
  const itemId = document.getElementById('trItem').value;
  const qty = parseInt(document.getElementById('trQty').value, 10);
  const note = document.getElementById('trNote').value.trim();

  if (fromStore === toStore) { showToast('From and to stores must be different.', 'error'); return; }
  if (!itemId || isNaN(qty) || qty <= 0) { showToast('Select an item and a valid quantity.', 'error'); return; }

  const item = itemsCache.find(i => i.id === itemId);
  const fromRef = doc(db, 'stockLevels', `${fromStore}__${itemId}`);
  const toRef = doc(db, 'stockLevels', `${toStore}__${itemId}`);

  try {
    await runTransaction(db, async (tx) => {
      const fromSnap = await tx.get(fromRef);
      const fromQty = fromSnap.exists() ? (fromSnap.data().qty || 0) : 0;
      if (fromQty < qty) throw new Error(`Only ${fromQty} units available in ${storeName(fromStore)}.`);
      const toSnap = await tx.get(toRef);
      const toQty = toSnap.exists() ? (toSnap.data().qty || 0) : 0;

      tx.set(fromRef, { storeId: fromStore, itemId, itemCode: item?.itemCode || '', itemName: item?.itemName || '', qty: fromQty - qty, updatedAt: serverTimestamp() }, { merge: true });
      tx.set(toRef, { storeId: toStore, itemId, itemCode: item?.itemCode || '', itemName: item?.itemName || '', qty: toQty + qty, updatedAt: serverTimestamp() }, { merge: true });
    });

    await addDoc(collection(db, 'stockTransfers'), {
      fromStore, toStore, itemId, itemCode: item?.itemCode || '', itemName: item?.itemName || '',
      qty, note, date: serverTimestamp(),
    });

    showToast('Stock transferred.', 'success');
    document.getElementById('trQty').value = '';
    document.getElementById('trNote').value = '';
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function storeName(id) { return STORES.find(s => s.id === id)?.name || id; }

/* ============================================================
   TAB 3 — Vehicle stock check
   Loads the currently-expected stock for a vehicle, lets the
   user enter actual counted quantities, and separately record
   items found that were not in the expected (loaded) list —
   e.g. a returned item that was never updated in the system.
   ============================================================ */
let checkExpected = [];   // [{itemId, itemCode, itemName, expectedQty, actualQty}]
let checkExtras = [];     // [{itemId, itemCode, itemName, qty, note}]

function renderVehicleCheck(body) {
  const vehicles = STORES.filter(s => s.id !== 'main');
  body.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h2>Vehicle stock check</h2>
        <select id="vcVehicle" style="padding:8px 10px; border:1px solid var(--border); border-radius:6px;">
          <option value="">Select a vehicle…</option>
          ${vehicles.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
        </select>
      </div>
      <div id="vcContent"><p style="color:var(--ink-600); font-size:13.5px;">Select a vehicle to load its expected stock and begin the check.</p></div>
    </div>
  `;
  document.getElementById('vcVehicle').addEventListener('change', loadVehicleCheck);
}

async function loadVehicleCheck() {
  const vehicle = document.getElementById('vcVehicle').value;
  const content = document.getElementById('vcContent');
  checkExtras = [];
  if (!vehicle) { content.innerHTML = ''; return; }

  content.innerHTML = `<p style="color:var(--ink-600); font-size:13.5px;">Loading expected stock…</p>`;

  const snap = await getDocs(query(collection(db, 'stockLevels'), where('storeId', '==', vehicle)));
  checkExpected = snap.docs.map(d => ({
    itemId: d.data().itemId, itemCode: d.data().itemCode, itemName: d.data().itemName,
    expectedQty: d.data().qty || 0, actualQty: null,
  })).filter(r => r.expectedQty > 0);

  paintVehicleCheck(vehicle);
}

function paintVehicleCheck(vehicle) {
  const content = document.getElementById('vcContent');
  const availableExtra = itemsCache.filter(it => !checkExpected.some(e => e.itemId === it.id));

  content.innerHTML = `
    ${checkExpected.length === 0 ? `<p style="color:var(--ink-600); font-size:13.5px; margin-bottom:16px;">No stock currently loaded for this vehicle in the system.</p>` : `
    <div class="table-wrap" style="margin-bottom:18px;">
      <table class="data-table">
        <thead><tr><th>Code</th><th>Item</th><th class="num">Expected</th><th class="num">Actual (counted)</th><th class="num">Diff</th></tr></thead>
        <tbody id="vcExpectedBody">
          ${checkExpected.map((r, i) => `
            <tr>
              <td><span class="badge badge-teal">${escapeHtml(r.itemCode)}</span></td>
              <td>${escapeHtml(r.itemName)}</td>
              <td class="num">${r.expectedQty}</td>
              <td class="num"><input type="number" min="0" style="width:80px; text-align:right; padding:6px 8px; border:1px solid var(--border); border-radius:6px;" data-actual="${i}"></td>
              <td class="num" id="vcDiff${i}">—</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`}

    <div class="panel" style="background:var(--bg); border-style:dashed;">
      <div class="panel-head"><h2 style="font-size:14px;">Found item not in the expected list</h2></div>
      <p style="color:var(--ink-600); font-size:12.5px; margin-top:-8px; margin-bottom:12px;">Use this for items physically found in the vehicle that the system doesn't show as loaded — e.g. a return that was never updated.</p>
      <div class="field-row">
        <div class="field"><label>Item</label>
          <select id="vcExtraItem">
            <option value="">Select item…</option>
            ${availableExtra.map(it => `<option value="${it.id}">${escapeHtml(it.itemCode)} — ${escapeHtml(it.itemName)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Quantity found</label><input id="vcExtraQty" type="number" min="1"></div>
      </div>
      <div class="field"><label>Note</label><input id="vcExtraNote" placeholder="e.g. return item, not updated in system"></div>
      <button class="btn btn-ghost btn-sm" id="vcAddExtra">+ Add to check</button>
      <div id="vcExtraList" style="margin-top:14px;"></div>
    </div>

    <div style="margin-top:18px;">
      <button class="btn btn-amber" id="vcSave">Save stock check</button>
    </div>
  `;

  content.querySelectorAll('[data-actual]').forEach(inp => {
    inp.addEventListener('input', () => {
      const i = parseInt(inp.dataset.actual, 10);
      const val = inp.value === '' ? null : parseInt(inp.value, 10);
      checkExpected[i].actualQty = val;
      const diffCell = document.getElementById(`vcDiff${i}`);
      if (val === null || isNaN(val)) { diffCell.textContent = '—'; diffCell.className = 'num'; return; }
      const diff = val - checkExpected[i].expectedQty;
      diffCell.textContent = diff === 0 ? 'Match' : (diff > 0 ? `+${diff}` : diff);
      diffCell.className = 'num ' + (diff === 0 ? 'qty-diff-ok' : 'qty-diff-bad');
    });
  });

  document.getElementById('vcAddExtra').addEventListener('click', () => {
    const itemId = document.getElementById('vcExtraItem').value;
    const qty = parseInt(document.getElementById('vcExtraQty').value, 10);
    const note = document.getElementById('vcExtraNote').value.trim();
    if (!itemId || isNaN(qty) || qty <= 0) { showToast('Select an item and a valid quantity.', 'error'); return; }
    const item = itemsCache.find(it => it.id === itemId);
    checkExtras.push({ itemId, itemCode: item.itemCode, itemName: item.itemName, qty, note });
    document.getElementById('vcExtraQty').value = '';
    document.getElementById('vcExtraNote').value = '';
    paintVehicleCheck(vehicle); // refresh available-item dropdown + extras list
  });

  document.getElementById('vcSave').addEventListener('click', () => saveVehicleCheck(vehicle));
  paintExtraList();
}

function paintExtraList() {
  const el = document.getElementById('vcExtraList');
  if (!el) return;
  if (checkExtras.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = checkExtras.map((e, i) => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-bottom:1px solid var(--border); font-size:13px;">
      <span><span class="badge badge-amber">${escapeHtml(e.itemCode)}</span> ${escapeHtml(e.itemName)} × ${e.qty} ${e.note ? `— <span style="color:var(--ink-600);">${escapeHtml(e.note)}</span>` : ''}</span>
      <button class="btn btn-ghost btn-sm" data-removeextra="${i}">Remove</button>
    </div>
  `).join('');
  el.querySelectorAll('[data-removeextra]').forEach(b => b.addEventListener('click', () => {
    checkExtras.splice(parseInt(b.dataset.removeextra, 10), 1);
    paintExtraList();
  }));
}

async function saveVehicleCheck(vehicle) {
  const counted = checkExpected.filter(r => r.actualQty !== null && !isNaN(r.actualQty));
  if (counted.length === 0 && checkExtras.length === 0) {
    showToast('Enter at least one counted quantity or an extra item found.', 'error');
    return;
  }

  try {
    // Reconcile counted items: set system stock to the actual counted quantity
    for (const r of counted) {
      await setDoc(doc(db, 'stockLevels', `${vehicle}__${r.itemId}`), {
        storeId: vehicle, itemId: r.itemId, itemCode: r.itemCode, itemName: r.itemName,
        qty: r.actualQty, updatedAt: serverTimestamp(),
      }, { merge: true });
    }
    // Add extra found items into system stock
    for (const e of checkExtras) {
      const ref = doc(db, 'stockLevels', `${vehicle}__${e.itemId}`);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const existingQty = snap.exists() ? (snap.data().qty || 0) : 0;
        tx.set(ref, {
          storeId: vehicle, itemId: e.itemId, itemCode: e.itemCode, itemName: e.itemName,
          qty: existingQty + e.qty, updatedAt: serverTimestamp(),
        }, { merge: true });
      });
    }

    await addDoc(collection(db, 'stockChecks'), {
      vehicle,
      date: serverTimestamp(),
      results: counted.map(r => ({ itemId: r.itemId, itemCode: r.itemCode, itemName: r.itemName, expectedQty: r.expectedQty, actualQty: r.actualQty, diff: r.actualQty - r.expectedQty })),
      extraItemsFound: checkExtras,
    });

    showToast('Stock check saved.', 'success');
    checkExtras = [];
    loadVehicleCheck();
  } catch (err) {
    showToast('Failed to save check: ' + err.message, 'error');
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s ?? ''); }
