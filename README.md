# 「陆取通知」新生舞会点歌台

「陆取通知」新生舞会的实时点歌队列。前端是无需构建的 HTML/CSS/JS，托管在 GitHub Pages；线上数据和管理员登录由 Supabase 提供。

## 本地预览

```bash
python3 -m http.server 4173
```

访问 `http://localhost:4173/`。未配置 Supabase 时会自动启用本地演示模式，数据保存在浏览器中，管理员密码为 `admin`。演示模式只适合界面预览，不适合正式活动。

## 配置实时后端

1. 在 [Supabase](https://supabase.com/) 创建免费项目。
2. 打开 SQL Editor，执行 [`supabase/schema.sql`](./supabase/schema.sql)。
3. 在 Authentication > Users 创建一个管理员账号。
4. 在 Project Settings > API 复制 Project URL 和 anon public key，填入 [`config.js`](./config.js)。`anon` key 可以公开，切勿把 `service_role` key 放到网页里。
5. 将 `siteUrl` 设为最终地址，例如 `https://renrua52.github.io/diange`。留空时会自动使用当前页面地址。

管理员权限由 Supabase Auth 与数据库 RLS 策略保护。访客只能查看和新增点歌，登录用户才能更新或删除。

## 发布到 GitHub Pages

建议创建仓库 `renrua52/diange`，推送本目录内容后，在仓库 Settings > Pages 中选择 **Deploy from a branch**，分支选 `main`、目录选 `/ (root)`。地址将是：

`https://renrua52.github.io/diange/`

如需直接使用根域名 `https://renrua52.github.io/`，应把这些文件放入 `renrua52/renrua52.github.io` 仓库根目录。
