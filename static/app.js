document.addEventListener('DOMContentLoaded', () => {
    const tickerInput = document.getElementById('tickerInput');
    const generateBtn = document.getElementById('generateBtn');
    const errorMsg = document.getElementById('errorMsg');
    const loadingSection = document.getElementById('loadingSection');
    const briefContent = document.getElementById('briefContent');
    const inputView = document.getElementById('inputView');
    const newSearchBtn = document.getElementById('newSearchBtn');

    const logoWrap = document.getElementById('logoWrap');
    const companyLogo = document.getElementById('companyLogo');
    const logoFallback = document.getElementById('logoFallback');
    const companyNameEl = document.getElementById('companyName');
    const tickerSymbolEl = document.getElementById('tickerSymbol');
    const currentPriceEl = document.getElementById('currentPrice');
    const priceChangeEl = document.getElementById('priceChange');
    const snapshotTextEl = document.getElementById('snapshotText');
    const scorecardBody = document.getElementById('scorecardBody');
    const snapshotSentenceEl = document.getElementById('snapshotSentence');
    const riskSection = document.getElementById('riskSection');
    const riskList = document.getElementById('riskList');
    const newsList = document.getElementById('newsList');

    const chartTabs = document.getElementById('chartTabs');
    const chartCanvas = document.getElementById('priceChart');
    const chartNote = document.getElementById('chartNote');

    const compareForm = document.getElementById('compareForm');
    const compareTickerInput = document.getElementById('compareTickerInput');
    const compareBtn = document.getElementById('compareBtn');
    const compareError = document.getElementById('compareError');
    const compareResults = document.getElementById('compareResults');

    const COLOR_UP = '#C96442';   // terracotta
    const COLOR_DOWN = '#E53E3E'; // red

    let priceChart = null;
    let currentTicker = '';
    let currentFactors = [];
    let currentPeYears = 5;

    /* ---------- Helpers ---------- */

    function showError(msg) {
        errorMsg.textContent = msg;
        briefContent.classList.add('hidden');
        loadingSection.classList.add('hidden');
        inputView.classList.remove('hidden');
    }

    function clearError() {
        errorMsg.textContent = '';
    }

    function setLoading(isLoading) {
        if (isLoading) {
            loadingSection.classList.remove('hidden');
            briefContent.classList.add('hidden');
            inputView.classList.add('hidden');
            clearError();
        } else {
            loadingSection.classList.add('hidden');
        }
    }

    function hexToRgba(hex, alpha) {
        const h = hex.replace('#', '');
        const r = parseInt(h.substring(0, 2), 16);
        const g = parseInt(h.substring(2, 4), 16);
        const b = parseInt(h.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /* Count-up animation for the current price */
    function animateCountUp(el, target, duration = 1100) {
        if (!isFinite(target)) {
            el.textContent = '—';
            return;
        }
        const startTime = performance.now();
        function frame(now) {
            const p = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
            const val = target * eased;
            el.textContent = '$' + val.toFixed(2);
            if (p < 1) {
                requestAnimationFrame(frame);
            } else {
                el.textContent = '$' + target.toFixed(2);
            }
        }
        requestAnimationFrame(frame);
    }

    /* Badge label = meaningful factor text, fallback to color name */
    function badgeLabel(badge, text) {
        if (text && text.length) return text;
        return badge === 'green' ? 'Green'
            : badge === 'yellow' ? 'Yellow'
            : badge === 'red' ? 'Red'
            : 'Data unavailable';
    }

    function renderBadge(badge, text) {
        const cls = `badge badge-${badge || 'grey'}`;
        return `<span class="${cls}">${escapeHtml(badgeLabel(badge, text))}</span>`;
    }

    /* ---------- Company logo ---------- */

    function renderLogo(stockData) {
        const domain = stockData.company_domain;
        const firstLetter = (stockData.ticker || '').charAt(0).toUpperCase() || '?';
        logoFallback.textContent = firstLetter;

        const useFallback = () => {
            logoWrap.classList.add('is-fallback');
            companyLogo.removeAttribute('src');
        };

        if (domain) {
            logoWrap.classList.remove('is-fallback');
            companyLogo.alt = `${stockData.company_name || ''} logo`;
            companyLogo.onerror = useFallback;
            companyLogo.onload = () => logoWrap.classList.remove('is-fallback');
            companyLogo.src = `https://logo.clearbit.com/${domain}`;
        } else {
            useFallback();
        }
    }

    /* ---------- Chart ---------- */

    function chartColor(prices) {
        if (!prices || prices.length < 2) return COLOR_UP;
        return prices[prices.length - 1] >= prices[0] ? COLOR_UP : COLOR_DOWN;
    }

    function buildChart(dates, prices, ma5, ma20, ma50, period) {
        if (typeof Chart === 'undefined' || !chartCanvas) {
            chartNote.textContent = 'Chart unavailable.';
            return;
        }
        const color = chartColor(prices);
        const ctx = chartCanvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, chartCanvas.height || 300);
        gradient.addColorStop(0, hexToRgba(color, 0.28));
        gradient.addColorStop(1, hexToRgba(color, 0));

        const maDataset = (label, data, borderColor) => ({
            label,
            data,
            borderColor,
            borderWidth: 1.5,
            tension: 0.3,
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 0,
            spanGaps: false
        });

        const showMa20 = ['3mo', '6mo', '1y', '5y', 'max'].includes(period);
        const showMa50 = ['1y', '5y', 'max'].includes(period);

        const datasets = [
            {
                label: 'Close',
                data: prices,
                borderColor: color,
                backgroundColor: gradient,
                borderWidth: 2.5,
                tension: 0.4,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHoverBackgroundColor: color,
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2
            },
            maDataset('MA5', ma5 || [], '#f0a500')
        ];
        if (showMa20) datasets.push(maDataset('MA20', ma20 || [], '#3b82f6'));
        if (showMa50) datasets.push(maDataset('MA50', ma50 || [], '#a855f7'));

        const data = {
            labels: dates,
            datasets: datasets
        };

        if (chartLegend) {
            const legendItems = [{ label: 'MA5', color: '#f0a500' }];
            if (showMa20) legendItems.push({ label: 'MA20', color: '#3b82f6' });
            if (showMa50) legendItems.push({ label: 'MA50', color: '#a855f7' });
            chartLegend.innerHTML = legendItems.map(m =>
                `<span class="chart-legend-item"><span class="chart-legend-dot" style="background:${m.color}"></span>${escapeHtml(m.label)}</span>`
            ).join('');
        }

        const options = {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1A1A1A',
                    titleColor: '#F5F0E8',
                    bodyColor: '#F5F0E8',
                    padding: 10,
                    displayColors: false,
                    callbacks: {
                        label: (ctx) => '$' + Number(ctx.parsed.y).toFixed(2)
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        maxTicksLimit: 6,
                        maxRotation: 0,
                        color: '#8A8A8A',
                        font: { size: 11 }
                    }
                },
                y: {
                    position: 'right',
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: {
                        color: '#8A8A8A',
                        font: { size: 11 },
                        callback: (v) => '$' + Number(v).toFixed(0)
                    }
                }
            }
        };

        if (priceChart) {
            priceChart.data = data;
            priceChart.options = options;
            priceChart.update();
        } else {
            priceChart = new Chart(ctx, { type: 'line', data, options });
        }
    }

    async function loadChart(ticker, period) {
        try {
            const resp = await fetch(`/api/history?ticker=${encodeURIComponent(ticker)}&period=${encodeURIComponent(period)}`);
            const data = await resp.json();
            if (!resp.ok || !data.prices || data.prices.length === 0) {
                if (priceChart) { priceChart.destroy(); priceChart = null; }
                chartNote.textContent = data.error || 'No historical price data available.';
                return null;
            }
            buildChart(data.dates, data.prices, data.ma5, data.ma20, data.ma50, period);
            chartNote.textContent = `Daily closing prices · ${data.dates[0]} to ${data.dates[data.dates.length - 1]}`;
            return data;
        } catch (err) {
            if (priceChart) { priceChart.destroy(); priceChart = null; }
            chartNote.textContent = 'Unable to load price chart.';
            return null;
        }
    }

    const chartLegend = document.getElementById('chartLegend');

    /* Today's price change from the two most recent closes */
    function renderPriceChange(prices) {
        if (!prices || prices.length < 2) {
            priceChangeEl.textContent = '';
            priceChangeEl.className = 'price-change';
            return;
        }
        const last = prices[prices.length - 1];
        const prev = prices[prices.length - 2];
        const change = last - prev;
        const pct = (change / prev) * 100;
        const sign = change > 0 ? '+' : (change < 0 ? '-' : '');
        const absChange = Math.abs(change).toFixed(2);
        const absPct = Math.abs(pct).toFixed(2);
        const arrow = change > 0 ? '\u25B2' : (change < 0 ? '\u25BC' : '');
        priceChangeEl.textContent = `${arrow} ${sign}$${absChange} (${sign}${absPct}%)`;
        priceChangeEl.className = 'price-change ' + (change > 0 ? 'up' : change < 0 ? 'down' : 'flat');
    }

    /* ---------- Scorecard table ---------- */

    const FACTOR_DESCRIPTIONS = {
        'P/E Ratio': "Compares stock price to earnings \u2014 higher means you're paying more for each dollar of profit.",
        'Analyst Price Target': "Wall Street consensus on where the stock should trade in 12 months.",
        'PEG Ratio': "P/E adjusted for growth rate \u2014 below 1 is cheap, above 2 means growth may not justify the price.",
        'RSI (14-day)': "Momentum indicator \u2014 above 70 is overbought, below 30 is oversold, 30\u201370 is neutral.",
        'Earnings Date': "Next scheduled earnings report \u2014 results can move the stock significantly in either direction."
    };

    function pePeriodSelect(selected) {
        const opts = [3, 5, 10].map(y => {
            const isSel = y === selected ? 'selected' : '';
            return `<option value="${y}" ${isSel}>${y}Y</option>`;
        }).join('');
        return `<select class="pe-period-select" aria-label="P/E historical average period">${opts}</select>`;
    }

    function renderScorecard(factors) {
        scorecardBody.innerHTML = '';
        factors.forEach((f, i) => {
            const tr = document.createElement('tr');
            tr.className = `scorecard-body-row collapsed signal-${f.badge || 'grey'}`;
            tr.style.animationDelay = `${0.08 + i * 0.07}s`;
            tr.dataset.factorName = f.name;

            const isPe = f.name === 'P/E Ratio';
            const head = isPe
                ? `<div class="factor-row-head">
                       <span class="chevron" aria-hidden="true">&rsaquo;</span>
                       <span class="factor-name">${escapeHtml(f.name)}</span>
                       ${pePeriodSelect(f.years || currentPeYears)}
                   </div>`
                : `<div class="factor-row-head">
                       <span class="chevron" aria-hidden="true">&rsaquo;</span>
                       <span class="factor-name">${escapeHtml(f.name)}</span>
                   </div>`;

            const description = FACTOR_DESCRIPTIONS[f.name] || '';

            tr.innerHTML = `
                <td>
                    ${head}
                    ${description ? `<div class="factor-description">${escapeHtml(description)}</div>` : ''}
                    <div class="factor-explanation">${f.explanation || 'No explanation available.'}</div>
                    ${f.source ? `<span class="source-label">${escapeHtml(f.source)}</span>` : ''}
                </td>
                <td>${renderBadge(f.badge, f.text)}</td>
            `;
            scorecardBody.appendChild(tr);

            if (isPe) {
                const select = tr.querySelector('.pe-period-select');
                select.addEventListener('change', (e) => onPePeriodChange(e.target.value, tr));
                select.addEventListener('click', (e) => e.stopPropagation());
            }
        });

        scorecardBody.querySelectorAll('.scorecard-body-row').forEach(row => {
            row.addEventListener('click', () => {
                const wasCollapsed = row.classList.contains('collapsed');
                scorecardBody.querySelectorAll('.scorecard-body-row').forEach(r => r.classList.add('collapsed'));
                if (wasCollapsed) {
                    row.classList.remove('collapsed');
                }
            });
        });
    }

    /* ---------- P/E period change ---------- */

    async function onPePeriodChange(yearsStr, rowEl) {
        const years = parseInt(yearsStr, 10);
        if (!currentTicker || !years) return;
        currentPeYears = years;
        const select = rowEl.querySelector('.pe-period-select');
        if (select) select.disabled = true;
        rowEl.classList.add('pe-row-busy');

        try {
            const resp = await fetch(`/api/pe-history?ticker=${encodeURIComponent(currentTicker)}&years=${years}`);
            const data = await resp.json();
            if (!resp.ok || !data.assessment) {
                if (select) select.disabled = false;
                rowEl.classList.remove('pe-row-busy');
                return;
            }
            const a = data.assessment;
            const explEl = rowEl.querySelector('.factor-explanation');
            const sourceEl = rowEl.querySelector('.source-label');
            const badgeCell = rowEl.querySelector('td:last-child');

            if (explEl) explEl.innerHTML = a.explanation || 'No explanation available.';
            if (sourceEl && data.source) sourceEl.textContent = data.source;
            if (badgeCell) badgeCell.innerHTML = renderBadge(a.badge, a.text);

            // Update the signal class, then expand the row so the new data is visible
            rowEl.classList.remove('signal-green', 'signal-yellow', 'signal-red', 'signal-grey');
            rowEl.classList.add(`signal-${a.badge || 'grey'}`);
            rowEl.classList.remove('collapsed');

            // Keep currentFactors in sync for the compare feature
            const peFactor = currentFactors.find(f => f.name === 'P/E Ratio');
            if (peFactor) {
                peFactor.badge = a.badge;
                peFactor.text = a.text;
                peFactor.explanation = a.explanation;
                peFactor.years = years;
                peFactor.source = data.source;
            }
            refreshCompareIfVisible();
        } catch (err) {
            // silently leave previous values
        } finally {
            if (select) select.disabled = false;
            rowEl.classList.remove('pe-row-busy');
        }
    }

    /* ---------- News ---------- */

    function renderNews(news) {
        newsList.innerHTML = '';
        if (news && news.length > 0) {
            news.forEach(n => {
                const item = document.createElement('div');
                item.className = 'news-item';
                const published = n.publishedAt || '';
                const source = n.source || 'Finnhub';
                const analysis = n.ai_analysis || '';
                const titleHtml = n.url
                    ? `<a href="${escapeHtml(n.url)}" target="_blank" rel="noopener" class="news-title">${escapeHtml(n.title || '')}</a>`
                    : `<span class="news-title">${escapeHtml(n.title || '')}</span>`;
                const analysisHtml = analysis
                    ? `<div class="ai-analysis-box">
                           <span class="ai-analysis-label">AI Analysis</span>
                           <p class="ai-analysis-text">${escapeHtml(analysis)}</p>
                       </div>`
                    : '';
                item.innerHTML = `
                    <div class="news-left">
                        ${titleHtml}
                        <span class="news-date">${escapeHtml(source)}${published ? ' &middot; ' + escapeHtml(published) : ''}</span>
                    </div>
                    <div class="news-right">${analysisHtml}</div>
                `;
                newsList.appendChild(item);
            });
        } else {
            newsList.innerHTML = '<p class="no-news">No recent news found.</p>';
        }
    }

    /* ---------- Render brief ---------- */

    function renderBrief(stockData) {
        currentTicker = stockData.ticker;
        currentFactors = (stockData.factors || []).map(f => ({ ...f }));
        currentPeYears = 5;
        compareResults.innerHTML = '';
        compareError.textContent = '';
        compareTickerInput.value = '';

        renderLogo(stockData);

        companyNameEl.textContent = stockData.company_name || stockData.ticker;
        tickerSymbolEl.textContent = stockData.ticker;

        const price = Number(stockData.current_price);
        if (isFinite(price) && price > 0) {
            animateCountUp(currentPriceEl, price);
        } else {
            currentPriceEl.textContent = '—';
        }

        snapshotTextEl.textContent = stockData.snapshot || '';
        const companyNameLower = (stockData.company_name || '').toLowerCase().trim();
        const snapshotLower = (stockData.snapshot || '').toLowerCase().trim();
        if (!snapshotLower || snapshotLower === companyNameLower) {
            snapshotTextEl.classList.add('hidden');
        } else {
            snapshotTextEl.classList.remove('hidden');
        }

        renderScorecard(stockData.factors || []);

        /* One-sentence snapshot */
        snapshotSentenceEl.textContent = stockData.snapshot_sentence || '';

        /* Risk flags */
        if (stockData.risk_flags && stockData.risk_flags.length > 0) {
            riskSection.classList.remove('hidden');
            riskList.innerHTML = '';
            stockData.risk_flags.forEach(flag => {
                const li = document.createElement('li');
                li.className = 'risk-item';
                li.innerHTML = `
                    <span class="risk-dot"></span>
                    <span><span class="risk-label">${escapeHtml(flag.name)}:</span> ${escapeHtml(flag.explanation)}</span>
                `;
                riskList.appendChild(li);
            });
        } else {
            riskSection.classList.remove('hidden');
            riskList.innerHTML = '<li class="risk-empty">No major risk flags detected across the five factors.</li>';
        }

        /* News */
        renderNews(stockData.news || []);

        /* Reset tabs to default 3M */
        chartTabs.querySelectorAll('.chart-tab').forEach(t => {
            const isActive = t.dataset.period === '3mo';
            t.classList.toggle('active', isActive);
            if (isActive) t.setAttribute('aria-selected', 'true');
            else t.removeAttribute('aria-selected');
        });

        /* Show results */
        setLoading(false);
        briefContent.classList.remove('hidden');
        inputView.classList.add('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });

        /* Load chart + compute today's change from the default 3M history */
        loadChart(currentTicker, '3mo').then(history => {
            if (history && history.prices) {
                renderPriceChange(history.prices);
            }
        });
    }

    /* ---------- Generate ---------- */

    async function generateBrief(tickerValue) {
        const ticker = (tickerValue !== undefined ? tickerValue : tickerInput.value).trim();
        if (!ticker) {
            showError('Please enter a stock ticker.');
            return;
        }
        if (!/^[A-Za-z0-9.-]+$/.test(ticker)) {
            showError('Please enter a valid ticker symbol.');
            return;
        }

        setLoading(true);
        try {
            const resp = await fetch(`/api/stock/${encodeURIComponent(ticker)}`);
            const data = await resp.json();

            if (!resp.ok) {
                showError(data.error || 'Something went wrong. Please try again.');
                return;
            }

            renderBrief(data);
        } catch (err) {
            showError('Network error. Please check your connection and try again.');
        }
    }

    /* ---------- New search ---------- */

    function backToInput() {
        briefContent.classList.add('hidden');
        inputView.classList.remove('hidden');
        if (priceChart) { priceChart.destroy(); priceChart = null; }
        tickerInput.value = '';
        clearError();
        tickerInput.focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /* ---------- Compare feature ---------- */

    function refreshCompareIfVisible() {
        if (compareResults.querySelector('.compare-table')) {
            renderCompareTable();
        }
    }

    function renderCompareTable(stockBData) {
        // If called without stockBData, re-render using last compared ticker stored on the section
        let factorsB = null;
        let tickerB = '';
        if (stockBData) {
            factorsB = (stockBData.factors || []).map(f => ({ ...f }));
            tickerB = stockBData.ticker;
            compareResults.dataset.tickerB = tickerB;
            compareResults.dataset.factorsB = JSON.stringify(factorsB);
        } else {
            tickerB = compareResults.dataset.tickerB || '';
            try {
                factorsB = JSON.parse(compareResults.dataset.factorsB || '[]');
            } catch (e) {
                factorsB = [];
            }
        }

        if (!factorsB || factorsB.length === 0) return;

        const factorsA = currentFactors;
        const tickerA = currentTicker || 'Stock A';

        const factorOrder = ['P/E Ratio', 'Analyst Price Target', 'PEG Ratio', 'RSI (14-day)', 'Earnings Date'];
        const findFactor = (arr, name) => arr.find(f => f.name === name);

        const rows = factorOrder.map(name => {
            const a = findFactor(factorsA, name) || {};
            const b = findFactor(factorsB, name) || {};
            return `
                <tr>
                    <td class="compare-factor-name">${escapeHtml(name)}</td>
                    <td>${renderBadge(a.badge, a.text)}</td>
                    <td>${renderBadge(b.badge, b.text)}</td>
                </tr>
            `;
        }).join('');

        compareResults.innerHTML = `
            <div class="compare-table-wrap">
                <table class="compare-table">
                    <thead>
                        <tr>
                            <th>Factor</th>
                            <th><span class="compare-ticker">${escapeHtml(tickerA)}</span></th>
                            <th><span class="compare-ticker">${escapeHtml(tickerB)}</span></th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    async function runCompare(event) {
        if (event) event.preventDefault();
        compareError.textContent = '';

        const tickerB = compareTickerInput.value.trim();
        if (!tickerB) {
            compareError.textContent = 'Please enter a second ticker.';
            return;
        }
        if (!/^[A-Za-z0-9.-]+$/.test(tickerB)) {
            compareError.textContent = 'Please enter a valid ticker symbol.';
            return;
        }
        if (tickerB.toUpperCase() === currentTicker.toUpperCase()) {
            compareError.textContent = 'Please enter a different ticker to compare.';
            return;
        }

        compareBtn.disabled = true;
        compareResults.innerHTML = '<p class="compare-loading">Loading comparison…</p>';

        try {
            const resp = await fetch(`/api/stock/${encodeURIComponent(tickerB)}`);
            const data = await resp.json();
            if (!resp.ok) {
                compareResults.innerHTML = '';
                compareError.textContent = data.error || 'Unable to fetch data for that ticker.';
                return;
            }
            renderCompareTable(data);
        } catch (err) {
            compareResults.innerHTML = '';
            compareError.textContent = 'Network error. Please try again.';
        } finally {
            compareBtn.disabled = false;
        }
    }

    /* ---------- Events ---------- */

    generateBtn.addEventListener('click', () => generateBrief());

    tickerInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') generateBrief();
    });

    document.querySelectorAll('.quick-pick').forEach(btn => {
        btn.addEventListener('click', () => {
            const t = btn.dataset.ticker;
            tickerInput.value = t;
            generateBrief(t);
        });
    });

    chartTabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.chart-tab');
        if (!tab || !currentTicker) return;
        const period = tab.dataset.period;
        chartTabs.querySelectorAll('.chart-tab').forEach(t => {
            const isActive = t === tab;
            t.classList.toggle('active', isActive);
            if (isActive) t.setAttribute('aria-selected', 'true');
            else t.removeAttribute('aria-selected');
        });
        loadChart(currentTicker, period);
    });

    newSearchBtn.addEventListener('click', backToInput);

    compareForm.addEventListener('submit', runCompare);

    tickerInput.focus();
});

