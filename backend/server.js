import { createServer } from 'node:http';
import dotenv from 'dotenv';
import worker from './worker-fixed.js';

dotenv.config();

const PORT = Number(process.env.PORT || 5001);

function requestHeaders(nodeRequest) {
    const headers = new Headers();
    for (const [name, value] of Object.entries(nodeRequest.headers)) {
        if (Array.isArray(value)) {
            headers.set(name, value.join(', '));
        } else if (value !== undefined) {
            headers.set(name, value);
        }
    }
    return headers;
}

const server = createServer(async (req, res) => {
    try {
        const host = req.headers.host || `localhost:${PORT}`;
        const request = new Request(new URL(req.url || '/', `http://${host}`), {
            method: req.method,
            headers: requestHeaders(req)
        });
        const response = await worker.fetch(request, {
            LUCCAS_HUB_TOKEN: process.env.LUCCAS_HUB_TOKEN
        });

        response.headers.forEach((value, name) => res.setHeader(name, value));
        res.writeHead(response.status);
        res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
        console.error('Local API adapter error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            error: 'Local API adapter failed',
            details: error instanceof Error ? error.message : 'Unknown server error'
        }));
    }
});

server.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    if (process.env.LUCCAS_HUB_TOKEN) {
        console.log('🗄️ Using Luccas Asset Hub for all media routes');
    } else {
        console.error('ERROR: LUCCAS_HUB_TOKEN is not configured; media routes will return a clear server error.');
    }
});
