# TODO — Activar cobros reales (Flow Chile + Wompi Colombia)

## Diagnóstico (respuesta a "faltan credenciales de Wompi y Flow Chile")
- [x] Confirmar que la app está en modo NO_CONFIG (no hay llaves reales en Render)
- [x] Confirmar que el aviso es correcto y esperado (no es un error de la app)

## Backend
- [x] Añadir endpoint GET /api/admin/activacion con el checklist de requisitos
- [x] Devolver qué llaves faltan por país (Flow, Wompi, Pagos a Terceros, Nequi, AUTH_SECRET)

## Panel del comercio (frontend)
- [x] Añadir sección "Activación de cobros reales" en admin.html
- [x] Renderizar el checklist (✅/❌) con enlaces de registro en admin.js
- [x] Mostrar los nombres EXACTOS de las variables de entorno que hay que poner en Render

## Guía
- [x] Crear ACTIVACION.md (paso a paso: Flow, Wompi, Nequi, Render)
- [x] Crear activacion.html (versión web con estilos) y enlazarla desde el panel
- [x] Enlazar la guía desde el panel y el README

## Verificación y respaldo
- [ ] Probar /api/admin/activacion en modo NO_CONFIG y en modo REAL (llaves falsas)
- [ ] Actualizar preview y desplegar
- [ ] git commit + push a GitHub
