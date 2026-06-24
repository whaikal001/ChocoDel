/* ChocoDel — orders page: list, filter, detail, mark-paid, void. */

let orderModal;
let currentFilter = 'all';
let allOrders = [];

async function loadOrders(q) {
    const tbody = document.getElementById('rows');
    tbody.innerHTML = loadingRow(7);

    let data;
    try {
        data = await api('orders', 'list', { params: q === undefined ? {} : { q } });
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><i class="bi bi-plug"></i>
            <h3>Couldn't load orders</h3><p>${esc(e.message)}</p></div></td></tr>`;
        return;
    }
    allOrders = data.orders;

    // Unpaid banner — the conditional "money owed" warning.
    const banner = document.getElementById('unpaidBanner');
    banner.innerHTML = data.unpaid_count
        ? `<div class="flash warning mb-3" style="position:static;max-width:none;box-shadow:none">
             <i class="bi bi-exclamation-triangle"></i>
             <div class="flash-text"><b>${plural(data.unpaid_count, 'order')}</b> still unpaid —
             ${money(data.unpaid_value)} waiting to be collected.</div></div>`
        : '';

    document.getElementById('lastQuery').innerHTML = data.last_query
        ? `Last search: <b>“${esc(data.last_query)}”</b>` : '';

    renderRows();
}

function renderRows() {
    const tbody = document.getElementById('rows');
    const rows = allOrders.filter((o) => currentFilter === 'all' || o.status === currentFilter);

    document.getElementById('resultCount').textContent =
        rows.length === 1 ? '1 order' : `${rows.length} orders`;

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="7"><div class="empty"><i class="bi bi-receipt"></i>
            <h3>No orders here</h3><p>Take one from the New Order page.</p></div></td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map((o) => `
        <tr>
            <td><span class="cell-title">#${o.id}</span></td>
            <td>${esc(o.customer_name)}${o.note ? `<div class="cell-sub">${esc(o.note)}</div>` : ''}</td>
            <td>${prettyDate(o.order_date)}</td>
            <td class="num">${o.item_count}</td>
            <td class="num money fw-bold">${money(o.total)}</td>
            <td>${o.status === 'paid'
                ? '<span class="chip chip-paid"><span class="dot"></span>Paid</span>'
                : '<span class="chip chip-unpaid"><span class="dot"></span>Unpaid</span>'}</td>
            <td class="text-end">
                <button class="btn btn-ghost btn-sm" data-view="${o.id}">View</button>
                ${o.status === 'unpaid'
                    ? `<button class="btn btn-caramel btn-sm" data-paid="${o.id}">Mark paid</button>` : ''}
            </td>
        </tr>`).join('');

    tbody.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => viewOrder(b.dataset.view));
    tbody.querySelectorAll('[data-paid]').forEach((b) => b.onclick = () => markPaid(b.dataset.paid));
}

async function viewOrder(id) {
    document.getElementById('orderTitle').textContent = `Order #${id}`;
    document.getElementById('orderBody').innerHTML =
        `<div class="text-center py-4"><span class="spinner-choco"></span></div>`;
    orderModal.show();

    let data;
    try {
        data = await api('orders', 'get', { params: { id } });
    } catch (e) {
        document.getElementById('orderBody').innerHTML = `<p class="text-danger">${esc(e.message)}</p>`;
        return;
    }
    const o = data.order;
    const lines = data.items.map((it) => `
        <tr>
            <td><span class="cell-title">${esc(it.product_name)}</span></td>
            <td class="num">${money(it.unit_price)}</td>
            <td class="num">${it.quantity}</td>
            <td class="num money">${money(it.line_total)}</td>
        </tr>`).join('');

    document.getElementById('orderBody').innerHTML = `
        <div class="row g-3 mb-3">
            <div class="col-sm-7">
                <div class="eyebrow">Customer</div>
                <div class="cell-title">${esc(o.customer_name)}</div>
                <div class="cell-sub">${esc(o.email || '')} ${o.phone ? '· ' + esc(o.phone) : ''}</div>
                <div class="cell-sub">${esc(o.address || '')}</div>
            </div>
            <div class="col-sm-5 text-sm-end">
                <div class="eyebrow">Placed</div>
                <div class="cell-title">${prettyDate(o.order_date)}</div>
                <div class="mt-1">${o.status === 'paid'
                    ? '<span class="chip chip-paid"><span class="dot"></span>Paid</span>'
                    : '<span class="chip chip-unpaid"><span class="dot"></span>Unpaid</span>'}</div>
            </div>
        </div>
        ${o.note ? `<div class="discount-hint mb-3"><i class="bi bi-sticky me-1"></i>${esc(o.note)}</div>` : ''}
        <table class="table-choco mb-3">
            <thead><tr><th>Item</th><th class="num">Unit</th><th class="num">Qty</th><th class="num">Total</th></tr></thead>
            <tbody>${lines}</tbody>
        </table>
        <div class="row justify-content-end">
            <div class="col-sm-7">
                <div class="summary-line"><span>Subtotal</span><span class="money">${money(o.subtotal)}</span></div>
                ${o.discount > 0 ? `<div class="summary-line discount"><span>Discount</span><span class="money">− ${money(o.discount)}</span></div>` : ''}
                <div class="summary-line"><span>SST (6%)</span><span class="money">${money(o.tax)}</span></div>
                <div class="summary-line total"><span>Total</span><span class="money">${money(o.total)}</span></div>
            </div>
        </div>
        <div class="d-flex gap-2 justify-content-end mt-3">
            <button class="btn btn-link-quiet btn-sm" id="voidBtn" data-id="${o.id}"><i class="bi bi-trash3 me-1"></i>Void order</button>
            ${o.status === 'unpaid'
                ? `<button class="btn btn-caramel btn-sm" id="paidBtn" data-id="${o.id}"><i class="bi bi-cash-coin me-1"></i>Mark as paid</button>` : ''}
        </div>`;

    const paidBtn = document.getElementById('paidBtn');
    if (paidBtn) paidBtn.onclick = () => markPaid(o.id, true);
    document.getElementById('voidBtn').onclick = () => voidOrder(o.id);
}

async function markPaid(id, fromModal = false) {
    try {
        await api('orders', 'markpaid', { body: { id: Number(id) } });
        showFlash('success', `Order #${id} marked as paid.`);
        if (fromModal) orderModal.hide();
        loadOrders(currentSearch());
    } catch (e) { showFlash('warning', e.message); }
}

async function voidOrder(id) {
    if (!confirm(`Void order #${id}? The stock will be returned to the shelf.`)) return;
    try {
        await api('orders', 'delete', { body: { id: Number(id) } });
        showFlash('info', `Order #${id} voided.`);
        orderModal.hide();
        loadOrders(currentSearch());
    } catch (e) { showFlash('danger', e.message); }
}

const currentSearch = () => document.getElementById('search').value.trim() || undefined;

document.addEventListener('DOMContentLoaded', () => {
    orderModal = new bootstrap.Modal(document.getElementById('orderModal'));

    const search = document.getElementById('search');
    search.oninput = debounce(() => loadOrders(search.value.trim()), 280);

    document.querySelectorAll('.filter-btn').forEach((b) => b.onclick = () => {
        document.querySelectorAll('.filter-btn').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        currentFilter = b.dataset.filter;
        renderRows();
    });

    // honour ?filter=unpaid (from dashboard) and ?open=ID (after checkout)
    const params = new URLSearchParams(location.search);
    if (params.get('filter') === 'unpaid') {
        currentFilter = 'unpaid';
        document.querySelectorAll('.filter-btn').forEach((x) =>
            x.classList.toggle('active', x.dataset.filter === 'unpaid'));
    }

    loadOrders().then(() => {
        const open = params.get('open');
        if (open) viewOrder(open);
    });
});
