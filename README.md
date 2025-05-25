# Luccas Portfolio App

A modern React application showcasing dynamic image overlays with Dropbox integration.

## Project Structure

```
luccas-portfolio-app/
├── frontend/          # React frontend (Vite)
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── services/      # API services
│   │   └── utils/         # Utility functions
├── backend/           # Node.js/Express API
│   ├── server.js      # Main server file
│   └── .env.example   # Environment variables template
└── README.md
```

## Features

- **Clean Design**: Minimalist interface inspired by modern portfolio sites
- **Dynamic Overlays**: Real-time image composition with blend modes
- **Dropbox Integration**: Automatic image fetching from cloud storage
- **Responsive Design**: Works perfectly on desktop and mobile
- **Modern Tech Stack**: React 18, Vite, Express, ES modules

## Quick Start

### 1. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env and add your Dropbox access token
npm install
npm run dev
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### 3. Get Dropbox Access Token

1. Go to [Dropbox Developers](https://www.dropbox.com/developers/apps)
2. Create a new app with "Scoped access"
3. Generate an access token
4. Add it to `backend/.env`

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/images` - Fetch all images from Dropbox folders

## Environment Variables

### Backend (.env)
```
DROPBOX_ACCESS_TOKEN=your_token_here
PORT=5001
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:5001
```

## Development

- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:5001
- **Hot reload**: Both frontend and backend support auto-reload

## Folder Structure in Dropbox

The app expects these folders in your Dropbox:
- `/Homepage/large_rectangle_database` - Background images
- `/Homepage/small_rectangle_database` - Overlay images

## Deployment

### Frontend (Vercel/Netlify)
```bash
cd frontend
npm run build
# Deploy dist/ folder
```

### Backend (Railway/Heroku)
```bash
cd backend
# Set DROPBOX_ACCESS_TOKEN environment variable
# Deploy with npm start
```

## Tech Stack

### Frontend
- React 18
- Vite
- CSS3 (Custom styling)
- Canvas API for image manipulation

### Backend
- Node.js
- Express
- Dropbox API
- ES modules
- CORS enabled