# Tesseract with the Norwegian model, for receipt OCR (phase 8, ADR-0011/0017).
# Same base as the staging image, so the worker can be built on it later.
# Run it without a network: the image goes in on stdin and the text comes out on stdout, nothing is written to disk.
#   docker build -t smartmat-ocr docker/ocr
#   docker run --rm -i --network none smartmat-ocr tesseract stdin stdout -l nor
FROM node:22.14.0-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-nor \
  && rm -rf /var/lib/apt/lists/*

USER node
