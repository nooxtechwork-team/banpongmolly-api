/**
 * กวาดลบ log / job เก่าแบบ batch (ปลอดภัยกับตารางใหญ่)
 *
 * เหมาะกับ Coolify cron รายวัน เช่น 03:15
 *
 *   node dist/scripts/purge-old-logs.js
 *   # หรือตอนพัฒนา:
 *   pnpm run script:purge-old-logs
 *
 * Env (optional):
 *   DRY_RUN=1                         — นับอย่างเดียว ไม่ลบ
 *   PURGE_BATCH_SIZE=5000             — ลบทีละกี่แถว (default 5000)
 *   ACCESS_LOG_RETENTION_DAYS=14
 *   LOGIN_LOG_RETENTION_DAYS=90
 *   USER_ACTION_LOG_RETENTION_DAYS=180
 *   PRINT_JOB_RETENTION_DAYS=30       — เฉพาะ done/failed/cancelled
 *   CHECKOUT_EVENT_RETENTION_DAYS=90  — event ของ ticket ที่จบแล้วเท่านั้น
 *   AUDIT_LOG_RETENTION_DAYS=0        — default 0 = ไม่ลบ (เก็บยาว)
 *   PURGE_OPTIMIZE=1                  — OPTIMIZE TABLE หลังลบ (ระวัง lock)
 *
 * ใช้ DATABASE_HOST / PORT / USERNAME / PASSWORD / NAME เหมือน API
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import mysql, {
  type Pool,
  type RowDataPacket,
  type ResultSetHeader,
} from 'mysql2/promise';

type Target = {
  name: string;
  days: number;
  countSql: string;
  selectIdsSql: string;
};

function loadLocalEnv(): void {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function cutoffDate(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function buildTargets(): Target[] {
  const targets: Target[] = [];

  const accessDays = envInt('ACCESS_LOG_RETENTION_DAYS', 14);
  if (accessDays > 0) {
    targets.push({
      name: 'access_logs',
      days: accessDays,
      countSql: 'SELECT COUNT(*) AS cnt FROM access_logs WHERE created_at < ?',
      selectIdsSql:
        'SELECT id FROM access_logs WHERE created_at < ? ORDER BY id ASC LIMIT ?',
    });
  }

  const loginDays = envInt('LOGIN_LOG_RETENTION_DAYS', 90);
  if (loginDays > 0) {
    targets.push({
      name: 'login_logs',
      days: loginDays,
      countSql: 'SELECT COUNT(*) AS cnt FROM login_logs WHERE created_at < ?',
      selectIdsSql:
        'SELECT id FROM login_logs WHERE created_at < ? ORDER BY id ASC LIMIT ?',
    });
  }

  const userActionDays = envInt('USER_ACTION_LOG_RETENTION_DAYS', 180);
  if (userActionDays > 0) {
    targets.push({
      name: 'user_action_logs',
      days: userActionDays,
      countSql:
        'SELECT COUNT(*) AS cnt FROM user_action_logs WHERE created_at < ?',
      selectIdsSql:
        'SELECT id FROM user_action_logs WHERE created_at < ? ORDER BY id ASC LIMIT ?',
    });
  }

  const auditDays = envInt('AUDIT_LOG_RETENTION_DAYS', 0);
  if (auditDays > 0) {
    targets.push({
      name: 'audit_logs',
      days: auditDays,
      countSql: 'SELECT COUNT(*) AS cnt FROM audit_logs WHERE created_at < ?',
      selectIdsSql:
        'SELECT id FROM audit_logs WHERE created_at < ? ORDER BY id ASC LIMIT ?',
    });
  }

  const printDays = envInt('PRINT_JOB_RETENTION_DAYS', 30);
  if (printDays > 0) {
    targets.push({
      name: 'print_jobs',
      days: printDays,
      countSql: `SELECT COUNT(*) AS cnt FROM print_jobs
        WHERE status IN ('done','failed','cancelled') AND created_at < ?`,
      selectIdsSql: `SELECT id FROM print_jobs
        WHERE status IN ('done','failed','cancelled') AND created_at < ?
        ORDER BY id ASC LIMIT ?`,
    });
  }

  const eventDays = envInt('CHECKOUT_EVENT_RETENTION_DAYS', 90);
  if (eventDays > 0) {
    targets.push({
      name: 'checkout_ticket_events',
      days: eventDays,
      countSql: `SELECT COUNT(*) AS cnt FROM checkout_ticket_events e
        INNER JOIN checkout_tickets t ON t.id = e.ticket_id
        WHERE t.status IN ('complete','cancelled') AND e.created_at < ?`,
      selectIdsSql: `SELECT e.id AS id FROM checkout_ticket_events e
        INNER JOIN checkout_tickets t ON t.id = e.ticket_id
        WHERE t.status IN ('complete','cancelled') AND e.created_at < ?
        ORDER BY e.id ASC LIMIT ?`,
    });
  }

  return targets;
}

async function purgeTarget(
  pool: Pool,
  target: Target,
  batchSize: number,
  dryRun: boolean,
): Promise<{ deleted: number; batches: number }> {
  const cutoff = cutoffDate(target.days);

  if (dryRun) {
    const [rows] = await pool.query<RowDataPacket[]>(target.countSql, [cutoff]);
    return { deleted: Number(rows[0]?.cnt ?? 0), batches: 0 };
  }

  let deleted = 0;
  let batches = 0;

  for (;;) {
    const [rows] = await pool.query<RowDataPacket[]>(target.selectIdsSql, [
      cutoff,
      batchSize,
    ]);
    if (!rows.length) break;

    const ids = rows
      .map((r) => Number(r.id))
      .filter((id) => Number.isFinite(id) && id > 0);
    if (!ids.length) break;

    const placeholders = ids.map(() => '?').join(',');
    const [result] = await pool.query<ResultSetHeader>(
      `DELETE FROM \`${target.name}\` WHERE id IN (${placeholders})`,
      ids,
    );
    deleted += result.affectedRows ?? 0;
    batches += 1;

    if (ids.length < batchSize) break;
  }

  return { deleted, batches };
}

async function main(): Promise<void> {
  loadLocalEnv();

  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
  const batchSize = Math.max(100, envInt('PURGE_BATCH_SIZE', 5000));
  const optimize = process.env.PURGE_OPTIMIZE === '1';
  const targets = buildTargets();

  const host = process.env.DATABASE_HOST;
  const user = process.env.DATABASE_USERNAME;
  const password = process.env.DATABASE_PASSWORD;
  const database = process.env.DATABASE_NAME;
  const port = envInt('DATABASE_PORT', 3306);

  if (!host || !user || !database) {
    throw new Error(
      'Missing DATABASE_HOST / DATABASE_USERNAME / DATABASE_NAME',
    );
  }

  console.log(
    `[purge-old-logs] start dryRun=${dryRun} batchSize=${batchSize} targets=${targets.map((t) => `${t.name}:${t.days}d`).join(',') || '(none)'}`,
  );

  const pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 2,
    timezone: 'Z',
  });

  try {
    let total = 0;
    for (const target of targets) {
      const started = Date.now();
      const { deleted, batches } = await purgeTarget(
        pool,
        target,
        batchSize,
        dryRun,
      );
      total += deleted;
      console.log(
        `[purge-old-logs] ${target.name} retention=${target.days}d ` +
          `${dryRun ? 'would_delete' : 'deleted'}=${deleted} batches=${batches} ` +
          `ms=${Date.now() - started}`,
      );

      if (optimize && !dryRun && deleted > 0) {
        console.log(`[purge-old-logs] OPTIMIZE TABLE ${target.name} …`);
        await pool.query(`OPTIMIZE TABLE \`${target.name}\``);
      }
    }
    console.log(
      `[purge-old-logs] done total_${dryRun ? 'would_delete' : 'deleted'}=${total}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[purge-old-logs] failed', err);
  process.exit(1);
});
