const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const axios = require('axios');
const os = require('os');
const fs = require('fs');
const QRCode = require('qrcode');
const PrinterService = require('./services/PrinterService');

let mainWindow = null;
let tray = null;
let printQueue = [];
let printerService = null;

// Configuration
const BACKEND_URL = process.env.BACKEND_URL || 'https://acchu-six.vercel.app';
const POLLING_INTERVAL = 5000; // Poll every 5 seconds

// Remove WebSocket - use HTTP polling instead
let pollingInterval = null;

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
                label: pollingInterval ? '● Connected' : '○ Disconnected',
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

function startPolling() {
    console.log('Starting HTTP polling for print jobs');
    
    // Poll immediately
    pollForJobs();
    
    // Then poll every 5 seconds
    pollingInterval = setInterval(pollForJobs, POLLING_INTERVAL);
}

function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

async function pollForJobs() {
    try {
        // Get pending print jobs from backend
        const response = await axios.get(`${BACKEND_URL}/api/print-jobs/pending`);
        
        if (response.data.success && response.data.jobs) {
            const newJobs = response.data.jobs;
            
            // Add new jobs to queue
            newJobs.forEach(job => {
                // Check if job already exists
                const exists = printQueue.find(j => j.id === job.id);
                if (!exists) {
                    printQueue.push({
                        id: job.id,
                        sessionId: job.sessionId,
                        fileName: job.fileName,
                        fileUrl: job.fileUrl,
                        printOptions: job.printOptions,
                        pricing: job.pricing,
                        paymentStatus: job.paymentStatus,
                        status: 'pending',
                        timestamp: new Date(job.timestamp)
                    });
                    
                    console.log(`New print job received: ${job.id}`);
                }
            });
            
            // Notify renderer
            if (mainWindow && printQueue.length > 0) {
                mainWindow.webContents.send('print-queue-updated', printQueue);
            }
        }
        
        // Update connection status
        if (mainWindow) {
            mainWindow.webContents.send('connection-status', { connected: true });
        }
    } catch (error) {
        console.error('Polling error:', error.message);
        
        // Update connection status
        if (mainWindow) {
            mainWindow.webContents.send('connection-status', { connected: false });
        }
    }
}

// IPC Handlers
ipcMain.handle('get-print-queue', async () => {
    return printQueue;
});

ipcMain.handle('get-connection-status', async () => {
    return {
        connected: pollingInterval !== null
    };
});

ipcMain.handle('generate-qr-code', async () => {
    try {
        // Use deployed URL
        const customerUrl = process.env.FRONTEND_URL || 'https://acchu-six.vercel.app';
        
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
            url: customerUrl
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
    startPolling(); // Start HTTP polling instead of WebSocket

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
    stopPolling(); // Stop polling
});
