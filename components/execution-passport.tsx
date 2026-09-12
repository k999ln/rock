'use client';

import { useEffect, useState } from 'react';
import { Cable, Cloud, Cpu, HardDrive, Sparkles, Zap } from 'lucide-react';
import type { Automation, ExecutionHost } from '@/lib/catalog';
import { deviceHasTool, deviceToken } from '@/lib/device';

const hostLabels: Record<ExecutionHost, string> = {
  browser: 'このブラウザ',
  rockstaros_device: 'RockstarOS端末',
  user_pc: '利用者のPC',
  self_hosted: '利用者の自前サーバー',
  provider_cloud: '提供者Cloud',
};

const transportLabels = {
  browser: 'Sky画面から直接',
  native_mcp: 'OS管理MCP',
  mcp_stdio: 'ローカルMCP',
  mcp_http: '遠隔MCP',
  https_api: 'HTTPS API',
} as const;
const operatorLabels = {
  browser_user: 'このブラウザの利用者',
  rockstaros: 'RockstarOS',
  user: '利用者本人',
  provider: 'ツール提供者',
} as const;

export function ExecutionPassport({ tool }: { tool: Automation }) {
  const [pcConnected, setPcConnected] = useState(false);
  const [routeAvailable, setRouteAvailable] = useState(false);
  const [observedHost, setObservedHost] = useState<ExecutionHost | null>(null);

  useEffect(() => {
    const update = () => {
      const connected = !!deviceToken();
      setPcConnected(connected);
      setRouteAvailable(
        tool.execution.primaryHost === 'browser' ||
          (connected &&
            !!tool.execution.discoveryTool &&
            deviceHasTool(tool.execution.discoveryTool)),
      );
    };
    const observe = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          toolId?: string;
          host?: ExecutionHost;
          state?: string;
        }>
      ).detail;
      if (detail?.toolId !== tool.id) return;
      setObservedHost(
        detail.state === 'running' && detail.host ? detail.host : null,
      );
    };
    update();
    window.addEventListener('loop-device', update);
    window.addEventListener('sky-runtime-observed', observe);
    return () => {
      window.removeEventListener('loop-device', update);
      window.removeEventListener('sky-runtime-observed', observe);
    };
  }, [tool.id, tool.execution.discoveryTool, tool.execution.primaryHost]);

  const route =
    observedHost === 'user_pc'
      ? 'Sky → このPCのloopback → ツール'
      : observedHost === 'rockstaros_device'
        ? 'Sky → RockstarOS端末のOS管理MCP → ツール'
        : tool.execution.primaryHost === 'browser'
          ? 'Sky → このブラウザ'
          : tool.execution.primaryHost === 'rockstaros_device'
            ? routeAvailable
              ? 'Sky → このPCのOS管理MCP → ツール'
              : 'Sky → RockstarOS端末 → ツール'
            : tool.execution.primaryHost === 'user_pc'
              ? 'Sky → PC接続MCP → ツール'
              : tool.execution.primaryHost === 'self_hosted'
                ? 'Sky → 利用者の自前サーバー → ツール'
                : 'Sky → 提供者Cloud → ツール';
  const currentState = observedHost
    ? `稼働中: ${hostLabels[observedHost]}`
    : routeAvailable
      ? 'この経路を利用可能'
      : pcConnected
        ? 'PCは接続済み・このツールの接続待ち'
        : tool.execution.primaryHost === 'browser'
          ? '接続不要'
          : '実行先は未接続';

  return (
    <section
      className="execution-passport"
      aria-labelledby={`execution-${tool.id}`}
    >
      <div className="execution-passport-heading">
        <div>
          <span className="rock-eyebrow">EXECUTION PASSPORT</span>
          <h3 id={`execution-${tool.id}`}>どこで、何を経由して動くか</h3>
        </div>
        <span
          className={
            observedHost || routeAvailable ? 'is-available' : 'is-waiting'
          }
        >
          {currentState}
        </span>
      </div>
      <p className="execution-route">{route}</p>
      <dl>
        <div>
          <dt>
            <Cpu size={15} />
            主な実行場所
          </dt>
          <dd>{hostLabels[tool.execution.primaryHost]}</dd>
        </div>
        <div>
          <dt>
            <Cpu size={15} />
            対応する場所
          </dt>
          <dd>
            {tool.execution.supportedHosts
              .map((host) => hostLabels[host])
              .join(' / ')}
          </dd>
        </div>
        <div>
          <dt>
            <Cable size={15} />
            主経路の管理者
          </dt>
          <dd>{operatorLabels[tool.execution.hostOperator]}</dd>
        </div>
        <div>
          <dt>
            <Cable size={15} />
            接続方式
          </dt>
          <dd>{transportLabels[tool.execution.transport]}</dd>
        </div>
        <div>
          <dt>
            <Cloud size={15} />
            クラウド
          </dt>
          <dd>
            {tool.execution.cloudDependency === 'none'
              ? '不要'
              : tool.execution.cloudDependency === 'optional'
                ? '機能により任意'
                : '必須'}
          </dd>
        </div>
        <div>
          <dt>
            <Sparkles size={15} />
            Codex
          </dt>
          <dd>
            {tool.execution.codexRole === 'not_required'
              ? '不要'
              : tool.execution.codexRole === 'optional_client'
                ? '任意の操作窓口'
                : '必須'}
          </dd>
        </div>
        <div>
          <dt>
            <HardDrive size={15} />
            主経路のデータ
          </dt>
          <dd>
            {tool.execution.dataResidency === 'rockstaros_device'
              ? 'RockstarOS端末内'
              : tool.execution.dataResidency === 'user_pc'
                ? '利用者のPC内'
                : tool.execution.dataResidency === 'provider_cloud'
                  ? '提供者Cloud'
                  : tool.execution.dataResidency === 'self_hosted'
                    ? '利用者の自前サーバー'
                    : tool.execution.dataResidency === 'browser_memory'
                      ? 'ブラウザ処理中のみ'
                      : '端末と外部Provider'}
          </dd>
        </div>
        <div>
          <dt>
            <Zap size={15} />
            単独運転
          </dt>
          <dd>
            {tool.execution.unattended &&
            tool.execution.cloudDependency === 'none'
              ? '端末だけで継続可能'
              : tool.execution.unattended
                ? '一部可能'
                : '操作中のみ'}
          </dd>
        </div>
      </dl>
      {tool.execution.primaryHost === 'rockstaros_device' && (
        <p className="execution-power-note">
          計算と保存はRockstarOS端末だけで可能。現在の電力は端末バッテリー／外部電源で、自家発電装置との接続確認はまだありません。
        </p>
      )}
    </section>
  );
}
