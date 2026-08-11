FROM ghcr.io/puppeteer/puppeteer:latest

# Switch to root to configure the environment
USER root

# Define environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the application
COPY . .

# Switch back to the non-root user provided by the puppeteer image
USER pptruser

EXPOSE 8001

CMD ["npm", "start"]
