import { routePartykitRequest } from 'partyserver';
import { MatchRoom } from './worker/match-room';

export { MatchRoom };

const ROOM_NAME = /^[a-z0-9][a-z0-9-]{7,63}$/;

export default {
  async fetch(request, env): Promise<Response> {
    const partyResponse = await routePartykitRequest(request, env, {
      onBeforeConnect(request, lobby) {
        if (!ROOM_NAME.test(lobby.name)) return new Response('Invalid room', { status: 400 });
        const origin = request.headers.get('Origin');
        if (origin && new URL(origin).host !== new URL(request.url).host) {
          return new Response('Forbidden origin', { status: 403 });
        }
      },
    });
    if (partyResponse) return partyResponse;
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
