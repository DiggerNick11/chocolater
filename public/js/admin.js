const API_BASE = window.location.origin;
const TOKEN_KEY = 'chocolater_token';
const USER_KEY = 'chocolater_user';

const CLIENT_REPORT_PROFILE = {
  storeName: 'ChocoLater Store',
  campusName: 'Institut Bisnis Pelita Indonesia',
  phone: '0822-8432-6992',
  email: 'willey24pranata@gmail.com',
  logoPath: 'images/logo.png'
};

/* =========================
   HELPER
========================= */

function rupiah(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(Number(value || 0));
}

function safeText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function adminProductPlaceholder() {
  return `<span class="admin-product-placeholder" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 3h10l-.8 15.2A3 3 0 0 1 13.2 21h-2.4a3 3 0 0 1-3-2.8L7 3Zm2.1 2 .7 13c0 .6.5 1 1 1h2.4c.5 0 1-.4 1-1l.7-13H9.1ZM5 3h14v2H5V3Zm5 5h4v2h-4V8Z"/></svg></span>`;
}


function formatDateTime(value) {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleString('id-ID');
}

function todayInputValue() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

function monthInputValue() {
  return todayInputValue().slice(0, 7);
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY)) || null;
  } catch {
    return null;
  }
}

function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function showToast(message) {
  const toast = document.getElementById('toast') || document.createElement('div');

  toast.id = 'toast';
  toast.className = 'toast';

  if (!toast.parentElement) {
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 2600);
}

async function requestJSON(url, options = {}) {
  const headers = options.body instanceof FormData
    ? {}
    : { 'Content-Type': 'application/json' };

  const token = getToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.detail || 'Terjadi kesalahan pada server');
  }

  return data;
}

function setText(id, text) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = text;
  }
}

function tableEmpty(message, colspan = 8) {
  return `
    <tr>
      <td colspan="${colspan}" class="empty-state">
        ${safeText(message)}
      </td>
    </tr>
  `;
}

/* =========================
   AUTH ADMIN
========================= */

async function verifyAdmin() {
  const token = getToken();
  const user = getUser();

  if (!token || !user || user.role !== 'admin') {
    window.location.href = 'login.html';
    return false;
  }

  try {
    const result = await requestJSON(`${API_BASE}/api/auth/me`);

    if (!result.user || result.user.role !== 'admin') {
      throw new Error('Bukan admin');
    }

    return true;
  } catch (error) {
    clearAuth();
    window.location.href = 'login.html';
    return false;
  }
}

async function logoutAdmin() {
  try {
    await requestJSON(`${API_BASE}/api/auth/logout`, {
      method: 'POST'
    });
  } catch (error) {
    console.warn('Logout API gagal, localStorage tetap dibersihkan.');
  }

  clearAuth();
  window.location.href = 'login.html';
}

/* =========================
   SIDEBAR ADMIN
========================= */

async function loadAdminSidebar() {
  const sidebarBox = document.getElementById('adminSidebarBox');

  if (!sidebarBox) return;

  try {
    const response = await fetch('partials/admin-sidebar.html');

    if (!response.ok) {
      throw new Error('partials/admin-sidebar.html tidak ditemukan');
    }

    sidebarBox.innerHTML = await response.text();

    setActiveAdminMenu();
    initAdminSidebarToggle();
    initAdminLogout();
  } catch (error) {
    console.error(error);
    sidebarBox.innerHTML = `
      <div class="alert">
        Sidebar admin gagal dimuat.
      </div>
    `;
  }
}

function setActiveAdminMenu() {
  const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';
  const activePage = ['admin-barang.html', 'admin-barang-form.html'].includes(currentPage)
    ? 'admin-menu.html'
    : currentPage;

  document.querySelectorAll('.admin-menu a').forEach(link => {
    const href = link.getAttribute('href');

    if (href === activePage) {
      link.classList.add('active');
    }
  });
}

function initAdminSidebarToggle() {
  const toggleButton = document.getElementById('mobileAdminToggle');
  const sidebar = document.getElementById('adminSidebar');

  if (!toggleButton || !sidebar) return;

  toggleButton.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  document.querySelectorAll('.admin-menu a').forEach(link => {
    link.addEventListener('click', () => {
      sidebar.classList.remove('open');
    });
  });
}

function initAdminLogout() {
  const logoutButton = document.getElementById('adminLogoutBtn');

  if (!logoutButton) return;

  logoutButton.addEventListener('click', async () => {
    await logoutAdmin();
  });
}

/* =========================
   CHART DASHBOARD
========================= */

function monthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function monthLabel(key) {
  const [year, month] = key.split('-');

  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('id-ID', {
    month: 'short'
  });
}

function last12Months() {
  const months = [];
  const now = new Date();

  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(monthKey(date));
  }

  return months;
}

function normalizeMonthKey(value) {
  if (!value) return '';

  const text = String(value);

  // Kalau bentuknya sudah 2026-05
  if (/^\d{4}-\d{2}$/.test(text)) {
    return text;
  }

  // Kalau bentuknya 2026-05-01 atau 2026-05-01T00:00:00.000Z
  if (/^\d{4}-\d{2}/.test(text)) {
    return text.slice(0, 7);
  }

  const date = new Date(value);

  if (!Number.isNaN(date.getTime())) {
    return monthKey(date);
  }

  return '';
}

function renderLineChart(monthlySales = []) {
  const box = document.getElementById('salesChart');

  if (!box) return;

  const months = last12Months();

  const salesMap = Object.fromEntries(
    monthlySales.map(item => [
      normalizeMonthKey(item.month),
      Number(item.total || 0)
    ])
  );

  const values = months.map(month => salesMap[month] || 0);
  const max = Math.max(...values, 1);

  const width = 900;
  const height = 300;
  const padding = 34;
  const xStep = (width - padding * 2) / (months.length - 1 || 1);

  const points = values.map((value, index) => {
    const x = padding + index * xStep;
    const y = height - padding - (value / max) * (height - padding * 2);

    return {
      x,
      y,
      value,
      label: monthLabel(months[index])
    };
  });

  const grid = [0, 0.25, 0.5, 0.75, 1].map(t => {
    const y = height - padding - t * (height - padding * 2);

    return `
      <line
        x1="${padding}"
        y1="${y}"
        x2="${width - padding}"
        y2="${y}"
        stroke="#eadccc"
        stroke-dasharray="5 5"
      />
    `;
  }).join('');

  const polyline = points.map(point => `${point.x},${point.y}`).join(' ');

  const circles = points.map(point => `
    <circle cx="${point.x}" cy="${point.y}" r="5" fill="#a46a42">
      <title>${point.label}: ${rupiah(point.value)}</title>
    </circle>
  `).join('');

  const labels = points.map((point, index) => {
    if (index % 2 !== 0) return '';

    return `
      <text
        x="${point.x}"
        y="292"
        text-anchor="middle"
        font-size="12"
        fill="#796a5f"
      >
        ${point.label}
      </text>
    `;
  }).join('');

  box.innerHTML = `
    <svg class="svg-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Statistik penjualan">
      ${grid}
      <polyline
        points="${polyline}"
        fill="none"
        stroke="#7c4a2e"
        stroke-width="5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      ${circles}
      ${labels}
    </svg>
  `;
}

function renderProductDonut(productSales = []) {
  const donut = document.getElementById('productDonut');
  const legend = document.getElementById('productLegend');

  if (!donut || !legend) return;

  const totalQty = productSales.reduce((sum, item) => {
    return sum + Number(item.qty || 0);
  }, 0);

  if (!totalQty) {
    donut.style.background = 'conic-gradient(#eadccc 0deg 360deg)';
    legend.innerHTML = '<span>Belum ada penjualan</span>';
    return;
  }

  let degree = 0;
  const colors = ['#3b2115', '#a46a42', '#dcb181', '#29b56f'];

  const gradient = productSales.slice(0, 4).map((item, index) => {
    const start = degree;
    degree += (Number(item.qty) / totalQty) * 360;

    return `${colors[index]} ${start}deg ${degree}deg`;
  }).join(', ');

  donut.style.background = `conic-gradient(${gradient})`;

  legend.innerHTML = productSales.slice(0, 4).map(item => {
    return `<span>${safeText(item.name)} (${item.qty})</span>`;
  }).join('');
}

/* =========================
   DASHBOARD PAGE
========================= */

async function initDashboard() {
  if (!document.getElementById('dashboardStats')) return;

  const stats = await requestJSON(`${API_BASE}/api/admin/stats`);

  setText('statIncome', rupiah(stats.total_income));
  setText('statOrders', stats.total_orders);
  setText('statPending', stats.pending_orders);
  setText('statMembers', stats.total_members);
  setText('statProducts', stats.total_products);
  setText('statMessages', stats.unread_messages);

  renderLineChart(stats.monthly_sales || []);
  renderProductDonut(stats.product_sales || []);

  const printButton = document.getElementById('printDashboardBtn');

  printButton?.addEventListener('click', printDashboardReport);
}

async function printDashboardReport() {
  const box = document.getElementById('dashboardPrintBox');

  if (!box) return;

  const stats = await requestJSON(`${API_BASE}/api/admin/stats`);
  const data = {
    profile: CLIENT_REPORT_PROFILE,
    printed_by: getUser()?.name || 'Admin',
    printed_at: new Date().toISOString(),
    period: { label: 'Laporan Dashboard Admin' }
  };

  box.innerHTML = `
    ${renderReportHeader(data)}

    <section class="report-section">
      <div class="report-heading">
        <h3>Ringkasan Dashboard</h3>
        <small>Data dicetak tanpa filter harian/bulanan/tahunan.</small>
      </div>

      <div class="stats-grid report-stats-grid dashboard-print-stats">
        <div class="stat-card">
          <div class="stat-label">Total Penjualan</div>
          <div class="stat-value">${rupiah(stats.total_income)}</div>
        </div>
        <div class="stat-card green">
          <div class="stat-label">Total Order</div>
          <div class="stat-value">${stats.total_orders}</div>
        </div>
        <div class="stat-card yellow">
          <div class="stat-label">Pending Request</div>
          <div class="stat-value">${stats.pending_orders}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Member</div>
          <div class="stat-value">${stats.total_members}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Produk/Menu</div>
          <div class="stat-value">${stats.total_products}</div>
        </div>
        <div class="stat-card red">
          <div class="stat-label">Pesan Baru</div>
          <div class="stat-value">${stats.unread_messages}</div>
        </div>
      </div>
    </section>

    ${renderReportTable('Penjualan 12 Bulan Terakhir', stats.monthly_sales || [], [
      { key: 'month', label: 'Bulan', format: value => normalizeMonthKey(value) || value || '-' },
      { key: 'total', label: 'Total Penjualan', format: value => rupiah(value) }
    ])}

    ${renderReportTable('Produk Terjual', stats.product_sales || [], [
      { key: 'name', label: 'Nama Produk' },
      { key: 'qty', label: 'Jumlah Terjual' }
    ])}

    ${renderReportFooter(data)}
  `;

  setTimeout(() => window.print(), 80);
}

/* =========================
   USERS PAGE
========================= */

async function initUsersPage() {
  const table = document.getElementById('usersTable');

  if (!table) return;

  async function loadUsers() {
    const users = await requestJSON(`${API_BASE}/api/admin/users`);

    table.innerHTML = users.length
      ? users.map(user => `
        <tr>
          <td>${user.id}</td>
          <td>${safeText(user.name)}</td>
          <td>${safeText(user.email)}</td>
          <td>${safeText(user.phone || '-')}</td>
          <td><span class="pill">${safeText(user.role)}</span></td>
          <td>${safeText(user.status)}</td>
          <td>${new Date(user.created_at).toLocaleString('id-ID')}</td>
          <td class="action-row">
            <a class="btn btn-edit btn-small" href="admin-user-form.html?id=${user.id}">Edit</a>
            <button class="btn btn-danger btn-small" data-delete-user="${user.id}">Delete</button>
          </td>
        </tr>
      `).join('')
      : tableEmpty('Belum ada user', 8);
  }

  document.body.addEventListener('click', async event => {
    const deleteButton = event.target.closest('[data-delete-user]');

    if (deleteButton && confirm('Delete user ini?')) {
      await requestJSON(`${API_BASE}/api/admin/users/${deleteButton.dataset.deleteUser}`, {
        method: 'DELETE'
      });

      showToast('User berhasil dihapus');

      await loadUsers();
    }
  });

  await loadUsers();
}

async function initUserFormPage() {
  const form = document.getElementById('userForm');

  if (!form) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (id) {
    const title = document.getElementById('userFormTitle');
    if (title) title.textContent = 'Edit User';

    const users = await requestJSON(`${API_BASE}/api/admin/users`);
    const user = users.find(item => Number(item.id) === Number(id));

    if (!user) {
      showToast('User tidak ditemukan');
      setTimeout(() => window.location.href = 'admin-users.html', 700);
      return;
    }

    form.elements['id_user'].value = user.id;
    form.elements['name'].value = user.name;
    form.elements['email'].value = user.email;
    form.elements['phone'].value = user.phone || '';
    form.elements['role'].value = user.role;
    form.elements['status'].value = user.status;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const idUser = form.elements['id_user'].value;
    const payload = Object.fromEntries(new FormData(form).entries());

    delete payload.id_user;

    if (!payload.password) {
      delete payload.password;
    }

    await requestJSON(`${API_BASE}/api/admin/users${idUser ? '/' + idUser : ''}`, {
      method: idUser ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });

    showToast('Data user berhasil disimpan');

    setTimeout(() => {
      window.location.href = 'admin-users.html';
    }, 700);
  });
}

/* =========================
   MENU PRODUK PAGE
========================= */

async function initProductsPage() {
  const table = document.getElementById('productsTable');

  if (!table) return;

  async function loadProducts() {
    const products = await requestJSON(`${API_BASE}/api/admin/products`);

    table.innerHTML = products.length
      ? products.map(product => `
        <tr>
          <td>${product.id}</td>
          <td>${safeText(product.sku || '-')}</td>
          <td>
            ${
              product.image_url
                ? `<img src="${safeText(product.image_url)}" style="width:54px;height:54px;object-fit:cover;border-radius:12px">`
                : adminProductPlaceholder()
            }
          </td>
          <td>
            <strong>${safeText(product.name)}</strong><br>
            <small>${safeText(product.description || '')}</small>
          </td>
          <td>${rupiah(product.price)}</td>
          <td>${product.stock}</td>
          <td>${product.is_active ? 'Aktif' : 'Nonaktif'}</td>
          <td class="action-row">
            <a class="btn btn-edit btn-small" href="admin-barang-form.html?id=${product.id}">Edit</a>
            <button class="btn btn-danger btn-small" data-delete-product="${product.id}">Delete</button>
          </td>
        </tr>
      `).join('')
      : tableEmpty('Belum ada menu produk', 8);
  }

  document.body.addEventListener('click', async event => {
    const deleteButton = event.target.closest('[data-delete-product]');

    if (deleteButton && confirm('Delete menu produk ini?')) {
      await requestJSON(`${API_BASE}/api/admin/products/${deleteButton.dataset.deleteProduct}`, {
        method: 'DELETE'
      });

      showToast('Menu produk berhasil dihapus');

      await loadProducts();
    }
  });

  await loadProducts();
}

async function initProductFormPage() {
  const form = document.getElementById('productForm');

  if (!form) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (id) {
    const title = document.getElementById('productFormTitle');
    if (title) title.textContent = 'Edit Menu Produk';

    const products = await requestJSON(`${API_BASE}/api/admin/products`);
    const product = products.find(item => Number(item.id) === Number(id));

    if (!product) {
      showToast('Produk tidak ditemukan');
      setTimeout(() => window.location.href = 'admin-menu.html', 700);
      return;
    }

    form.elements['id_product'].value = product.id;
    form.elements['sku'].value = product.sku || '';
    form.elements['name'].value = product.name;
    form.elements['price'].value = product.price;
    form.elements['stock'].value = product.stock;
    form.elements['description'].value = product.description || '';
    form.elements['image_url'].value = product.image_url || '';
    form.elements['is_active'].value = String(product.is_active ? 1 : 0);
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const idProduct = form.elements['id_product'].value;
    const data = new FormData(form);

    data.delete('id_product');

    await requestJSON(`${API_BASE}/api/admin/products${idProduct ? '/' + idProduct : ''}`, {
      method: idProduct ? 'PUT' : 'POST',
      body: data
    });

    showToast('Data menu produk berhasil disimpan');

    setTimeout(() => {
      window.location.href = 'admin-menu.html';
    }, 700);
  });
}

/* =========================
   MENU PRODUK PAGE
========================= */

async function initMenuPage() {
  const table = document.getElementById('menuTable');

  if (!table) return;

  async function loadMenu() {
    const menu = await requestJSON(`${API_BASE}/api/admin/menu`);

    table.innerHTML = menu.length
      ? menu.map(item => `
        <tr>
          <td>${item.id}</td>
          <td>${safeText(item.name)}</td>
          <td>${rupiah(item.price)}</td>
          <td>${item.stock}</td>
          <td>${item.is_active ? 'Tampil' : 'Disembunyikan'}</td>
          <td class="action-row">
            <a class="btn btn-edit btn-small" href="admin-barang-form.html?id=${item.id}">Edit</a>
            <button class="btn btn-danger btn-small" data-delete-menu="${item.id}">Delete</button>
          </td>
        </tr>
      `).join('')
      : tableEmpty('Menu belum tersedia', 6);
  }

  document.body.addEventListener('click', async event => {
    const deleteButton = event.target.closest('[data-delete-menu]');

    if (deleteButton && confirm('Delete menu ini?')) {
      await requestJSON(`${API_BASE}/api/admin/products/${deleteButton.dataset.deleteMenu}`, {
        method: 'DELETE'
      });

      showToast('Menu berhasil dihapus');

      await loadMenu();
    }
  });

  await loadMenu();
}

/* =========================
   ORDERS PAGE
========================= */

async function initOrdersPage() {
  const table = document.getElementById('ordersTable');
  const form = document.getElementById('manualOrderForm');
  const manualCard = document.getElementById('manualOrderCard');
  const toggleManualButton = document.getElementById('toggleManualOrderBtn');
  const productSelect = document.getElementById('manualProductSelect');
  const qtyInput = document.getElementById('manualProductQty');
  const addItemButton = document.getElementById('addManualItemBtn');
  const manualItemsTable = document.getElementById('manualItemsTable');
  const manualTotal = document.getElementById('manualOrderTotal');
  const resetButton = document.getElementById('resetManualOrderBtn');
  const ordersPeriodSelect = document.getElementById('ordersPeriodSelect');
  const ordersDateInput = document.getElementById('ordersDateInput');
  const ordersMonthInput = document.getElementById('ordersMonthInput');
  const ordersYearInput = document.getElementById('ordersYearInput');
  const ordersPrintArea = document.getElementById('ordersReportPrintArea');
  const printOrdersButton = document.getElementById('printOrdersBtn');

  if (!table) return;

  let products = [];
  let manualItems = [];

  function setManualCardOpen(open) {
    if (!manualCard || !toggleManualButton) return;

    manualCard.classList.toggle('is-hidden', !open);
    toggleManualButton.textContent = open ? 'Tutup Form Pembelian' : '+ Tambah Pembelian';
  }

  function updateOrdersFilterVisibility() {
    const period = ordersPeriodSelect?.value || 'monthly';
    const dailyField = document.getElementById('ordersDailyField');
    const monthlyField = document.getElementById('ordersMonthlyField');
    const yearlyField = document.getElementById('ordersYearlyField');

    if (dailyField) dailyField.style.display = period === 'daily' ? '' : 'none';
    if (monthlyField) monthlyField.style.display = period === 'monthly' ? '' : 'none';
    if (yearlyField) yearlyField.style.display = period === 'yearly' ? '' : 'none';
  }

  function ordersReportQueryString() {
    const period = ordersPeriodSelect?.value || 'monthly';
    const date = ordersDateInput?.value || todayInputValue();
    const month = ordersMonthInput?.value || monthInputValue();
    const year = ordersYearInput?.value || String(new Date().getFullYear());
    const params = new URLSearchParams({ period });

    if (period === 'daily') params.set('date', date);
    if (period === 'monthly') params.set('month', month);
    if (period === 'yearly') params.set('year', year);

    return params.toString();
  }

  async function printOrdersReport() {
    if (!ordersPrintArea) return;

    const data = await requestJSON(`${API_BASE}/api/admin/reports?${ordersReportQueryString()}`);

    ordersPrintArea.innerHTML = `
      ${renderReportHeader(data)}

      <section class="report-section">
        <div class="report-heading">
          <h3>Ringkasan Penjualan/Pembelian</h3>
          <small>Data mengikuti filter harian, bulanan, atau tahunan yang dipilih.</small>
        </div>

        <div class="stats-grid report-stats-grid">
          <div class="stat-card">
            <div class="stat-label">Total Order</div>
            <div class="stat-value">${data.summary.total_orders}</div>
          </div>
          <div class="stat-card green">
            <div class="stat-label">Total Penjualan</div>
            <div class="stat-value">${rupiah(data.summary.total_income)}</div>
          </div>
          <div class="stat-card yellow">
            <div class="stat-label">Order Baru</div>
            <div class="stat-value">${data.summary.new_orders}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Order Selesai</div>
            <div class="stat-value">${data.summary.completed_orders}</div>
          </div>
        </div>
      </section>

      ${renderReportTable('Data Penjualan/Pembelian', data.orders || [], [
        { key: 'id', label: 'No Order', format: value => '#' + value },
        { key: 'customer_name', label: 'Pembeli' },
        { key: 'phone', label: 'No HP' },
        { key: 'total', label: 'Total', format: value => rupiah(value) },
        { key: 'status', label: 'Status' },
        { key: 'created_at', label: 'Tanggal', format: value => formatDateTime(value) }
      ])}

      ${renderReportTable('Detail Item Penjualan/Pembelian', data.order_items || [], [
        { key: 'order_id', label: 'Order', format: value => '#' + value },
        { key: 'product_name', label: 'Produk' },
        { key: 'quantity', label: 'Qty' },
        { key: 'price', label: 'Harga', format: value => rupiah(value) },
        { key: 'subtotal', label: 'Subtotal', format: value => rupiah(value) },
        { key: 'order_date', label: 'Tanggal', format: value => formatDateTime(value) }
      ])}

      ${renderReportFooter(data)}
    `;

    setTimeout(() => window.print(), 80);
  }

  function renderManualProducts() {
    if (!productSelect) return;

    productSelect.innerHTML = products.length
      ? products.map(product => `
        <option value="${product.id}">
          ${safeText(product.name)} - ${rupiah(product.price)} | Stok: ${product.stock}
        </option>
      `).join('')
      : '<option value="">Produk belum tersedia</option>';
  }

  function renderManualItems() {
    if (!manualItemsTable || !manualTotal) return;

    const total = manualItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);

    manualItemsTable.innerHTML = manualItems.length
      ? manualItems.map((item, index) => `
        <tr>
          <td>${safeText(item.name)}</td>
          <td>${rupiah(item.price)}</td>
          <td>${item.quantity}</td>
          <td>${rupiah(item.subtotal)}</td>
          <td>
            <button class="btn btn-danger btn-small" type="button" data-remove-manual-item="${index}">Hapus</button>
          </td>
        </tr>
      `).join('')
      : tableEmpty('Belum ada item manual yang ditambahkan', 5);

    manualTotal.textContent = rupiah(total);
  }

  async function loadProductsForManualOrder() {
    if (!form) return;

    products = await requestJSON(`${API_BASE}/api/admin/menu`);
    renderManualProducts();
    renderManualItems();
  }

  function addManualItem() {
    if (!productSelect || !qtyInput) return;

    const productId = Number(productSelect.value);
    const quantity = Number(qtyInput.value || 0);
    const product = products.find(item => Number(item.id) === productId);

    if (!product) {
      showToast('Pilih produk terlebih dahulu');
      return;
    }

    if (!quantity || quantity < 1) {
      showToast('Jumlah minimal 1');
      return;
    }

    if (Number(product.stock) < quantity) {
      showToast(`Stok ${product.name} tidak cukup`);
      return;
    }

    const existing = manualItems.find(item => Number(item.product_id) === productId);

    if (existing) {
      const nextQty = Number(existing.quantity) + quantity;

      if (nextQty > Number(product.stock)) {
        showToast(`Jumlah melebihi stok ${product.name}`);
        return;
      }

      existing.quantity = nextQty;
      existing.subtotal = Number(existing.price) * nextQty;
    } else {
      manualItems.push({
        product_id: product.id,
        name: product.name,
        quantity,
        price: Number(product.price),
        subtotal: Number(product.price) * quantity
      });
    }

    qtyInput.value = 1;
    renderManualItems();
  }

  async function loadOrders() {
    const orders = await requestJSON(`${API_BASE}/api/admin/orders`);

    table.innerHTML = orders.length
      ? orders.map(order => `
        <tr>
          <td>
            #${order.id}<br>
            <small>${formatDateTime(order.created_at)}</small>
          </td>
          <td>
            <strong>${safeText(order.customer_name)}</strong><br>
            ${safeText(order.phone)}<br>
            <small>${safeText(order.address)}</small>
            ${order.notes ? `<br><small class="muted-text">${safeText(order.notes).replaceAll(String.fromCharCode(10), '<br>')}</small>` : ''}
          </td>
          <td>
            ${order.items.map(item => `${safeText(item.product_name)} x${item.quantity}`).join('<br>')}
          </td>
          <td>${rupiah(order.total)}</td>
          <td>
            <select class="select input" data-order-status="${order.id}">
              ${
                ['baru', 'diproses', 'selesai', 'dibatalkan'].map(status => `
                  <option value="${status}" ${status === order.status ? 'selected' : ''}>
                    ${status}
                  </option>
                `).join('')
              }
            </select>
          </td>
          <td class="action-row">
            <button class="btn btn-danger btn-small" data-delete-order="${order.id}">Delete</button>
          </td>
        </tr>
      `).join('')
      : tableEmpty('Belum ada pembelian/penjualan', 6);
  }

  if (ordersDateInput && !ordersDateInput.value) ordersDateInput.value = todayInputValue();
  if (ordersMonthInput && !ordersMonthInput.value) ordersMonthInput.value = monthInputValue();
  if (ordersYearInput && !ordersYearInput.value) ordersYearInput.value = String(new Date().getFullYear());

  updateOrdersFilterVisibility();

  toggleManualButton?.addEventListener('click', () => {
    setManualCardOpen(manualCard?.classList.contains('is-hidden'));
  });

  ordersPeriodSelect?.addEventListener('change', updateOrdersFilterVisibility);
  printOrdersButton?.addEventListener('click', printOrdersReport);

  addItemButton?.addEventListener('click', addManualItem);

  resetButton?.addEventListener('click', () => {
    manualItems = [];
    setTimeout(renderManualItems, 0);
  });

  document.body.addEventListener('click', event => {
    const removeButton = event.target.closest('[data-remove-manual-item]');

    if (!removeButton) return;

    manualItems.splice(Number(removeButton.dataset.removeManualItem), 1);
    renderManualItems();
  });

  form?.addEventListener('submit', async event => {
    event.preventDefault();

    if (!manualItems.length) {
      showToast('Tambahkan minimal satu item produk');
      return;
    }

    const formData = new FormData(form);

    const payload = {
      customer_name: formData.get('customer_name'),
      phone: formData.get('phone'),
      address: formData.get('address'),
      order_date: formData.get('order_date'),
      status: formData.get('status'),
      notes: formData.get('notes'),
      items: manualItems.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity
      }))
    };

    await requestJSON(`${API_BASE}/api/admin/orders`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    showToast('Pembelian manual berhasil disimpan');

    form.reset();
    manualItems = [];
    setManualCardOpen(false);
    await loadProductsForManualOrder();
    await loadOrders();
  });

  document.body.addEventListener('change', async event => {
    const select = event.target.closest('[data-order-status]');

    if (!select) return;

    await requestJSON(`${API_BASE}/api/admin/orders/${select.dataset.orderStatus}/status`, {
      method: 'PUT',
      body: JSON.stringify({
        status: select.value
      })
    });

    showToast('Status pesanan diperbarui');

    await loadOrders();
  });

  document.body.addEventListener('click', async event => {
    const deleteButton = event.target.closest('[data-delete-order]');

    if (deleteButton && confirm('Delete data pesanan ini?')) {
      await requestJSON(`${API_BASE}/api/admin/orders/${deleteButton.dataset.deleteOrder}`, {
        method: 'DELETE'
      });

      showToast('Pesanan dihapus');

      await loadProductsForManualOrder();
      await loadOrders();
    }
  });

  await loadProductsForManualOrder();
  await loadOrders();
}

/* =========================
   MESSAGES PAGE
========================= */

async function initMessagesPage() {
  const table = document.getElementById('messagesTable');

  if (!table) return;

  async function loadMessages() {
    const messages = await requestJSON(`${API_BASE}/api/admin/messages`);

    table.innerHTML = messages.length
      ? messages.map(message => `
        <tr>
          <td>${message.id}</td>
          <td>
            <strong>${safeText(message.name)}</strong><br>
            ${safeText(message.email)}<br>
            ${safeText(message.phone || '')}
          </td>
          <td>${safeText(message.subject || '-')}</td>
          <td>${safeText(message.message)}</td>
          <td><span class="pill">${safeText(message.status)}</span></td>
          <td>${new Date(message.created_at).toLocaleString('id-ID')}</td>
          <td class="action-row">
            <button class="btn btn-edit btn-small" data-read-message="${message.id}">Dibaca</button>
            <button class="btn btn-danger btn-small" data-delete-message="${message.id}">Delete</button>
          </td>
        </tr>
      `).join('')
      : tableEmpty('Belum ada pesan', 7);
  }

  document.body.addEventListener('click', async event => {
    const readButton = event.target.closest('[data-read-message]');
    const deleteButton = event.target.closest('[data-delete-message]');

    if (readButton) {
      await requestJSON(`${API_BASE}/api/admin/messages/${readButton.dataset.readMessage}/status`, {
        method: 'PUT',
        body: JSON.stringify({
          status: 'dibaca'
        })
      });

      showToast('Pesan ditandai dibaca');

      await loadMessages();
    }

    if (deleteButton && confirm('Delete pesan ini?')) {
      await requestJSON(`${API_BASE}/api/admin/messages/${deleteButton.dataset.deleteMessage}`, {
        method: 'DELETE'
      });

      showToast('Pesan dihapus');

      await loadMessages();
    }
  });

  await loadMessages();
}

/* =========================
   MEMBERS PAGE
========================= */

async function initMembersPage() {
  const table = document.getElementById('membersTable');

  if (!table) return;

  async function loadMembers() {
    const members = await requestJSON(`${API_BASE}/api/admin/members`);

    table.innerHTML = members.length
      ? members.map(member => `
        <tr>
          <td>${member.id}</td>
          <td>${safeText(member.name)}</td>
          <td>${safeText(member.email)}</td>
          <td>${safeText(member.phone || '-')}</td>
          <td>${safeText(member.address || '-')}</td>
          <td>${safeText(member.status || '-')}</td>
          <td>${new Date(member.joined_at).toLocaleString('id-ID')}</td>
        </tr>
      `).join('')
      : tableEmpty('Belum ada member', 7);
  }

  await loadMembers();
}

/* =========================
   REPORTS PAGE
========================= */

function renderReportTable(title, rows, columns) {
  const header = columns.map(column => `
    <th>${safeText(column.label)}</th>
  `).join('');

  const body = rows.length
    ? rows.map(row => `
      <tr>
        ${
          columns.map(column => {
            const value = column.format
              ? column.format(row[column.key], row)
              : row[column.key];

            return `<td>${safeText(value)}</td>`;
          }).join('')
        }
      </tr>
    `).join('')
    : `
      <tr>
        <td colspan="${columns.length}">
          Tidak ada data
        </td>
      </tr>
    `;

  return `
    <section class="report-section">
      <div class="report-heading">
        <h3>${safeText(title)}</h3>
      </div>

      <table class="data-table report-table">
        <thead>
          <tr>${header}</tr>
        </thead>
        <tbody>
          ${body}
        </tbody>
      </table>
    </section>
  `;
}

function reportQueryString() {
  const period = document.getElementById('reportPeriodSelect')?.value || 'monthly';
  const date = document.getElementById('reportDateInput')?.value || todayInputValue();
  const month = document.getElementById('reportMonthInput')?.value || monthInputValue();
  const year = document.getElementById('reportYearInput')?.value || String(new Date().getFullYear());
  const params = new URLSearchParams({ period });

  if (period === 'daily') params.set('date', date);
  if (period === 'monthly') params.set('month', month);
  if (period === 'yearly') params.set('year', year);

  return params.toString();
}

function updateReportFilterVisibility() {
  const period = document.getElementById('reportPeriodSelect')?.value || 'monthly';
  const dailyField = document.getElementById('reportDailyField');
  const monthlyField = document.getElementById('reportMonthlyField');
  const yearlyField = document.getElementById('reportYearlyField');

  if (dailyField) dailyField.style.display = period === 'daily' ? '' : 'none';
  if (monthlyField) monthlyField.style.display = period === 'monthly' ? '' : 'none';
  if (yearlyField) yearlyField.style.display = period === 'yearly' ? '' : 'none';
}

function renderReportHeader(data) {
  const profile = data.profile || {};

  return `
    <div class="official-report-header">
      <img src="${safeText(profile.logoPath || 'images/logo.png')}" alt="Logo" />
      <div>
        <h2>${safeText(profile.storeName || 'ChocoLater Store')}</h2>
        <p>${safeText(profile.campusName || 'Institut Bisnis Pelita Indonesia')}</p>
        <p>Telp: ${safeText(profile.phone || '-')} | Email: ${safeText(profile.email || '-')}</p>
      </div>
    </div>
    <div class="official-report-line"></div>
    <div class="report-meta-grid">
      <p><strong>Jenis Laporan:</strong> ${safeText(data.period?.label || '-')}</p>
      <p><strong>Tanggal Cetak:</strong> ${formatDateTime(data.printed_at || new Date())}</p>
      <p><strong>Admin:</strong> ${safeText(data.printed_by || getUser()?.name || 'Admin')}</p>
    </div>
  `;
}

function renderReportFooter(data) {
  return `
    <div class="official-report-footer">
      <div></div>
      <div class="signature-box">
        <p>Dicetak oleh,</p>
        <div class="signature-line"></div>
        <strong>${safeText(data.printed_by || getUser()?.name || 'Admin')}</strong>
      </div>
    </div>
  `;
}

async function initReportsPage() {
  const box = document.getElementById('reportsBox');
  const periodSelect = document.getElementById('reportPeriodSelect');
  const dateInput = document.getElementById('reportDateInput');
  const monthInput = document.getElementById('reportMonthInput');
  const yearInput = document.getElementById('reportYearInput');
  const loadButton = document.getElementById('loadReportBtn');

  if (!box) return;

  if (dateInput && !dateInput.value) dateInput.value = todayInputValue();
  if (monthInput && !monthInput.value) monthInput.value = monthInputValue();
  if (yearInput && !yearInput.value) yearInput.value = String(new Date().getFullYear());

  async function loadReport() {
    updateReportFilterVisibility();

    const data = await requestJSON(`${API_BASE}/api/admin/reports?${reportQueryString()}`);

    box.innerHTML = `
      ${renderReportHeader(data)}

      <section class="report-section">
        <div class="report-heading">
          <h3>Ringkasan Laporan</h3>
          <small>Data pembelian/penjualan mengikuti filter periode yang dipilih.</small>
        </div>

        <div class="stats-grid report-stats-grid">
          <div class="stat-card">
            <div class="stat-label">Total Order</div>
            <div class="stat-value">${data.summary.total_orders}</div>
          </div>

          <div class="stat-card green">
            <div class="stat-label">Total Penjualan</div>
            <div class="stat-value">${rupiah(data.summary.total_income)}</div>
          </div>

          <div class="stat-card yellow">
            <div class="stat-label">Order Baru</div>
            <div class="stat-value">${data.summary.new_orders}</div>
          </div>

          <div class="stat-card">
            <div class="stat-label">Order Selesai</div>
            <div class="stat-value">${data.summary.completed_orders}</div>
          </div>
        </div>
      </section>

      ${renderReportTable('Laporan Pembelian/Penjualan', data.orders, [
        { key: 'id', label: 'No Order', format: value => '#' + value },
        { key: 'customer_name', label: 'Customer' },
        { key: 'phone', label: 'No HP' },
        { key: 'total', label: 'Total', format: value => rupiah(value) },
        { key: 'status', label: 'Status' },
        { key: 'created_at', label: 'Tanggal', format: value => formatDateTime(value) }
      ])}

      ${renderReportTable('Laporan Detail Item Penjualan', data.order_items, [
        { key: 'order_id', label: 'Order', format: value => '#' + value },
        { key: 'product_name', label: 'Produk' },
        { key: 'quantity', label: 'Qty' },
        { key: 'price', label: 'Harga', format: value => rupiah(value) },
        { key: 'subtotal', label: 'Subtotal', format: value => rupiah(value) },
        { key: 'order_date', label: 'Tanggal', format: value => formatDateTime(value) }
      ])}

      ${renderReportTable('Laporan User', data.users, [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Nama' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'No HP' },
        { key: 'role', label: 'Role' },
        { key: 'status', label: 'Status' }
      ])}

      ${renderReportTable('Laporan Barang/Menu', data.products, [
        { key: 'id', label: 'ID' },
        { key: 'sku', label: 'Kode' },
        { key: 'name', label: 'Nama' },
        { key: 'price', label: 'Harga', format: value => rupiah(value) },
        { key: 'stock', label: 'Stok' },
        { key: 'is_active', label: 'Status', format: value => value ? 'Aktif' : 'Nonaktif' }
      ])}

      ${renderReportTable('Laporan Member', data.members, [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Nama' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'No HP' },
        { key: 'address', label: 'Alamat' },
        { key: 'joined_at', label: 'Bergabung', format: value => formatDateTime(value) }
      ])}

      ${renderReportTable('Laporan Pesan', data.messages, [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Nama' },
        { key: 'email', label: 'Email' },
        { key: 'subject', label: 'Subjek' },
        { key: 'status', label: 'Status' },
        { key: 'created_at', label: 'Tanggal', format: value => formatDateTime(value) }
      ])}

      ${renderReportFooter(data)}
    `;
  }

  periodSelect?.addEventListener('change', () => {
    updateReportFilterVisibility();
  });

  loadButton?.addEventListener('click', loadReport);

  document.getElementById('printReportBtn')?.addEventListener('click', () => {
    window.print();
  });

  updateReportFilterVisibility();
  await loadReport();
}

/* =========================
   INIT ALL ADMIN PAGE
========================= */

document.addEventListener('DOMContentLoaded', async () => {
  const ok = await verifyAdmin();

  if (!ok) return;

  await loadAdminSidebar();

  try {
    await initDashboard();
    await initUsersPage();
    await initUserFormPage();
    await initProductsPage();
    await initProductFormPage();
    await initMenuPage();
    await initOrdersPage();
    await initMessagesPage();
    await initMembersPage();
    await initReportsPage();
  } catch (error) {
    showToast(error.message);
    console.error(error);
  }
});
