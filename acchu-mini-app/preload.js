const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Get print queue
    getPrintQueue: () => ipcRenderer.invoke('get-print-queue'),
    
    // Get connection status
    getConnectionStatus: () => ipcRenderer.invoke('get-connection-status'),
    
    // Print a job
    printJob: (jobId) => ipcRenderer.invoke('print-job', jobId),
    
    // Get printer status
    getPrinterStatus: () => ipcRenderer.invoke('get-printer-status'),
    
    // Generate QR code
    generateQRCode: () => ipcRenderer.invoke('generate-qr-code'),
    
    // Listen for connection status updates
    onConnectionStatus: (callback) => {
        ipcRenderer.on('connection-status', (event, status) => callback(status));
    },
    
    // Listen for print queue updates
    onPrintQueueUpdated: (callback) => {
        ipcRenderer.on('print-queue-updated', (event, queue) => callback(queue));
    }
});
