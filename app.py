import os
import requests
import yfinance as yf
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_from_directory

app = Flask(__name__)

NEWS_API_KEY = os.environ.get('NEWS_API_KEY', '')


@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/api/research', methods=['POST'])
def research():
    ticker = request.json.get('ticker', '').strip().upper()
    if not ticker:
        return jsonify({'error': 'No ticker provided'}), 400

    stock = yf.Ticker(ticker)
    info = stock.info

    if not info or info.get('regularMarketPrice') is None:
        return jsonify({'error': f'Could not fetch data for {ticker}'}), 404

    # --- Company Snapshot ---
    long_biz = info.get('longBusinessSummary', '')
    short_desc = info.get('shortName', ticker)
    sector = info.get('sector', '')
    industry = info.get('industry', '')
    if long_biz:
        sentence = long_biz.split('.')[0] + '.'
        snapshot = f"{short_desc} ({ticker}) operates in the {sector} sector, specifically {industry.lower()}. {sentence}"
    else:
        snapshot = f"{short_desc} ({ticker}) is a company in the {sector} sector."

    # --- Financial Data ---
    price = info.get('regularMarketPrice') or info.get('currentPrice')
    pe = info.get('trailingPE') or info.get('forwardPE')
    target = info.get('targetMeanPrice')
    peg = info.get('pegRatio')

    # RSI (approximate from recent history)
    rsi = None
    try:
        hist = stock.history(period='3mo')
        if len(hist) >= 15:
            gains, losses = [], []
            for i in range(1, min(15, len(hist))):
                diff = hist['Close'].iloc[-i] - hist['Close'].iloc[-i-1]
                gains.append(diff if diff > 0 else 0)
                losses.append(-diff if diff < 0 else 0)
            avg_gain = sum(gains) / len(gains) if gains else 0
            avg_loss = sum(losses) / len(losses) if losses else 0
            if avg_loss != 0:
                rs = avg_gain / avg_loss
                rsi = round(100 - (100 / (1 + rs)))
            else:
                rsi = 100
    except Exception:
        pass

    # Earnings date
    earnings_date = None
    earnings_days = None
    try:
        cal = stock.calendar
        if cal is not None and not cal.empty:
            ed = cal.index[0] if hasattr(cal, 'index') else None
            if ed is None and 'Earnings Date' in cal:
                ed = cal['Earnings Date']
            if ed is not None:
                if hasattr(ed, 'iloc'):
                    ed = ed.iloc[0]
                earnings_date = str(ed.date()) if hasattr(ed, 'date') else str(ed)[:10]
                ed_dt = datetime.strptime(earnings_date[:10], '%Y-%m-%d')
                earnings_days = (ed_dt - datetime.now()).days
    except Exception:
        pass

    # --- Scorecard ---
    scorecard = []

    def badge_and_note(value_label, status, note):
        scorecard.append({'value': value_label, 'status': status, 'note': note})

    # P/E
    if pe and pe > 0:
        pe_status = 'green' if pe < 15 else ('yellow' if pe <= 25 else 'red')
        pe_note = f"P/E of {pe:.1f} is {'low' if pe < 15 else 'moderate' if pe <= 25 else 'high'} — {'suggests the stock may be undervalued' if pe < 15 else 'in line with market expectations' if pe <= 25 else 'could indicate overvaluation or high growth expectations'}."
        badge_and_note(f"{pe:.1f}", pe_status, pe_note)
    else:
        badge_and_note('—', 'grey', 'Data unavailable')

    # Price target
    if target and price and price > 0:
        upside = (target - price) / price * 100
        pt_status = 'green' if upside > 15 else ('yellow' if upside >= 0 else 'red')
        direction = 'upside' if upside >= 0 else 'downside'
        pt_note = f"Analysts see a {abs(upside):.1f}% {direction} to ${target:.2f} — {'a strong bullish signal' if upside > 15 else 'moderate upside potential' if upside >= 0 else 'analysts expect the stock to decline'}."
        badge_and_note(f"{abs(upside):.1f}% {'↑' if upside >= 0 else '↓'}", pt_status, pt_note)
    else:
        badge_and_note('—', 'grey', 'Data unavailable')

    # PEG
    if peg and peg > 0:
        peg_status = 'green' if peg < 1 else ('yellow' if peg <= 2 else 'red')
        peg_note = f"PEG of {peg:.2f} — {'suggests the stock is cheap relative to its growth rate' if peg < 1 else 'a reasonable price for expected growth' if peg <= 2 else 'the stock may be overvalued relative to its growth rate'}."
        badge_and_note(f"{peg:.2f}", peg_status, peg_note)
    else:
        badge_and_note('—', 'grey', 'Data unavailable')

    # RSI
    if rsi is not None:
        if rsi > 80:
            rsi_status = 'red'
            rsi_note = f"RSI of {rsi} is very high — the stock may be overbought and due for a pullback."
        elif rsi > 70:
            rsi_status = 'yellow'
            rsi_note = f"RSI of {rsi} is elevated — approaching overbought territory, caution warranted."
        elif rsi < 20:
            rsi_status = 'red'
            rsi_note = f"RSI of {rsi} is very low — the stock may be oversold, a rebound could be coming."
        elif rsi < 30:
            rsi_status = 'yellow'
            rsi_note = f"RSI of {rsi} is low — approaching oversold territory, watch for a reversal."
        else:
            rsi_status = 'green'
            rsi_note = f"RSI of {rsi} is in neutral territory — no extreme momentum signals."
        badge_and_note(str(rsi), rsi_status, rsi_note)
    else:
        badge_and_note('—', 'grey', 'Data unavailable')

    # Earnings date
    if earnings_days is not None:
        if earnings_days > 28:
            ed_status = 'green'
            ed_note = f"Earnings are {earnings_days} days away — plenty of time before any earnings-driven volatility."
        elif earnings_days >= 7:
            ed_status = 'yellow'
            ed_note = f"Earnings are {earnings_days} days away — approaching earnings season, volatility may increase."
        else:
            ed_status = 'red'
            ed_note = f"Earnings are just {earnings_days} days away — high risk of sharp price moves around the report."
        badge_and_note(f"{earnings_days}d away", ed_status, ed_note)
    else:
        badge_and_note('—', 'grey', 'Data unavailable')

    # --- Overall Valuation Verdict ---
    reds = sum(1 for s in scorecard if s['status'] == 'red')
    yellows = sum(1 for s in scorecard if s['status'] == 'yellow')
    greens = sum(1 for s in scorecard if s['status'] == 'green')
    avail = sum(1 for s in scorecard if s['status'] != 'grey')

    if avail == 0:
        verdict = 'N/A'
        rationale = 'Insufficient data to determine a valuation verdict.'
    elif greens >= 3:
        verdict = 'Cheap'
        rationale = f"With {greens} green and {reds} red signal{'s' if reds != 1 else ''}, the fundamentals look attractive. The stock appears undervalued relative to key metrics."
    elif reds >= 2:
        verdict = 'Expensive'
        rationale = f"With {reds} red signal{'s' if reds != 1 else ''}, several metrics flash caution. The stock appears overvalued or carries heightened near-term risk."
    else:
        verdict = 'Fair'
        rationale = f"Mixed signals — {greens} green and {reds} red. The stock seems fairly valued with no extreme readings in either direction."

    # --- Risk Flags ---
    risk_flags = []
    factor_labels = ['Valuation (P/E)', 'Analyst Target', 'Growth (PEG)', 'Momentum (RSI)', 'Earnings Timing']
    for i, s in enumerate(scorecard):
        if s['status'] == 'red':
            label = factor_labels[i] if i < len(factor_labels) else f"Factor {i+1}"
            risk_flags.append({'factor': label, 'note': s['note']})

    # --- Recent News ---
    news_items = []
    if NEWS_API_KEY:
        try:
            url = 'https://newsapi.org/v2/everything'
            params = {
                'q': f'{ticker} stock',
                'apiKey': NEWS_API_KEY,
                'pageSize': 3,
                'language': 'en',
                'sortBy': 'publishedAt',
            }
            resp = requests.get(url, params=params, timeout=10)
            if resp.status_code == 200:
                articles = resp.json().get('articles', [])
                for a in articles:
                    news_items.append({
                        'title': a['title'],
                        'date': a['publishedAt'][:10],
                        'source': a['source']['name'],
                        'url': a['url'],
                    })
            else:
                news_items.append({'title': f'News API returned status {resp.status_code}', 'date': '', 'source': '', 'url': ''})
        except Exception as e:
            news_items.append({'title': 'Could not fetch news', 'date': '', 'source': '', 'url': ''})
    else:
        news_items.append({'title': 'News API key not configured. Set NEWS_API_KEY environment variable.', 'date': '', 'source': '', 'url': ''})

    return jsonify({
        'ticker': ticker,
        'companyName': info.get('longName', short_desc),
        'snapshot': snapshot,
        'price': price,
        'scorecard': scorecard,
        'verdict': verdict,
        'rationale': rationale,
        'riskFlags': risk_flags,
        'news': news_items,
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
