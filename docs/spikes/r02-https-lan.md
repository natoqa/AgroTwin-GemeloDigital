# Spike R-02 — HTTPS en LAN con mkcert

- **Riesgo:** R-02, *HTTPS en LAN / contenido mixto*. Severidad **crítica**.
- **ADR condicionado:** [ADR-0003](../adr/0003-hub-local-en-lan-en-lugar-de-p2p.md).
- **Fase:** 0
- **Estado:** **Parcialmente verificado.** Concluyente en escritorio;
  **pendiente la prueba en un teléfono real**, que es la que decide.

## Pregunta que el spike debe responder

¿Un Chrome de la matriz soportada (Android 10+, y Android 8–9 con Chrome 138)
confía en un certificado emitido por una CA de mkcert servido desde una laptop
en la LAN, y registra un service worker sobre ese origen?

Si la respuesta es no, `FileTransport` deja de ser respaldo y pasa a ser el
único transporte, y el ADR-0003 debe reemplazarse.

## Montaje

Hub mínimo en `services/edge-hub`: FastAPI sirviendo la propia página más
`/sw.js` y `/api/health`, con cabeceras `Cross-Origin-Opener-Policy:
same-origin` y `Cross-Origin-Embedder-Policy: require-corp`. Página y API
comparten origen, de modo que no hay contenido mixto ni CORS.

Certificado generado con `make_cert.py`, cuyo SAN cubre el nombre `.local`, la
IP LAN, `localhost` y `127.0.0.1`. Cuál de esos nombres resuelve el teléfono es
justamente parte de lo que hay que averiguar.

```
uv run python make_cert.py
uv run uvicorn edge_hub.main:app --host 0.0.0.0 --port 8443 \
    --ssl-certfile certs/hub.pem --ssl-keyfile certs/hub-key.pem
```

La página comprueba cinco cosas y las muestra en pantalla: contexto seguro,
registro del service worker, llamada a la API del mismo origen, aislamiento de
origen y disponibilidad de `SharedArrayBuffer`.

## Resultado 1 — Escritorio (ejecutado)

- **Fecha:** 2026-09-21
- **Dispositivo:** máquina de desarrollo, Windows 11 Pro 10.0.26200
- **Navegador:** Chrome 153.0.0.0
  (`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36`)
- **URL:** `https://192.168.1.55:8443/` (IP LAN, no `localhost`)
- **CA:** instalada con `mkcert -install` en el almacén de confianza de Windows

| Comprobación | Resultado | Detalle |
|---|---|---|
| Contexto seguro | ✅ | El navegador acepta el certificado del hub |
| Service worker registrado | ✅ | Alcance `https://192.168.1.55:8443/` |
| API del mismo origen | ✅ | `GET /api/health` → `200 {"status":"ok","service":"agrotwin-edge-hub","phase":0}` |
| Aislamiento de origen (COOP/COEP) | ✅ | Activo |
| `SharedArrayBuffer` | ✅ | Disponible |

**Lectura.** El mecanismo funciona: mkcert sobre IP LAN produce un contexto
seguro real, con service worker y con aislamiento de origen. Esto descarta que
el enfoque sea inviable *por diseño*, y confirma de paso que el multihilo WASM
(R-04) es alcanzable como mejora cuando el hub sirve la PWA.

**Lo que este resultado NO demuestra.** Nada sobre Android. El escritorio y el
teléfono difieren precisamente en lo que importa: cómo se instala la CA, si
Android resuelve mDNS `.local`, y cómo trata Chrome para Android un certificado
de CA instalada por el usuario. Un resultado verde aquí no autoriza a dar R-02
por cerrado.

## Resultado 2 — Teléfono real (PENDIENTE — acción humana)

> **Bloqueante para cerrar R-02.** CLAUDE.md §19 lo asigna al equipo humano y
> §16 prohíbe simularlo.

### Procedimiento

1. En la laptop: `mkcert -CAROOT` devuelve la carpeta de la CA. En esta máquina
   es `C:\Users\User\AppData\Local\mkcert`.
2. Copiar `rootCA.pem` al teléfono (cable, o descargarlo del propio hub).
   Renombrarlo a `rootCA.crt` suele ser necesario para que Android lo reconozca.
3. Instalarlo en el teléfono: Ajustes → Seguridad → Cifrado y credenciales →
   Instalar un certificado → **Certificado de CA**. Android mostrará una
   advertencia; es esperada.
4. Conectar el teléfono **a la misma red Wi-Fi** que la laptop.
5. Arrancar el hub con los dos comandos de arriba.
6. Abrir en Chrome del teléfono, y probar **las dos** URLs:
   - `https://192.168.1.55:8443/`
   - `https://desktop-7h3n95j.local:8443/`
7. Anotar las cinco comprobaciones de la pantalla y el user agent que muestra al
   pie.
8. Repetir con el hub apagado tras la primera carga, para confirmar que la
   página sigue abriendo desde el service worker.

### Tabla a rellenar

| Comprobación | IP LAN | Nombre `.local` |
|---|---|---|
| Contexto seguro | `TODO` | `TODO` |
| Service worker registrado | `TODO` | `TODO` |
| API del mismo origen | `TODO` | `TODO` |
| Aislamiento de origen (COOP/COEP) | `TODO` | `TODO` |
| `SharedArrayBuffer` | `TODO` | `TODO` |
| Recarga con el hub apagado | `TODO` | `TODO` |

- **Dispositivo:** `TODO` (ver `docs/nfr/reference-device.md`)
- **Android / Chrome:** `TODO`
- **User agent:** `TODO`
- **Fecha:** `TODO`

### Cómo se interpreta el resultado

- **Ambas URLs verdes** → R-02 se cierra como *mitigado*; ADR-0003 deja de estar
  condicionado.
- **Solo la IP verde** → R-02 se cierra con la limitación de que el hub se
  direcciona por IP; hay que documentar cómo se comunica esa IP al agricultor.
- **Ninguna verde** → R-02 se materializa. `FileTransport` pasa a transporte
  único y hay que abrir un ADR que reemplace al 0003.

## Notas de ejecución

- `curl` en Windows usa schannel y rechaza el certificado con *«the revocation
  status is unknown»*. Es una limitación de schannel con CAs locales, no un
  problema del certificado: Chrome lo acepta sin objeciones. Para comprobaciones
  por línea de comandos, usar `--ssl-revoke-best-effort`.
- `mkcert -install` reportó un error de `keytool` al intentar escribir en el
  almacén de Java (`Acceso denegado`). No afecta: el almacén que Chrome usa es
  el de Windows, y ahí sí quedó instalada.
- `services/edge-hub/certs/` está en `.gitignore`. La clave privada del hub no
  se versiona; cada máquina genera la suya.
