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
    yfinance_us: ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "AMD", "META", "GOOGL", "^GSPC", "^IXIC", "EURUSD=X", "GC=F", "SI=F", "HG=F", "CL=F", "NG=F"],
    yfinance_in: ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS", "TATAMOTORS.NS", "SBIN.NS", "^NSEI", "^BSESN", "USDINR=X"]
};

const FRIENDLY_NAMES = {
    // Indices
    "^NSEI": "NIFTY 50",
    "^BSESN": "SENSEX",
    "^GSPC": "S&P 500",
    "^IXIC": "NASDAQ",
    
    // Commodities
    "GC=F": "Gold Futures",
    "SI=F": "Silver Futures",
    "HG=F": "Copper Futures",
    "CL=F": "Crude Oil Futures",
    "NG=F": "Natural Gas Futures",
    
    // Forex
    "EURUSD=X": "EUR/USD",
    "USDINR=X": "USD/INR",
    
    // Crypto
    "BTC": "Bitcoin (BTC)",
    "ETH": "Ethereum (ETH)",
    "SOL": "Solana (SOL)",
    "ARB": "Arbitrum (ARB)",
    "OP": "Optimism (OP)",
    "SUI": "Sui (SUI)",
    "HYPE": "Hyperliquid (HYPE)",
    "JUP": "Jupiter (JUP)",
    "PYTH": "Pyth Network (PYTH)",
    "AVAX": "Avalanche (AVAX)",
    "NEAR": "Near Protocol (NEAR)",
    
    // US Stocks
    "AAPL": "Apple Inc. (AAPL)",
    "MSFT": "Microsoft (MSFT)",
    "NVDA": "NVIDIA (NVDA)",
    "TSLA": "Tesla (TSLA)",
    "AMZN": "Amazon (AMZN)",
    "AMD": "AMD (AMD)",
    "META": "Meta Platforms (META)",
    "GOOGL": "Alphabet (GOOGL)",
    
    // Indian Stocks
    "RELIANCE.NS": "Reliance Industries",
    "TCS.NS": "TCS",
    "INFY.NS": "Infosys",
    "HDFCBANK.NS": "HDFC Bank",
    "ICICIBANK.NS": "ICICI Bank",
    "TATAMOTORS.NS": "Tata Motors",
    "SBIN.NS": "SBI"
};

function generateIndicatorDropdownHTML(paneId, savedIndicatorsStr) {
    const saved = (savedIndicatorsStr || "none").split(",");
    const isChecked = (val) => saved.includes(val) ? "checked" : "";
    
    const options = [
        { value: "ema9", label: "EMA 9" },
        { value: "ema10", label: "EMA 10" },
        { value: "ema20", label: "EMA 20" },
        { value: "ema30", label: "EMA 30" },
        { value: "ema50", label: "EMA 50" },
        { value: "ema100", label: "EMA 100" },
        { value: "ema200", label: "EMA 200" },
        { type: "divider" },
        { value: "sma20", label: "SMA 20" },
        { value: "sma50", label: "SMA 50" },
        { value: "sma100", label: "SMA 100" },
        { value: "sma200", label: "SMA 200" },
        { type: "divider" },
        { value: "vwap", label: "VWAP" },
        { value: "wma20", label: "WMA 20" },
        { value: "hma20", label: "HMA 20" },
        { type: "divider" },
        { value: "st_10_1", label: "Supertrend 10,1" },
        { value: "st_10_2", label: "Supertrend 10,2" },
        { value: "st_10_3", label: "Supertrend 10,3" },
        { type: "divider" },
        { value: "rsi", label: "RSI 14" },
        { value: "obv", label: "On Balance Volume (OBV)" },
        { value: "bharat_edge", label: "Bharat Smart Edge (RSI 60/40)" },
        { type: "divider" },
        { value: "fvg", label: "Fair Value Gap (FVG)" },
        { value: "vp", label: "Volume Profile (POC/VA)" },
        { value: "devendra_renko", label: "Dr. Devendra Smart Renko Engine" },
        { value: "bb", label: "Bollinger Bands (20, 2)" }
    ];
    
    const activeCount = saved.filter(x => x !== "none" && x !== "").length;
    
    let html = `
    <div class="indicator-dropdown" data-pane-id="${paneId}">
        <button class="indicator-dropdown-btn">
            Indicators <span class="badge" id="${paneId}-indicator-badge">${activeCount}</span>
        </button>
        <div class="indicator-dropdown-menu">
            <label class="clear-all-btn"><input type="checkbox" value="none" ${saved.includes("none") ? "checked" : ""}> None / Clear All</label>
            <div class="divider"></div>
    `;
    
    options.forEach(opt => {
        if (opt.type === "divider") {
            html += `<div class="divider"></div>`;
        } else {
            html += `<label><input type="checkbox" value="${opt.value}" ${isChecked(opt.value)}> ${opt.label}</label>`;
        }
    });
    
    html += `
        </div>
    </div>
    `;
    return html;
}

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

    // 5. Global listener to close dropdowns on click outside
    document.addEventListener("click", (e) => {
        document.querySelectorAll(".indicator-dropdown-menu").forEach(menu => {
            if (!menu.closest(".indicator-dropdown").contains(e.target)) {
                menu.classList.remove("show");
            }
        });
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
                        <option value="3m" ${savedTimeframe === "3m" ? "selected" : ""}>3m</option>
                        <option value="5m" ${savedTimeframe === "5m" ? "selected" : ""}>5m</option>
                        <option value="30m" ${savedTimeframe === "30m" ? "selected" : ""}>30m</option>
                        <option value="1h" ${savedTimeframe === "1h" ? "selected" : ""}>1h</option>
                        <option value="3h" ${savedTimeframe === "3h" ? "selected" : ""}>3h</option>
                        <option value="4h" ${savedTimeframe === "4h" ? "selected" : ""}>4h</option>
                        <option value="6h" ${savedTimeframe === "6h" ? "selected" : ""}>6h</option>
                        <option value="14h" ${savedTimeframe === "14h" ? "selected" : ""}>14h</option>
                        <option value="22h" ${savedTimeframe === "22h" ? "selected" : ""}>22h</option>
                        <option value="1d" ${savedTimeframe === "1d" ? "selected" : ""}>1d</option>
                        <option value="1w" ${savedTimeframe === "1w" ? "selected" : ""}>1w</option>
                        <option value="1mo" ${savedTimeframe === "1mo" ? "selected" : ""}>1mo</option>
                    </select>
                    ${generateIndicatorDropdownHTML(paneId, savedIndicator)}
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
                fontSize: 13,
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

        // Store pane reference
        const paneObj = {
            id: paneId,
            element: paneEl,
            container: containerEl,
            chart: chart,
            candleSeries: candleSeries,
            volumeSeries: volumeSeries,
            dynamicSeries: {},
            priceLines: [],
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
        list.map(sym => `<option value="${sym}">${FRIENDLY_NAMES[sym] || sym}</option>`).join("");
}

// Bind input and dropdown event listeners on the card
function bindPaneEvents(pane) {
    const sourceSel = pane.element.querySelector(".source-select");
    const symbolInp = pane.element.querySelector(".symbol-input");
    const presetsSel = pane.element.querySelector(".presets-select");
    const timeframeSel = pane.element.querySelector(".timeframe-select");

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

    // Indicator dropdown select handlers
    const dropdown = pane.element.querySelector(".indicator-dropdown");
    const btn = dropdown.querySelector(".indicator-dropdown-btn");
    const menu = dropdown.querySelector(".indicator-dropdown-menu");
    const checkboxes = menu.querySelectorAll("input[type='checkbox']");
    const badge = dropdown.querySelector(".badge");
    
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        // Close other menus first
        document.querySelectorAll(".indicator-dropdown-menu").forEach(otherMenu => {
            if (otherMenu !== menu) otherMenu.classList.remove("show");
        });
        menu.classList.toggle("show");
    });
    
    menu.addEventListener("click", (e) => {
        e.stopPropagation();
    });
    
    checkboxes.forEach(cb => {
        cb.addEventListener("change", (e) => {
            let active = [];
            const val = e.target.value;
            
            if (val === "none") {
                if (e.target.checked) {
                    checkboxes.forEach(c => {
                        if (c.value !== "none") c.checked = false;
                    });
                    active = ["none"];
                } else {
                    e.target.checked = true; // force at least "none"
                    active = ["none"];
                }
            } else {
                const noneCb = menu.querySelector("input[value='none']");
                if (noneCb) noneCb.checked = false;
                
                checkboxes.forEach(c => {
                    if (c.checked && c.value !== "none") {
                        active.push(c.value);
                    }
                });
                
                if (active.length === 0) {
                    if (noneCb) noneCb.checked = true;
                    active = ["none"];
                }
            }
            
            const activeStr = active.join(",");
            localStorage.setItem(`${pane.id}_indicator`, activeStr);
            
            const count = active.filter(x => x !== "none").length;
            badge.textContent = count;
            
            updateIndicator(pane);
        });
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
    const barTime = getBarStartTime(tickTime, pane.source, pane.timeframe);
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

function getActualIntervalSeconds(source, timeframe) {
    if (source === "hyperliquid") {
        const hlMap = {
            '1m': 60,
            '3m': 180,
            '5m': 300,
            '30m': 1800,
            '1h': 3600,
            '3h': 14400,    // mapped to 4h
            '4h': 14400,
            '6h': 28800,    // mapped to 8h
            '14h': 43200,   // mapped to 12h
            '22h': 86400,   // mapped to 1d
            '1d': 86400,
            '1w': 604800,
            '1mo': 2592000
        };
        return hlMap[timeframe] || 60;
    } else {
        const yfMap = {
            '1m': 60,
            '3m': 120,      // mapped to 2m
            '5m': 300,
            '30m': 1800,
            '1h': 3600,
            '3h': 3600,     // mapped to 1h
            '4h': 3600,     // mapped to 1h
            '6h': 3600,     // mapped to 1h
            '14h': 86400,    // mapped to 1d
            '22h': 86400,    // mapped to 1d
            '1d': 86400,
            '1w': 604800,
            '1mo': 2592000
        };
        return yfMap[timeframe] || 60;
    }
}

// Calculate Unix timestamp start based on selected source and timeframe
function getBarStartTime(timestampSec, source, timeframe) {
    const d = new Date(timestampSec * 1000);
    
    if (timeframe === "1w") {
        const day = d.getUTCDay();
        const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
        return Math.floor(monday.getTime() / 1000);
    }
    
    if (timeframe === "1mo" || timeframe === "1month") {
        const firstOfMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
        return Math.floor(firstOfMonth.getTime() / 1000);
    }
    
    const intervalSec = getActualIntervalSeconds(source, timeframe);
    return Math.floor(timestampSec / intervalSec) * intervalSec;
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
            continue;
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

function calculateBollingerBands(data, period, stdDevMultiplier) {
    const middle = [];
    const upper = [];
    const lower = [];
    
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            continue;
        }
        
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += data[i - j].close;
        }
        const avg = sum / period;
        
        let varianceSum = 0;
        for (let j = 0; j < period; j++) {
            varianceSum += Math.pow(data[i - j].close - avg, 2);
        }
        const stdDev = Math.sqrt(varianceSum / period);
        
        const time = data[i].time;
        middle.push({ time, value: avg });
        upper.push({ time, value: avg + stdDevMultiplier * stdDev });
        lower.push({ time, value: avg - stdDevMultiplier * stdDev });
    }
    
    return { middle, upper, lower };
}

function calculateWMA(data, period) {
    const wma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) continue;
        let sum = 0;
        let weightSum = 0;
        for (let j = 0; j < period; j++) {
            const weight = period - j;
            // Support both bar objects (.close) and raw number arrays (.value or raw numbers)
            const price = data[i - j].close !== undefined ? data[i - j].close : data[i - j].value;
            sum += price * weight;
            weightSum += weight;
        }
        wma.push({
            time: data[i].time,
            value: sum / weightSum
        });
    }
    return wma;
}

function calculateHMA(data, period) {
    if (data.length < period) return [];
    
    const halfPeriod = Math.floor(period / 2);
    const sqrtPeriod = Math.floor(Math.sqrt(period));
    
    const wmaHalf = calculateWMA(data, halfPeriod);
    const wmaFull = calculateWMA(data, period);
    
    const wmaHalfMap = {};
    wmaHalf.forEach(x => wmaHalfMap[x.time] = x.value);
    
    const wmaFullMap = {};
    wmaFull.forEach(x => wmaFullMap[x.time] = x.value);
    
    const rawHma = [];
    for (let i = 0; i < data.length; i++) {
        const t = data[i].time;
        if (wmaHalfMap[t] !== undefined && wmaFullMap[t] !== undefined) {
            rawHma.push({
                time: t,
                value: 2 * wmaHalfMap[t] - wmaFullMap[t]
            });
        }
    }
    
    const hmaResult = calculateWMA(rawHma, sqrtPeriod);
    return hmaResult;
}

function calculateVWAP(data) {
    const vwap = [];
    let cumulativePV = 0;
    let cumulativeVolume = 0;
    let currentDayStr = "";
    
    for (let i = 0; i < data.length; i++) {
        const bar = data[i];
        const typicalPrice = (bar.high + bar.low + bar.close) / 3;
        const volume = bar.volume || 0;
        
        const date = new Date(bar.time * 1000);
        const dayStr = date.getUTCFullYear() + "-" + date.getUTCMonth() + "-" + date.getUTCDate();
        
        if (dayStr !== currentDayStr) {
            cumulativePV = 0;
            cumulativeVolume = 0;
            currentDayStr = dayStr;
        }
        
        cumulativePV += typicalPrice * volume;
        cumulativeVolume += volume;
        
        const value = cumulativeVolume > 0 ? (cumulativePV / cumulativeVolume) : typicalPrice;
        vwap.push({
            time: bar.time,
            value: value
        });
    }
    return vwap;
}

function calculateSupertrend(data, period, multiplier) {
    if (data.length < period) return [];
    
    const tr = [];
    for (let i = 0; i < data.length; i++) {
        if (i === 0) {
            tr.push(data[i].high - data[i].low);
        } else {
            const prevClose = data[i - 1].close;
            tr.push(Math.max(
                data[i].high - data[i].low,
                Math.abs(data[i].high - prevClose),
                Math.abs(data[i].low - prevClose)
            ));
        }
    }
    
    const atr = [];
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += tr[i];
    }
    let prevAtr = sum / period;
    
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            atr.push(0);
        } else if (i === period - 1) {
            atr.push(prevAtr);
        } else {
            const currentAtr = (prevAtr * (period - 1) + tr[i]) / period;
            atr.push(currentAtr);
            prevAtr = currentAtr;
        }
    }
    
    const supertrend = [];
    let prevFub = 0;
    let prevFlb = 0;
    let prevTrend = 1;
    
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            supertrend.push({ time: data[i].time, value: data[i].close, trend: 1 });
            continue;
        }
        
        const hl2 = (data[i].high + data[i].low) / 2;
        const curAtr = atr[i];
        
        const bub = hl2 + multiplier * curAtr;
        const blb = hl2 - multiplier * curAtr;
        
        const close = data[i].close;
        const prevClose = data[i - 1].close;
        
        let fub = bub;
        let flb = blb;
        
        if (i > period - 1) {
            fub = (bub < prevFub || prevClose > prevFub) ? bub : prevFub;
            flb = (blb > prevFlb || prevClose < prevFlb) ? blb : prevFlb;
        }
        
        let trend = prevTrend;
        let st = 0;
        
        if (trend === 1) {
            if (close < flb) {
                trend = -1;
                st = fub;
            } else {
                st = flb;
            }
        } else {
            if (close > fub) {
                trend = 1;
                st = flb;
            } else {
                st = fub;
            }
        }
        
        supertrend.push({
            time: data[i].time,
            value: st,
            trend: trend
        });
        
        prevFub = fub;
        prevFlb = flb;
        prevTrend = trend;
    }
    
    return supertrend.slice(period - 1);
}

function calculateRSI(data, period) {
    const rsi = [];
    if (data.length < period + 1) return rsi;
    
    let gains = [];
    let losses = [];
    
    for (let i = 1; i < data.length; i++) {
        const diff = data[i].close - data[i - 1].close;
        gains.push(diff > 0 ? diff : 0);
        losses.push(diff < 0 ? -diff : 0);
    }
    
    let avgGain = 0;
    let avgLoss = 0;
    
    for (let i = 0; i < period; i++) {
        avgGain += gains[i];
        avgLoss += losses[i];
    }
    
    avgGain /= period;
    avgLoss /= period;
    
    rsi.push({
        time: data[period].time,
        value: avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss))
    });
    
    for (let i = period; i < gains.length; i++) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
        rsi.push({
            time: data[i + 1].time,
            value: avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss))
        });
    }
    return rsi;
}

function calculateOBV(data) {
    const obv = [];
    let currentObv = 0;
    for (let i = 0; i < data.length; i++) {
        const bar = data[i];
        if (i > 0) {
            const prevClose = data[i - 1].close;
            if (bar.close > prevClose) {
                currentObv += bar.volume || 0;
            } else if (bar.close < prevClose) {
                currentObv -= bar.volume || 0;
            }
        } else {
            currentObv = bar.volume || 0;
        }
        obv.push({
            time: bar.time,
            value: currentObv
        });
    }
    return obv;
}

function scanFairValueGaps(data) {
    const markers = [];
    if (data.length < 3) return markers;
    
    for (let i = 2; i < data.length; i++) {
        const c1 = data[i - 2];
        const c2 = data[i - 1];
        const c3 = data[i];
        
        if (c3.low > c1.high) {
            markers.push({
                time: c2.time,
                position: "belowBar",
                color: "#10b981",
                shape: "arrowUp",
                text: "Bullish FVG"
            });
        } else if (c3.high < c1.low) {
            markers.push({
                time: c2.time,
                position: "aboveBar",
                color: "#f43f5e",
                shape: "arrowDown",
                text: "Bearish FVG"
            });
        }
    }
    return markers;
}

function calculateVolumeProfile(data) {
    if (data.length === 0) return null;
    
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for (let i = 0; i < data.length; i++) {
        if (data[i].low < minPrice) minPrice = data[i].low;
        if (data[i].high > maxPrice) maxPrice = data[i].high;
    }
    
    const numBins = 50;
    const binSize = (maxPrice - minPrice) / numBins;
    if (binSize === 0) return null;
    
    const bins = Array(numBins).fill(0).map((_, idx) => ({
        price: minPrice + idx * binSize + binSize / 2,
        low: minPrice + idx * binSize,
        high: minPrice + (idx + 1) * binSize,
        volume: 0
    }));
    
    let totalVolume = 0;
    for (let i = 0; i < data.length; i++) {
        const bar = data[i];
        const vol = bar.volume || 0;
        totalVolume += vol;
        
        let overlapBins = [];
        for (let j = 0; j < numBins; j++) {
            if (bar.low <= bins[j].high && bar.high >= bins[j].low) {
                overlapBins.push(j);
            }
        }
        
        if (overlapBins.length > 0) {
            const volPerBin = vol / overlapBins.length;
            overlapBins.forEach(idx => {
                bins[idx].volume += volPerBin;
            });
        }
    }
    
    let maxVol = -1;
    let pocIdx = 0;
    for (let i = 0; i < numBins; i++) {
        if (bins[i].volume > maxVol) {
            maxVol = bins[i].volume;
            pocIdx = i;
        }
    }
    const pocPrice = bins[pocIdx].price;
    
    const targetVolume = totalVolume * 0.7;
    let currentVolume = bins[pocIdx].volume;
    let lowIdx = pocIdx;
    let highIdx = pocIdx;
    
    while (currentVolume < targetVolume && (lowIdx > 0 || highIdx < numBins - 1)) {
        const nextLowVol = lowIdx > 0 ? bins[lowIdx - 1].volume : -1;
        const nextHighVol = highIdx < numBins - 1 ? bins[highIdx + 1].volume : -1;
        
        if (nextLowVol > nextHighVol) {
            lowIdx--;
            currentVolume += nextLowVol;
        } else {
            highIdx++;
            currentVolume += nextHighVol;
        }
    }
    
    const valPrice = bins[lowIdx].low;
    const vahPrice = bins[highIdx].high;
    
    return { pocPrice, valPrice, vahPrice };
}

// Dynamic Series and Helper Registries
function getOrCreateSeries(pane, key, color, priceScaleId = "right", options = {}) {
    if (!pane.dynamicSeries) pane.dynamicSeries = {};
    if (pane.dynamicSeries[key]) return pane.dynamicSeries[key];
    
    const series = pane.chart.addSeries(LightweightCharts.LineSeries, {
        priceScaleId,
        color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        ...options
    });
    pane.dynamicSeries[key] = series;
    return series;
}

// Core Technical Indicator Renderer supporting multiple simultaneous selections
function updateIndicator(pane) {
    // 1. Clean up existing dynamic series
    if (pane.dynamicSeries) {
        Object.keys(pane.dynamicSeries).forEach(key => {
            try {
                pane.chart.removeSeries(pane.dynamicSeries[key]);
            } catch(err) {
                console.error("Error removing series:", err);
            }
        });
    }
    pane.dynamicSeries = {};
    
    // 2. Clean up price lines
    if (pane.priceLines) {
        pane.priceLines.forEach(line => {
            try {
                pane.candleSeries.removePriceLine(line);
            } catch(err) {}
        });
    }
    pane.priceLines = [];
    
    // 3. Clear markers
    pane.candleSeries.setMarkers([]);
    
    // 4. Parse selected indicators
    const saved = localStorage.getItem(`${pane.id}_indicator`) || "none";
    const types = saved.split(",").filter(x => x !== "none" && x !== "");
    
    // 5. Manage left price scale visibility
    const needsLeftScale = types.some(t => ["rsi", "obv", "bharat_edge"].includes(t));
    pane.chart.priceScale("left").applyOptions({
        visible: needsLeftScale
    });
    
    if (types.length === 0 || !pane.candles || pane.candles.length === 0) {
        return;
    }
    
    const allMarkers = [];
    
    // Loop through each selected indicator type
    types.forEach(type => {
        // EMAs
        if (type === "ema9") {
            const series = getOrCreateSeries(pane, "ema9", "#38bdf8");
            series.setData(calculateEMA(pane.candles, 9));
        } else if (type === "ema10") {
            const series = getOrCreateSeries(pane, "ema10", "#22c55e");
            series.setData(calculateEMA(pane.candles, 10));
        } else if (type === "ema20") {
            const series = getOrCreateSeries(pane, "ema20", "#10b981");
            series.setData(calculateEMA(pane.candles, 20));
        } else if (type === "ema30") {
            const series = getOrCreateSeries(pane, "ema30", "#f97316");
            series.setData(calculateEMA(pane.candles, 30));
        } else if (type === "ema50") {
            const series = getOrCreateSeries(pane, "ema50", "#f43f5e");
            series.setData(calculateEMA(pane.candles, 50));
        } else if (type === "ema100") {
            const series = getOrCreateSeries(pane, "ema100", "#ec4899");
            series.setData(calculateEMA(pane.candles, 100));
        } else if (type === "ema200") {
            const series = getOrCreateSeries(pane, "ema200", "#a855f7");
            series.setData(calculateEMA(pane.candles, 200));
        }
        
        // SMAs
        else if (type === "sma20") {
            const series = getOrCreateSeries(pane, "sma20", "#38bdf8");
            series.setData(calculateSMA(pane.candles, 20));
        } else if (type === "sma50") {
            const series = getOrCreateSeries(pane, "sma50", "#fbbf24");
            series.setData(calculateSMA(pane.candles, 50));
        } else if (type === "sma100") {
            const series = getOrCreateSeries(pane, "sma100", "#a855f7");
            series.setData(calculateSMA(pane.candles, 100));
        } else if (type === "sma200") {
            const series = getOrCreateSeries(pane, "sma200", "#e11d48");
            series.setData(calculateSMA(pane.candles, 200));
        }
        
        // Other Overlays
        else if (type === "vwap") {
            const series = getOrCreateSeries(pane, "vwap", "#eab308");
            series.setData(calculateVWAP(pane.candles));
        } else if (type === "wma20") {
            const series = getOrCreateSeries(pane, "wma20", "#f97316");
            series.setData(calculateWMA(pane.candles, 20));
        } else if (type === "hma20") {
            const series = getOrCreateSeries(pane, "hma20", "#06b6d4");
            series.setData(calculateHMA(pane.candles, 20));
        }
        
        // Supertrends
        else if (type === "st_10_1") {
            const st = calculateSupertrend(pane.candles, 10, 1);
            const lastTrend = st.length > 0 ? st[st.length - 1].trend : 1;
            const color = lastTrend === 1 ? "#10b981" : "#f43f5e";
            const series = getOrCreateSeries(pane, "st_10_1", color);
            series.setData(st);
        } else if (type === "st_10_2") {
            const st = calculateSupertrend(pane.candles, 10, 2);
            const lastTrend = st.length > 0 ? st[st.length - 1].trend : 1;
            const color = lastTrend === 1 ? "#10b981" : "#f43f5e";
            const series = getOrCreateSeries(pane, "st_10_2", color);
            series.setData(st);
        } else if (type === "st_10_3") {
            const st = calculateSupertrend(pane.candles, 10, 3);
            const lastTrend = st.length > 0 ? st[st.length - 1].trend : 1;
            const color = lastTrend === 1 ? "#10b981" : "#f43f5e";
            const series = getOrCreateSeries(pane, "st_10_3", color);
            series.setData(st);
        }
        
        // Oscillators (Left scale)
        else if (type === "rsi") {
            const series = getOrCreateSeries(pane, "rsi", "#ec4899", "left");
            series.setData(calculateRSI(pane.candles, 14));
        } else if (type === "obv") {
            const series = getOrCreateSeries(pane, "obv", "#38bdf8", "left");
            series.setData(calculateOBV(pane.candles));
        } else if (type === "bharat_edge") {
            const series = getOrCreateSeries(pane, "bharat_edge", "#22c55e", "left");
            series.setData(calculateRSI(pane.candles, 14));
            
            const edge60 = series.createPriceLine({
                price: 60,
                color: "rgba(16, 185, 129, 0.4)",
                lineWidth: 1.5,
                lineStyle: 2,
                axisLabelVisible: true,
                title: "Bullish Edge (60)"
            });
            const edge40 = series.createPriceLine({
                price: 40,
                color: "rgba(244, 63, 94, 0.4)",
                lineWidth: 1.5,
                lineStyle: 2,
                axisLabelVisible: true,
                title: "Bearish Edge (40)"
            });
            pane.priceLines.push(edge60, edge40);
        }
        
        // Fair Value Gaps
        else if (type === "fvg") {
            const markers = scanFairValueGaps(pane.candles);
            allMarkers.push(...markers);
        }
        
        // Volume Profile
        else if (type === "vp") {
            const vp = calculateVolumeProfile(pane.candles);
            if (vp) {
                const pocLine = pane.candleSeries.createPriceLine({
                    price: vp.pocPrice,
                    color: "#f43f5e",
                    lineWidth: 2,
                    lineStyle: 0,
                    axisLabelVisible: true,
                    title: "POC"
                });
                const valLine = pane.candleSeries.createPriceLine({
                    price: vp.valPrice,
                    color: "rgba(56, 189, 248, 0.6)",
                    lineWidth: 1.5,
                    lineStyle: 2,
                    axisLabelVisible: true,
                    title: "VAL"
                });
                const vahLine = pane.candleSeries.createPriceLine({
                    price: vp.vahPrice,
                    color: "rgba(56, 189, 248, 0.6)",
                    lineWidth: 1.5,
                    lineStyle: 2,
                    axisLabelVisible: true,
                    title: "VAH"
                });
                pane.priceLines.push(pocLine, valLine, vahLine);
            }
        }
        
        // Bollinger Bands
        else if (type === "bb") {
            const mid = getOrCreateSeries(pane, "bb_middle", "rgba(255, 255, 255, 0.4)");
            const upper = getOrCreateSeries(pane, "bb_upper", "rgba(56, 189, 248, 0.4)", "right", { lineStyle: 2, lineWidth: 1.5 });
            const lower = getOrCreateSeries(pane, "bb_lower", "rgba(56, 189, 248, 0.4)", "right", { lineStyle: 2, lineWidth: 1.5 });
            
            const bb = calculateBollingerBands(pane.candles, 20, 2);
            mid.setData(bb.middle);
            upper.setData(bb.upper);
            lower.setData(bb.lower);
        }
        
        // Dr. Devendra Renko Engine
        else if (type === "devendra_renko") {
            const renko = calculateRenkoTargets(pane.candles);
            if (renko) {
                renko.signals.forEach(sig => {
                    allMarkers.push({
                        time: sig.time,
                        position: sig.type === "BUY" ? "belowBar" : "aboveBar",
                        color: sig.type === "BUY" ? "#10b981" : "#f43f5e",
                        shape: sig.type === "BUY" ? "arrowUp" : "arrowDown",
                        text: `${sig.type} (Renko)`
                    });
                });
                
                const t1 = pane.candleSeries.createPriceLine({
                    price: renko.target1,
                    color: "#10b981",
                    lineWidth: 1.5,
                    lineStyle: 2,
                    axisLabelVisible: true,
                    title: `Target 1 (${renko.latestSignal.type === "BUY" ? "UP" : "DOWN"})`
                });
                const t2 = pane.candleSeries.createPriceLine({
                    price: renko.target2,
                    color: "#059669",
                    lineWidth: 1.5,
                    lineStyle: 2,
                    axisLabelVisible: true,
                    title: "Target 2"
                });
                const t3 = pane.candleSeries.createPriceLine({
                    price: renko.target3,
                    color: "#047857",
                    lineWidth: 2,
                    lineStyle: 0,
                    axisLabelVisible: true,
                    title: "Target 3"
                });
                const sl = pane.candleSeries.createPriceLine({
                    price: renko.stopLoss,
                    color: "#ef4444",
                    lineWidth: 2,
                    lineStyle: 2,
                    axisLabelVisible: true,
                    title: "Stop Loss"
                });
                pane.priceLines.push(t1, t2, t3, sl);
            }
        }
    });
    
    // Sort and set accumulated markers
    if (allMarkers.length > 0) {
        allMarkers.sort((a, b) => a.time - b.time);
        pane.candleSeries.setMarkers(allMarkers);
    }
}

function calculateRenkoTargets(data) {
    if (data.length < 20) return null;
    
    // 1. Calculate ATR for brick size calculation
    const tr = [];
    for (let i = 1; i < data.length; i++) {
        tr.push(Math.max(
            data[i].high - data[i].low,
            Math.abs(data[i].high - data[i - 1].close),
            Math.abs(data[i].low - data[i - 1].close)
        ));
    }
    let atrSum = 0;
    for (let i = 0; i < 14; i++) atrSum += tr[tr.length - 1 - i];
    const brickSize = atrSum / 14;
    if (brickSize === 0) return null;
    
    // 2. Generate Renko bricks in memory
    const bricks = [];
    let prevBrickClose = data[0].close;
    
    for (let i = 1; i < data.length; i++) {
        const close = data[i].close;
        const diff = close - prevBrickClose;
        const numBricks = Math.floor(Math.abs(diff) / brickSize);
        
        if (numBricks > 0) {
            const direction = diff > 0 ? 1 : -1;
            for (let j = 0; j < numBricks; j++) {
                const brickOpen = prevBrickClose;
                const brickClose = prevBrickClose + direction * brickSize;
                bricks.push({
                    time: data[i].time,
                    open: brickOpen,
                    close: brickClose,
                    direction: direction
                });
                prevBrickClose = brickClose;
            }
        }
    }
    
    // 3. Scan bricks for buy/sell flips
    const signals = [];
    for (let i = 1; i < bricks.length; i++) {
        if (bricks[i].direction === 1 && bricks[i - 1].direction === -1) {
            signals.push({ time: bricks[i].time, type: "BUY", price: bricks[i].close });
        } else if (bricks[i].direction === -1 && bricks[i - 1].direction === 1) {
            signals.push({ time: bricks[i].time, type: "SELL", price: bricks[i].close });
        }
    }
    
    if (signals.length === 0) return null;
    
    const latestSignal = signals[signals.length - 1];
    const entry = latestSignal.price;
    const isBuy = latestSignal.type === "BUY";
    
    // 4. Calculate targets
    const target1 = isBuy ? (entry + brickSize * 1.5) : (entry - brickSize * 1.5);
    const target2 = isBuy ? (entry + brickSize * 3) : (entry - brickSize * 3);
    const target3 = isBuy ? (entry + brickSize * 4.5) : (entry - brickSize * 4.5);
    const stopLoss = isBuy ? (entry - brickSize * 1.5) : (entry + brickSize * 1.5);
    
    return {
        latestSignal,
        entry,
        target1,
        target2,
        target3,
        stopLoss,
        signals,
        brickSize
    };
}
