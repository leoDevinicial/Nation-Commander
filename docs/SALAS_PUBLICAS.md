# Salas públicas (menu)

Pedido do usuário (31/10): no menu, uma seção de salas públicas onde os jogadores entram ou criam salas.

## Como funciona

- **Menu → "Salas públicas":**
  - a lista mostra as salas multijogador em lobby e com vaga, as mais cheias primeiro (até 30);
  - cada sala mostra o anfitrião, o mapa, os países já escolhidos e as vagas ocupadas;
  - "Entrar" usa o código da sala e o país preferido do jogador;
  - a lista é pedida ao servidor a cada 5 s enquanto o menu está aberto.
- **"+ Criar sala pública":** cria uma sala multijogador já aberta.
- **Lobby:** o anfitrião de uma sala multijogador marca ou desmarca "Sala pública" a qualquer momento. Sem marcar,
  a sala é privada e só entra quem tiver o código, como antes.
- **Quando a sala sai da lista:** quando a partida começa, quando lota, quando o anfitrião fica desconectado ou quando
  vira privada.
- **Modos:** só salas multijogador podem ser públicas; partidas contra a IA e o Sandbox, não.

## Protocolo

- **Cliente:** `{ t: 'list_rooms' }`; `create_room` aceita `isPublic`; `set_room` aceita `isPublic`.
- **Servidor:** `{ t: 'room_list', rooms: PublicRoomSummary[] }`; `RoomInfo.isPublic`.
- **Código:** `Room.publicSummary` e `RoomManager.listPublic`.
- **Testes:** `server/room.test.ts`, bloco "salas públicas".
