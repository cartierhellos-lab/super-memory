
import mysql from 'mysql2/promise';

async function main() {
    const config = {
        host: 'localhost',
        port: 3307,
        user: 'root',
        password: '',
        database: 'massmail'
    };

    console.log("Starting Worker...");
    const conn = await mysql.createConnection(config);

    // Get available accounts
    const [accounts] = await conn.query("SELECT id, phone FROM accounts WHERE status = 'Ready'");
    if (accounts.length === 0) {
        console.error("No ready accounts found. Worker cannot send.");
        await conn.end();
        return;
    }
    console.log(`Found ${accounts.length} ready accounts.`);

    while (true) {
        // 1. Fetch Pending Tasks
        const [rows] = await conn.query(
            "SELECT id, target_phone, account_id FROM message_tasks WHERE status = 'Pending' LIMIT 10"
        );
        
        if (rows.length === 0) {
            console.log("No pending tasks. Waiting...");
            await new Promise(r => setTimeout(r, 2000));
            continue;
        }

        console.log(`Processing ${rows.length} tasks...`);

        for (const task of rows) {
            let accountId = task.account_id;
            let accountPhone = 'Unknown';

            // If task already has an assigned account, use it.
            // Otherwise pick a random one (fallback logic, though our new test script assigns it).
            if (accountId) {
                const acc = accounts.find(a => a.id === accountId);
                if (acc) {
                    accountPhone = acc.phone;
                }
            } else {
                const randomAcc = accounts[Math.floor(Math.random() * accounts.length)];
                accountId = randomAcc.id;
                accountPhone = randomAcc.phone;
            }
            
            console.log(`Sending to ${task.target_phone} via ${accountPhone}...`);
            
            // Simulate processing time
            await new Promise(r => setTimeout(r, 200));

            // Mark as Sent and Assign Account (if not already)
            await conn.query(
                "UPDATE message_tasks SET status = 'Sent', account_id = ?, processed_at = NOW(), completed_at = NOW() WHERE id = ?",
                [accountId, task.id]
            );
            console.log(`Task ${task.id} Sent via ${accountPhone}.`);
        }
    }
}

main().catch(console.error);
