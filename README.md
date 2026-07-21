# SP Intelligence — 結構型商品追蹤平台

FCN／BEN 結構型商品的持倉管理、Knock-In 風險分析、SP Intelligence Score 評分與 AI 每日市場報告。

## 專案結構

```
sp-intelligence/
  api/claude.js       ← Vercel 伺服器端函式，代為呼叫 Anthropic API（金鑰不會外洩到瀏覽器）
  src/App.jsx          ← 主要應用程式
  src/main.jsx
  src/index.css
  index.html
  package.json
```

## 本機開發

需要先安裝 [Node.js](https://nodejs.org/)（18 以上版本）。

```bash
npm install
npm run dev
```

打開瀏覽器到終端機顯示的網址（通常是 http://localhost:5173）即可看到網站。

> 注意：本機用 `npm run dev` 執行時，「AI 每日報告」功能需要額外用 `vercel dev` 才能連到 `/api/claude`（見下方部署後說明），或者你也可以先跳過本機測試，直接部署到 Vercel 後就能完整使用。

## 部署到 Vercel

### 方法一：透過 GitHub（推薦，之後改程式碼會自動重新部署）

1. 把這個資料夾推到你自己的 GitHub repository：
   ```bash
   cd sp-intelligence
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin <你的 GitHub repo 網址>
   git push -u origin main
   ```
2. 到 [vercel.com](https://vercel.com) 用 GitHub 帳號登入，點 **Add New → Project**，選擇剛剛推上去的 repository。
3. Framework Preset 選 **Vite**（Vercel 通常會自動偵測到）。
4. 部署前先設定環境變數：**Settings → Environment Variables**，新增：
   - Key: `ANTHROPIC_API_KEY`
   - Value: 你的 Anthropic API 金鑰（到 https://console.anthropic.com/settings/keys 申請）
5. 點 **Deploy**。幾分鐘後就會拿到一個 `xxx.vercel.app` 的網址。

### 方法二：用 Vercel CLI（不透過 GitHub）

```bash
npm install -g vercel
cd sp-intelligence
vercel
```
依照提示操作，第一次會問專案名稱、要不要連結既有專案等，選預設值即可。部署完成後，一樣要到 Vercel 後台幫這個專案加上 `ANTHROPIC_API_KEY` 環境變數，並重新部署一次（`vercel --prod`）讓變數生效。

## 手機使用

部署完成後，用手機瀏覽器打開你的 `xxx.vercel.app` 網址，再用瀏覽器選單裡的「加入主畫面」，就會有一個接近原生 App 的圖示可以使用。

## 資料儲存說明

- 持倉、評分、權重設定：儲存在**使用者自己瀏覽器的 localStorage**，不會上傳到伺服器，換瀏覽器或清除快取會遺失，之後如需要跨裝置同步，會需要加上帳號系統＋資料庫（例如 Vercel Postgres / Supabase）。
- AI 每日報告：呼叫 `/api/claude`，由伺服器端使用你的 `ANTHROPIC_API_KEY` 向 Anthropic API 發送請求，金鑰不會出現在瀏覽器裡。

## 目前尚未串接（Roadmap）

- 即時市場報價（VIX、個股價、利率等）目前仍為手動輸入或滑桿設定，之後可接市場資料 API（如 Polygon、Twelve Data 等）自動帶入。
- 真正的「每日自動更新」需要排程機制，可用 Vercel Cron Jobs 定期呼叫 `/api/claude` 並把結果寫入資料庫。
- 經濟日曆、歷史回測、跨裝置帳號同步。
