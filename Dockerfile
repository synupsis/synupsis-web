# Synupsis web: one long-lived Node server (pages, API and the recap
# generation worker). Used by Dokploy in development and Render in production.
# See docs/deployment.md.

FROM node:24-bookworm-slim AS build
WORKDIR /app

# nuxt.config.ts reads the public Supabase settings while building (Supabase
# module). Both are public values: secrets are runtime-only.
ARG NUXT_PUBLIC_SUPABASE_URL
ARG NUXT_PUBLIC_SUPABASE_KEY
ENV NUXT_PUBLIC_SUPABASE_URL=$NUXT_PUBLIC_SUPABASE_URL \
    NUXT_PUBLIC_SUPABASE_KEY=$NUXT_PUBLIC_SUPABASE_KEY \
    NUXT_TELEMETRY_DISABLED=1

COPY package.json yarn.lock ./
COPY .github/vendor/rollup-defaults-clone ./.github/vendor/rollup-defaults-clone
# No dependency needs an install script; skipping them also skips the Supabase
# CLI download. `nuxt build` prepares the project itself.
RUN yarn install --frozen-lockfile --ignore-scripts --network-timeout 600000

COPY . .
RUN test -n "$NUXT_PUBLIC_SUPABASE_URL" && test -n "$NUXT_PUBLIC_SUPABASE_KEY" \
    || (echo "Set the NUXT_PUBLIC_SUPABASE_URL and NUXT_PUBLIC_SUPABASE_KEY build arguments." && exit 1)
RUN yarn build

# The Nitro output bundles its own dependencies: nothing else is copied.
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

COPY --from=build --chown=node:node /app/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
