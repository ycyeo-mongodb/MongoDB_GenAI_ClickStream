# LeafyTelco — Clickstream Analytics & GenAI Personalisation

A full-stack application demonstrating real-time clickstream analytics and AI-powered personalisation using **MongoDB Atlas**, **Change Streams**, **Vector Search**, and **Amazon Bedrock** (Claude Haiku).

## What It Does

LeafyTelco simulates a telco storefront that captures every user interaction — clicks, hovers, hesitation, rage clicks — and uses AI to deliver personalised marketing offers in real time.

**The pipeline:**

```
User browses store → Clickstream events captured → Stored in MongoDB
    → Friction detected (aggregation pipelines)
    → AI agent triggered (Vector Search + Claude Haiku)
    → Offer inserted into MongoDB → Change Stream fires
    → WebSocket pushes offer to browser → Voucher appears
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React, TypeScript, Tailwind CSS |
| Backend | Python, FastAPI, Uvicorn |
| Database | MongoDB Atlas (M0 free tier) |
| Search | Atlas Vector Search (`$vectorSearch`) |
| Real-time | MongoDB Change Streams + WebSockets |
| Embeddings | VoyageAI via MongoDB Atlas (`voyage-4`) |
| LLM | Claude 3.5 Haiku via Amazon Bedrock (API Gateway proxy) |

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI entry point
│   │   ├── config.py               # Environment config
│   │   ├── database.py             # MongoDB connection
│   │   ├── models.py               # Pydantic models
│   │   ├── routes/
│   │   │   ├── track.py            # Clickstream tracking + auto-trigger
│   │   │   ├── analytics.py        # Behavioral analytics
│   │   │   ├── chat.py             # AI chatbot
│   │   │   └── offers.py           # Marketing offers
│   │   ├── services/
│   │   │   ├── agentic_ai.py       # AI agent (embed → search → LLM)
│   │   │   ├── behavioral_analysis.py  # Friction detection
│   │   │   └── change_stream.py    # MongoDB Change Stream listener
│   │   └── websocket/
│   │       └── manager.py          # WebSocket connection manager
│   ├── seed_analytics_data.py      # Seed user profiles + behavioral events
│   ├── seed_offers.py              # Seed marketing offers (run before embeddings)
│   ├── generate_embeddings.py      # Generate offer embeddings
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/page.tsx            # Main store page
│   │   ├── hooks/
│   │   │   ├── useBehaviorTracker.ts   # Clickstream capture
│   │   │   └── useWebSocket.ts         # WebSocket client
│   │   └── components/
│   │       └── Chatbot.tsx         # AI chat component
│   ├── package.json
│   └── tailwind.config.ts
└── .env.example
```

## Prerequisites

- **Node.js 18+** and npm
- **Python 3.10+** and pip
- **MongoDB Atlas** account ([free tier](https://www.mongodb.com/cloud/atlas/register))
- **VoyageAI API key** (via Atlas → AI Models)
- **LLM endpoint URL** — an API Gateway that proxies to Amazon Bedrock (Claude Haiku)

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/ycyeo-mongodb/MongoDB_GenAI_ClickStream.git
cd MongoDB_GenAI_ClickStream
```

### 2. Set up MongoDB Atlas

1. Create a free cluster at [mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register)
2. Create a database user (Security → Database Access)
3. Add your IP to the access list (Security → Network Access)
4. Get your connection string (Clusters → Connect → Drivers → Python)
5. Create a VoyageAI API key (Services → AI Models → Create new model API key)

### 3. Set up the backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` with your values:

```bash
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=engagement_engine
VOYAGE_API_KEY=<your-voyage-api-key>
LLM_ENDPOINT=<your-api-gateway-url>
```

Seed the database and generate embeddings (run in this order):

```bash
python seed_analytics_data.py    # user profiles + behavioral events
python seed_offers.py            # marketing offers (required for $vectorSearch)
python generate_embeddings.py    # vector embeddings for the seeded offers
```

Start the backend:

```bash
uvicorn app.main:app --reload --port 8000
```

### 4. Set up the frontend

Open a new terminal:

```bash
cd frontend
npm install
npm run dev
```

### 5. Open the app

- **Frontend:** [http://localhost:3000](http://localhost:3000)
- **API docs:** [http://localhost:8000/docs](http://localhost:8000/docs)

## How to Demo

1. Browse the store — watch the **Activity Monitor** (bottom-right) capture events
2. **Hover over phone plans** for 3–4 seconds repeatedly to trigger "hesitation" events
3. After enough friction events, the AI agent kicks in and a **personalised voucher** appears
4. Try the **AI chatbot** (bottom-left) to ask about plans and deals
5. Click **Reset Demo State** in the Activity Monitor to re-trigger offers

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/track` | Record clickstream events |
| GET | `/api/analytics/{user_id}` | Get behavioral analytics |
| POST | `/api/chat` | AI chatbot conversation |
| GET | `/api/offers/{user_id}` | Get personalised offers |
| POST | `/api/reset-demo` | Reset demo state for re-triggering |
| WS | `/ws/{user_id}` | WebSocket for real-time offers |

## LLM Endpoint

The backend calls an external HTTP endpoint (`LLM_ENDPOINT`) for LLM inference. This is an API Gateway + Lambda that proxies requests to Amazon Bedrock (Claude 3.5 Haiku). The expected contract:

**Request** (POST):
```json
{
  "system": "system prompt",
  "prompt": "user prompt",
  "max_tokens": 300,
  "temperature": 0.3
}
```

**Response**:
```json
{
  "response": "LLM output text"
}
```

You can point `LLM_ENDPOINT` at any service that implements this contract.

## License

MIT
