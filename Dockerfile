FROM node:20-slim

WORKDIR /spudy

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

CMD ["node", "index.js"]