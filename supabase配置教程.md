supabase配置教程

1、安装docker desktop并启动

2、

npm install supabase --save-dev //会下载很久 我下了一个多小时
npx supabase init
npx supabase start

进入supabase studio的面板，即第一个面板

![image-20260309015345513](C:\Users\86136\AppData\Roaming\Typora\typora-user-images\image-20260309015345513.png)

创建存储桶 名字需要和下面保持一致并配置policy



![image-20260309015328863](C:\Users\86136\AppData\Roaming\Typora\typora-user-images\image-20260309015328863.png)

![image-20260309015546723](C:\Users\86136\AppData\Roaming\Typora\typora-user-images\image-20260309015546723.png)

把vflow前端代码中的.env文件

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
```

这个改成你cmd面板里显示的 project url和publishable secret