'use client';
import { Fragment, useEffect, useState } from 'react';
import { NoahAgentPin, NoahAgentPinGrid } from './noah-agent-pin';
import Link from 'next/link';
import {
  skyEveDevicePath,
  skyEveDeviceState,
  isEveRuntimePresence,
  skyEveExecutionTargets,
  type EveExecutionPresence,
  type EveRuntimePresence,
} from '@/lib/sky-eve-connections';
import styles from './sky-device-agent-connections.module.css';

/** Reuse Eve's authenticated presence. Do not install, copy, or run agents here. */
export default function SkyDeviceAgentConnections({
  ownerUserId, pinView = false,
}: {
  ownerUserId: string; pinView?: boolean;
}) {
  const [devices, setDevices] = useState<EveExecutionPresence[]>([]);
  const [notice, setNotice] = useState('端末の担当を確認しています…');
  const [observedAt, setObservedAt] = useState(0);
  useEffect(() => {
    if (!ownerUserId) return;
    const controller = new AbortController();
    let fetching = false;
    const load = async () => {
      if (fetching || document.hidden || !navigator.onLine) return;
      fetching = true;
      try {
        const extra = await fetch('/api/eve/runtime', {
          cache: 'no-store',
          signal: controller.signal,
        }).catch(() => null);
        if (extra?.status === 401) {
          setDevices([]);
          setNotice('アカウントを再確認してください。');
          return;
        }
        const runtime = extra?.ok
          ? ((await extra.json()) as {
              ownerUserId: string;
              devices: EveRuntimePresence[];
            })
          : null;
        const response = await fetch('/api/eve/device-sync', {
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          ownerUserId?: string;
          devices?: EveExecutionPresence[];
          error?: string;
        };
        if (controller.signal.aborted) return;
        if (
          response.status === 401 ||
          (response.ok && data.ownerUserId !== ownerUserId) ||
          (runtime && runtime.ownerUserId !== ownerUserId)
        ) {
          setDevices([]);
          setNotice('アカウントが変わりました。一覧を再読み込みしてください。');
          return;
        }
        if (!response.ok || !Array.isArray(data.devices))
          throw new Error(
            data.error ||
              '端末の担当を確認できません。接続を確認してください。',
          );
        const connected = skyEveExecutionTargets([...data.devices, ...(runtime?.devices ?? [])]);
        setDevices(connected);
        setObservedAt(Date.now());
        setNotice(
          !extra?.ok
            ? '追加した実行先を確認できません。接続を確認してください。'
            : connected.length
              ? '同じアカウントで接続した端末の担当です。設定は端末に保存されています。'
              : '端末を接続すると、そこに追加した担当もここに並びます。',
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          setDevices([]);
          setNotice(
            error instanceof Error
              ? error.message
              : '端末との接続を確認してください。',
          );
        }
      } finally {
        fetching = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 4000);
    const clock = setInterval(() => setObservedAt(Date.now()), 1000);
    return () => {
      controller.abort();
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [ownerUserId]);
  const AgentList = pinView ? NoahAgentPinGrid : Fragment;
  return (
    <section
      className={styles.deviceConnections}
      aria-label="接続した端末のエージェント"
    >
      <h2>接続した端末の担当</h2>
      <p>{notice}</p>
      {devices.map((device) => (
        <div key={device.deviceId} className={pinView ? styles.pinGroup : styles.deviceGroup}>
          <h3>{device.name}</h3>
          <AgentList>{device.agents.map((agent) => {
            const model = device.models.find((m) => m.id === agent.modelId);
            const state = skyEveDeviceState(device, agent.id, observedAt);
            const href = model ? skyEveDevicePath({
              deviceId: device.deviceId, agentId: agent.id, agentSha256: agent.sha256, modelSha256: model.sha256,
              ...(isEveRuntimePresence(device) && 'scheme' in model ? { modelScheme: model.scheme } : {}),
            }) : undefined;
            if (pinView) return <NoahAgentPin key={agent.id} id={agent.id} name={agent.name} href={href} prefetch={false}
              meta={<>基盤モデル · {model?.name ?? '未確認'}<br />実行先 · {device.name}<br />{state.label}{href && <> · この担当をEveで開く</>}</>} />;
            return <article key={agent.id}>
              <strong>{agent.name}</strong>
              <dl>
                <div><dt>基盤モデル</dt><dd>{model?.name ?? '未確認'}</dd></div>
                <div><dt>実行先</dt><dd>{device.name}</dd></div>
              </dl>
              <p>{state.label}</p>
              {href && <Link prefetch={false} href={href}>この担当をEveで開く</Link>}
            </article>;
          })}</AgentList>
        </div>
      ))}
      <Link href="/connect/device">端末を接続・解除する</Link>
      <p>
        開くだけでは実行しません。Eveで依頼と送信先を確認し、成果と停止も同じ仕事で扱います。
      </p>
    </section>
  );
}
