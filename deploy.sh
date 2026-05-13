npm run build && \
rm -f dist.tar.gz && \
COPYFILE_DISABLE=1 tar -czf dist.tar.gz --exclude='.DS_Store' ./dist && \
scp dist.tar.gz root@180.76.239.114:/www/server/vflow-ai-frontend && \
ssh root@180.76.239.114 'cd /www/server/vflow-ai-frontend && rm -rf ./dist && tar -xzf ./dist.tar.gz && echo "✅ 部署完成"'
# rm -f dist.tar.gz
