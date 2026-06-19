import os
import math
from datetime import datetime
from flask import Flask, render_template, jsonify, request
import yfinance as yf
import requests
import pandas as pd

app = Flask(__name__)

NEWS_API_KEY = os.environ.get('NEWS_API_KEY', '')

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


def compute_historical_pe(stock):
    """Try to compute the average trailing P/E over the last ~5 years from quarterly data."""
    try:
        income, balance = _get_financial_data(stock)
        if income is None or balance is None:
            return None

        # --- Find Net Income row ---
        net_income_row = None
        for key in income.index:
            if 'NetIncome' in key or 'Net Income' in key:
                net_income_row = income.loc[key]
                break
        if net_income_row is None:
            return None

        # --- Find Shares Outstanding row ---
        shares_row = None
        for key in balance.index:
            if 'Share' in key and 'Equity' not in key:
                shares_row = balance.loc[key]
                break
        if shares_row is None:
            # Fallback: try any row that looks like share count
            for key in balance.index:
                lower = key.lower()
                if 'common stock' in lower or 'shares' in lower or 'stockholders' in lower:
                    if 'equity' in lower and 'common' not in lower:
                        continue
                    shares_row = balance.loc[key]
                    break
        if shares_row is None:
            return None

        # Build EPS series
        eps_data = []
        for date in net_income_row.index:
            if date in shares_row.index:
                ni = net_income_row[date]
                sh = shares_row[date]
                if pd.notna(ni) and pd.notna(sh) and sh != 0:
                    eps = ni / sh
                    eps_data.append((date, eps))

        if len(eps_data) < 4:
            return None

        hist = stock.history(period='5y')
        if hist.empty:
            return None

        # Ensure timezone-naive index for comparison with statement dates
        hist_close = hist['Close'].copy()
        if hist_close.index.tz is not None:
            hist_close.index = hist_close.index.tz_localize(None)

        pe_values = []
        for date, eps in eps_data:
            if eps <= 0:
                continue
            try:
                # Ensure date is timezone-naive
                query_date = date.tz_localize(None) if hasattr(date, 'tz') and date.tz else date
                price = hist_close.asof(query_date)
                if pd.notna(price) and price > 0:
                    # Annualize quarterly EPS for a proper P/E comparison
                    annualized_eps = eps * 4
                    pe = price / annualized_eps
                    if pe > 0 and not math.isinf(pe) and pe < 500:  # sanity cap
                        pe_values.append(pe)
            except Exception:
                continue

        if len(pe_values) < 4:
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


def get_pe_assessment(current_pe, historical_pe, industry_pe):
    if current_pe is None or math.isnan(current_pe):
        return {
            'badge': 'grey',
            'text': 'Data unavailable',
            'explanation': '',
            'raw': None
        }

    def _fmt(v):
        return f"{v:.1f}"

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
                f"P/E of {_fmt(current_pe)} is below both its 5-year average ({_fmt(historical_pe)}) "
                f"and the industry average ({_fmt(industry_pe)}), suggesting potential undervaluation."
            )
        elif above_hist and above_ind:
            badge = 'red'
            explanation = (
                f"P/E of {_fmt(current_pe)} is above both its 5-year average ({_fmt(historical_pe)}) "
                f"and the industry average ({_fmt(industry_pe)}), indicating a potentially expensive valuation."
            )
        else:
            badge = 'yellow'
            if above_hist:
                explanation = (
                    f"P/E of {_fmt(current_pe)} is above its 5-year average ({_fmt(historical_pe)}) "
                    f"but below the industry average ({_fmt(industry_pe)}), showing mixed signals."
                )
            else:
                explanation = (
                    f"P/E of {_fmt(current_pe)} is below its 5-year average ({_fmt(historical_pe)}) "
                    f"but above the industry average ({_fmt(industry_pe)}), showing mixed signals."
                )
    elif historical_pe is not None:
        if below_hist:
            badge = 'green'
            explanation = (
                f"P/E of {_fmt(current_pe)} is below its 5-year average of {_fmt(historical_pe)}. "
                f"(Industry data unavailable.)"
            )
        else:
            badge = 'red'
            explanation = (
                f"P/E of {_fmt(current_pe)} is above its 5-year average of {_fmt(historical_pe)}. "
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
    return f"{company_name} is trading at a {valuation} with {technical}, {connector} {risk}."


def get_risk_explanations(factors):
    """Provide plain-English 'why it matters' explanations for red scorecard signals."""
    red_factors = [f for f in factors if f['badge'] == 'red']
    explanations = []
    for f in red_factors:
        name = f['name']
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


# ============================================================================
# Routes
# ============================================================================

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

    pe = get_pe_assessment(pe_ratio, historical_pe, industry_pe)
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

    next_earnings_days = earnings.get('raw')
    snapshot_sentence = generate_valuation_snapshot(company_name, factors, next_earnings_days)
    risk_flags = get_risk_explanations(factors)
    news = fetch_news(f"{company_name} stock")

    return jsonify({
        'ticker': ticker,
        'company_name': company_name,
        'current_price': current_price,
        'snapshot': snapshot,
        'factors': factors,
        'snapshot_sentence': snapshot_sentence,
        'risk_flags': risk_flags,
        'news': news
    })


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
