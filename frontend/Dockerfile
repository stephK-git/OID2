# Build stage
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage avec NGINX
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# Configuration Nginx pour le Single Page Application (SPA)
RUN printf 'server {\n\
    listen 80;\n\
    location / {\n\
        root /usr/share/nginx/html;\n\
        index index.html index.htm;\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
    location /auth/ {\n\
        proxy_pass http://api:8000/auth/;\n\
    }\n\
    location /signalements/ {\n\
        proxy_pass http://api:8000/signalements/;\n\
    }\n\
    location /verification/ {\n\
        proxy_pass http://api:8000/verification/;\n\
    }\n\
    location /coordination/ {\n\
        proxy_pass http://api:8000/coordination/;\n\
    }\n\
    location /enquete/ {\n\
        proxy_pass http://api:8000/enquete/;\n\
    }\n\
    location /rapports/ {\n\
        proxy_pass http://api:8000/rapports/;\n\
    }\n\
    location /uploads/ {\n\
        proxy_pass http://api:8000/uploads/;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

