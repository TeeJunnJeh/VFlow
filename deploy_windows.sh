#!/bin/bash
# 确保脚本在出错时立即停止
set -e
npm run build
# 解决方案：
# 1.使用 --owner=0 --group=0 强制将UID/GID设为0，规避超出范围问题
# 2.移除 --format=ustar，让tar自动选择更兼容的格式（通常是pax）
# 3.确保环境变量 COPYFILE_DISABLE=1 在同侧生效
export COPYFILE_DISABLE=1
tar --exclude='.DS_Store' --owner=0 --group=0 -zcvf dist.tar.gz ./dist
# 执行远程部署
# 注意：确保这一行没有多余的换行符或特殊字符
scp dist.tar.gz root@1.95.137.119:/www/server/vflow-ai-frontend
ssh root@1.95.137.119 "cd /www/server/vflow-ai-frontend && rm -rf ./dist && tar -xzf ./dist.tar.gz && echo '✅ 部署完成'"
# 清理本地文件
rm -f dist.tar.gz