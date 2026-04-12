// =================================================================
// ChessAnalyzer PWA — app.js  v2.0
// =================================================================

// --- Estado Global ---
let board = null;
let game = new Chess();          // Partida principal (PGN cargado)
let engineWorker = null;
let analyzedMoves = [];          // Jugadas analizadas de la línea principal
let currentMoveIndex = -1;
let historyMoves = [];

// --- Sistema de Variantes ---
let variationGame = new Chess(); // Juego de la variante activa
let variationMoves = [];         // Historial de movimientos en la variante
let variationIndex = -1;         // Índice de navegación dentro de la variante
let isVariation = false;
let variationStartIndex = -1;    // Índice de la jugada principal desde donde nació la variante

const DEPTH = 14;

// =================================================================
// BASE DE DATOS DE APERTURAS (ECO)
// =================================================================
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
    for (let i = Math.min(movesList.length, 10); i > 0; i--) {
        let seq = movesList.slice(0, i).join(" ");
        if (ECO_DB[seq]) { best = ECO_DB[seq]; break; }
    }
    return best;
}

// =================================================================
// MOTOR STOCKFISH
// =================================================================
async function initEngine() {
    try {
        const response = await fetch('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js');
        const text = await response.text();
        const blob = new Blob([text], { type: 'application/javascript' });
        engineWorker = new Worker(URL.createObjectURL(blob));
        engineWorker.onmessage = handleEngineMessage;
        engineWorker.postMessage('uci');
        engineWorker.postMessage('setoption name MultiPV value 1');
        console.log("Stockfish loaded!");
        $('#init-engine-status').html('✅ ¡Motor Stockfish Listo!').css('color', '#2ecc71');
    } catch (e) {
        console.error(e);
        $('#init-engine-status').html('❌ Error cargando Motor Stockfish.').css('color', '#e74c3c');
    }
}

let isAnalyzing = false;
let resolveAnalysis = null;
let currentBestMove = "";
let currentEval = 0;
let isMate = false;
let mateValue = 0;

function handleEngineMessage({ data }) {
    if (!isAnalyzing || typeof data !== 'string') return;
    if (data.startsWith("info depth")) {
        let scoreMatch = data.match(/score cp (-?\d+)/);
        let mateMatch  = data.match(/score mate (-?\d+)/);
        let pvMatch    = data.match(/ pv (.*)/);
        if (pvMatch) currentBestMove = pvMatch[1].split(" ")[0];
        if (mateMatch) { isMate = true; mateValue = parseInt(mateMatch[1]); }
        else if (scoreMatch) { isMate = false; currentEval = parseInt(scoreMatch[1]); }
    }
    if (data.startsWith("bestmove")) {
        if (resolveAnalysis) {
            const bestLAN = data.split(' ')[1];
            resolveAnalysis({ cp: currentEval, mate: isMate ? mateValue : null, bestLAN: (bestLAN !== '(none)') ? bestLAN : null });
        }
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

function cpToWinPercent(cp) {
    let c = Math.max(-10000, Math.min(10000, cp));
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

// Auxiliar para convertir coordenadas técnicas (LAN) a formato ajedrez (SAN)
function lanToSan(fen, lan) {
    if (!lan || lan === 'MATE' || lan === '(none)') return lan || '—';
    try {
        const temp = new Chess(fen);
        const move = temp.move({
            from: lan.substring(0, 2),
            to: lan.substring(2, 4),
            promotion: lan.length > 4 ? lan[4] : 'q'
        });
        return move ? move.san : lan;
    } catch(e) { return lan; }
}

// =================================================================
// BARRA DE EVALUACIÓN  (CORRECCIÓN COLORES)
// La barra representa la ventaja de BLANCAS desde abajo.
// El relleno blanco sube/baja. El fondo negro del contenedor = negras.
// No se cambia el color del relleno, solo la altura.
// =================================================================
function updateEvalBar(winPct) {
    const h = Math.max(2, Math.min(98, winPct)); // evitar 0% o 100% absoluto
    $('#eval-bar-fill').css('height', h + '%');
}

// =================================================================
// SONIDOS
// =================================================================
function playChessSound(move) {
    if (!move) return;
    const san = move.san || move;
    let sndId = 'snd-move';
    if (typeof san === 'string') {
        if (san.includes('#') || san.includes('++')) sndId = 'snd-victory';
        else if (san.includes('+'))                  sndId = 'snd-check';
        else if (san.includes('x'))                  sndId = 'snd-capture';
        else if (san.startsWith('O'))                sndId = 'snd-castle';
    }
    const audio = document.getElementById(sndId);
    if (audio) { audio.currentTime = 0; audio.play().catch(() => {}); }
}

// =================================================================
// INICIALIZACIÓN
// =================================================================
$(document).ready(function () {
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
    } catch (e) { console.error("Chessboard failed:", e); }

    initEngine();

    $('#pgn-file').on('change', function (e) {
        let file = e.target.files[0];
        if (!file) return;
        $('#file-name-display').text(`Cargado: ${file.name}`);
        let reader = new FileReader();
        reader.onload = evt => $('#pgn-input').val(evt.target.result);
        reader.readAsText(file);
    });

    $('#btn-analyze').click(startAnalysis);
    $('#btn-prev').click(navigatePrev);
    $('#btn-next').click(navigateNext);
    $('#btn-pdf').click(generatePDF);
    $('#btn-back-main').click(exitVariation);
    $('#btn-var-prev').click(navigateVariationPrev);
    $('#btn-var-next').click(navigateVariationNext);

    $(window).resize(() => { if (board) board.resize(); });
    setTimeout(() => { if (board) board.resize(); }, 500);
});

// =================================================================
// NAVEGACIÓN PRINCIPAL (línea del PGN)
// =================================================================
function navigatePrev() {
    if (isVariation) {
        navigateVariationPrev();
    } else {
        goToMove(currentMoveIndex - 1);
    }
}

function navigateNext() {
    if (isVariation) {
        navigateVariationNext();
    } else {
        goToMove(currentMoveIndex + 1);
    }
}

function goToMove(index) {
    if (index < -1 || index >= analyzedMoves.length) return;

    // Si estábamos en variante, avisamos de que salimos
    exitVariationSilent();

    currentMoveIndex = index;
    $('.current-move').removeClass('current-move');

    if (index === -1) {
        board.position('start');
        updateEvalBar(50);
        $('#eval-text').text("Inicio de la partida");
        $('#best-move-hint').text("");
        variationGame.reset();
    } else {
        let m = analyzedMoves[index];
        board.position(m.fen);
        updateEvalBar(m.winPct);
        playChessSound(m);
        let evalStr = m.mate !== null ? `Mate M${Math.abs(m.mate)}` : (m.cp / 100).toFixed(2);
        $('#eval-text').text(`Eval: ${evalStr} (${m.class})`);
        $('#best-move-hint').text(
            ['Good', 'Great', 'Brilliant'].includes(m.class) ? "Jugada sólida. ♟" : `💡 Sugerencia: ${m.best}`
        );
        // Resaltar jugada activa en la tabla
        if (index % 2 === 0) $(`#row-${index} .w-move`).addClass('current-move');
        else $(`#b-${index - 1}`).addClass('current-move');
        // Preparar el juego de variante desde este punto
        variationGame.load(m.fen);
    }
    updateVariationControls();
}

// =================================================================
// SISTEMA DE VARIANTES COMPLETO
// =================================================================
function onDragStart(source, piece) {
    // Permitir arrastrar siempre (línea principal o variante)
    if (!engineWorker) return false;
}

async function onDrop(source, target) {
    // Intentamos el movimiento sobre el juego de variante
    let move = variationGame.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return 'snapback';

    playChessSound(move);

    // Si es el primer movimiento alternativo, iniciar modo variante
    if (!isVariation) {
        isVariation = true;
        variationStartIndex = currentMoveIndex;
        variationMoves = [];
        variationIndex = -1;
        showVariationMode(true);
    }

    // Guardar el movimiento en el historial de variante
    variationMoves.push({
        san: move.san,
        fen: variationGame.fen(),
        cp: 0, winPct: 50, mate: null, bestLAN: ''
    });
    variationIndex = variationMoves.length - 1;

    // Renderizar las jugadas de la variante
    renderVariationMoves();

    // Analizar con Stockfish
    $('#eval-text').text("🔍 Analizando variante...");
    let moveEval = await analyzePosition(variationGame.fen());

    // Guardar evaluación
    let isWt = variationGame.turn() === 'b';
    let sCP = isWt ? moveEval.cp : -moveEval.cp;
    let winPct = moveEval.mate !== null
        ? (moveEval.mate > 0 ? (isWt ? 100 : 0) : (isWt ? 0 : 100))
        : cpToWinPercent(sCP);

    variationMoves[variationIndex].cp = sCP;
    variationMoves[variationIndex].winPct = winPct;
    variationMoves[variationIndex].mate = moveEval.mate;
    variationMoves[variationIndex].bestLAN = moveEval.bestLAN;

    updateEvalBar(winPct);
    let evalStr = moveEval.mate !== null ? `Mate M${Math.abs(moveEval.mate)}` : (sCP / 100).toFixed(2);
    $('#eval-text').text(`Variante Eval: ${evalStr}`);
    $('#best-move-hint').text(`💡 Mejor: ${moveEval.bestLAN}`);

    renderVariationMoves();
    updateVariationControls();
}

function onSnapEnd() {
    board.position(variationGame.fen());
}

// Navegar ATRÁS dentro de la variante
function navigateVariationPrev() {
    if (!isVariation) return;
    if (variationIndex <= -1) {
        // Volver a la jugada principal desde donde nació la variante
        exitVariation();
        return;
    }
    variationIndex--;
    if (variationIndex === -1) {
        // Mostrar la posición base (la jugada principal de origen)
        let baseFen = variationStartIndex === -1 ? 'start' : analyzedMoves[variationStartIndex].fen;
        board.position(baseFen);
        variationGame.load(baseFen === 'start' ? new Chess().fen() : baseFen);
        updateEvalBar(variationStartIndex === -1 ? 50 : analyzedMoves[variationStartIndex].winPct);
        $('#eval-text').text("↩ Base de la variante");
        $('#best-move-hint').text("Mueve una pieza para continuar la variante");
    } else {
        let vm = variationMoves[variationIndex];
        board.position(vm.fen);
        variationGame.load(vm.fen);
        updateEvalBar(vm.winPct);
        let evalStr = vm.mate !== null ? `Mate M${Math.abs(vm.mate)}` : (vm.cp / 100).toFixed(2);
        $('#eval-text').text(`Variante Eval: ${evalStr}`);
        $('#best-move-hint').text(vm.bestLAN ? `💡 Mejor: ${vm.bestLAN}` : '');
    }
    renderVariationMoves();
    updateVariationControls();
}

// Navegar ADELANTE dentro de la variante
function navigateVariationNext() {
    if (!isVariation) return;
    if (variationIndex >= variationMoves.length - 1) return;
    variationIndex++;
    let vm = variationMoves[variationIndex];
    board.position(vm.fen);
    variationGame.load(vm.fen);
    updateEvalBar(vm.winPct);
    let evalStr = vm.mate !== null ? `Mate M${Math.abs(vm.mate)}` : (vm.cp / 100).toFixed(2);
    $('#eval-text').text(`Variante Eval: ${evalStr}`);
    $('#best-move-hint').text(vm.bestLAN ? `💡 Mejor: ${vm.bestLAN}` : '');
    renderVariationMoves();
    updateVariationControls();
}

// Mostrar/ocultar controles de variante
function showVariationMode(show) {
    if (show) {
        $('#btn-back-main').removeClass('hidden');
        $('#variation-panel').removeClass('hidden');
        $('#board-wrapper').addClass('variation-active');
    } else {
        $('#btn-back-main').addClass('hidden');
        $('#variation-panel').addClass('hidden');
        $('#board-wrapper').removeClass('variation-active');
    }
}

// Salir de la variante (con audio de feedback)
function exitVariation() {
    exitVariationSilent();
    goToMove(variationStartIndex);
}

// Salir silenciosamente (sin redirigir al padre)
function exitVariationSilent() {
    isVariation = false;
    variationMoves = [];
    variationIndex = -1;
    variationStartIndex = -1;
    showVariationMode(false);
    $('#variation-moves-line').html('');
}

// Renderizar la línea de variante debajo del tablero
function renderVariationMoves() {
    let startMoveNum = Math.floor((variationStartIndex + 1) / 2) + 1;
    let startIsBlack = (variationStartIndex + 1) % 2 !== 0;

    let html = '<span class="var-label">Variante:</span> ';
    variationMoves.forEach((vm, i) => {
        let isActive = i === variationIndex;
        let moveNum = '';
        let absoluteHalfMove = (variationStartIndex + 1) + i + 1; // posición absoluta en ply
        let isWhiteMove = absoluteHalfMove % 2 !== 0;
        if (isWhiteMove || i === 0) {
            let num = Math.ceil(absoluteHalfMove / 2);
            moveNum = `<span class="var-num">${num}${isWhiteMove ? '.' : '...'}</span>`;
        }
        html += `${moveNum}<span class="var-move${isActive ? ' var-move-active' : ''}" onclick="jumpToVariationMove(${i})">${vm.san}</span> `;
    });
    $('#variation-moves-line').html(html);
}

// Click directo en una jugada de variante
function jumpToVariationMove(index) {
    variationIndex = index;
    let vm = variationMoves[index];
    board.position(vm.fen);
    variationGame.load(vm.fen);
    updateEvalBar(vm.winPct);
    let evalStr = vm.mate !== null ? `Mate M${Math.abs(vm.mate)}` : (vm.cp / 100).toFixed(2);
    $('#eval-text').text(`Variante Eval: ${evalStr}`);
    $('#best-move-hint').text(vm.bestLAN ? `💡 Mejor: ${vm.bestLAN}` : '');
    renderVariationMoves();
    updateVariationControls();
}

function updateVariationControls() {
    // Los botones Ant/Sig ahora funcionan tanto en variante como en línea principal
    if (isVariation) {
        $('#btn-var-prev').prop('disabled', false);
        $('#btn-var-next').prop('disabled', variationIndex >= variationMoves.length - 1);
    }
}

// =================================================================
// ANÁLISIS PRINCIPAL (PGN)
// =================================================================
let timerInterval = null;

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
    timerInterval = setInterval(() => {
        let e = Math.floor((Date.now() - startTime) / 1000);
        $('#analysis-timer').text(`⏱️ ${Math.floor(e / 60) > 0 ? Math.floor(e / 60) + 'm ' : ''}${e % 60}s`);
    }, 1000);

    historyMoves = game.history();
    $('#opening-info').text(detectOpening(historyMoves));

    let tempGame = new Chess();
    analyzedMoves = [];
    let whiteWinDiffs = [], blackWinDiffs = [];
    let wM = { inn: 0, mist: 0, blun: 0, great: 0, brill: 0 };
    let bM = { inn: 0, mist: 0, blun: 0, great: 0, brill: 0 };

    $('#eval-text').text("Analizando posición inicial...");
    let startEval = await analyzePosition(tempGame.fen());
    let prevWinProb = cpToWinPercent(startEval.cp);
    $('#moves-body').empty();

    for (let i = 0; i < historyMoves.length; i++) {
        let moveSan = historyMoves[i];
        let isWhite = tempGame.turn() === 'w';
        let cM = isWhite ? wM : bM;

        $('#eval-text').text(`Analizando jugada ${i + 1}/${historyMoves.length}...`);
        tempGame.move(moveSan);

        let moveEval;
        // Si la posición tras el movimiento es MATE, no lanzamos el motor
        if (tempGame.in_checkmate()) {
            moveEval = { cp: 0, mate: 0, bestLAN: "MATE" };
        } else {
            moveEval = await analyzePosition(tempGame.fen());
        }

        let sCP = tempGame.turn() === 'b' ? -moveEval.cp : moveEval.cp;
        // CORRECCIÓN: Si es mate (M0), si le toca a las negras significa que las blancas ganaron (100%).
        let curWin = moveEval.mate !== null
            ? (moveEval.mate === 0 ? (tempGame.turn() === 'b' ? 100 : 0) : (moveEval.mate > 0 ? 100 : 0))
            : cpToWinPercent(sCP);

        let winLoss = isWhite ? Math.max(0, prevWinProb - curWin) : Math.max(0, curWin - prevWinProb);

        let isOpening = i < 10;
        let innThr = isOpening ? 12 : 9;
        let errThr = isOpening ? 25 : 18;

        let errorClass = "Good", annotation = "";
        let isWinning = prevWinProb > 95 || prevWinProb < 5;
        let isCritical = prevWinProb > 70 && prevWinProb < 30; // Posicion tensa

        // 1. ¿Es jugada de Libro (Apertura)?
        let isBook = i < 12; // Simplificación por ahora, o usar detectOpening individualmente
        
        // Convertir sugerencia a SAN para comparar
        let readableBest = lanToSan(tempGame.fen(), moveEval.bestLAN);

        // 2. ¿Es la mejor jugada del motor?
        let isBestMove = (moveSan === readableBest);

        if (isBook) {
            errorClass = "Book"; annotation = "";
        } else if (isBestMove) {
            errorClass = "Best"; annotation = "";
        } else if (winLoss > errThr) {
            // ¿Teníamos una ventaja ganadora y la perdimos? (Missed Win)
            if ((isWhite && prevWinProb > 85 && curWin < 40) || (!isWhite && prevWinProb < 15 && curWin > 60)) {
                errorClass = "Missed"; annotation = "x";
            } else {
                errorClass = "Blunder"; annotation = "??"; cM.blun++;
            }
        } else if (winLoss > 15) {
            errorClass = "Mistake"; annotation = "?"; cM.mist++;
        } else if (winLoss > innThr) {
            errorClass = "Inaccuracy"; annotation = "?!"; cM.inn++;
        } else if (winLoss < 2) {
            if (winLoss < -2) {
                errorClass = "Brilliant"; annotation = "!!"; cM.brill++;
            } else if (winLoss < 0.2) {
                // Solo marcar Great si era una posición difícil o única jugada buena
                if (isCritical || !isWinning) {
                    errorClass = "Great"; annotation = "!"; cM.great++;
                } else {
                    errorClass = "Excellent"; annotation = "";
                }
            } else {
                errorClass = "Excellent"; annotation = "";
            }
        }

        if (isWhite) whiteWinDiffs.push(winLoss); else blackWinDiffs.push(winLoss);

        analyzedMoves.push({
            san: moveSan, annotation, cp: sCP, mate: moveEval.mate,
            class: errorClass, best: readableBest, winPct: curWin, fen: tempGame.fen()
        });

        if (isWhite) {
            $('#moves-body').append(
                `<tr id="row-${i}"><td class="move-num">${Math.floor(i / 2) + 1}</td>` +
                `<td class="w-move ann-${errorClass.toLowerCase()}" onclick="goToMove(${i})">${moveSan}${annotation}</td>` +
                `<td class="b-move" id="b-${i}"></td></tr>`
            );
        } else {
            $(`#b-${i - 1}`).text(moveSan + annotation).addClass(`ann-${errorClass.toLowerCase()}`).attr('onclick', `goToMove(${i})`);
        }

        updateEvalBar(curWin);
        board.position(tempGame.fen());
        prevWinProb = curWin;
    }

    clearInterval(timerInterval);
    $('#analysis-timer').text(`✅ Finalizado.`);

    let wAcc = 100 - (whiteWinDiffs.reduce((a, b) => a + b, 0) / Math.max(1, whiteWinDiffs.length));
    let bAcc = 100 - (blackWinDiffs.reduce((a, b) => a + b, 0) / Math.max(1, blackWinDiffs.length));

    $('#acc-white').html(`${Math.max(wAcc, 0).toFixed(1)}%<br><small>${wM.blun}?? | ${wM.mist}? | ${wM.inn}?!</small>`);
    $('#acc-black').html(`${Math.max(bAcc, 0).toFixed(1)}%<br><small>${bM.blun}?? | ${bM.mist}? | ${bM.inn}?!</small>`);

    let totalACPL = (whiteWinDiffs.concat(blackWinDiffs).reduce((a, b) => a + b, 0) / Math.max(1, historyMoves.length)).toFixed(1);
    $('#acpl-val').text(totalACPL);
    $('#brilliant-count').text(wM.brill + bM.brill);
    $('#eval-text').text("Análisis Completado ✅");
    $('#btn-prev, #btn-next, #btn-play').prop('disabled', false);
    goToMove(historyMoves.length - 1);
}

// =================================================================
// GENERACIÓN PDF
// =================================================================
function generatePDF() {
    if (!window.jspdf) { alert("Librería PDF no cargada. Requiere conexión a Internet."); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // --- Cabecera ---
    doc.setFontSize(22);
    doc.setTextColor(212, 175, 55);
    doc.text("ChessAnalyzer — Reporte de Partida", 105, 20, { align: "center" });

    doc.setFontSize(11);
    doc.setTextColor(80);
    doc.text(`Apertura: ${$('#opening-info').text()}`, 105, 30, { align: "center" });
    doc.text(`Fecha de análisis: ${new Date().toLocaleDateString('es-ES')}`, 105, 37, { align: "center" });

    // --- Tabla de Precisión ---
    doc.autoTable({
        startY: 45,
        head: [['Bando', 'Precisión', 'Errores ??', 'Malas ?', 'Imprecisiones ?!', 'ACPL']],
        body: [
            ['⬜ Blancas',
                $('#acc-white').text().split('%')[0].trim() + '%',
                analyzedMoves.filter((m, i) => i % 2 === 0 && m.class === 'Blunder').length,
                analyzedMoves.filter((m, i) => i % 2 === 0 && m.class === 'Mistake').length,
                analyzedMoves.filter((m, i) => i % 2 === 0 && m.class === 'Inaccuracy').length,
                $('#acpl-val').text()
            ],
            ['⬛ Negras',
                $('#acc-black').text().split('%')[0].trim() + '%',
                analyzedMoves.filter((m, i) => i % 2 !== 0 && m.class === 'Blunder').length,
                analyzedMoves.filter((m, i) => i % 2 !== 0 && m.class === 'Mistake').length,
                analyzedMoves.filter((m, i) => i % 2 !== 0 && m.class === 'Inaccuracy').length,
                $('#acpl-val').text()
            ]
        ],
        theme: 'striped',
        headStyles: { fillColor: [212, 175, 55], textColor: [0, 0, 0], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] }
    });

    // --- Tabla de Momentos Críticos ---
    let y = doc.autoTable.previous.finalY + 12;
    doc.setFontSize(14);
    doc.setTextColor(50);
    doc.text("Momentos Críticos de la Partida", 14, y);

    let critical = analyzedMoves
        .map((m, i) => ({ ...m, index: i }))
        .filter(m => ['Blunder', 'Mistake', 'Brilliant', 'Great'].includes(m.class));

    if (critical.length === 0) {
        doc.setFontSize(10);
        doc.setTextColor(120);
        doc.text("No se detectaron momentos críticos significativos.", 14, y + 8);
    } else {
        doc.autoTable({
            startY: y + 5,
            head: [['#', 'Jugada', 'Eval', 'Categoría', 'Mejor Alternativa']],
            body: critical.map(m => [
                `${Math.floor(m.index / 2) + 1}${m.index % 2 === 0 ? '. ⬜' : '... ⬛'}`,
                m.san + m.annotation,
                m.mate ? `M${Math.abs(m.mate)}` : (m.cp / 100).toFixed(2),
                m.class,
                m.best || '—'
            ]),
            theme: 'grid',
            headStyles: { fillColor: [60, 60, 80], textColor: [255, 255, 255] },
            didParseCell: function (data) {
                if (data.column.index === 3) {
                    const v = data.cell.raw;
                    if (v === 'Blunder')   data.cell.styles.textColor = [200, 50, 50];
                    if (v === 'Mistake')   data.cell.styles.textColor = [200, 100, 0];
                    if (v === 'Brilliant') data.cell.styles.textColor = [0, 150, 180];
                    if (v === 'Great')     data.cell.styles.textColor = [0, 100, 200];
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        });
    }

    // --- Lista completa de jugadas ---
    let yMoves = doc.autoTable.previous.finalY + 12;
    if (yMoves > 250) { doc.addPage(); yMoves = 20; }
    doc.setFontSize(14);
    doc.setTextColor(50);
    doc.text("Detalle Completo de Jugadas", 14, yMoves);

    let rows = [];
    for (let i = 0; i < analyzedMoves.length; i += 2) {
        let w = analyzedMoves[i];
        let b = analyzedMoves[i + 1];
        rows.push([
            Math.floor(i / 2) + 1,
            w ? w.san + w.annotation : '',
            w ? (w.mate ? `M${Math.abs(w.mate)}` : (w.cp / 100).toFixed(2)) : '',
            b ? b.san + b.annotation : '',
            b ? (b.mate ? `M${Math.abs(b.mate)}` : (b.cp / 100).toFixed(2)) : ''
        ]);
    }

    doc.autoTable({
        startY: yMoves + 5,
        head: [['#', 'Blancas', 'Eval B', 'Negras', 'Eval N']],
        body: rows,
        theme: 'striped',
        headStyles: { fillColor: [212, 175, 55], textColor: [0, 0, 0] },
        styles: { fontSize: 9 },
        columnStyles: { 0: { cellWidth: 12 }, 2: { cellWidth: 22 }, 4: { cellWidth: 22 } }
    });

    doc.save(`ChessAnalyzer_Reporte_${new Date().toISOString().slice(0, 10)}.pdf`);
}
