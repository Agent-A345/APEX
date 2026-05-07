/* ═══════════════════════════════════════════════════════
   APEX ANALYTICS DASHBOARD — script.js
═══════════════════════════════════════════════════════ */

'use strict';

/* ══════════════════════════════
   1. DATA GENERATION (90 days)
══════════════════════════════ */
function generateData() {
  const salesCategories = ['Electronics', 'Clothing', 'Furniture', 'Food & Bev', 'Sports'];
  const expenseCategories = ['Salaries', 'Marketing', 'Operations', 'R&D', 'Logistics'];
  const productivityCategories = ['Engineering', 'Design', 'Sales', 'Support', 'Management'];
  const types = ['online', 'in-store', 'wholesale', 'direct'];

  const baseAmounts = {
    sales: [1800, 900, 2200, 450, 1100],
    expenses: [3500, 1200, 800, 1500, 650],
    productivity: [88, 75, 92, 70, 65]
  };

  const seededRandom = (seed) => {
    let s = seed;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  };

  const startDate = new Date('2024-01-01');
  const result = { sales: [], expenses: [], productivity: [] };

  ['sales', 'expenses', 'productivity'].forEach(ds => {
    const categories = ds === 'sales' ? salesCategories
      : ds === 'expenses' ? expenseCategories
      : productivityCategories;
    const rand = seededRandom(ds === 'sales' ? 42 : ds === 'expenses' ? 77 : 13);

    for (let day = 0; day < 90; day++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + day);
      const dateStr = d.toISOString().slice(0, 10);
      const month = d.getMonth() + 1;
      const dayOfWeek = d.getDay();
      const weekendFactor = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.65 : 1;
      const monthTrend = month === 1 ? 0.8 : month === 2 ? 0.95 : 1.15;

      const txCount = Math.max(1, Math.floor(2 + rand() * 4));
      for (let t = 0; t < txCount; t++) {
        const catIdx = Math.floor(rand() * categories.length);
        const base = baseAmounts[ds][catIdx];
        const variance = 0.6 + rand() * 0.8;
        const rawAmt = base * variance * weekendFactor * monthTrend;
        const amount = ds === 'productivity'
          ? Math.min(100, Math.max(20, Math.round(rawAmt)))
          : Math.round(rawAmt * 10) / 10;

        result[ds].push({
          date: dateStr,
          category: categories[catIdx],
          amount,
          type: types[Math.floor(rand() * types.length)],
          month
        });
      }
    }
  });

  return result;
}

/* ══════════════════════════════
   2. STATE
══════════════════════════════ */
const RAW_DATA = generateData();

const state = {
  dataset: 'sales',
  period: 'month',
  filterMonth: 'all',
  filterCategory: 'all',
  filterType: 'all',
  compareMode: false,
  darkMode: true,
  customData: JSON.parse(localStorage.getItem('apexCustomData') || '{}')
};

let charts = { line: null, bar: null, pie: null };

/* ══════════════════════════════
   3. DATA HELPERS
══════════════════════════════ */
function getActiveData() {
  const base = [...(RAW_DATA[state.dataset] || [])];
  const custom = state.customData[state.dataset] || [];
  const all = [...base, ...custom];

  return all.filter(row => {
    if (state.filterMonth !== 'all' && row.month !== +state.filterMonth) return false;
    if (state.filterCategory !== 'all' && row.category !== state.filterCategory) return false;
    if (state.filterType !== 'all' && row.type !== state.filterType) return false;
    return true;
  });
}

function sumByGroup(data, key) {
  const map = {};
  data.forEach(row => {
    map[row[key]] = (map[row[key]] || 0) + row.amount;
  });
  return map;
}

function groupByPeriod(data) {
  const map = {};
  data.forEach(row => {
    let key;
    const d = new Date(row.date);
    if (state.period === 'day') {
      key = row.date;
    } else if (state.period === 'week') {
      const week = getISOWeek(d);
      key = `W${week}`;
    } else {
      key = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
    }
    map[key] = (map[key] || 0) + row.amount;
  });
  return map;
}

function getISOWeek(d) {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - jan1) / 86400000) + jan1.getDay() + 1) / 7);
}

function getPrevPeriodData() {
  const all = [...(RAW_DATA[state.dataset] || [])];
  if (state.filterMonth !== 'all') {
    const prevMonth = (+state.filterMonth - 1) || 12;
    return all.filter(r => r.month === prevMonth);
  }
  return all.filter(r => r.month <= 2);
}

function fmtAmount(v) {
  if (state.dataset === 'productivity') return Math.round(v) + '%';
  if (v >= 1000000) return '$' + (v / 1000000).toFixed(1) + 'M';
  if (v >= 1000) return '$' + (v / 1000).toFixed(1) + 'K';
  return '$' + v.toFixed(0);
}

function fmtDelta(pct) {
  if (pct > 0) return `↑ +${pct.toFixed(1)}%`;
  if (pct < 0) return `↓ ${pct.toFixed(1)}%`;
  return `→ 0%`;
}

/* ══════════════════════════════
   4. KPI CARDS
══════════════════════════════ */
function updateKPIs(data) {
  const total = data.reduce((s, r) => s + r.amount, 0);
  const txCount = data.length;
  const days = new Set(data.map(r => r.date)).size || 1;
  const avgDay = total / days;

  const byCat = sumByGroup(data, 'category');
  const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];

  const prev = getPrevPeriodData();
  const prevTotal = prev.reduce((s, r) => s + r.amount, 0);
  const growthPct = prevTotal ? ((total - prevTotal) / prevTotal) * 100 : 0;

  const vals = [fmtAmount(total), txCount.toLocaleString(), fmtAmount(avgDay), topCat ? topCat[0] : '—'];
  const labels = [
    fmtDelta(growthPct),
    fmtDelta(growthPct),
    `${days} days`,
    topCat ? fmtAmount(topCat[1]) : '—'
  ];
  const classes = [
    growthPct > 0 ? 'up' : growthPct < 0 ? 'down' : 'neutral',
    growthPct > 0 ? 'up' : growthPct < 0 ? 'down' : 'neutral',
    'neutral',
    'up'
  ];

  [0,1,2,3].forEach(i => {
    const el = document.getElementById(`kpiVal${i}`);
    const delta = document.getElementById(`kpiDelta${i}`);
    if (el) animateValue(el, vals[i]);
    if (delta) {
      delta.textContent = labels[i];
      delta.className = `kpi-delta ${classes[i]}`;
    }
  });
}

function animateValue(el, newVal) {
  el.style.opacity = '0.4';
  el.style.transform = 'translateY(4px)';
  requestAnimationFrame(() => {
    setTimeout(() => {
      el.textContent = newVal;
      el.style.transition = 'opacity 0.3s, transform 0.3s';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, 120);
  });
}

/* ══════════════════════════════
   5. CHARTS
══════════════════════════════ */
const PALETTE = ['#f5a623','#60a5fa','#34d399','#a78bfa','#f87171','#fbbf24','#38bdf8','#4ade80'];
const PALETTE_DIM = PALETTE.map(c => c + '33');

function getChartDefaults() {
  const dark = document.documentElement.getAttribute('data-theme') !== 'light';
  return {
    gridColor: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
    textColor: dark ? '#5c6470' : '#9ba3b0',
    tooltipBg: dark ? '#1f2530' : '#ffffff',
    tooltipBorder: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
  };
}

function buildChartOptions(type) {
  const d = getChartDefaults();
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 500, easing: 'easeInOutQuart' },
    plugins: {
      legend: { display: type === 'pie', position: 'bottom',
        labels: { color: d.textColor, font: { family: 'DM Mono', size: 10 }, padding: 16, boxWidth: 10 }
      },
      tooltip: {
        backgroundColor: d.tooltipBg,
        borderColor: d.tooltipBorder,
        borderWidth: 1,
        titleColor: '#f0f2f5',
        bodyColor: d.textColor,
        titleFont: { family: 'DM Mono', size: 11, weight: '500' },
        bodyFont: { family: 'DM Mono', size: 11 },
        padding: 10,
        callbacks: {
          label: ctx => `  ${fmtAmount(ctx.parsed.y ?? ctx.parsed)}`
        }
      }
    }
  };
  if (type !== 'pie') {
    base.scales = {
      x: {
        grid: { color: d.gridColor, drawBorder: false },
        ticks: { color: d.textColor, font: { family: 'DM Mono', size: 10 }, maxRotation: 0 }
      },
      y: {
        grid: { color: d.gridColor, drawBorder: false },
        ticks: { color: d.textColor, font: { family: 'DM Mono', size: 10 }, callback: v => fmtAmount(v) }
      }
    };
  }
  return base;
}

function initCharts() {
  const ctxLine = document.getElementById('lineChart').getContext('2d');
  const ctxBar = document.getElementById('barChart').getContext('2d');
  const ctxPie = document.getElementById('pieChart').getContext('2d');

  if (charts.line) { charts.line.destroy(); }
  if (charts.bar) { charts.bar.destroy(); }
  if (charts.pie) { charts.pie.destroy(); }

  charts.line = new Chart(ctxLine, { type: 'line', data: { labels: [], datasets: [] }, options: buildChartOptions('line') });
  charts.bar = new Chart(ctxBar, { type: 'bar', data: { labels: [], datasets: [] }, options: buildChartOptions('bar') });
  charts.pie = new Chart(ctxPie, { type: 'doughnut', data: { labels: [], datasets: [] }, options: buildChartOptions('pie') });

  // Click on bar → drill-down
  document.getElementById('barChart').onclick = (e) => {
    const pts = charts.bar.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false);
    if (pts.length) {
      const label = charts.bar.data.labels[pts[0].index];
      openDrillDown(label);
    }
  };
  // Click on pie → drill-down
  document.getElementById('pieChart').onclick = (e) => {
    const pts = charts.pie.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false);
    if (pts.length) {
      const label = charts.pie.data.labels[pts[0].index];
      openDrillDown(label);
    }
  };
}

function updateCharts(data) {
  const periodMap = groupByPeriod(data);
  const labels = Object.keys(periodMap);
  const values = Object.values(periodMap);

  // Gradient for line chart
  const ctxLine = document.getElementById('lineChart').getContext('2d');
  const gradient = ctxLine.createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, 'rgba(245,166,35,0.25)');
  gradient.addColorStop(1, 'rgba(245,166,35,0)');

  charts.line.data.labels = labels;
  charts.line.data.datasets = [{
    label: 'Value',
    data: values,
    borderColor: '#f5a623',
    backgroundColor: gradient,
    borderWidth: 2,
    pointBackgroundColor: '#f5a623',
    pointRadius: labels.length > 30 ? 0 : 3,
    pointHoverRadius: 5,
    fill: true,
    tension: 0.4
  }];

  if (state.compareMode) {
    const prev = getPrevPeriodData();
    const prevMap = groupByPeriod(prev);
    const prevVals = labels.map(l => prevMap[l] || 0);
    charts.line.data.datasets.push({
      label: 'Previous Period',
      data: prevVals,
      borderColor: '#60a5fa',
      backgroundColor: 'rgba(96,165,250,0.07)',
      borderWidth: 1.5,
      borderDash: [5, 4],
      pointRadius: 0,
      fill: true,
      tension: 0.4
    });
  }

  charts.line.options = buildChartOptions('line');
  charts.line.update('active');

  // Bar chart — by category
  const catMap = sumByGroup(data, 'category');
  const catLabels = Object.keys(catMap).slice(0, 8);
  const catVals = catLabels.map(k => catMap[k]);

  charts.bar.data.labels = catLabels;
  charts.bar.data.datasets = [{
    label: 'Total',
    data: catVals,
    backgroundColor: PALETTE.slice(0, catLabels.length),
    borderRadius: 4,
    borderSkipped: false
  }];
  charts.bar.options = buildChartOptions('bar');
  charts.bar.update('active');

  // Pie chart — by category
  charts.pie.data.labels = catLabels;
  charts.pie.data.datasets = [{
    data: catVals,
    backgroundColor: PALETTE.slice(0, catLabels.length),
    borderWidth: 0,
    hoverOffset: 6
  }];
  charts.pie.options = buildChartOptions('pie');
  charts.pie.update('active');

  document.getElementById('lineSubtitle').textContent =
    state.compareMode ? 'vs Previous Period' : `By ${state.period.charAt(0).toUpperCase() + state.period.slice(1)}`;
}

/* ══════════════════════════════
   6. TABLE
══════════════════════════════ */
function updateTable(data) {
  const catMap = sumByGroup(data, 'category');
  const countMap = {};
  data.forEach(r => { countMap[r.category] = (countMap[r.category] || 0) + 1; });

  const prev = getPrevPeriodData();
  const prevCatMap = sumByGroup(prev, 'category');

  const rows = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';

  rows.forEach(([cat, total]) => {
    const cnt = countMap[cat] || 0;
    const avg = cnt ? total / cnt : 0;
    const prevTotal = prevCatMap[cat] || 0;
    const growth = prevTotal ? ((total - prevTotal) / prevTotal) * 100 : null;
    const growthClass = growth === null ? 'neutral' : growth > 0 ? 'up' : 'down';
    const growthStr = growth === null ? '—' : (growth > 0 ? `↑ +${growth.toFixed(1)}%` : `↓ ${growth.toFixed(1)}%`);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${cat}</td>
      <td class="td-mono">${fmtAmount(total)}</td>
      <td class="td-mono">${cnt.toLocaleString()}</td>
      <td class="td-mono">${fmtAmount(avg)}</td>
      <td class="td-growth ${growthClass}">${growthStr}</td>
      <td><button class="btn-view" data-cat="${cat}">View ↗</button></td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('tableMeta').textContent = `${rows.length} categories · ${data.length} records`;

  // Bind view buttons
  tbody.querySelectorAll('.btn-view').forEach(btn => {
    btn.addEventListener('click', () => openDrillDown(btn.dataset.cat));
  });
}

/* ══════════════════════════════
   7. DRILL-DOWN MODAL
══════════════════════════════ */
function openDrillDown(category) {
  const data = getActiveData().filter(r => r.category === category);
  const modal = document.getElementById('drillModal');
  document.getElementById('modalTitle').textContent = `↘ ${category}`;

  const rows = data.slice(0, 20).map(r => `
    <tr>
      <td>${r.date}</td>
      <td>${fmtAmount(r.amount)}</td>
      <td>${r.type}</td>
    </tr>
  `).join('');

  document.getElementById('modalBody').innerHTML = `
    <p style="font-family:var(--font-mono);font-size:0.75rem;color:var(--text2);margin-bottom:0.75rem">
      Showing ${Math.min(data.length,20)} of ${data.length} records for <strong style="color:var(--accent)">${category}</strong>
    </p>
    <table class="drill-table">
      <thead><tr><th>Date</th><th>Amount</th><th>Type</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  modal.classList.add('open');
}

/* ══════════════════════════════
   8. INSIGHTS
══════════════════════════════ */
function generateInsights(data) {
  const insights = [];
  const total = data.reduce((s, r) => s + r.amount, 0);
  const prev = getPrevPeriodData();
  const prevTotal = prev.reduce((s, r) => s + r.amount, 0);

  if (prevTotal) {
    const pct = ((total - prevTotal) / prevTotal * 100).toFixed(1);
    const dir = pct > 0 ? 'up' : 'down';
    const icon = pct > 0 ? '↑' : '↓';
    insights.push(`<span class="${dir}">${icon} ${Math.abs(pct)}% vs previous period</span>`);
  }

  const catMap = sumByGroup(data, 'category');
  const top = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
  if (top) {
    const pct = ((top[1] / total) * 100).toFixed(0);
    insights.push(`<span class="neutral">Top: ${top[0]} (${pct}% share)</span>`);
  }

  // Streak detection
  const byDate = {};
  data.forEach(r => { byDate[r.date] = (byDate[r.date] || 0) + r.amount; });
  const sorted = Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0]));
  let streak = 1, streakDir = 0;
  for (let i = 1; i < sorted.length; i++) {
    const dir = Math.sign(sorted[i][1] - sorted[i-1][1]);
    if (dir === streakDir) streak++;
    else { streak = 2; streakDir = dir; }
  }
  if (streak >= 3 && streakDir === -1) {
    insights.push(`<span class="down">⚠ ${streak}-day declining streak detected</span>`);
  } else if (streak >= 3 && streakDir === 1) {
    insights.push(`<span class="up">✦ ${streak}-day rising streak</span>`);
  }

  // Transaction volume
  const txRate = data.length / (new Set(data.map(r => r.date)).size || 1);
  insights.push(`<span class="neutral">Avg ${txRate.toFixed(1)} tx/day</span>`);

  const ticker = document.getElementById('insightsTicker');
  ticker.innerHTML = insights.map(i => `<span class="insight-item">${i}</span>`).join('<span class="insight-item" style="color:var(--bg3)">|</span>');
}

/* ══════════════════════════════
   9. TREND ANALYSIS
══════════════════════════════ */
function updateTrend(data) {
  const byDate = {};
  data.forEach(r => { byDate[r.date] = (byDate[r.date] || 0) + r.amount; });
  const vals = Object.values(byDate);
  if (!vals.length) { document.getElementById('trendBody').innerHTML = '—'; return; }

  const n = vals.length;
  const sum = vals.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const sumX = (n * (n - 1)) / 2;
  const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;
  let sumXY = 0;
  vals.forEach((v, i) => { sumXY += i * v; });
  const slope = (n * sumXY - sumX * sum) / (n * sumXX - sumX * sumX);
  const slopePct = mean ? (slope / mean) * 100 : 0;

  const catMap = sumByGroup(data, 'category');
  const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const topThree = sorted.slice(0, 3);

  const dirClass = slopePct > 0 ? 'up' : slopePct < 0 ? 'down' : '';
  const dirLabel = slopePct > 0 ? 'Upward' : slopePct < 0 ? 'Downward' : 'Flat';
  const dirIcon = slopePct > 0 ? '↑' : slopePct < 0 ? '↓' : '→';

  const rows = topThree.map(([cat, val]) => `
    <div class="trend-row">
      <div class="trend-dot ${val > mean ? 'up' : 'down'}"></div>
      <span>${cat}: ${fmtAmount(val)}</span>
    </div>
  `).join('');

  document.getElementById('trendBody').innerHTML = `
    <div class="trend-row">
      <div class="trend-dot ${dirClass}"></div>
      <span style="color:var(--${dirClass === 'up' ? 'green' : dirClass === 'down' ? 'red' : 'text1'})">${dirIcon} ${dirLabel} (${slopePct > 0 ? '+' : ''}${slopePct.toFixed(1)}%/day)</span>
    </div>
    <div style="height:0.5rem"></div>
    ${rows}
  `;
}

/* ══════════════════════════════
   10. FILTERS POPULATION
══════════════════════════════ */
function populateFilters() {
  const data = RAW_DATA[state.dataset] || [];
  const cats = [...new Set(data.map(r => r.category))].sort();
  const types = [...new Set(data.map(r => r.type))].sort();

  const catSel = document.getElementById('filterCategory');
  catSel.innerHTML = '<option value="all">All Categories</option>' +
    cats.map(c => `<option value="${c}">${c}</option>`).join('');

  const typeSel = document.getElementById('filterType');
  typeSel.innerHTML = '<option value="all">All Types</option>' +
    types.map(t => `<option value="${t}">${t}</option>`).join('');

  // Restore existing selections
  catSel.value = state.filterCategory;
  typeSel.value = state.filterType;
}

/* ══════════════════════════════
   11. FULL RENDER
══════════════════════════════ */
function render() {
  const data = getActiveData();
  updateKPIs(data);
  updateCharts(data);
  updateTable(data);
  generateInsights(data);
  updateTrend(data);
}

/* ══════════════════════════════
   12. EXPORT
══════════════════════════════ */
function exportDashboard() {
  const btn = document.getElementById('exportBtn');
  btn.textContent = '⟳ Capturing…';
  btn.disabled = true;
  html2canvas(document.getElementById('dashboardRoot'), {
    backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg0').trim() || '#0a0b0d',
    scale: 1.5,
    useCORS: true,
    logging: false
  }).then(canvas => {
    const link = document.createElement('a');
    link.download = `apex-dashboard-${new Date().toISOString().slice(0,10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    btn.innerHTML = '<span class="btn-icon">↓</span> Export';
    btn.disabled = false;
  }).catch(() => {
    btn.innerHTML = '<span class="btn-icon">↓</span> Export';
    btn.disabled = false;
  });
}

/* ══════════════════════════════
   13. DARK MODE
══════════════════════════════ */
function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.darkMode ? 'dark' : 'light');
  document.getElementById('themeIcon').textContent = state.darkMode ? '☀' : '☾';
  localStorage.setItem('apexDarkMode', state.darkMode ? '1' : '0');
  // Rebuild chart colors
  if (charts.line) {
    charts.line.options = buildChartOptions('line');
    charts.bar.options = buildChartOptions('bar');
    charts.pie.options = buildChartOptions('pie');
    charts.line.update();
    charts.bar.update();
    charts.pie.update();
  }
}

/* ══════════════════════════════
   14. ADD CUSTOM DATA
══════════════════════════════ */
function submitCustomData() {
  const date = document.getElementById('formDate').value;
  const category = document.getElementById('formCategory').value.trim();
  const amount = parseFloat(document.getElementById('formAmount').value);
  const type = document.getElementById('formType').value.trim() || 'custom';

  if (!date || !category || isNaN(amount)) {
    alert('Please fill in all required fields.');
    return;
  }

  const d = new Date(date);
  const entry = { date, category, amount, type, month: d.getMonth() + 1 };
  if (!state.customData[state.dataset]) state.customData[state.dataset] = [];
  state.customData[state.dataset].push(entry);
  localStorage.setItem('apexCustomData', JSON.stringify(state.customData));

  document.getElementById('addModal').classList.remove('open');
  render();
}

/* ══════════════════════════════
   15. EVENT LISTENERS
══════════════════════════════ */
function bindEvents() {
  // Dataset switcher
  document.getElementById('datasetSelect').addEventListener('change', e => {
    state.dataset = e.target.value;
    state.filterCategory = 'all';
    state.filterType = 'all';
    populateFilters();
    render();
  });

  // Period switcher
  document.getElementById('periodSelect').addEventListener('change', e => {
    state.period = e.target.value;
    render();
  });

  // Filters
  document.getElementById('applyFilters').addEventListener('click', () => {
    state.filterMonth = document.getElementById('filterMonth').value;
    state.filterCategory = document.getElementById('filterCategory').value;
    state.filterType = document.getElementById('filterType').value;
    render();
  });

  document.getElementById('resetFilters').addEventListener('click', () => {
    state.filterMonth = 'all';
    state.filterCategory = 'all';
    state.filterType = 'all';
    document.getElementById('filterMonth').value = 'all';
    document.getElementById('filterCategory').value = 'all';
    document.getElementById('filterType').value = 'all';
    render();
  });

  // Compare toggle
  document.getElementById('compareToggle').addEventListener('click', function() {
    state.compareMode = !state.compareMode;
    this.classList.toggle('active', state.compareMode);
    render();
  });

  // Dark mode
  document.getElementById('darkModeToggle').addEventListener('click', () => {
    state.darkMode = !state.darkMode;
    applyTheme();
  });

  // Export
  document.getElementById('exportBtn').addEventListener('click', exportDashboard);

  // Add data modal
  document.getElementById('addDataBtn').addEventListener('click', () => {
    document.getElementById('formDate').value = new Date().toISOString().slice(0,10);
    document.getElementById('addModal').classList.add('open');
  });
  document.getElementById('addModalClose').addEventListener('click', () => {
    document.getElementById('addModal').classList.remove('open');
  });
  document.getElementById('submitDataBtn').addEventListener('click', submitCustomData);

  // Drill modal close
  document.getElementById('modalClose').addEventListener('click', () => {
    document.getElementById('drillModal').classList.remove('open');
  });

  // Close modals on overlay click
  ['drillModal', 'addModal'].forEach(id => {
    document.getElementById(id).addEventListener('click', function(e) {
      if (e.target === this) this.classList.remove('open');
    });
  });

  // Keyboard ESC
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.getElementById('drillModal').classList.remove('open');
      document.getElementById('addModal').classList.remove('open');
    }
  });
}

/* ══════════════════════════════
   16. INIT
══════════════════════════════ */
function init() {
  // Restore dark mode preference
  const savedDark = localStorage.getItem('apexDarkMode');
  if (savedDark !== null) state.darkMode = savedDark === '1';
  applyTheme();

  populateFilters();
  initCharts();
  bindEvents();
  render();
}

document.addEventListener('DOMContentLoaded', init);
