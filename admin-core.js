import { auth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from './firebase-config.js';
import { renderItemsModule } from './items.js';
import { renderStockModule } from './stock.js';
import { renderCustomersModule } from './customers.js';

/* ---------- Shared UI helpers ---------- */
export function showToast(message, type = '') {
  const host = document.getElementById('toastHost');
  const el = document.createElement('div');
  el.className = `toast ${type}`.trim();
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export function fmtMoney(n) {
  const v = Number(n) || 0;
  return 'Rs. ' + v.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ---------- Module registry ---------- */
const MODULES = {
  dashboard: { title: 'Dashboard', sub: "Overview of today's activity" },
  items:     { title: 'Items', sub: 'Catalogue — categories, codes, and prices', render: renderItemsModule },
  stock:     { title: 'Stock', sub: 'Main store and vehicle stock, transfers, and checks', render: renderStockModule },
  customers: { title: 'Customers', sub: 'Customer records, contacts, and location', render: renderCustomersModule },
  bills:     { title: 'Bills', sub: 'Bill entry' },
  collections: { title: 'Monthly collection', sub: 'Bulk installment collection' },
  billbook:  { title: 'Bill book', sub: 'Bill book tracking' },
  chitbook:  { title: 'Chit book', sub: 'Chit book tracking' },
  financial: { title: 'Financial', sub: 'Summary and reports' },
};

const loadedModules = new Set();

function switchModule(key) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.module === key));
  document.querySelectorAll('.module-view').forEach(s => s.classList.add('hidden'));
  const section = document.getElementById(`module-${key}`);
  if (section) section.classList.remove('hidden');

  const cfg = MODULES[key];
  if (cfg) {
    document.getElementById('pageTitle').textContent = cfg.title;
    document.getElementById('pageSub').textContent = cfg.sub;
    if (cfg.render && !loadedModules.has(key)) {
      loadedModules.add(key);
      cfg.render(section);
    }
  }
  history.replaceState(null, '', `#${key}`);
}

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => switchModule(link.dataset.module));
});

/* ---------- Auth ---------- */
const loginScreen = document.getElementById('loginScreen');
const appShell = document.getElementById('appShell');
const loginError = document.getElementById('loginError');

document.getElementById('loginBtn').addEventListener('click', async () => {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  loginError.classList.add('hidden');
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    loginError.textContent = 'Sign-in failed — check the email and password.';
    loginError.classList.remove('hidden');
  }
});

document.getElementById('signOutBtn').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginScreen.classList.add('hidden');
    appShell.classList.remove('hidden');
    document.getElementById('topbarUser').textContent = user.email || '';
    const startKey = (location.hash || '#dashboard').slice(1);
    switchModule(MODULES[startKey] ? startKey : 'dashboard');
  } else {
    appShell.classList.add('hidden');
    loginScreen.classList.remove('hidden');
  }
});
