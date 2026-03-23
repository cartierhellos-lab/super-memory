import mysql from 'mysql2/promise';
import crypto from 'crypto';

const ENC_KEY = '12345678901234567890123456789012'; // Default key from worker

function encrypt(text: string): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENC_KEY), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    port: 3307,
    user: 'massmail',
    password: 'massmailPassword',
    database: 'massmail'
  });

  console.log('Connected to DB');

  // 1. Create 5 Accounts
  const accountIds = [];
  for (let i = 1; i <= 5; i++) {
    const phone = `555000000${i}`;
    // Check if exists
    const [rows]: any = await conn.query('SELECT id FROM accounts WHERE phone = ?', [phone]);
    let accId;
    if (rows.length > 0) {
      accId = rows[0].id;
      // Reset status to Ready
      await conn.query("UPDATE accounts SET status='Ready' WHERE id=?", [accId]);
    } else {
      const token = encrypt('dummy_token');
      const [res]: any = await conn.query(
        "INSERT INTO accounts (phone, status, token_cipher, system_type, created_at) VALUES (?, 'Ready', ?, 'TextNow', NOW())",
        [phone, token]
      );
      accId = res.insertId;
    }
    accountIds.push({ id: accId, phone });
    console.log(`Account ${phone} ready (ID: ${accId})`);
  }

  // 2. Generate Tasks
  console.log('Generating tasks...');
  let taskCount = 0;
  for (const sender of accountIds) {
    for (const receiver of accountIds) {
      if (sender.id === receiver.id) continue;

      // 2 Texts
      for (let k = 1; k <= 2; k++) {
        await conn.query(
          "INSERT INTO message_tasks (account_id, target_phone, content, status, created_at) VALUES (?, ?, ?, 'Pending', NOW())",
          [sender.id, receiver.phone, `Test SMS ${k} from ${sender.phone} to ${receiver.phone}`]
        );
        taskCount++;
      }

      // 2 Images
      for (let k = 1; k <= 2; k++) {
        await conn.query(
          "INSERT INTO message_tasks (account_id, target_phone, content, media_url, status, created_at) VALUES (?, ?, ?, ?, 'Pending', NOW())",
          [sender.id, receiver.phone, `Test Image ${k}`, `https://via.placeholder.com/150?text=Img${k}_${sender.phone}`]
        );
        taskCount++;
      }
    }
  }

  console.log(`Created ${taskCount} tasks.`);
  await conn.end();
}

main().catch(console.error);
