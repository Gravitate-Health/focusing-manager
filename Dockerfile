FROM node:22-slim AS buildstage

WORKDIR /usr/src/app

COPY --chown=node package*.json ./
RUN npm install
COPY --chown=node . .
RUN npm run build

FROM node:22-slim 

ENV PORT=3000 
USER root

WORKDIR /usr/src/app
COPY --chown=node package*.json ./
COPY --chown=node --from=buildstage /usr/src/app/build . 
RUN npm install --production

EXPOSE ${PORT}

CMD ["node", "index.js" ]

