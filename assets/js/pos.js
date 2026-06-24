/* ChocoDel — New Order (POS). Session cart + live totals + checkout. */

const DISCOUNT_THRESHOLD = 500;   // mirrors the PHP rule, for the preview hint only
let allProducts = [];

/* ---- product shelf ---- */
async function loadShelf(q) {
    const picker = document.getElementById('picker');
    try {
        const data = await api('products', 'list', { params: q ? { q } : {} });
        allProducts = data.products;
    } catch (e) {
        picker.innerHTML = `<div class="col-12"><div class="empty"><i class="bi bi-plug"></i>
            <h3>Couldn't load products</h3><p>${esc(e.message)}</p></div></div>`;
        return;
    }
    renderShelf();
}

function renderShelf() {
    const picker = document.getElementById('picker');
    if (!allProducts.length) {
        picker.innerHTML = `<div class="col-12"><div class="empty"><i class="bi bi-search"></i>
            <h3>Nothing matched</h3></div></div>`;
        return;
    }
    picker.innerHTML = allProducts.map((p) => {
        const out = p.stock_status === 'out';
        return `<div class="col-sm-6 col-xl-4">
            <div class="pick-card">
                <span class="chip chip-cat pick-cat">${esc(p.category)}</span>
                <div class="pick-name">${esc(p.name)}</div>
                <div class="cell-sub mb-1">${esc(p.sku)}</div>
                <div class="pick-price">${money(p.price)}</div>
                <div class="pick-foot">
                    <span class="chip chip-${p.stock_status}"><span class="dot"></span>${p.stock_qty} left</span>
                    <button class="btn btn-caramel btn-sm" data-add="${p.id}" ${out ? 'disabled' : ''}>
                        ${out ? 'Sold out' : '<i class="bi bi-plus-lg"></i> Add'}
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');

    picker.querySelectorAll('[data-add]').forEach((b) =>
        b.onclick = () => addToCart(b.dataset.add, b));
}

async function addToCart(id, btn) {
    btn.disabled = true;
    try {
        const { cart } = await api('cart', 'add', { body: { product_id: Number(id), quantity: 1 } });
        renderCart(cart);
        refreshCartCount();
    } catch (e) {
        showFlash('warning', e.message);
    } finally {
        btn.disabled = false;
    }
}

/* ---- basket ---- */
async function loadCart() {
    const { cart } = await api('cart', 'get');
    renderCart(cart);
}

function renderCart(cart) {
    const box = document.getElementById('cartItems');
    const checkoutBtn = document.getElementById('checkoutBtn');

    if (!cart.items.length) {
        box.innerHTML = `<div class="empty py-4"><i class="bi bi-basket2"></i>
            <h3 class="h6 mt-2">Basket's empty</h3>
            <p class="mb-0 small">Add a jar or two from the shelf.</p></div>`;
        document.getElementById('cartSummary').innerHTML = '';
        document.getElementById('cartWarnings').innerHTML = '';
        checkoutBtn.disabled = true;
        return;
    }

    box.innerHTML = cart.items.map((it) => `
        <div class="d-flex align-items-center gap-2 py-2" style="border-bottom:1px solid var(--line)">
            <div class="flex-fill">
                <div class="cell-title" style="font-size:.95rem">${esc(it.name)}</div>
                <div class="cell-sub">${money(it.unit_price)} each</div>
            </div>
            <div class="qty-stepper">
                <button data-dec="${it.product_id}">−</button>
                <input value="${it.quantity}" data-qty="${it.product_id}" inputmode="numeric">
                <button data-inc="${it.product_id}">+</button>
            </div>
            <div class="money fw-bold ms-2" style="min-width:5rem;text-align:right">${money(it.line_total)}</div>
            <button class="btn btn-link-quiet btn-sm" data-rm="${it.product_id}"><i class="bi bi-x-lg"></i></button>
        </div>`).join('');

    // warnings (stock exceeded)
    document.getElementById('cartWarnings').innerHTML = (cart.warnings || []).map((w) =>
        `<div class="discount-hint mt-2" style="background:var(--out-bg);color:var(--out)">
            <i class="bi bi-exclamation-triangle me-1"></i>${esc(w)}</div>`).join('');

    // money summary
    const toThreshold = DISCOUNT_THRESHOLD - cart.subtotal;
    const summary = document.getElementById('cartSummary');
    summary.innerHTML = `
        <div class="summary-line"><span>Subtotal</span><span class="money">${money(cart.subtotal)}</span></div>
        ${cart.discount > 0
            ? `<div class="summary-line discount"><span>Bulk discount (5%)</span><span class="money">− ${money(cart.discount)}</span></div>`
            : `<div class="discount-hint mt-1 mb-2"><i class="bi bi-gift me-1"></i>Spend ${money(toThreshold)} more to unlock a 5% bulk discount.</div>`}
        <div class="summary-line"><span>SST (6%)</span><span class="money">${money(cart.tax)}</span></div>
        <div class="summary-line total"><span>Total</span><span class="money">${money(cart.total)}</span></div>`;

    checkoutBtn.disabled = false;

    // wire the steppers
    box.querySelectorAll('[data-inc]').forEach((b) => b.onclick = () => bump(b.dataset.inc, +1));
    box.querySelectorAll('[data-dec]').forEach((b) => b.onclick = () => bump(b.dataset.dec, -1));
    box.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => setQty(b.dataset.rm, 0));
    box.querySelectorAll('[data-qty]').forEach((inp) => {
        inp.onchange = () => setQty(inp.dataset.qty, parseInt(inp.value) || 0);
    });
}

function currentQty(id) {
    const inp = document.querySelector(`[data-qty="${id}"]`);
    return inp ? parseInt(inp.value) || 0 : 0;
}
async function bump(id, delta) { await setQty(id, currentQty(id) + delta); }

async function setQty(id, qty) {
    try {
        const { cart } = await api('cart', 'setqty', { body: { product_id: Number(id), quantity: qty } });
        renderCart(cart);
        refreshCartCount();
    } catch (e) { showFlash('danger', e.message); }
}

async function clearCart() {
    if (!confirm('Empty the basket?')) return;
    const { cart } = await api('cart', 'clear');
    renderCart(cart);
    refreshCartCount();
}

/* ---- customers + checkout ---- */
async function loadCustomers() {
    try {
        const { customers } = await api('customers', 'list');
        const sel = document.getElementById('customerSelect');
        sel.insertAdjacentHTML('beforeend',
            customers.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join(''));
    } catch (_) { /* ignore */ }
}

async function checkout() {
    const customerId = document.getElementById('customerSelect').value;
    if (!customerId) {
        showFlash('warning', 'Pick a customer before placing the order.');
        document.getElementById('customerSelect').focus();
        return;
    }
    const btn = document.getElementById('checkoutBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-choco me-2"></span>Placing…';
    try {
        const res = await api('cart', 'checkout', {
            body: {
                customer_id: Number(customerId),
                status: document.querySelector('input[name="pay"]:checked').value,
                note: document.getElementById('orderNote').value.trim(),
            },
        });
        // the server queued a flash; go look at the order
        window.location.href = `orders.html?open=${res.order_id}`;
    } catch (e) {
        showFlash('danger', e.message);
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-bag-check me-1"></i>Place order';
        loadCart(); // refresh in case stock changed
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadShelf();
    loadCart();
    loadCustomers();

    const ps = document.getElementById('pickSearch');
    ps.oninput = debounce(() => loadShelf(ps.value.trim()), 250);
    document.getElementById('clearCart').onclick = clearCart;
    document.getElementById('checkoutBtn').onclick = checkout;
});
