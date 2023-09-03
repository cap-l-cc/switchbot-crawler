import type { SharedEnv } from 'cloudflare-env';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { defaultTriggersSchema } from './model';

type Env = {
  TRIGGERS: KVNamespace;
};

const app = new Hono<{ Bindings: SharedEnv & Env }>().basePath('/api');

const route = app
  .get('/', (c) => c.text('Hello Hono!'))
  .get('/defaultTriggers', async (c) => {
    const values = await c.env.TRIGGERS.get('defaultTriggers', { type: 'json' });
    if (!values) {
      return c.jsonT({ success: true, data: { counts: 0, triggers: [] } });
    }

    const parsed = defaultTriggersSchema.parse(values);
    const response = { ...parsed, counts: parsed.triggers.length };

    return c.jsonT({ success: true, data: response });
  })
  .put(
    // @ts-ignore TS7030
    // eslint-disable-next-line consistent-return
    zValidator('json', defaultTriggersSchema, (result, c) => {
      if (c.req.headers.get('Content-Type') !== 'application/json') {
        return c.jsonT({ success: false, messages: ['Content-Type must be "application/json"'] }, 400);
      }
      if (!result.success) {
        return c.jsonT({ success: false, messages: result.error.issues.map((i) => i.message) }, 400);
      }
    }),
    async (c) => {
      const contents = c.req.valid('json');

      c.executionCtx.waitUntil(c.env.TRIGGERS.put('defaultTriggers', JSON.stringify(contents)));

      return c.jsonT({ success: true, data: {} }, 200);
    },
  );

export type ApiRoute = typeof route;

export default app;
