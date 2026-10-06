FROM node:20-alpine

WORKDIR /app

# Dépendances système requises pour la compilation native de better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

# Dossier cible pour le volume de données SQLite
RUN mkdir -p /data

EXPOSE 3001

CMD ["node", "src/index.js"]
