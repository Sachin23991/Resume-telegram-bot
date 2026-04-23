FROM node:20-alpine

WORKDIR /app

# Install only production dependencies first for better layer caching.
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source.
COPY src ./src

# App listens on PORT from environment.
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/app.js"]
