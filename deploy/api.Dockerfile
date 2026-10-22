FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY api/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

COPY api/src ./src

EXPOSE 8000
CMD ["npm", "start"]
