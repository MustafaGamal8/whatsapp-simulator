# Use a base image with Chromium support
FROM node:18-bullseye

# Set working directory
WORKDIR /app

# Install required dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
  wget \
  curl \
  unzip \
  libnss3 \
  libxss1 \
  libasound2 \
  fonts-liberation \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libgbm-dev \
  libgtk-3-0 \
  libpangocairo-1.0-0 \
  libx11-xcb1 \
  libxcb-dri3-0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libxshmfence1 \
  xdg-utils \
  && rm -rf /var/lib/apt/lists/*

# Create the data directory and set permissions
RUN mkdir -p /app/data && chmod -R 777 /app/data

# Copy package.json and package-lock.json first for better caching
COPY package.json package-lock.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy application files
COPY . .

# Build the application using npx (avoiding global NestJS CLI issues)
RUN npx nest build

# Expose port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD ["node", "dist/main.js"]
