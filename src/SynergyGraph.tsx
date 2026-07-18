import { useEffect, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import {
  analyzeSynergies,
  type StatusSynergyReport,
  type SynergyInstructionRef,
  type SynergyMetricId,
  synergyMetricCount,
} from './core/synergy';
import { GAME_DATA, UNITS } from './data';
import {
  analyzePositionSynergies,
  positionMetricCount,
  type PositionMetricId,
  type PositionSynergyPack,
} from './core/position-synergy';

const unitById = new Map(UNITS.map((unit) => [unit.id, unit]));

const METRICS: Array<{ id: SynergyMetricId; label: string; shortLabel: string }> = [
  { id: 'producer', label: '付与技', shortLabel: '付与' },
  { id: 'condition', label: '状態条件', shortLabel: '条件' },
  { id: 'consumer', label: '利用・消費技', shortLabel: '利用' },
  { id: 'crossUnit', label: '別ユニット連携', shortLabel: '連携' },
  { id: 'counterplay', label: '対抗手段', shortLabel: '対抗' },
];
const POSITION_METRICS: Array<{ id: PositionMetricId; label: string; shortLabel: string }> = [
  { id: 'placer', label: '設置技', shortLabel: '設置' },
  { id: 'trigger', label: '侵入発動', shortLabel: '発動' },
  { id: 'selfMove', label: '自発移動', shortLabel: '自走' },
  { id: 'forcedMove', label: '強制移動', shortLabel: '強制' },
  { id: 'interaction', label: '組み合わせ', shortLabel: '連携' },
];

const heatLevel = (count: number | null) => (count === null ? 'na' : `heat-${Math.min(3, count)}`);

const InstructionItem = ({ instruction }: { instruction: SynergyInstructionRef }) => (
  <span className="synergy-detail-item">
    <b>{instruction.title}</b>
    <small>
      {instruction.fixedFor ? (unitById.get(instruction.fixedFor)?.name ?? instruction.fixedFor) : '全ユニット'}
    </small>
  </span>
);

function SynergyDetail({ pack, onClose }: { pack: StatusSynergyReport; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="synergy-detail-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="synergy-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="synergy-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <small>{pack.mode === 'combo' ? 'COMBO STATUS' : 'STANDALONE STATUS'}</small>
            <h2 id="synergy-detail-title">{pack.label}</h2>
            <code>{pack.statusId}</code>
          </div>
          <span className={pack.ready ? 'coverage-ready' : 'coverage-issue'}>
            {pack.ready ? '網羅済み' : '不足あり'}
          </span>
          <button aria-label="シナジー詳細を閉じる" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <p>{pack.description}</p>

        <div className="synergy-detail-density" aria-label={`${pack.label}の登録件数`}>
          {METRICS.map((metric) => {
            const count = synergyMetricCount(pack, metric.id);
            return (
              <div className={`synergy-density-cell ${heatLevel(count)}`} key={metric.id}>
                <small>{metric.label}</small>
                <strong>{count ?? '—'}</strong>
                <span>{count === null ? '対象外' : '件'}</span>
              </div>
            );
          })}
        </div>

        <div className="synergy-detail-grid">
          <section>
            <header>
              <span>付与技</span>
              <b>{pack.producers.length}</b>
            </header>
            <div>
              {pack.producers.map((instruction) => (
                <InstructionItem instruction={instruction} key={instruction.id} />
              ))}
              {pack.producers.length === 0 && <em>登録なし</em>}
            </div>
          </section>

          <section>
            <header>
              <span>状態条件</span>
              <b>{pack.mode === 'combo' ? pack.conditions.length : '—'}</b>
            </header>
            <div>
              {pack.mode === 'standalone' ? (
                <em>{pack.standaloneReason}</em>
              ) : (
                pack.conditions.map((condition) => (
                  <span className="synergy-detail-item" key={condition.id}>
                    <b>{condition.label}</b>
                    <small>{condition.id}</small>
                  </span>
                ))
              )}
              {pack.mode === 'combo' && pack.conditions.length === 0 && <em>登録なし</em>}
            </div>
          </section>

          <section>
            <header>
              <span>利用・消費技</span>
              <b>{pack.mode === 'combo' ? pack.consumers.length : '—'}</b>
            </header>
            <div>
              {pack.mode === 'standalone' ? (
                <em>単独完結型</em>
              ) : (
                pack.consumers.map((instruction) => <InstructionItem instruction={instruction} key={instruction.id} />)
              )}
              {pack.mode === 'combo' && pack.consumers.length === 0 && <em>登録なし</em>}
            </div>
          </section>

          <section>
            <header>
              <span>別ユニット連携</span>
              <b>{pack.mode === 'combo' ? pack.crossUnitLinks.length : '—'}</b>
            </header>
            <div className="synergy-link-list">
              {pack.mode === 'standalone' ? (
                <em>単独完結型</em>
              ) : (
                pack.crossUnitLinks.map((link) => (
                  <span key={`${link.producerUnitId}:${link.consumerUnitId}`}>
                    {unitById.get(link.producerUnitId)?.name ?? link.producerUnitId}
                    <i>→</i>
                    {unitById.get(link.consumerUnitId)?.name ?? link.consumerUnitId}
                  </span>
                ))
              )}
              {pack.mode === 'combo' && pack.crossUnitLinks.length === 0 && <em>登録なし</em>}
            </div>
          </section>

          <section className="counterplay">
            <header>
              <span>対抗手段</span>
              <b>{pack.counterplay.verified ? 1 : 0}</b>
            </header>
            <div>
              <span className="synergy-detail-item">
                <b>{pack.counterplay.description}</b>
                <small>{pack.counterplay.kind}</small>
              </span>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function PositionDetail({ pack, onClose }: { pack: PositionSynergyPack; onClose: () => void }) {
  return (
    <div className="synergy-detail-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="synergy-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="position-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <small>POSITION INTERACTION</small>
            <h2 id="position-detail-title">{pack.label}</h2>
            <code>{pack.zoneId}</code>
          </div>
          <span className={pack.ready ? 'coverage-ready' : 'coverage-issue'}>
            {pack.ready ? '網羅済み' : '不足あり'}
          </span>
          <button aria-label="位置シナジー詳細を閉じる" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <p>{pack.description}</p>
        <div className="synergy-detail-density">
          {POSITION_METRICS.map((metric) => {
            const count = positionMetricCount(pack, metric.id);
            return (
              <div className={`synergy-density-cell ${heatLevel(count)}`} key={metric.id}>
                <small>{metric.label}</small>
                <strong>{count}</strong>
                <span>件</span>
              </div>
            );
          })}
        </div>
        <div className="synergy-detail-grid">
          {[
            ['設置技', pack.placers],
            ['自発移動', pack.selfMovers],
            ['強制移動', pack.forcedMovers],
          ].map(([label, instructions]) => (
            <section key={label as string}>
              <header>
                <span>{label as string}</span>
                <b>{(instructions as PositionSynergyPack['placers']).length}</b>
              </header>
              <div>
                {(instructions as PositionSynergyPack['placers']).map((instruction) => (
                  <span className="synergy-detail-item" key={instruction.id}>
                    <b>{instruction.title}</b>
                    <small>{instruction.id}</small>
                  </span>
                ))}
              </div>
            </section>
          ))}
          <section className="counterplay">
            <header>
              <span>行動時効果</span>
              <b>{pack.triggerCount}</b>
            </header>
            <div>
              <span className="synergy-detail-item">
                <b>{pack.statusLabels.join(' / ')}</b>
                <small>敵味方を問わず行動開始地点で判定</small>
              </span>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

export function SynergyGraph({ onBack }: { onBack: () => void }) {
  const report = analyzeSynergies(GAME_DATA);
  const positionReport = analyzePositionSynergies(GAME_DATA);
  const [auditMode, setAuditMode] = useState<'status' | 'position'>('status');
  const [selectedStatusId, setSelectedStatusId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const selectedPack = report.packs.find((pack) => pack.statusId === selectedStatusId) ?? null;
  const selectedPositionPack = positionReport.packs.find((pack) => pack.zoneId === selectedZoneId) ?? null;
  const positionMovementCount = new Set(
    positionReport.packs.flatMap((pack) => [...pack.selfMovers, ...pack.forcedMovers].map((item) => item.id)),
  ).size;
  const metrics = auditMode === 'status' ? METRICS : POSITION_METRICS;

  return (
    <main className="synergy-page">
      <header className="synergy-head">
        <button onClick={onBack}>
          <ArrowLeft size={15} /> デバッグルーム
        </button>
        <div>
          <span>{auditMode === 'status' ? 'STATUS INTERACTION AUDIT' : 'POSITION INTERACTION AUDIT'}</span>
          <h1>シナジー・ヒートマップ</h1>
        </div>
        <p>
          {auditMode === 'status'
            ? '状態ごとの登録件数を濃淡で比較します。セルをタップすると、技と担当ユニットを確認できます。'
            : '設置エリアと移動技の接続数を比較します。毒など個別の名称ではなく、位置連携の網羅性を確認できます。'}
        </p>
      </header>

      <nav className="synergy-audit-tabs" aria-label="シナジー監査の種類">
        <button className={auditMode === 'status' ? 'active' : ''} onClick={() => setAuditMode('status')}>
          状態シナジー
        </button>
        <button className={auditMode === 'position' ? 'active' : ''} onClick={() => setAuditMode('position')}>
          位置シナジー
        </button>
      </nav>

      <section className="synergy-summary" aria-label="シナジー検証サマリー">
        <article>
          <small>{auditMode === 'status' ? 'STATUS PACKS' : 'FIELD PACKS'}</small>
          <strong>{auditMode === 'status' ? report.packs.length : positionReport.packs.length}</strong>
          <span>{auditMode === 'status' ? '登録状態' : '登録エリア'}</span>
        </article>
        <article
          className={
            (auditMode === 'status' ? report.issues.length : positionReport.issues.length) === 0 ? 'passed' : 'failed'
          }
        >
          <small>DATA COVERAGE</small>
          <strong>
            {auditMode === 'status' ? report.readyPacks : positionReport.readyPacks}
            <i>/{auditMode === 'status' ? report.packs.length : positionReport.packs.length}</i>
          </strong>
          <span>
            {(auditMode === 'status' ? report.issues.length : positionReport.issues.length) === 0
              ? '全パック網羅済み'
              : `${auditMode === 'status' ? report.issues.length : positionReport.issues.length}件の不足`}
          </span>
        </article>
        <article>
          <small>{auditMode === 'status' ? 'COMBO / SOLO' : 'MOVE / LINKS'}</small>
          <strong>
            {auditMode === 'status' ? report.comboPacks : positionMovementCount}
            <i>
              {' / '}
              {auditMode === 'status'
                ? report.standalonePacks
                : positionReport.packs.reduce((sum, pack) => sum + pack.interactionCount, 0)}
            </i>
          </strong>
          <span>{auditMode === 'status' ? '連携型 / 単独完結型' : '移動技 / 接続数'}</span>
        </article>
      </section>

      <section className="synergy-matrix-panel" aria-labelledby="synergy-matrix-title">
        <header>
          <div>
            <small>DENSITY MATRIX</small>
            <h2 id="synergy-matrix-title">登録密度</h2>
          </div>
          <div className="synergy-heat-legend" aria-label="色の濃さの凡例">
            {[0, 1, 2, 3].map((count) => (
              <span key={count}>
                <i className={`heat-${count}`} />
                {count === 3 ? '3+' : count}
              </span>
            ))}
            <span>
              <i className="na" />—
            </span>
          </div>
        </header>

        <div className="synergy-matrix-wrap">
          <table className="synergy-matrix">
            <thead>
              <tr>
                <th scope="col">{auditMode === 'status' ? '状態' : 'エリア'}</th>
                {metrics.map((metric) => (
                  <th scope="col" key={metric.id} title={metric.label}>
                    <span>{metric.shortLabel}</span>
                    <small>{metric.id === 'crossUnit' || metric.id === 'interaction' ? '組' : '件'}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {auditMode === 'status'
                ? report.packs.map((pack) => (
                    <tr className={pack.ready ? 'is-ready' : 'has-issue'} key={pack.statusId}>
                      <th scope="row">
                        <button onClick={() => setSelectedStatusId(pack.statusId)}>
                          <b>{pack.label}</b>
                          <span>{pack.mode === 'combo' ? '連携型' : '単独型'}</span>
                        </button>
                      </th>
                      {METRICS.map((metric) => {
                        const count = synergyMetricCount(pack, metric.id);
                        return (
                          <td key={metric.id}>
                            <button
                              className={`synergy-heat-cell ${heatLevel(count)}`}
                              aria-label={`${pack.label}の${metric.label}: ${count === null ? '対象外' : `${count}件`}`}
                              onClick={() => setSelectedStatusId(pack.statusId)}
                            >
                              <strong>{count ?? '—'}</strong>
                              <span>{count === null ? '' : metric.id === 'crossUnit' ? '組' : '件'}</span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                : positionReport.packs.map((pack) => (
                    <tr className={pack.ready ? 'is-ready' : 'has-issue'} key={pack.zoneId}>
                      <th scope="row">
                        <button onClick={() => setSelectedZoneId(pack.zoneId)}>
                          <b>{pack.label}</b>
                          <span>設置エリア</span>
                        </button>
                      </th>
                      {POSITION_METRICS.map((metric) => {
                        const count = positionMetricCount(pack, metric.id);
                        return (
                          <td key={metric.id}>
                            <button
                              className={`synergy-heat-cell ${heatLevel(count)}`}
                              aria-label={`${pack.label}の${metric.label}: ${count}件`}
                              onClick={() => setSelectedZoneId(pack.zoneId)}
                            >
                              <strong>{count}</strong>
                              <span>{metric.id === 'interaction' ? '組' : '件'}</span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        <footer>
          <span>色が濃いほど登録数が多い</span>
          <span>{auditMode === 'status' ? '単独完結型の対象外項目は「—」' : '自走・強制移動との接続を別々に集計'}</span>
        </footer>
      </section>

      {selectedPack && <SynergyDetail pack={selectedPack} onClose={() => setSelectedStatusId(null)} />}
      {selectedPositionPack && <PositionDetail pack={selectedPositionPack} onClose={() => setSelectedZoneId(null)} />}
    </main>
  );
}
