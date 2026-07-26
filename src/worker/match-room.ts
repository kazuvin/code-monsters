import { Server, type Connection, type ConnectionContext, type WSMessage } from 'partyserver';
import {
  battleForSeat,
  continueOnlineMatch,
  createOnlineMatch,
  submitOnlineBuild,
  type OnlineMatchState,
  type OnlineSeat,
} from '../core/online-match';
import { deriveSeed } from '../core/rng';
import { GAME_DATA } from '../game/game-data';
import { encodeMessage, parseClientMessage, type RoomView, type ServerMessage } from '../online/protocol';

type SeatRecord = {
  tokenHash: string;
  runSeed: number;
};

type PersistedRoom = {
  schemaVersion: 1;
  seed: number;
  seats: Partial<Record<OnlineSeat, SeatRecord>>;
  match: OnlineMatchState;
};

type ConnectionState = {
  seat: OnlineSeat;
};

const ROOM_STORAGE_KEY = 'online-room-v1';
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const seats: OnlineSeat[] = ['a', 'b'];

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
const bytesToHex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
const hashToken = async (token: string) =>
  bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));

export class MatchRoom extends Server<Env> {
  static options = { hibernate: true };

  private room!: PersistedRoom;

  async onStart() {
    this.room =
      (await this.ctx.storage.get<PersistedRoom>(ROOM_STORAGE_KEY)) ??
      ({
        schemaVersion: 1,
        seed: randomSeed(),
        seats: {},
        match: createOnlineMatch(GAME_DATA.rules.contentVersion),
      } satisfies PersistedRoom);
  }

  private connectedSeats() {
    const connected = new Set<OnlineSeat>();
    for (const connection of this.getConnections<ConnectionState>()) {
      if (connection.state?.seat) connected.add(connection.state.seat);
    }
    return seats.filter((seat) => connected.has(seat));
  }

  private view(): RoomView {
    return {
      roomId: this.name,
      contentVersion: this.room.match.contentVersion,
      phase: this.room.match.phase,
      cycle: this.room.match.cycle,
      battleNumber: this.room.match.battleNumber,
      suddenDeathRound: this.room.match.suddenDeathRound,
      score: { ...this.room.match.score },
      submittedSeats: [...this.room.match.submittedSeats],
      continuedSeats: [...this.room.match.continuedSeats],
      connectedSeats: this.connectedSeats(),
    };
  }

  private send(connection: Connection, message: ServerMessage) {
    connection.send(encodeMessage(message));
  }

  private sendError(connection: Connection, message: string, recoverable = true) {
    this.send(connection, { type: 'error', message, recoverable });
  }

  private async persist() {
    await this.ctx.storage.put(ROOM_STORAGE_KEY, this.room);
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
  }

  private broadcastView() {
    const room = this.view();
    for (const connection of this.getConnections()) {
      this.send(connection, { type: 'room-state', room });
    }
  }

  private sendBattleToConnectedPlayers() {
    const battle = this.room.match.lastBattle;
    if (!battle) return;
    for (const connection of this.getConnections<ConnectionState>()) {
      const seat = connection.state?.seat;
      if (!seat) continue;
      const personalized = battleForSeat(battle, this.room.match.builds, seat);
      this.send(connection, {
        type: 'battle-result',
        cycle: this.room.match.cycle,
        battleNumber: this.room.match.battleNumber,
        suddenDeathRound: this.room.match.suddenDeathRound,
        ...personalized,
      });
    }
  }

  private async seatForToken(token: string | null): Promise<OnlineSeat | undefined> {
    if (!token || token.length > 128) return undefined;
    const tokenHash = await hashToken(token);
    return seats.find((seat) => this.room.seats[seat]?.tokenHash === tokenHash);
  }

  async onConnect(connection: Connection, context: ConnectionContext) {
    const requestUrl = new URL(context.request.url);
    const suppliedToken = requestUrl.searchParams.get('seatToken');
    let seat = await this.seatForToken(suppliedToken);
    let seatToken = suppliedToken;

    if (!seat) {
      seat = seats.find((candidate) => !this.room.seats[candidate]);
      if (!seat) {
        this.sendError(connection, 'この対戦室にはすでに2人参加しています', false);
        connection.close(4003, 'Room is full');
        return;
      }
      seatToken = crypto.randomUUID();
      this.room.seats[seat] = {
        tokenHash: await hashToken(seatToken),
        runSeed: randomSeed(),
      };
      await this.persist();
    }

    for (const previous of this.getConnections<ConnectionState>()) {
      if (previous.id !== connection.id && previous.state?.seat === seat) {
        previous.close(4001, 'Reconnected from another tab');
      }
    }
    connection.setState({ seat });
    const seatRecord = this.room.seats[seat];
    if (!seatRecord || !seatToken) {
      this.sendError(connection, '参加情報を作成できませんでした', false);
      connection.close(1011, 'Seat unavailable');
      return;
    }

    this.send(connection, {
      type: 'welcome',
      seat,
      seatToken,
      runSeed: seatRecord.runSeed,
      room: this.view(),
    });
    if (this.room.match.phase === 'battle' && this.room.match.lastBattle) {
      const personalized = battleForSeat(this.room.match.lastBattle, this.room.match.builds, seat);
      this.send(connection, {
        type: 'battle-result',
        cycle: this.room.match.cycle,
        battleNumber: this.room.match.battleNumber,
        suddenDeathRound: this.room.match.suddenDeathRound,
        ...personalized,
      });
    }
    this.broadcastView();
  }

  async onMessage(connection: Connection<ConnectionState>, message: WSMessage) {
    const seat = connection.state?.seat;
    if (!seat || typeof message !== 'string') {
      this.sendError(connection, '不正な接続です', false);
      return;
    }
    if (message.length > 128_000) {
      this.sendError(connection, '編成データが大きすぎます');
      return;
    }
    const command = parseClientMessage(message);
    if (!command) {
      this.sendError(connection, 'メッセージを読み取れませんでした');
      return;
    }

    if (command.type === 'submit-build') {
      if (command.cycle !== this.room.match.cycle) {
        this.sendError(connection, 'サイクルが更新されています。現在の画面を確認してください');
        return;
      }
      const result = submitOnlineBuild(
        GAME_DATA,
        this.room.match,
        seat,
        command.build,
        deriveSeed(this.room.seed, this.room.match.battleNumber + this.room.match.cycle * 10_000),
      );
      if (!result.ok) {
        this.sendError(connection, result.error ?? '編成を提出できませんでした');
        return;
      }
      this.room = { ...this.room, match: result.state };
      await this.persist();
      if (result.battle) this.sendBattleToConnectedPlayers();
      this.broadcastView();
      return;
    }

    if (command.battleNumber !== this.room.match.battleNumber) {
      this.sendError(connection, '戦闘結果が更新されています。現在の画面を確認してください');
      return;
    }
    const result = continueOnlineMatch(
      GAME_DATA,
      this.room.match,
      seat,
      deriveSeed(this.room.seed, this.room.match.battleNumber + 1 + this.room.match.cycle * 10_000),
    );
    if (!result.ok) {
      this.sendError(connection, result.error ?? '次のサイクルへ進めませんでした');
      return;
    }
    this.room = { ...this.room, match: result.state };
    await this.persist();
    if (result.battle) this.sendBattleToConnectedPlayers();
    this.broadcastView();
    if (result.state.phase === 'finished') {
      console.log({
        event: 'online_match_finished',
        roomId: this.name,
        battleNumber: result.state.battleNumber,
        score: result.state.score,
      });
    }
  }

  onClose() {
    this.broadcastView();
  }

  onError(_connection: Connection, error: unknown) {
    console.error({ event: 'online_room_socket_error', roomId: this.name, error });
  }

  onException(error: unknown) {
    console.error({ event: 'online_room_exception', roomId: this.name, error });
  }

  async onAlarm() {
    for (const connection of this.getConnections()) connection.close(1001, 'Room expired');
    await this.ctx.storage.deleteAll();
    console.log({ event: 'online_room_expired', roomId: this.name });
  }
}
