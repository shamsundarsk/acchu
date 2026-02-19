// Test script to verify the print workflow (no external dependencies)
const https = require('https');
const http = require('http');

function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? https : http;

        const req = client.request({
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    resolve({
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        status: res.statusCode,
                        data: jsonData
                    });
                } catch (e) {
                    resolve({
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        status: res.statusCode,
                        data
                    });
                }
            });
        });

        req.on('error', reject);

        if (options.body) {
            req.write(JSON.stringify(options.body));
        }

        req.end();
    });
}

async function testPrintWorkflow() {
    console.log('🧪 Testing Print Workflow...\n');

    const sessionId = 'test-session-' + Date.now();
    const baseUrl = 'http://localhost:3001';

    try {
        // Step 1: Create a session (simulate mobile upload)
        console.log('1️⃣ Creating session...');
        const sessionResponse = await makeRequest(`${baseUrl}/api/sessions`, {
            method: 'POST',
            body: {
                sessionId,
                shopId: 'shop001'
            }
        });

        if (!sessionResponse.ok) {
            throw new Error(`Session creation failed: ${sessionResponse.status}`);
        }

        console.log('✅ Session created successfully');

        // Step 2: Simulate file upload
        console.log('\n2️⃣ Simulating file upload...');
        const uploadResponse = await makeRequest(`${baseUrl}/api/sessions/${sessionId}/upload`, {
            method: 'POST',
            body: {
                fileName: 'test-document.pdf',
                fileSize: 1024000,
                mimeType: 'application/pdf'
            }
        });

        if (!uploadResponse.ok) {
            throw new Error(`File upload failed: ${uploadResponse.status}`);
        }

        console.log('✅ File upload simulated successfully');

        // Step 3: Create print job
        console.log('\n3️⃣ Creating print job...');
        const printJobResponse = await makeRequest(`${baseUrl}/api/print-jobs/${sessionId}/create`, {
            method: 'POST',
            body: {
                printOptions: {
                    copies: 1,
                    colorMode: 'bw',
                    duplex: false,
                    paperSize: 'A4'
                },
                transactionId: 'test-transaction-' + Date.now(),
                files: ['test-document.pdf']
            }
        });

        if (!printJobResponse.ok) {
            throw new Error(`Print job creation failed: ${printJobResponse.status}`);
        }

        console.log('✅ Print job created:', printJobResponse.data);

        // Step 4: Check if job appears in pending jobs
        console.log('\n4️⃣ Checking pending jobs...');
        const pendingJobsResponse = await makeRequest(`${baseUrl}/api/print-jobs/test/${sessionId}/pending`);

        if (!pendingJobsResponse.ok) {
            throw new Error(`Pending jobs fetch failed: ${pendingJobsResponse.status}`);
        }

        console.log('✅ Pending jobs retrieved:', pendingJobsResponse.data);

        if (pendingJobsResponse.data.success && pendingJobsResponse.data.data.length > 0) {
            console.log('\n🎉 SUCCESS: Print job appears in dashboard!');
            console.log(`Found ${pendingJobsResponse.data.data.length} pending job(s)`);

            // Display job details
            pendingJobsResponse.data.data.forEach((job, index) => {
                console.log(`\nJob ${index + 1}:`);
                console.log(`  - ID: ${job.jobId}`);
                console.log(`  - Files: ${job.files}`);
                console.log(`  - Status: ${job.status}`);
                console.log(`  - Options: ${JSON.stringify(job.options)}`);
            });
        } else {
            console.log('\n❌ ISSUE: No pending jobs found in dashboard');
        }

        // Step 5: Test job execution (this would trigger sandbox creation)
        if (pendingJobsResponse.data.success && pendingJobsResponse.data.data.length > 0) {
            const jobId = pendingJobsResponse.data.data[0].jobId;
            console.log(`\n5️⃣ Testing job execution for job ${jobId}...`);

            const executeResponse = await makeRequest(`${baseUrl}/api/print-jobs/${sessionId}/execute/${jobId}`, {
                method: 'POST'
            });

            if (executeResponse.ok) {
                console.log('✅ Job execution initiated:', executeResponse.data);
                console.log('🏗️ This should create a sandbox on your PC for secure printing');
            } else {
                console.log('⚠️ Job execution failed (this is expected if Local Agent is not running)');
            }
        }

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.log('\n💡 Make sure the customer system server is running on port 3001');
        console.log('   Run: cd acchu-mobile-fork/packages/customer-system && npm run dev');
    }
}

// Run the test
testPrintWorkflow();