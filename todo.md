# TODO — Pagos Chile + Colombia (simplificado + login + billetera Nequi)

## Estado
- [x] Recuperar archivos tras rollback (server.js, lib/auth.js, lib/users.js, lib/wallet.js, public/admin.html)
- [x] Verificar contrato de la API del servidor

## Dependencias
- [x] Instalar bcryptjs, jsonwebtoken, cookie-parser
- [x] Actualizar package.json con las dependencias

## Frontend (2 flujos exactos)
- [x] Reescribir public/index.html: topbar con sesión, selector país (CL por defecto), caja estática de medio de pago, sección "Mis pagos", modal de login/registro
- [x] Reescribir public/app.js: CL→solo efectivo (código), CO→solo tarjeta; sesión; polling; PWA
- [x] Reescribir public/admin.js: panel del comercio (stats, billetera, órdenes, usuarios, transferir a Nequi)
- [x] Añadir estilos (topbar, modal, mis-pagos) a public/styles.css
- [x] Reescribir .env.example (DEMO_MODE, AUTH_SECRET, ADMIN_*, REQUIRE_LOGIN_TO_PAY)

## Respaldo
- [x] git commit + push al repositorio de GitHub (commit 82ad6ab: código; commit daa74dc: documentación)

## Pruebas
- [x] Arrancar servidor en modo NO_CONFIG (sin llaves) → 503, sin simulación
- [x] Probar registro/login/logout y /api/auth/me
- [x] Probar flujo de pago en DEMO_MODE (CL y CO)
- [x] Probar billetera y transferencia a Nequi (panel admin)
- [x] Ejecutar tests existentes (test-wompi.js) — 9 PASS
- [x] Probar REQUIRE_LOGIN_TO_PAY=true (401 sin sesión)
- [x] Verificar UI en navegador (index, modal, resultado, mis pagos, admin)

## Entrega
- [x] Actualizar README/DEPLOY con las novedades
- [x] Exponer puerto y entregar preview + resumen
