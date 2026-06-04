FROM node:20-slim

RUN apt-get update && \
    apt-get install -y python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN mkdir -p /app/data && chown -R node:node /app/data

COPY package*.json ./

RUN npm install

COPY . .

CMD ["npm", "start"]