/* =========================================================================
   ChocoDel — shared front-end layer.
   JavaScript is the primary application language here: it talks to the PHP
   JSON API, builds the page chrome, renders flash messages and carries the
   little formatting helpers every page needs.
   ========================================================================= */

const API = 'api';

/* ---- API wrapper ------------------------------------------------------ */
/**
 * Call a PHP endpoint. GET by default; pass a body object to POST JSON.
 * Always returns the parsed payload, or throws with the server's message.
 */
async function api(endpoint, action, { method = 'GET', body = null, params = {} } = {}) {
    const qs = new URLSearchParams({ action, ...params }).toString();
    const opts = { method, headers: {} };
    if (body) {
        opts.method = 'POST';
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(`${API}/${endpoint}.php?${qs}`, opts);
    let data;
    try {
        data = await res.json();
    } catch (e) {
        throw new Error('The server sent something we could not read. Is PHP running?');
    }
    if (!res.ok || data.ok === false) {
        throw new Error(data.error || `Request failed (${res.status}).`);
    }
    return data;
}

/* ---- formatting helpers ---------------------------------------------- */
const money = (n) => 'RM' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function prettyDate(s) {
    if (!s) return '';
    const d = new Date(s.replace(' ', 'T'));
    if (isNaN(d)) return s;
    return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Escape user-supplied text before dropping it into innerHTML. */
function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

/* ---- flash messages --------------------------------------------------- */
const FLASH_ICONS = { success: 'check-circle', warning: 'exclamation-triangle', danger: 'x-octagon', info: 'info-circle' };

function flashStack() {
    let el = document.querySelector('.flash-stack');
    if (!el) {
        el = document.createElement('div');
        el.className = 'flash-stack';
        document.body.appendChild(el);
    }
    return el;
}

/** Show a flash toast. type = success | warning | danger | info. */
function showFlash(type, text, timeout = 4500) {
    const node = document.createElement('div');
    node.className = `flash ${type}`;
    node.innerHTML = `
        <i class="bi bi-${FLASH_ICONS[type] || 'info-circle'}"></i>
        <div class="flash-text">${esc(text)}</div>
        <button class="flash-x" aria-label="Dismiss">&times;</button>`;
    node.querySelector('.flash-x').onclick = () => node.remove();
    flashStack().appendChild(node);
    if (timeout) setTimeout(() => node.remove(), timeout);
}

/** Drain any flash messages the server queued in the PHP session. */
async function drainServerFlash() {
    try {
        const { flash } = await api('flash', 'all');
        (flash || []).forEach((m) => showFlash(m.type, m.text));
    } catch (_) { /* no server / not fatal */ }
}

/* ---- top navigation --------------------------------------------------- */
const NAV = [
    { href: 'index.html',     label: 'Dashboard',  icon: 'speedometer2' },
    { href: 'products.html',  label: 'Products',   icon: 'box-seam' },
    { href: 'pos.html',       label: 'New Order',  icon: 'bag-plus' },
    { href: 'orders.html',    label: 'Orders',     icon: 'receipt' },
    { href: 'customers.html', label: 'Customers',  icon: 'people' },
    { href: 'insights.html',  label: 'Insights',   icon: 'lightbulb' },
];

/** Render the shared top bar into <div id="topbar"></div>. */
function mountTopbar(active) {
    const links = NAV.map((n) => `
        <li class="nav-item">
            <a class="nav-link ${n.href === active ? 'active' : ''}" href="${n.href}">
                <i class="bi bi-${n.icon} me-1"></i>${n.label}
            </a>
        </li>`).join('');

    const host = document.getElementById('topbar');
    if (!host) return;
    host.innerHTML = `
    <nav class="topbar navbar navbar-expand-lg sticky-top">
      <div class="container">
        <a class="wordmark navbar-brand" href="index.html">
          <span class="wordmark__bar"><i class="bi bi-grid-3x3-gap-fill"></i></span>
          <span><span class="choco">Choco</span><span class="del">Del</span></span>
        </a>
        <button class="navbar-toggler border-0 text-white" type="button"
                data-bs-toggle="collapse" data-bs-target="#nav">
          <i class="bi bi-list fs-3"></i>
        </button>
        <div class="collapse navbar-collapse" id="nav">
          <ul class="navbar-nav mx-auto gap-lg-1">${links}</ul>
          <a class="cart-pill" href="pos.html">
            <i class="bi bi-basket2"></i>
            <span>Cart</span>
            <span class="cart-count" id="navCartCount">0</span>
          </a>
        </div>
      </div>
    </nav>`;

    refreshCartCount();
}

/** Keep the little cart badge in the nav in sync with the session cart. */
async function refreshCartCount() {
    const badge = document.getElementById('navCartCount');
    if (!badge) return;
    try {
        const { cart } = await api('cart', 'get');
        badge.textContent = cart.count;
        badge.style.visibility = cart.count > 0 ? 'visible' : 'hidden';
    } catch (_) { /* ignore */ }
}

/* ---- small DOM helpers ------------------------------------------------ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function loadingRow(cols, msg = 'Loading…') {
    return `<tr><td colspan="${cols}" class="text-center text-muted-warm py-4">
        <span class="spinner-choco me-2"></span>${esc(msg)}</td></tr>`;
}

function debounce(fn, wait = 280) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

/* Boot the page chrome on every page. */
document.addEventListener('DOMContentLoaded', () => {
    const active = document.body.dataset.page || '';
    mountTopbar(active);
    drainServerFlash();
});
