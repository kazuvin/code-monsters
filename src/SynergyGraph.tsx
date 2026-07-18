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

const unitById = new Map(UNITS.map((unit) => [unit.id, unit]));

const METRICS: Array<{ id: SynergyMetricId; label: string; shortLabel: string }> = [
  { id: 'producer', label: '付与技', shortLabel: '付与' },
  { id: 'condition', label: '状態条件', shortLabel: '条件' },
  { id: 'consumer', label: '利用・消費技', shortLabel: '利用' },
  { id: 'crossUnit', label: '別ユニット連携', shortLabel: '連携' },
  { id: 'counterplay', label: '対抗手段', shortLabel: '対抗' },
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

export function SynergyGraph({ onBack }: { onBack: () => void }) {
  const report = analyzeSynergies(GAME_DATA);
  const [selectedStatusId, setSelectedStatusId] = useState<string | null>(null);
  const selectedPack = report.packs.find((pack) => pack.statusId === selectedStatusId) ?? null;

  return (
    <main className="synergy-page">
      <header className="synergy-head">
        <button onClick={onBack}>
          <ArrowLeft size={15} /> デバッグルーム
        </button>
        <div>
          <span>STATUS INTERACTION AUDIT</span>
          <h1>シナジー・ヒートマップ</h1>
        </div>
        <p>状態ごとの登録件数を濃淡で比較します。セルをタップすると、技と担当ユニットを確認できます。</p>
      </header>

      <section className="synergy-summary" aria-label="シナジー検証サマリー">
        <article>
          <small>STATUS PACKS</small>
          <strong>{report.packs.length}</strong>
          <span>登録状態</span>
        </article>
        <article className={report.issues.length === 0 ? 'passed' : 'failed'}>
          <small>CI COVERAGE</small>
          <strong>
            {report.readyPacks}
            <i>/{report.packs.length}</i>
          </strong>
          <span>{report.issues.length === 0 ? '全パック網羅済み' : `${report.issues.length}件の不足`}</span>
        </article>
        <article>
          <small>COMBO / SOLO</small>
          <strong>
            {report.comboPacks}
            <i> / {report.standalonePacks}</i>
          </strong>
          <span>連携型 / 単独完結型</span>
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
                <th scope="col">状態</th>
                {METRICS.map((metric) => (
                  <th scope="col" key={metric.id} title={metric.label}>
                    <span>{metric.shortLabel}</span>
                    <small>{metric.id === 'crossUnit' ? '組' : '件'}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.packs.map((pack) => (
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
              ))}
            </tbody>
          </table>
        </div>
        <footer>
          <span>色が濃いほど登録数が多い</span>
          <span>単独完結型の対象外項目は「—」</span>
        </footer>
      </section>

      {selectedPack && <SynergyDetail pack={selectedPack} onClose={() => setSelectedStatusId(null)} />}
    </main>
  );
}
