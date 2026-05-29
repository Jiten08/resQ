# resQLink

resQLink is an emergency response and first aid assistance platform currently consisting of a React Native mobile application, a FastAPI backend, a WebSocket emergency hub, and a Red Cross first-aid knowledge base.

## Project Structure

```
resQlink/
├── mobile-app/               # React Native Expo Frontend
│   ├── App.js                # App entry point
│   ├── package.json          # Frontend dependencies
│   └── app.json              # Expo configuration
│
├── backend/                  # FastAPI Backend
│   ├── app/                  # Application code
│   ├── main.py               # FastAPI app entry point
│   ├── requirements.txt      # Python dependencies for backend
│   └── .env                  # Backend environment variables
│
├── knowledge-base/           # Red Cross First Aid Document & Vector DB data
│   ├── processed-chunks/     # Pre-processed/cleaned text chunks
│   └── vector-store/         # Local vector DB files
│
├── server.js                 # WebSocket Server (Emergency Hub)
├── package.json              # Node dependencies for WebSocket server
└── README.md                 # Project documentation
```

## Getting Started

To run the current resQLink platform, you will need to start the WebSocket server, the FastAPI backend, and the Expo mobile app.

### 1. WebSocket Server (Emergency Hub)
Run the root Node.js server which handles emergency socket connections:
```bash
# Install node dependencies (if not already done)
npm install

# Run the WebSocket server
node server.js
```

### 2. Backend (FastAPI)
Navigate to `backend/` to configure and run the FastAPI server:
```bash
cd backend

# Setup virtual environment and install dependencies
python -m venv .venv

# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt

# Start the server
uvicorn main:app --reload
```

### 3. Mobile App (Expo)
Navigate to the `mobile-app/` directory, install dependencies, and start the Expo app:
```bash
cd mobile-app
npm install

# Start the Expo development server
npm run start
# Press 'a' to open on Android, 'i' to open on iOS, or scan the QR code with the Expo Go app.
```
