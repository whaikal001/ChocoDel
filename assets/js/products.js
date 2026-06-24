/* ChocoDel — products page: list + wildcard search + add/edit/delete. */

let productModal;

const STOCK_CHIP = {
    ok:  '<span class="chip chip-ok"><span class="dot"></span>In stock</span>',
    low: '<span class="chip chip-low"><span class="dot"></span>Low stock</span>',
    out: '<span class="chip chip-out"><span class="dot"></span>Out of stock</span>',
};

async function loadProducts(q) {
    const tbody = document.getElementById('rows');
    tbody.innerHTML = loadingRow(6);

    let data;
    try {
        data = await api('products', 'list', { params: q === undefined ? {} : { q } });
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><i class="bi bi-plug"></i>
            <h3>Couldn't load products</h3><p>${esc(e.message)}</p></div></td></tr>`;
        return;
    }

    // Reflect the session-remembered last query.
    const hint = document.getElementById('lastQuery');
    hint.innerHTML = data.last_query
        ? `Last search remembered: <b>“${esc(data.last_query)}”</b>`
        : '';
    document.getElementById('resultCount').textContent =
        data.count === 1 ? '1 product' : `${data.count} products`;

    if (!data.products.length) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty">
            <i class="bi bi-search"></i><h3>Nothing matched</h3>
            <p>Try a different word, or clear the search.</p></div></td></tr>`;
        return;
    }

    tbody.innerHTML = data.products.map((p) => `
        <tr>
            <td>
                <div class="cell-title">${esc(p.name)}</div>
                <div class="cell-sub">${esc(p.sku)}${p.description ? ' · ' + esc(p.description) : ''}</div>
            </td>
            <td><span class="chip chip-cat">${esc(p.category)}</span></td>
            <td class="num money">${money(p.price)}</td>
            <td class="num"><span class="cell-title">${p.stock_qty}</span>
                <span class="cell-sub">/ reorder ${p.reorder_level}</span></td>
            <td>${STOCK_CHIP[p.stock_status]}</td>
            <td class="text-end">
                <button class="btn btn-ghost btn-sm" data-edit="${p.id}"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-link-quiet btn-sm" data-del="${p.id}" data-name="${esc(p.name)}"><i class="bi bi-trash3"></i></button>
            </td>
        </tr>`).join('');

    tbody.querySelectorAll('[data-edit]').forEach((b) =>
        b.onclick = () => openEdit(b.dataset.edit));
    tbody.querySelectorAll('[data-del]').forEach((b) =>
        b.onclick = () => removeProduct(b.dataset.del, b.dataset.name));
}

/* ---- add / edit ---- */
function openAdd() {
    document.getElementById('productForm').reset();
    document.getElementById('p_id').value = '';
    document.getElementById('modalTitle').textContent = 'New product';
    document.getElementById('p_reorder').value = 10;
    productModal.show();
}

async function openEdit(id) {
    try {
        const { product } = await api('products', 'get', { params: { id } });
        document.getElementById('p_id').value = product.id;
        document.getElementById('p_name').value = product.name;
        document.getElementById('p_sku').value = product.sku;
        document.getElementById('p_category').value = product.category;
        document.getElementById('p_price').value = product.price;
        document.getElementById('p_stock').value = product.stock_qty;
        document.getElementById('p_reorder').value = product.reorder_level;
        document.getElementById('p_desc').value = product.description || '';
        document.getElementById('modalTitle').textContent = 'Edit ' + product.name;
        productModal.show();
    } catch (e) { showFlash('danger', e.message); }
}

async function saveProduct(ev) {
    ev.preventDefault();
    const id = document.getElementById('p_id').value;
    const payload = {
        sku: document.getElementById('p_sku').value.trim(),
        name: document.getElementById('p_name').value.trim(),
        category: document.getElementById('p_category').value.trim() || 'Spread',
        price: parseFloat(document.getElementById('p_price').value) || 0,
        stock_qty: parseInt(document.getElementById('p_stock').value) || 0,
        reorder_level: parseInt(document.getElementById('p_reorder').value) || 0,
        description: document.getElementById('p_desc').value.trim(),
    };
    const btn = document.getElementById('saveBtn');
    btn.disabled = true;
    try {
        if (id) {
            await api('products', 'update', { body: { id: Number(id), ...payload } });
            showFlash('success', 'Saved your changes.');
        } else {
            await api('products', 'create', { body: payload });
            showFlash('success', `“${payload.name}” added.`);
        }
        productModal.hide();
        loadProducts(document.getElementById('search').value.trim() || undefined);
    } catch (e) {
        showFlash('danger', e.message);
    } finally {
        btn.disabled = false;
    }
}

async function removeProduct(id, name) {
    if (!confirm(`Remove “${name}” from the catalogue?`)) return;
    try {
        await api('products', 'delete', { body: { id: Number(id) } });
        showFlash('info', `“${name}” removed.`);
        loadProducts(document.getElementById('search').value.trim() || undefined);
    } catch (e) {
        showFlash('warning', e.message);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    productModal = new bootstrap.Modal(document.getElementById('productModal'));
    document.getElementById('addBtn').onclick = openAdd;
    document.getElementById('productForm').onsubmit = saveProduct;

    const search = document.getElementById('search');
    search.oninput = debounce(() => loadProducts(search.value.trim()), 280);

    loadProducts(); // first load shows everything + remembered query hint
});
