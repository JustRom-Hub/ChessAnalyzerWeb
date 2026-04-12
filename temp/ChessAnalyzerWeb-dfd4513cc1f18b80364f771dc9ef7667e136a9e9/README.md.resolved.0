# ♛ ChessAnalyzer PWA

Una aplicación web progresiva (PWA) para análisis de partidas de ajedrez, impulsada por el motor **Stockfish WebAssembly**. Funciona completamente en el navegador — sin servidores, sin instalación, con soporte offline.

---

## 🚀 Características

### Análisis de Partidas
- **Carga PGN** desde archivo `.pgn` o pegando el texto directamente.
- Análisis profundo con **Stockfish depth 14** en cada jugada.
- Barra de evaluación visual en tiempo real.
- Navegación jugada por jugada (⏮ Ant / ▶ Auto / Sig ⏭).

### Sistema de Anotación Inteligente
| Símbolo | Categoría | Descripción |
|---------|-----------|-------------|
| !! | Brillante | Jugada de alta calidad técnica |
| ! | Excelente | Jugada que mejora o mantiene la ventaja |
| ✓ | Bien | Jugada sólida y correcta |
| ?! | Imprecisión | Ligera pérdida de ventaja |
| ? | Mala | Error significativo |
| ?? | Error Grave | Blunder que cambia el resultado |

> Las primeras 5 jugadas (10 plies) tienen umbrales relajados para evitar penalizar jugadas de apertura/libro estándar.

### Movimientos Alternativos (Side-lines)
- Arrastra cualquier pieza en el tablero para explorar **variantes ".y si..."**.
- Stockfish analiza la posición alternativa al instante.
- Botón **"↶ Línea Principal"** para regresar a la secuencia del PGN.

### Resumen de Rendimiento
- **Porcentaje de Precisión** por bando (Blancas / Negras).
- **ACPL** (Average Centipawn Loss — Pérdida Media de Centipeones).
- Conteo de jugadas Brillantes, Errores, Malas e Imprecisiones.

### Detección de Apertura
Base de datos ECO integrada con detección automática de apertura.

### Exportación a PDF
- Botón **"📄 Exportar Reporte PDF"** disponible al finalizar el análisis.
- El PDF incluye:
  - Nombre de apertura detectada
  - Tabla de precisión por bando
  - **Momentos Críticos**: tabla de mejores y peores jugadas con evaluación y mejor alternativa

### Efectos de Sonido
Sonidos inmersivos para cada tipo de jugada:
- 🔔 Movimiento estándar
- 💥 Captura
- 🏰 Enroque
- ⚠️ Jaque
- 🏆 Jaque Mate / Victoria

---

## 🛠 Stack Técnico

| Componente | Tecnología |
|-----------|-----------|
| Motor de ajedrez | Stockfish 10 WebAssembly |
| Tablero UI | Chessboard.js 1.0.0 |
| Lógica de reglas | Chess.js 0.10.3 |
| Generación PDF | jsPDF 2.5.1 + AutoTable 3.5.25 |
| UI Framework | Vanilla JS + jQuery 3.5.1 |
| Estilos | Vanilla CSS (Glassmorphism + Dark Mode) |
| Tipografía | Google Fonts (Outfit + Cinzel) |
| Audio | Lichess sound CDN |
| PWA | Service Worker v2 + Web App Manifest |

---

## 📦 Estructura del Proyecto

```
ChessAnalyzerWeb/
├── index.html           # Aplicación principal
├── manifest.json        # PWA Manifest
├── sw.js                # Service Worker (caché offline)
├── css/
│   └── styles.css       # Estilos glassmorphism premium
├── js/
│   └── app.js           # Lógica principal (análisis, sonidos, PDF)
└── img/
    └── chesspieces/
        └── wikipedia/   # Imágenes de piezas de ajedrez
```

---

## ▶ Cómo Usar

1. **Abre** `index.html` en un navegador moderno (Chrome/Edge recomendado).
   - Para funcionar correctamente, sirve desde un servidor local: `python -m http.server 8080`
2. **Espera** a que el motor Stockfish se descargue y muestre ✅ en verde.
3. **Pega** un PGN o sube un archivo `.pgn`.
4. **Haz clic** en "Analizar Partida 🚀" y espera el análisis.
5. **Navega** por las jugadas, arrastra piezas para explorar variantes.
6. **Exporta** el reporte PDF con los momentos clave de la partida.

---

## 📋 Ejemplo de PGN (Partida de la Ópera de Morphy)

```
1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5
6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5
11. Bxb5+ Kd8 12. O-O-O Rd8 13. Rxd7+ Rxd7 14. Rd1 Qe6
15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#
```

---

## 📄 Licencia

MIT — Libre para uso personal y educativo.
