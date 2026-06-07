import json
import threading
from flask import Flask
from flask_sock import Sock
from data_source import DATA_SOURCES

app = Flask(__name__, static_folder='static', static_url_path='')
sock = Sock(app)

# Global lock to serialize WebSocket sending across concurrent background threads
ws_lock = threading.Lock()

def safe_send(ws, payload):
    with ws_lock:
        try:
            ws.send(json.dumps(payload))
        except Exception:
            # Client disconnected or socket closed, catch silently
            pass

@app.route('/')
def index():
    return app.send_static_file('index.html')

def make_callback(ws, pane_id, source, symbol):
    def callback(tick):
        safe_send(ws, {
            "type": "tick",
            "pane_id": pane_id,
            "source": source,
            "symbol": symbol,
            "price": tick["price"],
            "time": tick["time"]
        })
    return callback

@sock.route('/ws')
def handle_ws(ws):
    # Keep track of active subscriptions for this connection:
    # pane_id -> (source, symbol, callback_fn)
    client_subs = {}
    client_subs_lock = threading.Lock()
    is_connected = [True]  # Shared connection state
    
    def fetch_history_and_subscribe(pane_id, source, symbol, timeframe):
        try:
            print(f"Fetching history async for pane {pane_id}: {source} / {symbol} ({timeframe})")
            candles = DATA_SOURCES[source].fetch_history(symbol, timeframe)
            
            # Send history only if connection is still alive
            if is_connected[0]:
                safe_send(ws, {
                    "type": "history",
                    "pane_id": pane_id,
                    "candles": candles,
                    "symbol": symbol,
                    "source": source,
                    "timeframe": timeframe
                })
                
                # Check connection status again before subscribing to prevent memory leaks
                with client_subs_lock:
                    if is_connected[0]:
                        callback_fn = make_callback(ws, pane_id, source, symbol)
                        DATA_SOURCES[source].subscribe(symbol, callback_fn)
                        client_subs[pane_id] = (source, symbol, callback_fn)
                        print(f"Subscribed pane {pane_id} to live ticks of {source} / {symbol}")
        except Exception as e:
            print(f"Error in fetch_history_and_subscribe for pane {pane_id}: {e}")

    try:
        while True:
            message = ws.receive()
            if message is None:
                break
            
            try:
                data = json.loads(message)
                action = data.get("action")
                pane_id = data.get("pane_id")
                
                if action == "subscribe":
                    source = data.get("source")
                    symbol = data.get("symbol")
                    timeframe = data.get("timeframe")
                    
                    if not source or not symbol or not timeframe:
                        continue
                        
                    if source not in DATA_SOURCES:
                        safe_send(ws, {
                            "type": "error",
                            "pane_id": pane_id,
                            "message": f"Unsupported data source: {source}"
                        })
                        continue
                    
                    # 1. Clean up existing subscription for this pane_id
                    with client_subs_lock:
                        if pane_id in client_subs:
                            old_src, old_sym, old_cb = client_subs[pane_id]
                            DATA_SOURCES[old_src].unsubscribe(old_sym, old_cb)
                            del client_subs[pane_id]
                    
                    # 2. Launch background history fetch and live feed subscription
                    threading.Thread(
                        target=fetch_history_and_subscribe,
                        args=(pane_id, source, symbol, timeframe),
                        daemon=True
                    ).start()
                    
                elif action == "unsubscribe":
                    with client_subs_lock:
                        if pane_id in client_subs:
                            old_src, old_sym, old_cb = client_subs[pane_id]
                            DATA_SOURCES[old_src].unsubscribe(old_sym, old_cb)
                            del client_subs[pane_id]
                            print(f"Unsubscribed pane {pane_id}")
            except json.JSONDecodeError:
                pass
            except Exception as inner_e:
                print(f"Error processing WS action: {inner_e}")
                
    except Exception as e:
        print(f"WS connection exception: {e}")
    finally:
        # Prevent any background thread from subscribing after this block executes
        is_connected[0] = False
        print("Cleaning up WS subscriptions for disconnected client.")
        with client_subs_lock:
            for pane_id, (src, sym, cb) in list(client_subs.items()):
                try:
                    DATA_SOURCES[src].unsubscribe(sym, cb)
                except Exception as clean_err:
                    print(f"Error unsubscribing symbol {sym} on cleanup: {clean_err}")
            client_subs.clear()

if __name__ == '__main__':
    print("Starting Finance MultiView server on http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True, use_reloader=False)
