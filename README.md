# 餐具抽屉隔板设计 · Drawer Divider Designer

在浏览器里设计餐具抽屉的木隔板。纯静态网页，不依赖第三方库，支持 12 种语言。

*Plan wooden cutlery drawer dividers in the browser — cut list, stock layout, 3D and AR preview. Available in 12 languages.*

## 功能

- 拖动布置横、竖隔板，调整长度、数量、板厚和位置。等分范围可以从相邻的隔板量起。
- 隔板列表按零件编号 A、B、C… 排列，横、竖隔板的序号随之自动重排。
- 自动识别十字搭接、端头搭接、开槽和 T 形对接，生成下料清单（含每个槽和钉孔的中心位置）和排料图。打开「接口」后，俯视图上会标出钉孔，选中隔板时还会标出槽和孔的中心距离。
- 实景预览：3D 视图，或者按透视把隔板叠进一张抽屉照片。
- 手机 AR：安卓 Chrome 用 WebXR 把 1:1 尺寸的隔板摆进真实的抽屉；iPhone Safari 一键进入系统的 AR 快速查看。
- 下载 USDZ / GLB 模型和效果图。设计自动保存在当前浏览器里（localStorage），切换语言不会丢。

## 语言

中文 `zh` · English `en` · Español `es` · Deutsch `de` · Français `fr` · 日本語 `ja` · 한국어 `ko` · Русский `ru` · العربية `ar`（从右到左） · Português `pt` · Italiano `it` · Nederlands `nl`

每种语言有自己的网址，例如 `/zh/`、`/en/`。根地址 `/` 会按访问者保存过的选择或浏览器语言自动跳转，没有匹配时进入英文版。

## 目录结构

```
src/page.html      页面模板：文字写成 {{键名}}，由生成脚本填入
i18n/<语言>.json    翻译：lang（语言信息）、meta（标题和描述）、page（页面文字）、app（脚本里用到的文字）
tools/build.mjs    生成脚本（Node.js，无依赖）
css/style.css      样式（浅色和深色主题、从右到左布局）
js/                脚本，按 i18n → model → ar-math → drawing → panels → events → preview → live-ar → main 的顺序加载
og/<语言>.png       分享卡片（1200 × 630）
favicon.svg、apple-touch-icon.png

以下由 tools/build.mjs 生成，不要手动修改：
<语言>/index.html   12 个语言页面
index.html         根地址的语言选择和跳转页
404.html、sitemap.xml、robots.txt
```

## 修改后重新生成

改了 `src/page.html` 或 `i18n/*.json` 之后运行：

```sh
node tools/build.mjs
```

然后把生成的文件一起提交。生成时会检查每种语言是否和 `zh.json` 的键一致、占位符（如 `{n}`、`{name}`）是否齐全；有问题会列出来并停止生成。

只改 `css/` 或 `js/` 时也要重新运行一次：页面里引用的 CSS 和脚本地址带有内容版本号，这样更新后浏览器不会继续用旧缓存。

**网站地址**会自动从 git 的 `origin` 远程地址推算（例如 `https://用户名.github.io/drawer_designer/`）。如果用了自定义域名，可以放一个 `CNAME` 文件，或者在根目录建 `site.json`：

```json
{ "url": "https://example.com/", "verify": { "google": "", "bing": "", "baidu": "", "yandex": "" } }
```

`verify` 里填各搜索引擎站长平台给的验证码，生成时会写进每个页面的 `<meta>`。也可以临时指定：`node tools/build.mjs --url https://example.com/`。

**翻译**：页面里显示的文字都在 `i18n/*.json` 里，代码里不写任何语言的原文。要按数量变化的文字写成 `{ "one": "…", "other": "…" }`（俄语另有 `few`、`many`），由浏览器的 `Intl.PluralRules` 选择形式。德语、法语等语言的小数显示为逗号，输入框里仍然用小数点。

**加一种语言**：复制 `i18n/en.json` 为新文件并翻译，把语言代码加到 `tools/build.mjs` 的 `LANGS`，补一张 `og/<语言>.png`，然后重新生成。

## SEO

生成的每个语言页面都包含：

- 本地化的 `<title>`、`<meta name="description">`，以及 `<html lang>` 和 `dir`
- `canonical`，以及指向全部语言和 `x-default` 的 `hreflang` 链接
- Open Graph 和 Twitter 分享卡片（每种语言一张图）
- `WebApplication` 结构化数据（JSON-LD）
- 「关于这个工具」介绍段落，页脚有所有语言版本的普通链接，便于搜索引擎发现

`sitemap.xml` 列出全部语言页面及其互相对应的版本。

GitHub Pages 的项目网站在 `用户名.github.io/仓库名/` 下面，而搜索引擎只读取域名根目录的 `robots.txt`，所以这里生成的 `robots.txt` 只有在用自定义域名时才起作用。建议在 [Google Search Console](https://search.google.com/search-console) 和 Bing 网站管理员工具里添加网址前缀资源，验证后直接提交 `sitemap.xml` 的地址。

分享卡片是固定的图片；如果改了某种语言的标题或描述，需要另外更新 `og/` 里对应的图片。

## 本地预览

```sh
python3 -m http.server 8000
```

然后打开 <http://localhost:8000/>。相机 AR 要求 https 网址（只有 localhost 例外），所以在手机上请用 GitHub Pages 的网址测试。

## AR 的要求

- **安卓**：用 Chrome 打开，手机需要支持 ARCore（装有「Google Play 服务 AR 版」）。第一次使用会请求相机权限。
- **iPhone / iPad**：用 Safari 打开，使用系统自带的 AR 快速查看。iOS 上的浏览器不支持 WebXR 的 AR 模式。
- **电脑**：可以用 3D 视图和照片叠加，也可以下载模型文件传到手机上查看。
