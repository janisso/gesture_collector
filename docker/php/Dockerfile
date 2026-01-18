FROM php:8.3-fpm

# Install PDO MySQL driver and zip extension for exports.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libzip-dev zip \
  && docker-php-ext-install pdo_mysql zip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/public
