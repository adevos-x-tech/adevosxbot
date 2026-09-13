FROM node:lts

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg imagemagick webp && apt-get clean

WORKDIR /app

COPY package*.json ./

RUN npm install && npm cache clean --force

COPY . .

EXPOSE 3000

CMD ["npm", "run", "start"]
