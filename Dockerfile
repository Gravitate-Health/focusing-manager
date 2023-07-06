FROM node:16-slim as buildstage

WORKDIR /usr/src/app

COPY --chown=node package*.json ./
RUN --chown=node npm install
COPY --chown=node . .
RUN npm run build

FROM node:19-slim 

ENV PORT=3000 
USER node

WORKDIR /usr/src/app
COPY package*.json ./
RUN --chown=node npm install
COPY --from=buildstage /usr/src/app/build .

EXPOSE ${PORT}

CMD ["node", "index.js" ]

