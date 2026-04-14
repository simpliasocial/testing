# Manual de Operación - SimpliaLeads Dashboard 🚀

Este documento detalla cómo montar, configurar, operar y escalar el sistema de monitoreo conversacional de Simplia orientado a integraciones Chatwoot-Supabase.

---

## 1. Guía de Despliegue de un Nuevo Cliente/Entorno (Para Agentes MCP)

Si eres un **Agente IA/MCP**, sigue estrictamente estos pasos para establecer este entorno en una cuenta de Supabase desde cero:

### Paso 1: Configurar las Variables de Entorno (Vault/Secrets)
La sincronización perióda desde Chatwoot y la consulta desde el Dashboard requiere que estos 4 secretos existan en Supabase (o archivo `.env`):
- `VITE_SUPABASE_URL`: URL del nuevo proyecto (Ej. `https://xyz.supabase.co`)
- `VITE_SUPABASE_ANON_KEY`: Token público para el Dashboard. Debe agregarse un `SERVICE_ROLE_KEY` en los secretos de la Edge Function para tener privilegios totales de escritura.
- `VITE_CHATWOOT_BASE_URL`: El host del contact center (Ej. `https://app.chatwoot.com` o self-hosted).
- `VITE_CHATWOOT_API_TOKEN`: Access Token del Administrador.
- `VITE_CHATWOOT_ACCOUNT_ID`: El ID de la cuenta en Chatwoot a consultar.

### Paso 2: Creación del Esquema y Privilegios
Debes ejecutar scripts SQL para forzar la creación del esquema `cw`:
```sql
CREATE SCHEMA IF NOT EXISTS cw;
-- Recomendación: Crear las tablas según el Manual de Arquitectura.
```

### Paso 3: Activar Extensiones Supabase Obligatorias
El proyecto dependerá de un CRON interno y reportes por red:
Debes instalar/habilitar las extensiones `pg_cron` o `pg_net` en la plataforma (O vía SQL `CREATE EXTENSION pg_cron; CREATE EXTENSION pg_net;`).

### Paso 4: Despliegue de la Edge Function 
- **Ruta de código fuente:** `supabase/functions/chatwoot-sync/index.ts`
- **Comando de Despliegue CLI:** `npx supabase functions deploy chatwoot-sync`
Asegúrate de inyectar las variables de entorno del Paso 1 al hacer el deploy para que el backend reconozca a Chatwoot.

### Paso 5: Programación del CRON (Piloto Automático)
Para ingestar los datos de forma programada y evadir los límites temporales de Chatwoot:
```sql
SELECT cron.schedule('sync-diario-chatwoot', '1 0 * * *', $$ 
  select net.http_post(
    url:='https://TU-PROYECTO.supabase.co/functions/v1/chatwoot-sync',
    headers:=jsonb_build_object(
        'Content-Type', 'application/json', 
        'Authorization', 'Bearer TU_SERVICE_ROLE_KEY_O_ANON_KEY'
    )
  );
$$);
```
*(Nota: El CRON se ejecutará a las 12:01 AM)*

---

## 2. Reglas de Operación del Dashboard de Tendencias (KPIs Duros)

Actualmente, este dashboard central está mapeado contra métricas de V1. El cálculo en React sobre el frontend está sincronizado en el módulo `HistoricalTrendLayer.tsx` con estas definiciones.  Cualquier alteración a estos SLAs afectará al renderizado histórico:

### A. KPIs de Capacidad (Volumen Operativo)
- **Citas/Ventas:** Solo se computan si la oportunidad fue rotulada con: `cita`, `venta`, `booking`, `cita_agendada` o `venta_exitosa`. 
- **Backlog:** Toda oportunidad que **NO** tiene el status en `resolved`.
- **Perdidos:** Todo lead descartado mediante etiquetas `perdido`, `descartado`, `spam`.

### B. Eficacia de Conversión (Tasas Lineales)
- **Tasa Contacto (> 0):** Mide que el Agente ya le respondió al usuario.
- **Tasa de Interés:** De todos los contactados, cuántos continúan el flujo sin ser rotulados como spam.
- **Goal del 20%:** La línea segmentada verde del gráfico de embudo, establece la alerta visual si la cuenta está debajo del 20% de Cierres (Agendamientos / Total Leads).

### C. Eficiencia de Servicio (SLA = 15/30 Min)
- **Cumplimiento SLA (%):** Chatwoot provee la métrica pasiva `first_reply_created_at`. El Frontend mide la diferencia entre eso y `created_at_chatwoot`. El sistema considera como "Breach" u oportunidad caducada si el agente toma **más de 30 minutos reales en responder**. 
- **Mediana vs Promedio:** Se ignora el promedio para evitar falsos positivos por chats de fines de semana. Toda analítica de servicio se basa en Medianas de Tiempo de Respuesta en Minutos.

---

## 3. Resolución de Problemas (Troubleshooting Activo)

### Falla en "Tendencia de Negocio" (Volumen plano o cortado)
- **Causa común:** El Sync_Cursor de Supabase detuvo la recolección o Chatwoot cortó el token por Rate Limit.
- **Solución Manual MCP:** Ejecuta un cURL POST a `https://[ID].supabase.co/functions/v1/chatwoot-sync` para regenerar la información de ese día manualmente.

### Falla en Filtros de "Canal" (Tiktok vs Telegram vs Otros)
- **Protocolo de Corrección:** Actualizar en `cw.conversations_current` la columna `canal` si está nula o si el inbox no le proveyó nombre.
```sql
UPDATE cw.conversations_current 
SET canal = 'TIKTOK' 
WHERE canal IS NULL AND source_id LIKE '%tkk%';
```

## 4. Notas Clave para Mantener el Repositorio 
- **Código UI:** El layout y los KPIs referenciados arriba viven centralizados en `src/pages/layers/HistoricalTrendLayer.tsx`. No extraigas las etiquetas ni reescribas los cálculos sin validarlo simultáneamente con Marketing.
