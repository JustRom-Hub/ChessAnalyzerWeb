// --- Core Variables ---
let board = null;
let game = new Chess();
let engineWorker = null;
let analyzedMoves = []; 
let currentMoveIndex = -1;
let historyMoves = []; 
let isVariation = false;
let variationGame = new Chess();

const DEPTH = 14; 

const ECO_DB = {
    "e4": "B00 - Juego del Peón de Rey",
    "e4 e5": "C20 - Apertura de Rey",
    "e4 e5 Nf3": "C40 - Apertura de Caballero",
    "e4 e5 Nf3 Nc6": "C44 - Apertura de Caballero",
    "e4 e5 Nf3 Nc6 Bb5": "C60 - Ruy Lopez",
    "e4 e5 Nf3 Nc6 Bc4": "C50 - Gambito Italiano",
    "e4 e5 f4": "C30 - Gambito de Rey",
    "e4 c5": "B20 - Defensa Siciliana",
    "d4": "A40 - Juego del Peón de Dama",
    "d4 d5": "D00 - Juego del Peón de Dama",
    "d4 Nf6": "A45 - Defensa India"
};

function detectOpening(movesList) {
    let best = "Apertura Personalizada / Desconocida";
    for(let i = Math.min(movesList.length, 10); i > 0; i--) {
        let seq = movesList.slice(0, i).join(" ");
        if(ECO_DB[seq]) {
            best = ECO_DB[seq];
            break;
        }
    }
    return best;
}

// --- Engine Init ---
async function initEngine() {
    try {
        const response = await fetch('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');
        const text = await response.text();
        const blob = new Blob([text], {type: 'application/javascript'});
        engineWorker = new Worker(URL.createObjectURL(blob));
        
        engineWorker.onmessage = handleEngineMessage;
        engineWorker.postMessage('uci');
        engineWorker.postMessage('setoption name MultiPV value 1');
        
        console.log("Stockfish loaded!");
        $('#init-engine-status').html('✅ ¡Motor Stockfish Listo!').css('color', '#2ecc71');
    } catch(e) {
        console.error(e);
        $('#init-engine-status').html('❌ Error cargando Motor Stockfish.').css('color', '#e74c3c');
    }
}

// --- Sound Logic ---
function playChessSound(move) {
    if (!move) return;
    
    let sndId = 'snd-move';
    if (move.san.includes('#') || move.san.includes('++')) sndId = 'snd-victory';
    else if (move.san.includes('+')) sndId = 'snd-check';
    else if (move.san.includes('x')) sndId = 'snd-capture';
    else if (move.san.includes('O-O')) sndId = 'snd-castle';
    
    const audio = document.getElementById(sndId);
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.warn("Audio play failed:", e));
    }
}

// --- App Init ---
$(document).ready(function() {
    try {
        board = Chessboard('board', {
            pieceTheme: 'img/chesspieces/wikipedia/{piece}.png',
            position: 'start',
            showNotation: true,
            draggable: true,
            onDragStart: onDragStart,
            onDrop: onDrop,
            onSnapEnd: onSnapEnd
        });
    } catch(e) {
        console.error("Chessboard failed:", e);
    }
    
    initEngine();
    
    $('#pgn-file').on('change', function(e) {
        let file = e.target.files[0];
        if (!file) return;
        $('#file-name-display').text(`Cargado: ${file.name}`);
        let reader = new FileReader();
        reader.onload = function(evt) {
            $('#pgn-input').val(evt.target.result);
        };
        reader.readAsText(file);
    });

    $('#btn-analyze').click(startAnalysis);
    $('#btn-prev').click(() => goToMove(currentMoveIndex - 1));
    $('#btn-next').click(() => goToMove(currentMoveIndex + 1));
    $('#btn-pdf').click(generatePDF);
    $('#btn-back-main').click(exitVariation);
    
    $(window).resize(() => { if(board) board.resize(); });
    setTimeout(() => { if(board) board.resize(); }, 500); 
});

// --- Mouse / Touch Handlers for Alternative Moves ---
function onDragStart(source, piece, position, orientation) {
    if (game.game_over() && !isVariation) return false;
}

async function onDrop(source, target) {
    let move = variationGame.move({
        from: source,
        to: target,
        promotion: 'q' 
    });

    if (move === null) return 'snapback';

    playChessSound(move);
    isVariation = true;
    $('#btn-back-main').removeClass('hidden');
    
    $('#eval-text').text("Analizando variante...");
    let moveEval = await analyzePosition(variationGame.fen());
    updateDisplayAfterManualMove(moveEval);
}

function onSnapEnd() {
    board.position(variationGame.fen());
}

function exitVariation() {
    isVariation = false;
    $('#btn-back-main').addClass('hidden');
    variationGame.load(game.fen());
    goToMove(currentMoveIndex);
}

function updateDisplayAfterManualMove(moveEval) {
    let isWhite = variationGame.turn() === 'b'; 
    let standardizedCP = isWhite ? moveEval.cp : -moveEval.cp;
    let winPct = moveEval.mate !== null ? (moveEval.mate > 0 ? (isWhite?100:0) : (isWhite?0:100)) : cpToWinPercent(standardizedCP);
    
    updateEvalBar(winPct);
    let evalStr = moveEval.mate !== null ? `Mate M${Math.abs(moveEval.mate)}` : (standardizedCP/100).toFixed(2);
    $('#eval-text').text(`Eval: ${evalStr}`);
    $('#best-move-hint').text(`Mejor continuación: ${moveEval.bestLAN}`);
}

// --- Math & Conversion ---
function cpToWinPercent(cp) {
    let c = Math.max(-10000, Math.min(10000, cp));
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

// --- Analysis Logic ---
let isAnalyzing = false;
let resolveAnalysis = null;
let currentDepth = 0;
let currentBestMove = "";
let currentEval = 0;
let isMate = false;
let mateValue = 0;

let timerInterval = null;

function handleEngineMessage({data}) {
    if (!isAnalyzing || typeof data !== 'string') return;
    
    if (data.startsWith("info depth")) {
        let depthMatch = data.match(/depth (\d+)/);
        let scoreMatch = data.match(/score cp (-?\d+)/);
        let mateMatch = data.match(/score mate (-?\d+)/);
        let pvMatch = data.match(/ pv (.*)/);
        
        if (depthMatch) currentDepth = parseInt(depthMatch[1]);
        if (pvMatch) currentBestMove = pvMatch[1].split(" ")[0]; 
        
        if (mateMatch) {
            isMate = true;
            mateValue = parseInt(mateMatch[1]);
        } else if (scoreMatch) {
            isMate = false;
            currentEval = parseInt(scoreMatch[1]);
        }
    }
    
    if (data.startsWith("bestmove")) {
        if (resolveAnalysis) resolveAnalysis({ cp: currentEval, mate: isMate ? mateValue : null, bestLAN: currentBestMove });
    }
}

async function analyzePosition(fen) {
    return new Promise(resolve => {
        isAnalyzing = true;
        resolveAnalysis = resolve;
        engineWorker.postMessage(`position fen ${fen}`);
        engineWorker.postMessage(`go depth ${DEPTH}`);
    });
}

function updateEvalBar(winPct) {
    $('#eval-bar-fill').css({ 'height': winPct + '%', 'background': winPct > 50 ? "#eee" : "#333" });
}

// --- Main Analysis Loop ---
async function startAnalysis() {
    let pgn = $('#pgn-input').val();
    if (!pgn) return alert("Sube un archivo PGN o pega el texto primero.");
    if (!engineWorker) return alert("Stockfish no está listo.");
    if (!game.load_pgn(pgn)) return alert("PGN Inválido.");
    
    $('#panel-input').addClass('hidden');
    $('#panel-results').removeClass('hidden');
    $('#extended-summary').removeClass('hidden');
    $('#btn-prev, #btn-next, #btn-play').prop('disabled', true);
    
    let startTime = Date.now();
    $('#analysis-timer').text(`⏱️ Analizando: 0s`);
    timerInterval = setInterval(() => {
        let elapsed = Math.floor((Date.now() - startTime) / 1000);
        let m = Math.floor(elapsed / 60);
        let s = elapsed % 60;
        $('#analysis-timer').text(`⏱️ Analizando: ${m > 0 ? m + 'm ' : ''}${s}s`);
    }, 1000);

    historyMoves = game.history(); 
    $('#opening-info').text(detectOpening(historyMoves));
    
    let tempGame = new Chess();
    analyzedMoves = [];
    let whiteWinDiffs = []; let blackWinDiffs = [];
    let whiteMetrics = { inn: 0, mist: 0, blun: 0, great: 0, brill: 0 };
    let blackMetrics = { inn: 0, mist: 0, blun: 0, great: 0, brill: 0 };

    $('#eval-text').text(`Analizando posición inicial...`);
    let startEval = await analyzePosition(tempGame.fen());
    let prevWinProb = cpToWinPercent(startEval.cp);
    
    $('#moves-body').empty();

    for (let i = 0; i < historyMoves.length; i++) {
        let moveSan = historyMoves[i];
        let isWhite = tempGame.turn() === 'w';
        let currentMet = isWhite ? whiteMetrics : blackMetrics;
        
        $('#eval-text').text(`Analizando jugada ${i+1}/${historyMoves.length}...`);
        
        tempGame.move(moveSan); 
        let moveEval = await analyzePosition(tempGame.fen());
        let standardizedCP = tempGame.turn() === 'b' ? -moveEval.cp : moveEval.cp; 
        let currentWinProb = moveEval.mate !== null ? (moveEval.mate > 0 ? (tempGame.turn()==='w'?100:0) : (tempGame.turn()==='w'?0:100)) : cpToWinPercent(standardizedCP);
        
        let winLoss = isWhite ? Math.max(0, prevWinProb - currentWinProb) : Math.max(0, currentWinProb - prevWinProb);
        
        let errorClass = "Good"; let annotation = "";
        
        // --- Mejorado: Tolerancia de apertura y Libro ---
        // Se asumen las primeras 10 plies (5 jugadas) como libro, umbral de imprecisión relajado.
        let isOpening = i < 10;
        let innThreshold = isOpening ? 12 : 9; // Más tolerante en apertura
        let errorThreshold = isOpening ? 25 : 18; // Solo errores claros en apertura
        
        if (winLoss > errorThreshold) { errorClass = "Blunder"; annotation = "??"; currentMet.blun++; }
        else if (winLoss > 15) { errorClass = "Mistake"; annotation = "?"; currentMet.mist++; }
        else if (winLoss > innThreshold) { errorClass = "Inaccuracy"; annotation = "?!"; currentMet.inn++; }
        else if (winLoss < 0.2) { 
            if (winLoss < -2) { errorClass = "Brilliant"; annotation = "!!"; currentMet.brill++; }
            else { errorClass = "Great"; annotation = "!"; currentMet.great++; }
        }

        if(isWhite) whiteWinDiffs.push(winLoss); else blackWinDiffs.push(winLoss);

        analyzedMoves.push({
            san: moveSan, annotation: annotation, cp: standardizedCP, mate: moveEval.mate,
            class: errorClass, best: moveEval.bestLAN, winPct: currentWinProb, fen: tempGame.fen()
        });
        
        if (isWhite) {
            $('#moves-body').append(`<tr id="row-${i}"><td class="move-num">${Math.floor(i/2)+1}</td><td class="w-move ann-${errorClass.toLowerCase()}" onclick="goToMove(${i})">${moveSan}${annotation}</td><td class="b-move" id="b-${i}"></td></tr>`);
        } else {
            $(`#b-${i-1}`).text(moveSan + annotation).addClass(`ann-${errorClass.toLowerCase()}`).attr('onclick', `goToMove(${i})`);
        }
        
        updateEvalBar(currentWinProb); board.position(tempGame.fen());
        prevWinProb = currentWinProb;
    }
    
    clearInterval(timerInterval);
    $('#analysis-timer').text(`✅ Finalizado.`);

    let wAcc = 100 - (whiteWinDiffs.reduce((a,b)=>a+b,0)/Math.max(1, whiteWinDiffs.length));
    let bAcc = 100 - (blackWinDiffs.reduce((a,b)=>a+b,0)/Math.max(1, blackWinDiffs.length));
    
    $('#acc-white').html(`${Math.max(wAcc,0).toFixed(1)}%<br><small>${whiteMetrics.blun}?? | ${whiteMetrics.mist}? | ${whiteMetrics.inn}?!</small>`);
    $('#acc-black').html(`${Math.max(bAcc,0).toFixed(1)}%<br><small>${blackMetrics.blun}?? | ${blackMetrics.mist}? | ${blackMetrics.inn}?!</small>`);
    
    let totalACPL = (whiteWinDiffs.concat(blackWinDiffs).reduce((a,b)=>a+b,0) / Math.max(1, historyMoves.length)).toFixed(1);
    $('#acpl-val').text(totalACPL);
    $('#brilliant-count').text(whiteMetrics.brill + blackMetrics.brill);

    $('#eval-text').text("Análisis Completado");
    $('#btn-prev, #btn-next, #btn-play').prop('disabled', false);
    goToMove(historyMoves.length - 1);
}

function goToMove(index) {
    if (index < -1 || index >= analyzedMoves.length) return;
    currentMoveIndex = index;
    isVariation = false;
    $('#btn-back-main').addClass('hidden');
    $('.current-move').removeClass('current-move');
    
    if (index === -1) {
        board.position('start'); updateEvalBar(50);
        $('#eval-text').text("Inicio"); $('#best-move-hint').text("");
        variationGame.reset();
    } else {
        let m = analyzedMoves[index];
        board.position(m.fen); updateEvalBar(m.winPct);
        playChessSound(m); 

        let evalStr = m.mate !== null ? `Mate M${Math.abs(m.mate)}` : (m.cp/100).toFixed(2);
        $('#eval-text').text(`Eval: ${evalStr} (${m.class})`);
        $('#best-move-hint').text(m.class.includes("Good") || m.class === "Great" || m.class === "Brilliant" ? "Jugada sólida." : `Sugerencia: ${m.best}`);
        index % 2 === 0 ? $(`#row-${index} .w-move`).addClass('current-move') : $(`#b-${index-1}`).addClass('current-move');
        variationGame.load(m.fen);
    }
}

// --- PDF Generation ---
function generatePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(22);
    doc.setTextColor(212, 175, 55); 
    doc.text("ChessAnalyzer Reporte de Partida", 105, 20, { align: "center" });
    
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`Apertura: ${$('#opening-info').text()}`, 105, 30, { align: "center" });
    
    doc.autoTable({
        startY: 40,
        head: [['Bando', 'Precisión', 'Errores (??)', 'Malas (?)', 'Imprecisiones (?!)']],
        body: [
            ['Blancas', $('#acc-white').text().split('%')[0] + '%', analyzedMoves.filter((m,i)=>i%2===0 && m.class==='Blunder').length, analyzedMoves.filter((m,i)=>i%2===0 && m.class==='Mistake').length, analyzedMoves.filter((m,i)=>i%2===0 && m.class==='Inaccuracy').length],
            ['Negras', $('#acc-black').text().split('%')[0] + '%', analyzedMoves.filter((m,i)=>i%2!==0 && m.class==='Blunder').length, analyzedMoves.filter((m,i)=>i%2!==0 && m.class==='Mistake').length, analyzedMoves.filter((m,i)=>i%2!==0 && m.class==='Inaccuracy').length]
        ],
        theme: 'striped',
        headStyles: { fillColor: [212, 175, 55] }
    });

    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text("Momentos Críticos (Mejores y Peores Jugadas)", 14, doc.autoTable.previous.finalY + 15);
    
    let criticalMoves = analyzedMoves.map((m, i) => ({ ...m, index: i }))
        .filter(m => ['Blunder', 'Brilliant', 'Great'].includes(m.class));
        
    doc.autoTable({
        startY: doc.autoTable.previous.finalY + 20,
        head: [['Jugada #', 'Movimiento', 'Evaluación', 'Categoría', 'Mejor Opción']],
        body: criticalMoves.map(m => [
            Math.floor(m.index/2)+1 + (m.index%2===0?'. B':'. N'),
            m.san + m.annotation,
            m.mate ? `Mate M${m.mate}` : (m.cp/100).toFixed(2),
            m.class,
            m.best
        ]),
        theme: 'grid',
        columnStyles: {
            3: { fontStyle: 'bold' }
        },
        didParseCell: function(data) {
            if (data.column.index === 3) {
                if (data.cell.raw === 'Blunder') data.cell.styles.textColor = [250, 82, 82];
                if (data.cell.raw === 'Brilliant') data.cell.styles.textColor = [21, 170, 191];
            }
        }
    });

    doc.save("Reporte_ChessAnalyzer.pdf");
}
