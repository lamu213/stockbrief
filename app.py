import os
import math
from datetime import datetime, timedelta
from flask import Flask, render_template, jsonify, request
import yfinance as yf
import requests

app = Flask(__name__)

NEWS_API_KEY = os.environ.get('NEWS_API_KEY', '')

def calculate_rsi(ticker, period=14):
    """Calculate RSI for a given ticker using yfinance close prices."""
    hist = ticker.history(period='3mo')
    if hist.empty or len(hist) < period + 1:
        return None
    close = hist['Close']
    delta = close.diff()
    gain = delta.where(delta > 0, 0)
    loss = (-delta).where(delta < 0, 0)
    avg_gain = gain.rolling(window=period).mean()
    avg_loss = loss.rolling(window=period).mean()
    if avg_loss.iloc[-1] == 0:
        return 100.0
    rs = avg_gain.iloc[-1] / avg_loss.iloc[-1]
    rsi = 100 - (100 / (1 + rs))
    return round(rsi, 1)

def get_pe_assessment(pe_ratio):
    if pe_ratio is None or math.isnan(pe_ratio):
        return {'badge': 'grey', 'text': 'Data unavailable', 'explanation': ''}
    if pe_ratio < 15:
        return {'badge': 'green', 'text': 'Green', 'explanation': f'P/E of {pe_ratio:.1f} is below 15, suggesting the stock may be undervalued relative to earnings.'}
    elif pe_ratio <= 25:
        return {'badge': 'yellow', 'text': 'Yellow', 'explanation': f'P/E of {pe_ratio:.1f} is between 15 and 25, around typical market levels.'}
    else:
        return {'badge': 'red', 'text': 'Red', 'explanation': f'P/E of {pe_ratio:.1f} is above 25, indicating a potentially high valuation.'}

def get_analyst_assessment(target, current):
    if target is None or current is None or current == 0:
        return {'badge': 'grey', 'text': 'Data unavailable', 'explanation': ''}
    upside = ((target - current) / current) * 100
    if upside > 15:
        return {'badge': 'green', 'text': 'Green', 'explanation': f'Analysts see {upside:.1f}% upside to ${target:.2f}, a strong signal.'}
    elif upside >= 0:
        return {'badge': 'yellow', 'text': 'Yellow', 'explanation': f'Analyst target implies {upside:.1f}% upside — modest but still positive.'}
    else:
        return {'badge': 'red', 'text': 'Red', 'explanation': f'Analyst target ${target:.2f} is {abs(upside):.1f}% below current price, a bearish signal.'}

def get_peg_assessment(peg):
    if peg is None or math.isnan(peg):
        return {'badge': 'grey', 'text': 'Data unavailable', 'explanation': ''}
    if peg < 1:
        return {'badge': 'green', 'text': 'Green', 'explanation': f'PEG of {peg:.2f} is under 1 — growth may be cheap relative to valuation.'}
    elif peg <= 2:
        return {'badge': 'yellow', 'text': 'Yellow', 'explanation': f'PEG of {peg:.2f} is between 1 and 2, fairly balanced.'}
    else:
        return {'badge': 'red', 'text': 'Red', 'explanation': f'PEG of {peg:.2f} is over 2 — you may be paying a steep premium for growth.'}

def get_rsi_assessment(rsi):
    if rsi is None:
        return {'badge': 'grey', 'text': 'Data unavailable', 'explanation': ''}
    if 30 <= rsi <= 70:
        return {'badge': 'green', 'text': 'Green', 'explanation': f'RSI of {rsi} is in the neutral 30–70 range, no extreme buying or selling pressure.'}
    elif (70 < rsi <= 80) or (20 <= rsi < 30):
        return {'badge': 'yellow', 'text': 'Yellow', 'explanation': f'RSI of {rsi} is approaching extreme territory — expect potential volatility.'}
    else:
        return {'badge': 'red', 'text': 'Red', 'explanation': f'RSI of {rsi} is in extreme territory, suggesting a likely price reversal soon.'}

def get_earnings_assessment(next_earnings_date_str):
    if not next_earnings_date_str:
        return {'badge': 'grey', 'text': 'Data unavailable', 'explanation': ''}
    try:
        # next_earnings_date_str may come as a string date
        next_date = datetime.strptime(next_earnings_date_str, '%Y-%m-%d')
    except (ValueError, TypeError):
        return {'badge': 'grey', 'text': 'Data unavailable', 'explanation': ''}
    days_until = (next_date - datetime.now()).days
    if days_until > 28:
        return {'badge': 'green', 'text': 'Green', 'explanation': f'Next earnings in {days_until} days — plenty of time for sentiment to settle.'}
    elif days_until >= 7:
        return {'badge': 'yellow', 'text': 'Yellow', 'explanation': f'Next earnings in {days_until} days — expect rising volatility as the date nears.'}
    else:
        return {'badge': 'red', 'text': 'Red', 'explanation': f'Earnings due in under a week — a binary event that could move the stock sharply.'}

def overall_verdict(factors):
    greens = sum(1 for f in factors if f['badge'] == 'green')
    yellows = sum(1 for f in factors if f['badge'] == 'yellow')
    reds = sum(1 for f in factors if f['badge'] == 'red')
    total = sum(1 for f in factors if f['badge'] != 'grey')

    if total == 0:
        return {'verdict': 'Fair', 'rationale': 'Most key metrics are unavailable, so we cannot confidently judge valuation.'}

    red_ratio = reds / total
    green_ratio = greens / total

    if red_ratio >= 0.4:
        verdict = 'Expensive'
        rationale = f'{reds} out of {total} signals are flashing red. The stock carries valuation risks that retail investors should watch closely. '
    elif green_ratio >= 0.4:
        verdict = 'Cheap'
        rationale = f'{greens} out of {total} signals are green. On these metrics, the stock looks attractively priced relative to peers. '
    else:
        verdict = 'Fair'
        rationale = f'Most signals are neutral or mixed ({yellows} yellow). The stock seems fairly valued with no extreme imbalance. '

    if verdict == 'Cheap':
        rationale += 'Consider using the margin of safety to build a position gradually rather than all at once.'
    elif verdict == 'Expensive':
        rationale += 'If you still like the story, waiting for a pullback or averaging in slowly may be prudent.'
    else:
        rationale += 'Focus on earnings consistency and competitive strengths rather than valuation alone.'

    return {'verdict': verdict, 'rationale': rationale}

def fetch_news(query):
    if not NEWS_API_KEY:
        return []
    url = 'https://newsapi.org/v2/everything'
    params = {
        'q': query,
        'sortBy': 'publishedAt',
        'language': 'en',
        'pageSize': 3,
        'apiKey': NEWS_API_KEY
    }
    try:
        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()
        if data.get('status') == 'ok':
            articles = data.get('articles', [])
            return [
                {
                    'title': a.get('title', ''),
                    'publishedAt': a.get('publishedAt', '')[:10],
                    'url': a.get('url', '')
                }
                for a in articles
            ]
    except Exception:
        pass
    return []

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/stock/<ticker>')
def stock_api(ticker):
    ticker = ticker.strip().upper()
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
    except Exception:
        return jsonify({'error': 'Unable to fetch stock data from Yahoo Finance.'}), 500

    company_name = info.get('longName') or info.get('shortName') or ticker
    description = info.get('longBusinessSummary', '')
    # Truncate description to one natural sentence (first sentence ending with period)
    snapshot = ''
    if description:
        sentence = description.split('. ')[0]
        if sentence and not sentence.endswith('.'):
            sentence += '.'
        snapshot = sentence

    current_price = info.get('currentPrice') or info.get('regularMarketPrice')
    pe_ratio = info.get('trailingPE')
    peg_ratio = info.get('pegRatio')
    target_mean = info.get('targetMeanPrice')

    # Earnings date
    calendar = stock.calendar
    next_earnings_date_str = None
    if isinstance(calendar, dict) and 'Earnings Date' in calendar:
        ed = calendar['Earnings Date']
        if isinstance(ed, list) and len(ed) > 0:
            next_earnings_date_str = str(ed[0])[:10]
        else:
            next_earnings_date_str = str(ed)[:10]
    elif hasattr(calendar, 'columns') and not calendar.empty:
        if 'Earnings Date' in calendar.columns:
            val = calendar['Earnings Date'].iloc[0]
            next_earnings_date_str = str(val)[:10]
    else:
        # Fallback to earnings_dates if available
        try:
            earnings_dates = stock.earnings_dates
            if earnings_dates is not None and not earnings_dates.empty:
                future = earnings_dates[earnings_dates.index > datetime.now()]
                if not future.empty:
                    next_earnings_date_str = str(future.index[0])[:10]
        except Exception:
            pass

    rsi = calculate_rsi(stock)

    pe = get_pe_assessment(pe_ratio)
    analyst = get_analyst_assessment(target_mean, current_price)
    peg = get_peg_assessment(peg_ratio)
    rsi_data = get_rsi_assessment(rsi)
    earnings = get_earnings_assessment(next_earnings_date_str)

    factors = [
        {'name': 'P/E Ratio', **pe},
        {'name': 'Analyst Price Target', **analyst},
        {'name': 'PEG Ratio', **peg},
        {'name': 'RSI (14-day)', **rsi_data},
        {'name': 'Earnings Date', **earnings}
    ]

    verdict = overall_verdict(factors)

    risk_flags = [
        {'name': f['name'], 'explanation': f['explanation']}
        for f in factors if f['badge'] == 'red'
    ]

    news = fetch_news(f"{company_name} stock")

    return jsonify({
        'ticker': ticker,
        'company_name': company_name,
        'current_price': current_price,
        'snapshot': snapshot,
        'factors': factors,
        'verdict': verdict,
        'risk_flags': risk_flags,
        'news': news
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
