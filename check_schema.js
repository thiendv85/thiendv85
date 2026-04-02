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
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'profiles' AND table_schema = 'public';
    `);
    console.log("Columns in 'profiles':", res.rows);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

run();
