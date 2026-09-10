import 'server-only';
import path from 'node:path';
import { JsonFileRuleStore, RedisRuleStore } from '../rules';
import type { RuleStore } from '../rules';

/**
 * Position/rule store for the app + keeper.
 *   - Upstash Redis when UPSTASH_REDIS_REST_URL is set (Vercel / serverless —
 *     add the Upstash integration in the Vercel dashboard and it sets these)
 *   - otherwise a JSON file (local dev)
 */
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const STORE_PATH = process.env.RULE_STORE_PATH
  ? path.resolve(process.cwd(), process.env.RULE_STORE_PATH)
  : path.join(process.cwd(), '.data', 'positions.json');

export const ruleStore: RuleStore =
  redisUrl && redisToken
    ? new RedisRuleStore(redisUrl, redisToken)
    : new JsonFileRuleStore(STORE_PATH);

export const usingRedis = !!(redisUrl && redisToken);
