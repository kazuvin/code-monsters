import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Coins, Lock, LockOpen, Pause, Play, RefreshCw, RotateCcw, ShoppingCart, Sparkles, Swords, X, Zap } from 'lucide-react';
import { BattleScene } from './BattleScene';
import { resolveImpact } from './combat';
import { DEFAULT_PROGRAMS, DEFAULT_REACTIONS, INSTRUCTIONS, REACTION_TRIGGERS, UNITS } from './data';
import type { BattleFlash, Fighter, Instruction, LogItem, ProgramBlock, Rarity, ReactionBlock, ReactionTrigger, UnitDefinition, UnitInventoryItem } from './types';

type Phase='build'|'battle'|'result';
type ShopItem={key:string;kind:'unit'|'instruction';id:string;locked:boolean};
type EditingSlot={scope:'program'|'reaction';index:number;field:'condition'|'action'}|null;
type BattleStep={
  flash:BattleFlash;
  log?:{actor:string;text:string;type:LogItem['type']};
  apply:(fighters:Fighter[])=>Fighter[];
};

const START_ACTIONS=['attack-low','approach'];
const START_CONDITIONS=['敵が射程範囲内','敵が射程範囲外'];
const START_UNITS=['volt','bastion'];
const ENEMY_IDS=['relay','bastion'];
const ADVANCE_STEP=5.2;
const RETREAT_STEP=6.5;
const ACTION_STEP_MS=260;
const REACTION_COOLDOWN=2.6;
const WALL_LEFT=10;
const WALL_RIGHT=90;
const rarityWeights:Record<Rarity,number>={common:72,rare:23,epic:5};
const rarityLabels:Record<Rarity,string>={common:'COMMON',rare:'RARE',epic:'EPIC'};
const SHOP_INSTRUCTIONS=INSTRUCTIONS.filter(instruction=>!instruction.fixedFor&&!START_ACTIONS.includes(instruction.id));

const instructionById=new Map(INSTRUCTIONS.map(x=>[x.id,x]));
const unitById=new Map(UNITS.map(x=>[x.id,x]));
const reactionTriggerLabels=new Map(REACTION_TRIGGERS.map(x=>[x.id,x.label]));
const conditionLabels:Record<string,string>={
  '敵が攻撃範囲内':'射程範囲内',
  '敵が攻撃範囲外':'射程範囲外',
  '敵が射程範囲内':'射程範囲内',
  '敵が射程範囲外':'射程範囲外',
  '条件なし':'いつでも',
};
const attackTypeLabels:Record<UnitDefinition['attackType'],string>={
  melee:'近距離',
  blunt:'打撃',
  sniper:'狙撃',
};
const actionLabel=(id:string)=>instructionById.get(id)?.title||id;
const conditionLabel=(condition:string)=>conditionLabels[condition]||condition;
const actionKindLabels:Record<Instruction['action'],string>={
  attack:'ATTACK',heavy:'IMPACT',move:'MOVE',retreat:'RETREAT',heal:'REPAIR',guard:'GUARD',buff:'BOOST',poison:'POISON',burn:'BURN',follow:'FOLLOW',wait:'WAIT',
};
const conditionDetails:Record<string,{flavor:string;effect:string}>={
  '敵が射程範囲内':{flavor:'手が届くなら、話は早い。',effect:'敵との距離 ≤ RNG'},
  '敵が射程範囲外':{flavor:'まだ届かない。なら、次の手を。',effect:'敵との距離 > RNG'},
  '条件なし':{flavor:'迷わず、いつでも実行。',effect:'常時'},
};
const reactionDetails:Record<ReactionTrigger,{title:string;flavor:string;effect:string}>={
  selfAttackHit:{title:'攻撃ヒット時',flavor:'こちらの一撃が決まった、その瞬間。',effect:'自分の攻撃命中'},
  selfHit:{title:'被弾時',flavor:'痛かったので、すぐ返事をします。',effect:'自分がダメージを受ける'},
  allyAttackHit:{title:'味方ヒット時',flavor:'仲間の一撃に、ぴったり便乗。',effect:'味方の攻撃命中'},
};
const metricNumber=(value:number)=>Number.isInteger(value)?String(value):value.toFixed(1);
const instructionMetrics=(instruction:Instruction,unit:UnitDefinition)=>{
  const movementScale=instruction.movementScale||1;
  if(instruction.action==='move')return [{label:'前進',value:`${metricNumber(ADVANCE_STEP*movementScale)} m`},{label:'停止',value:'RNG内'}];
  if(instruction.action==='retreat')return [{label:'後退',value:`${metricNumber(RETREAT_STEP*movementScale)} m`},{label:'停止',value:'壁際'}];
  if(instruction.action==='guard')return [{label:'被DMG',value:'−18%'},{label:'被KB',value:'−30%'}];
  if(instruction.action==='heal')return [{label:'回復',value:unit.role==='SUPPORT'?'25 HP':'18 HP'}];
  if(instruction.action==='buff')return [{label:'ATK',value:'+3'}];
  if(instruction.action==='wait')return [{label:'待機',value:'0.65 s'}];
  const rawDamage=instruction.action==='follow'?unit.attack*.58:unit.attack+(instruction.action==='heavy'?10:instruction.action==='poison'||instruction.action==='burn'?2:0);
  const scaledDamage=rawDamage*(instruction.impact?.damageScale??1);
  const knockbackPower=instruction.impact?.knockbackPower??(unit.attackType==='sniper'?0:unit.knockbackPower);
  return [{label:'基礎DMG',value:metricNumber(scaledDamage)},{label:'KB出力',value:metricNumber(knockbackPower)}];
};
const InstructionChoiceCard=({instruction,unit,active,reaction=false,onSelect}:{instruction:Instruction;unit:UnitDefinition;active:boolean;reaction?:boolean;onSelect:()=>void})=>{
  const metrics=instructionMetrics(instruction,unit);
  return <button className={`instruction-choice-card ${instruction.tone} ${active?'active':''} ${reaction?'reaction-choice':''}`} aria-pressed={active} onClick={onSelect}>
    <span className="choice-card-kicker">{actionKindLabels[instruction.action]} / {rarityLabels[instruction.rarity]}</span>
    <strong>{instruction.title}</strong>
    <span className="choice-card-flavor">{instruction.flavor}</span>
    <span className="choice-card-ability"><small>ABILITY</small><span>{metrics.map(metric=><span className="choice-metric" key={metric.label}><small>{metric.label}</small><b>{metric.value}</b></span>)}</span></span>
    <span className="choice-card-state">{active?'選択中':'選ぶ'}</span>
  </button>;
};
const ConditionChoiceCard=({title,flavor,effect,active,reaction=false,onSelect}:{title:string;flavor:string;effect:string;active:boolean;reaction?:boolean;onSelect:()=>void})=><button className={`condition-choice-card ${active?'active':''} ${reaction?'reaction-choice':''}`} aria-pressed={active} onClick={onSelect}>
  <span className="choice-card-kicker">{reaction?'REACTION TRIGGER':'IF CONDITION'}</span>
  <strong>{title}</strong>
  <span className="choice-card-flavor">{flavor}</span>
  <span className="condition-effect"><small>判定</small><b>{effect}</b></span>
  <span className="choice-card-state">{active?'選択中':'選ぶ'}</span>
</button>;
const seededRandom=(seed:number)=>{
  const x=Math.sin(seed*999.7+17.13)*10000;
  return x-Math.floor(x);
};
const weightedPick=<T extends {rarity:Rarity}>(items:T[],seed:number)=>{
  const total=items.reduce((sum,item)=>sum+rarityWeights[item.rarity],0);
  let cursor=seededRandom(seed)*total;
  for(const item of items){
    cursor-=rarityWeights[item.rarity];
    if(cursor<=0)return item;
  }
  return items[items.length-1];
};

const makeUnitItem=(unitId:string,index:number):UnitInventoryItem=>{
  const unit=unitById.get(unitId)!;
  return {
    ...unit,
    inventoryId:`${unitId}-${index}-${Math.random().toString(36).slice(2,7)}`,
    program:(DEFAULT_PROGRAMS[unitId]||['attack-low','approach']).map(actionId=>({
      actionId,
      conditionId:instructionById.get(actionId)?.condition||'条件なし',
      fixedAction:instructionById.get(actionId)?.fixedFor===unit.id,
    })),
    reaction:DEFAULT_REACTIONS[unitId]?{...DEFAULT_REACTIONS[unitId]!}:null,
  };
};

const initialUnits=START_UNITS.map(makeUnitItem);

function makeShop(seed=0):ShopItem[]{
  const picks=Array.from({length:5},(_,i)=>{
    const kind=i===0||i===3?'unit' as const:'instruction' as const;
    const id=kind==='unit'?weightedPick(UNITS,seed*11+i+1).id:weightedPick(SHOP_INSTRUCTIONS,seed*13+i+5).id;
    return {kind,id};
  });
  if(seed===0)picks[picks.length-1]={kind:'instruction',id:'knock-away'};
  return picks.map((p,i)=>({...p,key:`${seed}-${i}`,locked:false}));
}

function freshFighters(team:UnitInventoryItem[]):Fighter[]{
  const enemies=ENEMY_IDS.map((id,i)=>makeUnitItem(id,100+i));
  return [
    ...team.map((u,i)=>({...u,instanceId:u.inventoryId,team:'ally' as const,hp:u.maxHp,x:WALL_LEFT+2+i*4,z:0,cooldown:i*.18,reactionCooldown:0,guarded:false,poison:0})),
    ...enemies.map((u,i)=>({...u,instanceId:`enemy-${u.inventoryId}`,team:'enemy' as const,hp:u.maxHp,x:WALL_RIGHT-2-i*4,z:0,cooldown:i*.18+.08,reactionCooldown:0,guarded:false,poison:0})),
  ];
}

const clampStage=(x:number)=>Math.max(WALL_LEFT,Math.min(WALL_RIGHT,x));
const distanceTo=(a:Fighter,b:Fighter)=>Math.abs(a.x-b.x);
const nearestEnemy=(actor:Fighter,enemies:Fighter[])=>[...enemies].sort((a,b)=>distanceTo(actor,a)-distanceTo(actor,b))[0];
const advanceToward=(actor:Fighter,target:Fighter,step=ADVANCE_STEP)=>{
  if(actor.team==='ally')return clampStage(Math.min(actor.x+step,target.x-actor.range*.78));
  return clampStage(Math.max(actor.x-step,target.x+actor.range*.78));
};
const retreatFrom=(actor:Fighter,step=RETREAT_STEP)=>clampStage(actor.team==='ally'?actor.x-step:actor.x+step);
const knockback=(target:Fighter,distance:number)=>clampStage(target.team==='ally'?target.x-distance:target.x+distance);

const canRunCondition=(condition:string,ready:Fighter,enemies:Fighter[],allies:Fighter[])=>{
  const nearest=nearestEnemy(ready,enemies);
  const lowEnemy=[...enemies].sort((a,b)=>a.hp-b.hp)[0];
  const lowAlly=[...allies].sort((a,b)=>a.hp-b.hp)[0];
  const inRange=distanceTo(ready,nearest)<=ready.range;
  return condition==='条件なし'
    || (condition==='敵が攻撃範囲内'&&inRange)
    || (condition==='敵が攻撃範囲外'&&!inRange)
    || (condition==='敵が射程範囲内'&&inRange)
    || (condition==='敵が射程範囲外'&&!inRange)
    || (condition==='敵HPが50%以下'&&lowEnemy.hp/lowEnemy.maxHp<=.5)
    || (condition==='自分のHPが30%以下'&&ready.hp/ready.maxHp<=.3)
    || (condition==='味方のHPが50%以下'&&lowAlly.hp/lowAlly.maxHp<=.5)
    || (condition==='状態異常中の敵がいる'&&enemies.some(f=>f.poison>0));
};

const tickCooldowns=(fighters:Fighter[],dt:number)=>fighters.map(f=>({
  ...f,
  cooldown:f.cooldown-dt,
  reactionCooldown:f.reactionCooldown-dt,
}));

export function App(){
  const [phase,setPhase]=useState<Phase>('build');
  const [coins,setCoins]=useState(10);
  const [round,setRound]=useState(1);
  const [team,setTeam]=useState<UnitInventoryItem[]>(initialUnits);
  const [bench,setBench]=useState<UnitInventoryItem[]>([]);
  const [selected,setSelected]=useState(0);
  const [ownedActions,setOwnedActions]=useState<string[]>(START_ACTIONS);
  const [ownedConditions,setOwnedConditions]=useState<string[]>([...START_CONDITIONS]);
  const [editingSlot,setEditingSlot]=useState<EditingSlot>({scope:'program',index:0,field:'condition'});
  const [shopSeed,setShopSeed]=useState(0);
  const [shop,setShop]=useState(()=>makeShop());
  const [fighters,setFighters]=useState(()=>freshFighters(initialUnits));
  const [logs,setLogs]=useState<LogItem[]>([]);
  const [elapsed,setElapsed]=useState(0);
  const elapsedRef=useRef(0);
  const [speed,setSpeed]=useState(1);
  const [paused,setPaused]=useState(false);
  const [flash,setFlash]=useState<BattleFlash|null>(null);
  const battleQueueRef=useRef<BattleStep[]>([]);
  const lastStepAtRef=useRef(0);
  const [logsOpen,setLogsOpen]=useState(false);
  const [toast,setToast]=useState('');
  const logId=useRef(0);
  const selectedUnit=team[Math.min(selected,team.length-1)];
  const currentProgram=selectedUnit?.program||[];
  const currentReaction=selectedUnit?.reaction||null;
  const winner=phase==='result'?(fighters.filter(f=>f.team==='enemy'&&f.hp>0).length===0?'勝利':'敗北'):'';

  const addLog=useCallback((actor:string,text:string,type:LogItem['type']='info')=>{
    const t=Math.max(0,elapsedRef.current);
    setLogs(v=>[{id:++logId.current,time:`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`,actor,text,type},...v].slice(0,36));
  },[]);

  const updateSelectedProgram=(updater:(program:ProgramBlock[])=>ProgramBlock[])=>{
    setTeam(units=>units.map((unit,i)=>i===selected?{...unit,program:updater(unit.program)}:unit));
  };
  const updateSelectedReaction=(updater:(reaction:ReactionBlock|null)=>ReactionBlock|null)=>{
    setTeam(units=>units.map((unit,i)=>i===selected?{...unit,reaction:updater(unit.reaction)}:unit));
  };

  const refresh=()=>{
    if(coins<1){setToast('コインが足りません');return}
    setCoins(c=>c-1);
    setShopSeed(s=>s+1);
    setShop(old=>{
      const next=makeShop(shopSeed+1);
      return next.map((x,i)=>old[i]?.locked?old[i]:x);
    });
  };

  const toggleLock=(key:string)=>setShop(s=>s.map(x=>x.key===key?{...x,locked:!x.locked}:x));

  const buy=(item:ShopItem)=>{
    if(item.kind==='unit'){
      const u=unitById.get(item.id)!;
      if(coins<u.price){setToast('コインが足りません');return}
      const itemUnit=makeUnitItem(u.id,team.length+bench.length);
      setCoins(c=>c-u.price);
      setBench(v=>[...v,itemUnit]);
      setToast(`${u.name}をインベントリに追加しました`);
    }else{
      const ins=instructionById.get(item.id)!;
      if(coins<ins.price){setToast('コインが足りません');return}
      setCoins(c=>c-ins.price);
      setOwnedActions(v=>v.includes(ins.id)?v:[...v,ins.id]);
      setOwnedConditions(v=>v.includes(ins.condition)?v:[...v,ins.condition]);
      setToast(`${ins.title}を取得しました`);
    }
    setShop(s=>s.filter(x=>x.key!==item.key));
  };

  const moveInstruction=(index:number,dir:-1|1)=>{
    updateSelectedProgram(program=>{
      const arr=[...program];
      const to=index+dir;
      if(to<0||to>=arr.length)return arr;
      [arr[index],arr[to]]=[arr[to],arr[index]];
      return arr;
    });
  };
  const removeInstruction=(index:number)=>{
    if(currentProgram[index]?.fixedAction)return;
    updateSelectedProgram(program=>program.filter((_,i)=>i!==index));
  };
  const addInstruction=(actionId=ownedActions[0])=>{
    if(currentProgram.length>=selectedUnit.programLimit){setToast(`指示容量は${selectedUnit.programLimit}です`);return}
    const action=instructionById.get(actionId)!;
    updateSelectedProgram(program=>[...program,{conditionId:action.condition,actionId}]);
    setEditingSlot({scope:'program',index:currentProgram.length,field:'condition'});
  };
  const addReaction=()=>{
    if(currentReaction)return;
    updateSelectedReaction(()=>({trigger:REACTION_TRIGGERS[0].id,actionId:ownedActions[0]}));
    setEditingSlot({scope:'reaction',index:0,field:'condition'});
  };
  const removeReaction=()=>{
    if(currentReaction?.fixedReaction)return;
    updateSelectedReaction(()=>null);
    setEditingSlot({scope:'program',index:0,field:'condition'});
  };

  const sellSelected=()=>{
    if(team.length<=1){setToast('最後のユニットは売却できません');return}
    const value=Math.max(2,selectedUnit.price-1);
    setCoins(c=>c+value);
    setTeam(t=>t.filter((_,i)=>i!==selected));
    setSelected(0);
    setToast(`${selectedUnit.name}を ${value} コインで売却しました`);
  };

  const moveTeamUnitToBench=(index:number)=>{
    if(team.length<=1){setToast('最後のユニットは外せません');return}
    setBench(v=>[...v,team[index]]);
    setTeam(v=>v.filter((_,i)=>i!==index));
    setSelected(0);
  };

  const equipBenchUnit=(inventoryId:string)=>{
    const unit=bench.find(x=>x.inventoryId===inventoryId);
    if(!unit)return;
    setBench(v=>v.filter(x=>x.inventoryId!==inventoryId));
    setTeam(v=>[...v,unit]);
    setSelected(team.length);
  };

  const replaceFocusedSlot=(id:string)=>{
    if(!editingSlot)return;
    if(editingSlot.scope==='reaction'){
      if(currentReaction?.fixedReaction)return;
      updateSelectedReaction(reaction=>reaction?editingSlot.field==='condition'?{...reaction,trigger:id as ReactionTrigger}:{...reaction,actionId:id}:reaction);
      return;
    }
    if(editingSlot.field==='condition'){
      updateSelectedProgram(program=>program.map((block,i)=>i===editingSlot.index?{...block,conditionId:id}:block));
      return;
    }
    if(currentProgram[editingSlot.index]?.fixedAction)return;
    updateSelectedProgram(program=>program.map((block,i)=>i===editingSlot.index?{...block,actionId:id}:block));
  };

  const startBattle=()=>{
    const fs=freshFighters(team);
    battleQueueRef.current=[];
    lastStepAtRef.current=0;
    setFlash(null);
    setFighters(fs);
    setLogs([]);
    setElapsed(0);
    elapsedRef.current=0;
    setPaused(false);
    setLogsOpen(false);
    setPhase('battle');
    setToast('プログラムを実行します');
  };
  const reset=()=>{battleQueueRef.current=[];lastStepAtRef.current=0;setFlash(null);setPhase('build');setFighters(freshFighters(team));setLogs([]);setLogsOpen(false);setElapsed(0);elapsedRef.current=0};
  const completeBattle=useCallback(()=>{setLogsOpen(false);setPhase('result')},[]);

  useEffect(()=>{
    if(phase!=='battle'||paused)return;
    const timer=setInterval(()=>{
      const dt=.22*speed;
      elapsedRef.current+=dt;
      setElapsed(elapsedRef.current);
      const queuedStep=battleQueueRef.current[0];
      const now=Date.now();
      if(queuedStep&&now-lastStepAtRef.current>=ACTION_STEP_MS/speed){
        battleQueueRef.current=battleQueueRef.current.slice(1);
        lastStepAtRef.current=now;
        setFighters(prev=>{
          const next=queuedStep.apply(tickCooldowns(prev,dt));
          setFlash({...queuedStep.flash,n:now});
          if(queuedStep.log)addLog(queuedStep.log.actor,queuedStep.log.text,queuedStep.log.type);
          const aliveA=next.some(f=>f.team==='ally'&&f.hp>0);
          const aliveE=next.some(f=>f.team==='enemy'&&f.hp>0);
          if(!aliveA||!aliveE)setTimeout(completeBattle,420);
          return next;
        });
        return;
      }
      if(queuedStep){
        setFighters(prev=>tickCooldowns(prev,dt));
        return;
      }
      setFighters(prev=>{
        let displayNext=tickCooldowns(prev,dt);
        let next=displayNext.map(f=>({...f}));
        const queued:BattleStep[]=[];
        const queueStep=(step:BattleStep)=>{
          queued.push(step);
          battleQueueRef.current.push(step);
        };
        const reactionFor=(fighter:Fighter):ReactionBlock|null=>fighter.team==='ally'
          ? team.find(unit=>unit.inventoryId===fighter.instanceId)?.reaction||null
          : DEFAULT_REACTIONS[fighter.id]||null;
        const queueReaction=(reactorId:string,trigger:ReactionTrigger,sourceId:string,targetId:string)=>{
          const reactorIndex=next.findIndex(f=>f.instanceId===reactorId);
          if(reactorIndex<0)return;
          const reactor=next[reactorIndex];
          const reaction=reactionFor(reactor);
          if(!reaction||reaction.trigger!==trigger||reactor.hp<=0||reactor.reactionCooldown>0)return;
          const source=next.find(f=>f.instanceId===sourceId);
          const eventTarget=next.find(f=>f.instanceId===targetId);
          const target=trigger==='selfHit'?source:eventTarget;
          const ins=instructionById.get(reaction.actionId);
          if(!ins)return;
          const actionLabel=`⚡ ${ins.short}`;
          if(ins.action==='guard'){
            next[reactorIndex]={...reactor,guarded:true,reactionCooldown:REACTION_COOLDOWN};
            queueStep({
              flash:{id:reactor.instanceId,kind:'guard',actionLabel,reaction:true,n:Date.now()},
              log:{actor:reactor.name,text:`REACTION｜${ins.short}`,type:'reaction'},
              apply:fighters=>fighters.map(f=>f.instanceId===reactor.instanceId?{...f,guarded:true,reactionCooldown:REACTION_COOLDOWN}:f),
            });
            return;
          }
          if(ins.action==='retreat'){
            const nx=retreatFrom(reactor,RETREAT_STEP*(ins.movementScale||1));
            next[reactorIndex]={...reactor,x:nx,reactionCooldown:REACTION_COOLDOWN};
            queueStep({
              flash:{id:reactor.instanceId,kind:ins.id==='arrow-reposition'?'retreat':'move',actionLabel,reaction:true,n:Date.now()},
              log:{actor:reactor.name,text:`REACTION｜${ins.short}｜戦線 ${Math.round(nx)}`,type:'reaction'},
              apply:fighters=>fighters.map(f=>f.instanceId===reactor.instanceId?{...f,x:nx,reactionCooldown:REACTION_COOLDOWN}:f),
            });
            return;
          }
          if(ins.action==='move'){
            if(!target||target.hp<=0||distanceTo(reactor,target)<=reactor.range)return;
            const nx=advanceToward(reactor,target,ADVANCE_STEP*(ins.movementScale||1));
            next[reactorIndex]={...reactor,x:nx,reactionCooldown:REACTION_COOLDOWN};
            queueStep({
              flash:{id:reactor.instanceId,kind:ins.id==='relay-dash'?'dash':'move',actionLabel,reaction:true,n:Date.now()},
              log:{actor:reactor.name,text:`REACTION｜${ins.short}｜戦線 ${Math.round(nx)}`,type:'reaction'},
              apply:fighters=>fighters.map(f=>f.instanceId===reactor.instanceId?{...f,x:nx,reactionCooldown:REACTION_COOLDOWN}:f),
            });
            return;
          }
          if(!target||target.hp<=0)return;
          const isFollow=ins.action==='follow';
          if(!isFollow&&distanceTo(reactor,target)>reactor.range){
            next[reactorIndex]={...reactor,reactionCooldown:REACTION_COOLDOWN};
            queueStep({
              flash:{id:reactor.instanceId,kind:'miss',attackType:reactor.attackType,actionLabel:`${actionLabel}｜MISS`,reaction:true,n:Date.now()},
              log:{actor:reactor.name,text:`REACTION｜${ins.short} → ${target.name}｜空振り（射程外）`,type:'miss'},
              apply:fighters=>fighters.map(f=>f.instanceId===reactor.instanceId?{...f,reactionCooldown:REACTION_COOLDOWN}:f),
            });
            return;
          }
          const targetIndex=next.findIndex(f=>f.instanceId===target.instanceId);
          const raw=isFollow?reactor.attack*.58:reactor.attack+(ins.action==='heavy'?10:ins.action==='poison'||ins.action==='burn'?2:0);
          const impact=resolveImpact({
            rawDamage:raw,
            minimumDamage:isFollow?3:4,
            attackType:reactor.attackType,
            attackerKnockbackPower:reactor.knockbackPower,
            targetDefense:target.defense,
            targetWeight:target.weight,
            targetRole:target.role,
            targetGuarded:target.guarded,
            impact:ins.impact,
          });
          const damage=impact.damage;
          const hp=Math.max(0,target.hp-damage);
          const poison=ins.action==='poison'||ins.action==='burn'?target.poison+1:target.poison;
          const knockbackX=hp>0&&impact.knockbackDistance>0?knockback(target,impact.knockbackDistance):target.x;
          next[reactorIndex]={...reactor,reactionCooldown:REACTION_COOLDOWN};
          next[targetIndex]={...target,hp,poison,x:knockbackX};
          const attackKind=ins.action==='heavy'||ins.action==='poison'||ins.action==='burn'||ins.action==='follow'?ins.action:'attack';
          queueStep({
            flash:{id:reactor.instanceId,kind:attackKind,targetId:target.instanceId,attackType:reactor.attackType,actionLabel,reaction:true,n:Date.now()},
            log:{actor:reactor.name,text:`REACTION｜${ins.short} → ${target.name}｜${damage} dmg`,type:'reaction'},
            apply:fighters=>fighters.map(f=>{
              if(f.instanceId===reactor.instanceId)return {...f,reactionCooldown:REACTION_COOLDOWN};
              if(f.instanceId===target.instanceId)return {...f,hp,poison};
              return f;
            }),
          });
          if(hp>0&&knockbackX!==target.x)queueStep({
            flash:{id:target.instanceId,kind:'hit',actionLabel:'KNOCKBACK',n:Date.now()},
            apply:fighters=>fighters.map(f=>f.instanceId===target.instanceId?{...f,x:knockbackX}:f),
          });
          if(hp<=0&&target.hp>0)queueStep({
            flash:{id:target.instanceId,kind:'death',actionLabel:'DOWN',n:Date.now()},
            apply:fighters=>fighters,
          });
        };
        const triggerHitReactions=(attackerId:string,targetId:string)=>{
          const attacker=next.find(f=>f.instanceId===attackerId);
          const target=next.find(f=>f.instanceId===targetId);
          if(!attacker||!target)return;
          if(target.hp>0)queueReaction(target.instanceId,'selfHit',attacker.instanceId,target.instanceId);
          queueReaction(attacker.instanceId,'selfAttackHit',attacker.instanceId,target.instanceId);
          for(const ally of next.filter(f=>f.team===attacker.team&&f.instanceId!==attacker.instanceId&&f.hp>0)){
            queueReaction(ally.instanceId,'allyAttackHit',attacker.instanceId,target.instanceId);
          }
        };
        if(elapsedRef.current>=60){
          const overtimeStep=Math.floor((elapsedRef.current-60)/5);
          const rate=.01*Math.pow(2,overtimeStep);
          displayNext=displayNext.map(f=>{
            if(f.hp<=0)return f;
            const hp=Math.max(0,f.hp-f.maxHp*rate*dt);
            if(hp<=0&&f.hp>0)queueStep({
              flash:{id:f.instanceId,kind:'death',actionLabel:'DOWN',n:Date.now()},
              apply:fighters=>fighters,
            });
            return {...f,hp};
          });
          next=displayNext.map(f=>({...f}));
          if(Math.floor(elapsedRef.current)!==Math.floor(elapsedRef.current-dt))addLog('SYSTEM',`OVERHEAT｜最大HPの ${(rate*100).toFixed(0)}% ダメージ`,'hit');
        }
        for(const ready of [...next].filter(f=>f.hp>0&&f.cooldown<=0).sort((a,b)=>b.speed-a.speed)){
          const ri=next.findIndex(f=>f.instanceId===ready.instanceId&&f.hp>0);
          if(ri<0)continue;
          const actor=next[ri];
          const enemies=next.filter(f=>f.team!==actor.team&&f.hp>0);
          const allies=next.filter(f=>f.team===actor.team&&f.hp>0);
          if(enemies.length===0||allies.length===0)break;
          const enemyProgram=(DEFAULT_PROGRAMS[actor.id]||['attack-low','approach']).map(actionId=>({actionId,conditionId:instructionById.get(actionId)?.condition||'条件なし'}));
          const ids=actor.team==='ally'?(team.find(u=>u.inventoryId===actor.instanceId)?.program||[]):enemyProgram;
          let acted=false;
          const nextCooldown=Math.max(.45,1.45/actor.speed);
          next[ri]={...next[ri],cooldown:nextCooldown,guarded:false};
          displayNext=displayNext.map(f=>f.instanceId===actor.instanceId?{...f,cooldown:nextCooldown,guarded:false}:f);
          for(const block of ids.slice(0,actor.programLimit)){
            const current=next[ri];
            if(!current||current.hp<=0)break;
            const currentEnemies=next.filter(f=>f.team!==current.team&&f.hp>0);
            const currentAllies=next.filter(f=>f.team===current.team&&f.hp>0);
            if(currentEnemies.length===0||currentAllies.length===0)break;
            const ins=instructionById.get(block.actionId);
            if(!ins)continue;
            if(!canRunCondition(block.conditionId,current,currentEnemies,currentAllies))continue;
            const nearest:Fighter=nearestEnemy(current,currentEnemies);
            const lowEnemy=[...currentEnemies].sort((a,b)=>a.hp-b.hp)[0];
            const lowAlly=[...currentAllies].sort((a,b)=>a.hp-b.hp)[0];
            acted=true;
            if(ins.action==='move'){
              if(distanceTo(current,nearest)<=current.range){
                queueStep({
                  flash:{id:current.instanceId,kind:'wait',actionLabel:'待機',n:Date.now()},
                  log:{actor:current.name,text:`${nearest.name}と対峙｜前線を維持`,type:'info'},
                  apply:fighters=>fighters,
                });
              }else{
                const nx=advanceToward(current,nearest,ADVANCE_STEP*(ins.movementScale||1));
                const isDash=ins.id==='relay-dash';
                next[ri]={...current,x:nx};
                queueStep({
                  flash:{id:current.instanceId,kind:isDash?'dash':'move',actionLabel:ins.short,n:Date.now()},
                  log:{actor:current.name,text:`${nearest.name}へ${ins.short}｜戦線 ${Math.round(nx)}`,type:'info'},
                  apply:fighters=>fighters.map(f=>f.instanceId===current.instanceId?{...f,x:nx}:f),
                });
              }
            }else if(ins.action==='heal'){
              const target=ins.target==='自分'?current:lowAlly;
              const ti=next.findIndex(f=>f.instanceId===target.instanceId);
              const amount=Math.round(current.role==='SUPPORT'?25:18);
              const hp=Math.min(target.maxHp,target.hp+amount);
              next[ti]={...next[ti],hp};
              queueStep({
                flash:{id:target.instanceId,kind:'heal',actionLabel:'回復',n:Date.now()},
                log:{actor:current.name,text:`${target.name}を ${amount} 修復`,type:'heal'},
                apply:fighters=>fighters.map(f=>f.instanceId===target.instanceId?{...f,hp}:f),
              });
            }else if(ins.action==='retreat'){
              const nx=retreatFrom(current,RETREAT_STEP*(ins.movementScale||1));
              const isReposition=ins.id==='arrow-reposition';
              next[ri]={...current,x:nx};
              queueStep({
                flash:{id:current.instanceId,kind:isReposition?'retreat':'move',actionLabel:ins.short,n:Date.now()},
                log:{actor:current.name,text:`${nearest.name}から${ins.short}｜戦線 ${Math.round(nx)}`,type:'info'},
                apply:fighters=>fighters.map(f=>f.instanceId===current.instanceId?{...f,x:nx}:f),
              });
            }else if(ins.action==='guard'){
              next[ri]={...current,guarded:true};
              queueStep({
                flash:{id:current.instanceId,kind:'guard',actionLabel:ins.short,n:Date.now()},
                log:{actor:current.name,text:'防御姿勢へ移行',type:'info'},
                apply:fighters=>fighters.map(f=>f.instanceId===current.instanceId?{...f,guarded:true}:f),
              });
            }else if(ins.action==='buff'){
              const attack=current.attack+3;
              next[ri]={...current,attack};
              queueStep({
                flash:{id:current.instanceId,kind:'heal',actionLabel:'強化',n:Date.now()},
                log:{actor:current.name,text:'攻撃出力を +3 強化',type:'heal'},
                apply:fighters=>fighters.map(f=>f.instanceId===current.instanceId?{...f,attack}:f),
              });
            }else if(ins.action==='wait'){
              next[ri]={...current,cooldown:.65};
              queueStep({
                flash:{id:current.instanceId,kind:'wait',actionLabel:'待機',n:Date.now()},
                log:{actor:current.name,text:'同期タイミングを待機',type:'info'},
                apply:fighters=>fighters.map(f=>f.instanceId===current.instanceId?{...f,cooldown:.65}:f),
              });
            }else{
              const target:Fighter=ins.target==='最もHPが低い敵'?lowEnemy:nearest;
              const isFollow=ins.action==='follow';
              if(!isFollow&&distanceTo(current,target)>current.range){
                queueStep({
                  flash:{id:current.instanceId,kind:'miss',attackType:current.attackType,actionLabel:`${ins.short}｜MISS`,n:Date.now()},
                  log:{actor:current.name,text:`${ins.short} → ${target.name}｜空振り（射程外）`,type:'miss'},
                  apply:fighters=>fighters,
                });
              }else{
                const ti=next.findIndex(f=>f.instanceId===target.instanceId);
                const raw=(isFollow?current.attack*.58:current.attack+(ins.action==='heavy'?10:ins.action==='poison'||ins.action==='burn'?2:0))+(target.poison&&current.role==='VENOM'?6:0);
                const impact=resolveImpact({
                  rawDamage:raw,
                  minimumDamage:isFollow?3:4,
                  attackType:current.attackType,
                  attackerKnockbackPower:current.knockbackPower,
                  targetDefense:target.defense,
                  targetWeight:target.weight,
                  targetRole:target.role,
                  targetGuarded:target.guarded,
                  impact:ins.impact,
                });
                const damage=impact.damage;
                const hp=Math.max(0,target.hp-damage);
                const poison=ins.action==='poison'||ins.action==='burn'?target.poison+1:target.poison;
                const knockbackX=hp>0&&impact.knockbackDistance>0?knockback(target,impact.knockbackDistance):target.x;
                next[ti]={...next[ti],x:knockbackX,hp,poison};
                const attackKind=ins.action==='heavy'||ins.action==='poison'||ins.action==='burn'||ins.action==='follow'?ins.action:'attack';
                queueStep({
                  flash:{id:current.instanceId,kind:attackKind,targetId:target.instanceId,attackType:current.attackType,actionLabel:ins.id==='attack-low'?attackTypeLabels[current.attackType]:ins.short,n:Date.now()},
                  log:{actor:current.name,text:`${ins.short||'攻撃'} / ${current.attackType} → ${target.name}｜${damage} dmg`,type:'hit'},
                  apply:fighters=>fighters.map(f=>f.instanceId===target.instanceId?{...f,hp,poison}:f),
                });
                if(hp>0&&knockbackX!==target.x){
                  queueStep({
                    flash:{id:target.instanceId,kind:'hit',actionLabel:'KNOCKBACK',n:Date.now()},
                    apply:fighters=>fighters.map(f=>f.instanceId===target.instanceId?{...f,x:knockbackX}:f),
                  });
                }
                if(hp<=0&&target.hp>0){
                  queueStep({
                    flash:{id:target.instanceId,kind:'death',actionLabel:'DOWN',n:Date.now()},
                    apply:fighters=>fighters,
                  });
                }
                if(!isFollow)triggerHitReactions(current.instanceId,target.instanceId);
              }
            }
          }
          if(!acted)addLog(actor.name,'実行できる指示なし','skip');
        }
        const aliveA=next.some(f=>f.team==='ally'&&f.hp>0);
        const aliveE=next.some(f=>f.team==='enemy'&&f.hp>0);
        if((!aliveA||!aliveE)&&queued.length===0)setTimeout(completeBattle,420);
        return displayNext;
      });
    },220);
    return()=>clearInterval(timer);
  },[phase,paused,speed,team,addLog,completeBattle]);

  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),1800);return()=>clearTimeout(t)},[toast]);
  const teamHp=useMemo(()=>fighters.filter(f=>f.team==='ally').reduce((n,f)=>n+Math.max(0,f.hp),0),[fighters]);
  const enemyHp=useMemo(()=>fighters.filter(f=>f.team==='enemy').reduce((n,f)=>n+Math.max(0,f.hp),0),[fighters]);
  const fighterGroups=useMemo(()=>[
    {key:'ally',label:'味方ユニット',units:fighters.filter(f=>f.team==='ally')},
    {key:'enemy',label:'敵ユニット',units:fighters.filter(f=>f.team==='enemy')},
  ],[fighters]);
  const statusTags=(fighter:Fighter)=>{
    if(fighter.hp<=0)return ['戦闘不能'];
    const tags=['正常'];
    if(fighter.guarded)tags.push('防御');
    if(fighter.poison>0)tags.push(`毒 ${fighter.poison}`);
    if(fighter.cooldown>.55)tags.push('準備中');
    return tags;
  };
  const cooldownProgress=(fighter:Fighter)=>{
    const maxCooldown=Math.max(.45,1.45/fighter.speed);
    return Math.max(0,Math.min(1,1-fighter.cooldown/maxCooldown));
  };

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">CM_</span><div><strong>CODE MONSTERS</strong><small>BUILD / COMPILE / BATTLE</small></div></div><div className="round"><small>ROUND</small><b>{String(round).padStart(2,'0')}</b><span>1W / 0L</span></div><div className="wallet"><Coins size={16}/><b>{coins}</b><small>COIN</small></div></header>
    {phase==='build'?<div className="build-layout">
      <section className="workbench">
        <div className="section-head"><div><span className="step-no">01</span><h2>作戦</h2></div><span className="capacity">通常 {currentProgram.length} / {selectedUnit.programLimit}</span></div>
        <div className="unit-tabs">{team.map((u,i)=><button key={u.inventoryId} className={selected===i?'active':''} onClick={()=>{setSelected(i);setEditingSlot({scope:'program',index:0,field:'condition'})}}><span className="unit-dot" style={{background:`#${u.color.toString(16).padStart(6,'0')}`}}/><span>{u.name}<small>{u.role}</small></span><b>{u.code}</b></button>)}</div>
        <div className="unit-meta"><div><span>{selectedUnit.code}</span><h3>{selectedUnit.name}</h3><small>{attackTypeLabels[selectedUnit.attackType]} / {rarityLabels[selectedUnit.rarity]} / 枠 {selectedUnit.programLimit}</small></div><div className="stats"><span>HP <b>{selectedUnit.maxHp}</b></span><span>ATK <b>{selectedUnit.attack}</b></span><span>RNG <b>{selectedUnit.range}</b></span><span>KB <b>{selectedUnit.knockbackPower}</b></span><span>WT <b>{selectedUnit.weight}</b></span><span>SPD <b>{selectedUnit.speed}</b></span></div><button className="sell-unit" onClick={sellSelected}>売却 +{Math.max(2,selectedUnit.price-1)}</button><button className="bench-unit" onClick={()=>moveTeamUnitToBench(selected)}>外す</button></div>
        <div className="mode-label"><span>NORMAL LOOP</span><b>クールダウン完了時に上から評価</b></div>
        <div className="program-list sentence-list">{currentProgram.map((block,i)=>{const ins=instructionById.get(block.actionId)!;const conditionActive=editingSlot?.scope==='program'&&editingSlot.index===i&&editingSlot.field==='condition';const actionActive=editingSlot?.scope==='program'&&editingSlot.index===i&&editingSlot.field==='action';return <article className={`code-block sentence-block ${ins.tone} ${block.fixedAction?'fixed-action':''}`} key={`${block.actionId}-${block.conditionId}-${i}`}><div className="line-no">{i+1}</div><div className="sentence-copy"><span>もし</span><button className={conditionActive?'word-slot active':'word-slot'} onClick={()=>setEditingSlot({scope:'program',index:i,field:'condition'})}>{conditionLabel(block.conditionId)}</button><span>なら</span><button className={actionActive?'word-slot active':'word-slot'} disabled={block.fixedAction} onClick={()=>setEditingSlot({scope:'program',index:i,field:'action'})}>{actionLabel(block.actionId)}</button></div><div className="line-actions"><button aria-label="上へ移動" disabled={i===0} onClick={()=>moveInstruction(i,-1)}><ArrowUp size={13}/></button><button aria-label="下へ移動" disabled={i===currentProgram.length-1} onClick={()=>moveInstruction(i,1)}><ArrowDown size={13}/></button><button aria-label="削除" disabled={block.fixedAction} onClick={()=>removeInstruction(i)}><X size={13}/></button></div></article>})}<button className="add-block" onClick={()=>addInstruction(ownedActions[0])}>＋ 通常作戦を追加</button></div>
        <section className="reaction-loop">
          <div className="mode-label reaction-mode-label"><span>REACTION LOOP</span><b>常時監視 · {currentReaction?'1 / 1':'0 / 1'} · CD {REACTION_COOLDOWN.toFixed(1)} SEC</b></div>
          <div className="program-list sentence-list reaction-list">{currentReaction?<article className={`code-block sentence-block violet reaction-code-block ${currentReaction.fixedReaction?'fixed-action':''}`}><div className="line-no"><Zap size={13}/></div><div className="sentence-copy"><span>もし</span><button className={editingSlot?.scope==='reaction'&&editingSlot.field==='condition'?'word-slot active':'word-slot'} disabled={currentReaction.fixedReaction} onClick={()=>setEditingSlot({scope:'reaction',index:0,field:'condition'})}>{reactionTriggerLabels.get(currentReaction.trigger)}</button><span>なら</span><button className={editingSlot?.scope==='reaction'&&editingSlot.field==='action'?'word-slot active':'word-slot'} disabled={currentReaction.fixedReaction} onClick={()=>setEditingSlot({scope:'reaction',index:0,field:'action'})}>{actionLabel(currentReaction.actionId)}</button></div><div className="line-actions"><button aria-label="リアクションを削除" disabled={currentReaction.fixedReaction} onClick={removeReaction}><X size={13}/></button></div></article>:<button className="add-block reaction-add" onClick={addReaction}><Zap size={13}/>＋ リアクションを追加</button>}</div>
        </section>
        <div className="choice-panel">
          <div className="choice-head">{editingSlot?.scope==='reaction'?'リアクション':'通常作戦'} / {editingSlot?.field==='condition'?'条件を選ぶ':'行動を選ぶ'}</div>
          <div className="choice-list">{editingSlot?.field==='condition'
            ? editingSlot.scope==='reaction'
              ? REACTION_TRIGGERS.map(trigger=>{const detail=reactionDetails[trigger.id];return <ConditionChoiceCard key={trigger.id} title={detail.title} flavor={detail.flavor} effect={detail.effect} reaction active={currentReaction?.trigger===trigger.id} onSelect={()=>replaceFocusedSlot(trigger.id)}/>})
              : ownedConditions.map(condition=>{const detail=conditionDetails[condition]||{flavor:'この条件を満たしたら実行。',effect:conditionLabel(condition)};return <ConditionChoiceCard key={condition} title={conditionLabel(condition)} flavor={detail.flavor} effect={detail.effect} active={currentProgram[editingSlot.index]?.conditionId===condition} onSelect={()=>replaceFocusedSlot(condition)}/>})
            : ownedActions.map(id=>{const instruction=instructionById.get(id)!;return <InstructionChoiceCard key={id} instruction={instruction} unit={selectedUnit} reaction={editingSlot?.scope==='reaction'} active={(editingSlot?.scope==='reaction'?currentReaction?.actionId:currentProgram[editingSlot?.index||0]?.actionId)===id} onSelect={()=>replaceFocusedSlot(id)}/>})}</div>
        </div>
        <div className="inventory-grid">
          <div className="inventory"><small>控え</small><div>{bench.length===0?<span className="empty-inventory">なし</span>:bench.map(u=><button key={u.inventoryId} onClick={()=>equipBenchUnit(u.inventoryId)}><span className="unit-mini" style={{background:`#${u.color.toString(16).padStart(6,'0')}`}}/>{u.name}</button>)}</div></div>
        </div>
      </section>
      <aside className="shop-panel"><div className="section-head"><div><span className="step-no">02</span><h2>ショップ</h2></div><button className="refresh" onClick={refresh}><RefreshCw size={15}/>更新 <b>1</b></button></div><div className="shop-grid">{shop.map(item=>{const data:UnitDefinition|Instruction=item.kind==='unit'?unitById.get(item.id)!:instructionById.get(item.id)!;const isUnit=item.kind==='unit';const label=isUnit?(data as UnitDefinition).name:(data as Instruction).title;const instruction=isUnit?null:data as Instruction;return <article className={`shop-item rarity-${data.rarity} ${instruction?'instruction-shop-item':''}`} key={item.key}><button className="lock" aria-label="ロック" onClick={()=>toggleLock(item.key)}>{item.locked?<Lock/>:<LockOpen/>}</button><small>{rarityLabels[data.rarity]} / {isUnit?attackTypeLabels[(data as UnitDefinition).attackType]:actionKindLabels[instruction!.action]}</small><strong>{label}</strong>{instruction?<><p className="shop-flavor">{instruction.flavor}</p><div className="shop-metrics">{instructionMetrics(instruction,selectedUnit).map(metric=><span key={metric.label}><small>{metric.label}</small><b>{metric.value}</b></span>)}</div></>:<p>{`RNG ${(data as UnitDefinition).range} / KB ${(data as UnitDefinition).knockbackPower} / 枠 ${(data as UnitDefinition).programLimit}`}</p>}<button className="buy" onClick={()=>buy(item)}><ShoppingCart size={15}/><span>購入</span><b><Coins size={13}/>{data.price}</b></button></article>})}</div><button className="ready" onClick={startBattle}><Swords/>戦闘開始</button></aside>
    </div>:<div className="battle-layout">
      <section className="arena"><div className="battle-hud"><div className="hud-team ally"><small>YOUR SQUAD</small><b>{teamHp}</b><span>HP</span></div><div className="timer"><small>{elapsed>=50?'OVERHEAT IN':'BATTLE TIME'}</small><b>{Math.floor(elapsed/60)}:{String(Math.floor(elapsed%60)).padStart(2,'0')}</b></div><div className="hud-team enemy"><small>ENEMY</small><b>{enemyHp}</b><span>HP</span></div></div><BattleScene fighters={fighters} flash={flash} running={phase==='battle'&&!paused}/><div className="unit-bars">{fighters.map(f=><div className={f.team} key={f.instanceId}><span>{f.name}</span><div><i style={{width:`${Math.max(0,f.hp/f.maxHp*100)}%`}}/></div><b>{Math.ceil(f.hp)}</b></div>)}</div><div className="battle-controls"><button onClick={()=>setPaused(p=>!p)}>{paused?<Play/>:<Pause/>}</button><button className={speed===1?'active':''} onClick={()=>setSpeed(1)}>x1</button><button className={speed===2?'active':''} onClick={()=>setSpeed(2)}>x2</button><button onClick={reset}><RotateCcw/></button></div></section>
      <aside className="status-panel"><div className="section-head"><div><span className="live-dot"/><h2>ユニット状態</h2></div><button className="open-log" onClick={()=>setLogsOpen(true)}>ログ <b>{logs.length}</b></button></div><div className="status-roster">{fighterGroups.map(group=><section className="status-group" key={group.key}><h3>{group.label}</h3>{group.units.map(f=>{const hpRatio=Math.max(0,f.hp/f.maxHp*100);const cooldownRatio=cooldownProgress(f);const active=flash?.id===f.instanceId&&flash.actionLabel;return <article className={`unit-status-card ${f.team} ${f.hp<=0?'down':''} ${active?'acting':''}`} key={f.instanceId}><div className="status-avatar" style={{['--unit-color' as string]:`#${f.color.toString(16).padStart(6,'0')}`}}><i/></div><div className="status-id"><small>{f.code}</small><strong>{f.name}</strong><span>{attackTypeLabels[f.attackType]}</span></div><div className="unit-status-hp"><div><i style={{width:`${hpRatio}%`}}/></div><b>{Math.ceil(Math.max(0,f.hp))}/{f.maxHp}</b></div><div className="status-cooldown"><div><i style={{width:`${cooldownRatio*100}%`}}/></div><b>{cooldownRatio>=1?'READY':'WAIT'}</b></div><div className="status-stats"><span>A <b>{f.attack}</b></span><span>R <b>{f.range}</b></span><span>K <b>{f.knockbackPower}</b></span><span>W <b>{f.weight}</b></span><span>D <b>{f.defense}</b></span><span>S <b>{f.speed}</b></span></div><div className="status-tags">{statusTags(f).map(tag=><span className={tag==='正常'?'normal':''} key={tag}>{tag}</span>)}</div>{active&&<div className={`card-action-bubble ${flash?.kind==='miss'?'miss':''}`}>{flash.actionLabel}</div>}</article>})}</section>)}</div></aside>
      {logsOpen&&<div className="log-dialog-overlay" role="dialog" aria-modal="true" aria-label="戦闘ログ"><div className="log-dialog"><div className="log-dialog-head"><div><span className="live-dot"/><h2>戦闘ログ</h2><small>{logs.length} EVENTS</small></div><button aria-label="ログを閉じる" onClick={()=>setLogsOpen(false)}><X size={18}/></button></div><div className="logs">{logs.length===0?<div className="empty-log"><Sparkles/><span>プログラムを初期化中</span></div>:logs.map(l=><div className={`log ${l.type}`} key={l.id}><time>{l.time}</time><div><b>{l.actor}</b><span>{l.text}</span></div></div>)}</div></div></div>}
      {phase==='result'&&<div className="result-overlay"><div className="result-dialog"><small>BATTLE COMPLETE</small><h1>{winner}</h1><p>{winner==='勝利'?'ロジックが敵チームを停止させました':'プログラムを調整して再実行できます'}</p><div><span>実行イベント <b>{logs.length}</b></span><span>戦闘時間 <b>{elapsed.toFixed(1)}s</b></span></div><button onClick={()=>{setRound(r=>r+1);setCoins(c=>c+5);reset()}}>次のラウンドへ</button></div></div>}
    </div>}
    {toast&&<div className="toast">{toast}</div>}
  </main>;
}
