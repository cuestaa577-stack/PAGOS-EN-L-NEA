#!/usr/bin/env bash
# Prueba integral de la API (DEMO mode)
set -e
BASE="${BASE:-http://localhost:3000}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@demo.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin12345}"
JAR="/tmp/cookies.txt"
rm -f "$JAR"

echo "=========================================="
echo "1) REGISTRO de usuario"
echo "=========================================="
curl -s -c "$JAR" -X POST "$BASE/api/auth/registro" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Maria Lopez","email":"maria@test.com","password":"clave12345"}'
echo ""

echo "=========================================="
echo "2) /api/auth/me (con sesion)"
echo "=========================================="
curl -s -b "$JAR" "$BASE/api/auth/me"
echo ""

echo "=========================================="
echo "3) Pago CHILE (DEMO) -> codigo + checkout"
echo "=========================================="
CL=$(curl -s -b "$JAR" -X POST "$BASE/api/pagar" -H "Content-Type: application/json" \
  -d '{"pais":"CL","nombre":"Maria Lopez","email":"maria@test.com","monto":26000}')
echo "$CL"
COD_CL=$(echo "$CL" | grep -o '"codigo":"[^"]*"' | cut -d'"' -f4)
echo "codigo CL = $COD_CL"
echo ""

echo "=========================================="
echo "4) Pago COLOMBIA (DEMO) -> codigo + checkout"
echo "=========================================="
CO=$(curl -s -b "$JAR" -X POST "$BASE/api/pagar" -H "Content-Type: application/json" \
  -d '{"pais":"CO","nombre":"Maria Lopez","email":"maria@test.com","monto":50000}')
echo "$CO"
COD_CO=$(echo "$CO" | grep -o '"codigo":"[^"]*"' | cut -d'"' -f4)
echo "codigo CO = $COD_CO"
echo ""

echo "=========================================="
echo "5) Estado inicial (debe ser CREADA)"
echo "=========================================="
curl -s "$BASE/api/estado/$COD_CL"; echo ""
curl -s "$BASE/api/estado/$COD_CO"; echo ""

echo "=========================================="
echo "6) Pagar (demo) las dos ordenes"
echo "=========================================="
curl -s -X POST "$BASE/demo/pay" -H "Content-Type: application/json" -d "{\"codigo\":\"$COD_CL\"}"; echo ""
curl -s -X POST "$BASE/demo/pay-wompi" -H "Content-Type: application/json" -d "{\"codigo\":\"$COD_CO\",\"metodo\":\"CARD\"}"; echo ""

echo "=========================================="
echo "7) Estado tras pagar (debe ser PAGADO)"
echo "=========================================="
curl -s "$BASE/api/estado/$COD_CL"; echo ""
curl -s "$BASE/api/estado/$COD_CO"; echo ""

echo "=========================================="
echo "8) Mis ordenes (usuario)"
echo "=========================================="
curl -s -b "$JAR" "$BASE/api/mis-ordenes"; echo ""

echo "=========================================="
echo "9) Login ADMIN"
echo "=========================================="
ADMINJAR="/tmp/cookies_admin.txt"; rm -f "$ADMINJAR"
curl -s -c "$ADMINJAR" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}"; echo ""

echo "=========================================="
echo "10) Admin stats"
echo "=========================================="
curl -s -b "$ADMINJAR" "$BASE/api/admin/stats"; echo ""

echo "=========================================="
echo "11) Admin wallet (saldo)"
echo "=========================================="
curl -s -b "$ADMINJAR" "$BASE/api/admin/wallet"; echo ""

echo "=========================================="
echo "12) Transferir a Nequi (todo el saldo)"
echo "=========================================="
curl -s -b "$ADMINJAR" -X POST "$BASE/api/admin/transferir-nequi" -H "Content-Type: application/json" -d '{}'; echo ""

echo "=========================================="
echo "13) Admin usuarios"
echo "=========================================="
curl -s -b "$ADMINJAR" "$BASE/api/admin/usuarios"; echo ""

echo "=========================================="
echo "14) Seguridad: /api/admin/stats SIN sesion -> 401"
echo "=========================================="
curl -s -o /dev/null -w "HTTP %{http_code}\n" "$BASE/api/admin/stats"

echo "=========================================="
echo "15) Seguridad: /api/mis-ordenes SIN sesion -> 401"
echo "=========================================="
curl -s -o /dev/null -w "HTTP %{http_code}\n" "$BASE/api/mis-ordenes"

echo ""
echo "DONE"
