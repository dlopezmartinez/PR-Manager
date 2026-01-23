import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const logLevel = process.env.LOG_LEVEL || 'info';
const logsDir = process.env.LOGS_DIR || 'logs';

const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const { service, ...rest } = meta;
    let metaStr = '';

    if (Object.keys(rest).length > 0) {
      const formatted = Object.entries(rest)
        .map(([key, value]) => {
          if (typeof value === 'object') {
            return `${key}=${JSON.stringify(value)}`;
          }
          return `${key}=${value}`;
        })
        .join(' ');
      metaStr = ` | ${formatted}`;
    }

    return `${timestamp} [${level}] ${message}${metaStr}`;
  })
);

const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  defaultMeta: { service: 'pr-manager-backend' },
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
});

if (process.env.NODE_ENV === 'production') {
  logger.add(
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
      format: logFormat,
    })
  );

  logger.add(
    new DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '50m',
      maxFiles: '14d',
      zippedArchive: true,
      format: logFormat,
    })
  );

  logger.add(
    new DailyRotateFile({
      filename: path.join(logsDir, 'http-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'http',
      maxSize: '50m',
      maxFiles: '7d',
      zippedArchive: true,
      format: logFormat,
    })
  );

  logger.info('Logger initialized with file rotation', {
    logsDir,
    retention: '14 days',
    zippedArchive: true,
  });
}

export default logger;

export function createChildLogger(meta: Record<string, unknown>) {
  return logger.child(meta);
}

export function logError(message: string, error: Error, meta?: Record<string, unknown>) {
  logger.error(message, {
    error: error.message,
    stack: error.stack,
    name: error.name,
    ...meta,
  });
}
