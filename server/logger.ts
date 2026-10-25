type Level = 'info' | 'warn' | 'error';

function write(level: Level, msg: string, extra?: Record<string, unknown>): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...extra });
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, extra?: Record<string, unknown>) => write('info', msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => write('warn', msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => write('error', msg, extra),
};
