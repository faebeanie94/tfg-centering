# TFG Backend Server

Node.js/Express backend with PostgreSQL and AWS S3 integration for submissions and images.

## Setup

### Prerequisites
- PostgreSQL (local or cloud)
- AWS S3 bucket
- Node.js 16+

### Environment Variables
Create `.env` file:
```
DATABASE_URL=postgresql://user:password@localhost:5432/tfg
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=us-east-1
S3_BUCKET=your-bucket-name
PORT=5000
```

### Install & Run
```bash
npm install
npm start
```

## Database Schema

### submissions
- id (UUID, primary key)
- name (string)
- created_at (timestamp)
- updated_at (timestamp)

### cards
- id (UUID, primary key)
- submission_id (FK → submissions)
- card_number (int)
- front_s3_url (string, nullable)
- back_s3_url (string, nullable)
- front_local_path (string, nullable)
- back_local_path (string, nullable)
- created_at (timestamp)
- updated_at (timestamp)

### card_metadata
- id (UUID, primary key)
- card_id (FK → cards)
- front_grade (string, nullable)
- back_grade (string, nullable)
- condition (string, nullable)
- notes (text, nullable)

## API Endpoints

### Submissions
- `POST /api/submissions` - Create submission
- `GET /api/submissions` - List all
- `GET /api/submissions/:id` - Get one
- `PUT /api/submissions/:id` - Update
- `DELETE /api/submissions/:id` - Delete

### Cards
- `POST /api/submissions/:id/cards` - Upload card images
- `GET /api/submissions/:id/cards` - List cards
- `PUT /api/submissions/:id/cards/:cardNum` - Update card
- `DELETE /api/submissions/:id/cards/:cardNum` - Delete card

### Export
- `GET /api/submissions/:id/export` - Download as ZIP

## Implementation Status

- [ ] Database schema migration
- [ ] Express server setup
- [ ] S3 integration
- [ ] API endpoints
- [ ] Local folder sync
- [ ] Frontend API integration
- [ ] Error handling
- [ ] Validation
- [ ] Tests

## Notes
- Local folders mirror S3 for offline access
- Single-user (no authentication)
- Images stored in S3, metadata in PostgreSQL
