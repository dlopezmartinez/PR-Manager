# Sistema de Logging - PR Manager Backend

## Resumen

El backend utiliza **Winston** con rotación automática de logs, sin dependencias de servicios externos.

## Archivos de Log (Producción)

| Archivo | Contenido | Retención | Max Size |
|---------|-----------|-----------|----------|
| `logs/error-YYYY-MM-DD.log` | Solo errores | 14 días | 20MB |
| `logs/combined-YYYY-MM-DD.log` | Todos los logs | 14 días | 50MB |
| `logs/http-YYYY-MM-DD.log` | Requests HTTP | 7 días | 50MB |

Los logs antiguos se comprimen automáticamente a `.gz`.

## Consultar Logs

### Ver logs en tiempo real

```bash
# Errores
tail -f logs/error-$(date +%Y-%m-%d).log

# Todos los logs
tail -f logs/combined-$(date +%Y-%m-%d).log

# Requests HTTP
tail -f logs/http-$(date +%Y-%m-%d).log
```

### Buscar información específica

```bash
# Buscar por usuario
grep "userId.*abc123" logs/combined-*.log

# Buscar por request ID
grep "requestId.*550e8400-e29b" logs/combined-*.log

# Buscar errores de un endpoint
grep "/auth/login" logs/error-*.log
```

### Análisis con jq (JSON)

```bash
# Solo errores
cat logs/combined-*.log | jq 'select(.level=="error")'

# Requests lentas (>1000ms)
cat logs/http-*.log | jq 'select(.duration > 1000)'

# Errores de las últimas 24h
cat logs/error-$(date +%Y-%m-%d).log | jq '.'

# Contar requests por endpoint
cat logs/http-*.log | jq -r '.path' | sort | uniq -c | sort -rn

# Errores agrupados por mensaje
cat logs/error-*.log | jq -r '.message' | sort | uniq -c | sort -rn
```

## Formato de Log

Cada línea es un objeto JSON:

```json
{
  "level": "http",
  "message": "POST /auth/login 200 145ms",
  "timestamp": "2026-01-23 14:30:45.123",
  "service": "pr-manager-backend",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "method": "POST",
  "path": "/auth/login",
  "statusCode": 200,
  "duration": 145,
  "ip": "192.168.1.1",
  "userId": "user_abc123"
}
```

## Niveles de Log

| Nivel | Cuándo usar | Ejemplo |
|-------|-------------|---------|
| `error` | Errores que requieren atención | Fallo de pago, error de DB |
| `warn` | Advertencias (se recuperó) | Rate limit cercano, retry exitoso |
| `info` | Eventos informativos | Signup, login, subscription created |
| `http` | Requests HTTP | GET /api/users 200 45ms |
| `debug` | Debugging detallado | Cache hit, query executed |

## Request ID

Cada request recibe un UUID único disponible en:

1. **Header de respuesta**: `X-Request-ID`
2. **Logs**: campo `requestId`

### Uso para debugging

Si un usuario reporta un error:

1. Pídele el Request ID del header
2. Busca en los logs:
   ```bash
   grep "550e8400-e29b" logs/combined-*.log
   ```

## Variables de Entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Nivel mínimo de log |
| `LOGS_DIR` | `logs` | Directorio de logs |
| `NODE_ENV` | - | Si es `production`, activa archivos |

### Niveles disponibles (de más a menos verbose)

```
debug → http → info → warn → error
```

Ejemplo: `LOG_LEVEL=debug` muestra todo, `LOG_LEVEL=error` solo errores.

## Uso en Código

```typescript
import logger from './lib/logger.js';

// Error con contexto
logger.error('Failed to process payment', {
  userId: '123',
  error: err.message,
  stack: err.stack,
});

// Warning
logger.warn('Rate limit approaching', {
  userId: '123',
  currentRate: 95,
  limit: 100,
});

// Info
logger.info('User signed up', {
  userId: '123',
  email: 'user@example.com',
});

// Debug
logger.debug('Cache hit', { key: 'user:123' });
```

## Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                     Request                              │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│              requestLogger Middleware                    │
│  - Genera requestId                                      │
│  - Inicia timer                                          │
│  - Añade X-Request-ID header                             │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                   Route Handlers                         │
│  - Procesan la request                                   │
│  - Pueden usar logger.info(), logger.error(), etc.       │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│              res.on('finish')                            │
│  - Calcula duración                                      │
│  - Log HTTP con método, path, status, duration           │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│                  Winston Logger                          │
├─────────────────────────────────────────────────────────┤
│  Transports:                                             │
│  ├── Console (siempre, colorizado en dev)                │
│  ├── error-YYYY-MM-DD.log (solo errores)                 │
│  ├── combined-YYYY-MM-DD.log (todos)                     │
│  └── http-YYYY-MM-DD.log (solo HTTP)                     │
└─────────────────────────────────────────────────────────┘
```

## Rotación de Logs

La rotación es automática con `winston-daily-rotate-file`:

- **Diaria**: Nuevo archivo cada día
- **Por tamaño**: Si supera maxSize, rota aunque no haya cambiado el día
- **Compresión**: Logs antiguos se comprimen a `.gz`
- **Limpieza**: Logs más antiguos que maxFiles se eliminan

## Troubleshooting

### Los logs no se crean

1. Verifica que `NODE_ENV=production`
2. Verifica permisos de escritura en `LOGS_DIR`
3. Verifica que el directorio existe

### Logs muy grandes

Ajusta en `src/lib/logger.ts`:
- `maxSize`: Tamaño máximo por archivo
- `maxFiles`: Días de retención

### Demasiado ruido en logs

Ajusta `LOG_LEVEL` en variables de entorno:
```bash
LOG_LEVEL=warn  # Solo warn y error
LOG_LEVEL=error # Solo errores
```
