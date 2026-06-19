document.addEventListener('DOMContentLoaded', () => {
    const tickerInput = document.getElementById('tickerInput');
    const generateBtn = document.getElementById('generateBtn');
    const errorMsg = document.getElementById('errorMsg');
    const loadingSection = document.getElementById('loadingSection');
    const briefContent = document.getElementById('briefContent');

    const companyNameEl = document.getElementById('companyName');
    const currentPriceEl = document.getElementById('currentPrice');
    const snapshotTextEl = document.getElementById('snapshotText');
    const factorGrid = document.getElementById('factorGrid');
    const snapshotSentenceEl = document.getElementById('snapshotSentence');
    const riskSection = document.getElementById('riskSection');
    const riskList = document.getElementById('riskList');
    const newsList = document.getElementById('newsList');

    function showError(msg) {
        errorMsg.textContent = msg;
        briefContent.classList.add('hidden');
        loadingSection.classList.add('hidden');
    }

    function clearError() {
        errorMsg.textContent = '';
    }

    function setLoading(isLoading) {
        if (isLoading) {
            loadingSection.classList.remove('hidden');
            briefContent.classList.add('hidden');
            clearError();
        } else {
            loadingSection.classList.add('hidden');
        }
    }

    function renderBadge(badge) {
        const cls = `badge badge-${badge}`;
        const label = badge === 'green' ? 'Green'
            : badge === 'yellow' ? 'Yellow'
            : badge === 'red' ? 'Red'
            : 'Data unavailable';
        return `<span class="${cls}">${label}</span>`;
    }

    async function generateBrief() {
        const ticker = tickerInput.value.trim();
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
            setLoading(false);
            briefContent.classList.remove('hidden');
        } catch (err) {
            showError('Network error. Please check your connection and try again.');
        }
    }

    function renderBrief(data) {
        companyNameEl.textContent = `${data.company_name} (${data.ticker})`;
        currentPriceEl.textContent = data.current_price
            ? `Current price: $${Number(data.current_price).toFixed(2)}`
            : '';
        snapshotTextEl.textContent = data.snapshot || '';

        factorGrid.innerHTML = '';
        data.factors.forEach((f, i) => {
            const card = document.createElement('div');
            card.className = 'factor-card';
            card.style.animationDelay = `${0.05 + i * 0.07}s`;
            card.innerHTML = `
                <div class="factor-info">
                    <div class="factor-name">${f.name}</div>
                    <div class="factor-explanation">${f.explanation || 'No explanation available.'}</div>
                </div>
                ${renderBadge(f.badge)}
            `;
            factorGrid.appendChild(card);
        });

        snapshotSentenceEl.textContent = data.snapshot_sentence || '';

        if (data.risk_flags && data.risk_flags.length > 0) {
            riskSection.classList.remove('hidden');
            riskList.innerHTML = '';
            data.risk_flags.forEach(flag => {
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

        newsList.innerHTML = '';
        if (data.news && data.news.length > 0) {
            data.news.forEach(n => {
                const item = document.createElement('div');
                item.className = 'news-item';
                item.innerHTML = `
                    <a href="${n.url || '#'}" target="_blank" rel="noopener" class="news-title">${n.title}</a>
                    <span class="news-date">${n.publishedAt}</span>
                `;
                newsList.appendChild(item);
            });
        } else {
            newsList.innerHTML = '<p class="no-news">No recent news found.</p>';
        }
    }

    generateBtn.addEventListener('click', generateBrief);
    tickerInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') generateBrief();
    });
});
