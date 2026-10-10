# The image the e2e suite runs in locally (scripts/run-e2e-tests.sh).
# The tag must match the installed @playwright/test version.
ARG PLAYWRIGHT_VERSION
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble

# Software WebGL and a virtual display, so headed Firefox can load MapLibre.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libgl1-mesa-dri libegl1 xvfb xauth \
  && rm -rf /var/lib/apt/lists/*

ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION}

WORKDIR /work
