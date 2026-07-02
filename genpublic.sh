#!/bin/sh

set -a
. ./.env
set +a

mkdir -p public

envsubst < templates/index.html > public/index.html

envsubst < templates/preview.html > public/preview.html

echo "\"public/index.html\" перезаписан"
echo "\"public/preview.html\" перезаписан"