import time
import json
import threading
import requests
import websocket
import yfinance as yf

class BaseDataSource:
    def fetch_history(self, symbol: str, timeframe: str) -> list:
        """
        Fetch historical candles.
        Returns a list of dicts: [
            {'time': timestamp_in_seconds, 'open': float, 'high': float, 'low': float, 'close': float, 'volume': float}
        ]
        """
        raise NotImplementedError

    def subscribe(self, symbol: str, callback) -> None:
        """
        Subscribe to live tick updates.
        When a trade/price update occurs, the callback is called with:
        {'time': timestamp_in_seconds, 'price': float, 'symbol': str}
        """
        raise NotImplementedError

    def unsubscribe(self, symbol: str, callback) -> None:
        """
        Unsubscribe from live tick updates.
        """
        raise NotImplementedError


class HyperliquidWSManager:
    """
    Manages a single background WebSocket connection to Hyperliquid
    and routes trade ticks to multiple callbacks.
    """
    def __init__(self):
        self.ws = None
        self.url = "wss://api.hyperliquid.xyz/ws"
        self.subscriptions = {}  # coin -> set of callbacks
        self.lock = threading.Lock()
        self.connected = False
        
        # Start connection manager thread
        threading.Thread(target=self._run_loop, daemon=True).start()

    def _run_loop(self):
        while True:
            try:
                print("Connecting to Hyperliquid WebSocket...")
                self.ws = websocket.WebSocketApp(
                    self.url,
                    on_message=self._on_message,
                    on_error=self._on_error,
                    on_close=self._on_close,
                    on_open=self._on_open
                )
                self.ws.run_forever(ping_interval=15, ping_timeout=10)
            except Exception as e:
                print(f"Hyperliquid WebSocket thread error: {e}")
            time.sleep(5)  # Reconnect delay

    def _on_message(self, ws, message):
        try:
            data = json.loads(message)
            if data.get("channel") == "trades":
                trades = data.get("data", [])
                for trade in trades:
                    coin = trade.get("coin")
                    price = float(trade.get("px", 0))
                    # Convert milliseconds to seconds
                    timestamp = trade.get("time", 0) / 1000.0
                    
                    with self.lock:
                        callbacks = list(self.subscriptions.get(coin, []))
                        
                    tick = {
                        "time": timestamp,
                        "price": price,
                        "symbol": coin
                    }
                    for cb in callbacks:
                        try:
                            cb(tick)
                        except Exception as cb_err:
                            print(f"Error executing HL callback: {cb_err}")
        except Exception as e:
            print(f"Error parsing Hyperliquid WS message: {e}")

    def _on_error(self, ws, error):
        print(f"Hyperliquid WebSocket error: {error}")

    def _on_close(self, ws, close_status_code, close_msg):
        print(f"Hyperliquid WebSocket closed: {close_status_code} - {close_msg}")
        self.connected = False

    def _on_open(self, ws):
        print("Hyperliquid WebSocket connected successfully.")
        self.connected = True
        # Re-subscribe to all active coins
        with self.lock:
            coins = list(self.subscriptions.keys())
        for coin in coins:
            self._send_subscribe(coin)

    def _send_subscribe(self, coin):
        if self.ws and self.connected:
            msg = {
                "method": "subscribe",
                "subscription": {
                    "type": "trades",
                    "coin": coin
                }
            }
            try:
                self.ws.send(json.dumps(msg))
                print(f"Hyperliquid subscribed to {coin}")
            except Exception as e:
                print(f"Failed to subscribe to {coin}: {e}")

    def _send_unsubscribe(self, coin):
        if self.ws and self.connected:
            msg = {
                "method": "unsubscribe",
                "subscription": {
                    "type": "trades",
                    "coin": coin
                }
            }
            try:
                self.ws.send(json.dumps(msg))
                print(f"Hyperliquid unsubscribed from {coin}")
            except Exception as e:
                print(f"Failed to unsubscribe from {coin}: {e}")

    def subscribe(self, coin, callback):
        send_sub = False
        coin = coin.strip().upper()
        with self.lock:
            if coin not in self.subscriptions:
                self.subscriptions[coin] = set()
                send_sub = True
            self.subscriptions[coin].add(callback)
        if send_sub:
            self._send_subscribe(coin)

    def unsubscribe(self, coin, callback):
        send_unsub = False
        coin = coin.strip().upper()
        with self.lock:
            if coin in self.subscriptions:
                self.subscriptions[coin].discard(callback)
                if not self.subscriptions[coin]:
                    del self.subscriptions[coin]
                    send_unsub = True
        if send_unsub:
            self._send_unsubscribe(coin)


class YFinanceManager:
    """
    Manages polling for active yfinance ticker symbols.
    Uses lightweight batch downloads to prevent 429 Too Many Requests rate-limiting.
    """
    def __init__(self):
        self.subscriptions = {}  # symbol -> set of callbacks
        self.lock = threading.Lock()
        self.last_prices = {}    # symbol -> float
        
        # Start background polling thread
        threading.Thread(target=self._poll_loop, daemon=True).start()

    def subscribe(self, symbol, callback):
        symbol = symbol.strip().upper()
        with self.lock:
            if symbol not in self.subscriptions:
                self.subscriptions[symbol] = set()
                self.last_prices.pop(symbol, None)
            self.subscriptions[symbol].add(callback)

    def unsubscribe(self, symbol, callback):
        symbol = symbol.strip().upper()
        with self.lock:
            if symbol in self.subscriptions:
                self.subscriptions[symbol].discard(callback)
                if not self.subscriptions[symbol]:
                    del self.subscriptions[symbol]
                    self.last_prices.pop(symbol, None)

    def _poll_loop(self):
        while True:
            try:
                with self.lock:
                    symbols = list(self.subscriptions.keys())
                
                if symbols:
                    # Query all active symbols in a single lightweight batch request
                    df = yf.download(tickers=symbols, period="1d", interval="5m", group_by="ticker", progress=False)
                    if not df.empty:
                        for symbol in symbols:
                            try:
                                if symbol in df:
                                    close_series = df[symbol]['Close'].dropna()
                                    if not close_series.empty:
                                        price = float(close_series.iloc[-1])
                                        self.last_prices[symbol] = price
                                        
                                        tick = {
                                            "time": time.time(),
                                            "price": price,
                                            "symbol": symbol
                                        }
                                        
                                        with self.lock:
                                            callbacks = list(self.subscriptions.get(symbol, []))
                                        for cb in callbacks:
                                            try:
                                                cb(tick)
                                            except Exception as cb_err:
                                                print(f"Error in yfinance callback: {cb_err}")
                            except Exception as symbol_err:
                                print(f"Error extracting price for {symbol}: {symbol_err}")
            except Exception as e:
                print(f"yfinance poll loop exception: {e}")
            time.sleep(10.0)  # Polling interval to respect Yahoo Finance rate limits


class HyperliquidDataSource(BaseDataSource):
    def __init__(self):
        self.manager = HyperliquidWSManager()

    def fetch_history(self, symbol: str, timeframe: str) -> list:
        symbol = symbol.strip().upper()
        interval = timeframe
        if timeframe not in ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '8h', '12h', '1d', '3d', '1w', '1M']:
            interval = '1m'
        
        # Complete multipliers registry for all supported Hyperliquid intervals
        multipliers = {
            '1m': 1 * 60 * 1000,
            '3m': 3 * 60 * 1000,
            '5m': 5 * 60 * 1000,
            '15m': 15 * 60 * 1000,
            '30m': 30 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '2h': 2 * 60 * 60 * 1000,
            '4h': 4 * 60 * 60 * 1000,
            '8h': 8 * 60 * 60 * 1000,
            '12h': 12 * 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000,
            '3d': 3 * 24 * 60 * 60 * 1000,
            '1w': 7 * 24 * 60 * 60 * 1000,
            '1M': 30 * 24 * 60 * 60 * 1000,
        }
        
        # Request 1000 candles
        duration_ms = multipliers.get(interval, 60 * 1000) * 1000
        end_time = int(time.time() * 1000)
        start_time = end_time - duration_ms
        
        url = "https://api.hyperliquid.xyz/info"
        payload = {
            "type": "candleSnapshot",
            "req": {
                "coin": symbol,
                "interval": interval,
                "startTime": start_time,
                "endTime": end_time
            }
        }
        
        try:
            response = requests.post(url, json=payload, headers={"Content-Type": "application/json"})
            if response.status_code == 200:
                data = response.json()
                candles = []
                for item in data:
                    candles.append({
                        "time": int(item["t"] / 1000),  # open time in seconds
                        "open": float(item["o"]),
                        "high": float(item["h"]),
                        "low": float(item["l"]),
                        "close": float(item["c"]),
                        "volume": float(item["v"])
                    })
                candles.sort(key=lambda x: x["time"])
                return candles
            else:
                print(f"Hyperliquid API error: {response.status_code} - {response.text}")
                return []
        except Exception as e:
            print(f"Hyperliquid history fetch exception for {symbol}: {e}")
            return []

    def subscribe(self, symbol: str, callback) -> None:
        self.manager.subscribe(symbol, callback)

    def unsubscribe(self, symbol: str, callback) -> None:
        self.manager.unsubscribe(symbol, callback)


class YFinanceDataSource(BaseDataSource):
    def __init__(self):
        self.manager = YFinanceManager()

    def fetch_history(self, symbol: str, timeframe: str) -> list:
        symbol = symbol.strip().upper()
        # Map timeframe to period and interval for yfinance
        if timeframe == '1m':
            period = '1d'
            interval = '1m'
        elif timeframe == '5m':
            period = '5d'
            interval = '5m'
        elif timeframe == '15m':
            period = '5d'
            interval = '15m'
        elif timeframe == '1h':
            period = '1mo'
            interval = '1h'
        elif timeframe == '1d':
            period = '1y'
            interval = '1d'
        else:
            period = '1mo'
            interval = '1h'

        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(period=period, interval=interval)
            
            # Dynamic Fallback Strategy for closed market/weekends
            if df.empty and period in ['1d', '5d']:
                fallback_periods = ['5d', '1mo'] if period == '1d' else ['1mo']
                for fallback_p in fallback_periods:
                    print(f"History empty for {symbol} with period {period}, trying fallback: {fallback_p}")
                    df = ticker.history(period=fallback_p, interval=interval)
                    if not df.empty:
                        break

            candles = []
            if not df.empty:
                for idx, row in df.iterrows():
                    candles.append({
                        "time": int(idx.timestamp()),
                        "open": float(row["Open"]),
                        "high": float(row["High"]),
                        "low": float(row["Low"]),
                        "close": float(row["Close"]),
                        "volume": float(row["Volume"])
                    })
                candles.sort(key=lambda x: x["time"])
            return candles
        except Exception as e:
            print(f"yfinance history fetch exception for {symbol}: {e}")
            return []

    def subscribe(self, symbol: str, callback) -> None:
        self.manager.subscribe(symbol, callback)

    def unsubscribe(self, symbol: str, callback) -> None:
        self.manager.unsubscribe(symbol, callback)


# Global Pluggable Registry
DATA_SOURCES = {
    "hyperliquid": HyperliquidDataSource(),
    "yfinance": YFinanceDataSource()
}
