FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --chown=node:node . .

RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 4000

CMD ["node", "--no-warnings", "index.js"]