FROM backstage-base:local

WORKDIR /app

# Copy your custom local configuration into the image
COPY config-local.yaml /app/app-config.yaml

# Run Backstage using your local config by default
CMD ["node", "packages/backend", "--config", "app-config.yaml"]
