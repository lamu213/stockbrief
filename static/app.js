document.addEventListener('DOMContentLoaded', () => {
    const tickerInput = document.getElementById('tickerInput');
    const generateBtn = document.getElementById('generateBtn');
    const errorMsg = document.getElementById('errorMsg');
    const loadingSection = document.getElementById('loadingSection');
    const briefContent = document.getElementById('briefContent');
    const inputView = document.getElementById('inputView');
    const newSearchBtn = document.getElementById('newSearchBtn');

    const companyNameEl = document.getElementById('companyName');
    const tickerSymbolEl = document.getElementById('tickerSymbol');
    const currentPriceEl = document.getElementById('currentPrice');
    const priceChangeEl = document.getElementById('priceChange');
    const snapshotTextEl = document.getElementById('snapshotText');
    const factorGrid = document.getElementById('factorGrid');
    const snapshotSentenceEl = document.getElementById('snapshotSentence');
    const riskSection = document.getElementById('riskSection');
    const riskList = document.getElementById('riskList');
    const newsList = document.getElementById('newsList');

    const chartTabs = document.getElementById('chartTabs');
    const chartCanvas = document.getElementById('priceChart');
    const chartNote = document.getElementById('chartNote');

    const COLOR_UP = '#C96442';   // terracotta
    const COLOR_DOWN = '#E53E3E'; // red

    let priceChart = null;
    let currentTicker = '';

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
        return `<span class="${cls}">${badgeLabel(badge, text)}</span>`;
    }

    /* ---------- Chart ---------- */

    function chartColor(prices) {
        if (!prices || prices.length < 2) return COLOR_UP;
        return prices[prices.length - 1] >= prices[0] ? COLOR_UP : COLOR_DOWN;
    }

    function buildChart(dates, prices) {
        if (typeof Chart === 'undefined' || !chartCanvas) {
            chartNote.textContent = 'Chart unavailable.';
            return;
        }
        const color = chartColor(prices);
        const ctx = chartCanvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, chartCanvas.height || 300);
        gradient.addColorStop(0, hexToRgba(color, 0.28));
        gradient.addColorStop(1, hexToRgba(color, 0));

        const data = {
            labels: dates,
            datasets: [{
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
            }]
        };

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
            buildChart(data.dates, data.prices);
            chartNote.textContent = `Daily closing prices · ${data.dates[0]} to ${data.dates[data.dates.length - 1]}`;
            return data;
        } catch (err) {
            if (priceChart) { priceChart.destroy(); priceChart = null; }
            chartNote.textContent = 'Unable to load price chart.';
            return null;
        }
    }

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

    /* ---------- Render brief ---------- */

    function renderBrief(stockData) {
        currentTicker = stockData.ticker;

        companyNameEl.textContent = stockData.company_name || stockData.ticker;
        tickerSymbolEl.textContent = stockData.ticker;

        const price = Number(stockData.current_price);
        if (isFinite(price) && price > 0) {
            animateCountUp(currentPriceEl, price);
        } else {
            currentPriceEl.textContent = '—';
        }

        snapshotTextEl.textContent = stockData.snapshot || '';

        /* Scorecard cards */
        factorGrid.innerHTML = '';
        (stockData.factors || []).forEach((f, i) => {
            const card = document.createElement('div');
            card.className = `factor-card signal-${f.badge || 'grey'}`;
            card.style.animationDelay = `${0.08 + i * 0.09}s`;
            card.innerHTML = `
                <div class="factor-info">
                    <div class="factor-name">${f.name}</div>
                    <div class="factor-explanation">${f.explanation || 'No explanation available.'}</div>
                </div>
                ${renderBadge(f.badge, f.text)}
            `;
            factorGrid.appendChild(card);
        });

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
                    <span><span class="risk-label">${flag.name}:</span> ${flag.explanation}</span>
                `;
                riskList.appendChild(li);
            });
        } else {
            riskSection.classList.add('hidden');
        }

        /* News */
        newsList.innerHTML = '';
        if (stockData.news && stockData.news.length > 0) {
            stockData.news.forEach(n => {
                const item = document.createElement('div');
                item.className = 'news-item';
                item.innerHTML = `
                    <a href="${n.url || '#'}" target="_blank" rel="noopener" class="news-title">${n.title}</a>
                    <span class="news-date">${n.publishedAt || ''}</span>
                `;
                newsList.appendChild(item);
            });
        } else {
            newsList.innerHTML = '<p class="no-news">No recent news found.</p>';
        }

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

    tickerInput.focus();
});
