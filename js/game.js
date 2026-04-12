// =================================================================
// ChessAnalyzer — game.js v1.0 — Módulo de Partidas en Vivo
// =================================================================

// ---------------------------------------------------------------
// A. TEMAS DE TABLERO Y PIEZAS (Solicitado por el usuario)
// ---------------------------------------------------------------
const BOARD_THEMES = {
    madera:    { light:'#e8d0aa', dark:'#966746', name:'Madera Clásica 🌲' },
    esmeralda: { light:'#ffffdd', dark:'#6e9f4a', name:'Esmeralda ♟' },
    ambar:     { light:'#f0d9b5', dark:'#b58863', name:'Ámbar FIDE ♛' },
    ocean:     { light:'#d7f0f7', dark:'#3d7a9d', name:'Océano 🌊' },
    nocturno:  { light:'#b0b0b0', dark:'#303030', name:'Nocturno 🌑' },
    amatista:  { light:'#f0d9ff', dark:'#7a5da5', name:'Amatista 💜' },
    artico:    { light:'#e8f4f8', dark:'#4a90c4', name:'Ártico ❄' },
    coral:     { light:'#fde3d4', dark:'#c0553d', name:'Coral 🪸' },
};

const PIECE_THEMES = {
    wikipedia: { url:'img/chesspieces/wikipedia/{piece}.png',                  name:'Wikipedia' },
    cburnett:  { url:'https://lichess1.org/assets/piece/cburnett/{piece}.svg', name:'CBurnett (Lichess)' },
    alpha:     { url:'https://lichess1.org/assets/piece/alpha/{piece}.svg',    name:'Alpha' },
    neo:       { url:'https://lichess1.org/assets/piece/neo/{piece}.svg',      name:'Neo' },
    maestro:   { url:'https://lichess1.org/assets/piece/maestro/{piece}.svg',  name:'Maestro' },
    merida:    { url:'https://lichess1.org/assets/piece/merida/{piece}.svg',   name:'Mérida' },
    pirouetti: { url:'https://lichess1.org/assets/piece/pirouetti/{piece}.svg',name:'Pirouetti' },
};

let activeBoardTheme = localStorage.getItem('cbThemeBoard') || 'madera';
let activePieceTheme = localStorage.getItem('cbThemePiece') || 'wikipedia';

function applyBoardTheme(id) {
    activeBoardTheme = id;
    const t = BOARD_THEMES[id];
    if (!t) return;
    document.documentElement.style.setProperty('--white-cell', t.light);
    document.documentElement.style.setProperty('--black-cell', t.dark);
    document.querySelectorAll('.board-theme-swatch').forEach(el =>
        el.classList.toggle('active-theme', el.dataset.theme === id));
    localStorage.setItem('cbThemeBoard', id);
}

function applyPieceTheme(id) {
    activePieceTheme = id;
    const url = PIECE_THEMES[id] ? PIECE_THEMES[id].url : PIECE_THEMES.wikipedia.url;

    // Reiniciar tablero de juego si existe
    if (liveBoard) {
        const pos = liveGame ? liveGame.fen() : 'start';
        liveBoard.destroy();
        initLiveBoard(url, pos);
    }
    // Reiniciar tablero de análisis (global 'board' de app.js)
    if (typeof board !== 'undefined' && board) {
        try {
            const pos = board.position();
            board.destroy();
            board = Chessboard('board', {
                pieceTheme: url,
                position: pos || 'start',
                showNotation: true,
                draggable: true,
                onDragStart: typeof onDragStart !== 'undefined' ? onDragStart : null,
                onDrop: typeof onDrop !== 'undefined' ? onDrop : null,
                onSnapEnd: typeof onSnapEnd !== 'undefined' ? onSnapEnd : null,
            });
            setTimeout(() => board && board.resize(), 200);
        } catch(e) { console.warn('No se pudo reinicializar el tablero de análisis:', e); }
    }
    document.querySelectorAll('.piece-theme-btn').forEach(el =>
        el.classList.toggle('active-theme', el.dataset.theme === id));
    localStorage.setItem('cbThemePiece', id);
}

// ---------------------------------------------------------------
// B. CONFIGURACIÓN CPU Y TIEMPO
// ---------------------------------------------------------------
const CPU_CONFIGS = [
    { label:'Principiante', skill:0,  movetime:100  },
    { label:'Aficionado',   skill:4,  movetime:500  },
    { label:'Intermedio',   skill:8,  movetime:1000 },
    { label:'Avanzado',     skill:14, movetime:1500 },
    { label:'Máquina 🤖',   skill:20, movetime:3000 },
];

const TIME_PRESETS = [
    { id:'libre', label:'♾ Libre',   time:0,       inc:0     },
    { id:'b1',    label:'⚡ 1+0',    time:60000,   inc:0     },
    { id:'b21',   label:'⚡ 2+1',    time:120000,  inc:1000  },
    { id:'bl32',  label:'🔥 3+2',    time:180000,  inc:2000  },
    { id:'bl5',   label:'🔥 5+0',    time:300000,  inc:0     },
    { id:'r10',   label:'⏱ 10+0',   time:600000,  inc:0     },
    { id:'r1510', label:'⏱ 15+10',  time:900000,  inc:10000 },
    { id:'c30',   label:'🏛 30+0',   time:1800000, inc:0     },
];

// ---------------------------------------------------------------
// C. ESTADO DEL JUEGO
// ---------------------------------------------------------------
let liveGame   = null;
let liveBoard  = null;
let gameMode   = 'hvc';      // 'hvh' | 'hvc'
let playerColor = 'w';       // Para HvC
let selectedDifficulty = 2;  // Índice de CPU_CONFIGS
let selectedTimePreset = 'libre';
let selectedTime = null;     // { time: ms, inc: ms } o null

let wTime = 0, bTime = 0;
let clockInterval = null;
let clockRunning = false;

let gameActive = false;
let liveMovesList = [];      
let cpuThinking = false;

// ---------------------------------------------------------------
// D. INICIALIZACIÓN
// ---------------------------------------------------------------
function initLiveBoard(pieceUrl, position) {
    const url = pieceUrl || PIECE_THEMES[activePieceTheme].url;
    liveBoard = Chessboard('board-play', {
        pieceTheme: url,
        position: position || 'start',
        showNotation: true,
        draggable: true,
        onDragStart: onLiveDragStart,
        onDrop: onLiveDrop,
        onSnapEnd: onLiveSnapEnd,
    });
    setTimeout(() => liveBoard && liveBoard.resize(), 150);
}

function removeHighlights() {
    $('#board-play .square-55d63').removeClass('highlight-legal');
}

function addHighlight(square) {
    const $el = $('#board-play .square-' + square);
    $el.addClass('highlight-legal');
}

function onLiveDragStart(source, piece) {
    if (!gameActive || !liveGame || liveGame.game_over()) return false;
    const turn = liveGame.turn();
    if (gameMode === 'hvc' && turn !== playerColor) return false;
    if ((turn === 'w' && piece.search(/^b/) !== -1) ||
        (turn === 'b' && piece.search(/^w/) !== -1)) return false;

    // --- Resaltar movimientos legales ---
    const moves = liveGame.moves({
        square: source,
        verbose: true
    });
    if (moves.length === 0) return false;
    
    moves.forEach(m => addHighlight(m.to));
    return true;
}

function onLiveDrop(source, target) {
    removeHighlights();
    if (!liveGame) return 'snapback';
    const move = liveGame.move({ from: source, to: target, promotion: 'q' });
    if (!move) return 'snapback';
    
    if (typeof playChessSound === 'function') playChessSound(move);
    onMoveMade(move);
}

function onLiveSnapEnd() {
    if (liveBoard && liveGame) liveBoard.position(liveGame.fen());
}

function onMoveMade(move) {
    const moverColor = (liveGame.turn() === 'w') ? 'b' : 'w';
    liveMovesList.push({ san: move.san, fen: liveGame.fen(), color: moverColor });
    renderLiveMoves();

    // Incremento
    if (selectedTime && selectedTime.time > 0 && selectedTime.inc > 0) {
        if (moverColor === 'w') wTime += selectedTime.inc;
        else bTime += selectedTime.inc;
    }

    // Gestion de reloj
    if (selectedTime && selectedTime.time > 0) {
        stopClock();
        if (!liveGame.game_over()) startClock(liveGame.turn());
    }

    updateClockDisplay();
    updateTurnIndicator();

    if (liveGame.game_over()) {
        setTimeout(() => endGame(getGameResult()), 400);
        return;
    }

    // Turno CPU
    if (gameMode === 'hvc' && liveGame.turn() !== playerColor) {
        requestCpuMove();
    }
}

// ---------------------------------------------------------------
// E. CPU LOGIC (Utiliza el engineWorker de app.js)
// ---------------------------------------------------------------
function requestCpuMove() {
    if (!engineWorker || cpuThinking) return;
    cpuThinking = true;
    const cfg = CPU_CONFIGS[selectedDifficulty];
    
    // Cambiar temporalmente el handler del engine
    const oldHandler = engineWorker.onmessage;
    engineWorker.onmessage = function(e) {
        const data = e.data;
        if (typeof data !== 'string') return;
        if (data.startsWith('bestmove')) {
            cpuThinking = false;
            engineWorker.onmessage = oldHandler;
            
            const bestLAN = data.split(' ')[1];
            if (bestLAN && bestLAN !== '(none)') {
                const moveResult = liveGame.move({
                    from: bestLAN.substring(0,2),
                    to: bestLAN.substring(2,4),
                    promotion: bestLAN.length > 4 ? bestLAN[4] : 'q'
                });
                if (moveResult) {
                    liveBoard.position(liveGame.fen());
                    if (typeof playChessSound === 'function') playChessSound(moveResult);
                    onMoveMade(moveResult);
                }
            }
        }
    };

    engineWorker.postMessage('ucinewgame');
    engineWorker.postMessage(`setoption name Skill Level value ${cfg.skill}`);
    engineWorker.postMessage(`position fen ${liveGame.fen()}`);
    engineWorker.postMessage(`go movetime ${cfg.movetime}`);
}

// ---------------------------------------------------------------
// F. RELOJES
// ---------------------------------------------------------------
function startClock(color) {
    clockRunning = true;
    let lastTick = Date.now();
    clockInterval = setInterval(() => {
        const now = Date.now();
        const delta = now - lastTick;
        lastTick = now;

        if (color === 'w') {
            wTime = Math.max(0, wTime - delta);
            if (wTime === 0) { stopClock(); endGame({ winner: 'b', reason: 'tiempo' }); }
        } else {
            bTime = Math.max(0, bTime - delta);
            if (bTime === 0) { stopClock(); endGame({ winner: 'w', reason: 'tiempo' }); }
        }
        updateClockDisplay();
    }, 100);
}

function stopClock() {
    clockRunning = false;
    if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
}

function formatTime(ms) {
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateClockDisplay() {
    const wEl = document.getElementById('clock-white');
    const bEl = document.getElementById('clock-black');
    if (!wEl || !bEl) return;

    if (!selectedTime || selectedTime.time === 0) {
        wEl.textContent = '♾';
        bEl.textContent = '♾';
        return;
    }

    wEl.textContent = formatTime(wTime);
    bEl.textContent = formatTime(bTime);
    
    // Efectos visuales de reloj activo
    wEl.classList.toggle('clock-active', liveGame && liveGame.turn() === 'w' && gameActive);
    bEl.classList.toggle('clock-active', liveGame && liveGame.turn() === 'b' && gameActive);
}

// ---------------------------------------------------------------
// G. UI UPDATES
// ---------------------------------------------------------------
function updateTurnIndicator() {
    const el = document.getElementById('game-turn-info');
    if (!el || !liveGame) return;
    const turn = liveGame.turn();
    el.textContent = turn === 'w' ? 'Blancas para mover' : 'Negras para mover';
}

function renderLiveMoves() {
    const container = document.getElementById('game-moves-list');
    if (!container) return;
    container.innerHTML = liveMovesList.map((m, i) => {
        const num = m.color === 'w' ? `${Math.floor(i/2)+1}. ` : '';
        return `<span class="game-move-item">${num}${m.san}</span>`;
    }).join(' ');
}

// ---------------------------------------------------------------
// H. CONTROL DE PARTIDA
// ---------------------------------------------------------------
function startGame() {
    if (!engineWorker) return alert('El motor no está listo.');
    
    liveGame = new Chess();
    liveMovesList = [];
    gameActive = true;
    
    // Determinar color
    const colorBtn = document.querySelector('.color-btn.active');
    const colorVal = colorBtn ? colorBtn.dataset.color : 'w';
    playerColor = colorVal === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : colorVal;

    // Configurar tiempo
    const preset = TIME_PRESETS.find(p => p.id === selectedTimePreset);
    if (preset && preset.time > 0) {
        selectedTime = { time: preset.time, inc: preset.inc };
        wTime = preset.time;
        bTime = preset.time;
    } else {
        selectedTime = null;
    }

    // UI
    document.getElementById('play-config').classList.add('hidden');
    document.getElementById('play-game').classList.remove('hidden');
    document.getElementById('result-overlay').classList.add('hidden');

    if (liveBoard) {
        liveBoard.orientation(playerColor === 'w' ? 'white' : 'black');
        liveBoard.start();
    }

    updateClockDisplay();
    updateTurnIndicator();
    renderLiveMoves();

    if (gameMode === 'hvc' && playerColor === 'b') {
        requestCpuMove();
    }
}

function getGameResult() {
    if (liveGame.in_checkmate()) return { winner: liveGame.turn() === 'w' ? 'b' : 'w', reason: 'jaque mate' };
    if (liveGame.in_draw()) return { winner: null, reason: 'tablas' };
    return { winner: null, reason: 'terminado' };
}

function endGame(result) {
    stopClock();
    gameActive = false;
    
    const overlay = document.getElementById('result-overlay');
    const title = document.getElementById('result-title');
    const reason = document.getElementById('result-subtitle');
    
    if (result.winner === 'w') title.textContent = '¡Ganan las Blancas!';
    else if (result.winner === 'b') title.textContent = '¡Ganan las Negras!';
    else title.textContent = 'Tablas';
    
    reason.textContent = result.reason;
    overlay.classList.remove('hidden');
    
    // Guardar en el historial
    saveGameToHistory(result);
}

function saveGameToHistory(result) {
    try {
        const history = JSON.parse(localStorage.getItem('chess_history') || '[]');
        const newGame = {
            id: Date.now(),
            date: new Date().toLocaleString(),
            pgn: liveGame.pgn(),
            result: result.winner ? (result.winner === 'w' ? '1-0' : '0-1') : '½-½',
            mode: gameMode === 'hvc' ? 'vs CPU' : 'vs Humano',
            rawResult: result
        };
        history.unshift(newGame);
        localStorage.setItem('chess_history', JSON.stringify(history.slice(0, 50))); // Máximo 50 partidas
        if (typeof renderHistory === 'function') renderHistory();
    } catch(e) { console.error('Error al guardar historial:', e); }
}

function abortGame() {
    stopClock();
    gameActive = false;
    document.getElementById('play-config').classList.remove('hidden');
    document.getElementById('play-game').classList.add('hidden');
}

function resetToConfig() {
    closeResultModal();
    abortGame();
}

function closeResultModal() {
    document.getElementById('result-overlay').classList.add('hidden');
}

function analyzeThis() {
    // Exportar PGN y enviarlo a la sección de análisis
    const pgn = liveGame.pgn();
    switchTab('analyze');
    document.getElementById('pgn-input').value = pgn;
    document.getElementById('btn-analyze').click();
}

// ---------------------------------------------------------------
// I. NAVEGACIÓN Y TABS
// ---------------------------------------------------------------
function switchTab(tabId) {
    document.querySelectorAll('.app-section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`section-${tabId}`).classList.remove('hidden');
    
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');
    
    // Forzar redimensionamiento del tablero después de un pequeño delay
    setTimeout(() => {
        if (tabId === 'play') {
            if (!liveBoard) initLiveBoard();
            else liveBoard.resize();
        } else if (tabId === 'analyze') {
            if (typeof board !== 'undefined' && board) board.resize();
        } else if (tabId === 'history') {
            renderHistory();
        }
    }, 50);
}

function renderHistory() {
    const history = JSON.parse(localStorage.getItem('chess_history') || '[]');
    const tbody = document.getElementById('history-tbody');
    const empty = document.getElementById('history-empty');
    if (!tbody || !empty) return;

    if (history.length === 0) {
        tbody.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');
    tbody.innerHTML = history.map(g => `
        <tr>
            <td>${g.date}</td>
            <td>${g.mode}</td>
            <td style="font-weight:bold; color:var(--accent)">${g.result}</td>
            <td>
                <button class="btn" style="padding: 5px 12px; font-size: 0.8rem;" onclick="loadFromHistory(${g.id})">🔍 ANALIZAR</button>
            </td>
        </tr>
    `).join('');
}

function clearHistory() {
    if (confirm('¿Seguro que quieres borrar todo el historial?')) {
        localStorage.removeItem('chess_history');
        renderHistory();
    }
}

function loadFromHistory(id) {
    const history = JSON.parse(localStorage.getItem('chess_history') || '[]');
    const game = history.find(g => g.id === id);
    if (!game) return;

    switchTab('analyze');
    document.getElementById('pgn-input').value = game.pgn;
    document.getElementById('btn-analyze').click();
}

// ---------------------------------------------------------------
// J. EVENT LISTENERS
// ---------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // Modo Buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            gameMode = btn.dataset.mode;
            document.getElementById('hvc-controls').classList.toggle('hidden', gameMode === 'hvh');
        });
    });

    // Color Buttons
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Time Presets
    const timeGrid = document.getElementById('time-presets');
    if (timeGrid) {
        timeGrid.innerHTML = TIME_PRESETS.map(p => 
            `<button class="time-btn ${p.id === selectedTimePreset ? 'active' : ''}" data-id="${p.id}">${p.label}</button>`
        ).join('');
        
        timeGrid.querySelectorAll('.time-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                timeGrid.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedTimePreset = btn.dataset.id;
            });
        });
    }

    // Difficulty Select
    const diffSelect = document.getElementById('cpu-difficulty');
    if (diffSelect) {
        diffSelect.innerHTML = CPU_CONFIGS.map((c, i) => `<option value="${i}" ${i === 2 ? 'selected' : ''}>${c.label}</option>`).join('');
        diffSelect.addEventListener('change', (e) => selectedDifficulty = parseInt(e.target.value));
    }

    // Board Swatches
    const boardContainer = document.getElementById('board-themes');
    if (boardContainer) {
        boardContainer.innerHTML = Object.entries(BOARD_THEMES).map(([id, t]) => 
            `<div class="theme-swatch ${id === activeBoardTheme ? 'active' : ''}" data-id="${id}" style="background: ${t.dark}; border-color: ${t.light}" title="${t.name}"></div>`
        ).join('');
        
        boardContainer.querySelectorAll('.theme-swatch').forEach(s => {
            s.addEventListener('click', () => {
                boardContainer.querySelectorAll('.theme-swatch').forEach(sw => sw.classList.remove('active'));
                s.classList.add('active');
                applyBoardTheme(s.dataset.id);
            });
        });
    }

    // Piece Select
    const pieceSelect = document.getElementById('piece-themes');
    if (pieceSelect) {
        pieceSelect.innerHTML = Object.entries(PIECE_THEMES).map(([id, t]) => `<option value="${id}" ${id === activePieceTheme ? 'selected' : ''}>${t.name}</option>`).join('');
        pieceSelect.addEventListener('change', (e) => applyPieceTheme(e.target.value));
    }

    // Size Buttons
    document.querySelectorAll('.size-btn').forEach(btn => {
        btn.addEventListener('click', () => updateBoardSize(btn.dataset.size));
    });

    // Init themes & size
    applyBoardTheme(activeBoardTheme);
    updateBoardSize(localStorage.getItem('cbBoardSize') || 'md');
});

// ---------------------------------------------------------------
// K. TAMAÑO DE TABLERO
// ---------------------------------------------------------------
function updateBoardSize(size) {
    const boards = document.querySelectorAll('#board, #board-play');
    boards.forEach(b => {
        b.classList.remove('board-sm', 'board-md', 'board-lg');
        b.classList.add(`board-${size}`);
    });
    if (typeof board !== 'undefined' && board) board.resize();
    if (liveBoard) liveBoard.resize();
    
    document.querySelectorAll('.size-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.size === size));
    localStorage.setItem('cbBoardSize', size);
    
    // Forzar redimensionado tras un breve delay para que el DOM se asiente
    setTimeout(() => {
        if (typeof board !== 'undefined' && board) board.resize();
        if (liveBoard) liveBoard.resize();
    }, 50);
}

// --- EXPORTAR AL ALCANCE GLOBAL (Seguridad) ---
window.switchTab = switchTab;
window.startGame = startGame;
window.resetToConfig = resetToConfig;
window.closeResultModal = closeResultModal;
window.analyzeThis = analyzeThis;
window.resignGame = abortGame; 
window.renderHistory = renderHistory;
window.clearHistory = clearHistory;
window.loadFromHistory = loadFromHistory;
