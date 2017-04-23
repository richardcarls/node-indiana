FROM node:alpine

RUN mkdir -p /srv/indiana
WORKDIR /srv/indiana
VOLUME /srv/indiana

RUN npm install

EXPOSE 80

CMD ["npm", "start"]
