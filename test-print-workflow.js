// Test script to verify the print workflow
const fetch = require('node-fetch');

async function testPrintWorkflow() {
    console.log('🧪 Testing Print Workflow...\n');

    const sessionId = 'test-session-' + Date.now();
    const baseUrl = 'http://localhost:3001';

    try {
        // Step 1: Create a session (simulate mobile upload)
        console.log('1️⃣ Creating session...');
        const sessionResponse = await fetch(`${baseUrl}/api/sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId,
                shopId: 'shop001'
            })
        });

        if (!sessionResponse.ok) {
            throw new Error(`Session creation failed: ${sessionResponse.status}`);
        }

        console.log('✅ Session created successfully');

        // Step 2: Simulate file upload
        console.log('\n2️⃣ Simulating file upload...');
        const uploadResponse = await fetch(`${baseUrl}/api/sessions/${sessionId}/upload`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fileName: 'test-document.pdf',
                fileSize: 1024000,
                mimeType: 'application/pdf'
            })
        });

        if (!uploadResponse.ok) {
            throw new Error(`File upload failed: ${uploadResponse.status}`);
        }

        console.log('✅ File upload simulated successfully');

        // Step 3: Create print job
        console.log('\n3️⃣ Creating print job...');
        const printJobResponse = await fetch(`${baseUrl}/api/print-jobs/${sessionId}/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                printOptions: {
                    copies: 1,
                    colorMode: 'bw',
                    duplex: false,
                    paperSize: 'A4'
                },
                transactionId: 'test-transaction-' + Date.now(),
                files: ['test-document.pdf']
            })
        });

        if (!printJobResponse.ok) {
            throw new Error(`Print job creation failed: ${printJobResponse.status}`);
        }

        const printJobData = await printJobResponse.json();
        console.log('✅ Print job created:', printJobData);

        // Step 4: Check if job appears in pending jobs
        console.log('\n4️⃣ Checking pending jobs...');
        const pendingJobsResponse = await fetch(`${baseUrl}/api/print-jobs/test/${sessionId}/pending`);

        if (!pendingJobsResponse.ok) {
            throw new Error(`Pending jobs fetch failed: ${pendingJobsResponse.status}`);
        }

        const pendingJobsData = await pendingJobsResponse.json();
        console.log('✅ Pending jobs retrieved:', pendingJobsData);

        if (pendingJobsData.success && pendingJobsData.data.length > 0) {
            console.log('\n🎉 SUCCESS: Print job appears in dashboard!');
            console.log(`Found ${pendingJobsData.data.length} pending job(s)`);

            // Display job details
            pendingJobsData.data.forEach((job, index) => {
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
        if (pendingJobsData.success && pendingJobsData.data.length > 0) {
            const jobId = pendingJobsData.data[0].jobId;
            console.log(`\n5️⃣ Testing job execution for job ${jobId}...`);

            const executeResponse = await fetch(`${baseUrl}/api/print-jobs/${sessionId}/execute/${jobId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (executeResponse.ok) {
                const executeData = await executeResponse.json();
                console.log('✅ Job execution initiated:', executeData);
                console.log('🏗️ This should create a sandbox on your PC for secure printing');
            } else {
                console.log('⚠️ Job execution failed (this is expected if Local Agent is not running)');
            }
        }

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
    }
}

// Run the test
testPrintWorkflow();