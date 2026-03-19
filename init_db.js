import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  user: 'postgres',
  password: '[Minhnhan2710]',
  host: 'db.jczdnlydozcftvnqnixt.supabase.co',
  port: 5432,
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to Supabase PostgreSQL.");
    await client.query(`
      CREATE TABLE IF NOT EXISTS cloud_storage (
        id text PRIMARY KEY,
        data jsonb,
        updated_at timestamp DEFAULT NOW()
      );
    `);
    console.log("Table cloud_storage created successfully!");
  } catch (err) {
    console.error("Error creating table:", err);
  } finally {
    await client.end();
  }
}

run();
