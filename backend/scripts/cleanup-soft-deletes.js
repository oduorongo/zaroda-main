const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const results = await client.query(
    `DELETE FROM assessment_results WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'`
  );
  const exams = await client.query(
    `DELETE FROM exams WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days'`
  );

  console.log(`Purged ${results.rowCount} assessment_results rows`);
  console.log(`Purged ${exams.rowCount} exams rows`);

  await client.end();
}

main().catch((err) => {
  console.error('Cleanup job failed:', err);
  process.exit(1);
});
