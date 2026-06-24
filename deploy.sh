#!/bin/bash
cd /opt/label-printer
rm -rf dist src
tar -xzf /opt/deploy.tar.gz
cp -rf dist/* ../dist/
pm2 restart label-printer
echo DONE
