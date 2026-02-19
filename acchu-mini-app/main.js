const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const WebSocket = require('ws');
const axios = require('axios');
const os = require('os');
const fs = require('fs');
const QRCode = require('qrcode');
const PrinterService = require('./services/PrinterService');

let mainWindow = null;
let tray = null;
let ws = null;
let printQueue = [];
let printerService = null;

// Configuration
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const WS_URL = BACKEND_URL.replace('http', 'ws') + '/ws';

// Create temp directory for downloaded files
const TEMP_DIR = path.join(os.tmpdir(), 'acchu-print-shop');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 900,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        icon: path.join(__dirname, 'assets', 'icon.ico'),
        autoHideMenuBar: true,
        title: 'ACCHU Print Shop'
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
        return false;
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function createTray() {
    const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
    
    // Check if icon exists, if not skip tray creation
    if (!fs.existsSync(iconPath)) {
        console.log('Tray icon not found, skipping tray creation');
        return;
    }
    
    tray = new Tray(iconPath);

    const updateTrayMenu = () => {
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Open Print Shop',
                click: () => {
                    if (mainWindow) {
                        mainWindow.show();
                        mainWindow.focus();
                    } else {
                        createWindow();
                    }
                }
            },
            { type: 'separator' },
            {
                label: `Pending Jobs: ${printQueue.length}`,
                enabled: false
            },
            {
                label: ws && ws.readyState === WebSocket.OPEN ? '● Connected' : '○ Disconnected',
                enabled: false
            },
            { type: 'separator' },
            {
                label: 'Quit',
                click: () => {
                    app.isQuitting = true;
                    app.quit();
                }
            }
        ]);

        tray.setContextMenu(contextMenu);
    };

    updateTrayMenu();
    tray.setToolTip('ACCHU Print Shop');

    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        } else {
            createWindow();
        }
    });

    // Update tray menu every 5 seconds
    setInterval(updateTrayMenu, 5000);
}

function connectWebSocket() {
    console.log('Connecting to backend:', WS_URL);

    ws = new WebSocket(WS_URL);

    ws.on('open', () => {
        console.log('Connected to backend');
        
        // Send connection message
        ws.send(JSON.stringify({
            type: 'local-agent-connected',
            data: {
                shopId: 'shop-001',
                timestamp: new Date()
            },
            timestamp: new Date()
        }));

        // Notify renderer
        if (mainWindow) {
            mainWindow.webContents.send('connection-status', { connected: true });
        }
    });

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log('Received message:', message.type);

            handleWebSocketMessage(message);
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    ws.on('close', () => {
        console.log('Disconnected from backend');
        ws = null;

        if (mainWindow) {
            mainWindow.webContents.send('connection-status', { connected: false });
        }

        // Reconnect after 5 seconds
        setTimeout(connectWebSocket, 5000);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
}

function handleWebSocketMessage(message) {
    switch (message.type) {
        case 'create-print-job':
            // New print job received
            const job = {
                id: message.jobId,
                sessionId: message.sessionId,
                fileName: message.data.fileName,
                fileUrl: message.data.fileUrl,
                printOptions: message.data.printOptions,
                pricing: message.data.pricing,
                paymentStatus: message.data.paymentStatus,
                status: 'pending',
                timestamp: new Date(message.timestamp)
            };

            printQueue.push(job);
            
            // Notify renderer
            if (mainWindow) {
                mainWindow.webContents.send('print-queue-updated', printQueue);
            }
            break;

        case 'print-job-status-update':
            // Update job status
            const jobIndex = printQueue.findIndex(j => j.id === message.jobId);
            if (jobIndex !== -1) {
                printQueue[jobIndex].status = message.data.status;
                
                if (mainWindow) {
                    mainWindow.webContents.send('print-queue-updated', printQueue);
                }
            }
            break;

        case 'payment-completed':
            // Payment completed for a job
            const paidJobIndex = printQueue.findIndex(j => j.id === message.jobId);
            if (paidJobIndex !== -1) {
                printQueue[paidJobIndex].paymentStatus = 'completed';
                
                if (mainWindow) {
                    mainWindow.webContents.send('print-queue-updated', printQueue);
                }
            }
            break;
    }
}

// IPC Handlers
ipcMain.handle('get-print-queue', async () => {
    return printQueue;
});

ipcMain.handle('get-connection-status', async () => {
    return {
        connected: ws && ws.readyState === WebSocket.OPEN
    };
});

ipcMain.handle('generate-qr-code', async () => {
    try {
        // Get local IP address
        const networkInterfaces = os.networkInterfaces();
        let localIP = 'localhost';
        
        for (const interfaceName in networkInterfaces) {
            const interfaces = networkInterfaces[interfaceName];
            for (const iface of interfaces) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    localIP = iface.address;
                    break;
                }
            }
        }
        
        // Generate customer URL
        const customerUrl = `http://${localIP}:3003`;
        
        // Generate QR code as data URL
        const qrCodeDataUrl = await QRCode.toDataURL(customerUrl, {
            width: 400,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });
        
        return {
            success: true,
            qrCode: qrCodeDataUrl,
            url: customerUrl,
            ip: localIP
        };
    } catch (error) {
        console.error('QR code generation failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
});

ipcMain.handle('print-job', async (event, jobId) => {
    try {
        const job = printQueue.find(j => j.id === jobId);
        if (!job) {
            throw new Error('Job not found');
        }

        // Check payment status
        if (job.paymentStatus !== 'completed') {
            throw new Error('Payment not completed');
        }

        // Update job status
        job.status = 'printing';
        if (mainWindow) {
            mainWindow.webContents.send('print-queue-updated', printQueue);
        }

        // Download file if URL provided
        let filePath = job.filePath;
        if (job.fileUrl && !filePath) {
            const fileName = `${jobId}_${job.fileName}`;
            filePath = path.join(TEMP_DIR, fileName);
            
            console.log(`Downloading file from: ${job.fileUrl}`);
            await printerService.downloadFile(job.fileUrl, filePath);
            console.log(`File downloaded to: ${filePath}`);
        }

        // Print the file
        if (filePath && fs.existsSync(filePath)) {
            console.log('Sending to printer...');
            const printResult = await printerService.printFile(filePath, {
                printer: printerService.defaultPrinter,
                copies: job.printOptions.copies || 1,
                colorMode: job.printOptions.colorMode || 'bw',
                duplex: job.printOptions.duplex || false,
                paperSize: job.printOptions.paperSize || 'A4'
            });

            console.log('Print result:', printResult);

            // Update job status
            job.status = 'completed';
            
            // Notify backend
            try {
                await axios.post(
                    `${BACKEND_URL}/api/print-jobs/${job.sessionId}/execute/${jobId}`
                );
            } catch (err) {
                console.error('Failed to notify backend:', err);
            }
            
            // Remove from queue after 2 seconds
            setTimeout(() => {
                printQueue = printQueue.filter(j => j.id !== jobId);
                if (mainWindow) {
                    mainWindow.webContents.send('print-queue-updated', printQueue);
                }
                
                // Clean up temp file
                if (filePath.startsWith(TEMP_DIR)) {
                    fs.unlink(filePath, (err) => {
                        if (err) console.error('Failed to delete temp file:', err);
                    });
                }
            }, 2000);

            return { 
                success: true, 
                message: `Print job sent to ${printerService.defaultPrinter || 'printer'}` 
            };
        } else {
            throw new Error('File not found');
        }
    } catch (error) {
        console.error('Print error:', error);
        
        // Update job status to failed
        const job = printQueue.find(j => j.id === jobId);
        if (job) {
            job.status = 'failed';
            if (mainWindow) {
                mainWindow.webContents.send('print-queue-updated', printQueue);
            }
        }
        
        return { 
            success: false, 
            error: error.message || 'Failed to print'
        };
    }
});

ipcMain.handle('get-printer-status', async () => {
    try {
        if (!printerService) {
            return {
                online: false,
                name: 'Printer service not initialized',
                status: 'Offline'
            };
        }

        const status = await printerService.getPrinterStatus();
        return {
            online: status.online,
            name: status.name || 'Default Printer',
            status: status.status
        };
    } catch (error) {
        console.error('Failed to get printer status:', error);
        return {
            online: false,
            name: 'Unknown',
            status: 'Error'
        };
    }
});

// App lifecycle
app.whenReady().then(async () => {
    // Initialize printer service
    printerService = new PrinterService();
    await printerService.detectPrinters();
    
    createWindow();
    createTray();
    connectWebSocket();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    // Keep running in tray
});

app.on('before-quit', () => {
    app.isQuitting = true;
    if (ws) {
        ws.close();
    }
});
