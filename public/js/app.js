const API_BASE = window.location.origin;
const CART_KEY = 'chocolater_cart';
const TOKEN_KEY = 'chocolater_token';
const USER_KEY = 'chocolater_user';
let productCache = [];

function rupiah(value) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(value || 0));
}

function safeText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)) || null; } catch { return null; }
}
function setAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
}
function setCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
}
function updateCartBadge() {
  const badge = document.getElementById('cartBadge');
  if (!badge) return;
  const totalItems = getCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  badge.textContent = totalItems;
}
function showToast(message) {
  const toast = document.getElementById('toast') || document.createElement('div');
  toast.id = 'toast';
  toast.className = 'toast';
  if (!toast.parentElement) document.body.appendChild(toast);
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
}

async function requestJSON(url, options = {}) {
  const headers = options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.detail || 'Terjadi kesalahan pada server');
  return data;
}

async function loadHeader() {
  const headerContainer = document.getElementById('header');
  if (!headerContainer) return;
  try {
    const response = await fetch('partials/header.html');
    if (!response.ok) throw new Error('partials/header.html tidak ditemukan');
    headerContainer.innerHTML = await response.text();
  } catch (error) {
    headerContainer.innerHTML = '<div class="alert">Header gagal dimuat.</div>';
    console.error(error);
  }
}

function setActiveNav() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage) link.classList.add('active');
  });
}

function initMenu() {
  const button = document.getElementById('menuToggle');
  const navLinks = document.getElementById('navLinks');
  if (!button || !navLinks) return;
  button.addEventListener('click', () => navLinks.classList.toggle('open'));
}

function refreshAuthNav() {
  const user = getUser();

  document.querySelectorAll('[data-guest-link]').forEach(el => {
    el.style.display = user ? 'none' : 'inline-flex';
  });

  document.querySelectorAll('[data-user-link]').forEach(el => {
    el.style.display = user ? 'inline-flex' : 'none';
  });

  document.querySelectorAll('[data-admin-link]').forEach(el => {
    el.style.display = user && user.role === 'admin' ? 'inline-flex' : 'none';
  });
}

async function logout() {
  try { await requestJSON(`${API_BASE}/api/auth/logout`, { method: 'POST' }); } catch {}
  clearAuth();
  showToast('Logout berhasil');
  setTimeout(() => window.location.href = 'login.html', 400);
}

function productFallbackIcon() {
  return `
    <div class="product-fallback-icon" aria-hidden="true">
      <svg viewBox="0 0 64 64" class="color-icon" role="img"><path d="M18 10h28l-4 44H22L18 10Z" fill="#7DD3FC"/><path d="M22 18h20l-2 30H24l-2-30Z" fill="#F8FAFC"/><path d="M24 30h16l-1.1 15H25.1L24 30Z" fill="#C084FC"/><path d="M18 10h28" stroke="#0284C7" stroke-width="4" stroke-linecap="round"/></svg>
    </div>`;
}

function renderProductCard(product, isMini = false) {
  const media = product.image_url
    ? `<figure class="product-media"><img class="product-image" src="${safeText(product.image_url)}" alt="${safeText(product.name)}"></figure>`
    : `<figure class="product-media product-media-fallback">${productFallbackIcon()}</figure>`;

  return `
    <article class="${isMini ? 'mini-product-card' : 'product-card product-card-full'}">
      ${media}
      <div class="product-card-body">
        <h3>${safeText(product.name)}</h3>
        <p>${safeText(product.description || 'Minuman coklat susu favorit pelanggan.')}</p>
        <div class="product-meta">
          <span class="price">${rupiah(product.price)}</span>
          <span class="stock">Stok ${Number(product.stock || 0)}</span>
        </div>
        <button class="btn btn-primary full-width" data-action="add-cart" data-id="${product.id}">Tambah ke Keranjang</button>
      </div>
    </article>`;
}

async function fetchProducts() {
  productCache = await requestJSON(`${API_BASE}/api/products`);
  return productCache;
}

function renderProductsPage(products) {
  const productList = document.getElementById('productList');
  if (!productList) return;
  const searchValue = document.getElementById('productSearch')?.value?.toLowerCase() || '';
  const filtered = products.filter(product =>
    product.name.toLowerCase().includes(searchValue) || String(product.description || '').toLowerCase().includes(searchValue)
  );
  productList.innerHTML = filtered.length ? filtered.map(product => renderProductCard(product)).join('') : '<div class="empty-state">Produk tidak ditemukan.</div>';
}

function renderHomeProducts(products) {
  const homeProducts = document.getElementById('homeProducts');
  if (!homeProducts) return;
  homeProducts.innerHTML = products.slice(0, 2).map(product => renderProductCard(product, true)).join('');
}

async function initProducts() {
  if (!document.getElementById('productList') && !document.getElementById('homeProducts')) return;
  try {
    const products = await fetchProducts();
    renderProductsPage(products);
    renderHomeProducts(products);
  } catch (error) {
    const message = `<div class="empty-state">Gagal memuat produk: ${safeText(error.message)}</div>`;
    if (document.getElementById('productList')) document.getElementById('productList').innerHTML = message;
    if (document.getElementById('homeProducts')) document.getElementById('homeProducts').innerHTML = message;
  }
}

function addToCart(productId) {
  const product = productCache.find(item => Number(item.id) === Number(productId));
  if (!product) return showToast('Produk tidak ditemukan');
  if (Number(product.stock) <= 0) return showToast('Stok produk habis');
  const cart = getCart();
  const existing = cart.find(item => Number(item.product_id) === Number(productId));
  if (existing) existing.quantity += 1;
  else cart.push({ product_id: product.id, name: product.name, price: Number(product.price), quantity: 1 });
  setCart(cart);
  showToast(`${product.name} masuk ke keranjang`);
}

function changeQuantity(productId, delta) {
  const cart = getCart();
  const item = cart.find(cartItem => Number(cartItem.product_id) === Number(productId));
  if (!item) return;
  item.quantity += delta;
  setCart(cart.filter(cartItem => Number(cartItem.quantity) > 0));
  renderCartPage();
}

function removeCartItem(productId) {
  setCart(getCart().filter(item => Number(item.product_id) !== Number(productId)));
  renderCartPage();
  showToast('Produk dihapus dari keranjang');
}

function cartTotal(cart) {
  return cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
}

function renderCartPage() {
  const cartContainer = document.getElementById('cartItems');
  const totalElement = document.getElementById('cartTotal');
  if (!cartContainer || !totalElement) return;
  const cart = getCart();
  if (!cart.length) {
    cartContainer.innerHTML = '<div class="empty-state">Keranjang masih kosong. Pilih produk terlebih dahulu.</div>';
    totalElement.textContent = rupiah(0);
    return;
  }
  cartContainer.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div>
        <strong>${safeText(item.name)}</strong>
        <p>${rupiah(item.price)} x ${item.quantity}</p>
        <div class="qty-control">
          <button type="button" data-action="qty-minus" data-id="${item.product_id}">−</button>
          <span>${item.quantity}</span>
          <button type="button" data-action="qty-plus" data-id="${item.product_id}">+</button>
        </div>
      </div>
      <div>
        <strong>${rupiah(Number(item.price) * Number(item.quantity))}</strong><br>
        <button class="btn btn-danger btn-small" type="button" data-action="remove-cart" data-id="${item.product_id}">Hapus</button>
      </div>
    </div>`).join('');
  totalElement.textContent = rupiah(cartTotal(cart));
}

function renderPaymentResult(result) {
  const paymentResult = document.getElementById('paymentResult');
  if (!paymentResult) return;

  const qrisImage = result?.payment?.qris_image_url || 'images/qris-chocolater.svg';
  const whatsappUrl = result?.whatsapp_url || '#';

  paymentResult.hidden = false;
  paymentResult.innerHTML = `
    <div class="payment-result-header">
      <span class="payment-success-icon" aria-hidden="true">
        <svg viewBox="0 0 64 64" class="color-icon" role="img"><circle cx="32" cy="32" r="26" fill="#22C55E"/><path d="M26.5 39.5 17.5 30.6 21.8 26.3 26.5 30.9 42.2 15.2 46.5 19.6 26.5 39.5Z" fill="#F0FDF4"/></svg>
      </span>
      <div>
        <h2>Pesanan berhasil dibuat</h2>
        <p>No Order: #${safeText(result.order_id)} • Total pembayaran: <strong>${rupiah(result.total)}</strong></p>
      </div>
    </div>
    <div class="qris-payment-box">
      <img src="${safeText(qrisImage)}" alt="QRIS ChocoLater Store" class="qris-img">
      <div>
        <h3>Scan QRIS untuk pembayaran</h3>
        <p>Setelah scan dan membayar, lanjutkan ke WhatsApp untuk mengirim bukti pembayaran dan konfirmasi pesanan.</p>
        <a class="btn btn-primary" href="${safeText(whatsappUrl)}">Lanjut Chat WhatsApp</a>
      </div>
    </div>`;

  paymentResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function handleCheckout(event) {
  event.preventDefault();
  const cart = getCart();
  if (!cart.length) return showToast('Keranjang masih kosong');
  const formData = new FormData(event.target);
  const paymentMethod = formData.get('payment_method') || 'whatsapp';
  const payload = {
    customer_name: formData.get('customer_name'),
    phone: formData.get('phone'),
    address: formData.get('address'),
    notes: formData.get('notes'),
    payment_method: paymentMethod,
    items: cart.map(item => ({ product_id: item.product_id, quantity: item.quantity }))
  };
  const button = event.target.querySelector('button[type="submit"]');
  try {
    button.disabled = true;
    button.textContent = 'Memproses...';
    const result = await requestJSON(`${API_BASE}/api/orders`, { method: 'POST', body: JSON.stringify(payload) });
    localStorage.removeItem(CART_KEY);
    updateCartBadge();
    renderCartPage();
    showToast('Pesanan berhasil dibuat');

    if (paymentMethod === 'qris') {
      renderPaymentResult(result);
      event.target.reset();
      fillCheckoutFromUser();
      return;
    }

    window.location.href = result.whatsapp_url;
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Buat Pesanan';
  }
}

async function handleContact(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target).entries());
  try {
    await requestJSON(`${API_BASE}/api/contact`, { method: 'POST', body: JSON.stringify(payload) });
    event.target.reset();
    showToast('Pesan berhasil dikirim');
  } catch (error) { showToast(error.message); }
}

async function handleLogin(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target).entries());
  try {
    const result = await requestJSON(`${API_BASE}/api/auth/login`, { method: 'POST', body: JSON.stringify(payload) });
    setAuth(result.token, result.user);
    showToast('Login berhasil');
    setTimeout(() => {
      window.location.href = result.user.role === 'admin' ? 'dashboard.html' : 'index.html';
    }, 500);
  } catch (error) { showToast(error.message); }
}

async function handleRegister(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target).entries());
  try {
    await requestJSON(`${API_BASE}/api/auth/register`, { method: 'POST', body: JSON.stringify(payload) });
    event.target.reset();
    showToast('Daftar berhasil, silakan login');
    setTimeout(() => window.location.href = 'login.html', 700);
  } catch (error) { showToast(error.message); }
}

function fillCheckoutFromUser() {
  const user = getUser();
  if (!user) return;
  const nameInput = document.querySelector('[name="customer_name"]');
  const phoneInput = document.querySelector('[name="phone"]');
  if (nameInput && !nameInput.value) nameInput.value = user.name || '';
  if (phoneInput && !phoneInput.value) phoneInput.value = user.phone || '';
}

function initEvents() {
  document.body.addEventListener('click', event => {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    const action = actionButton.dataset.action;
    const id = actionButton.dataset.id;
    if (action === 'add-cart') addToCart(id);
    if (action === 'qty-minus') changeQuantity(id, -1);
    if (action === 'qty-plus') changeQuantity(id, 1);
    if (action === 'remove-cart') removeCartItem(id);
  });
  document.getElementById('productSearch')?.addEventListener('input', () => renderProductsPage(productCache));
  document.getElementById('checkoutForm')?.addEventListener('submit', handleCheckout);
  document.getElementById('contactForm')?.addEventListener('submit', handleContact);
  document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
  document.getElementById('registerForm')?.addEventListener('submit', handleRegister);
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadHeader();
  initMenu();
  setActiveNav();
  refreshAuthNav();
  updateCartBadge();
  renderCartPage();
  fillCheckoutFromUser();
  initProducts();
  initEvents();
});
