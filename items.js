import {
  db, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy, serverTimestamp, writeBatch
} from './firebase-config.js';
import { showToast, fmtMoney } from './admin-core.js';

let allItems = [];
let editingId = null;
let itemsLoaded = false;

export function renderItemsModule(section) {
  section.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h2>Items</h2>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <div class="search-box"><input type="text" id="itemSearch" placeholder="Search by name, code, or category"></div>
          <button class="btn btn-ghost" id="importBtn">Import catalogue</button>
          <button class="btn btn-amber" id="addItemBtn">+ Add item</button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Code</th><th>Category</th><th>Sub-category</th><th>Item name</th><th class="num">Price</th><th></th></tr>
          </thead>
          <tbody id="itemsTableBody"></tbody>
        </table>
      </div>
      <div id="itemsEmpty" class="empty-state hidden">
        <div class="big">No items yet</div>
        Add your first item to start building the catalogue.
      </div>
    </div>
  `;

  document.getElementById('addItemBtn').addEventListener('click', () => openItemModal());
  document.getElementById('importBtn').addEventListener('click', importCatalog);
  document.getElementById('itemSearch').addEventListener('input', renderTable);

  onSnapshot(query(collection(db, 'items'), orderBy('itemName')), (snap) => {
    allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    itemsLoaded = true;
    renderTable();
  }, (err) => showToast('Could not load items: ' + err.message, 'error'));
}

function renderTable() {
  const body = document.getElementById('itemsTableBody');
  const empty = document.getElementById('itemsEmpty');
  if (!body) return;

  const term = (document.getElementById('itemSearch')?.value || '').toLowerCase();
  const rows = allItems.filter(it =>
    !term ||
    (it.itemName || '').toLowerCase().includes(term) ||
    (it.itemCode || '').toLowerCase().includes(term) ||
    (it.category || '').toLowerCase().includes(term) ||
    (it.subCategory || '').toLowerCase().includes(term)
  );

  if (rows.length === 0) {
    body.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  body.innerHTML = rows.map(it => `
    <tr>
      <td><span class="badge badge-teal">${escapeHtml(it.itemCode || '—')}</span></td>
      <td>${escapeHtml(it.category || '—')}</td>
      <td>${escapeHtml(it.subCategory || '—')}</td>
      <td>${escapeHtml(it.itemName || '—')}</td>
      <td class="num">${fmtMoney(it.price)}</td>
      <td>
        <button class="btn btn-ghost btn-sm" data-edit="${it.id}">Edit</button>
        <button class="btn btn-danger btn-sm" data-delete="${it.id}">Delete</button>
      </td>
    </tr>
  `).join('');

  body.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openItemModal(b.dataset.edit)));
  body.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', () => confirmDelete(b.dataset.delete)));
}

function openItemModal(id = null) {
  editingId = id;
  const existing = id ? allItems.find(i => i.id === id) : null;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <h3>${existing ? 'Edit item' : 'Add item'}</h3>
      <p class="modal-sub">${existing ? 'Update the details for this item.' : 'Add a new item to the catalogue.'}</p>
      <div class="field-row">
        <div class="field"><label>Item code</label><input id="f_itemCode" value="${escapeAttr(existing?.itemCode)}" placeholder="e.g. TV-001"></div>
        <div class="field"><label>Price (Rs.)</label><input id="f_price" type="number" step="0.01" value="${existing?.price ?? ''}" placeholder="0.00"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Category</label><input id="f_category" value="${escapeAttr(existing?.category)}" placeholder="e.g. Television"></div>
        <div class="field"><label>Sub-category</label><input id="f_subCategory" value="${escapeAttr(existing?.subCategory)}" placeholder="e.g. LED 43\u2033"></div>
      </div>
      <div class="field"><label>Item name</label><input id="f_itemName" value="${escapeAttr(existing?.itemName)}" placeholder="Full display name"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="cancelModal">Cancel</button>
        <button class="btn btn-primary" id="saveItem">${existing ? 'Save changes' : 'Add item'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  backdrop.querySelector('#cancelModal').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelector('#saveItem').addEventListener('click', () => saveItem(backdrop));
}

async function saveItem(backdrop) {
  const itemCode = document.getElementById('f_itemCode').value.trim();
  const price = parseFloat(document.getElementById('f_price').value);
  const category = document.getElementById('f_category').value.trim();
  const subCategory = document.getElementById('f_subCategory').value.trim();
  const itemName = document.getElementById('f_itemName').value.trim();

  if (!itemName || !itemCode || isNaN(price)) {
    showToast('Item code, name, and price are required.', 'error');
    return;
  }

  const payload = { itemCode, category, subCategory, itemName, price };

  try {
    if (editingId) {
      await updateDoc(doc(db, 'items', editingId), payload);
      showToast('Item updated.', 'success');
    } else {
      await addDoc(collection(db, 'items'), { ...payload, createdAt: serverTimestamp() });
      showToast('Item added.', 'success');
    }
    backdrop.remove();
  } catch (err) {
    showToast('Save failed: ' + err.message, 'error');
  }
}

function confirmDelete(id) {
  const item = allItems.find(i => i.id === id);
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" style="max-width:420px;">
      <h3>Delete item?</h3>
      <p class="modal-sub">"${escapeHtml(item?.itemName || '')}" will be removed from the catalogue. This does not affect existing bills or stock records.</p>
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
      await deleteDoc(doc(db, 'items', id));
      showToast('Item deleted.', 'success');
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    }
    backdrop.remove();
  });
}

// One-click import of the item catalogue (js/catalog-data.js). Items whose code already exists are skipped.
async function importCatalog() {
  if (!itemsLoaded) { showToast('Items are still loading - try again in a moment.', 'error'); return; }
  let CATALOG;
  try {
    ({ CATALOG } = await import('./catalog-data.js'));
  } catch (e) {
    showToast('Catalogue file (js/catalog-data.js) not found.', 'error');
    return;
  }
  const have = new Set(allItems.map(i => (i.itemCode || '').toLowerCase()));
  const fresh = CATALOG.filter(c => !have.has(c.itemCode.toLowerCase()));
  const skipped = CATALOG.length - fresh.length;
  if (fresh.length === 0) { showToast('All catalogue items are already in the system.', 'success'); return; }
  if (!confirm(`Import ${fresh.length} items?` + (skipped ? ` (${skipped} already exist and will be skipped)` : ''))) return;

  const btn = document.getElementById('importBtn');
  btn.disabled = true; btn.textContent = 'Importing...';
  try {
    for (let i = 0; i < fresh.length; i += 400) {
      const batch = writeBatch(db);
      fresh.slice(i, i + 400).forEach(c => {
        batch.set(doc(collection(db, 'items')), { ...c, createdAt: serverTimestamp() });
      });
      await batch.commit();
    }
    showToast(`${fresh.length} items imported.`, 'success');
  } catch (err) {
    showToast('Import failed: ' + err.message, 'error');
  }
  btn.disabled = false; btn.textContent = 'Import catalogue';
}

export function getAllItemsCache() { return allItems; }

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s ?? ''); }
