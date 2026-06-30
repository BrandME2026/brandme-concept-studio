# BrandMe — Filosofía y arquitectura del backend

> ⚠️ **Honestidad técnica:** el stack es **Next.js**, NO NestJS. **No usamos NestJS** (ni su
> runtime ni sus paquetes). Lo que adoptamos es su **filosofía y sus patrones** — modularidad,
> inyección de dependencias, separación en capas y organización por dominio — implementados con
> TypeScript plano dentro de Next.js. Si alguien pregunta "¿usamos NestJS?", la respuesta es
> **no: seguimos su filosofía**.

## Por qué esta filosofía

El backend de BrandMe es grande (18 agentes, 10+ integraciones, multi-tenant). Sin estructura se
vuelve inmantenible. NestJS resuelve esto con principios probados que aquí replicamos:

1. **Organización por dominio (feature modules), no por capa técnica.**
2. **Inyección de dependencias** (constructor injection) para desacoplar y testear.
3. **Separación en capas:** Controller → Service → Repository.
4. **Repository pattern** para abstraer el acceso a datos (Drizzle) y poder mockearlo.
5. **DTOs + validación** en los bordes (entrada/salida).
6. **Manejo de errores centralizado** y excepciones tipadas.
7. **Arquitectura orientada a eventos** para desacoplar (encaja con Trigger.dev).

## Cómo se traduce a Next.js (sin NestJS)

| Concepto NestJS | Equivalente en BrandMe (Next.js) |
|-----------------|----------------------------------|
| **Module** (`@Module`) | Carpeta de dominio en `src/modules/<dominio>/` que agrupa todo lo suyo |
| **Controller** (`@Controller`) | Route Handlers de Next (`src/app/api/.../route.ts`) — finos, solo orquestan |
| **Service** (`@Injectable`) | Clase `*.service.ts` con la lógica de negocio del dominio |
| **Repository** | Clase `*.repository.ts` que encapsula queries `pg` (objetivo: vía `withTenant`) |
| **DTO** (`class-validator`) | Esquemas **Zod** + tipos inferidos (`*.dto.ts`) |
| **Pipe** (validación) | Validar el input con Zod al inicio del handler |
| **Guard** (auth) | Middleware / helper de **Firebase Auth** que protege el handler |
| **Exception filter** | Helper central que mapea errores de dominio → respuesta HTTP `{ success, error }` |
| **Interceptor** | Wrappers de logging/telemetría (objetivo: Sentry) alrededor del handler |
| **Provider / DI** | Inyección por **constructor**: el service recibe su repository, no lo importa global |
| **Event emitter** | Eventos de dominio (objetivo: despachados a un job runner tipo Trigger.dev) |

> No introducimos un contenedor de DI pesado. La "inyección" es **constructor injection manual**:
> cada clase recibe sus dependencias por constructor (testeable, sin singletons globales ocultos).

## Estructura propuesta (por dominio)

```
src/
  modules/
    leads/
      leads.service.ts        # lógica de negocio (scoring, dedup, nurture trigger)
      leads.repository.ts     # queries Drizzle vía withTenant()
      leads.dto.ts            # esquemas Zod de entrada/salida
      leads.events.ts         # eventos de dominio (lead.created, lead.qualified)
      __tests__/
    brands/
    knowledge-vault/
    pipeline/
    ...
  providers/                  # ⭐ proveedores externos intercambiables (ports & adapters)
    llm/
      llm.port.ts             # INTERFAZ (puerto): lo que el negocio espera de un LLM
      openrouter.adapter.ts   # adaptador OpenRouter (default)
      anthropic.adapter.ts    # adaptador Anthropic directo (futuro)
      index.ts                # factory: elige el adapter por env (LLM_PROVIDER)
    embeddings/               # embeddings.port.ts + openrouter-qwen / openai adapters + factory
    email/                    # email.port.ts + resend.adapter.ts + ...
    sms/                      # sms.port.ts + twilio.adapter.ts + ...
    storage/                  # storage.port.ts + r2.adapter.ts + ...
    scraping/                 # scraping.port.ts + firecrawl.adapter.ts + ...
    seo/                      # seo.port.ts + dataforseo.adapter.ts + ...
    enrichment/               # enrichment.port.ts + peopledatalabs / exa adapters + ...
    payments/                 # payments.port.ts + stripe.adapter.ts + ...
    auth/                     # auth.port.ts + clerk.adapter.ts + ...
  agents/                     # ⭐ los 18 agentes, enchufables vía registry
    agent.port.ts             # INTERFAZ común: run(input, ctx) => result
    registry.ts               # registro: id de agente -> implementación
    brand-extraction/         # agent 02 (usa providers/scraping + llm)
    knowledge-vault/          # agent 03 (usa providers/embeddings)
    lead-scoring/             # agent 07
    ...
  skills/                     # ⭐ capacidades reutilizables que los agentes invocan
    skill.port.ts             # INTERFAZ común de skill (name, input/output schema, execute)
    registry.ts               # registro de skills disponibles (descubribles)
    summarize-brand/          # cada skill = carpeta con su contrato + implementación
    score-intent/
    ...
  app/api/v1/                 # Route Handlers (controllers finos): validan, llaman al service
  db/                         # capa de datos `pg` (existe: client.ts + repos). Objetivo: schema + withTenant
  lib/                        # cross-cutting: errores, logger, config/env
```

## Reglas backend (derivadas de la filosofía NestJS)

1. **Controllers finos.** Los Route Handlers solo: validan input (Zod), llaman al service,
   formatean la respuesta. **Cero lógica de negocio** en `route.ts`.
2. **La lógica vive en services.** Funciones < 50 líneas, una responsabilidad. Nada de
   "god services".
3. **El acceso a datos vive en repositories.** Ningún service llama a Drizzle directo: pasa por su
   repository, y el repository por `withTenant()` (aislamiento multi-tenant).
4. **Inyección por constructor.** Las dependencias se reciben, no se importan como singleton global.
   Facilita el mock en tests.
5. **DTOs con Zod en los bordes.** Validar toda entrada externa; nunca confiar en el cliente.
6. **Errores tipados + manejo central.** Excepciones de dominio → respuesta consistente
   `{ success, data, error: { code, message } }`. Fail fast, propagar con contexto.
7. **Eventos para desacoplar.** Los agentes se disparan vía eventos a Trigger.dev, no con llamadas
   acopladas entre services.
8. **API versionada y consistente** (`/api/v1/...`) con el formato de respuesta de arriba.

## ⭐ Proveedores intercambiables (lo central: escalar sin reescribir)

Objetivo: **meter o cambiar proveedores (LLM, embeddings, email, SMS, storage) sin tocar la lógica
de negocio.** Patrón: **Ports & Adapters** (puerto = interfaz; adapter = implementación concreta).

**Regla de oro:** los services dependen del **puerto (interfaz)**, NUNCA de un proveedor concreto.
Cambiar de OpenRouter a Anthropic = cambiar una variable de entorno, no el código.

### Las 3 piezas

1. **Port (interfaz)** — define QUÉ se necesita, no QUIÉN lo hace:
   ```ts
   // src/providers/llm/llm.port.ts
   export interface LlmPort {
     complete(input: { system: string; messages: Msg[]; model?: string }): Promise<LlmResult>;
   }
   ```

2. **Adapter (implementación)** — un archivo por proveedor, todos cumplen el mismo puerto:
   ```ts
   // src/providers/llm/openrouter.adapter.ts
   export class OpenRouterLlm implements LlmPort {
     async complete(input) { /* fetch a OpenRouter, con prompt caching */ }
   }
   // src/providers/llm/anthropic.adapter.ts  (futuro)
   export class AnthropicLlm implements LlmPort { async complete(input) { /* SDK Anthropic */ } }
   ```

3. **Factory** — elige el adapter por configuración (env), único lugar que conoce los concretos:
   ```ts
   // src/providers/llm/index.ts
   export function makeLlm(): LlmPort {
     switch (process.env.LLM_PROVIDER ?? "openrouter") {
       case "anthropic": return new AnthropicLlm();
       default:          return new OpenRouterLlm();
     }
   }
   ```

### Cómo añadir un proveedor nuevo (3 pasos, sin tocar el negocio)
1. Crear `nuevo.adapter.ts` que **implemente el puerto** existente.
2. Registrarlo en el `switch` del factory (`index.ts`) con su clave de env.
3. Apuntar la variable de entorno (`LLM_PROVIDER=nuevo`). **Fin.** Ningún service cambia.

### Config central editable (los modelos NO van quemados)
Modelos y proveedores se declaran en **`src/config/models.ts`** (con override por env). Los adapters
leen de ahí; ningún nombre de modelo está hardcodeado en la lógica. Cambiar de modelo = editar ese
archivo (o una variable de entorno), sin tocar código. Las **dimensiones del vector** son la
excepción: su fuente única es `EMBEDDING_DIMENSIONS` en el esquema de BD (pgvector lo necesita en
build-time); cambiarlas obliga a re-embedar el vault.

### Por qué esto escala
- **Cero acoplamiento:** el dominio (leads, knowledge-vault…) habla con `LlmPort`, no con OpenRouter.
- **Testeable:** en tests se inyecta un adapter falso que cumple el puerto (sin red).
- **Multi-proveedor / fallback:** un `FallbackLlm` puede envolver varios adapters e ir probando.
- **Decisiones reversibles:** la migración a OpenRouter (vs Anthropic+Voyage del spec) queda aislada
  en un adapter — volver atrás es trivial.

> Lo mismo aplica a **embeddings, email, SMS, storage, scraping, SEO, enrichment, pagos, auth**:
> cada uno tiene su `*.port.ts`, sus adapters y su factory por env. Mismo patrón, repetido.

## El MISMO patrón para agentes, skills y servicios externos

La regla "interfaz + piezas enchufables + registro" se aplica **en todas las capas extensibles**.
Así, meter un agente/skill/servicio nuevo es **añadir un archivo y registrarlo**, sin reescribir.

| Capa | Interfaz (puerto) | Pieza enchufable | Registro / selección | Para añadir uno |
|------|-------------------|------------------|----------------------|-----------------|
| **Servicios externos / API** | `*.port.ts` | `*.adapter.ts` (por proveedor) | factory por env (`*_PROVIDER`) | nuevo adapter + entrada en factory + env |
| **Agentes** (los 18) | `agent.port.ts` (`run(input, ctx)`) | carpeta `agents/<nombre>/` | `agents/registry.ts` (id → impl) | nueva carpeta + alta en registry |
| **Skills** | `skill.port.ts` (name + schema + `execute`) | carpeta `skills/<nombre>/` | `skills/registry.ts` (descubribles) | nueva carpeta + alta en registry |

### Agentes — enchufables
- Todos implementan `AgentPort` (mismo contrato: reciben input + contexto de tenant, devuelven
  resultado tipado). No se llaman entre sí directo: se disparan por **eventos** (Trigger.dev).
- Un agente **consume providers** por su puerto (ej: `brand-extraction` usa `scraping.port` +
  `llm.port`), nunca un proveedor concreto → cambiar de LLM no toca el agente.
- El `registry` mapea `agentId → impl`; el orquestador (Trigger.dev) resuelve por id. Añadir el
  agente 19 = una carpeta nueva + una línea en el registry.

### Skills — descubribles y reutilizables
- Una skill es una capacidad autocontenida (nombre, schema de entrada/salida, `execute`). Varios
  agentes pueden invocar la misma skill.
- El `registry` de skills las hace **descubribles** (encaja con el doc 14 "Agent Skills Platform"
  y con el MCP server, que expone capacidades).
- Añadir una skill = carpeta nueva que cumple `SkillPort` + alta en el registry. Nada más cambia.

### Por qué todo esto escala igual
- **Un solo contrato por capa** → todo lo que lo cumple es intercambiable.
- **Registro/factory** → un único punto conoce las piezas concretas; el resto usa la interfaz.
- **Selección por configuración** (env / id) → cambiar comportamiento sin tocar el negocio.
- **Testeable** → en tests se enchufan dobles que cumplen el puerto, sin red ni servicios reales.

## Qué NO hacemos
- No instalamos NestJS, `@nestjs/*`, ni un contenedor de IoC.
- No usamos decoradores de NestJS (`@Injectable`, `@Controller`…). Usamos clases TS + DI manual.
- No forzamos la estructura donde no aporta (un endpoint trivial no necesita las 3 capas).
