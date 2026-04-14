# Use the official Node.js 20.13.1 Alpine image as the base image
FROM node:14.21.3

# Set the working directory inside the container
WORKDIR /app

# Accept build arguments for .env and serviceKey.json
ARG DOTENV_FILE
ARG SERVICE_KEY_PATH

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

RUN npm install bcrypt

# Rebuild bcrypt
RUN npm rebuild bcrypt --build-from-source

# Copy the rest of the application code
COPY . .

# Expose port 1111
EXPOSE 1111

# Command to run the application
CMD ["node", "server.js"]
