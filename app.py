import os
import math
import re
from datetime import datetime, timedelta
from urllib.parse import urlparse
from flask import Flask, render_template, jsonify, request
import yfinance as yf
import requests
import pandas as pd

app = Flask(__name__)

FINNHUB_API_KEY = os.environ.get('FINNHUB_API_KEY', '')
GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')
GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
GROQ_MODEL = 'llama3-8b-8192'


# ============================================================================
# Groq AI helper
# ============================================================================

def groq_chat(system_prompt, user_prompt, max_tokens=200):
    """Call the Groq chat API and return the response text, or None on failure."""
    if not GROQ_API_KEY:
        return None
    try:
        print(f"GROQ attempting call, key length: {len(GROQ_API_KEY)}")
        resp = requests.post(
            GROQ_API_URL,
            headers={
                'Authorization': f'Bearer {GROQ_API_KEY}',
                'Content-Type': 'application/json'
            },
            json={
                'model': GROQ_MODEL,
                'messages': [
                    {'role': 'system', 'content': system_prompt},
                    {'role': 'user', 'content': user_prompt}
                ],
                'max_tokens': max_tokens
            },
            timeout=15
        )
        print(f'GROQ status: {resp.status_code}')
        if resp.status_code != 200:
            print(resp.text[:200])
            return None
        data = resp.json()
        return data['choices'][0]['message']['content'].strip()
    except Exception as e:
        print(f"GROQ exception: {type(e).__name__}: {e}")
        return None


# ============================================================================
# Helpers
# ============================================================================

def calculate_rsi(ticker_obj, period=14):
    """Calculate RSI for a given ticker using yfinance close prices."""
    hist = ticker_obj.history(period='3mo')
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


def _get_financial_data(stock):
    """Robustly fetch quarterly income stmt and balance sheet across yfinance versions."""
    income = None
    for attr in ['quarterly_income_stmt', 'quarterly_income_statement', 'quarterly_financials']:
        if hasattr(stock, attr):
            val = getattr(stock, attr)
            if val is not None and not val.empty:
                income = val
                break

    balance = None
    for attr in ['quarterly_balance_sheet', 'quarterly_balancesheet']:
        if hasattr(stock, attr):
            val = getattr(stock, attr)
            if val is not None and not val.empty:
                balance = val
                break

    return income, balance


def _get_annual_financial_data(stock):
    """Robustly fetch annual income stmt and balance sheet across yfinance versions."""
    income = None
    for attr in ['income_stmt', 'income_statement', 'financials']:
        if hasattr(stock, attr):
            val = getattr(stock, attr)
            if val is not None and not val.empty:
                income = val
                break

    balance = None
    for attr in ['balance_sheet', 'balancesheet']:
        if hasattr(stock, attr):
            val = getattr(stock, attr)
            if val is not None and not val.empty:
                balance = val
                break

    return income, balance


def _find_net_income_row(income):
    """Locate the Net Income row in an income statement DataFrame."""
    if income is None:
        return None
    for key in income.index:
        if 'NetIncome' in key or 'Net Income' in key:
            return income.loc[key]
    return None


def _find_shares_row(balance):
    """Locate the shares outstanding row in a balance sheet DataFrame."""
    if balance is None:
        return None
    for key in balance.index:
        if 'Share' in key and 'Equity' not in key:
            return balance.loc[key]
    for key in balance.index:
        lower = key.lower()
        if 'common stock' in lower or 'shares' in lower or 'stockholders' in lower:
            if 'equity' in lower and 'common' not in lower:
                continue
            return balance.loc[key]
    return None


def _collect_eps_points(income, balance, annualize):
    """Return list of (date, annualized_eps) tuples from income/balance statements."""
    if income is None or balance is None:
        return []
    net_income_row = _find_net_income_row(income)
    shares_row = _find_shares_row(balance)
    if net_income_row is None or shares_row is None:
        return []
    points = []
    multiplier = 4 if annualize else 1
    for date in net_income_row.index:
        if date in shares_row.index:
            ni = net_income_row[date]
            sh = shares_row[date]
            if pd.notna(ni) and pd.notna(sh) and sh != 0:
                eps = (ni / sh) * multiplier
                if pd.notna(eps):
                    points.append((date, eps))
    return points


def extract_domain(url):
    """Extract the registered domain from a URL."""
    if not url:
        return ''
    url = url.strip()
    if '://' not in url:
        url = 'http://' + url
    netloc = urlparse(url).netloc.lower()
    if netloc.startswith('www.'):
        netloc = netloc[4:]
    return netloc


def compute_historical_pe(stock, years=5):
    """Compute average trailing P/E over the last `years` years from financial statements."""
    try:
        annual_income, annual_balance = _get_annual_financial_data(stock)
        quarterly_income, quarterly_balance = _get_financial_data(stock)

        eps_points = []
        eps_points.extend(_collect_eps_points(annual_income, annual_balance, annualize=False))
        eps_points.extend(_collect_eps_points(quarterly_income, quarterly_balance, annualize=True))

        if len(eps_points) < 4:
            return None

        hist = stock.history(period=f'{years}y')
        if hist.empty:
            return None

        hist_close = hist['Close'].copy()
        if hist_close.index.tz is not None:
            hist_close.index = hist_close.index.tz_localize(None)

        cutoff = datetime.now() - timedelta(days=years * 365)
        seen_months = set()
        pe_values = []

        for date, eps in eps_points:
            if eps <= 0:
                continue
            try:
                query_date = date.tz_localize(None) if hasattr(date, 'tz') and date.tz else date
                if query_date < cutoff:
                    continue
                month_key = query_date.strftime('%Y-%m')
                if month_key in seen_months:
                    continue
                price = hist_close.asof(query_date)
                if pd.notna(price) and price > 0:
                    pe = price / eps
                    if pe > 0 and not math.isinf(pe) and pe < 500:
                        pe_values.append(pe)
                        seen_months.add(month_key)
            except Exception:
                continue

        if len(pe_values) < 2:
            return None

        return sum(pe_values) / len(pe_values)
    except Exception:
        return None


def try_get_industry_pe(info):
    """Try to get industry average PE. yfinance does not expose this cleanly."""
    for key in ['industryPe', 'industryPE', 'industryTrailingPE', 'sectorPe', 'sectorPE', ' trailingPE_industry']:
        val = info.get(key)
        if val is not None and not math.isnan(val):
            return val
    return None


def get_pe_assessment(current_pe, historical_pe, industry_pe, years=5):
    if current_pe is None or math.isnan(current_pe):
        return {
            'badge': 'grey',
            'text': 'Data unavailable',
            'explanation': '',
            'raw': None
        }

    def _fmt(v):
        return f"{v:.1f}"

    def _yrs():
        return f"<strong>{years}-year</strong>"

    below_hist = False
    above_hist = False
    below_ind = False
    above_ind = False

    if historical_pe is not None:
        below_hist = current_pe < historical_pe
        above_hist = current_pe > historical_pe

    if industry_pe is not None:
        below_ind = current_pe < industry_pe
        above_ind = current_pe > industry_pe

    if historical_pe is None and industry_pe is None:
        return {
            'badge': 'grey',
            'text': 'Data unavailable',
            'explanation': 'Neither industry nor historical average P/E data is available.',
            'raw': current_pe
        }

    if historical_pe is not None and industry_pe is not None:
        if below_hist and below_ind:
            badge = 'green'
            explanation = (
                f"P/E of {_fmt(current_pe)} is below both its {_yrs()} average ({_fmt(historical_pe)}) "
                f"and the industry average ({_fmt(industry_pe)}), suggesting potential undervaluation."
            )
        elif above_hist and above_ind:
            badge = 'red'
            explanation = (
                f"P/E of {_fmt(current_pe)} is above both its {_yrs()} average ({_fmt(historical_pe)}) "
                f"and the industry average ({_fmt(industry_pe)}), indicating a potentially expensive valuation."
            )
        else:
            badge = 'yellow'
            if above_hist:
                explanation = (
                    f"P/E of {_fmt(current_pe)} is above its {_yrs()} average ({_fmt(historical_pe)}) "
                    f"but below the industry average ({_fmt(industry_pe)}), showing mixed signals."
                )
            else:
                explanation = (
                    f"P/E of {_fmt(current_pe)} is below its {_yrs()} average ({_fmt(historical_pe)}) "
                    f"but above the industry average ({_fmt(industry_pe)}), showing mixed signals."
                )
    elif historical_pe is not None:
        if below_hist:
            badge = 'green'
            explanation = (
                f"P/E of {_fmt(current_pe)} is below its {_yrs()} average of {_fmt(historical_pe)}. "
                f"(Industry data unavailable.)"
            )
        else:
            badge = 'red'
            explanation = (
                f"P/E of {_fmt(current_pe)} is above its {_yrs()} average of {_fmt(historical_pe)}. "
                f"(Industry data unavailable.)"
            )
    else:  # only industry_pe
        if below_ind:
            badge = 'green'
            explanation = (
                f"P/E of {_fmt(current_pe)} is below the industry average of {_fmt(industry_pe)}. "
                f"(Historical data unavailable.)"
            )
        else:
            badge = 'red'
            explanation = (
                f"P/E of {_fmt(current_pe)} is above the industry average of {_fmt(industry_pe)}. "
                f"(Historical data unavailable.)"
            )

    return {'badge': badge, 'text': badge.capitalize(), 'explanation': explanation, 'raw': current_pe}


def get_analyst_assessment(target, current):
    if target is None or current is None or current == 0:
        return {'badge': 'grey', 'text': 'Data unavailable', 'explanation': '', 'raw': None}
    upside = ((target - current) / current) * 100
    if upside > 15:
        return {
            'badge': 'green',
            'text': f'{upside:.1f}% upside',
            'explanation': f"Analysts see {upside:.1f}% upside to a ${target:.2f} target — a strong bullish signal.",
            'raw': upside
        }
    elif upside >= 0:
        return {
            'badge': 'yellow',
            'text': f'{upside:.1f}% upside',
            'explanation': f"Analyst target implies {upside:.1f}% upside — modest but still positive.",
            'raw': upside
        }
    else:
        return {
            'badge': 'red',
            'text': f'{abs(upside):.1f}% downside',
            'explanation': f"Analyst target of ${target:.2f} is {abs(upside):.1f}% below current price, a bearish signal.",
            'raw': upside
        }


def get_peg_assessment(peg):
    if peg is None or math.isnan(peg):
        return {'badge': 'grey', 'text': 'Data unavailable', 'explanation': '', 'raw': None}
    if peg < 1:
        return {
            'badge': 'green',
            'text': f'{peg:.2f}',
            'explanation': f"PEG of {peg:.2f} is under 1 — growth may be cheap relative to valuation.",
            'raw': peg
        }
    elif peg <= 2:
        return {
            'badge': 'yellow',
            'text': f'{peg:.2f}',
            'explanation': f"PEG of {peg:.2f} is between 1 and 2, fairly balanced.",
            'raw': peg
        }
    else:
        return {
            'badge': 'red',
            'text': f'{peg:.2f}',
            'explanation': f"PEG of {peg:.2f} is over 2 — you may be paying a steep premium for growth.",
            'raw': peg
        }


def get_rsi_assessment(rsi):
    if rsi is None:
        return {'badge': 'grey', 'text': 'Data unavailable', 'explanation': '', 'raw': None}
    if 30 <= rsi <= 70:
        return {
            'badge': 'green',
            'text': 'Neutral',
            'explanation': f"RSI of {rsi} sits in the neutral 30–70 zone, showing no extreme buying or selling pressure.",
            'raw': rsi
        }
    elif (70 < rsi <= 80) or (20 <= rsi < 30):
        return {
            'badge': 'yellow',
            'text': 'Extreme',
            'explanation': f"RSI of {rsi} is approaching extreme territory — expect potential volatility.",
            'raw': rsi
        }
    else:
        direction = 'overbought' if rsi > 80 else 'oversold'
        return {
            'badge': 'red',
            'text': 'Extreme',
            'explanation': f"RSI of {rsi} is in extreme {direction} territory, suggesting a likely price reversal soon.",
            'raw': rsi
        }


def get_earnings_assessment(next_earnings_date_str):
    if not next_earnings_date_str:
        return {'badge': 'grey', 'text': 'Data unavailable', 'explanation': '', 'raw': None}
    try:
        next_date = datetime.strptime(next_earnings_date_str, '%Y-%m-%d')
    except (ValueError, TypeError):
        return {'badge': 'grey', 'text': 'Data unavailable', 'explanation': '', 'raw': None}
    days_until = (next_date - datetime.now()).days
    if days_until > 28:
        return {
            'badge': 'green',
            'text': f'{days_until} days away',
            'explanation': f"Next earnings in {days_until} days — plenty of time for sentiment to settle.",
            'raw': days_until
        }
    elif days_until >= 7:
        return {
            'badge': 'yellow',
            'text': f'{days_until} days away',
            'explanation': f"Next earnings in {days_until} days — expect rising volatility as the date nears.",
            'raw': days_until
        }
    else:
        return {
            'badge': 'red',
            'text': f'{max(0, days_until)} days away',
            'explanation': f"Earnings due in under a week ({max(0, days_until)} days) — a binary event that could move the stock sharply.",
            'raw': days_until
        }


def generate_valuation_snapshot(company_name, factors, next_earnings_days):
    """Generate a one-sentence valuation snapshot covering valuation, technicals, and near-term risk."""
    pe_badge = next((f['badge'] for f in factors if f['name'] == 'P/E Ratio'), 'grey')
    peg_badge = next((f['badge'] for f in factors if f['name'] == 'PEG Ratio'), 'grey')
    rsi_badge = next((f['badge'] for f in factors if f['name'] == 'RSI (14-day)'), 'grey')
    rsi_raw = next((f['raw'] for f in factors if f['name'] == 'RSI (14-day)'), None)
    earnings_badge = next((f['badge'] for f in factors if f['name'] == 'Earnings Date'), 'grey')

    # --- Valuation position ---
    reds = sum(1 for b in [pe_badge, peg_badge] if b == 'red')
    greens = sum(1 for b in [pe_badge, peg_badge] if b == 'green')
    if reds >= 1 and greens == 0:
        valuation = "premium valuation"
    elif greens >= 1 and reds == 0:
        valuation = "favorable valuation"
    else:
        valuation = "fair valuation"

    # --- Technical state ---
    if rsi_badge == 'green':
        technical = "neutral technical conditions"
    elif rsi_badge == 'yellow':
        if rsi_raw and rsi_raw > 70:
            technical = "strong upward momentum"
        else:
            technical = "weak momentum"
    elif rsi_badge == 'red':
        if rsi_raw and rsi_raw > 80:
            technical = "strong momentum that may be overextended"
        else:
            technical = "deeply oversold conditions"
    else:
        technical = "unclear technical momentum"

    # --- Near-term risk ---
    if earnings_badge == 'red' and next_earnings_days is not None:
        risk = f"earnings in {abs(next_earnings_days)} days add short-term uncertainty"
    elif earnings_badge == 'yellow' and next_earnings_days is not None:
        weeks = max(1, round(abs(next_earnings_days) / 7))
        risk = f"upcoming earnings in about {weeks} week{'s' if weeks > 1 else ''} could drive volatility"
    else:
        risk = "near-term earnings risk is limited"

    connector = "but" if earnings_badge in ('red', 'yellow') else "and"

    system_prompt = (
        "You are a concise equity research analyst. In exactly one sentence, "
        "summarize a stock's valuation, technical momentum, and near-term earnings risk. "
        "Plain English, no jargon, no disclaimers."
    )
    user_prompt = (
        f"Company: {company_name}\n"
        f"Valuation: {valuation}\n"
        f"Technical: {technical}\n"
        f"Earnings risk: {risk}\n"
        f"Connector word: {connector}\n"
        f"Write one sentence."
    )
    ai = groq_chat(system_prompt, user_prompt)
    if ai:
        return ai

    return f"{company_name} is trading at a {valuation} with {technical}, {connector} {risk}."


def get_risk_explanations(factors):
    """Provide plain-English 'why it matters' explanations for red scorecard signals."""
    red_factors = [f for f in factors if f['badge'] == 'red']
    explanations = []
    for f in red_factors:
        name = f['name']

        system_prompt = (
            "You are a concise equity research analyst. In one short sentence, explain "
            "why this red risk signal matters to a retail investor. Plain English, no disclaimers."
        )
        raw = f.get('raw')
        user_prompt = f"Factor: {name}\nBadge: red\nRaw value: {raw}\nWrite one sentence."
        ai = groq_chat(system_prompt, user_prompt)
        if ai:
            explanations.append({'name': name, 'explanation': ai})
            continue

        if name == 'P/E Ratio':
            explanations.append({
                'name': name,
                'explanation': (
                    "You are paying more per dollar of earnings than the stock's own history and "
                    "industry peers typically command. If growth slows, expensive valuations often compress first."
                )
            })
        elif name == 'Analyst Price Target':
            explanations.append({
                'name': name,
                'explanation': (
                    "Professional analysts on average expect the price to fall from here, which suggests "
                    "the market may already be pricing in optimistic assumptions."
                )
            })
        elif name == 'PEG Ratio':
            explanations.append({
                'name': name,
                'explanation': (
                    "Expected earnings growth does not justify the current price. You may be overpaying "
                    "for future profits that may not materialize."
                )
            })
        elif name == 'RSI (14-day)':
            raw = f.get('raw')
            if raw and raw > 80:
                explanation = (
                    "The stock has risen very fast and may be due for a pullback or consolidation "
                    "as early investors take profits."
                )
            else:
                explanation = (
                    "Heavy selling has pushed the stock into oversold territory. While reversals can happen, "
                    "intense selling often reflects real concerns."
                )
            explanations.append({'name': name, 'explanation': explanation})
        elif name == 'Earnings Date':
            explanations.append({
                'name': name,
                'explanation': (
                    "A major earnings report is due within days. Results can trigger large price swings "
                    "regardless of the stock's longer-term trend."
                )
            })
    return explanations


def _rule_based_news_analysis(headline, summary):
    """Generate a two-sentence analysis using keyword heuristics.

    Sentence 1 states the key point of the news item in plain English;
    sentence 2 describes the likely price impact (positive / negative /
    neutral) and why. Keywords are matched on word boundaries to avoid
    false positives (e.g. 'sues' inside 'issues', 'miss' inside 'mission').
    """
    combined = f"{headline}. {summary}".lower()

    keyword_signals = [
        (('beat', 'beats', 'surpass', 'surpasses', 'exceed', 'exceeds', 'tops',
          'top estimates', 'beats estimates'),
         "The company's latest results came in ahead of Wall Street's expectations.",
         'positive'),
        (('miss', 'misses', 'falls short', 'below estimates', 'misses estimates'),
         "The company's latest results fell short of Wall Street's expectations.",
         'negative'),
        (('upgrade', 'upgraded', 'upgrades', 'raises rating', 'buy rating',
          'overweight', 'bullish'),
         "An analyst raised their rating on the stock, signaling greater confidence in the company's outlook.",
         'positive'),
        (('downgrade', 'downgraded', 'downgrades', 'cuts rating', 'sell rating',
          'underweight', 'bearish'),
         "An analyst lowered their rating on the stock, signaling reduced confidence in the company's outlook.",
         'negative'),
        (('partnership', 'partner', 'partners', 'collaboration', 'joint venture',
          'teams up', 'agreement with'),
         "The company announced a new partnership that could expand its market reach or capabilities.",
         'positive'),
        (('lawsuit', 'sue', 'sues', 'sued', 'legal action', 'class action', 'fraud',
          'investigation', 'investigates', 'probe', 'probes', 'sec charges'),
         "The company faces legal or regulatory action, which introduces uncertainty and potential financial exposure.",
         'negative'),
        (('recall', 'recalls', 'recalled'),
         "The company announced a product recall, which may affect its operations, costs, and reputation.",
         'negative'),
    ]

    def _matches(keywords):
        return any(re.search(r'\b' + re.escape(k) + r'\b', combined) for k in keywords)

    key_point = None
    impact = 'neutral'
    for keywords, point, direction in keyword_signals:
        if _matches(keywords):
            key_point = point
            impact = direction
            break

    if key_point is None:
        key_point = "The company announced news that may be relevant to investors."
        impact = 'neutral'

    impact_text = {
        'positive': "This is a positive signal that could lift the stock price as it reflects improving fundamentals or sentiment.",
        'negative': "This is a negative signal that could pressure the stock price as it raises concerns about the company's near-term prospects.",
        'neutral': "The impact on the stock price is likely neutral, as the news is largely informational without a clear bullish or bearish catalyst.",
    }[impact]

    return f"{key_point} {impact_text}"


def generate_news_analysis(headline, summary=''):
    """Generate a two-sentence AI analysis for a news item.

    Tries Groq first with the headline and summary as input. If Groq is
    unavailable or returns None, falls back to a deterministic, rule-based
    keyword approach so the feature always works.
    """
    headline = headline or ''
    summary = summary or ''

    system_prompt = (
        "You are a concise equity research analyst. In exactly two sentences, "
        "analyze a news item: sentence 1 states the key point in plain English, "
        "sentence 2 states the likely stock price impact (positive, negative, or "
        "neutral) and why. No disclaimers."
    )
    user_prompt = f"Headline: {headline}\nSummary: {summary}"
    ai = groq_chat(system_prompt, user_prompt, max_tokens=200)
    if ai:
        return ai

    return _rule_based_news_analysis(headline, summary)


def fetch_news(ticker):
    if not FINNHUB_API_KEY:
        return []

    today = datetime.now()
    thirty_days_ago = today - timedelta(days=30)
    url = (
        f"https://finnhub.io/api/v1/company-news"
        f"?symbol={ticker}"
        f"&from={thirty_days_ago.strftime('%Y-%m-%d')}"
        f"&to={today.strftime('%Y-%m-%d')}"
        f"&token={FINNHUB_API_KEY}"
    )
    try:
        resp = requests.get(url, timeout=10)
        articles = resp.json()
        if not isinstance(articles, list):
            return []
        # Take the 5 most recent articles (Finnhub returns newest first)
        recent = articles[:5]
        results = []
        for a in recent:
            headline = a.get('headline', '')
            summary = a.get('summary', '')
            results.append({
                'title': headline,
                'publishedAt': datetime.fromtimestamp(a.get('datetime', 0)).strftime('%Y-%m-%d'),
                'url': a.get('url', ''),
                'source': a.get('source', '') or 'Finnhub',
                'ai_analysis': generate_news_analysis(headline, summary)
            })
        return results
    except Exception:
        pass
    return []


# ============================================================================
# Routes
# ============================================================================

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/history')
def history_api():
    ticker = request.args.get('ticker', '').strip().upper()
    period = request.args.get('period', '3mo')
    if not ticker:
        return jsonify({'error': 'Missing ticker parameter.'}), 400
    valid_periods = {'1mo', '3mo', '6mo', '1y', '5y', 'max'}
    if period not in valid_periods:
        period = '3mo'
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period=period)
    except Exception:
        return jsonify({'error': 'Unable to fetch historical prices from Yahoo Finance.'}), 500
    if hist is None or hist.empty:
        return jsonify({'error': 'No historical price data available for this ticker.'}), 404
    dates = [d.strftime('%Y-%m-%d') for d in hist.index]
    prices = [round(float(c), 2) for c in hist['Close']]
    return jsonify({
        'ticker': ticker,
        'period': period,
        'dates': dates,
        'prices': prices
    })


@app.route('/api/stock/<ticker>')
def stock_api(ticker):
    ticker = ticker.strip().upper()
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
    except Exception:
        return jsonify({'error': 'Unable to fetch stock data from Yahoo Finance. Please check the ticker.'}), 500

    company_name = info.get('longName') or info.get('shortName') or ticker
    description = info.get('longBusinessSummary', '')
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

    website = info.get('website') or ''
    company_domain = extract_domain(website) if website else ''
    num_analysts = info.get('numberOfAnalystOpinions')
    as_of = datetime.now().strftime('%Y-%m-%d')

    historical_pe = compute_historical_pe(stock)
    industry_pe = try_get_industry_pe(info)

    # --- Earnings date ---
    next_earnings_date_str = None
    calendar = stock.calendar
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
        try:
            earnings_dates = stock.earnings_dates
            if earnings_dates is not None and not earnings_dates.empty:
                future = earnings_dates[earnings_dates.index > datetime.now()]
                if not future.empty:
                    next_earnings_date_str = str(future.index[0])[:10]
        except Exception:
            pass

    rsi = calculate_rsi(stock)

    pe = get_pe_assessment(pe_ratio, historical_pe, industry_pe, years=5)
    analyst = get_analyst_assessment(target_mean, current_price)
    peg = get_peg_assessment(peg_ratio)
    rsi_data = get_rsi_assessment(rsi)
    earnings = get_earnings_assessment(next_earnings_date_str)

    pe_source = f'Source: Yahoo Finance · 5-year historical average · as of {as_of}'
    analyst_source = 'Source: Yahoo Finance analyst consensus'
    if num_analysts:
        analyst_source += f' · {num_analysts} analysts'
    analyst_source += f' · as of {as_of}'
    peg_source = f'Source: Yahoo Finance · as of {as_of}'
    rsi_source = f'Calculated from 14-day closing prices · Yahoo Finance · as of {as_of}'
    earnings_source = f'Source: Yahoo Finance · as of {as_of}'

    factors = [
        {'name': 'P/E Ratio', 'source': pe_source, 'years': 5, **pe},
        {'name': 'Analyst Price Target', 'source': analyst_source, **analyst},
        {'name': 'PEG Ratio', 'source': peg_source, **peg},
        {'name': 'RSI (14-day)', 'source': rsi_source, **rsi_data},
        {'name': 'Earnings Date', 'source': earnings_source, **earnings}
    ]

    next_earnings_days = earnings.get('raw')
    snapshot_sentence = generate_valuation_snapshot(company_name, factors, next_earnings_days)
    risk_flags = get_risk_explanations(factors)
    news = fetch_news(ticker)

    return jsonify({
        'ticker': ticker,
        'company_name': company_name,
        'company_domain': company_domain,
        'current_price': current_price,
        'snapshot': snapshot,
        'factors': factors,
        'snapshot_sentence': snapshot_sentence,
        'risk_flags': risk_flags,
        'news': news,
        'as_of': as_of
    })


@app.route('/api/pe-history')
def pe_history_api():
    ticker = request.args.get('ticker', '').strip().upper()
    years_str = request.args.get('years', '5').strip()
    if not ticker:
        return jsonify({'error': 'Missing ticker parameter.'}), 400
    try:
        years = int(years_str)
    except (ValueError, TypeError):
        years = 5
    if years not in (3, 5, 10):
        years = 5
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
    except Exception:
        return jsonify({'error': 'Unable to fetch stock data from Yahoo Finance. Please check the ticker.'}), 500

    current_pe = info.get('trailingPE')
    historical_pe = compute_historical_pe(stock, years=years)
    industry_pe = try_get_industry_pe(info)
    assessment = get_pe_assessment(current_pe, historical_pe, industry_pe, years=years)
    as_of = datetime.now().strftime('%Y-%m-%d')

    return jsonify({
        'ticker': ticker,
        'years': years,
        'current_pe': current_pe,
        'historical_pe': historical_pe,
        'industry_pe': industry_pe,
        'as_of': as_of,
        'assessment': assessment,
        'source': f'Source: Yahoo Finance · {years}-year historical average · as of {as_of}'
    })


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
