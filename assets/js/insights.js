/* ChocoDel — insights page: renders the rule-based restock recommendations. */

let recommendations = [];
let level = 'all';

const LEVEL_META = {
    urgent: { label: 'Reorder now', icon: 'fire' },
    soon:   { label: 'Below reorder level', icon: 'arrow-down-circle' },
    watch:  { label: 'Keep an eye', icon: 'eye' },
    slow:   { label: 'Slow mover', icon: 'snow' },
    ok:     { label: 'Healthy', icon: 'check-circle' },
};

async function loadInsights() {
    let data;
    try {
        data = await api('insights', 'restock');
    } catch (e) {
        document.getElementById('cards').innerHTML =
            `<div class="col-12"><div class="empty"><i class="bi bi-plug"></i>
             <h3>Couldn't run the assistant</h3><p>${esc(e.message)}</p></div></div>`;
        return;
    }

    recommendations = data.recommendations;
    document.getElementById('lookback').textContent = data.lookback_days;

    // headline summary
    const c = data.counts;
    document.getElementById('summaryBar').innerHTML = `
        <div class="card-choco mb-4">
          <div class="card-body-p d-flex flex-wrap align-items-center gap-3">
            <div class="flex-fill">
              <div class="eyebrow"><i class="bi bi-robot me-1"></i>Assistant's read</div>
              <div class="cell-title" style="font-size:1.05rem">${esc(data.summary)}</div>
            </div>
            <div class="d-flex gap-2 flex-wrap">
              ${c.urgent ? `<span class="chip chip-out"><span class="dot"></span>${c.urgent} now</span>` : ''}
              ${c.soon ? `<span class="chip chip-low"><span class="dot"></span>${c.soon} soon</span>` : ''}
              ${c.watch ? `<span class="chip chip-cat"><span class="dot"></span>${c.watch} watch</span>` : ''}
              ${c.ok ? `<span class="chip chip-ok"><span class="dot"></span>${c.ok} healthy</span>` : ''}
            </div>
          </div>
        </div>`;

    render();
}

function render() {
    const host = document.getElementById('cards');
    const rows = recommendations.filter((r) => level === 'all' || r.level === level);

    if (!rows.length) {
        host.innerHTML = `<div class="col-12"><div class="empty"><i class="bi bi-clipboard-check"></i>
            <h3>Nothing in this bucket</h3><p>Try another filter.</p></div></div>`;
        return;
    }

    host.innerHTML = rows.map((r) => {
        const meta = LEVEL_META[r.level];
        const days = r.days_left !== null ? `${r.days_left} days of cover` : 'no recent demand';
        return `<div class="col-md-6 col-xl-4">
            <div class="insight ${r.level}">
                <div class="insight-top">
                    <div>
                        <span class="chip chip-cat">${esc(r.category)}</span>
                        <h4 class="mt-2">${esc(r.name)}</h4>
                        <div class="cell-sub">${esc(r.sku)}</div>
                    </div>
                    <i class="bi bi-${meta.icon} fs-4" style="color:var(--ink-soft)"></i>
                </div>

                <div class="headline">${esc(r.headline)}</div>
                <div class="reason">${esc(r.reason)}</div>

                <div class="d-flex gap-3 mt-3 small text-muted-warm">
                    <span title="Units on hand"><i class="bi bi-box me-1"></i>${r.stock_qty} in stock</span>
                    <span title="Sales pace"><i class="bi bi-graph-up me-1"></i>${r.per_week}/wk</span>
                    <span title="Days of cover"><i class="bi bi-clock-history me-1"></i>${days}</span>
                </div>

                ${r.suggest_qty > 0 ? `
                <div class="suggest">
                    <span class="cell-sub">Suggested reorder</span>
                    <span class="qty">+ ${r.suggest_qty} units</span>
                </div>` : ''}
            </div>
        </div>`;
    }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.filter-btn').forEach((b) => b.onclick = () => {
        document.querySelectorAll('.filter-btn').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        level = b.dataset.level;
        render();
    });
    loadInsights();
});
