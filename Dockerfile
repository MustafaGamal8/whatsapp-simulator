# Use a compatible Node.js version (20+)
FROM node:20-bullseye-slim

# Set working directory
WORKDIR /app

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

# Copy package.json and package-lock.json first (for Docker caching)
COPY --chown=appuser:appuser package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy the rest of the application files
COPY --chown=appuser:appuser . .

# Build the NestJS application
RUN npm run build

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "dist/main.js"]
