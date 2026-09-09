import 'server-only';
import path from 'node:path';
import { JsonFileRuleStore } from '../rules';

const STORE_PATH = process.env.RULE_STORE_PATH
  ? path.resolve(process.cwd(), process.env.RULE_STORE_PATH)
  : path.join(process.cwd(), '.data', 'positions.json');

/** single JSON-file position/rule store for the app + keeper (swap for Postgres later) */
export const ruleStore = new JsonFileRuleStore(STORE_PATH);
