# Diseño: Web Player IPTV

**Fecha:** 2026-07-22
**Estado:** Aprobado

## Objetivo

Web player independiente para el servicio IPTV. Los usuarios entran con las
credenciales de su línea del panel Xtream UI / XUI y ven los canales en vivo
que su línea tiene disponibles, reproducidos directamente en el navegador.

Proyecto totalmente separado de panelemby/Emby: repositorio propio, servidor
propio (el mismo servidor donde corre la IPTV), sin ninguna dependencia de
cuentas Emby.

## Alcance v1

- Login con usuario/contraseña de la línea Xtream.
- Lista de canales en vivo por categorías, con buscador y logos.
- Reproductor HLS en el navegador con cambio rápido de canal.
- Proxy de API y de streams en el backend (la URL real del panel queda oculta).

**Fuera de alcance v1:** VOD, series, EPG, favoritos, multi-panel.

## Stack

- Node 18+, Express, EJS (server-side rendering), express-session con
  almacenamiento en SQLite (`better-sqlite3` + `better-sqlite3-session-store`).
- hls.js en el frontend para reproducir HLS.
- Sin base de datos de usuarios: la fuente de verdad es el panel XUI vía
  `player_api.php`. SQLite solo guarda sesiones.

## Arquitectura

```
Navegador ──► Express (iptv-webplayer, mismo servidor que el XUI)
                 │
                 ├─ /login            valida contra player_api.php
                 ├─ /                 lista de canales (categorías + streams, cacheado)
                 ├─ /play/:id         página del reproductor
                 ├─ /stream/:id.m3u8  proxy del playlist HLS (reescribe URLs de segmentos)
                 ├─ /stream/seg       proxy de segmentos .ts
                 └─ /logo             proxy de logos de canales
                 │
                 └──► Panel XUI (player_api.php + /live/{user}/{pass}/{id}.m3u8)
```

### Login y sesiones

- `POST /login` llama a `GET {XTREAM_BASE_URL}/player_api.php?username=U&password=P`.
- Si `user_info.auth == 1` y `status == "Active"`: se crea sesión. Las
  credenciales se guardan **solo en la sesión del servidor**; nunca se envían
  al navegador ni aparecen en URLs.
- Línea caducada/bloqueada → mensaje claro en el login.
- Se muestra en la interfaz: fecha de caducidad y conexiones máximas.
- Rate-limit en `/login` contra fuerza bruta.
- Logout destruye la sesión.

### Lista de canales

- `player_api.php?action=get_live_categories` y `action=get_live_streams`.
- Caché en memoria por usuario (TTL ~5 min) para no machacar la API del XUI.
- Sidebar de categorías, buscador por nombre, grid de canales con logo.
- Logos servidos por `/logo?u=<url>` (solo con sesión, solo URLs http/https)
  para evitar contenido mixto.

### Reproductor y proxy de streams

- `/play/:streamId`: página con hls.js, nombre del canal, botón volver y
  lista lateral para cambio rápido de canal.
- `/stream/:streamId.m3u8`: el backend pide
  `{XTREAM_BASE_URL}/live/{user}/{pass}/{streamId}.m3u8` con las credenciales
  de la sesión, y reescribe las URLs de los segmentos para que apunten al
  proxy (`/stream/seg?...`).
- El proxy de segmentos valida sesión activa y que la URL destino pertenece
  al host del XUI (nunca proxy abierto).
- Al estar en el mismo servidor que el XUI, el tráfico proxy interno es local.

## Configuración (.env)

| Variable | Descripción |
|---|---|
| `XTREAM_BASE_URL` | URL base del panel XUI (ej. `http://127.0.0.1:8080`) |
| `PORT` | Puerto del web player |
| `SESSION_SECRET` | Secreto de sesión |

## Interfaz

Tema oscuro, responsive (móvil incluido). Páginas: login, lista de canales,
reproductor. Español.

## Errores

- XUI caído → mensaje "servicio no disponible" (login y listas).
- Stream que no carga → mensaje en el player con opción de reintentar.
- Sesión expirada → redirección a login.

## Despliegue

- Repositorio GitHub nuevo.
- Servicio systemd + nginx como reverse proxy (HTTPS) en el servidor IPTV.
- README con pasos de instalación.

## Pruebas

- Verificación manual del flujo completo: login (línea válida, inválida y
  caducada), listado por categorías, búsqueda, reproducción y logout.
- Prueba de que el proxy rechaza peticiones sin sesión y URLs fuera del host
  del XUI.
