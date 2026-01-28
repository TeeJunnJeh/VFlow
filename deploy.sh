sudo npm run build && \
# 使用 GNU tar 或 BSD tar 清理生成
COPYFILE_DISABLE=1 tar --format=ustar --exclude='.DS_Store' -zcvf dist.tar.gz ./dist && \
scp dist.tar.gz root@1.95.137.119:/www/server/vflow-ai-frontend && \
ssh root@1.95.137.119 'cd /www/server/vflow-ai-frontend && rm -rf ./dist && tar -xzf ./dist.tar.gz && echo "✅ 部署完成"'
#rm dist.tar.gz