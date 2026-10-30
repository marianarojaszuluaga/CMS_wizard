# 🌼 Altar de Día de Muertos

Altar digital para la fiesta: la TV muestra el altar, los invitados escanean el QR con su celular (iPhone o Android), suben la foto de su ser querido y esta aparece en un marco al instante.

## Cómo usarlo el día de la fiesta

1. Instala [Node.js](https://nodejs.org) 18 o más reciente en una laptop.
2. Conecta la laptop **al mismo Wi-Fi** que usarán los invitados.
3. En esta carpeta ejecuta:
   ```bash
   node server.js
   ```
   La terminal muestra algo así:
   ```
   Pantalla (TV):     http://192.168.1.50:3000/
   Subir fotos (QR):  http://192.168.1.50:3000/subir
   Moderar:           http://192.168.1.50:3000/admin   PIN: 4821
   ```
4. Muestra el altar en la TV, de cualquiera de estas formas:
   - Conecta la laptop a la TV por HDMI y abre la dirección de **Pantalla** en pantalla completa (F11), o
   - Abre esa dirección en el navegador de la Smart TV (o en un Chromecast o Fire TV con navegador).
5. Los invitados escanean el QR de la esquina, eligen una foto, escriben un nombre si quieren, y listo.

No hace falta `npm install`: no tiene dependencias.

## Qué hace

- **Cualquier formato**: el celular convierte la foto a JPEG antes de subirla (JPEG, PNG, HEIC/HEIF de iPhone, WebP, etc.) y la reduce a 1600 px para que suba rápido.
- **En vivo**: cada foto nueva se muestra en grande unos segundos ("Una nueva ofrenda llega al altar") y luego pasa a la cuadrícula.
- **Muchas fotos**: hasta 15 por pantalla; si hay más, las páginas rotan cada 14 s.
- **Moderar**: en `/admin`, con el PIN que aparece en la terminal, puedes quitar fotos.
- Las fotos se guardan en `fotos/` y siguen ahí si reinicias el servidor.

## Opciones

```bash
PORT=8080 PIN=1234 node server.js
```

| Variable | Para qué |
|---|---|
| `PORT` | Puerto (por defecto 3000) |
| `PIN` | PIN de moderación (por defecto uno aleatorio) |
| `PUBLIC_URL` | URL del QR si usas un túnel para que suban fotos sin estar en el Wi-Fi, p. ej. `cloudflared tunnel --url http://localhost:3000` y luego `PUBLIC_URL=https://xxxx.trycloudflare.com node server.js` |

Para ajustar las fotos por pantalla o los tiempos, cambia las constantes al inicio del `<script>` en `public/altar.html`.
