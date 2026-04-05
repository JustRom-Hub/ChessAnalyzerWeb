# ChessAnalyzer Web
Una Aplicación Web Progresiva (PWA) diseñada para jugar y analizar partidas de ajedrez directamente en tu navegador, utilizando el potente motor Stockfish (WebAssembly).

## 🚀 Características
- **Análisis Potente:** Integración de Stockfish 16 en el navegador (no requiere servidor de análisis).
- **Offline / PWA:** ¡Instálala como aplicación en tu móvil o PC! Funciona perfectamente sin conexión a internet.
- **Diseño Elegante:** Una interfaz clásica y refinada, completamente responsive.
- **Detección de Aperturas:** Identifica las aperturas a medida que realizas los movimientos (usando ECO codes).

## 🛠️ Tecnologías
- HTML5 Semántico
- CSS3 (Vanilla) con Flexbox y CSS Grid (Diseño Responsive)
- JavaScript (ES6) puro (Vanilla JS)
- Stockfish.wasm (WebAssembly Chess Engine)
- API de Service Workers para soporte offline (PWA)

## 📁 Estructura del Proyecto
- index.html: La vista principal y la interfaz de usuario.
- css/: Estilos de la aplicación.
- js/: Lógica principal del tablero, integración de Stockfish y controladores.
- img/: Piezas de ajedrez e íconos.
- sw.js y manifest.json: Archivos clave para la funcionalidad PWA (instalación y offline).

## 💻 Instalación y Uso
1. Para usarla como aplicación web normal, simplemente abre index.html en un navegador (es altamente recomendado usar un servidor local como Live Server en VSCode debido a las políticas de CORS de WebAssembly y Service Workers).
2. Para instalarla, visita la página web hosteada en tu dispositivo y selecciona "Instalar Aplicación" en el menú de opciones de tu navegador.

## 🤝 Créditos
Desarrollado para disfrutar y profundizar en los secretos del Ajedrez de forma local y segura.
