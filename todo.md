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
- [x] git commit + push al repositorio de GitHub (82ad6ab código; daa74dc docs; 85337be tests; f915522 billetera)

## Pruebas
- [x] Arrancar servidor en modo NO_CONFIG (sin llaves) → 503, sin simulación
- [x] Probar registro/login/logout y /api/auth/me
- [x] Probar flujo de pago en DEMO_MODE (CL y CO)
- [x] Probar billetera y transferencia a Nequi (panel admin)
- [x] Ejecutar tests existentes (test-wompi.js) — 9 PASS
- [x] Probar REQUIRE_LOGIN_TO_PAY=true (401 sin sesión)
- [x] Verificar UI en navegador (index, modal, resultado, mis pagos, admin)

## Corrección: "no aparece la parte donde está el dinero"
- [x] Primer usuario registrado = COMERCIO (admin) automáticamente (sin ADMIN_EMAIL)
- [x] Al arrancar, si no hay admin, promover al usuario más antiguo a comercio
- [x] Añadir tarjeta "Mi billetera (comercio)" en la página principal (saldo, recaudado, Nequi)
- [x] Añadir botón "Mi saldo" en la barra superior del comercio
- [x] Mejorar el aviso de "cobros no activados" y el mensaje del panel
- [x] Verificado: registro → role admin, /api/admin/wallet ok, tarjeta visible en la web

## Entrega
- [x] Actualizar README/DEPLOY con las novedades
- [x] Exponer puerto y entregar preview + resumen
