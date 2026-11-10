// Home Cleaning Booking Slot System - frontend JavaScript

// ---------- Login state ----------
function getUser() { try { return JSON.parse(localStorage.getItem('user')); } catch (e) { return null; } }
function logout() { localStorage.removeItem('user'); window.location.href = 'login.html'; }
function requireLogin() {
  const u = getUser();
  if (!u || !u.token) {
    localStorage.removeItem('user');
    const here = location.pathname.split('/').pop() + location.search;
    window.location.href = 'login.html?next=' + encodeURIComponent(here);
    return null;
  }
  return u;
}

// ---------- Helpers ----------
function esc(t) { // stop HTML injection when showing text
  const d = document.createElement('div'); d.textContent = t == null ? '' : t; return d.innerHTML;
}
function showMessage(text, type) {
  document.getElementById('message').innerHTML = `<div class="alert alert-${type}">${esc(text)}</div>`;
}
function todayLocal() { // yyyy-mm-dd in the user's own timezone
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().split('T')[0];
}
function plusDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().split('T')[0];
}
async function api(url, method, body, token) {
  const u = getUser();
  const headers = { 'Content-Type': 'application/json' };
  const t = token || (u && u.token);
  if (t) headers.Authorization = 'Bearer ' + t;
  const res = await fetch(url, { method: method || 'GET', headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  // session expired / invalid token on a protected call -> back to login
  if (res.status === 401 && !token && url !== '/api/login' && u) {
    localStorage.removeItem('user'); window.location.href = 'login.html';
  }
  return { ok: res.ok, status: res.status, data: data };
}

// services and slots come from the server so prices can never be out of sync
let configCache = null;
async function getConfig() {
  if (!configCache) {
    const r = await api('/api/services');
    if (!r.ok) throw new Error('config');
    configCache = r.data;
  }
  return configCache;
}

// ---------- Navbar and footer (changes with login status) ----------
function renderNavbar() {
  const user = getUser();
  const links = user
    ? [['index.html', 'Home'], ['services.html', 'Services'], ['booking.html', 'Book Now'],
       ['booking-history.html', 'Booking History'], ['profile.html', 'Profile']]
    : [['index.html', 'Home'], ['services.html', 'Services'],
       ['login.html', 'Login'], ['register.html', 'Register']];
  const current = location.pathname.split('/').pop() || 'index.html';
  const items = links.map(l =>
    `<li class="nav-item"><a class="nav-link ${l[0] === current ? 'active' : ''}" href="${l[0]}">${l[1]}</a></li>`).join('');
  const logoutBtn = user
    ? `<li class="nav-item"><a class="nav-link" href="#" id="logoutBtn">Logout</a></li>` : '';
  document.getElementById('navbar').innerHTML = `
    <nav class="navbar navbar-expand-lg navbar-dark">
      <div class="container">
        <a class="navbar-brand fw-bold" href="index.html">🏠 Home Cleaning</a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#menu">
          <span class="navbar-toggler-icon"></span></button>
        <div class="collapse navbar-collapse" id="menu">
          <ul class="navbar-nav ms-auto">${items}${logoutBtn}</ul>
        </div>
      </div>
    </nav>`;
  if (user) document.getElementById('logoutBtn').addEventListener('click', e => { e.preventDefault(); logout(); });
  document.getElementById('footer').innerHTML =
    '&copy; 2026 Home Cleaning Booking Slot System | B.Tech Web Technologies Project';
}

// ---------- Service cards ----------
function serviceCard(s, cols) {
  return `<div class="${cols}"><div class="card h-100 p-3">
    <h5>${esc(s.name)}</h5><p class="text-muted">${esc(s.desc)}</p>
    <div class="mt-auto"><div class="price mb-2">₹${s.price}</div>
    <a class="btn btn-brand" href="booking.html?service=${encodeURIComponent(s.name)}">Book Now</a></div>
  </div></div>`;
}
async function showServices() {
  const list = document.getElementById('serviceList');
  const pop = document.getElementById('popularServices');
  try {
    const { services } = await getConfig();
    if (list) list.innerHTML = services.map(s => serviceCard(s, 'col-md-6 col-lg-4')).join('');
    if (pop) pop.innerHTML = services.slice(0, 3).map(s => serviceCard(s, 'col-md-4')).join('');
  } catch (err) {
    const box = list || pop;
    if (box) box.innerHTML = '<div class="alert alert-danger">Cannot load services. Is the server running?</div>';
  }
}

// ---------- Register ----------
function setupRegister() {
  document.getElementById('registerForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirmPassword').value;
    const address = document.getElementById('address').value.trim();

    if (name === '') return showMessage('Name cannot be empty.', 'danger');
    if (!/^\S+@\S+\.\S+$/.test(email)) return showMessage('Enter a valid email.', 'danger');
    if (!/^[6-9]\d{9}$/.test(phone)) return showMessage('Enter a valid 10-digit mobile number.', 'danger');
    if (password.length < 6) return showMessage('Password must be at least 6 characters.', 'danger');
    if (password !== confirm) return showMessage('Passwords do not match.', 'danger');
    if (address.length < 5) return showMessage('Enter your full address.', 'danger');

    try {
      const r = await api('/api/register', 'POST', { name, email, phone, password, address });
      if (r.ok) {
        showMessage('Registration successful!', 'success');
        setTimeout(() => window.location.href = 'login.html', 1500);
      } else {
        showMessage(r.data.message || 'Registration failed.', 'danger');
      }
    } catch (err) {
      showMessage('Cannot reach server. Is it running?', 'danger');
    }
  });
}

// ---------- Login ----------
function setupLogin() {
  if (getUser()) { window.location.href = 'services.html'; return; }
  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (email === '' || password === '') return showMessage('Enter email and password.', 'danger');
    try {
      const r = await api('/api/login', 'POST', { email, password });
      if (r.ok) {
        localStorage.setItem('user', JSON.stringify({ ...r.data.user, token: r.data.token }));
        // go back to the page the user wanted (only our own pages)
        const next = new URLSearchParams(location.search).get('next') || '';
        const ok = /^[a-z-]+\.html(\?[^#]*)?$/.test(next) && !/^(login|register|admin)\.html/.test(next);
        window.location.href = ok ? next : 'services.html';
      } else {
        showMessage(r.data.message || 'Invalid email or password.', 'danger');
      }
    } catch (err) {
      showMessage('Cannot reach server. Is it running?', 'danger');
    }
  });
}

// ---------- Booking ----------
async function setupBooking() {
  const user = requireLogin();
  if (!user) return;
  const serviceSel = document.getElementById('service');
  const slotSel = document.getElementById('slot');
  const dateInput = document.getElementById('date');
  const priceBox = document.getElementById('priceBox');
  let cfg;
  try { cfg = await getConfig(); } catch (err) {
    return showMessage('Cannot reach server. Is it running?', 'danger');
  }
  serviceSel.innerHTML = '<option value="">-- Select a service --</option>' +
    cfg.services.map(s => `<option value="${esc(s.name)}">${esc(s.name)} - ₹${s.price}</option>`).join('');
  const chosen = new URLSearchParams(location.search).get('service');
  if (chosen && cfg.services.some(s => s.name === chosen)) serviceSel.value = chosen; // auto-select service
  const showPrice = () => {
    const s = cfg.services.find(x => x.name === serviceSel.value);
    priceBox.innerHTML = s ? `Price: <span class="price">₹${s.price}</span> <small class="text-muted">(pay after service)</small>` : '';
  };
  serviceSel.addEventListener('change', showPrice); showPrice();

  const today = todayLocal();
  dateInput.min = today; dateInput.max = plusDays(today, 60);

  async function loadSlots() {
    const date = dateInput.value;
    const previous = slotSel.value;
    if (!date) {
      slotSel.innerHTML = '<option value="">-- Select a date first --</option>'; return;
    }
    const r = await api('/api/availability?date=' + encodeURIComponent(date));
    if (!r.ok) { slotSel.innerHTML = '<option value="">-- Could not load slots --</option>'; return; }
    slotSel.innerHTML = '<option value="">-- Select a time slot --</option>' + r.data.map(s =>
      `<option value="${esc(s.slot)}" ${s.left ? '' : 'disabled'}>${esc(s.slot)} ${s.left ? '(' + s.left + ' left)' : '(Full / closed)'}</option>`).join('');
    if (previous && r.data.some(s => s.slot === previous && s.left)) slotSel.value = previous;
  }
  slotSel.innerHTML = '<option value="">-- Select a date first --</option>';
  dateInput.addEventListener('change', loadSlots);

  document.getElementById('bookingForm').addEventListener('submit', async e => {
    e.preventDefault();
    document.getElementById('message').innerHTML = '';
    const service = serviceSel.value;
    const date = dateInput.value;
    const slot = slotSel.value;
    const address = document.getElementById('address').value.trim();

    if (service === '') return showMessage('Please select a service.', 'danger');
    if (date === '') return showMessage('Please select a date.', 'danger');
    if (date < today) return showMessage('Date cannot be in the past.', 'danger');
    if (slot === '') return showMessage('Please select a time slot.', 'danger');
    if (address.length < 5) return showMessage('Please enter your full address.', 'danger');

    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const r = await api('/api/bookings', 'POST',
        { service, booking_date: date, time_slot: slot, address });
      if (r.ok) {
        showMessage('Booking confirmed successfully!', 'success');
        document.getElementById('summary').innerHTML = `
          <h5>Booking Summary</h5>
          <table class="table table-bordered">
            <tr><th>Booking No.</th><td>#${esc(r.data.booking.id)}</td></tr>
            <tr><th>Service</th><td>${esc(service)}</td></tr>
            <tr><th>Price</th><td>₹${esc(r.data.booking.price)} (pay after service)</td></tr>
            <tr><th>Date</th><td>${esc(date)}</td></tr>
            <tr><th>Time</th><td>${esc(slot)}</td></tr>
            <tr><th>Address</th><td>${esc(address)}</td></tr>
            <tr><th>Status</th><td>Confirmed</td></tr>
          </table>
          <a class="btn btn-outline-secondary" href="booking-history.html">View my bookings</a>`;
        document.getElementById('bookingForm').reset();
        showPrice(); loadSlots();
      } else {
        showMessage(r.data.message || 'Booking failed.', 'danger');
        if (r.status === 409 || r.status === 400) loadSlots();
      }
    } catch (err) {
      showMessage('Cannot reach server. Is it running?', 'danger');
    }
    btn.disabled = false;
  });
}

// ---------- Booking history ----------
const STATUS_CLASS = { Confirmed: 'bg-success', Completed: 'bg-primary', Cancelled: 'bg-secondary' };
async function loadHistory() {
  const user = requireLogin();
  if (!user) return;
  try {
    const r = await api('/api/bookings/' + user.id);
    if (!r.ok) return showMessage(r.data.message || 'Could not load bookings.', 'danger');
    if (r.data.length === 0) return showMessage('No bookings found.', 'info');
    const today = todayLocal();
    const rows = r.data.map(b => `<tr><td>${esc(b.service)}${b.price ? `<br><small class="text-muted">₹${b.price}</small>` : ''}</td>
      <td>${esc(b.booking_date)}</td><td>${esc(b.time_slot)}</td><td>${esc(b.address)}</td>
      <td><span class="badge ${STATUS_CLASS[b.status] || 'bg-dark'}">${esc(b.status)}</span></td>
      <td>${b.status === 'Confirmed' && b.booking_date >= today
        ? `<button class="btn btn-sm btn-outline-danger" data-cancel="${b.id}">Cancel</button>` : ''}</td></tr>`).join('');
    document.getElementById('historyBox').innerHTML = `
      <table class="table table-bordered table-striped">
        <thead><tr><th>Service</th><th>Date</th><th>Time</th><th>Address</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table>`;
    document.getElementById('historyBox').onclick = async e => {
      const id = e.target.dataset && e.target.dataset.cancel;
      if (!id || !confirm('Cancel this booking?')) return;
      const c = await api('/api/bookings/' + id + '/cancel', 'POST');
      if (c.ok) { document.getElementById('message').innerHTML = ''; loadHistory(); }
      else showMessage(c.data.message || 'Could not cancel.', 'danger');
    };
  } catch (err) {
    showMessage('Cannot reach server. Is it running?', 'danger');
  }
}

// ---------- Profile ----------
async function loadProfile() {
  const user = requireLogin();
  if (!user) return;
  try {
    const r = await api('/api/user/' + user.id);
    if (!r.ok) return showMessage(r.data.message || 'Could not load profile.', 'danger');
    document.getElementById('pName').textContent = r.data.name;
    document.getElementById('pEmail').textContent = r.data.email;
    document.getElementById('pPhone').textContent = r.data.phone;
    document.getElementById('pAddress').textContent = r.data.address;
    document.getElementById('profileTable').style.display = 'table';
  } catch (err) {
    showMessage('Cannot reach server. Is it running?', 'danger');
  }
}

// ---------- Admin (owner) panel ----------
function setupAdmin() {
  const loginBox = document.getElementById('adminLogin');
  const panel = document.getElementById('adminPanel');
  let all = [];
  const tok = () => sessionStorage.getItem('adminToken');
  function render() {
    const f = document.getElementById('fStatus').value;
    const q = document.getElementById('fSearch').value.trim().toLowerCase();
    const rows = all.filter(b => (!f || b.status === f) &&
      (!q || (b.name + b.phone + b.email + b.service + b.booking_date + b.id).toLowerCase().includes(q)));
    const count = s => all.filter(b => b.status === s).length;
    document.getElementById('stats').innerHTML =
      `<span class="badge bg-dark me-1">Total ${all.length}</span><span class="badge bg-success me-1">Confirmed ${count('Confirmed')}</span>` +
      `<span class="badge bg-primary me-1">Completed ${count('Completed')}</span><span class="badge bg-secondary">Cancelled ${count('Cancelled')}</span>`;
    document.getElementById('adminRows').innerHTML = rows.length ? rows.map(b => `<tr>
      <td>#${b.id}</td>
      <td>${esc(b.name)}<br><a href="tel:${esc(b.phone)}">${esc(b.phone)}</a><br><small>${esc(b.email)}</small></td>
      <td>${esc(b.service)}<br><small class="text-muted">₹${b.price}</small></td>
      <td>${esc(b.booking_date)}<br><small>${esc(b.time_slot)}</small></td>
      <td>${esc(b.address)}</td>
      <td><select class="form-select form-select-sm" data-id="${b.id}">${['Confirmed', 'Completed', 'Cancelled'].map(s =>
        `<option ${s === b.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`).join('')
      : '<tr><td colspan="6" class="text-center text-muted">No bookings.</td></tr>';
  }
  async function load() {
    const r = await api('/api/admin/bookings', 'GET', null, tok());
    if (r.status === 401) { sessionStorage.removeItem('adminToken'); loginBox.style.display = ''; panel.style.display = 'none'; return; }
    if (!r.ok) return showMessage(r.data.message || 'Could not load bookings.', 'danger');
    all = r.data; loginBox.style.display = 'none'; panel.style.display = ''; render();
  }
  document.getElementById('adminLoginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const r = await api('/api/admin/login', 'POST', { password: document.getElementById('adminPassword').value }, 'none');
    if (!r.ok) return showMessage(r.data.message || 'Login failed.', 'danger');
    sessionStorage.setItem('adminToken', r.data.token);
    document.getElementById('message').innerHTML = ''; load();
  });
  document.getElementById('fStatus').addEventListener('change', render);
  document.getElementById('fSearch').addEventListener('input', render);
  document.getElementById('adminRefresh').addEventListener('click', load);
  document.getElementById('adminLogout').addEventListener('click', () => { sessionStorage.removeItem('adminToken'); location.reload(); });
  document.getElementById('adminRows').addEventListener('change', async e => {
    const id = e.target.dataset && e.target.dataset.id; if (!id) return;
    const r = await api('/api/admin/bookings/' + id + '/status', 'POST', { status: e.target.value }, tok());
    if (r.ok) { const b = all.find(x => String(x.id) === id); b.status = e.target.value; render(); }
    else showMessage(r.data.message || 'Could not update.', 'danger');
  });
  if (tok()) load();
}

// ---------- Start: run the right code for each page ----------
document.addEventListener('DOMContentLoaded', () => {
  renderNavbar();
  const page = document.body.dataset.page;
  if (page === 'home' || page === 'services') showServices();
  if (page === 'register') setupRegister();
  if (page === 'login') setupLogin();
  if (page === 'booking') setupBooking();
  if (page === 'history') loadHistory();
  if (page === 'profile') loadProfile();
  if (page === 'admin') setupAdmin();
});
