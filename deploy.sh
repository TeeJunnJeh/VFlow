# --- 配置区 ---
REMOTE_USER="root"
REMOTE_HOST="1.95.137.119"
REMOTE_PATH="/www/server/vflow-ai-frontend"
SSH_KEY="/data/cxr25/zhx/id_ed25519"

SSH_OPTS=""
if [ -n "$SSH_KEY" ]; then
    SSH_OPTS="-i $SSH_KEY"
fi

npm run build && \
# 使用 GNU tar 或 BSD tar 清理生成
COPYFILE_DISABLE=1 tar --format=ustar --exclude='.DS_Store' -zcvf dist.tar.gz ./dist && \
scp $SSH_OPTS dist.tar.gz $REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH && \
ssh $SSH_OPTS $REMOTE_USER@$REMOTE_HOST "cd $REMOTE_PATH && rm -rf ./dist && tar -xzf ./dist.tar.gz && echo '✅ 部署完成'"
#rm dist.tar.gz