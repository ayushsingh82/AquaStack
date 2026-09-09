'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { saveRuleAction } from '@/app/app/actions';
import { fromClient } from '@/lib/serialize';
import type { PositionRecord } from '@/lib/rules/types';
import { RULE_PRESETS, type RulePreset } from '@/lib/rules/types';
import { fromRule, toRule, ruleSummary, RULE_FIELDS, type RuleForm } from '@/lib/rule-form';
import { ACCENT } from '@/lib/addresses';
import { Button } from '@/components/app/ui';

export function RuleEditor({ record, onSaved }: { record: PositionRecord; onSaved: () => void }) {
  const { address } = useAccount();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RuleForm>(() => fromRule(record.rule));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const dirty = JSON.stringify(toRule(form)) !== JSON.stringify(record.rule);

  const patch = (p: Partial<RuleForm>) => setForm((f) => ({ ...f, ...p }));

  async function save() {
    if (!address) return;
    setSaving(true);
    setError('');
    try {
      fromClient(await saveRuleAction(address, record.strategyHash, toRule(form)));
      setOpen(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="text-neutral-500">Rule: </span>
          <span className="text-neutral-200">{ruleSummary(record.rule)}</span>
        </div>
        <button
          className="text-xs underline hover:text-white"
          style={{ color: ACCENT }}
          onClick={() => {
            setForm(fromRule(record.rule));
            setOpen(true);
          }}
        >
          Edit rule
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {(['conservative', 'balanced', 'alertOnly'] as RulePreset[]).map((k) => (
          <button
            key={k}
            onClick={() => setForm(fromRule(RULE_PRESETS[k]))}
            className="border px-2.5 py-1 text-xs"
            style={{ borderColor: 'rgba(255,255,255,0.15)', color: '#a3a3a3' }}
          >
            {k === 'alertOnly' ? 'Alert only' : k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {RULE_FIELDS.map(([key, label]) => (
          <div key={key}>
            <p className="mb-1 text-xs text-neutral-500">{label}</p>
            <input
              inputMode="numeric"
              value={form[key]}
              onChange={(e) => patch({ [key]: e.target.value.replace(/[^0-9]/g, '') })}
              placeholder="off"
              className="w-full border border-white/15 bg-black px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-700"
            />
          </div>
        ))}
      </div>

      <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.autoUnwind}
          onChange={(e) => patch({ autoUnwind: e.target.checked })}
        />
        <span className="text-neutral-300">Auto-unwind when a threshold trips</span>
      </label>

      {error && <p className="mt-3 text-xs text-red-400">{error.split('\n')[0]}</p>}

      <div className="mt-4 flex gap-3">
        <Button onClick={save} disabled={saving || !dirty || !address}>
          {saving ? 'Saving…' : 'Save rule'}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
