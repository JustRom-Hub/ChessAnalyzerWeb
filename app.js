// --- Core Variables ---
let board = null;
let game = new Chess();
let engineWorker = null;
let analyzedMoves = []; 
let currentMoveIndex = -1;
let historyMoves = []; 

const DEPTH = 14; 

const ECO_DB = {
    "e4": "B00 - King's Pawn Game",
    "e4 e5": "C20 - King's Knight Opening",
    "e4 e5 Nf3": "C40 - King's Knight Opening",
    "e4 e5 Nf3 Nc6": "C44 - King's Pawn Game",
    "e4 e5 Nf3 Nc6 Bb5": "C60 - Ruy Lopez",
    "e4 e5 Nf3 Nc6 Bc4": "C50 - Italian Game",
    "e4 e5 f4": "C30 - King's Gambit",
    "e4 c5": "B20 - Sicilian Defense",
    "d4": "A40 - Queen's Pawn Game",
    "d4 d5": "D00 - Queen's Pawn Game",
    "d4 Nf6": "A45 - Indian Defense"
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
        $('#init-engine-status').html('✅ ¡Motor Stockfish Listo! Puedes analizar.').css('color', '#2ecc71');
    } catch(e) {
        console.error(e);
        $('#init-engine-status').html('❌ Error: Requiere Internet la primera vez para descargar el Motor.').css('color', '#e74c3c');
    }
}

// --- App Init ---
$(document).ready(function() {
    try {
        board = Chessboard('board', {
            // FIX PIECES: USE LOCAL DOWNLOADED IMAGES INSTEAD OF UNPKG TO AVOID CORS BLOCK
            pieceTheme: 'img/chesspieces/wikipedia/{piece}.png',
            position: 'start',
            showNotation: true
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
    
    $(window).resize(() => { if(board) board.resize(); });
    setTimeout(() => { if(board) board.resize(); }, 500); 
});

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
    if (!engineWorker) return alert("Stockfish no está listo, espera al mensaje VERDE.");
    if (!game.load_pgn(pgn)) return alert("PGN Inválido. Asegúrate de que no haya texto extraño al inicio.");
    
    $('#panel-input').addClass('hidden');
    $('#panel-results').removeClass('hidden');
    $('#btn-prev, #btn-next, #btn-play').prop('disabled', true);
    
    // Timer Logic
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
    let whiteWinDiffs = [];
    let blackWinDiffs = [];
    let whiteInn = 0, whiteMist = 0, whiteBlun = 0, blackInn = 0, blackMist = 0, blackBlun = 0;

    $('#eval-text').text(`Analizando posición inicial...`);
    let startEval = await analyzePosition(tempGame.fen());
    let prevWinProb = startEval.mate !== null ? (startEval.mate > 0 ? 100 : 0) : cpToWinPercent(startEval.cp);
    let prevScore = startEval.cp;
    
    $('#moves-body').empty();

    for (let i = 0; i < historyMoves.length; i++) {
        let moveSan = historyMoves[i];
        let isWhite = tempGame.turn() === 'w';
        
        $('#eval-text').text(`Calculando Pply ${i+1}/${historyMoves.length}...`);
        
        tempGame.move(moveSan); 
        let moveEval = await analyzePosition(tempGame.fen());
        let standardizedCP = tempGame.turn() === 'b' ? -moveEval.cp : moveEval.cp; 
        let currentWinProb = moveEval.mate !== null ? (moveEval.mate > 0 ? (tempGame.turn()==='w'?100:0) : (tempGame.turn()==='w'?0:100)) : cpToWinPercent(standardizedCP);
        
        let winLoss = isWhite ? Math.max(0, prevWinProb - currentWinProb) : Math.max(0, currentWinProb - prevWinProb);
        if (moveEval.mate !== null && startEval.mate === null) winLoss = 50; 
        
        let errorClass = "Good"; let annotation = "";
        
        if (winLoss > 20) { errorClass = "Blunder"; annotation = "??"; isWhite ? whiteBlun++ : blackBlun++; }
        else if (winLoss > 10) { errorClass = "Mistake"; annotation = "?"; isWhite ? whiteMist++ : blackMist++; }
        else if (winLoss > 5) { errorClass = "Inaccuracy"; annotation = "?!"; isWhite ? whiteInn++ : blackInn++; }

        if(isWhite) whiteWinDiffs.push(winLoss); else blackWinDiffs.push(winLoss);

        analyzedMoves.push({
            san: moveSan + annotation, cp: standardizedCP, mate: moveEval.mate,
            class: errorClass, best: moveEval.bestLAN, winPct: currentWinProb, fen: tempGame.fen()
        });
        
        if (isWhite) {
            $('#moves-body').append(`<tr id="row-${i}"><td class="move-num">${Math.floor(i/2)+1}</td><td class="w-move ann-${errorClass.toLowerCase()}" onclick="goToMove(${i})">${moveSan}${annotation}</td><td class="b-move" id="b-${i}"></td></tr>`);
        } else {
            $(`#b-${i-1}`).text(moveSan + annotation).addClass(`ann-${errorClass.toLowerCase()}`).attr('onclick', `goToMove(${i})`);
        }
        
        updateEvalBar(currentWinProb); board.position(tempGame.fen());
        prevWinProb = currentWinProb; prevScore = moveEval.cp;
    }
    
    clearInterval(timerInterval);
    $('#analysis-timer').text(`✅ Finalizado en ` + $('#analysis-timer').text().replace("⏱️ Analizando:", ""));

    let wAcc = 100 - (whiteWinDiffs.reduce((a,b)=>a+b,0)/Math.max(1, whiteWinDiffs.length));
    let bAcc = 100 - (blackWinDiffs.reduce((a,b)=>a+b,0)/Math.max(1, blackWinDiffs.length));
    
    $('#acc-white').html(`${Math.max(wAcc,0).toFixed(1)}%<br><small>${whiteBlun}?? | ${whiteMist}? | ${whiteInn}?!</small>`);
    $('#acc-black').html(`${Math.max(bAcc,0).toFixed(1)}%<br><small>${blackBlun}?? | ${blackMist}? | ${blackInn}?!</small>`);
    
    $('#eval-text').text("Análisis Completado");
    $('#btn-prev, #btn-next, #btn-play').prop('disabled', false);
    goToMove(historyMoves.length - 1);
}

function goToMove(index) {
    if (index < -1 || index >= analyzedMoves.length) return;
    currentMoveIndex = index;
    $('.current-move').removeClass('current-move');
    
    if (index === -1) {
        board.position('start'); updateEvalBar(50);
        $('#eval-text').text("Inicio de la Partida"); $('#best-move-hint').text("");
    } else {
        let m = analyzedMoves[index];
        board.position(m.fen); updateEvalBar(m.winPct);
        let evalStr = m.mate !== null ? `Mate M${Math.abs(m.mate)}` : (m.cp/100).toFixed(2);
        $('#eval-text').text(`Eval: ${evalStr} (${m.class})`);
        $('#best-move-hint').text(m.class!=="Good" ? `Sugerencia táctica: ${m.best}`:"Tranquilidad en el tablero.");
        index % 2 === 0 ? $(`#row-${index} .w-move`).addClass('current-move') : $(`#b-${index-1}`).addClass('current-move');
    }
}
