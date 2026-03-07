# Marine Guardian AI - Architecture

## Overview

Marine Guardian AI is a marine monitoring and prediction system.

## Project Structure

```
marine-guardian-ai
│
├── frontend          # Web interface
│   ├── index.html    # Main HTML page
│   ├── style.css     # Styles
│   └── map.js        # Map visualization
│
├── backend           # Node.js server
│   ├── server.js     # Express server
│   ├── routes.js     # API routes
│   └── ai_prediction.js  # AI prediction logic
│
├── aws               # AWS infrastructure
│   ├── lambda        # Lambda functions
│   ├── dynamodb      # Database schemas
│   └── api_gateway   # API Gateway config
│
└── docs              # Documentation
    └── architecture.md
```

## Components

### Frontend
- HTML/CSS/JavaScript web application
- Interactive map visualization

### Backend
- Node.js/Express REST API
- AI prediction endpoints

### AWS Services
- **Lambda**: Serverless compute functions
- **DynamoDB**: NoSQL database for marine data
- **API Gateway**: RESTful API management
