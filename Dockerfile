FROM node:18-bookworm

WORKDIR /app

# Chromium / Puppeteer dependencies
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

# Create application data directory
RUN mkdir -p /app/data && chmod -R 777 /app/data

# Copy package files first for better Docker caching
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy application source
COPY . .

# Build NestJS application
RUN npx nest build

# Application port
EXPOSE 3000

# Production environment
ENV NODE_ENV=production

# Start application
CMD ["node", "dist/main.js"]
