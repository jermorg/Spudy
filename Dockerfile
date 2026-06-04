FROM node:20-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install --omit=dev

COPY . .


FROM node:20-slim

WORKDIR /app

COPY --from=builder /app ./

CMD ["npm", "start"]