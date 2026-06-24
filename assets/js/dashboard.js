/* ChocoDel — dashboard page. Pulls one summary payload and draws it. */

const CHOCO = {
    cocoa: '#4d3122', caramel: '#c4863c', toffee: '#e7c08b',
    olive: '#5d7c3f', clay: '#a8412f', slate: '#4a6b7c', wheat: '#cdab74',
};
const PIE_COLOURS = [CHOCO.caramel, CHOCO.cocoa, CHOCO.olive, CHOCO.slate, CHOCO.clay, CHOCO.wheat];

function greet() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function kpiTile({ label, value, sub, cls = '', icon }) {
    return `<div class="col-6 col-lg-3">
        <div class="stat ${cls}">
            <div class="stat-label">${esc(label)}</div>
            <div class="stat-value money">${value}</div>
            <div class="stat-sub">${icon ? `<i class="bi bi-${icon} me-1"></i>` : ''}${sub}</div>
        </div>
    </div>`;
}

async function loadDashboard() {
    let d;
    try {
        d = await api('dashboard', 'summary');
    } catch (e) {
        document.getElementById('kpiRow').innerHTML =
            `<div class="col-12"><div class="empty"><i class="bi bi-plug"></i>
             <h3>Can't reach the kitchen</h3><p>${esc(e.message)}</p></div></div>`;
        return;
    }

    (d.flash || []).forEach((m) => showFlash(m.type, m.text));
    document.getElementById('greeting').textContent = `${greet()}, ChocoDel`;

    /* ---- KPI tiles ---- */
    const k = d.kpi;
    const alerts = k.out_count + k.low_count;
    document.getElementById('kpiRow').innerHTML = [
        kpiTile({ label: 'Paid revenue', value: money(k.paid_revenue), cls: 'is-money',
                  sub: plural(k.order_count, 'order') + ' all-time', icon: 'cash-stack' }),
        kpiTile({ label: 'Money owed', value: money(k.unpaid_value),
                  cls: k.unpaid_count ? 'is-alert' : '',
                  sub: k.unpaid_count ? `${plural(k.unpaid_count, 'unpaid order')}` : 'all settled',
                  icon: k.unpaid_count ? 'hourglass-split' : 'check2' }),
        kpiTile({ label: 'Customers', value: k.customer_count,
                  sub: 'on the books', icon: 'people' }),
        kpiTile({ label: 'Stock alerts', value: alerts,
                  cls: alerts ? 'is-alert' : '',
                  sub: `${k.out_count} out · ${k.low_count} low`, icon: 'box-seam' }),
    ].join('');

    drawSales(d.sales);
    drawCategories(d.categories);
    drawTopSellers(d.top_sellers);
    drawAttention(d.kpi);
}

function drawSales(sales) {
    const ctx = document.getElementById('salesChart');
    const grad = ctx.getContext('2d').createLinearGradient(0, 0, 0, 240);
    grad.addColorStop(0, 'rgba(196,134,60,.35)');
    grad.addColorStop(1, 'rgba(196,134,60,0)');

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: sales.labels,
            datasets: [{
                label: 'Revenue (RM)', data: sales.values,
                borderColor: CHOCO.cocoa, backgroundColor: grad,
                borderWidth: 2.5, fill: true, tension: .35,
                pointBackgroundColor: CHOCO.caramel, pointBorderColor: '#fff',
                pointRadius: 4, pointHoverRadius: 6,
            }],
        },
        options: {
            responsive: true, maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (c) => '  ' + money(c.parsed.y) } },
            },
            scales: {
                y: { beginAtZero: true, grid: { color: '#efe3cf' },
                     ticks: { callback: (v) => 'RM' + v, color: '#846a57' } },
                x: { grid: { display: false }, ticks: { color: '#846a57' } },
            },
        },
    });
}

function drawCategories(cats) {
    const ctx = document.getElementById('categoryChart');
    if (!cats.length) {
        ctx.parentElement.innerHTML = `<div class="empty py-3"><i class="bi bi-pie-chart"></i>
            <p class="mb-0">No paid sales yet.</p></div>`;
        return;
    }
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: cats.map((c) => c.label),
            datasets: [{ data: cats.map((c) => c.value), backgroundColor: PIE_COLOURS,
                         borderColor: '#fffdf8', borderWidth: 3, hoverOffset: 6 }],
        },
        options: {
            cutout: '62%',
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (c) => ' ' + c.label + ': ' + money(c.parsed) } },
            },
        },
    });

    const total = cats.reduce((s, c) => s + c.value, 0) || 1;
    document.getElementById('categoryLegend').innerHTML = cats.map((c, i) => `
        <div class="d-flex align-items-center justify-content-between py-1">
            <span><span class="d-inline-block rounded-circle me-2" style="width:.7rem;height:.7rem;background:${PIE_COLOURS[i % PIE_COLOURS.length]}"></span>${esc(c.label)}</span>
            <span class="text-muted-warm money">${Math.round(c.value / total * 100)}%</span>
        </div>`).join('');
}

function drawTopSellers(rows) {
    const t = document.getElementById('topSellers');
    if (!rows.length) {
        t.innerHTML = `<tr><td class="text-muted-warm py-3">No sales recorded yet.</td></tr>`;
        return;
    }
    t.innerHTML = `<thead><tr><th>Product</th><th class="num">Units</th><th class="num">Revenue</th></tr></thead>
        <tbody>${rows.map((r, i) => `
            <tr>
                <td><span class="cell-title">${i + 1}. ${esc(r.name)}</span></td>
                <td class="num">${r.units}</td>
                <td class="num money">${money(r.revenue)}</td>
            </tr>`).join('')}</tbody>`;
}

function drawAttention(k) {
    const items = [];
    if (k.unpaid_count) {
        items.push(`<a href="orders.html?filter=unpaid" class="text-decoration-none">
            <div class="d-flex gap-2 align-items-start py-2">
              <i class="bi bi-hourglass-split text-warning fs-5"></i>
              <div><div class="cell-title">${plural(k.unpaid_count, 'order')} still unpaid</div>
              <div class="cell-sub">${money(k.unpaid_value)} waiting to be collected — chase it up.</div></div>
            </div></a>`);
    }
    if (k.out_count) {
        items.push(`<a href="products.html" class="text-decoration-none">
            <div class="d-flex gap-2 align-items-start py-2">
              <i class="bi bi-x-octagon fs-5" style="color:var(--out)"></i>
              <div><div class="cell-title">${plural(k.out_count, 'product')} out of stock</div>
              <div class="cell-sub">Customers can't buy what isn't on the shelf.</div></div>
            </div></a>`);
    }
    if (k.low_count) {
        items.push(`<a href="insights.html" class="text-decoration-none">
            <div class="d-flex gap-2 align-items-start py-2">
              <i class="bi bi-exclamation-triangle fs-5" style="color:var(--low)"></i>
              <div><div class="cell-title">${plural(k.low_count, 'product')} running low</div>
              <div class="cell-sub">See the insights page for reorder suggestions.</div></div>
            </div></a>`);
    }
    const box = document.getElementById('attentionBox');
    box.innerHTML = items.length
        ? items.join('<hr class="my-1" style="border-color:var(--line)">')
        : `<div class="empty py-3"><i class="bi bi-emoji-smile"></i>
           <h3 class="h6 mt-2">Nothing on fire</h3>
           <p class="mb-0">Stock's healthy and everyone's paid up. Go make some chocolate.</p></div>`;
}

document.addEventListener('DOMContentLoaded', loadDashboard);
