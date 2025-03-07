# Use a lightweight base image with Chromium support
FROM node:18-bullseye-slim

# Set working directory
WORKDIR /app

# Upgrade npm (to avoid compatibility issues)
RUN npm install -g npm@latest

# Install required dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
  wget curl unzip libnss3 libxss1 libasound2 fonts-liberation \
  libatk1.0-0 libatk-bridge2.0-0 libcups2 libgbm-dev libgtk-3-0 \
  libpangocairo-1.0-0 libx11-xcb1 libxcb-dri3-0 libxcomposite1 \
  libxdamage1 libxfixes3 libxrandr2 libxshmfence1 xdg-utils \
  && rm -rf /var/lib/apt/lists/*

# Create a non-root user for security
RUN useradd -m appuser
USER appuser

# Copy package.json and package-lock.json first to leverage Docker caching
COPY --chown=appuser:appuser package.json package-lock.json ./

# Clean npm cache and install only production dependencies
RUN npm cache clean --force && npm install --only=production

# Copy the rest of the application files
COPY --chown=appuser:appuser . .

# Build the NestJS application
RUN npm run build

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "dist/main.js"]
