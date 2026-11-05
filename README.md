# Podcast 共用行事曆

莫蘭迪配色的團隊月曆，涵蓋 2026 年 11 月至 2027 年 9 月。GitHub Pages 提供網頁，Firebase Realtime Database 儲存共用行程與每月備忘錄。

## 使用方式

- 公開網址：https://akashineva1226.github.io/podcast-shared-calendar/
- 所有人可瀏覽行程與備忘錄。請勿輸入電話、學生個資、私密會議連結或其他敏感資料。
- 編輯者先以 Google 登入，按「申請編輯權限」。管理員以建立專案的 Google 帳號登入，在「團隊成員管理」核准。
- 行程支援新增、編輯、刪除、跨日與色彩分類；修改會即時同步。
- 備忘錄修改後按「儲存本月備忘錄」。切換月份會保留尚未儲存的草稿；離開網頁前務必儲存。
- 若兩人同時修改同一筆行程或同月份備忘錄，較晚儲存者會收到衝突訊息，草稿會保留。按「下載備份」保存草稿，再重新載入最新內容。
- 連線中斷時暫停新的編輯；儲存中請保持頁面開啟，確認「已同步」。
- 刪除前建議下載 JSON 備份。頁面提供下載，不提供自動還原；還原須由管理員檢查資料後操作 Firebase。

已建立的三堂課：2026/11/7 企劃製作、2026/12/6 聲音表達、2027/1/11 主持技巧。時間與地點尚待確認。種子資料只在首次設定寫入；網頁不會自動重新建立已刪除的課程。

## 檔案與部署

`index.html` 為介面與月曆呈現；`app.js` 處理 Firebase 登入、權限及即時同步；`database.rules.json` 為伺服器端權限與格式驗證。

GitHub Pages：Settings → Pages → Deploy from a branch → main → /(root)。更新網頁檔案提交到 main 後會重新發布。

Firebase 專案：`podcast-online-schedule`。資料庫位於新加坡 `asia-southeast1`，網址記錄在 `app.js`。網站中的 Firebase client config 是公開設定，不能取代存取規則；此專案不包含管理金鑰或登入權杖。

管理員與核准成員可寫入行程、備忘錄；未核准或未登入的用戶只能讀取這兩個公開路徑。成員及申請名單僅管理員與當事人可讀，只有管理員可授權成員。管理員識別存於資料庫的私有 `admins` 路徑，須由有 Firebase 專案管理權限的人維護。規則驗證日期、內容長度、欄位、版本與修改者；未列出的路徑預設拒絕。

使用 Node.js 20/22/24 LTS，登入有管理權限的 Firebase 帳號後：

```sh
npx -y firebase-tools@latest login
npx -y firebase-tools@latest deploy --only database --project podcast-online-schedule
```

修改 Google 登入設定時需保留 `akashineva1226.github.io` 為授權網域，以及 Firebase 原本的授權網域。若更換 GitHub 帳號或自訂網域，請同步更新 Firebase Authentication 設定。

目前使用免費 Spark 方案；仍受 Firebase 免費額度及同時連線數限制。可在 Firebase Console 檢查用量，無須為本網站主動升級計費。

## 外部依賴

Tailwind CDN、Lucide、Google Fonts 與 Firebase JavaScript SDK 由網路載入。需有網路連線；Google 登入請使用支援彈出視窗的一般瀏覽器。

