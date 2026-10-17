'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { McpPlan } from '@/lib/sky-mcp-plan';
import type { CampusId } from '@/lib/campus';

export default function SkyMcpPlan({ campusId }: { campusId?: CampusId }) {
  const [plan, setPlan] = useState<McpPlan | null>(null);
  const [removing, setRemoving] = useState('');
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState<
    'loading' | 'signin' | 'ready' | 'error'
  >('loading');
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/sky/mcp/plan', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.status === 401) {
        setStatus('signin');
        setPlan(null);
        return;
      }
      if (!response.ok) throw new Error();
      setPlan(await response.json());
      setStatus('ready');
    } catch {
      setStatus('error');
      setPlan(null);
    }
  }, []);
  useEffect(() => {
    let active = true;
    const handler = () => {
      if (active) void refresh();
    };
    void Promise.resolve().then(handler);
    window.addEventListener('sky-mcp-plan', handler);
    return () => {
      active = false;
      window.removeEventListener('sky-mcp-plan', handler);
    };
  }, [refresh]);
  async function removeSlot(connectionKey: string) {
    setRemoving(connectionKey);
    setNotice('');
    try {
      const response = await fetch('/api/sky/mcp/plan', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionKey }),
      });
      if (!response.ok) throw new Error();
      setPlan(await response.json());
      setNotice(
        'Removed from Sky. A running task or PC process has not been stopped.',
      );
      window.dispatchEvent(new Event('sky-mcp-plan'));
    } catch {
      setNotice('Could not remove this connection. Try again.');
    } finally {
      setRemoving('');
    }
  }
  const returnTo = campusId ? `/sky/campus/${campusId}/hub` : '/sky';
  return (
    <div
      aria-label="MCP connection plan"
      style={{ fontSize: 14, lineHeight: 1.7 }}
    >
      {status === 'loading' && <p>Checking your connection plan…</p>}
      {status === 'signin' && (
        <p>
          <Link
            href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`}
          >
            Sign in to view your free connections ↗
          </Link>
        </p>
      )}
      {status === 'error' && (
        <output>
          Connection plan unavailable.{' '}
          <button type="button" onClick={() => void refresh()}>
            Try again
          </button>
        </output>
      )}
      {plan && (
        <p>
          <strong>
            {plan.used} / {plan.freeLimit} MCP slots in use
          </strong>{' '}
          · {plan.tier === 'campus' ? 'Campus student plan' : 'General plan'}
          {plan.used >= plan.freeLimit &&
            ' · Free limit reached. Paid expansion is not yet available.'}
        </p>
      )}
      {plan && plan.connections.length > 0 && (
        <details>
          <summary>Manage saved connections</summary>
          <p>
            Remove an old or unavailable device’s connection to free a slot.
            This removes its Sky access; use your PC to stop a running task or
            disconnect the local server.
          </p>
          <ul>
            {plan.connections.map((connection) => (
              <li key={connection.connectionKey}>
                {connection.name}{' '}
                <button
                  type="button"
                  disabled={Boolean(removing)}
                  onClick={() => void removeSlot(connection.connectionKey)}
                >
                  {removing === connection.connectionKey
                    ? 'Removing…'
                    : 'Remove from Sky'}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {notice && <output>{notice}</output>}
      {campusId && plan && plan.tier !== 'campus' && (
        <p>
          <Link href={`/campus?campus=${campusId}&profile=1`}>
            Set up your student profile ↗
          </Link>
          <br />
          <small>
            Use a sign-in identity with your university email. Campus confirms
            the email domain; selecting “student” alone does not unlock the
            extra slot.
          </small>
        </p>
      )}
    </div>
  );
}
