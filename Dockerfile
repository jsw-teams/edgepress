FROM node:22-alpine
WORKDIR /app
COPY package.json site.config.js ./
COPY src ./src
COPY themes ./themes
COPY content ./content
RUN node src/cli.js build
ENV HOST=0.0.0.0
ENV PORT=8787
EXPOSE 8787
CMD ["node", "src/cli.js", "serve"]
