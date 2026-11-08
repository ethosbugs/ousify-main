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

## Portadas automáticas
Al importar mp3, Ousify busca la portada (y álbum y año) con la API de búsqueda de iTunes, que es gratuita y no necesita clave. Va en segundo plano, a unas 20 canciones por minuto. Botón «🖼 Buscar portadas» en la Biblioteca para las que falten, y «🔎 Buscar portada» dentro de ✎ para repetir una. Se puede desactivar en Ajustes.

## Listas verificadas (playlists.json)
`playlists.json` en la raíz del repositorio. Aparecen en la barra lateral como «Listas de Ousify ✓», de solo lectura, con el botón «Copiar a mis listas».

```json
{ "lists": [ {
  "id": "reggaeton-clasico", "name": "Reggaetón clásico", "description": "Selección de Ousify", "cover": "https://…/portada.jpg",
  "tracks": [ { "title": "Título", "artist": "Artista", "album": "Álbum", "year": "2018", "cover": "https://…", "url": "music/titulo.mp3" } ]
} ] }
```
`url` puede ser una ruta del repositorio (carpeta `music/`) o un enlace externo. Sube solo música cuya distribución tengas permitida.

## Modo privado (mp3 cifrados con contraseña)
Para compartir música solo con tu grupo en GitHub Pages. Un login hecho con JavaScript no protege nada (los mp3 siguen siendo públicos si alguien conoce la ruta), así que aquí **los archivos se cifran** (AES-256-GCM, clave derivada de la contraseña con PBKDF2). En el repositorio solo hay datos ilegibles; el navegador los descifra al entrar con la contraseña.

1. Crea la carpeta `vault-src/` (está en `.gitignore`, **no se sube**) con una subcarpeta por lista y los mp3 dentro, nombrados «Título - Artista.mp3». Opcional: `vault-src/playlists.json` para portadas, álbum y año (ejemplo en `tools/playlists-ejemplo.json`).
2. Con Node 18+: `node tools/build-vault.mjs` (pide la contraseña; mínimo 12 caracteres, mejor una frase de 4-5 palabras).
3. Sube la carpeta `vault/` (`git add vault`). Para añadir canciones, repite los pasos 1-3: solo se suben los archivos nuevos.
4. Al abrir la web aparece la pantalla de acceso. Las listas salen en «Listas de Ousify ✓» y funcionan reproducir, favoritos, copiar a tus listas y guardar sin conexión.

Límites que conviene saber: la contraseña es compartida (no se puede expulsar a una sola persona; si cambias la contraseña, quien ya tenía acceso conserva lo que descargó y lo subido antes sigue descifrable con la contraseña antigua en el historial de git); cada archivo máx. 100 MB; con una contraseña débil se podría adivinar probando combinaciones sobre los archivos públicos.

## Móvil y animaciones
- En pantallas pequeñas las listas pasan a chips arriba, cada canción tiene ♥ y un menú ⋯, y el reproductor es una barra fija abajo. Todo funciona con el dedo (en Ajustes se elige tamaño, colores y si se ve la portada).
- Animaciones al pasar el ratón (no en táctil), ecualizador en la canción que suena y entrada suave de pantallas. Se desactivan si el sistema pide menos movimiento.
- Favicon: logo de fondo transparente (`favicon.png`); `apple-touch-icon.png` conserva el fondo porque iOS no admite transparencia.
