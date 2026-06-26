document.addEventListener('DOMContentLoaded', () => {
    const tickerInput = document.getElementById('tickerInput');
    const generateBtn = document.getElementById('generateBtn');
    const errorMsg = document.getElementById('errorMsg');
    const loadingSection = document.getElementById('loadingSection');
    const briefContent = document.getElementById('briefContent');
    const inputView = document.getElementById('inputView');
    const newSearchBtn = document.getElementById('newSearchBtn');

    /* Auth elements */
    const authArea = document.getElementById('authArea');
    const signinBtn = document.getElementById('signinBtn');
    const authModal = document.getElementById('authModal');
    const authModalClose = document.getElementById('authModalClose');
    const tabSignin = document.getElementById('tabSignin');
    const tabRegister = document.getElementById('tabRegister');
    const authForm = document.getElementById('authForm');
    const authEmail = document.getElementById('authEmail');
    const authPassword = document.getElementById('authPassword');
    const authSubmit = document.getElementById('authSubmit');
    const authError = document.getElementById('authError');
    let authMode = 'signin';
    let currentUser = null;

    const watchBtn = document.getElementById('watchBtn');
    let watchedTickers = new Set();

    const logoWrap = document.getElementById('logoWrap');
    const companyLogo = document.getElementById('companyLogo');
    const logoFallback = document.getElementById('logoFallback');
    const companyNameEl = document.getElementById('companyName');
    const tickerSymbolEl = document.getElementById('tickerSymbol');
    const currentPriceEl = document.getElementById('currentPrice');
    const priceChangeEl = document.getElementById('priceChange');
    const heroBar = document.getElementById('heroBar');
    const snapshotTextEl = document.getElementById('snapshotText');
    const scorecardBody = document.getElementById('scorecardBody');
    const snapshotSentenceEl = document.getElementById('snapshotSentence');
    const riskSection = document.getElementById('riskSection');
    const riskList = document.getElementById('riskList');
    const newsList = document.getElementById('newsList');

    const chatMessages = document.getElementById('chatMessages');
    const chatForm = document.getElementById('chatForm');
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const chatHeader = document.getElementById('chatHeader');
    const chatPlaceholder = document.getElementById('chatPlaceholder');
    let chatHistory = [];

    const drawer = document.getElementById('drawer');
    const drawerOverlay = document.getElementById('drawerOverlay');
    const menuToggleBtn = document.getElementById('menuToggleBtn');
    const drawerCloseBtn = document.getElementById('drawerCloseBtn');
    const topBarTicker = document.getElementById('topBarTicker');
    const newsPromptBtn = document.getElementById('newsPromptBtn');
    const drawerItems = document.querySelectorAll('.drawer-item');
    const views = document.querySelectorAll('.view');

    const chartTabs = document.getElementById('chartTabs');
    const chartCanvas = document.getElementById('priceChart');
    const chartNote = document.getElementById('chartNote');

    const compareForm = document.getElementById('compareForm');
    const compareTickerInput = document.getElementById('compareTickerInput');
    const compareBtn = document.getElementById('compareBtn');
    const compareError = document.getElementById('compareError');
    const compareResults = document.getElementById('compareResults');

    const discoverForm = document.getElementById('discoverForm');
    const discoverInput = document.getElementById('discoverInput');
    const discoverBtn = document.getElementById('discoverBtn');
    const discoverError = document.getElementById('discoverError');
    const discoverResults = document.getElementById('discoverResults');

    const COLOR_UP = '#C96442';   // terracotta
    const COLOR_DOWN = '#E53E3E'; // red

    const COMPARE_COLOR_A = '#00D4AA';
    const COMPARE_COLOR_B = '#6C8EFF';

    let priceChart = null;
    let compareChart = null;
    let currentTicker = '';
    let currentFactors = [];
    let currentStockData = null;

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
            heroBar.className = 'hero-bar';
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
        heroBar.className = 'hero-bar ' + (change > 0 ? 'up' : change < 0 ? 'down' : '');
    }

    /* ---------- Scorecard table ---------- */

    const FACTOR_DESCRIPTIONS = {
        'P/E Ratio': "Compares stock price to earnings \u2014 higher means you're paying more for each dollar of profit.",
        'Analyst Price Target': "Wall Street consensus on where the stock should trade in 12 months.",
        'PEG Ratio': "P/E adjusted for growth rate \u2014 below 1 is cheap, above 2 means growth may not justify the price.",
        'RSI (14-day)': "Momentum indicator \u2014 above 70 is overbought, below 30 is oversold, 30\u201370 is neutral.",
        'Earnings Date': "Next scheduled earnings report \u2014 results can move the stock significantly in either direction."
    };

    function renderScorecard(factors) {
        scorecardBody.innerHTML = '';
        factors.forEach((f, i) => {
            const tr = document.createElement('tr');
            tr.className = `scorecard-body-row collapsed signal-${f.badge || 'grey'}`;
            tr.style.animationDelay = `${0.08 + i * 0.07}s`;
            tr.dataset.factorName = f.name;

            const head = `<div class="factor-row-head">
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

    /* ---------- News ---------- */

    function renderNews(news) {
        newsList.innerHTML = '';
        if (news && news.length > 0) {
            news.forEach(n => {
                const item = document.createElement('div');
                item.className = 'news-item';
                const published = n.publishedAt || '';
                const source = n.source || 'Finnhub';
                const titleHtml = n.url
                    ? `<a href="${escapeHtml(n.url)}" target="_blank" rel="noopener" class="news-title">${escapeHtml(n.title || '')}</a>`
                    : `<span class="news-title">${escapeHtml(n.title || '')}</span>`;
                item.innerHTML = `
                    ${titleHtml}
                    <span class="news-date">${escapeHtml(source)}${published ? ' &middot; ' + escapeHtml(published) : ''}</span>
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
        currentStockData = stockData;
        if (compareChart) { compareChart.destroy(); compareChart = null; }
        compareResults.innerHTML = '';
        delete compareResults.dataset.tickerB;
        delete compareResults.dataset.dataB;
        compareError.textContent = '';
        compareTickerInput.value = '';
        heroBar.className = 'hero-bar';

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

        /* Reset chat for new ticker */
        resetChat(stockData.ticker);

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
        topBarTicker.textContent = stockData.ticker;
        switchView('overview');
        checkWatchStatus(stockData.ticker);
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
        if (compareChart) { compareChart.destroy(); compareChart = null; }
        tickerInput.value = '';
        clearError();
        tickerInput.focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /* ---------- Compare feature ---------- */

    function refreshCompareIfVisible() {
        if (compareResults.querySelector('.compare-results')) {
            renderCompareTable();
        }
    }

    /* Compare needs ticker A's financial fields, so keep a trimmed copy. */
    function extractCompareData(stockData) {
        if (!stockData) return null;
        return {
            ticker: stockData.ticker,
            factors: (stockData.factors || []).map(f => ({ ...f })),
            current_price: stockData.current_price,
            pe_value: stockData.pe_value,
            analyst_upside_value: stockData.analyst_upside_value,
            peg_value: stockData.peg_value,
            market_cap: stockData.market_cap,
            week_52_high: stockData.week_52_high,
            week_52_low: stockData.week_52_low,
            dividend_yield: stockData.dividend_yield
        };
    }

    function numOrNull(v) {
        if (v == null) return null;
        const n = Number(v);
        return isFinite(n) ? n : null;
    }

    function formatPrice(v) {
        const n = numOrNull(v);
        if (n == null) return '—';
        return '$' + n.toFixed(2);
    }

    function formatMarketCap(v) {
        const n = numOrNull(v);
        if (n == null || n <= 0) return '—';
        const strip = (x) => x.toFixed(2).replace(/\.?0+$/, '');
        if (n >= 1e12) return '$' + strip(n / 1e12) + 'T';
        if (n >= 1e9) return '$' + strip(n / 1e9) + 'B';
        if (n >= 1e6) return '$' + strip(n / 1e6) + 'M';
        if (n >= 1e3) return '$' + strip(n / 1e3) + 'K';
        return '$' + n.toFixed(0);
    }

    function formatDividendYield(v) {
        const n = numOrNull(v);
        if (n == null || n <= 0) return '—';
        return n.toFixed(1) + '%';
    }

    function compute52wPosition(price, high, low) {
        const p = numOrNull(price), h = numOrNull(high), l = numOrNull(low);
        if (p == null || h == null || l == null) return null;
        if (h <= l) return p >= h ? 100 : 0;
        const pct = ((p - l) / (h - l)) * 100;
        return Math.max(0, Math.min(100, pct));
    }

    function positionCell(data) {
        const pos = compute52wPosition(data.current_price, data.week_52_high, data.week_52_low);
        if (pos == null) return '<span class="cmp-na">—</span>';
        return `<span class="cmp-pos">
                    <span class="cmp-pos-pct">${pos.toFixed(0)}%</span>
                    <span class="cmp-pos-track"><span class="cmp-pos-fill" style="width:${pos}%"></span></span>
                </span>`;
    }

    /* Winner for a valuation factor: 'A', 'B', or null (tie / missing). */
    function compareWinner(a, b, lowerBetter) {
        const an = numOrNull(a), bn = numOrNull(b);
        if (an == null && bn == null) return null;
        if (an == null) return 'B';
        if (bn == null) return 'A';
        if (an === bn) return null;
        if (lowerBetter) return an < bn ? 'A' : 'B';
        return an > bn ? 'A' : 'B';
    }

    /* Bar width (%) proportional to value, scaled against the row's max. */
    function valBarWidth(value, maxVal) {
        const n = numOrNull(value);
        if (n == null) return 0;
        if (maxVal <= 0) return 4;
        const ratio = Math.max(0, n) / maxVal;
        return Math.max(4, Math.min(100, ratio * 100));
    }

    function formatVal(value, decimals, suffix) {
        const n = numOrNull(value);
        if (n == null) return '—';
        return n.toFixed(decimals) + (suffix || '');
    }

    function valuationRow(cfg, dataA, dataB) {
        const a = dataA[cfg.key];
        const b = dataB[cfg.key];
        const an = numOrNull(a), bn = numOrNull(b);
        const maxVal = Math.max(an || 0, bn || 0);
        const winner = compareWinner(a, b, cfg.lowerBetter);
        const line = (side, value, color) => {
            const w = valBarWidth(value, maxVal);
            const isWinner = winner === side;
            return `<div class="cmp-bar-line cmp-side-${side.toLowerCase()}">
                        <div class="cmp-bar-track">
                            <div class="cmp-bar-fill" style="width:${w}%;background:${color}"></div>
                        </div>
                        <span class="cmp-bar-value">${escapeHtml(formatVal(value, cfg.decimals, cfg.suffix))}</span>
                        <span class="cmp-bar-check${isWinner ? ' is-winner' : ''}" aria-hidden="true">${isWinner ? '\u2713' : ''}</span>
                    </div>`;
        };
        return `<div class="cmp-bar-row">
                    <div class="cmp-bar-label">${escapeHtml(cfg.name)}</div>
                    <div class="cmp-bar-pair">
                        ${line('A', a, COMPARE_COLOR_A)}
                        ${line('B', b, COMPARE_COLOR_B)}
                    </div>
                </div>`;
    }

    function signalTable(factorsA, factorsB, tickerA, tickerB) {
        const factorOrder = ['P/E Ratio', 'Analyst Price Target', 'PEG Ratio', 'RSI (14-day)', 'Earnings Date'];
        const findFactor = (arr, name) => arr.find(f => f.name === name);
        const rows = factorOrder.map(name => {
            const a = findFactor(factorsA, name) || {};
            const b = findFactor(factorsB, name) || {};
            return `<tr>
                        <td class="compare-factor-name">${escapeHtml(name)}</td>
                        <td>${renderBadge(a.badge, a.text)}</td>
                        <td>${renderBadge(b.badge, b.text)}</td>
                    </tr>`;
        }).join('');
        return `<table class="compare-table">
                    <thead>
                        <tr>
                            <th>Factor</th>
                            <th><span class="compare-ticker">${escapeHtml(tickerA)}</span></th>
                            <th><span class="compare-ticker">${escapeHtml(tickerB)}</span></th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>`;
    }

    function financialsTable(dataA, dataB, tickerA, tickerB) {
        const rows = [
            ['Current Price', formatPrice(dataA.current_price), formatPrice(dataB.current_price)],
            ['Market Cap', formatMarketCap(dataA.market_cap), formatMarketCap(dataB.market_cap)],
            ['52W High', formatPrice(dataA.week_52_high), formatPrice(dataB.week_52_high)],
            ['52W Low', formatPrice(dataA.week_52_low), formatPrice(dataB.week_52_low)],
            ['52W Position', positionCell(dataA), positionCell(dataB)],
            ['Dividend Yield', formatDividendYield(dataA.dividend_yield), formatDividendYield(dataB.dividend_yield)]
        ];
        const body = rows.map((r, i) => `
            <tr class="${i % 2 === 0 ? 'cmp-row-even' : 'cmp-row-odd'}">
                <td class="cmp-fin-name">${escapeHtml(r[0])}</td>
                <td>${r[1]}</td>
                <td>${r[2]}</td>
            </tr>
        `).join('');
        return `<table class="cmp-fin-table">
                    <thead>
                        <tr>
                            <th>Metric</th>
                            <th><span class="cmp-th-a">${escapeHtml(tickerA)}</span></th>
                            <th><span class="cmp-th-b">${escapeHtml(tickerB)}</span></th>
                        </tr>
                    </thead>
                    <tbody>${body}</tbody>
                </table>`;
    }

    function renderCompareTable(stockBData) {
        // Re-render path: when called without data, reuse the last stored ticker B.
        let dataB = null;
        let tickerB = '';
        if (stockBData) {
            dataB = extractCompareData(stockBData);
            tickerB = stockBData.ticker;
            compareResults.dataset.tickerB = tickerB;
            compareResults.dataset.dataB = JSON.stringify(dataB);
        } else {
            tickerB = compareResults.dataset.tickerB || '';
            try {
                dataB = JSON.parse(compareResults.dataset.dataB || 'null');
            } catch (e) {
                dataB = null;
            }
        }
        if (!dataB) return;

        // Drop any existing compare chart before its canvas leaves the DOM.
        if (compareChart) { compareChart.destroy(); compareChart = null; }

        const dataA = extractCompareData(currentStockData) || { ticker: currentTicker };
        const tickerA = currentTicker || 'Stock A';

        const valuationCfg = [
            { name: 'P/E Ratio', key: 'pe_value', lowerBetter: true, decimals: 1 },
            { name: 'Analyst Upside', key: 'analyst_upside_value', lowerBetter: false, decimals: 1, suffix: '%' },
            { name: 'PEG Ratio', key: 'peg_value', lowerBetter: true, decimals: 1 }
        ];
        const valuationHtml = valuationCfg.map(c => valuationRow(c, dataA, dataB)).join('');

        compareResults.innerHTML = `
            <div class="compare-results">
                <section class="cmp-block cmp-chart-block">
                    <h3 class="section-title">Normalized Performance</h3>
                    <div class="cmp-chart-header">
                        <div class="cmp-chart-legend">
                            <span class="cmp-legend-item"><span class="cmp-legend-dot" style="background:${COMPARE_COLOR_A}"></span>${escapeHtml(tickerA)}</span>
                            <span class="cmp-legend-item"><span class="cmp-legend-dot" style="background:${COMPARE_COLOR_B}"></span>${escapeHtml(tickerB)}</span>
                        </div>
                        <div class="cmp-chart-periods" role="group" aria-label="Comparison chart period">
                            <button class="compare-period active" data-period="3mo" type="button">3M</button>
                            <button class="compare-period" data-period="6mo" type="button">6M</button>
                            <button class="compare-period" data-period="1y" type="button">1Y</button>
                        </div>
                    </div>
                    <div class="cmp-chart-wrap">
                        <canvas id="compareChart" aria-label="Normalized performance comparison chart"></canvas>
                    </div>
                    <p class="cmp-chart-note" id="compareChartNote">Loading chart…</p>
                </section>

                <section class="cmp-block cmp-valuation">
                    <h3 class="section-title">Valuation Comparison</h3>
                    ${valuationHtml}
                </section>

                <section class="cmp-block cmp-signals">
                    <h3 class="section-title">Signal Comparison</h3>
                    <div class="compare-table-wrap">
                        ${signalTable(dataA.factors || [], dataB.factors || [], tickerA, tickerB)}
                    </div>
                </section>

                <section class="cmp-block cmp-financials">
                    <h3 class="section-title">Key Financials</h3>
                    <div class="compare-table-wrap">
                        ${financialsTable(dataA, dataB, tickerA, tickerB)}
                    </div>
                </section>
            </div>
        `;

        // Load the chart asynchronously so it never blocks the main comparison.
        loadCompareChart(tickerA, tickerB, '3mo');
    }

    function buildCompareChart(canvas, dates, v1, v2, tickerA, tickerB) {
        const data = {
            labels: dates,
            datasets: [
                {
                    label: tickerA,
                    data: v1,
                    borderColor: COMPARE_COLOR_A,
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    pointHoverBackgroundColor: COMPARE_COLOR_A,
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2
                },
                {
                    label: tickerB,
                    data: v2,
                    borderColor: COMPARE_COLOR_B,
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    pointHoverBackgroundColor: COMPARE_COLOR_B,
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2
                }
            ]
        };
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0F1117',
                    titleColor: '#F0F0F0',
                    bodyColor: '#F0F0F0',
                    padding: 10,
                    displayColors: true,
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: '#2A2D3A' },
                    ticks: {
                        maxTicksLimit: 6,
                        maxRotation: 0,
                        color: '#6B7090',
                        font: { size: 11 }
                    }
                },
                y: {
                    grid: { color: '#2A2D3A' },
                    ticks: {
                        color: '#6B7090',
                        font: { size: 11 },
                        callback: (v) => Number(v).toFixed(0)
                    },
                    title: {
                        display: true,
                        text: 'Relative Performance (Base = 100)',
                        color: '#6B7090',
                        font: { size: 11 }
                    }
                }
            }
        };
        if (compareChart) {
            compareChart.data = data;
            compareChart.options = options;
            compareChart.update();
        } else {
            const ctx = canvas.getContext('2d');
            compareChart = new Chart(ctx, { type: 'line', data, options });
        }
    }

    async function loadCompareChart(tickerA, tickerB, period) {
        const canvas = document.getElementById('compareChart');
        const noteEl = document.getElementById('compareChartNote');
        if (typeof Chart === 'undefined' || !canvas) {
            if (noteEl) noteEl.textContent = 'Chart unavailable.';
            return;
        }
        if (noteEl) noteEl.textContent = 'Loading chart…';
        try {
            const resp = await fetch(`/api/compare-history?ticker1=${encodeURIComponent(tickerA)}&ticker2=${encodeURIComponent(tickerB)}&period=${encodeURIComponent(period)}`);
            const data = await resp.json();
            if (!resp.ok) {
                if (compareChart) { compareChart.destroy(); compareChart = null; }
                if (noteEl) noteEl.textContent = data.error || 'No historical data available.';
                return;
            }
            const dates = data.dates || [];
            const v1 = (data.ticker1 && data.ticker1.values) || [];
            const v2 = (data.ticker2 && data.ticker2.values) || [];
            if (!dates.length) {
                if (compareChart) { compareChart.destroy(); compareChart = null; }
                if (noteEl) noteEl.textContent = 'No overlapping historical dates.';
                return;
            }
            buildCompareChart(canvas, dates, v1, v2, tickerA, tickerB);
            if (noteEl) noteEl.textContent = `Normalized to 100 \u00b7 ${dates[0]} to ${dates[dates.length - 1]}`;
        } catch (err) {
            if (compareChart) { compareChart.destroy(); compareChart = null; }
            if (noteEl) noteEl.textContent = 'Unable to load comparison chart.';
        }
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

    /* ---------- Stock discovery ---------- */

    let discoverQuery = '';
    let discoverShownTickers = [];
    let discoverRounds = 0;
    const MAX_DISCOVER_ROUNDS = 3;

    async function runDiscover(event) {
        if (event) event.preventDefault();
        const query = discoverInput.value.trim();
        discoverError.textContent = '';
        if (!query) {
            discoverError.textContent = 'Please enter a topic or interest.';
            return;
        }

        discoverQuery = query;
        discoverShownTickers = [];
        discoverRounds = 0;
        discoverBtn.disabled = true;
        discoverResults.innerHTML = '<p class="discover-loading">Finding relevant stocks…</p>';

        try {
            const resp = await fetch('/api/suggest-stocks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });
            const data = await resp.json();
            if (!resp.ok) {
                discoverResults.innerHTML = '';
                discoverError.textContent = data.error || "Couldn't generate suggestions. Try a different topic.";
                return;
            }
            discoverResults.innerHTML = '';
            appendDiscoverCards(data.suggestions || []);
        } catch (err) {
            discoverResults.innerHTML = '';
            discoverError.textContent = 'Network error. Please try again.';
        } finally {
            discoverBtn.disabled = false;
        }
    }

    function appendDiscoverCards(suggestions) {
        if (!suggestions.length) {
            discoverResults.innerHTML = '<p class="discover-loading">No suggestions found. Try another topic.</p>';
            return;
        }
        suggestions.forEach(s => {
            if (!discoverShownTickers.includes(s.ticker)) {
                discoverShownTickers.push(s.ticker);
            }
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'discover-card';
            card.innerHTML = `
                <span class="discover-ticker">${escapeHtml(s.ticker)}</span>
                <span class="discover-name">${escapeHtml(s.name)}</span>
                <span class="discover-reason">${escapeHtml(s.reason)}</span>
            `;
            card.addEventListener('click', () => {
                tickerInput.value = s.ticker;
                generateBrief(s.ticker);
            });
            discoverResults.appendChild(card);
        });
        discoverRounds++;
        if (discoverRounds < MAX_DISCOVER_ROUNDS) {
            const showMore = document.createElement('button');
            showMore.type = 'button';
            showMore.className = 'discover-show-more';
            showMore.textContent = 'Show more suggestions';
            showMore.addEventListener('click', loadMoreDiscover);
            discoverResults.appendChild(showMore);
        }
    }

    async function loadMoreDiscover() {
        const showMoreBtn = discoverResults.querySelector('.discover-show-more');
        if (showMoreBtn) {
            showMoreBtn.disabled = true;
            showMoreBtn.textContent = 'Loading…';
        }

        try {
            const resp = await fetch('/api/suggest-stocks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: discoverQuery, exclude: discoverShownTickers })
            });
            const data = await resp.json();
            if (showMoreBtn) showMoreBtn.remove();
            if (!resp.ok) {
                discoverError.textContent = data.error || "Couldn't find more suggestions.";
                return;
            }
            appendDiscoverCards(data.suggestions || []);
        } catch (err) {
            if (showMoreBtn) {
                showMoreBtn.disabled = false;
                showMoreBtn.textContent = 'Show more suggestions';
            }
            discoverError.textContent = 'Network error. Please try again.';
        }
    }

    /* ---------- Chat panel ---------- */

    function resetChat(ticker) {
        chatHistory = [];
        chatMessages.innerHTML = `<p class="chat-placeholder" id="chatPlaceholder">Ask me anything about ${escapeHtml(ticker)}'s news, financials, or outlook.</p>`;
        chatInput.value = '';
        chatSendBtn.disabled = false;
    }

    function appendChatMsg(role, text) {
        const placeholder = document.getElementById('chatPlaceholder');
        if (placeholder) placeholder.remove();
        const msg = document.createElement('div');
        msg.className = `chat-msg chat-msg-${role}`;
        msg.innerHTML = `<span class="chat-bubble">${escapeHtml(text)}</span>`;
        if (role === 'assistant') {
            const saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.className = 'chat-save-btn';
            saveBtn.innerHTML = '<span class="save-icon">&#128190;</span> Save to <em>Reminiscences</em>';
            saveBtn.addEventListener('click', () => saveToReminiscences(text, saveBtn));
            msg.appendChild(saveBtn);
        }
        chatMessages.appendChild(msg);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function saveToReminiscences(content, btn) {
        if (!currentUser) {
            openAuthModal('signin');
            return;
        }
        const title = currentTicker ? `${currentTicker} — AI Insight` : 'AI Insight';
        btn.disabled = true;
        btn.innerHTML = 'Saving…';
        try {
            const resp = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticker: currentTicker, title, content })
            });
            const data = await resp.json();
            if (resp.ok) {
                btn.innerHTML = '<span class="save-icon">&#10003;</span> Saved to <em>Reminiscences</em>';
                btn.classList.add('saved');
            } else {
                btn.innerHTML = '<span class="save-icon">&#128190;</span> Save to <em>Reminiscences</em>';
                btn.disabled = false;
            }
        } catch (err) {
            btn.innerHTML = '<span class="save-icon">&#128190;</span> Save to <em>Reminiscences</em>';
            btn.disabled = false;
        }
    }

    async function sendChat(event) {
        if (event) event.preventDefault();
        const message = chatInput.value.trim();
        if (!message || !currentTicker) return;

        appendChatMsg('user', message);
        chatHistory.push({ role: 'user', content: message });
        chatInput.value = '';
        chatSendBtn.disabled = true;

        const thinkingMsg = document.createElement('div');
        thinkingMsg.className = 'chat-msg chat-msg-assistant';
        thinkingMsg.innerHTML = '<span class="chat-bubble">Thinking…</span>';
        chatMessages.appendChild(thinkingMsg);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        try {
            const resp = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, ticker: currentTicker, history: chatHistory.slice(0, -1) })
            });
            const data = await resp.json();
            thinkingMsg.remove();
            if (resp.ok && data.reply) {
                appendChatMsg('assistant', data.reply);
                chatHistory.push({ role: 'assistant', content: data.reply });
            } else {
                appendChatMsg('assistant', data.error || "Sorry, I couldn't generate a response.");
            }
        } catch (err) {
            thinkingMsg.remove();
            appendChatMsg('assistant', 'Network error. Please try again.');
        } finally {
            chatSendBtn.disabled = false;
            chatInput.focus();
        }
    }

    /* ---------- Drawer navigation ---------- */

    function openDrawer() {
        drawer.classList.add('open');
        drawerOverlay.classList.add('open');
    }

    function closeDrawer() {
        drawer.classList.remove('open');
        drawerOverlay.classList.remove('open');
    }

    function switchView(viewName) {
        views.forEach(v => v.classList.remove('active'));
        const target = document.getElementById(`view-${viewName}`);
        if (target) target.classList.add('active');
        drawerItems.forEach(item => {
            item.classList.toggle('active', item.dataset.view === viewName);
        });
        if (viewName === 'watchlist') loadWatchlist();
        if (viewName === 'reminiscences') loadReminiscences();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /* ---------- Watchlist view ---------- */

    const WL_EMPTY_MSG = 'Your watchlist is empty. Search a stock and click \u2605 to add it.';

    function updateWatchlistSummary(container, count) {
        const summary = document.getElementById('watchlistSummary');
        if (count > 0) {
            summary.textContent = `${count} stock${count === 1 ? '' : 's'} \u00b7 Updated just now`;
        } else {
            summary.textContent = '';
        }
    }

    function renderWatchlistSkeleton() {
        const card = document.createElement('div');
        card.className = 'wl-card wl-skeleton';
        card.innerHTML = `
            <div class="wl-row">
                <div class="wl-bar"></div>
                <div class="wl-info">
                    <span class="sk-line wl-ticker"></span>
                    <span class="sk-line wl-name"></span>
                </div>
                <div class="wl-prices">
                    <span class="sk-line wl-price"></span>
                    <span class="sk-line wl-change"></span>
                </div>
                <div class="wl-actions">
                    <span class="sk-line" style="width:18px;height:18px;border-radius:4px"></span>
                    <span class="sk-line" style="width:18px;height:18px;border-radius:4px"></span>
                </div>
            </div>
        `;
        return card;
    }

    function formatWlPrice(v) {
        const n = numOrNull(v);
        if (n == null) return '\u2014';
        return '$' + n.toFixed(2);
    }

    function formatWlChange(change, changePct) {
        const pct = numOrNull(changePct);
        const chg = numOrNull(change);
        if (pct != null) {
            const arrow = pct >= 0 ? '\u25B2' : '\u25BC';
            return `${arrow} ${Math.abs(pct).toFixed(2)}%`;
        }
        if (chg != null) {
            const arrow = chg >= 0 ? '\u25B2' : '\u25BC';
            return `${arrow} ${Math.abs(chg).toFixed(2)}`;
        }
        return '\u2014';
    }

    function wlDirection(change, changePct) {
        const pct = numOrNull(changePct);
        const chg = numOrNull(change);
        if (pct != null) return pct >= 0 ? 'up' : 'down';
        if (chg != null) return chg >= 0 ? 'up' : 'down';
        return 'flat';
    }

    function renderWatchlistCard(stock) {
        const ticker = (stock.ticker || '').toUpperCase();
        const name = stock.name || '';
        const direction = wlDirection(stock.change, stock.change_pct);

        const card = document.createElement('div');
        card.className = 'wl-card';
        card.dataset.ticker = ticker;
        card.innerHTML = `
            <div class="wl-row" role="button" tabindex="0">
                <div class="wl-bar ${direction}"></div>
                <div class="wl-info">
                    <span class="wl-ticker">${escapeHtml(ticker)}</span>
                    <span class="wl-name">${escapeHtml(name)}</span>
                </div>
                <div class="wl-prices">
                    <span class="wl-price">${escapeHtml(formatWlPrice(stock.price))}</span>
                    <span class="wl-change ${direction}">${escapeHtml(formatWlChange(stock.change, stock.change_pct))}</span>
                </div>
                <div class="wl-actions">
                    <button class="wl-notes-btn" type="button" aria-label="Show notes">\uD83D\uDCDD</button>
                    <button class="wl-remove-btn" type="button" aria-label="Remove from watchlist">&times;</button>
                </div>
            </div>
            <div class="wl-notes-panel" hidden></div>
        `;

        const row = card.querySelector('.wl-row');
        row.addEventListener('click', (e) => {
            if (e.target.closest('.wl-actions')) return;
            closeDrawer();
            generateBrief(ticker);
        });
        row.addEventListener('keydown', (e) => {
            if (e.target.closest('.wl-actions')) return;
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                closeDrawer();
                generateBrief(ticker);
            }
        });

        card.querySelector('.wl-notes-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleNotesPanel(card, ticker);
        });

        card.querySelector('.wl-remove-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                await fetch(`/api/watch/${encodeURIComponent(ticker)}`, { method: 'DELETE' });
                watchedTickers.delete(ticker);
            } catch (err) {
                // ignore
            }
            card.remove();
            const container = document.getElementById('watchlistContent');
            const remaining = container.querySelectorAll('.wl-card:not(.wl-skeleton)').length;
            if (remaining === 0) {
                container.innerHTML = `<p class="no-news">${WL_EMPTY_MSG}</p>`;
            }
            updateWatchlistSummary(container, remaining);
            if (currentTicker && currentTicker.toUpperCase() === ticker) {
                updateWatchBtn(false);
            }
        });

        return card;
    }

    async function toggleNotesPanel(card, ticker) {
        const panel = card.querySelector('.wl-notes-panel');
        if (!panel) return;
        const isOpen = !panel.hidden;
        if (isOpen) {
            panel.hidden = true;
            card.classList.remove('notes-open');
            return;
        }
        panel.hidden = false;
        card.classList.add('notes-open');
        panel.innerHTML = '<p class="wl-notes-loading">Loading\u2026</p>';
        await loadTickerNotes(card, ticker);
    }

    async function loadTickerNotes(card, ticker) {
        const panel = card.querySelector('.wl-notes-panel');
        if (!panel) return;
        try {
            const resp = await fetch(`/api/notes?ticker=${encodeURIComponent(ticker)}`);
            const data = await resp.json();
            const notes = data.notes || [];
            renderNotesPanel(panel, notes, ticker, card);
        } catch (err) {
            panel.innerHTML = '<p class="wl-notes-empty">Failed to load notes.</p>';
        }
    }

    function renderNotesPanel(panel, notes, ticker, card) {
        panel.innerHTML = '';
        const list = document.createElement('div');
        list.className = 'wl-notes-list';
        if (notes.length === 0) {
            list.innerHTML = '<p class="wl-notes-empty">No notes for this stock yet.</p>';
        } else {
            notes.forEach(n => list.appendChild(renderWatchlistNoteItem(n, ticker, card)));
        }
        panel.appendChild(list);

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'wl-add-note-btn';
        addBtn.textContent = '+ Add note';
        addBtn.addEventListener('click', () => {
            addBtn.hidden = true;
            const form = renderWatchlistNoteForm(ticker, card, () => {
                addBtn.hidden = false;
                form.remove();
            });
            panel.appendChild(form);
        });
        panel.appendChild(addBtn);
    }

    function renderWatchlistNoteItem(note, ticker, card) {
        const item = document.createElement('div');
        item.className = 'wl-note';
        item.dataset.id = note.id;
        item.innerHTML = `
            <div class="wl-note-head">
                <span class="wl-note-title">${escapeHtml(note.title)}</span>
                <button class="wl-note-edit" type="button" aria-label="Edit note">\u270E</button>
                <button class="wl-note-del" type="button" aria-label="Delete note">&times;</button>
            </div>
            <p class="wl-note-body">${escapeHtml(note.content)}</p>
            <span class="wl-note-date">${escapeHtml(note.created_at)}</span>
        `;

        item.querySelector('.wl-note-del').addEventListener('click', async () => {
            try {
                await fetch(`/api/notes/${note.id}`, { method: 'DELETE' });
            } catch (err) {
                // ignore
            }
            await loadTickerNotes(card, ticker);
        });

        item.querySelector('.wl-note-edit').addEventListener('click', () => {
            startWatchlistNoteEdit(item, note, ticker, card);
        });

        return item;
    }

    function renderWatchlistNoteForm(ticker, card, onCancel) {
        const form = document.createElement('div');
        form.className = 'wl-note-form';
        form.innerHTML = `
            <input class="wl-note-input-title" type="text" placeholder="Note title" maxlength="255">
            <textarea class="wl-note-input-content" placeholder="Write your note..."></textarea>
            <div class="wl-note-form-actions">
                <button class="wl-note-save" type="button">Save</button>
                <button class="wl-note-cancel" type="button">Cancel</button>
            </div>
        `;
        const titleInput = form.querySelector('.wl-note-input-title');
        const contentInput = form.querySelector('.wl-note-input-content');
        titleInput.focus();

        form.querySelector('.wl-note-cancel').addEventListener('click', onCancel);
        form.querySelector('.wl-note-save').addEventListener('click', async () => {
            const title = titleInput.value.trim();
            const content = contentInput.value.trim();
            if (!title || !content) return;
            const saveBtn = form.querySelector('.wl-note-save');
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving\u2026';
            try {
                await fetch('/api/notes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ticker, title, content })
                });
            } catch (err) {
                // ignore
            }
            await loadTickerNotes(card, ticker);
        });

        return form;
    }

    function startWatchlistNoteEdit(item, note, ticker, card) {
        const titleEl = item.querySelector('.wl-note-title');
        const bodyEl = item.querySelector('.wl-note-body');
        const editBtn = item.querySelector('.wl-note-edit');
        const delBtn = item.querySelector('.wl-note-del');
        if (!titleEl || !bodyEl) return;

        titleEl.outerHTML = `<input class="wl-note-edit-title" value="${escapeHtml(note.title)}">`;
        bodyEl.outerHTML = `<textarea class="wl-note-edit-body">${escapeHtml(note.content)}</textarea>`;

        editBtn.innerHTML = '\u2713';
        editBtn.setAttribute('aria-label', 'Save note');
        delBtn.innerHTML = '&times;';
        delBtn.setAttribute('aria-label', 'Cancel edit');

        const newTitle = item.querySelector('.wl-note-edit-title');
        const newBody = item.querySelector('.wl-note-edit-body');
        newBody.focus();

        editBtn.onclick = async () => {
            const t = newTitle.value.trim();
            const c = newBody.value.trim();
            if (!t || !c) return;
            editBtn.disabled = true;
            try {
                await fetch(`/api/notes/${note.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: t, content: c })
                });
            } catch (err) {
                // ignore
            }
            await loadTickerNotes(card, ticker);
        };

        delBtn.onclick = async () => {
            await loadTickerNotes(card, ticker);
        };
    }

    async function loadWatchlist() {
        const content = document.getElementById('watchlistContent');
        const summary = document.getElementById('watchlistSummary');
        if (!currentUser) {
            summary.textContent = '';
            content.innerHTML = '<p class="no-news">Please sign in to view your watchlist.</p>';
            return;
        }
        summary.textContent = '';
        content.innerHTML = '';
        for (let i = 0; i < 3; i++) {
            content.appendChild(renderWatchlistSkeleton());
        }
        try {
            const resp = await fetch('/api/watchlist-prices');
            const data = await resp.json();
            const stocks = Array.isArray(data) ? data : [];
            content.innerHTML = '';
            if (stocks.length === 0) {
                content.innerHTML = `<p class="no-news">${WL_EMPTY_MSG}</p>`;
                return;
            }
            updateWatchlistSummary(content, stocks.length);
            stocks.forEach(s => content.appendChild(renderWatchlistCard(s)));
        } catch (err) {
            content.innerHTML = '<p class="no-news">Failed to load watchlist.</p>';
        }
    }

    /* ---------- Reminiscences view ---------- */

    function renderRemNoteCard(n) {
        const card = document.createElement('div');
        card.className = 'note-card';
        card.dataset.id = n.id;
        const tickerHtml = n.ticker ? `<span class="note-ticker">${escapeHtml(n.ticker)}</span>` : '';
        card.innerHTML = `
            <div class="note-header">
                ${tickerHtml}
                <span class="note-title">${escapeHtml(n.title)}</span>
                <button class="note-edit" type="button" aria-label="Edit note">\u270E</button>
                <button class="note-delete" type="button" aria-label="Delete note">&times;</button>
            </div>
            <p class="note-content">${escapeHtml(n.content)}</p>
            <span class="note-date">${escapeHtml(n.created_at)}</span>
        `;
        card.querySelector('.note-edit').addEventListener('click', () => startEditNote(card, n));
        card.querySelector('.note-delete').addEventListener('click', async () => {
            try {
                await fetch(`/api/notes/${n.id}`, { method: 'DELETE' });
            } catch (err) {
                // ignore
            }
            loadReminiscences();
        });
        return card;
    }

    async function loadReminiscences() {
        const content = document.getElementById('reminiscencesContent');
        if (!currentUser) {
            content.innerHTML = '<p class="no-news">Please sign in to start your notebook.</p>';
            return;
        }
        content.innerHTML = '<p class="discover-loading">Loading\u2026</p>';
        try {
            const [notesResp, pricesResp] = await Promise.all([
                fetch('/api/notes'),
                fetch('/api/watchlist-prices')
            ]);
            const notesData = await notesResp.json();
            const notes = notesData.notes || [];
            if (notes.length === 0) {
                content.innerHTML = '<p class="no-news">No notes yet. Save AI insights or add notes from your watchlist to build your notebook.</p>';
                return;
            }

            let nameMap = {};
            try {
                const prices = await pricesResp.json();
                if (Array.isArray(prices)) {
                    prices.forEach(p => {
                        if (p.ticker && p.name) nameMap[p.ticker.toUpperCase()] = p.name;
                    });
                }
            } catch (err) {
                // company names are optional
            }

            const groups = {};
            const general = [];
            notes.forEach(n => {
                const t = (n.ticker || '').toUpperCase();
                if (t) {
                    if (!groups[t]) groups[t] = [];
                    groups[t].push(n);
                } else {
                    general.push(n);
                }
            });

            content.innerHTML = '';
            const tickers = Object.keys(groups).sort();
            tickers.forEach(t => {
                const group = document.createElement('div');
                group.className = 'rem-group';
                const name = nameMap[t] || '';
                group.innerHTML = `<div class="rem-group-head"><span class="rem-group-ticker">${escapeHtml(t)}</span>${name ? `<span class="rem-group-name">${escapeHtml(name)}</span>` : ''}</div>`;
                const list = document.createElement('div');
                list.className = 'rem-group-list';
                groups[t].forEach(n => list.appendChild(renderRemNoteCard(n)));
                group.appendChild(list);
                content.appendChild(group);
            });
            if (general.length) {
                const group = document.createElement('div');
                group.className = 'rem-group';
                group.innerHTML = '<div class="rem-group-head"><span class="rem-group-ticker">General</span></div>';
                const list = document.createElement('div');
                list.className = 'rem-group-list';
                general.forEach(n => list.appendChild(renderRemNoteCard(n)));
                group.appendChild(list);
                content.appendChild(group);
            }
        } catch (err) {
            content.innerHTML = '<p class="no-news">Failed to load notes.</p>';
        }
    }

    function startEditNote(card, note) {
        const titleEl = card.querySelector('.note-title');
        const contentEl = card.querySelector('.note-content');
        if (!titleEl || !contentEl) return;
        const editBtn = card.querySelector('.note-edit');
        const deleteBtn = card.querySelector('.note-delete');

        const oldTitle = note.title;
        const oldContent = note.content;

        titleEl.outerHTML = `<input class="note-edit-title" value="${escapeHtml(oldTitle)}">`;
        contentEl.outerHTML = `<textarea class="note-edit-content">${escapeHtml(oldContent)}</textarea>`;

        editBtn.innerHTML = '&#10003;';
        editBtn.setAttribute('aria-label', 'Save note');
        deleteBtn.innerHTML = '&times;';
        deleteBtn.setAttribute('aria-label', 'Cancel edit');

        const saveBtn = editBtn;
        const cancelBtn = deleteBtn;
        const newTitleEl = card.querySelector('.note-edit-title');
        const newContentEl = card.querySelector('.note-edit-content');
        newContentEl.focus();

        const save = async () => {
            if (!newTitleEl || !document.body.contains(newTitleEl)) return;
            const newTitle = newTitleEl.value.trim();
            const newContent = newContentEl.value.trim();
            if (!newTitle || !newContent) return;
            saveBtn.onclick = null;
            cancelBtn.onclick = null;
            try {
                await fetch(`/api/notes/${note.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: newTitle, content: newContent })
                });
            } catch (err) {
                // ignore
            }
            loadReminiscences();
        };

        const cancel = () => {
            if (!document.body.contains(newTitleEl)) return;
            saveBtn.onclick = null;
            cancelBtn.onclick = null;
            loadReminiscences();
        };

        saveBtn.onclick = save;
        cancelBtn.onclick = cancel;
    }

    /* ---------- Auth ---------- */

    async function checkAuth() {
        try {
            const resp = await fetch('/api/me');
            const data = await resp.json();
            currentUser = data.email;
            updateAuthUI();
        } catch (err) {
            currentUser = null;
        }
    }

    function updateAuthUI() {
        if (currentUser) {
            authArea.innerHTML = `<span class="auth-user">${escapeHtml(currentUser)}</span> <button class="auth-btn" id="signoutBtn" type="button">Sign out</button>`;
            document.getElementById('signoutBtn').addEventListener('click', signout);
        } else {
            authArea.innerHTML = `<button class="auth-btn" id="signinBtn" type="button">Sign in</button>`;
            document.getElementById('signinBtn').addEventListener('click', () => openAuthModal('signin'));
        }
    }

    function openAuthModal(mode) {
        authMode = mode;
        authError.textContent = '';
        authEmail.value = '';
        authPassword.value = '';
        tabSignin.classList.toggle('active', mode === 'signin');
        tabRegister.classList.toggle('active', mode === 'register');
        authSubmit.textContent = mode === 'signin' ? 'Sign in' : 'Register';
        authModal.classList.add('open');
        authEmail.focus();
    }

    function closeAuthModal() {
        authModal.classList.remove('open');
    }

    async function handleAuthSubmit(event) {
        if (event) event.preventDefault();
        const email = authEmail.value.trim();
        const password = authPassword.value;
        if (!email || !password) {
            authError.textContent = 'Please fill in both fields.';
            return;
        }
        authSubmit.disabled = true;
        authError.textContent = '';
        try {
            const endpoint = authMode === 'signin' ? '/api/login' : '/api/register';
            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await resp.json();
            if (resp.ok) {
                currentUser = data.email;
                updateAuthUI();
                closeAuthModal();
            } else {
                authError.textContent = data.error || 'Something went wrong.';
            }
        } catch (err) {
            authError.textContent = 'Network error. Please try again.';
        } finally {
            authSubmit.disabled = false;
        }
    }

    async function signout() {
        try {
            await fetch('/api/logout', { method: 'POST' });
            currentUser = null;
            watchedTickers.clear();
            updateAuthUI();
            updateWatchBtn();
        } catch (err) {
            // ignore
        }
    }

    /* ---------- Watch (stock favorites) ---------- */

    async function checkWatchStatus(ticker) {
        if (!currentUser) {
            updateWatchBtn(false);
            return;
        }
        try {
            const resp = await fetch(`/api/watch/${encodeURIComponent(ticker)}/status`);
            if (resp.ok) {
                const data = await resp.json();
                if (data.watched) watchedTickers.add(ticker);
                else watchedTickers.delete(ticker);
            }
        } catch (err) {
            // ignore
        }
        updateWatchBtn();
    }

    function updateWatchBtn(watched) {
        if (watched === undefined) {
            watched = currentTicker && watchedTickers.has(currentTicker);
        }
        if (watched) {
            watchBtn.classList.add('watched');
            watchBtn.querySelector('.watch-label').textContent = 'Watching';
        } else {
            watchBtn.classList.remove('watched');
            watchBtn.querySelector('.watch-label').textContent = 'Watch';
        }
    }

    async function toggleWatch() {
        if (!currentUser) {
            openAuthModal('signin');
            return;
        }
        if (!currentTicker) return;
        const ticker = currentTicker;
        const isWatched = watchedTickers.has(ticker);
        try {
            if (isWatched) {
                await fetch(`/api/watch/${encodeURIComponent(ticker)}`, { method: 'DELETE' });
                watchedTickers.delete(ticker);
            } else {
                await fetch('/api/watch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ticker })
                });
                watchedTickers.add(ticker);
            }
            updateWatchBtn();
        } catch (err) {
            // ignore
        }
    }

    /* ---------- Events ---------- */

    menuToggleBtn.addEventListener('click', openDrawer);
    drawerCloseBtn.addEventListener('click', closeDrawer);
    drawerOverlay.addEventListener('click', closeDrawer);

    drawerItems.forEach(item => {
        item.addEventListener('click', () => {
            switchView(item.dataset.view);
            closeDrawer();
        });
    });

    newsPromptBtn.addEventListener('click', () => {
        switchView('chat');
        if (currentTicker) {
            chatInput.value = `Summarize the recent news for ${currentTicker}`;
            chatForm.requestSubmit();
        }
    });
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

    compareResults.addEventListener('click', (e) => {
        const btn = e.target.closest('.compare-period');
        if (!btn) return;
        const period = btn.dataset.period;
        compareResults.querySelectorAll('.compare-period').forEach(b => {
            b.classList.toggle('active', b === btn);
        });
        const tickerA = currentTicker;
        const tickerB = compareResults.dataset.tickerB;
        if (tickerA && tickerB) loadCompareChart(tickerA, tickerB, period);
    });

    discoverForm.addEventListener('submit', runDiscover);

    chatForm.addEventListener('submit', sendChat);

    document.querySelectorAll('.chat-quick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const promptType = btn.dataset.prompt;
            const prompts = {
                summarize: `Summarize the recent news for ${currentTicker}`,
                risks: `What are the key risks for ${currentTicker} right now?`,
                valuation: `How does ${currentTicker}'s valuation look based on its P/E and PEG ratios?`,
                watchlist: `Compare my watchlist stocks and give me a cross-stock insight`
            };
            const message = prompts[promptType];
            if (!message) return;

            if (promptType === 'watchlist' && (!currentUser || watchedTickers.size === 0)) {
                chatInput.value = message;
                appendChatMsg('user', message);
                appendChatMsg('assistant', currentUser
                    ? 'You have no stocks in your watchlist yet. Use the star button on any stock page to add it to your watchlist, then try again.'
                    : 'Please sign in and add some stocks to your watchlist first, then I can compare them for you.');
                chatInput.value = '';
                return;
            }

            chatInput.value = message;
            chatForm.requestSubmit();
        });
    });

    /* Auth event listeners */
    document.getElementById('signinBtn').addEventListener('click', () => openAuthModal('signin'));
    authModalClose.addEventListener('click', closeAuthModal);
    authModal.addEventListener('click', (e) => { if (e.target === authModal) closeAuthModal(); });
    tabSignin.addEventListener('click', () => openAuthModal('signin'));
    tabRegister.addEventListener('click', () => openAuthModal('register'));
    authForm.addEventListener('submit', handleAuthSubmit);
    watchBtn.addEventListener('click', toggleWatch);

    checkAuth();
    tickerInput.focus();
});

