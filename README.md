# Ousify v3

Reproductor de mp3 con listas, 100 % en el navegador (HTML, CSS y JS sin dependencias). Súbelo a GitHub Pages tal cual.

## Qué incluye
- Icono (favicon) incluido: `favicon.png`, `favicon-32.png`, `apple-touch-icon.png`.
- **Biblioteca**: añade mp3 (archivos, carpeta, arrastrando, o por enlace directo). Se guardan en IndexedDB y suenan sin conexión.
- **Listas**: crea, renombra, borra y reordena a tu gusto (arrastra con ≡). "Tus favoritas" existe siempre: el corazón añade ahí. Arrastra una canción a una lista de la barra lateral para añadirla.
- **Orden**: por lista, "Mi orden", título, artista, más recientes o más antiguas. Botón *Aleatorio* y modo aleatorio sin repetir hasta agotar la lista.
- **Nombres**: los mp3 se leen como «Título - Artista» (se puede cambiar a «Artista - Título» en Ajustes). El botón «⇄ Invertir título/artista» corrige de golpe una biblioteca ya importada.
- **Portadas**: cada canción y cada lista admite un enlace a una imagen (✎ para editar).
- **Buscar mp3**: Audius y Jamendo (con client_id gratuito). Con ↓ guardas el mp3 en tu biblioteca; en la biblioteca, ↓ lo descarga a tu equipo como .mp3.
- **Reproductor flotante**: tres formatos (completo, compacto, solo botón), se arrastra y se redimensiona desde la esquina inferior derecha. El botón de ventana flotante lo saca fuera de la pestaña (Chrome/Edge) y ahí no aparece ningún ajuste. También funciona con teclas multimedia.
- **Ajustes del reproductor**: portada sí/no, tamaño (− / + / deslizador), formato, estilo, color de fondo, principal y de texto, opacidad y paletas.

Los datos viven en el navegador de cada dispositivo.

## Publicar
Sube `index.html`, `style.css`, `app.js` y este README → Settings → Pages → rama `main`. En local: `python3 -m http.server`.

## Fondo difuminado
El reproductor (normal y flotante) difumina la portada como fondo. Se desactiva en Ajustes → «Fondo difuminado con la portada».

## Logos
`ousify1.png` (con fondo, usado como favicon) y `ousify2.png` (sin fondo, usado en la barra lateral).
