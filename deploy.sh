#!/usr/bin/env sh

# abort on errors
set -e

# build
npm run build

# copy models to dist
cp -r public/models dist/

# navigate into the build output directory
cd dist

# if you are deploying to a custom domain
# echo 'www.example.com' > CNAME

git init
git checkout -B main
git add -A
git commit -m 'deploy'

# if you are deploying to https://<USERNAME>.github.io/<REPO>
git push -f https://github.com/siva-sub/client-ocr-app.git main:gh-pages

cd -