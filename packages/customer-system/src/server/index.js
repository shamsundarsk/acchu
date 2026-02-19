"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wss = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = require("http");
const ws_1 = require("ws");
const sessions_1 = require("./routes/sessions");
const files_1 = require("./routes/files");
const payments_1 = require("./routes/payments");
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
const wss = new ws_1.WebSocketServer({ server });
exports.wss = wss;
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.static('dist/client'));
// Routes
app.use('/api/sessions', sessions_1.sessionRoutes);
app.use('/api/files', files_1.fileRoutes);
app.use('/api/payments', payments_1.paymentRoutes);
// WebSocket handling
wss.on('connection', (ws, request) => {
    console.log('New WebSocket connection');
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            console.log('Received WebSocket message:', data);
            // Handle different message types
            switch (data.type) {
                case 'join-session':
                    // Join session room for updates
                    ws.sessionId = data.sessionId;
                    break;
                default:
                    console.log('Unknown message type:', data.type);
            }
        }
        catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    });
    ws.on('close', () => {
        console.log('WebSocket connection closed');
    });
});
// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Catch-all handler for client-side routing
app.get('*', (req, res) => {
    res.sendFile('index.html', { root: 'dist/client' });
});
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Customer System server running on port ${PORT}`);
});
//# sourceMappingURL=index.js.map