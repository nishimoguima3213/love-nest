# 爱情小窝云端配置

## 1. 创建 Supabase 项目

在 Supabase 控制台创建一个项目。进入 SQL Editor，完整执行 `supabase-schema.sql`。

然后在 Authentication 的 Users 页面创建一个共享账号。两部手机使用同一组邮箱和密码登录即可。

## 2. 填写网页配置

在 Project Settings > API 中找到：

- Project URL
- Publishable key（旧版控制台可能显示为 anon key）

把它们填写到 `supabase-config.js`：

```js
window.SUPABASE_CONFIG = {
  url: 'https://你的项目.supabase.co',
  anonKey: '你的公开 anon key'
};
```

网页中只能使用公开 anon key，不能使用 `service_role` key。

## 3. 本地验证

保存配置后重新启动：

```text
npm start
```

打开网页并使用共享账号登录，上传一张测试照片，再用另一部手机登录确认照片是否同步。

## 4. 发布到公网

将项目部署到 Vercel、Netlify 或其他支持静态网站的托管服务。发布后会得到一个 HTTPS 地址，这个地址就可以在微信中从不同地点打开。

当前页面的照片访问地址使用 Supabase 的短期签名链接，照片桶保持私有；只有登录共享账号的设备能读取照片。
