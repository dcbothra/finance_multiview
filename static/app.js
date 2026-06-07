// Global error handler for debugging in browser
window.addEventListener("error", function(e) {
    console.error("GLOBAL APP ERROR:", e.error || e.message);
    const txt = document.getElementById("ws-status-text");
    if (txt) txt.innerText = "Error: " + e.message;
    const dot = document.getElementById("ws-status-dot");
    if (dot) {
        dot.className = "status-dot disconnected";
        dot.style.backgroundColor = "red";
        dot.style.boxShadow = "0 0 10px red";
    }
});

// Global application state
let ws = null;
const panes = [];
let activeGridCount = 4;

// Default configuration presets for symbols
const PRESETS = {
    hyperliquid: ["BTC", "ETH", "SOL", "ARB", "OP", "SUI", "HYPE", "JUP", "PYTH", "AVAX", "NEAR"],
    yfinance_us: ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "AMD", "META", "GOOGL", "^GSPC", "^IXIC", "EURUSD=X", "GC=F"],
    yfinance_in: ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS", "TATAMOTORS.NS", "SBIN.NS", "^NSEI", "^BSESN", "USDINR=X"]
};

// Initialize the application on DOM load
window.addEventListener("DOMContentLoaded", () => {
    // 1. Restore grid layout selection from localStorage
    const savedLayout = localStorage.getItem("finance_multiview_layout");
    if (savedLayout) {
        activeGridCount = parseInt(savedLayout, 10);
    }
    
    // Highlight active button
    updateLayoutSelectorUI();

    // 2. Create the 8 default panes
    createPanes();

    // 3. Connect to the backend WebSocket
    connectWebSocket();

    // 4. Bind layout selector events
    document.getElementById("layout-selector").addEventListener("click", (e) => {
        const btn = e.target.closest(".layout-btn");
        if (!btn) return;
        
        const count = parseInt(btn.dataset.count, 10);
        changeGridLayout(count);
    });
});

// Create 8 chart panes
function createPanes() {
    const gridContainer = document.getElementById("charts-grid");
    gridContainer.innerHTML = "";

    for (let i = 0; i < 8; i++) {
        const paneId = `pane_${i}`;
        
        // Retrieve last saved config for this pane or use defaults
        let savedSource = localStorage.getItem(`${paneId}_source`) || (i % 2 === 0 ? "hyperliquid" : "yfinance_in");
        if (savedSource === "yfinance") {
            savedSource = "yfinance_in";
        }
        const savedSymbol = localStorage.getItem(`${paneId}_symbol`) || (savedSource === "hyperliquid" ? "BTC" : (savedSource === "yfinance_us" ? "AAPL" : "RELIANCE.NS"));
        const savedTimeframe = localStorage.getItem(`${paneId}_timeframe`) || "5m";
        const savedIndicator = localStorage.getItem(`${paneId}_indicator`) || "none";

        // Create DOM structure
        const paneEl = document.createElement("div");
        paneEl.className = "chart-pane";
        paneEl.id = paneId;
        paneEl.style.display = "none"; // Hidden initially, shown by layout setter

        paneEl.innerHTML = `
            <div class="pane-header">
                <div class="pane-controls">
                    <select class="source-select" data-pane-id="${paneId}">
                        <option value="hyperliquid" ${savedSource === "hyperliquid" ? "selected" : ""}>Hyperliquid (Crypto)</option>
                        <option value="yfinance_us" ${savedSource === "yfinance_us" ? "selected" : ""}>Yahoo Finance (US Stocks)</option>
                        <option value="yfinance_in" ${savedSource === "yfinance_in" ? "selected" : ""}>Yahoo Finance (India)</option>
                    </select>
                    <div class="symbol-input-group">
                        <input type="text" class="symbol-input" data-pane-id="${paneId}" value="${savedSymbol}" placeholder="e.g. AAPL, RELIANCE.NS, ^NSEI">
                        <select class="presets-select" data-pane-id="${paneId}">
                            <!-- Populated dynamically -->
                        </select>
                    </div>
                    <select class="timeframe-select" data-pane-id="${paneId}">
                        <option value="1m" ${savedTimeframe === "1m" ? "selected" : ""}>1m</option>
                        <option value="5m" ${savedTimeframe === "5m" ? "selected" : ""}>5m</option>
                        <option value="15m" ${savedTimeframe === "15m" ? "selected" : ""}>15m</option>
                        <option value="1h" ${savedTimeframe === "1h" ? "selected" : ""}>1h</option>
                        <option value="1d" ${savedTimeframe === "1d" ? "selected" : ""}>1d</option>
                    </select>
                    <select class="indicator-select" data-pane-id="${paneId}">
                        <option value="none" ${savedIndicator === "none" ? "selected" : ""}>INDICATORS</option>
                        <option value="sma20" ${savedIndicator === "sma20" ? "selected" : ""}>SMA 20</option>
                        <option value="ema20" ${savedIndicator === "ema20" ? "selected" : ""}>EMA 20</option>
                        <option value="sma50" ${savedIndicator === "sma50" ? "selected" : ""}>SMA 50</option>
                        <option value="ema50" ${savedIndicator === "ema50" ? "selected" : ""}>EMA 50</option>
                    </select>
                </div>
                <div class="pane-ticker" id="${paneId}-ticker">
                    <span class="ticker-symbol" id="${paneId}-ticker-sym">${savedSymbol}</span>
                    <span class="ticker-price" id="${paneId}-ticker-price">Loading...</span>
                    <span class="ticker-change" id="${paneId}-ticker-change">--</span>
                </div>
            </div>
            <div class="chart-container" id="${paneId}-chart-container" data-pane-id="${paneId}">
                <div class="chart-loading" id="${paneId}-loading">
                    <div class="spinner"></div>
                    <span class="loading-text">Loading Historical Data...</span>
                </div>
            </div>
        `;

        gridContainer.appendChild(paneEl);

        const containerEl = document.getElementById(`${paneId}-chart-container`);

        // Initialize Lightweight Chart for this pane
        const chart = LightweightCharts.createChart(containerEl, {
            layout: {
                background: { type: "solid", color: "transparent" },
                textColor: "#94a3b8",
                fontSize: 11,
                fontFamily: "Outfit, sans-serif"
            },
            grid: {
                vertLines: { color: "rgba(148, 163, 184, 0.04)" },
                horzLines: { color: "rgba(148, 163, 184, 0.04)" }
            },
            crosshair: {
                mode: (window.LightweightCharts && LightweightCharts.CrosshairMode && LightweightCharts.CrosshairMode.Normal) || 1,
                vertLine: {
                    color: "rgba(56, 189, 248, 0.3)",
                    width: 1,
                    style: (window.LightweightCharts && LightweightCharts.LineStyle && LightweightCharts.LineStyle.Dashed) || 2
                },
                horzLine: {
                    color: "rgba(56, 189, 248, 0.3)",
                    width: 1,
                    style: (window.LightweightCharts && LightweightCharts.LineStyle && LightweightCharts.LineStyle.Dashed) || 2
                }
            },
            rightPriceScale: {
                borderColor: "rgba(255, 255, 255, 0.06)"
            },
            timeScale: {
                borderColor: "rgba(255, 255, 255, 0.06)",
                timeVisible: true,
                secondsVisible: false
            }
        });

        const candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
            upColor: "#10b981",
            downColor: "#ef4444",
            borderVisible: false,
            wickUpColor: "#10b981",
            wickDownColor: "#ef4444"
        });

        const volumeSeries = chart.addSeries(LightweightCharts.HistogramSeries, {
            color: "#38bdf8",
            priceFormat: {
                type: "volume"
            },
            priceScaleId: "" // overlays volume on main scale
        });

        volumeSeries.priceScale().applyOptions({
            scaleMargins: {
                top: 0.82, // Volume at the bottom 18% of chart
                bottom: 0
            }
        });

        const indicatorSeries = chart.addSeries(LightweightCharts.LineSeries, {
            color: "#10b981",
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false
        });

        // Store pane reference
        const paneObj = {
            id: paneId,
            element: paneEl,
            container: containerEl,
            chart: chart,
            candleSeries: candleSeries,
            volumeSeries: volumeSeries,
            indicatorSeries: indicatorSeries,
            source: savedSource,
            symbol: savedSymbol,
            timeframe: savedTimeframe,
            subscribed: false,
            lastPrice: null,
            sessionOpenPrice: null,
            currentBar: null,
            currentVolumeBar: null,
            candles: []
        };

        panes.push(paneObj);

        // Setup ResizeObserver for this chart container
        const resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const width = entry.contentRect.width;
                const height = entry.contentRect.height;
                if (width > 0 && height > 0) {
                    chart.resize(width, height);
                }
            }
        });
        resizeObserver.observe(containerEl);

        // Bind control elements events
        populatePresets(paneObj);
        bindPaneEvents(paneObj);
    }

    // Set initial grid layout layout class
    setGridClass(activeGridCount);
    updatePaneVisibilities();
}

// Populate the presets select dropdown based on source
function populatePresets(pane) {
    const presetsSelect = pane.element.querySelector(".presets-select");
    const list = PRESETS[pane.source] || [];
    
    presetsSelect.innerHTML = `<option value="">Presets...</option>` + 
        list.map(sym => `<option value="${sym}">${sym}</option>`).join("");
}

// Bind input and dropdown event listeners on the card
function bindPaneEvents(pane) {
    const sourceSel = pane.element.querySelector(".source-select");
    const symbolInp = pane.element.querySelector(".symbol-input");
    const presetsSel = pane.element.querySelector(".presets-select");
    const timeframeSel = pane.element.querySelector(".timeframe-select");
    const indicatorSel = pane.element.querySelector(".indicator-select");

    // Source change handler
    sourceSel.addEventListener("change", (e) => {
        pane.source = e.target.value;
        // Get default symbol for new source
        if (pane.source === "hyperliquid") {
            pane.symbol = "BTC";
        } else if (pane.source === "yfinance_us") {
            pane.symbol = "AAPL";
        } else {
            pane.symbol = "RELIANCE.NS";
        }
        symbolInp.value = pane.symbol;
        
        localStorage.setItem(`${pane.id}_source`, pane.source);
        localStorage.setItem(`${pane.id}_symbol`, pane.symbol);
        
        populatePresets(pane);
        reconnectPane(pane);
    });

    // Custom Symbol text input handler (submit on Enter or blur)
    const handleSymbolSubmit = () => {
        const val = symbolInp.value.trim().toUpperCase();
        if (val && val !== pane.symbol) {
            pane.symbol = val;
            localStorage.setItem(`${pane.id}_symbol`, pane.symbol);
            reconnectPane(pane);
        } else {
            symbolInp.value = pane.symbol;
        }
    };
    
    symbolInp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleSymbolSubmit();
    });
    symbolInp.addEventListener("blur", handleSymbolSubmit);

    // Presets dropdown selection handler
    presetsSel.addEventListener("change", (e) => {
        const val = e.target.value;
        if (val) {
            pane.symbol = val;
            symbolInp.value = val;
            localStorage.setItem(`${pane.id}_symbol`, pane.symbol);
            reconnectPane(pane);
        }
        presetsSel.value = ""; // Reset dropdown
    });

    // Timeframe dropdown selection handler
    timeframeSel.addEventListener("change", (e) => {
        pane.timeframe = e.target.value;
        localStorage.setItem(`${pane.id}_timeframe`, pane.timeframe);
        reconnectPane(pane);
    });

    // Indicator dropdown selection handler
    indicatorSel.addEventListener("change", (e) => {
        localStorage.setItem(`${pane.id}_indicator`, e.target.value);
        updateIndicator(pane);
    });
}

// Populate layout buttons visual highlight
function updateLayoutSelectorUI() {
    const buttons = document.querySelectorAll(".layout-btn");
    buttons.forEach(btn => {
        if (parseInt(btn.dataset.count, 10) === activeGridCount) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
}

// Change grid layout setting
function changeGridLayout(count) {
    if (count === activeGridCount) return;
    activeGridCount = count;
    localStorage.setItem("finance_multiview_layout", count);
    
    updateLayoutSelectorUI();
    setGridClass(count);
    updatePaneVisibilities();
}

// Adjust grid CSS classes
function setGridClass(count) {
    const gridContainer = document.getElementById("charts-grid");
    gridContainer.className = "grid-container"; // Reset
    gridContainer.classList.add(`grid-${count}`);
}

// Show/Hide panes based on active grid count and manage websocket subscription status
function updatePaneVisibilities() {
    panes.forEach((pane, idx) => {
        if (idx < activeGridCount) {
            pane.element.style.display = "flex";
            // trigger layout reflow to make sure ResizeObserver triggers
            setTimeout(() => {
                if (pane.chart) {
                    const rect = pane.container.getBoundingClientRect();
                    pane.chart.resize(rect.width, rect.height);
                }
            }, 50);

            // Subscribe if socket is ready and not subscribed yet
            if (ws && ws.readyState === WebSocket.OPEN && !pane.subscribed) {
                subscribePane(pane);
            }
        } else {
            pane.element.style.display = "none";
            // Unsubscribe hidden panes
            if (ws && ws.readyState === WebSocket.OPEN && pane.subscribed) {
                unsubscribePane(pane);
            }
        }
    });
}

// Force a subscription reload for a single pane when settings change
function reconnectPane(pane) {
    // Reset data state
    pane.lastPrice = null;
    pane.sessionOpenPrice = null;
    pane.currentBar = null;
    pane.currentVolumeBar = null;
    
    // Update local labels
    document.getElementById(`${pane.id}-ticker-sym`).innerText = pane.symbol;
    document.getElementById(`${pane.id}-ticker-price`).innerText = "Loading...";
    const changeEl = document.getElementById(`${pane.id}-ticker-change`);
    changeEl.innerText = "--";
    changeEl.className = "ticker-change";

    // Show loading overlay
    document.getElementById(`${pane.id}-loading`).style.display = "flex";

    if (ws && ws.readyState === WebSocket.OPEN) {
        subscribePane(pane); // Overwrite existing pane subscription in backend
    }
}

// Send subscribe message to WebSocket server
function subscribePane(pane) {
    const backendSource = (pane.source === "yfinance_us" || pane.source === "yfinance_in") ? "yfinance" : pane.source;
    const msg = {
        action: "subscribe",
        pane_id: pane.id,
        source: backendSource,
        symbol: pane.symbol,
        timeframe: pane.timeframe
    };
    ws.send(JSON.stringify(msg));
    pane.subscribed = true;
}

// Send unsubscribe message to WebSocket server
function unsubscribePane(pane) {
    const msg = {
        action: "unsubscribe",
        pane_id: pane.id
    };
    ws.send(JSON.stringify(msg));
    pane.subscribed = false;
}

// Connect to Flask-Sock WebSocket
function connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    console.log(`Connecting to server WebSocket: ${wsUrl}`);
    
    const dot = document.getElementById("ws-status-dot");
    const txt = document.getElementById("ws-status-text");

    txt.innerText = "Connecting...";
    dot.className = "status-dot disconnected";

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log("WebSocket connected.");
        txt.innerText = "Connected";
        dot.className = "status-dot connected";

        // Subscribe all currently active visible panes
        panes.forEach((pane, idx) => {
            if (idx < activeGridCount) {
                subscribePane(pane);
            }
        });
    };

    ws.onclose = () => {
        console.log("WebSocket disconnected. Retrying in 3 seconds...");
        txt.innerText = "Disconnected";
        dot.className = "status-dot disconnected";
        
        // Reset subscribe state for all panes
        panes.forEach(pane => {
            pane.subscribed = false;
        });

        setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (err) => {
        console.error("WebSocket error: ", err);
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            const pane = panes.find(p => p.id === data.pane_id);
            if (!pane) return;

            if (data.type === "history") {
                handleHistoryData(pane, data);
            } else if (data.type === "tick") {
                handleTickData(pane, data);
            }
        } catch (e) {
            console.error("Error parsing WebSocket message:", e);
        }
    };
}

// Process history payload
function handleHistoryData(pane, data) {
    // Hide loading overlay
    document.getElementById(`${pane.id}-loading`).style.display = "none";

    const candles = data.candles || [];
    if (candles.length === 0) {
        pane.candleSeries.setData([]);
        pane.volumeSeries.setData([]);
        document.getElementById(`${pane.id}-ticker-price`).innerText = "No Data";
        return;
    }

    // Map history to series structures
    const mainData = [];
    const volumeData = [];

    candles.forEach(c => {
        mainData.push({
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close
        });
        
        volumeData.push({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)"
        });
    });

    pane.candleSeries.setData(mainData);
    pane.volumeSeries.setData(volumeData);
    
    // Store historical candles list and draw active indicator
    pane.candles = [...mainData];
    updateIndicator(pane);
    
    // Fit content on load
    pane.chart.timeScale().fitContent();

    // Set first open price of history session for tracking changes
    pane.sessionOpenPrice = mainData[0].open;
    
    // Set currentBar to the last bar in the historical data
    const lastBar = mainData[mainData.length - 1];
    pane.currentBar = { ...lastBar };
    pane.currentVolumeBar = { ...volumeData[volumeData.length - 1] };

    // Update prices
    const latestPrice = lastBar.close;
    updatePriceDisplay(pane, latestPrice);
    pane.lastPrice = latestPrice;
}

// Process live tick updates
function handleTickData(pane, data) {
    const price = data.price;
    const tickTime = data.time;
    
    if (!pane.currentBar) return;

    // Calculate bar start time based on timeframe
    const barTime = getBarStartTime(tickTime, pane.timeframe);
    let bar = pane.currentBar;

    if (bar.time !== barTime && barTime > bar.time) {
        // Start a brand new candle bar
        bar = {
            time: barTime,
            open: price,
            high: price,
            low: price,
            close: price
        };
        pane.currentVolumeBar = {
            time: barTime,
            value: 0,
            color: "rgba(16, 185, 129, 0.25)"
        };
    } else {
        // Update values on the active bar
        bar.close = price;
        bar.high = Math.max(bar.high, price);
        bar.low = Math.min(bar.low, price);
    }
    
    // Update colors for current volume bar
    pane.currentVolumeBar.color = bar.close >= bar.open ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)";

    pane.currentBar = bar;
    pane.candleSeries.update(bar);
    pane.volumeSeries.update(pane.currentVolumeBar);

    // Update local candles array for live calculations
    if (!pane.candles) {
        pane.candles = [];
    }
    if (pane.candles.length === 0 || pane.candles[pane.candles.length - 1].time !== bar.time) {
        pane.candles.push(bar);
    } else {
        pane.candles[pane.candles.length - 1] = bar;
    }
    updateIndicator(pane);

    // Apply flash triggers on price change
    const tickerEl = document.getElementById(`${pane.id}-ticker`);
    if (pane.lastPrice !== null && price !== pane.lastPrice) {
        // Remove class to reset animation state
        tickerEl.classList.remove("flash-green", "flash-red");
        // Force reflow
        void tickerEl.offsetWidth;
        // Apply target flash style
        if (price > pane.lastPrice) {
            tickerEl.classList.add("flash-green");
        } else {
            tickerEl.classList.add("flash-red");
        }
    }

    updatePriceDisplay(pane, price);
    pane.lastPrice = price;
}

// Calculate Unix timestamp start based on selected timeframe
function getBarStartTime(timestampSec, timeframe) {
    switch (timeframe) {
        case "1m":
            return Math.floor(timestampSec / 60) * 60;
        case "5m":
            return Math.floor(timestampSec / 300) * 300;
        case "15m":
            return Math.floor(timestampSec / 900) * 900;
        case "1h":
            return Math.floor(timestampSec / 3600) * 3600;
        case "1d":
            // Normalize to UTC midnight
            return Math.floor(timestampSec / 86400) * 86400;
        default:
            return Math.floor(timestampSec / 300) * 300;
    }
}

// Format prices and update elements
function updatePriceDisplay(pane, price) {
    const priceEl = document.getElementById(`${pane.id}-ticker-price`);
    const changeEl = document.getElementById(`${pane.id}-ticker-change`);

    // Format price
    const prefix = pane.source === "yfinance_in" ? "₹" : "$";
    const decimals = price < 1 ? 4 : 2;
    priceEl.innerText = prefix + price.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });

    // Format percentage change
    if (pane.sessionOpenPrice) {
        const diff = price - pane.sessionOpenPrice;
        const pct = (diff / pane.sessionOpenPrice) * 100;
        
        const sign = pct >= 0 ? "+" : "";
        changeEl.innerText = `${sign}${pct.toFixed(2)}%`;
        
        if (pct >= 0) {
            changeEl.className = "ticker-change up";
        } else {
            changeEl.className = "ticker-change down";
        }
    }
}

// Technical Indicators Calculation Helpers
function calculateSMA(data, period) {
    const sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            continue; // Not enough data
        }
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += data[i - j].close;
        }
        sma.push({
            time: data[i].time,
            value: sum / period
        });
    }
    return sma;
}

function calculateEMA(data, period) {
    const ema = [];
    if (data.length < period) return ema;
    
    // First value is SMA
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += data[i].close;
    }
    let prevEma = sum / period;
    ema.push({
        time: data[period - 1].time,
        value: prevEma
    });
    
    const multiplier = 2 / (period + 1);
    for (let i = period; i < data.length; i++) {
        const val = (data[i].close - prevEma) * multiplier + prevEma;
        ema.push({
            time: data[i].time,
            value: val
        });
        prevEma = val;
    }
    return ema;
}

// Core Technical Indicator Renderer
function updateIndicator(pane) {
    if (!pane.indicatorSeries) return;
    
    const selectEl = pane.element.querySelector(".indicator-select");
    const type = selectEl ? selectEl.value : "none";
    
    if (type === "none" || !pane.candles || pane.candles.length === 0) {
        pane.indicatorSeries.setData([]);
        return;
    }
    
    let indicatorData = [];
    if (type === "sma20") {
        pane.indicatorSeries.applyOptions({ color: "#38bdf8" }); // Sky blue
        indicatorData = calculateSMA(pane.candles, 20);
    } else if (type === "ema20") {
        pane.indicatorSeries.applyOptions({ color: "#10b981" }); // Emerald green
        indicatorData = calculateEMA(pane.candles, 20);
    } else if (type === "sma50") {
        pane.indicatorSeries.applyOptions({ color: "#fbbf24" }); // Amber yellow
        indicatorData = calculateSMA(pane.candles, 50);
    } else if (type === "ema50") {
        pane.indicatorSeries.applyOptions({ color: "#f43f5e" }); // Rose red
        indicatorData = calculateEMA(pane.candles, 50);
    }
    
    pane.indicatorSeries.setData(indicatorData);
}
