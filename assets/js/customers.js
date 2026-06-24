/* ChocoDel — customers page: list + search + add/edit/delete. */

let customerModal;

async function loadCustomers(q) {
    const tbody = document.getElementById('rows');
    tbody.innerHTML = loadingRow(6);

    let data;
    try {
        data = await api('customers', 'list', { params: q === undefined ? {} : { q } });
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><i class="bi bi-plug"></i>
            <h3>Couldn't load customers</h3><p>${esc(e.message)}</p></div></td></tr>`;
        return;
    }

    document.getElementById('lastQuery').innerHTML = data.last_query
        ? `Last search: <b>“${esc(data.last_query)}”</b>` : '';
    document.getElementById('resultCount').textContent =
        data.count === 1 ? '1 customer' : `${data.count} customers`;

    if (!data.customers.length) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><i class="bi bi-people"></i>
            <h3>No one here yet</h3><p>Add your first customer to get started.</p></div></td></tr>`;
        return;
    }

    tbody.innerHTML = data.customers.map((c) => `
        <tr>
            <td><div class="cell-title">${esc(c.name)}</div>
                ${c.order_count >= 3 ? '<span class="chip chip-cat"><i class="bi bi-star-fill me-1"></i>Regular</span>' : ''}</td>
            <td><div>${esc(c.email || '—')}</div><div class="cell-sub">${esc(c.phone || '')}</div></td>
            <td class="cell-sub" style="max-width:22ch">${esc(c.address || '—')}</td>
            <td class="num">${c.order_count}</td>
            <td class="num money fw-bold">${money(c.lifetime_spend)}</td>
            <td class="text-end">
                <button class="btn btn-ghost btn-sm" data-edit="${c.id}"><i class="bi bi-pencil"></i></button>
                <button class="btn btn-link-quiet btn-sm" data-del="${c.id}" data-name="${esc(c.name)}"><i class="bi bi-trash3"></i></button>
            </td>
        </tr>`).join('');

    tbody.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openEdit(b.dataset.edit));
    tbody.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => removeCustomer(b.dataset.del, b.dataset.name));
}

function openAdd() {
    document.getElementById('customerForm').reset();
    document.getElementById('c_id').value = '';
    document.getElementById('modalTitle').textContent = 'New customer';
    customerModal.show();
}

async function openEdit(id) {
    try {
        const { customer } = await api('customers', 'get', { params: { id } });
        document.getElementById('c_id').value = customer.id;
        document.getElementById('c_name').value = customer.name;
        document.getElementById('c_email').value = customer.email || '';
        document.getElementById('c_phone').value = customer.phone || '';
        document.getElementById('c_address').value = customer.address || '';
        document.getElementById('modalTitle').textContent = 'Edit ' + customer.name;
        customerModal.show();
    } catch (e) { showFlash('danger', e.message); }
}

async function saveCustomer(ev) {
    ev.preventDefault();
    const id = document.getElementById('c_id').value;
    const payload = {
        name: document.getElementById('c_name').value.trim(),
        email: document.getElementById('c_email').value.trim(),
        phone: document.getElementById('c_phone').value.trim(),
        address: document.getElementById('c_address').value.trim(),
    };
    const btn = document.getElementById('saveBtn');
    btn.disabled = true;
    try {
        if (id) {
            await api('customers', 'update', { body: { id: Number(id), ...payload } });
            showFlash('success', 'Customer updated.');
        } else {
            await api('customers', 'create', { body: payload });
            showFlash('success', `${payload.name} added.`);
        }
        customerModal.hide();
        loadCustomers(document.getElementById('search').value.trim() || undefined);
    } catch (e) {
        showFlash('danger', e.message);
    } finally {
        btn.disabled = false;
    }
}

async function removeCustomer(id, name) {
    if (!confirm(`Remove ${name}?`)) return;
    try {
        await api('customers', 'delete', { body: { id: Number(id) } });
        showFlash('info', `${name} removed.`);
        loadCustomers(document.getElementById('search').value.trim() || undefined);
    } catch (e) {
        showFlash('warning', e.message);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    customerModal = new bootstrap.Modal(document.getElementById('customerModal'));
    document.getElementById('addBtn').onclick = openAdd;
    document.getElementById('customerForm').onsubmit = saveCustomer;

    const search = document.getElementById('search');
    search.oninput = debounce(() => loadCustomers(search.value.trim()), 280);

    loadCustomers();
});
