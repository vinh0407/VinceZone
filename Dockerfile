FROM node:20-alpine

WORKDIR /app

# Copy package definition and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application source code
COPY . .

# Expose server port
ENV PORT=3000
EXPOSE 3000

# Start VinceZone server
CMD ["node", "server.js"]
