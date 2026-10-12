# Imagen para desplegar la pasarela real (Flow + Wompi) en cualquier servidor con HTTPS.
FROM node:20-alpine

WORKDIR /app

# Dependencias primero (mejor cache)
COPY package*.json ./
RUN npm install --omit=dev

# Código de la app
COPY . .

# Carpeta de datos persistente (órdenes). En producción monta un volumen aquí.
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
