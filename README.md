# ⛵ Trip Monitoring System

A production-ready web system for monitoring boat trips between **El Nido** and **Coron**, built with plain HTML/CSS/JS on the frontend and Node.js + Express on the backend.

---

## 📂 Project Structure

```
trip-monitoring-system/
├── public/
│   ├── index.html          # Single-page frontend
│   ├── style.css           # All styles (responsive)
│   └── script.js           # All frontend logic
├── server/
│   ├── server.js           # Express entry point
│   └── routes/
│       ├── trips.js        # POST /submit-trip, GET /trips
│       └── upload.js       # POST /upload-images (Cloudinary)
├── google-apps-script.gs   # Paste into Google Apps Script editor
├── .env.example            # Copy to .env and fill your keys
├── .gitignore
└── package.json
```

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js ≥ 18
- npm

### Steps

```bash
# 1. Clone / open the project folder
cd trip-monitoring-system

# 2. Install dependencies
npm install

# 3. Create your environment file
cp .env.example .env
# → Open .env and fill in your keys (see sections below)

# 4. Start the server
npm start
# or for auto-reload during development:
npm run dev

# 5. Open your browser
open http://localhost:3000
```

> The app works without Cloudinary or Facebook keys — it will log warnings and gracefully skip those features.

---

## 🔑 Environment Variables (`.env`)

| Variable | Description |
|---|---|
| `PORT` | Server port (default `3000`) |
| `GOOGLE_APPS_SCRIPT_URL` | Deployed Apps Script Web App URL |
| `CLOUDINARY_CLOUD_NAME` | Your Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Your Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Your Cloudinary API secret |
| `FB_PAGE_ACCESS_TOKEN` | Facebook Page Access Token |
| `FB_RECIPIENT_ID` | Recipient PSID (or page ID) for Messenger |

---

## 📊 Step 1 — Google Apps Script Setup

This replaces a traditional database with a free Google Sheet.

1. Open a new Google Sheet and note its **Sheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/THIS_IS_THE_ID/edit
   ```

2. Go to **Extensions → Apps Script**.

3. Delete the default `Code.gs` content and paste the entire contents of `google-apps-script.gs`.

4. At the top of the script, replace:
   ```javascript
   var SHEET_ID = 'YOUR_GOOGLE_SHEET_ID';
   ```
   with your actual Sheet ID.

5. **Save** the project (Ctrl/Cmd + S).

6. Click **Deploy → New Deployment**:
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** and authorize permissions.

7. Copy the **Web App URL** (looks like `https://script.google.com/macros/s/...../exec`).

8. Paste it into your `.env`:
   ```
   GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_ID/exec
   ```

> **Important:** Every time you edit the Apps Script code, create a **New Deployment** (not "Manage deployments"). Otherwise your changes won't be live.

---

## ☁️ Step 2 — Cloudinary Setup (Image Uploads)

Cloudinary provides free image hosting (25 GB storage on the free tier).

1. Sign up at **https://cloudinary.com** (free).

2. From the **Dashboard**, copy:
   - **Cloud Name**
   - **API Key**
   - **API Secret**

3. Paste them into `.env`:
   ```
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ```

4. Images will be stored under the folder `trip-monitoring/` in your Cloudinary account.

> **Without Cloudinary keys:** The `/upload-images` endpoint returns placeholder URLs so the rest of the flow still works.

---

## 💬 Step 3 — Facebook Messenger API Setup

Messenger notifications require a Facebook Page and a Meta Developer App.

### A. Create a Facebook Page
If you don't already have one, create a free Facebook Page (any category).

### B. Create a Meta Developer App
1. Go to **https://developers.facebook.com** and log in.
2. Click **My Apps → Create App**.
3. Choose **Business** type and complete the wizard.

### C. Add Messenger Product
1. In your app dashboard: **Add Product → Messenger → Set Up**.
2. Under **Access Tokens**, select your Facebook Page and click **Generate Token**.
3. Copy the token — this is your `FB_PAGE_ACCESS_TOKEN`.

### D. Get the Recipient PSID
- For **testing with yourself**: Use the **User PSID** tool in the Messenger settings (`https://developers.facebook.com/tools/explorer`) — query `GET /me?fields=id` while authenticated as yourself.
- For a **page inbox**: The recipient ID is the PSID of whoever started the conversation.

### E. Add to `.env`
```
FB_PAGE_ACCESS_TOKEN=EAAxxxxxxx...
FB_RECIPIENT_ID=1234567890
```

> **Note:** Without the token/recipient being set, the server logs a warning and skips Messenger — the trip is still saved normally.

---

## 🔐 Admin Login

The admin panel is protected by hardcoded credentials:

| Username | Password |
|---|---|
| `admin` | `admin123` |

When logged in as admin, the dashboard shows two extra columns: **Staff List** and **Images**.

> For production, replace the hardcoded check in `public/script.js` with a real server-side authentication endpoint (e.g., JWT or session-based).

---

## 🌐 Deploying to Production

### Option A — Railway (recommended, free tier available)
1. Push your code to a GitHub repo.
2. Go to **https://railway.app**, connect GitHub, select the repo.
3. Add all `.env` variables in Railway's **Variables** panel.
4. Railway auto-detects Node.js and runs `npm start`.

### Option B — Render
1. Push to GitHub.
2. Go to **https://render.com** → New Web Service → connect repo.
3. Build command: `npm install`  
   Start command: `npm start`
4. Add environment variables in the Render dashboard.

### Option C — VPS / DigitalOcean
```bash
git clone <your-repo>
cd trip-monitoring-system
npm install --production
cp .env.example .env   # fill in values
# Use PM2 for process management:
npm install -g pm2
pm2 start server/server.js --name trip-monitor
pm2 save && pm2 startup
```

---

## 🧩 API Reference

| Method | Route | Description |
|---|---|---|
| `GET` | `/trips` | Fetch all trips from Google Sheets |
| `POST` | `/submit-trip` | Save a new trip + notify Messenger |
| `POST` | `/upload-images` | Upload images to Cloudinary |

### POST /submit-trip — Request Body
```json
{
  "date":        "2024-06-01",
  "days":        3,
  "boat":        "MV Palawan Star",
  "route":       "El Nido to Coron",
  "guests":      12,
  "teamLeader":  "Juan dela Cruz",
  "staffList":   "[{\"position\":\"Guide\",\"name\":\"Juan\"}]",
  "imageURLs":   "[\"https://res.cloudinary.com/...\"]"
}
```

### POST /upload-images — Form Data
- Field name: `images` (multipart/form-data)
- Accepted: JPEG, PNG, GIF, WebP
- Max size: 10 MB per file, up to 20 files

---

## 🛡️ Security Notes

- Never commit your `.env` file — it's in `.gitignore`.
- The admin credentials are client-side only (suitable for low-risk internal tools). For higher security, implement server-side JWT auth.
- All user data displayed in the dashboard is HTML-escaped to prevent XSS.
- Image URLs are validated before rendering as links to prevent open-redirect attacks.
- Only `https://` image URLs are forwarded to Facebook Messenger.

---

## 📝 License

MIT — free to use and modify.
