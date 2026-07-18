import { ArrowLeft, ArrowRight, Check, GitBranch, ShieldCheck, X } from 'lucide-react';
import { analyzeSynergies, type SynergyInstructionRef } from './core/synergy';
import { GAME_DATA, UNITS } from './data';

const unitById = new Map(UNITS.map((unit) => [unit.id, unit]));

const InstructionNode = ({ instruction, role }: { instruction: SynergyInstructionRef; role: string }) => (
  <div className="synergy-node">
    <small>{role}</small>
    <b>{instruction.title}</b>
    <span>
      {instruction.fixedFor ? (unitById.get(instruction.fixedFor)?.name ?? instruction.fixedFor) : '全ユニット共通'}
    </span>
  </div>
);

export function SynergyGraph({ onBack }: { onBack: () => void }) {
  const report = analyzeSynergies(GAME_DATA);
  return (
    <main className="synergy-page">
      <header className="synergy-head">
        <button onClick={onBack}>
          <ArrowLeft size={15} /> デバッグルーム
        </button>
        <div>
          <span>STATUS INTERACTION AUDIT</span>
          <h1>シナジーグラフ</h1>
        </div>
        <p>状態を中心に、付与・利用・別ユニット連携・対抗手段をゲームデータから自動集計します。</p>
      </header>

      <section className="synergy-summary" aria-label="シナジー検証サマリー">
        <article>
          <small>STATUS PACKS</small>
          <strong>{report.packs.length}</strong>
          <span>登録状態</span>
        </article>
        <article className={report.issues.length === 0 ? 'passed' : 'failed'}>
          <small>CI READY</small>
          <strong>
            {report.readyPacks}
            <i>/{report.packs.length}</i>
          </strong>
          <span>{report.issues.length === 0 ? '全パック検証済み' : `${report.issues.length}件の不備`}</span>
        </article>
        <article>
          <small>COMBO / STANDALONE</small>
          <strong>
            {report.comboPacks}
            <i> / {report.standalonePacks}</i>
          </strong>
          <span>連携型 / 単独完結型</span>
        </article>
      </section>

      <section className="synergy-pack-list">
        {report.packs.map((pack, packIndex) => (
          <article className={`synergy-pack ${pack.ready ? 'is-ready' : 'has-issue'}`} key={pack.statusId}>
            <header>
              <div className="synergy-pack-index">{String(packIndex + 1).padStart(2, '0')}</div>
              <div>
                <small>{pack.mode === 'combo' ? 'COMBO STATUS' : 'STANDALONE STATUS'}</small>
                <h2>{pack.label}</h2>
                <code>{pack.statusId}</code>
              </div>
              <p>{pack.description}</p>
              <span className="synergy-ready-mark">
                {pack.ready ? <Check size={14} /> : <X size={14} />}
                {pack.ready ? 'READY' : 'INCOMPLETE'}
              </span>
            </header>

            <div className="synergy-signal-path">
              <div className="synergy-lane producer">
                <span className="synergy-lane-label">01 / PRODUCER</span>
                <div>
                  {pack.producers.map((instruction) => (
                    <InstructionNode instruction={instruction} role="状態を付与" key={instruction.id} />
                  ))}
                  {pack.producers.length === 0 && <div className="synergy-node missing">付与技なし</div>}
                </div>
              </div>
              <ArrowRight className="synergy-arrow" size={19} />
              <div className="synergy-status-core">
                <GitBranch size={18} />
                <small>02 / STATUS CORE</small>
                <strong>{pack.label}</strong>
                <span>効果量は状態定義が所有</span>
              </div>
              <ArrowRight className="synergy-arrow" size={19} />
              <div className="synergy-lane consumer">
                <span className="synergy-lane-label">03 / PAYOFF</span>
                <div>
                  {pack.consumers.map((instruction) => (
                    <InstructionNode instruction={instruction} role="状態を利用・消費" key={instruction.id} />
                  ))}
                  {pack.mode === 'standalone' && (
                    <div className="synergy-node standalone">
                      <small>単独完結</small>
                      <b>{pack.standaloneReason}</b>
                    </div>
                  )}
                  {pack.mode === 'combo' && pack.consumers.length === 0 && (
                    <div className="synergy-node missing">利用技なし</div>
                  )}
                </div>
              </div>
            </div>

            <div className="synergy-counter-row">
              <ShieldCheck size={17} />
              <div>
                <small>04 / COUNTERPLAY</small>
                <b>{pack.counterplay.description}</b>
              </div>
              {pack.conditions.length > 0 && (
                <div className="synergy-condition-links">
                  <small>RELATED CONDITIONS</small>
                  {pack.conditions.map((condition) => (
                    <span key={condition.id}>{condition.label}</span>
                  ))}
                </div>
              )}
            </div>

            <footer>
              {pack.checks.map((check) => (
                <span className={check.passed ? 'passed' : 'failed'} key={check.id} title={check.detail}>
                  {check.passed ? <Check size={11} /> : <X size={11} />}
                  {check.label}
                </span>
              ))}
            </footer>
          </article>
        ))}
      </section>
    </main>
  );
}
