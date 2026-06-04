# Spudy
[![Docker Pulls](https://img.shields.io/docker/pulls/jermorg/spudy?style=for-the-badge&logo=docker)](https://hub.docker.com/r/jermorg/spudy)
[![Docker Image Version](https://img.shields.io/docker/v/jermorg/spudy?style=for-the-badge&logo=docker)](https://hub.docker.com/r/jermorg/spudy)

### Local Deployment
Create a `docker-compose.yml` file:
```yaml
services:
  server:
    image: jermorg/spudy:latest
    container_name: spudy_server
    ports:
      - "4000:4000"
    volumes:
      - ./data:/app/data
    environment:
      - PORT=4000
