// Initialize app
async function init() {
    await updateConnectionStatus();
    await updatePrinterStatus();
    await updatePrintQueue();

    // Update timestamp every second
    setInterval(updateTimestamp, 1000);

    // Update printer status every 10 seconds
    setInterval(updatePrinterStatus, 10000);

    // Listen for updates from main process
    window.electronAPI.onConnectionStatus((status) => {
        updateConnectionStatusUI(status.connected);
    });

    window.electronAPI.onPrintQueueUpdated((queue) => {
        renderPrintQueue(queue);
    });
}

async function updateConnectionStatus() {
    try {
        const status = await window.electronAPI.getConnectionStatus();
        updateConnectionStatusUI(status.connected);
    } catch (error) {
        console.error('Failed to update connection status:', error);
    }
}

function updateConnectionStatusUI(connected) {
    const statusDot = document.getElementById('statusDot');
    const connectionText = document.getElementById('connectionText');

    if (connected) {
        statusDot.style.background = '#4ade80';
        connectionText.textContent = 'Connected';
    } else {
        statusDot.style.background = '#f87171';
        connectionText.textContent = 'Disconnected';
    }
}

async function updatePrinterStatus() {
    try {
        const status = await window.electronAPI.getPrinterStatus();
        
        document.getElementById('printerName').textContent = status.name;
        const statusElement = document.getElementById('printerStatus');
        
        if (status.online) {
            statusElement.textContent = status.status;
            statusElement.className = 'status-ready';
        } else {
            statusElement.textContent = 'Offline';
            statusElement.className = 'status-offline';
        }
    } catch (error) {
        console.error('Failed to update printer status:', error);
    }
}

async function updatePrintQueue() {
    try {
        const queue = await window.electronAPI.getPrintQueue();
        renderPrintQueue(queue);
    } catch (error) {
        console.error('Failed to update print queue:', error);
    }
}

function renderPrintQueue(queue) {
    const queueElement = document.getElementById('printQueue');
    const queueCount = document.getElementById('queueCount');

    queueCount.textContent = `${queue.length} ${queue.length === 1 ? 'job' : 'jobs'}`;

    if (queue.length === 0) {
        queueElement.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <p>No pending print jobs</p>
                <small>Jobs will appear here when customers upload files</small>
            </div>
        `;
        return;
    }

    queueElement.innerHTML = queue.map(job => {
        const paymentBadge = job.paymentStatus === 'completed' 
            ? '<span class="badge badge-success">✓ Paid</span>'
            : '<span class="badge badge-warning">⏳ Awaiting Payment</span>';

        const statusBadge = getStatusBadge(job.status);

        const printButton = job.paymentStatus === 'completed' && job.status === 'pending'
            ? `<button class="btn-print" onclick="printJob('${job.id}')">🖨️ PRINT NOW</button>`
            : `<button class="btn-print" disabled>${getButtonText(job)}</button>`;

        return `
            <div class="print-job ${job.status}">
                <div class="job-header">
                    <div class="job-file">
                        <span class="file-icon">📄</span>
                        <span class="file-name">${job.fileName}</span>
                    </div>
                    <div class="job-badges">
                        ${paymentBadge}
                        ${statusBadge}
                    </div>
                </div>
                
                <div class="job-details">
                    <div class="detail-item">
                        <span class="detail-label">Copies:</span>
                        <span class="detail-value">${job.printOptions.copies}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Color:</span>
                        <span class="detail-value">${job.printOptions.colorMode === 'color' ? 'Color' : 'B&W'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Duplex:</span>
                        <span class="detail-value">${job.printOptions.duplex ? 'Yes' : 'No'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Paper:</span>
                        <span class="detail-value">${job.printOptions.paperSize}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Amount:</span>
                        <span class="detail-value amount">₹${(job.pricing.totalAmount / 100).toFixed(2)}</span>
                    </div>
                </div>

                <div class="job-actions">
                    ${printButton}
                </div>
            </div>
        `;
    }).join('');
}

function getStatusBadge(status) {
    const badges = {
        'pending': '<span class="badge badge-info">⏳ Pending</span>',
        'printing': '<span class="badge badge-primary">🖨️ Printing...</span>',
        'completed': '<span class="badge badge-success">✓ Completed</span>',
        'failed': '<span class="badge badge-error">✗ Failed</span>'
    };
    return badges[status] || '';
}

function getButtonText(job) {
    if (job.paymentStatus !== 'completed') {
        return '⏳ Awaiting Payment';
    }
    if (job.status === 'printing') {
        return '🖨️ Printing...';
    }
    if (job.status === 'completed') {
        return '✓ Completed';
    }
    if (job.status === 'failed') {
        return '✗ Failed';
    }
    return 'Print';
}

async function printJob(jobId) {
    try {
        const result = await window.electronAPI.printJob(jobId);
        
        if (result.success) {
            console.log('Print job started:', jobId);
        } else {
            alert(`Print failed: ${result.error}`);
        }
    } catch (error) {
        console.error('Print error:', error);
        alert('Failed to print. Please try again.');
    }
}

function updateTimestamp() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('timestamp').textContent = timeString;
}

// QR Code functions
async function showQRCode() {
    try {
        const result = await window.electronAPI.generateQRCode();
        
        if (result.success) {
            document.getElementById('qrCodeImage').src = result.qrCode;
            document.getElementById('customerUrl').textContent = result.url;
            document.getElementById('qrModal').classList.add('active');
        } else {
            alert('Failed to generate QR code: ' + result.error);
        }
    } catch (error) {
        console.error('QR code error:', error);
        alert('Failed to generate QR code');
    }
}

function closeQRModal() {
    document.getElementById('qrModal').classList.remove('active');
}

async function copyURL() {
    const url = document.getElementById('customerUrl').textContent;
    try {
        await navigator.clipboard.writeText(url);
        const btn = document.querySelector('.btn-copy');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span>✓</span><span>Copied!</span>';
        setTimeout(() => {
            btn.innerHTML = originalText;
        }, 2000);
    } catch (error) {
        console.error('Copy failed:', error);
        alert('Failed to copy URL');
    }
}

// Close modal on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeQRModal();
    }
});

// Close modal on background click
document.getElementById('qrModal').addEventListener('click', (e) => {
    if (e.target.id === 'qrModal') {
        closeQRModal();
    }
});

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
