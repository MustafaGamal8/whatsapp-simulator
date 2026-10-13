
FROM node:22-bookworm

WORKDIR /app

# Chromium / Puppeteer system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    curl \
    unzip \
    ca-certificates \
    fonts-liberation \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libgtk-3-0 \
    libasound2 \
    libxshmfence1 \
    libx11-xcb1 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Persistent application data directory
RUN mkdir -p /app/data /app/uploads \
    && chmod -R 777 /app/data /app/uploads

# Install dependencies reproducibly
COPY package.json package-lock.json ./
RUN npm ci

# Copy application source
COPY . .

# Build NestJS
RUN npm run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/main.js"]
