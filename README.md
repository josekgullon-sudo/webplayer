# Web Player IPTV

Web player para líneas de un panel Xtream UI / XUI. Los usuarios entran con el
usuario y contraseña de su línea y ven sus canales en vivo en el navegador.

## Requisitos

- Node.js 18 o superior
- Un panel Xtream UI / XUI accesible desde este servidor

## Instalación

```bash
git clone <repo> /opt/iptv-webplayer
cd /opt/iptv-webplayer
npm install
cp .env.example .env
# editar .env: PLAYLIST_BASE_URL, SESSION_SECRET, PORT
npm start
```

## Desarrollo

```bash
npm run dev   # servidor con recarga
npm test      # tests
```

## Producción (systemd + nginx)

1. Copiar `deploy/iptv-webplayer.service` a `/etc/systemd/system/` y ajustar rutas.
2. `systemctl enable --now iptv-webplayer`
3. Usar `deploy/nginx.conf.example` como base del server block y activar HTTPS
   (por ejemplo con certbot).

## Notas

- No hay base de datos de usuarios: la autenticación se valida descargando
  la lista M3U de la línea. SQLite solo almacena sesiones (`data/sessions.db`).
- El vídeo pasa por el proxy del backend: la URL del panel nunca se expone al
  navegador. Se recomienda desplegar en el mismo servidor que el panel.
