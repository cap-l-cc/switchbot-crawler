import { defaultTriggersSchema, type Variables, type Env, defaultTriggerSchema, acSettingsSchema } from '@/model';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { SharedEnv } from 'cloudflare-env';
import { defaultTriggersTable as table } from '@/db/schema';
import { emptyJsonT, getUrl, nanoid } from '@/lib';
import { eq } from 'drizzle-orm';

const app = new OpenAPIHono<{ Bindings: SharedEnv & Env; Variables: Variables }>();

export const defaultTriggersApi = app
  .openapi(
    createRoute({
      responses: {
        200: {
          description: 'OK',
          content: {
            'application/json': {
              schema: z.object({ triggers: defaultTriggersSchema }),
            },
          },
        },
      },
      method: 'get',
      path: '/',
    }),
    async (c) => {
      const values = await c.get('db').select().from(table);
      const triggers = values.map(({ triggerTime, triggerTemp, operationMode, settingsTemp, ...v }) => ({
        ...v,
        temp: triggerTemp,
        ac: { mode: operationMode, temp: settingsTemp },
        time: { hour: triggerTime.getUTCHours(), minute: triggerTime.getUTCMinutes() },
      }));

      return c.jsonT({ triggers });
    },
  )
  .openapi(
    createRoute({
      request: {
        body: {
          content: {
            'application/json': {
              schema: defaultTriggerSchema.omit({ id: true }),
            },
          },
        },
      },
      responses: {
        201: {
          description: 'Trigger is created',
          content: {
            'application/json': {
              schema: z.object({ trigger: defaultTriggerSchema }),
            },
          },
        },
        409: {
          description: 'The trigger has already been created',
        },
      },
      method: 'post',
      path: '/',
    }),
    async (c) => {
      const contents = c.req.valid('json');

      const id = nanoid();
      const createdTriggers = await c
        .get('db')
        .insert(table)
        .values({
          id,
          triggerTemp: contents.temp,
          triggerTime: new Date(2000, 4, 15, contents.time.hour, contents.time.minute),
          settingsTemp: contents.ac.temp,
          operationMode: contents.ac.mode,
        })
        .onConflictDoNothing()
        .returning({ createdId: table.id });

      if (createdTriggers.length === 0) {
        return emptyJsonT(c, 409);
      }

      const trigger = { ...contents, id };

      return c.jsonT({ trigger }, 201, { Location: `${getUrl(c.req)}/${id}` });
    },
  )
  .openapi(
    createRoute({
      request: {
        params: z.object({ id: z.string() }),
      },
      responses: {
        200: {
          description: 'The trigger is found',
          content: {
            'application/json': {
              schema: z.object({ trigger: defaultTriggerSchema }),
            },
          },
        },
        404: {
          description: 'The trigger is not found',
        },
      },
      method: 'get',
      path: '/{id}',
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const [value] = await c.get('db').select().from(table).where(eq(table.id, id));

      if (!value) {
        return emptyJsonT(c, 404);
      }

      const trigger = {
        ...value,
        temp: value.triggerTemp,
        ac: { mode: value.operationMode, temp: value.settingsTemp },
        time: { hour: value.triggerTime.getUTCHours(), minute: value.triggerTime.getUTCMinutes() },
      };

      return c.jsonT({ trigger });
    },
  )
  .openapi(
    createRoute({
      request: {
        params: z.object({ id: z.string() }),
        body: {
          content: {
            'application/json': {
              schema: defaultTriggerSchema.pick({ time: true }),
            },
          },
        },
      },
      responses: {
        204: {
          description: 'The trigger is modified',
        },
        404: {
          description: 'The trigger is not found',
        },
      },
      method: 'put',
      path: '/{id}/time',
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const { time } = c.req.valid('json');
      const updatedTriggers = await c
        .get('db')
        .update(table)
        .set({ triggerTime: new Date(2000, 4, 15, time.hour, time.minute) })
        .where(eq(table.id, id))
        .returning({ updatedId: table.id });

      if (updatedTriggers.length === 0) {
        return emptyJsonT(c, 404);
      }

      return emptyJsonT(c, 204);
    },
  )
  .openapi(
    createRoute({
      request: {
        params: z.object({ id: z.string() }),
        body: {
          content: {
            'application/json': {
              schema: defaultTriggerSchema.pick({ temp: true }),
            },
          },
        },
      },
      responses: {
        204: {
          description: 'The trigger is modified',
        },
        404: {
          description: 'The trigger is not found',
        },
      },
      method: 'put',
      path: '/{id}/temp',
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const { temp } = c.req.valid('json');
      const updatedTriggers = await c
        .get('db')
        .update(table)
        .set({ triggerTemp: temp })
        .where(eq(table.id, id))
        .returning({ updatedId: table.id });

      if (updatedTriggers.length === 0) {
        return emptyJsonT(c, 404);
      }

      return emptyJsonT(c, 204);
    },
  )
  .openapi(
    createRoute({
      request: {
        params: z.object({ id: z.string() }),
        body: {
          content: {
            'application/json': {
              schema: acSettingsSchema.pick({ mode: true }),
            },
          },
        },
      },
      responses: {
        204: {
          description: 'The trigger is modified',
        },
        404: {
          description: 'The trigger is not found',
        },
      },
      method: 'put',
      path: '/{id}/acMode',
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const { mode } = c.req.valid('json');
      const updatedTriggers = await c
        .get('db')
        .update(table)
        .set({ operationMode: mode })
        .where(eq(table.id, id))
        .returning({ updatedId: table.id });

      if (updatedTriggers.length === 0) {
        return emptyJsonT(c, 404);
      }

      return emptyJsonT(c, 204);
    },
  )
  .openapi(
    createRoute({
      request: {
        params: z.object({ id: z.string() }),
        body: {
          content: {
            'application/json': {
              schema: acSettingsSchema.pick({ temp: true }),
            },
          },
        },
      },
      responses: {
        204: {
          description: 'The trigger is modified',
        },
        404: {
          description: 'The trigger is not found',
        },
      },
      method: 'put',
      path: '/{id}/acTemp',
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const { temp } = c.req.valid('json');
      const updatedTriggers = await c
        .get('db')
        .update(table)
        .set({ settingsTemp: temp })
        .where(eq(table.id, id))
        .returning({ updatedId: table.id });

      if (updatedTriggers.length === 0) {
        return emptyJsonT(c, 404);
      }

      return emptyJsonT(c, 204);
    },
  )
  .openapi(
    createRoute({
      request: {
        params: z.object({ id: z.string() }),
      },
      responses: {
        204: {
          description: 'The trigger is deleted',
        },
        404: {
          description: 'The trigger is not found',
        },
      },
      method: 'delete',
      path: '/{id}',
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const deletedTriggers = await c.get('db').delete(table).where(eq(table.id, id)).returning({ deletedId: table.id });

      if (deletedTriggers.length === 0) {
        return emptyJsonT(c, 404);
      }

      return emptyJsonT(c, 204);
    },
  );
